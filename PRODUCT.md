# Product

## Register

product

## Users

Developers, marketers, and business owners who need to validate, clean, and verify email lists with precision. They are in a workflow context — integrating an API, uploading a CSV for bulk validation, or checking individual emails. They value accuracy, speed, and actionable data over flashy dashboards. They are technically literate or data-driven, and they come to MailGuard Pro when deliverability matters.

## Product Purpose

MailGuard Pro is an email intelligence platform that goes beyond simple valid/invalid checks. It assigns every email a quality score from 0 to 100, exposing deliverability risk, typos, disposable addresses, and MX-level issues. It exists to give users surgical confidence in their email lists — no guesswork, no false positives. Success means users trust the score, act on the recommendations, and never send blind again.

## Brand Personality

Precise, reliable, professional. The interface communicates surgical confidence — every pixel has a role, nothing is decorative. The tone is direct and technical without being cold. No mascots, no emojis, no hype. The signature moment is the animated score circle (0–100) whose color shifts from red to green — the one dramatic element in an otherwise austere, instrument-grade interface.

## Anti-references

- Generic SaaS interfaces with excessive cards, flashy gradients, and heavy animations
- Cliché "AI startup" design — glowing neon accents, glassmorphism, chatbot-first layouts
- Over-designed marketing pages that obscure the product's utility
- Dense, noisy dashboards where data competes for attention
- Anything that looks like a template or theme

References to aspire toward: Linear, Vercel, Raycast — clean, sober, efficiency-obsessed interfaces where function dictates form.

## Design Principles

1. **Precision over decoration.** Every element earns its place. If it doesn't inform a decision or enable an action, remove it. The score circle is the only theatrical element, and it exists because it communicates at a glance what tables cannot.

2. **Information first.** Data is the primary material. Typography, spacing, and hierarchy exist to make data legible, not to fill space. Users should find the answer to "is this email good?" in under one second.

3. **Confidence through consistency.** The system behaves predictably — same interaction patterns, same visual language, same feedback everywhere. Users learn the interface once and trust it everywhere.

4. **Respect the workflow.** Whether it's a single API call or a 100k-row bulk job, the interface stays out of the way. Batch operations show progress without ceremony. Errors are specific and actionable, not generic toasts.

5. **Accessible by default.** WCAG AA is the floor, not the ceiling. Color is never the sole carrier of information — score indicators use position, shape, and text alongside color for color-blind users. Keyboard navigation and screen reader support are built in, not bolted on.

## Accessibility & Inclusion

- Target: WCAG AA minimum (body text ≥ 4.5:1 contrast, large text ≥ 3:1)
- Color is never the sole differentiator — score indicators pair color with position, text labels, and patterns
- Full keyboard navigation with visible focus indicators
- Screen reader compatible: aria-labels on icon-only buttons, role="status" on dynamic updates, semantic HTML throughout
- Reduced motion respected via `prefers-reduced-motion: reduce` — no content is gated on animation
- Score circle has accessible text alternatives (e.g., `aria-label="Email quality score: 82 out of 100"`)
