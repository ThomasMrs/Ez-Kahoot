#!/usr/bin/env python3
"""Ez-Kahoot — a local, dependency-free browser application.

Only public quiz documents are retrieved. The server never joins a live game.
"""

from __future__ import annotations

import argparse
import base64
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from functools import lru_cache
from html import unescape
from html.parser import HTMLParser
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import hmac
from io import BytesIO
import json
import math
from pathlib import Path
import re
import secrets
import ssl
import subprocess
import sys
import threading
import time
import unicodedata
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, unquote, urlencode, urlparse
from urllib.request import Request, urlopen
import uuid
import webbrowser
import zipfile


VERSION = "1.6.0"
ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
EXTENSION = ROOT / "extension"
MAX_BODY_BYTES = 8 * 1024 * 1024
MAX_QUESTIONS = 500
MAX_CHOICES = 20
MAX_SEARCH_BODY_BYTES = 64 * 1024
SEARCH_CANDIDATE_LIMIT = 10
SEARCH_CACHE_SECONDS = 60
UUID_RE = re.compile(r"(?<![0-9a-f])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![0-9a-f])", re.I)
ALLOWED_HOSTS = {"create.kahoot.it", "play.kahoot.it", "kahoot.it", "www.kahoot.it"}
EXTENSION_ORIGIN_RE = re.compile(r"chrome-extension://[a-p]{32}")
LOOPBACK_HOST_RE = re.compile(r"(?:127\.0\.0\.1|localhost)(?::([0-9]{1,5}))?", re.I)
EXTENSION_FILES = {"received-question.js", "autostart.js", "public-api.js", "quiz-text.js", "manifest.json", "popup.html", "popup.js", "popup.css", "reader.js", "matching.js", "connection.js", "background.js", "automation.js", "active-choice.js", "live-panel.js", "discovery.js", "probe-runtime.js", "live-runtime.js", "README.md", "Montserrat-Latin.woff2", "Montserrat-OFL.txt"}
EXTENSION_FILES.update({
    'correction-memory.js',
    'network-data.js',
    'network-hook.js',
    'network-runtime.js',
    'observations.js',
    'ocr-runner.js',
    'ocr.js',
    'quiz-links.js',
    'session-context.js',
    'tool-actions.js',
    'tools.css',
    'tools.html',
    'tools.js',
    'vendor/ocr/CORE-LICENSE.txt',
    'vendor/ocr/NOTICE.txt',
    'vendor/ocr/TESSERACT-LICENSE.txt',
    'vendor/ocr/eng.traineddata.gz',
    'vendor/ocr/fra.traineddata.gz',
    'vendor/ocr/tesseract-core-lstm.wasm',
    'vendor/ocr/tesseract-core-lstm.wasm.js',
    'vendor/ocr/tesseract-core-relaxedsimd-lstm.wasm',
    'vendor/ocr/tesseract-core-relaxedsimd-lstm.wasm.js',
    'vendor/ocr/tesseract-core-simd-lstm.wasm',
    'vendor/ocr/tesseract-core-simd-lstm.wasm.js',
    'vendor/ocr/tesseract.min.js',
    'vendor/ocr/tesseract.min.js.LICENSE.txt',
    'vendor/ocr/worker.min.js',
    'vendor/ocr/worker.min.js.LICENSE.txt',
})

# A comparison such as x<y is text, not an unfinished HTML element. Only hand
# complete, recognized markup to HTMLParser; unknown angle brackets stay literal.
HTML_TAG_NAMES = (
    "a|abbr|address|article|aside|b|bdi|bdo|blockquote|br|caption|cite|code|col|"
    "colgroup|dd|del|details|dfn|div|dl|dt|em|figcaption|figure|footer|h[1-6]|"
    "header|hr|i|img|ins|kbd|li|main|mark|nav|ol|p|pre|q|rp|rt|ruby|s|samp|"
    "script|section|small|span|strike|strong|style|sub|summary|sup|table|tbody|"
    "td|tfoot|th|thead|time|tr|u|ul|var|wbr"
)
HTML_ATTRIBUTE = r'''\s+[A-Za-z_:][A-Za-z0-9_:.-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?'''
HTML_INPUT_TOKEN_RE = re.compile(
    r"<!--[\s\S]*?-->|</?(?:" + HTML_TAG_NAMES + r")(?=[\s/>])(?:" + HTML_ATTRIBUTE + r")*\s*/?>|<",
    re.I,
)


