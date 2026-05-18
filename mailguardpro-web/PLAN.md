# MASTER PROMPT — MailGuard Pro
## Alternative à ValidEmail.co — Email Intelligence Platform

---

## 🎯 CONTEXTE & VISION

Tu vas construire **MailGuard Pro**, une plateforme SaaS d'intelligence email qui va au-delà de la simple validation. L'objectif est de proposer un **score de qualité complet (0–100)** pour chaque adresse email, avec des insights actionnables pour les équipes growth, marketing et sales.

**Positionnement différenciant :**
- ValidEmail.co dit "valide / invalide" → MailGuard dit **"score de qualité + recommandations"**
- Ciblage : équipes growth B2B, freelances en prospection, agences marketing
- Valeur ajoutée : enrichissement partiel du domaine, réputation, rapport PDF exportable, webhooks, SDK multi-langage

---

## 🏗️ STACK TECHNIQUE

```
Framework : Next.js 15 App Router (back + front dans le même projet)
            → API Routes sous /app/api/  pour tous les endpoints REST
            → Server Actions pour les mutations depuis les Server Components
Base BDD  : PostgreSQL (via Prisma ORM)
Cache     : Redis (pour rate limiting, résultats, sessions)
Auth      : NextAuth.js v5 (Auth.js)
            → Provider Google OAuth
            → Provider Email (Magic Link) via Resend
Queue     : BullMQ + Redis Worker (process séparé : worker.ts)
            → Lancé en parallèle de Next.js en dev et prod
Paiement  : Stripe (abonnements + pay-per-use)
Email     : Resend (magic links + notifications transactionnelles)
Export    : csv-stringify (CSV), @react-pdf/renderer (PDF serveur),
            exceljs (XLSX), json (natif)
Déploiement : Docker Compose (dev) → Railway ou Render (prod)
              Le worker BullMQ tourne comme un second service Docker
Tests     : Vitest + Playwright (E2E)
```

---

## 📁 STRUCTURE DU PROJET

```
mailguard-pro/                  # Un seul projet Next.js 15 (back + front)
├── app/
│   ├── (marketing)/            # Groupe de routes publiques (layout sans sidebar)
│   │   ├── page.tsx            # Landing page
│   │   ├── pricing/page.tsx
│   │   └── docs/page.tsx
│   ├── (dashboard)/            # Groupe de routes protégées (layout avec sidebar)
│   │   ├── layout.tsx          # Vérifie la session NextAuth + sidebar
│   │   ├── dashboard/page.tsx
│   │   ├── validate/page.tsx
│   │   ├── bulk/page.tsx
│   │   ├── bulk/[jobId]/page.tsx
│   │   ├── api-keys/page.tsx
│   │   ├── webhooks/page.tsx
│   │   ├── reports/page.tsx
│   │   └── settings/page.tsx
│   └── api/
│       ├── auth/[...nextauth]/route.ts   # NextAuth.js handler
│       ├── v1/
│       │   ├── validate/route.ts         # GET ?email=xxx
│       │   ├── validate/bulk/route.ts    # POST (upload CSV)
│       │   ├── bulk/[jobId]/status/route.ts
│       │   ├── bulk/[jobId]/results/route.ts
│       │   ├── bulk/[jobId]/export/route.ts  # ?format=csv|json|xlsx|pdf
│       │   ├── tools/mx/route.ts
│       │   ├── tools/spf/route.ts
│       │   ├── tools/dmarc/route.ts
│       │   ├── webhooks/route.ts
│       │   └── usage/route.ts
│       └── stripe/webhook/route.ts       # Stripe webhook handler
├── lib/
│   ├── auth.ts                 # NextAuth config (Google + Magic Link)
│   ├── prisma.ts               # Prisma client singleton
│   ├── redis.ts                # Redis client singleton
│   ├── stripe.ts               # Stripe client singleton
│   └── resend.ts               # Resend client singleton
├── services/
│   ├── emailValidator.ts       # Logique de validation core
│   ├── dnsChecker.ts           # MX, SPF, DMARC lookup
│   ├── smtpChecker.ts          # Vérification SMTP
│   ├── disposableChecker.ts    # Liste domaines jetables
│   ├── reputationScorer.ts     # Score 0-100
│   ├── bulkProcessor.ts        # Upload + enqueue jobs BullMQ
│   ├── exportService.ts        # CSV / JSON / XLSX / PDF export
│   └── webhookDispatcher.ts    # Envoi webhooks signés HMAC
├── worker/
│   └── index.ts                # Process BullMQ indépendant (node worker/index.ts)
│                               # Consomme la queue et appelle emailValidator.ts
├── middleware.ts               # NextAuth middleware (protection routes dashboard)
├── prisma/
│   └── schema.prisma
├── components/
│   ├── ui/                     # shadcn/ui components
│   ├── validator/              # Composant score animé + checklist
│   ├── bulk/                   # Upload CSV + progress SSE + analytics
│   ├── charts/                 # Recharts (donut, histogramme)
│   └── export/                 # Boutons export avec options de format
├── docker-compose.yml          # PostgreSQL + Redis
├── Dockerfile.worker           # Image Docker pour le worker BullMQ
└── package.json
```

