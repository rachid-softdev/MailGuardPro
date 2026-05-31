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

export function sanitizeForCsv(value: string): string {
  // CSV injection vectors: =, +, -, @
  if (/^[=+\-@\t\r\n]/.test(value)) {
    return `'${value}`;
  }
  // If value contains comma, newline, or quote, wrap in quotes
  if (/[,"\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function sanitizeForAttr(value: string): string {
  return value.replace(/["'<>`]/g, "");
}
