import Link from 'next/link'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Documentation - MailGuard Pro',
  description: 'Learn how to use MailGuard Pro API for email validation',
}

export default function DocsPage() {
  const sections = [
    {
      title: 'Getting Started',
      description: 'Learn the basics of email validation',
      href: '/docs/getting-started',
      icon: '🚀',
    },
    {
      title: 'API Reference',
      description: 'Complete API documentation with examples',
      href: '/docs/api-reference',
      icon: '📚',
    },
    {
      title: 'Authentication',
      description: 'API keys and authentication methods',
      href: '/docs/authentication',
      icon: '🔐',
    },
    {
      title: 'Webhooks',
      description: 'Real-time notifications for events',
      href: '/docs/webhooks',
      icon: '🔗',
    },
    {
      title: 'Pricing',
      description: 'Plans and credit limits',
      href: '/pricing',
      icon: '💰',
    },
    {
      title: 'FAQ',
      description: 'Frequently asked questions',
      href: '/docs/faq',
      icon: '❓',
    },
  ]

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      {/* Header */}
      <header className="border-b border-[var(--border)]">
        <div className="max-w-[var(--container-xl)] mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[var(--accent)] rounded-lg" />
            <span className="font-display text-xl font-bold">MailGuard Pro</span>
          </Link>
          <Link href="/login" className="btn btn-primary btn-sm">
            Get Started
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="py-20">
        <div className="max-w-[var(--container-lg)] mx-auto px-6 text-center">
          <h1 className="text-4xl font-display font-bold mb-4">Documentation</h1>
          <p className="text-lg text-[var(--text-secondary)] max-w-2xl mx-auto">
            Everything you need to integrate MailGuard Pro into your applications.
            From quick start guides to detailed API references.
          </p>
        </div>
      </section>

      {/* Sections Grid */}
      <section className="py-12 pb-20">
        <div className="max-w-[var(--container-lg)] mx-auto px-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sections.map((section) => (
              <Link
                key={section.href}
                href={section.href}
                className="card hover:border-[var(--accent)] transition-colors"
              >
                <div className="text-3xl mb-4">{section.icon}</div>
                <h3 className="text-lg font-display font-semibold mb-2">
                  {section.title}
                </h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  {section.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Quick Start */}
      <section className="py-12 bg-[var(--bg-surface)] border-t border-[var(--border)]">
        <div className="max-w-[var(--container-lg)] mx-auto px-6">
          <h2 className="text-2xl font-display font-bold mb-6">Quick Start</h2>
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">Validate your first email</h3>
            <pre className="bg-[var(--bg-subtle)] p-4 rounded-lg overflow-x-auto">
              <code className="text-sm">
{`curl -X GET "https://api.mailguard.pro/v1/validate?email=test@example.com" \\
  -H "X-API-Key: mg_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"`

// Response:
{
  "success": true,
  "data": {
    "email": "test@example.com",
    "score": 85,
    "status": "valid",
    "checks": {
      "format": { "passed": true },
      "mx": { "passed": true },
      "smtp": { "passed": true }
    }
  }
}`}
              </code>
            </pre>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-8">
        <div className="max-w-[var(--container-lg)] mx-auto px-6 text-center text-sm text-[var(--text-muted)]">
          <p>Need help? Contact us at support@mailguard.pro</p>
        </div>
      </footer>
    </div>
  )
}