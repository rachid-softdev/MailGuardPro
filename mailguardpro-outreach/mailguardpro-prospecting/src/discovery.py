"""
Étape 1 : Découverte d'entreprises (multi-marché).
Pour chaque marché de icp.json (ex: fr, intl), génère les requêtes Google
(Selenium), extrait les entreprises candidates et les insère dans le CRM
(dédoublonnage par domaine, indépendamment du marché).
"""

import math
import re
from typing import Dict, List, Optional
from urllib.parse import urlparse

from .config import load_icp
from .crm import CRM
from .google_search import GoogleSearcher, SearchResult
from .utils import log, normalize_domain

# Domaines à exclure (non entreprises, réseaux sociaux, annuaires, job boards)
NOISE_DOMAINS = {
    "facebook.com", "instagram.com", "twitter.com", "x.com", "youtube.com",
    "linkedin.com", "tiktok.com", "pinterest.com", "wikipedia.org",
    "google.com", "bing.com", "yelp.fr", "pagesjaunes.fr", "annuaire.com",
    "societe.com", "infogreffe.fr", "pappers.fr", "kompass.com", "yelp.com",
    "crunchbase.com", "clutch.co", "sortlist.com", "sortlist.fr",
    "trustpilot.com", "g2.com", "capterra.com", "glassdoor.com",
    "glassdoor.fr", "indeed.com", "indeed.fr", "welcometothejungle.com",
    "apec.fr", "pole-emploi.fr", "hellowork.com", "monster.fr",
    "cadremploi.fr", "malt.fr", "upwork.com", "fiverr.com", "reddit.com",
    "quora.com", "medium.com", "substack.com", "github.com",
    "producthunt.com", "appsumo.com", "crozdesk.com", "softwareadvice.com",
    "getapp.com", "trustradius.com", "lemonde.fr", "lesechos.fr",
    "cal.com", "calendly.com", "savvycal.com", "doodle.com", "zoom.us",
    "wa.me", "t.me", "linktr.ee", "bit.ly", "tinyurl.com", "goo.gl",
    "forms.gle", "docs.google.com", "drive.google.com", "notion.so",
    "notion.site", "airtable.com", "typeform.com", "hubspot.com",
    "klaviyo.com", "mailchimp.com", "salesforce.com", "pipedrive.com",
    "zapier.com", "make.com", "n8n.io", "openai.com", "anthropic.com",
    "derrick-app.com", "salesforge.ai", "seventic.com", "mailguard.pro",
    "mailguardpro.com",
}

SECTOR_HINTS = [
    # Signaux à forte valeur pour MailGuard Pro (avant les termes génériques)
    ("cold email", "agence cold email"), ("cold-mail", "agence cold email"),
    ("outbound", "agence outbound"), ("lead generation", "agence lead generation"),
    ("lead gen", "agence lead generation"), ("prospection b2b", "agence lead generation"),
    ("email marketing", "agence email marketing"), ("e-mailing", "agence email marketing"),
    ("klaviyo", "agence email marketing"), ("mailchimp", "agence email marketing"),
    ("marketing automation", "agence marketing automation"),
    ("hubspot", "agence marketing automation"),
    ("revops", "consultant RevOps"), ("revenue operations", "consultant RevOps"),
    ("demand generation", "agence demand generation"),
    ("sales enablement", "agence sales enablement"),
    ("growth", "agence growth"), ("acquisition b2b", "agence growth"),
    ("shopify", "agence e-commerce"), ("e-commerce", "e-commerce"),
    ("boutique en ligne", "e-commerce"), ("online store", "e-commerce"),
    ("ecommerce", "e-commerce"),
    ("éditeur logiciel", "éditeur SaaS"), ("saas", "éditeur SaaS"),
    ("saas company", "éditeur SaaS"), ("logiciel b2b", "éditeur SaaS"),
    ("agence web", "agence web"), ("web agency", "agence web"),
    ("agence marketing", "agence marketing"),
    ("digital marketing agency", "agence marketing"),
    ("cabinet conseil", "cabinet conseil"), ("consulting firm", "cabinet conseil"),
    ("seo", "agence SEO"), ("référencement", "agence SEO"),
]


def _build_market_queries(market: Dict) -> List[str]:
    queries: List[str] = []
    for template in market.get("search_queries", []):
        if "[place]" in template:
            for place in market.get("search_places", []):
                queries.append(template.replace("[place]", place))
        else:
            queries.append(template)
    return queries


def _is_excluded(result: SearchResult, market: Dict) -> bool:
    text = f"{result.title} {result.snippet}".lower()
    for kw in market.get("exclude_keywords", []):
        if kw.lower() in text:
            return True
    return False


def _extract_linkedin(url: str) -> Optional[str]:
    if "linkedin.com/company" in url or "linkedin.com/in" in url:
        return url.split("?")[0].split("#")[0]
    return None


