import { describe, expect, it } from "vitest";

import type { WorkspaceThemeTokens } from "../src/core.js";
import {
  resolveWorkspaceAppearanceOptions,
  resolveWorkspaceGridOptions,
  snapWorkspacePointToGrid,
  WORKSPACE_DEFAULT_DARK_THEME,
  WORKSPACE_DEFAULT_GRID_OPTIONS,
  WORKSPACE_DEFAULT_LIGHT_THEME,
} from "../src/internal/workspace-preferences.js";

type Rgb = Readonly<{ blue: number; green: number; red: number }>;
type Oklch = Readonly<{ chroma: number; hue: number; lightness: number }>;

function requiredNumber(value: string | undefined): number {
  if (value === undefined) {
    throw new TypeError("Expected an OKLCH channel.");
  }
  return Number(value);
}

function parseOklch(value: string): Oklch {
  const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/u.exec(value);
  if (!match) {
    throw new TypeError(`Expected a normalized OKLCH color, received ${value}.`);
  }
  return {
    chroma: requiredNumber(match[2]),
    hue: requiredNumber(match[3]),
    lightness: requiredNumber(match[1]),
  };
}

function linearRgb(color: string): Rgb {
  const { chroma, hue, lightness } = parseOklch(color);
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const l = Math.pow(lightness + 0.396_337_777_4 * a + 0.215_803_757_3 * b, 3);
  const m = Math.pow(lightness - 0.105_561_345_8 * a - 0.063_854_172_8 * b, 3);
  const s = Math.pow(lightness - 0.089_484_177_5 * a - 1.291_485_548 * b, 3);
  return {
    blue: -0.004_196_086_3 * l - 0.703_418_614_7 * m + 1.707_614_701 * s,
    green: -1.268_438_004_6 * l + 2.609_757_401_1 * m - 0.341_319_396_5 * s,
    red: 4.076_741_662_1 * l - 3.307_711_591_3 * m + 0.230_969_929_2 * s,
  };
}

function encodedChannel(value: number): number {
  return value <= 0.003_130_8 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
}

function encodedRgb(color: string): Rgb {
  const linear = linearRgb(color);
  return {
    blue: encodedChannel(linear.blue),
    green: encodedChannel(linear.green),
    red: encodedChannel(linear.red),
  };
}

function relativeLuminance(color: string): number {
  const rgb = encodedRgb(color);
  const linear = (value: number) =>
    value <= 0.040_45 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  return 0.2126 * linear(rgb.red) + 0.7152 * linear(rgb.green) + 0.0722 * linear(rgb.blue);
}

