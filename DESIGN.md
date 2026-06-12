# DESIGN.md — MailGuard Pro
## Système de design complet · Responsive · Light & Dark mode

---

## 🎨 DIRECTION ARTISTIQUE

**Concept :** *"Precision Instrument"* — L'interface ressemble à un outil de mesure de précision.
Pas de fioritures. Chaque pixel a un rôle. L'information prime, la forme suit.

**Ce qui rend MailGuard mémorable :**
Le **score en cercle** (0–100) animé au chargement, dont la couleur pulse du rouge au vert.
C'est le seul élément "dramatique" dans un univers autrement austère et chirurgical.

**Références visuelles :** Linear + Vercel + Raycast — mais avec une touche plus *industrielle* et *mesure*.

**Ton :** Confiant, technique, sans bullshit. Pas de mascotte, pas d'emojis décoratifs.

---

## 🔤 TYPOGRAPHIE

```css
/* Installer via Google Fonts ou next/font */
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@600;700;800&display=swap');
```

| Rôle             | Police          | Usage                                      |
|------------------|-----------------|--------------------------------------------|
| **Display**      | Syne 800        | Titres hero, grands chiffres, KPI          |
| **Heading**      | Syne 700        | H1–H3 dans le dashboard                   |
| **UI / Body**    | Syne 600        | Labels, boutons, navigation                |
| **Mono**         | DM Mono 400/500 | Emails, scores, code, valeurs techniques   |

```css
:root {
  --font-display: 'Syne', sans-serif;
  --font-mono: 'DM Mono', monospace;

  /* Tailles — scale 1.25 (Major Third) */
  --text-xs:   0.64rem;   /* 10.24px */
  --text-sm:   0.8rem;    /* 12.8px  */
  --text-base: 1rem;      /* 16px    */
  --text-lg:   1.25rem;   /* 20px    */
  --text-xl:   1.563rem;  /* 25px    */
  --text-2xl:  1.953rem;  /* 31px    */
  --text-3xl:  2.441rem;  /* 39px    */
  --text-4xl:  3.052rem;  /* 49px    */
  --text-5xl:  4rem;      /* 64px    */

  /* Line heights */
  --leading-tight:  1.15;
  --leading-normal: 1.5;
  --leading-loose:  1.75;

  /* Letter spacing */
  --tracking-tight:  -0.03em;
  --tracking-normal:  0em;
  --tracking-wide:    0.08em;
  --tracking-widest:  0.15em; /* Pour les labels uppercase */
}
```

**Règles typographiques :**
- Les **scores et valeurs chiffrées** sont toujours en `DM Mono` — jamais en Syne
- Les **labels uppercase** (ex: `VALID`, `RISKY`) : DM Mono 500, `letter-spacing: 0.12em`, taille `--text-xs`
- Les **titres héro** : Syne 800, `letter-spacing: -0.03em`, avec un `font-feature-settings: 'ss01'`

---

## 🎨 PALETTE DE COULEURS

### Système de tokens (CSS custom properties)

