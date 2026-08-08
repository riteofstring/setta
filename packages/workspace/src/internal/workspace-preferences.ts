import {
  isValidWorkspaceColor,
  type WorkspaceAppearance,
  type WorkspaceAppearanceOptionOverrides,
  type WorkspaceGridOptionOverrides,
  type WorkspaceGridPattern,
  type WorkspacePoint,
  type WorkspaceThemeTokens,
} from "../core.js";

export type ResolvedWorkspaceGridOptions = Readonly<{
  markSize: number;
  pattern: WorkspaceGridPattern;
  snap: boolean;
  spacing: readonly [x: number, y: number];
  visible: boolean;
}>;

export type ResolvedWorkspaceAppearanceOptions = Readonly<{
  appearance: WorkspaceAppearance;
  dark: WorkspaceThemeTokens;
  light: WorkspaceThemeTokens;
}>;

const gridOptionKeys = new Set(["markSize", "pattern", "snap", "spacing", "visible"]);
const appearanceOptionKeys = new Set(["appearance", "dark", "light"]);
const themeTokenKeys = [
  "canvasBackground",
  "focus",
  "gridColor",
  "invalid",
  "minimapBackground",
  "sectionBackground",
  "sectionMutedText",
  "sectionText",
  "selection",
  "toolbarBackground",
] as const satisfies readonly (keyof WorkspaceThemeTokens)[];
const themeTokenKeySet = new Set<string>(themeTokenKeys);

export const WORKSPACE_DEFAULT_GRID_OPTIONS: ResolvedWorkspaceGridOptions = Object.freeze({
  markSize: 1,
  pattern: "dots",
  snap: true,
  spacing: Object.freeze([24, 24] as const),
  visible: true,
});

export const WORKSPACE_DEFAULT_LIGHT_THEME: WorkspaceThemeTokens = Object.freeze({
  canvasBackground: "oklch(0.965 0.008 255)",
  focus: "oklch(0.42 0.12 255)",
  gridColor: "oklch(0.72 0.025 255)",
  invalid: "oklch(0.48 0.18 25)",
  minimapBackground: "oklch(0.925 0.012 255)",
  sectionBackground: "oklch(0.99 0 255)",
  sectionMutedText: "oklch(0.36 0.025 255)",
  sectionText: "oklch(0.245 0.03 255)",
  selection: "oklch(0.52 0.16 255)",
  toolbarBackground: "oklch(0.985 0.006 255)",
});

export const WORKSPACE_DEFAULT_DARK_THEME: WorkspaceThemeTokens = Object.freeze({
  canvasBackground: "oklch(0.18 0.02 255)",
  focus: "oklch(0.82 0.08 255)",
  gridColor: "oklch(0.42 0.03 255)",
  invalid: "oklch(0.72 0.16 25)",
  minimapBackground: "oklch(0.215 0.022 255)",
  sectionBackground: "oklch(0.235 0.025 255)",
  sectionMutedText: "oklch(0.86 0.02 255)",
  sectionText: "oklch(0.94 0.012 255)",
  selection: "oklch(0.72 0.13 255)",
  toolbarBackground: "oklch(0.27 0.025 255)",
});

type UnknownRecord = Record<string, unknown>;

function preferenceRecord(value: unknown, label: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  return value as UnknownRecord;
}

function assertSupportedKeys(record: UnknownRecord, supported: ReadonlySet<string>, label: string) {
  const invalidKey = Reflect.ownKeys(record).find(
    (key) =>
      typeof key !== "string" ||
      !Object.prototype.propertyIsEnumerable.call(record, key) ||
      !supported.has(key),
  );
  if (invalidKey !== undefined) {
    throw new TypeError(`Unknown ${label} ${String(invalidKey)}.`);
  }
}

