import { describe, expect, it } from "vitest";
import {
  sanitizeEmailForDisplay,
  sanitizeForAttr,
  sanitizeForCsv,
  sanitizeForHtml,
} from "@/lib/emailSanitizer";

describe("sanitizeEmailForDisplay", () => {
  it("allows normal email addresses", () => {
    expect(sanitizeEmailForDisplay("user@example.com")).toBe("user@example.com");
  });

  it("strips HTML tags from email", () => {
    expect(sanitizeEmailForDisplay("<script>alert(1)</script>@x.com")).toBe(
      "scriptalert1/script@x.com",
    );
  });

  it("strips angle brackets", () => {
    expect(sanitizeEmailForDisplay("test@<xss>")).toBe("test@xss");
  });

  it("strips double quotes and angle brackets", () => {
    expect(sanitizeEmailForDisplay('"><script>alert(1)</script>@x.com')).toBe(
      "scriptalert1/script@x.com",
    );
  });

  it("handles empty strings", () => {
    expect(sanitizeEmailForDisplay("")).toBe("");
  });

  it("strips parentheses", () => {
    expect(sanitizeEmailForDisplay("test()@x.com")).toBe("test@x.com");
  });

  it("strips square brackets", () => {
    expect(sanitizeEmailForDisplay("test[abc]@x.com")).toBe("testabc@x.com");
  });

  it("strips semicolons", () => {
    expect(sanitizeEmailForDisplay("test;@x.com")).toBe("test@x.com");
  });

  it("strips backslashes", () => {
    expect(sanitizeEmailForDisplay("test\\@x.com")).toBe("test@x.com");
  });

  it("trims whitespace", () => {
    expect(sanitizeEmailForDisplay("  user@example.com  ")).toBe("user@example.com");
  });
});

describe("sanitizeForHtml", () => {
  it("encodes HTML special characters", () => {
    expect(sanitizeForHtml('<script>alert("xss")</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;",
    );
  });

  it("encodes ampersands first", () => {
    expect(sanitizeForHtml("foo&bar")).toBe("foo&amp;bar");
  });

  it("encodes single quotes", () => {
    expect(sanitizeForHtml("it's")).toBe("it&#x27;s");
  });

  it("handles empty strings", () => {
    expect(sanitizeForHtml("")).toBe("");
  });

  it("preserves normal text", () => {
    expect(sanitizeForHtml("hello world")).toBe("hello world");
  });

  it("encodes multiple special chars in sequence", () => {
    expect(sanitizeForHtml('a&b<c>d"e')).toBe("a&amp;b&lt;c&gt;d&quot;e");
  });
});

describe("sanitizeForCsv", () => {
  it("prefixes = with apostrophe", () => {
    expect(sanitizeForCsv("=CMD|' /C calc'!A0")).toBe("'=CMD|' /C calc'!A0");
  });

  it("prefixes + with apostrophe", () => {
    expect(sanitizeForCsv("+SUM(A1:A10)")).toBe("'+SUM(A1:A10)");
  });

  it("prefixes - with apostrophe", () => {
    expect(sanitizeForCsv("-1+2")).toBe("'-1+2");
  });

  it("prefixes @ with apostrophe", () => {
    expect(sanitizeForCsv("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("prefixes tab with apostrophe", () => {
    expect(sanitizeForCsv("\tDANGER")).toBe("'\tDANGER");
  });

  it("prefixes carriage return with apostrophe", () => {
    expect(sanitizeForCsv("\rDANGER")).toBe("'\rDANGER");
  });

  it("prefixes newline with apostrophe", () => {
    expect(sanitizeForCsv("\nDANGER")).toBe("'\nDANGER");
  });

  it("normal strings pass through unchanged", () => {
    expect(sanitizeForCsv("hello@example.com")).toBe("hello@example.com");
  });

  it("wraps values with commas in quotes", () => {
    expect(sanitizeForCsv("hello, world")).toBe('"hello, world"');
  });

  it("escapes double quotes inside comma-wrapped values", () => {
    expect(sanitizeForCsv('he"llo, world')).toBe('"he""llo, world"');
  });

  it("wraps values with newlines in quotes", () => {
    expect(sanitizeForCsv("hello\nworld")).toBe('"hello\nworld"');
  });

  it("handles empty strings", () => {
    expect(sanitizeForCsv("")).toBe("");
  });
});

describe("sanitizeForAttr", () => {
  it("removes double quotes", () => {
    expect(sanitizeForAttr('test"onclick=alert(1)')).toBe("testonclick=alert(1)");
  });

  it("removes single quotes", () => {
    expect(sanitizeForAttr("test'onclick=alert(1)")).toBe("testonclick=alert(1)");
  });

  it("removes angle brackets", () => {
    expect(sanitizeForAttr("test<div>")).toBe("testdiv");
  });

  it("removes backticks", () => {
    expect(sanitizeForAttr("test`onerror=alert(1)")).toBe("testonerror=alert(1)");
  });

  it("allows normal text", () => {
    expect(sanitizeForAttr("hello world")).toBe("hello world");
  });

  it("allows safe punctuation", () => {
    expect(sanitizeForAttr("hello-world_test@example.com")).toBe("hello-world_test@example.com");
  });
});
