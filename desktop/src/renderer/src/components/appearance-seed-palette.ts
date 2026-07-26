import type {
  AppearanceColorScheme,
  AppearanceSettings,
  AppearanceTailwindPalette,
} from "@generated/backend";

const seedPaletteStops = [
  { chroma: 0.0071, lightness: 0.9574, name: "setta50" },
  { chroma: 0.013, lightness: 0.9085, name: "setta100" },
  { chroma: 0.0208, lightness: 0.8575, name: "setta150" },
  { chroma: 0.0292, lightness: 0.8057, name: "setta200" },
  { chroma: 0.0439, lightness: 0.7167, name: "setta300" },
  { chroma: 0.0618, lightness: 0.6255, name: "setta400" },
  { chroma: 0.0651, lightness: 0.5216, name: "setta500" },
  { chroma: 0.0508, lightness: 0.4311, name: "setta600" },
  { chroma: 0.0381, lightness: 0.3324, name: "setta700" },
  { chroma: 0.0317, lightness: 0.2903, name: "setta750" },
  { chroma: 0.0254, lightness: 0.2458, name: "setta800" },
  { chroma: 0.0198, lightness: 0.2162, name: "setta850" },
  { chroma: 0.0158, lightness: 0.1903, name: "setta860" },
  { chroma: 0.0141, lightness: 0.1797, name: "setta875" },
  { chroma: 0.0125, lightness: 0.1631, name: "setta900" },
  { chroma: 0.0086, lightness: 0.1471, name: "setta925" },
  { chroma: 0.007, lightness: 0.1281, name: "setta950" },
  { chroma: 0.0051, lightness: 0.0697, name: "setta975" },
] as const satisfies Array<{
  chroma: number;
  lightness: number;
  name: keyof AppearanceTailwindPalette;
}>;

export const seedPreviewStops = [
  "setta50",
  "setta100",
  "setta200",
  "setta300",
  "setta500",
  "setta700",
  "setta850",
  "setta950",
  "setta975",
] as const satisfies Array<keyof AppearanceTailwindPalette>;

const accessibleBlack = "oklch(0.0000 0.0000 0.00)";
const accessibleWhite = "oklch(1.0000 0.0000 0.00)";

export function settingsFromSeed(
  settings: AppearanceSettings,
  seedColor: string,
): AppearanceSettings {
  const tailwind = tailwindPaletteFromSeed(seedColor);
  return {
    ...settings,
    dark: darkSchemeFromTailwind(tailwind, settings.dark.status, settings.dark.accent),
  };
}

export function seedPalettePreview(seedColor: string): string[] {
  const tailwind = tailwindPaletteFromSeed(seedColor);
  return seedPreviewStops.map((name) => tailwind[name]);
}

function tailwindPaletteFromSeed(seedColor: string): AppearanceTailwindPalette {
  const seed = parseOKLCHSeed(seedColor);
  if (!seed) {
    throw new Error("Seed color must be an OKLCH value");
  }
  const chromaFactor = Math.min(Math.max(seed.chroma / 0.1292, 0.45), 1.35);
  const palette: Partial<AppearanceTailwindPalette> = {};
  for (const { chroma, lightness, name } of seedPaletteStops) {
    palette[name] = formatOKLCH(lightness, chroma * chromaFactor, seed.hue);
  }
  return palette as AppearanceTailwindPalette;
}