```css
/* ============================================
   LIGHT MODE (défaut)
   ============================================ */
:root {
  /* Backgrounds */
  --bg-base:       #F7F6F3;   /* Blanc cassé chaud — pas blanc pur */
  --bg-surface:    #FFFFFF;   /* Cards, panels */
  --bg-elevated:   #FAFAF8;   /* Hover states sur cards */
  --bg-subtle:     #F0EFE9;   /* Tags, badges, inputs */
  --bg-overlay:    rgba(0, 0, 0, 0.04);

  /* Borders */
  --border:        #E4E2DA;   /* Bord principal */
  --border-strong: #C8C5BA;   /* Bord accentué */
  --border-focus:  #1A1A1A;   /* Focus ring */

  /* Textes */
  --text-primary:  #111110;   /* Quasi noir chaud */
  --text-secondary:#6B6860;   /* Secondaire */
  --text-muted:    #A09D96;   /* Placeholder, hints */
  --text-inverted: #F7F6F3;   /* Texte sur fond sombre */

  /* Accents — Vert émeraude (couleur signature) */
  --accent:        #00A36C;   /* Primary action */
  --accent-light:  #E6F7F1;   /* Background accent léger */
  --accent-dark:   #007A50;   /* Hover sur accent */
  --accent-glow:   rgba(0, 163, 108, 0.15);

  /* Score colors (gradient sémantique) */
  --score-critical: #DC2626;  /* 0–25   rouge */
  --score-poor:     #EA580C;  /* 26–40  orange foncé */
  --score-medium:   #D97706;  /* 41–60  ambre */
  --score-good:     #65A30D;  /* 61–75  vert olive */
  --score-excellent:#00A36C;  /* 76–100 vert émeraude */

  /* Status */
  --status-valid:   #00A36C;
  --status-invalid: #DC2626;
  --status-risky:   #D97706;
  --status-unknown: #6B6860;

  /* Status backgrounds */
  --status-valid-bg:   #E6F7F1;
  --status-invalid-bg: #FEF2F2;
  --status-risky-bg:   #FFFBEB;
  --status-unknown-bg: #F5F5F4;

  /* Shadows */
  --shadow-xs:  0 1px 2px rgba(0,0,0,0.06);
  --shadow-sm:  0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
  --shadow-md:  0 4px 6px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.04);
  --shadow-lg:  0 10px 15px rgba(0,0,0,0.08), 0 4px 6px rgba(0,0,0,0.04);
  --shadow-xl:  0 20px 25px rgba(0,0,0,0.08), 0 10px 10px rgba(0,0,0,0.03);
}

/* ============================================
   DARK MODE
   ============================================ */
[data-theme="dark"],
.dark {
  /* Backgrounds */
  --bg-base:       #0C0C0A;   /* Quasi noir chaud (pas froid/bleuté) */
  --bg-surface:    #141412;   /* Cards, panels */
  --bg-elevated:   #1C1C19;   /* Hover states */
  --bg-subtle:     #242420;   /* Tags, badges, inputs */
  --bg-overlay:    rgba(255, 255, 255, 0.04);

  /* Borders */
  --border:        #2A2A26;
  --border-strong: #3D3D38;
  --border-focus:  #F7F6F3;

  /* Textes */
  --text-primary:  #F0EFE9;
  --text-secondary:#8C8A82;
  --text-muted:    #5C5A54;
  --text-inverted: #111110;

  /* Accents */
  --accent:        #00C97E;   /* Légèrement plus lumineux en dark */
  --accent-light:  rgba(0, 201, 126, 0.1);
  --accent-dark:   #00F0A0;
  --accent-glow:   rgba(0, 201, 126, 0.2);

  /* Score colors (légèrement plus lumineux en dark) */
  --score-critical: #F87171;
  --score-poor:     #FB923C;
  --score-medium:   #FBBF24;
  --score-good:     #86EFAC;
  --score-excellent:#00C97E;

  /* Status */
  --status-valid:   #00C97E;
  --status-invalid: #F87171;
  --status-risky:   #FBBF24;
  --status-unknown: #8C8A82;

  /* Status backgrounds */
  --status-valid-bg:   rgba(0, 201, 126, 0.08);
  --status-invalid-bg: rgba(248, 113, 113, 0.08);
  --status-risky-bg:   rgba(251, 191, 36, 0.08);
  --status-unknown-bg: rgba(140, 138, 130, 0.08);

  /* Shadows (en dark, les ombres sont quasi invisibles) */
  --shadow-xs:  0 1px 2px rgba(0,0,0,0.4);
  --shadow-sm:  0 1px 3px rgba(0,0,0,0.5);
  --shadow-md:  0 4px 6px rgba(0,0,0,0.4);
  --shadow-lg:  0 10px 15px rgba(0,0,0,0.5);
  --shadow-xl:  0 20px 25px rgba(0,0,0,0.6);
}
```

---

## 📐 ESPACEMENT & LAYOUT

```css
:root {
  /* Spacing scale — base 4px */
  --space-1:  0.25rem;  /* 4px  */
  --space-2:  0.5rem;   /* 8px  */
  --space-3:  0.75rem;  /* 12px */
  --space-4:  1rem;     /* 16px */
  --space-5:  1.25rem;  /* 20px */
  --space-6:  1.5rem;   /* 24px */
  --space-8:  2rem;     /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */
  --space-16: 4rem;     /* 64px */
  --space-20: 5rem;     /* 80px */
  --space-24: 6rem;     /* 96px */

  /* Border radius */
  --radius-sm:   4px;
  --radius-md:   8px;
  --radius-lg:   12px;
  --radius-xl:   16px;
  --radius-2xl:  24px;
  --radius-full: 9999px;

  /* Conteneurs max-width */
  --container-sm:  640px;
  --container-md:  768px;
  --container-lg:  1024px;
  --container-xl:  1280px;
  --container-2xl: 1440px;

  /* Dashboard layout */
  --sidebar-width:       240px;
  --sidebar-width-collapsed: 64px;
  --topbar-height:       56px;
  --content-padding:     var(--space-6);
}
```

