"""Tests du mode heuristique : scoring et rédaction sans LLM."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import qualifier
from src.config import load_campaigns, load_icp
from src.crm import STATUS_ENRICHED, STATUS_QUALIFIED
from src.followups import _template_followup
from src.heuristics import email_insight
from src.personalizer import _template_email
from src.qualifier import _heuristic_score


COLD_EMAIL_AGENCY = {
    "domain": "coldagency.fr",
    "name": "Cold Agency",
    "sector": "Agence cold email B2B",
    "website": "https://coldagency.fr",
    "city": "Paris",
    "country": "FR",
    "description": "Agence spécialisée en cold email, outbound et lead generation B2B.",
    "market": "fr",
    "status": "new",
}

RESTAURANT = {
    "domain": "restaurant.fr",
    "name": "Chez Marcel",
    "sector": "Restaurant",
    "website": "https://restaurant.fr",
    "city": "Lyon",
    "country": "FR",
    "description": "Restaurant traditionnel et traiteur.",
    "market": "fr",
    "status": "new",
}


def test_heuristic_score_cold_email_agency():
    score, rationale, fit = _heuristic_score(COLD_EMAIL_AGENCY, load_icp())
    assert score >= 70
    assert fit in ("core", "secondary")
    assert "cold email" in rationale


def test_heuristic_score_restaurant_is_dropped():
    score, _, _ = _heuristic_score(RESTAURANT, load_icp())
    assert score < 70


def test_heuristic_score_penalizes_competitor():
    competitor = {
        **COLD_EMAIL_AGENCY,
        "domain": "zerobounce-clone.fr",
        "name": "Email Verification Provider",
        "description": "Email validation and email verification API.",
    }
    score, rationale, _ = _heuristic_score(competitor, load_icp())
    assert score < 70
    assert "concurrent" in rationale


def test_heuristic_score_compact_domain():
    company = {
        "domain": "thecoldemailagency.co.uk",
        "name": "thecoldemailagency.co.uk",
        "website": "https://thecoldemailagency.co.uk",
        "country": "GB",
        "market": "intl",
        "status": "new",
    }
    score, rationale, _ = _heuristic_score(company, load_icp())
    assert score >= 70
    assert "cold email" in rationale


def test_heuristic_score_uses_discovery_query():
    company = {
        "domain": "belkins.io",
        "name": "belkins.io",
        "website": "https://belkins.io",
        "country": "US",
        "market": "intl",
        "status": "new",
    }
    score, rationale, _ = _heuristic_score(
        company, load_icp(), "cold email agency New York")
    assert score >= 70
    assert "requête" in rationale


def test_template_email_fr_has_no_placeholder():
    contact = {"first_name": "Jean", "email": "jean@coldagency.fr"}
    result = _template_email(COLD_EMAIL_AGENCY, contact, "fr", load_campaigns())
    assert "Cold Agency" in result["subject"]
    assert "Bonjour Jean" in result["body"]
    assert "https://mailguard.pro" in result["body"]
    assert "{{" not in result["body"]


def test_template_email_en_uses_english():
    company = {**COLD_EMAIL_AGENCY, "market": "en"}
    contact = {"first_name": "John", "email": "john@coldagency.com"}
    result = _template_email(company, contact, "en", load_campaigns())
    assert "Hello John" in result["body"]
    assert "your lists before the next campaign" in result["subject"].lower()


def test_template_followup_en():
    company = {**COLD_EMAIL_AGENCY, "market": "en"}
    contact = {"first_name": "John", "email": "john@coldagency.com"}
    result = _template_followup(company, contact, "Initial subject", "en",
                                load_campaigns())
    assert result["subject"].startswith("Re:")
    assert "Hello John" in result["body"]


def test_email_insight_detects_email_marketing():
    company = {"sector": "Agence email marketing Klaviyo"}
    insight, relevance = email_insight(company, "fr")
    assert "newsletters" in insight
    assert "bounces" in relevance


def test_qualify_heuristic_scores_enriched_with_email(crm, monkeypatch):
    cid = crm.upsert_company(COLD_EMAIL_AGENCY)
    crm.add_contact(cid, {"full_name": "Jean", "first_name": "Jean",
                          "email": "jean@coldagency.fr", "email_status": "found"})
    crm.set_company_status(cid, STATUS_ENRICHED)
    monkeypatch.setattr(qualifier, "is_heuristic", lambda: True)

    summary = qualifier.qualify(crm, limit=10)
    assert summary["qualified"] == 1
    company = crm.get_company(cid)
    assert company["score"] >= 70
    # Déjà enrichie avec un email : elle reste prête pour la personnalisation.
    assert company["status"] == STATUS_ENRICHED


def test_qualify_heuristic_new_company_becomes_qualified(crm, monkeypatch):
    cid = crm.upsert_company(COLD_EMAIL_AGENCY)
    monkeypatch.setattr(qualifier, "is_heuristic", lambda: True)

    summary = qualifier.qualify(crm, limit=10)
    assert summary["qualified"] == 1
    assert crm.get_company(cid)["status"] == STATUS_QUALIFIED
