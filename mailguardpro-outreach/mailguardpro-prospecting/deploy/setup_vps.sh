#!/usr/bin/env bash
# ============================================================
# MailGuard Pro prospecting — installation VPS (Ubuntu/Debian)
#
# Usage :
#   bash deploy/setup_vps.sh
#
# Le script est idempotent : il peut être relancé sans casser
# l'environnement existant. Il ne touche pas à un .env déjà présent.
# ============================================================
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  fi
fi

echo "==> 1/6 Paquets système"
if command -v apt-get >/dev/null 2>&1; then
  $SUDO apt-get update
  $SUDO apt-get install -y python3 python3-venv python3-pip git curl \
    cron util-linux logrotate
  # sqlite3 CLI est optionnel : backup.sh utilise le module Python sqlite3.
  $SUDO apt-get install -y sqlite3 || true
else
  echo "apt-get absent : installez Python 3.10+, venv, git, cron et flock manuellement."
fi

echo "==> 2/6 Vérification Python"
PYTHON_BIN="${PYTHON_BIN:-python3}"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "ERREUR : $PYTHON_BIN introuvable." >&2
  exit 1
fi
"$PYTHON_BIN" - <<'PY'
import sys
if sys.version_info < (3, 10):
    raise SystemExit("Python 3.10+ requis, trouvé %s" % sys.version.split()[0])
print("Python OK :", sys.version.split()[0])
PY

echo "==> 3/6 Environnement virtuel"
if [ ! -d .venv ]; then
  "$PYTHON_BIN" -m venv .venv
fi
# shellcheck disable=SC1091
. .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt

echo "==> 4/6 Répertoires de données"
mkdir -p data/output data/exports data/logs data/backups
chmod 700 data data/output data/exports data/logs data/backups || true

echo "==> 5/6 Fichier .env"
if [ ! -f .env ]; then
  cp deploy/env.vps.example .env
  chmod 600 .env
  echo "Créé .env depuis deploy/env.vps.example — à éditer avant le premier run."
else
  echo ".env existe déjà, non écrasé."
  chmod 600 .env || true
fi

echo "==> 6/6 Permissions et contrôles"
chmod +x deploy/*.sh || true

if command -v google-chrome >/dev/null 2>&1 \
   || command -v chromium >/dev/null 2>&1 \
   || command -v chromium-browser >/dev/null 2>&1; then
  echo "Chrome/Chromium détecté : découverte Google possible (si l'IP n'est pas bloquée)."
else
  echo "Chrome/Chromium absent : la découverte web sera désactivée par défaut."
  echo "La découverte par annuaires (run_scale.py) fonctionne sans navigateur."
fi

if ! command -v flock >/dev/null 2>&1; then
  echo "ATTENTION : flock absent. Installez util-linux (apt-get install util-linux)."
fi

echo
echo "Tests unitaires (peut prendre ~1 min) :"
if python -m pytest -q; then
  echo "Tests OK."
else
  echo "ERREUR : tests en échec — corrigez avant le premier run." >&2
  exit 1
fi

cat <<'EOF'

============================================================
Installation terminée.

Prochaines étapes :
  1. Éditer .env :
       nano .env
     Vérifier LLM_PROVIDER, DRY_RUN=true, SENDER_EMAIL.
  2. Tester le pipeline :
       bash deploy/run_daily.sh
  3. Lire le runbook :
       less deploy/VPS_RUNBOOK.md
  4. Installer le cron :
       crontab -e
     puis copier la ligne de deploy/crontab.example.

============================================================
EOF