class QuizError(ValueError):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


class PlainTextParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.hidden += 1
        if self.hidden:
            return
        if tag in {"sup", "sub"}:
            self.parts.append("^(" if tag == "sup" else "_(")
        if tag in {"br", "p", "div", "li"} and self.parts:
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in {"script", "style"}:
            self.hidden = max(0, self.hidden - 1)
            return
        if not self.hidden and tag in {"sup", "sub"}:
            self.parts.append(")")

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def plain_text(value, limit=20000) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        raise QuizError("Le fichier contient un texte dans un format non pris en charge.")
    text = str(value)
    if len(text) > limit:
        raise QuizError("Un texte dépasse la taille maximale autorisée.")
    parser = PlainTextParser()
    parser.feed(HTML_INPUT_TOKEN_RE.sub(lambda match: "&lt;" if match.group() == "<" else match.group(), text))
    parser.close()
    return unescape("".join(parser.parts)).strip()


def parse_quiz_id(value: str) -> str:
    if not isinstance(value, str) or len(value) > 4096:
        raise QuizError("Colle un identifiant de quiz ou un lien public Kahoot valide.")
    value = value.strip()
    if UUID_RE.fullmatch(value):
        return str(uuid.UUID(value))
    if "://" not in value and value.startswith(tuple(ALLOWED_HOSTS)):
        value = "https://" + value
    try:
        parsed = urlparse(value)
        hostname = parsed.hostname
    except ValueError:
        raise QuizError("Ce lien Kahoot n’est pas valide.") from None
    if parsed.scheme not in {"https", "http"} or hostname not in ALLOWED_HOSTS:
        raise QuizError("Utilise un lien create.kahoot.it ou l’identifiant UUID du quiz. Un PIN de partie ne suffit pas.")
    if parsed.username or parsed.password:
        raise QuizError("Ce lien Kahoot n’est pas valide.")
    candidate = unquote(parsed.path + "?" + parsed.query + "#" + parsed.fragment)
    matches = UUID_RE.findall(candidate)
    if not matches:
        raise QuizError("Aucun identifiant de quiz trouvé dans ce lien. Un PIN de partie ne suffit pas.")
    return str(uuid.UUID(matches[0]))


def media_url(value) -> str | None:
    if not isinstance(value, str) or len(value) > 4096:
        return None
    try:
        parsed = urlparse(value)
        if parsed.scheme == "https" and parsed.hostname and not parsed.username and not parsed.password:
            return value
    except ValueError:
        pass
    return None


def finite_number(value, default: float) -> float:
    if isinstance(value, bool):
        return default
    try:
        result = float(value)
        return result if math.isfinite(result) else default
    except (ValueError, TypeError):
        return default


def correctness(value) -> bool | None:
    # No truthiness conversion: the string "false" must never become True.
    return value if isinstance(value, bool) else None