def _guess_sector(result: SearchResult) -> Optional[str]:
    """Secteur deviné depuis la requête/snippet (bilingue, affiné par le LLM ensuite)."""
    text = f"{result.title} {result.snippet}".lower()
    for hint, sector in SECTOR_HINTS:
        if hint in text:
            return sector
    return None


def _company_from_result(result: SearchResult, market: Dict,
                         exclude_domains: Optional[set] = None) -> Optional[Dict]:
    """Construit un dictionnaire entreprise depuis un résultat de recherche."""
    url = result.url
    parsed = urlparse(url)
    if parsed.scheme and parsed.scheme not in ("http", "https"):
        return None
    domain = normalize_domain(parsed.netloc or url)
    if (not domain or "." not in domain
            or domain.startswith(("tel:", "mailto:", "javascript:"))
            or domain in NOISE_DOMAINS
            or domain in (exclude_domains or set())):
        return None
    # Pages LinkedIn (société ou profil) : pas une entreprise candidate ici
    if domain.endswith("linkedin.com"):
        return None

    # Nom : titre du résultat nettoyé, sinon domaine
    name = result.title
    if " - " in name:
        name = name.split(" - ")[0]
    name = re.sub(r"\|.*$", "", name).strip()
    if (not name or len(name) > 80
            or name.startswith(("http://", "https://", "www."))):
        name = domain.split(".")[0].capitalize()

    linkedin = _extract_linkedin(url)
    countries = market.get("target_countries", [])
    return {
        "domain": domain,
        "name": name,
        "website": f"https://{domain}",
        "linkedin_url": linkedin,
        "description": result.snippet,
        "sector": _guess_sector(result),
        "city": None,
        "country": countries[0] if countries else None,
        "employees": None,
        "market": market.get("code", "unknown"),
        "source": "google",
    }


def discover(crm: CRM, max_new: int = 15, searcher: Optional[GoogleSearcher] = None) -> Dict:
    """
    Exécute la découverte sur tous les marchés de l'ICP (round-robin).
    Retourne un résumé {queries, found, new, skipped, markets}.
    max_new : nombre max de nouvelles entreprises par run (tous marchés confondus).
    """
    icp = load_icp()
    markets = icp.get("markets", [])
    if not markets:
        log.warning("Aucun marché défini dans icp.json")
        return {"queries": 0, "found": 0, "new": 0, "skipped": 0, "markets": {}}
    exclude_domains = {d.lower().strip() for d in icp.get("exclude_domains", []) if d}

    market_queries = {m.get("code", "?"): _build_market_queries(m) for m in markets}
    total_queries = sum(len(q) for q in market_queries.values())
    log.info(f"⚙️ {total_queries} requêtes générées ({', '.join(f'{k}: {len(v)}' for k, v in market_queries.items())})")

    # Round-robin : interleave les marchés pour une couverture équitable
    interleaved = []
    for i in range(max(len(q) for q in market_queries.values())):
        for code, queries in market_queries.items():
            if i < len(queries):
                interleaved.append((code, queries[i]))
    plan = interleaved

    found = 0
    new = 0
    skipped = 0
    markets_seen = {code: 0 for code in market_queries}
    # Quota par marché : garantit que chaque marché est couvert avant qu'un
    # seul ne monopolise le quota du run
    per_market_target = math.ceil(max_new / max(1, len(markets)))
    own_searcher = searcher is None
    searcher = searcher or GoogleSearcher()

    try:
        for market_code, query in plan:
            if new >= max_new:
                log.info(f"Objectif atteint ({max_new} nouvelles entreprises), arrêt")
                break
            if markets_seen[market_code] >= per_market_target:
                continue
            market = next(m for m in markets if m.get("code") == market_code)
            results = searcher.search(query)
            for result in results:
                if new >= max_new:
                    break
                if markets_seen[market_code] >= per_market_target:
                    break
                if _is_excluded(result, market):
                    continue
                company = _company_from_result(result, market, exclude_domains)
                if not company:
                    continue
                found += 1
                existing = crm.get_company_by_domain(company["domain"])
                if existing:
                    skipped += 1
                    continue
                cid = crm.upsert_company(company)
                crm.add_event(cid, "discovered",
                              {"query": query, "url": result.url, "market": market_code})
                new += 1
                markets_seen[market_code] += 1
                log.debug(f"➕ [{market_code}] {company['name']} ({company['domain']})")
    finally:
        if own_searcher:
            searcher.close()

    summary = {"queries": total_queries, "found": found, "new": new,
               "skipped": skipped, "markets": markets_seen}
    log.success(f"Découverte: {new} nouvelles entreprises "
                f"({', '.join(f'{k}: {v}' for k, v in markets_seen.items())})")
    return summary
