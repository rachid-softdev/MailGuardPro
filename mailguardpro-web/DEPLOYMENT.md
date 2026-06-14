# MailGuard Pro — Deployment Guide

## Overview

MailGuard Pro is a Next.js web application within a pnpm monorepo. It uses PostgreSQL for persistent storage, Redis for rate limiting and BullMQ job queues, and integrates with Stripe, Resend, and Sentry.

The deployment surface includes:

- **Next.js app** — main web server (Docker / Vercel / bare metal)
- **Worker** — BullMQ background job processor (Docker)
- **Cron jobs** — scheduled maintenance via Vercel Cron Jobs or system cron

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js     | >=20.19.0 | See `engines` in `mailguardpro-web/package.json` |
| pnpm        | >=9.15.9 | Required by corepack / CI; install via `corepack enable` |
| PostgreSQL  | >=15     | Used by Prisma ORM |
| Redis       | >=7      | Required for BullMQ queues and rate limiting |
| Stripe      | —        | Account needed for billing features |
| Resend      | —        | Account needed for magic links and transactional emails |
| Sentry      | —        | Optional — error tracking |

---

## Environment Variables

All variables are scoped to the `mailguardpro-web` app. Copy `.env.example` to `.env.local` for local development or `.env.production.local` for production.

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/mailguard` |
| `REDIS_URL` | Redis connection string | `redis://:password@host:6379` |
| `REDIS_PASSWORD` | Redis password | Must match Redis `requirepass` |
| `AUTH_SECRET` | NextAuth secret (min 32 chars) | `openssl rand -base64 32` |
| `AUTH_RESEND_KEY` | Resend API key for magic link emails | `re_xxxxxxxxxxxx` |
| `RESEND_API_KEY` | Resend API key (same value as above) | `re_xxxxxxxxxxxx` |
| `EMAIL_FROM` | Sender address for outgoing emails | `noreply@mailguard.pro` |
| `STRIPE_SECRET_KEY` | Stripe secret key (use live key in prod) | `sk_live_xxxxxxxxxxxx` |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key | `pk_live_xxxxxxxxxxxx` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | `whsec_xxxxxxxxxxxx` |
| `NEXT_PUBLIC_STRIPE_PUBLIC_KEY` | Client-side Stripe publishable key | `pk_live_xxxxxxxxxxxx` |
| `NEXT_PUBLIC_APP_URL` | Public URL of the deployed app | `https://mailguard.pro` |
| `API_KEY_PEPPER` | HMAC pepper for API key hashing (64 hex chars) | `openssl rand -hex 32` |
| `TOKEN_ENCRYPTION_KEY` | AES-256-GCM key for token encryption (64 hex chars) | `openssl rand -hex 32` |
| `IP_HASH_KEY` | HMAC key for IP address hashing (GDPR compliance; 64 hex chars) | `openssl rand -hex 32` |
| `EMAIL_HASH_SALT` | Salt for email hashing (64 hex chars; changing invalidates existing hashes) | `openssl rand -hex 32` |
| `CRON_SECRET` | Shared secret for cron job authentication | `openssl rand -hex 32` |
| `AUTH_URL` | Canonical URL for NextAuth callbacks | `https://mailguard.pro` |

### Optional Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `AUTH_GOOGLE_ID` | Google OAuth client ID | From Google Cloud Console |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret | From Google Cloud Console |
| `AUTH_GITHUB_ID` | GitHub OAuth client ID | From GitHub OAuth App |
| `AUTH_GITHUB_SECRET` | GitHub OAuth client secret | From GitHub OAuth App |
| `SENTRY_DSN` | Sentry project DSN | `https://xxx@oxxx.ingest.sentry.io/xxx` |
| `SENTRY_AUTH_TOKEN` | Sentry auth token for source map upload | From Sentry Settings → Auth Tokens |
| `STRIPE_STARTER_PRICE_ID` | Stripe Price ID for the Starter plan | `price_starter_monthly` |
| `STRIPE_PRO_PRICE_ID` | Stripe Price ID for the Pro plan | `price_pro_monthly` |
| `STRIPE_BUSINESS_PRICE_ID` | Stripe Price ID for the Business plan | `price_business_monthly` |
| `STRIPE_DOWNGRADE_ATTEMPT_THRESHOLD` | Max failed payment attempts before auto-downgrade | `3` |
| `NODE_ENV` | Environment (set automatically by Vercel/Docker) | `production` |

### Generating Secret Values

```sh
# All of the following produce 64-character hex strings (32 bytes):
openssl rand -hex 32    # → API_KEY_PEPPER, TOKEN_ENCRYPTION_KEY, CRON_SECRET, IP_HASH_KEY, EMAIL_HASH_SALT

# NextAuth secret (use base64 for wider character set):
openssl rand -base64 32 # → AUTH_SECRET
```

