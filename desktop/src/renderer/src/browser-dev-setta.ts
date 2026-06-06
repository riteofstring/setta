import type {
  AppearancePreset,
  AppearancePresetID,
  AppearancePresetList,
  AppearanceSettings,
  AppearanceTailwindPalette,
  CodexAccountState,
  CodexLoginState,
  WorkspaceSession,
} from "@generated/backend";
import { appearancePresetIDValues } from "@generated/backend";
import type { SettaAPI } from "@shared/types";
import tailwindThemeCSS from "tailwindcss/theme.css?raw";

const settaTailwind = {
  setta50: "oklch(0.9574 0.0071 267.38)",
  setta100: "oklch(0.9085 0.0130 263.02)",
  setta150: "oklch(0.8575 0.0208 262.99)",
  setta200: "oklch(0.8057 0.0292 262.95)",
  setta300: "oklch(0.7167 0.0439 264.25)",
  setta400: "oklch(0.6255 0.0618 263.97)",
  setta500: "oklch(0.5216 0.0651 263.76)",
  setta600: "oklch(0.4311 0.0508 262.49)",
  setta700: "oklch(0.3324 0.0381 262.51)",
  setta750: "oklch(0.2903 0.0317 262.55)",
  setta800: "oklch(0.2458 0.0254 263.94)",
  setta850: "oklch(0.2162 0.0198 264.03)",
  setta860: "oklch(0.1903 0.0158 264.09)",
  setta875: "oklch(0.1797 0.0141 264.13)",
  setta900: "oklch(0.1631 0.0125 264.14)",
  setta925: "oklch(0.1471 0.0086 263.76)",
  setta950: "oklch(0.1281 0.0070 261.32)",
  setta975: "oklch(0.0697 0.0051 260.18)",
};

const accessibleBlack = "oklch(0.0000 0.0000 0.00)";
const accessibleWhite = "oklch(1.0000 0.0000 0.00)";

