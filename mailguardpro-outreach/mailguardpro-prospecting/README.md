# Agent de prospection MailGuard Pro

Agent Python autonome qui trouve des prospects B2B pour **MailGuard Pro** :
découverte d'entreprises, qualification IA, enrichissement des décideurs,
vérification MX/SMTP, rédaction d'emails personnalisés FR/EN, relances J+3 et
suivi CRM — sans API de prospection payante.

> **Ce lot est en `DRY_RUN`** : le pipeline génère la liste et les brouillons,
> mais aucun email n'est envoyé. L'envoi réel sera activé plus tard, après
> revue et configuration de Resend.

## ICP

MailGuard Pro s'adresse aux entreprises qui envoient beaucoup d'emails ou
gèrent de grandes listes :

- agences **cold email / outbound / lead generation B2B** ;
- agences **email marketing** (Klaviyo, Mailchimp, HubSpot) ;
- agences **growth / acquisition B2B** ;
- SaaS B2B avec SDR ;
- e-commerce avec newsletter ;
- consultants RevOps / CRM / marketing automation.

Les concurrents et fournisseurs de données (ZeroBounce, NeverBounce, Hunter,
Dropcontact, Clearbit, Apollo, Lemlist, Instantly, Smartlead…) sont exclus.

## Pipeline

```
config/icp.json
      │
      ▼
Découverte (annuaires + Google/DDG) ──▶ CRM SQLite
      │
      ▼
Qualification (IA ou heuristique, score 0-100, seuil 70)
      │
      ▼
Enrichissement (site + décideurs + emails) ──▶ vérification MX/SMTP
      │
      ▼
Personnalisation FR/EN (brouillons)
      │
      ▼
Revue humaine + export CSV/Markdown
      │
      ▼
Relance J+3 (optionnelle) ──▶ envoi Resend (DRY_RUN par défaut)
```

## Installation

```bash
cd mailguardpro-outreach/mailguardpro-prospecting
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS / Linux
pip install -r requirements.txt
copy .env.example .env        # Windows
# cp .env.example .env        # macOS / Linux
```

Le CLI `opencode` doit être installé et authentifié (`opencode auth login`).
Le modèle par défaut est `opencode/big-pickle` ; changez `OPENCODE_MODEL` si
besoin.

Backends disponibles via `LLM_PROVIDER` :

- `opencode` (défaut) : CLI local, aucune clé API ;
- `openrouter` : API OpenRouter (`OPENROUTER_API_KEY`) ;
- `openai` : API compatible OpenAI (Ollama, vLLM, LM Studio...) ;
- `heuristic` : aucun LLM, scoring et rédaction locales.

Si le LLM échoue (quota, panne), `LLM_FALLBACK_HEURISTIC=true` permet de
continuer avec le mode heuristique au lieu de perdre les prospects.

### Mode heuristique (sans LLM)

`LLM_PROVIDER=heuristic` désactive complètement le LLM. Le score et les
brouillons sont alors produits localement :

- signaux métier dans le nom, le domaine, le secteur et la description
  (`cold email`, `lead generation`, `prospection`, `email marketing`,
  `revops`, `growth`, `agency`…) ;
- requête de découverte Google/DDG utilisée comme signal de confirmation
  (elle décrit l'ICP visé) ;
- petite liste d'agences connues pour les domaines opaques (`belkins.io`,
  `martal.ca`, `callboxinc.com`, `devlo.ch`…) ;
- pénalités pour les concurrents, fournisseurs de données et secteurs hors
  cible (immobilier, restauration, annuaires…).

Les snippets Google sont souvent vides : le domaine et la requête de
découverte portent donc l'essentiel du signal. Le mode heuristique est un
filet de sécurité, pas un remplacement de l'IA : relisez les brouillons avant
tout envoi.

## Premier lot (01/11/2026)

Avec `DRY_RUN=true` et `LLM_PROVIDER=heuristic` :

