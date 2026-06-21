import { describe, expect, it } from "vitest";
import { safeJsonParse } from "@/lib/safeJson";

describe("safeJsonParse", () => {
  describe("normal JSON parsing", () => {
    it("parses a string value", () => {
      expect(safeJsonParse('"hello"')).toBe("hello");
    });

    it("parses a number value", () => {
      expect(safeJsonParse("42")).toBe(42);
    });

    it("parses a boolean value", () => {
      expect(safeJsonParse("true")).toBe(true);
    });

    it("parses a simple object", () => {
      const result = safeJsonParse<{ name: string; age: number }>('{"name":"Alice","age":30}');
      expect(result).toEqual({ name: "Alice", age: 30 });
    });

    it("parses an array", () => {
      const result = safeJsonParse<number[]>("[1, 2, 3]");
      expect(result).toEqual([1, 2, 3]);
    });

    it("parses nested objects without pollution keys", () => {
      const result = safeJsonParse<{ a: { b: string } }>('{"a": {"b": "nested"}}');
      expect(result).toEqual({ a: { b: "nested" } });
    });
  });

  describe("prototype pollution protection", () => {
    it("throws on __proto__ key at top level", () => {
      expect(() => safeJsonParse('{"__proto__":{"polluted":true}}')).toThrow(
        "Prototype pollution attempt detected in JSON data",
      );
    });

    it("throws on constructor key at top level", () => {
      expect(() => safeJsonParse('{"constructor":{"polluted":true}}')).toThrow(
        "Prototype pollution attempt detected in JSON data",
      );
    });

    it("throws on prototype key at top level", () => {
      expect(() => safeJsonParse('{"prototype":{"polluted":true}}')).toThrow(
        "Prototype pollution attempt detected in JSON data",
      );
    });

    it("throws on nested __proto__ key", () => {
      expect(() => safeJsonParse('{"a":{"__proto__":{"polluted":true}}}')).toThrow(
        "Prototype pollution attempt detected in JSON data",
      );
    });

    it("throws on nested constructor key", () => {
      expect(() => safeJsonParse('{"a":{"constructor":{"polluted":true}}}')).toThrow(
        "Prototype pollution attempt detected in JSON data",
      );
    });

    it("throws on nested prototype key", () => {
      expect(() => safeJsonParse('{"a":{"prototype":{"polluted":true}}}')).toThrow(
        "Prototype pollution attempt detected in JSON data",
      );
    });
  });

  describe("invalid and edge-case inputs", () => {
    it("throws SyntaxError for invalid JSON", () => {
      expect(() => safeJsonParse("{invalid}")).toThrow(SyntaxError);
    });

    it("throws SyntaxError for empty string", () => {
      expect(() => safeJsonParse("")).toThrow(SyntaxError);
    });

    it("parses null text to null", () => {
      expect(safeJsonParse("null")).toBeNull();
    });
  });
});
