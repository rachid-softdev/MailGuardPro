// Détection des fautes de frappe dans les domaines email
// Utilise la distance de Levenshtein pour trouver les domaines similaires

import { SCORING_WEIGHTS } from "@/config/scoringWeights";
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
    // fast-levenshtein est un module CommonJS : `module.exports = { get(str1, str2) }`.
    // Selon l'interop du bundler, `get` est exposé soit sur le namespace (mod.get),
    // soit via `.default.get` (où `default` est l'objet module.exports, non appelable).
    const mod = await import("fast-levenshtein");
    const getFn =
      mod.get ??
      (mod as unknown as { default?: { get?: (a: string, b: string) => number } }).default?.get;
    if (typeof getFn !== "function") {
      throw new Error("fast-levenshtein: export `get` introuvable");
    }
    levenshtein = getFn;
  }
  return levenshtein!;
}

export async function checkTypo(email: string): Promise<CheckResult> {
  const [localPart, domain] = email.split("@");

  if (!localPart || !domain) {
    return {
      passed: true,
      weight: SCORING_WEIGHTS.typo.pass,
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
      weight: SCORING_WEIGHTS.typo.fail,
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
  };

  // Comparer uniquement sur le domaine de second niveau : un `includes()` sur le
  // domaine complet déclenchait des faux positifs ("gmail.com".includes("gmai")).
  // On ne signale un typo que si le SLD entier correspond à une faute connue
  // (ex: "gmai.com", "goggle.com"), pas un domaine valide qui le contient.
  const sld = domain.toLowerCase().split(".")[0];
  const typoMatch = Object.keys(commonTypos).find((typo) => sld === typo);
  if (typoMatch) {
    const suggestedEmail = `${localPart}@${commonTypos[typoMatch]}`;
    return {
      passed: false,
      weight: SCORING_WEIGHTS.typo.fail,
      message: "Erreur de frappe détectée",
      detail: `Vouliez-vous dire ${suggestedEmail} ?`,
      // @ts-expect-error - suggestion field is optional in type but always set here
      suggestion: suggestedEmail,
    };
  }

  return {
    passed: true,
    weight: SCORING_WEIGHTS.typo.pass,
    message: "Aucune erreur détectée",
    detail: undefined,
  };
}
