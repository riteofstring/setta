import {
  createWorkspaceShellViewState,
  WORKSPACE_OUTLINE_TAB_ID,
  type WorkspaceShellPaneViewState,
  type WorkspaceShellViewState,
} from "@setta/workspace";
import {
  PYTHON_CANVAS_PARAMS_TAB_ID,
  PYTHON_CANVAS_SECTION_SETTINGS_TAB_ID,
} from "./pythonCanvasRightPane";

export const PYTHON_CANVAS_SHELL_PREFERENCE_KEY =
  "setta.python-canvas.workspace-shell";
export const PYTHON_CANVAS_SHELL_PREFERENCE_VERSION = 2;

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
  acceptedTabIds: ReadonlyArray<string>,
): WorkspaceShellPaneViewState | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "selectedTabId",
      "visible",
      "width",
      "rememberedNonFullWidth",
    ]) ||
    !isNonEmptyString(value.selectedTabId) ||
    !acceptedTabIds.includes(value.selectedTabId) ||
    typeof value.visible !== "boolean" ||
    !isPositiveFiniteNumber(value.width) ||
    !isPositiveFiniteNumber(value.rememberedNonFullWidth)
  ) {
    return null;
  }
  return {
    selectedTabId: value.selectedTabId,
    visible: value.visible,
    width: value.width,
    rememberedNonFullWidth: value.rememberedNonFullWidth,
  };
}

function parseOutline(
  value: unknown,
): WorkspaceShellViewState["outline"] | null {
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
  const leading = parsePane(value.viewState.leading, [
    WORKSPACE_OUTLINE_TAB_ID,
  ]);
  const trailing = parsePane(value.viewState.trailing, [
    PYTHON_CANVAS_SECTION_SETTINGS_TAB_ID,
    PYTHON_CANVAS_PARAMS_TAB_ID,
  ]);
  const outline = parseOutline(value.viewState.outline);
  if (!leading || !trailing || !outline) {
    return null;
  }
  return {
    version: PYTHON_CANVAS_SHELL_PREFERENCE_VERSION,
    viewState: { leading, trailing, outline },
  };
}

function createPythonCanvasShellViewState(): WorkspaceShellViewState {
  return createWorkspaceShellViewState({
    trailingTabId: PYTHON_CANVAS_SECTION_SETTINGS_TAB_ID,
  });
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

export function loadPythonCanvasShellViewState(
  storage: BrowserStorage | null = browserStorage(),
): WorkspaceShellViewState {
  if (storage === null) {
    return createPythonCanvasShellViewState();
  }
  try {
    const rawValue = storage.getItem(PYTHON_CANVAS_SHELL_PREFERENCE_KEY);
    if (rawValue === null) {
      return createPythonCanvasShellViewState();
    }
    const preference = parsePreference(JSON.parse(rawValue));
    return preference?.viewState ?? createPythonCanvasShellViewState();
  } catch {
    return createPythonCanvasShellViewState();
  }
}

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
  } catch {}
}
