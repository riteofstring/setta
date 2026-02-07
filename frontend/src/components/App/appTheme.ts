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

type AppThemeHeadingSizes = {
  h1?: number | string;
  h2?: number | string;
  h3?: number | string;
  h4?: number | string;
};

type AppThemeTypography = {
  bodySize?: number | string;
  bodyLineHeight?: number | string;
  headingSizes?: AppThemeHeadingSizes;
  headingLineHeight?: number | string;
};

type AppThemeSpacing = {
  pagePaddingX?: number | string;
  pagePaddingY?: number | string;
  contentWidth?: number | string;
  cardPadding?: number | string;
  cardRadius?: number | string;
  stackGap?: number | string;
};

type AppThemeMotion = {
  durationMs?: number;
  delayMs?: number;
  staggerMs?: number;
  easing?: string;
};

type AppThemeShadows = {
  sm?: string;
  md?: string;
  lg?: string;
};

type AppThemeConfig = {
  mode?: AppThemeMode;
  className?: string;
  colors?: AppThemeColors | { light?: AppThemeColors; dark?: AppThemeColors };
  fonts?: AppThemeFonts;
  typography?: AppThemeTypography;
  spacing?: AppThemeSpacing;
  motion?: AppThemeMotion;
  shadows?: AppThemeShadows;
  vars?: Record<string, string | number>;
};

export type ResolvedAppMotion = {
  durationMs: number;
  delayMs: number;
  staggerMs: number;
  easing: string;
};

export type ResolvedAppTheme = {
  className: string | null;
  mode: "light" | "dark";
  colors: AppThemeColors;
  fonts: AppThemeFonts;
  typography: AppThemeTypography;
  spacing: AppThemeSpacing;
  motion: ResolvedAppMotion;
  shadows: AppThemeShadows;
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

const SHADOW_VAR_MAP: Record<keyof AppThemeShadows, string> = {
  sm: "--app-shadow-sm",
  md: "--app-shadow-md",
  lg: "--app-shadow-lg",
};

const DEFAULT_MOTION: ResolvedAppMotion = {
  durationMs: 220,
  delayMs: 0,
  staggerMs: 70,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
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

function resolveThemeTypography(
  raw: AppThemeConfig["typography"],
): AppThemeTypography {
  if (!raw || !isRecord(raw)) {
    return {};
  }

  const output: AppThemeTypography = {};
  if (typeof raw.bodySize === "number" || typeof raw.bodySize === "string") {
    output.bodySize = raw.bodySize;
  }
  if (
    typeof raw.bodyLineHeight === "number" ||
    typeof raw.bodyLineHeight === "string"
  ) {
    output.bodyLineHeight = raw.bodyLineHeight;
  }
  if (
    typeof raw.headingLineHeight === "number" ||
    typeof raw.headingLineHeight === "string"
  ) {
    output.headingLineHeight = raw.headingLineHeight;
  }

  const headingSizes = raw.headingSizes;
  if (headingSizes && isRecord(headingSizes)) {
    const resolvedHeadingSizes: AppThemeHeadingSizes = {};
    for (const key of ["h1", "h2", "h3", "h4"]) {
      const value = headingSizes[key];
      if (typeof value === "number" || typeof value === "string") {
        resolvedHeadingSizes[key] = value;
      }
    }
    if (Object.keys(resolvedHeadingSizes).length > 0) {
      output.headingSizes = resolvedHeadingSizes;
    }
  }

  return output;
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

function resolveThemeMotion(
  raw: AppThemeConfig["motion"],
): Partial<ResolvedAppMotion> {
  if (!raw || !isRecord(raw)) {
    return {};
  }
  const output: Partial<ResolvedAppMotion> = {};

  if (typeof raw.durationMs === "number") {
    output.durationMs = raw.durationMs;
  }
  if (typeof raw.delayMs === "number") {
    output.delayMs = raw.delayMs;
  }
  if (typeof raw.staggerMs === "number") {
    output.staggerMs = raw.staggerMs;
  }
  if (typeof raw.easing === "string" && raw.easing.trim().length > 0) {
    output.easing = raw.easing;
  }

  return output;
}

function resolveThemeShadows(raw: AppThemeConfig["shadows"]): AppThemeShadows {
  return extractStringMap<AppThemeShadows>(raw);
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

function applyAppVars(
  style: Record<string, string | number>,
  vars: unknown,
): void {
  if (!vars || !isRecord(vars)) {
    return;
  }
  for (const [key, value] of Object.entries(vars)) {
    if (!key.startsWith("--app-")) {
      continue;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      style[key] = value;
      continue;
    }
    if (typeof value === "number") {
      style[key] = `${value}px`;
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
  const typography = resolveThemeTypography(themeConfig?.typography);
  const spacing = resolveThemeSpacing(themeConfig?.spacing);
  const motion = {
    ...DEFAULT_MOTION,
    ...resolveThemeMotion(themeConfig?.motion),
  };
  const shadows = resolveThemeShadows(themeConfig?.shadows);
  const className =
    themeConfig && typeof themeConfig.className === "string"
      ? themeConfig.className
      : null;

  const style: Record<string, string | number> = {};
  applyVars(style, COLOR_VAR_MAP, colors);
  applyVars(style, FONT_VAR_MAP, fonts);
  applyVars(style, SPACING_VAR_MAP, spacing);
  applyVars(style, SHADOW_VAR_MAP, shadows);

  // Component-role tokens: stable override points beyond semantic colors.
  style["--app-button-bg"] = colors.accent ?? "";
  style["--app-button-bg-hover"] = colors.accentHover ?? colors.accent ?? "";
  style["--app-button-text"] = colors.accentText ?? colors.text ?? "";
  style["--app-button-disabled-bg"] = colors.surfaceAlt ?? colors.surface ?? "";
  style["--app-button-disabled-text"] = colors.muted ?? colors.text ?? "";

  style["--app-input-bg"] = colors.surface ?? "";
  style["--app-input-bg-hover"] = colors.surfaceAlt ?? colors.surface ?? "";
  style["--app-input-border"] = colors.border ?? "";
  style["--app-input-text"] = colors.text ?? "";
  style["--app-input-placeholder"] = colors.muted ?? "";
  style["--app-input-focus-border"] = colors.accent ?? "";
  style["--app-input-ring"] = colors.accent ?? "";

  style["--app-dropdown-bg"] = colors.surface ?? "";
  style["--app-dropdown-border"] = colors.border ?? "";
  style["--app-dropdown-text"] = colors.text ?? "";
  style["--app-dropdown-muted"] = colors.muted ?? "";

  style["--app-card-shadow"] =
    "var(--app-shadow-sm, 0 1px 2px 0 rgb(0 0 0 / 0.05))";
  style["--app-dropdown-shadow"] =
    "var(--app-shadow-lg, 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1))";

  applyAppVars(style, themeConfig?.vars);

  const resolvedBodyFontVar = style["--app-font-body"];
  if (typeof resolvedBodyFontVar === "string" && resolvedBodyFontVar.trim()) {
    style.fontFamily = resolvedBodyFontVar;
  }

  return {
    className,
    mode,
    colors,
    fonts,
    typography,
    spacing,
    motion,
    shadows,
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