---

## ⚡ FONCTIONNALITÉS À IMPLÉMENTER (par ordre de priorité)

### PHASE 1 — Core MVP

#### 1. Validation email unitaire (API + UI)
Implémenter les vérifications suivantes dans `emailValidator.ts` :

```typescript
interface ValidationResult {
  email: string;
  score: number;           // 0-100 (notre différenciateur clé)
  status: 'valid' | 'invalid' | 'risky' | 'unknown';
  checks: {
    format: CheckResult;        // Regex RFC 5322
    mx: CheckResult;            // DNS MX records
    smtp: CheckResult;          // Connexion SMTP (RCPT TO)
    catchAll: CheckResult;      // Détection catch-all
    disposable: CheckResult;    // Base de ~50k domaines jetables
    generic: CheckResult;       // info@, contact@, support@, etc.
    freeProvider: CheckResult;  // gmail, yahoo, hotmail...
    dnsbl: CheckResult;         // Blacklists DNS
    spf: CheckResult;           // SPF record présent
    dmarc: CheckResult;         // DMARC record présent
    typo: CheckResult;          // Suggestion si faute de frappe (gmial → gmail)
  };
  domain: {
    name: string;
    registrar?: string;
    createdAt?: string;      // Âge du domaine (domaine récent = risque)
    reputation: 'good' | 'neutral' | 'poor';
  };
  suggestion?: string;       // "Vouliez-vous dire john@gmail.com ?"
  processingTimeMs: number;
}

interface CheckResult {
  passed: boolean;
  weight: number;           // Importance dans le score 0-100
  message: string;
  detail?: string;
}
```

**Algorithme de score :**
- Format valide : +15 pts
- MX record valide : +25 pts
- SMTP délivrable : +30 pts
- Non catch-all : +10 pts
- Non disposable : +10 pts
- Non générique : +5 pts
- SPF/DMARC présent : +5 pts bonus
- Domaine ancien (>1 an) : +5 pts bonus
- Pénalités : DNSBL -20, typo détectée -10

#### 2. Vérification SMTP réelle
```typescript
// smtpChecker.ts
// 1. Résoudre les MX records du domaine
// 2. Ouvrir connexion TCP sur port 25 (fallback 587)
// 3. EHLO → MAIL FROM → RCPT TO → analyser la réponse
// 4. Timeout 5s, retry 1x
// 5. Détecter les serveurs catch-all via test avec email aléatoire
// ATTENTION : implémenter un pool d'IPs/rotation pour éviter blacklisting
```

#### 3. Détection des emails jetables
```typescript
// disposableChecker.ts
// Charger la liste depuis : https://github.com/disposable-email-domains/disposable-email-domains
// Mettre en cache Redis (TTL 24h)
// Mise à jour automatique hebdomadaire via cron
// Aussi vérifier : guerrillamail, mailinator, tempmail, yopmail, etc.
```

