import { describe, expect, test } from "bun:test";
import { compositeOver, contrastRatio, relativeLuminance } from "./contrast";

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
    expect(contrastRatio("#92450a", "#f3f1ec")).toBeGreaterThanOrEqual(AA_LARGE_TEXT);
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
  test("text-muted on surface-inset (the darkest dark-theme surface — NOT the worst case; see composed-background suite below for the real worst case)", () => {
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

// These pairings test the colors as they actually render in the app: pill text sits on its own
// tinted background (color-mix(token N%, transparent) composited over the row's surface), not on
// --bg directly, and that text is --text-xs (12px) — normal text (4.5:1), not large text (3:1).
// A token-vs-bg test alone can pass while the real composed pairing fails, because a dark theme's
// "most inset" surface is not necessarily its lightest — the lightest surface is the hardest case
// for light text, and that's what a pill or a muted label actually sits on in practice.
describe("composed-background contrast (real component pairings, WCAG AA)", () => {
  test("dark text-muted on surface-raised (lighter than surface and surface-inset — the real worst case for dark-theme light text)", () => {
    expect(contrastRatio("#9a8d7c", "#221d17")).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  test("dark text-muted on surface", () => {
    expect(contrastRatio("#9a8d7c", "#1c1814")).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  test("dark PriorityPill.VERY_LOW: text-muted on its own 8% tint over surface-raised", () => {
    const bg = compositeOver("#9a8d7c", 0.08, "#221d17");
    expect(contrastRatio("#9a8d7c", bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  test("light StatusPill.BLOCKED: warning on its own 14% tint over surface-raised", () => {
    const bg = compositeOver("#92450a", 0.14, "#f7f5f0");
    expect(contrastRatio("#92450a", bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  test("light PriorityPill.MODERATE: warning on its own 12% tint over surface-raised", () => {
    const bg = compositeOver("#92450a", 0.12, "#f7f5f0");
    expect(contrastRatio("#92450a", bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
});

// TaskDrawer/ConfirmDialog use a fixed, theme-invariant overlay scrim (not a token) so it always
// dims the content behind it. That only holds if the scrim's own fixed color is darker than BOTH
// canvases it can be composited over — a near-black base that happens to be lighter than the dark
// theme's canvas would lighten the page instead of dimming it.
describe("modal/drawer overlay scrim (theme-invariant, must darken both canvases)", () => {
  test("darkens the light-theme canvas", () => {
    const canvas = "#f3f1ec";
    const scrim = compositeOver("#000000", 0.28, canvas);
    expect(relativeLuminance(scrim)).toBeLessThan(relativeLuminance(canvas));
  });

  test("darkens the dark-theme canvas", () => {
    const canvas = "#171310";
    const scrim = compositeOver("#000000", 0.28, canvas);
    expect(relativeLuminance(scrim)).toBeLessThan(relativeLuminance(canvas));
  });
});