---

## 📱 RESPONSIVE — BREAKPOINTS

```css
/* Stratégie : Mobile First */

/* xs  — < 480px   : smartphones portrait */
/* sm  — ≥ 480px   : smartphones paysage  */
/* md  — ≥ 768px   : tablettes            */
/* lg  — ≥ 1024px  : laptops              */
/* xl  — ≥ 1280px  : desktops             */
/* 2xl — ≥ 1536px  : grands écrans        */

/* Dans Tailwind (tailwind.config.ts) : */
theme: {
  screens: {
    'xs':  '480px',
    'sm':  '640px',
    'md':  '768px',
    'lg':  '1024px',
    'xl':  '1280px',
    '2xl': '1536px',
  }
}
```

### Comportement responsive par zone

#### Navigation / Sidebar
```
Mobile (< lg)    : Sidebar cachée → Hamburger en topbar → Drawer slide-in
                   Bottom nav bar (5 icônes max) pour les actions principales
Tablet (lg)      : Sidebar collapsed (64px, icônes seules + tooltips)
Desktop (xl+)    : Sidebar expanded (240px, icônes + labels)
```

#### Topbar
```
Mobile  : Logo gauche | Hamburger droite
Tablet  : Logo | Breadcrumb | Actions (icônes)
Desktop : Logo | Breadcrumb | Searchbar | Notifications | Avatar
```

#### Content area
```css
.content-area {
  padding: var(--space-4);           /* Mobile : 16px */
}
@media (min-width: 768px) {
  .content-area { padding: var(--space-6); } /* Tablet : 24px */
}
@media (min-width: 1024px) {
  .content-area { padding: var(--space-8); } /* Desktop : 32px */
}
```

#### Grilles
```css
/* Cards KPI dashboard */
.kpi-grid {
  display: grid;
  grid-template-columns: 1fr;                    /* Mobile : 1 col */
  gap: var(--space-4);
}
@media (min-width: 480px) {
  .kpi-grid { grid-template-columns: 1fr 1fr; }  /* xs+ : 2 cols */
}
@media (min-width: 1024px) {
  .kpi-grid { grid-template-columns: repeat(4, 1fr); } /* lg : 4 cols */
}

/* Résultats bulk (tableau → cards sur mobile) */
@media (max-width: 767px) {
  .results-table { display: none; }
  .results-cards { display: block; }
}
@media (min-width: 768px) {
  .results-table { display: table; }
  .results-cards { display: none; }
}
```

---

## 🧱 COMPOSANTS UI

### Score Circle (composant signature)

```tsx
// components/validator/ScoreCircle.tsx
// Cercle SVG animé, couleur dynamique selon le score

interface ScoreCircleProps {
  score: number;        // 0–100
  size?: 'sm' | 'md' | 'lg' | 'xl';
  animated?: boolean;
}

// Tailles
const sizes = {
  sm:  { diameter: 56,  strokeWidth: 4, fontSize: '--text-sm'  },
  md:  { diameter: 80,  strokeWidth: 5, fontSize: '--text-lg'  },
  lg:  { diameter: 120, strokeWidth: 6, fontSize: '--text-2xl' },
  xl:  { diameter: 180, strokeWidth: 8, fontSize: '--text-4xl' },
};

// Couleur selon le score
function scoreColor(score: number): string {
  if (score <= 25) return 'var(--score-critical)';
  if (score <= 40) return 'var(--score-poor)';
  if (score <= 60) return 'var(--score-medium)';
  if (score <= 75) return 'var(--score-good)';
  return 'var(--score-excellent)';
}

// Animation : le cercle se remplit de 0 → score en 800ms (ease-out)
// Le chiffre compte de 0 → score en 600ms
// Un "glow" subtil pulse autour du cercle quand score > 75
```

