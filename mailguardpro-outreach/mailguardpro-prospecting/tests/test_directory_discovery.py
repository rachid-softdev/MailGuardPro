"""Tests du module de découverte d'entreprises via annuaire (JSON-LD, sitemap).

Aucun accès réseau : les réponses HTTP sont simulées.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.directory_discovery import (  # noqa: E402
    fetch_profile_urls,
    parse_profile,
    _is_website_candidate,
    _tag_values,
)

PROFILE_HTML = """
<!doctype html><html><head>
<title>Openmedias | agence de marketing digital à Levallois-Perret</title>
<meta name="description" content="Openmedias, agence de marketing digital (75017).">
</head><body><h1>Openmedias</h1>
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
 {"@type":"WebSite","url":"https://agences-web-france.fr/"},
 {"@type":"ProfessionalService","name":"Openmedias",
  "url":"https://agences-web-france.fr/agence/openmedias/",
  "telephone":"07 85 98 33 73",
  "address":{"@type":"PostalAddress","streetAddress":"13 Ter Bd Berthier",
             "postalCode":"75017","addressLocality":"Levallois-Perret",
             "addressRegion":"Hauts-de-Seine","addressCountry":"FR"},
  "sameAs":["https://www.openmedias.fr/",
            "https://www.facebook.com/openmediasagency/"]}]}
</script>
<a href="https://www.openmedias.fr/">Site web openmedias.fr</a>
<a href="https://www.facebook.com/openmedias/">facebook</a>
</body></html>
"""

NO_SITE_HTML = """
<html><head><title>Fiche sans site</title></head><body>
<script type="application/ld+json">
{"@type":"ProfessionalService","name":"Sans Site",
 "address":{"addressLocality":"Lyon","postalCode":"69000"}}
</script>
<a href="https://www.facebook.com/sanssite/">facebook</a>
</body></html>
"""

SOCIAL_ONLY_SAMEAS_HTML = """
<html><body>
<script type="application/ld+json">
{"@type":"LocalBusiness","name":"Coqpit",
 "address":{"addressLocality":"Clermont-Ferrand","postalCode":"63000"},
 "sameAs":["https://www.facebook.com/coqpit/",
           "https://www.coqpit.fr/"]}
</script>
<a href="https://www.coqpit.fr/">Site web coqpit.fr</a>
</body></html>
"""

SITEMAP_XML = """<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<sitemap><loc>https://agences-web-france.fr/sitemap-1.xml</loc></sitemap>
</sitemapindex>"""

PROFILE_SITEMAP_XML = """<?xml version="1.0" encoding="UTF-8"?>
<urlset>
<url><loc>https://agences-web-france.fr/agence/openmedias/</loc></url>
<url><loc>https://agences-web-france.fr/agence/coqpit/</loc></url>
<url><loc>https://agences-web-france.fr/villes/lyon/</loc></url>
<url><loc>https://agences-web-france.fr/</loc></url>
</urlset>"""


# ------------------------------------------------------------------- parsing

def test_parse_profile_extracts_name_city_and_website():
    got = parse_profile(PROFILE_HTML)
    assert got is not None
    assert got["name"] == "Openmedias"
    assert got["city"] == "Levallois-Perret"
    assert got["domain"] == "openmedias.fr"
    assert got["website"] == "https://www.openmedias.fr/"
    assert got["country"] == "FR"
    assert got["market"] == "fr"


def test_parse_profile_keeps_phone_and_description():
    got = parse_profile(PROFILE_HTML)
    assert "07 85 98 33 73" in got["description"]
    assert "marketing digital" in got["description"]


def test_parse_profile_returns_none_without_website():
    """Pas de site exploitable (réseaux sociaux seuls) -> fiche écartée."""
    assert parse_profile(NO_SITE_HTML) is None


def test_parse_profile_skips_social_sameas():
    """sameAs commence par Facebook -> le site officiel suivant est retenu."""
    got = parse_profile(SOCIAL_ONLY_SAMEAS_HTML)
    assert got is not None
    assert got["domain"] == "coqpit.fr"


def test_parse_profile_tolerates_broken_json_ld():
    html = ("<html><head><title>Broken | agence web</title></head><body>"
            '<script type="application/ld+json">{oops</script></body></html>')
    assert parse_profile(html) is None  # pas de site -> écartée, sans crash


def test_is_website_candidate_rejects_social_and_own_host():
    assert _is_website_candidate("https://www.agoraline.fr/")
    assert not _is_website_candidate("https://www.facebook.com/x/")
    assert not _is_website_candidate(
        "https://agences-web-france.fr/agence/x/")
    assert not _is_website_candidate("mailto:info@a.fr")
    assert not _is_website_candidate("/page/interne.html")


# ------------------------------------------------------------------ sitemaps

def test_tag_values_extracts_locs():
    assert _tag_values(SITEMAP_XML, "loc") == [
        "https://agences-web-france.fr/sitemap-1.xml"]


def test_fetch_profile_urls_keeps_only_agence_pages(monkeypatch):
    class FakeResp:
        status_code = 200
        text = PROFILE_SITEMAP_XML

    monkeypatch.setattr(
        "src.directory_discovery.requests.get",
        lambda *a, **k: FakeResp())
    urls = fetch_profile_urls()
    assert urls == [
        "https://agences-web-france.fr/agence/openmedias/",
        "https://agences-web-france.fr/agence/coqpit/",
    ]


def test_fetch_profile_urls_respects_limit(monkeypatch):
    class FakeResp:
        status_code = 200
        text = PROFILE_SITEMAP_XML

    monkeypatch.setattr(
        "src.directory_discovery.requests.get",
        lambda *a, **k: FakeResp())
    assert len(fetch_profile_urls(limit=1)) == 1


def test_fetch_profile_urls_survives_http_error(monkeypatch):
    class FakeResp:
        status_code = 500
        text = "boom"

    monkeypatch.setattr(
        "src.directory_discovery.requests.get",
        lambda *a, **k: FakeResp())
    assert fetch_profile_urls() == []
