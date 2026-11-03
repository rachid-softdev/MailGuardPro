"""Tests de l'envoi : quota quotidien, DRY_RUN, échecs."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import sender
from src.crm import MSG_DRAFT, MSG_FAILED, MSG_SENT, STATUS_CONTACTED


def _seed_draft(crm, domain="example.fr", email="contact@example.fr"):
    cid = crm.upsert_company({"domain": domain, "name": domain.split(".")[0]})
    contact_id = crm.add_contact(cid, {"full_name": "Jean", "first_name": "Jean",
                                       "email": email, "email_status": "found"})
    mid = crm.add_message(cid, contact_id, 1, "Objet test", "Corps test")
    return cid, contact_id, mid


def test_dry_run_does_not_send(crm, monkeypatch):
    _seed_draft(crm)
    monkeypatch.setenv("DRY_RUN", "true")
    result = sender.send_pending(crm, dry_run=True)
    assert result.sent == 1
    # Le brouillon reste un brouillon (sera envoyé lors d'un vrai run)
    row = crm._fetch_one("SELECT status FROM messages WHERE id = 1")
    assert row["status"] == MSG_DRAFT


def test_send_marks_sent_and_contacted(crm, monkeypatch):
    cid, _, _ = _seed_draft(crm)
    monkeypatch.setattr(sender, "_send_via_resend",
                        lambda to, subject, body: "resend_abc")
    result = sender.send_pending(crm, dry_run=False)
    assert result.sent == 1
    row = crm._fetch_one("SELECT status, resend_id FROM messages WHERE id = 1")
    assert row["status"] == MSG_SENT
    assert row["resend_id"] == "resend_abc"
    company = crm.get_company(cid)
    assert company["status"] == STATUS_CONTACTED


def test_send_failure_marks_failed(crm, monkeypatch):
    cid, _, _ = _seed_draft(crm)
    monkeypatch.setattr(sender, "_send_via_resend", lambda to, subject, body: None)
    result = sender.send_pending(crm, dry_run=False)
    assert result.failed == 1
    row = crm._fetch_one("SELECT status FROM messages WHERE id = 1")
    assert row["status"] == MSG_FAILED


def test_quota_daily_limit(crm, monkeypatch):
    for i in range(3):
        _seed_draft(crm, domain=f"site{i}.fr")
    monkeypatch.setattr(sender, "_send_via_resend",
                        lambda to, subject, body: "resend_xyz")
    monkeypatch.setenv("DAILY_SEND_LIMIT", "2")
    monkeypatch.setenv("MIN_DELAY_SECONDS", "0")
    monkeypatch.setenv("MAX_DELAY_SECONDS", "0")
    result = sender.send_pending(crm, dry_run=False)
    assert result.sent == 2
    # Le 3e brouillon n'est pas parti
    rows = crm._fetch_all("SELECT status FROM messages")
    statuses = [r["status"] for r in rows]
    assert statuses.count(MSG_SENT) == 2
    assert statuses.count(MSG_DRAFT) == 1


def test_invalid_email_is_not_sent(crm, monkeypatch):
    """Un contact 'invalid' (boite inexistante) ne doit jamais recevoir d'email."""
    cid = crm.upsert_company({"domain": "mort.fr", "name": "Mort"})
    contact_id = crm.add_contact(cid, {"full_name": "X", "email": "x@mort.fr",
                                       "email_status": "invalid"})
    crm.add_message(cid, contact_id, 1, "Objet", "Corps")
    monkeypatch.setattr(sender, "_send_via_resend",
                        lambda to, subject, body: "resend_should_not_happen")

    drafts = sender._drafts_to_send(crm, 10)
    assert drafts == []
    result = sender.send_pending(crm, dry_run=False)
    assert result.sent == 0
    # Le brouillon reste en attente : le contact est simplement ecarte
    assert crm._fetch_one("SELECT status FROM messages WHERE id = 1")["status"] == MSG_DRAFT


def test_risky_and_found_emails_are_sent(crm, monkeypatch):
    """risky et found restent contactables (seul 'invalid' est exclu)."""
    for i, status in enumerate(("risky", "found")):
        _seed_draft(crm, domain=f"s{i}.fr", email=f"c@s{i}.fr")
        crm._conn.execute("UPDATE contacts SET email_status = ? WHERE id = ?",
                          (status, i + 1))
    crm._conn.commit()
    monkeypatch.setattr(sender, "_send_via_resend",
                        lambda to, subject, body: "resend_ok")
    monkeypatch.setenv("MIN_DELAY_SECONDS", "0")
    monkeypatch.setenv("MAX_DELAY_SECONDS", "0")
    assert len(sender._drafts_to_send(crm, 10)) == 2
