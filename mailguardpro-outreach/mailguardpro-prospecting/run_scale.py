#!/usr/bin/env python3
"""
Pipeline d'echelle : annuaire -> entreprises -> emails.

Pour chaque fiche de l'annuaire :
  1. parse la fiche (JSON-LD) -> nom, ville, site officiel, domaine ;
  2. telecharge le site de l'agence (site_harvest, HTML source + pages contact) ;
  3. ecrit l'entreprise et ses contacts dans le CRM.

Sources disponibles (--source) :
  - agences : agences-web-france.fr (67 879 fiches, checkpoint scale_done.txt) ;
  - expert  : mon-expert-digital.com (~1 255 fiches, scale_done_expert.txt).

Conception :
  - un seul ecrivain SQLite (le thread principal) -> pas de concurrence d'ecriture ;
  - telechargements en parallele (ThreadPoolExecutor), reprise possible via un
    fichier de checkpoint propre a chaque source ;
  - toute erreur reseau est non fatale : on passe au suivant.

Usage :
  run_scale.py --workers 8 --limit 500
  run_scale.py --source expert --workers 8
  run_scale.py --stats
"""
import argparse
import gc
import importlib
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


def _force_utf8_console() -> None:
    """Force UTF-8 sur la console Windows (evite UnicodeEncodeError sur les emojis)."""
    if sys.platform == "win32":
        import io
        for name in ("stdout", "stderr"):
            stream = getattr(sys, name)
            if getattr(stream, "buffer", None) is not None:
                setattr(sys, name, io.TextIOWrapper(
                    stream.buffer, encoding="utf-8", errors="replace"))


sys.path.insert(0, str(Path(__file__).resolve().parent))

from src.crm import CRM, STATUS_ENRICHED  # noqa: E402
from src.site_harvest import harvest_site_emails  # noqa: E402
from src.utils import log  # noqa: E402

SOURCES = {
    "agences": "src.directory_discovery",
    "expert": "src.directory_expert",
    "webstratege": "src.directory_webstratege",
    "local": "src.directory_local",
}
CHECKPOINTS = {
    "agences": Path("data/output/scale_done.txt"),
    "expert": Path("data/output/scale_done_expert.txt"),
    "webstratege": Path("data/output/scale_done_webstratege.txt"),
    "local": Path("data/output/scale_done_local.txt"),
}

# Locaux generiques : on ne compare pas par sous-chaine ("info" matcherait
# "infographie@"), on teste le local exactement ou avec un suffixe/prefixe court.
GENERIC_LOCALS = ("contact", "info", "hello", "bonjour", "sales", "agence", "communication")


def is_generic_local(local: str) -> bool:
    """Vrai si le local est une adresse generique (contact@, info@...)."""
    local = local.lower().strip()
    return any(
        local == kw or local.startswith(kw + "-") or local.startswith(kw + "_")
        or local.startswith(kw + ".") or local.endswith("-" + kw)
        for kw in GENERIC_LOCALS
    )


def _process(url: str, fetch_profile) -> dict:
    """(thread) Fiche + emails du site. Aucune ecriture ici."""
    company = fetch_profile(url)
    if not company:
        return {"url": url, "company": None, "emails": [], "home_text": "", "pages": 0}
    emails: list = []
    home_text = ""
    pages = 0
    harvest_error = None
    try:
        res = harvest_site_emails(company["website"], domain=company["domain"])
        emails = res.get("emails", [])
        home_text = res.get("home_text", "")
        pages = res.get("pages", 0)
    except Exception as e:  # noqa: BLE001
        harvest_error = str(e)

    # Certains annuaires exposent l'email directement dans le JSON-LD.
    profile_email = (company.get("email") or "").strip().lower()
    if profile_email and all(
            (e.get("email") or "").lower() != profile_email for e in emails):
        emails.insert(0, {"email": profile_email, "source": "directory"})

    result = {"url": url, "company": company, "emails": emails,
              "home_text": home_text, "pages": pages}
    if harvest_error:
        result["harvest_error"] = harvest_error
    return result


def _load_done(checkpoint: Path) -> set:
    if not checkpoint.exists():
        return set()
    return {line.strip() for line in
            checkpoint.read_text(encoding="utf-8").splitlines() if line.strip()}


def _existing_emails(crm: CRM, company_id: int) -> set:
    rows = crm._fetch_all(
        "SELECT email FROM contacts WHERE company_id = ? AND email IS NOT NULL",
        (company_id,))
    return {r["email"].lower() for r in rows if r.get("email")}


def stats() -> int:
    crm = CRM()
    companies = crm._fetch_one("SELECT COUNT(*) AS n FROM companies")["n"]
    emails = crm._fetch_one(
        "SELECT COUNT(*) AS n FROM contacts "
        "WHERE email IS NOT NULL AND email <> ''")["n"]
    crm.close()
    log.info(f"entreprises={companies}  emails={emails}")
    return emails


