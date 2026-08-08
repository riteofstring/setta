export type AppThemeMode = "auto" | "light" | "dark";

type DraftParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseDraftAppSpec(
  draftSpec: string,
): DraftParseResult<unknown | null> {
  if (draftSpec.trim().length === 0) {
    return { ok: true, value: null };
  }
  try {
    return { ok: true, value: JSON.parse(draftSpec) as unknown };
  } catch {
    return { ok: false, error: "Invalid JSON in app spec." };
  }
}

export function parseDraftAppTheme(
  draftTheme: string,
  themeMode: AppThemeMode,
): DraftParseResult<Record<string, unknown>> {
  let parsedTheme: unknown = {};
  if (draftTheme.trim().length > 0) {
    try {
      parsedTheme = JSON.parse(draftTheme) as unknown;
    } catch {
      return { ok: false, error: "Invalid JSON in theme." };
    }
    if (!isRecord(parsedTheme)) {
      return { ok: false, error: "Theme JSON must be an object." };
    }
  }

  return {
    ok: true,
    value: {
      ...(parsedTheme as Record<string, unknown>),
      mode: themeMode,
    },
  };
}

export function parseDraftAppAssets(
  draftAssets: string,
): DraftParseResult<unknown[]> {
  if (draftAssets.trim().length === 0) {
    return { ok: true, value: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(draftAssets) as unknown;
  } catch {
    return { ok: false, error: "Invalid JSON in assets." };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: "Assets JSON must be a list." };
  }
  return { ok: true, value: parsed };
}
