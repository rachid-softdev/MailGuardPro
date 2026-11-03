"""Tests du CRM SQLite : CRUD, dédoublonnage, relances, stats."""

from src.crm import (
    CRM,
    MSG_DRAFT,
    MSG_SENT,
    STATUS_CONTACTED,
    STATUS_ENRICHED,
    STATUS_QUALIFIED,
    STATUS_REPLIED,
)


def test_upsert_company_and_dedupe(crm, sample_company):
    cid1 = crm.upsert_company(sample_company)
    cid2 = crm.upsert_company(sample_company)  # même domaine -> update, pas insert
    assert cid1 == cid2
    companies = crm.get_all_companies()
    assert len(companies) == 1
    assert companies[0]["status"] == "new"


def test_score_and_qualify(crm, sample_company):
    cid = crm.upsert_company(sample_company)
    crm.set_company_score(cid, 78, "Bon profil", "strong")
    company = crm.get_company(cid)
    assert company["score"] == 78
    assert company["status"] == STATUS_QUALIFIED
    qualified = crm.get_qualified_companies(min_score=70)
    assert len(qualified) == 1


def test_contacts_roundtrip(crm, sample_company):
    cid = crm.upsert_company(sample_company)
    contact_id = crm.add_contact(cid, {
        "full_name": "Jean Dupont", "first_name": "Jean", "function": "CEO",
        "email": "jean@example.fr", "email_status": "verified", "email_source": "inferred",
    })
    contact = crm.get_contact(contact_id)
    assert contact["email"] == "jean@example.fr"
    best = crm.get_best_contact(cid)
    assert best["id"] == contact_id
    # Un contact sans email n'est jamais "meilleur" qu'un avec email vérifié
    crm.add_contact(cid, {"full_name": "Sans Email", "email_status": "none"})
    assert crm.get_best_contact(cid)["id"] == contact_id


def test_messages_and_pending_followups(crm, sample_company):
    cid = crm.upsert_company(sample_company)
    contact_id = crm.add_contact(cid, {"full_name": "Jean Dupont", "email": "j@example.fr",
                                       "email_status": "found"})
    mid = crm.add_message(cid, contact_id, 1, "Objet", "Corps")
    crm.mark_message_sent(mid, "resend_123")
    crm.set_company_status(cid, STATUS_CONTACTED)

    # Trop récent -> pas de relance due
    assert crm.get_pending_followups(3, 2) == []

    # Simule 4 jours plus tard
    import datetime as dt
    import sqlite3
    old = (dt.datetime.utcnow() - dt.timedelta(days=4)).isoformat(timespec="seconds") + "Z"
    crm._conn.execute("UPDATE messages SET sent_at = ? WHERE id = ?", (old, mid))
    crm._conn.commit()

    pending = crm.get_pending_followups(3, 2)
    assert len(pending) == 1
    assert pending[0]["id"] == cid
    assert pending[0]["last_sequence"] == 1


def test_pending_followups_stops_after_max(crm, sample_company):
    """Pas de relance si max_sequence atteint (2 emails)."""
    cid = crm.upsert_company(sample_company)
    contact_id = crm.add_contact(cid, {"full_name": "J D", "email": "j@example.fr"})
    for seq in (1, 2):
        mid = crm.add_message(cid, contact_id, seq, f"Objet {seq}", "Corps")
        crm.mark_message_sent(mid)
    crm.set_company_status(cid, STATUS_CONTACTED)
    import datetime as dt
    old = (dt.datetime.utcnow() - dt.timedelta(days=5)).isoformat(timespec="seconds") + "Z"
    crm._conn.execute("UPDATE messages SET sent_at = ?", (old,))
    crm._conn.commit()
    assert crm.get_pending_followups(3, 2) == []


