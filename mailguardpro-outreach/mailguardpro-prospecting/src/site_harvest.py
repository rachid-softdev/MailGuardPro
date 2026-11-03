"""
Récolte d'emails sur le HTML source d'un site (requests + BeautifulSoup).

Alternative HTTP légère à Selenium :
  - lit le HTML brut (mailto:, footers, commentaires) plutôt que le texte
    visible, qui masque la moitié des adresses ;
  - explore la home puis les pages utiles (contact, équipe, mentions légales...)
  - filtre les emails par domaine via extract_emails(context=domain)
Toute erreur réseau est non-fatale : on logue et on continue.
"""

import html as html_lib
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Optional, Set, Tuple
from urllib.parse import unquote, urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from .email_verify import EMAIL_REGEX, extract_emails
from .utils import log, normalize_domain

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
}

HTTP_TIMEOUT = 10        # timeout HTTP par page (s)
MAX_PAGES = 5            # pages max visitées par entreprise (home incluse)
MAX_FETCH_WORKERS = 12   # taille du pool partagé de téléchargement des pages
MAX_HOME_TEXT = 4000     # texte visible de la home conservé (personnalisation)
MAX_HTML_BYTES = 2_000_000  # corps de page plafonné (aucune page utile ne pèse 2 Mo)

# Liens de navigation/footer explorés pour leur page, par priorité
CONTACT_KEYWORDS = ("contact", "équipe", "equipe", "team")
PAGE_KEYWORDS = ("about", "a propos", "à propos", "mentions", "legal", "légal",
                 "privacy", "confidentialit", "agence")


def _fetch(session: requests.Session, url: str) -> Optional[str]:
    """Télécharge une page (corps plafonné à MAX_HTML_BYTES).

    Lecture en flux : une page anormalement lourde (ou servie sans fin) ne peut
    pas saturer la mémoire du process. Retourne le HTML ou None (toute erreur
    réseau est non fatale).
    """
    try:
        resp = session.get(url, timeout=HTTP_TIMEOUT, allow_redirects=True,
                           stream=True)
    except Exception as e:  # noqa: BLE001 - toute erreur réseau est non fatale
        log.warning(f"Page injoignable {url}: {e}")
        return None
    try:
        if resp.status_code >= 400:
            log.warning(f"HTTP {resp.status_code} sur {url}")
            return None
        encoding = resp.encoding or "utf-8"
        raw = resp.raw.read(MAX_HTML_BYTES, decode_content=True)
    except Exception as e:  # noqa: BLE001 - lecture interrompue, décodage, etc.
        log.warning(f"Page injoignable {url}: {e}")
        return None
    finally:
        resp.close()
    if len(raw) >= MAX_HTML_BYTES:
        log.warning(f"Page tronquée à {MAX_HTML_BYTES} octets: {url}")
    try:
        return raw.decode(encoding, errors="replace")
    except (LookupError, UnicodeError):
        return raw.decode("utf-8", errors="replace")


# Un seul pool partagé pour les pages secondaires : créer un ThreadPoolExecutor
# par site multipliait les threads (source d'épuisement mémoire à grande échelle).
_pool: Optional[ThreadPoolExecutor] = None
_pool_lock = threading.Lock()

# Session par thread : requests ne garantit pas qu'une Session soit utilisable
# depuis plusieurs threads (jar de cookies, adaptateurs). Chaque worker du pool
# télécharge donc avec sa propre Session, réutilisée pour ses appels.
_thread_local = threading.local()


def _thread_session() -> requests.Session:
    """Session HTTP propre au thread appelant (réutilisée entre ses appels)."""
    session = getattr(_thread_local, "session", None)
    if session is None:
        session = requests.Session()
        session.headers.update(HEADERS)
        _thread_local.session = session
    return session


def _get_pool() -> ThreadPoolExecutor:
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                _pool = ThreadPoolExecutor(max_workers=MAX_FETCH_WORKERS,
                                           thread_name_prefix="harvest")
    return _pool


def _decode_js_escapes(text: str) -> str:
    """Décode les séquences Unicode JS (\\u003e) présentes dans les blobs JSON
    embarqués dans les pages, qui casseraient l'extraction (u003econtact@...)."""
    return re.sub(r"\\u([0-9a-fA-F]{4})",
                  lambda m: chr(int(m.group(1), 16)), text)


def _normalize_mailto(raw: str) -> List[str]:
    """Normalise la valeur d'un lien mailto: et en extrait les emails valides.

    Gère les adresses encodées (%40, &#64;), suffixées ?subject=..., ou
    splitées pour le obfusquer ("info [at] example(dot)fr", espaces insérés).
    """
    raw = raw.split("?", 1)[0]                    # coupe ?subject=...
    raw = html_lib.unescape(unquote(raw))         # %40 -> @, &#64; -> @
    raw = raw.split("#", 1)[0]                    # coupe l'ancre (après décodage)
    raw = _decode_js_escapes(raw)                 # info\u0040example.fr -> ...
    # Variantes "splitées" : info [at] example(dot)fr / info at example dot fr
    raw = re.sub(r"(?<=[0-9a-z])\s*(?:\[|\(|\{)\s*at\s*(?:\]|\)|\})\s*(?=[0-9a-z])",
                 "@", raw, flags=re.IGNORECASE)
    raw = re.sub(r"(?<=[0-9a-z])\s+at\s+(?=[0-9a-z])", "@", raw, flags=re.IGNORECASE)
    raw = re.sub(r"(?<=[0-9a-z])\s*(?:\[|\(|\{)\s*dot\s*(?:\]|\)|\})\s*(?=[0-9a-z])",
                 ".", raw, flags=re.IGNORECASE)
    raw = re.sub(r"(?<=[0-9a-z])\s+dot\s+(?=[0-9a-z])", ".", raw, flags=re.IGNORECASE)
    # Espaces / caractères zéro-large insérés pour casser l'adresse
    raw = re.sub(r"[\s\u200b\u200c\u200d\ufeff]+", "", raw)
    return EMAIL_REGEX.findall(raw)