const browserAppearanceSettings: AppearanceSettings = {
  dark: {
    shadcn: {
      accent: settaTailwind.setta850,
      accentForeground: settaTailwind.setta100,
      background: settaTailwind.setta875,
      border: settaTailwind.setta850,
      card: settaTailwind.setta850,
      cardForeground: settaTailwind.setta100,
      destructive: "oklch(0.6368 0.2078 25.33)",
      destructiveForeground: highContrastForeground("oklch(0.6368 0.2078 25.33)"),
      foreground: settaTailwind.setta100,
      input: settaTailwind.setta850,
      muted: settaTailwind.setta850,
      mutedForeground: firstReadableForeground(
        [settaTailwind.setta875, settaTailwind.setta850],
        settaTailwind.setta400,
        settaTailwind.setta300,
        settaTailwind.setta200,
        settaTailwind.setta100,
        settaTailwind.setta50,
      ),
      popover: settaTailwind.setta850,
      popoverForeground: settaTailwind.setta100,
      primary: "oklch(0.8460 0.1292 213.38)",
      primaryForeground: highContrastForeground("oklch(0.8460 0.1292 213.38)"),
      ring: "oklch(0.8460 0.1292 213.38)",
      secondary: settaTailwind.setta850,
      secondaryForeground: settaTailwind.setta100,
      sidebar: settaTailwind.setta850,
      sidebarAccent: settaTailwind.setta700,
      sidebarAccentForeground: highContrastForeground(settaTailwind.setta700),
      sidebarForeground: settaTailwind.setta100,
    },
    status: {
      alert: "oklch(0.4732 0.1247 46.20)",
      alertForeground: highContrastForeground("oklch(0.4732 0.1247 46.20)"),
      critical: "oklch(0.6368 0.2078 25.33)",
      criticalForeground: highContrastForeground("oklch(0.6368 0.2078 25.33)"),
      info: "oklch(0.8460 0.1292 213.38)",
      infoForeground: highContrastForeground("oklch(0.8460 0.1292 213.38)"),
      success: "oklch(0.7227 0.1920 149.58)",
      successForeground: highContrastForeground("oklch(0.7227 0.1920 149.58)"),
      warning: "oklch(0.7686 0.1647 70.08)",
      warningForeground: highContrastForeground("oklch(0.7686 0.1647 70.08)"),
    },
    tailwind: settaTailwind,
  },
  fonts: {
    heading: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
    mono: `"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace`,
    sans: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
  },
  light: {
    shadcn: {
      accent: settaTailwind.setta200,
      accentForeground: settaTailwind.setta800,
      background: settaTailwind.setta50,
      border: settaTailwind.setta200,
      card: "oklch(1.0000 0.0000 0.00)",
      cardForeground: settaTailwind.setta900,
      destructive: "oklch(0.6368 0.2078 25.33)",
      destructiveForeground: highContrastForeground("oklch(0.6368 0.2078 25.33)"),
      foreground: settaTailwind.setta900,
      input: settaTailwind.setta200,
      muted: settaTailwind.setta100,
      mutedForeground: firstReadableForeground(
        [settaTailwind.setta50, "oklch(1.0000 0.0000 0.00)"],
        settaTailwind.setta600,
        settaTailwind.setta700,
        settaTailwind.setta800,
        settaTailwind.setta900,
        settaTailwind.setta950,
        settaTailwind.setta975,
      ),
      popover: "oklch(1.0000 0.0000 0.00)",
      popoverForeground: settaTailwind.setta900,
      primary: settaTailwind.setta600,
      primaryForeground: highContrastForeground(settaTailwind.setta600),
      ring: "oklch(0.8460 0.1292 213.38)",
      secondary: settaTailwind.setta100,
      secondaryForeground: settaTailwind.setta800,
      sidebar: settaTailwind.setta100,
      sidebarAccent: settaTailwind.setta200,
      sidebarAccentForeground: bestReadableForeground(
        settaTailwind.setta200,
        settaTailwind.setta900,
        accessibleBlack,
      ),
      sidebarForeground: settaTailwind.setta800,
    },
    status: {
      alert: "oklch(0.7686 0.1647 70.08)",
      alertForeground: highContrastForeground("oklch(0.7686 0.1647 70.08)"),
      critical: "oklch(0.6368 0.2078 25.33)",
      criticalForeground: highContrastForeground("oklch(0.6368 0.2078 25.33)"),
      info: "oklch(0.8460 0.1292 213.38)",
      infoForeground: highContrastForeground("oklch(0.8460 0.1292 213.38)"),
      success: "oklch(0.7227 0.1920 149.58)",
      successForeground: highContrastForeground("oklch(0.7227 0.1920 149.58)"),
      warning: "oklch(0.7686 0.1647 70.08)",
      warningForeground: highContrastForeground("oklch(0.7686 0.1647 70.08)"),
    },
    tailwind: settaTailwind,
  },
  mode: "dark",
  schemaVersion: 2,
};

function browserAppearancePreset(id: AppearancePresetID): AppearancePreset {
  if (id === "setta_standard") {
    return {
      description: "Setta browser inspection fixture.",
      id,
      name: "Setta Standard",
      settings: browserAppearanceSettings,
    };
  }
  const source = id.startsWith("shadcn_") ? "shadcn/ui" : "Tailwind 4";
  const color = titleCase(id.replace(/^shadcn_/, "").replace(/^tailwind_/, ""));
  return {
    description: `${source} ${color.toLowerCase()} browser inspection fixture.`,
    id,
    name: `${source} ${color}`,
    settings: browserSettingsFromTailwind(browserTailwindPaletteFromCSSColor(color.toLowerCase())),
  };
}

