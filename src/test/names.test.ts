import { describe, it, expect } from "vitest";
import { initialLastName } from "@/lib/names";

describe("initialLastName", () => {
  it.each([
    ["Byron Buxton", "B. Buxton"],
    ["Vinnie Pasquantino", "V. Pasquantino"],
    // multi-word surnames and suffixes stay whole
    ["Elly De La Cruz", "E. De La Cruz"],
    ["Ronald Acuña Jr.", "R. Acuña Jr."],
    ["Luis Robert Jr.", "L. Robert Jr."],
    // first names that are already initials collapse to one initial
    ["J.D. Martinez", "J. Martinez"],
    // stray whitespace and single names
    ["  Ichiro   Suzuki ", "I. Suzuki"],
    ["Ichiro", "Ichiro"],
    ["", ""],
  ])("%j -> %j", (full, short) => {
    expect(initialLastName(full)).toBe(short);
  });
});
