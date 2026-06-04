# Sprint 5 — Review Fixes

6 agents ont audité les changements du Sprint 5. Cette PR applique leurs correctifs.

## Correctifs appliqués

### C1 (CRITICAL) — `lib/metrics.ts`
- **`createMetricsMiddleware`**: remplace `(labels as any).start` par une closure `const start = Date.now()` (le timestamp était perdu, donnant `durationMs ≈ 0`)
- **`trackApiRequest`**: `.finally()` remplacé par `.then()`/`.catch()` pour distinguer les appels réussis des erreurs dans les métriques (les erreurs passaient comme succès)

### C2 (CRITICAL) — `services/dnsChecker.ts:getDomainInfo`
- Cache hit path: extraction du MX hostname depuis `CheckResult.detail` au lieu de toujours retourner `[]`

### M1 (MAJOR) — `app/api/v1/validate/route.ts`
- Génération unique de `requestId` en début de fonction (pas de duplication `const requestId = uuidv4()` en milieu de scope)
- Header `x-request-id` ajouté sur toutes les early-returns (4xx, anon, format fail, disposable fail)

### M2 (MAJOR) — `worker/index.ts`
- `requestId` propagé à tous les logs d'erreur: validation fail, flush batch, flush final, webhook dispatch, event completed/failed

## Fichiers modifiés
- `lib/metrics.ts` — closure + then/catch
- `services/dnsChecker.ts` — cache hit MX extraction
- `app/api/v1/validate/route.ts` — requestId unique + headers
- `worker/index.ts` — requestId dans tous les logs

## Tests
- `npm run test:run` : 73/82 pass, 1140/1157 pass
- 11 échecs pré-existants non liés (rateLimit, Stripe webhook catch logging)
