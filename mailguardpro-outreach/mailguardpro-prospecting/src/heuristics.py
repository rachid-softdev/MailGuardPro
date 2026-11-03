"""Rédaction locale de secours (sans LLM) pour la prospection.

Utilisée quand ``LLM_PROVIDER=heuristic`` ou quand l'IA du VPS est
indisponible. Les emails restent spécifiques au secteur et à l'entreprise,
mais sont volontairement simples : ils doivent être relus avant envoi.
"""

from typing import Dict, Tuple


def email_insight(company: Dict, lang: str) -> Tuple[str, str]:
    """Retourne (accroche, pertinence) selon le secteur de l'entreprise."""
    sector = " ".join(str(company.get(k) or "")
                      for k in ("sector", "description")).lower()

    if lang == "en":
        if any(k in sector for k in ("cold", "outbound", "lead gen", "lead generation")):
            return (
                "You run cold email and lead generation campaigns for your clients.",
                "Before each campaign, validating the list prevents bounces and "
                "protects your clients' domains.",
            )
        if any(k in sector for k in ("email marketing", "newsletter", "klaviyo",
                                     "hubspot", "mailchimp")):
            return (
                "You manage newsletters and email automations for your clients.",
                "Disposable and catch-all addresses are the main source of bounces "
                "on this kind of list.",
            )
        if "saas" in sector:
            return (
                "Your SDRs add new leads to sequences every week.",
                "Protecting your domain reputation starts with validating each "
                "address before it enters the sequence.",
            )
        if any(k in sector for k in ("e-commerce", "ecommerce", "shopify")):
            return (
                "Your retention campaigns depend on clean subscriber lists.",
                "Invalid addresses quietly increase bounces and hurt newsletter "
                "deliverability.",
            )
        return (
            f"Your activity ({company.get('sector') or 'B2B marketing'}) relies on "
            "regular email campaigns.",
            "A quality score before sending helps reduce bounces and protect your domain.",
        )

    if any(k in sector for k in ("cold", "outbound", "lead gen", "lead generation")):
        return (
            "Vous gérez des campagnes de cold email et de génération de leads pour vos clients.",
            "Avant chaque campagne, valider les listes évite les bounces et protège "
            "les domaines de vos clients.",
        )
    if any(k in sector for k in ("email marketing", "newsletter", "klaviyo",
                                 "hubspot", "mailchimp")):
        return (
            "Vous pilotez des newsletters et des automatisations email pour vos clients.",
            "Les adresses jetables et les catch-all sont la première cause de bounces "
            "sur ce type de liste.",
        )
    if "saas" in sector:
        return (
            "Vos SDR ajoutent régulièrement de nouveaux leads dans vos séquences.",
            "Protéger la réputation de votre domaine commence par valider chaque "
            "adresse avant l'ajout.",
        )
    if any(k in sector for k in ("e-commerce", "ecommerce", "shopify")):
        return (
            "Vos campagnes de rétention reposent sur des listes d'abonnés propres.",
            "Les adresses invalides augmentent les bounces et dégradent la "
            "délivrabilité de vos newsletters.",
        )
    return (
        f"Votre activité ({company.get('sector') or 'marketing B2B'}) repose sur "
        "des campagnes email régulières.",
        "Un score de qualité avant l'envoi permet de réduire les bounces et de "
        "protéger votre domaine.",
    )


def fill_template(template: Dict, values: Dict) -> Dict:
    """Remplace les variables ``{{clé}}`` d'un template email."""
    subject = str(template.get("subject") or "")
    body = str(template.get("body") or "")
    for key, value in values.items():
        subject = subject.replace("{{" + key + "}}", str(value))
        body = body.replace("{{" + key + "}}", str(value))
    return {"subject": subject.strip(), "body": body.strip()}
