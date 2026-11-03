"""
Découverte de prospects depuis l'annuaire webstratege.fr.

Principe :
  1. le sitemap WordPress expose 104 fiches `/agence/<slug>/` ;
  2. chaque fiche contient un JSON-LD `Organization` avec nom, site officiel,
     email, ville, description et effectif ;
  3. l'entreprise est injectée dans le CRM (idempotent par domaine) ;
     l'email de la fiche est ajouté directement, puis site_harvest complète.

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
SITEMAP_URL = "https://webstratege.fr/wp-sitemap-posts-agence-1.xml"
DIRECTORY_HOST = "webstratege.fr"
SOCIAL_HOSTS = ("facebook.com", "instagram.com", "linkedin.com", "twitter.com",
                "x.com", "youtube.com", "tiktok.com", "pinterest.", "google.com",
                "google.fr", "maps.google", "crunchbase.com", "glassdoor.",
                "trustpilot.com", "wa.me", "whatsapp.com")

ENTITY_TYPES = {"Organization", "LocalBusiness", "ProfessionalService",
                "AdvertisingAgency"}
COUNTRY_CODES = {"france": "FR", "belgique": "BE", "suisse": "CH",
                 "luxembourg": "LU", "canada": "CA"}
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")


def fetch_profile_urls(limit: Optional[int] = None) -> List[str]:
    """Toutes les URLs de fiches agence listées dans le sitemap."""
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
        path = urlparse(loc).path
        segments = [p for p in path.split("/") if p]
        if len(segments) < 2 or segments[0] != "agence":
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
    return email if EMAIL_RE.match(email) else None


def _country_code(raw) -> str:
    value = html.unescape(str(raw or "")).strip().lower()
    if len(value) == 2:
        return value.upper()
    return COUNTRY_CODES.get(value, "FR")


def _employees(raw) -> Optional[str]:
    if isinstance(raw, dict):
        low, high = raw.get("minValue"), raw.get("maxValue")
        if low is not None and high is not None:
            return str(low) if low == high else f"{low}-{high}"
        value = high if high is not None else low
        return str(value) if value is not None else None
    if raw is None:
        return None
    return str(raw)[:20]


def _guess_sector(text: str) -> str:
    low = text.lower()
    if "seo" in low or "référencement" in low:
        return "agence SEO"
    if "web" in low or "digital" in low:
        return "agence web"
    return "agence digitale"


def parse_profile(page_html: str) -> Optional[Dict]:
    """Parse une fiche agence -> dict entreprise (ou None si non exploitable)."""
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
    country = _country_code(addr.get("addressCountry"))
    phone = str(entity.get("telephone") or "").strip()
    email = _clean_email(entity.get("email"))

    description = html.unescape(str(entity.get("description") or "")).strip()
    if phone:
        description = f"{description} | Tel: {phone}".strip(" |")

    knows = entity.get("knowsAbout") or []
    sector = _guess_sector(f"{name} {description} {' '.join(map(str, knows))}")

    return {
        "name": name[:80],
        "domain": domain,
        "website": website,
        "email": email,
        "city": city,
        "country": country,
        "market": "fr",
        "sector": sector,
        "description": description[:600],
        "employees": _employees(entity.get("numberOfEmployees")),
        "linkedin_url": next(
            (s for s in entity.get("sameAs") or [] if "linkedin.com" in str(s)), None),
        "source": "webstratege",
    }


def fetch_profile(url: str) -> Optional[Dict]:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=HTTP_TIMEOUT)
    except Exception:  # noqa: BLE001
        return None
    if resp.status_code >= 400:
        return None
    return parse_profile(resp.text)
