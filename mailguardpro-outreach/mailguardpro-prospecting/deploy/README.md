# Déploiement VPS — index

Kit de déploiement pour un VPS Linux (Debian/Ubuntu), avec cron, logs,
verrou anti-chevauchement, sauvegardes et `DRY_RUN=true` par défaut.

| Fichier | Rôle |
|---|---|
| `VPS_RUNBOOK.md` | Guide complet : installation, IA, cron, logs, dépannage, RGPD |
| `AI_OPERATOR.md` | Consignes pour l'IA qui exploite le pipeline sur le VPS |
| `VPS_AI_PROMPT.md` | Prompt de déploiement à donner à l'IA du VPS |
| `setup_vps.sh` | Installation idempotente (paquets, venv, .env, tests) |
| `_common.sh` | Helpers partagés : `.env`, PATH, verrou `flock`, venv |
| `run_daily.sh` | Run quotidien cron-friendly (découverte → export) |
| `run_stage.sh` | Lance une étape précise (`qualify`, `personalize`, `send`...) |
| `run_scale.sh` | Découverte à grande échelle par annuaire |
| `backup.sh` | Sauvegarde SQLite + exports, rétention 14 jours |
| `stats.sh` | Statistiques CRM |
| `update.sh` | `git pull` + réinstallation des dépendances |
| `crontab.example` | Lignes crontab à copier |
| `logrotate.conf` | Rotation quotidienne des logs, 14 jours |
| `mailguardpro-prospecting.service` | Service systemd (alternative au cron) |
| `mailguardpro-prospecting.timer` | Timer systemd quotidien |
| `env.vps.example` | Modèle de configuration VPS |

Démarrage rapide :

```bash
cd /opt/mailguardpro-prospecting
bash deploy/setup_vps.sh
nano .env                 # LLM, DRY_RUN=true, expéditeur
bash deploy/stats.sh
bash deploy/run_daily.sh
crontab -e                # copier deploy/crontab.example
```

Pour une reprise du CRM local (premier lot), voir
`VPS_RUNBOOK.md` → « Reprendre le CRM local sur le VPS ».
