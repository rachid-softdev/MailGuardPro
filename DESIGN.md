# DESIGN.md — MailGuard Pro

## « The Sorting Floor » — système de design

---

## 1. Direction

**Concept :** *The Sorting Floor*. MailGuard n'est pas un tableau de bord SaaS de plus : c'est
un sol de tri postal, un instrument d'inspection. Les surfaces ressemblent à du papier froid,
les règles sont des filets d'encre, les chiffres sont des relevés d'instrument.

**Ce qui rend l'interface mémorable :**

- Le **verdict** : un score 0–100 posé sur une échelle calibrée, avec une aiguille physique.
- Le **dossier d'inspection** : une feuille de contrôle avec des tampons, des lignes et des
  relevés mono.
- L'**orange signal** : présent uniquement pour l'action, l'attention et le CTA final.
- Le **bleu routage** : information, liens, traçabilité — jamais une décoration.

**Ton :** confiant, technique, sec. Pas de mascotte, pas d'emoji décoratif, pas de superlatifs.
On décrit ce que l'instrument fait, pas ce qu'il promet.

**Références ressenties :** archives postales, formulaires administratifs, instruments de mesure,
tables de tri. Pas Linear, pas Vercel, pas un template « AI SaaS ».

---

## 2. Typographie

Deux familles, auto-hébergées dans `public/fonts/`. **Ne jamais réintroduire Google Fonts** :
la CSP n'autorise que `font-src 'self' data:`.

| Rôle | Police | Usage |
| --- | --- | --- |
| Display / UI | **Archivo** (variable, 100–900) | titres, navigation, boutons, corps de texte |
| Instrument | **Spline Sans Mono** (300–700) | emails, scores, IDs, dates, labels, code |

```css
--font-sans: "Archivo", system-ui, sans-serif;
--font-display: "Archivo", system-ui, sans-serif;
--font-mono: "Spline Sans Mono", ui-monospace, monospace;
```

**Règles :**

- Titres display : `font-weight: 600`, `letter-spacing: -0.03em` à `-0.045em`.
- Labels : mono, uppercase, `letter-spacing: 0.06em`, taille 9–11 px.
- Le corps de texte ne se letterspace jamais.
- Les chiffres et emails sont toujours en mono, avec `font-variant-numeric: tabular-nums`.
- Syne, DM Mono et Plus Jakarta Sans sont retirées du projet.

---

## 3. Couleurs

Les tokens sont en OKLCH et basculent via `[data-theme="dark"]`. Le thème clair est du papier
froid, jamais du crème chaud.

### Surfaces et encre

| Token | clair | sombre | rôle |
| --- | --- | --- | --- |
| `--bg` | `oklch(0.965 0.008 150)` | `oklch(0.15 0.012 150)` | fond de page |
| `--surface` | `oklch(0.992 0.004 150)` | `oklch(0.185 0.012 150)` | panneaux, cartes |
| `--surface-2` | `oklch(0.94 0.01 150)` | `oklch(0.225 0.014 150)` | encarts, en-têtes de table |
| `--surface-3` | `oklch(0.905 0.012 150)` | `oklch(0.27 0.014 150)` | pistes, états désactivés |
| `--ink` | `oklch(0.17 0.012 150)` | `oklch(0.94 0.008 150)` | texte principal |
| `--ink-2` | `oklch(0.37 0.012 150)` | `oklch(0.76 0.011 150)` | texte secondaire |
| `--ink-3` | `oklch(0.49 0.01 150)` | `oklch(0.64 0.012 150)` | labels, métadonnées |
| `--line` | `oklch(0.86 0.012 150)` | `oklch(0.3 0.012 150)` | filets 1 px |
| `--line-strong` | `oklch(0.68 0.015 150)` | `oklch(0.43 0.014 150)` | survol, emphase |

### Signaux

| Token | clair | rôle |
| --- | --- | --- |
| `--accent` | `oklch(0.63 0.19 42)` | orange signal : action, attention, CTA final |
| `--accent-hover` | `oklch(0.56 0.18 40)` | état pressé / survol |
| `--accent-soft` | `oklch(0.93 0.045 45)` | fond d'emphase discrète |
| `--accent-text` | `oklch(0.5 0.17 38)` | texte orange lisible sur papier |
| `--route` | `oklch(0.44 0.09 250)` | bleu routage : information, liens, traçabilité |
| `--route-soft` | `oklch(0.92 0.025 250)` | fond informationnel |

**Règles :**

