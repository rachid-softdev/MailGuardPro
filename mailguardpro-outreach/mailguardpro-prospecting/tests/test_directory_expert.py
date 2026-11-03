"""Tests du module de découverte mon-expert-digital (sitemap, JSON-LD).

Aucun accès réseau : les réponses HTTP sont simulées.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.directory_expert import (  # noqa: E402
    fetch_profile_urls,
    parse_profile,
)

PROFILE_HTML = """
<!doctype html><html><head>
<title>Team Vanille : Bien plus qu'une agence digitale</title>
</head><body><h1>Team Vanille</h1>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"LocalBusiness",
 "name":"Team Vanille : Bien plus qu&#039;une agence digitale, un partenaire",
 "url":"https://teamvanille.be",
 "description":"Agence digitale &#224; Bruxelles.",
 "telephone":"+32 2 123 45 67",
 "address":{"@type":"PostalAddress","streetAddress":"Rue X 1",
            "postalCode":"1000","addressLocality":"Bruxelles",
            "addressRegion":"Bruxelles-Capitale","addressCountry":"BE"}}
</script>
</body></html>
"""

SITEMAP_XML = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.mon-expert-digital.com/entreprises/france/auvergne-rhone-alpes.html</loc></url>
  <url><loc>https://www.mon-expert-digital.com/entreprises/france/auvergne-rhone-alpes/ain.html</loc></url>
  <url><loc>https://www.mon-expert-digital.com/entreprises/belgique/bruxelles-capitale/bruxelles/team-vanille.html</loc></url>
  <url><loc>https://www.mon-expert-digital.com/entreprises/france/ile-de-france/val-de-marne/maxime-guinar.html</loc></url>
  <url><loc>https://www.mon-expert-digital.com/entreprises/france/ile-de-france/val-de-marne/maxime-guinar.html</loc></url>
  <url><loc>https://www.mon-expert-digital.com/a-propos.html</loc></url>
</urlset>
"""


class FakeResponse:
    status_code = 200

    def __init__(self, text):
        self.text = text


def test_parse_profile_extracts_name_website_city():
    company = parse_profile(PROFILE_HTML)

    assert company is not None
    assert company["name"] == "Team Vanille"
    assert company["website"] == "https://teamvanille.be"
    assert company["domain"] == "teamvanille.be"
    assert company["city"] == "Bruxelles"
    assert company["country"] == "BE"
    assert company["market"] == "fr"
    assert company["source"] == "directory_expert"
    assert "Bruxelles" in company["description"]  # entités HTML décodées


def test_parse_profile_accepts_website_without_scheme():
    html = """
    <script type="application/ld+json">
    {"@type":"LocalBusiness","name":"Blaise Calinaud","url":"blaisecalinaud.com"}
    </script>
    """
    company = parse_profile(html)

    assert company is not None
    assert company["website"] == "https://blaisecalinaud.com"
    assert company["domain"] == "blaisecalinaud.com"


def test_parse_profile_rejects_missing_website():
    html = """
    <script type="application/ld+json">
    {"@type":"LocalBusiness","name":"Sans Site"}
    </script>
    """
    assert parse_profile(html) is None


def test_parse_profile_rejects_directory_or_social_url():
    html = """
    <script type="application/ld+json">
    {"@type":"LocalBusiness","name":"X","url":"https://www.facebook.com/x"}
    </script>
    """
    assert parse_profile(html) is None


def test_fetch_profile_urls_keeps_only_deep_profiles(monkeypatch):
    monkeypatch.setattr(
        "src.directory_expert.requests.get",
        lambda *a, **k: FakeResponse(SITEMAP_XML),
    )

    urls = fetch_profile_urls()

    assert len(urls) == 2
    assert all("/entreprises/" in u for u in urls)
    assert all(u.count("/") >= 7 for u in urls)
    assert "team-vanille.html" in urls[0]


def test_fetch_profile_urls_respects_limit(monkeypatch):
    monkeypatch.setattr(
        "src.directory_expert.requests.get",
        lambda *a, **k: FakeResponse(SITEMAP_XML),
    )

    assert len(fetch_profile_urls(limit=1)) == 1
