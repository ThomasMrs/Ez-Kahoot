"""Meaningful checks, no network calls or third-party test dependency."""

import importlib.util
import json
from pathlib import Path
import sys
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("ez_server", ROOT / "server.py")
server = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = server
spec.loader.exec_module(server)
QUIZ_ID = "77c46705-dab1-4ca1-a435-c287194db522"


def fixture():
    return {
        "uuid": QUIZ_ID,
        "title": "<b>Brainwave</b>",
        "visibility": 1,
        "questions": [
            {"type": "content", "title": "Introduction"},
            {"type": "quiz", "question": "<p>Deux bonnes réponses ?</p>", "time": 30000,
             "choices": [{"answer": "A", "correct": True}, {"answer": "B", "correct": True}, {"answer": "C", "correct": False}]},
            {"type": "quiz", "question": "Non renseigné", "time": 20000,
             "choices": [{"answer": "A", "correct": "false"}, {"answer": "B"}]},
            {"type": "open_ended", "question": "Unsupported"},
        ],
    }


class NormalizationTests(unittest.TestCase):
    def test_uuid_and_official_urls(self):
        for value in [QUIZ_ID.upper(), f"https://create.kahoot.it/details/{QUIZ_ID}",
                      f"https://play.kahoot.it/#/QuizId={QUIZ_ID}", f"create.kahoot.it/details/{QUIZ_ID}"]:
            with self.subTest(value=value):
                self.assertEqual(server.parse_quiz_id(value), QUIZ_ID)

    def test_rejects_pin_and_arbitrary_hosts(self):
        for value in ["123456", f"https://evil.example/{QUIZ_ID}", "file:///etc/passwd", "", None,
                      f"https://create.kahoot.it.evil.example/{QUIZ_ID}"]:
            with self.subTest(value=value), self.assertRaises(server.QuizError):
                server.parse_quiz_id(value)

    def test_normalization_keeps_all_correct_choices_and_unknown(self):
        result = server.normalize_quiz(fixture())
        self.assertEqual(result["title"], "Brainwave")
        self.assertEqual(result["slideCount"], 1)
        self.assertEqual(result["skippedCount"], 1)
        self.assertEqual(len(result["questions"]), 2)
        self.assertTrue(result["questions"][0]["multiSelect"])
        self.assertEqual(result["questions"][0]["timeLimit"], 30)
        self.assertEqual(result["questions"][1]["index"], 2)
        self.assertIsNone(result["questions"][1]["choices"][0]["correct"])
        self.assertIsNone(result["questions"][1]["choices"][1]["correct"])

    def test_import_round_trip_preserves_slides_and_seconds(self):
        first = server.normalize_quiz(fixture())
        second = server.normalize_quiz(first)
        self.assertEqual(second["questions"], first["questions"])
        self.assertEqual(second["slideCount"], 1)
        self.assertEqual(second["skippedCount"], 1)

    def test_import_limits_and_bad_shapes(self):
        for data in [[], {}, {"questions": []}, {"questions": [None]},
                     {"questions": [{"type": []}]},
                     {"questions": [{"type": "quiz", "choices": ["bad", "shape"]}]},
                     {"questions": [{"type": "content"}]},
                     {"questions": fixture()["questions"] * 200}]:
            with self.subTest(data=str(data)[:80]), self.assertRaises(server.QuizError):
                server.normalize_quiz(data)

    def test_markup_and_unsafe_image_urls(self):
        self.assertEqual(server.plain_text("<b>Bonjour</b><script>alert(1)</script> &amp; salut"), "Bonjour & salut")
        self.assertIsNone(server.media_url("javascript:alert(1)"))
        self.assertIsNone(server.media_url("https://user:pass@example.com/a.png"))

    def test_math_scripts_preserve_meaning_and_round_trip(self):
        for source, expected in [
            ("5<sup>2</sup>", "5^(2)"),
            ("H<sub>2</sub>O", "H_(2)O"),
            ("x<sup><strong>−2</strong></sup>", "x^(−2)"),
            ('<span class="formula">x<sub>i</sub><sup>2</sup></span>', "x_(i)^(2)"),
        ]:
            with self.subTest(source=source):
                result = server.plain_text(source)
                self.assertEqual(result, expected)
                self.assertEqual(server.plain_text(result), result)
        raw = fixture()
        raw["questions"][1]["question"] = "Combien font 5<sup>2</sup> ?"
        raw["questions"][1]["choices"][0]["answer"] = "H<sub>2</sub>O"
        result = server.normalize_quiz(raw)
        self.assertEqual(result["questions"][0]["question"], "Combien font 5^(2) ?")
        self.assertEqual(result["questions"][0]["choices"][0]["text"], "H_(2)O")
        self.assertEqual(server.normalize_quiz(result)["questions"], result["questions"])

    def test_comparisons_are_not_treated_as_html(self):
        for source in ["x<y", "x <y et x > z", "2 < 3 &&4 >1", "x < y", "x<y>z", "x<sup", "<unknown>texte</unknown>"]:
            with self.subTest(source=source):
                self.assertEqual(server.plain_text(source), source)
        self.assertEqual(server.plain_text("<b>x<y</b> &lt; z"), "x<y < z")

    def test_recognized_markup_and_hidden_content_still_removed(self):
        self.assertEqual(server.plain_text('<p><b title="a > b">Bonjour</b><br/>monde</p>'), "Bonjour monde")
        self.assertEqual(server.plain_text('Avant<script data-note="a > b">if (x<y) alert(1)</script><style>.x{display:none}</style> après'), "Avant après")
        self.assertEqual(server.plain_text("<sup>2</sup><script><sup>secret</sup></script>"), "^(2)")
        self.assertEqual(server.plain_text("Bonjour<!-- commentaire caché --> monde"), "Bonjour monde")

    @patch.object(server, "urlopen")
    def test_private_or_missing_quiz_is_a_clear_error(self, mock_open):
        mock_open.side_effect = HTTPError("https://create.kahoot.it", 403, "Forbidden", {}, None)
        with self.assertRaises(server.QuizError) as context:
            server.fetch_quiz(QUIZ_ID)
        self.assertEqual(context.exception.status, 404)
        self.assertIn("privé", str(context.exception))


