"""Tests de la qualification IA avec LLM mocké."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import qualifier


def test_qualify_scores_and_drops(crm, sample_company, monkeypatch):
    cid = crm.upsert_company(sample_company)
    crm.upsert_company({**sample_company, "domain": "autre.fr", "name": "Autre",
                        "website": "https://autre.fr"})

    def fake_chat_json(system, user, temperature=0.3):
        # Déterministe : le domaine détermine le score
        if "example.fr" in user:
            return {"score": 85, "rationale": "Fort enjeu SEO", "fit": "strong"}
        return {"score": 20, "rationale": "Pas d'enjeu", "fit": "weak"}

    monkeypatch.setattr(qualifier, "chat_json", fake_chat_json)

    summary = qualifier.qualify(crm, limit=10)
    assert summary["scored"] == 2
    assert summary["qualified"] == 1
    assert summary["dropped"] == 1

    good = crm.get_company(cid)
    assert good["status"] == "qualified"
    assert good["score"] == 85
    other = crm.get_company_by_domain("autre.fr")
    assert other["status"] == "dropped"


def test_qualify_llm_failure_does_not_crash(crm, sample_company, monkeypatch):
    crm.upsert_company(sample_company)
    monkeypatch.setattr(qualifier, "chat_json", lambda *a, **k: None)
    monkeypatch.setattr(qualifier, "get_env_bool", lambda *a, **k: False)
    summary = qualifier.qualify(crm, limit=10)
    assert summary["errors"] == 1
    # L'entreprise reste en attente (status new), pas de crash
    company = crm.get_company_by_domain("example.fr")
    assert company["status"] == "new"


def test_qualify_no_companies(crm, monkeypatch):
    def fail(*a, **k):
        raise AssertionError("ne doit pas appeler le LLM")

    monkeypatch.setattr(qualifier, "chat_json", fail)
    assert qualifier.qualify(crm, limit=10)["scored"] == 0
