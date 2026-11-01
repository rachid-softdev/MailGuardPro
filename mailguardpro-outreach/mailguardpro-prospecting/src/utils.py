"""
Utilitaires partagés : logger coloré (pattern CommuneScraper), retry, delays.
"""

import os
import random
import time
from typing import Callable, TypeVar, Optional

T = TypeVar("T")

_DEBUG = os.environ.get("DEBUG", "").strip().lower() in ("1", "true")

EMOJI_MAP = {
    "INFO": "ℹ️",
    "SUCCESS": "✅",
    "WARNING": "⚠️",
    "ERROR": "❌",
    "DEBUG": "🔍",
    "SEARCH": "🔎",
    "WEB": "🌐",
    "EMAIL": "✉️",
    "FILE": "📁",
    "SAVE": "💾",
    "TIME": "⏱️",
    "DATA": "📊",
    "CONFIG": "⚙️",
    "SCRAPE": "🕷️",
    "VALIDATE": "🛡️",
    "SELENIUM": "🧭",
    "AGENT": "🤖",
}


class Logger:
    def __init__(self, debug: bool = False):
        self.debug_enabled = debug

    def _emit(self, message: str, level: str = "INFO") -> None:
        emoji = EMOJI_MAP.get(level, "ℹ️")
        timestamp = time.strftime("%H:%M:%S")
        print(f"{emoji} [{timestamp}] {message}", flush=True)

    def info(self, message: str) -> None:
        self._emit(message, "INFO")

    def success(self, message: str) -> None:
        self._emit(message, "SUCCESS")

    def warning(self, message: str) -> None:
        self._emit(message, "WARNING")

    def error(self, message: str) -> None:
        self._emit(message, "ERROR")

    def debug(self, message: str) -> None:
        if self.debug_enabled:
            self._emit(message, "DEBUG")


log = Logger(debug=_DEBUG)


def smart_delay(min_sec: float = 2.0, max_sec: float = 5.0) -> None:
    delay = random.uniform(min_sec, max_sec)
    log.debug(f"Délai de {delay:.2f}s")
    time.sleep(delay)


def with_retry(
    fn: Callable[[], T],
    retries: int = 3,
    base_delay: float = 2.0,
    max_delay: float = 30.0,
    on_error: Optional[Callable[[Exception], None]] = None,
) -> Optional[T]:
    """Exécute fn avec retry exponentiel. Retourne None si échec définitif."""
    delay = base_delay
    for attempt in range(1, retries + 1):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001 - on retente tout type d'erreur réseau
            if on_error:
                on_error(e)
            if attempt == retries:
                log.warning(f"Échec définitif après {retries} tentatives: {e}")
                return None
            log.warning(f"Tentative {attempt}/{retries} échouée ({e}), retry dans {delay:.1f}s")
            time.sleep(delay)
            delay = min(delay * 2, max_delay)
    return None


def normalize_domain(url_or_domain: str) -> str:
    """Extrait le domaine propre (ex: https://www.Example.fr/ -> example.fr)."""
    url_or_domain = url_or_domain.strip().lower()
    if "://" in url_or_domain:
        url_or_domain = url_or_domain.split("://", 1)[1]
    if url_or_domain.startswith("www."):
        url_or_domain = url_or_domain[4:]
    url_or_domain = url_or_domain.split("/")[0].split("?")[0].split("#")[0]
    return url_or_domain.rstrip(".")
