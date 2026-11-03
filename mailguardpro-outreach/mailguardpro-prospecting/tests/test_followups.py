"""Tests des relances automatiques (J+3) avec LLM mocké."""

import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import followups
from src.crm import MSG_SENT, STATUS_CONTACTED


def _seed_contacted(crm, domain="example.fr", days_ago=4):
    cid = crm.upsert_company({"domain": domain, "name": domain.split(".")[0],
                              "description": "Boutique"})
    contact_id = crm.add_contact(cid, {"full_name": "Jean Dupont", "first_name": "Jean",
                                       "email": "j@example.fr", "email_status": "found"})
    mid = crm.add_message(cid, contact_id, 1, "Objet initial", "Corps")
    crm.mark_message_sent(mid)
    crm.set_company_status(cid, STATUS_CONTACTED)
    old = (dt.datetime.utcnow() - dt.timedelta(days=days_ago)).isoformat(timespec="seconds") + "Z"
    crm._conn.execute("UPDATE messages SET sent_at = ? WHERE id = ?", (old, mid))
    crm._conn.commit()
    return cid, contact_id


def test_followup_drafted_for_old_message(crm, monkeypatch):
    cid, contact_id = _seed_contacted(crm, days_ago=4)
    monkeypatch.setattr(followups, "chat_json",
                        lambda *a, **k: {"subject": "Re: Objet initial", "body": "Relance courte"})
    summary = followups.generate_followups(crm, followup_days=3, limit=10)
    assert summary["drafted"] == 1
    messages = crm.get_messages_for_company(cid)
    assert len(messages) == 2
    assert messages[1]["sequence"] == 2
    assert messages[1]["subject"] == "Re: Objet initial"


def test_followup_skipped_if_recent(crm, monkeypatch):
    _seed_contacted(crm, days_ago=1)  # envoyé hier -> pas encore dû
    def fail(*a, **k):
        raise AssertionError("relance non due")

    monkeypatch.setattr(followups, "chat_json", fail)
    assert followups.generate_followups(crm, followup_days=3, limit=10)["drafted"] == 0


def test_followup_uses_contact_and_company(crm, monkeypatch):
    cid, contact_id = _seed_contacted(crm)
    captured = {}

    def fake_chat_json(system, user, temperature=0.7):
        captured["user"] = user
        return {"subject": "Re", "body": "Relance"}

    monkeypatch.setattr(followups, "chat_json", fake_chat_json)
    followups.generate_followups(crm, followup_days=3, limit=10)
    assert "example.fr" in captured["user"]
    assert "Jean Dupont" in captured["user"]
