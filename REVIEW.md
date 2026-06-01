# 📋 MailGuard Pro — Revue de Code Complète

> **Projet :** Email Intelligence Platform — Score qualité 0-100 + validation bulk + exports  
> **Date :** 01/06/2026  
> **Scope :** Monorepo complet (mailguardpro-web + 6 packages)

---

## 🗺️ CARTE DU CODEBASE (Étape 0 — Review Map)

### Arborescence des modules clés

```
mailguardpro-web/                        ← Application principale (Next.js 15)
├── app/                                 ← Routes App Router
│   ├── (dashboard)/                     ← Routes protégées (layout avec sidebar)
│   │   ├── dashboard/                   ← Page d'accueil dashboard
│   │   ├── validate/                    ← Validation email individuelle
│   │   ├── bulk/                        ← Upload CSV + jobs bulk
│   │   ├── history/                     ← Historique des validations
│   │   ├── api-keys/                    ← Gestion des clés API
│   │   ├── webhooks/                    ← Configuration webhooks
│   │   └── settings/                    ← Paramètres compte
│   ├── (marketing)/                     ← Routes publiques
│   │   ├── page.tsx                     ← Landing page
│   │   ├── pricing/                     ← Page tarifs
│   │   ├── login/                       ← Page connexion
│   │   ├── verify/                      ← Page vérification email
│   │   └── docs/                        ← Documentation
│   ├── api/                             ← API Routes
│   │   ├── v1/
│   │   │   ├── validate/               ← GET /api/v1/validate?email=
│   │   │   ├── validations/            ← GET historique validations
│   │   │   ├── bulk/                   ← CRUD jobs bulk
│   │   │   ├── api-keys/               ← CRUD clés API
│   │   │   ├── webhooks/               ← CRUD webhooks
│   │   │   ├── billing/                ← Stripe portal
│   │   │   ├── user/                   ← Profile utilisateur
│   │   │   ├── usage/                  ← Statistiques usage
│   │   │   └── tools/                  ← MX/SPF/DMARC lookups
│   │   ├── auth/                       ← [...nextauth] handler
│   │   ├── stripe/webhook/             ← Stripe webhook entrant
│   │   ├── cron/                       ← Tâches CRON
│   │   ├── admin/users/                ← Admin panel
│   │   └── health/                     ← Healthcheck
│   ├── layout.tsx
│   └── globals.css                     ← Design system (CSS custom properties)
├── components/
│   ├── ui/StatusBadge.tsx
│   ├── validator/ScoreCircle.tsx
│   ├── export/PdfGenerator.tsx
│   └── ErrorBoundary.tsx
├── lib/                                ← Utilitaires & infrastructure
│   ├── auth.ts                         ← NextAuth v5 configuration
│   ├── prisma.ts                       ← Prisma client + token encryption
│   ├── redis.ts                        ← Redis client + rate limiting
│   ├── crypto.ts                       ← Chiffrement AES-256-GCM
│   ├── rateLimits.ts                   ← Plan-based rate limiting
│   ├── ssrf.ts                         ← SSRF protection
│   ├── csrf.ts                         ← CSRF tokens
│   ├── sentry.ts                       ← Sentry config
│   └── ...
├── services/                           ← Couche métier
│   ├── emailValidator.ts               ← Orchestrateur de validation
│   ├── bulkProcessor.ts                ← Traitement CSV + BullMQ
│   ├── webhookDispatcher.ts            ← Dispatch webhooks sortants
│   ├── auditLogger.ts                  ← Audit trail
│   ├── smtpChecker.ts / dnsChecker.ts  ← Vérifications email
│   ├── disposableChecker.ts            ← Détection emails jetables
│   ├── reputationScorer.ts             ← Réputation domaine
│   └── ...
├── config/scoringWeights.ts            ← Poids de scoring
├── prisma/
│   ├── schema.prisma                   ← Schéma BDD (10 modèles)
│   └── migrations/                     ← 4 migrations
├── worker/index.ts                     ← BullMQ worker (validation bulk)
├── tests/
│   ├── unit/                           ← Tests unitaires
│   ├── integration/                    ← Tests d'intégration
│   └── e2e/                            ← Tests Playwright
├── middleware.ts                       ← Auth + CSP nonce
├── docker-compose.yml                  ← PostgreSQL + Redis + Next.js + Worker
└── Dockerfile / Dockerfile.worker      ← Docker images

packages/
├── mailguardpro-types/                 ← Types partagés (src/index.ts)
├── mailguardpro-utils/                 ← Utilitaires (clsx, tailwind-merge)
├── mailguardpro-config/                ← Configuration (tsconfig.base.json)
├── mailguardpro-extension/             ← Enveloppe vide (env files only)
├── mailguardpro-mobile/                ← Enveloppe vide (env files only)
└── mailguardpro-desktop/               ← Enveloppe vide (env files only)
```

### Stack technique détectée

| Couche | Technologie | Version |
|--------|-------------|---------|
| **Framework** | Next.js | 15.5.18 |
| **UI** | React 19, Tailwind CSS 3.4 | 19.0.0 / 3.4.17 |
| **Base de données** | PostgreSQL 15 + Prisma ORM | ^7.8.0 |
| **Cache / Queue** | Redis + BullMQ + ioredis | 7-alpine / ^5.28.2 / ^5.4.1 |
| **Auth** | NextAuth v5 (Google + Resend) | ^5.0.0-beta.31 |
| **Paiement** | Stripe | ^17.4.0 |
| **Monitoring** | Sentry | ^10.55.0 |
| **Background Jobs** | BullMQ Worker | — |
| **Langage** | TypeScript | ^6.0.3 |
| **Package Manager** | pnpm + Turborepo | 9.15.9 / ^2.0.0 |
| **Linter** | Biome | ^2.4.16 |
| **Testing** | Vitest + Playwright | ^4.0.0 / ^1.49.1 |
| **PDF** | @react-pdf/renderer | ^4.0.0 |
| **Export** | exceljs, csv-parse, csv-stringify | — |

### Points d'entrée principaux

| Point d'entrée | Type | Fichier |
|----------------|------|---------|
| Landing page | Page publique | `app/(marketing)/page.tsx` |
| Dashboard | Page protégée | `app/(dashboard)/dashboard/page.tsx` |
| Validation API | API Route | `app/api/v1/validate/route.ts` |
| Bulk API | API Route | `app/api/v1/validate/bulk/route.ts` |
| Webhook Stripe | API Route | `app/api/stripe/webhook/route.ts` |
| Auth handler | API Route | `app/api/auth/[...nextauth]/route.ts` |
| Health check | API Route | `app/api/health/route.ts` |
| Worker | Background | `worker/index.ts` |
| Middleware | Edge | `middleware.ts` |

### Volume estimé (hors node_modules et généré)

