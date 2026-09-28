import { describe, expect, test } from "bun:test";
import { contrastRatio } from "./contrast";

describe("contrastRatio", () => {
  test("black on white is the maximum ratio", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  test("identical colors have a ratio of 1", () => {
    expect(contrastRatio("#171310", "#171310")).toBeCloseTo(1, 5);
  });

  test("is order-independent", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(contrastRatio("#ffffff", "#000000"), 5);
  });
});

const AA_NORMAL_TEXT = 4.5;
const AA_LARGE_TEXT = 3;

describe("light theme token contrast (WCAG AA)", () => {
  test("text-primary on bg", () => {
    expect(contrastRatio("#1c1917", "#f3f1ec")).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
  test("text-secondary on bg", () => {
    expect(contrastRatio("#57534e", "#f3f1ec")).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
  test("text-muted on surface-inset (the lowest-contrast pairing in the system)", () => {
    expect(contrastRatio("#6b655d", "#efece5")).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
  test("accent-contrast on accent (button fill)", () => {
    expect(contrastRatio("#ffffff", "#0f766e")).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
  test("accent as a text/link color on bg", () => {
    expect(contrastRatio("#0f766e", "#f3f1ec")).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
  test("danger on bg", () => {
    expect(contrastRatio("#b91c1c", "#f3f1ec")).toBeGreaterThanOrEqual(AA_LARGE_TEXT);
  });
  test("warning on bg", () => {
    expect(contrastRatio("#b45309", "#f3f1ec")).toBeGreaterThanOrEqual(AA_LARGE_TEXT);
  });
  test("success on bg", () => {
    expect(contrastRatio("#3f6212", "#f3f1ec")).toBeGreaterThanOrEqual(AA_LARGE_TEXT);
  });
  test("info on bg", () => {
    expect(contrastRatio("#1d4ed8", "#f3f1ec")).toBeGreaterThanOrEqual(AA_LARGE_TEXT);
  });
});

describe("dark theme token contrast (WCAG AA)", () => {
  test("text-primary on bg", () => {
    expect(contrastRatio("#f5f1e8", "#171310")).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
  test("text-secondary on bg", () => {
    expect(contrastRatio("#b8ad9c", "#171310")).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
  test("text-muted on surface-inset (the lowest-contrast pairing in the system)", () => {
    expect(contrastRatio("#8a7e6f", "#14110d")).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
  test("accent-contrast on accent (button fill)", () => {
    expect(contrastRatio("#0b1a17", "#2dd4bf")).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
  test("accent as a text/link color on bg", () => {
    expect(contrastRatio("#2dd4bf", "#171310")).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
  test("danger on bg", () => {
    expect(contrastRatio("#f87171", "#171310")).toBeGreaterThanOrEqual(AA_LARGE_TEXT);
  });
  test("warning on bg", () => {
    expect(contrastRatio("#fb923c", "#171310")).toBeGreaterThanOrEqual(AA_LARGE_TEXT);
  });
  test("success on bg", () => {
    expect(contrastRatio("#84cc16", "#171310")).toBeGreaterThanOrEqual(AA_LARGE_TEXT);
  });
  test("info on bg", () => {
    expect(contrastRatio("#60a5fa", "#171310")).toBeGreaterThanOrEqual(AA_LARGE_TEXT);
  });
});
