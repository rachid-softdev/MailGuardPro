/**
 * Scope-based authorization for API keys.
 *
 * Hierarchy: full ⊃ { read, validate, export }
 * Stored as comma-separated values: "full" or "validate,export"
 */

export const SCOPE_HIERARCHY: Record<string, string[]> = {
  full: ["full", "read", "validate", "export"],
  read: ["read"],
  validate: ["validate"],
  export: ["export"],
};

export type Scope = keyof typeof SCOPE_HIERARCHY;

export const VALID_SCOPES: Scope[] = ["full", "read", "validate", "export"];

/**
 * Check if a comma-separated scope string satisfies a required scope.
 *
 * Examples:
 *   hasScope("full", "validate")          → true
 *   hasScope("read", "export")            → false
 *   hasScope("validate,export", "validate") → true
 *   hasScope("", "validate")              → false
 */
export function hasScope(keyScopes: string, requiredScope: string): boolean {
  if (!keyScopes) return false;
  return keyScopes
    .split(",")
    .map((s) => s.trim())
    .some((assigned) => {
      const granted = SCOPE_HIERARCHY[assigned];
      return granted ? granted.includes(requiredScope) : assigned === requiredScope;
    });
}
