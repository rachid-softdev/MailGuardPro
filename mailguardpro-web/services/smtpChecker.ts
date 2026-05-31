// SMTP check - actual connection to mail server

import type { MxRecord } from "dns";
import dns from "dns/promises";
import net from "net";
import { SCORING_WEIGHTS } from "@/config/scoringWeights";
import { redis } from "@/lib/redis";
import { safeJsonParse } from "@/lib/safeJson";
import { validateResolvedIp } from "@/lib/ssrf";
import { CheckResult } from "./types";

interface SMTPResult extends CheckResult {
  code?: string;
}

/**
 * Normalize an IP address — handles IPv4-mapped IPv6 (::ffff:x.x.x.x → x.x.x.x).
 */
export function normalizeIp(ip: string): string {
  const v4MappedMatch = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  return v4MappedMatch ? v4MappedMatch[1] : ip;
}

/**
 * Connect to an already-resolved IP address with DNS rebinding protection.
 * Verifies that the socket's remoteAddress matches the expected IP after connection.
 */
export function connectWithResolvedIp(
  ip: string,
  port: number,
  timeout: number,
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);

    socket.on("connect", () => {
      const connectedIp = normalizeIp(socket.remoteAddress || "");
      if (connectedIp !== ip) {
        socket.destroy();
        reject(new Error(`DNS rebinding detected: connected to ${connectedIp}, expected ${ip}`));
        return;
      }
      resolve(socket);
    });
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("SMTP connection timeout"));
    });
    socket.on("error", reject);

    socket.connect(port, ip);
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

    socket.on("data", (chunk: Buffer) => {
      data += chunk.toString();
      // RFC 5321 §4.2 : la réponse se termine quand la dernière ligne complète
      // commence par un code 3 chiffres suivi d'un ESPACE.
      // Les lignes intermédiaires utilisent un tiret (250-SIZE...),
      // la dernière ligne utilise un espace (250 OK).
      const lines = data.split("\n");
      // Le dernier élément est la portion incomplète (ou "" si data finit par \n)
      if (lines.length >= 2) {
        const lastCompleteLine = lines[lines.length - 2];
        if (/^\d{3} /.test(lastCompleteLine)) {
          clearTimeout(timer);
          socket.removeAllListeners("data");
          resolve(data.trim());
        }
      }
    });
  });
}

