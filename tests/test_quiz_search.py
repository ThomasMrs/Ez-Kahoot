"""Public-search matching and authenticated bridge; no external network in tests."""
import json
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import test_companion as fixture

server = fixture.server
QUESTION = "Comment s’explique la proportion d’une caractéristique dans une population ?"
CHOICES = ["Un avantage", "Aucun avantage"]
ID_A = "11111111-1111-4111-8111-111111111111"
ID_B = "22222222-2222-4222-8222-222222222222"


def candidate(qid=ID_A, **changes):
    value = {"id": qid, "title": "Candidat", "slideCount": 1, "skippedCount": 0,
             "questions": [{"question": QUESTION, "choices": [
                 {"text": CHOICES[0], "correct": True}, {"text": CHOICES[1], "correct": False}]}]}
    value.update(changes)
    return value


class PublicQuizSearchTests(unittest.TestCase):
    def run_search(self, quizzes, payload=None):
        payload = payload or {"question": QUESTION, "choices": CHOICES, "questionCount": 2}
        with patch.object(server, "_public_search_ids", return_value=tuple(q["id"] for q in quizzes)), \
             patch.object(server, "_public_search_candidate", side_effect=lambda qid, epoch: next(q for q in quizzes if q["id"] == qid)):
            return server.search_public_quiz(payload)

    def test_exact_question_complete_choices_and_total_are_required(self):
        self.assertEqual(self.run_search([candidate()])["source"], "public-search")
        reordered = {"question": QUESTION.upper(), "choices": list(reversed(CHOICES)), "questionCount": 2}
        self.assertEqual(self.run_search([candidate()], reordered)["quiz"]["id"], ID_A)
        for payload in [
            {"question": QUESTION, "choices": ["Un avantage", "Autre"], "questionCount": 2},
            {"question": QUESTION, "choices": CHOICES, "questionCount": 3},
            {"question": QUESTION + " supplémentaire", "choices": CHOICES},
        ]:
            with self.subTest(payload=payload), self.assertRaises(server.QuizError) as error:
                self.run_search([candidate()], payload)
            self.assertEqual(error.exception.status, 404)

    def test_ambiguous_candidates_are_not_selected(self):
        with self.assertRaises(server.QuizError) as error:
            self.run_search([candidate(), candidate(ID_B)])
        self.assertEqual(error.exception.status, 409)

    def test_math_comparisons_and_scripts_are_not_fuzzy_matches(self):
        self.assertNotEqual(server.search_match_text("x < 4"), server.search_match_text("x > 4"))
        self.assertEqual(server.search_match_text("x<sup>2</sup>"), server.search_match_text("x²"))
        self.assertEqual(server.search_match_text("<i>Été</i> &amp; hiver"), server.search_match_text("ete & hiver"))
        self.assertEqual(server.public_search_terms(QUESTION), "caractéristique population")
        self.assertEqual(server.search_choice_texts(["True", "False"]), server.search_choice_texts(["Faux", "Vrai"]))
        self.assertNotEqual(server.search_choice_texts(["True", "False"]), server.search_choice_texts(["Faux", "Vrai parfois"]))

    def test_validation_is_bounded_and_rejects_extra_fields(self):
        for payload in [None, {}, {"question": "q", "choices": ["a", "b"], "url": "https://evil.test"},
                        {"question": "q" * 1201, "choices": ["a", "b"]},
                        {"question": "q", "choices": ["a"]}, {"question": "q", "choices": ["", "b"]},
                        {"question": "q", "choices": ["a", "b"], "questionCount": True}]:
            with self.subTest(payload=payload), self.assertRaises(server.QuizError):
                server.validate_quiz_search(payload)

    def test_public_lookup_uses_fixed_endpoint_and_ten_candidate_cap(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self, limit):
                return json.dumps({"entities": [{"card": {"uuid": ID_A}}] * 10 + [{"card": {"uuid": ID_B}}]}).encode()
        server._public_search_ids.cache_clear()
        with patch.object(server, "urlopen", return_value=Response()) as request:
            self.assertEqual(server._public_search_ids("population", 1), (ID_A,))
        url = request.call_args.args[0].full_url
        self.assertTrue(url.startswith("https://create.kahoot.it/rest/kahoots/?"))
        self.assertIn("limit=10", url)
        server._public_search_ids.cache_clear()


class SearchBridgeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = server.make_server(0)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.httpd.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown(); cls.httpd.server_close(); cls.thread.join(timeout=2)

    def request(self, data=None, auth=True, origin=fixture.EXTENSION_ORIGIN, method="POST", extra=None):
        headers = {"Content-Type": "application/json"}
        if auth: headers["Authorization"] = "Bearer " + self.httpd.companion_token
        if origin: headers["Origin"] = origin
        headers.update(extra or {})
        req = Request(self.base + "/bridge/search-quiz", data=json.dumps(data).encode() if data is not None else None,
                      headers=headers, method=method)
        try: response = urlopen(req, timeout=3)
        except HTTPError as error: response = error
        with response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None, response.headers

    def test_authenticated_post_and_search_errors_keep_status(self):
        payload = {"question": QUESTION, "choices": CHOICES}
        with patch.object(server, "search_public_quiz", return_value={"quiz": candidate(), "source": "public-search"}) as search:
            status, body, headers = self.request(payload)
            self.assertEqual(status, 200)
            self.assertEqual(body["source"], "public-search")
            self.assertEqual(headers["Access-Control-Allow-Origin"], fixture.EXTENSION_ORIGIN)
            search.assert_called_once_with(payload)
        for code in [404, 409]:
            with patch.object(server, "search_public_quiz", side_effect=server.QuizError("Absent ou ambigu", code)):
                self.assertEqual(self.request(payload)[0], code)

    def test_origin_auth_and_body_limits_prevent_search(self):
        with patch.object(server, "search_public_quiz") as search:
            self.assertEqual(self.request({}, auth=False)[0], 401)
            self.assertEqual(self.request({}, origin="https://kahoot.it")[0], 403)
            self.assertEqual(self.request({"question": "x" * 66000})[0], 413)
            search.assert_not_called()

    def test_post_preflight_is_precise(self):
        extra = {"Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization, content-type"}
        status, _, headers = self.request(auth=False, method="OPTIONS", extra=extra)
        self.assertEqual(status, 204)
        self.assertEqual(headers["Access-Control-Allow-Methods"], "POST")
        extra["Access-Control-Request-Method"] = "DELETE"
        self.assertEqual(self.request(auth=False, method="OPTIONS", extra=extra)[0], 405)


if __name__ == "__main__":
    unittest.main()
