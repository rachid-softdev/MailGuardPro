"""
Découverte massive de prospects depuis l'annuaire mon-expert-digital.com.

Principe :
  1. le sitemap expose ~1 255 fiches "entreprise" (URLs profondes
     /entreprises/<pays>/<region>/<dept>/<slug>.html) ;
  2. chaque fiche contient des données structurées JSON-LD (LocalBusiness)
     avec le nom et le site officiel de l'entreprise (url) ;
  3. on en déduit le domaine -> entreprise injectée dans le CRM (idempotent
     par domaine), puis site_harvest récolte les emails sur son propre site.

Aucune API payante, HTTP seul (requests + BeautifulSoup), timeouts courts,
toute erreur réseau est non-fatale.
"""
import html
import json
import re
from typing import Dict, List, Optional
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

from .directory_discovery import _tag_values
from .utils import log, normalize_domain

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
}
HTTP_TIMEOUT = 15
SITEMAP_URL = "https://www.mon-expert-digital.com/sitemap.xml"
DIRECTORY_HOST = "mon-expert-digital.com"
SOCIAL_HOSTS = ("facebook.com", "instagram.com", "linkedin.com", "twitter.com",
                "x.com", "youtube.com", "tiktok.com", "pinterest.", "google.com",
                "google.fr", "maps.google", "crunchbase.com", "glassdoor.",
                "trustpilot.com", "wa.me", "whatsapp.com")

ENTITY_TYPES = {"LocalBusiness", "Organization", "ProfessionalService",
                "AdvertisingAgency"}

# Les fiches sont les URLs profondes : /entreprises/<pays>/<region>/<dept>/<slug>.html
PROFILE_MIN_SEGMENTS = 5


def fetch_profile_urls(limit: Optional[int] = None) -> List[str]:
    """Toutes les URLs de fiches entreprise listées dans le sitemap."""
    try:
        resp = requests.get(SITEMAP_URL, headers=HEADERS, timeout=60)
        if resp.status_code >= 400:
            log.warning(f"sitemap HTTP {resp.status_code}: {SITEMAP_URL}")
            return []
    except Exception as e:  # noqa: BLE001
        log.warning(f"sitemap injoignable {SITEMAP_URL}: {e}")
        return []

    urls: List[str] = []
    seen = set()
    for loc in _tag_values(resp.text, "loc"):
        if "/entreprises/" not in loc:
            continue
        segments = [p for p in urlparse(loc).path.split("/") if p]
        if len(segments) < PROFILE_MIN_SEGMENTS:
            continue  # page region / departement, pas une fiche
        if loc not in seen:
            seen.add(loc)
            urls.append(loc)
    if limit:
        urls = urls[:limit]
    return urls


def _is_website_candidate(url: str) -> bool:
    if not url:
        return False
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    host = (urlparse(url).netloc or "").lower()
    if not host or DIRECTORY_HOST in host:
        return False
    return not any(s in host for s in SOCIAL_HOSTS)


def _clean_website(url: str) -> Optional[str]:
    if not _is_website_candidate(url):
        return None
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    return url


def _entity_from_ld(data) -> Optional[Dict]:
    """Extrait l'entité métier (LocalBusiness / Organization) du JSON-LD."""
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
        if types & ENTITY_TYPES and (node.get("url") or node.get("address")):
            return node
    return None


def _clean_name(raw: str) -> str:
    name = html.unescape(str(raw or "")).strip()
    # Les fiches utilisent "<Nom> : <slogan>" : on garde le nom seul.
    name = re.split(r"\s+[:\u2013\u2014]\s+", name, maxsplit=1)[0]
    return name[:80].strip()


def _guess_sector(text: str) -> str:
    low = text.lower()
    if "seo" in low or "référencement" in low:
        return "agence SEO"
    if "web" in low or "digital" in low:
        return "agence web"
    return "agence digitale"


def parse_profile(page_html: str) -> Optional[Dict]:
    """Parse une fiche entreprise -> dict entreprise (ou None si non exploitable)."""
    soup = BeautifulSoup(page_html or "", "html.parser")
    entity: Optional[Dict] = None
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or script.get_text())
        except Exception:  # noqa: BLE001
            continue
        entity = _entity_from_ld(data)
        if entity:
            break

    if not entity:
        return None

    name = _clean_name(entity.get("name"))
    if not name:
        return None

    website = _clean_website(str(entity.get("url") or ""))
    if not website:
        for cand in entity.get("sameAs") or []:
            if isinstance(cand, str):
                website = _clean_website(cand)
                if website:
                    break
    if not website:
        return None

    try:
        domain = normalize_domain(website)
    except Exception:  # noqa: BLE001
        return None
    if not domain or "." not in domain:
        return None

    addr = entity.get("address") or {}
    if not isinstance(addr, dict):
        addr = {}
    city = html.unescape(str(addr.get("addressLocality") or "")).strip() or None
    country = html.unescape(str(addr.get("addressCountry") or "")).strip().upper() or "FR"
    phone = str(entity.get("telephone") or "").strip()

    description = html.unescape(str(entity.get("description") or "")).strip()
    if phone:
        description = f"{description} | Tel: {phone}".strip(" |")

    # L'ICP "fr" couvre FR/BE/CH ; le reste est laissé en fr par défaut.
    market = "fr" if country in ("FR", "BE", "CH", "") else "fr"

    return {
        "name": name,
        "domain": domain,
        "website": website,
        "city": city,
        "country": country,
        "market": market,
        "sector": _guess_sector(f"{name} {description}"),
        "description": description[:600],
        "employees": None,
        "linkedin_url": None,
        "source": "directory_expert",
    }


def fetch_profile(url: str) -> Optional[Dict]:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=HTTP_TIMEOUT)
    except Exception:  # noqa: BLE001
        return None
    if resp.status_code >= 400:
        return None
    return parse_profile(resp.text)
