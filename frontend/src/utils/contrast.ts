function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

function channelLuminance(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function toHex(channel: number): string {
  return Math.round(channel).toString(16).padStart(2, "0");
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

/** WCAG 2.x contrast ratio between two colors, order-independent. Range: 1 (no contrast) to 21 (black/white). */
export function contrastRatio(hexA: string, hexB: string): number {
  const luminanceA = relativeLuminance(hexA);
  const luminanceB = relativeLuminance(hexB);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Alpha-composites fgHex over bgHex (simple per-channel sRGB blend), returning the resulting hex.
 * Mirrors what `color-mix(in srgb, fgHex N%, transparent)` renders over bgHex, and what a fixed
 * `rgba()` overlay renders over a given canvas color — the composition our components actually use.
 */
export function compositeOver(fgHex: string, alpha: number, bgHex: string): string {
  const [fr, fg, fb] = hexToRgb(fgHex);
  const [br, bg, bb] = hexToRgb(bgHex);
  const r = alpha * fr + (1 - alpha) * br;
  const g = alpha * fg + (1 - alpha) * bg;
  const b = alpha * fb + (1 - alpha) * bb;
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