function browserSettingsFromTailwind(tailwind: AppearanceTailwindPalette): AppearanceSettings {
  const darkMutedForeground = firstReadableForeground(
    [tailwind.setta875, tailwind.setta850],
    tailwind.setta400,
    tailwind.setta300,
    tailwind.setta200,
    tailwind.setta100,
    tailwind.setta50,
  );
  const lightMutedForeground = firstReadableForeground(
    [tailwind.setta50, "oklch(1.0000 0.0000 0.00)"],
    tailwind.setta600,
    tailwind.setta700,
    tailwind.setta800,
    tailwind.setta900,
    tailwind.setta950,
    tailwind.setta975,
  );
  return {
    ...browserAppearanceSettings,
    dark: {
      ...browserAppearanceSettings.dark,
      shadcn: {
        ...browserAppearanceSettings.dark.shadcn,
        accent: tailwind.setta850,
        accentForeground: tailwind.setta100,
        background: tailwind.setta875,
        border: tailwind.setta850,
        card: tailwind.setta850,
        cardForeground: tailwind.setta100,
        foreground: tailwind.setta100,
        input: tailwind.setta850,
        muted: tailwind.setta850,
        mutedForeground: darkMutedForeground,
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
      tailwind,
    },
    light: {
      ...browserAppearanceSettings.light,
      shadcn: {
        ...browserAppearanceSettings.light.shadcn,
        accent: tailwind.setta200,
        accentForeground: tailwind.setta800,
        background: tailwind.setta50,
        border: tailwind.setta200,
        cardForeground: tailwind.setta900,
        foreground: tailwind.setta900,
        input: tailwind.setta200,
        muted: tailwind.setta100,
        mutedForeground: lightMutedForeground,
        popoverForeground: tailwind.setta900,
        primary: tailwind.setta600,
        primaryForeground: highContrastForeground(tailwind.setta600),
        ring: tailwind.setta500,
        secondary: tailwind.setta100,
        secondaryForeground: tailwind.setta800,
        sidebar: tailwind.setta100,
        sidebarAccent: tailwind.setta200,
        sidebarAccentForeground: bestReadableForeground(
          tailwind.setta200,
          tailwind.setta900,
          accessibleBlack,
        ),
        sidebarForeground: tailwind.setta800,
      },
      tailwind,
    },
  };
}

interface OklchColor {
  c: number;
  h: number;
  l: number;
}

interface TailwindCSSScale {
  s50: OklchColor;
  s100: OklchColor;
  s200: OklchColor;
  s300: OklchColor;
  s400: OklchColor;
  s500: OklchColor;
  s600: OklchColor;
  s700: OklchColor;
  s800: OklchColor;
  s900: OklchColor;
  s950: OklchColor;
}

function browserTailwindPaletteFromCSSColor(color: string): AppearanceTailwindPalette {
  return tailwindPaletteFromScale({
    s50: cssOklchColor(color, 50),
    s100: cssOklchColor(color, 100),
    s200: cssOklchColor(color, 200),
    s300: cssOklchColor(color, 300),
    s400: cssOklchColor(color, 400),
    s500: cssOklchColor(color, 500),
    s600: cssOklchColor(color, 600),
    s700: cssOklchColor(color, 700),
    s800: cssOklchColor(color, 800),
    s900: cssOklchColor(color, 900),
    s950: cssOklchColor(color, 950),
  });
}

function cssOklchColor(color: string, shade: number): OklchColor {
  const variableName = `--color-${color}-${shade}`;
  const match = new RegExp(`${variableName}:\\s*([^;]+);`).exec(tailwindThemeCSS);
  if (!match?.[1]) {
    throw new Error(`missing Tailwind CSS variable ${variableName}`);
  }
  return parseOklch(match[1].trim(), variableName);
}

function parseOklch(value: string, label: string): OklchColor {
  const match = /^oklch\(([^ ]+) ([^ ]+) ([^)]+)\)$/.exec(value);
  const rawLightness = match?.[1];
  const rawChroma = match?.[2];
  const rawHue = match?.[3];
  if (!rawLightness || !rawChroma || !rawHue) {
    throw new Error(`${label} must be an oklch color`);
  }
  const lightness = rawLightness.endsWith("%")
    ? Number.parseFloat(rawLightness) / 100
    : Number.parseFloat(rawLightness);
  return {
    c: Number.parseFloat(rawChroma),
    h: Number.parseFloat(rawHue),
    l: lightness,
  };
}

