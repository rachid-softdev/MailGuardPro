/**
 * generate-demo-video.ts — renders the MailGuard Pro landing demo video.
 *
 * Records the REAL product UI with Playwright (branded intro/outro cards,
 * landing page, validate, bulk, history) with deterministic API mocks, then
 * renders public/videos/demo.mp4 + a poster with ffmpeg.
 *
 * Prerequisites (run from mailguardpro-web/):
 *   npm run build
 *   # production server on :3001 (PowerShell example — use a valid throwaway key):
 *   $env:TOKEN_ENCRYPTION_KEY="<64 hex chars>"
 *   $env:API_KEY_PEPPER="demo-pepper"
 *   $env:APP_ORIGIN="http://localhost:3001"
 *   $env:AUTH_URL="http://localhost:3001"
 *   npm run start -- -p 3001
 *
 * Run:
 *   npm run demo:video
 *
 * Env:
 *   DEMO_BASE_URL       target URL                    (default http://localhost:3001)
 *   DEMO_OUT_DIR        render directory              (default ./demo-render)
 *   DEMO_SPEED          1 = real time, >1 = faster    (default 1)
 *   DEMO_SKIP_RENDER    1 = keep raw webms only       (debug)
 *   DEMO_SKIP_RECORD    1 = reuse existing webms      (debug)
 *   DEMO_POSTER_AT      poster timestamp in seconds   (default 1.2)
 *
 * The script mints a throwaway user + session directly in the database (no
 * auth bypass in the app) and deletes it when the recording is done.
 */

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { chromium, type Locator, type Page, type Route } from "@playwright/test";

const require = createRequire(import.meta.url);
require("dotenv/config");

const { PrismaClient } = require("@prisma/client") as typeof import("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg") as typeof import("@prisma/adapter-pg");
const pg = require("pg") as typeof import("pg");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ROOT = process.cwd();
const OUT_DIR = path.resolve(ROOT, process.env.DEMO_OUT_DIR ?? "demo-render");
const RAW_DIR = path.join(OUT_DIR, "raw");
const PUBLIC_VIDEOS = path.join(ROOT, "public", "videos");
const FINAL_MP4 = path.join(OUT_DIR, "demo.mp4");
const PUBLIC_MP4 = path.join(PUBLIC_VIDEOS, "demo.mp4");
const PUBLIC_POSTER = path.join(PUBLIC_VIDEOS, "demo-poster.jpg");