def extract_mailto_emails(html: str) -> List[str]:
    """Extrait les emails de tous les liens mailto: d'un document HTML."""
    found: Set[str] = set()
    for raw in re.findall(r"mailto:([^\"'<>]+)", html or "", flags=re.IGNORECASE):
        found.update(_normalize_mailto(raw))
    return sorted(found)


def _find_site_pages(html: str, base_url: str, domain: str,
                     limit: int) -> List[Tuple[str, str]]:
    """Liens utiles du même domaine, contact d'abord. Retourne [(url, source)]."""
    soup = BeautifulSoup(html or "", "html.parser")
    contact_pages: List[Tuple[str, str]] = []
    other_pages: List[Tuple[str, str]] = []
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if href.lower().startswith(("mailto:", "javascript:", "tel:", "#")):
            continue
        url = urljoin(base_url, href)
        page_domain = normalize_domain(url)
        if page_domain != domain and not page_domain.endswith(f".{domain}"):
            continue  # on reste sur le site de l'entreprise
        text = (a.get_text(" ", strip=True) + " " + urlparse(url).path).lower()
        if any(kw in text for kw in CONTACT_KEYWORDS):
            contact_pages.append((url, "site_contact"))
        elif any(kw in text for kw in PAGE_KEYWORDS):
            other_pages.append((url, "site_page"))

    seen: Set[str] = set()
    pages: List[Tuple[str, str]] = []
    for url, source in contact_pages + other_pages:
        if url not in seen:
            seen.add(url)
            pages.append((url, source))
    return pages[:limit]


def harvest_site_emails(url: str, domain: Optional[str] = None,
                        max_pages: int = MAX_PAGES) -> Dict:
    """
    Récolte les emails dans le HTML source d'une entreprise (home + pages utiles).

    Retourne un dict :
      emails     [{"email", "source"}] emails du domaine, dédupliqués
                 (source : site_home / site_contact / site_page)
      foreign    emails hors-domaine détectés (info seulement, jamais contact)
      home_text  texte visible de la home (personnalisation)
      pages      nombre de pages effectivement téléchargées
    """
    domain = domain or normalize_domain(url)
    emails: List[Dict] = []
    foreign: Set[str] = set()
    seen: Set[str] = set()
    home_text = ""

    def _collect(html: str, source: str) -> None:
        """Extrait les emails du domaine (filtre context=domain) + hors-domaine."""
        html = _decode_js_escapes(html)  # blobs JSON: \u003econtact@ -> >contact@
        mailto = extract_mailto_emails(html)
        same = {e.lower() for e in extract_emails(html, context=domain)}
        same |= {e.lower() for e in extract_emails(" ".join(mailto), context=domain)}
        all_found = {e.lower() for e in EMAIL_REGEX.findall(html or "")}
        all_found |= {e.lower() for e in mailto}
        foreign.update(all_found - same)
        for email in sorted(same):
            if email not in seen:
                seen.add(email)
                emails.append({"email": email, "source": source})

    with requests.Session() as session:
        session.headers.update(HEADERS)
        home_html = _fetch(session, url)
        if not home_html:
            return {"emails": [], "foreign": [], "home_text": "", "pages": 0}
        pages_fetched = 1
        _collect(home_html, "site_home")
        home_text = BeautifulSoup(home_html, "html.parser").get_text(
            " ", strip=True)[:MAX_HOME_TEXT]

        # Les pages utiles sont téléchargées via le pool partagé (les HTML sont
        # analysés ensuite, dans l'ordre, depuis le thread principal)
        candidates = [c for c in _find_site_pages(home_html, url, domain,
                                                  limit=max_pages - 1)
                      if c[0] != url]
        if candidates:
            pool = _get_pool()
            futures = [pool.submit(_fetch, _thread_session(), page_url)
                       for page_url, _ in candidates]
            for (page_url, source), future in zip(candidates, futures):
                try:
                    page_html = future.result(timeout=HTTP_TIMEOUT * 2)
                except Exception as e:  # noqa: BLE001 - timeout : on abandonne
                    # Annule le job s'il n'a pas demarre : un hôte lent ne doit
                    # pas occuper indefiniment un worker du pool partage.
                    future.cancel()
                    log.warning(f"Page abandonnée {page_url}: {e}")
                    continue
                if page_html is None:
                    continue
                pages_fetched += 1
                _collect(page_html, source)

    log.debug(f"{domain}: {len(emails)} emails du domaine, "
              f"{len(foreign)} hors-domaine, {pages_fetched} pages")
    return {"emails": emails, "foreign": sorted(foreign),
            "home_text": home_text, "pages": pages_fetched}