| Métrique | Valeur |
|----------|--------|
| Fichiers source (TS/TSX/CSS/JSON/Prisma) | ~211 |
| Lignes de code TypeScript | ~27 451 |
| Modèles Prisma | 10 |
| Migrations DB | 4 |
| Packages workspace | 6 (dont 3 enveloppes vides) |
| Routes API REST | 18+ |
| Tests unitaires | Présents (unit, integration, e2e) |

### Dépendances externes principales

**Production (35 dépendances) :**
- `next`, `react`, `react-dom` — Framework
- `@prisma/client`, `@prisma/adapter-pg`, `pg` — Base de données
- `next-auth`, `@auth/prisma-adapter` — Authentification
- `ioredis`, `bullmq` — Cache & file d'attente
- `stripe` — Paiement
- `@sentry/nextjs` — Monitoring
- `zod` — Validation schémas
- `lucide-react` — Icônes
- `class-variance-authority`, `clsx`, `tailwind-merge` — Styles
- `date-fns` — Dates
- `csv-parse`, `csv-stringify`, `exceljs` — Export fichiers
- `@react-pdf/renderer` — Génération PDF
- `dompurify` — Sanitization HTML
- `pino` — Logging structuré
- `uuid`, `fast-levenshtein`, `whois` — Utilitaires
- `resend` — Emails transactionnels

### Découpage en couches identifié

```
┌─────────────────────────────────────────────────────────┐
│                     PRESENTATION                         │
│  Pages (app/) · Components (composants UI) · Layouts     │
├─────────────────────────────────────────────────────────┤
│                       API                                │
│  Route Handlers (app/api/) · Middleware (edge)           │
├─────────────────────────────────────────────────────────┤
│                    APPLICATION                           │
│  Auth · Rate Limiting · Validation · Export · Webhooks   │
├─────────────────────────────────────────────────────────┤
│                     SERVICES                             │
│  emailValidator · bulkProcessor · webhookDispatcher ·    │
│  auditLogger · dnsChecker · smtpChecker · reputation     │
├─────────────────────────────────────────────────────────┤
│                   DATA ACCESS                            │
│  Prisma ORM · Redis Cache · BullMQ Queue                │
├─────────────────────────────────────────────────────────┤
│                  INFRASTRUCTURE                          │
│  Docker · PostgreSQL · Redis · Next.js Deployment       │
└─────────────────────────────────────────────────────────┘
```

---

# 🖥️ FRONT-END REVIEW

## Agent 1 — UI/Design Review

### Design System : CSS Custom Properties
Le codebase utilise un design system modulaire basé sur CSS custom properties dans `globals.css` :
- **Typographie** : Police Syne (display) + DM Mono (mono), échelle Major Third
- **Couleurs** : Palette complète light/dark mode avec variables `--bg-*`, `--text-*`, `--border-*`, `--status-*`, `--score-*`
- **Ombres** : 5 niveaux (`--shadow-{xs,sm,md,lg,xl}`)
- **Bordures** : 6 niveaux (`--radius-{sm,md,lg,xl,2xl,full}`)
- **Spacings** : Échelle 1-24 (`--space-{1..24}`)
- **Conteneurs** : 6 breakpoints (`--container-{sm..2xl}`)

### 🚨 Problèmes critiques

**UI-1 | `globals.css` | Utilisation de `bg-opacity-*` deprecated dans Tailwind 3.4**
- Description : `bg-opacity-10`, `bg-opacity-50` utilisés dans plusieurs fichiers
- Impact : Fonctionne encore mais déprécié — risque de casser avec Tailwind v4
- Solution : Remplacer par `bg-[var(--status-invalid)]/10` ou utiliser la classe `bg-red-500/10`
- Fichiers : `ErrorBoundary.tsx:43`, `api-keys/page.tsx:216`, `webhooks/page.tsx:276`, `settings/page.tsx:253`

**UI-2 | `app/(dashboard)/layout.tsx` | Sidebar utilise des émojis comme icônes**
- Description : Les icônes de navigation sont des caractères Unicode (`◉ ✓ ↑ ☰ ⚿ ⚡ ⚙`)
- Impact : Rendu incohérent selon les OS, pas de support d'accessibilité
- Solution : Remplacer par lucide-react (déjà dans les dépendances)

**UI-3 | `app/(marketing)/page.tsx` | Inline SVG features cards**
- Description : 3 SVG inline identiques avec des path complexes — duplication
- Impact : Maintenabilité réduite, pas de réutilisation
- Solution : Extraire dans des composants Icon ou utiliser lucide-react

### ⚠️ Améliorations importantes

**UI-4 | Dashboard layout | Pas de responsive sidebar**
- Description : Sidebar fixe 240px non adaptée au mobile
- Solution : Implémenter un drawer overlay pour < 768px avec toggle
- Effort : M

**UI-5 | `pricing/page.tsx` | Mixed currencies**
- Description : Free en `$0`, Starter/Pro/Business en `€`
- Impact : Confusion utilisateur — incohérence sur les prix
- Solution : Uniformiser la devise (selon le marché cible)

**UI-6 | `validate/page.tsx` | Form submit non bloqué pendant le chargement**
- Description : Le bouton est disabled mais l'input reste modifiable
- Impact : L'utilisateur peut changer l'email pendant la requête sans que cela ne déclenche une nouvelle validation
- Solution : Désactiver l'input pendant le chargement ou re-soumettre avec le nouvel email

### ✨ Détails de finition (polish)

- **StatusBadge.tsx** : `letterSpacing: 0.12em` hardcodé alors que `tracking-widest` existe déjà — redondant
- **ScoreCircle.tsx** : Le composant a une logique `prefers-reduced-motion` en commentaire — à implémenter plutôt qu'en commentaire
- **PdfGenerator.tsx** : Utilise du CSS inline dans un template string — pas de variables design system
- **validate/page.tsx:133-151** : Les check icons `✓` / `✗` en dur — utiliser un composant

---

## Agent 2 — UX Review

### 🚨 Problèmes critiques

**UX-1 | Pas d'autocomplete ni de debounce sur le champ email**
- Description : `(dashboard)/validate/page.tsx` — le champ email n'a pas d'attribut `autoComplete="email"` ni de debounce
- Impact : Mauvaise expérience mobile, pas d'aide à la saisie

**UX-2 | `bulk/page.tsx` | Pas d'état intermédiaire pour le polling**
- Description : Après upload, le polling se lance sans feedback utilisateur pendant 2s
- Impact : L'utilisateur ne sait pas si le job avance jusqu'au premier callback
- Solution : Afficher "Job created — processing started" immédiatement

**UX-3 | `webhooks/page.tsx` | Pas de confirmation avant "Test"**
- Description : Le bouton Test envoie un webhook immédiatement sans demande de confirmation
- Impact : Risque d'erreur, pas de contrôle utilisateur

### ⚠️ Améliorations importantes

**UX-4 | `history/page.tsx` | Pagination avec page refresh**
- Description : La pagination recharge la page entière via `router.push()`
- Impact : Perte du scroll position, temps de chargement
- Solution : Utiliser `useRouter().replace()` avec shallow routing ou SWR

