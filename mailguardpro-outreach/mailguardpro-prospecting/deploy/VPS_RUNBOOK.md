# Déploiement VPS — MailGuard Pro prospecting

Ce runbook explique comment installer, configurer et exploiter le pipeline de
prospection MailGuard Pro sur un VPS Linux (Ubuntu/Debian), avec un cron
quotidien, des logs, des sauvegardes et un mode de secours sans LLM.

> **Règle d'or : `DRY_RUN=true` tant que les brouillons n'ont pas été relus.**
> Le pipeline peut découvrir, qualifier, enrichir et rédiger sans envoyer
> aucun email.

---

## 1. Ce qui tourne sur le VPS

```
deploy/run_daily.sh
  ├── run_scale.py            découverte par annuaires (fiable, sans navigateur)
  ├── run.py --stage discovery découverte Google/DDG (optionnelle)
  ├── run.py --stage qualify   score 0-100 (LLM ou heuristique)
  ├── run.py --stage enrich    sites + décideurs + emails
  ├── verify_emails.py         vérification MX/SMTP
  ├── run.py --stage personalize brouillons FR/EN
  ├── run.py --stage followups relances J+3
  ├── export_prospects.py      CSV + Markdown pour revue
  └── run.py --stage send      uniquement si DRY_RUN=false
```

Le CRM est une base SQLite : `data/output/crm.db`.
Les exports sont dans `data/exports/`.
Les logs sont dans `data/logs/`.

---

## 2. Prérequis

- VPS Ubuntu 22.04/24.04 ou Debian 12 (2 Go de RAM minimum, 4 Go recommandés).
- Python 3.10+ (le script installe `python3`, `python3-venv`, `pip`).
- `git`, `curl`, `cron`, `flock` (`util-linux`).
- Un accès SSH et un utilisateur non-root avec `sudo`.
- Optionnel : Chrome/Chromium pour la découverte Google.
- Optionnel : une IA sur le VPS (opencode, Ollama, OpenRouter) ou le mode
  heuristique sans IA.

---

## 3. Copier le module sur le VPS

### Option A — depuis votre machine (rsync)

```bash
# Sur votre machine locale, depuis le dossier parent :
rsync -av --progress \
  --exclude '.venv' \
  --exclude 'data' \
  --exclude '.env' \
  --exclude '__pycache__' \
  mailguardpro-outreach/mailguardpro-prospecting/ \
  user@VOTRE_VPS:/opt/mailguardpro-prospecting/
```

### Option B — via git

```bash
ssh user@VOTRE_VPS
sudo mkdir -p /opt/mailguardpro-prospecting
sudo chown "$USER":"$USER" /opt/mailguardpro-prospecting
git clone VOTRE_REPO /tmp/mailguardpro
rsync -av --exclude '.venv' --exclude 'data' --exclude '.env' \
  /tmp/mailguardpro/mailguardpro-outreach/mailguardpro-prospecting/ \
  /opt/mailguardpro-prospecting/
```

> Le module est autonome : il n'a pas besoin du reste du repo MailGuardPro
> pour tourner.

---

## 4. Installation

```bash
cd /opt/mailguardpro-prospecting
bash deploy/setup_vps.sh
```

Le script :

1. installe les paquets système ;
2. vérifie Python 3.10+ ;
3. crée `.venv` et installe `requirements.txt` ;
4. crée `data/output`, `data/exports`, `data/logs`, `data/backups` ;
5. copie `deploy/env.vps.example` vers `.env` (si absent) et le passe en `600` ;
6. rend les scripts exécutables et lance les tests.

Si les tests échouent, corrigez avant de continuer.

---

## 5. Choisir l'IA du VPS

Le pipeline utilise un LLM pour la qualification, la personnalisation et les
relances. Quatre options, à configurer dans `.env`.

### Option A — opencode CLI (si déjà installé/authentifié)

```bash
opencode auth login
opencode models
```

`.env` :

```bash
LLM_PROVIDER=opencode
OPENCODE_MODEL=opencode/big-pickle
# OPENCODE_BIN=opencode
LLM_FALLBACK_HEURISTIC=true
```

> Le quota gratuit peut être épuisé. `LLM_FALLBACK_HEURISTIC=true` permet de
> continuer avec le scoring local au lieu de perdre les prospects.

