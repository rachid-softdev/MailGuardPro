// Moteur de validation email - Orchestrateur de tous les checks

import { validate as validateEmailLib } from "uuid";
import { checkCatchAll } from "./catchAllChecker";
import { checkDisposable } from "./disposableChecker";
import { checkDMARC, checkMX, checkSPF } from "./dnsChecker";
import { checkDNSBL } from "./dnsblChecker";
import { checkFormat } from "./formatChecker";
import { checkFreeProvider } from "./freeProviderChecker";
import { checkGeneric } from "./genericChecker";
import { getDomainReputation } from "./reputationScorer";
import { checkSMTP } from "./smtpChecker";
import { ValidationChecks, ValidationResult } from "./types";
import { checkTypo } from "./typoChecker";

export async function validateEmail(email: string): Promise<ValidationResult> {
  const startTime = Date.now();
  const domain = email.split("@")[1] || "";

  // Exécuter tous les checks en parallèle pour optimiser le temps total
  const [
    formatResult,
    mxResult,
    spfResult,
    dmarcResult,
    smtpResult,
    catchAllResult,
    disposableResult,
    genericResult,
    freeProviderResult,
    dnsblResult,
    typoResult,
  ] = await Promise.all([
    checkFormat(email),
    checkMX(email),
    checkSPF(domain),
    checkDMARC(domain),
    checkSMTP(email).catch((e) => ({
      passed: false,
      weight: 30,
      message: "Erreur SMTP",
      detail: e.message,
    })),
    checkCatchAll(domain),
    checkDisposable(email),
    checkGeneric(email),
    checkFreeProvider(email),
    checkDNSBL(domain).catch((e) => ({
      passed: true,
      weight: 0,
      message: "Erreur",
      detail: e.message,
    })),
    checkTypo(email),
  ]);

  // Calculer le score
  let score = 0;

  // Points positifs
  if (formatResult.passed) score += 15;
  if (mxResult.passed) score += 25;
  if (smtpResult.passed) score += 30;
  if (catchAllResult.passed) score += 10;
  if (disposableResult.passed) score += 10;
  if (genericResult.passed) score += 5;

  // Bonus SPF/DMARC
  if (spfResult.passed) score += 5;
  if (dmarcResult.passed) score += 5;

  // Bonus domaine ancien (si dispo)
  const reputation = await getDomainReputation(domain);
  if (reputation.ageInDays && reputation.ageInDays > 365) {
    score += 5;
  }

  // Pénalités
  if (!dnsblResult.passed) score -= 20;
  if (!typoResult.passed) score -= 10;

  // S'assurer que le score est entre 0 et 100
  score = Math.max(0, Math.min(100, score));

  // Déterminer le statut final
  let status: "valid" | "invalid" | "risky" | "unknown";

  // Logique de détermination du statut
  if (!formatResult.passed) {
    status = "invalid";
  } else if (!disposableResult.passed) {
    status = "invalid";
  } else if (!typoResult.passed) {
    status = "risky"; // Suggestion disponible
  } else if (score >= 75 && smtpResult.passed) {
    status = "valid";
  } else if (score < 40 || !smtpResult.passed) {
    status = "invalid";
  } else if (score >= 40 && score < 75) {
    status = "risky";
  } else {
    status = "unknown";
  }

  // Construire le résultat
  const result: ValidationResult = {
    email,
    score,
    status,
    checks: {
      format: formatResult,
      mx: mxResult,
      smtp: smtpResult,
      catchAll: catchAllResult,
      disposable: disposableResult,
      generic: genericResult,
      freeProvider: freeProviderResult,
      dnsbl: dnsblResult,
      spf: spfResult,
      dmarc: dmarcResult,
      typo: typoResult,
    },
    domain: reputation,
    suggestion:
      !typoResult.passed && (typoResult as any).suggestion
        ? (typoResult as any).suggestion
        : undefined,
    processingTimeMs: Date.now() - startTime,
  };

  return result;
}

// Fonction de validation simple (sans tous les checks, plus rapide)
export async function validateEmailQuick(
  email: string,
): Promise<{ valid: boolean; reason?: string }> {
  const format = checkFormat(email);
  if (!format.passed) {
    return { valid: false, reason: format.message };
  }

  const disposable = await checkDisposable(email);
  if (!disposable.passed) {
    return { valid: false, reason: "Disposable email" };
  }

  const mx = await checkMX(email);
  if (!mx.passed) {
    return { valid: false, reason: "No MX record" };
  }

  return { valid: true };
}
