import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// House style: no em dashes anywhere (owner rule, Aug 2026), and since Nov 2026
// no en dashes or typographic minus signs either: spreads and prices use the
// ASCII hyphen ("Oregon -6.5 (-110)"). This walks every source file in src/,
// packages/ (shared with the app) and supabase/functions/ (the edge functions,
// whose prompt text the chat model can echo to users) so a new one fails CI
// with an exact location. Em dashes are caught in comments too, so they don't
// get copy-pasted into rendered strings; en dashes and minus signs are caught
// in code and copy, outside comments. Code that has to match one of these
// characters (a normalizer, a test) builds it with String.fromCharCode, which
// the scan does not read as the character. Code files only: fixtures, data
// dumps and binaries are never read, which keeps the walk fast.
const REPO_ROOT = resolve(__dirname, "../..");
const SRC_ROOT = resolve(REPO_ROOT, "src");
const PACKAGES_ROOT = resolve(REPO_ROOT, "packages");
const FUNCTIONS_ROOT = resolve(REPO_ROOT, "supabase/functions");
const CODE_FILE = /\.(ts|tsx|js|mjs|cjs)$/;
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
const MINUS_SIGN = String.fromCharCode(0x2212);
// Escaped forms sneak past a literal scan but still render as the character
const ESCAPED = /\\u2014|\\u\{2014\}|\\x\{2014\}|&#8212;|&#x2014;|&mdash;/i;
const ESCAPED_EN_MINUS = /\\u(2013|2212)|\\u\{(2013|2212)\}|\\x\{(2013|2212)\}|&#(8211|8722);|&#x(2013|2212);|&ndash;|&minus;/i;

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

/** The line without its comments: comment lines, inline block comments and trailing line comments */
function codeOnly(line: string): string {
  const t = line.trimStart();
  if (t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) return "";
  return line.replace(/\/\*.*?\*\//g, "").replace(/(^|\s)\/\/.*$/, "$1");
}

function offends(line: string): boolean {
  if (line.includes(EM_DASH) || ESCAPED.test(line)) return true;
  const code = codeOnly(line);
  return code.includes(EN_DASH) || code.includes(MINUS_SIGN) || ESCAPED_EN_MINUS.test(code);
}

/** Every "path:line" under `root` holding one of the three characters or an escaped one */
function offenders(root: string): string[] {
  const out: string[] = [];
  for (const file of walk(root)) {
    if (file.endsWith("noEmDashes.test.ts")) continue;
    const lines = readFileSync(file, "utf-8").split("\n");
    lines.forEach((line, i) => {
      if (offends(line)) {
        out.push(`${relative(REPO_ROOT, file).replace(/\\/g, "/")}:${i + 1}`);
      }
    });
  }
  return out;
}

describe("no em dashes, en dashes or minus signs in source", () => {
  it("finds none across src/", () => {
    expect(offenders(SRC_ROOT)).toEqual([]);
  });

  it("finds none across packages/", () => {
    expect(walk(PACKAGES_ROOT).length).toBeGreaterThan(0); // the walk reaches the shared code
    expect(offenders(PACKAGES_ROOT)).toEqual([]);
  });

  it("finds none across supabase/functions/", () => {
    expect(walk(FUNCTIONS_ROOT).length).toBeGreaterThan(50); // the walk reaches the edge functions
    expect(offenders(FUNCTIONS_ROOT)).toEqual([]);
  });

  it("finds none in index.html (page title and meta descriptions)", () => {
    const html = resolve(REPO_ROOT, "index.html");
    expect(existsSync(html)).toBe(true);
    const lines = readFileSync(html, "utf-8").split("\n");
    expect(lines.map((l, i) => (offends(l) ? `index.html:${i + 1}` : null)).filter(Boolean)).toEqual([]);
  });

  it("catches the literal characters and each escaped form", () => {
    for (const line of [
      `const a = "x ${EM_DASH} y";`,
      'const b = "x \\u2014 y";',
      'const c = "x \\u{2014} y";',
      "<p>x &mdash; y</p>",
      "<p>x &#8212; y</p>",
      "<p>x &#x2014; y</p>",
      `const e = "Weeks 10${EN_DASH}18";`,
      `const f = "Oregon ${MINUS_SIGN}6.5";`,
      'const g = "\\u2212";',
      'const h = "\\u{2013}";',
      "<p>5&ndash;7, &minus;110, &#8722;3, &#x2013;</p>",
      `<span>{a}${EN_DASH}{b}</span>`,
    ]) {
      expect(offends(line), line).toBe(true);
    }
    expect(offends('const d = "x - y"; // a hyphen, 0x2014 as a number')).toBe(false);
  });

  it("catches em dashes in comments but lets en dashes and minus signs stay there", () => {
    expect(offends(`// Jul ${EM_DASH} Sep`)).toBe(true);
    expect(offends(`  case "NBA": return m >= 9; // Oct${EN_DASH}Jun`)).toBe(false);
    expect(offends(` * season ${MINUS_SIGN} 1`)).toBe(false);
    expect(offends(`{/* Weeks 10${EN_DASH}18 */}`)).toBe(false);
    expect(offends(`const url = "https://x.com"; const r = "1${EN_DASH}2";`)).toBe(true);
  });
});