**CSS du cercle :**
```css
.score-circle-track {
  stroke: var(--bg-subtle);
  fill: none;
}
.score-circle-fill {
  fill: none;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: center;
  transform: rotate(-90deg);
}
.score-circle-glow {
  /* Uniquement si score > 75 */
  filter: drop-shadow(0 0 8px var(--accent-glow));
}
.score-value {
  font-family: var(--font-mono);
  font-weight: 500;
  fill: var(--text-primary);
  text-anchor: middle;
  dominant-baseline: central;
}
```

---

### Status Badge

```tsx
// <StatusBadge status="valid" /> → badge coloré avec dot + label

const statusConfig = {
  valid:   { label: 'VALID',   color: 'var(--status-valid)',   bg: 'var(--status-valid-bg)'   },
  invalid: { label: 'INVALID', color: 'var(--status-invalid)', bg: 'var(--status-invalid-bg)' },
  risky:   { label: 'RISKY',   color: 'var(--status-risky)',   bg: 'var(--status-risky-bg)'   },
  unknown: { label: 'UNKNOWN', color: 'var(--status-unknown)', bg: 'var(--status-unknown-bg)' },
};
```

```css
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px var(--space-2);
  border-radius: var(--radius-full);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 500;
  letter-spacing: var(--tracking-widest);
  text-transform: uppercase;
  background: var(--badge-bg);
  color: var(--badge-color);
}
.status-badge-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}
/* Pour "valid" uniquement : le dot pulse */
.status-badge[data-status="valid"] .status-badge-dot {
  animation: pulse-dot 2s ease-in-out infinite;
}
@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.5; transform: scale(0.8); }
}
```

---

### Check Item (liste de vérifications)

```css
.check-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--border);
}
.check-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  margin-top: 1px;
}
.check-icon--pass    { color: var(--status-valid);   }
.check-icon--fail    { color: var(--status-invalid); }
.check-icon--warn    { color: var(--status-risky);   }
.check-icon--unknown { color: var(--status-unknown); }
.check-label {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--text-primary);
}
.check-detail {
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-top: 2px;
}
```

---

### Bouton (variants)

```css
/* Base */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 600;
  letter-spacing: 0.01em;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  user-select: none;
}

/* Tailles */
.btn-sm  { height: 32px; padding: 0 var(--space-3); font-size: var(--text-xs); }
.btn-md  { height: 40px; padding: 0 var(--space-4); }
.btn-lg  { height: 48px; padding: 0 var(--space-6); font-size: var(--text-base); }

/* Primary */
.btn-primary {
  background: var(--text-primary);
  color: var(--text-inverted);
  border-color: var(--text-primary);
}
.btn-primary:hover {
  background: var(--text-secondary);
  border-color: var(--text-secondary);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

/* Accent (CTA principal) */
.btn-accent {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}
.btn-accent:hover {
  background: var(--accent-dark);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px var(--accent-glow);
}

/* Ghost */
.btn-ghost {
  background: transparent;
  color: var(--text-primary);
  border-color: var(--border);
}
.btn-ghost:hover {
  background: var(--bg-subtle);
  border-color: var(--border-strong);
}

/* Danger */
.btn-danger {
  background: transparent;
  color: var(--status-invalid);
  border-color: var(--status-invalid-bg);
}
.btn-danger:hover {
  background: var(--status-invalid-bg);
}

/* Disabled */
.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none !important;
  box-shadow: none !important;
}

/* Loading state */
.btn-loading {
  position: relative;
  color: transparent;
}
.btn-loading::after {
  content: '';
  position: absolute;
  width: 14px; height: 14px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
```

---

### Input

```css
.input {
  width: 100%;
  height: 40px;
  padding: 0 var(--space-3);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--text-primary);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  transition: border-color 0.15s, box-shadow 0.15s;
  outline: none;
}
.input::placeholder { color: var(--text-muted); }
.input:hover  { border-color: var(--border-strong); }
.input:focus  {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px var(--bg-overlay);
}

/* Input email large (validator hero) */
.input-hero {
  height: 56px;
  font-size: var(--text-base);
  padding: 0 var(--space-4);
  border-radius: var(--radius-lg);
  border-width: 1.5px;
}
.input-hero:focus {
  box-shadow: 0 0 0 4px var(--accent-glow);
  border-color: var(--accent);
}

/* Validation states */
.input-error {
  border-color: var(--status-invalid);
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
}
.input-success {
  border-color: var(--status-valid);
  box-shadow: 0 0 0 3px var(--accent-glow);
}
```

