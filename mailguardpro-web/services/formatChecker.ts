// Vérification du format de l'email (Regex RFC 5322)

import { CheckResult } from "./types";

export function checkFormat(email: string): CheckResult {
  // Regex RFC 5322 simplifiée mais fonctionnelle
  const rfc5322 =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  // Vérifications supplémentaires
  if (!email || email.length === 0) {
    return {
      passed: false,
      message: "Email vide",
      detail: "L'email ne peut pas être vide",
    };
  }

  if (email.length > 254) {
    return {
      passed: false,
      message: "Email trop long",
      detail: "L'email dépasse la longueur maximale de 254 caractères",
    };
  }

  const parts = email.split("@");
  if (parts.length !== 2) {
    return {
      passed: false,
      message: "Format invalide",
      detail: "L'email doit contenir un seul signe @",
    };
  }

  const [localPart, domain] = parts;

  if (!localPart || !domain) {
    return {
      passed: false,
      message: "Format invalide",
      detail: "Le local part ou le domaine ne peut pas être vide",
    };
  }

  // Vérifier le domaine
  if (domain.length > 63) {
    return {
      passed: false,
      message: "Domaine trop long",
      detail: "Le domaine ne peut pas dépasser 63 caractères par label",
    };
  }

  const passed = rfc5322.test(email);

  return {
    passed,
    message: passed ? "Format valide" : "Format email invalide",
    detail: passed ? undefined : "L'email ne respecte pas le format standard RFC 5322",
  };
}
