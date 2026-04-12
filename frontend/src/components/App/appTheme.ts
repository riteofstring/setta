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

type AppThemeTextScale = {
  xs?: number | string;
  sm?: number | string;
  base?: number | string;
  lg?: number | string;
  xl?: number | string;
  "2xl"?: number | string;
  "3xl"?: number | string;
  "4xl"?: number | string;
};

type AppThemeTypography = {
  bodySize?: number | string;
  bodyLineHeight?: number | string;
  headingSizes?: AppThemeHeadingSizes;
  headingLineHeight?: number | string;
  scale?: AppThemeTextScale;
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

type AppThemeButtonTokens = {
  bg?: string;
  bgHover?: string;
  text?: string;
  ring?: string;
  disabledBg?: string;
  disabledText?: string;
};

type AppThemeInputTokens = {
  bg?: string;
  bgHover?: string;
  border?: string;
  text?: string;
  placeholder?: string;
  focusBorder?: string;
  ring?: string;
};

type AppThemeDropdownTokens = {
  bg?: string;
  border?: string;
  text?: string;
  muted?: string;
  shadow?: string;
};

type AppThemeCardTokens = {
  shadow?: string;
};

type AppThemePageTokens = {
  bgImage?: string;
};

type AppThemeComponents = {
  button?: AppThemeButtonTokens;
  input?: AppThemeInputTokens;
  dropdown?: AppThemeDropdownTokens;
  card?: AppThemeCardTokens;
  page?: AppThemePageTokens;
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
  components?: AppThemeComponents;
  vars?: Record<string, string | number>;
};

type ResolvedAppMotion = {
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

const TEXT_SCALE_VAR_MAP: Record<keyof AppThemeTextScale, string> = {
  xs: "--app-text-xs",
  sm: "--app-text-sm",
  base: "--app-text-base",
  lg: "--app-text-lg",
  xl: "--app-text-xl",
  "2xl": "--app-text-2xl",
  "3xl": "--app-text-3xl",
  "4xl": "--app-text-4xl",
};

const DEFAULT_TEXT_SCALE: Record<keyof AppThemeTextScale, string> = {
  xs: "0.75rem",
  sm: "0.875rem",
  base: "1rem",
  lg: "1.125rem",
  xl: "1.25rem",
  "2xl": "1.5rem",
  "3xl": "1.875rem",
  "4xl": "2.25rem",
};

const COMPONENT_BUTTON_VAR_MAP: Record<keyof AppThemeButtonTokens, string> = {
  bg: "--app-button-bg",
  bgHover: "--app-button-bg-hover",
  text: "--app-button-text",
  ring: "--app-button-ring",
  disabledBg: "--app-button-disabled-bg",
  disabledText: "--app-button-disabled-text",
};

const COMPONENT_INPUT_VAR_MAP: Record<keyof AppThemeInputTokens, string> = {
  bg: "--app-input-bg",
  bgHover: "--app-input-bg-hover",
  border: "--app-input-border",
  text: "--app-input-text",
  placeholder: "--app-input-placeholder",
  focusBorder: "--app-input-focus-border",
  ring: "--app-input-ring",
};

const COMPONENT_DROPDOWN_VAR_MAP: Record<keyof AppThemeDropdownTokens, string> =
  {
    bg: "--app-dropdown-bg",
    border: "--app-dropdown-border",
    text: "--app-dropdown-text",
    muted: "--app-dropdown-muted",
    shadow: "--app-dropdown-shadow",
  };

const COMPONENT_CARD_VAR_MAP: Record<keyof AppThemeCardTokens, string> = {
  shadow: "--app-card-shadow",
};

const COMPONENT_PAGE_VAR_MAP: Record<keyof AppThemePageTokens, string> = {
  bgImage: "--app-page-bg-image",
};

type AppThemeStyleDefault =
  | {
      cssVar: string;
      colorKeys: ReadonlyArray<keyof AppThemeColors>;
    }
  | {
      cssVar: string;
      value: string;
    };

const COMPONENT_TOKEN_VAR_ENTRIES = [
  ["button", COMPONENT_BUTTON_VAR_MAP],
  ["input", COMPONENT_INPUT_VAR_MAP],
  ["dropdown", COMPONENT_DROPDOWN_VAR_MAP],
  ["card", COMPONENT_CARD_VAR_MAP],
  ["page", COMPONENT_PAGE_VAR_MAP],
] as const;

const DEFAULT_COMPONENT_STYLE_VALUES: ReadonlyArray<AppThemeStyleDefault> = [
  { cssVar: "--app-button-bg", colorKeys: ["accent"] },
  { cssVar: "--app-button-bg-hover", colorKeys: ["accentHover", "accent"] },
  { cssVar: "--app-button-text", colorKeys: ["accentText", "text"] },
  { cssVar: "--app-button-ring", colorKeys: ["accent"] },
  {
    cssVar: "--app-button-disabled-bg",
    colorKeys: ["surfaceAlt", "surface"],
  },
  { cssVar: "--app-button-disabled-text", colorKeys: ["muted", "text"] },
  { cssVar: "--app-input-bg", colorKeys: ["surface"] },
  { cssVar: "--app-input-bg-hover", colorKeys: ["surfaceAlt", "surface"] },
  { cssVar: "--app-input-border", colorKeys: ["border"] },
  { cssVar: "--app-input-text", colorKeys: ["text"] },
  { cssVar: "--app-input-placeholder", colorKeys: ["muted"] },
  { cssVar: "--app-input-focus-border", colorKeys: ["accent"] },
  { cssVar: "--app-input-ring", colorKeys: ["accent"] },
  { cssVar: "--app-dropdown-bg", colorKeys: ["surface"] },
  { cssVar: "--app-dropdown-border", colorKeys: ["border"] },
  { cssVar: "--app-dropdown-text", colorKeys: ["text"] },
  { cssVar: "--app-dropdown-muted", colorKeys: ["muted"] },
  {
    cssVar: "--app-card-shadow",
    value: "var(--app-shadow-sm, 0 1px 2px 0 rgb(0 0 0 / 0.05))",
  },
  {
    cssVar: "--app-dropdown-shadow",
    value:
      "var(--app-shadow-lg, 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1))",
  },
  {
    cssVar: "--app-page-bg-image",
    value:
      "radial-gradient(circle at top, color-mix(in srgb, var(--app-accent) 10%, transparent), transparent 45%), linear-gradient(180deg, color-mix(in srgb, var(--app-surface) 70%, transparent), color-mix(in srgb, var(--app-surface-alt) 60%, transparent))",
  },
];

const DEFAULT_MOTION: ResolvedAppMotion = {
  durationMs: 220,
  delayMs: 0,
  staggerMs: 70,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
};

const TYPOGRAPHY_VALUE_KEYS = [
  "bodySize",
  "bodyLineHeight",
  "headingLineHeight",
] as const satisfies ReadonlyArray<keyof AppThemeTypography>;

const HEADING_SIZE_KEYS = [
  "h1",
  "h2",
  "h3",
  "h4",
] as const satisfies ReadonlyArray<keyof AppThemeHeadingSizes>;

const TEXT_SCALE_KEYS = [
  "xs",
  "sm",
  "base",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "4xl",
] as const satisfies ReadonlyArray<keyof AppThemeTextScale>;

type ThemeScalarRecord = Record<string, number | string | undefined>;

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

function resolveThemeClassName(theme: AppThemeConfig | null): string | null {
  return typeof theme?.className === "string" ? theme.className : null;
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

function resolveThemeColorsWithDefaults(
  raw: AppThemeConfig["colors"],
  mode: "light" | "dark",
): AppThemeColors {
  return {
    ...DEFAULT_COLORS_BY_MODE[mode],
    ...resolveThemeColors(raw, mode),
  };
}

function resolveThemeFonts(raw: AppThemeConfig["fonts"]): AppThemeFonts {
  return extractStringMap<AppThemeFonts>(raw);
}

function resolveThemeScalarValues<T extends ThemeScalarRecord>(
  raw: unknown,
  keys: ReadonlyArray<keyof T>,
): Partial<T> {
  if (!raw || !isRecord(raw)) {
    return {};
  }
  const output: Partial<T> = {};
  for (const key of keys) {
    const value = raw[key as string];
    if (typeof value === "number" || typeof value === "string") {
      output[key] = value as T[keyof T];
    }
  }
  return output;
}

function resolveThemeTypography(
  raw: AppThemeConfig["typography"],
): AppThemeTypography {
  if (!raw || !isRecord(raw)) {
    return {};
  }

  const output: AppThemeTypography =
    resolveThemeScalarValues<AppThemeTypography>(raw, TYPOGRAPHY_VALUE_KEYS);
  const headingSizes = resolveThemeScalarValues<AppThemeHeadingSizes>(
    raw.headingSizes,
    HEADING_SIZE_KEYS,
  );
  const scale = resolveThemeScalarValues<AppThemeTextScale>(
    raw.scale,
    TEXT_SCALE_KEYS,
  );
  if (Object.keys(headingSizes).length > 0) {
    output.headingSizes = headingSizes;
  }
  if (Object.keys(scale).length > 0) {
    output.scale = scale;
  }
  return output;
}

function resolveThemeSpacing(raw: AppThemeConfig["spacing"]): AppThemeSpacing {
  return resolveThemeScalarValues<AppThemeSpacing>(
    raw,
    Object.keys(SPACING_VAR_MAP) as ReadonlyArray<keyof AppThemeSpacing>,
  );
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

function resolveThemeComponentTokens<
  T extends Record<string, string | undefined>,
>(raw: unknown, keys: ReadonlyArray<keyof T>): Partial<T> {
  if (!raw || !isRecord(raw)) {
    return {};
  }
  const output: Record<string, string> = {};
  for (const key of keys) {
    const value = raw[key as string];
    if (typeof value === "string" && value.trim().length > 0) {
      output[key as string] = value;
    }
  }
  return output as Partial<T>;
}

function resolveThemeComponents(
  raw: AppThemeConfig["components"],
): AppThemeComponents {
  if (!raw || !isRecord(raw)) {
    return {};
  }
  return {
    button: resolveThemeComponentTokens<AppThemeButtonTokens>(raw.button, [
      "bg",
      "bgHover",
      "text",
      "ring",
      "disabledBg",
      "disabledText",
    ]),
    input: resolveThemeComponentTokens<AppThemeInputTokens>(raw.input, [
      "bg",
      "bgHover",
      "border",
      "text",
      "placeholder",
      "focusBorder",
      "ring",
    ]),
    dropdown: resolveThemeComponentTokens<AppThemeDropdownTokens>(
      raw.dropdown,
      ["bg", "border", "text", "muted", "shadow"],
    ),
    card: resolveThemeComponentTokens<AppThemeCardTokens>(raw.card, ["shadow"]),
    page: resolveThemeComponentTokens<AppThemePageTokens>(raw.page, [
      "bgImage",
    ]),
  };
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

function applyTextScaleVars(
  style: Record<string, string | number>,
  typography: AppThemeTypography,
): void {
  for (const [scaleKey, cssVar] of Object.entries(TEXT_SCALE_VAR_MAP)) {
    const key = scaleKey as keyof AppThemeTextScale;
    style[cssVar] = DEFAULT_TEXT_SCALE[key];
  }

  const overrides = typography.scale;
  if (!overrides) {
    return;
  }
  for (const [scaleKey, cssVar] of Object.entries(TEXT_SCALE_VAR_MAP)) {
    const key = scaleKey as keyof AppThemeTextScale;
    const value = overrides[key];
    if (typeof value === "string" && value.trim().length > 0) {
      style[cssVar] = value;
    } else if (typeof value === "number") {
      style[cssVar] = `${value}px`;
    }
  }
}

function resolveFirstThemeColor(
  colors: AppThemeColors,
  keys: ReadonlyArray<keyof AppThemeColors>,
): string {
  for (const key of keys) {
    const value = colors[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return "";
}

function applyDefaultComponentStyleValues(
  style: Record<string, string | number>,
  colors: AppThemeColors,
): void {
  for (const entry of DEFAULT_COMPONENT_STYLE_VALUES) {
    style[entry.cssVar] =
      "value" in entry
        ? entry.value
        : resolveFirstThemeColor(colors, entry.colorKeys);
  }
}

function applyComponentTokenVars(
  style: Record<string, string | number>,
  components: AppThemeComponents,
): void {
  for (const [componentKey, map] of COMPONENT_TOKEN_VAR_ENTRIES) {
    const tokens = components[componentKey];
    if (tokens) {
      applyVars(style, map, tokens as Record<string, string | undefined>);
    }
  }
}

type ThemeStyleInputs = {
  colors: AppThemeColors;
  fonts: AppThemeFonts;
  typography: AppThemeTypography;
  spacing: AppThemeSpacing;
  shadows: AppThemeShadows;
  components: AppThemeComponents;
  vars: AppThemeConfig["vars"];
};

function buildThemeStyle(
  inputs: ThemeStyleInputs,
): Record<string, string | number> {
  const { colors, fonts, typography, spacing, shadows, components, vars } =
    inputs;
  const style: Record<string, string | number> = {};
  applyVars(style, COLOR_VAR_MAP, colors);
  applyVars(style, FONT_VAR_MAP, fonts);
  applyVars(style, SPACING_VAR_MAP, spacing);
  applyVars(style, SHADOW_VAR_MAP, shadows);
  applyTextScaleVars(style, typography);
  applyDefaultComponentStyleValues(style, colors);
  applyComponentTokenVars(style, components);
  applyAppVars(style, vars);

  const resolvedBodyFontVar = style["--app-font-body"];
  if (typeof resolvedBodyFontVar === "string" && resolvedBodyFontVar.trim()) {
    style.fontFamily = resolvedBodyFontVar;
  }

  return style;
}

type ResolvedThemeParts = Omit<ResolvedAppTheme, "className" | "mode">;

function resolveThemeParts(
  themeConfig: AppThemeConfig | null,
  mode: "light" | "dark",
): ResolvedThemeParts {
  const colors = resolveThemeColorsWithDefaults(themeConfig?.colors, mode);
  const fonts = resolveThemeFonts(themeConfig?.fonts);
  const typography = resolveThemeTypography(themeConfig?.typography);
  const spacing = resolveThemeSpacing(themeConfig?.spacing);
  const motion = {
    ...DEFAULT_MOTION,
    ...resolveThemeMotion(themeConfig?.motion),
  };
  const shadows = resolveThemeShadows(themeConfig?.shadows);
  const components = resolveThemeComponents(themeConfig?.components);
  const style = buildThemeStyle({
    colors,
    fonts,
    typography,
    spacing,
    shadows,
    components,
    vars: themeConfig?.vars,
  });

  return {
    colors,
    fonts,
    typography,
    spacing,
    motion,
    shadows,
    style,
  };
}

function resolveThemeConfig(theme: unknown): AppThemeConfig | null {
  return isRecord(theme) ? (theme as AppThemeConfig) : null;
}

export function resolveAppTheme(
  theme: unknown,
  options: { prefersDark?: boolean } = {},
): ResolvedAppTheme {
  const themeConfig = resolveThemeConfig(theme);
  const mode = resolveThemeMode(themeConfig, options.prefersDark);
  return {
    className: resolveThemeClassName(themeConfig),
    mode,
    ...resolveThemeParts(themeConfig, mode),
  };
}