def normalize_quiz(data, quiz_id: str | None = None) -> dict:
    if not isinstance(data, dict):
        raise QuizError("Le fichier doit contenir un objet JSON de quiz.")
    if isinstance(data.get("kahoot"), dict):
        data = data["kahoot"]
    source_questions = data.get("questions")
    if not isinstance(source_questions, list) or not source_questions:
        raise QuizError("Ce document ne contient aucune question exploitable.")
    if len(source_questions) > MAX_QUESTIONS:
        raise QuizError(f"Ce quiz dépasse la limite de {MAX_QUESTIONS} éléments.")

    normalized_input = "id" in data and "uuid" not in data
    source_id = quiz_id or data.get("uuid") or data.get("id")
    try:
        real_id = str(uuid.UUID(str(source_id)))
    except (ValueError, TypeError, AttributeError):
        real_id = None
    imported_id = None
    if normalized_input and isinstance(source_id, str) and source_id.startswith("import-"):
        try:
            imported_id = "import-" + str(uuid.UUID(source_id[7:]))
        except ValueError:
            pass

    questions = []
    slide_count = 0
    skipped_count = 0
    for source_index, raw in enumerate(source_questions, 1):
        if not isinstance(raw, dict):
            raise QuizError(f"L’élément {source_index} du quiz est invalide.")
        question_type = raw.get("type", "quiz")
        if not isinstance(question_type, str):
            raise QuizError(f"Le type de l’élément {source_index} du quiz est invalide.")
        if question_type in {"content", "slide"}:
            slide_count += 1
            continue
        choices_raw = raw.get("choices")
        if question_type not in {"quiz", "true_false", "multiple_choice"} or not isinstance(choices_raw, list):
            skipped_count += 1
            continue
        if len(choices_raw) < 2:
            skipped_count += 1
            continue
        if len(choices_raw) > MAX_CHOICES:
            raise QuizError(f"Une question contient plus de {MAX_CHOICES} réponses.")
        choices = []
        for choice in choices_raw:
            if not isinstance(choice, dict):
                raise QuizError("Une réponse du quiz possède un format invalide.")
            text = plain_text(choice.get("text", choice.get("answer", "")))
            image = media_url(choice.get("image"))
            if not text and image:
                text = "Réponse en image"
            if not text:
                text = "Réponse sans texte"
            entry = {"text": text, "correct": correctness(choice.get("correct"))}
            if image:
                entry["image"] = image
            choices.append(entry)
        question_text = plain_text(raw.get("question", raw.get("title", "")))
        if not question_text:
            question_text = "Question en image" if raw.get("image") else "Question sans titre"
        time_value = finite_number(raw.get("timeLimit"), 20) if "timeLimit" in raw else finite_number(raw.get("time"), 20000) / 1000
        index = len(questions) + 1
        correct_count = sum(c["correct"] is True for c in choices)
        multi_select = raw.get("multiSelect") is True or correct_count > 1
        questions.append({
            "id": plain_text(raw.get("id") or f"q-{source_index}", 1000),
            "index": index,
            "question": question_text,
            "type": "quiz",
            "multiSelect": multi_select,
            "timeLimit": max(5, min(600, round(time_value))),
            "choices": choices,
            "image": media_url(raw.get("image")),
        })
    if not questions:
        raise QuizError("Aucune question à choix multiples exploitable dans ce quiz.")

    if normalized_input:
        slide_count += max(0, min(MAX_QUESTIONS, int(finite_number(data.get("slideCount"), 0))))
        skipped_count += max(0, min(MAX_QUESTIONS, int(finite_number(data.get("skippedCount"), 0))))
    return {
        "id": real_id or imported_id or "import-" + str(uuid.uuid4()),
        "title": plain_text(data.get("title") or "Quiz sans titre", 1000),
        "description": plain_text(data.get("description", "")),
        "sourceUrl": f"https://create.kahoot.it/details/{real_id}" if real_id else None,
        "cover": media_url(data.get("cover")),
        "questions": questions,
        "slideCount": slide_count,
        "skippedCount": skipped_count,
        "creator": plain_text(data.get("creator_username", data.get("creator", "")), 1000),
        "loadedAt": datetime.now(timezone.utc).isoformat(),
    }


@lru_cache(maxsize=1)
def tls_context():
    context = ssl.create_default_context()
    # python.org's macOS builds can ship without their optional CA installation.
    # Add the operating system's real certificates; verification stays enabled.
    if sys.platform == "darwin":
        for keychain in ["/System/Library/Keychains/SystemRootCertificates.keychain", "/Library/Keychains/System.keychain"]:
            try:
                certificates = subprocess.run(
                    ["/usr/bin/security", "find-certificate", "-a", "-p", keychain],
                    capture_output=True, text=True, timeout=5, check=True,
                )
                if certificates.stdout.strip():
                    context.load_verify_locations(cadata=certificates.stdout)
            except (OSError, subprocess.SubprocessError, ssl.SSLError):
                pass
    return context


def fetch_quiz(quiz_id: str) -> dict:
    endpoint = f"https://create.kahoot.it/rest/kahoots/{quiz_id}"
    request = Request(endpoint, headers={"Accept": "application/json", "User-Agent": f"Ez-Kahoot/{VERSION} (public quiz viewer)"})
    try:
        with urlopen(request, timeout=15, context=tls_context()) as response:
            raw = response.read(MAX_BODY_BYTES + 1)
        if len(raw) > MAX_BODY_BYTES:
            raise QuizError("Ce quiz est trop volumineux pour être chargé.", 413)
        data = json.loads(raw)
    except HTTPError as error:
        if error.code in {401, 403, 404}:
            raise QuizError("Quiz introuvable ou privé. Vérifie son lien et sa visibilité publique.", 404) from None
        if error.code == 429:
            raise QuizError("Kahoot limite temporairement les requêtes. Réessaie dans quelques instants.", 429) from None
        raise QuizError("Kahoot ne répond pas correctement. Réessaie plus tard.", 502) from None
    except (URLError, TimeoutError, OSError):
        raise QuizError("Connexion à Kahoot impossible. Vérifie Internet ou importe un fichier JSON.", 502) from None
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise QuizError("Kahoot a renvoyé un document illisible.", 502) from None
    if not isinstance(data, dict):
        raise QuizError("Kahoot a renvoyé un document de quiz invalide.", 502)
    if data.get("visibility") is not None and data.get("visibility") not in (1, "1"):
        raise QuizError("Ce quiz n’est pas public.", 403)
    return normalize_quiz(data, quiz_id)