---

### Card

```css
.card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: var(--space-6);
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.2s, border-color 0.2s;
}
.card:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--border-strong);
}

/* Card KPI */
.card-kpi {
  padding: var(--space-5);
}
.card-kpi-label {
  font-size: var(--text-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-widest);
  font-family: var(--font-mono);
}
.card-kpi-value {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: var(--tracking-tight);
  line-height: 1;
  margin-top: var(--space-2);
}
.card-kpi-delta {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  margin-top: var(--space-2);
}
.card-kpi-delta--up   { color: var(--status-valid);   }
.card-kpi-delta--down { color: var(--status-invalid); }
```

---

### Export Buttons Group

```css
.export-group {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

/* Mobile : full width stack */
@media (max-width: 479px) {
  .export-group { flex-direction: column; }
  .export-group .btn { width: 100%; }
}

/* Bouton locké (plan insuffisant) */
.btn-locked {
  position: relative;
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-locked::after {
  content: '🔒';
  position: absolute;
  top: -6px;
  right: -6px;
  font-size: 10px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  width: 18px; height: 18px;
  display: flex; align-items: center; justify-content: center;
}
/* Tooltip au hover */
.btn-locked[data-tooltip]:hover::before {
  content: attr(data-tooltip);
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--text-primary);
  color: var(--text-inverted);
  font-size: var(--text-xs);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  white-space: nowrap;
  pointer-events: none;
}
```

---

### Progress Bar (bulk job)

```css
.progress-bar {
  width: 100%;
  height: 6px;
  background: var(--bg-subtle);
  border-radius: var(--radius-full);
  overflow: hidden;
}
.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent) 0%, var(--accent-dark) 100%);
  border-radius: var(--radius-full);
  transition: width 0.3s ease;
  position: relative;
}
/* Shimmer animé pendant le processing */
.progress-bar-fill::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg,
    transparent 0%,
    rgba(255,255,255,0.2) 50%,
    transparent 100%
  );
  animation: shimmer 1.5s ease-in-out infinite;
}
@keyframes shimmer {
  from { transform: translateX(-100%); }
  to   { transform: translateX(100%); }
}
```

---

## 🌙 DARK MODE — IMPLÉMENTATION

### Stratégie : `data-theme` + `prefers-color-scheme`

```tsx
// lib/theme.ts
// Ordre de priorité :
// 1. Préférence stockée (localStorage)
// 2. Préférence système (prefers-color-scheme)
// 3. Défaut : light

export type Theme = 'light' | 'dark' | 'system';

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    root.setAttribute('data-theme', theme);
  }
  localStorage.setItem('mg-theme', theme);
}

// Hook React
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    (localStorage.getItem('mg-theme') as Theme) ?? 'system'
  );
  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    applyTheme(next);
    setTheme(next);
  };
  return { theme, toggleTheme };
}
```

```tsx
// app/layout.tsx — Éviter le FOUC (Flash of Unstyled Content)
// Injecter ce script AVANT le rendu React (dans <head>) :
<script dangerouslySetInnerHTML={{ __html: `
  (function() {
    var t = localStorage.getItem('mg-theme') || 'system';
    var d = t === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : t;
    document.documentElement.setAttribute('data-theme', d);
  })();
`}} />
```

### Toggle UI

```tsx
// Composant ThemeToggle : cycle Light → Dark → System
// Icônes : ☀️ Sun | 🌙 Moon | 💻 Monitor
// Position : coin supérieur droit du topbar
// Sur mobile : dans le menu hamburger
```

---

## 📐 LAYOUT SYSTÈME

### Landing page

```
┌─────────────────────────────────────────────────────┐
│ Topbar : Logo | Nav links | [Login] [Start free]    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  HERO (min-height: 90vh)                            │
│  ┌──────────────────┐  ┌──────────────────────┐    │
│  │ Titre (Syne 800) │  │ Demo interactive     │    │
│  │ Sous-titre       │  │ [input email]        │    │
│  │ CTA buttons      │  │ → Score animé        │    │
│  └──────────────────┘  └──────────────────────┘    │
│                                                     │
│  FEATURES (3 cols sur lg, 1 col sur mobile)         │
│  PRICING (cards centrées)                           │
│  SOCIAL PROOF (compteur + logos)                    │
│  FOOTER                                             │
└─────────────────────────────────────────────────────┘
```

