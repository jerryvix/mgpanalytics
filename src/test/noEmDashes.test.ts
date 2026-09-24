import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// House style: no em dashes anywhere (owner rule, Aug 2026). This walks every
// source file in src/ and in supabase/functions/ (the edge functions, whose
// prompt text the chat model can echo to users) so a new one fails CI with an
// exact location, covering comments too so they don't get copy-pasted into
// rendered strings. Code files only: fixtures, data dumps and binaries are
// never read, which keeps the walk fast.
const REPO_ROOT = resolve(__dirname, "../..");
const SRC_ROOT = resolve(REPO_ROOT, "src");
const FUNCTIONS_ROOT = resolve(REPO_ROOT, "supabase/functions");
const CODE_FILE = /\.(ts|tsx|js|mjs|cjs)$/;
const EM_DASH = String.fromCharCode(0x2014);
// Escaped forms sneak past a literal scan but still render as em dashes
const ESCAPED = /\\u2014|\\u\{2014\}|\\x\{2014\}|&#8212;|&#x2014;|&mdash;/i;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (CODE_FILE.test(name)) {
      out.push(full);
    }
  }
  return out;
}

/** Every "path:line" under `root` holding an em dash or an escaped one */
function offenders(root: string): string[] {
  const out: string[] = [];
  for (const file of walk(root)) {
    if (file.endsWith("noEmDashes.test.ts")) continue;
    const lines = readFileSync(file, "utf-8").split("\n");
    lines.forEach((line, i) => {
      if (line.includes(EM_DASH) || ESCAPED.test(line)) {
        out.push(`${relative(REPO_ROOT, file).replace(/\\/g, "/")}:${i + 1}`);
      }
    });
  }
  return out;
}

describe("no em dashes in source", () => {
  it("finds zero em dashes across src/", () => {
    expect(offenders(SRC_ROOT)).toEqual([]);
  });

  it("finds zero em dashes across supabase/functions/", () => {
    expect(walk(FUNCTIONS_ROOT).length).toBeGreaterThan(50); // the walk reaches the edge functions
    expect(offenders(FUNCTIONS_ROOT)).toEqual([]);
  });

  it("catches the literal character and each escaped form", () => {
    for (const line of [
      `const a = "x ${EM_DASH} y";`,
      'const b = "x \\u2014 y";',
      'const c = "x \\u{2014} y";',
      "<p>x &mdash; y</p>",
      "<p>x &#8212; y</p>",
      "<p>x &#x2014; y</p>",
    ]) {
      expect(line.includes(EM_DASH) || ESCAPED.test(line), line).toBe(true);
    }
    expect(ESCAPED.test('const d = "x - y"; // a hyphen, 0x2014 as a number')).toBe(false);
  });
});