---

## Deployment Options

### Option 1: Docker (recommended for self-hosted)

The project ships with three Docker artifacts:

| File | Purpose |
|------|---------|
| `mailguardpro-web/Dockerfile` | Multi-stage build for the Next.js server |
| `mailguardpro-web/Dockerfile.worker` | Build for the BullMQ background worker |
| `mailguardpro-web/docker-compose.yml` | Orchestrates Postgres + Redis + Next + Worker |

#### Quick start with Docker Compose

```sh
# 1. Set required secrets
export POSTGRES_PASSWORD="$(openssl rand -hex 16)"
export REDIS_PASSWORD="$(openssl rand -hex 16)"

# 2. Create .env.production.local with all env vars (see table above)
#    DATABASE_URL and REDIS_URL will be overridden by docker-compose

# 3. Start the full stack
cd mailguardpro-web
docker compose up -d

# 4. Run database migrations
docker compose exec next pnpm exec prisma migrate deploy

# 5. Verify health
curl http://localhost:3000/api/health
```

Docker Compose maps:

- **PostgreSQL** → `localhost:5432`
- **Redis** → `localhost:6379`
- **Next.js app** → `localhost:3000`
- **Worker** → no external port (internal only)

#### Standalone Docker (single container)

```sh
# Build
docker build -f mailguardpro-web/Dockerfile -t mailguardpro-web .

# Run (with Postgres and Redis externally available)
docker run -d \
  --name mailguardpro \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e REDIS_URL="redis://..." \
  -e AUTH_SECRET="..." \
  -e STRIPE_SECRET_KEY="..." \
  -e NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="..." \
  -e NEXT_PUBLIC_APP_URL="https://yourdomain.com" \
  mailguardpro-web
```

#### Worker (separate container)

```sh
docker build -f mailguardpro-web/Dockerfile.worker -t mailguardpro-worker .
docker run -d \
  --name mailguardpro-worker \
  -e DATABASE_URL="postgresql://..." \
  -e REDIS_URL="redis://..." \
  mailguardpro-worker
```

#### Dockerfile details

The main `Dockerfile` uses three stages:

1. **`deps`** — Installs production dependencies only (`--prod` flag) to minimize image size.
2. **`builder`** — Generates the Prisma client and runs `pnpm run build` (Next.js build).
3. **`runner`** — Minimal Alpine image with only the built `.next` output, `public/` assets, `node_modules`, and `package.json`. Runs as a non-root `mailguard` user (UID 1001). Exposes port 3000 and starts with `pnpm start`.

#### .dockerignore

The `.dockerignore` excludes `node_modules`, `.next`, `.env*`, `coverage`, `tests`, and markdown files from the Docker build context.

---

### Option 2: Vercel (recommended for managed hosting)

The project includes `mailguardpro-web/vercel.json` which configures three Vercel Cron Jobs.

#### Step-by-step

1. **Push the repository to GitHub.**

2. **Import the project in Vercel:**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Select your Git provider and repository
   - Configure the project:

   | Setting | Value |
   |---------|-------|
   | Root Directory | `mailguardpro-web` |
   | Framework Preset | Next.js (auto-detected) |
   | Build Command | *(see below)* |
   | Output Directory | `.next` |

3. **Set the build command:**

   Because this is a pnpm monorepo, the build command must navigate to the root to install workspace dependencies:

   ```
   cd .. && pnpm install --frozen-lockfile && cd - && pnpm run build
   ```

   Alternatively, if using Vercel's pnmpx support, you can use:
   ```
   pnpm install --frozen-lockfile && pnpm run build
   ```
   (with root directory set to `mailguardpro-web`, the lockfile at the monorepo root must be accessible — Vercel handles this when the root directory is a subdirectory of the repo.)

4. **Add all environment variables** listed in the table above. For production, use live Stripe keys and a production `AUTH_SECRET`.

5. **Configure Vercel Cron Jobs** (already defined in `vercel.json`):
   - `0 0 * * 0` → `/api/cron/sync-disposable` (weekly disposable domain sync)
   - `0 2 * * *` → `/api/cron/cleanup` (daily cleanup of expired data)
   - `0 8 * * *` → `/api/cron/check-credits` (daily credit balance checks)

   These require the `CRON_SECRET` environment variable to be set for authentication.

6. **Deploy.** Vercel will run the build pipeline and provision a preview URL, then promote to production on push to `main`.

#### Vercel-specific notes

