import Link from 'next/link'

export default function PricingPage() {
  const plans = [
    {
      name: 'Free',
      price: '$0',
      period: '/month',
      credits: '100',
      description: 'Perfect for testing',
      features: [
        '100 validations/month',
        'Single email validation',
        'Basic score (0-100)',
        'Email format check',
      ],
      cta: 'Get started',
      highlighted: false,
    },
    {
      name: 'Starter',
      price: '€9',
      period: '/month',
      credits: '5,000',
      description: 'For small teams',
      features: [
        '5,000 validations/month',
        'Bulk CSV upload (10k rows)',
        'CSV & JSON export',
        'API access',
        'Email support',
      ],
      cta: 'Start trial',
      highlighted: true,
    },
    {
      name: 'Pro',
      price: '€29',
      period: '/month',
      credits: '50,000',
      description: 'For growing businesses',
      features: [
        '50,000 validations/month',
        'Bulk CSV upload (100k rows)',
        'All export formats (XLSX, PDF)',
        'Webhooks',
        'Priority support',
        'Advanced filters',
      ],
      cta: 'Start trial',
      highlighted: false,
    },
    {
      name: 'Business',
      price: '€99',
      period: '/month',
      credits: 'Unlimited',
      description: 'For enterprises',
      features: [
        'Unlimited validations',
        'Unlimited bulk size',
        'All features included',
        'Dedicated IP',
        'SLA 99.9%',
        'Phone support',
        'Custom integrations',
      ],
      cta: 'Contact us',
      highlighted: false,
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
          <Link href="/login" className="btn btn-ghost btn-sm">
            Log in
          </Link>
        </div>
      </header>

      {/* Pricing */}
      <section className="py-20">
        <div className="max-w-[var(--container-xl)] mx-auto px-6">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-display font-bold mb-4">Simple, transparent pricing</h1>
            <p className="text-[var(--text-secondary)]">
              Choose the plan that fits your needs. All plans include a 14-day free trial.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan) => (
              <div 
                key={plan.name}
                className={`card relative ${plan.highlighted ? 'border-[var(--accent)] ring-2 ring-[var(--accent-light)]' : ''}`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-[var(--accent)] text-white text-xs font-semibold rounded-full">
                    Popular
                  </div>
                )}
                
                <h3 className="text-lg font-display font-semibold mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-3xl font-display font-bold">{plan.price}</span>
                  <span className="text-sm text-[var(--text-muted)]">{plan.period}</span>
                </div>
                <p className="text-sm text-[var(--text-secondary)] mb-4">
                  {plan.credits} validations
                </p>
                <p className="text-xs text-[var(--text-muted)] mb-6">{plan.description}</p>
                
                <ul className="space-y-2 mb-6">
                  {plan.features.map((feature) => (
                    <li key={feature} className="text-sm flex items-center gap-2">
                      <svg className="w-4 h-4 text-[var(--status-valid)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
                
                <button className={`btn w-full ${plan.highlighted ? 'btn-accent' : 'btn-primary'}`}>
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-8">
        <div className="max-w-[var(--container-lg)] mx-auto px-6 text-center text-sm text-[var(--text-muted)]">
          <p>Pay as you go: €0.002 per validation • All plans include CSV/JSON export</p>
        </div>
      </footer>
    </div>
  )
}