_SEARCH_OPERATORS = set("+-=<>≤≥≠×÷/^_%*&|()[]{}")
_SUPERSCRIPTS = str.maketrans(dict(zip("⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ", "0123456789+-=()ni")))
_SUBSCRIPTS = str.maketrans(dict(zip("₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎", "0123456789+-=()")))
_SEARCH_STOP_WORDS = set("""
a au aux avec ce ces cette cet dans de des du elle elles en est et eux il ils je la le les leur leurs lui ma mais me mes moi mon ne nos notre nous on ou par pas pour qu que quel quelle quelles quels qui sa sans se ses soi son sont sous sur ta te tes toi ton tout tous toute toutes tu un une vos votre vous y
afin alors ainsi apres avant bien car cela celle celles celui ceux chaque chez comme comment contre depuis donc entre etre fait faire font faut fois laquelle lequel lesquelles lesquels lorsque meme moins ni ont parce pendant peu plus pourquoi quand quoi rien selon ses sein si soit telles tels tres trop vers voici voila explique expliquer expliquee expliquees expliques
the a an and are as at be because been before being between by can could did do does during each for from had has have how if in into is it its may more most not of on or other our out over same should so some than that their them then there these they this those through to under up use was we were what when where which who why will with within would you your
following statement statements correct incorrect true false choose chosen identify determine explain explained explanation answer answers question questions bonne bon bonnes bons affirmation affirmations suivante suivantes suivant suivants correcte correctes incorrecte incorrectes
""".split())


def search_match_text(value: str) -> str:
    """Canonical exact text comparison, retaining mathematical operators."""
    value = plain_text(value)
    value = re.sub(r"[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ]+", lambda match: " ^(" + match.group().translate(_SUPERSCRIPTS) + ") ", value)
    value = re.sub(r"[₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎]+", lambda match: " _(" + match.group().translate(_SUBSCRIPTS) + ") ", value)
    value = unicodedata.normalize("NFD", value).lower()
    value = "".join(character for character in value if not unicodedata.category(character).startswith("M"))
    value = value.translate(str.maketrans({"−": "-", "﹣": "-", "－": "-"}))
    pieces = []
    for character in value:
        if character in _SEARCH_OPERATORS:
            pieces.append(" " + character + " ")
        elif character.isalnum():
            pieces.append(character)
        else:
            pieces.append(" ")
    return " ".join("".join(pieces).split())


def search_choice_texts(values):
    normalized = [search_match_text(value) for value in values]
    boolean = {"true": "@true", "vrai": "@true", "false": "@false", "faux": "@false"}
    if len(normalized) == 2 and all(value in boolean for value in normalized):
        pair = [boolean[value] for value in normalized]
        if len(set(pair)) == 2:
            return Counter(pair)
    return Counter(normalized)


def validate_quiz_search(data) -> tuple[str, tuple[str, ...], int | None]:
    if not isinstance(data, dict) or set(data) - {"question", "choices", "questionCount"}:
        raise QuizError("La recherche attend une question et ses propositions visibles.")
    question = data.get("question")
    choices = data.get("choices")
    count = data.get("questionCount")
    if not isinstance(question, str) or not question.strip() or len(question) > 1200:
        raise QuizError("La question doit contenir entre 1 et 1 200 caractères.")
    if not isinstance(choices, list) or not 2 <= len(choices) <= MAX_CHOICES or any(
        not isinstance(choice, str) or not choice.strip() or len(choice) > 2000 for choice in choices
    ):
        raise QuizError("Indique de 2 à 20 propositions de 1 à 2 000 caractères.")
    if "questionCount" in data and (isinstance(count, bool) or not isinstance(count, int) or not 1 <= count <= MAX_QUESTIONS):
        raise QuizError("Le nombre de questions doit être un entier de 1 à 500.")
    if not search_match_text(question) or any(not search_match_text(choice) for choice in choices):
        raise QuizError("La question et ses propositions doivent contenir du texte exploitable.")
    return question, tuple(choices), count


