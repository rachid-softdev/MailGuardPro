"""
Découverte de prospects depuis annuaire-des-entreprises-locales.fr.

Principe :
  1. le sitemap expose ~8 800 fiches `/entreprises-locales/<dept>/<ville>/<cat>/<slug>` ;
  2. on ne garde que les catégories pertinentes (agence web, marketing,
     communication, création de site, webmaster, développement informatique) ;
  3. chaque fiche contient un JSON-LD `LocalBusiness` avec nom, site officiel,
     ville et parfois l'email dans la description ;
  4. l'entreprise est injectée dans le CRM (idempotent par domaine), puis
     site_harvest complète les emails sur son propre site.

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
SITEMAP_URL = "https://www.annuaire-des-entreprises-locales.fr/sitemap.xml"
DIRECTORY_HOST = "annuaire-des-entreprises-locales.fr"
SOCIAL_HOSTS = ("facebook.com", "instagram.com", "linkedin.com", "twitter.com",
                "x.com", "youtube.com", "tiktok.com", "pinterest.", "google.com",
                "google.fr", "maps.google", "crunchbase.com", "glassdoor.",
                "trustpilot.com", "wa.me", "whatsapp.com")

ENTITY_TYPES = {"LocalBusiness", "Organization", "ProfessionalService",
                "Store", "AdvertisingAgency"}
RELEVANT_CATEGORIES = {
    "agence-web", "creation-de-site-internet", "creation-de-site-web",
    "agence-de-communication", "agence-marketing", "agence-digitale",
    "marketing-digital", "communication-digitale", "webmaster",
    "developpement-informatique", "informatique", "seo", "consultant",
}
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def fetch_profile_urls(limit: Optional[int] = None) -> List[str]:
    """Fiches des catégories web/marketing/SEO listées dans le sitemap."""
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
        parts = [p for p in urlparse(loc).path.split("/") if p]
        if len(parts) < 5 or parts[0] != "entreprises-locales":
            continue
        if parts[3] not in RELEVANT_CATEGORIES:
            continue
        if loc not in seen:
            seen.add(loc)
            urls.append(loc)
    if limit:
        urls = urls[:limit]
    return urls


def _clean_website(url: str) -> Optional[str]:
    url = html.unescape(str(url or "")).strip()
    if not url:
        return None
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    host = (urlparse(url).netloc or "").lower()
    if not host or DIRECTORY_HOST in host:
        return None
    if any(s in host for s in SOCIAL_HOSTS):
        return None
    return url


def _entity_from_ld(data) -> Optional[Dict]:
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


def _clean_email(raw) -> Optional[str]:
    email = html.unescape(str(raw or "")).strip().lower()
    if email.startswith("mailto:"):
        email = email[7:]
    match = EMAIL_RE.search(email)
    return match.group(0) if match else None


def _guess_sector(text: str) -> str:
    low = text.lower()
    if "seo" in low or "référencement" in low:
        return "agence SEO"
    if "marketing" in low:
        return "agence marketing"
    if "communication" in low:
        return "agence de communication"
    if "web" in low or "digital" in low:
        return "agence web"
    return "entreprise du numérique"


def parse_profile(page_html: str) -> Optional[Dict]:
    """Parse une fiche -> dict entreprise (ou None si non exploitable)."""
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

    name = html.unescape(str(entity.get("name") or "")).strip()
    if not name:
        return None

    website = _clean_website(entity.get("url"))
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
    email = _clean_email(entity.get("email")) or _clean_email(description)
    if phone:
        description = f"{description} | Tel: {phone}".strip(" |")

    return {
        "name": name[:80],
        "domain": domain,
        "website": website,
        "email": email,
        "city": city,
        "country": country if len(country) == 2 else "FR",
        "market": "fr",
        "sector": _guess_sector(f"{name} {description}"),
        "description": description[:600],
        "employees": None,
        "linkedin_url": None,
        "source": "annuaire_local",
    }


def fetch_profile(url: str) -> Optional[Dict]:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=HTTP_TIMEOUT)
    except Exception:  # noqa: BLE001
        return None
    if resp.status_code >= 400:
        return None
    return parse_profile(resp.text)