#### 4. Détection de fautes de frappe
```typescript
// Algorithme de distance de Levenshtein sur les domaines courants
const popularDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com'];
// Si distance ≤ 2, suggérer la correction
```

### PHASE 2 — Bulk Processing

#### 5. Upload CSV et traitement en masse
```typescript
// bulkProcessor.ts via BullMQ
// - Accepter CSV jusqu'à 100k lignes (max 10MB)
// - Traitement parallèle : 10 workers simultanés
// - Progress temps réel via SSE (Server-Sent Events) ou WebSocket
// - Résultats exportables : CSV, JSON, XLSX
// - Rapport PDF avec statistiques globales (voir section Rapport)
// - Notification email quand le traitement est terminé
// - Stockage des résultats 30 jours en BDD
```

**Format CSV d'entrée accepté :**
```
email (obligatoire), first_name (optionnel), last_name (optionnel), company (optionnel)
```

**Format CSV de sortie :**
```
email, score, status, format_valid, mx_valid, smtp_valid, disposable, catchall, generic, suggestion, domain_reputation
```

#### 6. Dashboard analytics des résultats bulk
Afficher pour chaque batch :
- Donut chart : répartition valid / invalid / risky / unknown
- Histogramme des scores (0-20, 21-40, 41-60, 61-80, 81-100)
- Top domaines dans la liste
- Taux de délivrabilité estimé
- Économies estimées (coût évité d'envoi sur adresses invalides)

### PHASE 3 — Auth & API

#### 7. Configuration NextAuth.js v5

```typescript
// lib/auth.ts
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Resend from 'next-auth/providers/resend';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from './prisma';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Resend({
      // Magic Link : envoie un email avec un lien de connexion
      apiKey: process.env.RESEND_API_KEY!,
      from: 'noreply@mailguard.pro',
    }),
  ],
  callbacks: {
    session({ session, user }) {
      // Injecter plan + credits dans la session
      session.user.id = user.id;
      session.user.plan = user.plan;
      session.user.credits = user.credits;
      return session;
    },
  },
  pages: {
    signIn: '/login',           // Page de connexion custom
    verifyRequest: '/verify',   // Page "Vérifiez votre email" post magic link
  },
});

// middleware.ts — Protection automatique des routes dashboard
export { auth as middleware } from '@/lib/auth';
export const config = {
  matcher: ['/dashboard/:path*', '/validate/:path*', '/bulk/:path*',
            '/api-keys/:path*', '/webhooks/:path*', '/reports/:path*',
            '/settings/:path*'],
};
```

**Page de login `/app/(auth)/login/page.tsx` :**
- Bouton "Continuer avec Google" (OAuth)
- Champ email + bouton "Recevoir un lien magique"
- Design : dark, minimaliste, logo centré


```
GET  /api/v1/validate?email=xxx              → validation unitaire
POST /api/v1/validate/bulk                   → upload CSV
GET  /api/v1/bulk/:jobId/status              → status du job
GET  /api/v1/bulk/:jobId/results             → résultats paginés
GET  /api/v1/bulk/:jobId/export?format=csv   → export
GET  /api/v1/tools/mx?domain=xxx             → MX lookup
GET  /api/v1/tools/spf?domain=xxx            → SPF lookup
GET  /api/v1/tools/dmarc?domain=xxx          → DMARC lookup
POST /api/v1/webhooks                        → créer un webhook
GET  /api/v1/usage                           → usage du compte
```

**Auth API :**
```
Header: X-API-Key: mg_live_xxxxxxxxxxxx
Rate limiting : 10 req/s (standard), 50 req/s (pro)
```

> **Note :** Les routes `/app/api/v1/*` acceptent deux modes d'authentification :
> 1. **Session NextAuth** (cookie) → pour les appels depuis le dashboard
> 2. **API Key** (header `X-API-Key`) → pour les appels externes / SDK

**Format de réponse uniforme :**
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "uuid",
    "processingTimeMs": 342,
    "creditsUsed": 1,
    "creditsRemaining": 499
  }
}
```

#### 8. SDK officiel (packages/sdk/)
Créer un package npm `@mailguard/sdk` :
```typescript
// Usage
import { MailGuard } from '@mailguard/sdk';
const mg = new MailGuard({ apiKey: 'mg_live_xxx' });

