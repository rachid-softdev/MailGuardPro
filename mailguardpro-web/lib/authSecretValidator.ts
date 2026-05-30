// File: mailguardpro-web/lib/authSecretValidator.ts
// Purpose: AUTH_SECRET startup validation

export const AUTH_SECRET_MIN_LENGTH = 32;

export interface AuthSecretValidationResult {
  valid: boolean;
  message: string;
}

export function validateAuthSecret(): AuthSecretValidationResult {
  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    return {
      valid: false,
      message: "AUTH_SECRET is not defined. " + "Generate one with: openssl rand -base64 32",
    };
  }

  if (secret.length < AUTH_SECRET_MIN_LENGTH) {
    return {
      valid: false,
      message:
        `AUTH_SECRET must be at least ${AUTH_SECRET_MIN_LENGTH} characters long. ` +
        `Current length: ${secret.length}. ` +
        "Generate one with: openssl rand -base64 32",
    };
  }

  const weakSecrets = [
    "your-secret-key-min-32-characters-long",
    "change-me-to-a-random-secret",
    "secret",
    "password",
    "dev-secret-change-in-production-min-32-chars-long",
  ];
  if (weakSecrets.includes(secret.toLowerCase().trim())) {
    return {
      valid: false,
      message: "AUTH_SECRET is set to a known weak/default value. Generate a unique secret.",
    };
  }

  return { valid: true, message: "AUTH_SECRET is properly configured" };
}
