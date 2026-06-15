---
target: all pages
total_score: 30
p0_count: 1
p1_count: 2
timestamp: 2026-06-14T16-23-18Z
slug: o-web-app-marketing-mailguardpro-web-app-dashboard
---
# MailGuard Pro — Redesigned Critique Report

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Credits don't update after validation (must refresh); some abort errors are silent |
| 2 | Match System / Real World | 3 | "MX Records", "Spam Trap" jargon not explained inline (mitigated by tooltips) |
| 3 | User Control and Freedom | 4 | Excellent: Ctrl+Z undo stack, delete toasts, Clear/ESc everywhere |
| 4 | Consistency and Standards | 3 | Syne display font used for body text (violates DESIGN.md); animation approaches differ between marketing (fade-up) and dashboard (skeleton) |
| 5 | Error Prevention | 3 | Good: AbortController cleanup, disabled states, CSV/URL validation. Missing: client-side email format validation before API call |
| 6 | Recognition Rather Than Recall | 3 | Sidebar always visible, score color-coded, badges consistent. Score legend hidden in validate empty state only |
| 7 | Flexibility and Efficiency | 4 | Excellent: single-key shortcuts (d/v/b/h/k/w/s), Cmd+K command palette with fuzzy search, "?" cheat sheet |
| 8 | Aesthetic and Minimalist Design | 3 | Clean "precision instrument" execution. Docked: landing hero follows generic SaaS template; inline SVG star icon is verbose copy-paste |
| 9 | Error Recovery | 2 | Error boundary + retry buttons exist. Many messages still generic ("Failed to fetch keys", "Unexpected error"); 2s toast too fast |
| 10 | Help and Documentation | 2 | Docs page exists but static (no search, no interactive examples). No onboarding flow. CSV guide hidden in `<details>` |
| **Total** | | **30/40** | **Good — address weak areas** |

## Anti-Patterns Verdict

**LLM assessment**: The marketing pages follow a structurally generic SaaS template (hero → features grid → social proof → footer) with staggered `animate-fade-up` delays that signal "template site." The dashboard interaction layer is genuinely distinctive — undo/redo stack, command palette with fuzzy search, sophisticated polling. Gap between the two surfaces is the main concern.

**Deterministic scan**: Clean — detector found zero AI-slop issues across all scanned files.

## Overall Impression

A genuinely well-crafted application with a thoughtful design system. The "Precision Instrument" brand is realized in the dashboard — sophisticated undo/redo, keyboard-first navigation, clean data displays, the signature ScoreCircle. But the implementation reveals gaps between ambition and delivery: missing dark mode toggle (despite full CSS support), no mobile bottom nav (despite DESIGN.md spec), a display font used as body text, and a thin docs page. The ScoreCircle — the one dramatic element — lacks an `aria-label`, making the signature brand moment invisible to screen reader users.

## What's Working

1. **Undo/redo system** — multi-layered architecture (global 50-entry stack, per-item delete toasts, Ctrl+Z/Ctrl+Shift+Z keyboard handling, dynamic sidebar hints). References Linear/Raycast quality.
2. **Keyboard-first navigation** — single-key shortcuts to every major page, Cmd+K palette with Levenshtein fuzzy search, "?" cheat sheet. Rare thoroughness for a B2B tool.
3. **Design token system** — 397 lines of intentional, commented, semantically structured CSS (11 categories, full light/dark warm-neutral palette, Major Third scale, accessible). Well-engineered.

## Priority Issues

### P0 — ScoreCircle has no `aria-label` (violates PRODUCT.md spec)
**Where**: `components/validator/ScoreCircle.tsx:56-117`
**Why it matters**: PRODUCT.md explicitly requires `aria-label="Email quality score: 82 out of 100"`. The SVG number text may not be picked up by screen readers. The signature brand element is invisible to accessibility users.
**Fix**: Add `role="img"` + `aria-label` to the wrapper div. Set `aria-hidden="true"` on the inner text span.

### P1 — No mobile bottom navigation (contradicts DESIGN.md)
**Where**: `components/layout/DashboardShell.tsx:82-88`
**Why it matters**: DESIGN.md specifies bottom nav for < lg screens. Current mobile requires hamburger → sidebar → tap (3 taps to navigate). Tablet sidebar collapse (64px icons) also missing.
**Fix**: Add 5-icon bottom nav on < 1024px. Collapse sidebar to 64px on tablet.

### P1 — `animate-fade-up` staggered delays on marketing pages
**Where**: `app/(marketing)/page.tsx:15,21,28,63,110,178`
**Why it matters**: Staggered `0ms/100ms/200ms` delays are the #1 visual marker of a "template site." Conflicts with "decorative motion" ban from product register.
**Fix**: Remove stagger. Single faster fade-up (300ms, no delay) for hero. Feature cards appear simultaneously.

### P2 — Body font uses Syne (display font)
**Where**: `app/globals.css:182`
**Why it matters**: Product register bans "display fonts in UI labels." Syne at body sizes (14-16px) loses character and reduces readability. DESIGN.md says Syne is for display only.
**Fix**: Change body to system-ui or Inter. Reserve Syne for display headings + KPI values.

### P2 — No dark mode toggle despite full CSS support
**Where**: `app/globals.css:120-172` (full dark tokens exist)
**Why it matters**: 53 lines of dark mode variables with carefully chosen warm-dark values, but no toggle component. Table-stakes feature for a dev tool.
**Fix**: Implement ThemeToggle per DESIGN.md spec. Add to sidebar footer.

## Persona Red Flags

**Alex (Power User)**:
- No column sorting on any table (history, bulk, API keys)
- Selection state resets when changing pages in history
- `/` key for focus misses some search inputs

**Jordan (First-Timer)**:
- No onboarding tour or guided walkthrough
- Score legend only shown in validate empty state, not dashboard
- CSV format guide hidden in `<details>` element

**Sam (Accessibility)**:
- P0: ScoreCircle no `aria-label`
- No `aria-live` region for bulk progress updates
- Table headers lack `scope="col"` attributes

## Cognitive Load

Low (1/8 failures): "Progressive disclosure" — validation shows ALL checks simultaneously (5-10 items) with no collapsible grouping. Bulk results lack the specified "Analytics" and "Exporter" tabs.

## Minor Observations

1. MarketingHeader keyboard icon uses a wand/star SVG, not a keyboard icon — mismatched affordance
2. `login/page.tsx` has no rate-limiting feedback on magic link spam
3. `verify/page.tsx` redirects with no loading indicator
4. History search doesn't debounce (unlike validate page)
5. `usePolling` maxRetries=50 may be too aggressive for long jobs
6. DESIGN.md duplicated in two locations

## Questions to Consider

1. **Dark mode rollout**: CSS variables complete but no toggle. Deferred or blocked?
2. **Marketing vs dashboard gap**: Intentional polish difference or should marketing be elevated?
3. **ScoreCircle accessibility**: Beyond aria-label, should score also show as fraction text next to circle?
4. **Styleguide**: Is Syne as body font intentional or a gap?
