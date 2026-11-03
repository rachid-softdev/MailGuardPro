#!/usr/bin/env python3
"""
Verification des emails recoltes : statuts found -> verified / risky / invalid.

Deux modes de controle :
  1. MX (gratuit, toujours possible) : un domaine sans MX = adresse morte -> invalid ;
  2. SMTP RCPT (port 25) : confirme l'adresse -> verified, rejet explicite -> invalid.

Deux garde-fous indispensables, appris a l'usage :
  - le port 25 est bloque dans la majorite des environnements cloud et chez les
    FAI : sans SMTP on NE marque PAS tout "invalid" -> on se rabat sur le MX ;
  - les gateways anti-spam (Microsoft 365, Google Workspace, Proofpoint...)
    rejettent ou different les sondes RCPT meme pour des boites valides, et
    beaucoup de serveurs rejettent notre IP de sonde pour des raisons de
    politique : un rejet SMTP n'est PAS une preuve d'invalidite. On lit le
    message de rejet avant de condamner : seul un vrai "user unknown" => invalid.

L'expediteur des sondes RCPT doit etre un domaine reellement resolvable et
joignable, sinon les serveurs rejettent MAIL FROM (450 "Domain not found").

Ecrit dans le CRM uniquement depuis le thread principal (SQLite mono-ecrivain).
Usage :
  verify_emails.py [--limit N] [--workers 8] [--no-smtp] [--sender ADDR] [--stats]
"""
import argparse
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# Console Windows : force UTF-8 pour que les logs (emojis) ne fassent pas
# planter le script quand stdout est redirige vers un fichier ou un pipe
# (codec cp1252 par defaut -> UnicodeEncodeError).
#
# Applique uniquement en execution directe : reassigner sys.stdout a l'import
# casserait la capture de pytest (il remplace le flux qu'il suit).
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
from src.email_verify import EMAIL_REGEX, get_mx_records  # noqa: E402
from src.utils import log  # noqa: E402

CATCH_ALL_DOMAINS = {"gmail.com", "outlook.com", "hotmail.com", "yahoo.com",
                     "protonmail.com", "icloud.com", "live.com", "msn.com"}

# Gateways qui rejettent ou different les sondes RCPT sur port 25 (anti-spam)
# meme pour des boites valides : un rejet SMTP n'y prouve RIEN. Marquer
# "invalid" sur ces domaines ferait perdre des leads valides.
GATEWAY_MX_MARKERS = (
    "protection.outlook.com",        # Microsoft 365
    "google.com", "googlemail.com",  # Google Workspace
    "pphosted.com", "proofpoint.com",
    "mimecast.com", "barracuda", "messagelabs", "iphmx.com", "amazonses.com",
)

# Expediteur des sondes RCPT. Il DOIT etre un domaine reellement resolvable
# et joignable : sinon les serveurs rejettent MAIL FROM (450 "Domain not
# found") et plus aucune verification n'aboutit. datallem.fr n'existe pas
# (ni A ni MX) -> ne jamais l'utiliser ici.
DEFAULT_PROBE_SENDER = "postmaster@google.com"

# Un rejet RCPT (550) ne signifie PAS toujours "boite inexistante". Beaucoup de
# serveurs rejettent notre IP de sonde pour des raisons de politique/anti-spam.
# Ces motifs signalent un rejet NON concluant -> 'risky', jamais 'invalid'.
_REJECT_HINTS = (
    "blacklist", "blocked", "blocklist", "spamhaus", "spamcop", "barracuda",
    "policy", "denied", "not permitted", "helo", "reputation",
    "unavailable", "try again", "temporar", "greylist", "spf", "dkim", "dmarc",
    "authenticat", "rate limit", "too many",
)
# Motifs qui, au contraire, prouvent l'inexistence de la boite. Verifies en
# premier : "user unknown" doit primer sur tout autre indice.
_UNKNOWN_HINTS = (
    "unknown user", "user unknown", "no such user", "recipient unknown",
    "recipient not found", "does not exist", "mailbox not found",
    "mailbox unavailable", "invalid recipient", "user not found",
    "no mailbox", "not a valid",
)


