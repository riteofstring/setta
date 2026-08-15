import { describe, expect, it } from "vitest";
import {
  DEFAULT_SECTION_TAG_COLOR_PALETTE,
  normalizeSectionTagColor,
  resolveSectionTagColorPalette,
} from "./sectionTagColors";

describe("section tag colors", () => {
  it("captures frozen main's immutable default categories", () => {
    expect(DEFAULT_SECTION_TAG_COLOR_PALETTE).toEqual([
      { color: "#ef4444", description: "Red" },
      { color: "#f97316", description: "Orange" },
      { color: "#eab308", description: "Yellow" },
      { color: "#22c55e", description: "Green" },
      { color: "#06b6d4", description: "Cyan" },
      { color: "#3b82f6", description: "Blue" },
      { color: "#a855f7", description: "Purple" },
      { color: "#64748b", description: "Slate" },
    ]);
    expect(Object.isFrozen(DEFAULT_SECTION_TAG_COLOR_PALETTE)).toBe(true);
    expect(DEFAULT_SECTION_TAG_COLOR_PALETTE.every(Object.isFrozen)).toBe(true);
  });

  it("canonicalizes and freezes a complete host replacement palette", () => {
    const resolved = resolveSectionTagColorPalette([
      { color: "ABCDEF", description: "  Host ink  " },
      { color: "#123456", description: "Host slate" },
    ]);

    expect(resolved).toEqual([
      { color: "#abcdef", description: "Host ink" },
      { color: "#123456", description: "Host slate" },
    ]);
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(resolved.every(Object.isFrozen)).toBe(true);
  });

  it("accepts an empty host-owned palette", () => {
    const resolved = resolveSectionTagColorPalette([]);

    expect(resolved).toEqual([]);
    expect(Object.isFrozen(resolved)).toBe(true);
  });

  it("rejects incomplete, ambiguous, or unpaintable host categories", () => {
    expect(() => resolveSectionTagColorPalette([{ color: "blue", description: "Blue" }])).toThrow(
      /six-digit hex color/,
    );
    expect(() => resolveSectionTagColorPalette([{ color: "#123456", description: " " }])).toThrow(
      /non-empty description/,
    );
    expect(() =>
      resolveSectionTagColorPalette([
        { color: "#ABCDEF", description: "First" },
        { color: "abcdef", description: "Second" },
      ]),
    ).toThrow(/repeats color #abcdef/);
    expect(() => resolveSectionTagColorPalette([null] as never)).toThrow(/must be an object/);
  });

  it("normalizes document and action values without treating blank as none", () => {
    expect(normalizeSectionTagColor(null)).toBeNull();
    expect(normalizeSectionTagColor(" A1B2C3 ")).toBe("#a1b2c3");
    expect(() => normalizeSectionTagColor("")).toThrow(/six-digit hex color/);
    expect(() => normalizeSectionTagColor(false)).toThrow(/six-digit hex color/);
  });
});