- 152 entreprises découvertes ;
- 45 qualifiées (score ≥ 70) ;
- 35 enrichies, 42 contacts avec email ;
- vérification : 7 `verified`, 34 `risky`, 1 `invalid` (les gateways SMTP
  Microsoft/Google rendent beaucoup d'adresses « plausibles » sans preuve) ;
- 19 brouillons FR/EN ;
- 45 prospects exportés dans `data/exports/`.

## VPS / cron

Pour un déploiement autonome sur un VPS Linux avec cron, logs, verrou
anti-chevauchement et sauvegardes :

```bash
cd mailguardpro-prospecting
bash deploy/setup_vps.sh
nano .env                 # IA, DRY_RUN=true, expéditeur
bash deploy/run_daily.sh  # test manuel
crontab -e                # voir deploy/crontab.example
```

Documentation complète : [`deploy/VPS_RUNBOOK.md`](deploy/VPS_RUNBOOK.md).
Index du kit : [`deploy/README.md`](deploy/README.md).
Instructions pour l'IA qui opère le VPS : [`deploy/AI_OPERATOR.md`](deploy/AI_OPERATOR.md).
Prompt de déploiement pour l'IA du VPS : [`deploy/VPS_AI_PROMPT.md`](deploy/VPS_AI_PROMPT.md).

## Configuration

- `config/icp.json` : marchés FR/EN, villes, requêtes, exclusions, fonctions
  des décideurs, seuil de qualification.
- `config/campaigns.json` : offre, CTA, templates et limite de relances.
- `config/prompts/` : prompts de qualification, personnalisation et relance.
- `config/seed_domains.csv` : domaines à injecter manuellement (optionnel).
  Format : `name,domain,market,country,city,sector,description`.

## Commandes

```bash
# Découverte (annuaires + recherche web)
python run.py --stage discovery --limit 150

# Qualification (IA ou heuristique)
python run.py --stage qualify --limit 150

# Enrichissement (site + décideurs + emails)
python run.py --stage enrich --limit 50

# Brouillons personnalisés
python run.py --stage personalize --limit 30

# Export CSV + Markdown
python export_prospects.py --min-score 70

# Statistiques CRM
python run.py --stage stats

# Seed manuel
python seed_prospects.py

# Vérification des emails du CRM
python verify_emails.py --limit 100

# Relances (J+3)
python run.py --stage followups --limit 20

# Envoi (DRY_RUN=true par défaut)
python run.py --stage send
```

Pipeline complet (respecte `DRY_RUN`) :

```bash
python run.py --stage all --limit 30
```

## Découverte à grande échelle

Les annuaires d'agences peuvent être parcourus sans Google :

```bash
python run_scale.py --source agences --workers 8 --limit 500
python run_scale.py --source expert --workers 8 --limit 200
python run_scale.py --stats
```

Sources disponibles : `agences`, `expert`, `webstratege`, `local`.
Les checkpoints permettent de reprendre un run interrompu.

## Recherche web

`src/google_search.py` tente Google via Selenium, puis bascule automatiquement
sur **DuckDuckGo HTML** si Google est bloqué ou si Chrome n'est pas disponible.
Cela permet de travailler depuis une IP locale sans dépendre de GitHub Actions.

## Envoi et conformité

- `DRY_RUN=true` par défaut : aucun email ne part.
- `DAILY_SEND_LIMIT=20`, délais aléatoires 30-90 s.
- Maximum 2 emails par entreprise (initial + relance J+3).
- Chaque email contient une signature, une mention STOP et un header
  `List-Unsubscribe`.
- Les contacts dont l'email est `invalid` sont exclus de l'envoi.
- Utilisez un sous-domaine dédié (`outbound.mailguard.pro`) pour préserver la
  réputation du domaine principal.

## Données et vie privée

- Le CRM SQLite et les exports contiennent des données personnelles : ils sont
  ignorés par git (`.gitignore`).
- Les emails proviennent de sources publiques (sites, annuaires) et sont
  vérifiés avant contact.
- Conservez la source et la date de découverte pour pouvoir répondre aux
  demandes d'accès/suppression.
- Pas de données sensibles, pas de scraping de profils privés.

## Tests

```bash
python -m pytest -q
```
