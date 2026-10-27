// File: mailguardpro-web/lib/emailSanitizer.ts
// Purpose: Email content sanitization for XSS and injection protection.
// Sanitization at render/export boundaries only. Storage remains untouched.
// EXCEPTION: bulkProcessor.ts sanitizes extra CSV fields (firstName, lastName, company)
// at write time because emailsJson is a JSON blob consumed by workers that cannot
// individually sanitize each consumer output path.

export function sanitizeEmailForDisplay(email: string): string {
  // Allow: letters, digits, @, ., +, _, -, !, #, $, %, &, ', *, /, =, ?, ^, `, {, |, }, ~
  // Deny: <, >, ", (, ), [, ], \, ;, comma, whitespace outside normal spaces
  return email.replace(/[<>"()\[\]\\;,]/g, "").trim();
}

export function sanitizeForHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Prefix values that spreadsheet software would treat as a formula. This is
 * safe to use with an encoder that handles CSV quoting itself (csv-stringify).
 */
export function neutralizeCsvFormula(value: string): string {
  // CSV injection vectors: =, +, -, @
  return /^[=+\-@\t\r\n]/.test(value) ? `'${value}` : value;
}

export function sanitizeForCsv(value: string): string {
  // Apply formula neutralization first, then quote the complete value. Doing
  // the checks separately would let a formula-leading value containing a comma
  // or newline break out of its CSV cell.
  const sanitized = neutralizeCsvFormula(value);
  if (/[,"\n\r]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

export function sanitizeForAttr(value: string): string {
  return value.replace(/["'<>`]/g, "");
}
