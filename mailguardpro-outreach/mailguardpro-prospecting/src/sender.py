"""
Étape 5 : Envoi des emails via Resend (API REST).
Respecte le quota quotidien, les délais aléatoires anti-spam et le mode DRY_RUN.
"""

import random
import time
from typing import Dict, List, Optional

import requests

from .config import get_env, get_env_int, is_dry_run
from .crm import CRM, MSG_DRAFT, MSG_FAILED, MSG_SENT, STATUS_CONTACTED
from .utils import log

RESEND_URL = "https://api.resend.com/emails"


class SendResult:
    def __init__(self, sent: int = 0, failed: int = 0, skipped: int = 0):
        self.sent = sent
        self.failed = failed
        self.skipped = skipped


def get_sender() -> str:
    sender_email = get_env("SENDER_EMAIL")
    sender_name = get_env("SENDER_NAME", "MailGuard Pro")
    if not sender_email:
        raise ValueError("SENDER_EMAIL non configurée dans .env")
    return f"{sender_name} <{sender_email}>"


def _signature() -> str:
    return (get_env("SENDER_SIGNATURE")
            or "L'équipe MailGuard Pro\nhttps://mailguard.pro")


def _footer(market: Optional[str]) -> str:
    """Mention de désinscription, dans la langue du marché."""
    if (market or "fr").lower() == "en":
        return (
            "\n\n---\n"
            "You're receiving this email because your work involves B2B email "
            "marketing. To stop receiving emails, reply STOP or write to "
            "unsubscribe@mailguard.pro."
        )
    return (
        "\n\n---\n"
        "Vous recevez cet email car votre activité est liée à l'email marketing "
        "B2B. Pour ne plus être contacté, répondez STOP ou écrivez à "
        "unsubscribe@mailguard.pro."
    )


def _build_body(body: str, market: Optional[str]) -> str:
    return f"{body.rstrip()}\n\n{_signature()}{_footer(market)}"


def _send_via_resend(to: str, subject: str, body: str) -> Optional[str]:
    """Envoie via Resend. Retourne l'id Resend ou None en cas d'échec."""
    api_key = get_env("RESEND_API_KEY")
    if not api_key:
        log.error("RESEND_API_KEY non configurée")
        return None
    unsubscribe = get_env("UNSUBSCRIBE_EMAIL", "unsubscribe@mailguard.pro")
    payload = {
        "from": get_sender(),
        "to": [to],
        "subject": subject,
        "text": body,
        "reply_to": get_env("SENDER_EMAIL"),
        "headers": {
            "List-Unsubscribe": f"<mailto:{unsubscribe}?subject=STOP>",
        },
    }
    resp = requests.post(
        RESEND_URL,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=payload,
        timeout=30,
    )
    if resp.status_code not in (200, 201):
        log.error(f"Resend HTTP {resp.status_code}: {resp.text[:300]}")
        return None
    data = resp.json()
    return data.get("id")


def _drafts_to_send(crm: CRM, limit: int) -> List[Dict]:
    """Brouillons (initiaux + relances) triés par ordre d'ancienneté de création.

    On exclut les contacts dont l'email est 'invalid' (boite inexistante
    confirmee) : leur envoyer un message produirait un bounce et abimerait la
    reputation du domaine expediteur.
    """
    rows = crm._fetch_all(
        """SELECT m.*, c.email AS contact_email, c.first_name AS contact_first_name,
                  c.email_status AS contact_email_status,
                  co.name AS company_name, co.domain AS company_domain,
                  co.market AS company_market
           FROM messages m
           JOIN contacts c ON c.id = m.contact_id
           JOIN companies co ON co.id = m.company_id
           WHERE m.status = ? AND c.email_status <> 'invalid'
           ORDER BY m.id ASC LIMIT ?""",
        (MSG_DRAFT, limit),
    )
    return rows


def send_pending(crm: CRM, dry_run: Optional[bool] = None) -> SendResult:
    """Envoie tous les brouillons dans la limite du quota quotidien."""
    dry_run = is_dry_run() if dry_run is None else dry_run
    daily_limit = get_env_int("DAILY_SEND_LIMIT", 20)
    min_delay = get_env_int("MIN_DELAY_SECONDS", 30)
    max_delay = get_env_int("MAX_DELAY_SECONDS", 90)

    sent_today = crm.count_messages_sent_today()
    remaining = max(0, daily_limit - sent_today)
    if remaining == 0:
        log.warning(f"Quota quotidien atteint ({daily_limit}), aucun envoi aujourd'hui")
        return SendResult(skipped=1)

    drafts = _drafts_to_send(crm, remaining)
    if not drafts:
        log.info("Aucun brouillon à envoyer")
        return SendResult()

    log.info(f"✉️ {len(drafts)} brouillons à envoyer (quota restant: {remaining}, "
             f"déjà envoyés aujourd'hui: {sent_today})")
    if dry_run:
        log.warning("🔒 DRY_RUN actif : rien ne sera réellement envoyé")

    result = SendResult()

    for draft in drafts:
        contact_email = draft.get("contact_email")
        if not contact_email:
            crm.mark_message_failed(draft["id"], "contact sans email")
            result.skipped += 1
            continue

        if dry_run:
            log.info(f"🔒 [DRY_RUN] -> {contact_email}: {draft['subject'][:80]}")
            result.sent += 1
            time.sleep(0.5)
            continue

        log.info(f"✉️ Envoi -> {contact_email}: {draft['subject'][:80]}")
        body = _build_body(draft["body"], draft.get("company_market"))
        resend_id = _send_via_resend(contact_email, draft["subject"], body)
        if resend_id:
            crm.mark_message_sent(draft["id"], resend_id)
            crm.set_company_status(draft["company_id"], STATUS_CONTACTED)
            crm.add_event(draft["company_id"], "email_sent",
                          {"message_id": draft["id"], "sequence": draft["sequence"],
                           "to": contact_email, "resend_id": resend_id})
            result.sent += 1
        else:
            crm.mark_message_failed(draft["id"], "erreur Resend")
            crm.add_event(draft["company_id"], "email_send_failed",
                          {"message_id": draft["id"], "to": contact_email})
            result.failed += 1

        if result.sent < len(drafts):
            delay = random.uniform(min_delay, max_delay)
            log.debug(f"Délai de {delay:.0f}s avant le prochain envoi")
            time.sleep(delay)

    log.success(f"Envoi: {result.sent} envoyés, {result.failed} échecs, {result.skipped} ignorés"
                + (" (DRY_RUN)" if dry_run else ""))
    return result
