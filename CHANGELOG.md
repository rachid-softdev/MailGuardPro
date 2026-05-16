# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-05-16

### Added
- **Tests**: Complete test suite with Vitest (unit + integration) and Playwright (E2E)
- **CI/CD**: GitHub Actions workflows for CI and deployment
- **Pre-commit hooks**: Husky + lint-staged for code quality
- **Security**: Security headers in Next.js config, audit logging system
- **Monitoring**: Health check endpoint (`/api/health`), structured logging with Pino
- **Performance**: Validation caching with Redis, database indexes for query optimization
- **Documentation**: Complete README, CHANGELOG, CONTRIBUTING guides

### Changed
- Updated Prisma schema with AuditLog model and performance indexes
- Enhanced Next.js config with security headers (CSP, HSTS, X-Frame-Options, etc.)
- Added Pino logger for structured logging throughout the application

### Fixed
- Added proper TypeScript types for test setup
- Improved error handling in validation services

## [1.0.0] - 2026-01-01

### Added
- **Email Validation Engine**: 11 validation checks with quality score (0-100)
- **Bulk Processing**: CSV upload up to 100k rows with BullMQ background processing
- **Authentication**: Google OAuth + Magic Link via Resend
- **API**: RESTful API with API key authentication and rate limiting
- **Export**: CSV, JSON, XLSX (PRO), PDF reports (PRO)
- **Webhook System**: HMAC-signed payloads with retry logic
- **Lead Finder**: Pattern-based email generation
- **Domain Reputation**: Aggregated scoring from multiple checks

### Features
- Dashboard with usage statistics and charts
- Credit-based system with tiered plans (FREE, STARTER, PRO, BUSINESS)
- Stripe subscription integration
- Redis-based rate limiting
- PostgreSQL database with Prisma ORM

---

## Version History

- **v1.1.0** - Tests, CI/CD, Security, Monitoring, Documentation
- **v1.0.0** - Initial release

## Upgrading

### From v1.0.0 to v1.1.0

```bash
# Update dependencies
npm install

# Generate Prisma client
npm run db:generate

# Push new schema (includes AuditLog model and indexes)
npm run db:push

# Install Husky hooks
npm run prepare

# Run tests
npm run test
```

## Deprecation Notices

None at this time.

## Known Issues

- None currently tracked. Please report issues on GitHub.

## Security Vulnerabilities

If you discover a security vulnerability, please send an email to security@mailguard.pro