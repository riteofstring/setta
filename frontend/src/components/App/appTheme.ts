type AppThemeMode = "light" | "dark" | "auto";

type AppThemeColors = {
  background?: string;
  surface?: string;
  surfaceAlt?: string;
  headerBackground?: string;
  headerText?: string;
  text?: string;
  muted?: string;
  border?: string;
  cardBackground?: string;
  cardBorder?: string;
  accent?: string;
  accentHover?: string;
  accentText?: string;
};

type AppThemeFonts = {
  body?: string;
  heading?: string;
  mono?: string;
};

type AppThemeSpacing = {
  pagePaddingX?: number | string;
  pagePaddingY?: number | string;
  contentWidth?: number | string;
  cardPadding?: number | string;
  cardRadius?: number | string;
  stackGap?: number | string;
};

type AppThemeConfig = {
  mode?: AppThemeMode;
  className?: string;
  colors?: AppThemeColors | { light?: AppThemeColors; dark?: AppThemeColors };
  fonts?: AppThemeFonts;
  spacing?: AppThemeSpacing;
};

export type ResolvedAppTheme = {
  className: string | null;
  mode: "light" | "dark";
  colors: AppThemeColors;
  fonts: AppThemeFonts;
  spacing: AppThemeSpacing;
  style: Record<string, string | number>;
};

const COLOR_VAR_MAP: Record<keyof AppThemeColors, string> = {
  background: "--app-background",
  surface: "--app-surface",
  surfaceAlt: "--app-surface-alt",
  headerBackground: "--app-header-bg",
  headerText: "--app-header-text",
  text: "--app-text",
  muted: "--app-muted",
  border: "--app-border",
  cardBackground: "--app-card-bg",
  cardBorder: "--app-card-border",
  accent: "--app-accent",
  accentHover: "--app-accent-hover",
  accentText: "--app-accent-text",
};

const DEFAULT_COLORS_BY_MODE: Record<"light" | "dark", AppThemeColors> = {
  light: {
    background: "#f8fafc",
    surface: "#ffffff",
    surfaceAlt: "#f1f5f9",
    headerBackground: "rgba(255, 255, 255, 0.9)",
    headerText: "#0f172a",
    text: "#0f172a",
    muted: "#64748b",
    border: "#e2e8f0",
    cardBackground: "rgba(255, 255, 255, 0.8)",
    cardBorder: "rgba(226, 232, 240, 0.8)",
    accent: "#2563eb",
    accentHover: "#1d4ed8",
    accentText: "#ffffff",
  },
  dark: {
    background: "#020617",
    surface: "rgba(15, 23, 42, 0.85)",
    surfaceAlt: "rgba(30, 41, 59, 0.9)",
    headerBackground: "rgba(2, 6, 23, 0.8)",
    headerText: "#f8fafc",
    text: "#e2e8f0",
    muted: "#94a3b8",
    border: "rgba(148, 163, 184, 0.25)",
    cardBackground: "rgba(15, 23, 42, 0.65)",
    cardBorder: "rgba(51, 65, 85, 0.7)",
    accent: "#3b82f6",
    accentHover: "#60a5fa",
    accentText: "#ffffff",
  },
};

const FONT_VAR_MAP: Record<keyof AppThemeFonts, string> = {
  body: "--app-font-body",
  heading: "--app-font-heading",
  mono: "--app-font-mono",
};

const SPACING_VAR_MAP: Record<keyof AppThemeSpacing, string> = {
  pagePaddingX: "--app-page-padding-x",
  pagePaddingY: "--app-page-padding-y",
  contentWidth: "--app-content-width",
  cardPadding: "--app-card-padding",
  cardRadius: "--app-card-radius",
  stackGap: "--app-stack-gap",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolvePreferredDarkMode(): boolean {
  if (typeof document !== "undefined") {
    return document.documentElement.classList.contains("dark");
  }
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  ) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return false;
}

function resolveThemeMode(
  theme: AppThemeConfig | null,
  prefersDark?: boolean,
): "light" | "dark" {
  const mode = theme?.mode;
  if (mode === "light") {
    return "light";
  }
  if (mode === "dark") {
    return "dark";
  }
  const systemPrefersDark =
    typeof prefersDark === "boolean" ? prefersDark : resolvePreferredDarkMode();
  return systemPrefersDark ? "dark" : "light";
}

function resolveThemeColors(
  raw: AppThemeConfig["colors"],
  mode: "light" | "dark",
): AppThemeColors {
  if (!raw || !isRecord(raw)) {
    return {};
  }
  const hasVariants =
    "light" in raw ||
    "dark" in raw ||
    Boolean((raw as { light?: unknown }).light) ||
    Boolean((raw as { dark?: unknown }).dark);
  if (hasVariants) {
    const variant =
      mode === "dark" ? raw.dark ?? raw.light : raw.light ?? raw.dark;
    return extractStringMap<AppThemeColors>(variant);
  }
  return extractStringMap<AppThemeColors>(raw);
}

function resolveThemeFonts(raw: AppThemeConfig["fonts"]): AppThemeFonts {
  return extractStringMap<AppThemeFonts>(raw);
}

function resolveThemeSpacing(raw: AppThemeConfig["spacing"]): AppThemeSpacing {
  if (!raw || !isRecord(raw)) {
    return {};
  }
  const output: AppThemeSpacing = {};
  for (const key of Object.keys(SPACING_VAR_MAP)) {
    const value = raw[key];
    if (typeof value === "number" || typeof value === "string") {
      output[key as keyof AppThemeSpacing] = value;
    }
  }
  return output;
}

function extractStringMap<T extends Record<string, string | undefined>>(
  raw: unknown,
): T {
  if (!raw || !isRecord(raw)) {
    return {} as T;
  }
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") {
      output[key] = value;
    }
  }
  return output as T;
}

function applyVars(
  style: Record<string, string | number>,
  map: Record<string, string>,
  values: Record<string, string | number | undefined>,
): void {
  for (const [key, cssVar] of Object.entries(map)) {
    const value = values[key];
    if (typeof value === "string" && value.trim().length > 0) {
      style[cssVar] = value;
    } else if (typeof value === "number") {
      style[cssVar] = `${value}px`;
    }
  }
}

export function resolveAppTheme(
  theme: unknown,
  options: { prefersDark?: boolean } = {},
): ResolvedAppTheme {
  const themeConfig = isRecord(theme) ? (theme as AppThemeConfig) : null;
  const mode = resolveThemeMode(themeConfig, options.prefersDark);
  const overrideColors = resolveThemeColors(themeConfig?.colors, mode);
  const colors: AppThemeColors = {
    ...DEFAULT_COLORS_BY_MODE[mode],
    ...overrideColors,
  };
  const fonts = resolveThemeFonts(themeConfig?.fonts);
  const spacing = resolveThemeSpacing(themeConfig?.spacing);
  const className =
    themeConfig && typeof themeConfig.className === "string"
      ? themeConfig.className
      : null;

  const style: Record<string, string | number> = {};
  applyVars(style, COLOR_VAR_MAP, colors);
  applyVars(style, FONT_VAR_MAP, fonts);
  applyVars(style, SPACING_VAR_MAP, spacing);
  if (fonts.body) {
    style.fontFamily = fonts.body;
  }

  return {
    className,
    mode,
    colors,
    fonts,
    spacing,
    style,
  };
}

function getThemeSpacingValue(
  value: number | string | undefined,
  fallback: number,
): number | string {
  if (typeof value === "number" || typeof value === "string") {
    return value;
  }
  return fallback;
}
