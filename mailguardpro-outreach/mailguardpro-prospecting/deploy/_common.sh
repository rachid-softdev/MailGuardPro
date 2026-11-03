#!/usr/bin/env bash
# Helpers communs aux scripts de deploy/.
# Ce fichier est prévu pour être "source", pas exécuté directement.

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="${APP_DIR}/.venv/bin/python"

# Les checkpoints et exports utilisent des chemins relatifs au module.
cd "${APP_DIR}"

# Cron démarre avec un PATH minimal : on ajoute les emplacements usuels
# de Python, d'opencode (npm global) et des binaires locaux.
export PATH="${APP_DIR}/.venv/bin:/usr/local/bin:/usr/bin:/bin:${HOME}/.local/bin:${HOME}/.npm-global/bin:${PATH}"
export PYTHONUTF8=1
export PYTHONIOENCODING=utf-8
export TZ="${TZ:-Europe/Paris}"
umask 027

# Charge .env s'il existe. config.py le fait aussi, mais le faire ici permet
# de récupérer OPENCODE_BIN, les limites du run quotidien et TZ.
# Le sed rend le fichier tolérant aux copier-coller Windows (CRLF).
if [[ -f "${APP_DIR}/.env" ]]; then
    sed -i 's/\r$//' "${APP_DIR}/.env" 2>/dev/null || true
    set -a
    # shellcheck disable=SC1091
    source "${APP_DIR}/.env"
    set +a
fi

mkdir -p "${APP_DIR}/data/logs" \
         "${APP_DIR}/data/output/progress" \
         "${APP_DIR}/data/exports"

log() {
    printf '[%s] %s\n' "$(date -Is)" "$*"
}

require_venv() {
    if [[ ! -x "${PYTHON}" ]]; then
        log "ERREUR: venv absent (${PYTHON}). Lance d'abord ./deploy/setup_vps.sh"
        exit 1
    fi
}

# Verrou commun à tous les runs cron (daily, scale, stage...).
# SKIP_LOCK=1 permet à une sauvegarde SQLite de tourner pendant un run :
# l'API backup de SQLite est sûre en lecture concurrente.
if [[ "${SKIP_LOCK:-0}" != "1" ]]; then
    command -v flock >/dev/null 2>&1 || {
        log "ERREUR: flock introuvable (paquet util-linux)"
        exit 1
    }
    LOCK_FILE="${APP_DIR}/data/output/progress/cron.lock"
    exec 9>"${LOCK_FILE}"
    if ! flock -n 9; then
        log "Un autre run est déjà en cours, abandon"
        exit 0
    fi
fi
