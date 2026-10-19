-- Two-factor authentication (TOTP, RFC 6238).
--
-- User.twoFactorSecret stores the base32 secret encrypted at rest with
-- AES-256-GCM (lib/crypto.ts encryptToken, TOKEN_ENCRYPTION_KEY).
-- User.twoFactorRecoveryCodes stores a JSON array of sha256 hashes of one-time
-- recovery codes (the codes themselves are shown only once, at enrollment).
-- Session.twoFactorVerifiedAt marks the device (session) that passed the TOTP
-- challenge: sessions of 2FA-enabled users resolve as unauthenticated until
-- this timestamp is set (see the session callback in lib/auth.ts).
ALTER TABLE "User" ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "twoFactorSecret" TEXT;
ALTER TABLE "User" ADD COLUMN "twoFactorRecoveryCodes" TEXT;
ALTER TABLE "Session" ADD COLUMN "twoFactorVerifiedAt" TIMESTAMP(3);