def public_search_terms(question: str) -> str:
    words = re.findall(r"[^\W\d_]+|\d+", unicodedata.normalize("NFC", plain_text(question)).lower(), re.UNICODE)
    useful = [word for word in words if len(word) >= 3 and search_match_text(word) not in _SEARCH_STOP_WORDS]
    candidates = useful or words
    # A short query avoids excluding a quiz for generic words in the question.
    selected = list(dict.fromkeys(candidates))[-2:]
    query = " ".join(selected)
    if not query:
        raise QuizError("La question ne contient pas de mots exploitables pour la recherche.")
    return query


@lru_cache(maxsize=64)
def _public_search_ids(query: str, cache_epoch: int) -> tuple[str, ...]:
    endpoint = "https://create.kahoot.it/rest/kahoots/?" + urlencode({"query": query, "limit": SEARCH_CANDIDATE_LIMIT})
    request = Request(endpoint, headers={"Accept": "application/json", "User-Agent": f"Ez-Kahoot/{VERSION} (public quiz search)"})
    try:
        with urlopen(request, timeout=15, context=tls_context()) as response:
            raw = response.read(MAX_BODY_BYTES + 1)
        if len(raw) > MAX_BODY_BYTES:
            raise QuizError("La recherche publique a renvoyé trop de données.", 502)
        data = json.loads(raw)
    except HTTPError as error:
        if error.code == 429:
            raise QuizError("Kahoot limite temporairement les recherches. Réessaie dans quelques instants.", 429) from None
        raise QuizError("La recherche publique Kahoot est indisponible.", 502) from None
    except (URLError, TimeoutError, OSError):
        raise QuizError("La recherche publique Kahoot est inaccessible.", 502) from None
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise QuizError("La recherche publique a renvoyé un document illisible.", 502) from None
    if not isinstance(data, dict) or not isinstance(data.get("entities"), list):
        raise QuizError("La recherche publique a renvoyé un format inattendu.", 502)
    candidates = []
    for entity in data["entities"][:SEARCH_CANDIDATE_LIMIT]:
        card = entity.get("card") if isinstance(entity, dict) else None
        value = card.get("uuid") if isinstance(card, dict) else None
        if isinstance(value, str) and UUID_RE.fullmatch(value):
            candidate = str(uuid.UUID(value))
            if candidate not in candidates:
                candidates.append(candidate)
    return tuple(candidates)


@lru_cache(maxsize=32)
def _public_search_candidate(quiz_id: str, cache_epoch: int) -> dict:
    return fetch_quiz(quiz_id)


