"""Tests du pipeline d'echelle (ingestion / checkpoint).

Aucun acces reseau ni base reelle : le CRM est simule.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from run_scale import make_ingest, is_generic_local, _process  # noqa: E402


def _counters():
    return {"profiles_ok": 0, "profiles_ko": 0, "companies": 0, "emails": 0,
            "with_email": 0, "harvest_errors": 0, "ingest_errors": 0}


class CRMQuiEchoue:
    """upsert_company leve : simule une base indisponible."""

    def upsert_company(self, company):
        raise RuntimeError("base indisponible")

    def add_event(self, *a, **k):
        pass


class CRMOK:
    def __init__(self):
        self.contacts = []
        self.statuses = []

    def upsert_company(self, company):
        return 1

    def _fetch_all(self, query, params=()):
        return []  # aucun email deja en base

    def add_contact(self, company_id, contact):
        self.contacts.append(contact)
        return len(self.contacts)

    def add_event(self, *a, **k):
        pass

    def set_company_status(self, company_id, status):
        self.statuses.append(status)


def test_ingest_failure_does_not_checkpoint(tmp_path):
    """Une ingestion en echec ne doit PAS marquer la fiche comme traitee."""
    ckpt = tmp_path / "done.txt"
    handle = ckpt.open("a", encoding="utf-8")
    counters = _counters()
    ingest = make_ingest(CRMQuiEchoue(), handle, counters)

    ingest({"url": "https://annuaire/agence/x/", "company": {"name": "X"},
            "emails": []})
    handle.close()

    assert counters["ingest_errors"] == 1
    assert not ckpt.exists() or ckpt.read_text(encoding="utf-8") == ""


def test_ingest_success_marks_and_stores_contacts(tmp_path):
    """Une ingestion reussie marque la fiche et enregistre les emails."""
    ckpt = tmp_path / "done.txt"
    handle = ckpt.open("a", encoding="utf-8")
    counters = _counters()
    crm = CRMOK()
    ingest = make_ingest(crm, handle, counters)

    ingest({"url": "https://annuaire/agence/y/", "company": {"name": "Y"},
            "emails": [{"email": "contact@y.fr", "source": "site_home"}]})
    handle.close()

    assert "agence/y/" in ckpt.read_text(encoding="utf-8")
    assert counters["emails"] == 1 and counters["ingest_errors"] == 0
    assert crm.contacts[0]["email"] == "contact@y.fr"


def test_ingest_ko_profile_is_checkpointed(tmp_path):
    """Une fiche sans entreprise (KO) est bien marquee traitee."""
    ckpt = tmp_path / "done.txt"
    handle = ckpt.open("a", encoding="utf-8")
    counters = _counters()
    ingest = make_ingest(CRMOK(), handle, counters)

    ingest({"url": "https://annuaire/agence/sans-site/", "company": None,
            "emails": []})
    handle.close()

    assert counters["profiles_ko"] == 1
    assert "sans-site" in ckpt.read_text(encoding="utf-8")


def test_is_generic_local_matches_exact_and_variants():
    assert is_generic_local("contact")
    assert is_generic_local("contact-paris")
    assert is_generic_local("info")
    assert is_generic_local("bonjour")
    assert is_generic_local("hello")
    assert is_generic_local("sales.fr")


def test_is_generic_local_rejects_substring_false_positives():
    """Régression : 'info' ne doit pas matcher 'infographie'."""
    assert not is_generic_local("infographie")
    assert not is_generic_local("informations-systeme")
    assert not is_generic_local("salesforce")
    assert not is_generic_local("jean.dupont")
    assert not is_generic_local("contactez-nous")  # pas le local exact


def test_process_merges_directory_email(monkeypatch):
    """L'email exposé par l'annuaire est ajouté aux emails du site."""
    monkeypatch.setattr(
        "run_scale.harvest_site_emails",
        lambda *a, **k: {"emails": [], "home_text": "", "pages": 0},
    )
    company = {"website": "https://x.fr", "domain": "x.fr",
               "email": "Contact@X.fr"}

    result = _process("https://annuaire/x", lambda url: company)

    assert result["emails"] == [{"email": "contact@x.fr", "source": "directory"}]


def test_process_keeps_directory_email_when_harvest_fails(monkeypatch):
    """Un site injoignable ne perd pas l'email fourni par l'annuaire."""
    def boom(*a, **k):
        raise RuntimeError("dns")

    monkeypatch.setattr("run_scale.harvest_site_emails", boom)
    company = {"website": "https://x.fr", "domain": "x.fr",
               "email": "hello@x.fr"}

    result = _process("https://annuaire/x", lambda url: company)

    assert result["emails"][0]["email"] == "hello@x.fr"
    assert result["harvest_error"] == "dns"
