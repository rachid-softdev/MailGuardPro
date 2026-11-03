"""
Recherche Google gratuite via Selenium (pattern CommuneScraper).
Scrape les SERP Google avec un Chrome headless, anti-détection et délais aléatoires.
Aucune API payante (pas de Tavily/SerpAPI).
"""

import random
import re
import time
from dataclasses import dataclass, field
from typing import List, Optional
from urllib.parse import parse_qs, quote_plus, unquote, urlparse

import requests
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from .utils import log, smart_delay

# Chrome attend 300s par defaut : une IP que Google stalle (blocage) fait
# pendre chaque requete 5 minutes. On borne, puis on coupe court.
PAGE_LOAD_TIMEOUT = 20
# MAX_LOAD_FAILURES echecs de chargement (cumules sur la vie de l'instance)
# = blocage reseau, pas un souci transitoire. Le compteur n'est pas remis a
# zero : si Google a bloque l'IP une fois, insister ne fait que l'aggraver.
MAX_LOAD_FAILURES = 2

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]


@dataclass
class SearchResult:
    title: str
    url: str
    snippet: str
    position: int

    def to_dict(self) -> dict:
        return {"title": self.title, "url": self.url, "snippet": self.snippet,
                "position": self.position}


@dataclass
class GoogleSearcher:
    headless: bool = True
    results_per_query: int = 10
    _driver: Optional[webdriver.Chrome] = field(default=None, init=False, repr=False)
    # Circuit breaker : des qu'on a prouve que Google bloque l'IP, plus aucune
    # requete n'est tentee (elles couteraient PAGE_LOAD_TIMEOUT chacune).
    _blocked: bool = field(default=False, init=False, repr=False)
    _failures: int = field(default=0, init=False, repr=False)
    _ddg_blocked: bool = field(default=False, init=False, repr=False)
    _ddg_failures: int = field(default=0, init=False, repr=False)

    # ------------------------------------------------------------------ driver

    def _create_driver(self) -> webdriver.Chrome:
        options = Options()
        if self.headless:
            options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_argument("--window-size=1920,1080")
        options.add_argument("--lang=fr-FR")
        options.add_argument(f"user-agent={random.choice(USER_AGENTS)}")
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option("useAutomationExtension", False)

        driver = webdriver.Chrome(options=options)
        # Timeout agressif : evite 5 min d'attente quand l'IP est bloquee
        driver.set_page_load_timeout(PAGE_LOAD_TIMEOUT)
        driver.execute_cdp_cmd("Network.setUserAgentOverride", {"userAgent": random.choice(USER_AGENTS)})
        driver.execute_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )
        return driver

    def _ensure_driver(self):
        if self._driver is None:
            log.debug("Création du driver Chrome...")
            self._driver = self._create_driver()

    def close(self):
        if self._driver is not None:
            try:
                self._driver.quit()
            except Exception:  # noqa: BLE001
                pass
            self._driver = None

    def __enter__(self):
        self._ensure_driver()
        return self

    def __exit__(self, *args):
        self.close()

    # ------------------------------------------------------------------ search

    def search(self, query: str, num_results: Optional[int] = None) -> List[SearchResult]:
        """Recherche Google, puis DuckDuckGo en repli si Google est bloqué."""
        num_results = num_results or self.results_per_query
        if not getattr(self, "_blocked", False):
            try:
                results = self._google_search(query, num_results)
                if results:
                    return results
                log.debug("Google n'a retourné aucun résultat, repli DuckDuckGo")
            except Exception as e:  # noqa: BLE001
                log.warning(f"Google indisponible ({e}), repli DuckDuckGo")
        return self._duckduckgo_search(query, num_results)

    def _google_search(self, query: str, num_results: int) -> List[SearchResult]:
        """Recherche Google via Selenium (peut être bloquée par l'IP locale)."""
        if getattr(self, "_blocked", False):
            log.debug("Google bloque precedemment (circuit breaker) : recherche ignoree")
            return []
        try:
            self._ensure_driver()
        except Exception as e:  # noqa: BLE001
            self._failures += 1
            self._blocked = True
            log.warning(f"Chrome/Google indisponible ({e}) : repli DuckDuckGo")
            return []
        url = f"https://www.google.com/search?q={quote_plus(query)}&hl=fr&num={num_results}"
        log.info(f"🔎 Google: {query}")

        start = time.time()
        try:
            self._driver.get(url)
            # Attendre que les résultats soient rendus (bloc div#search ou body)
            WebDriverWait(self._driver, 15).until(
                EC.presence_of_element_located((By.TAG_NAME, "body"))
            )
            smart_delay(2.0, 4.0)
        except Exception as e:  # noqa: BLE001
            self._failures += 1
            if self._failures >= MAX_LOAD_FAILURES:
                log.warning("Google bloque l'IP (degradation au 300s / CAPTCHA / Sorry) : "
                            "circuit breaker ON, les recherches Google seront ignorees")
                self._blocked = True
            log.error(f"Erreur chargement Google: {e}")
            return []
        elapsed = time.time() - start
        log.debug(f"Page chargée en {elapsed:.2f}s")

        results = self._extract_results(num_results)
        log.debug(f"{len(results)} résultats extraits")
        return results

    def _duckduckgo_search(self, query: str, num_results: int) -> List[SearchResult]:
        """Recherche DuckDuckGo (HTML) : pas de navigateur, pas de clé API."""
        if getattr(self, "_ddg_blocked", False):
            log.debug("DuckDuckGo bloque precedemment (circuit breaker) : recherche ignoree")
            return []
        url = "https://html.duckduckgo.com/html/"
        headers = {
            "User-Agent": random.choice(USER_AGENTS),
            "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        }
        log.info(f"🔎 DuckDuckGo: {query}")
        try:
            resp = requests.get(url, params={"q": query, "kl": "fr-fr"},
                                headers=headers, timeout=20)
            if resp.status_code != 200:
                raise RuntimeError(f"HTTP {resp.status_code}")
            soup = BeautifulSoup(resp.text, "html.parser")
            blocks = soup.select("div.result")
            if not blocks:
                self._ddg_failures += 1
                if self._ddg_failures >= MAX_LOAD_FAILURES:
                    self._ddg_blocked = True
                    log.warning("DuckDuckGo ne retourne plus de résultats : "
                                "circuit breaker ON")
                return []
            results: List[SearchResult] = []
            seen_urls = set()
            for block in blocks:
                if len(results) >= num_results:
                    break
                link = block.select_one("a.result__a")
                if not link:
                    continue
                href = link.get("href", "")
                result_url = self._clean_ddg_url(href)
                if not result_url or result_url in seen_urls:
                    continue
                title = link.get_text(" ", strip=True)[:200]
                if self._is_noise(result_url, title):
                    continue
                snippet_el = block.select_one(".result__snippet")
                snippet = (snippet_el.get_text(" ", strip=True)[:500]
                           if snippet_el else "")
                seen_urls.add(result_url)
                results.append(SearchResult(
                    title=title, url=result_url, snippet=snippet,
                    position=len(results) + 1,
                ))
            self._ddg_failures = 0
            smart_delay(1.0, 2.5)
            log.debug(f"{len(results)} résultats DuckDuckGo extraits")
            return results
        except Exception as e:  # noqa: BLE001
            self._ddg_failures += 1
            if self._ddg_failures >= MAX_LOAD_FAILURES:
                self._ddg_blocked = True
                log.warning("DuckDuckGo inaccessible : circuit breaker ON")
            log.error(f"Erreur DuckDuckGo: {e}")
            return []

    @staticmethod
    def _clean_ddg_url(href: str) -> Optional[str]:
        """Décode les URLs de redirection DuckDuckGo (/l/?uddg=...)."""
        if not href or href.startswith("javascript:") or href.startswith("mailto:"):
            return None
        if href.startswith("//"):
            href = "https:" + href
        parsed = urlparse(href)
        if "duckduckgo.com" in parsed.netloc and parsed.path.startswith("/l/"):
            params = parse_qs(parsed.query)
            if "uddg" in params and params["uddg"]:
                return unquote(params["uddg"][0])
        return href

    def _extract_results(self, num_results: int) -> List[SearchResult]:
        """Extraction des résultats organiques.

        Google sert désormais des liens de redirection opaques
        (`/goto?url=CAES...`) impossibles à décoder. On lit donc le domaine
        affiché dans le `<cite>` du bloc de résultat, ce qui suffit pour la
        découverte (on ne visite que la racine du site).
        """
        results: List[SearchResult] = []
        seen_urls = set()

        # --- Layout actuel : h3 dans un bloc div[data-ved] + <cite> ---
        try:
            headings = self._driver.find_elements(By.TAG_NAME, "h3")
        except Exception:  # noqa: BLE001
            headings = []

        for h3 in headings:
            if len(results) >= num_results:
                break
            try:
                title = (h3.text or "").strip()
                block = h3.find_element(By.XPATH, "./ancestor::div[@data-ved][1]")
                url = None
                for cite in block.find_elements(By.TAG_NAME, "cite"):
                    url = self._url_from_cite(
                        cite.text or cite.get_attribute("innerText") or "")
                    if url:
                        break
                if not url or url in seen_urls or self._is_noise(url, title):
                    continue
                if not title:
                    title = url.split("//", 1)[-1].split("/")[0]
                snippet = ""
                try:
                    lines = [ln.strip() for ln in block.text.splitlines() if ln.strip()]
                    lines = [ln for ln in lines
                             if ln != title and "›" not in ln
                             and not ln.startswith("http")
                             and not re.fullmatch(r"[a-z0-9.-]+\.[a-z]{2,}",
                                                  ln, re.IGNORECASE)
                             and ln.lower() not in ("résultats web", "web results")]
                    snippet = " ".join(lines)[:500]
                except Exception:  # noqa: BLE001
                    pass
                seen_urls.add(url)
                results.append(SearchResult(
                    title=title[:200], url=url, snippet=snippet,
                    position=len(results) + 1,
                ))
            except Exception:  # noqa: BLE001
                continue

        if results:
            return results

        # --- Ancien layout / repli : liens <a href="/url?q=..."> ---
        try:
            links = self._driver.find_elements(By.XPATH, "//a[@href]")
        except Exception:  # noqa: BLE001
            return results

        for link in links:
            if len(results) >= num_results:
                break
            try:
                href = link.get_attribute("href") or ""
                url = self._clean_google_url(href)
                if not url or url in seen_urls:
                    continue
                if self._is_noise(url, link.text):
                    continue
                # Titre et snippet à partir des éléments parents
                title = link.text.strip() or url
                snippet = ""
                try:
                    parent = link.find_element(By.XPATH, "..")
                    snippet = parent.text.strip()
                    # Enlève le titre du snippet pour ne garder que la description
                    if snippet.startswith(title):
                        snippet = snippet[len(title):].strip()
                except Exception:  # noqa: BLE001
                    pass
                seen_urls.add(url)
                results.append(SearchResult(
                    title=title[:200], url=url, snippet=snippet[:500],
                    position=len(results) + 1,
                ))
            except Exception:  # noqa: BLE001
                continue
        return results

    @staticmethod
    def _url_from_cite(text: str) -> Optional[str]:
        """Extrait une URL depuis le texte affiché d'un <cite> Google.

        Exemples : ``https://yuzuleads.com › cold-emailing`` ou
        ``www.growth-prospect.com``.
        """
        text = (text or "").strip()
        if not text:
            return None
        match = re.search(r"https?://[^\s›]+", text)
        if match:
            return match.group(0).rstrip(".,;")
        match = re.search(r"\b([a-z0-9][a-z0-9.-]+\.[a-z]{2,})\b",
                          text, re.IGNORECASE)
        if match:
            return f"https://{match.group(1)}"
        return None

    @staticmethod
    def _clean_google_url(href: str) -> Optional[str]:
        """Décode les URLs de redirection Google (/url?q=...) et les doublons."""
        if not href or href.startswith(("javascript:", "mailto:", "tel:", "sms:",
                                       "data:")):
            return None
        if "/url?q=" in href:
            parsed = parse_qs(urlparse(href).query)
            if "q" in parsed and parsed["q"]:
                href = parsed["q"][0]
        if not href.startswith(("http://", "https://")):
            return None
        return href

    @staticmethod
    def _is_noise(url: str, text: str) -> bool:
        """Filtre les liens non organiques (images, maps, outils, calendriers...)."""
        noise_domains = (
            "google.", "youtube.com", "gstatic.", "accounts.google",
            "maps.google", "support.google", "policies.google",
            "webcache.googleusercontent", "cal.com", "calendly.com",
            "savvycal.com", "doodle.com", "zoom.us", "meet.google.com",
            "teams.microsoft.com", "wa.me", "api.whatsapp.com", "t.me",
            "linktr.ee", "bit.ly", "tinyurl.com", "goo.gl", "forms.gle",
            "docs.google.com", "drive.google.com", "notion.so", "notion.site",
            "airtable.com", "typeform.com", "hubspot.com", "klaviyo.com",
            "mailchimp.com", "salesforce.com", "pipedrive.com", "zapier.com",
            "make.com", "n8n.io", "openai.com", "anthropic.com",
        )
        for nd in noise_domains:
            if nd in url:
                return True
        return False
