import {
  parseWorkspaceSavedViewsState,
  type WorkspaceSavedViewsState,
} from "@riteofstring/setta";

const PYTHON_CANVAS_SAVED_VIEWS_PREFERENCE_KEY_PREFIX =
  "setta.python-canvas.saved-views:";
export const PYTHON_CANVAS_SAVED_VIEWS_PREFERENCE_VERSION = 1;

type BrowserStorage = Pick<Storage, "getItem" | "setItem">;

type StoredPythonCanvasSavedViewsPreference = {
  savedViews: WorkspaceSavedViewsState;
  version: typeof PYTHON_CANVAS_SAVED_VIEWS_PREFERENCE_VERSION;
};

type PythonCanvasSavedViewsLoadResult =
  | { kind: "loaded"; savedViews: WorkspaceSavedViewsState }
  | { kind: "malformed" }
  | { kind: "missing" }
  | { kind: "unavailable" };

type PythonCanvasSavedViewsPersistenceResult =
  { kind: "persisted" } | { kind: "unavailable" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): boolean {
  const actualKeys = Object.keys(value);
  return (
    actualKeys.length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function parsePreference(
  value: unknown,
): StoredPythonCanvasSavedViewsPreference | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["savedViews", "version"]) ||
    value.version !== PYTHON_CANVAS_SAVED_VIEWS_PREFERENCE_VERSION
  ) {
    return null;
  }
  try {
    return {
      savedViews: parseWorkspaceSavedViewsState(value.savedViews),
      version: PYTHON_CANVAS_SAVED_VIEWS_PREFERENCE_VERSION,
    };
  } catch {
    return null;
  }
}

function browserStorage(): BrowserStorage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function serializePreference(
  savedViews: WorkspaceSavedViewsState,
): string | null {
  try {
    const preference = parsePreference({
      savedViews,
      version: PYTHON_CANVAS_SAVED_VIEWS_PREFERENCE_VERSION,
    });
    return preference === null ? null : JSON.stringify(preference);
  } catch {
    return null;
  }
}

export function pythonCanvasSavedViewsPreferenceKey(projectId: string): string {
  return `${PYTHON_CANVAS_SAVED_VIEWS_PREFERENCE_KEY_PREFIX}${projectId}`;
}

export function loadPythonCanvasSavedViews(
  projectId: string,
  storage: BrowserStorage | null = browserStorage(),
): PythonCanvasSavedViewsLoadResult {
  if (storage === null) {
    return { kind: "unavailable" };
  }
  let rawValue: string | null;
  try {
    rawValue = storage.getItem(pythonCanvasSavedViewsPreferenceKey(projectId));
  } catch {
    return { kind: "unavailable" };
  }
  if (rawValue === null) {
    return { kind: "missing" };
  }
  try {
    const preference = parsePreference(JSON.parse(rawValue));
    return preference === null
      ? { kind: "malformed" }
      : { kind: "loaded", savedViews: preference.savedViews };
  } catch {
    return { kind: "malformed" };
  }
}

export function persistPythonCanvasSavedViews(
  projectId: string,
  savedViews: WorkspaceSavedViewsState,
  storage: BrowserStorage | null = browserStorage(),
): PythonCanvasSavedViewsPersistenceResult {
  if (storage === null) {
    return { kind: "unavailable" };
  }
  const serialized = serializePreference(savedViews);
  if (serialized === null) {
    return { kind: "unavailable" };
  }
  try {
    storage.setItem(pythonCanvasSavedViewsPreferenceKey(projectId), serialized);
    return { kind: "persisted" };
  } catch {
    return { kind: "unavailable" };
  }
}