**UX-5 | Dashboard | Aucun état de chargement pour les KPIs**
- Description : Les KPIs arrivent après un fetch serveur mais pas de skeleton
- Impact : White screen momentané

**UX-6 | Settings | Message de succès non auto-disparaissant**
- Description : Le message "Profile updated successfully!" reste indéfiniment
- Solution : Auto-dismiss après 3-4 secondes

---

## Agent 3 — Responsive Review

### 🚨 Problèmes critiques

**RESP-1 | Dashboard layout non adapté mobile**
- Description : Sidebar fixe 240px, layout `flex` sans breakpoint mobile
- Impact : Navigation cassée sur mobile (< 768px)
- Solution : Implémenter sidebar-hamburger pour < 768px

**RESP-2 | `validate/page.tsx` | Layout LG côte à côte non adapté**
- Description : `flex-col lg:flex-row` correct mais ScoreCircle `xl` (180px) peut dépasser sur mobile
- Vérifié : Probablement OK, mais à tester à 320px

### ⚠️ Améliorations importantes

**RESP-3 | Tables sans overflow-x sur mobile**
- Description : `history/page.tsx`, `bulk/page.tsx`, `api-keys/page.tsx` utilisent `overflow-x-auto` mais la table peut être illisible sur mobile
- Solution : Utiliser des cartes sur mobile (stack layout) au lieu de tables horizontales

**RESP-4 | Input height 56px fixe**
- Description : `validate/page.tsx:95` — `height: 56px` fixe, pas responsive
- Impact : Sur mobile, 56px est trop grand

---

## Agent 4 — Accessibility Review (WCAG 2.1 AA)

### 🚨 Problèmes critiques

**A11Y-1 | Sidebar navigation — pas de `aria-current="page"`**
- Description : `layout.tsx:42-50` — les liens de navigation n'ont pas d'attribut indiquant la page active
- Critère : WCAG 2.4.8 (Location)
- Impact : Les utilisateurs de screen reader ne savent pas où ils sont

**A11Y-2 | Modal sans `role="dialog"` ni `aria-modal`**
- Description : `api-keys/page.tsx:215-275`, `webhooks/page.tsx:276-386` — les modales n'ont pas de rôles ARIA
- Critère : WCAG 4.1.2 (Name, Role, Value)
- Impact : Screen readers ne détectent pas correctement les modales

**A11Y-3 | Pas de focus trap dans les modales**
- Description : Les modales ne bloquent pas le focus à l'intérieur
- Critère : WCAG 2.1.1 (Keyboard) / 2.4.3 (Focus Order)
- Impact : Navigation clavier possible en dehors de la modale ouverte

**A11Y-4 | Couleur du texte sur fond coloré potentiellement insuffisante**
- Description : `settings/page.tsx:160-164` — `bg-green-50 text-green-800`, `bg-red-50 text-red-800`
- Impact : Ratio de contraste potentiellement < 4.5:1 sur les messages
- Vérification : `text-green-800` sur `bg-green-50` ≈ 5.2:1 (OK) mais limite

### ⚠️ Améliorations importantes

**A11Y-5 | `formAction` dans layout — pas accessible au clavier**
- Description : `layout.tsx:60-66` — le bouton Sign Out utilise un Server Action dans un form
- Impact : Pas de gestion d'erreur accessible

**A11Y-6 | StatusBadge — `role="status"` OK mais pas de `aria-live`**
- Description : Le badge a `role="status"` mais les contenus dynamiques ne sont pas annoncés
- Solution : Ajouter `aria-live="polite"` sur les zones de résultat

---

## Agent 5 — Front-End Architecture Review

### 🚨 Problèmes critiques

**ARCH-FE-1 | Pages "client" avec duplication du pattern fetch/loading/error**
- Description : Chaque page dashboard réimplémente:
  ```typescript
  const [data, setData] = useState<X[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { fetch().then(setData).finally(() => setLoading(false)) }, [])
  ```
- Fichiers : `history/page.tsx`, `api-keys/page.tsx`, `webhooks/page.tsx`, `settings/page.tsx`, `bulk/page.tsx`
- Impact : ~60 lignes de boilerplate dupliquées × 5 pages = 300 lignes redondantes
- Solution : Créer un hook `useFetch<T>(url)` ou utiliser SWR/React Query

**ARCH-FE-2 | Pas de gestion d'état client globale**
- Description : Chaque page fetch ses données indépendamment — pas de cache partagé
- Impact : Re-fetch systématique à chaque navigation, pas de cache utilisateur
- Solution : Implémenter SWR ou React Query pour le caching client

**ARCH-FE-3 | `ErrorBoundary.tsx` utilise Sentry via `(window as any).Sentry`**
- Description : Accès à Sentry via window global — pas robuste
- Impact : Peut échouer silencieusement
- Solution : Importer sentry correctement

### ⚠️ Améliorations importantes

**ARCH-FE-4 | Dashboard page — Server Component + Client Component mix**
- Description : `dashboard/page.tsx` est un Server Component (async) mais ne contient que du JSX
- Impact : Pas de réelle interactivité côté serveur nécessaire
- Suggestion : Rendre les pages listing + fetch en Server Components avec des formulaires/buttons "use client" isolés

**ARCH-FE-5 | `bulk/page.tsx` | Polling manuel avec setTimeout**
- Description : Polling implémenté manuellement avec `setTimeout(poll, 2000)` — pas de fallback si la page est fermée
- Solution : Utiliser `useInterval` ou SWR avec refetchInterval

---

## Agent 6 — Design System Review

### 🚨 Problèmes critiques

**DS-1 | Aucun token d'espacement utilisé dans les composants**
- Description : Les variables `--space-*` sont définies dans globals.css mais JAMAIS utilisées dans les composants
- Fichiers : Tous les composants utilisent des classes Tailwind directement (`p-8`, `mb-4`, `gap-4`)
- Impact : Le design system est défini mais pas appliqué — incohérence potentielle

**DS-2 | Classes de composants CSS custom non utilisées**
- Description : `globals.css:300-376` définit `.input`, `.btn`, `.card`, `.badge` mais :
  - `.btn-sm/.btn-md/.btn-lg` utilisés mais pas `.btn-danger` (inline styles dans settings)
  - `.badge` est défini avec `@apply` mais les pages utilisent des styles inline
- Impact : Duplication entre les classes utilitaires et CSS custom

### ⚠️ Améliorations importantes

**DS-3 | StatusBadge letterSpacing redondant**
- Description : La classe `tracking-widest` existe déjà dans Tailwind + la variable `--tracking-widest: 0.15em` est définie mais le composant utilise `letterSpacing: "0.12em"` en inline
- Solution : Standardiser sur les tokens

**DS-4 | `PdfGenerator.tsx` — CSS design system non utilisé**
- Description : Le PDF généré a son propre style inline Arial complètement en dehors du design system
- Impact : Marque inconsistante dans les exports PDF

