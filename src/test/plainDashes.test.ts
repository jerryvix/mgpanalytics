import { describe, expect, it } from "vitest";

import { plainDashes } from "@/lib/plainDashes";

// Built from code points so this file passes the no-dashes source scan
const MINUS = String.fromCharCode(0x2212);
const EN = String.fromCharCode(0x2013);
const EM = String.fromCharCode(0x2014);
const ANY = new RegExp(`[${MINUS}${EN}${EM}]`);

describe("plainDashes", () => {
  it("turns the typographic minus into a hyphen in spreads and prices", () => {
    expect(plainDashes(`Oregon ${MINUS}6.5 (${MINUS}110)`)).toBe("Oregon -6.5 (-110)");
    expect(plainDashes(`${MINUS}245 / +200`)).toBe("-245 / +200");
  });

  it("turns a dash used as a sign into a hyphen", () => {
    expect(plainDashes(`Oregon ${EN}6.5`)).toBe("Oregon -6.5");
    expect(plainDashes(`(${EM}110)`)).toBe("(-110)");
  });

  it("turns ranges and scores into hyphens", () => {
    expect(plainDashes(`Weeks 10${EN}18`)).toBe("Weeks 10-18");
    expect(plainDashes(`won 24 ${EN} 17`)).toBe("won 24-17");
    expect(plainDashes(`5${EM}7 ATS`)).toBe("5-7 ATS");
    expect(plainDashes(`Jan${EN}Feb`)).toBe("Jan-Feb");
  });

  it("turns dash punctuation into a comma", () => {
    expect(plainDashes(`The line moved ${EM} a full point`)).toBe("The line moved, a full point");
    expect(plainDashes(`The line moved${EM}a full point`)).toBe("The line moved, a full point");
    expect(plainDashes(`Sharp side ${EN} under half the bets`)).toBe("Sharp side, under half the bets");
  });

  it("keeps missing-value cells, bullets and line endings readable", () => {
    expect(plainDashes(`| Oregon | ${EM} |`)).toBe("| Oregon | - |");
    expect(plainDashes(`${EM} Oregon covered`)).toBe("- Oregon covered");
    expect(plainDashes(`Tonight's board ${EM}\n| Game |`)).toBe("Tonight's board:\n| Game |");
  });

  it("leaves plain text alone and is idempotent", () => {
    const plain = "Oregon -6.5 (-110), O 52.5, 5-5 ATS, PK";
    expect(plainDashes(plain)).toBe(plain);
    expect(plainDashes("")).toBe("");
    const once = plainDashes(`A ${EM} B ${EN} C 1${EN}2 ${MINUS}3`);
    expect(plainDashes(once)).toBe(once);
  });

  it("never leaves one of the three characters behind", () => {
    const samples = [
      `${EM}${EM}${EM}`,
      `${EM}Oregon`,
      `a ${EN}${EM} b`,
      `| ${EN} | ${MINUS} |`,
      `line one ${EM}\n${EN} two\n3 ${EN} 4 ${MINUS}5`,
    ];
    for (const s of samples) expect(ANY.test(plainDashes(s)), s).toBe(false);
  });
});
