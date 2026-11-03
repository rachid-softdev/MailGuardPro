#!/usr/bin/env bash
# Exécute une étape du pipeline avec le venv et le verrou cron.
#
# Usage:
#   ./deploy/run_stage.sh stats
#   ./deploy/run_stage.sh qualify 10
#   ./deploy/run_stage.sh personalize 10
#   ./deploy/run_stage.sh send

set -euo pipefail

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
require_venv

STAGE="${1:-}"
if [[ -z "${STAGE}" ]]; then
    echo "Usage: $0 <stage> [limit]" >&2
    exit 2
fi

LIMIT="${2:-}"
ARGS=(--stage "${STAGE}")
if [[ -n "${LIMIT}" ]]; then
    ARGS+=(--limit "${LIMIT}")
fi

log "run.py ${ARGS[*]}"
exec "${PYTHON}" "${APP_DIR}/run.py" "${ARGS[@]}"