def test_reply_stops_followups(crm, sample_company):
    """Entreprise qui a répondu -> plus jamais relancée."""
    cid = crm.upsert_company(sample_company)
    contact_id = crm.add_contact(cid, {"full_name": "J D", "email": "j@example.fr"})
    mid = crm.add_message(cid, contact_id, 1, "Objet", "Corps")
    crm.mark_message_sent(mid)
    crm.set_company_status(cid, STATUS_REPLIED)
    import datetime as dt
    old = (dt.datetime.utcnow() - dt.timedelta(days=5)).isoformat(timespec="seconds") + "Z"
    crm._conn.execute("UPDATE messages SET sent_at = ?", (old,))
    crm._conn.commit()
    assert crm.get_pending_followups(3, 2) == []


def test_enriched_without_message(crm, sample_company):
    cid = crm.upsert_company(sample_company)
    crm.set_company_score(cid, 80, "ok", "strong")
    crm.set_company_status(cid, STATUS_ENRICHED)
    assert len(crm.get_enriched_companies_without_message()) == 1
    contact_id = crm.add_contact(cid, {"full_name": "J D", "email": "j@example.fr"})
    crm.add_message(cid, contact_id, 1, "O", "C")
    assert crm.get_enriched_companies_without_message() == []


def test_enriched_without_message_skips_unscored(crm, sample_company):
    """Une entreprise enrichie mais jamais qualifiée n'est pas personnalisée."""
    cid = crm.upsert_company(sample_company)
    crm.set_company_status(cid, STATUS_ENRICHED)
    assert crm.get_enriched_companies_without_message() == []


def test_enriched_without_message_prioritizes_newest_on_tie(crm, sample_company):
    """À score égal, les prospects les plus récents passent en premier."""
    first = crm.upsert_company(sample_company)
    crm.set_company_score(first, 100, "ok", "strong")
    crm.set_company_status(first, STATUS_ENRICHED)

    second = crm.upsert_company({**sample_company, "domain": "second.fr",
                                 "name": "Second SARL"})
    crm.set_company_score(second, 100, "ok", "strong")
    crm.set_company_status(second, STATUS_ENRICHED)

    selected = crm.get_enriched_companies_without_message(limit=1)
    assert [c["id"] for c in selected] == [second]


def test_enriched_without_message_filters_company_ids(crm, sample_company):
    """Le filtre `company_ids` cible un lot sans inclure les autres prospects."""
    first = crm.upsert_company(sample_company)
    crm.set_company_score(first, 80, "ok", "strong")
    crm.set_company_status(first, STATUS_ENRICHED)

    second = crm.upsert_company(dict(sample_company, domain="other.fr",
                                     name="Autre SARL"))
    crm.set_company_score(second, 90, "ok", "strong")
    crm.set_company_status(second, STATUS_ENRICHED)

    selected = crm.get_enriched_companies_without_message(company_ids=[first])
    assert [c["id"] for c in selected] == [first]
    assert len(crm.get_enriched_companies_without_message()) == 2


def test_get_enrichable_includes_stuck_enriched_without_email(crm, sample_company):
    """Qualifiées + enrichies sans email sont reprises ; enrichies avec email, non."""
    qualified = crm.upsert_company(sample_company)
    crm.set_company_score(qualified, 80, "ok", "strong")

    stuck = crm.upsert_company({**sample_company, "domain": "stuck.fr",
                                "name": "Stuck"})
    crm.set_company_score(stuck, 70, "ok", "strong")
    crm.set_company_status(stuck, STATUS_ENRICHED)

    done = crm.upsert_company({**sample_company, "domain": "done.fr",
                               "name": "Done"})
    crm.set_company_score(done, 60, "ok", "strong")
    crm.set_company_status(done, STATUS_ENRICHED)
    crm.add_contact(done, {"full_name": "J D", "email": "j@done.fr"})

    ids = [c["id"] for c in crm.get_enrichable_companies()]
    assert qualified in ids
    assert stuck in ids
    assert done not in ids
    # les qualifiées passent en premier
    assert ids.index(qualified) < ids.index(stuck)


