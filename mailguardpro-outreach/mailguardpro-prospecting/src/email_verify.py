"""
Vérification d'emails gratuite : DNS MX (dnspython) + handshake SMTP RCPT.

Retourne un statut :
  "verified"  - le serveur mail accepte l'adresse (RCPT 250)
  "risky"     - serveur injoignable ou protégé, adresse plausible (MX OK)
  "invalid"   - MX absent ou rejet explicite
"""

import re
import smtplib
import socket
from typing import List, Optional
from urllib.parse import unquote

from .utils import log

EMAIL_REGEX = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
# Validation stricte après nettoyage (un email publié ne contient pas d'espace)
STRICT_EMAIL_REGEX = re.compile(
    r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")


def _sanitize_email(email: str) -> str:
    """Nettoie un email extrait brut.

    Le HTML contient souvent des adresses encodées en URL ; la regex acceptant
    le '%' dans la partie locale, la recherche brute produit des artefacts du
    type "%20contact@domaine.fr". On décode donc les séquences puis on n'accepte
    que les adresses strictement valides.
    """
    cleaned = unquote(email).strip()
    return cleaned if STRICT_EMAIL_REGEX.match(cleaned) else ""


# Fin de numéro de téléphone collée devant l'email dans le HTML :
# "Tél 05 46 85 58 40contact@x.fr" -> la regex capture "40contact@x.fr".
_TRAILING_PHONE = re.compile(r"\d[\d\s.\-()]*\s*$")
_MIN_LOCAL_AFTER_STRIP = 4


def _strip_phone_prefix(email: str, preceding: str) -> str:
    """Retire les chiffres d'un numéro de téléphone collés devant un email.

    Les pages affichent souvent le téléphone juste avant l'adresse
    ("06 82 64 59 51contact@…") : sans séparateur, la regex inclut la fin du
    numéro dans la partie locale. On ne nettoie que si l'email est précédé d'un
    numéro ET que l'adresse restante est plausible (garde-fou contre les
    adresses légitimes commençant par des chiffres, ex. "24h@…").
    """
    local, sep, domain = email.partition("@")
    if not sep or not re.match(r"^\d+", local):
        return email
    if not _TRAILING_PHONE.search(preceding):
        return email
    trimmed = re.sub(r"^\d+", "", local)
    if len(trimmed) < _MIN_LOCAL_AFTER_STRIP:
        return email
    repaired = f"{trimmed}@{domain}"
    return repaired if STRICT_EMAIL_REGEX.match(repaired) else email

SMTP_TIMEOUT = 10
# Domaines connus pour accepter tout (génèrent des faux positifs RCPT)
CATCH_ALL_DOMAINS = {"gmail.com", "outlook.com", "hotmail.com", "yahoo.com",
                     "protonmail.com", "icloud.com", "live.com", "msn.com"}


def extract_emails(text: str, context: str = "") -> List[str]:
    """Extrait les emails d'un texte brut, filtrés par contexte de domaine."""
    text = text or ""
    emails = set()
    for match in EMAIL_REGEX.finditer(text):
        cleaned = _sanitize_email(match.group(0))
        if not cleaned:
            continue
        emails.add(_strip_phone_prefix(cleaned, text[max(0, match.start() - 40):match.start()]))
    if not emails:
        return []
    if context:
        ctx_domain = re.sub(r"https?://", "", context).split("/")[0].lower()
        if ctx_domain:
            emails = {e for e in emails if e.lower().endswith(f"@{ctx_domain}")}
    return sorted(emails)


def get_mx_records(domain: str) -> List[str]:
    """Retourne les serveurs MX d'un domaine (ou [] si aucun)."""
    try:
        import dns.resolver
        answers = dns.resolver.resolve(domain, "MX", lifetime=5)
        return sorted(
            (r.exchange.to_text().rstrip(".") for r in answers),
            key=lambda x: getattr(x, "preference", 0),
        )
    except ImportError:
        log.warning("dnspython non installé - vérification MX ignorée")
        return []
    except Exception:  # noqa: BLE001 - NXDOMAIN, timeout, etc.
        return []


def _smtp_check(host: str, email: str, sender: str) -> Optional[bool]:
    """Vérifie RCPT TO sur un serveur MX. Retourne True/False/None (indéterminé)."""
    try:
        with smtplib.SMTP(host, 25, timeout=SMTP_TIMEOUT) as smtp:
            smtp.ehlo_or_helo_if_needed()
            code, _ = smtp.mail(sender)
            if code != 250:
                return None
            code, _ = smtp.rcpt(email)
            if code == 250:
                return True
            if code in (550, 551, 553):
                return False
            return None
    except (socket.timeout, ConnectionRefusedError, OSError, smtplib.SMTPException):
        return None


def verify_email(email: str) -> str:
    """
    Vérifie un email. Statuts : "verified", "risky", "invalid".
    Les domaines de messagerie grand public (catch-all) sont marqués "risky".
    """
    email = email.strip().lower()
    if not EMAIL_REGEX.match(email):
        return "invalid"
    domain = email.split("@")[1]

    if domain in CATCH_ALL_DOMAINS:
        return "risky"

    mx_hosts = get_mx_records(domain)
    if not mx_hosts:
        return "invalid"

    # Uniquement les hébergeurs disposant de MX (email pro plausible)
    for mx in mx_hosts[:2]:
        result = _smtp_check(mx, email, "verify@mailguard.pro")
        if result is True:
            return "verified"
        if result is False:
            return "invalid"
    return "risky"
