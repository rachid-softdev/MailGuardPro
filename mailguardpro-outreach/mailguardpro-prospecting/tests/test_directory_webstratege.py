"""Tests du module de découverte webstratege (sitemap, JSON-LD Organization).

Aucun accès réseau : les réponses HTTP sont simulées.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.directory_webstratege import (  # noqa: E402
    fetch_profile_urls,
    parse_profile,
)

PROFILE_HTML = """
<!doctype html><html><head><title>PrimeBoost Agency</title></head><body>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Organization",
 "name":"PrimeBoost Agency",
 "url":"https://primeboostagency.fr/",
 "description":"Le webmarketing qui transforme votre visibilit&#233; en clients.",
 "email":"Info@PrimeBoostAgency.fr",
 "telephone":"0768692184",
 "address":{"@type":"PostalAddress","addressLocality":"Lyon",
            "addressCountry":"France"},
 "sameAs":["https://www.linkedin.com/in/paul-belin-210692277/"],
 "numberOfEmployees":{"@type":"QuantitativeValue","minValue":1,"maxValue":1},
 "knowsAbout":["SEO","Webmarketing"]}
</script>
</body></html>
"""

SITEMAP_XML = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://webstratege.fr/</loc></url>
  <url><loc>https://webstratege.fr/trouver-mon-agence/</loc></url>
  <url><loc>https://webstratege.fr/classement/meilleures-agences-seo/</loc></url>
  <url><loc>https://webstratege.fr/agence/primeboost-agency/</loc></url>
  <url><loc>https://webstratege.fr/agence/sanctumdesign/</loc></url>
  <url><loc>https://webstratege.fr/agence/sanctumdesign/</loc></url>
</urlset>
"""


class FakeResponse:
    status_code = 200

    def __init__(self, text):
        self.text = text


def test_parse_profile_extracts_company_and_email():
    company = parse_profile(PROFILE_HTML)

    assert company is not None
    assert company["name"] == "PrimeBoost Agency"
    assert company["domain"] == "primeboostagency.fr"
    assert company["website"] == "https://primeboostagency.fr/"
    assert company["email"] == "info@primeboostagency.fr"
    assert company["city"] == "Lyon"
    assert company["country"] == "FR"
    assert company["employees"] == "1"
    assert company["sector"] == "agence SEO"
    assert company["linkedin_url"].startswith("https://www.linkedin.com/")
    assert company["source"] == "webstratege"


def test_parse_profile_keeps_company_when_email_invalid():
    html = """
    <script type="application/ld+json">
    {"@type":"Organization","name":"Sans Email","url":"sans-email.fr",
     "email":"pas-un-email"}
    </script>
    """
    company = parse_profile(html)

    assert company is not None
    assert company["email"] is None
    assert company["domain"] == "sans-email.fr"


def test_parse_profile_rejects_missing_website():
    html = """
    <script type="application/ld+json">
    {"@type":"Organization","name":"Sans Site"}
    </script>
    """
    assert parse_profile(html) is None


def test_fetch_profile_urls_keeps_only_agency_pages(monkeypatch):
    monkeypatch.setattr(
        "src.directory_webstratege.requests.get",
        lambda *a, **k: FakeResponse(SITEMAP_XML),
    )

    urls = fetch_profile_urls()

    assert len(urls) == 2
    assert all("/agence/" in u for u in urls)
    assert urls[0].endswith("/agence/primeboost-agency/")


def test_fetch_profile_urls_respects_limit(monkeypatch):
    monkeypatch.setattr(
        "src.directory_webstratege.requests.get",
        lambda *a, **k: FakeResponse(SITEMAP_XML),
    )

    assert len(fetch_profile_urls(limit=1)) == 1
