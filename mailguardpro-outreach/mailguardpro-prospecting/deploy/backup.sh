#!/usr/bin/env bash
# ============================================================
# MailGuard Pro prospecting — sauvegarde locale
#
# Usage :
#   bash deploy/backup.sh
#
# - copie cohérente de la base SQLite (API backup, pas de copie brute)
# - archive des exports CSV/Markdown
# - conservation 14 jours
# ============================================================
set -euo pipefail
umask 027

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

if [ -f .env ]; then
  sed -i 's/\r$//' .env 2>/dev/null || true
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

PYTHON="${PYTHON:-$PROJECT_DIR/.venv/bin/python}"
if [ ! -x "$PYTHON" ]; then
  echo "ERREUR : Python introuvable ($PYTHON)." >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-data/backups}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR" || true
STAMP="$(date +%Y-%m-%d_%H%M)"

if [ -f data/output/crm.db ]; then
  "$PYTHON" - "$BACKUP_DIR/crm-$STAMP.db" <<'PY'
import sqlite3
import sys

src = sqlite3.connect("data/output/crm.db")
dst = sqlite3.connect(sys.argv[1])
with dst:
    src.backup(dst)
dst.close()
src.close()
print("CRM backup:", sys.argv[1])
PY
else
  echo "Pas de CRM à sauvegarder (data/output/crm.db absent)."
fi

if [ -d data/exports ] && [ -n "$(ls -A data/exports 2>/dev/null || true)" ]; then
  tar -czf "$BACKUP_DIR/exports-$STAMP.tar.gz" -C data exports
  echo "Exports backup: $BACKUP_DIR/exports-$STAMP.tar.gz"
fi

# Conservation 14 jours
find "$BACKUP_DIR" -type f -mtime +14 -delete 2>/dev/null || true

echo "Sauvegarde terminée dans $BACKUP_DIR"