const result = await mg.validate('test@example.com');
const job = await mg.bulk.upload('./emails.csv');
await job.waitForCompletion();
const results = await job.getResults();
```

#### 9. Webhooks
```typescript
// Déclencher des webhooks sur :
// - bulk_job_completed
// - bulk_job_failed
// - daily_report (résumé quotidien)
// Payload signé avec HMAC-SHA256 (header X-MailGuard-Signature)
// Interface UI pour configurer les endpoints
// Logs des tentatives + retry automatique (3x avec backoff exponentiel)
```

### PHASE 4 — Export multi-format (différenciateur pricing)

#### 10. Service d'export `services/exportService.ts`

L'export est un levier de valeur clé : chaque format est réservé à un plan supérieur pour justifier l'upgrade.

```typescript
// services/exportService.ts
import { stringify } from 'csv-stringify/sync';
import * as ExcelJS from 'exceljs';
import { renderToBuffer } from '@react-pdf/renderer';

type ExportFormat = 'csv' | 'json' | 'xlsx' | 'pdf';

interface ExportOptions {
  jobId: string;
  format: ExportFormat;
  filters?: {
    status?: ('valid' | 'invalid' | 'risky' | 'unknown')[];
    minScore?: number;
    maxScore?: number;
  };
}

export async function exportResults(options: ExportOptions): Promise<Buffer> {
  const results = await getJobResults(options.jobId, options.filters);
  switch (options.format) {
    case 'csv':  return exportCSV(results);
    case 'json': return exportJSON(results);
    case 'xlsx': return exportXLSX(results);
    case 'pdf':  return exportPDF(results);
  }
}
```

**Format CSV (plan STARTER+) :**
```typescript
function exportCSV(results): Buffer {
  // Colonnes : email, score, status, format_valid, mx_valid, smtp_valid,
  //            disposable, catchall, generic, freeProvider, dnsbl,
  //            spf_valid, dmarc_valid, suggestion, domain_reputation,
  //            domain_age_days, processing_time_ms
  return Buffer.from(stringify(results, { header: true, delimiter: ',' }));
}
// Header HTTP : Content-Type: text/csv
// Content-Disposition: attachment; filename="mailguard-export-{jobId}.csv"
```

**Format JSON (plan STARTER+) :**
```typescript
function exportJSON(results): Buffer {
  // Structure : { meta: { jobId, exportedAt, totalEmails, filters },
  //               summary: { valid, invalid, risky, unknown, avgScore },
  //               results: ValidationResult[] }
  return Buffer.from(JSON.stringify({ meta, summary, results }, null, 2));
}
// Header HTTP : Content-Type: application/json
```

**Format XLSX (plan PRO+) :**
```typescript
async function exportXLSX(results): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  // Onglet 1 : Résumé
  const summary = workbook.addWorksheet('Summary');
  summary.addRows([
    ['Total emails', results.length],
    ['Valid', results.filter(r => r.status === 'valid').length],
    ['Invalid', results.filter(r => r.status === 'invalid').length],
    ['Risky', results.filter(r => r.status === 'risky').length],
    ['Avg Score', average(results.map(r => r.score))],
    ['Export date', new Date().toISOString()],
  ]);

  // Onglet 2 : Tous les résultats avec mise en forme conditionnelle
  const sheet = workbook.addWorksheet('Results');
  sheet.columns = [
    { header: 'Email', key: 'email', width: 35 },
    { header: 'Score', key: 'score', width: 8 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'MX Valid', key: 'mx', width: 10 },
    { header: 'SMTP Valid', key: 'smtp', width: 12 },
    { header: 'Disposable', key: 'disposable', width: 12 },
    { header: 'Catch-all', key: 'catchall', width: 12 },
    { header: 'Suggestion', key: 'suggestion', width: 35 },
    { header: 'Domain Reputation', key: 'reputation', width: 20 },
  ];
  sheet.addRows(results);

  // Couleurs conditionnelles sur la colonne Score
  // Rouge < 40, Orange 40-70, Vert > 70
  sheet.eachRow((row, i) => {
    if (i === 1) return; // skip header
    const score = row.getCell('score').value as number;
    const fill = score > 70 ? '00C851' : score > 40 ? 'FF8800' : 'CC0000';
    row.getCell('score').fill = { type: 'pattern', pattern: 'solid',
                                   fgColor: { argb: fill } };
  });

  // Onglet 3 : Emails à risque (score < 40) — pour action immédiate
  const risky = workbook.addWorksheet('High Risk');
  risky.addRows(results.filter(r => r.score < 40));

  return workbook.xlsx.writeBuffer() as Promise<Buffer>;
}
```

**Format PDF (plan PRO+) :**
```typescript
// Généré côté serveur avec @react-pdf/renderer
// Structure du rapport PDF :
//
// Page 1 — Résumé exécutif
//   Logo MailGuard + titre "Email Validation Report"
//   Date, nom du fichier source, utilisateur
//   4 KPI cards : Total / Valid / Invalid / Avg Score
//   Taux de délivrabilité estimé en grand (ex: "73.4%")
//
// Page 2 — Graphiques
//   Donut chart : répartition statuts (SVG inline)
//   Barres : distribution des scores par tranche de 10
//   Top 10 domaines présents dans la liste
//
// Page 3 — Recommandations automatiques
//   Générées selon les patterns détectés :
//   • "X% d'adresses catch-all → impossible de confirmer la délivrabilité"
//   • "Y% d'emails jetables → supprimer avant envoi"
//   • "Z domaines blacklistés → risque de spam trap"
//   • "W emails avec typo suggérée → corriger avant campagne"
//
// Page 4 — Emails à risque élevé (score < 40)
//   Tableau paginé avec email, score, motif principal
//
// Footer : "Generated by MailGuard Pro · mailguard.pro · {date}"
```

**Route d'export `/app/api/v1/bulk/[jobId]/export/route.ts` :**
```typescript
export async function GET(req: Request, { params }) {
  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') as ExportFormat ?? 'csv';
  const user = await requireAuth(req); // Session ou API Key

  // Vérification des droits par plan
  const planRequired: Record<ExportFormat, Plan> = {
    csv:  'STARTER',
    json: 'STARTER',
    xlsx: 'PRO',
    pdf:  'PRO',
  };
  if (!userHasPlan(user, planRequired[format])) {
    return Response.json({ error: 'Upgrade required', requiredPlan: planRequired[format] },
                         { status: 403 });
  }

  const buffer = await exportResults({ jobId: params.jobId, format });
  const mimeTypes = { csv: 'text/csv', json: 'application/json',
                      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                      pdf: 'application/pdf' };

  return new Response(buffer, {
    headers: {
      'Content-Type': mimeTypes[format],
      'Content-Disposition': `attachment; filename="mailguard-${params.jobId}.${format}"`,
    },
  });
}
```

**UI Export dans `/bulk/[jobId]/page.tsx` :**
- Groupe de boutons : `[ CSV ] [ JSON ] [ XLSX 🔒 PRO ] [ PDF 🔒 PRO ]`
- Les boutons XLSX et PDF affichent un tooltip "Disponible en plan PRO" pour les utilisateurs FREE/STARTER, avec un lien direct vers la page pricing
- Options de filtrage avant export : "Exporter uniquement les valides", "Exporter les risqués seulement", "Score minimum : [slider]"



#### 10. Lead Finder avancé
```typescript
// Génère et valide des combinaisons d'email probables
// Input : prénom, nom, domaine entreprise
// Patterns testés : prenom.nom@, p.nom@, prenom@, pnom@, nom.prenom@, etc.
// Valide chaque combinaison via SMTP
// Output : email le plus probable avec score de confiance
// Bonus : suggérer le bon pattern si un email de la même entreprise est fourni
```

#### 11. Score de réputation de domaine
```typescript
// reputationScorer.ts
// Agrège : âge du domaine, présence DNSBL, SPF/DMARC configuré,
// ratio d'emails valides vus (anonymisé), historique de spam
// Score : 0-100, catégories : Excellent / Bon / Neutre / Risqué / Mauvais
```

#### 12. Rapport PDF exportable
Générer un PDF professionnel (via Puppeteer ou @react-pdf/renderer) :
```
Page 1 : Résumé exécutif (score global, taux délivrabilité, nb valides/invalides)
Page 2 : Graphiques (donut, histogramme scores, top domaines)
Page 3 : Recommandations (ex: "23% d'emails catch-all détectés → risque moyen")
Page 4 : Liste des emails à risque élevé (score < 40)
Branding : Logo MailGuard, date, nom du batch
```

#### 13. Intégrations no-code
- **Zapier** : Action "Validate Email", Trigger "Bulk Job Completed"
- **Make (Integromat)** : Module complet
- **n8n** : Node custom (open-source)
- **Bubble** : Plugin

---

## 🗄️ SCHÉMA BASE DE DONNÉES (Prisma)

```prisma
// NextAuth.js v5 requires these 4 models (Account, Session, VerificationToken, User)
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?   // Avatar Google
  plan          Plan      @default(FREE)
  credits       Int       @default(100)
  createdAt     DateTime  @default(now())
  accounts      Account[]
  sessions      Session[]
  apiKeys       ApiKey[]
  bulkJobs      BulkJob[]
  webhooks      Webhook[]
  validations   Validation[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String  // "google" | "email"
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  // Utilisé par NextAuth pour les magic links email
  identifier String
  token      String   @unique
  expires    DateTime
  @@unique([identifier, token])
}

