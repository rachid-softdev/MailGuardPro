# MailGuard Pro

[![CI](https://github.com/mailguardpro/mailguard-pro/actions/workflows/ci.yml/badge.svg)](https://github.com/mailguardpro/mailguard-pro/actions/workflows/ci.yml)
[![Version](https://img.shields.io/github/v/release/mailguardpro/mailguard-pro)](https://github.com/mailguardpro/mailguard-pro/releases)
[![License](https://img.shields.io/github/license/mailguardpro/mailguard-pro)](LICENSE)
[![Node.js](https://img.shields.io/node/v/20)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)

> Email Intelligence Platform - Validate email addresses with a comprehensive quality score (0-100) and bulk processing capabilities.

MailGuard Pro is an email validation SaaS that goes beyond simple "valid/invalid" responses. It provides actionable quality scores, bulk processing, multi-format exports, and API-first integration.

## Features

- **Quality Score 0-100** - Comprehensive scoring algorithm with 11 validation checks
- **Bulk Processing** - Upload CSV files up to 100,000 rows for mass validation
- **Multi-format Exports** - CSV, JSON, XLSX (formatted), PDF reports
- **Webhook Integration** - Real-time notifications for bulk job completion
- **API-first** - RESTful API with API key authentication
- **Authentication** - Google OAuth + Magic Link (Resend)
- **Subscription Management** - Stripe integration with tiered plans

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript 5.7 |
| Database | PostgreSQL 15 + Prisma 6 |
| Queue | BullMQ + Redis 7 |
| Auth | NextAuth.js v5 |
| Payments | Stripe |
| Email | Resend |
| Styling | Tailwind CSS |
| Testing | Vitest + Playwright |

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+

### Installation

```bash
# Clone the repository
git clone https://github.com/mailguardpro/mailguard-pro.git
cd mailguard-pro

# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Push database schema
npm run db:push

# Start the development server
npm run dev
```

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/mailguard

# Redis (rate limiting + BullMQ queue)
REDIS_URL=redis://localhost:6379

# NextAuth.js
AUTH_SECRET=your-nextauth-secret-min-32-chars
AUTH_URL=http://localhost:3000

# Google OAuth
AUTH_GOOGLE_ID=your-google-client-id
AUTH_GOOGLE_SECRET=your-google-client-secret

# Resend (magic links + notifications)
AUTH_RESEND_KEY=re_xxx
RESEND_API_KEY=re_xxx
EMAIL_FROM=noreply@mailguard.pro

# Stripe
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
NEXT_PUBLIC_STRIPE_PUBLIC_KEY=pk_test_xxx

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Development Scripts

```bash
# Development
npm run dev              # Start Next.js dev server
npm run worker          # Start BullMQ worker

# Database
npm run db:generate     # Generate Prisma client
npm run db:push         # Push schema to database
npm run db:migrate      # Run migrations
npm run db:studio       # Open Prisma Studio

# Testing
npm run test            # Run unit tests (Vitest)
npm run test:run        # Run tests once
npm run test:coverage   # Run tests with coverage
npm run test:e2e        # Run E2E tests (Playwright)
npm run test:e2e:ui     # Run E2E tests with UI

# Code Quality
npm run lint            # Run ESLint
npm run lint:fix        # Fix ESLint issues
npm run format          # Format with Prettier
npm run format:check    # Check formatting

# Build
npm run build          # Build for production
npm run start          # Start production server
```

## Project Structure

```
mailguard-pro/
├── app/                    # Next.js App Router
│   ├── (marketing)/       # Public routes (landing, pricing, login)
│   ├── (dashboard)/       # Protected routes (dashboard, validate)
│   ├── api/              # API routes
│   │   ├── auth/         # NextAuth handlers
│   │   ├── stripe/       # Stripe webhooks
│   │   └── v1/          # REST API v1
│   └── health/           # Health check endpoint
├── components/            # React components
├── services/             # Business logic
│   ├── emailValidator.ts # Core validation orchestrator
│   ├── bulkProcessor.ts  # Bulk upload & job management
│   ├── exportService.ts  # Multi-format export
│   ├── auditLogger.ts    # Audit logging
│   └── validationCache.ts# Redis caching
├── lib/                  # Library singletons
├── worker/               # BullMQ worker
├── prisma/               # Database schema
└── tests/                # Test files
    ├── unit/             # Unit tests
    ├── integration/      # Integration tests
    └── e2e/              # E2E tests
```

## API Endpoints

### Validation

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/validate` | Validate single email |
| POST | `/api/v1/validate/bulk` | Create bulk validation job |

### Bulk Jobs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/bulk/[jobId]` | Get job status |
| GET | `/api/v1/bulk/[jobId]/results` | Get job results |
| GET | `/api/v1/bulk/[jobId]/export` | Export results |

### Tools

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/tools/mx` | Check MX records |
| GET | `/api/v1/tools/spf` | Check SPF records |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/webhooks` | List webhooks |
| POST | `/api/v1/webhooks` | Create webhook |
| DELETE | `/api/v1/webhooks/[id]` | Delete webhook |

## Architecture

### Validation Engine

The validation engine performs 11 checks:
1. **Format** - RFC 5322 regex validation
2. **MX Records** - Domain has valid MX records
3. **SMTP** - SMTP connection test
4. **Catch-all** - Domain accepts all emails
5. **Disposable** - Email from known disposable provider
6. **Generic** - Email is generic (info@, support@, etc.)
7. **Free Provider** - Email from free provider (Gmail, Yahoo, etc.)
8. **DNSBL** - Domain is on DNS blacklists
9. **SPF** - SPF record verification
10. **DMARC** - DMARC record verification
11. **Typo** - Suggest correction for common typos

### Quality Score Calculation

```
Score = format(15) + mx(25) + smtp(30) + catch-all(10) + disposable(10) + 
        generic(5) + spf(5) + dmarc(5) + domain-age(5) - dnsbl(20) - typo(10)
```

## Deployment

### Docker Compose (Development)

```bash
docker-compose up -d
```

### Production

See [Deployment Guide](./DEPLOYMENT.md) for detailed production deployment instructions.

## Contributing

Contributions are welcome! Please read our [Contributing Guide](./CONTRIBUTING.md) for details.

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## Support

- Documentation: [https://docs.mailguard.pro](https://docs.mailguard.pro)
- Issues: [https://github.com/mailguardpro/mailguard-pro/issues](https://github.com/mailguardpro/mailguard-pro/issues)
- Email: support@mailguard.pro

---

Built with Next.js, PostgreSQL, and Redis