- L'orange n'est pas une décoration. Il indique une action ou un point d'attention.
- Le vert est **réservé** à l'état `valid` et à la bande de score `Clear`. Jamais un « succès »
  générique, jamais un CTA.
- Le bleu routage est informationnel. Il ne remplace pas l'orange d'action.
- Pas de dégradés, pas de glow, pas de glassmorphism.

---

## 4. Scores et statuts

Le score est un instrument, pas une jauge marketing. Les bornes sont inclusives et le score est
arrondi puis borné à 0–100.

| Score | Bande | Verdict |
| --- | --- | --- |
| 0–25 | `Critical` | Return to sender |
| 26–40 | `Poor` | High risk |
| 41–60 | `Caution` | Proceed with caution |
| 61–75 | `Good` | Deliverable |
| 76–100 | `Clear` | Clear to send |

Largeurs de l'échelle : 25 / 15 / 20 / 15 / 25. Le nombre reste en encre graphite ; la bande
porte la couleur et le tampon. L'aiguille est le seul élément qui bouge.

Statuts :

- `valid` → vert `Clear`, point qui pulse doucement.
- `invalid` → rouge `Critical`, arrêt.
- `risky` → orange `Poor`, à examiner.
- `unknown` → gris `ink-3`, pas d'information.

Le statut n'est jamais porté par la couleur seule : label, point et `aria-label` sont toujours
présents.

---

## 5. Géométrie et élévation

- Rayon par défaut : **2 px**. Les tampons et badges peuvent être à 1 px ou 0.
- Les overlays peuvent utiliser 4–6 px. Les cartes, boutons et panneaux restent à 2 px.
- Bordures : 1 px `--line`. Au survol : `--line-strong`.
- Ombres : **aucune** sur les cartes, boutons et panneaux. `--shadow-pop` et `--shadow-modal`
  sont réservés aux overlays, menus et modales.
- Pas de coins arrondis « consumer », pas de cartes flottantes, pas de blur décoratif.

---

## 6. Layout

- Marketing : conteneur `max-w-[1280px]`, padding horizontal 24 px (mobile 16–24 px).
- Dashboard : sidebar 236 px, topbar 52 px, padding de contenu 24 px.
- Mobile : bottom nav 6 entrées (Dashboard, Validate, Bulk, History, Billing, Settings).
  Le contenu réserve `pb-16` pour ne pas passer sous la barre.
- Les tableaux larges défilent horizontalement. Un indice « Scroll sideways » est affiché sur
  mobile quand la comparaison est nécessaire.
- Les grilles de dashboard utilisent `items-start` pour que les panneaux gardent leur hauteur
  naturelle.

---

## 7. Composants

### Marque

- `BrandMark` : bloc d'encre, M reversé, coin orange 4 × 4. SVG, `currentColor`.
- `Wordmark` : « MAILGUARD » en Archivo extra-bold + tampon « PRO » en mono.
- Le mark ne s'inverse pas sur un fond encre sans adaptation : il est prévu pour `--surface`.

### Boutons

- `primary` : encre sur papier, pour l'engagement principal.
- `accent` : orange signal, pour l'inspection et l'action contextuelle.
- `secondary` : surface + filet, pour les actions secondaires.
- `ghost` : filet discret, pour les actions tertiaires.
- `danger` : rouge, contour seul, jamais un fond rouge plein.
- `link` : texte orange souligné au survol.
- Une seule action accent par vue. Hauteurs : 28 / 36 / 44 / 52 px.

### Tampons et badges

- `Badge` : mono 10 px, uppercase, tracking 0.06em, rayon 1 px.
- `StatusBadge` : label + point + tooltip d'aide. Le point `valid` pulse.
- Les tampons de score utilisent `border: 1px solid currentColor` et un fond `--surface`.

### Panneaux

- `.panel` : surface, filet, rayon 2 px, sans ombre.
- `.panel-head` : 12 × 16 px, filet bas, titre mono uppercase.
- `.card` : même langage, padding 24 px, survol du filet uniquement.

### Formulaires

- `Input` : mono, hauteur 38 px, rayon 2 px, bord `--line`, focus `--line-focus`.
- Labels : mono uppercase 10 px, au-dessus du champ.
- Les erreurs utilisent `--status-invalid` et un texte explicite, pas seulement une bordure rouge.

### Score

- `ScoreGauge` : échelle + aiguille + nombre + bande. `role="meter"`.
- `ScoreMeter` : version compacte pour les tables, largeur 40 px.
- `InspectionSheet` : feuille de contrôle déterministe sur la landing.
- `BatchSimulation` : démonstration de lot, 8 lignes, 360 ms par ligne.

