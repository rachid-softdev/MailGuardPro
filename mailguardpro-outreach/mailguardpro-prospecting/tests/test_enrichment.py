"""Tests de l'étape enrichissement, sans Google ni Selenium."""

import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.enrichment import Enricher  # noqa: E402


class _FakeSearcher:
    """Searcher scripté : renvoie la liste prédéfinie pour chaque appel."""

    def __init__(self, results=None):
        self._results = list(results or [])

    def search(self, query, num_results=None):
        if self._results:
            return self._results.pop(0)
        return []

    def close(self):
        pass


def _qualify(crm, sample_company):
    company_id = crm.upsert_company(sample_company)
    crm.set_company_score(company_id, 80, "Bon fit", "ok")
    return company_id


def _site_result(emails):
    return {
        "emails": [{"email": e, "source": "site_home"} for e in emails],
        "foreign": [], "home_text": "Agence SEO", "pages": 1,
    }


def test_enrich_without_google_creates_site_contact(crm, sample_company, monkeypatch):
    """Même sans aucun résultat Google, un contact avec email du site est créé."""
    company_id = _qualify(crm, sample_company)
    monkeypatch.setattr("src.enrichment.harvest_site_emails",
                        lambda url, **kwargs: _site_result(["contact@example.fr"]))

    summary = Enricher(searcher=_FakeSearcher()).enrich(crm, limit=5)

    assert summary["errors"] == 0
    assert summary["with_contacts"] == 1
    contacts = crm.get_contacts_for_company(company_id)
    assert len(contacts) == 1
    assert contacts[0]["email"] == "contact@example.fr"
    assert contacts[0]["email_status"] == "found"
    assert contacts[0]["email_source"] == "site"


def test_enrich_dedup_generic_email_between_contacts(crm, sample_company, monkeypatch):
    """L'email générique du site n'est attribué qu'à un seul contact."""
    company_id = _qualify(crm, sample_company)
    monkeypatch.setattr("src.enrichment.harvest_site_emails",
                        lambda url, **kwargs: _site_result(["contact@example.fr"]))
    monkeypatch.setattr("src.enrichment.verify_email", lambda email: "invalid")

    results = [
        [SimpleNamespace(title="Jean Dupont - Fondateur - Exemple",
                         url="https://www.linkedin.com/in/jean-dupont", snippet="")],
        [SimpleNamespace(title="Marie Martin - CEO - Exemple",
                         url="https://www.linkedin.com/in/marie-martin", snippet="")],
    ]
    summary = Enricher(searcher=_FakeSearcher(results)).enrich(crm, limit=5)

    assert summary["errors"] == 0
    contacts = crm.get_contacts_for_company(company_id)
    assert len(contacts) == 2
    emails = [c["email"] for c in contacts]
    assert emails.count("contact@example.fr") == 1  # jamais de doublon
    assert None in emails  # deuxième contact sans email plutôt que doublon


def test_non_sales_email_filtered_out(crm, sample_company, monkeypatch):
    """Les adresses de rôle (security@, accounts@...) ne deviennent pas contacts."""
    company_id = _qualify(crm, sample_company)
    monkeypatch.setattr(
        "src.enrichment.harvest_site_emails",
        lambda url, **kwargs: _site_result([
            "security@example.fr",
            "contact@example.fr",
        ]),
    )

    summary = Enricher(searcher=_FakeSearcher()).enrich(crm, limit=5)

    assert summary["errors"] == 0
    assert summary["with_contacts"] == 1
    contacts = crm.get_contacts_for_company(company_id)
    assert [c["email"] for c in contacts] == ["contact@example.fr"]


def test_non_sales_only_email_skipped(crm, sample_company, monkeypatch):
    """S'il ne reste qu'une adresse non commerciale, aucun contact n'est créé."""
    company_id = _qualify(crm, sample_company)
    monkeypatch.setattr(
        "src.enrichment.harvest_site_emails",
        lambda url, **kwargs: _site_result(["security@example.fr"]),
    )

    summary = Enricher(searcher=_FakeSearcher()).enrich(crm, limit=5)

    assert summary["with_contacts"] == 0
    assert crm.get_contacts_for_company(company_id) == []


def test_non_sales_email_detection():
    """Détecte les rôles non commerciaux sans faux positif sur un prénom."""
    from src.enrichment import _is_non_sales_email

    assert _is_non_sales_email("security@example.fr")
    assert _is_non_sales_email("accounts@example.fr")
    assert _is_non_sales_email("pr@example.fr")
    assert _is_non_sales_email("people@example.fr")
    assert not _is_non_sales_email("prabesh@example.fr")
    assert not _is_non_sales_email("contact@example.fr")
    assert not _is_non_sales_email("sales@example.fr")