const BASE_URL = (process.env.DEMO_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const SPEED = Math.min(4, Math.max(0.25, Number.parseFloat(process.env.DEMO_SPEED ?? "1") || 1));
const SKIP_RENDER = process.env.DEMO_SKIP_RENDER === "1";
const SKIP_RECORD = process.env.DEMO_SKIP_RECORD === "1";
const POSTER_AT = Math.max(0, Number.parseFloat(process.env.DEMO_POSTER_AT ?? "1.2") || 1.2);

const VIEWPORT = { width: 1600, height: 900 };
// The landing <video> is 16:9; 1280x720 keeps the ratio with even dimensions.
const TARGET_W = 1280;
const TARGET_H = 720;

/** Scale every pause by DEMO_SPEED (t(1000) = 1s of screen time). */
const t = (ms: number): number => Math.round(ms / SPEED);
const hold = (page: Page, ms: number): Promise<void> => page.waitForTimeout(t(ms));

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

const BRAND = {
  introTagline: "Know which emails are <em>worth sending to.</em>",
  outroTagline: "Clean lists. Better deliverability. Happier senders.",
  outroCta: "Start free →",
  url: "mailguard.pro",
};

const CAPTIONS = {
  landing: "One quality score for every address — 0 to 100.",
  validate: "See exactly why an address is valid, risky, or dead.",
  bulk: "Upload a CSV — validate 100,000 addresses in the background.",
  bulkDone: "Live progress, then results you can ship.",
  history: "Search, filter, and export every result.",
};

const TYPED = {
  landing: "sophie.martin@acme-corp.com",
  validate: "james.carter@northwind.io",
};

// ---------------------------------------------------------------------------
// Deterministic API mocks
// ---------------------------------------------------------------------------

const SINGLE_VALIDATION = {
  success: true,
  data: {
    email: TYPED.validate,
    score: 94,
    status: "valid",
    checks: {
      format: { passed: true, message: "Valid syntax", detail: "Matches RFC 5322" },
      domain: {
        passed: true,
        message: "Domain resolves",
        detail: "northwind.io · registered 12 years ago",
      },
      mx: { passed: true, message: "MX records found", detail: "2 mail exchangers" },
      smtp: {
        passed: true,
        message: "Mailbox reachable",
        detail: "Mail server accepted the recipient",
      },
      disposable: {
        passed: true,
        message: "Not disposable",
        detail: "No throwaway provider match",
      },
      role: { passed: true, message: "Personal mailbox", detail: "Not a role-based address" },
      spamTrap: {
        passed: true,
        message: "No spam-trap signal",
        detail: "Clean reputation history",
      },
    },
    domain: { name: "northwind.io", reputation: "excellent" },
  },
};

const BULK_UPLOAD = {
  success: true,
  data: { jobId: "job-demo-001", totalEmails: 12480 },
};

const BULK_STATUS_STEPS = [
  { status: "PENDING", processed: 0 },
  { status: "PROCESSING", processed: 3120 },
  { status: "PROCESSING", processed: 7800 },
  { status: "PROCESSING", processed: 10600 },
  { status: "COMPLETED", processed: 12480 },
] as const;

const CSV_SAMPLE = [
  "email,firstName,lastName,company",
  "sophie.martin@acme-corp.com,Sophie,Martin,Acme Corp",
  "james.carter@northwind.io,James,Carter,Northwind",
  "emily.ross@brightlabs.dev,Emily,Ross,Bright Labs",
  "michael.lee@vertexhq.com,Michael,Lee,Vertex HQ",
  "anna.schmidt@lumenmail.de,Anna,Schmidt,Lumen Mail",
  "david.kim@orbitalworks.io,David,Kim,Orbital Works",
  "charlotte.dubois@maisonvert.fr,Charlotte,Dubois,Maison Vert",
  "noah.williams@stackforge.dev,Noah,Williams,StackForge",
].join("\n");

const EXISTING_JOBS = [
  {
    id: "job-demo-old",
    filename: "newsletter-spring.csv",
    status: "COMPLETED",
    totalEmails: 4210,
    processed: 4210,
    createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    completedAt: new Date(Date.now() - 2 * 86_400_000 + 240_000).toISOString(),
  },
];

const HISTORY_ROWS = [
  ["sophie.martin@acme-corp.com", 92, "valid", 0.4],
  ["james.carter@northwind.io", 94, "valid", 1.1],
  ["emily.ross@brightlabs.dev", 88, "valid", 2.2],
  ["michael.lee@vertexhq.com", 84, "valid", 3.6],
  ["anna.schmidt@lumenmail.de", 79, "risky", 5.1],
  ["david.kim@orbitalworks.io", 76, "risky", 7.4],
  ["charlotte.dubois@maisonvert.fr", 61, "risky", 9.2],
  ["noah.williams@stackforge.dev", 58, "risky", 11.8],
  ["olivia.brown@example.net", 34, "invalid", 14.5],
  ["liam@mailinator.com", 12, "invalid", 18.3],
  ["ava.patel@pixelworks.co", 90, "valid", 22.7],
  ["ethan.garcia@datacrest.com", 87, "valid", 27.4],
  ["mia.anderson@cloudnine.app", 55, "risky", 31.9],
  ["lucas.bernard@atelier-nord.fr", 95, "valid", 36.2],
].map(([email, score, status, hoursAgo], i) => ({
  id: `val-demo-${i}`,
  email: email as string,
  score: score as number,
  status: status as string,
  createdAt: new Date(Date.now() - (hoursAgo as number) * 3_600_000).toISOString(),
}));

const HISTORY_RESPONSE = {
  success: true,
  data: HISTORY_ROWS,
  meta: { pagination: { page: 1, limit: 20, total: 2541, totalPages: 128 } },
};

const CSV_EXPORT = [
  "email,score,status,domain,createdAt",
  ...HISTORY_ROWS.map(
    (r) => `${r.email},${r.score},${r.status},${r.email.split("@")[1]},${r.createdAt}`,
  ),
].join("\n");

// ---------------------------------------------------------------------------
// Mock installation (one dispatcher for every /api/v1 call)
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function installMocks(page: Page) {
  let statusIndex = 0;

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();

    // Single validation (dashboard /validate)
    if (pathname === "/api/v1/validate" && method === "GET") {
      await sleep(1100);
      return fulfillJson(route, SINGLE_VALIDATION);
    }

    // CSV upload (dashboard /bulk)
    if (pathname === "/api/v1/validate/bulk" && method === "POST") {
      await sleep(900);
      return fulfillJson(route, BULK_UPLOAD);
    }

    // Job list (dashboard /bulk mount)
    if (pathname === "/api/v1/bulk" && method === "GET") {
      await sleep(350);
      return fulfillJson(route, { data: EXISTING_JOBS });
    }

    // Job status polling — progressive on each call
    if (pathname.startsWith("/api/v1/bulk/") && pathname.endsWith("/status") && method === "GET") {
      const step = BULK_STATUS_STEPS[Math.min(statusIndex, BULK_STATUS_STEPS.length - 1)];
      statusIndex += 1;
      return fulfillJson(route, {
        success: true,
        data: {
          id: "job-demo-001",
          ...step,
          completedAt: step.status === "COMPLETED" ? new Date().toISOString() : undefined,
        },
      });
    }

    // Validation history (dashboard /history)
    if (pathname === "/api/v1/validations" && method === "GET") {
      await sleep(450);
      return fulfillJson(route, HISTORY_RESPONSE);
    }

    // Export download
    if (pathname === "/api/v1/exports" && method === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "text/csv; charset=utf-8",
        body: CSV_EXPORT,
      });
    }

    // Scheduled exports panel
    if (pathname === "/api/v1/exports" && method === "GET") {
      return fulfillJson(route, { data: [] });
    }

    return route.continue();
  });
}