model ApiKey {
  id          String   @id @default(cuid())
  key         String   @unique  // mg_live_xxx ou mg_test_xxx
  name        String
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  lastUsedAt  DateTime?
  createdAt   DateTime @default(now())
  isActive    Boolean  @default(true)
}

model Validation {
  id              String   @id @default(cuid())
  email           String
  score           Int
  status          String
  checksJson      Json     // Résultat complet des checks
  processingTimeMs Int
  userId          String?
  apiKeyId        String?
  bulkJobId       String?
  createdAt       DateTime @default(now())
}

model BulkJob {
  id            String      @id @default(cuid())
  userId        String
  user          User        @relation(fields: [userId], references: [id])
  filename      String
  totalEmails   Int
  processed     Int         @default(0)
  status        JobStatus   @default(PENDING)
  resultUrl     String?     // URL du fichier résultat (S3/R2)
  reportUrl     String?     // URL du PDF rapport
  startedAt     DateTime?
  completedAt   DateTime?
  createdAt     DateTime    @default(now())
}

model Webhook {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  url       String
  events    String[] // ['bulk_completed', 'daily_report']
  secret    String   // HMAC signing secret
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
}

enum Plan {
  FREE
  STARTER   // 9€/mois - 5000 validations
  PRO       // 29€/mois - 50000 validations
  BUSINESS  // 99€/mois - illimité + SLA
}

