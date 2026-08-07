import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// House style: no em dashes anywhere on the site (owner rule, Aug 2026).
// This walks every source file so a new one fails CI with an exact location,
// covering comments too so they don't get copy-pasted into rendered strings.
const SRC_ROOT = resolve(__dirname, "..");
const EM_DASH = String.fromCharCode(0x2014);
// Escaped forms sneak past a literal scan but still render as em dashes
const ESCAPED = /\\u2014|\\x\{2014\}|&#8212;|&mdash;/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe("no em dashes in source", () => {
  it("finds zero em dashes across src/", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      const lines = readFileSync(file, "utf-8").split("\n");
      lines.forEach((line, i) => {
        if ((line.includes(EM_DASH) || ESCAPED.test(line)) && !file.endsWith("noEmDashes.test.ts")) {
          offenders.push(`${file.replace(SRC_ROOT, "src")}:${i + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
