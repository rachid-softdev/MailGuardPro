"""Tests du module annuaire-des-entreprises-locales (sitemap, JSON-LD)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.directory_local import (  # noqa: E402
    fetch_profile_urls,
    parse_profile,
)

PROFILE_HTML = """
<!doctype html><html><head><title>Le Booster Digital</title></head><body>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"LocalBusiness",
 "name":"Le Booster Digital - Neolann",
 "url":"https://leboosterdigital.fr",
 "description":"Agence web &#224; Mirepoix. Contact : contact@leboosterdigital.fr",
 "telephone":"0612345678",
 "address":{"@type":"PostalAddress","postalCode":"09500",
            "addressLocality":"Mirepoix","addressCountry":"FR"}}
</script>
</body></html>
"""

SITEMAP_XML = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.annuaire-des-entreprises-locales.fr/entreprises-locales/ariege/mirepoix-09500/agence-web/le-booster-digital-neolann</loc></url>
  <url><loc>https://www.annuaire-des-entreprises-locales.fr/entreprises-locales/nord/lille-59800/agence-marketing/seoyass</loc></url>
  <url><loc>https://www.annuaire-des-entreprises-locales.fr/entreprises-locales/paris/paris-11-75011/creation-de-site-internet/studio-x</loc></url>
  <url><loc>https://www.annuaire-des-entreprises-locales.fr/entreprises-locales/gard/saint-genies-de-comolas-30150/voyance/medium-y</loc></url>
  <url><loc>https://www.annuaire-des-entreprises-locales.fr/entreprises-locales/sarthe/bonnetable-72110/plombier/plombier-z</loc></url>
  <url><loc>https://www.annuaire-des-entreprises-locales.fr/entreprises-locales/ariege/mirepoix-09500/agence-web/le-booster-digital-neolann</loc></url>
  <url><loc>https://www.annuaire-des-entreprises-locales.fr/annuaire/activites/agence-web</loc></url>
</urlset>
"""


class FakeResponse:
    status_code = 200

    def __init__(self, text):
        self.text = text


def test_parse_profile_extracts_company_and_email():
    company = parse_profile(PROFILE_HTML)

    assert company is not None
    assert company["name"] == "Le Booster Digital - Neolann"
    assert company["domain"] == "leboosterdigital.fr"
    assert company["website"] == "https://leboosterdigital.fr"
    assert company["email"] == "contact@leboosterdigital.fr"
    assert company["city"] == "Mirepoix"
    assert company["country"] == "FR"
    assert company["sector"] == "agence web"
    assert company["source"] == "annuaire_local"


def test_parse_profile_rejects_missing_website():
    html = """
    <script type="application/ld+json">
    {"@type":"LocalBusiness","name":"Sans Site"}
    </script>
    """
    assert parse_profile(html) is None


def test_fetch_profile_urls_keeps_relevant_categories(monkeypatch):
    monkeypatch.setattr(
        "src.directory_local.requests.get",
        lambda *a, **k: FakeResponse(SITEMAP_XML),
    )

    urls = fetch_profile_urls()

    assert len(urls) == 3
    assert all("/entreprises-locales/" in u for u in urls)
    assert not any("/voyance/" in u or "/plombier/" in u for u in urls)


def test_fetch_profile_urls_respects_limit(monkeypatch):
    monkeypatch.setattr(
        "src.directory_local.requests.get",
        lambda *a, **k: FakeResponse(SITEMAP_XML),
    )

    assert len(fetch_profile_urls(limit=2)) == 2