### Navigation

- `MarketingHeader` : wordmark, nav, thème, CTA. Menu mobile plein écran sous le header.
- `MarketingFooter` : colonnes, échelle de score, mention légale.
- `DashboardShell` : sidebar desktop, drawer mobile, topbar, bottom nav.
- `DashboardTopbar` : breadcrumbs, recherche, thème, notifications.
- `Sidebar` : groupes, crédits, undo, compte.
- `BottomNav` : 6 entrées, icônes + labels.

---

## 8. Mouvement

- Survol / couleur : 150 ms, `--ease-out-quart`.
- Apparition de menu : 180 ms, `fadeSlideIn`.
- Aiguille du score : 700 ms, `--ease-out-expo`.
- Ligne de lot : 360 ms par ligne ; le compteur est `aria-live`.
- Respecter `prefers-reduced-motion` : les animations sont alors instantanées.
- Pas de parallaxe, pas de scroll-jacking, pas d'animation en boucle décorative.

---

## 9. Voix et copy

**Principes :**

- Phrases courtes, déclaratives, avec un vocabulaire de tri postal.
- On parle d'« inspection », « verdict », « lot », « ligne », « registre », « retour à
  l'expéditeur ».
- On nomme le résultat, pas la technologie.
- Pas de « AI-powered », « next-generation », « supercharge », « effortlessly ».
- Pas d'emoji dans l'UI produit.

**Exemples :**

- ✅ « Every address gets a verdict. »
- ✅ « Catch the bad ones before they cost you. »
- ✅ « Inspect a batch. Export the clean ones. »
- ❌ « AI-powered email intelligence for modern teams. »
- ❌ « Supercharge your deliverability. »

---

## 10. Accessibilité

- Contraste minimum 4.5:1 pour le texte, 3:1 pour les éléments d'interface.
- Focus visible : `--line-focus`, jamais supprimé.
- Le statut est toujours doublé d'un label et d'un `aria-label`.
- `ScoreGauge` expose `role="meter"`, `aria-valuemin/max/now` et le verdict.
- Menus et drawers : fermeture au clic sur un lien, focus géré, `aria-expanded`.
- Tableaux : `scope="col"`, en-têtes lisibles, colonnes masquées sur mobile.
- `prefers-reduced-motion` respecté.
- Les tooltips ne sont pas le seul moyen d'accéder à une information critique.

---

## 11. À faire / à éviter

**À faire :**

- Filets fins, rayons 2 px, surfaces plates.
- Mono pour les labels, chiffres et emails.
- Orange pour l'action, le vert pour `valid` / `Clear`.
- Copy sèche, précise, avec une image postale.
- Une seule action principale par écran.

**À éviter :**

- Dégradés, glows, ombres décoratives, glassmorphism.
- Papier crème chaud, vert « SaaS » générique.
- Cartes très arrondies, pilules partout, emojis.
- Titres en dégradé, illustrations 3D, mascottes.
- Promesses marketing non vérifiables.

---

## 12. État de migration

**Migré :**

- Landing page (`app/(marketing)/page.tsx` + `components/marketing/landing/*`)
- Dashboard shell (`DashboardShell`, `DashboardTopbar`, `Sidebar`, `BottomNav`)
- Dashboard (`app/(dashboard)/dashboard/page.tsx`)
- Primitives partagées (`Button`, `Input`, `Badge`, `Card`, `SectionHeader`, `StatusBadge`)
- `MarketingHeader`, `MarketingFooter`, `BrandMark`, `ScoreGauge`, `lib/score.ts`
- Page de référence interne : `/brand` (développement uniquement)

**Encore sur les alias legacy :**

- Pricing, docs, login / 2FA / verify
- Validator, bulk, history
- Billing, settings, API keys, webhooks
- Admin

Les alias `--bg-base`, `--bg-surface`, `--text-primary`, `--border`, etc. existent uniquement
pour ces pages. Ils disparaîtront à la fin de la migration.

**Fichiers de référence :**

- `app/globals.css` — tokens, fonts, classes de base
- `lib/score.ts` — bandes et clamp
- `components/validator/ScoreGauge.tsx` — jauge et meter
- `components/brand/BrandMark.tsx` — mark et wordmark
- `components/layout/*` — shell, topbar, sidebar, bottom nav
- `components/marketing/landing/*` — landing, inspection, batch
- `app/(dev)/brand/page.tsx` — planche de référence

---

*Archivo + Spline Sans Mono · papier froid · graphite · orange signal · bleu routage · 2 px.*