// ---------------------------------------------------------------------------
// Cursor + caption overlay (injected into every recorded document)
// ---------------------------------------------------------------------------

const CURSOR_SCRIPT = `
(function () {
  if (window.__mgDemo) return;
  window.__mgDemo = true;
  var ARROW = '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="38" viewBox="0 0 22 28">' +
    '<path d="M0 0 L0 28 L7.5 20.5 L12 27.5 L15 25.5 L10.5 19.5 L22 19.5 L22 11.5 Z" ' +
    'fill="#fff" stroke="#0b0b0f" stroke-width="1.3" stroke-linejoin="round"/></svg>';
  var HAND = '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="36" viewBox="0 0 28 34">' +
    '<g fill="#fff" stroke="#0b0b0f" stroke-width="1.2" stroke-linejoin="round">' +
    '<path d="M10 2.5h5a2.2 2.2 0 0 1 2.2 2.2v7H7.8v-7A2.2 2.2 0 0 1 10 2.5Z"/>' +
    '<path d="M7.8 11.8 3.6 9.6A2.1 2.1 0 0 0 .7 12.5l3.3 6.4 3.8-3.5Z"/>' +
    '<path d="M7.8 11.5h11.2l1.6 5.2a5.6 5.6 0 0 1-5.4 7H11a6.2 6.2 0 0 1-5.2-3L3.9 18l3.9-3.6Z"/>' +
    '</g></svg>';
  var IBEAM = '<svg xmlns="http://www.w3.org/2000/svg" width="9" height="24" viewBox="0 0 9 24">' +
    '<rect x="1.5" y="0.5" width="6" height="23" rx="3" fill="#fff" stroke="#0b0b0f" stroke-width="1.2"/></svg>';
  var HAND_SEL = "a, button, [role='button'], [onclick]";
  var TEXT_SEL = "input, textarea, select";

  function mount() {
    var style = document.createElement("style");
    style.textContent = [
      "* { cursor: none !important; }",
      "#mg-demo-cursor { position: fixed; left: 0; top: 0; pointer-events: none;",
      "  z-index: 2147483647; filter: drop-shadow(0 2px 4px rgba(0,0,0,.45));",
      "  opacity: 0; will-change: left, top; }",
      "#mg-demo-cursor svg { display: block; }",
      "#mg-demo-cursor .ring { position: absolute; left: 0; top: 0; width: 20px; height: 20px;",
      "  margin: -10px 0 0 -10px; border-radius: 50%; border: 2px solid #00a36c;",
      "  background: rgba(0,163,108,.22); opacity: 0; transform: scale(.35); }",
      "#mg-demo-cursor.pressing svg { transform: scale(.88); transform-origin: 0 0; }",
      "#mg-demo-cursor.clicking .ring { animation: mg-cursor-ring .45s ease-out forwards; }",
      "@keyframes mg-cursor-ring {",
      "  0% { opacity: .95; transform: scale(.35); }",
      "  100% { opacity: 0; transform: scale(1.7); }",
      "}",
      "#mg-demo-caption { position: fixed; left: 50%; bottom: 28px;",
      "  transform: translateX(-50%) translateY(10px); max-width: 900px; text-align: center;",
      "  padding: 14px 30px; border-radius: 999px; background: rgba(12,14,12,.94);",
      "  border: 1px solid rgba(0,163,108,.45); color: #fff;",
      "  font: 600 18px/1.35 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;",
      "  box-shadow: 0 14px 44px rgba(0,0,0,.45); z-index: 2147483646; opacity: 0;",
      "  transition: opacity .35s ease, transform .35s ease; pointer-events: none; }",
      "#mg-demo-caption.visible { opacity: 1; transform: translateX(-50%) translateY(0); }",
    ].join("\\n");
    document.head.appendChild(style);

    var cursorEl = document.createElement("div");
    cursorEl.id = "mg-demo-cursor";
    cursorEl.innerHTML = '<span class="ring"></span>' + ARROW;
    document.body.appendChild(cursorEl);

    cursorEl.addEventListener("animationend", function () {
      cursorEl.classList.remove("clicking");
    });

    function setMode(mode) {
      if (cursorEl.dataset.mode === mode) return;
      cursorEl.dataset.mode = mode;
      var svg = cursorEl.querySelector("svg");
      if (svg) svg.outerHTML = mode === "hand" ? HAND : mode === "ibeam" ? IBEAM : ARROW;
    }

    document.addEventListener("mousemove", function (e) {
      cursorEl.style.left = e.clientX + "px";
      cursorEl.style.top = e.clientY + "px";
      cursorEl.style.opacity = "1";
      var under = document.elementFromPoint(e.clientX, e.clientY);
      if (under && under.closest(TEXT_SEL)) setMode("ibeam");
      else if (under && under.closest(HAND_SEL)) setMode("hand");
      else setMode("arrow");
    }, { passive: true });

    document.addEventListener("mousedown", function () {
      cursorEl.classList.add("pressing");
    }, { passive: true });

    document.addEventListener("mouseup", function () {
      cursorEl.classList.remove("pressing");
      cursorEl.classList.remove("clicking");
      void cursorEl.offsetWidth;
      cursorEl.classList.add("clicking");
    }, { passive: true });

    window.__showCaption = function (text, holdMs) {
      var el = document.getElementById("mg-demo-caption");
      if (!el) {
        el = document.createElement("div");
        el.id = "mg-demo-caption";
        document.body.appendChild(el);
      }
      el.textContent = text;
      void el.offsetWidth;
      el.classList.add("visible");
      if (el.__mgTimer) clearTimeout(el.__mgTimer);
      el.__mgTimer = setTimeout(function () {
        el.classList.remove("visible");
      }, typeof holdMs === "number" ? holdMs : 3200);
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
`;