### Score global — Front-End

| Domaine | Note | Commentaire |
|---------|------|-------------|
| Design | 6/10 | Design system défini mais pas appliqué uniformément |
| UX | 5/10 | Parcours simple mais frictions (pas de debounce, polling sans feedback) |
| Responsive | 4/10 | Sidebar cassée sur mobile, tables non adaptées |
| Accessibilité | 3/10 | Modales sans ARIA, pas de focus trap, contrastes limites |
| Maintenabilité | 5/10 | Duplication de patterns fetch, pas de hook réutilisable |

---

# ⚙️ BACK-END REVIEW

## Agent 1 — Architecture Review

### 🚨 Problèmes critiques

**ARCH-1 | Monolithe sans séparation claire des couches**
- Description : Les services, libs, et API routes sont mélangés. La logique métier est répartie entre `services/` et `app/api/`
- Impact : Difficulté à tester et faire évoluer

**ARCH-2 | `lib/redis.ts` et `services/` — Couplage fort à Redis**
- Description : Le rate limiting, le cache, les queues BullMQ et le pub/sub utilisent tous la même connexion Redis
- Impact : Contention potentielle, pas de séparation des préoccupations
- Solution : Séparer les connexions Redis par usage (cache, queue, ratelimit)

**ARCH-3 | Pas d'injection de dépendances**
- Description : Tous les services importent directement les dépendances (prisma, redis, etc.)
- Impact : Tests difficiles, pas de mock facile, couplage fort

### ⚠️ Problèmes importants

**ARCH-4 | `services/emailValidator.ts` — Orchestrateur fait trop de choses**
- Description : Le service `validateEmail()` orchestre 11 vérifications, calcule le score, gère le cache ET le rate limiting
- Impact : SRP violé, difficile à modifier

**ARCH-5 | `services/bulkProcessor.ts` — Logique métier dans la couche service**
- Description : Parsing CSV, validation, calcul de crédits, transactions DB et envoi à la queue — tout dans la même fonction
- Impact : ~180 lignes, difficile à tester unitairement

---

## Agent 2 — Code Quality Review

### 🚨 Problèmes critiques

**CQ-1 | `app/api/v1/validate/route.ts` — 313 lignes, trop complexe**
- Description : La route GET fait : auth, rate limiting, format check, disposable check, credit deduction, validation complète, caching
- Impact : Difficile à lire, tester et maintenir
- Solution : Extraire dans des middlewares ou des services séparés

**CQ-2 | `any` types usage excessif**
- Description : `auth.ts:38` (`params: any`), `prisma.ts` (`args: any`), `redis.ts:102` (cast `as [number, number]`)
- Impact : Perte de type safety TypeScript

**CQ-3 | Duplication massive dans `validate/route.ts`**
- Description : Les blocs de réponse "Not checked" pour checks désactivés sont dupliqués 3 fois (format fail, disposable fail, full checks)
- Impact : ~60 lignes quasi-identiques

---

## Agent 3 — Security Review (OWASP Top 10)

### 🔒 Vulnérabilités

**SEC-1 | [A2:2021] Broken Authentication — Session invalidation partielle**
- OWASP : A2 (Broken Authentication)
- Criticité : **High**
- Description : Le mécanisme `tokenVersion` invalide les sessions NextAuth. Mais le session callback retourne `session.user = null` sans réellement supprimer la session de la DB — la session existe toujours, elle est juste ignorée côté client
- Impact : Si un attaquant a un ancien JWT/session valide, il pourrait potentiellement la réutiliser
- Fichier : `lib/auth.ts:129-140`

**SEC-2 | [A3:2021] Sensitive Data Exposure — Email stocké en clair dans Validation**
- OWASP : A3 (Sensitive Data Exposure)
- Criticité : **Medium**
- Description : Le champ `email` dans la table `Validation` stocke l'email en clair (même si `emailHash` existe aussi pour la conformité)
- Fichier : `prisma/schema.prisma:114-117`, `validate/route.ts:253`
- Solution : Rendre l'email pseudonymisé par défaut, n'utiliser le clair que temporairement

**SEC-3 | [A5:2021] Security Misconfiguration — CSP contourné**
- OWASP : A5 (Security Misconfiguration)
- Criticité : **Medium**
- Description : Le middleware définit un CSP avec nonce, mais `next.config.ts` définit un CSP statique via headers qui est OVERRIDE par le middleware (CSP défini 2x, le dernier gagne)
- Impact : CSP potentiellement affaibli selon l'ordre d'application des headers
- Fichiers : `middleware.ts:88`, `next.config.ts:157-169`

**SEC-4 | [A6:2021] Vulnerable Components — Plusieurs dépendances critiques**
- OWASP : A6 (Vulnerable Components)
- Criticité : **Medium**
- Description : next-auth en beta (^5.0.0-beta.31), TypeScript 6.0 (latest), plusieurs dépendances à risque
- Fichier : `mailguardpro-web/package.json`

### ⚠️ Problèmes importants

**SEC-5 | Timing-safe response non cohérente**
- Description : `enforceTimingSafeResponse(startTime)` n'est appelé que sur certaines branches (format fail, disposable fail) mais pas sur toutes
- Fichier : `validate/route.ts:278` — appelé correctement, mais vérifier TOUS les chemins de retour
- Impact : Timing attack possible pour l'énumération d'emails

**SEC-6 | Audit logging des échecs de connexion expose l'email en clair**
- Description : `auth.ts:84` — log `email: email?.address || "unknown"` dans le métadata
- Impact : Informations PII dans les logs

---

## Agent 4 — Performance Review

### ⚡ Problèmes de performance

**PERF-1 | Requête DB additionnelle après credit deduction**
- Description : `validate/route.ts:268-273` — après `updateMany` (déduction), une seconde requête `findUnique` récupère les crédits restants
- Impact : 1 round-trip DB supplémentaire par validation
- Solution : Utiliser `RETURNING` ou calculer côté client

**PERF-2 | Worker — Validation séquentielle des emails**
- Description : `worker/index.ts:79-135` — boucle `for` séquentielle sur chaque email, avec un `create` DB par email
- Impact : Pour 100k emails, ça fait 100k inserts individuels + ~5 appels Redis pub/sub
- Solution : Batch inserts (50-100 par `createMany`), buffer ou chunk les validations

**PERF-3 | `bulkProcessor.ts:136-152` — Transaction contient l'update ET le create**
- Description : La transaction `$transaction` inclut à la fois `updateMany` (déduction crédits) et `create` bulkJob
- Impact : La transaction maintient un lock sur `User` et `BulkJob` — contention si plusieurs jobs simultanés

**PERF-4 | Pas de caching pour les vérifications DNS/WHOIS**
- Description : Les vérifications DNS (MX, SPF, DMARC) et WHOIS sont faites à chaque validation
- Impact : Latence élevée (100-500ms par check DNS), pas de cache TTL

---

## Agent 5 — Database Review