### Dashboard (desktop lg+)

```
┌───────────┬────────────────────────────────────────┐
│  Sidebar  │  Topbar (breadcrumb + actions)         │
│  240px    ├────────────────────────────────────────┤
│           │                                        │
│  Nav:     │  Content area                          │
│  Dashboard│  (max-width: 1200px, centré)           │
│  Validate │                                        │
│  Bulk     │                                        │
│  API Keys │                                        │
│  Webhooks │                                        │
│  Reports  │                                        │
│  Settings │                                        │
│           │                                        │
│  ──────   │                                        │
│  Credits  │                                        │
│  Plan     │                                        │
│  Avatar   │                                        │
└───────────┴────────────────────────────────────────┘
```

### Dashboard (mobile < lg)

```
┌─────────────────────────────────────────────────────┐
│ ≡  MailGuard              🔔  👤                    │ ← Topbar
├─────────────────────────────────────────────────────┤
│                                                     │
│  Content area (full width, padding 16px)            │
│                                                     │
├─────────────────────────────────────────────────────┤
│  🏠        🔍        📦        🔑        ⚙️         │ ← Bottom nav
└─────────────────────────────────────────────────────┘
```

---

## ✨ ANIMATIONS & MICRO-INTERACTIONS

```css
/* ============================================
   Transitions globales (appliquées au :root)
   ============================================ */
*, *::before, *::after {
  /* Ne pas animer le changement de thème sur TOUS les éléments
     (trop lent) — seulement les propriétés visuelles ciblées */
}

/* Transition thème : uniquement background + color */
body, .card, .sidebar, .topbar, .input, .btn {
  transition:
    background-color 0.2s ease,
    border-color     0.2s ease,
    color            0.15s ease;
}

/* ============================================
   Page load — staggered reveal
   ============================================ */
.fade-up {
  opacity: 0;
  transform: translateY(16px);
  animation: fadeUp 0.5s ease forwards;
}
.fade-up:nth-child(1) { animation-delay: 0ms; }
.fade-up:nth-child(2) { animation-delay: 80ms; }
.fade-up:nth-child(3) { animation-delay: 160ms; }
.fade-up:nth-child(4) { animation-delay: 240ms; }

@keyframes fadeUp {
  to { opacity: 1; transform: translateY(0); }
}

/* ============================================
   Skeleton loading
   ============================================ */
.skeleton {
  background: linear-gradient(
    90deg,
    var(--bg-subtle) 25%,
    var(--bg-elevated) 50%,
    var(--bg-subtle) 75%
  );
  background-size: 200% 100%;
  animation: skeleton 1.5s ease-in-out infinite;
  border-radius: var(--radius-md);
}
@keyframes skeleton {
  from { background-position: 200% 0; }
  to   { background-position: -200% 0; }
}

/* ============================================
   Hover sur les lignes du tableau
   ============================================ */
.table-row {
  transition: background 0.1s ease;
  cursor: default;
}
.table-row:hover {
  background: var(--bg-elevated);
}

/* ============================================
   Score circle — counter animation (JS)
   ============================================ */
/* Utiliser requestAnimationFrame pour animer
   le chiffre de 0 → score en 600ms (ease-out-quart) */

/* ============================================
   Toast notifications
   ============================================ */
.toast {
  position: fixed;
  bottom: var(--space-6);
  right: var(--space-6);
  z-index: 9999;
  background: var(--text-primary);
  color: var(--text-inverted);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);
  font-size: var(--text-sm);
  box-shadow: var(--shadow-xl);
  animation: toastIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.toast.dismissing {
  animation: toastOut 0.2s ease forwards;
}
@keyframes toastIn {
  from { transform: translateY(16px) scale(0.96); opacity: 0; }
  to   { transform: translateY(0) scale(1); opacity: 1; }
}
@keyframes toastOut {
  to   { transform: translateY(8px) scale(0.96); opacity: 0; }
}

/* Mobile : toast en bas centré */
@media (max-width: 479px) {
  .toast {
    bottom: calc(var(--space-16) + var(--space-4)); /* au dessus de la bottom nav */
    left: var(--space-4);
    right: var(--space-4);
    text-align: center;
  }
}
```

---

## ♿ ACCESSIBILITÉ

