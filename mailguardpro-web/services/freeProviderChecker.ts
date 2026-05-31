// Détection des fournisseurs d'email gratuit

import { CheckResult } from "./types";

const FREE_PROVIDERS = new Set([
  // Google
  "gmail.com",
  "googlemail.com",

  // Yahoo
  "yahoo.com",
  "ymail.com",
  "yahoo.co.uk",
  "yahoo.fr",
  "yahoo.de",
  "yahoo.es",
  "yahoo.it",
  "yahoo.com.au",
  "yahoo.co.jp",
  "yahoo.co.in",

  // Microsoft
  "hotmail.com",
  "hotmail.co.uk",
  "hotmail.fr",
  "outlook.com",
  "live.com",
  "msn.com",
  "windowslive.com",

  // Apple
  "icloud.com",
  "me.com",
  "mac.com",

  // AOL
  "aol.com",
  "aim.com",

  // Proton
  "protonmail.com",
  "proton.me",
  "protonmail.ch",

  // Autres gratuits
  "mail.com",
  "gmx.com",
  "gmx.de",
  "gmx.net",
  "gmx.at",
  "yandex.com",
  "yandex.ru",
  "yandex.ua",
  "zoho.com",
  "fastmail.com",
  "tutanota.com",
  "tuta.io",
  "hey.com",
  "runbox.com",
  "hushmail.com",
  "inbox.com",
  "comcast.net",
  "verizon.net",
  "att.net",
  "sbcglobal.net",
  "cox.net",
  "charter.net",
]);

export function checkFreeProvider(email: string): CheckResult {
  const domain = email.split("@")[1]?.toLowerCase();

  if (!domain) {
    return {
      passed: true,
      weight: 0,
      message: "Domaine invalide",
    };
  }

  const isFree = FREE_PROVIDERS.has(domain);

  return {
    passed: !isFree,
    weight: 0,
    message: isFree ? `Fournisseur gratuit: ${domain}` : "Email professionnel",
    detail: isFree ? `L'email utilise un fournisseur gratuit (pas de domaine propre)` : undefined,
  };
}

// Fonction pour vérifier si un domaine est un domaine personnalisé (non gratuit)
export function isCustomDomain(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return domain ? !FREE_PROVIDERS.has(domain) : false;
}
