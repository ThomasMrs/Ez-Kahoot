"""Authenticated local companion bridge; no calls to the external Kahoot service."""

import base64
import importlib.util
from io import BytesIO
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import zipfile


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("companion_server", ROOT / "server.py")
server = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = server
spec.loader.exec_module(server)

QUIZ_ID = "77c46705-dab1-4ca1-a435-c287194db522"
EXTENSION_ORIGIN = "chrome-extension://" + "a" * 32


def quiz_fixture():
    return {
        "uuid": QUIZ_ID,
        "title": "<b>Quiz compagnon</b>",
        "questions": [
            {"type": "content", "title": "Introduction"},
            {"type": "quiz", "question": "Plusieurs réponses ?", "choices": [
                {"answer": "A", "correct": True}, {"answer": "B", "correct": True},
                {"answer": "C", "correct": False}]},
            {"type": "quiz", "question": "Correction inconnue", "choices": [
                {"answer": "A", "correct": "false"}, {"answer": "B"}]},
        ],
    }


class CompanionBridgeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = server.make_server(0)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.httpd.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=2)

    def setUp(self):
        with self.httpd.companion_lock:
            self.httpd.companion_token = server.secrets.token_urlsafe(32)
            self.httpd.companion_quiz = None
            self.httpd.companion_pair_origin = None

    def request(self, path, data=None, headers=None, method=None):
        supplied = dict(headers or {})
        if data is not None:
            supplied.setdefault("Content-Type", "application/json")
            data = json.dumps(data).encode()
        request = Request(self.base + path, data=data, headers=supplied, method=method)
        try:
            response = urlopen(request, timeout=3)
        except HTTPError as error:
            response = error
        with response:
            body = response.read()
            payload = json.loads(body) if body and "application/json" in response.headers.get("Content-Type", "") else body
            return response.status, payload, response.headers

    def auth(self, origin=EXTENSION_ORIGIN, token=None):
        headers = {"Authorization": "Bearer " + (token or self.httpd.companion_token)}
        if origin is not None:
            headers["Origin"] = origin
        return headers

    def test_connection_code_binds_token_and_actual_port(self):
        status, config, headers = self.request("/api/companion/config")
        self.assertEqual(status, 200)
        self.assertEqual(config["version"], "1.4.1")
        self.assertEqual(config["baseUrl"], self.base)
        self.assertIsNone(config["preparedQuiz"])
        self.assertTrue(config["connectionCode"].startswith("EZK1."))
        encoded = config["connectionCode"].split(".", 1)[1]
        decoded = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
        self.assertEqual(decoded, {"baseUrl": self.base, "token": self.httpd.companion_token})
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertIsNone(headers.get("Access-Control-Allow-Origin"))

    def test_quick_pairing_is_explicit_and_extension_origin_only(self):
        for origin in (None, "https://kahoot.it", "https://evil.test", self.base, "null", "chrome-extension://invalid"):
            headers = {"Origin": origin} if origin is not None else {}
            status, payload, _ = self.request("/api/companion/pair", {}, headers)
            self.assertEqual(status, 403)
            self.assertNotIn("connectionCode", payload)
        status, config, headers = self.request("/api/companion/pair", {}, {"Origin": EXTENSION_ORIGIN})
        self.assertEqual(status, 200)
        self.assertEqual(config["baseUrl"], self.base)
        self.assertEqual(headers["Access-Control-Allow-Origin"], EXTENSION_ORIGIN)
        self.assertEqual(self.httpd.companion_pair_origin, EXTENSION_ORIGIN)

    def test_quick_pairing_binds_first_extension_and_rejects_malformed_body(self):
        status, _, _ = self.request("/api/companion/pair", {"unexpected": True}, {"Origin": EXTENSION_ORIGIN})
        self.assertEqual(status, 400)
        self.assertIsNone(self.httpd.companion_pair_origin)
        self.assertEqual(self.request("/api/companion/pair", {}, {"Origin": EXTENSION_ORIGIN})[0], 200)
        other = "chrome-extension://" + "b" * 32
        status, payload, _ = self.request("/api/companion/pair", {}, {"Origin": other})
        self.assertEqual(status, 409)
        self.assertNotIn("connectionCode", payload)
        self.assertEqual(self.request("/api/companion/pair", {}, {"Origin": EXTENSION_ORIGIN})[0], 200)

    def test_quick_pairing_preflight_is_precise(self):
        headers = {"Origin": EXTENSION_ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "Content-Type"}
        status, _, response_headers = self.request("/api/companion/pair", headers=headers, method="OPTIONS")
        self.assertEqual(status, 204)
        self.assertEqual(response_headers["Access-Control-Allow-Origin"], EXTENSION_ORIGIN)
        self.assertEqual(response_headers["Access-Control-Allow-Methods"], "POST")
        for changes in ({"Access-Control-Request-Method": "GET"}, {"Access-Control-Request-Headers": "Authorization"}):
            self.assertEqual(self.request("/api/companion/pair", headers={**headers, **changes}, method="OPTIONS")[0], 405)

    def test_instance_tokens_are_distinct(self):
        other = server.make_server(0)
        try:
            self.assertNotEqual(other.companion_token, self.httpd.companion_token)
            self.assertGreaterEqual(len(other.companion_token), 40)
            self.assertIsNone(other.companion_quiz)
        finally:
            other.server_close()

    def test_configuration_and_mutation_are_never_extension_routes(self):
        for path, data in [("/api/companion/config", None),
                           ("/api/companion/quiz", quiz_fixture()),
                           ("/api/companion/reset", {})]:
            with self.subTest(path=path):
                status, result, headers = self.request(path, data, self.auth())
                self.assertEqual(status, 403)
                self.assertIn("error", result)
                self.assertIsNone(headers.get("Access-Control-Allow-Origin"))

    def test_bridge_requires_current_token_and_valid_origin(self):
        for authorization in [None, "Bearer wrong", "Basic abc", "Bearer café"]:
            headers = {"Origin": EXTENSION_ORIGIN}
            if authorization:
                headers["Authorization"] = authorization
            with self.subTest(authorization=authorization):
                status, data, returned = self.request("/bridge/health", headers=headers)
                self.assertEqual(status, 401)
                self.assertIn("error", data)
                self.assertEqual(returned["Access-Control-Allow-Origin"], EXTENSION_ORIGIN)
        for origin in ["https://example.com", "null", "chrome-extension://" + "z" * 32,
                       EXTENSION_ORIGIN + "/path", self.base]:
            with self.subTest(origin=origin):
                status, _, headers = self.request("/bridge/health", headers=self.auth(origin=origin))
                self.assertEqual(status, 403)
                self.assertIsNone(headers.get("Access-Control-Allow-Origin"))

    def test_bridge_accepts_valid_extension_or_authenticated_non_browser_client(self):
        for origin in [EXTENSION_ORIGIN, None]:
            with self.subTest(origin=origin):
                status, data, headers = self.request("/bridge/health", headers=self.auth(origin=origin))
                self.assertEqual(status, 200)
                self.assertTrue(data["ok"])
                self.assertEqual(data["name"], "Ez-Kahoot")
                self.assertEqual(headers.get("Access-Control-Allow-Origin"), origin)
                if origin:
                    self.assertEqual(headers["Vary"], "Origin")

    def test_host_must_be_loopback(self):
        for host in ["evil.example", "127.0.0.1.evil.example", "localhost:bad", "localhost:99999", "user@localhost"]:
            with self.subTest(host=host):
                headers = self.auth()
                headers["Host"] = host
                status, _, returned = self.request("/bridge/health", headers=headers)
                self.assertEqual(status, 403)
                self.assertIsNone(returned.get("Access-Control-Allow-Origin"))

    def test_preflight_allows_only_extension_get_authorization(self):
        headers = {"Origin": EXTENSION_ORIGIN, "Access-Control-Request-Method": "GET",
                   "Access-Control-Request-Headers": "authorization",
                   "Access-Control-Request-Private-Network": "true"}
        status, body, returned = self.request("/bridge/quiz", headers=headers, method="OPTIONS")
        self.assertEqual(status, 204)
        self.assertEqual(body, b"")
        self.assertEqual(returned["Access-Control-Allow-Origin"], EXTENSION_ORIGIN)
        self.assertEqual(returned["Access-Control-Allow-Methods"], "GET")
        self.assertEqual(returned["Access-Control-Allow-Headers"], "Authorization")
        self.assertEqual(returned["Access-Control-Allow-Private-Network"], "true")
        for patch_headers, expected in [({"Origin": "https://evil.example"}, 403),
                                        ({"Access-Control-Request-Method": "POST"}, 405),
                                        ({"Access-Control-Request-Headers": "authorization,x-extra"}, 405)]:
            status, _, _ = self.request("/bridge/quiz", headers={**headers, **patch_headers}, method="OPTIONS")
            self.assertEqual(status, expected)
        status, _, returned = self.request("/api/companion/config", headers=headers, method="OPTIONS")
        self.assertEqual(status, 404)
        self.assertIsNone(returned.get("Access-Control-Allow-Origin"))

    def test_prepare_normalizes_quiz_and_updates_configuration(self):
        status, _, _ = self.request("/bridge/quiz", headers=self.auth())
        self.assertEqual(status, 404)
        status, prepared, _ = self.request("/api/companion/quiz", quiz_fixture())
        self.assertEqual(status, 200)
        self.assertEqual(prepared, {"title": "Quiz compagnon", "questionCount": 2})
        status, quiz, _ = self.request("/bridge/quiz", headers=self.auth())
        self.assertEqual(status, 200)
        self.assertEqual(quiz["slideCount"], 1)
        self.assertTrue(quiz["questions"][0]["multiSelect"])
        self.assertEqual(sum(choice["correct"] is True for choice in quiz["questions"][0]["choices"]), 2)
        self.assertIsNone(quiz["questions"][1]["choices"][0]["correct"])
        _, config, _ = self.request("/api/companion/config")
        self.assertEqual(config["preparedQuiz"], prepared)

    def test_reset_revokes_old_token_but_keeps_prepared_quiz(self):
        self.request("/api/companion/quiz", quiz_fixture())
        old = self.httpd.companion_token
        status, config, _ = self.request("/api/companion/reset", {})
        self.assertEqual(status, 200)
        self.assertNotEqual(old, self.httpd.companion_token)
        self.assertEqual(config["preparedQuiz"]["questionCount"], 2)
        self.assertEqual(self.request("/bridge/health", headers=self.auth(token=old))[0], 401)
        self.assertEqual(self.request("/bridge/health", headers=self.auth())[0], 200)
        self.assertEqual(self.request("/api/companion/reset", {"unexpected": True})[0], 400)

    def test_public_lookup_does_not_replace_prepared_quiz(self):
        self.request("/api/companion/quiz", quiz_fixture())
        public = server.normalize_quiz(quiz_fixture())
        public["title"] = "Autre quiz public"
        with patch.object(server, "fetch_quiz", return_value=public) as fetch:
            status, result, _ = self.request("/bridge/quiz?" + urlencode({"input": QUIZ_ID}), headers=self.auth())
            self.assertEqual(status, 200)
            self.assertEqual(result["title"], "Autre quiz public")
            fetch.assert_called_once_with(QUIZ_ID)
        _, prepared, _ = self.request("/bridge/quiz", headers=self.auth())
        self.assertEqual(prepared["title"], "Quiz compagnon")
        with patch.object(server, "fetch_quiz") as fetch:
            self.assertEqual(self.request("/bridge/quiz?input=123456", headers=self.auth())[0], 400)
            fetch.assert_not_called()

    def test_unknown_routes_and_original_import_still_work(self):
        self.assertEqual(self.request("/bridge/missing", headers=self.auth())[0], 404)
        self.assertEqual(self.request("/api/companion/missing")[0], 404)
        status, quiz, _ = self.request("/api/import", quiz_fixture())
        self.assertEqual(status, 200)
        self.assertEqual(quiz["title"], "Quiz compagnon")

    def test_archive_contains_only_extension_assets_and_requires_local_origin(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "manifest.json").write_text('{"manifest_version":3}')
            (root / "popup.html").write_text("<h1>Ez-Kahoot</h1>")
            (root / "popup.js").write_text("// local code")
            (root / "connection.js").write_text("// local association")
            (root / "background.js").write_text("// worker")
            (root / "logo.svg").write_text("<svg></svg>")
            (root / "package.json").write_text("{}")
            (root / "test.js").write_text("// excluded")
            (root / "icons").mkdir()
            (root / "icons" / "icon.svg").write_text("<svg></svg>")
            (root / "__pycache__").mkdir()
            (root / "__pycache__" / "secret.pyc").write_bytes(b"not shipped")
            with patch.object(server, "EXTENSION", root):
                status, body, returned = self.request("/downloads/Ez-Kahoot-Companion.zip")
                self.assertEqual(status, 200)
                self.assertEqual(returned["Content-Type"], "application/zip")
                with zipfile.ZipFile(BytesIO(body)) as archive:
                    self.assertEqual(set(archive.namelist()), {"manifest.json", "popup.html", "popup.js", "connection.js", "background.js", "logo.svg", "icons/icon.svg"})
                    self.assertIsNone(archive.testzip())
                self.assertNotIn(self.httpd.companion_token.encode(), body)
                status, _, returned = self.request("/downloads/Ez-Kahoot-Companion.zip", headers=self.auth())
                self.assertEqual(status, 403)
                self.assertIsNone(returned.get("Access-Control-Allow-Origin"))


if __name__ == "__main__":
    unittest.main()
