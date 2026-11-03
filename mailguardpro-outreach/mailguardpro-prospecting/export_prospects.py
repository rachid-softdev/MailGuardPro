#!/usr/bin/env python3
"""
Exporte les prospects du CRM vers un CSV et un Markdown lisibles.

Usage :
    python export_prospects.py
    python export_prospects.py --min-score 70 --status qualified,enriched
    python export_prospects.py --output-dir data/exports
"""
import argparse
import csv
import sys
from datetime import date
from pathlib import Path


def _force_utf8_console() -> None:
    if sys.platform == "win32":
        import io
        for name in ("stdout", "stderr"):
            stream = getattr(sys, name)
            if getattr(stream, "buffer", None) is not None:
                setattr(sys, name, io.TextIOWrapper(
                    stream.buffer, encoding="utf-8", errors="replace"))


sys.path.insert(0, str(Path(__file__).resolve().parent))

from src.crm import CRM  # noqa: E402
from src.utils import log  # noqa: E402

STATUSES = ("qualified", "enriched", "contacted", "replied", "meeting", "closed")
MSG_SENT_STATUSES = ("sent", "delivered", "opened", "replied")

COLUMNS = [
    "company_name", "domain", "website", "market", "sector", "city", "country",
    "employees", "score", "fit", "rationale", "status", "contact_name",
    "contact_function", "contact_email", "email_status", "linkedin_url",
    "draft_subject", "draft_body", "last_sent_at", "source", "description",
]


def _latest_message(messages, statuses):
    """Dernier message correspondant à l'un des statuts donnés."""
    for msg in reversed(messages):
        if msg.get("status") in statuses:
            return msg
    return None


def collect(crm: CRM, statuses, min_score: int, limit: int):
    placeholders = ", ".join("?" for _ in statuses)
    sql = (f"SELECT * FROM companies WHERE status IN ({placeholders}) "
           f"AND (score IS NULL OR score >= ?) "
           f"ORDER BY score DESC, id DESC LIMIT ?")
    companies = crm._fetch_all(sql, (*statuses, min_score, limit))
    rows = []
    for co in companies:
        contact = crm.get_best_contact(co["id"]) or {}
        messages = crm.get_messages_for_company(co["id"])
        draft = _latest_message(messages, ("draft",))
        sent = _latest_message(messages, MSG_SENT_STATUSES)
        rows.append({
            "company_name": co.get("name") or "",
            "domain": co.get("domain") or "",
            "website": co.get("website") or "",
            "market": co.get("market") or "",
            "sector": co.get("sector") or "",
            "city": co.get("city") or "",
            "country": co.get("country") or "",
            "employees": co.get("employees") or "",
            "score": co.get("score") if co.get("score") is not None else "",
            "fit": co.get("fit") or "",
            "rationale": co.get("rationale") or "",
            "status": co.get("status") or "",
            "contact_name": contact.get("full_name") or "",
            "contact_function": contact.get("function") or "",
            "contact_email": contact.get("email") or "",
            "email_status": contact.get("email_status") or "",
            "linkedin_url": contact.get("linkedin_url") or co.get("linkedin_url") or "",
            "draft_subject": draft.get("subject") if draft else "",
            "draft_body": draft.get("body") if draft else "",
            "last_sent_at": sent.get("sent_at") if sent else "",
            "source": co.get("source") or "",
            "description": (co.get("description") or "")[:500],
        })
    return rows


def write_csv(rows, path: Path):
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def write_markdown(rows, path: Path, min_score: int):
    lines = [f"# Prospects MailGuard Pro — {date.today().isoformat()}", ""]
    lines.append(f"- **Total** : {len(rows)}")
    lines.append(f"- **Score minimum** : {min_score}")
    with_email = sum(1 for r in rows if r["contact_email"])
    with_draft = sum(1 for r in rows if r["draft_subject"])
    lines.append(f"- **Avec email** : {with_email}")
    lines.append(f"- **Avec brouillon** : {with_draft}")
    lines.append("")

    for i, r in enumerate(rows, 1):
        lines.append(f"## {i}. {r['company_name']} ({r['domain']}) — score {r['score']}")
        lines.append("")
        meta = []
        if r["market"]:
            meta.append(f"marché **{r['market']}**")
        if r["sector"]:
            meta.append(f"secteur **{r['sector']}**")
        if r["city"]:
            meta.append(r["city"])
        if r["country"]:
            meta.append(r["country"])
        if meta:
            lines.append("- " + " — ".join(meta))
        if r["website"]:
            lines.append(f"- Site : {r['website']}")
        if r["contact_name"] or r["contact_email"]:
            contact = " — ".join(x for x in [
                r["contact_name"], r["contact_function"], r["contact_email"],
            ] if x)
            lines.append(f"- Contact : {contact} ({r['email_status'] or 'n/a'})")
        if r["linkedin_url"]:
            lines.append(f"- LinkedIn : {r['linkedin_url']}")
        if r["rationale"]:
            lines.append(f"- Pourquoi : {r['rationale']}")
        if r["draft_subject"]:
            lines.append("")
            lines.append(f"**Brouillon** : {r['draft_subject']}")
            lines.append("")
            for line in (r["draft_body"] or "").splitlines():
                lines.append(f"> {line}" if line else ">")
        lines.append("")

    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Exporte les prospects du CRM")
    parser.add_argument("--min-score", type=int, default=70)
    parser.add_argument("--status", default=",".join(STATUSES))
    parser.add_argument("--limit", type=int, default=500)
    parser.add_argument("--output-dir", type=Path, default=Path("data/exports"))
    args = parser.parse_args()

    statuses = tuple(s.strip() for s in args.status.split(",") if s.strip())
    if not statuses:
        log.error("Aucun statut fourni")
        return 1

    args.output_dir.mkdir(parents=True, exist_ok=True)
    crm = CRM()
    try:
        rows = collect(crm, statuses, args.min_score, args.limit)
    finally:
        crm.close()

    if not rows:
        log.warning("Aucun prospect à exporter")
        return 0

    stamp = date.today().isoformat()
    csv_path = args.output_dir / f"prospects-{stamp}.csv"
    md_path = args.output_dir / f"prospects-{stamp}.md"
    write_csv(rows, csv_path)
    write_markdown(rows, md_path, args.min_score)
    log.success(f"{len(rows)} prospects exportés : {csv_path} et {md_path}")
    return 0


if __name__ == "__main__":
    _force_utf8_console()
    sys.exit(main())
