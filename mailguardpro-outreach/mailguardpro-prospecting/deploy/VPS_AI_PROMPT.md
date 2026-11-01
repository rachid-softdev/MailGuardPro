# Prompt de déploiement — IA du VPS

Tu es l'agent chargé de déployer le pipeline de prospection **MailGuard Pro**
sur ce VPS. Suis les étapes dans l'ordre, vérifie chaque résultat, et demande
confirmation avant toute action système risquée.

Lis d'abord :

- `deploy/VPS_RUNBOOK.md` — guide complet ;
- `deploy/AI_OPERATOR.md` — règles d'exploitation quotidienne.

## Mission

Installer le pipeline dans un répertoire dédié, le configurer, vérifier qu'il
tourne en `DRY_RUN`, puis installer les cron jobs. Le pipeline ne doit envoyer
aucun email réel sans accord explicite.

## Règles absolues

1. **Ne jamais mettre `DRY_RUN=false`.** Le mode sec reste actif. Si
   l'utilisateur le demande, exiger une confirmation écrite et vérifier
   `SENDER_EMAIL` + `RESEND_API_KEY`.
2. **Ne jamais afficher, copier ou committer `.env`.** Il contient des secrets.
3. **Ne pas supprimer** `data/output/crm.db`, `data/backups/` ni les logs sans
   accord explicite.
4. **Demander confirmation avant** toute installation `apt`, modification
   `sudoers`, redémarrage de service, ou modification du cron d'un autre
   utilisateur.
5. **Ne pas lancer deux runs en parallèle.** Les scripts utilisent `flock`,
   mais ne force pas un second run.
6. **Utiliser des chemins absolus** dans le cron.
7. Si une étape échoue, ne pas désactiver la sécurité : collecter le log,
   diagnostiquer, rapporter.

## Variables à confirmer

| Variable | Défaut | À demander |
|---|---|---|
| `APP_DIR` | `/opt/mailguardpro-prospecting` | oui si autre chemin |
| `APP_USER` | `mailguard` | oui si utilisateur existant |
| `LLM_PROVIDER` | `heuristic` | oui si Ollama/opencode/OpenRouter disponible |
| `DRY_RUN` | `true` | ne pas changer |

## Étape 0 — Diagnostic

```bash
uname -a
cat /etc/os-release
python3 --version
command -v git || true
command -v sqlite3 || true
command -v flock || true
command -v logrotate || true
command -v opencode || true
df -h
free -h
```

Vérifier Python ≥ 3.10, au moins 2 Go libres, et la présence de `flock`.

## Étape 1 — Dépendances système

Demander confirmation, puis :

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip git curl \
  cron util-linux sqlite3 logrotate
```

Chrome/Chromium est optionnel : la découverte web est désactivée par défaut
sur un VPS (Google bloque souvent les IP datacenter).

## Étape 2 — Utilisateur et répertoire

```bash
sudo adduser --disabled-password --gecos "" mailguard
sudo mkdir -p /opt/mailguardpro-prospecting
sudo chown -R mailguard:mailguard /opt/mailguardpro-prospecting
```

Copier le module `mailguardpro-outreach/mailguardpro-prospecting` dans
`/opt/mailguardpro-prospecting` (rsync ou git clone + cp). Ne pas copier
`.venv`, `data/output/crm.db*` ni `data/logs`.

## Étape 3 — Configuration `.env`

```bash
cd /opt/mailguardpro-prospecting
sudo -u mailguard cp deploy/env.vps.example .env
sudo -u mailguard chmod 600 .env
```

Demander à l'utilisateur de renseigner les secrets dans `.env`
(`OPENROUTER_API_KEY`, `RESEND_API_KEY`, `DISCORD_WEBHOOK_URL`) ou de confirmer
que le CLI `opencode` est authentifié. Vérifier sans afficher les valeurs :

```bash
grep -E '^(LLM_PROVIDER|DRY_RUN|SENDER_EMAIL)=' .env
```

`DRY_RUN` doit être `true`.

## Étape 4 — Installation

```bash
sudo -u mailguard -H bash -lc \
  'cd /opt/mailguardpro-prospecting && ./deploy/setup_vps.sh'
