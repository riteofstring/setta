// Characterization lock: expected values were produced by executing the frozen reference's
// sectionStyleColors.ts (043d3b2e9) directly under Node. A diff here means the derivation
// algorithm changed, which is a parity change.
import { describe, expect, it } from "vitest";
import { deriveSectionStyleTheme } from "./sectionStyleColors";
import { resolveSectionStyleVars } from "./sectionStyleVars";

function parseHexRgb(value: string) {
  return [1, 3, 5].map((start) => Number.parseInt(value.slice(start, start + 2), 16));
}

function linearizeSrgbByte(value: number) {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

function relativeLuminance(value: string) {
  const [red = 0, green = 0, blue = 0] = parseHexRgb(value).map(linearizeSrgbByte);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function getContrastRatio(left: string, right: string) {
  const leftLuminance = relativeLuminance(left);
  const rightLuminance = relativeLuminance(right);
  const lighter = Math.max(leftLuminance, rightLuminance);
  const darker = Math.min(leftLuminance, rightLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function getFourBitRgbCube() {
  const channels = Array.from({ length: 16 }, (_, index) => index.toString(16).repeat(2));
  return channels.flatMap((red) =>
    channels.flatMap((green) => channels.map((blue) => `#${red}${green}${blue}`)),
  );
}

describe("deriveSectionStyleTheme", () => {
  it("matches the reference derivation for a blue style color in light mode", () => {
    expect(deriveSectionStyleTheme("#3b82f6", false)).toEqual({
      bg: "#e7f0fe",
      panelBg: "#d8e6fd",
      border: "#bad3fc",
      outline: "#80aef9",
      text: "#000000",
      mutedText: "#7f848c",
    });
  });

  it("matches the reference derivation for a blue style color in dark mode", () => {
    expect(deriveSectionStyleTheme("#3b82f6", true)).toEqual({
      bg: "#0b172c",
      panelBg: "#0f2240",
      border: "#183462",
      outline: "#295bac",
      text: "#ffffff",
      mutedText: "#797f8b",
    });
  });

  it("matches the reference derivation for a green style color in both modes", () => {
    expect(deriveSectionStyleTheme("#10b981", false)).toEqual({
      bg: "#e2f7f0",
      panelBg: "#cff1e6",
      border: "#abe7d3",
      outline: "#64d2ad",
      text: "#000000",
      mutedText: "#7c8884",
    });
    expect(deriveSectionStyleTheme("#10b981", true)).toEqual({
      bg: "#032117",
      panelBg: "#043022",
      border: "#064a34",
      outline: "#0b825a",
      text: "#ffffff",
      mutedText: "#74857f",
    });
  });

  it("returns null for non-#RRGGBB input", () => {
    expect(deriveSectionStyleTheme("not-a-color", false)).toBeNull();
    expect(deriveSectionStyleTheme("#fff", false)).toBeNull();
  });

  it("keeps primary semantic text at WCAG AA contrast across the four-bit RGB cube", () => {
    for (const styleColor of getFourBitRgbCube()) {
      for (const darkMode of [false, true]) {
        const theme = deriveSectionStyleTheme(styleColor, darkMode);
        expect(theme).not.toBeNull();
        if (theme) {
          expect(getContrastRatio(theme.text, theme.bg)).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});

describe("resolveSectionStyleVars", () => {
  it("maps the derived theme onto the six section-style CSS variables", () => {
    expect(resolveSectionStyleVars(deriveSectionStyleTheme("#3b82f6", true))).toEqual({
      "--setta-section-style-bg": "#0b172c",
      "--setta-section-style-panel-bg": "#0f2240",
      "--setta-section-style-border": "#183462",
      "--setta-section-style-outline": "#295bac",
      "--setta-section-style-text": "#ffffff",
      "--setta-section-style-muted-text": "#797f8b",
    });
  });

  it("passes null through as undefined", () => {
    expect(resolveSectionStyleVars(null)).toBeUndefined();
  });
});
