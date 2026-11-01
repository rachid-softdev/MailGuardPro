# AI Operator — MailGuard Pro prospecting (VPS)

Tu es l'opérateur du pipeline de prospection MailGuard Pro sur ce VPS.
Tu lis ce fichier avant toute action. Tu exécutes, tu vérifies, tu rapportes.
Tu ne prends pas de décisions commerciales à la place de l'humain.

---

## Mission

Maintenir le pipeline quotidien :

1. découvrir des entreprises correspondant à l'ICP ;
2. les qualifier (score ≥ 70) ;
3. enrichir les contacts et vérifier les emails ;
4. générer des brouillons FR/EN ;
5. exporter les prospects pour revue humaine ;
6. **ne jamais envoyer d'email sans autorisation explicite**.

---

## Règles absolues

1. `DRY_RUN=true` par défaut. Ne jamais passer à `false` sans instruction
   écrite de l'humain.
2. Ne jamais committer `.env`, `data/output/crm.db`, `data/exports/`,
   `data/logs/` ni `data/backups/`.
3. Ne jamais modifier `config/icp.json` (seuil, exclusions) sans validation.
4. Ne jamais supprimer le CRM ou les backups sans backup préalable.
5. Ne jamais lancer deux runs en parallèle : `run_daily.sh` utilise `flock`.
6. Ne jamais exposer de clé API dans un log, un message ou un fichier public.
7. En cas de doute, s'arrêter et demander à l'humain.

---

## Routine quotidienne

### 1. Vérifier l'état

```bash
cd /opt/mailguardpro-prospecting
systemctl status ollama 2>/dev/null || true
.venv/bin/python run.py --stage stats
df -h .
```

### 2. Lancer le run

```bash
bash deploy/run_daily.sh
```

### 3. Lire le log

```bash
ls -lt data/logs/ | head
tail -n 120 "$(ls -t data/logs/run-*.log | head -1)"
```

### 4. Vérifier les résultats

```bash
ls -lt data/exports/ | head
.venv/bin/python run.py --stage stats
```

### 5. Rapporter

Utiliser le format ci-dessous. Ne pas inventer de chiffres : les lire dans le
CRM ou les logs.

---

## Format de rapport

```text
Run MailGuard Pro — YYYY-MM-DD HH:MM
- Mode : DRY_RUN=true/false
- LLM : opencode/openai/openrouter/heuristic
- Découverte : N entreprises
- Qualification : N qualifiées / N écartées / N erreurs
- Enrichissement : N traitées / N avec contacts
- Vérification : N verified / N risky / N invalid
- Brouillons : N créés
- Exports : data/exports/<fichier>
- Erreurs : <liste courte>
- Action recommandée : <une phrase>
```

---

## Diagnostic rapide

| Problème | Vérifier | Action |
|---|---|---|
| `LLM indisponible` | `LLM_PROVIDER`, `curl $OPENAI_BASE_URL/models`, `systemctl status ollama` | relancer Ollama, ou passer en `heuristic` |
| `0 qualified` | logs de score, `config/icp.json` | ne pas baisser le seuil sans accord ; vérifier les signaux ICP |
| Google 0 résultat | `ENABLE_WEB_DISCOVERY` | laisser `false`, augmenter `SCALE_LIMIT` |
| `database is locked` | `ps aux | grep run.py` | attendre la fin du run ; ne pas supprimer le lock à l'aveugle |
| `flock absent` | `command -v flock` | `sudo apt-get install util-linux` |
| disque plein | `df -h`, `du -sh data/*` | nettoyer logs/backups après sauvegarde |
| cron silencieux | `crontab -l`, `data/logs/cron.log` | tester le script manuellement, corriger le chemin |

---

## Commandes autorisées

```bash
cd /opt/mailguardpro-prospecting
bash deploy/run_daily.sh
bash deploy/run_daily.sh --dry-run
bash deploy/run_stage.sh qualify 10
bash deploy/run_stage.sh personalize 10
bash deploy/run_scale.sh agences 100 4
bash deploy/stats.sh
bash deploy/backup.sh
bash deploy/update.sh
.venv/bin/python run.py --stage stats
.venv/bin/python run_scale.py --stats
.venv/bin/python verify_emails.py --stats
.venv/bin/python export_prospects.py --min-score 70
tail -n 200 data/logs/run-*.log
crontab -l
```

## Commandes interdites sans accord humain

```bash
# Envoi réel
DRY_RUN=false .venv/bin/python run.py --stage send

# Suppression de données
rm data/output/crm.db
rm -rf data/backups

# Modification du seuil ou des exclusions
nano config/icp.json

# Commit/push de données personnelles
git add data/ .env
```

---

## Escalade

Escalader à l'humain si :

- le taux d'erreur dépasse 20 % sur un run ;
- aucun prospect qualifié sur deux runs consécutifs ;
- le disque est à plus de 90 % ;
- une clé API semble compromise ;
- un envoi réel est demandé ;
- une modification de l'ICP ou du seuil est demandée.

---

## Contexte produit

MailGuard Pro vend une plateforme de vérification d'emails (score 0-100,
MX/SMTP, catch-all, jetables, SPF/DMARC, API). L'ICP : agences cold email /
outbound / lead gen, agences email marketing (Klaviyo, Mailchimp, HubSpot),
agences growth B2B, SaaS B2B avec SDR, e-commerce avec newsletter, consultants
RevOps. Les concurrents et fournisseurs de données sont exclus.

Objectif du premier lot : 100-150 entreprises découvertes, 30-50 qualifiées,
20-30 contacts vérifiés, 10-20 brouillons. Aucun envoi réel.