function tailwindPaletteFromScale(scale: TailwindCSSScale): AppearanceTailwindPalette {
  return {
    setta50: translateScaleColor(scale.s50, settaTailwind.setta50),
    setta100: translateScaleColor(scale.s100, settaTailwind.setta100),
    setta150: translateScaleColor(mixOKLCH(scale.s100, scale.s200, 0.5), settaTailwind.setta150),
    setta200: translateScaleColor(scale.s200, settaTailwind.setta200),
    setta300: translateScaleColor(scale.s300, settaTailwind.setta300),
    setta400: translateScaleColor(scale.s400, settaTailwind.setta400),
    setta500: translateScaleColor(scale.s500, settaTailwind.setta500),
    setta600: translateScaleColor(scale.s600, settaTailwind.setta600),
    setta700: translateScaleColor(scale.s700, settaTailwind.setta700),
    setta750: translateScaleColor(mixOKLCH(scale.s700, scale.s800, 0.5), settaTailwind.setta750),
    setta800: translateScaleColor(scale.s800, settaTailwind.setta800),
    setta850: translateScaleColor(mixOKLCH(scale.s800, scale.s900, 0.5), settaTailwind.setta850),
    setta860: translateScaleColor(mixOKLCH(scale.s800, scale.s900, 0.6), settaTailwind.setta860),
    setta875: translateScaleColor(mixOKLCH(scale.s800, scale.s900, 0.75), settaTailwind.setta875),
    setta900: translateScaleColor(scale.s900, settaTailwind.setta900),
    setta925: translateScaleColor(mixOKLCH(scale.s900, scale.s950, 0.5), settaTailwind.setta925),
    setta950: translateScaleColor(scale.s950, settaTailwind.setta950),
    setta975: translateScaleColor(
      { c: scale.s950.c * 0.65, h: scale.s950.h, l: 0 },
      settaTailwind.setta975,
    ),
  };
}

function translateScaleColor(source: OklchColor, targetLightness: string): string {
  const target = parseOklch(targetLightness, "setta palette ramp");
  return formatOKLCH({
    c: translatedScaleChroma(source.c, target.l),
    h: source.h,
    l: target.l,
  });
}

function translatedScaleChroma(sourceChroma: number, targetLightness: number): number {
  if (targetLightness <= 0.25) {
    return Math.min(sourceChroma, 0.065);
  }
  if (targetLightness <= 0.35) {
    return Math.min(sourceChroma, 0.08);
  }
  return sourceChroma;
}

function mixOKLCH(from: OklchColor, to: OklchColor, amount: number): OklchColor {
  return {
    c: from.c + (to.c - from.c) * amount,
    h: from.h + (to.h - from.h) * amount,
    l: from.l + (to.l - from.l) * amount,
  };
}

function formatOKLCH(color: OklchColor): string {
  return `oklch(${color.l.toFixed(4)} ${color.c.toFixed(4)} ${color.h.toFixed(2)})`;
}

function bestReadableForeground(background: string, first: string, second: string): string {
  return contrastRatio(first, background) >= contrastRatio(second, background) ? first : second;
}