### 🗄️ Schéma et requêtes

**DB-1 | `Validation.email` — VARCHAR(255) sans index sur le contenu**
- Table : `Validation` — colonne `email`
- Problème : L'index existe sur `email` mais pas d'index `LIKE` ou trigram pour les recherches textuelles
- Solution : Ajouter un index `pg_trgm` si des recherches `LIKE` sont nécessaires

**DB-2 | `BulkJob.emailsJson` — TEXT storing JSON data**
- Table : `BulkJob` — colonne `emailsJson TEXT`
- Problème : Stockage de données JSON dans une colonne TEXT sans validation de format
- Solution : Utiliser le type `Json` de Prisma ou `JSONB` PostgreSQL

**DB-3 | `ApiKey.keyHash` — UNIQUE + pas de hash rotation**
- Table : `ApiKey` — colonne `keyHash`
- Problème : L'index UNIQUE empêche la rotation d'hash pour la même clé
- Fichier : `schema.prisma:101`, `validate/route.ts:52-57`

**DB-4 | `Webhook.encryptedSecret` — déchiffré pour chaque dispatch**
- Table : `Webhook` — colonne `encryptedSecret`
- Problème : Le secret est déchiffré à chaque appel webhook — overhead cryptographique
- Solution : Cache en mémoire du secret déchiffré (avec TTL)

### Index

| Table | Index | Évaluation | Recommandation |
|-------|-------|------------|----------------|
| Validation | `[bulkJobId, score]` | ✅ Bon | — |
| Validation | `[status, createdAt]` | ✅ Bon | — |
| Validation | `[email]` | ⚠️ Utile mais coûteux | Envisager hash index |
| Validation | `[emailHash]` | ✅ Bon | — |
| RateLimit | `[resetAt]` | ✅ Bon | — |
| UserRole | `[userId]` | ✅ Bon | — |

---

## Agent 6 — API Review

### 🚨 Problèmes

**API-1 | Pas de versioning cohérent**
- Description : `/api/v1/validate` vs `/api/health` vs `/api/cron/` — pas de préfixe de version sur certaines routes
- Impact : Incohérence, migration difficile

**API-2 | Response format non uniforme**
- Description : Parfois `{ success: boolean, data: T }`, parfois `{ success: boolean, data: T, meta: {...} }`, parfois juste `{ error: string }`
- Fichier : `validate/route.ts` (avec meta), `api-keys/route.ts` (juste data)
- Impact : Les clients doivent gérer plusieurs formats

**API-3 | Pas de documentation OpenAPI**
- Description : Aucune spécification OpenAPI trouvée
- Impact : Découverte difficile de l'API pour les intégrateurs

**API-4 | CORS non configuré pour l'API**
- Description : Les headers CORS dans `next.config.ts` concernent les pages, pas les endpoints API
- Impact : Impossible d'appeler l'API depuis un domaine externe

---

## Agent 7 — Reliability & Observability Review

### 🚨 Problèmes

**REL-1 | Worker — Pas de retry sur les jobs Redis échoués**
- Description : `worker/index.ts` utilise BullMQ avec `attempts: 3` dans la queue mais le retry est configuré sur la queue, pas sur le worker
- Impact : Si un job échoue, il n'est pas retry automatiquement

**REL-2 | Pas de dead letter queue**
- Description : Aucune configuration DLQ pour BullMQ
- Impact : Les jobs échoués définitivement sont perdus

**REL-3 | Logs non structurés**
- Description : Utilisation de `console.log`, `console.error` au lieu de pino (pourtant installé)
- Impact : Pas de structure JSON, pas de niveau de log, impossible de filtrer/alerter

**REL-4 | Pas de health check Redis**
- Description : `/api/health` existe mais ne vérifie probablement pas Redis
- Impact : Un Redis down passe inaperçu jusqu'au premier appel

---

## Agent 8 — Staff Engineer Review

### 🔮 Risques à grande échelle (x10, x100)

**STAFF-1 | Le scoring algorithm n'est pas versionné**
- Description : `config/scoringWeights.ts` est un fichier statique. Si les poids changent, les scores historiques ne sont plus comparables
- Impact : À x100 utilisateurs, l'incohérence des scores devient un problème business
- Solution : Versionner l'algo de scoring, stocker `algoVersion` dans les résultats

**STAFF-2 | Outbox pattern dans BulkJob.emailsJson**
- Description : Les emails sont stockés en JSON dans une colonne TEXT — pas scalable
- Impact : À partir de 100k emails, le champ TEXT devient très gros (charge/transfert)

**STAFF-3 | Pas de stratégie de cache distribuée**
- Description : Le cache Redis est utilisé sans stratégie d'invalidation claire
- Impact : Stale reads, données incohérentes entre instances

**STAFF-4 | Architecture monolithe Next.js**
- Description : Tout tourne dans Next.js (API, pages, middleware). Pas de séparation API/metier
- Impact : Impossible de scaler indépendamment API et worker

---

# 🏢 COUCHE MÉTIER (Business Layer)

## Agent Business Analyst

### Problèmes métier identifiés

**BIZ-1 | Seuils de score non documentés**
- Description : Les seuils (25, 40, 60, 75) dans `ScoreCircle.tsx` et les seuils de status (40, 75) dans `emailValidator.ts` sont hardcodés sans documentation métier
- Impact Business : Impossible d'expliquer pourquoi un email est "risky" vs "invalid"
- Exemple : Un email avec score 39 est "invalid" tandis que 40 est "risky" — pourquoi 40 ?

**BIZ-2 | Rate limiting anonyme trop strict**
- Description : `validate/route.ts:97` — 5 req/min/IP pour les utilisateurs non authentifiés
- Impact Business : Un utilisateur qui teste 6 emails sans connexion est bloqué — mauvaise conversion
- Solution : 10 req/min avec un message pour inciter à créer un compte

**BIZ-3 | Règle crédits gratuits non appliquée en production**
- Description : `auth.ts:203` — `credits: 100` défini dans `createUser` event
- Impact Business : Fonctionne pour les nouveaux utilisateurs mais pas de crédits pour les utilisateurs existants qui changent de plan

**BIZ-4 | Pas de gestion des doublons dans les jobs bulk**
- Description : `bulkProcessor.ts` ne déduplique pas les emails dans un CSV
- Impact Business : L'utilisateur paie pour des validations en double

---

## Agent Domain Expert (DDD)

### Problèmes modèle métier

**DDD-1 | Anemic Domain Model**
- Description : Le modèle métier est purement des données — `User`, `Validation`, `BulkJob` sont des entités Prisma sans comportement métier
- Impact : Toute la logique métier est dans les services / routes
- Suggestion : Extraire les comportements métier dans des classes domaine

**DDD-2 | Webhook comme aggregate root discutable**
- Description : `Webhook` est lié à `User` par FK mais a ses propres règles (IP pinning, HMAC signing)
- Suggestion : `Webhook` mérite d'être un aggregate indépendant avec ses propres invariants

