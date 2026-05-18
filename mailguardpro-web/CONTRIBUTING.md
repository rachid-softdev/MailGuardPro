# Contributing to MailGuard Pro

Thank you for your interest in contributing to MailGuard Pro! This guide will help you get started with development.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md). Please be respectful and inclusive.

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- Docker (optional, for local development)

### Setup Development Environment

1. **Fork the repository**

   Click the "Fork" button on GitHub to create your own copy of the repository.

2. **Clone your fork**

   ```bash
   git clone https://github.com/YOUR_USERNAME/mailguard-pro.git
   cd mailguard-pro
   ```

3. **Add upstream remote**

   ```bash
   git remote add upstream https://github.com/mailguardpro/mailguard-pro.git
   ```

4. **Install dependencies**

   ```bash
   npm install
   ```

5. **Set up environment variables**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your local configuration. You'll need:
   - Database connection string
   - Redis URL
   - Auth secrets (generate with `openssl rand -base64 32`)

6. **Initialize database**

   ```bash
   npm run db:generate
   npm run db:push
   ```

7. **Start development server**

   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:3000`.

## Making Changes

### Branch Naming

Use descriptive branch names following these patterns:
- `feature/description` - New features
- `fix/description` - Bug fixes
- `refactor/description` - Code refactoring
- `docs/description` - Documentation updates
- `test/description` - Test additions

Examples:
- `feature/add-api-rate-limiting`
- `fix/validation-cache-bug`
- `docs/update-api-documentation`

### Coding Standards

- **TypeScript**: Use strict TypeScript, avoid `any`
- **ESLint**: Run `npm run lint` before committing
- **Prettier**: Code is formatted with Prettier (configured in `.prettierrc`)
- **Naming**: Use camelCase for variables, PascalCase for components/types

### Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style (formatting, no logic change)
- `refactor`: Code refactoring
- `test`: Tests
- `chore`: Maintenance

Examples:
```
feat(validation): add DNS blacklist checking
fix(api): correct rate limiting logic
docs(readme): update installation instructions
test(services): add unit tests for emailValidator
```

### Pull Request Process

1. **Create a feature branch**

   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make your changes**

   - Write code following our standards
   - Add tests for new functionality
   - Update documentation if needed

3. **Run tests**

   ```bash
   # Unit tests
   npm run test

   # E2E tests
   npm run test:e2e

   # Lint
   npm run lint
   ```

4. **Commit your changes**

   ```bash
   git add .
   git commit -m "feat: add my feature"
   ```

5. **Push to your fork**

   ```bash
   git push origin feature/my-feature
   ```

6. **Create a Pull Request**

   Go to GitHub and create a PR from your fork to the main repository.

   Include:
   - Clear title and description
   - Link to any related issues
   - Screenshots for UI changes
   - Notes on how to test

### PR Review Process

- All PRs require review before merging
- Address feedback promptly
- Once approved, the maintainer will merge

## Testing

### Running Tests

```bash
# All tests
npm run test

# Unit tests only
npm run test:run

# With coverage
npm run test:coverage

# E2E tests
npm run test:e2e

# E2E with UI
npm run test:e2e:ui
```

### Writing Tests

Place tests in the `tests/` directory:
- Unit tests: `tests/unit/`
- Integration tests: `tests/integration/`
- E2E tests: `tests/e2e/`

Example test structure:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { myFunction } from '@/services/myService'

describe('myService', () => {
  describe('myFunction', () => {
    it('should return expected result', async () => {
      const result = await myFunction('input')
      expect(result).toBe('expected')
    })
  })
})
```

## Project Structure

```
mailguard-pro/
├── app/                 # Next.js App Router pages
├── components/         # React components
├── services/          # Business logic
├── lib/               # Library utilities
├── prisma/            # Database schema
├── worker/            # BullMQ worker
└── tests/             # Test files
```

## Getting Help

- **Issues**: Open a GitHub issue
- **Discord**: Join our [Discord community](https://discord.gg/mailguardpro)
- **Email**: support@mailguard.pro

## Recognition

Contributors will be listed in the README and on our website.

---

Thank you for contributing to MailGuard Pro!