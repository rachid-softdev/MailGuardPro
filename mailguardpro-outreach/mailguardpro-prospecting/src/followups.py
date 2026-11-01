"""
Étape 6 : Relances automatiques (J+3).
Pour les entreprises contactées sans réponse depuis N jours, génère une
relance personnalisée (LLM) stockée comme brouillon — envoyée par sender.py.
S'arrête automatiquement après max_emails_per_company messages.
"""

import json
from typing import Dict

from .config import (get_env_bool, get_env_int, is_heuristic,
                     load_campaigns, load_icp, load_prompt)
from .crm import CRM, MSG_DRAFT
from .heuristics import email_insight, fill_template
from .llm import chat_json
from .utils import log


def _market_lang(company: Dict) -> str:
    market_code = company.get("market") or "fr"
    market = next((m for m in load_icp().get("markets", [])
                   if m.get("code") == market_code), {})
    return market.get("email_lang") or market.get("lang") or "fr"


def _company_site_text(crm: CRM, company_id: int) -> str:
    for ev in crm.get_events(company_id):
        if ev["type"] == "site_analysis" and ev["payload"]:
            try:
                payload = json.loads(ev["payload"])
                return str(payload.get("text", ""))[:1500]
            except Exception:  # noqa: BLE001
                pass
    return ""


def _template_followup(company: Dict, contact: Dict, prev_subject: str,
                       lang: str, campaigns: Dict) -> Dict:
    """Relance locale basée sur le template de campagne (sans LLM)."""
    template = (campaigns.get(f"followup_template_{lang}")
                or campaigns.get("followup_template") or {})
    insight, _ = email_insight(company, lang)
    offer = campaigns.get("offer", {})
    values = {
        "first_name": (contact.get("first_name")
                       or ("l'équipe" if lang == "fr" else "team")),
        "company_name": (company.get("name") or company.get("domain") or "").rstrip("."),
        "personal_insight": insight,
        "personal_relevance": "",
        "cta": ("Testez gratuitement vos 100 premiers emails" if lang == "fr"
                else "Test 100 checks for free"),
        "cta_url": offer.get("cta_url") or "https://mailguard.pro",
        "sender_name": ("L'équipe MailGuard Pro" if lang == "fr"
                        else "The MailGuard Pro team"),
    }
    result = fill_template(template, values)
    if not result.get("subject"):
        result["subject"] = "Re: " + (prev_subject or company.get("name") or "")
    return result


def generate_followups(crm: CRM, followup_days: int = 3, limit: int = 20) -> Dict:
    """Génère les brouillons de relance. Retourne {drafted, errors, skipped}."""
    campaigns = load_campaigns()
    prompt = load_prompt("followup")
    max_sequence = get_env_int("MAX_EMAILS_PER_COMPANY", 2)
    if max_sequence <= 0:
        max_sequence = campaigns.get("max_emails_per_company", 2)

    pending = crm.get_pending_followups(followup_days, max_sequence, limit=limit)
    if not pending:
        log.info("Aucune relance due")
        return {"drafted": 0, "errors": 0, "skipped": 0}

    drafted = errors = 0
    for company in pending:
        contact = crm.get_contact(company["last_contact_id"]) if company.get("last_contact_id") else None
        if not contact:
            errors += 1
            continue

        previous = crm.get_messages_for_company(company["id"])
        prev_subject = previous[-1]["subject"] if previous else ""
        site_text = _company_site_text(crm, company["id"])
        lang = _market_lang(company)

        if is_heuristic():
            result = _template_followup(company, contact, prev_subject, lang, campaigns)
            log.info(f"🧮 Relance template pour {company['name']} "
                     f"(sequence {company['last_sequence'] + 1})")
        else:
            context = "\n".join([
                f"Entreprise: {company.get('name')}",
                f"Domaine: {company.get('domain')}",
                f"Langue de l'email: {lang}",
                f"Contact: {contact.get('full_name') or 'inconnu'}",
                f"Objet du premier email: {prev_subject}",
                "Extrait du site:",
                site_text or "(indisponible)",
            ])
            log.info(f"🔁 Relance pour {company['name']} "
                     f"(sequence {company['last_sequence'] + 1})")
            result = chat_json(prompt, context, temperature=0.7)
            if not result or not result.get("body"):
                if get_env_bool("LLM_FALLBACK_HEURISTIC", True):
                    result = _template_followup(company, contact, prev_subject, lang, campaigns)
                    log.warning(f"LLM indisponible, relance template pour {company['domain']}")
                else:
                    errors += 1
                    log.warning(f"Échec rédaction relance {company['domain']}")
                    continue

        subject = str(result.get("subject", "Re: " + prev_subject))[:100]
        body = str(result.get("body", "")).strip()
        body = body.replace("{{first_name}}", contact.get("first_name") or "")
        body = body.replace("{{company_name}}", company.get("name") or "")

        crm.add_message(company["id"], contact["id"],
                        sequence=company["last_sequence"] + 1, subject=subject, body=body)
        crm.add_event(company["id"], "followup_drafted",
                      {"sequence": company["last_sequence"] + 1})
        drafted += 1

    summary = {"drafted": drafted, "errors": errors, "skipped": len(pending) - drafted - errors}
    log.success(f"Relances: {drafted} brouillons générés")
    return summary