def _classify_reject(msg: str) -> str:
    """Resout un rejet RCPT : 'invalid' si la boite est prouvee inexistante,
    sinon 'risky' (rejet non concluant : politique, IP bloquee, etc.)."""
    m = msg.lower()
    if any(h in m for h in _UNKNOWN_HINTS):
        return "invalid"
    return "risky"  # y compris les rejets _REJECT_HINTS et non motives


def _probe_rcpt(host: str, email: str, sender: str):
    """Sonde RCPT TO sur un MX. Retourne (True|False|None, message).

    Contrairement a _smtp_check (signature partagee et figee), on garde ici le
    texte du serveur : il faut le lire pour distinguer une boite inexistante
    d'un rejet de politique/IP.
    """
    import smtplib
    try:
        with smtplib.SMTP(host, 25, timeout=12) as smtp:
            smtp.ehlo_or_helo_if_needed()
            code, _msg = smtp.mail(sender)
            if code >= 400:
                return None, f"MAIL FROM refusee ({code})"
            code, msg = smtp.rcpt(email)
            text = (msg or b"").decode("utf-8", "replace")
            if code == 250:
                return True, text
            if code in (550, 551, 553):
                return False, text
            return None, text  # 4xx, 421... : indetermine
    except (OSError, smtplib.SMTPException) as e:
        return None, type(e).__name__


def _is_gateway_mx(mx_hosts) -> bool:
    joined = " ".join(mx_hosts).lower()
    return any(marker in joined for marker in GATEWAY_MX_MARKERS)


def _check(email: str, smtp_enabled: bool, sender: str = DEFAULT_PROBE_SENDER) -> str:
    """(thread) Retourne verified / risky / invalid. Aucune ecriture ici."""
    email = email.strip().lower()
    if not EMAIL_REGEX.match(email):
        return "invalid"
    domain = email.split("@", 1)[1]
    if domain in CATCH_ALL_DOMAINS:
        return "risky"
    mx_hosts = get_mx_records(domain)
    if not mx_hosts:
        return "invalid"
    if smtp_enabled and not _is_gateway_mx(mx_hosts):
        for mx in mx_hosts[:2]:
            ok, msg = _probe_rcpt(mx, email, sender)
            if ok is True:
                return "verified"
            if ok is False:
                # Un 550 ne suffit pas : on lit le motif avant de condamner.
                return _classify_reject(msg)
            # ok None : indetermine, on tente le MX suivant puis 'risky'
    # MX present mais non confirmable (gateway, timeout, pas de SMTP) : plausible
    return "risky"


def _count_found(crm) -> int:
    """Nombre de contacts 'found' avec une adresse (sans charger les lignes)."""
    return crm._fetch_one(
        "SELECT count(*) n FROM contacts WHERE email_status = 'found' "
        "AND email IS NOT NULL AND email <> ''")["n"]


def _windows(crm, size: int, total: int):
    """Genere des fenetres de contacts 'found' (memoire bornee).

    On re-scanne depuis le debut a chaque fenetre en excluant les deja traites
    par leur statut : les lignes ecrites passent a verified/risky/invalid et
    sortent naturellement du filtre 'found'. Pas d'OFFSET qui deriverait.
    """
    seen = 0
    while seen < total:
        batch = crm._fetch_all(
            "SELECT * FROM contacts WHERE email_status = 'found' "
            "AND email IS NOT NULL AND email <> '' ORDER BY id LIMIT ?", (size,))
        if not batch:
            return
        seen += len(batch)
        yield batch


def smtp_available() -> bool:
    """Teste si le port 25 est joignable (sinon on se rabat sur le MX)."""
    import socket
    for host in ("gmail-smtp-in.l.google.com", "mx1.ovh.net"):
        try:
            with socket.create_connection((host, 25), timeout=5):
                return True
        except OSError:
            continue
    return False


def mx_available() -> bool:
    """Vrai si la resolution MX fonctionne reellement (dnspython installe).

    Sans cette garde, un environnement sans dnspython ferait retourner []
    pour tout domaine et marquerait TOUS les emails 'invalid'.
    """
    try:
        import dns.resolver  # noqa: F401
    except ImportError:
        return False
    return bool(get_mx_records("gmail.com"))


