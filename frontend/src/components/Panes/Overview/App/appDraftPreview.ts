export type AppThemeMode = "auto" | "light" | "dark";

type DraftAppRoute = {
  path: string;
  name: string | null;
  rootKey: string | null;
};

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

export function parseDraftAppRoutes(
  draftRoutes: string,
): DraftParseResult<DraftAppRoute[]> {
  if (draftRoutes.trim().length === 0) {
    return { ok: true, value: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(draftRoutes) as unknown;
  } catch {
    return { ok: false, error: "Invalid JSON in routes." };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: "Routes JSON must be a list." };
  }

  const output: DraftAppRoute[] = [];
  for (const [idx, entry] of parsed.entries()) {
    if (!isRecord(entry)) {
      return { ok: false, error: `Route ${idx + 1} must be an object.` };
    }
    const path = entry.path;
    if (typeof path !== "string" || path.trim().length === 0) {
      return { ok: false, error: `Route ${idx + 1} is missing path.` };
    }
    const nameRaw = entry.name;
    const rootKeyRaw = entry.rootKey;
    if (
      nameRaw !== undefined &&
      nameRaw !== null &&
      typeof nameRaw !== "string"
    ) {
      return { ok: false, error: `Route ${idx + 1} name must be a string.` };
    }
    if (
      rootKeyRaw !== undefined &&
      rootKeyRaw !== null &&
      typeof rootKeyRaw !== "string"
    ) {
      return { ok: false, error: `Route ${idx + 1} rootKey must be a string.` };
    }
    output.push({
      path,
      name: typeof nameRaw === "string" ? nameRaw : null,
      rootKey: typeof rootKeyRaw === "string" ? rootKeyRaw : null,
    });
  }

  return { ok: true, value: output };
}