async function ensureOverlays(page: Page) {
  await page.waitForFunction(() => !!document.body, null, { timeout: 15_000 });
  await page.waitForFunction(() => !!document.getElementById("mg-demo-cursor"), null, {
    timeout: 15_000,
  });
}

async function waitForFonts(page: Page) {
  await page
    .evaluate(async () => {
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 4000)),
      ]);
    })
    .catch(() => {});
}

async function caption(page: Page, text: string, ms = 3200) {
  await page.evaluate(
    (p: { text: string; holdMs: number }) => {
      (
        window as unknown as { __showCaption?: (text: string, holdMs?: number) => void }
      ).__showCaption?.(p.text, p.holdMs);
    },
    { text, holdMs: ms },
  );
}

// ---------------------------------------------------------------------------
// Eased cursor movement (real mouse events → the injected overlay follows)
// ---------------------------------------------------------------------------

let cursorPos = { x: Math.round(VIEWPORT.width / 2), y: Math.round(VIEWPORT.height / 2) };

function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

async function moveCursor(page: Page, to: { x: number; y: number }, duration = 700): Promise<void> {
  const from = { ...cursorPos };
  const steps = Math.max(10, Math.min(34, Math.round(duration / 26)));
  for (let i = 1; i <= steps; i++) {
    const p = easeInOutCubic(i / steps);
    const x = Math.round(from.x + (to.x - from.x) * p);
    const y = Math.round(from.y + (to.y - from.y) * p);
    await page.mouse.move(x, y);
    await page.waitForTimeout(Math.max(5, t(Math.round(duration / steps))));
  }
  cursorPos = to;
}

async function glideTo(page: Page, locator: Locator, duration = 700) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Locator has no bounding box (not visible?)");
  const target = {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };
  await moveCursor(page, target, duration);
  return target;
}

async function clickHere(page: Page) {
  await page.mouse.click(cursorPos.x, cursorPos.y);
}

// ---------------------------------------------------------------------------
// Branded intro / outro cards
// ---------------------------------------------------------------------------

