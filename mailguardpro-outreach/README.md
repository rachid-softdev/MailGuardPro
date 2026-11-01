# mailguardpro-outreach

Outils d'acquisition et de rétention pour MailGuard Pro.

## Structure

```
mailguardpro-outreach/
└── mailguardpro-prospecting/   # Acquisition : prospection froide B2B (validation humaine)
```

## Prospection

Le module `mailguardpro-prospecting` découvre des entreprises qui envoient des
emails à grande échelle (agences cold email / outbound / email marketing, SaaS
B2B, e-commerce, RevOps), les qualifie, enrichit les décideurs, vérifie les
emails et génère des brouillons personnalisés FR/EN.

Voir [`mailguardpro-prospecting/README.md`](mailguardpro-prospecting/README.md).

```bash
cd mailguardpro-prospecting
python run.py --stage discovery --limit 150
python run.py --stage qualify --limit 150
python run.py --stage enrich --limit 50
python run.py --stage personalize --limit 30
python export_prospects.py
```

Le premier lot tourne en `DRY_RUN` : aucun email n'est envoyé.
