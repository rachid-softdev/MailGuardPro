"""
Découverte massive de prospects depuis l'annuaire agences-web-france.fr.

Principe :
  1. le sitemap de l'annuaire expose 67 879 fiches "agence" (source de vérité) ;
  2. chaque fiche contient des données structurées JSON-LD (ProfessionalService)
     avec nom, ville, téléphone et le site officiel de l'agence (sameAs) ;
  3. on en déduit le domaine -> on injecte l'entreprise dans le CRM (idempotent
     par domaine), puis site_harvest récolte les emails sur son propre site.

Aucune API payante, HTTP seul (requests + BeautifulSoup), timeouts courts,
toute erreur réseau est non-fatale.
"""
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Optional
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

from .utils import log, normalize_domain

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
}
HTTP_TIMEOUT = 15
SITEMAPS = [
    "https://agences-web-france.fr/sitemap-1.xml",
    "https://agences-web-france.fr/sitemap-2.xml",
]
DIRECTORY_HOST = "agences-web-france.fr"
SOCIAL_HOSTS = ("facebook.com", "instagram.com", "linkedin.com", "twitter.com",
                "x.com", "youtube.com", "tiktok.com", "pinterest.", "google.com",
                "google.fr", "maps.google", "crunchbase.com", "glassdoor.",
                "trustpilot.com", "twitter.", "wa.me", "whatsapp.com")

# Types schema.org décrivant l'agence elle-même
ENTITY_TYPES = {"ProfessionalService", "LocalBusiness", "Organization",
                "AdvertisingAgency", "Organization"}


def fetch_profile_urls(limit: Optional[int] = None) -> List[str]:
    """Toutes les URLs de fiches agence listées dans les sitemaps."""
    urls: List[str] = []
    for sm in SITEMAPS:
        try:
            resp = requests.get(sm, headers=HEADERS, timeout=60)
            if resp.status_code >= 400:
                log.warning(f"sitemap HTTP {resp.status_code}: {sm}")
                continue
        except Exception as e:  # noqa: BLE001
            log.warning(f"sitemap injoignable {sm}: {e}")
            continue
        for loc in _tag_values(resp.text, "loc"):
            # Seules les fiches d'agence nous intéressent (pas /villes/, /guides/)
            if "/agence/" in loc:
                urls.append(loc)
        if limit and len(urls) >= limit:
            break
    # Déduplication (un site peut référencer une même fiche dans 2 sitemaps)
    deduped, seen = [], set()
    for u in urls:
        if u not in seen:
            seen.add(u)
            deduped.append(u)
    urls = deduped
    if limit:
        urls = urls[:limit]
    return urls


def _tag_values(xml: str, tag: str) -> List[str]:
    out, start = [], 0
    open_t, close_t = f"<{tag}>", f"</{tag}>"
    while True:
        i = xml.find(open_t, start)
        if i == -1:
            return out
        j = xml.find(close_t, i)
        if j == -1:
            return out
        out.append(xml[i + len(open_t):j].strip())
        start = j + len(close_t)


def _is_website_candidate(url: str) -> bool:
    if not url.startswith(("http://", "https://")):
        return False
    host = (urlparse(url).netloc or "").lower()
    if not host or DIRECTORY_HOST in host:
        return False
    return not any(s in host for s in SOCIAL_HOSTS)


def _entity_from_ld(data) -> Optional[Dict]:
    """Extrait l'entité métier (ProfessionalService / LocalBusiness / Organization)."""
    if isinstance(data, list):
        for item in data:
            got = _entity_from_ld(item)
            if got:
                return got
        return None
    if not isinstance(data, dict):
        return None
    nodes = data.get("@graph") if isinstance(data.get("@graph"), list) else [data]
    for node in nodes:
        if not isinstance(node, dict):
            continue
        t = node.get("@type")
        types = {t} if isinstance(t, str) else set(t or [])
        if types & ENTITY_TYPES:
            addr = node.get("address") or {}
            if isinstance(addr, dict) and (addr.get("addressLocality")
                                           or node.get("telephone")):
                return node
    # 2e passe : toute entité portant une adresse exploitable
    for node in nodes:
        if isinstance(node, dict) and isinstance(node.get("address"), dict):
            return node
    return None


def parse_profile(html: str) -> Optional[Dict]:
    """Parse une fiche agence -> dict entreprise (ou None si non exploitable)."""
    soup = BeautifulSoup(html or "", "html.parser")
    entity: Optional[Dict] = None
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or script.get_text())
        except Exception:  # noqa: BLE001
            continue
        entity = _entity_from_ld(data)
        if entity:
            break

    addr = (entity or {}).get("address") or {}
    if not isinstance(addr, dict):
        addr = {}

    name = (entity or {}).get("name")
    if not name and soup.h1:
        name = soup.h1.get_text(" ", strip=True)[:80]
    if not name and soup.title:
        name = (soup.title.get_text(" ", strip=True).split("|")[0])[:80]
    if not name:
        return None

    # Site officiel : sameAs[0] (JSON-LD) puis lien "Site web ..." explicite
    website = ""
    for cand in (entity or {}).get("sameAs") or []:
        if isinstance(cand, str) and _is_website_candidate(cand):
            website = cand
            break
    if not website:
        for a in soup.find_all("a", href=True):
            if _is_website_candidate(a["href"]):
                text = a.get_text(" ", strip=True).lower()
                if "site web" in text or "site-site" in text or text.startswith("site"):
                    website = a["href"]
                    break
    if not website:
        for a in soup.find_all("a", href=True):
            if _is_website_candidate(a["href"]):
                website = a["href"]
                break

    if not website:
        return None
    try:
        domain = normalize_domain(website)
    except Exception:  # noqa: BLE001
        return None
    if not domain or "." not in domain:
        return None

    meta = soup.find("meta", attrs={"name": "description"})
    description = (meta.get("content") if meta else "") or ""
    phone = (entity or {}).get("telephone") or ""
    city = addr.get("addressLocality") or ""
    postal = addr.get("postalCode") or ""
    region = addr.get("addressRegion") or ""

    desc = description.strip()
    if phone:
        desc = f"{desc} | Tel: {phone}".strip(" |")
    if region and region != city:
        desc = f"{desc} | {region}".strip(" |")

    return {
        "name": str(name).strip(),
        "domain": domain,
        "website": website,
        "city": str(city).strip() or None,
        "country": "FR",
        "market": "fr",
        "sector": "agence SEO",
        "description": desc[:600],
        "employees": None,
        "linkedin_url": None,
        "postal_code": postal,
        "source": "directory",
    }


def fetch_profile(url: str) -> Optional[Dict]:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=HTTP_TIMEOUT)
    except Exception:  # noqa: BLE001
        return None
    if resp.status_code >= 400:
        return None
    return parse_profile(resp.text)


def discover(urls: List[str], workers: int = 8) -> List[Dict]:
    """Parse un lot de fiches en parallèle. Retourne les entreprises exploitables."""
    out: List[Dict] = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(fetch_profile, u) for u in urls]
        for fut in as_completed(futures):
            got = fut.result()
            if got:
                out.append(got)
    return out
