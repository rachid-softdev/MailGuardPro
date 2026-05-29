/**
 * Safe JSON.parse that rejects prototype pollution attempts.
 *
 * Use this instead of JSON.parse() when parsing untrusted data,
 * particularly from Redis or external sources.
 *
 * Protects against __proto__, constructor, and prototype manipulation
 * that could lead to Object.prototype pollution.
 */

export function safeJsonParse<T = unknown>(text: string): T {
  return JSON.parse(text, (key: string, value: unknown) => {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      throw new Error("Prototype pollution attempt detected in JSON data");
    }
    return value;
  }) as T;
}
