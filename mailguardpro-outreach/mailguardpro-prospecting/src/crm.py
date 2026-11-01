"""
CRM local SQLite : stockage des entreprises, contacts, messages et événements.

Statuts d'une entreprise :
  new -> qualified -> enriched -> contacted -> replied -> meeting -> closed
  (ou dropped si disqualifiée / bounced si email en erreur)
"""

import json
import sqlite3
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from .config import CRM_DB_PATH
from .utils import log

# Statuts possibles
STATUS_NEW = "new"
STATUS_QUALIFIED = "qualified"
STATUS_ENRICHED = "enriched"
STATUS_CONTACTED = "contacted"
STATUS_REPLIED = "replied"
STATUS_MEETING = "meeting"
STATUS_CLOSED = "closed"
STATUS_DROPPED = "dropped"
STATUS_BOUNCED = "bounced"

# Statuts d'un message
MSG_DRAFT = "draft"
MSG_SENT = "sent"
MSG_DELIVERED = "delivered"
MSG_OPENED = "opened"
MSG_REPLIED = "replied"
MSG_FAILED = "failed"
MSG_BOUNCED = "bounced"

SCHEMA = """
CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT UNIQUE NOT NULL,
    name TEXT,
    sector TEXT,
    website TEXT,
    linkedin_url TEXT,
    city TEXT,
    country TEXT,
    employees TEXT,
    description TEXT,
    market TEXT,
    score INTEGER,
    rationale TEXT,
    fit TEXT,
    source TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    discovered_at TEXT NOT NULL,
    qualified_at TEXT,
    enriched_at TEXT,
    contacted_at TEXT,
    replied_at TEXT,
    last_event_at TEXT
);

CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    full_name TEXT,
    first_name TEXT,
    last_name TEXT,
    function TEXT,
    linkedin_url TEXT,
    email TEXT,
    email_status TEXT DEFAULT 'none',
    email_source TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    sequence INTEGER NOT NULL DEFAULT 1,
    subject TEXT,
    body TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    resend_id TEXT,
    error TEXT,
    sent_at TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    payload TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);
CREATE INDEX IF NOT EXISTS idx_messages_company ON messages(company_id);
CREATE INDEX IF NOT EXISTS idx_events_company ON events(company_id);
"""


def _now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


