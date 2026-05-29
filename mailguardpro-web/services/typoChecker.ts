// Détection des fautes de frappe dans les domaines email
// Utilise la distance de Levenshtein pour trouver les domaines similaires

import { CheckResult } from "./types";

// Liste des domaines populaires à vérifier
const POPULAR_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "mail.com",
  "protonmail.com",
  "proton.me",
  "zoho.com",
  "gmx.com",
  "gmx.net",
  "yandex.com",
  "fastmail.com",
  "tutanota.com",
];

// Import dynamique de fast-levenshtein pour éviter les problèmes de build
let levenshtein: ((a: string, b: string) => number) | null = null;

async function getLevenshtein(): Promise<(a: string, b: string) => number> {
  if (!levenshtein) {
    const mod = await import("fast-levenshtein");
    levenshtein = mod.default;
  }
  return levenshtein!;
}

export async function checkTypo(email: string): Promise<CheckResult> {
  const [localPart, domain] = email.split("@");

  if (!localPart || !domain) {
    return {
      passed: true,
      message: "Format invalide",
    };
  }

  // Ignorer les domaines non популярные (pas de suggestion pour les domaines obscurs)
  // Chercher le domaine le plus proche
  let closestDomain: string | null = null;
  let minDistance = Infinity;

  const distanceFn = await getLevenshtein();

  for (const popular of POPULAR_DOMAINS) {
    const distance = distanceFn(domain.toLowerCase(), popular);

    // Ne considérer que si distance <= 2 et le domaine est assez similaire
    if (distance < minDistance && distance <= 3) {
      minDistance = distance;
      closestDomain = popular;
    }
  }

  // Si on a trouvé un domaine proche avec une distance faible
  if (closestDomain && minDistance <= 2 && domain.toLowerCase() !== closestDomain) {
    const suggestedEmail = `${localPart}@${closestDomain}`;

    return {
      passed: false,
      message: "Erreur de frappe détectée",
      detail: `Vouliez-vous dire ${suggestedEmail} ?`,
      // Stocker la suggestion pour l'afficher
      // @ts-expect-error - Propriété custom
      suggestion: suggestedEmail,
    };
  }

  // Vérifier les erreurs courantes spécifiques
  // gmial -> gmail, gmai -> gmail, gamil -> gmail, etc.
  const commonTypos: Record<string, string> = {
    gmial: "gmail.com",
    gmai: "gmail.com",
    gamil: "gmail.com",
    gmal: "gmail.com",
    gmali: "gmail.com",
    goggle: "googlemail.com",
    yaho: "yahoo.com",
    hotmial: "hotmail.com",
    outlok: "outlook.com",
    icloud: "icloud.com",
  };

  const typoMatch = Object.keys(commonTypos).find((typo) => domain.toLowerCase().includes(typo));
  if (typoMatch) {
    const suggestedEmail = `${localPart}@${commonTypos[typoMatch]}`;
    return {
      passed: false,
      message: "Erreur de frappe détectée",
      detail: `Vouliez-vous dire ${suggestedEmail} ?`,
      // @ts-expect-error
      suggestion: suggestedEmail,
    };
  }

  return {
    passed: true,
    message: "Aucune erreur détectée",
    detail: undefined,
  };
}