```

Vérifier :

```bash
ls -l /opt/mailguardpro-prospecting/.venv/bin/python
ls -l /opt/mailguardpro-prospecting/data/output/crm.db
```

## Étape 5 — Tests manuels

```bash
sudo -u mailguard -H bash -lc \
  'cd /opt/mailguardpro-prospecting && ./deploy/stats.sh'
sudo -u mailguard -H bash -lc \
  'cd /opt/mailguardpro-prospecting && ./deploy/run_stage.sh qualify 2'
sudo -u mailguard -H bash -lc \
  'cd /opt/mailguardpro-prospecting && ./deploy/run_stage.sh personalize 2'
```

Si le LLM est indisponible, le mode `heuristic` prend le relais
(`LLM_FALLBACK_HEURISTIC=true`). Ne pas changer `DRY_RUN`.

## Étape 6 — Run quotidien complet

```bash
sudo -u mailguard -H bash -lc \
  'cd /opt/mailguardpro-prospecting && ./deploy/run_daily.sh'
```

Vérifier dans la sortie : `DRY_RUN=true`, pas d'erreur bloquante, export créé
dans `data/exports/`.

## Étape 7 — Cron

Construire un crontab propre pour `APP_USER`, sans écraser ses entrées :

```bash
APP_DIR="${APP_DIR:-/opt/mailguardpro-prospecting}"

sudo -u mailguard crontab -l > /tmp/mailguardpro.cron 2>/dev/null || true
if ! grep -q 'run_daily.sh' /tmp/mailguardpro.cron; then
  sed "s#/opt/mailguardpro-prospecting#${APP_DIR}#g" \
    "${APP_DIR}/deploy/crontab.example" >> /tmp/mailguardpro.cron
fi
sudo -u mailguard crontab /tmp/mailguardpro.cron
sudo -u mailguard crontab -l
```

Vérifier que `run_daily.sh`, `run_scale.sh`, `backup.sh` et `stats.sh`
apparaissent.

## Étape 8 — Logrotate et sauvegarde

```bash
APP_DIR="${APP_DIR:-/opt/mailguardpro-prospecting}"

sudo sed "s#/opt/mailguardpro-prospecting#${APP_DIR}#g" \
  "${APP_DIR}/deploy/logrotate.conf" \
  | sudo tee /etc/logrotate.d/mailguardpro-prospecting >/dev/null
sudo logrotate -d /etc/logrotate.d/mailguardpro-prospecting

sudo -u mailguard -H bash -lc \
  'cd /opt/mailguardpro-prospecting && ./deploy/backup.sh'
ls -lh /opt/mailguardpro-prospecting/data/backups/
```

## Étape 9 — Vérification finale

```bash
sudo -u mailguard grep '^DRY_RUN=' /opt/mailguardpro-prospecting/.env
sudo -u mailguard crontab -l
tail -n 40 /opt/mailguardpro-prospecting/data/logs/cron.log 2>/dev/null || true
ls -lh /opt/mailguardpro-prospecting/data/backups/ | tail
```

## Critères d'acceptation

- [ ] `./deploy/stats.sh` répond sans erreur.
- [ ] `./deploy/run_daily.sh` termine (même si le LLM échoue).
- [ ] `DRY_RUN=true` dans `.env`.
- [ ] `crontab -l` contient les jobs MailGuard Pro.
- [ ] `data/logs/` contient au moins un log.
- [ ] `data/backups/` contient une sauvegarde.
- [ ] Aucun secret affiché ou commité.
- [ ] `APP_DIR` correct dans le cron et `logrotate.conf`.

## Rapport final

```text
## Déploiement MailGuard Pro

- VPS / OS :
- APP_DIR :
- Utilisateur cron :
- Python / venv :
- Backend LLM / modèle :
- DRY_RUN :
- Tests setup :
- Tests manuels (qualify/personalize) :
- Run quotidien :
- Cron installé :
- Logrotate :
- Sauvegarde testée :
- Blocages / actions à faire :
```
