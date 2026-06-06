import type { ITheme } from "@xterm/xterm";

export type TerminalThemeId = "setta-dark" | "high-contrast-dark" | "setta-light";

export interface TerminalDisplaySettings {
  fontFamily: string;
  fontSize: number;
  scrollback: number;
  themeId: TerminalThemeId;
}

export interface TerminalThemeOption {
  id: TerminalThemeId;
  label: string;
}

export const terminalDisplaySettingsStorageKey = "setta:terminal-display-settings:v1";
export const terminalDisplaySettingsChangedEvent = "setta:terminal-display-settings-changed";

export const terminalThemeOptions: TerminalThemeOption[] = [
  { id: "setta-dark", label: "Setta Dark" },
  { id: "high-contrast-dark", label: "High Contrast" },
  { id: "setta-light", label: "Setta Light" },
];

export const defaultTerminalDisplaySettings: TerminalDisplaySettings = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  fontSize: 13,
  scrollback: 1200,
  themeId: "setta-dark",
};

const minFontSize = 10;
const maxFontSize = 22;
const minScrollback = 100;
const maxScrollback = 10_000;

export function readTerminalDisplaySettings(
  storage = browserLocalStorage(),
): TerminalDisplaySettings {
  if (!storage) {
    return defaultTerminalDisplaySettings;
  }
  const raw = storage.getItem(terminalDisplaySettingsStorageKey);
  if (!raw) {
    return defaultTerminalDisplaySettings;
  }
  try {
    return normalizeTerminalDisplaySettings(JSON.parse(raw));
  } catch {
    return defaultTerminalDisplaySettings;
  }
}

export function writeTerminalDisplaySettings(
  value: unknown,
  storage = browserLocalStorage(),
): TerminalDisplaySettings {
  const settings = normalizeTerminalDisplaySettings(value);
  storage?.setItem(terminalDisplaySettingsStorageKey, JSON.stringify(settings));
  dispatchTerminalDisplaySettingsChanged(settings);
  return settings;
}

export function resetTerminalDisplaySettings(
  storage = browserLocalStorage(),
): TerminalDisplaySettings {
  storage?.removeItem(terminalDisplaySettingsStorageKey);
  dispatchTerminalDisplaySettingsChanged(defaultTerminalDisplaySettings);
  return defaultTerminalDisplaySettings;
}

export function normalizeTerminalDisplaySettings(value: unknown): TerminalDisplaySettings {
  if (!isRecord(value)) {
    return defaultTerminalDisplaySettings;
  }
  return {
    fontFamily: normalizeFontFamily(value.fontFamily),
    fontSize: normalizeInteger(
      value.fontSize,
      minFontSize,
      maxFontSize,
      defaultTerminalDisplaySettings.fontSize,
    ),
    scrollback: normalizeInteger(
      value.scrollback,
      minScrollback,
      maxScrollback,
      defaultTerminalDisplaySettings.scrollback,
    ),
    themeId: normalizeThemeId(value.themeId),
  };
}

export function terminalTheme(themeId: TerminalThemeId): ITheme {
  switch (themeId) {
    case "setta-dark":
      return {
        background: "#09090b",
        cursor: "#e4e4e7",
        foreground: "#e4e4e7",
        selectionBackground: "#3f3f46",
      };
    case "high-contrast-dark":
      return {
        background: "#000000",
        black: "#000000",
        blue: "#5eb0ff",
        brightBlack: "#666666",
        brightBlue: "#9fd0ff",
        brightCyan: "#8ff0ff",
        brightGreen: "#9fff9f",
        brightMagenta: "#ffb8ff",
        brightRed: "#ff9f9f",
        brightWhite: "#ffffff",
        brightYellow: "#ffff9f",
        cursor: "#ffffff",
        cyan: "#61d6d6",
        foreground: "#f7f7f7",
        green: "#7ee787",
        magenta: "#d2a8ff",
        red: "#ff7b72",
        selectionBackground: "#305f9f",
        white: "#f0f0f0",
        yellow: "#f2cc60",
      };
    case "setta-light":
      return {
        background: "#fbfbfc",
        cursor: "#18181b",
        foreground: "#18181b",
        selectionBackground: "#bfdbfe",
      };
    default:
      return assertNever(themeId);
  }
}

function browserLocalStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage ?? null;
}

function dispatchTerminalDisplaySettingsChanged(settings: TerminalDisplaySettings): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new window.CustomEvent<TerminalDisplaySettings>(terminalDisplaySettingsChangedEvent, {
      detail: settings,
    }),
  );
}

function normalizeFontFamily(value: unknown): string {
  if (typeof value !== "string") {
    return defaultTerminalDisplaySettings.fontFamily;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 160) {
    return defaultTerminalDisplaySettings.fontFamily;
  }
  return trimmed;
}

function normalizeInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizeThemeId(value: unknown): TerminalThemeId {
  if (value === "setta-dark" || value === "high-contrast-dark" || value === "setta-light") {
    return value;
  }
  return defaultTerminalDisplaySettings.themeId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled terminal theme: ${String(value)}`);
}