**DDD-3 | Value objects manquants**
- Description : EmailAddress, Score, Status, CreditAmount sont des primitives (string, number)
- Impact : Validation dispersée, duplication de `"valid" | "invalid" | "risky" | "unknown"` dans tout le code
- Suggestion : Créer des value objects typés

---

## Agent Use Cases Review

### Problèmes Use Cases

**UC-1 | `validate/route.ts` fait trop de choses**
- Type : Trop grand
- Description : Route unique qui gère : auth, rate limit anonymous, rate limit plan, format check, disposable check, credit deduction, validation complète, logging, caching
- Suggestion : Découper en middlewares séparés (AuthMiddleware, RateLimitMiddleware, CreditMiddleware, ValidationService)

**UC-2 | `bulkProcessor.ts` mélange parsing CSV et métier**
- Type : Mal découpé
- Description : La fonction `processBulkUpload` parse le CSV, valide les colonnes, vérifie les crédits, crée le job, et envoie à la queue
- Suggestion : Séparer `CsvParser`, `CreditManager`, `JobCreator`

**UC-3 | Pas d'idempotence sur les commandes**
- Type : Risque
- Description : Aucun use case n'est idempotent — si un webhook est envoyé 2x, un crédit est déduit 2x
- Suggestion : Ajouter des idempotency keys sur les mutations

---

# 💾 COUCHE DATA ACCESS

## Agent Repository Review

### Problèmes Repositories

**REPO-1 | `prisma/user.ts` expose l'entité ORM directement**
- Description : Les entités Prisma sont passées directement dans les réponses API et les composants
- Impact : Couplage fort au schéma DB, fuite de colonnes sensibles (email hash, etc.)
- Solution : Ajouter des DTOs/mappers entre DB et API

**REPO-2 | `prisma/validation.ts` — Pas de repository pattern**
- Description : Les validations sont créées directement via `prisma.validation.create()` dans les routes
- Impact : Pas d'abstraction, duplication des filtres (pagination, status)

**REPO-3 | `services/bulkProcessor.ts` — `getBulkJobStatus` utilise `where: any`**
- Description : `const where: any = { id: jobId }` — perte de type safety
- Impact : Risque d'injection ou d'erreur

---

## Agent Query Performance

### Requêtes problématiques

**🔴 QP-1 | Worker — INSERT par email (N+1 DB)**
- Méthode : `worker/index.ts:85-95` — `prisma.validation.create()` en boucle
- Problème : N+1 inserts DB pour N emails
- Impact : Critique pour les jobs > 10k emails
- Solution : Buffer les résultats et utiliser `createMany`

