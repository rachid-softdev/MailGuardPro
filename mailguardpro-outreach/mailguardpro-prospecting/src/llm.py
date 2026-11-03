"""
Client LLM.

Backends sélectionnés via LLM_PROVIDER :
- `opencode`   (défaut) : CLI local `opencode`, aucune clé API.
- `openrouter`          : API REST OpenRouter.
- `openai`              : API compatible OpenAI (Ollama, vLLM, LM Studio...).
- `heuristic`           : aucun LLM, scoring/rédaction locales.

Utilisé pour : qualification, personnalisation, relances.
"""

import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

from .config import get_env, is_heuristic
from .utils import log, with_retry

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENAI_DEFAULT_BASE_URL = "http://127.0.0.1:11434/v1"
OPENAI_DEFAULT_MODEL = "qwen2.5:7b"
DEFAULT_MODEL = "openai/gpt-4o-mini"
DEFAULT_OPENCODE_MODEL = "opencode/big-pickle"
DEFAULT_OPENCODE_BIN = "opencode"
MAX_TOKENS = 1000

# Un appel opencode démarre une session agent complète : 10-25s réels,
# contre ~1s pour un appel REST. Timeout large obligatoire.
OPENCODE_TIMEOUT = 180

PROVIDER_OPENCODE = "opencode"
PROVIDER_OPENROUTER = "openrouter"
PROVIDER_OPENAI = "openai"
PROVIDER_HEURISTIC = "heuristic"
VALID_PROVIDERS = (PROVIDER_OPENCODE, PROVIDER_OPENROUTER,
                   PROVIDER_OPENAI, PROVIDER_HEURISTIC)


class LLMError(Exception):
    pass


def get_provider() -> str:
    """Backend LLM actif. Une valeur inconnue retombe sur opencode + warning."""
    raw = (get_env("LLM_PROVIDER") or PROVIDER_OPENCODE).strip().lower()
    if raw not in VALID_PROVIDERS:
        log.warning(f"LLM_PROVIDER inconnu ({raw!r}), repli sur {PROVIDER_OPENCODE!r}")
        return PROVIDER_OPENCODE
    return raw


def get_model() -> str:
    provider = get_provider()
    if provider == PROVIDER_OPENROUTER:
        return get_env("LLM_MODEL", DEFAULT_MODEL) or DEFAULT_MODEL
    if provider == PROVIDER_OPENAI:
        return get_env("LLM_MODEL", OPENAI_DEFAULT_MODEL) or OPENAI_DEFAULT_MODEL
    if provider == PROVIDER_HEURISTIC:
        return "heuristic"
    return get_env("OPENCODE_MODEL", DEFAULT_OPENCODE_MODEL) or DEFAULT_OPENCODE_MODEL


# ---------------------------------------------------------------- opencode CLI


def _opencode_prompt(system_prompt: str, user_content: str) -> str:
    """Le CLI n'accepte qu'un seul message : on concatène système + contenu."""
    return f"{system_prompt.strip()}\n\n---\n\n{user_content.strip()}"


_SHIM_TARGET = re.compile(r'"([^"]+\.exe)"', re.IGNORECASE)


def _expand_shim_path(raw: str, shim_path: str) -> str:
    """
    Résout la variable de répertoire du shim npm.

    Le shim `.cmd` fait `SET dp0=%~dp0` puis utilise `"%dp0%\\..."` ; le `.ps1`
    utilise `$basedir`. On remplace ces variables par le dossier du shim.
    """
    base = str(Path(shim_path).parent)
    for var in ("%~dp0", "%dp0%", "$basedir"):
        if raw.lower().startswith(var.lower()):
            return os.path.normpath(base + raw[len(var):])
    return os.path.normpath(raw)


def _resolve_opencode_cmd(binary: str) -> List[str]:
    """
    Construit la commande d'invocation de opencode.

    Sous Windows, `npm install -g opencode` ne dépose qu'un shim `opencode.cmd`
    sur le PATH, que subprocess refuse d'exécuter. On lit ce shim (une ligne,
    généré par npm) pour récupérer le vrai `.exe`. S'il reste irrésolvable, on
    passe par cmd.exe — sans risque, le prompt passant par stdin et non argv.
    """
    for candidate in (f"{binary}.exe", binary):
        found = shutil.which(candidate)
        if not found:
            continue
        if found.lower().endswith(".exe"):
            return [found]
        if Path(found).suffix.lower() in (".cmd", ".bat", ".ps1"):
            try:
                content = Path(found).read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            match = _SHIM_TARGET.search(content)
            if match:
                target = _expand_shim_path(match.group(1), found)
                if Path(target).exists():
                    return [target]
            return [os.environ.get("COMSPEC", "cmd.exe"), "/d", "/c", found]
    return [binary]


def _parse_opencode_stream(stdout: str) -> str:
    """
    stdout est du JSONL (un objet par ligne). Le texte utile est dans les
    événements `type == "text"` (champ `part.text`) ; les événements
    `type == "error"` sont des échecs et doivent lever.
    """
    parts: List[str] = []
    for line in stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(event, dict):
            continue
        kind = event.get("type")
        if kind == "error":
            err = event.get("error") or {}
            detail = err.get("message") or json.dumps(err)[:200]
            raise LLMError(f"opencode: {detail}")
        if kind == "text":
            text = (event.get("part") or {}).get("text")
            if text and text.strip():
                parts.append(text.strip())

    if not parts:
        raise LLMError("opencode: aucune réponse texte dans la sortie")
    return "\n".join(parts)