def make_ingest(crm, checkpoint, counters):
    """Construit la fonction d'ingestion (un seul ecrivain SQLite).

    Le checkpoint n'est ecrit qu'apres une ingestion reussie : si l'ingestion
    leve (base indisponible, disque plein...), la fiche n'est PAS marquee
    traitee et sera reprise au prochain run (ecritures idempotentes via
    upsert_company / dedup des emails).
    """

    def ingest(result: dict) -> None:
        company = result["company"]
        if not company:
            counters["profiles_ko"] += 1
            checkpoint.write(result["url"] + "\n")
            return
        try:
            counters["profiles_ok"] += 1
            company_id = crm.upsert_company(company)
            counters["companies"] += 1

            emails = result["emails"]
            existing = _existing_emails(crm, company_id)
            added = 0
            generic = next(
                (e["email"] for e in emails
                 if is_generic_local(e["email"].split("@")[0])),
                None)
            ordered = ([e for e in emails if e["email"].lower() == (generic or "").lower()]
                       + [e for e in emails
                          if e["email"].lower() != (generic or "").lower()])
            for e in ordered:
                addr = e["email"].lower()
                if addr in existing:
                    continue
                cid = crm.add_contact(company_id, {
                    "full_name": None, "first_name": None,
                    "function": "Contact generique",
                    "linkedin_url": None, "email": addr,
                    "email_status": "found", "email_source": e.get("source", "site"),
                })
                crm.add_event(company_id, "contact_added",
                              {"contact_id": cid, "email": addr, "email_status": "found"})
                existing.add(addr)
                added += 1

            if added:
                counters["with_email"] += 1
                counters["emails"] += added
            if result.get("home_text"):
                crm.add_event(company_id, "site_analysis",
                              {"text": result["home_text"][:3000]})
            if added or not emails:
                crm.set_company_status(company_id, STATUS_ENRICHED)
            crm.add_event(company_id, "enriched",
                          {"contacts": added, "site_emails": len(emails),
                           "source": "directory"})
        except Exception as e:  # noqa: BLE001 - fiche non marquee traitee, sera reprise
            counters["ingest_errors"] += 1
            log.warning(f"ingest en echec (fiche non marquee traitee) {result['url']}: {e}")
            return
        checkpoint.write(result["url"] + "\n")

    return ingest


def main() -> int:
    ap = argparse.ArgumentParser(description="Pipeline echelle annuaire -> emails")
    ap.add_argument("--source", choices=sorted(SOURCES), default="agences",
                    help="annuaire source (defaut: agences)")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--limit", type=int, default=0, help="fiches a traiter (0 = toutes)")
    ap.add_argument("--no-harvest", action="store_true",
                    help="decouverte seule (pas de telechargement des sites)")
    ap.add_argument("--stats", action="store_true", help="affiche les compteurs et sort")
    ap.add_argument("--reset-checkpoint", action="store_true")
    args = ap.parse_args()

    crm = CRM()
    if args.stats:
        stats()
        crm.close()
        return 0

    module = importlib.import_module(SOURCES[args.source])
    fetch_profile = module.fetch_profile
    fetch_profile_urls = module.fetch_profile_urls
    checkpoint_path = CHECKPOINTS[args.source]

    if args.reset_checkpoint and checkpoint_path.exists():
        checkpoint_path.unlink()

    t0 = time.time()
    urls = fetch_profile_urls()
    log.info(f"{len(urls)} fiches trouvees dans le sitemap ({args.source})")
    done = _load_done(checkpoint_path)
    todo = [u for u in urls if u not in done]
    if args.limit:
        todo = todo[: args.limit]
    log.info(f"{len(done)} deja traites, {len(todo)} a traiter "
             f"({args.workers} workers{' ,decouverte seule' if args.no_harvest else ''})")
    if not todo:
        log.info("Rien a traiter.")
        stats()
        crm.close()
        return 0

    checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
    checkpoint = checkpoint_path.open("a", encoding="utf-8")

    counters = {"profiles_ok": 0, "profiles_ko": 0, "companies": 0,
                "emails": 0, "with_email": 0, "harvest_errors": 0,
                "ingest_errors": 0}
    last_log = time.time()
    in_flight = args.workers * 4
    _ingest = make_ingest(crm, checkpoint, counters)

    try:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            submitting = iter(todo)
            futures = set()

            def submit_next() -> bool:
                url = next(submitting, None)
                if url is None:
                    return False
                futures.add(pool.submit(_process, url, fetch_profile))
                return True

            for _ in range(min(in_flight, len(todo))):
                submit_next()

            while futures:
                for fut in as_completed(futures):
                    futures.discard(fut)
                    try:
                        result = fut.result()
                    except Exception as e:  # noqa: BLE001 - echec de la fiche (thread)
                        counters["harvest_errors"] += 1
                        log.warning(f"fiche en echec: {e}")
                    else:
                        _ingest(result)  # gere ses propres erreurs (ingest_errors)
                    submit_next()
                    break  # reprendre le plus tot termine
                checkpoint.flush()
                done_n = (counters["profiles_ok"] + counters["profiles_ko"]
                          + counters["harvest_errors"] + counters["ingest_errors"])
                if done_n and done_n % 200 == 0:
                    gc.collect()  # borne la mémoire : le pipeline tourne des heures
                if time.time() - last_log > 15 and done_n:
                    rate = done_n / max(time.time() - t0, 1e-6)
                    eta = (len(todo) - done_n) / max(rate, 1e-6)
                    log.info(
                        f"progression {done_n}/{len(todo)} | "
                        f"entreprises={counters['companies']} | "
                        f"emails={counters['emails']} ({counters['with_email']} societes) | "
                        f"{rate:.1f} fiche/s | threads={threading.active_count()} | "
                        f"ETA {eta/60:.0f} min")
                    last_log = time.time()
    finally:
        checkpoint.close()
        crm.close()

    elapsed = time.time() - t0
    log.success(
        f"Termine en {elapsed/60:.1f} min : {counters['profiles_ok']} fiches ok, "
        f"{counters['profiles_ko']} ignorees, {counters['companies']} entreprises, "
        f"{counters['emails']} emails ajoutes sur {counters['with_email']} societes, "
        f"{counters['harvest_errors']} erreurs de fiche, "
        f"{counters['ingest_errors']} ingestions a reprendre")
    stats()
    return 0


if __name__ == "__main__":
    _force_utf8_console()
    sys.exit(main())
