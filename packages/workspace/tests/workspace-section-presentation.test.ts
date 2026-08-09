import { describe, expect, it } from "vitest";

import {
  resolveWorkspaceSectionColorPalette,
  WORKSPACE_DEFAULT_SECTION_COLOR_PALETTE,
  type WorkspaceSectionColorOption,
} from "../src/internal/workspace-section-contract.js";

function linearRgb(color: string): readonly number[] {
  const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/u.exec(color);
  if (!match) {
    throw new TypeError(`Expected a normalized OKLCH color, received ${color}.`);
  }
  const lightness = Number(match[1]);
  const chroma = Number(match[2]);
  const hue = Number(match[3]);
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const l = Math.pow(lightness + 0.396_337_777_4 * a + 0.215_803_757_3 * b, 3);
  const m = Math.pow(lightness - 0.105_561_345_8 * a - 0.063_854_172_8 * b, 3);
  const s = Math.pow(lightness - 0.089_484_177_5 * a - 1.291_485_548 * b, 3);
  return [
    4.076_741_662_1 * l - 3.307_711_591_3 * m + 0.230_969_929_2 * s,
    -1.268_438_004_6 * l + 2.609_757_401_1 * m - 0.341_319_396_5 * s,
    -0.004_196_086_3 * l - 0.703_418_614_7 * m + 1.707_614_701 * s,
  ];
}

describe("workspace section color palette", () => {
  it("provides immutable normalized OKLCH defaults inside the sRGB gamut", () => {
    expect(WORKSPACE_DEFAULT_SECTION_COLOR_PALETTE).toHaveLength(6);
    expect(Object.isFrozen(WORKSPACE_DEFAULT_SECTION_COLOR_PALETTE)).toBe(true);
    for (const option of WORKSPACE_DEFAULT_SECTION_COLOR_PALETTE) {
      expect(option.color).toMatch(
        /^oklch\((?:0|1|0?\.\d{1,3}) (?:0|0?\.\d{1,3}) \d{1,3}(?:\.\d{1,3})?\)$/u,
      );
      expect(Object.isFrozen(option)).toBe(true);
      for (const channel of linearRgb(option.color)) {
        expect(channel).toBeGreaterThanOrEqual(-0.000_001);
        expect(channel).toBeLessThanOrEqual(1.000_001);
      }
    }
  });

  it("accepts an immutable host palette and preserves supported CSS colors", () => {
    const palette = resolveWorkspaceSectionColorPalette([
      { color: "rebeccapurple", label: "Purple" },
      { color: "oklch(0.64 0.1 195)", label: "Sea" },
    ]);

    expect(palette).toEqual([
      { color: "rebeccapurple", label: "Purple" },
      { color: "oklch(0.64 0.1 195)", label: "Sea" },
    ]);
    expect(Object.isFrozen(palette)).toBe(true);
    expect(Object.isFrozen(palette[0])).toBe(true);
  });

  it.each([
    [
      [
        { color: "red", label: "Duplicate" },
        { color: "blue", label: "duplicate" },
      ],
      "labels must be unique",
    ],
    [
      [
        { color: "red", label: "Red" },
        { color: "RED", label: "Other" },
      ],
      "colors must be unique",
    ],
    [[{ color: "not a color", label: "Broken" }], "color must be a valid CSS color"],
    [[{ color: "red", label: "  " }], "label must be a non-empty string"],
    [[{ color: "red", label: "Red", extra: true }], "Unknown workspace section color option"],
  ])("rejects malformed palette %# specifically", (palette, message) => {
    expect(() =>
      resolveWorkspaceSectionColorPalette(palette as readonly WorkspaceSectionColorOption[]),
    ).toThrow(message as string);
  });

  it("rejects accessor-backed options without evaluating them", () => {
    let evaluated = false;
    const option = Object.defineProperty({ label: "Blue" }, "color", {
      enumerable: true,
      get: () => {
        evaluated = true;
        return "blue";
      },
    });

    expect(() =>
      resolveWorkspaceSectionColorPalette([option as unknown as WorkspaceSectionColorOption]),
    ).toThrow("workspace section color option field color");
    expect(evaluated).toBe(false);
  });
});