function brandCard(opts: { tagline: string; cta?: string; url: string }): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>MailGuard Pro</title>
<style>
  @import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Syne:wght@600;700;800&display=swap");
  html, body { margin: 0; height: 100%; background: #f5f5f4; overflow: hidden; }
  .wrap { height: 100vh; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 18px; position: relative;
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  .grid { position: absolute; inset: 0;
    background-image: linear-gradient(rgba(17,17,16,.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(17,17,16,.05) 1px, transparent 1px);
    background-size: 56px 56px;
    -webkit-mask-image: radial-gradient(closest-side at 50% 50%, #000 18%, transparent 78%);
    mask-image: radial-gradient(closest-side at 50% 50%, #000 18%, transparent 78%); }
  .glow { position: absolute; left: 50%; top: 46%; width: 1080px; height: 620px;
    transform: translate(-50%, -50%);
    background: radial-gradient(closest-side, rgba(0,163,108,.17), rgba(0,163,108,0) 72%); }
  .logo { width: 96px; height: 96px; border-radius: 26px; background: #00a36c;
    display: flex; align-items: center; justify-content: center; position: relative;
    box-shadow: 0 22px 60px rgba(0,163,108,.35); animation: up .7s ease-out both; }
  h1 { color: #111110; font-family: 'Syne', 'Plus Jakarta Sans', sans-serif; font-size: 56px;
    font-weight: 800; margin: 0; letter-spacing: -1.2px; position: relative;
    animation: up .7s .1s ease-out both; }
  p { color: #6b6860; font-size: 22px; margin: 0; max-width: 780px; text-align: center;
    line-height: 1.45; position: relative; animation: up .7s .22s ease-out both; }
  p em { font-style: normal; color: #00a36c; }
  .cta { margin-top: 6px; background: #00a36c; color: #fff; font-size: 19px; font-weight: 800;
    padding: 15px 36px; border-radius: 999px; position: relative;
    box-shadow: 0 12px 44px rgba(0,163,108,.32); animation: up .7s .3s ease-out both; }
  .url { color: #79766e; font-size: 15px; letter-spacing: .5px; position: relative;
    animation: up .7s .4s ease-out both; }
  @keyframes up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
</style></head>
<body><div class="wrap">
  <div class="grid"></div>
  <div class="glow"></div>
  <div class="logo">
    <svg width="52" height="52" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 5l15 6v11c0 10-6.3 17.6-15 21-8.7-3.4-15-11-15-21V11l15-6z"
        stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
      <path d="M16.5 23.5l5.2 5.2 10-10.5" stroke="#fff" stroke-width="3"
        stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </div>
  <h1>MailGuard Pro</h1>
  <p>${opts.tagline}</p>
  ${opts.cta ? `<div class="cta">${opts.cta}</div>` : ""}
  <div class="url">${opts.url}</div>
</div></body></html>`;
}

// ---------------------------------------------------------------------------
// Throwaway demo user + session (real DB row, no app bypass)
// ---------------------------------------------------------------------------

async function createDemoSession(pool: InstanceType<typeof pg.Pool>) {
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const now = new Date();
  const user = await prisma.user.create({
    data: {
      email: `demo-video-${Date.now()}@mailguardpro.test`,
      name: "Alex Morgan",
      emailVerified: now,
      credits: 486,
    },
  });
  const sessionToken = `demo-video-${randomUUID()}`;
  await prisma.session.create({
    data: {
      sessionToken,
      userId: user.id,
      expires: new Date(Date.now() + 86_400_000),
      twoFactorVerifiedAt: now,
    },
  });
  return { prisma, user, sessionToken };
}

async function cleanupDemoSession(
  prisma: InstanceType<typeof PrismaClient>,
  userId: string,
): Promise<void> {
  await prisma.auditLog.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
}

function sessionCookie(token: string) {
  return {
    name: "next-auth.session-token",
    value: token,
    domain: "localhost",
    path: "/",
    httpOnly: true,
    sameSite: "Lax" as const,
  };
}

/**
 * Warm up the route chunks before recording so the first page load never
 * films a streaming/loading state (prod server cold start).
 */
async function warmUpRoutes(sessionToken: string): Promise<void> {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: "light" });
  try {
    await context.addCookies([sessionCookie(sessionToken)]);
    const page = await context.newPage();
    for (const route of ["/", "/validate", "/bulk", "/history"]) {
      const started = Date.now();
      try {
        await page.goto(`${BASE_URL}${route}`, {
          waitUntil: "domcontentloaded",
          timeout: 120_000,
        });
        await page.waitForTimeout(700);
        console.log(`  warm-up ok: ${route} (${Date.now() - started}ms)`);
      } catch (err) {
        console.warn(`  warm-up miss: ${route} —`, String(err).slice(0, 160));
      }
    }
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Storyboard
// ---------------------------------------------------------------------------

async function recordStoryboard(sessionToken: string): Promise<{ main: string; outro: string }> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    locale: "en-US",
    colorScheme: "light",
    recordVideo: { dir: RAW_DIR, size: VIEWPORT },
    acceptDownloads: true,
  });

  const errors: string[] = [];
  const startedAt = Date.now();
  const mark = (label: string) =>
    console.log(`  [${((Date.now() - startedAt) / 1000).toFixed(1)}s] ${label}`);
  try {
    await context.addCookies([sessionCookie(sessionToken)]);
    await context.addInitScript({ content: CURSOR_SCRIPT });
    await context.addInitScript({
      content: `
        try { sessionStorage.setItem('mg-landing-variant', 'A'); } catch (e) {}
        try { localStorage.setItem('mg-theme', 'light'); } catch (e) {}
      `,
    });

    const page = await context.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(String(err)));
    await installMocks(page);

    const mainVideo = page.video();

    // -- Scene 0: branded intro card -----------------------------------------
    await page.setContent(brandCard({ tagline: BRAND.introTagline, url: BRAND.url }), {
      waitUntil: "domcontentloaded",
    });
    await waitForFonts(page);
    await hold(page, 2200);
    mark("intro card done");

    // -- Scene 1: landing page + interactive EmailDemo ------------------------
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.locator("h1").first().waitFor({ state: "visible", timeout: 60_000 });
    await ensureOverlays(page);
    await waitForFonts(page);
    await hold(page, 550);
    mark("landing loaded");
    await caption(page, CAPTIONS.landing, 4400);
    await hold(page, 350);

    const demoInput = page.locator('input[placeholder="Enter an email address"]').first();
    await glideTo(page, demoInput, 600);
    await clickHere(page);
    await hold(page, 220);
    await page.keyboard.press("Control+A");
    await hold(page, 140);
    await page.keyboard.type(TYPED.landing, { delay: t(26) });
    await hold(page, 300);

    // Force a deterministic, high-quality result (86 → valid) without
    // touching any other part of the app.
    await page.evaluate(() => {
      const w = window as unknown as { __mgOrigRandom?: () => number };
      w.__mgOrigRandom = Math.random;
      Math.random = () => 0.62;
    });

    const analyze = page.getByRole("button", { name: "Analyze", exact: true }).first();
    await glideTo(page, analyze, 450);
    await clickHere(page);
    await hold(page, 1500);

    const landingScore = page.locator('[aria-label^="Email quality score:"]').first();
    await landingScore.waitFor({ state: "visible", timeout: 15_000 });
    await page.evaluate(() => {
      const w = window as unknown as { __mgOrigRandom?: () => number };
      if (w.__mgOrigRandom) Math.random = w.__mgOrigRandom;
    });
    await hold(page, 450);
    // The hero demo card sits low in the viewport — nudge it up so the score
    // and the full checks list are on camera.
    await page.mouse.wheel(0, 280);
    await hold(page, 450);
    await glideTo(page, landingScore, 550);
    await hold(page, 850);

    const lastDemoCheck = page.getByText("Spam Trap", { exact: true }).first();
    await glideTo(page, lastDemoCheck, 500);
    await hold(page, 750);
    await page.mouse.wheel(0, -280);
    await hold(page, 500);
    mark("landing scene done");

    // -- Scene 2: single validation ------------------------------------------
    const validateCta = page.getByRole("link", { name: "Try it now" }).first();
    await glideTo(page, validateCta, 600);
    await clickHere(page);

    const validateInput = page.locator('input[placeholder="Enter an email address..."]');
    await validateInput.waitFor({ state: "visible", timeout: 60_000 });
    await ensureOverlays(page);
    await waitForFonts(page);
    await hold(page, 420);
    mark("validate ready");
    await caption(page, CAPTIONS.validate, 4400);
    await hold(page, 260);

    await glideTo(page, validateInput, 500);
    await clickHere(page);
    await hold(page, 200);
    await page.keyboard.type(TYPED.validate, { delay: t(24) });

    await page.getByText("Validation Details").waitFor({ state: "visible", timeout: 20_000 });
    await hold(page, 550);

    const bigScore = page.locator('[aria-label^="Email quality score: 94"]').first();
    await glideTo(page, bigScore, 550);
    await hold(page, 850);

    const lastCheck = page.getByText("spamTrap", { exact: true }).first();
    await glideTo(page, lastCheck, 550);
    await hold(page, 650);
    mark("validate scene done");

    // -- Scene 3: bulk CSV upload + live progress ----------------------------
    const bulkNav = page.locator('aside a[href="/bulk"]');
    await glideTo(page, bulkNav, 600);
    await clickHere(page);

    await page
      .getByRole("heading", { name: "Bulk Validation" })
      .waitFor({ state: "visible", timeout: 60_000 });
    await ensureOverlays(page);
    await waitForFonts(page);
    await hold(page, 480);
    mark("bulk ready");
    await caption(page, CAPTIONS.bulk, 4600);
    await hold(page, 260);

    const selectCsv = page.getByRole("button", { name: "Select CSV File" });
    await glideTo(page, selectCsv, 550);
    await hold(page, 220);

    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), clickHere(page)]);
    await chooser.setFiles({
      name: "acme-customers-q3.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(CSV_SAMPLE, "utf8"),
    });

    await page.getByText("12,480 / 12,480").waitFor({ state: "visible", timeout: 45_000 });
    await hold(page, 500);
    await caption(page, CAPTIONS.bulkDone, 2800);

    const viewResults = page.getByText("View Results", { exact: true }).first();
    await glideTo(page, viewResults, 600);
    await hold(page, 900);
    mark("bulk scene done");

    // -- Scene 4: history + export -------------------------------------------
    const historyNav = page.locator('aside a[href="/history"]');
    await glideTo(page, historyNav, 600);
    await clickHere(page);

    await page
      .getByRole("heading", { name: "Validation History" })
      .waitFor({ state: "visible", timeout: 60_000 });
    await page.getByText("sophie.martin@acme-corp.com", { exact: true }).first().waitFor({
      state: "visible",
      timeout: 20_000,
    });
    await ensureOverlays(page);
    await waitForFonts(page);
    await hold(page, 450);
    mark("history ready");
    await caption(page, CAPTIONS.history, 3800);
    await hold(page, 260);

    const rows = page.locator("tbody tr");
    await glideTo(page, rows.nth(0), 450);
    await hold(page, 360);
    await glideTo(page, rows.nth(3), 450);
    await hold(page, 420);

    const exportButton = page.getByRole("button", { name: "Export", exact: true });
    await glideTo(page, exportButton, 550);
    await clickHere(page);
    await page.locator("#export-menu").waitFor({ state: "visible", timeout: 5_000 });
    await hold(page, 520);

    const exportCsv = page.getByRole("menuitem", { name: "Export as CSV" });
    await glideTo(page, exportCsv, 420);
    await hold(page, 240);
    await clickHere(page);
    await hold(page, 1500);
    mark("history scene done");

    await page.close();
    const mainWebm = path.join(RAW_DIR, "web-main.webm");
    await mainVideo?.saveAs(mainWebm);
    mark("main webm saved");

    // -- Scene 5: outro card --------------------------------------------------
    const outroPage = await context.newPage();
    const outroVideo = outroPage.video();
    await outroPage.setContent(
      brandCard({ tagline: BRAND.outroTagline, cta: BRAND.outroCta, url: BRAND.url }),
      { waitUntil: "domcontentloaded" },
    );
    await waitForFonts(outroPage);
    await outroPage.waitForTimeout(t(2600));
    await outroPage.close();
    const outroWebm = path.join(RAW_DIR, "web-outro.webm");
    await outroVideo?.saveAs(outroWebm);

    if (errors.length > 0) {
      console.log(`\nCaptured ${errors.length} console error(s) during recording:`);
      for (const e of errors.slice(0, 8)) console.log("  -", e.slice(0, 220));
    }

    return { main: mainWebm, outro: outroWebm };
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// ffmpeg rendering
// ---------------------------------------------------------------------------

function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

function probeDuration(file: string): number {
  const out = execSync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${toPosix(file)}"`,
  )
    .toString()
    .trim();
  const value = Number.parseFloat(out);
  if (!Number.isFinite(value)) throw new Error(`Could not probe duration of ${file}`);
  return value;
}

function renderSegment(
  webm: string,
  mp4: string,
  opts: { fadeIn?: boolean; fadeOut?: boolean },
): void {
  const duration = probeDuration(webm);
  const filters = [
    `scale=${TARGET_W}:${TARGET_H}:flags=lanczos`,
    "setsar=1",
    "fps=30",
    "format=yuv420p",
  ];
  if (opts.fadeIn) filters.push("fade=t=in:st=0:d=0.35");
  if (opts.fadeOut) filters.push(`fade=t=out:st=${Math.max(0, duration - 0.45).toFixed(2)}:d=0.45`);
  const cmd =
    `ffmpeg -y -i "${toPosix(webm)}" -vf "${filters.join(",")}" ` +
    `-c:v libx264 -preset slow -crf 20 -movflags +faststart -an "${toPosix(mp4)}"`;
  execSync(cmd, { stdio: "inherit" });
}

function concatSegments(segments: string[], out: string): void {
  const listPath = path.join(OUT_DIR, "concat.txt");
  fs.writeFileSync(listPath, segments.map((s) => `file '${toPosix(s)}'`).join("\n"));
  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${toPosix(listPath)}" -c copy -movflags +faststart "${toPosix(out)}"`,
    { stdio: "inherit" },
  );
}

function renderPoster(mp4: string, out: string): void {
  execSync(
    `ffmpeg -y -ss ${POSTER_AT.toFixed(2)} -i "${toPosix(mp4)}" -frames:v 1 -q:v 3 "${toPosix(out)}"`,
    { stdio: "inherit" },
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function checkServer(): Promise<void> {
  try {
    const res = await fetch(BASE_URL, { method: "HEAD" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    throw new Error(
      `Server not reachable at ${BASE_URL} (${String(err)}).\n` +
        `Build and start it first:\n` +
        `  npm run build\n` +
        `  $env:APP_ORIGIN="${BASE_URL}"; $env:AUTH_URL="${BASE_URL}"\n` +
        `  npm run start -- -p 3001`,
    );
  }
}

async function main() {
  if (!fs.existsSync(path.join(ROOT, "app"))) {
    throw new Error("Run this script from mailguardpro-web/ (app/ not found)");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing — check mailguardpro-web/.env");
  }

  fs.mkdirSync(RAW_DIR, { recursive: true });
  fs.mkdirSync(PUBLIC_VIDEOS, { recursive: true });
  for (const f of fs.readdirSync(RAW_DIR)) {
    if (f.endsWith(".webm")) fs.rmSync(path.join(RAW_DIR, f), { force: true });
  }

  console.log(`MailGuard Pro demo video — base=${BASE_URL} out=${OUT_DIR}`);
  console.log("Checking server...");
  await checkServer();

  let pool: InstanceType<typeof pg.Pool> | undefined;
  let demo: Awaited<ReturnType<typeof createDemoSession>> | undefined;

  try {
    let storyboard: { main: string; outro: string };
    if (SKIP_RECORD) {
      storyboard = {
        main: path.join(RAW_DIR, "web-main.webm"),
        outro: path.join(RAW_DIR, "web-outro.webm"),
      };
      for (const file of [storyboard.main, storyboard.outro]) {
        if (!fs.existsSync(file)) {
          throw new Error(`DEMO_SKIP_RECORD=1 but ${file} is missing`);
        }
      }
      console.log("Recording skipped (DEMO_SKIP_RECORD=1) — reusing existing webms.");
    } else {
      pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
      demo = await createDemoSession(pool);
      console.log(`Demo session ready for ${demo.user.email}`);

      console.log("Warming up routes...");
      await warmUpRoutes(demo.sessionToken);

      console.log("Recording storyboard (landing → validate → bulk → history)...");
      storyboard = await recordStoryboard(demo.sessionToken);
      console.log(`  recorded: ${path.basename(storyboard.main)}`);
    }

    if (SKIP_RENDER) {
      console.log("\nDEMO_SKIP_RENDER=1 — raw webms kept, skipping ffmpeg.");
      return;
    }

    console.log("\nRendering segments (1280x720 H.264)...");
    const segMain = path.join(OUT_DIR, "seg-main.mp4");
    const segOutro = path.join(OUT_DIR, "seg-outro.mp4");
    renderSegment(storyboard.main, segMain, { fadeIn: true, fadeOut: true });
    renderSegment(storyboard.outro, segOutro, { fadeIn: true, fadeOut: true });

    console.log("Concatenating final video...");
    concatSegments([segMain, segOutro], FINAL_MP4);

    const sizeMb = (fs.statSync(FINAL_MP4).size / 1024 / 1024).toFixed(1);
    const duration = probeDuration(FINAL_MP4).toFixed(1);
    console.log(`\nDone → ${FINAL_MP4} (${sizeMb} MB, ${duration}s, ${TARGET_W}x${TARGET_H})`);

    fs.copyFileSync(FINAL_MP4, PUBLIC_MP4);
    renderPoster(PUBLIC_MP4, PUBLIC_POSTER);
    console.log(`Copied → ${PUBLIC_MP4}`);
    console.log(`Poster → ${PUBLIC_POSTER}`);
  } finally {
    if (demo) await cleanupDemoSession(demo.prisma, demo.user.id);
    if (demo) await demo.prisma.$disconnect().catch(() => {});
    if (pool) await pool.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error("Demo video generation failed:", err);
  process.exit(1);
});
