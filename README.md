# MailGuard Pro

> Email Intelligence Platform - Validate email addresses with a comprehensive quality score (0-100) and bulk processing capabilities.

Monorepo pnpm contenant les applications MailGuard Pro — une plateforme SaaS de validation d'emails avec scores de qualité.

---

## Stack Technique

- **Framework Web** : Next.js 15 (App Router)
- **Language** : TypeScript 5.7
- **Base de données** : PostgreSQL 15 + Prisma 6
- **Queue** : BullMQ + Redis 7
- **Auth** : NextAuth.js v5
- **Paiements** : Stripe
- **Email** : Resend
- **Monorepo** : pnpm workspaces + Turbo

---

## Prérequis

- Node.js v20+
- pnpm v9+
- PostgreSQL 15+
- Redis 7+

---

## Installation

```bash
# Installer les dépendances
pnpm install

# Lancer en développement
pnpm dev
```

---

## Commandes

### Commandes principales

| Commande | Description |
|----------|-------------|
| `pnpm dev` | Lancer toutes les apps en développement |
| `pnpm build` | Build de toutes les apps |
| `pnpm lint` | Linter le code |
| `pnpm typecheck` | Vérifier les types |
| `pnpm check` | Vérification complète (format + lint + types) |

### Commandes préfixées (application web)

```bash
pnpm web:dev       # Lancer le serveur de développement
pnpm web:build     # Build de production
pnpm web:start     # Démarrer en production
pnpm web:lint      # Linter le code
pnpm web:typecheck # Vérifier les types

# Environment
pnpm check-env     # Valider les variables d'environnement
```

---

## Structure

```
mailguardpro/
├── packages/
│   ├── mailguardpro-types/    # Types TypeScript
│   └── mailguardpro-utils/    # Utilitaires
├── mailguardpro-web/          # Application Next.js principale
├── mailguardpro-mobile/       # Application mobile (Expo)
├── mailguardpro-desktop/       # Application desktop (Tauri)
├── mailguardpro-extension/     # Extension navigateur
└── package.json                # Scripts racine
```

---

## Documentation

Documentation détaillée : voir `mailguardpro-web/README.md`

---

## Licence

Proprietary — Tous droits réservés