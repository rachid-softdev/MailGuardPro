#!/usr/bin/env bash
# Découverte à grande échelle depuis un annuaire, avec checkpoint.
#
# Usage:
#   ./deploy/run_scale.sh agences 100 4
#   ./deploy/run_scale.sh expert 200 4
#   ./deploy/run_scale.sh webstratege 100 2
#   ./deploy/run_scale.sh agences 0 4      # 0 = toutes les fiches restantes
#
# Sources : agences, expert, webstratege, local.

set -euo pipefail

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
require_venv

SOURCE="${1:-agences}"
LIMIT="${2:-100}"
WORKERS="${3:-4}"

log "run_scale.py --source ${SOURCE} --limit ${LIMIT} --workers ${WORKERS}"
exec "${PYTHON}" "${APP_DIR}/run_scale.py" \
    --source "${SOURCE}" \
    --workers "${WORKERS}" \
    --limit "${LIMIT}"