### Option B — Ollama local (recommandé pour un VPS autonome)

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:7b
curl http://127.0.0.1:11434/v1/models
```

`.env` :

```bash
LLM_PROVIDER=openai
OPENAI_BASE_URL=http://127.0.0.1:11434/v1
OPENAI_API_KEY=ollama
LLM_MODEL=qwen2.5:7b
LLM_FALLBACK_HEURISTIC=true
```

- 8 Go de RAM : `qwen2.5:7b` (bon compromis qualité/vitesse).
- 4 Go de RAM : `qwen2.5:3b` (plus rapide, qualité moindre).
- Vérifier le service : `systemctl status ollama` et `ollama list`.

### Option C — OpenRouter

```bash
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-...
LLM_MODEL=openai/gpt-4o-mini
LLM_FALLBACK_HEURISTIC=true
```

### Option D — aucune IA (mode heuristique)

```bash
LLM_PROVIDER=heuristic
LLM_FALLBACK_HEURISTIC=true
```

Le scoring et les brouillons sont générés localement à partir de mots-clés et
de templates. C'est moins fin qu'un LLM, mais le pipeline reste opérationnel.
**Relire les brouillons avant tout envoi.**

---

## 6. Configurer `.env`

```bash
cd /opt/mailguardpro-prospecting
nano .env
chmod 600 .env
```

Variables importantes :

| Variable | Rôle | Défaut |
|---|---|---|
| `LLM_PROVIDER` | `opencode`, `openai`, `openrouter`, `heuristic` | `openai` |
| `LLM_FALLBACK_HEURISTIC` | secours local si le LLM échoue | `true` |
| `DRY_RUN` | `true` = aucun envoi | `true` |
| `SENDER_EMAIL` | adresse d'envoi Resend | `prospection@mailguard.pro` |
| `UNSUBSCRIBE_EMAIL` | adresse de désinscription | `unsubscribe@mailguard.pro` |
| `DAILY_SEND_LIMIT` | plafond d'envois/jour | `20` |
| `SCALE_LIMIT` | fiches annuaire/jour | `100` |
| `ENRICH_LIMIT` | entreprises enrichies/jour | `50` |
| `PERSONALIZE_LIMIT` | brouillons/jour | `30` |
| `EXPORT_MIN_SCORE` | score minimum exporté | `70` |
| `ENABLE_WEB_DISCOVERY` | Google/DDG sur VPS | `false` |

Ne mettez **jamais** `.env` dans git.

---

## 7. Premier run manuel

```bash
cd /opt/mailguardpro-prospecting
bash deploy/run_daily.sh
```

Le script :

- charge `.env` ;
- pose un verrou `flock` (pas de run concurrent) ;
- écrit dans `data/logs/run-YYYY-MM-DD_HHMM.log` ;
- continue même si une étape échoue (les erreurs sont dans le log).

Suivre en direct :

```bash
tail -f data/logs/run-*.log
```

À la fin :

```bash
.venv/bin/python run.py --stage stats
ls -lh data/exports/
```

Premier run attendu : 5 à 20 minutes selon la taille du VPS et le nombre de
sites à récolter.

---

## 8. Installer le cron

Le modèle complet est dans `deploy/crontab.example` :

```bash
crontab -e
```

Coller (adapter le chemin si besoin) :

```cron
15 7 * * * /opt/mailguardpro-prospecting/deploy/run_daily.sh >> /opt/mailguardpro-prospecting/data/logs/cron.log 2>&1
45 7 * * 1 /opt/mailguardpro-prospecting/deploy/run_scale.sh agences 100 4 >> /opt/mailguardpro-prospecting/data/logs/scale.log 2>&1
30 8 * * 0 /opt/mailguardpro-prospecting/deploy/backup.sh >> /opt/mailguardpro-prospecting/data/logs/backup.log 2>&1
0 9 * * * /opt/mailguardpro-prospecting/deploy/stats.sh >> /opt/mailguardpro-prospecting/data/logs/stats.log 2>&1
```

Vérifier :

```bash
crontab -l
chmod +x /opt/mailguardpro-prospecting/deploy/*.sh
```

Le lendemain :

```bash
tail -n 100 data/logs/cron.log
ls -lt data/logs/ | head
```

> Le script utilise des chemins absolus et charge `.env` lui-même : cron n'a
> pas besoin de connaître le venv ni les variables.

### Alternative systemd (plus propre pour les logs)

```bash
sudo cp deploy/mailguardpro-prospecting.service /etc/systemd/system/
sudo cp deploy/mailguardpro-prospecting.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mailguardpro-prospecting.timer
systemctl list-timers | grep mailguard
```

Le service fourni utilise `User=mailguard`. Créez l'utilisateur ou adaptez :

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin mailguard
sudo chown -R mailguard:mailguard /opt/mailguardpro-prospecting
```

Logs :

```bash
journalctl -u mailguardpro-prospecting.service -n 100 --no-pager
```

---

## 9. Logs, exports, sauvegardes

```bash
# Logs
ls -lt data/logs/
tail -f data/logs/run-*.log

# Exports
ls -lt data/exports/
# CSV : prospects-YYYY-MM-DD.csv
# Markdown : prospects-YYYY-MM-DD.md

# Statistiques CRM
.venv/bin/python run.py --stage stats

# Sauvegarde manuelle
bash deploy/backup.sh
```

`backup.sh` :

- copie cohérente de SQLite via l'API `sqlite3.backup` ;
- archive `data/exports` ;
- conserve 14 jours dans `data/backups/`.

Les sauvegardes contiennent des données personnelles : protégez-les
(`chmod 700 data/backups`, pas de dépôt git, pas de partage public).

### Rotation des logs

```bash
sudo cp deploy/logrotate.conf /etc/logrotate.d/mailguardpro-prospecting
sudo logrotate -d /etc/logrotate.d/mailguardpro-prospecting
```

### Reprendre le CRM local sur le VPS

Pour conserver le premier lot produit en local (ou migrer un CRM existant),
copiez la base et les exports par `scp` — jamais par git :

```bash
# Depuis la machine locale
scp data/output/crm.db user@vps:/opt/mailguardpro-prospecting/data/output/
scp -r data/exports/* user@vps:/opt/mailguardpro-prospecting/data/exports/

# Sur le VPS
chmod 600 data/output/crm.db
chmod 700 data/exports
.venv/bin/python run.py --stage stats
```

Le CRM contient des emails et des noms de contacts : traitez-le comme une
donnée personnelle (RGPD). Ne le committez jamais.

---

## 10. Découverte web sur un VPS

Par défaut, `ENABLE_WEB_DISCOVERY=false`. La découverte par annuaires
(`run_scale.py`) est fiable et ne nécessite pas de navigateur.

Pour tester Google :

```bash
# Installer Chrome (Ubuntu)
wget -q -O - https://dl.google.com/linux/linux_signing_key.pub \
  | sudo gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
  | sudo tee /etc/apt/sources.list.d/google-chrome.list
sudo apt-get update
sudo apt-get install -y google-chrome-stable

# Test limité
cd /opt/mailguardpro-prospecting
ENABLE_WEB_DISCOVERY=true .venv/bin/python run.py --stage discovery --limit 10
```

Si Google bloque l'IP datacenter, le pipeline bascule sur DuckDuckGo HTML, qui
peut aussi limiter. Dans ce cas, laissez `ENABLE_WEB_DISCOVERY=false`,
augmentez `SCALE_LIMIT`, et/ou alimentez `config/seed_domains.csv` avec des
agences ciblées (domaines publics, sans données personnelles) :

```bash
nano config/seed_domains.csv   # format : name,domain,market,country,city,sector,description
.venv/bin/python seed_prospects.py
```

---

## 11. Passer à l'envoi réel (plus tard)

**Ne pas activer tant que les brouillons n'ont pas été relus.**

1. Relire `data/exports/drafts-*.md`.
2. Créer un compte Resend et vérifier un domaine d'envoi.
3. Utiliser un sous-domaine dédié : `outbound.mailguard.pro`.
4. Configurer SPF, DKIM et DMARC.
5. Créer une clé API Resend.
6. Dans `.env` :

```bash
RESEND_API_KEY=re_...
SENDER_EMAIL="prospection@outbound.mailguard.pro"
SENDER_NAME="MailGuard Pro"
SENDER_SIGNATURE="L'équipe MailGuard Pro"
UNSUBSCRIBE_EMAIL="unsubscribe@outbound.mailguard.pro"
DRY_RUN=false
DAILY_SEND_LIMIT=20
```

7. Tester avec un petit lot :

```bash
.venv/bin/python run.py --stage send --limit 1
```

8. Vérifier la réception, les headers `List-Unsubscribe`, le footer STOP.
9. Augmenter progressivement `DAILY_SEND_LIMIT`.

Le sender ajoute automatiquement la signature, la mention STOP et le header
`List-Unsubscribe`. Les contacts `invalid` sont exclus.

---

## 12. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| `LLM indisponible` dans les logs | quota, Ollama arrêté, mauvaise URL | `systemctl status ollama`, tester `curl $OPENAI_BASE_URL/models`, ou `LLM_PROVIDER=heuristic` |
| `0 qualified` | seuil trop haut ou scoring trop strict | vérifier `config/icp.json` (`min_score_to_qualify`) et les logs de score ; ne baisser qu'après revue |
| Google renvoie 0 résultat | IP datacenter bloquée | `ENABLE_WEB_DISCOVERY=false`, utiliser les annuaires |
| `flock: command not found` | `util-linux` absent | `sudo apt-get install util-linux` |
| `Permission denied` | scripts non exécutables | `chmod +x deploy/*.sh` |
| `database is locked` | un autre run tourne | `ps aux | grep run.py`, attendre ; le verrou `flock` évite les chevauchements |
| `No space left on device` | logs/backups trop gros | `df -h`, nettoyer `data/logs`, `data/backups` |
| SMTP très lent | port 25 bloqué par l'hébergeur | le script retombe sur MX ; ou `--no-smtp` pour un run rapide |
| `UnicodeEncodeError` | locale non UTF-8 | `export PYTHONUTF8=1` avant le run |
| Cron ne fait rien | chemin ou permission | tester `bash deploy/run_daily.sh` manuellement, vérifier `crontab -l` et `data/logs/cron.log` |

Commandes utiles :

```bash
cd /opt/mailguardpro-prospecting
.venv/bin/python run.py --stage stats
.venv/bin/python run_scale.py --stats
.venv/bin/python verify_emails.py --stats
tail -n 200 data/logs/run-*.log
```

---

## 13. Mettre à jour

```bash
cd /opt/mailguardpro-prospecting
# Si le module est un dépôt git :
RUN_TESTS=1 bash deploy/update.sh
# Sinon : rsync depuis votre machine, puis :
. .venv/bin/activate
pip install -r requirements.txt
python -m pytest -q
bash deploy/run_daily.sh --dry-run
```

Si vous utilisez `rsync`, excluez toujours `.env`, `data` et `.venv`.

---

## 14. Sécurité et RGPD

- `.env` en `chmod 600`, jamais dans git.
- Le CRM et les exports contiennent des données personnelles : ils sont
  ignorés par `.gitignore`.
- Conservez la source et la date de découverte pour répondre aux demandes
  d'accès/suppression.
- Chaque email contient une mention STOP et un header `List-Unsubscribe`.
- Utilisez un sous-domaine dédié pour l'outbound.
- Ne scrapez pas de profils privés ; les emails proviennent de sites et
  d'annuaires publics.
- Limitez la conservation des données et supprimez les prospects qui demandent
  leur retrait.
- Restreignez l'accès SSH et n'ouvrez aucun port entrant pour le pipeline.

---

## 15. Aide-mémoire

```bash
cd /opt/mailguardpro-prospecting

# Installation
bash deploy/setup_vps.sh

# Run manuel
bash deploy/run_daily.sh

# Run forcé en mode sec
bash deploy/run_daily.sh --dry-run

# Stats
bash deploy/stats.sh
.venv/bin/python run_scale.py --stats

# Étapes ciblées
bash deploy/run_stage.sh qualify 10
bash deploy/run_stage.sh personalize 10

# Découverte annuaire
bash deploy/run_scale.sh agences 100 4

# Export
.venv/bin/python export_prospects.py --min-score 70

# Sauvegarde
bash deploy/backup.sh

# Mise à jour
bash deploy/update.sh

# Cron
crontab -l
crontab -e

# Logs
tail -f data/logs/run-*.log
```

Pour l'IA qui opère le VPS : lire aussi `deploy/AI_OPERATOR.md`.
