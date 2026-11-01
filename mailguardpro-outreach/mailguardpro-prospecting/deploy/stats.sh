#!/usr/bin/env bash
# Affiche les statistiques du CRM.
#
# Usage: ./deploy/stats.sh

set -euo pipefail

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
require_venv

exec "${PYTHON}" "${APP_DIR}/run.py" --stage stats