function highContrastForeground(background: string): string {
  return bestReadableForeground(background, accessibleWhite, accessibleBlack);
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
  const foregroundLuminance = relativeLuminance(parseOklch(foreground, "foreground"));
  const backgroundLuminance = relativeLuminance(parseOklch(background, "background"));
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(color: OklchColor): number {
  const hueRadians = (color.h * Math.PI) / 180;
  const a = color.c * Math.cos(hueRadians);
  const b = color.c * Math.sin(hueRadians);
  const lPrime = color.l + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = color.l - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = color.l - 0.0894841775 * a - 1.291485548 * b;
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

function titleCase(value: string): string {
  return value.replace(/(^|_)([a-z])/g, (_match, _prefix: string, char: string) =>
    char.toUpperCase(),
  );
}

function browserAppearancePresetList(): AppearancePresetList {
  return {
    defaultPresetId: "setta_standard",
    presets: appearancePresetIDValues.map(browserAppearancePreset),
  };
}

const emptyWorkspaceSession: WorkspaceSession = {
  activeWorkspaces: [],
  recentWorkspaces: [],
  selectedWorkspaceId: "",
};

const emptyCodexAccountState: CodexAccountState = {
  account: null,
  diagnostic: "",
  login: null,
  requiresOpenaiAuth: true,
  status: "unavailable",
};

const failedLoginState: CodexLoginState = {
  authUrl: "",
  error: "Browser inspection fixture",
  loginId: "",
  status: "failed",
  type: "chatgpt",
  userCode: "",
  verificationUrl: "",
};

function resolveValue<T>(value: T): Promise<T> {
  return Promise.resolve(value);
}

function rejectBrowserAction(): Promise<never> {
  return Promise.reject(new Error("Browser inspection fixture does not implement this action"));
}

function subscribeNoop(): () => void {
  return () => {};
}

window.setta = {
  app: {
    installedEditors: () => resolveValue([]),
    openExternalUrl: () => resolveValue(undefined),
    openWorkspaceInEditor: () => resolveValue(undefined),
    platform: "darwin",
    versions: () => resolveValue({ app: "dev", chrome: "dev", electron: "dev", node: "dev" }),
    workspaceGitInfo: () =>
      resolveValue({ branchName: "", commitShort: "", worktreeName: "", worktreeRoot: "" }),
  },
  appearance: {
    presets: () => resolveValue(browserAppearancePresetList()),
    read: () => resolveValue(browserAppearanceSettings),
    update: (request) => resolveValue(request.settings),
  },
  backend: {
    health: () => resolveValue({ name: "setta-dev", ok: true, version: "dev" }),
    onEventStreamStatus: subscribeNoop,
    onProcessStatus: subscribeNoop,
  },
  chat: {
    activeRun: () => resolveValue({ hasActiveRun: false, run: null }),
    cancelRun: rejectBrowserAction,
    createConversation: rejectBrowserAction,
    deleteConversation: rejectBrowserAction,
    executeCommand: rejectBrowserAction,
    listCommands: () => resolveValue({ commands: [] }),
    listConversations: () =>
      resolveValue({
        conversations: [],
        corruption: { byKind: [], bySeverity: [], hasCorruption: false, total: 0 },
        diagnostics: [],
      }),
    messagePage: rejectBrowserAction,
    onEvent: subscribeNoop,
    queueMessage: rejectBrowserAction,
    runActivity: () => resolveValue({ items: [], output: [], runId: "" }),
    runItemOutput: () =>
      resolveValue({ hasMore: false, nextOrdinal: 0, output: [], runId: "", runItemId: "" }),
    sendMessage: rejectBrowserAction,
    setCodexModel: rejectBrowserAction,
    setCodexReasoningEffort: rejectBrowserAction,
    steerMessage: rejectBrowserAction,
    submitApproval: rejectBrowserAction,
    updateUserMessage: rejectBrowserAction,
  },
  codexAccount: {
    cancelLogin: () => resolveValue(emptyCodexAccountState),
    logout: () => resolveValue(emptyCodexAccountState),
    read: () => resolveValue(emptyCodexAccountState),
    refresh: () => resolveValue(emptyCodexAccountState),
    startLogin: () => resolveValue({ login: failedLoginState, state: emptyCodexAccountState }),
  },
  workspace: {
    close: () => resolveValue(emptyWorkspaceSession),
    openLocalFolder: () => resolveValue(null),
    removeRecent: () => resolveValue(emptyWorkspaceSession),
    reorder: () => resolveValue(emptyWorkspaceSession),
    select: () => resolveValue(emptyWorkspaceSession),
    session: () => resolveValue(emptyWorkspaceSession),
  },
} satisfies SettaAPI;
