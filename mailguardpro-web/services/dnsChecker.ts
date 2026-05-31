// Vérification des enregistrements DNS (MX, SPF, DMARC)

import dns from "dns/promises";
import { SCORING_WEIGHTS } from "@/config/scoringWeights";
import { CheckResult } from "./types";

// Résolution DNS avec timeout
async function resolveWithTimeout<T>(fn: () => Promise<T>, timeoutMs = 5000): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("DNS resolution timeout")), timeoutMs),
  );
  return Promise.race([fn(), timeout]);
}

export async function checkMX(email: string): Promise<CheckResult> {
  const domain = email.split("@")[1];

  try {
    const mxRecords = await resolveWithTimeout(() => dns.resolveMx(domain));

    if (!mxRecords || mxRecords.length === 0) {
      return {
        passed: false,
        weight: SCORING_WEIGHTS.mx.fail,
        message: "Aucun enregistrement MX trouvé",
        detail: `Le domaine ${domain} n'a pas de serveur mail configuré`,
      };
    }

    // Trier par priorité (plus petit = plus prioritaire)
    mxRecords.sort((a, b) => a.priority - b.priority);

    return {
      passed: true,
      weight: SCORING_WEIGHTS.mx.pass,
      message: "MX valide",
      detail: `Serveur principal: ${mxRecords[0].exchange} (priorité: ${mxRecords[0].priority})`,
    };
  } catch (error) {
    return {
      passed: false,
      weight: SCORING_WEIGHTS.mx.fail,
      message: "Erreur de résolution DNS",
      detail: `Impossible de résoudre les enregistrements MX pour ${domain}`,
    };
  }
}

export async function checkSPF(domain: string): Promise<CheckResult> {
  try {
    const txtRecords = await resolveWithTimeout(() => dns.resolveTxt(domain));

    for (const record of txtRecords) {
      const recordStr = record.join("");
      if (recordStr.includes("v=spf1")) {
        return {
          passed: true,
          weight: SCORING_WEIGHTS.spf.pass,
          message: "SPF configuré",
          detail: `${recordStr.substring(0, 100)}${recordStr.length > 100 ? "..." : ""}`,
        };
      }
    }

    return {
      passed: false,
      weight: SCORING_WEIGHTS.spf.fail,
      message: "SPF non trouvé",
      detail: "Aucun enregistrement SPF trouvé",
    };
  } catch {
    return {
      passed: false,
      weight: SCORING_WEIGHTS.spf.fail,
      message: "Erreur vérification SPF",
      detail: "Impossible de vérifier les enregistrements SPF",
    };
  }
}

export async function checkDMARC(domain: string): Promise<CheckResult> {
  try {
    const records = await resolveWithTimeout(() => dns.resolveTxt(`_dmarc.${domain}`));

    for (const record of records) {
      const recordStr = record.join("");
      if (recordStr.includes("v=DMARC1")) {
        return {
          passed: true,
          weight: SCORING_WEIGHTS.dmarc.pass,
          message: "DMARC configuré",
          detail: recordStr.substring(0, 100),
        };
      }
    }

    return {
      passed: false,
      weight: SCORING_WEIGHTS.dmarc.fail,
      message: "DMARC non trouvé",
      detail: "Aucun enregistrement DMARC trouvé",
    };
  } catch {
    return {
      passed: false,
      weight: SCORING_WEIGHTS.dmarc.fail,
      message: "Erreur vérification DMARC",
      detail: "Impossible de vérifier les enregistrements DMARC",
    };
  }
}

export async function getDomainInfo(domain: string): Promise<{
  mx: string[];
  spf: boolean;
  dmarc: boolean;
}> {
  try {
    const [mxRecords, txtRecords] = await Promise.all([
      dns.resolveMx(domain).catch(() => []),
      dns.resolveTxt(domain).catch(() => []),
    ]);

    const spf = txtRecords.some((r) => r.join("").includes("v=spf1"));
    const dmarc = txtRecords.some((r) => r.join("").includes("v=DMARC1"));

    return {
      mx: mxRecords.map((m) => m.exchange),
      spf,
      dmarc,
    };
  } catch {
    return { mx: [], spf: false, dmarc: false };
  }
}
