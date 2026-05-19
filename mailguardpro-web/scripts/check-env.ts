#!/usr/bin/env node

/**
 * Script de vérification des variables d'environnement
 * Usage: node scripts/check-env.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const requiredVars = [
  "DATABASE_URL",
  "REDIS_URL",
  "AUTH_SECRET",
  "AUTH_URL",
  "NEXT_PUBLIC_APP_URL",
];

const optionalVars = [
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "AUTH_RESEND_KEY",
  "RESEND_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_PUBLIC_KEY",
];

function loadEnv(filePath: string) {
  try {
    const content = readFileSync(filePath, "utf-8");
    const env: Record<string, string> = {};
    content.split("\n").forEach((line) => {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (match) {
        env[match[1]] = match[2];
      }
    });
    return env;
  } catch {
    return {};
  }
}

const env = loadEnv(resolve(process.cwd(), ".env"));

console.log("\n📋 Vérification des variables d'environnement\n");

let missingRequired = 0;

console.log("✅ Variables requises:");
requiredVars.forEach((v) => {
  if (env[v]) {
    console.log(`   ${v}: ${env[v].substring(0, 20)}...`);
  } else {
    console.log(`   ${v}: ❌ Manquante`);
    missingRequired++;
  }
});

console.log("\n📝 Variables optionnelles:");
optionalVars.forEach((v) => {
  if (env[v]) {
    console.log(`   ${v}: ✅ Configurée`);
  } else {
    console.log(`   ${v}: Non configurée (optionnel)`);
  }
});

if (missingRequired > 0) {
  console.log(`\n❌ Erreur: ${missingRequired} variable(s) requise(s) manquante(s)\n`);
  process.exit(1);
}

console.log("\n✅ Toutes les variables requises sont présentes\n");
