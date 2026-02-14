type Rgb = { r: number; g: number; b: number };

type DerivedSectionStyleTheme = {
  bg: string;
  panelBg: string;
  border: string;
  outline: string;
  text: string;
  mutedText: string;
};

const DERIVED_THEME_CACHE = new Map<string, DerivedSectionStyleTheme>();

function clampByte(x: number): number {
  if (x <= 0) {
    return 0;
  }
  if (x >= 255) {
    return 255;
  }
  return Math.round(x);
}

function parseHexColor(value: string): Rgb | null {
  const raw = value.trim().toLowerCase();
  const hex = raw.startsWith("#") ? raw.slice(1) : raw;
  if (hex.length !== 6) {
    return null;
  }
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return null;
  }
  return { r, g, b };
}

function toHexByte(x: number): string {
  const clamped = clampByte(x);
  return clamped.toString(16).padStart(2, "0");
}

function rgbToHex(rgb: Rgb): string {
  return `#${toHexByte(rgb.r)}${toHexByte(rgb.g)}${toHexByte(rgb.b)}`;
}

function mixSrgb(a: Rgb, b: Rgb, aWeight: number): Rgb {
  const w = aWeight;
  const inv = 1 - w;
  return {
    r: clampByte(a.r * w + b.r * inv),
    g: clampByte(a.g * w + b.g * inv),
    b: clampByte(a.b * w + b.b * inv),
  };
}

function srgbChannelToLinear(c: number): number {
  const x = c / 255;
  if (x <= 0.04045) {
    return x / 12.92;
  }
  return Math.pow((x + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb: Rgb): number {
  const r = srgbChannelToLinear(rgb.r);
  const g = srgbChannelToLinear(rgb.g);
  const b = srgbChannelToLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function pickReadableTextColor(bg: Rgb): Rgb {
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };
  return contrastRatio(black, bg) >= contrastRatio(white, bg) ? black : white;
}

/**
 * Derive a readable (light/dark mode aware) section chrome theme from a single base hex color.
 * Returns null when the input is not a valid #RRGGBB hex color.
 */
export function deriveSectionStyleTheme(
  styleColor: string,
  darkMode: boolean,
): DerivedSectionStyleTheme | null {
  const normalized = styleColor.trim().toLowerCase();
  const cacheKey = `${darkMode ? "d" : "l"}:${normalized}`;
  const cached = DERIVED_THEME_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const base = parseHexColor(normalized);
  if (!base) {
    return null;
  }

  const mixTarget = darkMode
    ? { r: 0, g: 0, b: 0 }
    : { r: 255, g: 255, b: 255 };

  // V1 rules from docs/temporary/section-style-colors.md
  const bgRgb = mixSrgb(base, mixTarget, darkMode ? 0.18 : 0.12);
  // Slightly stronger tint used for nested strips/panels that need separation from section bg.
  const panelBgRgb = mixSrgb(base, mixTarget, darkMode ? 0.26 : 0.2);
  const borderRgb = mixSrgb(base, mixTarget, darkMode ? 0.4 : 0.35);
  // Outline should be more saturated than the border so it reads as a chrome/selection accent.
  const outlineRgb = mixSrgb(base, mixTarget, darkMode ? 0.7 : 0.65);
  const textRgb = pickReadableTextColor(bgRgb);
  const mutedRgb = mixSrgb(textRgb, bgRgb, 0.45);

  const theme: DerivedSectionStyleTheme = {
    bg: rgbToHex(bgRgb),
    panelBg: rgbToHex(panelBgRgb),
    border: rgbToHex(borderRgb),
    outline: rgbToHex(outlineRgb),
    text: rgbToHex(textRgb),
    mutedText: rgbToHex(mutedRgb),
  };
  DERIVED_THEME_CACHE.set(cacheKey, theme);
  return theme;
}