class CRM:
    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or CRM_DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA foreign_keys=ON")
        self._conn.executescript(SCHEMA)
        self._migrate()
        self._conn.commit()

    def _migrate(self):
        """Migrations légères pour les bases existantes."""
        cols = {row["name"] for row in self._conn.execute("PRAGMA table_info(companies)")}
        if "market" not in cols:
            self._conn.execute("ALTER TABLE companies ADD COLUMN market TEXT")

    def close(self):
        try:
            # Checkpoint WAL pour ne laisser que le .db propre (commitable en git)
            self._conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        except Exception:  # noqa: BLE001
            pass
        self._conn.close()

    def _execute(self, sql: str, params: tuple = ()) -> sqlite3.Cursor:
        cur = self._conn.execute(sql, params)
        self._conn.commit()
        return cur

    def _fetch_one(self, sql: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
        cur = self._conn.execute(sql, params)
        row = cur.fetchone()
        return dict(row) if row else None

    def _fetch_all(self, sql: str, params: tuple = ()) -> List[Dict[str, Any]]:
        cur = self._conn.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]

    # ---------------------------------------------------------------- companies

    def upsert_company(self, data: Dict[str, Any]) -> int:
        """Insère ou met à jour une entreprise (clé unique : domaine). Retourne son id."""
        now = _now()
        existing = self._fetch_one(
            "SELECT id FROM companies WHERE domain = ?", (data["domain"],)
        )
        fields = ["name", "sector", "website", "linkedin_url", "city", "country",
                  "employees", "description", "market", "source"]
        if existing:
            sets = ", ".join(f"{f} = ?" for f in fields if f in data)
            params = [data[f] for f in fields if f in data]
            if sets:
                self._execute(
                    f"UPDATE companies SET {sets} WHERE id = ?",
                    (*params, existing["id"]),
                )
            return existing["id"]
        values = {f: data.get(f) for f in fields}
        cur = self._execute(
            """INSERT INTO companies (domain, name, sector, website, linkedin_url,
               city, country, employees, description, market, source, status,
               discovered_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (data["domain"], values["name"], values["sector"], values["website"],
             values["linkedin_url"], values["city"], values["country"],
             values["employees"], values["description"], values["market"],
             values["source"], STATUS_NEW, now),
        )
        return cur.lastrowid

    def set_company_score(self, company_id: int, score: int, rationale: str,
                          fit: str, status: str = STATUS_QUALIFIED):
        self._execute(
            "UPDATE companies SET score = ?, rationale = ?, fit = ?, status = ?, qualified_at = ? WHERE id = ?",
            (score, rationale, fit, status, _now(), company_id),
        )

    def set_company_status(self, company_id: int, status: str):
        now = _now()
        extra = ""
        params: List[Any] = [status, now]
        if status == STATUS_ENRICHED:
            extra = ", enriched_at = ?"
            params.append(now)
        elif status == STATUS_CONTACTED:
            extra = ", contacted_at = ?"
            params.append(now)
        elif status == STATUS_REPLIED:
            extra = ", replied_at = ?"
            params.append(now)
        self._execute(
            f"UPDATE companies SET status = ?, last_event_at = ?{extra} WHERE id = ?",
            (*params, company_id),
        )

    def get_company(self, company_id: int) -> Optional[Dict[str, Any]]:
        return self._fetch_one("SELECT * FROM companies WHERE id = ?", (company_id,))

    def get_company_by_domain(self, domain: str) -> Optional[Dict[str, Any]]:
        return self._fetch_one("SELECT * FROM companies WHERE domain = ?", (domain,))

    def get_companies_by_status(self, status: str, limit: int = 500) -> List[Dict[str, Any]]:
        return self._fetch_all(
            "SELECT * FROM companies WHERE status = ? ORDER BY id DESC LIMIT ?",
            (status, limit),
        )

    def get_unscored_companies(self, limit: int = 500) -> List[Dict[str, Any]]:
        """Entreprises jamais qualifiées, y compris celles déjà enrichies.

        `run_scale.py` insère des entreprises directement en statut `enriched`
        (contacts déjà récoltés) : elles doivent aussi être scorées.
        """
        return self._fetch_all(
            """SELECT * FROM companies
               WHERE score IS NULL AND status IN (?, ?)
               ORDER BY id DESC LIMIT ?""",
            (STATUS_NEW, STATUS_ENRICHED, limit),
        )

    def company_has_email(self, company_id: int) -> bool:
        """Vrai si l'entreprise a au moins un contact avec une adresse email."""
        row = self._fetch_one(
            """SELECT 1 AS ok FROM contacts
               WHERE company_id = ? AND email IS NOT NULL AND email <> ''
               LIMIT 1""",
            (company_id,),
        )
        return bool(row)

    def get_all_companies(self) -> List[Dict[str, Any]]:
        return self._fetch_all("SELECT * FROM companies ORDER BY id DESC")

    def get_qualified_companies(self, min_score: Optional[int] = None,
                                limit: int = 500) -> List[Dict[str, Any]]:
        if min_score is not None:
            return self._fetch_all(
                "SELECT * FROM companies WHERE status = ? AND score >= ? ORDER BY score DESC LIMIT ?",
                (STATUS_QUALIFIED, min_score, limit),
            )
        return self.get_companies_by_status(STATUS_QUALIFIED, limit)

    def get_enrichable_companies(self, limit: int = 500) -> List[Dict[str, Any]]:
        """Entreprises à enrichir : qualifiées, plus celles marquées enrichies
        restées sans aucun email (ancien run avorté, site injoignable...)."""
        query = """
            SELECT * FROM companies
            WHERE status = ?
               OR (status = ? AND NOT EXISTS (
                      SELECT 1 FROM contacts ct
                      WHERE ct.company_id = companies.id
                        AND ct.email IS NOT NULL AND ct.email <> ''
                  ))
            ORDER BY
              CASE WHEN status = ? THEN 0 ELSE 1 END,
              score DESC, id DESC
            LIMIT ?
        """
        return self._fetch_all(query, (STATUS_QUALIFIED, STATUS_ENRICHED,
                                       STATUS_QUALIFIED, limit))

    def get_enriched_companies_without_message(
            self, limit: int = 20,
            company_ids: Optional[List[int]] = None) -> List[Dict[str, Any]]:
        """Entreprises enrichies n'ayant encore aucun message (initial ou relance).

        `company_ids` restreint la sélection à un lot précis (ex. brouillons
        d'un batch fraîchement qualifié), sans toucher aux autres prospects.
        """
        if company_ids:
            placeholders = ", ".join("?" for _ in company_ids)
            return self._fetch_all(
                f"""SELECT * FROM companies c
                    WHERE c.status = ? AND c.score IS NOT NULL
                    AND c.id IN ({placeholders})
                    AND NOT EXISTS (
                        SELECT 1 FROM messages m WHERE m.company_id = c.id
                    ) ORDER BY c.score DESC LIMIT ?""",
                (STATUS_ENRICHED, *company_ids, limit),
            )
        return self._fetch_all(
            """SELECT * FROM companies c
               WHERE c.status = ? AND c.score IS NOT NULL
               AND NOT EXISTS (
                   SELECT 1 FROM messages m WHERE m.company_id = c.id
               ) ORDER BY c.score DESC LIMIT ?""",
            (STATUS_ENRICHED, limit),
        )

    # ---------------------------------------------------------------- contacts

    def add_contact(self, company_id: int, contact: Dict[str, Any]) -> int:
        cur = self._execute(
            """INSERT INTO contacts (company_id, full_name, first_name, last_name,
               function, linkedin_url, email, email_status, email_source, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (company_id, contact.get("full_name"), contact.get("first_name"),
             contact.get("last_name"), contact.get("function"),
             contact.get("linkedin_url"), contact.get("email"),
             contact.get("email_status", "none"), contact.get("email_source"), _now()),
        )
        return cur.lastrowid

    def update_contact_email(self, contact_id: int, email: str, status: str, source: str):
        self._execute(
            "UPDATE contacts SET email = ?, email_status = ?, email_source = ? WHERE id = ?",
            (email, status, source, contact_id),
        )

    def set_contact_status(self, contact_id: int, status: str):
        """Met à jour uniquement le statut d'un contact (vérification d'email)."""
        self._execute("UPDATE contacts SET email_status = ? WHERE id = ?",
                      (status, contact_id))

    def get_contacts_by_status(self, status: str, limit: int = 0) -> List[Dict[str, Any]]:
        """Contacts ayant ce statut et une adresse email non vide."""
        sql = ("SELECT * FROM contacts WHERE email_status = ? "
               "AND email IS NOT NULL AND email <> '' ORDER BY id")
        params: tuple = (status,)
        if limit:
            sql += " LIMIT ?"
            params = (status, limit)
        return self._fetch_all(sql, params)

    def get_contacts_for_company(self, company_id: int) -> List[Dict[str, Any]]:
        return self._fetch_all(
            "SELECT * FROM contacts WHERE company_id = ? ORDER BY id", (company_id,)
        )

    def get_contact(self, contact_id: int) -> Optional[Dict[str, Any]]:
        return self._fetch_one("SELECT * FROM contacts WHERE id = ?", (contact_id,))

    def get_best_contact(self, company_id: int) -> Optional[Dict[str, Any]]:
        """Meilleur contact a contacter, ou None si aucun n'est exploitable.

        Ordre de preference : verified > risky > found > pattern > (none),
        puis les contacts sans email. Les contacts 'invalid' (boite inexistante
        confirmee) sont ecartes : on ne redige pas de message pour eux.
        """
        order = {
            "verified": 0, "risky": 1, "found": 2, "pattern": 3,
        }
        contacts = [c for c in self.get_contacts_for_company(company_id)
                    if c.get("email_status") != "invalid"]
        if not contacts:
            return None
        contacts.sort(key=lambda c: order.get(c.get("email_status", "none"), 5))
        return contacts[0]

    # ---------------------------------------------------------------- messages

    def add_message(self, company_id: int, contact_id: Optional[int],
                    sequence: int, subject: str, body: str) -> int:
        cur = self._execute(
            """INSERT INTO messages (company_id, contact_id, sequence, subject,
               body, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (company_id, contact_id, sequence, subject, body, MSG_DRAFT, _now()),
        )
        return cur.lastrowid

    def mark_message_sent(self, message_id: int, resend_id: Optional[str] = None):
        self._execute(
            "UPDATE messages SET status = ?, resend_id = ?, sent_at = ? WHERE id = ?",
            (MSG_SENT, resend_id, _now(), message_id),
        )

    def mark_message_failed(self, message_id: int, error: str):
        self._execute(
            "UPDATE messages SET status = ?, error = ? WHERE id = ?",
            (MSG_FAILED, error, message_id),
        )

    def mark_message_status(self, message_id: int, status: str):
        self._execute("UPDATE messages SET status = ? WHERE id = ?", (status, message_id))

    def get_messages_for_company(self, company_id: int) -> List[Dict[str, Any]]:
        return self._fetch_all(
            "SELECT * FROM messages WHERE company_id = ? ORDER BY sequence", (company_id,)
        )

    def get_sent_messages(self, status: str = MSG_SENT, limit: int = 500) -> List[Dict[str, Any]]:
        return self._fetch_all(
            "SELECT * FROM messages WHERE status = ? ORDER BY id DESC LIMIT ?",
            (status, limit),
        )

    def count_messages_sent_since(self, since: str) -> int:
        row = self._fetch_one(
            "SELECT COUNT(*) AS n FROM messages WHERE sent_at >= ? AND status != ?",
            (since, MSG_FAILED),
        )
        return row["n"] if row else 0

    def count_messages_sent_today(self) -> int:
        since = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0).isoformat(timespec="seconds") + "Z"
        return self.count_messages_sent_since(since)

    # ---------------------------------------------------------------- followups

    def get_pending_followups(self, followup_days: int, max_sequence: int,
                              limit: int = 50) -> List[Dict[str, Any]]:
        """Entreprises contactées, sans réponse, dont le dernier message est
        assez ancien et dont le nombre d'emails est sous la limite."""
        cutoff = (datetime.utcnow() - timedelta(days=followup_days)).isoformat(timespec="seconds") + "Z"
        return self._fetch_all(
            """SELECT c.*, m.id AS last_message_id, m.sequence AS last_sequence,
                      m.contact_id AS last_contact_id
               FROM companies c
               JOIN messages m ON m.id = (
                   SELECT id FROM messages
                   WHERE company_id = c.id
                   ORDER BY sequence DESC LIMIT 1
               )
               WHERE c.status = ? AND m.status = ?
                 AND m.sent_at < ?
                 AND m.sequence < ?
                 AND (SELECT COUNT(*) FROM messages WHERE company_id = c.id) < ?
               ORDER BY m.sent_at ASC LIMIT ?""",
            (STATUS_CONTACTED, MSG_SENT, cutoff, max_sequence, max_sequence + 1, limit),
        )

    # ---------------------------------------------------------------- events

    def add_event(self, company_id: Optional[int], type_: str, payload: Any = None):
        self._execute(
            "INSERT INTO events (company_id, type, payload, created_at) VALUES (?, ?, ?, ?)",
            (company_id, type_, json.dumps(payload, ensure_ascii=False) if payload else None, _now()),
        )
        if company_id:
            self._execute(
                "UPDATE companies SET last_event_at = ? WHERE id = ?", (_now(), company_id)
            )

    def get_events(self, company_id: Optional[int] = None, limit: int = 100) -> List[Dict[str, Any]]:
        if company_id is not None:
            return self._fetch_all(
                "SELECT * FROM events WHERE company_id = ? ORDER BY id DESC LIMIT ?",
                (company_id, limit),
            )
        return self._fetch_all("SELECT * FROM events ORDER BY id DESC LIMIT ?", (limit,))

    # ---------------------------------------------------------------- stats

    def stats(self) -> Dict[str, int]:
        rows = self._fetch_all("SELECT status, COUNT(*) AS n FROM companies GROUP BY status")
        stats = {r["status"]: r["n"] for r in rows}
        stats["messages_sent"] = self._fetch_one(
            "SELECT COUNT(*) AS n FROM messages WHERE status IN (?, ?, ?, ?)",
            (MSG_SENT, MSG_DELIVERED, MSG_OPENED, MSG_REPLIED),
        )["n"]
        stats["replies"] = self._fetch_one(
            "SELECT COUNT(*) AS n FROM companies WHERE status = ?", (STATUS_REPLIED,)
        )["n"]
        return stats
