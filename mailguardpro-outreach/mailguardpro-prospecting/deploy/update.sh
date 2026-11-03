#!/usr/bin/env bash
# Met à jour le code et les dépendances Python.
#
# Usage:
#   ./deploy/update.sh
#   RUN_TESTS=1 ./deploy/update.sh
#
# Si le répertoire n'est pas un dépôt git, la mise à jour du code est laissée
# à l'utilisateur ; les dépendances Python sont quand même réinstallées.

set -euo pipefail

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
require_venv

if git -C "${APP_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    log "git pull --ff-only"
    git -C "${APP_DIR}" pull --ff-only
else
    log "Pas de dépôt git détecté : mise à jour du code manuelle."
fi

log "Installation des dépendances"
"${PYTHON}" -m pip install -r "${APP_DIR}/requirements.txt"

if [[ "${RUN_TESTS:-0}" == "1" ]]; then
    log "Suite de tests"
    "${PYTHON}" -m pytest -q
fi

log "Mise à jour terminée"