enum JobStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}
```

---

## 💳 MODÈLE DE PRICING (exports comme levier d'upgrade)

```
FREE       : 100 validations/mois
             Export : ❌ aucun (résultats visibles uniquement dans le dashboard)

STARTER    : 9€/mois → 5 000 validations
             Export : ✅ CSV + ✅ JSON
             Bulk : ✅ jusqu'à 10k lignes par batch
             API : ✅

PRO        : 29€/mois → 50 000 validations
             Export : ✅ CSV + ✅ JSON + ✅ XLSX (avec mise en forme) + ✅ PDF (rapport complet)
             Bulk : ✅ jusqu'à 100k lignes par batch
             Webhooks : ✅
             Filtres d'export avancés : ✅ (par score, par statut)
             SDK : ✅

BUSINESS   : 99€/mois → illimité + SLA 99.9% + support dédié + IP dédiée SMTP
             Export : ✅ tous formats + export programmé (cron) vers S3/email
             Export automatique webhook : résultats envoyés dès fin du job

PAY AS GO  : 0,002€/validation — Export CSV/JSON inclus, XLSX/PDF +0,001€/validation
```

---

## 🎨 DESIGN & UI

**Palette :** Dark mode first. Fond #0A0A0F (quasi noir), accents vert émeraude #00D68F et blanc cassé.
**Style :** Minimal, technique, premium. Inspiré de Vercel + Linear.
**Fonts :** Geist (titres) + JetBrains Mono (données/code) via Google Fonts.

### Pages à créer :

#### Landing page `/`
- Hero : "Your email list is lying to you." + démo interactive
- Score visuel animé (cercle 0-100) plutôt qu'un simple "valid/invalid"
- Section features avec icônes techniques
- Pricing transparent
- Social proof : "X emails validés ce mois" (compteur live via SSE)
- Footer : liens outils gratuits (MX, SPF, DMARC lookup)

#### Dashboard `/dashboard`
- Stats : crédits restants, validations ce mois, taux moyen de délivrabilité
- Quick validate : input email → résultat immédiat avec score animé
- Dernières validations (tableau avec filtres)
- Activité bulk jobs en cours

#### Validator UI `/validate`
- Input email + bouton "Analyze"
- Affichage du score en cercle animé (0-100, couleur rouge→orange→vert)
- Checklist visuelle de tous les checks avec icônes ✓/✗/⚠
- Suggestion de correction si typo détectée
- Données domaine (réputation, âge, SPF/DMARC)
- Bouton "Copy JSON" pour les devs

#### Bulk `/bulk`
- Drag & drop zone pour CSV
- Preview des premières lignes
- Progress bar temps réel (SSE)
- Résultats : tableau filtrable + graphiques analytics
- Export : CSV / JSON / XLSX / PDF

#### API Keys `/api-keys`
- Créer/révoquer des clés (live + test)
- Usage par clé (graphique)
- Code snippets par langage (curl, JS, Python, PHP)

#### Documentation `/docs`
- Getting started (5 min)
- Référence API complète (style Stripe)
- Guides : intégration Zapier, Make, n8n
- SDK documentation

---

## 🔒 SÉCURITÉ & COMPLIANCE

```
- HTTPS only, HSTS
- API keys hashées en BDD (bcrypt), jamais stockées en clair
- Rate limiting par IP + par API key (Redis sliding window)
- CORS configuré strictement
- Sanitisation des inputs (pas d'injection via email field)
- Logs d'audit (qui a validé quoi, quand) — sans stocker les emails en clair optionnellement
- RGPD : option "No-log mode" → validation sans persistence BDD
- CCPA compliant
- Chiffrement des données au repos (PostgreSQL encryption)
- Vulnerability disclosure policy
```

---

## 🚀 ORDRE DE DÉVELOPPEMENT

```
Semaine 1 : Setup Next.js + Prisma + Docker (PostgreSQL + Redis)
            + NextAuth.js (Google OAuth + Magic Link Resend)
Semaine 2 : Core validation engine (format + DNS + SMTP + disposable + scoring)
Semaine 3 : API Routes /api/v1/validate + middleware auth (session + API key)
Semaine 4 : Landing page + page login (Google / Magic Link) + dashboard de base
Semaine 5 : Bulk processing (upload CSV → BullMQ worker → SSE progress)
Semaine 6 : Export service (CSV + JSON → STARTER, XLSX + PDF → PRO)
            + UI boutons export avec gate par plan
Semaine 7 : Stripe (plans + credits + webhooks Stripe)
Semaine 8 : Webhooks sortants + analytics dashboard (Recharts)
Semaine 9 : SDK npm + intégrations Zapier/Make + docs
Semaine 10 : Tests (Vitest + Playwright) + deploy Railway + monitoring
```

---

## 📝 COMMANDES DE DÉMARRAGE

```bash
# Créer le projet Next.js (back + front dans un seul projet)
npx create-next-app@latest mailguard-pro \
  --typescript --tailwind --app --src-dir=false --import-alias="@/*"
cd mailguard-pro

# Dépendances principales
npm install next-auth@beta @auth/prisma-adapter     # NextAuth v5
npm install prisma @prisma/client                   # ORM
npm install bullmq ioredis                          # Queue worker
npm install resend                                  # Emails
npm install stripe @stripe/stripe-js                # Paiements
npm install csv-stringify csv-parse                 # CSV
npm install exceljs                                 # XLSX
npm install @react-pdf/renderer                     # PDF
npm install shadcn                                  # UI components

# Setup shadcn
npx shadcn@latest init

# Setup Prisma
npx prisma init
# → Éditer prisma/schema.prisma (voir section schéma)
npx prisma migrate dev --name init
npx prisma generate

# Docker (PostgreSQL + Redis)
docker-compose up -d

# Démarrer le dev
npm run dev                         # Next.js sur :3000
node worker/index.ts                # Worker BullMQ (terminal séparé)
```

---

## 🔑 VARIABLES D'ENVIRONNEMENT

```env
# Base de données
DATABASE_URL=postgresql://mailguard:password@localhost:5432/mailguard

# Redis (rate limiting + BullMQ queue)
REDIS_URL=redis://localhost:6379

# NextAuth.js v5
AUTH_SECRET=your-nextauth-secret-min-32-chars        # openssl rand -base64 32
AUTH_URL=http://localhost:3000                        # En prod : https://mailguard.pro

# Google OAuth (https://console.cloud.google.com)
AUTH_GOOGLE_ID=xxx.apps.googleusercontent.com
AUTH_GOOGLE_SECRET=GOCSPX-xxx

# Resend (magic links + notifications)
AUTH_RESEND_KEY=re_xxx                               # Utilisé par NextAuth provider
RESEND_API_KEY=re_xxx                                # Utilisé pour les autres emails
EMAIL_FROM=noreply@mailguard.pro

# Stripe
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
NEXT_PUBLIC_STRIPE_PUBLIC_KEY=pk_test_xxx

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## ✅ CHECKLIST DE QUALITÉ AVANT LAUNCH

## ✅ CHECKLIST DE QUALITÉ AVANT LAUNCH

- [ ] Validation email < 500ms (p95)
- [ ] Bulk 10k emails < 60 secondes
- [ ] API uptime 99.9%
- [ ] Auth : Google OAuth fonctionnel + Magic Link reçu en < 30s
- [ ] Session NextAuth persistée correctement (cookie httpOnly)
- [ ] Export CSV téléchargeable avec les bons headers HTTP
- [ ] Export JSON valide et parseable
- [ ] Export XLSX : mise en forme conditionnelle (couleurs score) fonctionnelle
- [ ] Export PDF : rapport complet, lisible, avec graphiques SVG intégrés
- [ ] Gate par plan : XLSX/PDF bloqués pour FREE/STARTER avec CTA upgrade
- [ ] Docs complètes avec exemples pour chaque endpoint
- [ ] Tests unitaires sur le scoring engine (couverture > 80%)
- [ ] Mobile responsive (landing + dashboard)
- [ ] Dark mode natif
- [ ] SEO optimisé (landing + pages outils)
- [ ] Stripe test mode → live mode validé
- [ ] RGPD : Privacy policy + Cookie banner
- [ ] Monitoring : Sentry errors + Uptime robot
- [ ] Rate limiting testé en charge
- [ ] Worker BullMQ redémarre automatiquement (PM2 ou Docker restart policy)

---

*Master prompt créé pour Claude Code — MailGuard Pro v1.1*
*Stack : Next.js 15 (full-stack) + NextAuth.js (Google + Magic Link) + Prisma + BullMQ*
*Positionnement : Email Intelligence Platform — exports multi-format comme levier pricing*
