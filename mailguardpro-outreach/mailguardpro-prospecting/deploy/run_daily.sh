#!/usr/bin/env bash
# ============================================================
# MailGuard Pro prospecting — run quotidien (cron-friendly)
#
# Usage :
#   bash deploy/run_daily.sh
#   bash deploy/run_daily.sh --dry-run     (force DRY_RUN)
#
# - charge .env et acquiert le verrou via deploy/_common.sh
# - log dans data/logs/run-YYYY-MM-DD_HHMM.log
# - ne fait JAMAIS d'envoi réel si DRY_RUN != false
# ============================================================
set -euo pipefail

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
require_venv

# ------------------------------------------------------------
# Arguments
# ------------------------------------------------------------
FORCE_DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) FORCE_DRY_RUN=true ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      echo "Argument inconnu : $arg" >&2
      exit 2
      ;;
  esac
done

if [ "$FORCE_DRY_RUN" = "true" ]; then
  DRY_RUN=true
fi

# ------------------------------------------------------------
# Valeurs par défaut
# ------------------------------------------------------------
DISCOVERY_LIMIT="${DISCOVERY_LIMIT:-100}"
QUALIFY_LIMIT="${QUALIFY_LIMIT:-150}"
ENRICH_LIMIT="${ENRICH_LIMIT:-50}"
VERIFY_LIMIT="${VERIFY_LIMIT:-100}"
VERIFY_WORKERS="${VERIFY_WORKERS:-8}"
PERSONALIZE_LIMIT="${PERSONALIZE_LIMIT:-30}"
FOLLOWUP_LIMIT="${FOLLOWUP_LIMIT:-20}"
EXPORT_MIN_SCORE="${EXPORT_MIN_SCORE:-70}"
SCALE_LIMIT="${SCALE_LIMIT:-100}"
SCALE_WORKERS="${SCALE_WORKERS:-4}"
ENABLE_WEB_DISCOVERY="${ENABLE_WEB_DISCOVERY:-false}"
LOG_DIR="${LOG_DIR:-data/logs}"
DRY_RUN="${DRY_RUN:-true}"

mkdir -p "$LOG_DIR" data/output data/exports

STAMP="$(date +%Y-%m-%d_%H%M)"
LOG_FILE="$LOG_DIR/run-$STAMP.log"

log() {
  echo "[$(date -Is)] $*" | tee -a "$LOG_FILE"
}

run_stage() {
  local label="$1"
  shift
  log "--- $label ---"
  if "$@" >>"$LOG_FILE" 2>&1; then
    log "OK : $label"
  else
    log "WARN : $label a échoué (on continue)"
  fi
}

# ------------------------------------------------------------
# Run
# ------------------------------------------------------------
log "============================================================"
log "MailGuard Pro prospecting — run quotidien"
log "LLM_PROVIDER=${LLM_PROVIDER:-opencode}  DRY_RUN=$DRY_RUN"
log "Limites : discovery=$DISCOVERY_LIMIT qualify=$QUALIFY_LIMIT enrich=$ENRICH_LIMIT personalize=$PERSONALIZE_LIMIT"
log "============================================================"

# 1. Découverte par annuaires : fiable depuis un VPS, sans navigateur.
run_stage "Découverte annuaires" \
  "$PYTHON" run_scale.py --source agences \
  --workers "$SCALE_WORKERS" --limit "$SCALE_LIMIT"

# 2. Découverte web (Google/DDG) : optionnelle, souvent bloquée sur VPS.
if [ "$ENABLE_WEB_DISCOVERY" = "true" ]; then
  run_stage "Découverte web" \
    "$PYTHON" run.py --stage discovery --limit "$DISCOVERY_LIMIT"
else
  log "Découverte web désactivée (ENABLE_WEB_DISCOVERY=false)"
fi

# 3. Qualification (LLM ou heuristique).
run_stage "Qualification" \
  "$PYTHON" run.py --stage qualify --limit "$QUALIFY_LIMIT"

# 4. Enrichissement des entreprises qualifiées.
run_stage "Enrichissement" \
  "$PYTHON" run.py --stage enrich --limit "$ENRICH_LIMIT"

# 5. Vérification MX/SMTP des emails récoltés.
run_stage "Vérification emails" \
  "$PYTHON" verify_emails.py --limit "$VERIFY_LIMIT" --workers "$VERIFY_WORKERS"

# 6. Brouillons personnalisés.
run_stage "Personnalisation" \
  "$PYTHON" run.py --stage personalize --limit "$PERSONALIZE_LIMIT"

# 7. Relances J+3 (uniquement si des messages ont été envoyés).
run_stage "Relances" \
  "$PYTHON" run.py --stage followups --limit "$FOLLOWUP_LIMIT"

# 8. Export CSV + Markdown pour revue humaine.
run_stage "Export" \
  "$PYTHON" export_prospects.py --min-score "$EXPORT_MIN_SCORE"

# 9. Envoi réel uniquement si DRY_RUN=false.
if [ "$DRY_RUN" = "false" ]; then
  run_stage "Envoi Resend" "$PYTHON" run.py --stage send
else
  log "DRY_RUN=true : aucun email envoyé (les brouillons restent dans le CRM)."
fi

# 10. Nettoyage des vieux logs (30 jours).
find "$LOG_DIR" -type f -name "run-*.log" -mtime +30 -delete 2>/dev/null || true

log "============================================================"
log "Run terminé. Log : $LOG_FILE"
log "Exports : data/exports/"
log "============================================================"
