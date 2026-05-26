// Vérification SMTP - Connexion réelle au serveur mail

import net from "net";
import { redis } from "@/lib/redis";
import { validateResolvedIp } from "@/lib/ssrf";
import dns from "dns/promises";
import { CheckResult } from "./types";

interface SMTPResult extends CheckResult {
  code?: string;
}

function connectWithTimeout(host: string, port: number, timeout: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);

    socket.on("connect", () => resolve(socket));
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("SMTP connection timeout"));
    });
    socket.on("error", reject);

    socket.connect(port, host);
  });
}

function sendCommand(socket: net.Socket, command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.write(command + "\r\n", (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function readResponse(socket: net.Socket, timeout = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    const timer = setTimeout(() => {
      socket.removeAllListeners("data");
      reject(new Error("SMTP response timeout"));
    }, timeout);

    socket.on("data", (chunk) => {
      data += chunk.toString();
      // Fin de réponse SMTP (code + espace + message)
      if (data.match(/^\d{3}\s/)) {
        clearTimeout(timer);
        socket.removeAllListeners("data");
        resolve(data.trim());
      }
    });
  });
}

// Anti-enumeration: random delay before SMTP check
function randomDelay(): Promise<void> {
  const ms = Math.floor(Math.random() * 400) + 100; // 100-500ms
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function checkSMTP(email: string, timeoutMs = 5000): Promise<SMTPResult> {
  const domain = email.split("@")[1];

  // Check Redis cache first (anti-enumeration)
  try {
    const cacheKey = `smtp:domain:${domain}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as SMTPResult;
    }
  } catch (err) {
    console.warn("[SMTP] Redis unavailable, proceeding without cache:", err);
  }

  // Anti-enumeration: random delay
  await randomDelay();

  try {
    // 1. Résoudre les MX records
    let mxRecords: dns.MxRecord[] = [];
    try {
      mxRecords = await dns.resolveMx(domain);
    } catch {
      return {
        passed: false,
        weight: 30,
        message: "SMTP: domaine non résolu",
        detail: "Impossible de résoudre les MX records",
      };
    }

    if (!mxRecords || mxRecords.length === 0) {
      return {
        passed: false,
        weight: 30,
        message: "SMTP: aucun MX",
        detail: "Aucun serveur MX trouvé pour ce domaine",
      };
    }

    // Trier par priorité
    mxRecords.sort((a, b) => a.priority - b.priority);
    const mxHost = mxRecords[0].exchange;

    // --- Resolve MX hostname to IPs and validate (SSRF protection) ---
    let resolvedIps: string[];
    try {
      resolvedIps = await dns.resolve4(mxHost);
    } catch {
      // IPv4 resolution failed — try IPv6 as fallback
      try {
        resolvedIps = await dns.resolve6(mxHost);
      } catch {
        return {
          passed: false,
          weight: 30,
          message: "SMTP: MX resolution failed",
          detail: `Impossible de résoudre l'adresse IP de ${mxHost}`,
        };
      }
    }

    if (resolvedIps.length === 0) {
      return {
        passed: false,
        weight: 30,
        message: "SMTP: aucune IP résolue",
        detail: `Aucune adresse IP trouvée pour ${mxHost}`,
      };
    }

    // Validate each resolved IP
    for (const ip of resolvedIps) {
      const ipCheck = validateResolvedIp(ip);
      if (!ipCheck.valid) {
        return {
          passed: false,
          weight: 30,
          message: "SMTP: serveur non autorisé",
          detail: ipCheck.error,
        };
      }
    }

    // 2. Tenter connexion sur port 25 (et fallback 587), itérer IPs
    let socket: net.Socket | null = null;
    let lastError: Error | null = null;

    const ipsToTry = resolvedIps.slice(0, 2); // Limiter à 2 IPs max pour éviter timeout
    for (const ip of ipsToTry) {
      for (const port of [25, 587]) {
        try {
          socket = await connectWithTimeout(ip, port, timeoutMs);
          break;
        } catch (error) {
          lastError = error as Error;
          continue;
        }
      }
      if (socket) break;
    }

    if (!socket) {
      return {
        passed: false,
        weight: 30,
        message: "SMTP: connexion impossible",
        detail: `Impossible de se connecter au serveur mail: ${lastError?.message}`,
      };
    }

    try {
      // 3. EHLO
      await sendCommand(socket, "EHLO mailguard.pro");
      const _ehloResponse = await readResponse(socket, timeoutMs);

      // 4. MAIL FROM
      await sendCommand(socket, "MAIL FROM:<verify@mailguard.pro>");
      const mailResponse = await readResponse(socket, timeoutMs);

      // Vérifier que le serveur accepte l'expéditeur
      if (!mailResponse.startsWith("250")) {
        return {
          passed: false,
          weight: 30,
          message: "SMTP: expéditeur refusé",
          detail: mailResponse,
        };
      }

      // 5. RCPT TO (tester l'email)
      await sendCommand(socket, `RCPT TO:<${email}>`);
      const rcptResponse = await readResponse(socket, timeoutMs);

      // 6. QUIT propre
      await sendCommand(socket, "QUIT");
      socket.destroy();

      // Analyser la réponse
      if (rcptResponse.startsWith("250")) {
        // Le serveur a accepté l'email
        return {
          passed: true,
          weight: 30,
          message: "Email délivrable",
          detail: "Le serveur a accepté l'email pour livraison",
          code: "250",
        };
      } else if (rcptResponse.startsWith("550")) {
        // BoîteMail inexistante
        return {
          passed: false,
          weight: 30,
          message: "Boîte mail inexistante",
          detail: rcptResponse,
          code: "550",
        };
      } else if (rcptResponse.startsWith("553")) {
        // Adresse non valide
        return {
          passed: false,
          weight: 30,
          message: "Adresse non valide",
          detail: rcptResponse,
          code: "553",
        };
      } else if (rcptResponse.startsWith("452") || rcptResponse.startsWith("451")) {
        // Serveur temporairement indisponible
        return {
          passed: false,
          weight: 30,
          message: "Serveur temporairement indisponible",
          detail: rcptResponse,
          code: "452",
        };
      } else {
        // Statut incertain
        return {
          passed: false,
          weight: 30,
          message: "Statut incertain",
          detail: rcptResponse,
        };
      }
    } catch (error) {
      socket?.destroy();
      throw error;
    }
  } catch (error) {
    return {
      passed: false,
      weight: 30,
      message: "Erreur SMTP",
      detail: error instanceof Error ? error.message : "Erreur de connexion SMTP",
    };
  }
}
