import { conversationPaletteCatalog, conversationPaletteIDValues } from "@generated/backend";
import { describe, expect, test } from "vitest";

import { conversationPaletteStyle } from "./conversation-palette-style";

const minimumNormalTextContrast = 4.5;

describe("conversation palette semantic tokens", () => {
  test.each(conversationPaletteIDValues)(
    "%s keeps generated light and dark foregrounds accessible",
    (paletteId) => {
      const palette = conversationPaletteCatalog[paletteId];
      for (const mode of ["dark", "light"] as const) {
        const tokens = palette[mode];
        expect(
          contrastRatio(tokens.conversationAccentForeground, tokens.conversationAccent),
        ).toBeGreaterThanOrEqual(minimumNormalTextContrast);
        expect(tokens.conversationFocusRing).toBe(tokens.conversationAccent);
      }
    },
  );

  test.each(conversationPaletteIDValues)(
    "%s maps generated tokens onto the conversation CSS variables",
    (paletteId) => {
      const palette = conversationPaletteCatalog[paletteId];

      expect(conversationPaletteStyle(paletteId)).toEqual({
        "--conversation-accent-dark": palette.dark.conversationAccent,
        "--conversation-accent-foreground-dark": palette.dark.conversationAccentForeground,
        "--conversation-accent-foreground-light": palette.light.conversationAccentForeground,
        "--conversation-accent-light": palette.light.conversationAccent,
        "--conversation-focus-ring-dark": palette.dark.conversationFocusRing,
        "--conversation-focus-ring-light": palette.light.conversationFocusRing,
      });
    },
  );
});

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(parseOKLCH(foreground));
  const backgroundLuminance = relativeLuminance(parseOKLCH(background));
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

interface OKLCHColor {
  chroma: number;
  hue: number;
  lightness: number;
}

function parseOKLCH(value: string): OKLCHColor {
  const match = /^oklch\(([^ ]+) ([^ ]+) ([^)]+)\)$/.exec(value.trim());
  if (!match?.[1] || !match[2] || !match[3]) {
    throw new Error(`Invalid generated OKLCH color: ${value}`);
  }
  return {
    chroma: Number.parseFloat(match[2]),
    hue: Number.parseFloat(match[3]),
    lightness: Number.parseFloat(match[1]),
  };
}

function relativeLuminance({ chroma, hue, lightness }: OKLCHColor): number {
  const hueRadians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(hueRadians);
  const b = chroma * Math.sin(hueRadians);
  const lPrime = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lPrime ** 3;
  const m = mPrime ** 3;
  const s = sPrime ** 3;
  const red = clamp01(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const green = clamp01(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const blue = clamp01(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