function resolvedBoolean(record: UnknownRecord, key: "snap" | "visible"): boolean {
  const value = record[key] ?? WORKSPACE_DEFAULT_GRID_OPTIONS[key];
  if (typeof value !== "boolean") {
    throw new TypeError(`Workspace grid option ${key} must be a boolean.`);
  }
  return value;
}

function positiveNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive finite number.`);
  }
  return value;
}

function resolvedSpacing(value: unknown): readonly [number, number] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new TypeError("Workspace grid spacing must contain exactly two values.");
  }
  return Object.freeze([
    positiveNumber(value[0], "Workspace grid x spacing"),
    positiveNumber(value[1], "Workspace grid y spacing"),
  ]);
}

function resolvedPattern(value: unknown): WorkspaceGridPattern {
  if (value === "cross" || value === "dots" || value === "lines") {
    return value;
  }
  throw new TypeError("Workspace grid pattern must be cross, dots, or lines.");
}

export function resolveWorkspaceGridOptions(
  options?: WorkspaceGridOptionOverrides,
): ResolvedWorkspaceGridOptions {
  const record = options === undefined ? {} : preferenceRecord(options, "Workspace grid options");
  assertSupportedKeys(record, gridOptionKeys, "workspace grid option");
  return Object.freeze({
    markSize: positiveNumber(
      record.markSize ?? WORKSPACE_DEFAULT_GRID_OPTIONS.markSize,
      "Workspace grid markSize",
    ),
    pattern: resolvedPattern(record.pattern ?? WORKSPACE_DEFAULT_GRID_OPTIONS.pattern),
    snap: resolvedBoolean(record, "snap"),
    spacing: resolvedSpacing(record.spacing ?? WORKSPACE_DEFAULT_GRID_OPTIONS.spacing),
    visible: resolvedBoolean(record, "visible"),
  });
}

function resolvedAppearance(value: unknown): WorkspaceAppearance {
  if (value === "dark" || value === "light" || value === "system") {
    return value;
  }
  throw new TypeError("Workspace appearance must be dark, light, or system.");
}

function resolvedTheme(
  value: unknown,
  defaults: WorkspaceThemeTokens,
  appearance: "dark" | "light",
): WorkspaceThemeTokens {
  if (value === undefined) {
    return defaults;
  }
  const overrides = preferenceRecord(value, `Workspace ${appearance} theme tokens`);
  assertSupportedKeys(overrides, themeTokenKeySet, `workspace ${appearance} theme token`);
  const resolved = { ...defaults };
  for (const key of themeTokenKeys) {
    if (!Object.hasOwn(overrides, key)) {
      continue;
    }
    const color = overrides[key];
    if (typeof color !== "string" || !isValidWorkspaceColor(color)) {
      throw new TypeError(`Workspace ${appearance} theme token ${key} must be a valid CSS color.`);
    }
    resolved[key] = color;
  }
  return Object.freeze(resolved);
}

export function resolveWorkspaceAppearanceOptions(
  options?: WorkspaceAppearanceOptionOverrides,
): ResolvedWorkspaceAppearanceOptions {
  const record =
    options === undefined ? {} : preferenceRecord(options, "Workspace appearance options");
  assertSupportedKeys(record, appearanceOptionKeys, "workspace appearance option");
  return Object.freeze({
    appearance: resolvedAppearance(record.appearance ?? "system"),
    dark: resolvedTheme(record.dark, WORKSPACE_DEFAULT_DARK_THEME, "dark"),
    light: resolvedTheme(record.light, WORKSPACE_DEFAULT_LIGHT_THEME, "light"),
  });
}

export function snapWorkspacePointToGrid(
  point: WorkspacePoint,
  spacing: readonly [x: number, y: number],
): WorkspacePoint {
  const x = spacing[0] * Math.round(point.x / spacing[0]);
  const y = spacing[1] * Math.round(point.y / spacing[1]);
  return { x: Object.is(x, -0) ? 0 : x, y: Object.is(y, -0) ? 0 : y };
}