function darkSchemeFromTailwind(
  tailwind: AppearanceTailwindPalette,
  status: AppearanceColorScheme["status"],
  accent: AppearanceColorScheme["accent"],
): AppearanceColorScheme {
  const mutedForeground = firstReadableForeground(
    [tailwind.setta875, tailwind.setta850],
    tailwind.setta400,
    tailwind.setta300,
    tailwind.setta200,
    tailwind.setta100,
    tailwind.setta50,
  );
  return {
    accent,
    shadcn: {
      accent: tailwind.setta850,
      accentForeground: tailwind.setta100,
      background: tailwind.setta875,
      border: tailwind.setta850,
      card: tailwind.setta850,
      cardForeground: tailwind.setta100,
      destructive: status.critical,
      destructiveForeground: safeHighContrastForeground(status.critical, status.criticalForeground),
      foreground: tailwind.setta100,
      input: tailwind.setta850,
      muted: tailwind.setta850,
      mutedForeground,
      popover: tailwind.setta850,
      popoverForeground: tailwind.setta100,
      primary: tailwind.setta300,
      primaryForeground: highContrastForeground(tailwind.setta300),
      ring: tailwind.setta400,
      secondary: tailwind.setta850,
      secondaryForeground: tailwind.setta100,
      sidebar: tailwind.setta850,
      sidebarAccent: tailwind.setta700,
      sidebarAccentForeground: highContrastForeground(tailwind.setta700),
      sidebarForeground: tailwind.setta100,
    },
    status: {
      ...status,
      alertForeground: safeHighContrastForeground(status.alert, status.alertForeground),
      criticalForeground: safeHighContrastForeground(status.critical, status.criticalForeground),
      infoForeground: safeHighContrastForeground(status.info, status.infoForeground),
      successForeground: safeHighContrastForeground(status.success, status.successForeground),
      warningForeground: safeHighContrastForeground(status.warning, status.warningForeground),
    },
    tailwind,
  };
}

export function isOKLCHColor(value: string): boolean {
  return parseOKLCHSeed(value) !== null;
}

function parseOKLCHSeed(value: string): { chroma: number; hue: number } | null {
  const match = value.trim().match(/^oklch\(\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*\)$/i);
  if (!match) {
    return null;
  }
  const chroma = Number(match[2]);
  const hue = Number(match[3]);
  if (!Number.isFinite(chroma) || !Number.isFinite(hue)) {
    return null;
  }
  return { chroma, hue: ((hue % 360) + 360) % 360 };
}

function formatOKLCH(lightness: number, chroma: number, hue: number): string {
  return `oklch(${lightness.toFixed(4)} ${chroma.toFixed(4)} ${hue.toFixed(2)})`;
}

function bestReadableForeground(background: string, first: string, second: string): string {
  return contrastRatio(first, background) >= contrastRatio(second, background) ? first : second;
}

function highContrastForeground(background: string): string {
  return bestReadableForeground(background, accessibleWhite, accessibleBlack);
}

function safeHighContrastForeground(background: string, fallback: string): string {
  try {
    return highContrastForeground(background);
  } catch {
    return fallback;
  }
}

function firstReadableForeground(backgrounds: string[], ...candidates: string[]): string {
  for (const candidate of candidates) {
    if (minContrastRatio(candidate, backgrounds) >= 4.5) {
      return candidate;
    }
  }
  return candidates.reduce((best, candidate) =>
    minContrastRatio(candidate, backgrounds) > minContrastRatio(best, backgrounds)
      ? candidate
      : best,
  );
}

function minContrastRatio(foreground: string, backgrounds: string[]): number {
  return Math.min(...backgrounds.map((background) => contrastRatio(foreground, background)));
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(parseOKLCHColor(foreground));
  const backgroundLuminance = relativeLuminance(parseOKLCHColor(background));
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseOKLCHColor(value: string): { chroma: number; hue: number; lightness: number } {
  const match = /^oklch\(([^ ]+) ([^ ]+) ([^)]+)\)$/.exec(value.trim());
  if (!match?.[1] || !match[2] || !match[3]) {
    throw new Error(`Invalid OKLCH color: ${value}`);
  }
  return {
    chroma: Number.parseFloat(match[2]),
    hue: Number.parseFloat(match[3]),
    lightness: Number.parseFloat(match[1]),
  };
}

function relativeLuminance({
  chroma,
  hue,
  lightness,
}: {
  chroma: number;
  hue: number;
  lightness: number;
}): number {
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
