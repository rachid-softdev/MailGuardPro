#!/usr/bin/env python3
"""
Superviseur du pipeline d'echelle : relance run_scale.py jusqu'a epuisement.

Le serveur peut redemarrer (ou un run peut etre tue) : run_scale.py reprend deja
de son checkpoint (data/output/scale_done.txt), donc chaque relance ne perd rien.
Ce superviseur automatise la relance jusqu'a ce que toutes les fiches soient
traitees, puis s'arrete.

Usage :
  run_until_done.py [--workers 10] [--round-limit 3000] [--max-rounds 0]
"""
import argparse
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from src.directory_discovery import fetch_profile_urls  # noqa: E402

CHECKPOINT = HERE / "data" / "output" / "scale_done.txt"
PYTHON = sys.executable


def _done_count() -> int:
    if not CHECKPOINT.exists():
        return 0
    return sum(1 for line in CHECKPOINT.read_text(encoding="utf-8").splitlines()
               if line.strip())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=10)
    ap.add_argument("--round-limit", type=int, default=3000,
                    help="fiches par relance (0 = toutes). Borne la perte sur crash.")
    ap.add_argument("--max-rounds", type=int, default=0, help="0 = jusqu'a epuisement")
    ap.add_argument("--max-stalls", type=int, default=3,
                    help="relances sans progres tolerees avant d'abandonner")
    args = ap.parse_args()

    total = len(fetch_profile_urls())
    rounds = 0
    stalls = 0
    last_done = -1
    while True:
        done = _done_count()
        remaining = total - done
        print(f"[superviseur] {done}/{total} fiches traitees, {remaining} restantes",
              flush=True)
        if remaining <= 0:
            print("[superviseur] toutes les fiches sont traitees.", flush=True)
            return 0
        # Bloque sans progres depuis assez de relances : inutile d'en lancer une
        # de plus (ex. fetch_profile_urls() renvoie une liste plus courte apres
        # une erreur reseau, run_scale sort sur "Rien a traiter").
        if args.max_stalls and stalls >= args.max_stalls:
            print("[superviseur] abandon : plus de progression depuis "
                  f"{stalls} relances (checkpoint bloque a {last_done} fiches).",
                  flush=True)
            return 1
        rounds += 1
        if args.max_rounds and rounds > args.max_rounds:
            print(f"[superviseur] limite de {args.max_rounds} relances atteinte.",
                  flush=True)
            return 0
        cmd = [PYTHON, str(HERE / "run_scale.py"), "--workers", str(args.workers)]
        if args.round_limit:
            cmd += ["--limit", str(min(args.round_limit, remaining))]
        print(f"[superviseur] relance {rounds}: {' '.join(cmd)}", flush=True)
        t0 = time.time()
        code = subprocess.call(cmd, cwd=str(HERE))
        print(f"[superviseur] relance {rounds} terminee en {(time.time()-t0)/60:.1f} min "
              f"(code {code})", flush=True)

        # Detection d'absence de progres : si une relance n'avance pas le
        # checkpoint (ex. fetch_profile_urls() renvoie une liste plus courte
        # apres une erreur reseau, et run_scale sort sur "Rien a traiter"),
        # on ne boucle pas indefiniment.
        new_done = _done_count()
        if new_done <= last_done:
            stalls += 1
            print(f"[superviseur] aucune progression ({stalls}/{args.max_stalls})",
                  flush=True)
        else:
            stalls = 0
        last_done = new_done
        if code != 0:
            time.sleep(5)  # laisse le systeme respirer avant de relancer


if __name__ == "__main__":
    sys.exit(main())