class HttpTests(unittest.TestCase):
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

    def read(self, path, data=None, headers=None):
        request = Request(self.base + path, data=data, headers=headers or {})
        try:
            response = urlopen(request, timeout=3)
        except HTTPError as error:
            response = error
        with response:
            return response.status, json.loads(response.read())

    def test_health_and_invalid_quiz(self):
        status, data = self.read("/api/health")
        self.assertEqual(status, 200)
        self.assertTrue(data["ok"])
        status, data = self.read("/api/quiz?input=123456")
        self.assertEqual(status, 400)
        self.assertIn("error", data)

    def test_existing_ez_kahoot_is_detected(self):
        self.assertTrue(server.is_running_ez_kahoot(self.httpd.server_port))
        self.assertFalse(server.is_running_ez_kahoot(0))

    @patch.object(server, "make_server")
    @patch.object(server, "is_running_ez_kahoot", return_value=True)
    @patch.object(server.webbrowser, "open")
    def test_main_reuses_existing_server(self, mock_browser, mock_running, mock_make):
        with patch.object(sys, "argv", ["server.py", "--port", "8765"]):
            server.main()
        mock_make.assert_not_called()
        mock_browser.assert_called_once_with("http://127.0.0.1:8765")

    def test_import_and_malformed_json(self):
        status, data = self.read("/api/import", json.dumps(fixture()).encode(), {"Content-Type": "application/json"})
        self.assertEqual(status, 200)
        self.assertEqual(len(data["questions"]), 2)
        status, data = self.read("/api/import", b"not json", {"Content-Type": "application/json"})
        self.assertEqual(status, 400)
        status, data = self.read("/api/import", b'{"questions":[{"type":[]}]}', {"Content-Type": "application/json"})
        self.assertEqual(status, 400)

    def test_user_guide_is_explicitly_exposed(self):
        with urlopen(self.base + "/README.md", timeout=3) as response:
            self.assertEqual(response.status, 200)
            self.assertIn("text/plain", response.headers["Content-Type"])
            self.assertIn("thomas marsa", response.read().decode())

    def test_static_traversal_and_cross_origin_are_refused(self):
        status, _ = self.read("/%2e%2e/server.py")
        self.assertEqual(status, 403)
        status, _ = self.read("/api/health", headers={"Origin": "https://example.com"})
        self.assertEqual(status, 403)

    @patch.object(server, "fetch_quiz", return_value={"title": "mocked"})
    def test_read_only_quiz_route_and_old_id_parameter(self, mock_fetch):
        status, data = self.read("/api/quiz?id=" + QUIZ_ID)
        self.assertEqual(status, 200)
        self.assertEqual(data["title"], "mocked")
        mock_fetch.assert_called_once_with(QUIZ_ID)


if __name__ == "__main__":
    unittest.main()
