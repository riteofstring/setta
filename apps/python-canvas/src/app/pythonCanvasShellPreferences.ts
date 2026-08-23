import {
  createWorkspaceShellViewState,
  WORKSPACE_INSPECTOR_TAB_ID,
  WORKSPACE_OUTLINE_TAB_ID,
  type WorkspaceShellPaneViewState,
  type WorkspaceShellViewState,
} from "@setta/workspace";

export const PYTHON_CANVAS_SHELL_PREFERENCE_KEY =
  "setta.python-canvas.workspace-shell";
export const PYTHON_CANVAS_SHELL_PREFERENCE_VERSION = 1;

type BrowserStorage = Pick<Storage, "getItem" | "setItem">;

type StoredPythonCanvasShellPreference = {
  version: typeof PYTHON_CANVAS_SHELL_PREFERENCE_VERSION;
  viewState: WorkspaceShellViewState;
};

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

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

function parsePane(
  value: unknown,
  selectedTabId: string,
): WorkspaceShellPaneViewState | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "selectedTabId",
      "visible",
      "width",
      "rememberedNonFullWidth",
    ]) ||
    value.selectedTabId !== selectedTabId ||
    typeof value.visible !== "boolean" ||
    !isPositiveFiniteNumber(value.width) ||
    !isPositiveFiniteNumber(value.rememberedNonFullWidth)
  ) {
    return null;
  }
  return {
    selectedTabId,
    visible: value.visible,
    width: value.width,
    rememberedNonFullWidth: value.rememberedNonFullWidth,
  };
}

function parseOutline(value: unknown): WorkspaceShellViewState["outline"] | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["collapsedGroupIds", "focusedSectionId"]) ||
    !Array.isArray(value.collapsedGroupIds) ||
    !value.collapsedGroupIds.every(isNonEmptyString) ||
    new Set(value.collapsedGroupIds).size !== value.collapsedGroupIds.length ||
    (value.focusedSectionId !== null &&
      !isNonEmptyString(value.focusedSectionId))
  ) {
    return null;
  }
  return {
    collapsedGroupIds: [...value.collapsedGroupIds],
    focusedSectionId: value.focusedSectionId,
  };
}

function parsePreference(
  value: unknown,
): StoredPythonCanvasShellPreference | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["version", "viewState"]) ||
    value.version !== PYTHON_CANVAS_SHELL_PREFERENCE_VERSION ||
    !isRecord(value.viewState) ||
    !hasExactKeys(value.viewState, ["leading", "trailing", "outline"])
  ) {
    return null;
  }
  const leading = parsePane(value.viewState.leading, WORKSPACE_OUTLINE_TAB_ID);
  const trailing = parsePane(
    value.viewState.trailing,
    WORKSPACE_INSPECTOR_TAB_ID,
  );
  const outline = parseOutline(value.viewState.outline);
  if (!leading || !trailing || !outline) {
    return null;
  }
  return {
    version: PYTHON_CANVAS_SHELL_PREFERENCE_VERSION,
    viewState: { leading, trailing, outline },
  };
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
  viewState: WorkspaceShellViewState,
): string | null {
  const preference = parsePreference({
    version: PYTHON_CANVAS_SHELL_PREFERENCE_VERSION,
    viewState,
  });
  if (preference === null) {
    return null;
  }
  return JSON.stringify(preference);
}

// This is the application's only browser-storage boundary for pane presentation state. A failed
// read is deliberately indistinguishable from a missing preference: presentation remains usable
// and no project-level error is introduced.
export function loadPythonCanvasShellViewState(
  storage: BrowserStorage | null = browserStorage(),
): WorkspaceShellViewState {
  if (storage === null) {
    return createWorkspaceShellViewState();
  }
  try {
    const rawValue = storage.getItem(PYTHON_CANVAS_SHELL_PREFERENCE_KEY);
    if (rawValue === null) {
      return createWorkspaceShellViewState();
    }
    const preference = parsePreference(JSON.parse(rawValue));
    return preference?.viewState ?? createWorkspaceShellViewState();
  } catch {
    return createWorkspaceShellViewState();
  }
}

// Call this only from a shell-originated state transition. In particular, initial state loading
// never writes fallback defaults over an absent or malformed browser preference.
export function persistPythonCanvasShellViewState(
  viewState: WorkspaceShellViewState,
  storage: BrowserStorage | null = browserStorage(),
): void {
  if (storage === null) {
    return;
  }
  const serialized = serializePreference(viewState);
  if (serialized === null) {
    return;
  }
  try {
    storage.setItem(PYTHON_CANVAS_SHELL_PREFERENCE_KEY, serialized);
  } catch {
    // Browser storage can be disabled or quota-limited. Keep the valid in-memory shell state.
  }
}
