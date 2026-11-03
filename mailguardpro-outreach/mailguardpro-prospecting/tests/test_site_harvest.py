"""Tests du récolteur d'emails HTTP (HTML source, sans Selenium)."""

import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.site_harvest import extract_mailto_emails, harvest_site_emails  # noqa: E402

# ------------------------------------------------------------------ mailto


def test_extract_mailto_basic():
    html = '<a href="mailto:info@example.fr">Nous écrire</a>'
    assert extract_mailto_emails(html) == ["info@example.fr"]


def test_extract_mailto_encoded_and_query_suffix():
    html = ('<a href="mailto:contact@example.fr?subject=Demande">a</a>'
            '<a href="mailto:info%40example.fr">b</a>'
            "<a href='mailto:hello&#64;example.fr'>c</a>")
    assert extract_mailto_emails(html) == [
        "contact@example.fr", "hello@example.fr", "info@example.fr",
    ]


def test_extract_mailto_split():
    html = ('<a href="mailto:sales [at] example [dot] fr">a</a>'
            '<a href="mailto:bonjour(at)example.fr">b</a>'
            '<a href="mailto:info@ exam&#8203;ple.fr">c</a>')
    assert extract_mailto_emails(html) == [
        "bonjour@example.fr", "info@example.fr", "sales@example.fr",
    ]


# ----------------------------------------------------------------- harvest


def _stub_fetch(pages, calls=None):
    """Remplace _fetch : sert les pages du dict, enregistre les appels."""

    def fake_fetch(session, url):
        if calls is not None:
            calls.append(url)
        return pages.get(url)

    return fake_fetch


def test_harvest_home_only_filters_foreign_domain(monkeypatch):
    pages = {"https://example.fr": (
        '<html><p>Contact: <a href="mailto:info@example.fr">info</a> '
        "et newsletter@hebergeur.net et contact@autre-agence.fr</p></html>")}
    monkeypatch.setattr("src.site_harvest._fetch", _stub_fetch(pages))

    result = harvest_site_emails("https://example.fr")
    assert [e["email"] for e in result["emails"]] == ["info@example.fr"]
    assert result["emails"][0]["source"] == "site_home"
    # Les emails hors-domaine sont signalés mais jamais proposés comme contact
    assert result["foreign"] == ["contact@autre-agence.fr", "newsletter@hebergeur.net"]
    assert result["pages"] == 1


def test_harvest_visits_contact_and_footer_pages(monkeypatch):
    calls = []
    pages = {
        "https://example.fr": (
            '<a href="/contact">Contact</a>'
            '<a href="/mentions-legales">Mentions légales</a>'
            '<a href="https://external.org/contact">Partenaire</a>'),
        "https://example.fr/contact": '<p>contact@example.fr</p>',
        "https://example.fr/mentions-legales": '<p>legal@example.fr</p>',
    }
    monkeypatch.setattr("src.site_harvest._fetch", _stub_fetch(pages, calls))

    result = harvest_site_emails("https://example.fr")
    by_email = {e["email"]: e["source"] for e in result["emails"]}
    assert by_email["contact@example.fr"] == "site_contact"
    assert by_email["legal@example.fr"] == "site_page"
    # Le lien externe n'est pas suivi (téléchargements en parallèle : ordre libre)
    assert sorted(calls) == sorted(["https://example.fr", "https://example.fr/contact",
                                    "https://example.fr/mentions-legales"])


def test_harvest_respects_max_pages(monkeypatch):
    calls = []
    pages = {"https://example.fr": "".join(
        f'<a href="/contact-{i}">Contact</a>' for i in range(10))}
    for i in range(10):
        pages[f"https://example.fr/contact-{i}"] = "<p>page</p>"
    monkeypatch.setattr("src.site_harvest._fetch", _stub_fetch(pages, calls))

    result = harvest_site_emails("https://example.fr", max_pages=3)
    assert result["pages"] <= 3
    assert len(calls) <= 3


def test_harvest_dedup_email_across_pages(monkeypatch):
    pages = {
        "https://example.fr": '<a href="/contact">Contact</a> info@example.fr',
        "https://example.fr/contact": "<p>Info@example.fr INFO@EXAMPLE.FR</p>",
    }
    monkeypatch.setattr("src.site_harvest._fetch", _stub_fetch(pages))

    result = harvest_site_emails("https://example.fr")
    assert [e["email"] for e in result["emails"]] == ["info@example.fr"]


def test_harvest_decodes_js_escaped_json_blob(monkeypatch):
    """Les séquences \\uXXXX des blobs JSON ne doivent pas produire de faux emails."""
    blob = (r'href=\"mailto:contact@example.fr\" target=\"_blank\"'
            r'\u003econtact@example.fr\u003c\/a\u003e')
    monkeypatch.setattr("src.site_harvest._fetch",
                        _stub_fetch({"https://example.fr": blob}))

    result = harvest_site_emails("https://example.fr")
    assert [e["email"] for e in result["emails"]] == ["contact@example.fr"]


