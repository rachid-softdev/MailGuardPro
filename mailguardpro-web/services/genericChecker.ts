// Détection des emails génériques (info@, contact@, support@, etc.)

import { CheckResult } from "./types";

// Liste des local parts génériques courante
const GENERIC_LOCALES = new Set([
  "info",
  "contact",
  "support",
  "help",
  "admin",
  "administrator",
  "sales",
  "marketing",
  "hello",
  "team",
  "office",
  "mail",
  "postmaster",
  "webmaster",
  "noreply",
  "no-reply",
  "accounting",
  "finance",
  "billing",
  "hr",
  "jobs",
  "careers",
  "press",
  "media",
  "partners",
  "partnership",
  "abuse",
  "security",
  "web",
  "website",
  "dev",
  "developer",
  "tech",
  "it",
]);

export function checkGeneric(email: string): CheckResult {
  const localPart = email.split("@")[0]?.toLowerCase();

  if (!localPart) {
    return {
      passed: true,
      weight: 5,
      message: "Format invalide",
    };
  }

  // Vérifier si le local part exact est générique
  if (GENERIC_LOCALES.has(localPart)) {
    return {
      passed: false,
      weight: 5,
      message: "Email générique détecté",
      detail: `${localPart} est une adresse générique d'entreprise`,
    };
  }

  // Vérifier les patterns comme "contact-us", "support-fr", "info-en"
  const dashParts = localPart.split(/[-_.]/);
  for (const part of dashParts) {
    if (GENERIC_LOCALES.has(part)) {
      return {
        passed: false,
        weight: 5,
        message: "Email générique détecté",
        detail: `${localPart} contient "${part}", une adresse générique`,
      };
    }
  }

  // Vérifier les nombres seuls (ex: contact123)
  if (/^(info|contact|support|admin|help|hello|team)[0-9]+$/.test(localPart)) {
    return {
      passed: false,
      weight: 5,
      message: "Email générique détecté",
      detail: `${localPart} semble être une adresse générique avec numéro`,
    };
  }

  return {
    passed: true,
    weight: 5,
    message: "Email personnel",
    detail: undefined,
  };
}
