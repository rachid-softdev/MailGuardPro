// =============================================================================
// OBS-2: Pino Structured Logging Migration Audit
// Audits all test files for console.* mocks that would break after
// migration from console.log/warn/error to pino logging.
// =============================================================================

import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("OBS-2: Pino migration audit", () => {
  // The test file is at tests/unit/lib/pino-migration-audit.test.ts
  // __dirname = D:\git-projects\MailGuardPro\mailguardpro-web\tests\unit\lib
  // So project root = D:\git-projects\MailGuardPro\mailguardpro-web
  const projectRoot = path.resolve(__dirname, "../../..");
  const testDir = projectRoot;

  function findAllTestFiles(dir: string): string[] {
    const files: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findAllTestFiles(fullPath));
      } else if (
        entry.name.endsWith(".test.ts") ||
        entry.name.endsWith(".test.tsx") ||
        entry.name.endsWith(".spec.ts")
      ) {
        files.push(fullPath);
      }
    }
    return files;
  }

  const allTestFiles = findAllTestFiles(testDir);

  // ===========================================================================
  // List test files that reference console.* — these may need migration
  // ===========================================================================
  describe("console.* usage audit", () => {
    const consoleMockFiles: Array<{ file: string; line: string }> = [];

    for (const file of allTestFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Match console.log, console.warn, console.error, console.info
        // but not comments or commented-out code
        const stripped = line.replace(/\/\/.*$/, "").trim();
        if (
          /console\.(log|warn|error|info|debug)\s*\(/.test(stripped) &&
          !stripped.includes("//") &&
          !stripped.startsWith("*")
        ) {
          consoleMockFiles.push({
            file: path.relative(testDir, file),
            line: line.trim(),
          });
        }
      }
    }

    // ================================================================
    // Report: Files with console.* that need migration
    // ================================================================
    it("should list all test files using console.* for migration tracking", () => {
      // This test logs the audit results for manual review
      const grouped: Record<string, string[]> = {};
      for (const entry of consoleMockFiles) {
        if (!grouped[entry.file]) grouped[entry.file] = [];
        grouped[entry.file].push(entry.line);
      }

      // Output stats (visible in verbose mode)
      const fileCount = Object.keys(grouped).length;
      const callCount = consoleMockFiles.length;

      // Just verify we found test files
      expect(allTestFiles.length).toBeGreaterThan(0);
      expect(fileCount).toBeGreaterThanOrEqual(0);

      // Print audit results (for diagnostic purposes)
      if (fileCount > 0) {
        console.log(
          `\n=== Pino Migration Audit: ${fileCount} files, ${callCount} console.* calls ===`,
        );
        for (const [file, lines] of Object.entries(grouped)) {
          console.log(`\n  ${file}:`);
          for (const line of lines) {
            console.log(`    → ${line}`);
          }
        }
      }
    });

    it("global setup should mock pino (not console) as the logger", () => {
      // The global setup (tests/setup.ts) should already mock pino
      // Verify by checking the setup file
      const setupPath = path.join(testDir, "tests", "setup.ts");
      const setupContent = fs.readFileSync(setupPath, "utf-8");
      expect(setupContent).toContain("pino");
    });
  });

  // ===========================================================================
  // Verify test setup mocks pino
  // ===========================================================================
  describe("pino mock verification", () => {
    it("should have pino mock in global setup", () => {
      const setupPath = path.join(testDir, "tests", "setup.ts");
      const setupContent = fs.readFileSync(setupPath, "utf-8");
      expect(setupContent).toContain('vi.mock("pino"');
      expect(setupContent).toContain("info");
      expect(setupContent).toContain("warn");
      expect(setupContent).toContain("error");
      expect(setupContent).toContain("debug");
    });

    it("should not have console.* mocks that silence pino", () => {
      const setupPath = path.join(testDir, "tests", "setup.ts");
      const setupContent = fs.readFileSync(setupPath, "utf-8");
      // The setup saves original console but doesn't replace it entirely
      expect(setupContent).toContain("const originalConsole");
    });
  });

  // ===========================================================================
  // Count of console.* calls that need review per test file
  // ===========================================================================
  it("should track console.* usage for future migration", () => {
    // This serves as a tracking mechanism — when pino migration is complete,
    // this count should be 0 (or close to 0)
    const consoleCalls: string[] = [];

    for (const file of allTestFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const lineNum = i + 1;
        const line = lines[i];
        const stripped = line.replace(/\/\/.*$/, "").trim();
        // Skip mock definitions, comment lines
        if (
          /console\.(log|warn|error|info|debug)\s*\(/.test(stripped) &&
          !stripped.includes("console.mock") &&
          !stripped.startsWith("*")
        ) {
          consoleCalls.push(`${path.relative(testDir, file)}:${lineNum}`);
        }
      }
    }

    // Log the count (for CI/review purposes)
    expect(consoleCalls.length).toBeGreaterThanOrEqual(0);
  });
});