def search_public_quiz(data) -> dict:
    question, choices, count = validate_quiz_search(data)
    expected_question = search_match_text(question)
    expected_choices = search_choice_texts(choices)
    epoch = int(time.monotonic() // SEARCH_CACHE_SECONDS)
    ids = _public_search_ids(public_search_terms(question), epoch)
    matches = []
    if ids:
        with ThreadPoolExecutor(max_workers=min(5, len(ids))) as executor:
            candidates = [executor.submit(_public_search_candidate, quiz_id, epoch) for quiz_id in ids]
            for candidate in candidates:
                try:
                    quiz = candidate.result()
                except QuizError as error:
                    if error.status in {400, 403, 404, 413}:
                        continue
                    raise
                total = len(quiz["questions"]) + quiz["slideCount"] + quiz["skippedCount"]
                if count is not None and total != count:
                    continue
                if any(search_match_text(entry["question"]) == expected_question and
                       search_choice_texts(choice["text"] for choice in entry["choices"]) == expected_choices
                       for entry in quiz["questions"]):
                    matches.append(quiz)
    if len(matches) > 1:
        raise QuizError("Plusieurs quiz parmi les candidats publics correspondent à cette question.", 409)
    if not matches:
        raise QuizError("Aucun quiz correspondant parmi les dix candidats publics vérifiés.", 404)
    # This establishes a unique match in this bounded result set, not globally.
    return {"quiz": matches[0], "source": "public-search"}


def companion_config(server) -> dict:
    base_url = f"http://127.0.0.1:{server.server_port}"
    with server.companion_lock:
        payload = {"baseUrl": base_url, "token": server.companion_token}
        code = "EZK1." + base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
        quiz = server.companion_quiz
        prepared = {"title": quiz["title"], "questionCount": len(quiz["questions"])} if quiz else None
    return {"connectionCode": code, "baseUrl": base_url, "version": VERSION, "preparedQuiz": prepared}


def extension_archive() -> bytes:
    root = EXTENSION.resolve()
    if not (root / "manifest.json").is_file():
        raise QuizError("Le compagnon navigateur n’est pas disponible dans ce dossier.", 503)
    output = BytesIO()
    total_size = 0
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for source in sorted(root.rglob("*")):
            relative = source.relative_to(root)
            icon = len(relative.parts) == 2 and relative.parts[0] == "icons" and source.suffix.lower() in {".png", ".svg", ".ico"}
            root_icon = len(relative.parts) == 1 and source.suffix.lower() == ".svg"
            if (str(relative) not in EXTENSION_FILES and not icon and not root_icon) or not source.is_file():
                continue
            if not source.resolve().is_relative_to(root):
                continue
            size = source.stat().st_size
            total_size += size
            if size > 16 * 1024 * 1024 or total_size > 96 * 1024 * 1024:
                raise QuizError("Les fichiers du compagnon sont trop volumineux.", 413)
            archive.write(source, relative.as_posix())
    return output.getvalue()


class Handler(SimpleHTTPRequestHandler):
    server_version = "EzKahoot/" + VERSION

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        if urlparse(self.path).path == "/" or urlparse(self.path).path.endswith((".js", ".css", ".html")):
            self.send_header("Cache-Control", "no-cache")
        if getattr(self, "_bridge_origin", None):
            self.send_header("Access-Control-Allow-Origin", self._bridge_origin)
            self.send_header("Vary", "Origin")
        super().end_headers()

    def json_response(self, data, status=200):
        encoded = json.dumps(data, ensure_ascii=False, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def loopback_request(self) -> bool:
        host = self.headers.get("Host", "")
        match = LOOPBACK_HOST_RE.fullmatch(host)
        return bool(match and (match.group(1) is None or 0 < int(match.group(1)) <= 65535))

    def local_request(self) -> bool:
        # The panel's configuration and imports are never exposed to web pages or extensions.
        if not self.loopback_request():
            return False
        origin = self.headers.get("Origin")
        return not origin or origin.lower() == "http://" + self.headers.get("Host", "").lower()

    def pairing_request(self) -> bool:
        origin = self.headers.get("Origin", "")
        if not self.loopback_request() or not EXTENSION_ORIGIN_RE.fullmatch(origin):
            self.json_response({"error": "La connexion rapide doit être lancée depuis l’extension."}, 403)
            return False
        self._bridge_origin = origin
        return True

    def bridge_request(self, authenticate=True) -> bool:
        self._bridge_origin = None
        if not self.loopback_request():
            self.json_response({"error": "Le compagnon est accessible uniquement depuis l’adresse locale."}, 403)
            return False
        origin = self.headers.get("Origin")
        if origin and not EXTENSION_ORIGIN_RE.fullmatch(origin):
            self.json_response({"error": "Cette origine ne peut pas accéder au compagnon."}, 403)
            return False
        if origin:
            self._bridge_origin = origin
        if authenticate:
            authorization = self.headers.get("Authorization", "")
            scheme, _, supplied = authorization.partition(" ")
            with self.server.companion_lock:
                expected = self.server.companion_token
            valid = scheme.lower() == "bearer" and hmac.compare_digest(supplied.encode("utf-8"), expected.encode("utf-8"))
            if not valid:
                self.json_response({"error": "Connexion refusée. Colle un code de connexion actuel dans le compagnon."}, 401)
                return False
        return True

    def read_json_body(self, max_bytes=MAX_BODY_BYTES):
        if self.headers.get_content_type() != "application/json":
            raise QuizError("L’import attend un fichier JSON.", 415)
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = -1
        if length < 1 or length > max_bytes:
            raise QuizError("La recherche doit faire entre 1 octet et 64 Kio." if max_bytes == MAX_SEARCH_BODY_BYTES else "Le fichier doit faire entre 1 octet et 8 Mo.", 413)
        raw = self.rfile.read(length)
        if len(raw) != length:
            raise QuizError("Le fichier reçu est incomplet.")
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError, RecursionError):
            raise QuizError("Ce fichier ne contient pas un JSON valide.") from None

    def do_OPTIONS(self):
        path = urlparse(self.path).path
        if path == "/api/companion/pair":
            if not self.pairing_request():
                return
            requested_headers = {value.strip().lower() for value in self.headers.get("Access-Control-Request-Headers", "").split(",") if value.strip()}
            if self.headers.get("Access-Control-Request-Method", "").upper() != "POST" or requested_headers - {"content-type"}:
                self.json_response({"error": "La connexion rapide attend un POST JSON."}, 405)
                return
            self.send_response(204)
            self.send_header("Access-Control-Allow-Methods", "POST")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Max-Age", "600")
            if self.headers.get("Access-Control-Request-Private-Network", "").lower() == "true":
                self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if not path.startswith("/bridge/"):
            self.json_response({"error": "Fonction inconnue."}, 404)
            return
        if not self.bridge_request(authenticate=False):
            return
        if not self.headers.get("Origin"):
            self.json_response({"error": "Une origine de compagnon valide est nécessaire."}, 403)
            return
        if path not in {"/bridge/health", "/bridge/quiz", "/bridge/search-quiz"}:
            self.json_response({"error": "Fonction inconnue."}, 404)
            return
        requested_headers = {value.strip().lower() for value in self.headers.get("Access-Control-Request-Headers", "").split(",") if value.strip()}
        method = "POST" if path == "/bridge/search-quiz" else "GET"
        allowed_headers = {"authorization", "content-type"} if method == "POST" else {"authorization"}
        if self.headers.get("Access-Control-Request-Method", "").upper() != method or requested_headers - allowed_headers:
            self.json_response({"error": "Le compagnon autorise uniquement la lecture authentifiée."}, 405)
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", method)
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type" if method == "POST" else "Authorization")
        self.send_header("Access-Control-Max-Age", "600")
        if self.headers.get("Access-Control-Request-Private-Network", "").lower() == "true":
            self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def get_bridge(self, parsed):
        if not self.bridge_request():
            return
        if parsed.path == "/bridge/health":
            self.json_response({"ok": True, "name": "Ez-Kahoot", "version": VERSION})
            return
        if parsed.path == "/bridge/quiz":
            query = parse_qs(parsed.query, keep_blank_values=True)
            try:
                if "input" in query:
                    quiz = fetch_quiz(parse_quiz_id(query["input"][0]))
                else:
                    with self.server.companion_lock:
                        quiz = self.server.companion_quiz
                    if quiz is None:
                        raise QuizError("Aucun quiz préparé. Charge un quiz dans Ez-Kahoot et envoie-le au compagnon.", 404)
                self.json_response(quiz)
            except QuizError as error:
                self.json_response({"error": str(error)}, error.status)
            except Exception:
                self.json_response({"error": "Le quiz n’a pas pu être lu. Vérifie son format."}, 502)
            return
        self.json_response({"error": "Fonction inconnue."}, 404)

    def do_GET(self):
        self._bridge_origin = None
        parsed = urlparse(self.path)
        if parsed.path.startswith("/bridge/"):
            self.get_bridge(parsed)
            return
        if not self.local_request():
            self.json_response({"error": "Cette application est accessible uniquement depuis son adresse locale."}, 403)
            return
        if parsed.path == "/downloads/Ez-Kahoot-Companion.zip":
            try:
                encoded = extension_archive()
            except QuizError as error:
                self.json_response({"error": str(error)}, error.status)
                return
            self.send_response(200)
            self.send_header("Content-Type", "application/zip")
            self.send_header("Content-Disposition", 'attachment; filename="Ez-Kahoot-Companion.zip"')
            self.send_header("Content-Length", str(len(encoded)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(encoded)
            return
        if parsed.path == "/README.md":
            encoded = (ROOT / "README.md").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)
            return
        if parsed.path == "/api/health":
            self.json_response({"ok": True, "name": "Ez-Kahoot", "version": VERSION})
            return
        if parsed.path == "/api/companion/config":
            self.json_response(companion_config(self.server))
            return
        if parsed.path == "/api/quiz":
            query = parse_qs(parsed.query)
            value = query.get("input", query.get("id", [""]))[0]
            try:
                self.json_response(fetch_quiz(parse_quiz_id(value)))
            except QuizError as error:
                self.json_response({"error": str(error)}, error.status)
            except Exception:
                self.json_response({"error": "Le quiz n’a pas pu être lu. Vérifie son format."}, 502)
            return
        if parsed.path.startswith("/api/"):
            self.json_response({"error": "Fonction inconnue."}, 404)
            return
        try:
            requested = (PUBLIC / unquote(parsed.path).lstrip("/")).resolve()
        except (ValueError, OSError):
            self.json_response({"error": "Chemin invalide."}, 400)
            return
        if not requested.is_relative_to(PUBLIC.resolve()):
            self.json_response({"error": "Chemin interdit."}, 403)
            return
        if requested.is_dir() and not (requested / "index.html").is_file():
            self.json_response({"error": "Fichier introuvable."}, 404)
            return
        super().do_GET()

    def do_POST(self):
        self._bridge_origin = None
        path = urlparse(self.path).path
        if path == "/bridge/search-quiz":
            if not self.bridge_request():
                return
            try:
                self.json_response(search_public_quiz(self.read_json_body(MAX_SEARCH_BODY_BYTES)))
            except QuizError as error:
                self.json_response({"error": str(error)}, error.status)
            except Exception:
                self.json_response({"error": "La recherche publique n’a pas pu être vérifiée."}, 502)
            return
        if path == "/api/companion/pair":
            if not self.pairing_request():
                return
            try:
                if self.read_json_body() != {}:
                    raise QuizError("La connexion rapide attend un objet JSON vide.")
                origin = self.headers.get("Origin")
                with self.server.companion_lock:
                    paired = self.server.companion_pair_origin
                    if paired and paired != origin:
                        raise QuizError("Une autre extension est déjà associée. Utilise le code de connexion avancé.", 409)
                    self.server.companion_pair_origin = origin
                    self.json_response(companion_config(self.server))
            except QuizError as error:
                self.json_response({"error": str(error)}, error.status)
            return
        if not self.local_request():
            self.json_response({"error": "Origine de requête refusée."}, 403)
            return
        if path not in {"/api/import", "/api/companion/quiz", "/api/companion/reset"}:
            self.json_response({"error": "Fonction inconnue."}, 404)
            return
        try:
            data = self.read_json_body()
            if path == "/api/companion/reset":
                if data != {}:
                    raise QuizError("La réinitialisation attend un objet JSON vide.")
                with self.server.companion_lock:
                    self.server.companion_token = secrets.token_urlsafe(32)
                self.json_response(companion_config(self.server))
            else:
                quiz = normalize_quiz(data)
                if path == "/api/companion/quiz":
                    with self.server.companion_lock:
                        self.server.companion_quiz = quiz
                    self.json_response({"title": quiz["title"], "questionCount": len(quiz["questions"])})
                else:
                    self.json_response(quiz)
        except QuizError as error:
            self.json_response({"error": str(error)}, error.status)


def make_server(port: int) -> ThreadingHTTPServer:
    try:
        server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    except OSError:
        if port == 0:
            raise
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    server.companion_token = secrets.token_urlsafe(32)
    server.companion_quiz = None
    server.companion_lock = threading.RLock()
    server.companion_pair_origin = None
    return server


def is_running_ez_kahoot(port: int) -> bool:
    if port == 0:
        return False
    try:
        request = Request(f"http://127.0.0.1:{port}/api/health", headers={"Accept": "application/json"})
        with urlopen(request, timeout=1) as response:
            payload = response.read(8192)
        health = json.loads(payload)
        return isinstance(health, dict) and health.get("ok") is True and health.get("name") == "Ez-Kahoot"
    except (OSError, ValueError, HTTPError):
        return False


def main():
    parser = argparse.ArgumentParser(description="Ez-Kahoot — créé par thomas marsa")
    parser.add_argument("--port", type=int, default=8765, help="Port local (défaut : 8765)")
    parser.add_argument("--no-browser", action="store_true", help="Ne pas ouvrir automatiquement le navigateur")
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error("Le port doit être compris entre 0 et 65535.")
    if is_running_ez_kahoot(args.port):
        address = f"http://127.0.0.1:{args.port}"
        print(f"\n  Ez-Kahoot est déjà ouvert.\n  {address}\n", flush=True)
        if not args.no_browser:
            webbrowser.open(address)
        return
    server = make_server(args.port)
    address = f"http://127.0.0.1:{server.server_port}"
    print(f"\n  Ez-Kahoot {VERSION} — thomas marsa\n  {address}\n\n  Garde cette fenêtre ouverte. Ctrl+C pour arrêter.\n", flush=True)
    if not args.no_browser:
        threading.Timer(0.5, lambda: webbrowser.open(address)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nEz-Kahoot arrêté.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