- **Serverless Functions:** Next.js API routes (`app/api/**`) become Vercel Serverless Functions automatically. Long-running tasks (bulk validation jobs) are delegated to the Worker via BullMQ/Redis, not handled in API routes.
- **Edge:** No Edge Runtime is used; all routes run on the Node.js runtime.
- **Image Optimization:** Next.js built-in image optimization is handled by Vercel's Edge with no additional configuration.
- **WebSockets:** Not used; real-time updates are poll-based or via the Worker pattern.

---

### Option 3: Bare Metal / VPS (SSH-based)

The repository includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that deploys via SSH to a staging or production server.

#### Server Setup (one-time)

```sh
# Install Node.js 20 and pnpm
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
corepack enable && corepack prepare pnpm@9.15.9 --activate

# Install PostgreSQL 15 and Redis 7
# Configure both services with systemd

# Clone the repository
git clone https://github.com/your-org/mailguard-pro.git /opt/mailguard-pro
cd /opt/mailguard-pro

# Install dependencies
pnpm install --frozen-lockfile

# Generate Prisma client and run migrations
cd mailguardpro-web
pnpm exec prisma generate
pnpm exec prisma migrate deploy

# Build
pnpm run build

# Set up systemd service (see below)
```

#### systemd service file

Create `/etc/systemd/system/mailguard-pro.service`:

```ini
[Unit]
Description=MailGuard Pro Next.js App
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=mailguard
WorkingDirectory=/opt/mailguard-pro/mailguardpro-web
Environment=NODE_ENV=production
Environment=DATABASE_URL=postgresql://...
Environment=REDIS_URL=redis://...
# ... all other env vars
ExecStart=/usr/bin/pnpm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then:

```sh
sudo systemctl daemon-reload
sudo systemctl enable mailguard-pro
sudo systemctl start mailguard-pro
```

---

## Database Migrations

Migrations are managed with Prisma. Schema definitions are in `mailguardpro-web/prisma/schema.prisma`.

### Before first deploy

```sh
cd mailguardpro-web

# Apply all pending migrations (safe for production)
pnpm exec prisma migrate deploy

# Or, for development/new databases, push the schema directly
pnpm exec prisma db push
```

### After schema changes

1. Create a migration locally:
   ```sh
   pnpm exec prisma migrate dev --name describe_your_change
   ```
2. Commit the generated migration file.
3. On deploy, the CI/CD pipeline or deployment script runs `prisma migrate deploy`.

### Migration safety

- **`migrate deploy`** applies only pending migrations — safe to run at startup.
- **`db push`** syncs the schema without a migration file — use for dev only.
- Migrations are run **before** the new app version starts serving traffic.

---

## CI/CD Pipeline

The project has two CI workflows and one deploy workflow:

### `.github/workflows/web/ci.yml` — Web-specific CI

Triggered on pushes and PRs touching `mailguardpro-web/`, `packages/`, `biome.json`, `pnpm-lock.yaml`.

| Job | Description |
|-----|-------------|
| **lint** | ESLint + Biome format check |
| **typecheck** | TypeScript compilation check (`tsc --noEmit`) after `prisma generate` |
| **test** | Vitest unit + integration tests with PostgreSQL 15 and Redis 7 service containers. Runs `prisma db push` to set up the test database. |
| **build** | Next.js production build. Depends on lint, typecheck, and test passing. Uses mock Stripe/Resend/Sentry env vars for build-time validation. |

### `.github/workflows/ci.yml` — Full monorepo CI

Same structure but segmented into discrete jobs: `lint`, `typecheck`, `test-unit`, `test-integration`, `build`. Runs unit and integration tests separately. Uploads coverage to Codecov.

### `.github/workflows/deploy.yml` — Deployment

| Trigger | Environment | Action |
|---------|-------------|--------|
| Push to `main` | Production | SSH into production server, pull, install, migrate, build, restart via systemd |
| Manual dispatch (staging) | Staging | Same flow targeting staging server |
| Manual dispatch (production) | Production | Same as push-to-main |

The deploy workflow:
1. Checks out the repository
2. Installs dependencies with `pnpm install --frozen-lockfile`
3. Generates Prisma client
4. Runs the production build (with `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET` for build-time env)
5. Pushes artifacts to the server via SSH
6. On the server: pulls latest code, installs, runs migrations, builds, and restarts the systemd service
7. Notifies Slack on completion (success or failure)

---

## Post-Deployment Checks

After deployment, verify the following:

### 1. Health endpoint

```sh
curl https://mailguard.pro/api/health
```

Expected response: `200 OK` with a JSON body including `status: "healthy"`, database connectivity, and Redis connectivity.

### 2. Email sending

Trigger a magic link login or use a test endpoint to verify Resend integration:

```sh
# If a test endpoint exists:
curl -X POST https://mailguard.pro/api/auth/signin/email \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "csrfToken": "..."}'
```

Verify the email arrives in the test inbox.

### 3. Stripe webhook endpoint

In the Stripe Dashboard → Developers → Webhooks, ensure the endpoint URL is set to:

```
https://mailguard.pro/api/stripe/webhook
```

Test the webhook with Stripe's "Send test webhook" feature. Verify the app responds with `200 OK` and the event is recorded in the `StripeEvent` table.

### 4. Redis connectivity

Check that BullMQ queue operations work:

```sh
# Via the health endpoint if it reports Redis status
curl https://mailguard.pro/api/health | jq .redis
```

Or verify directly:

```sh
redis-cli -h your-redis-host -a "$REDIS_PASSWORD" ping
# → PONG
```

### 5. Cron job authentication

Test cron endpoints with the `CRON_SECRET`:

```sh
curl -X POST https://mailguard.pro/api/cron/cleanup \
  -H "Authorization: Bearer ${CRON_SECRET}"
