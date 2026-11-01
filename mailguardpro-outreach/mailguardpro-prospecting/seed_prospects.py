#!/usr/bin/env python3
"""
Seed le CRM avec des prospects vérifiés manuellement.

Le scraping Google peut être bloqué au niveau IP ; ce script permet d'injecter
une liste de domaines à fort signal (CSV) sans passer par la découverte.

Format du CSV (`config/seed_domains.csv`) :
    name,domain,market,country,city,sector,description

Exemple :
    Mon Agence,mon-agence.fr,fr,FR,Paris,agence cold email,Agence outbound B2B

Usage :
    python seed_prospects.py
    python seed_prospects.py --file config/seed_domains.csv
"""
import argparse
import csv
import sys
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
from src.utils import log, normalize_domain  # noqa: E402

DEFAULT_FILE = Path(__file__).resolve().parent / "config" / "seed_domains.csv"


def load_rows(path: Path) -> list:
    """Lit le CSV et normalise les domaines (ignore les lignes sans domaine)."""
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows = []
        for raw in reader:
            row = {k.strip(): (v or "").strip() for k, v in raw.items() if k}
            if not row.get("domain"):
                continue
            row["domain"] = normalize_domain(row["domain"])
            if not row["domain"]:
                continue
            rows.append(row)
        return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed manuel de prospects")
    parser.add_argument("--file", type=Path, default=DEFAULT_FILE)
    args = parser.parse_args()

    if not args.file.exists():
        log.error(f"Fichier introuvable : {args.file}")
        log.info("Créez config/seed_domains.csv avec les colonnes : "
                 "name,domain,market,country,city,sector,description")
        return 1

    rows = load_rows(args.file)
    if not rows:
        log.warning("Aucun prospect dans le CSV")
        return 0

    crm = CRM()
    added = 0
    try:
        for row in rows:
            existing = crm.get_company_by_domain(row["domain"])
            cid = crm.upsert_company({
                "name": row.get("name") or row["domain"].split(".")[0].capitalize(),
                "domain": row["domain"],
                "website": f"https://{row['domain']}",
                "linkedin_url": row.get("linkedin_url") or None,
                "sector": row.get("sector") or None,
                "city": row.get("city") or None,
                "country": row.get("country") or None,
                "employees": row.get("employees") or None,
                "description": row.get("description") or None,
                "market": row.get("market") or "fr",
                "source": "manual_seed",
            })
            if not existing:
                crm.add_event(cid, "discovered", {
                    "source": "manual_seed",
                    "verified": row.get("verified", "").lower() in ("1", "true", "yes"),
                })
                added += 1
            log.info(f"{'+' if not existing else '='} {row['domain']} (id={cid})")
    finally:
        crm.close()

    log.success(f"{added} nouveaux prospects insérés "
                f"({len(rows) - added} déjà présents)")
    return 0


if __name__ == "__main__":
    _force_utf8_console()
    sys.exit(main())
