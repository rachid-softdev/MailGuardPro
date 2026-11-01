"""
Configuration globale : chargement des fichiers JSON (icp, campaigns),
variables d'environnement et chemins du projet.
"""

import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = PROJECT_ROOT / "config"
DATA_DIR = PROJECT_ROOT / "data"
OUTPUT_DIR = DATA_DIR / "output"
PROGRESS_DIR = OUTPUT_DIR / "progress"
CRM_DB_PATH = OUTPUT_DIR / "crm.db"
LOCK_PATH = PROGRESS_DIR / "runner.lock"
ENV_PATH = PROJECT_ROOT / ".env"


class ConfigError(Exception):
    pass


def load_json(path: Path) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_icp() -> Dict[str, Any]:
    return load_json(CONFIG_DIR / "icp.json")


def load_campaigns() -> Dict[str, Any]:
    return load_json(CONFIG_DIR / "campaigns.json")


def load_prompt(name: str) -> str:
    path = CONFIG_DIR / "prompts" / f"{name}.md"
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _load_env_file():
    """Charge .env si présent (sans écraser les variables déjà définies)."""
    if not ENV_PATH.exists():
        return
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_env_file()


def get_env(key: str, default: Optional[str] = None) -> Optional[str]:
    return os.environ.get(key, default)


def get_env_bool(key: str, default: bool = False) -> bool:
    val = get_env(key)
    if val is None:
        return default
    return val.strip().lower() in ("1", "true", "yes", "on")


def get_env_int(key: str, default: int) -> int:
    val = get_env(key)
    if val is None:
        return default
    try:
        return int(val)
    except ValueError:
        return default


def is_dry_run() -> bool:
    """DRY_RUN=true par défaut : rien ne part tant que ce n'est pas explicitement false."""
    return get_env_bool("DRY_RUN", default=True)


def is_heuristic() -> bool:
    """True si le LLM est désactivé : scoring et rédaction locales."""
    return (get_env("LLM_PROVIDER") or "").strip().lower() in (
        "heuristic", "none", "off", "local",
    )


def is_configured() -> bool:
    """True si les clés essentielles sont présentes."""
    return bool(get_env("OPENROUTER_API_KEY") and get_env("RESEND_API_KEY"))