def _chat_opencode(system_prompt: str, user_content: str) -> str:
    """
    Appelle le CLI opencode. `temperature` n'est pas supporté par le CLI :
    elle est volontairement ignorée ici (le prompt est déjà contraignant).
    """
    binary = get_env("OPENCODE_BIN", DEFAULT_OPENCODE_BIN) or DEFAULT_OPENCODE_BIN
    model = get_model()
    cmd = _resolve_opencode_cmd(binary) + ["run", "--format", "json",
                                          "--model", model, "--auto"]
    prompt = _opencode_prompt(system_prompt, user_content)
    log.debug(f"opencode: {model}")

    try:
        # encoding explicite : la locale Windows (cp1252) casse la sortie
        # opencode qui contient du français en UTF-8.
        proc = subprocess.run(cmd, input=prompt, capture_output=True, text=True,
                              encoding="utf-8", errors="replace",
                              timeout=OPENCODE_TIMEOUT)
    except FileNotFoundError as e:
        raise LLMError(f"binaire opencode introuvable ({binary})") from e
    except subprocess.TimeoutExpired as e:
        raise LLMError(f"opencode: timeout après {OPENCODE_TIMEOUT}s") from e

    stdout = proc.stdout or ""
    stderr = proc.stderr or ""

    # Le CLI émet les erreurs sous forme d'événements JSON *et* sort en code 1 :
    # il faut traiter stdout avant de regarder le code de retour.
    try:
        return _parse_opencode_stream(stdout)
    except LLMError:
        if proc.returncode != 0 and not stdout.strip():
            raise LLMError(
                f"opencode a échoué (code {proc.returncode}): {stderr.strip()[:300]}"
            )
        raise


# ------------------------------------------------------------------ openrouter


def _openrouter_headers() -> Dict[str, str]:
    api_key = get_env("OPENROUTER_API_KEY")
    if not api_key:
        raise LLMError("OPENROUTER_API_KEY non configurée")
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


def _chat_openrouter(system_prompt: str, user_content: str,
                     temperature: float) -> str:
    resp = requests.post(
        OPENROUTER_URL,
        headers=_openrouter_headers(),
        json={
            "model": get_model(),
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            "temperature": temperature,
            "max_tokens": MAX_TOKENS,
        },
        timeout=90,
    )
    if resp.status_code != 200:
        raise LLMError(f"OpenRouter HTTP {resp.status_code}: {resp.text[:300]}")
    return resp.json()["choices"][0]["message"]["content"]


# ------------------------------------------------------- API compatible OpenAI


def _chat_openai(system_prompt: str, user_content: str,
                 temperature: float) -> str:
    """Appelle une API compatible OpenAI (Ollama, vLLM, LM Studio, OpenRouter...)."""
    base_url = (get_env("OPENAI_BASE_URL") or OPENAI_DEFAULT_BASE_URL).rstrip("/")
    api_key = get_env("OPENAI_API_KEY") or "local"
    url = f"{base_url}/chat/completions"
    resp = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": get_model(),
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            "temperature": temperature,
            "max_tokens": MAX_TOKENS,
        },
        timeout=120,
    )
    if resp.status_code >= 400:
        raise LLMError(f"OpenAI-compatible HTTP {resp.status_code}: {resp.text[:300]}")
    data = resp.json()
    choices = data.get("choices") or []
    if not choices:
        raise LLMError("OpenAI-compatible: réponse sans choix")
    content = (choices[0].get("message") or {}).get("content") or ""
    if not content.strip():
        raise LLMError("OpenAI-compatible: réponse vide")
    return content


# ---------------------------------------------------------------- API publique


def chat(system_prompt: str, user_content: str,
         temperature: float = 0.3) -> Optional[str]:
    """Appelle le LLM configuré. Retourne le texte, ou None si échec définitif."""
    if is_heuristic():
        log.debug("LLM_PROVIDER=heuristic : appel LLM ignoré")
        return None

    provider = get_provider()

    if provider == PROVIDER_OPENROUTER:
        if not get_env("OPENROUTER_API_KEY"):
            log.warning("OPENROUTER_API_KEY non configurée, appel LLM ignoré")
            return None
        call = lambda: _chat_openrouter(system_prompt, user_content, temperature)  # noqa: E731
    elif provider == PROVIDER_OPENAI:
        call = lambda: _chat_openai(system_prompt, user_content, temperature)  # noqa: E731
    else:
        call = lambda: _chat_opencode(system_prompt, user_content)  # noqa: E731

    return with_retry(call, retries=3,
                      on_error=lambda e: log.warning(f"LLM: {e}"))


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    """Extrait un objet JSON du texte LLM (tolère markdown ```json ... ``` et texte autour)."""
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    log.warning(f"Impossible de parser le JSON LLM: {text[:200]}")
    return None


def chat_json(system_prompt: str, user_content: str,
              temperature: float = 0.3) -> Optional[Dict[str, Any]]:
    """Appel LLM avec extraction JSON. Retourne None si parsing impossible."""
    text = chat(system_prompt, user_content, temperature)
    if not text:
        return None
    return _extract_json(text)
