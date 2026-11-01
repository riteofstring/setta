import { parseWorkspaceSavedViewsState } from "../saved-views/state.js";
import type { WorkspaceSavedViewsState } from "../document/types.js";
import type {
  WorkspaceShellOutlineViewState,
  WorkspaceShellPaneViewState,
  WorkspaceShellViewState,
} from "./workspaceShellTypes.js";

export type WorkspaceBrowserStorage = Pick<Storage, "getItem" | "setItem">;

export type WorkspaceBrowserStorageOptions = {
  storage?: WorkspaceBrowserStorage | null;
};

export type LoadWorkspaceShellViewStateOptions =
  WorkspaceBrowserStorageOptions & {
    fallback: WorkspaceShellViewState;
    leadingTabIds: ReadonlyArray<string>;
    trailingTabIds: ReadonlyArray<string>;
  };

function defaultStorage(): WorkspaceBrowserStorage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function resolveStorage(
  options: WorkspaceBrowserStorageOptions,
): WorkspaceBrowserStorage | null {
  return options.storage === undefined ? defaultStorage() : options.storage;
}

function readJson(
  storage: WorkspaceBrowserStorage | null,
  key: string,
): unknown {
  if (storage === null) {
    return undefined;
  }
  try {
    const raw = storage.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function writeJson(
  storage: WorkspaceBrowserStorage | null,
  key: string,
  value: unknown,
): boolean {
  if (storage === null) {
    return false;
  }
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

function parsePane(
  value: unknown,
  tabIds: ReadonlyArray<string>,
): WorkspaceShellPaneViewState | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "selectedTabId",
      "visible",
      "width",
      "rememberedNonFullWidth",
    ]) ||
    !isNonEmptyString(value["selectedTabId"]) ||
    !tabIds.includes(value["selectedTabId"]) ||
    typeof value["visible"] !== "boolean" ||
    !isPositiveFinite(value["width"]) ||
    !isPositiveFinite(value["rememberedNonFullWidth"])
  ) {
    return null;
  }
  return {
    selectedTabId: value["selectedTabId"],
    visible: value["visible"],
    width: value["width"],
    rememberedNonFullWidth: value["rememberedNonFullWidth"],
  };
}

function parseOutline(value: unknown): WorkspaceShellOutlineViewState | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["collapsedGroupIds", "focusedSectionId"])
  ) {
    return null;
  }
  const collapsed = value["collapsedGroupIds"];
  const focused = value["focusedSectionId"];
  if (
    !Array.isArray(collapsed) ||
    !collapsed.every(isNonEmptyString) ||
    new Set(collapsed).size !== collapsed.length ||
    (focused !== null && !isNonEmptyString(focused))
  ) {
    return null;
  }
  return { collapsedGroupIds: [...collapsed], focusedSectionId: focused };
}

export function loadWorkspaceShellViewState(
  key: string,
  options: LoadWorkspaceShellViewStateOptions,
): WorkspaceShellViewState {
  const value = readJson(resolveStorage(options), key);
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["leading", "trailing", "outline"])
  ) {
    return options.fallback;
  }
  const leading = parsePane(value["leading"], options.leadingTabIds);
  const trailing = parsePane(value["trailing"], options.trailingTabIds);
  const outline = parseOutline(value["outline"]);
  return leading && trailing && outline
    ? { leading, trailing, outline }
    : options.fallback;
}

export function saveWorkspaceShellViewState(
  key: string,
  viewState: WorkspaceShellViewState,
  options: WorkspaceBrowserStorageOptions = {},
): boolean {
  return writeJson(resolveStorage(options), key, viewState);
}

export function loadWorkspaceSavedViews(
  key: string,
  options: WorkspaceBrowserStorageOptions = {},
): WorkspaceSavedViewsState | null {
  const value = readJson(resolveStorage(options), key);
  if (value === undefined) {
    return null;
  }
  try {
    return parseWorkspaceSavedViewsState(value);
  } catch {
    return null;
  }
}

export function saveWorkspaceSavedViews(
  key: string,
  savedViews: WorkspaceSavedViewsState,
  options: WorkspaceBrowserStorageOptions = {},
): boolean {
  return writeJson(resolveStorage(options), key, savedViews);
}
