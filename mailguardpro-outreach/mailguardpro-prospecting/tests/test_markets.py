"""Tests multi-marché : colonne market en CRM, langue d'email selon le marché."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import personalizer
from src.crm import STATUS_ENRICHED


def test_company_market_column(crm, sample_company):
    cid = crm.upsert_company({**sample_company, "market": "intl", "country": "US"})
    company = crm.get_company(cid)
    assert company["market"] == "intl"
    assert company["country"] == "US"


def test_market_migration_keeps_data(crm, sample_company):
    """La migration ALTER ne doit pas casser les bases créées avant market."""
    # Simule une base "ancienne" : on supprime la colonne puis on relit
    cid = crm.upsert_company(sample_company)
    crm._conn.execute("ALTER TABLE companies DROP COLUMN market")
    crm._conn.commit()
    # À la réouverture, la migration ajoute market
    crm.close()
    from src.crm import CRM
    crm2 = CRM(db_path=crm.db_path)
    company = crm2.get_company(cid)
    assert company["market"] is None  # valeur NULL, pas d'erreur
    crm2.close()


def test_personalize_uses_market_lang(crm, sample_company, monkeypatch):
    """Le contexte du prompt contient la langue du marché de l'entreprise."""
    cid = crm.upsert_company({**sample_company, "market": "intl", "country": "US"})
    crm.set_company_score(cid, 80, "ok", "strong")
    crm.set_company_status(cid, STATUS_ENRICHED)
    crm.add_event(cid, "site_analysis", {"text": "We build websites"})

    crm.add_contact(cid, {"full_name": "John Smith", "first_name": "John",
                          "email": "john@example.fr", "email_status": "found"})

    captured = {}

    def fake_chat_json(system, user, temperature=0.7):
        captured["user"] = user
        return {"subject": "SEO monitoring", "body": "Hello John"}

    monkeypatch.setattr(personalizer, "chat_json", fake_chat_json)
    summary = personalizer.personalize(crm, limit=5)
    assert summary["drafted"] == 1
    assert "Langue de l'email: en" in captured["user"]
    assert "intl" in captured["user"]


def test_personalize_french_market_default(crm, sample_company, monkeypatch):
    """Marché fr (ou absent) -> langue fr."""
    cid = crm.upsert_company({**sample_company, "market": "fr"})
    crm.set_company_score(cid, 80, "ok", "strong")
    crm.set_company_status(cid, STATUS_ENRICHED)
    crm.add_contact(cid, {"full_name": "Jean Dupont", "first_name": "Jean",
                          "email": "jean@example.fr", "email_status": "found"})

    captured = {}

    def fake_chat_json(system, user, temperature=0.7):
        captured["user"] = user
        return {"subject": "SEO", "body": "Bonjour Jean"}

    monkeypatch.setattr(personalizer, "chat_json", fake_chat_json)
    personalizer.personalize(crm, limit=5)
    assert "Langue de l'email: fr" in captured["user"]
