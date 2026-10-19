/**
 * Access levels offered when creating a key.
 * Must mirror VALID_SCOPES (lib/auth/require-scope.ts).
 */
export const SCOPE_OPTIONS = [
  { value: "full", label: "Full access", description: "All API endpoints (default)" },
  { value: "read", label: "Read only", description: "Inspect history and results" },
  { value: "validate", label: "Validate only", description: "Run email validations" },
  { value: "export", label: "Export only", description: "Export validation results" },
] as const;

const SCOPE_LABELS: Record<string, string> = Object.fromEntries(
  SCOPE_OPTIONS.map((option) => [option.value, option.label]),
);

/** "full" → "Full access"; unknown values are kept as-is. */
export const formatScopes = (scopes: string): string =>
  scopes
    .split(",")
    .map((scope) => {
      const value = scope.trim();
      return SCOPE_LABELS[value] ?? value;
    })
    .join(", ");