```

Expected: `200 OK` (runs scheduled cleanup of expired data and audit logs).

### 6. Login flow

Open the deployed URL in a browser and verify:

- Google OAuth login works (if configured)
- Magic link login with email works
- Free tier user is created with default 100 credits

### 7. API key generation

After logging in, navigate to Settings → API Keys and create a new key. Verify the key can be used against the API:

```sh
curl -X POST https://mailguard.pro/api/validate \
  -H "x-api-key: mg_live_xxxxx..." \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

---

## Vercel Cron Jobs

Defined in `mailguardpro-web/vercel.json`:

| Cron | Route | Purpose |
|------|-------|---------|
| `0 0 * * 0` (weekly Sunday midnight) | `/api/cron/sync-disposable` | Syncs the disposable email domain list |
| `0 2 * * *` (daily 2 AM) | `/api/cron/cleanup` | Cleans up expired audit logs, deleted records, and stale sessions |
| `0 8 * * *` (daily 8 AM) | `/api/cron/check-credits` | Checks user credit balances and sends low-credit notifications |

All cron endpoints require the `CRON_SECRET` header for authentication. Vercel automatically sends this via the `CRON_SECRET` environment variable.

---

## Troubleshooting

### Build fails with "PrismaClientInitializationError"

Ensure `DATABASE_URL` is set during build time. Next.js requires a database connection at build time for Prisma client generation and schema introspection.

### Docker build fails with "pnpm not found"

Make sure `corepack` is enabled and pnpm is activated before any pnpm command:

```dockerfile
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
```

### Server starts but returns 500 on all routes

Check that:
- Database migrations have been applied (`prisma migrate deploy`)
- Redis is reachable at the configured `REDIS_URL`
- The `NEXT_PUBLIC_APP_URL` matches the actual deployed URL (affects NextAuth callbacks)

### Webhook signature verification fails

Regenerate the Stripe webhook secret in the Stripe Dashboard and update `STRIPE_WEBHOOK_SECRET`. Ensure the full secret including the `whsec_` prefix is set.

---

## Architecture Diagram (Text)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Browser    │────▶│  Next.js App │────▶│  PostgreSQL  │
└──────────────┘     │  (Vercel /   │     │  (Railway /   │
                     │   Docker)    │     │   RDS / DO)   │
                     │              │     └──────────────┘
                     │  API Routes  │
                     │  - /api/*    │────▶┌──────────────┐
                     │              │     │    Redis     │
                     │  SSR Pages   │     │  (Upstash /   │
                     │              │     │   self-host)  │
                     └──────┬───────┘     └──────┬────────┘
                            │                    │
                            │              ┌─────▼────────┐
                            │              │   Worker     │
                            │              │  (BullMQ)    │
                            │              └──────────────┘
                            │
                     ┌──────▼───────┐
                     │   Stripe     │
                     │  (Webhooks)  │
                     └──────────────┘
```

---

## Security Notes

- **All secrets must be rotated on a regular schedule** — especially `TOKEN_ENCRYPTION_KEY` and `API_KEY_PEPPER`.
- **The `EMAIL_HASH_SALT` must never change in production** — changing it invalidates all cached email hashes, causing duplicate validation records.
- **Webhook secrets** (`encryptedSecret` on Webhook model) are encrypted at rest using AES-256-GCM with the `TOKEN_ENCRYPTION_KEY`.
- **API keys** are stored as HMAC-SHA256 hashes (peppered with `API_KEY_PEPPER`). The raw key value is only shown once at creation time.
- **IP addresses** in `AuditLog` are HMAC-hashed with `IP_HASH_KEY` for GDPR compliance.