function wcagContrast(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function apcaLuminance(color: string): number {
  const rgb = encodedRgb(color);
  const luminance =
    0.212_672_9 * Math.pow(rgb.red, 2.4) +
    0.715_152_2 * Math.pow(rgb.green, 2.4) +
    0.072_175 * Math.pow(rgb.blue, 2.4);
  return luminance < 0.022 ? luminance + Math.pow(0.022 - luminance, 1.414) : luminance;
}

function apcaContrast(foreground: string, background: string): number {
  const text = apcaLuminance(foreground);
  const backdrop = apcaLuminance(background);
  if (backdrop > text) {
    const contrast = (Math.pow(backdrop, 0.56) - Math.pow(text, 0.57)) * 1.14;
    return contrast < 0.1 ? 0 : (contrast - 0.027) * 100;
  }
  const contrast = (Math.pow(backdrop, 0.65) - Math.pow(text, 0.62)) * 1.14;
  return contrast > -0.1 ? 0 : (contrast + 0.027) * 100;
}

function expectThemeContrast(tokens: WorkspaceThemeTokens): void {
  for (const background of [tokens.sectionBackground, tokens.toolbarBackground]) {
    expect(Math.abs(apcaContrast(tokens.sectionText, background))).toBeGreaterThanOrEqual(75);
    expect(wcagContrast(tokens.sectionText, background)).toBeGreaterThanOrEqual(4.5);
  }
  expect(
    Math.abs(apcaContrast(tokens.sectionMutedText, tokens.sectionBackground)),
  ).toBeGreaterThanOrEqual(75);
  expect(wcagContrast(tokens.sectionMutedText, tokens.sectionBackground)).toBeGreaterThanOrEqual(
    4.5,
  );
  for (const state of [tokens.focus, tokens.invalid, tokens.selection]) {
    expect(wcagContrast(state, tokens.canvasBackground)).toBeGreaterThanOrEqual(3);
    expect(wcagContrast(state, tokens.sectionBackground)).toBeGreaterThanOrEqual(3);
  }
}

describe("workspace grid preferences", () => {
  it("resolves immutable defaults and keeps visibility independent from snapping", () => {
    expect(resolveWorkspaceGridOptions()).toEqual(WORKSPACE_DEFAULT_GRID_OPTIONS);
    expect(resolveWorkspaceGridOptions({ snap: true, visible: false })).toMatchObject({
      snap: true,
      visible: false,
    });
    expect(resolveWorkspaceGridOptions({ snap: false, visible: true })).toMatchObject({
      snap: false,
      visible: true,
    });
    expect(Object.isFrozen(resolveWorkspaceGridOptions().spacing)).toBe(true);
  });

  it("resolves both-axis spacing, every pattern, and shared negative-coordinate snap math", () => {
    expect(
      resolveWorkspaceGridOptions({
        markSize: 2,
        pattern: "cross",
        spacing: [24, 10],
      }),
    ).toMatchObject({ markSize: 2, pattern: "cross", spacing: [24, 10] });
    expect(resolveWorkspaceGridOptions({ pattern: "lines" }).pattern).toBe("lines");
    expect(snapWorkspacePointToGrid({ x: -37, y: 16 }, [24, 10])).toEqual({ x: -48, y: 20 });
    expect(snapWorkspacePointToGrid({ x: -12, y: -5 }, [24, 10])).toEqual({ x: 0, y: 0 });
  });

  it("rejects grid spacing arrays with ignored extra fields", () => {
    const spacing = [24, 24] as number[] & { metadata?: boolean };
    spacing.metadata = true;

    expect(() => resolveWorkspaceGridOptions({ spacing: spacing as [number, number] })).toThrow(
      "spacing must contain exactly two values",
    );
  });

  it.each([
    [{ markSize: 0 }, "markSize must be a positive finite number"],
    [{ pattern: "mesh" }, "pattern must be cross, dots, or lines"],
    [{ spacing: [24] }, "spacing must contain exactly two values"],
    [{ spacing: [24, 0] }, "y spacing must be a positive finite number"],
    [{ markSize: null }, "markSize must be a positive finite number"],
    [{ pattern: null }, "pattern must be cross, dots, or lines"],
    [{ spacing: null }, "spacing must contain exactly two values"],
    [{ visible: null }, "visible must be a boolean"],
    [{ visible: "yes" }, "visible must be a boolean"],
    [{ extra: true }, "Unknown workspace grid option extra"],
  ])("rejects invalid grid policy %# specifically", (options, message) => {
    expect(() =>
      resolveWorkspaceGridOptions(options as Parameters<typeof resolveWorkspaceGridOptions>[0]),
    ).toThrow(message as string);
  });
});

describe("workspace appearance preferences", () => {
  it("resolves scoped light and dark token overrides without mutating the defaults", () => {
    const resolved = resolveWorkspaceAppearanceOptions({
      appearance: "dark",
      dark: { gridColor: "oklch(0.68 0.11 305)" },
      light: { canvasBackground: "white" },
    });

    expect(resolved.appearance).toBe("dark");
    expect(resolved.dark.gridColor).toBe("oklch(0.68 0.11 305)");
    expect(resolved.dark.canvasBackground).toBe(WORKSPACE_DEFAULT_DARK_THEME.canvasBackground);
    expect(resolved.light.canvasBackground).toBe("white");
    expect(WORKSPACE_DEFAULT_LIGHT_THEME.canvasBackground).toBe("oklch(0.965 0.008 255)");
    expect(Object.isFrozen(resolved.dark)).toBe(true);
    expect(Object.isFrozen(resolved)).toBe(true);
  });

  it.each([
    [{ appearance: "sepia" }, "appearance must be dark, light, or system"],
    [{ appearance: null }, "appearance must be dark, light, or system"],
    [{ extra: true }, "Unknown workspace appearance option extra"],
    [{ dark: { extra: "red" } }, "Unknown workspace dark theme token extra"],
    [{ light: { focus: "not a color" } }, "light theme token focus must be a valid CSS color"],
  ])("rejects invalid appearance policy %# specifically", (options, message) => {
    expect(() =>
      resolveWorkspaceAppearanceOptions(
        options as Parameters<typeof resolveWorkspaceAppearanceOptions>[0],
      ),
    ).toThrow(message as string);
  });

  it("keeps every default token normalized, sRGB-gamut-safe, and contrast-checked", () => {
    for (const tokens of [WORKSPACE_DEFAULT_LIGHT_THEME, WORKSPACE_DEFAULT_DARK_THEME]) {
      for (const color of Object.values(tokens)) {
        expect(color).toMatch(
          /^oklch\((?:0|1|0?\.\d{1,3}) (?:0|0?\.\d{1,3}) \d{1,3}(?:\.\d{1,3})?\)$/u,
        );
        for (const channel of Object.values(linearRgb(color))) {
          expect(channel).toBeGreaterThanOrEqual(-0.000_001);
          expect(channel).toBeLessThanOrEqual(1.000_001);
        }
      }
      expectThemeContrast(tokens);
      expect(new Set(Object.values(tokens)).size).toBe(Object.keys(tokens).length);
    }
  });
});