```css
/* Focus visible (remplace l'outline navigateur) */
:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 3px;
  border-radius: var(--radius-sm);
}
/* Masquer l'outline pour les clics souris */
:focus:not(:focus-visible) {
  outline: none;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  .score-circle-fill { transition: none; }
}

/* Contrast minimum WCAG AA */
/* Vérifier : text-primary sur bg-base     → ratio ≥ 4.5:1 ✅  */
/* Vérifier : text-secondary sur bg-surface → ratio ≥ 4.5:1 ✅  */
/* Vérifier : accent sur bg-surface (light) → ratio ≥ 3:1   ✅  */
```

**Règles :**
- Tous les boutons ont un `aria-label` explicite si l'icône est seule
- Les badges de status ont `role="status"` et `aria-label="Email status: valid"`
- Le score circle a `aria-label="Email quality score: 82 out of 100"`
- Les inputs ont toujours un `<label>` associé (même si visuellement caché avec `.sr-only`)
- La sidebar collapsed garde les labels accessibles en `aria-label` sur les liens

---

## 🗂️ TAILWIND CONFIG COMPLÈTE

```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        mono:    ['DM Mono', 'monospace'],
      },
      colors: {
        accent: {
          DEFAULT: 'var(--accent)',
          light:   'var(--accent-light)',
          dark:    'var(--accent-dark)',
        },
        score: {
          critical: 'var(--score-critical)',
          poor:     'var(--score-poor)',
          medium:   'var(--score-medium)',
          good:     'var(--score-good)',
          excellent:'var(--score-excellent)',
        },
      },
      borderRadius: {
        sm:   'var(--radius-sm)',
        md:   'var(--radius-md)',
        lg:   'var(--radius-lg)',
        xl:   'var(--radius-xl)',
        '2xl':'var(--radius-2xl)',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
      },
      animation: {
        'fade-up':  'fadeUp 0.5s ease forwards',
        'skeleton': 'skeleton 1.5s ease-in-out infinite',
        'shimmer':  'shimmer 1.5s ease-in-out infinite',
        'pulse-dot':'pulse-dot 2s ease-in-out infinite',
        'spin-slow':'spin 0.6s linear infinite',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('tailwindcss-animate'),
  ],
} satisfies Config;
```

---

## 🔍 PAGES — NOTES DESIGN SPÉCIFIQUES

### `/login` — Page de connexion
- Fond : `--bg-base`, logo centré en haut
- Card centrale (max-width 400px) avec `--shadow-lg`
- Bouton Google : icône Google SVG inline + texte "Continuer avec Google"
- Séparateur `──── ou ────` entre Google et Magic Link
- Input email + bouton "Recevoir un lien magique"
- Aucun lien "Mot de passe oublié" (on n'a pas de password !)
- Message légal discret en bas : "En continuant, vous acceptez nos CGU"

### `/verify` — Page post-magic-link
- Simple, rassurante : icône envelope animée
- Titre : "Vérifiez votre boîte mail"
- Sous-titre : "Un lien de connexion a été envoyé à **{email}**"
- Bouton "Renvoyer" (cooldown 60s avec timer visible)

### `/dashboard` — Dashboard principal
- Topbar : breadcrumb "Dashboard", crédits restants en badge, avatar
- KPI cards (4) : Validations ce mois | Taux valide | Score moyen | Crédits
- Quick validate : input email en haut de page (focus automatique)
- Recent validations : tableau simple (5 dernières)
- Bulk jobs en cours : liste avec progress bars

### `/validate` — Validateur
- Input hero centré (max-width 600px)
- Résultat en deux colonnes sur desktop :
  - Gauche : Score circle XL + status badge + suggestion
  - Droite : checklist des vérifications
- Sur mobile : colonne unique, score en haut

### `/bulk/[jobId]` — Résultats bulk
- Header : nom du fichier + date + status badge
- Barre de progression si en cours
- Tabs : "Résultats" | "Analytics" | "Exporter"
- **Tab Résultats** : tableau paginé (50/page), filtres par status + score
- **Tab Analytics** : donut chart + histogramme + top domaines
- **Tab Exporter** : 4 boutons format + filtres pré-export

---

*DESIGN.md — MailGuard Pro v1.0*
*Typographie : Syne + DM Mono · Palette warm-neutral · Score circle animé*