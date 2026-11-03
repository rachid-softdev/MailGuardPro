#!/usr/bin/env python3
"""
Superviseur de la verification d'emails : relance verify_emails.py jusqu'a ce
que plus aucun contact ne soit au statut 'found'.

Le serveur peut redemarrer (ou le run etre tue) : verify_emails.py est deja
resumable (les contacts verifies sortent du filtre 'found'), donc chaque
relance ne refait jamais le travail deja fait. Ce superviseur automatise la
relance apres chaque redemarrage du serveur.

Usage :
  verify_until_done.py [--workers 12] [--round-limit 0] [--max-stalls 3]
"""
import argparse
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
DB = HERE / "data" / "output" / "crm.db"
PYTHON = sys.executable

STATUSES = ("found", "verified", "risky", "invalid")


def counts() -> dict:
    """Compte les contacts par statut (lecture seule, sans verrou d'ecriture)."""
    try:
        conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True, timeout=10)
    except sqlite3.OperationalError:
        return {}
    try:
        rows = conn.execute(
            "SELECT email_status, count(*) FROM contacts "
            "WHERE email IS NOT NULL AND email <> '' GROUP BY 1").fetchall()
    except sqlite3.OperationalError:
        return {}
    finally:
        conn.close()
    return {s: 0 for s in STATUSES} | {s or "none": n for s, n in rows}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=12)
    ap.add_argument("--round-limit", type=int, default=0,
                    help="contacts par relance (0 = tous)")
    ap.add_argument("--max-stalls", type=int, default=3,
                    help="relances sans progres tolerees avant d'abandonner")
    args = ap.parse_args()

    rounds = 0
    stalls = 0
    last_found = -1
    while True:
        c = counts()
        found = c.get("found", 0)
        print(f"[verif] found={found} verified={c.get('verified', 0)} "
              f"risky={c.get('risky', 0)} invalid={c.get('invalid', 0)}", flush=True)
        if found <= 0:
            print("[verif] tous les contacts sont verifies.", flush=True)
            return 0
        if args.max_stalls and stalls >= args.max_stalls:
            print(f"[verif] abandon : plus de progression depuis {stalls} relances "
                  f"(found bloque a {last_found}).", flush=True)
            return 1
        rounds += 1
        cmd = [PYTHON, str(HERE / "verify_emails.py"), "--workers", str(args.workers)]
        if args.round_limit:
            cmd += ["--limit", str(min(args.round_limit, found))]
        print(f"[verif] relance {rounds}: {' '.join(cmd)}", flush=True)
        t0 = time.time()
        code = subprocess.call(cmd, cwd=str(HERE))
        print(f"[verif] relance {rounds} terminee en {(time.time()-t0)/60:.1f} min "
              f"(code {code})", flush=True)

        new_found = counts().get("found", 0)
        if new_found >= last_found and last_found >= 0:
            stalls += 1
            print(f"[verif] aucune progression ({stalls}/{args.max_stalls})", flush=True)
        else:
            stalls = 0
        last_found = new_found
        if code != 0:
            time.sleep(5)


if __name__ == "__main__":
    sys.exit(main())
