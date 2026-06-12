// Vérification des enregistrements DNS (MX, SPF, DMARC)
// Cache TTL via Redis pour éviter les résolutions DNS coûteuses

import dns from "dns/promises";
import { SCORING_WEIGHTS } from "@/config/scoringWeights";
import { getCachedDomainChecks, setCachedDomainChecks } from "@/services/validationCache";
import type { CheckResult } from "./types";

// Résolution DNS avec timeout
async function resolveWithTimeout<T>(fn: () => Promise<T>, timeoutMs = 5000): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("DNS resolution timeout")), timeoutMs),
  );
  return Promise.race([fn(), timeout]);
}

export async function checkMX(email: string): Promise<CheckResult> {
  const domain = email.split("@")[1];

  // Check cache first
  const cached = await getCachedDomainChecks(domain);
  if (cached?.mx) return cached.mx as CheckResult;

  try {
    const mxRecords = await resolveWithTimeout(() => dns.resolveMx(domain));

    if (!mxRecords || mxRecords.length === 0) {
      const result: CheckResult = {
        passed: false,
        weight: SCORING_WEIGHTS.mx.fail,
        message: "Aucun enregistrement MX trouvé",
        detail: `Le domaine ${domain} n'a pas de serveur mail configuré`,
      };
      await setCachedDomainChecks(domain, { mx: result });
      return result;
    }

    mxRecords.sort((a, b) => a.priority - b.priority);

    const result: CheckResult = {
      passed: true,
      weight: SCORING_WEIGHTS.mx.pass,
      message: "MX valide",
      detail: `Serveur principal: ${mxRecords[0].exchange} (priorité: ${mxRecords[0].priority})`,
    };
    await setCachedDomainChecks(domain, { mx: result });
    return result;
  } catch (error) {
    const result: CheckResult = {
      passed: false,
      weight: SCORING_WEIGHTS.mx.fail,
      message: "Erreur de résolution DNS",
      detail: `Impossible de résoudre les enregistrements MX pour ${domain}`,
    };
    await setCachedDomainChecks(domain, { mx: result });
    return result;
  }
}

export async function checkSPF(domain: string): Promise<CheckResult> {
  // Check cache first
  const cached = await getCachedDomainChecks(domain);
  if (cached?.spf) return cached.spf as CheckResult;

  try {
    const txtRecords = await resolveWithTimeout(() => dns.resolveTxt(domain));

    for (const record of txtRecords) {
      const recordStr = record.join("");
      if (recordStr.includes("v=spf1")) {
        const result: CheckResult = {
          passed: true,
          weight: SCORING_WEIGHTS.spf.pass,
          message: "SPF configuré",
          detail: `${recordStr.substring(0, 100)}${recordStr.length > 100 ? "..." : ""}`,
        };
        await setCachedDomainChecks(domain, { spf: result });
        return result;
      }
    }

    const result: CheckResult = {
      passed: false,
      weight: SCORING_WEIGHTS.spf.fail,
      message: "SPF non trouvé",
      detail: "Aucun enregistrement SPF trouvé",
    };
    await setCachedDomainChecks(domain, { spf: result });
    return result;
  } catch {
    const result: CheckResult = {
      passed: false,
      weight: SCORING_WEIGHTS.spf.fail,
      message: "Erreur vérification SPF",
      detail: "Impossible de vérifier les enregistrements SPF",
    };
    await setCachedDomainChecks(domain, { spf: result });
    return result;
  }
}

export async function checkDMARC(domain: string): Promise<CheckResult> {
  // Check cache first
  const cached = await getCachedDomainChecks(domain);
  if (cached?.dmarc) return cached.dmarc as CheckResult;

  try {
    const records = await resolveWithTimeout(() => dns.resolveTxt(`_dmarc.${domain}`));

    for (const record of records) {
      const recordStr = record.join("");
      if (recordStr.includes("v=DMARC1")) {
        const result: CheckResult = {
          passed: true,
          weight: SCORING_WEIGHTS.dmarc.pass,
          message: "DMARC configuré",
          detail: recordStr.substring(0, 100),
        };
        await setCachedDomainChecks(domain, { dmarc: result });
        return result;
      }
    }

    const result: CheckResult = {
      passed: false,
      weight: SCORING_WEIGHTS.dmarc.fail,
      message: "DMARC non trouvé",
      detail: "Aucun enregistrement DMARC trouvé",
    };
    await setCachedDomainChecks(domain, { dmarc: result });
    return result;
  } catch {
    const result: CheckResult = {
      passed: false,
      weight: SCORING_WEIGHTS.dmarc.fail,
      message: "Erreur vérification DMARC",
      detail: "Impossible de vérifier les enregistrements DMARC",
    };
    await setCachedDomainChecks(domain, { dmarc: result });
    return result;
  }
}

export async function getDomainInfo(domain: string): Promise<{
  mx: string[];
  spf: boolean;
  dmarc: boolean;
}> {
  // Check cache first
  const cached = await getCachedDomainChecks(domain);
  if (cached?.mx && cached?.spf !== undefined && cached?.dmarc !== undefined) {
    const mxDetail: string = (cached.mx as any)?.detail || "";
    const mxMatch = mxDetail.match(/: (.+)$/);
    const mx = mxMatch ? [mxMatch[1]] : [];
    return {
      mx,
      spf: !!(cached.spf as any)?.passed,
      dmarc: !!(cached.dmarc as any)?.passed,
    };
  }

  try {
    const [mxRecords, txtRecords] = await Promise.all([
      resolveWithTimeout(() => dns.resolveMx(domain), 5000).catch(() => []),
      resolveWithTimeout(() => dns.resolveTxt(domain), 5000).catch(() => []),
    ]);

    const spf = txtRecords.some((r) => r.join("").includes("v=spf1"));
    const dmarc = txtRecords.some((r) => r.join("").includes("v=DMARC1"));
    const mx = mxRecords.map((m) => m.exchange);

    // Cache partial domain info
    const mxResult: CheckResult = {
      passed: mx.length > 0,
      weight: mx.length > 0 ? SCORING_WEIGHTS.mx.pass : SCORING_WEIGHTS.mx.fail,
      message: mx.length > 0 ? "MX valide" : "Aucun MX trouvé",
      detail: mx.length > 0 ? `Serveur principal: ${mx[0]}` : undefined,
    };
    const spfResult: CheckResult = {
      passed: spf,
      weight: spf ? SCORING_WEIGHTS.spf.pass : SCORING_WEIGHTS.spf.fail,
      message: spf ? "SPF configuré" : "SPF non trouvé",
    };
    const dmarcResult: CheckResult = {
      passed: dmarc,
      weight: dmarc ? SCORING_WEIGHTS.dmarc.pass : SCORING_WEIGHTS.dmarc.fail,
      message: dmarc ? "DMARC configuré" : "DMARC non trouvé",
    };
    await setCachedDomainChecks(domain, { mx: mxResult, spf: spfResult, dmarc: dmarcResult });

    return { mx, spf, dmarc };
  } catch {
    return { mx: [], spf: false, dmarc: false };
  }
}