**🟠 QP-2 | Dashboard — Récupération des crédits utilisateur**
- Méthode : `dashboard/layout.tsx:23-27` — `prisma.user.findUnique()` pour chaque page dashboard
- Problème : Requête DB redondante (l'utilisateur est déjà dans la session)
- Solution : Inclure les crédits dans le session.user ou cache Redis

**🟡 QP-3 | `validate/route.ts` — double requête crédits**
- Méthode : L.227-233 (updateMany) + L.268-273 (findUnique)
- Problème : 2 requêtes pour gérer les crédits
- Solution : Utiliser `UPDATE ... RETURNING` via Prisma raw query

---

## Agent ORM Review

### Problèmes ORM

**ORM-1 | Prisma adapter type cast**
- Description : `lib/auth.ts:25` — `PrismaAdapter(prisma as any)`
- Problème : Perte de type safety à cause d'un mismatch de typage entre NextAuth v5 et Prisma
- Risque : Erreurs runtime non détectées à la compilation

**ORM-2 | Lazy loading potentiel sur les relations User**
- Description : `User` a des relations vers Account, Session, ApiKey, etc. — pas de `select` explicite partout
- Risque : N+1 silencieux si on accède à des relations sans les inclure

**ORM-3 | Cascade delete non configuré pour ApiKey**
- Description : `User` → `ApiKey` a `onDelete: Cascade` mais `Validation` → `User` a `onDelete: SetNull`
- Problème : Incohérence — pourquoi SetNull pour les validations mais Cascade pour les clés ?
- Risque : Données orphelines si un utilisateur est supprimé

---

# 🗄️ COUCHE DATABASE

## Agent DBA

### Problèmes Schéma

**DBA-1 | `User.email` — `String?` (nullable)**
- Table : `User` — colonne `email`
- Problème : L'email est nullable avec `@unique` — un email null ne peut pas être unique
- Risque : Deux utilisateurs peuvent avoir email=NULL (techniquement possible selon le SGBD)
- Recommandation : `@unique` sur colonne nullable est problématique — utiliser une contrainte partielle ou rendre NOT NULL

**DBA-2 | `Validation.checksJson` — type `Json` non contraint**
- Table : `Validation` — colonne `checksJson`
- Problème : Pas de validation au niveau DB que le JSON respecte le format `ValidationChecks`
- Recommandation : Ajouter une CHECK constraint ou valider via Prisma

**DBA-3 | `BulkJob.emailsJson` — `String?` (TEXT)**
- Table : `BulkJob` — colonne `emailsJson`
- Problème : Stocke un tableau JSON d'emails dans TEXT sans validation de format JSON
- Recommandation : Utiliser `@db.JsonB` ou au minimum une contrainte CHECK

**DBA-4 | `Webhook.pinnedIps` — `String?` (TEXT) avec JSON texte**
- Table : `Webhook` — colonne `pinnedIps`
- Problème : Champ JSON stocké en TEXT avec parsing manuel (`JSON.parse`)
- Recommandation : Utiliser le type `Json` de Prisma

---

## Agent Scalability (Database)

### Problèmes scalabilité DB

**SCL-DB-1 | Table `Validation` — volume projeté**
- Impact à x10 (1M validations) : Les index existants tiennent, mais l'index `[email]` devient coûteux
- Impact à x100 (10M validations) : Partitionnement nécessaire par date (`createdAt`)
- Solution : Stratégie de partitionnement par mois/trimestre

**SCL-DB-2 | Table `AuditLog` — pas de stratégie d'archivage**
- Description : AuditLog s'accumule indéfiniment — pas de cleanup automatique
- Impact : Table non bornée
- Solution : TTL (30/90 jours), archivage vers un entrepôt de logs

**SCL-DB-3 | Table `RateLimit` — concurrence sur `key`**
- Description : `RateLimit` table avec `key` en PK et `[resetAt]` index
- Impact : Écritures concurrentes sur la même clé — contention
- Solution : Utiliser Redis exclusivement pour le rate limiting (déjà fait) et supprimer la table RateLimit

---

## Agent Data Integrity

### Problèmes d'intégrité

**DI-1 | Race condition sur `updateMany` crédits**
- Description : `validate/route.ts:227-233` et `bulkProcessor.ts:137-141` — déduction de crédits atomique mais :
  1. La validation peut échouer APRÈS la déduction
  2. L'utilisateur paie mais le résultat n'est pas sauvegardé
- Risque : Perte de crédits
- Solution : Utiliser une transaction qui wrap déduction + validation, avec rollback si échec

**DI-2 | Soft delete non filtré sur certains status**
- Description : Aucun soft delete n'est utilisé actuellement
- Risque : Suppressions définitives impossibles à récupérer
- Solution : Ajouter `deletedAt` sur les modèles sensibles (User, ApiKey)

**DI-3 | Timestamps manquants sur certains modèles**
- Description : `Webhook` n'a pas de `updatedAt`
- Problème : Impossible de tracer les modifications
- Solution : Ajouter `updatedAt @updatedAt`

---

# 🏗️ COUCHE INFRASTRUCTURE

## Agent Reliability

### Problèmes de résilience

**REL-1 | Retry sans backoff jitter**
- Description : `webhookDispatcher.ts:25` — `RETRY_DELAYS = [2000, 4000, 8000]` fixe, pas de jitter
- Impact : Si tous les webhooks échouent, les retries sont synchronisés — Thundering Herd
- Solution : Ajouter jitter (±20%) à chaque délai

**REL-2 | Timeout non défini sur les appels externes**
- Description : Plusieurs appels fetch externes (DNS, WHOIS, SMTP) n'ont pas de timeout défini
- Impact : Une dépendance lente peut bloquer tout le worker
- Solution : Ajouter `AbortSignal.timeout()` partout (déjà fait pour webhooks)

**REL-3 | Pas de circuit breaker**
- Description : Si Redis est down, le rate limiting tombe en fallback mémoire (stricter limits)
- Impact : Bon comportement (fail-closed), mais pas de rétablissement automatique
- Solution : Health check Redis avec circuit breaker pattern

**REL-4 | Single point of failure — PostgreSQL**
- Description : Une seule instance PostgreSQL sans réplica
- Impact : Downtime DB = downtime complet de l'application
- Solution : Configurer un réplica de lecture ou RDS Multi-AZ

---

## Agent Security

### 🔒 Rapport de sécurité complet

| # | OWASP | Vulnérabilité | Criticité | CVSS | Solution |
|---|-------|--------------|-----------|------|----------|
| 1 | A2 | Session invalidation partielle | High | 7.4 | Supprimer la session DB en plus de la marquer invalide |
| 2 | A3 | Email stocké en clair (Validation table) | High | 7.0 | Hasher ou chiffrer l'email après la validation initiale |
| 3 | A5 | CSP défini 2x (middleware + next.config) | Medium | 5.0 | Unifier le CSP dans le middleware uniquement |
| 4 | A6 | next-auth en beta, risques CVE | Medium | 5.5 | Monitorer les versions stables |
| 5 | A5 | Headers manquants : X-Content-Type-Options sur API | Low | 3.1 | Déjà présent dans next.config |
| 6 | A1 | SQL injection possible via raw query | Low | 2.5 | Les `$queryRaw` utilisent des paramètres liés (OK) |
| 7 | A7 | Pas de CSRF protection sur les routes API | Medium | 4.8 | Utiliser des CSRF tokens ou Double Submit Cookie |
| 8 | A4 | IDOR potentiel sur /api/v1/bulk/{jobId} | High | 6.5 | Vérifier que l'utilisateur est bien le propriétaire du job |

**SEC-7 | HSTS manquant en développement**
- Description : `next.config.ts:147-154` — HSTS activé seulement en production
- Impact : Pas de protection HSTS en dev/staging
- Risque : Faible (environnement de dev)

**SEC-8 | Pas de rate limiting sur les webhooks sortants**
- Description : Si un utilisateur a 100 webhooks configurés, un événement peut générer 100 appels simultanés
- Impact : Risque de DDoS accidentel sur le serveur cible

---

## Agent Observability

### Zones aveugles

**OBS-1 | Aucune métrique RED implémentée**
- Description : Aucune métrique (Rate, Errors, Duration) n'est exposée sur les endpoints API
- Impact : Impossible de monitorer la santé du service en temps réel
- Solution : Exposer des métriques Prometheus ou utiliser Sentry Performance

**OBS-2 | Logs non structurés**
- Description : `console.log/error/warn` utilisés dans tout le codebase au lieu de pino
- Impact : Pas d'indexation, pas de format JSON, pas de niveau de log cohérent
- Solution : Migrer vers pino avec format JSON structuré

**OBS-3 | Pas de distributed tracing**
- Description : Aucun correlation ID propagé entre les requêtes API → BullMQ worker
- Impact : Impossible de tracer une validation de la requête HTTP à l'insertion DB
- Solution : Propager un `x-request-id` de l'API au worker via le job data

**OBS-4 | Sentry configuré mais pas utilisé systématiquement**
- Description : Sentry dans les dépendances mais utilisé seulement dans ErrorBoundary
- Impact : Les erreurs API ne sont pas capturées par Sentry

---

## Agent Cloud & Ops

### Problèmes opérationnels

**OPS-1 | Dockerfile non optimisé**
- Description : `COPY . .` avant build → copie node_modules et .next du host
- Impact : Build lente, cache non utilisé
- Solution : Multi-stage build avec `.dockerignore` approprié

**OPS-2 | Health check Redis manquant dans docker-compose**
- Description : `postgres` a un healthcheck mais pas `redis`
- Impact : Next.js/Worker peuvent démarrer avant que Redis ne soit prêt
- Solution : Ajouter healthcheck Redis

**OPS-3 | Pas de stratégie de rollback**
- Description : Aucun mécanisme explicite de rollback en cas de déploiement échoué
- Impact : Downtime prolongé en cas de bug
- Solution : Utiliser des blue-green deployments ou canary releases

---

# 🏛️ SYNTHÈSE ARCHITECTE (Agent Final)

## Top 20 problèmes (tous domaines)

| Rang | Domaine | Problème | Impact | Effort | Sources |
|------|---------|----------|--------|--------|--------|
| 1 | 🔒 Sécurité | Session invalidation partielle (tokenVersion) | High | S | SEC-1, ARCH-1 |
| 2 | 🔒 Sécurité | Email stocké en clair dans Validation | High | M | SEC-2, DBA-1 |
| 3 | ⚡ Perf | Worker — inserts DB individuels (N+1) | High | M | PERF-2, QP-1 |
| 4 | 🐛 Data Integrity | Race condition crédits (déduction sans rollback validation) | High | M | DI-1 |
| 5 | 🔒 Sécurité | CSP défini 2x (contourné) | Medium | XS | SEC-3 |
| 6 | 💻 Front-end | Sidebar non responsive | High | S | UI-4, RESP-1 |
| 7 | 🧱 Architecture | Pas de séparation des couches claire | High | XL | ARCH-1, STAFF-4 |
| 8 | 🎨 Design | Design system défini mais pas appliqué | Medium | M | DS-1, DS-2 |
| 9 | 🔒 Sécurité | IDOR potentiel sur endpoints bulk | High | S | SEC-8 |
| 10 | 🧪 Tests | Pas de tests pour le scoring algorithm | Medium | M | STAFF-1 |
| 11 | 📊 Observabilité | Logs non structurés (console.*) | Medium | M | OBS-2, REL-3 |
| 12 | 💻 Front-end | Duplication du pattern fetch (5 pages) | Medium | S | ARCH-FE-1 |
| 13 | 🗄️ DB | BulkJob.emailsJson en TEXT (pas JSONB) | Medium | XS | DBA-3, STAFF-2 |
| 14 | ⚡ Perf | DNS checks non cachés (100-500ms/check) | Medium | M | PERF-4 |
| 15 | 🏗️ Architecture | Anemic domain model (pas de logique métier dans les entités) | Medium | L | DDD-1 |
| 16 | 📊 Observabilité | Pas de métriques RED | Medium | M | OBS-1 |
| 17 | ♿ Accessibilité | Modales sans ARIA, pas de focus trap | High | M | A11Y-2, A11Y-3 |
| 18 | 📈 Scalabilité | AuditLog sans archivage | Low | S | SCL-DB-2 |
| 19 | 🔒 Sécurité | Pas de CSRF sur les routes API | Medium | S | SEC-7 |
| 20 | 💻 Front-end | Émojis comme icônes dans la sidebar | Low | XS | UI-2 |

---

## 🧨 Dette technique critique (coûtera 10x plus dans 6 mois)

1. **Session invalidation partielle** — Ignorer maintenant = faille de sécurité exploitable
2. **Worker sans batch inserts** — À 1M validations/mois, les performances DB vont se dégrader fortement
3. **Logs non structurés** — Sans logs JSON, le diagnostic d'incident sera impossible
4. **Pas de séparation des couches** — Chaque nouvelle feature aggravera le couplage
5. **Race condition crédits** — Perte de revenus et support client

---

## ⚠️ Risques à 6 mois

- **Volume Validation** : Sans partitionnement, les index deviennent coûteux
- **Monolithe Next.js** : Impossible de scaler API et worker indépendamment
- **Pas de métriques** : Impossible de dimensionner correctement les ressources
- **CSRF manquant** : Risque de Cross-Site Request Forgery sur les mutations API
- **Secret webhook non caché** : Le déchiffrement à chaque appel devient un bottleneck

---

## 🔮 Risques à 2 ans

- **Architecture monolithe** : Bloquant pour ajouter des features complexes (ML, real-time)
- **Design system non appliqué** : L'UI devient incohérente, le redesign coûte 10x
- **Pas de versioning API** : Breaking changes impossibles à déployer
- **Absence de tests sur le scoring** : Impossible d'itérer sur l'algo sans casser la prod
- **Pas de stratégie de cache** : Les coûts Redis/DB explosent

---

## 📅 Plan d'action priorisé

### Sprint 1 — Correctifs critiques (semaine 1-2)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 1 | CORRIGER la session invalidation (supprimer la session DB) | S | 🔴 |
| 2 | AJOUTER un mécanisme de rollback crédits si validation échoue | M | 🔴 |
| 3 | PROTÉGER les endpoints bulk contre les IDOR (vérifier userId) | S | 🔴 |
| 4 | UNIFIER le CSP (middleware uniquement, supprimer de next.config) | XS | 🟠 |
| 5 | HASHER les emails dans Validation après validation initiale | M | 🔴 |
| 6 | AJOUTER des attributs ARIA + focus trap sur les modales | M | 🔴 |

### Sprint 2 — Stabilisation (semaine 3-6)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 7 | WORKER : Remplacer les inserts individuels par `createMany` batch | M | 🔴 |
| 8 | AJOUTER des timeouts sur tous les appels DNS/SMTP/WHOIS | M | 🟠 |
| 9 | MIGRER les logs vers pino (format JSON structuré) | M | 🟠 |
| 10 | RENDRE la sidebar responsive (drawer mobile) | S | 🟠 |
| 11 | EXTRAIRE le pattern fetch dans un hook `useFetch` | S | 🟠 |
| 12 | AJOUTER un cache TTL pour les vérifications DNS | M | 🟠 |

### Sprint 3 — Amélioration (mois 2-3)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 13 | AJOUTER des métriques RED (Rate, Errors, Duration) via Sentry | M | 🟡 |
| 14 | IMPLÉMENTER un correlation ID (API → Worker → DB) | M | 🟡 |
| 15 | DÉCOUPLER la route validate en middlewares (Auth, RateLimit, Credit) | L | 🟡 |
| 16 | APPLIQUER les tokens du design system (--space-*, --radius-*) | M | 🟡 |
| 17 | AJOUTER des CSRF tokens sur les routes API de mutation | S | 🟡 |
| 18 | VERSIONNER le scoring algorithm | M | 🟡 |

### Horizon 6 mois — Évolution

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 19 | EXTRAIRE les entités Prisma en DTOs séparés | L | 🟢 |
| 20 | AJOUTER des value objects (EmailAddress, Score, Status) | L | 🟢 |
| 21 | PARTITIONNER la table Validation par date | L | 🟢 |
| 22 | IMPLÉMENTER une stratégie de cache distribuée (Redis + invalidation) | L | 🟢 |
| 23 | DOCUMENTER l'API avec OpenAPI/Swagger | M | 🟢 |
| 24 | AJOUTER des réplicas de lecture PostgreSQL | L | 🟢 |

---

## Score d'architecture global

| Domaine | Note |
|---------|------|
| 🏗️ Architecture | 5/10 |
| 🔒 Sécurité | 5/10 |
| ⚡ Performance | 6/10 |
| 🔧 Maintenabilité | 5/10 |
| 📈 Scalabilité | 4/10 |
| 📊 Observabilité | 3/10 |
| **🎯 Score global** | **4.7/10** |

---

## Verdict

Le projet **MailGuard Pro** est un produit fonctionnel avec une base technique solide (Next.js 15, TypeScript 6, Prisma, Tailwind) mais qui montre des signes de croissance non accompagnée. Les **problèmes de sécurité immédiats** (session invalidation, emails en clair, IDOR) doivent être traités en priorité absolue. La **dette technique architecturale** (monolithe, anemic domain, pas de séparation des couches) est préoccupante mais peut être résorbée progressivement. Le **design system** est excellent sur le papier mais n'est pas appliqué dans les composants — un effort de standardisation rapide est nécessaire avant que l'incohérence ne devienne incontrôlable. Enfin, **l'observabilité** est le parent pauvre : sans logs structurés ni métriques, l'équipe opère en aveugle.

**Trajectoire recommandée :** 1 sprint de correctifs sécurité/critiques → 2 sprints de stabilisation → 3 mois de refactoring architectural progressif. L'architecture actuelle peut tenir jusqu'à ~10x le volume actuel avant de nécessiter une réécriture majeure de la couche data.

---

*Document généré par le pipeline de revue automatisé — Juin 2026*
