# Sprint 5 — Implémentation des items restants du plan REVIEW.md

## Contexte

Suite à la revue de code complète dans `REVIEW.md`, 4 sprints avaient déjà été exécutés. Ce sprint couvre les items restants du plan d'action non encore implémentés.

## Items implémentés

### 1. Cache DNS TTL — `services/dnsChecker.ts`

**Problème :** Les vérifications DNS (MX, SPF, DMARC) étaient effectuées à chaque validation sans cache, causant 100-500ms de latence par check.

**Solution :** Intégration du cache Redis existant dans `services/validationCache.ts` :
- `checkMX()`, `checkSPF()`, `checkDMARC()` vérifient le cache avant la résolution DNS
- `setCachedDomainChecks()` fusionne les résultats partiels (ex: MX et SPF définis indépendamment)
- TTL : 2 heures pour les domain checks

**Fichiers modifiés :**
- `mailguardpro-web/services/dnsChecker.ts` — ajout des appels `getCachedDomainChecks()` / `setCachedDomainChecks()`
- `mailguardpro-web/services/validationCache.ts` — merge des entrées existantes dans `setCachedDomainChecks()`

### 2. Timeouts DNSBL — `services/dnsblChecker.ts`

**Problème :** Les appels DNS vers les blacklists (Spamhaus, SpamCop, SORBS) n'avaient pas de timeout explicite, risquant de bloquer le worker.

**Solution :** Ajout d'une fonction `resolveWithTimeout()` (3s) wrapper autour de `dns.resolve4()` :
- Timeout appliqué sur la résolution IP du domaine
- Timeout appliqué sur chaque query DNSBL

**Fichiers modifiés :**
- `mailguardpro-web/services/dnsblChecker.ts` — ajout de `resolveWithTimeout()` avec `DNSBL_TIMEOUT_MS = 3000`

### 3. Correlation ID — Propagation API → Worker → Logs

**Problème :** Aucun identifiant de corrélation n'était propagé entre la requête API, le worker BullMQ et les logs, rendant le debugging distribué impossible.

**Solution :**
- `app/api/v1/validate/route.ts` : ajout du header `x-request-id` dans les réponses
- `app/api/v1/validate/bulk/route.ts` : génération d'un `requestId` par requête, passé à `processBulkUpload()`
- `services/bulkProcessor.ts` : passage du `requestId` dans les données du job BullMQ
- `worker/index.ts` : récupération et logging du `requestId` depuis les données du job

**Fichiers modifiés :**
- `mailguardpro-web/app/api/v1/validate/route.ts`
- `mailguardpro-web/app/api/v1/validate/bulk/route.ts`
- `mailguardpro-web/services/bulkProcessor.ts`
- `mailguardpro-web/worker/index.ts`

### 4. RED Metrics — `lib/metrics.ts`

**Problème :** Aucune métrique standardisée (Rate, Errors, Duration) n'était collectée sur les endpoints API.

**Solution :** Création d'un module de métriques RED :
- `emitRequestMetric()` — log structuré pino avec métriques de requête
- `emitErrorMetric()` — log d'erreur avec durée et contexte
- `trackApiRequest()` — wrapper pour mesurer la durée d'une opération asynchrone
- `createMetricsMiddleware()` — factory pour middleware de métriques

**Fichiers créés :**
- `mailguardpro-web/lib/metrics.ts`

### 5. CSRF Protection — Déjà en place

**Vérification :** Toutes les 10 routes API de mutation (POST/PATCH/DELETE) utilisent déjà `validateCsrfOrigin()` de `lib/csrf.ts`.

**Routes protégées :**
- `POST /api/v1/validate/bulk`
- `POST /api/v1/webhooks`
- `DELETE /api/v1/webhooks/[id]`
- `PATCH /api/v1/webhooks/[id]`
- `POST /api/v1/webhooks/[id]/test`
- `POST /api/v1/api-keys`
- `DELETE /api/v1/api-keys/[id]`
- `PATCH /api/v1/user/profile`
- `DELETE /api/v1/user`
- `POST /api/v1/billing/portal`
- `POST /api/v1/billing/subscribe`

## Tests

- **Tests passant :** 388 tests dans les fichiers modifiés (services, API routes)
- **Tests total :** 74/82 test files passent (7 échecs pré-existants non liés)
- **Fichiers de test impactés :** `dnsChecker.test.ts`, `dnsblChecker.test.ts`, `validationCache.test.ts` (tous ✅)

## Items non couverts (architecture future)

Ces items nécessitent une refonte architecturale plus large et sont proposés pour une prochaine itération :
- DTOs séparés des entités Prisma (couplage fort API/DB)
- Value objects (EmailAddress, Score, Status) — actuellement des primitives
- Partitionnement de la table `Validation` par date pour scalabilité
- Cache distribué avec stratégie d'invalidation
- Réplicas de lecture PostgreSQL