def test_harvest_home_text_from_html(monkeypatch):
    pages = {"https://example.fr": "<body>Agence SEO à Lyon</body>"}
    monkeypatch.setattr("src.site_harvest._fetch", _stub_fetch(pages))

    result = harvest_site_emails("https://example.fr")
    assert "Agence SEO" in result["home_text"]


def test_harvest_network_error_is_non_fatal(monkeypatch):
    """Toute erreur réseau : log.warning + résultat vide, jamais de crash."""

    def boom(self, url, *args, **kwargs):
        raise requests.ConnectionError("refusé")

    monkeypatch.setattr(requests.Session, "get", boom)
    result = harvest_site_emails("https://site-inexistant-xyz.fr")
    assert result == {"emails": [], "foreign": [], "home_text": "", "pages": 0}


# ------------------------------------------------------------------- _fetch


class _FakeRaw:
    def __init__(self, data: bytes):
        self.data = data
        self.reads = []

    def read(self, n, decode_content=False):
        self.reads.append(n)
        return self.data[:n]


class _FakeResponse:
    def __init__(self, body: bytes, status: int = 200, encoding: str = "utf-8"):
        self.status_code = status
        self.encoding = encoding
        self.raw = _FakeRaw(body)
        self.closed = False

    def close(self):
        self.closed = True


def test_fetch_caps_body_size(monkeypatch):
    """Une page démesurée est tronquée : la mémoire du process reste bornée."""
    from src.site_harvest import MAX_HTML_BYTES, _fetch

    fake = _FakeResponse(b"a" * (MAX_HTML_BYTES * 3))
    monkeypatch.setattr(requests.Session, "get",
                        lambda self, url, **kw: fake)

    html = _fetch(requests.Session(), "https://example.fr")
    assert html is not None
    assert len(html) <= MAX_HTML_BYTES
    assert fake.raw.reads == [MAX_HTML_BYTES]  # lecture plafonnée
    assert fake.closed is True                 # la connexion est bien fermée


def test_fetch_returns_none_and_closes_on_http_error(monkeypatch):
    from src.site_harvest import _fetch

    fake = _FakeResponse(b"", status=404)
    monkeypatch.setattr(requests.Session, "get",
                        lambda self, url, **kw: fake)

    assert _fetch(requests.Session(), "https://example.fr") is None
    assert fake.closed is True


def test_fetch_tolerates_utf8_cut_mid_character(monkeypatch):
    """Tronquer sur une frontière d'octet ne doit pas lever (errors=replace)."""
    from src.site_harvest import MAX_HTML_BYTES, _fetch

    # 'é' (2 octets) juste à la limite -> le dernier caractère est incomplet
    fake = _FakeResponse(b"a" * (MAX_HTML_BYTES - 1) + "é".encode("utf-8"))
    monkeypatch.setattr(requests.Session, "get",
                        lambda self, url, **kw: fake)

    assert _fetch(requests.Session(), "https://example.fr") is not None


def test_thread_session_is_per_thread_and_reused():
    """Chaque thread a sa propre Session HTTP ; elle est réutilisée."""
    import threading

    from src.site_harvest import _thread_session

    sessions = {}

    def record(key):
        sessions[key] = _thread_session()

    record("main")
    record("main")  # même thread -> même session
    t = threading.Thread(target=record, args=("worker",))
    t.start()
    t.join()

    assert sessions["main"] is sessions["main"]
    assert sessions["worker"] is not sessions["main"]


def test_page_pool_is_shared_across_calls():
    """Régression : un seul pool de téléchargement, pas un par site."""
    from src.site_harvest import _get_pool

    assert _get_pool() is _get_pool()


def test_timed_out_page_future_is_cancelled(monkeypatch):
    """Un futur en timeout est annulé : un hôte lent ne bloque pas le pool."""
    import src.site_harvest as sh

    home = ('<html><body><a href="/contact">Contact</a>'
            '<a href="/equipe">Equipe</a></body></html>')

    def fake_fetch(session, url):
        return home if url.rstrip("/") == "https://lent.fr" else None

    monkeypatch.setattr(sh, "_fetch", fake_fetch)

    cancelled = []

    class _HangingFuture:
        def result(self, timeout=None):
            raise TimeoutError("trop lent")

        def cancel(self):
            cancelled.append(True)
            return False

    class _FakePool:
        def submit(self, fn, *a, **k):
            return _HangingFuture()

    monkeypatch.setattr(sh, "_get_pool", lambda: _FakePool())

    result = sh.harvest_site_emails("https://lent.fr")
    assert result["emails"] == []
    assert cancelled, "chaque futur en timeout doit être annulé"
