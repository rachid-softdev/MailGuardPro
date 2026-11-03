"""
Étape 3 : Enrichissement des décideurs.
Pour chaque entreprise qualifiée :
  1. Récolte HTTP du HTML source (home + pages contact/equipes) -> emails génériques
  2. Recherche Google des décideurs (CEO, fondateur, marketing...) + LinkedIn
  3. Inférence d'emails pro (firstname.lastname@domaine)
  4. Vérification DNS MX + SMTP
Tout est enregistré dans le CRM (contacts + email_status).
"""

import re
from typing import Dict, List, Optional

from .config import load_icp
from .crm import CRM, STATUS_ENRICHED
from .email_verify import verify_email
from .google_search import GoogleSearcher
from .site_harvest import harvest_site_emails
from .utils import log

FUNCTION_KEYWORDS = [
    "ceo", "p-dg", "pdg", "fondateur", "co-founder", "founder", "directeur",
    "head of", "cmo", "cto", "cfo", "marketing", "commercial", "digital",
    "managing director", "président", "president", "gerant", "gérant",
    "growth", "revops", "revenue operations", "sales ops", "sales operations",
    "demand gen", "demand generation", "email marketing", "head of marketing",
    "business development", "partnerships", "associé", "associate", "partner",
]

# Mots génériques qui ne sont jamais un nom de personne
GENERIC_NAME_WORDS = {
    "site", "web", "agence", "seo", "référencement", "referencement", "marketing",
    "digital", "contact", "accueil", "entreprise", "societe", "société",
    "boutique", "les", "le", "la", "top", "meilleures", "meilleurs", "best",
    "annuaire", "index", "home", "page", "linkedin", "in", "fr", "com", "www",
    "cold", "email", "outbound", "growth", "revops", "saas", "agency", "agence",
    "consultant", "expert", "studio",
}

# Nombre max d'entreprises enrichies par run
MAX_ENRICH_PER_RUN = 5
MAX_CONTACTS_PER_COMPANY = 3

# Mots-clés d'un email générique privilégié (contact@, info@, hello@...)
GENERIC_EMAIL_KEYWORDS = (
    "contact", "info", "hello", "bonjour", "enquiries", "enquiry",
    "sales", "team", "office", "agence",
)

# Adresses de rôle non commerciales : inutiles (voire contre-productives)
# pour une prise de contact. On les ignore dès la collecte.
NON_SALES_EMAIL_KEYWORDS = (
    "security", "privacy", "legal", "abuse", "postmaster", "webmaster",
    "noreply", "no-reply", "donotreply", "do-not-reply", "jobs", "careers",
    "recrutement", "press", "media", "support", "help", "billing",
    "accounts", "finance", "gdpr", "dpo", "compliance", "spam",
    "hostmaster", "unsubscribe", "newsletter", "people",
)

# Parties locales courtes à comparer exactement (évite de bloquer "prabesh@").
NON_SALES_EMAIL_EXACT = {"pr"}


def _is_non_sales_email(email: str) -> bool:
    """True si l'adresse est un rôle technique/non commercial."""
    local = (email or "").split("@", 1)[0].lower()
    return local in NON_SALES_EMAIL_EXACT or any(
        keyword in local for keyword in NON_SALES_EMAIL_KEYWORDS)