// Anti-enumeration: random delay before SMTP check
function randomDelay(): Promise<void> {
  const ms = Math.floor(Math.random() * 400) + 100; // 100-500ms
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Cache SMTP result to Redis with TTL
async function cacheSmtpResult(email: string, result: SMTPResult): Promise<SMTPResult> {
  try {
    const cacheKey = `smtp:email:${email}`;
    await redis.setex(cacheKey, 3600, JSON.stringify(result));
  } catch (err) {
    console.warn("[SMTP] Failed to cache result:", err);
  }
  return result;
}

export async function checkSMTP(email: string, timeoutMs = 5000): Promise<SMTPResult> {
  const domain = email.split("@")[1];

  // Check Redis cache first (anti-enumeration)
  try {
    const cacheKey = `smtp:email:${email}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return safeJsonParse<SMTPResult>(cached);
    }
  } catch (err) {
    console.warn("[SMTP] Redis unavailable, proceeding without cache:", err);
  }

  // Anti-enumeration: random delay
  await randomDelay();

  try {
    // 1. Resolve MX records
    let mxRecords: MxRecord[] = [];
    try {
      mxRecords = await dns.resolveMx(domain);
    } catch {
      return await cacheSmtpResult(email, {
        passed: false,
        weight: SCORING_WEIGHTS.smtp.fail,
        message: "SMTP: domain not resolved",
        detail: "Unable to resolve MX records",
      });
    }

    if (!mxRecords || mxRecords.length === 0) {
      return await cacheSmtpResult(email, {
        passed: false,
        weight: SCORING_WEIGHTS.smtp.fail,
        message: "SMTP: no MX record",
        detail: "No MX server found for this domain",
      });
    }

    // Sort by priority
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
        return await cacheSmtpResult(email, {
          passed: false,
          weight: SCORING_WEIGHTS.smtp.fail,
          message: "SMTP: MX resolution failed",
          detail: `Unable to resolve IP address for ${mxHost}`,
        });
      }
    }

    if (resolvedIps.length === 0) {
      return await cacheSmtpResult(email, {
        passed: false,
        weight: SCORING_WEIGHTS.smtp.fail,
        message: "SMTP: no IP resolved",
        detail: `No IP address found for ${mxHost}`,
      });
    }

    // Validate each resolved IP
    for (const ip of resolvedIps) {
      const ipCheck = validateResolvedIp(ip);
      if (!ipCheck.valid) {
        return await cacheSmtpResult(email, {
          passed: false,
          weight: SCORING_WEIGHTS.smtp.fail,
          message: "SMTP: server not allowed",
          detail: ipCheck.error,
        });
      }
    }

    // 2. Try connecting on port 25 (and fallback 587), iterate IPs
    let socket: net.Socket | null = null;
    let lastError: Error | null = null;

    const ipsToTry = resolvedIps.slice(0, 2); // Limit to 2 IPs max to avoid timeout
    for (const ip of ipsToTry) {
      for (const port of [25, 587]) {
        try {
          socket = await connectWithResolvedIp(ip, port, timeoutMs);
          break;
        } catch (error) {
          lastError = error as Error;
          continue;
        }
      }
      if (socket) break;
    }

    if (!socket) {
      return await cacheSmtpResult(email, {
        passed: false,
        weight: SCORING_WEIGHTS.smtp.fail,
        message: "SMTP: connection failed",
        detail: `Unable to connect to mail server: ${lastError?.message}`,
      });
    }

    try {
      // 2.5 Consume SMTP server banner (RFC 5321 §3.1)
      const banner = await readResponse(socket, timeoutMs);
      if (!banner.startsWith("220")) {
        socket.destroy();
        return await cacheSmtpResult(email, {
          passed: false,
          weight: SCORING_WEIGHTS.smtp.fail,
          message: "SMTP: server refused connection",
          detail: `Non-220 banner received: ${banner}`,
        });
      }

      // 3. EHLO
      await sendCommand(socket, "EHLO mailguard.pro");
      await readResponse(socket, timeoutMs);

      // 4. MAIL FROM
      await sendCommand(socket, "MAIL FROM:<verify@mailguard.pro>");
      const mailResponse = await readResponse(socket, timeoutMs);

      // Verify sender is accepted by server
      if (!mailResponse.startsWith("250")) {
        return await cacheSmtpResult(email, {
          passed: false,
          weight: SCORING_WEIGHTS.smtp.fail,
          message: "SMTP: sender rejected",
          detail: mailResponse,
        });
      }

      // 5. RCPT TO (test the email)
      await sendCommand(socket, `RCPT TO:<${email}>`);
      const rcptResponse = await readResponse(socket, timeoutMs);

      // 6. Send QUIT
      await sendCommand(socket, "QUIT");
      socket.destroy();

      // Analyze the response
      if (rcptResponse.startsWith("250")) {
        // Server accepted the email
        return await cacheSmtpResult(email, {
          passed: true,
          weight: SCORING_WEIGHTS.smtp.pass,
          message: "Email deliverable",
          detail: "The server accepted the email for delivery",
          code: "250",
        });
      } else if (rcptResponse.startsWith("550")) {
        // Mailbox does not exist
        return await cacheSmtpResult(email, {
          passed: false,
          weight: SCORING_WEIGHTS.smtp.fail,
          message: "Mailbox does not exist",
          detail: rcptResponse,
          code: "550",
        });
      } else if (rcptResponse.startsWith("553")) {
        // Invalid address
        return await cacheSmtpResult(email, {
          passed: false,
          weight: SCORING_WEIGHTS.smtp.fail,
          message: "Invalid address",
          detail: rcptResponse,
          code: "553",
        });
      } else if (rcptResponse.startsWith("452") || rcptResponse.startsWith("451")) {
        // Temporarily unavailable
        return await cacheSmtpResult(email, {
          passed: false,
          weight: SCORING_WEIGHTS.smtp.fail,
          message: "Server temporarily unavailable",
          detail: rcptResponse,
          code: "452",
        });
      } else {
        // Uncertain status
        return await cacheSmtpResult(email, {
          passed: false,
          weight: SCORING_WEIGHTS.smtp.fail,
          message: "Uncertain status",
          detail: rcptResponse,
        });
      }
    } catch (error) {
      socket?.destroy();
      throw error;
    }
  } catch (error) {
    return await cacheSmtpResult(email, {
      passed: false,
      weight: SCORING_WEIGHTS.smtp.fail,
      message: "SMTP error",
      detail: error instanceof Error ? error.message : "SMTP connection error",
    });
  }
}
