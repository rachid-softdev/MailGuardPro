"""
Notifications : résumé du run envoyé sur un webhook Discord (optionnel).
"""

from typing import Dict, Optional

import requests

from .config import get_env
from .utils import log


def send_discord_summary(summary: Dict[str, Dict]) -> bool:
    """Envoie le résumé du run sur Discord. Retourne True si envoyé."""
    webhook_url = get_env("DISCORD_WEBHOOK_URL")
    if not webhook_url:
        log.debug("DISCORD_WEBHOOK_URL non configurée, notification ignorée")
        return False

    lines = ["## 🤖 Run agent de prospection"]
    for stage, data in summary.items():
        if isinstance(data, dict):
            parts = " | ".join(f"{k}: {v}" for k, v in data.items())
            lines.append(f"**{stage}**: {parts}")
        else:
            lines.append(f"**{stage}**: {data}")

    try:
        resp = requests.post(webhook_url, json={"content": "\n".join(lines)}, timeout=15)
        if resp.status_code in (200, 204):
            log.success("Notification Discord envoyée")
            return True
        log.warning(f"Discord HTTP {resp.status_code}")
        return False
    except requests.RequestException as e:
        log.warning(f"Échec notification Discord: {e}")
        return False