class Enricher:
    def __init__(self, searcher: Optional[GoogleSearcher] = None):
        self._own_searcher = searcher is None
        self.searcher = searcher or GoogleSearcher()

    def close(self):
        if self._own_searcher:
            self.searcher.close()

    # ------------------------------------------------------------ visite site

    def _collect_emails_from_site(self, url: str) -> "tuple[List[Dict], str]":
        """Emails génériques trouvés dans le HTML source + texte de la home.

        Collecte 100% HTTP (requests + BeautifulSoup), sans Selenium :
        home puis pages utiles (contact, équipe, mentions légales...).
        """
        result = harvest_site_emails(url)
        if result["foreign"]:
            log.debug(f"Emails hors-domaine ignorés sur {url}: "
                      f"{', '.join(result['foreign'])}")
        emails = [e for e in result["emails"]
                  if not _is_non_sales_email(e.get("email", ""))]
        return emails, result["home_text"]

    # --------------------------------------------------------- décideurs

    def _search_decision_makers(self, company: Dict, icp: Dict) -> List[Dict]:
        """Recherche les décideurs via Google/DDG (nom + fonction + LinkedIn)."""
        market_code = company.get("market") or "fr"
        market = next((m for m in icp.get("markets", [])
                       if m.get("code") == market_code), {})
        icp_functions = (market.get("decision_maker_functions")
                         or icp.get("decision_maker_functions", []))
        functions = icp_functions[:5]  # limite de coût
        candidates: List[Dict] = []
        seen_names = set()

        queries = []
        for func in functions:
            queries.append(f'"{company["name"]}" {func}')
        queries.append(f'{company["name"]} site:linkedin.com/in')

        for query in queries:
            results = self.searcher.search(query, num_results=5)
            for result in results:
                parsed = self._parse_decision_maker(result.title, result.url)
                if parsed and parsed["name"] not in seen_names:
                    seen_names.add(parsed["name"])
                    candidates.append(parsed)
                if len(candidates) >= MAX_CONTACTS_PER_COMPANY:
                    break
            if len(candidates) >= MAX_CONTACTS_PER_COMPANY:
                break
        return candidates

    def _parse_decision_maker(self, title: str, url: str) -> Optional[Dict]:
        """Parse 'Jean Dupont - Fondateur - Acme | LinkedIn' -> {name, function, linkedin}."""
        if not title:
            return None
        linkedin = None
        if "linkedin.com" in url:
            linkedin = url.split("?")[0]
            if "/company/" in url:
                return None  # page société, pas un profil

        # Nettoyage
        t = title
        for sep in (" | ", " - LinkedIn", " - LinkedIn", "|", "LinkedIn"):
            t = t.replace(sep, " | ") if sep == " | " else t
        parts = [p.strip() for p in re.split(r"[|\-–—]", t) if p.strip()]

        name = None
        function = None
        for part in parts:
            low = part.lower()
            if any(kw in low for kw in FUNCTION_KEYWORDS) and function is None:
                function = part[:80]
            elif name is None and "linkedin" not in low and len(part.split()) <= 4:
                name = part

        if not name:
            return None
        # Filtre : un nom plausible = 2-4 mots, pas de chiffres bizarres
        words = name.split()
        if not (2 <= len(words) <= 4) or not all(w[0].isupper() for w in words if w):
            return None
        # Filtre : aucun mot générique (Site Web, Agence SEO, ...)
        if any(w.lower().rstrip(".,") in GENERIC_NAME_WORDS for w in words):
            return None
        return {"name": name, "function": function or "Décideur", "linkedin": linkedin}

    # ------------------------------------------------------- emails inférés

    def _infer_emails(self, full_name: str, domain: str) -> List[str]:
        """Patterns d'emails pro français (ordre de probabilité)."""
        parts = full_name.lower().replace("-", " ").split()
        if len(parts) < 2:
            return []
        first = parts[0]
        last = parts[-1]
        # Gère "Jean-Pierre" -> "jeanpierre"
        first_clean = first.replace(" ", "")
        patterns = [
            f"{first_clean}.{last}@{domain}",
            f"{first_clean}@{domain}",
            f"{first_clean}{last}@{domain}",
            f"{first_clean[0]}{last}@{domain}",
            f"{first_clean}_{last}@{domain}",
            f"{last}.{first_clean}@{domain}",
        ]
        return list(dict.fromkeys(patterns))

    # ---------------------------------------------------------- orchestration

    def enrich(self, crm: CRM, limit: int = MAX_ENRICH_PER_RUN) -> Dict:
        icp = load_icp()
        companies = crm.get_enrichable_companies(limit=limit)
        if not companies:
            log.info("Aucune entreprise qualifiée à enrichir")
            return {"processed": 0, "with_contacts": 0, "with_email": 0, "errors": 0}

        processed = with_contacts = with_email = errors = 0
        domain_blacklist = set()

        try:
            for company in companies:
                domain = company["domain"]
                if domain in domain_blacklist:
                    continue
                processed += 1
                log.info(f"🌐 Enrichissement: {company['name']} ({domain})")

                try:
                    # 1. Emails génériques du site, récoltés dans le HTML source
                    #    (sans Selenium) + texte pour personnalisation
                    site_emails, home_text = self._collect_emails_from_site(company["website"])
                    # 2. Décideurs Google — indisponible (ex: blocage réseau) :
                    #    on continue et on retombe sur les emails du site
                    try:
                        decision_makers = self._search_decision_makers(company, icp)
                    except Exception as e:  # noqa: BLE001
                        log.warning(f"Recherche décideurs impossible pour {domain}: {e}")
                        decision_makers = []
                    # 3. Inférence + vérification (emails dédupliqués par entreprise)
                    # Email générique du site (contact@, info@...) -> fallback
                    generic = next(
                        (e["email"] for e in site_emails
                         if any(kw in e["email"].split("@")[0].lower()
                                for kw in GENERIC_EMAIL_KEYWORDS)),
                        None,
                    )
                    used_emails = set()
                    contacts = []
                    for dm in decision_makers:
                        contact = {
                            "full_name": dm["name"],
                            "first_name": dm["name"].split()[0],
                            "function": dm["function"],
                            "linkedin_url": dm["linkedin"],
                            "email": None, "email_status": "none", "email_source": None,
                        }
                        inferred = self._infer_emails(dm["name"], domain)
                        candidates = inferred + ([generic] if generic else [])
                        verified = False
                        for email in candidates:
                            if email.lower() in used_emails:
                                continue  # déjà attribué à un autre contact
                            status = verify_email(email)
                            if status == "verified":
                                contact["email"] = email
                                contact["email_status"] = "verified"
                                contact["email_source"] = "inferred_verified"
                                verified = True
                                break
                            if status == "risky" and not contact["email"]:
                                contact["email"] = email
                                contact["email_status"] = "pattern"
                                contact["email_source"] = "inferred"
                        if not verified and not contact["email"] and generic \
                                and generic.lower() not in used_emails:
                            contact["email"] = generic
                            contact["email_status"] = "found"
                            contact["email_source"] = "site"
                        if contact["email"]:
                            used_emails.add(contact["email"].lower())
                        contacts.append(contact)

                    # Aucun décideur trouvé -> email du site en contact de secours
                    if not contacts and site_emails:
                        fallback = generic or site_emails[0]["email"]
                        contacts.append({
                            "full_name": None, "first_name": None,
                            "function": "Contact générique",
                            "linkedin_url": None,
                            "email": fallback,
                            "email_status": "found", "email_source": "site",
                        })
                        used_emails.add(fallback.lower())

                    company_with_email = any(c.get("email") for c in contacts)
                    for contact in contacts:
                        cid = crm.add_contact(company["id"], contact)
                        crm.add_event(company["id"], "contact_added",
                                      {"contact_id": cid, "email": contact.get("email"),
                                       "email_status": contact.get("email_status")})
                    if contacts:
                        with_contacts += 1
                    if company_with_email:
                        with_email += 1

                    crm.set_company_status(company["id"], STATUS_ENRICHED)
                    crm.add_event(company["id"], "enriched",
                                  {"contacts": len(contacts), "site_emails": len(site_emails)})
                    if home_text:
                        crm.add_event(company["id"], "site_analysis",
                                      {"text": home_text[:3000]})
                    log.success(f"✅ {company['name']}: {len(contacts)} contacts "
                                f"({sum(1 for c in contacts if c.get('email'))} avec email)")
                except Exception as e:  # noqa: BLE001
                    errors += 1
                    log.error(f"Erreur enrichissement {domain}: {e}")
                    crm.add_event(company["id"], "enrichment_error", {"error": str(e)})
        finally:
            self.close()

        summary = {"processed": processed, "with_contacts": with_contacts,
                   "with_email": with_email, "errors": errors}
        log.success(f"Enrichissement: {processed} traitées, {with_contacts} avec contacts")
        return summary