def _smtp_probe_works(sender: str) -> bool:
    """Verifie que MAIL FROM est accepte sur un serveur reel (bx, gmail).

    Sans cela, un expediteur non resolvable ferait echouer toutes les sondes
    et marquerait tout 'risky' sans verification effective.
    """
    import smtplib
    for host in ("mx1.ovh.net", "gmail-smtp-in.l.google.com"):
        try:
            with smtplib.SMTP(host, 25, timeout=8) as smtp:
                smtp.ehlo_or_helo_if_needed()
                code, _ = smtp.mail(sender)
                if code == 250:
                    return True
        except (OSError, smtplib.SMTPException):
            continue
    return False


def main() -> int:
    ap = argparse.ArgumentParser(description="Verification des emails du CRM")
    ap.add_argument("--limit", type=int, default=0, help="0 = tous")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--no-smtp", action="store_true", help="MX seulement")
    ap.add_argument("--sender", default=DEFAULT_PROBE_SENDER,
                    help="adresse MAIL FROM des sondes RCPT (domaine resolvable)")
    ap.add_argument("--stats", action="store_true")
    args = ap.parse_args()

    crm = CRM()
    if args.stats:
        for row in crm._fetch_all(
                "SELECT email_status s, count(*) n FROM contacts "
                "WHERE email IS NOT NULL AND email<>'' GROUP BY s ORDER BY n DESC"):
            log.info(f"  {row['s'] or '-':<10}: {row['n']}")
        crm.close()
        return 0

    # Garde-fou : sans resolution MX, tout email serait marque 'invalid' a tort.
    # On refuse de lancer plutot que de corrompre le CRM.
    if not mx_available():
        log.error("Resolution MX indisponible (dnspython absent ou DNS KO) : "
                  "verification annulee. Installer dnspython avant de relancer.")
        crm.close()
        return 1

    smtp_enabled = not args.no_smtp and smtp_available()
    if not smtp_enabled:
        log.warning("SMTP (port 25) injoignable : verification MX uniquement. "
                    "Les adresses valides seront marquees 'risky', jamais 'invalid'.")
    elif not _smtp_probe_works(args.sender):
        # L'expediteur est rejete par les serveurs : aucune sonde ne pourra
        # aboutir. On se rabat sur le MX plutot que de tout marquer 'risky'
        # sans le dire.
        log.warning(f"Expediteur {args.sender} rejete par les serveurs (MAIL FROM) : "
                    "verification MX uniquement. Utiliser --sender <adresse valide>.")
        smtp_enabled = False

    if args.limit:
        total = min(args.limit, _count_found(crm))
    else:
        total = _count_found(crm)
    if not total:
        log.info("Aucun contact au statut 'found' a verifier.")
        crm.close()
        return 0
    log.info(f"{total} contacts a verifier ({args.workers} workers, "
             f"SMTP={'on' if smtp_enabled else 'off'})")

    counters = {"verified": 0, "risky": 0, "invalid": 0}
    t0 = time.time()
    last_log = time.time()
    done = 0

    # Traitement par fenetres : on ne materialise jamais toute la table (17k+
    # lignes en memoire provoquait un MemoryError). Chaque fenetre est soumise
    # au pool, ecrite, puis liberee.
    window = args.workers * 20
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for batch in _windows(crm, window, total):
            futures = {pool.submit(_check, c["email"], smtp_enabled, args.sender): c
                       for c in batch}
            for fut in as_completed(futures):
                contact = futures[fut]
                try:
                    status = fut.result()
                except Exception as e:  # noqa: BLE001 - non fatal
                    log.warning(f"Verification en echec {contact['email']}: {e}")
                    status = "risky"
                crm.set_contact_status(contact["id"], status)
                counters[status] += 1
                done += 1
                if time.time() - last_log > 10:
                    rate = done / max(time.time() - t0, 1e-6)
                    log.info(f"progression {done}/{total} | "
                             f"verified={counters['verified']} risky={counters['risky']} "
                             f"invalid={counters['invalid']} | {rate:.1f}/s | "
                             f"threads={threading.active_count()}")
                    last_log = time.time()
    elapsed = time.time() - t0
    log.success(f"Termine en {elapsed/60:.1f} min : {counters['verified']} verifies, "
                f"{counters['risky']} plausibles, {counters['invalid']} invalides")
    crm.close()
    return 0


if __name__ == "__main__":
    _force_utf8_console()
    sys.exit(main())