def test_events_and_stats(crm, sample_company):
    cid = crm.upsert_company(sample_company)
    crm.add_event(cid, "discovered", {"query": "agence web Paris"})
    events = crm.get_events(cid)
    assert len(events) == 1
    assert events[0]["type"] == "discovered"
    stats = crm.stats()
    assert stats["new"] == 1


def test_best_contact_skips_invalid(crm, sample_company):
    """Un contact 'invalid' n'est jamais choisi ; 'risky' passe avant 'found'."""
    cid = crm.upsert_company(sample_company)
    crm.add_contact(cid, {"full_name": "Mort", "email": "x@example.fr",
                          "email_status": "invalid"})
    found = crm.add_contact(cid, {"full_name": "F", "email": "f@example.fr",
                                  "email_status": "found"})
    risky = crm.add_contact(cid, {"full_name": "R", "email": "r@example.fr",
                                  "email_status": "risky"})
    assert crm.get_best_contact(cid)["id"] == risky
    # s'il ne reste qu'un 'invalid', il n'est pas retourne du tout
    crm._conn.execute("DELETE FROM contacts WHERE id IN (?, ?)", (found, risky))
    crm._conn.commit()
    assert crm.get_best_contact(cid) is None


def test_get_unscored_companies_includes_enriched(crm, sample_company):
    """Les entreprises enrichies mais jamais scorées restent qualifiables."""
    new = crm.upsert_company(sample_company)
    enriched = crm.upsert_company({**sample_company, "domain": "enriched.fr",
                                   "name": "Enriched"})
    crm.set_company_status(enriched, STATUS_ENRICHED)
    scored = crm.upsert_company({**sample_company, "domain": "scored.fr",
                                 "name": "Scored"})
    crm.set_company_score(scored, 80, "ok", "strong")

    ids = [c["id"] for c in crm.get_unscored_companies(limit=10)]
    assert new in ids
    assert enriched in ids
    assert scored not in ids


def test_company_has_email(crm, sample_company):
    cid = crm.upsert_company(sample_company)
    assert crm.company_has_email(cid) is False
    crm.add_contact(cid, {"full_name": "J D", "email": "j@example.fr"})
    assert crm.company_has_email(cid) is True


def test_set_company_score_preserves_enriched_status(crm, sample_company):
    """Une entreprise déjà enrichie avec email garde son statut pour la rédaction."""
    cid = crm.upsert_company(sample_company)
    crm.set_company_status(cid, STATUS_ENRICHED)
    crm.add_contact(cid, {"full_name": "J D", "email": "j@example.fr"})
    crm.set_company_score(cid, 80, "ok", "strong", status=STATUS_ENRICHED)
    assert crm.get_company(cid)["status"] == STATUS_ENRICHED
    assert crm.company_has_email(cid) is True


def test_set_contact_status_and_get_by_status(crm, sample_company):
    """Verification d'email : filtrage par statut et mise a jour ciblee."""
    cid = crm.upsert_company(sample_company)
    a = crm.add_contact(cid, {"full_name": "A", "email": "a@example.fr",
                              "email_status": "found"})
    b = crm.add_contact(cid, {"full_name": "B", "email": "b@example.fr",
                              "email_status": "found"})
    crm.add_contact(cid, {"full_name": "C", "email": "c@example.fr",
                          "email_status": "verified"})
    crm.add_contact(cid, {"full_name": "D", "email_status": "none"})  # sans adresse

    found = crm.get_contacts_by_status("found")
    assert {c["id"] for c in found} == {a, b}  # les sans-email sont exclus
    assert len(crm.get_contacts_by_status("found", limit=1)) == 1

    crm.set_contact_status(a, "verified")
    assert crm.get_contact(a)["email_status"] == "verified"
    assert {c["id"] for c in crm.get_contacts_by_status("found")} == {b}
    # la mise a jour ne touche pas les autres colonnes
    assert crm.get_contact(a)["email"] == "a@example.fr"
