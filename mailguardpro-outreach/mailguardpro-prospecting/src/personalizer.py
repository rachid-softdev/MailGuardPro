"""
Étape 4 : Personnalisation et rédaction des emails initiaux.
Pour chaque entreprise enrichie sans message, analyse le texte du site
(événement site_analysis) et génère un email personnalisé (LLM) stocké
comme brouillon dans le CRM.
"""

from typing import Dict, List, Optional

from .config import get_env_bool, is_heuristic, load_campaigns, load_icp, load_prompt
from .crm import CRM, MSG_DRAFT
from .heuristics import email_insight, fill_template
from .llm import chat_json
from .utils import log


def _market_lang(company: Dict) -> str:
    """Langue de rédaction de l'email selon le marché de l'entreprise (fr par défaut)."""
    market_code = company.get("market") or "fr"
    market = next((m for m in load_icp().get("markets", [])
                   if m.get("code") == market_code), {})
    return market.get("email_lang") or market.get("lang") or "fr"


def _get_site_text(crm: CRM, company_id: int) -> str:
    events = crm.get_events(company_id)
    for ev in events:
        if ev["type"] == "site_analysis" and ev["payload"]:
            import json as _json
            try:
                payload = _json.loads(ev["payload"])
                return str(payload.get("text", ""))[:3000]
            except Exception:  # noqa: BLE001
                return ""
    return ""


def _template_email(company: Dict, contact: Dict, lang: str,
                    campaigns: Dict) -> Dict:
    """Brouillon local basé sur le template de campagne (sans LLM)."""
    template = (campaigns.get(f"email_template_{lang}")
                or campaigns.get("email_template") or {})
    insight, relevance = email_insight(company, lang)
    offer = campaigns.get("offer", {})
    values = {
        "first_name": (contact.get("first_name")
                       or ("l'équipe" if lang == "fr" else "team")),
        "company_name": (company.get("name") or company.get("domain") or "").rstrip("."),
        "personal_insight": insight,
        "personal_relevance": relevance,
        "cta": ("Testez gratuitement vos 100 premiers emails" if lang == "fr"
                else "Test 100 checks for free"),
        "cta_url": offer.get("cta_url") or "https://mailguard.pro",
        "sender_name": ("L'équipe MailGuard Pro" if lang == "fr"
                        else "The MailGuard Pro team"),
    }
    return fill_template(template, values)


def _build_context(company: Dict, contact: Dict, site_text: str) -> str:
    lang = _market_lang(company)
    lines = [
        f"Entreprise: {company.get('name')}",
        f"Domaine: {company.get('domain')}",
        f"Secteur: {company.get('sector') or 'inconnu'}",
        f"Ville: {company.get('city') or 'inconnue'}",
        f"Marché: {company.get('market') or 'fr'}",
        f"Langue de l'email: {lang}",
        f"Contact: {contact.get('full_name') or 'inconnu'} ({contact.get('function') or 'fonction inconnue'})",
        f"Score de qualification: {company.get('score')}/100",
        "--- Analyse du site web ---",
        site_text or "(analyse du site non disponible)",
    ]
    return "\n".join(lines)


def personalize(crm: CRM, limit: int = 10,
                company_ids: Optional[List[int]] = None) -> Dict:
    """Génère les brouillons d'emails initiaux. Retourne {drafted, errors, skipped}."""
    campaigns = load_campaigns()
    prompt = load_prompt("personalization")

    companies = crm.get_enriched_companies_without_message(
        limit=limit, company_ids=company_ids)
    if not companies:
        log.info("Aucune entreprise à personnaliser")
        return {"drafted": 0, "errors": 0, "skipped": 0}

    drafted = errors = skipped = 0

    for company in companies:
        contact = crm.get_best_contact(company["id"])
        if not contact or not contact.get("email"):
            skipped += 1
            log.warning(f"⏭️ {company['name']}: aucun contact avec email, brouillon ignoré")
            continue

        site_text = _get_site_text(crm, company["id"])
        lang = _market_lang(company)

        if is_heuristic():
            result = _template_email(company, contact, lang, campaigns)
            log.info(f"🧮 Brouillon template: {company['name']} -> {contact['email']}")
        else:
            context = _build_context(company, contact, site_text)
            log.info(f"✍️ Personnalisation: {company['name']} -> {contact['email']}")
            result = chat_json(prompt, context, temperature=0.7)
            if not result or not result.get("body"):
                if get_env_bool("LLM_FALLBACK_HEURISTIC", True):
                    result = _template_email(company, contact, lang, campaigns)
                    log.warning(f"LLM indisponible, brouillon template pour {company['domain']}")
                else:
                    errors += 1
                    log.warning(f"Échec rédaction pour {company['domain']}")
                    continue

        subject = str(result.get("subject", ""))[:100]
        body = str(result.get("body", "")).strip()

        # Remplit les variables du template si présentes dans le prompt
        body = body.replace("{{first_name}}", contact.get("first_name") or "")
        body = body.replace("{{company_name}}", company.get("name") or "")
        subject = subject.replace("{{company_name}}", company.get("name") or "")

        crm.add_message(company["id"], contact["id"], sequence=1, subject=subject, body=body)
        crm.add_event(company["id"], "email_drafted", {"sequence": 1})
        drafted += 1
        log.debug(f"📝 Brouillon: {subject}")

    summary = {"drafted": drafted, "errors": errors, "skipped": skipped}
    log.success(f"Personnalisation: {drafted} brouillons créés ({skipped} sans email)")
    return summary
