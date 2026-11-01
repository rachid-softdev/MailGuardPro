#!/usr/bin/env python3
"""
Agent de prospection autonome MailGuard Pro - Orchestrateur.

Usage:
    python run.py [--stage STAGE] [--dry-run] [--limit N] [--debug]
    python run.py --stage replies --domain example.fr   # marquer une réponse

Stages:
    all         pipeline complet (par défaut)
    discovery   recherche Google de nouvelles entreprises
    qualify     qualification IA (score 0-100)
    enrich      décideurs + emails vérifiés
    personalize génère les brouillons d'emails initiaux
    followups   génère les brouillons de relance (J+3)
    send        envoie les brouillons (quota + DRY_RUN)
    replies     marque une entreprise comme ayant répondu (--domain)
    stats       résumé du CRM
"""

import argparse
import sys
import time
from pathlib import Path

# Encodage UTF-8 forcé pour la console Windows (pattern CommuneScraper)
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parent))

from src.config import (  # noqa: E402
    LOCK_PATH,
    get_env,
    is_dry_run,
)
from src.lock import RunnerLock  # noqa: E402
from src.utils import log  # noqa: E402

RUNNER_HOST = get_env("RUNNER_HOST", "github")


def stage_discovery(crm, limit):
    from src.discovery import discover
    return discover(crm, max_new=limit)


def stage_qualify(crm, limit):
    from src.qualifier import qualify
    return qualify(crm, limit=limit)


def stage_enrich(crm, limit):
    from src.enrichment import Enricher
    return Enricher().enrich(crm, limit=limit)


def stage_personalize(crm, limit):
    from src.personalizer import personalize
    return personalize(crm, limit=limit)


def stage_followups(crm, limit):
    from src.followups import generate_followups
    return generate_followups(crm, limit=limit)


def stage_send(crm, dry_run):
    from src.sender import send_pending
    return {"sent": 0, "failed": 0, "skipped": 0, **send_pending(crm, dry_run=dry_run).__dict__}


def stage_replies(crm, domain):
    company = crm.get_company_by_domain(domain)
    if not company:
        log.error(f"Entreprise inconnue: {domain}")
        return {"error": "unknown_domain"}
    crm.set_company_status(company["id"], "replied")
    crm.add_event(company["id"], "reply_marked", {"by": "manual"})
    log.success(f"✅ {company['name']} marquée comme ayant répondu")
    return {"replied": company["name"]}


def stage_stats(crm):
    stats = crm.stats()
    log.info("📊 Statistiques CRM:")
    for k, v in stats.items():
        log.info(f"  {k}: {v}")
    return stats


STAGES = {
    "discovery": stage_discovery,
    "qualify": stage_qualify,
    "enrich": stage_enrich,
    "personalize": stage_personalize,
    "followups": stage_followups,
    "send": stage_send,
    "replies": stage_replies,
    "stats": stage_stats,
}

PIPELINE = ["discovery", "qualify", "enrich", "personalize", "followups", "send"]


def main():
    parser = argparse.ArgumentParser(description="Agent de prospection autonome MailGuard Pro")
    parser.add_argument("--stage", choices=list(STAGES) + ["all"], default="all",
                        help="étape à exécuter (défaut: all)")
    parser.add_argument("--dry-run", action="store_true",
                        help="force le mode sec (aucun envoi)")
    parser.add_argument("--limit", type=int, default=None,
                        help="limite de prospects pour l'étape")
    parser.add_argument("--domain", type=str, default=None,
                        help="domaine pour --stage replies")
    parser.add_argument("--debug", action="store_true", help="logs verbeux")
    args = parser.parse_args()

    if args.debug:
        log.debug_enabled = True

    from src.crm import CRM
    crm = CRM()

    if args.stage == "replies":
        if not args.domain:
            log.error("--stage replies nécessite --domain example.fr")
            return 1
        stage_replies(crm, args.domain)
        crm.close()
        return 0

    if args.stage == "stats":
        stage_stats(crm)
        crm.close()
        return 0

    dry_run = args.dry_run or is_dry_run()
    if dry_run:
        log.warning("🔒 DRY_RUN actif : découverte/qualification/enrichissement OK, "
                    "aucun email ne partira")

    # Verrouillage cross-runner (pattern CommuneScraper)
    if not RunnerLock.acquire_or_skip(LOCK_PATH, RUNNER_HOST):
        log.warning("⏭️ Un autre runner est en cours d'exécution, on passe")
        crm.close()
        return 0

    summary = {}
    start = time.time()
    try:
        stages = PIPELINE if args.stage == "all" else [args.stage]
        for stage in stages:
            log.info(f"━━━ Étape: {stage} ━━━")
            if stage == "send":
                summary[stage] = stage_send(crm, dry_run)
            elif stage == "discovery":
                summary[stage] = stage_discovery(crm, args.limit or 15)
            elif stage == "enrich":
                summary[stage] = stage_enrich(crm, args.limit or 5)
            else:
                summary[stage] = STAGES[stage](crm, args.limit or 10)
    finally:
        RunnerLock.release(LOCK_PATH)

    elapsed = time.time() - start
    summary["_elapsed_seconds"] = round(elapsed, 1)

    from src.notifications import send_discord_summary
    send_discord_summary(summary)

    log.success(f"✅ Run terminé en {elapsed:.1f}s")
    crm.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
