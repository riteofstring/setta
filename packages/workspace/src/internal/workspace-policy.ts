import { isDenseArray, optionOverridesAt } from "./runtime-option-validation.js";

export const WORKSPACE_MIN_ZOOM = 0.1;
export const WORKSPACE_MAX_ZOOM = 10;
export const WORKSPACE_DEFAULT_ZOOM = 1;

export type WorkspacePanOnScrollMode = "free" | "horizontal" | "vertical";
export type WorkspaceActivationKey = string | readonly string[] | null;

export type WorkspaceGestureOptions = Readonly<{
  initialZoom: number;
  maxZoom: number;
  minZoom: number;
  panActivationKey: WorkspaceActivationKey;
  panOnDrag: boolean | readonly number[];
  panOnScroll: boolean;
  panOnScrollMode: WorkspacePanOnScrollMode;
  panOnScrollSpeed: number;
  zoomActivationKey: WorkspaceActivationKey;
  zoomOnDoubleClick: boolean;
  zoomOnPinch: boolean;
  zoomOnScroll: boolean;
}>;

export type WorkspaceGestureOptionOverrides = Partial<WorkspaceGestureOptions>;

export const WORKSPACE_DEFAULT_GESTURE_OPTIONS: WorkspaceGestureOptions = Object.freeze({
  initialZoom: WORKSPACE_DEFAULT_ZOOM,
  maxZoom: WORKSPACE_MAX_ZOOM,
  minZoom: WORKSPACE_MIN_ZOOM,
  panActivationKey: "Space",
  panOnDrag: true,
  panOnScroll: false,
  panOnScrollMode: "free",
  panOnScrollSpeed: 0.5,
  zoomActivationKey: Object.freeze(["Meta", "Control"]),
  zoomOnDoubleClick: true,
  zoomOnPinch: true,
  zoomOnScroll: true,
});

export type WorkspaceCapabilities = Readonly<{
  editLayout: boolean;
  editPresentation: boolean;
  editStructure: boolean;
}>;

export type WorkspaceCapabilityOverrides = Partial<WorkspaceCapabilities>;

export const WORKSPACE_DEFAULT_CAPABILITIES: WorkspaceCapabilities = Object.freeze({
  editLayout: true,
  editPresentation: true,
  editStructure: true,
});

type UnknownRecord = Record<string, unknown>;

const capabilityOptionKeys = ["editLayout", "editPresentation", "editStructure"] as const;
const gestureOptionKeys = [
  "initialZoom",
  "maxZoom",
  "minZoom",
  "panActivationKey",
  "panOnDrag",
  "panOnScroll",
  "panOnScrollMode",
  "panOnScrollSpeed",
  "zoomActivationKey",
  "zoomOnDoubleClick",
  "zoomOnPinch",
  "zoomOnScroll",
] as const;

function resolvedCapability(overrides: UnknownRecord, capability: keyof WorkspaceCapabilities) {
  const value = overrides[capability];
  if (value === undefined) {
    return WORKSPACE_DEFAULT_CAPABILITIES[capability];
  }
  if (typeof value !== "boolean") {
    throw new TypeError(`Workspace capability ${capability} must be a boolean.`);
  }
  return value;
}

export function resolveWorkspaceCapabilities(
  overrides?: WorkspaceCapabilityOverrides,
  readOnly = false,
): WorkspaceCapabilities {
  if (typeof readOnly !== "boolean") {
    throw new TypeError("Workspace readOnly must be a boolean.");
  }
  const resolvedOverrides = optionOverridesAt(
    overrides,
    capabilityOptionKeys,
    "Workspace capability overrides",
    "workspace capability option",
  );
  const resolved = {
    editLayout: resolvedCapability(resolvedOverrides, "editLayout"),
    editPresentation: resolvedCapability(resolvedOverrides, "editPresentation"),
    editStructure: resolvedCapability(resolvedOverrides, "editStructure"),
  };
  if (readOnly) {
    return { editLayout: false, editPresentation: false, editStructure: false };
  }
  return resolved;
}

function gestureBoolean(
  overrides: UnknownRecord,
  key: "panOnScroll" | "zoomOnDoubleClick" | "zoomOnPinch" | "zoomOnScroll",
): boolean {
  const configured = overrides[key];
  const value = configured === undefined ? WORKSPACE_DEFAULT_GESTURE_OPTIONS[key] : configured;
  if (typeof value !== "boolean") {
    throw new TypeError(`Workspace gesture option ${key} must be a boolean.`);
  }
  return value;
}

function gestureNumber(
  overrides: UnknownRecord,
  key: "initialZoom" | "maxZoom" | "minZoom" | "panOnScrollSpeed",
): number {
  const configured = overrides[key];
  const value = configured === undefined ? WORKSPACE_DEFAULT_GESTURE_OPTIONS[key] : configured;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`Workspace gesture option ${key} must be a positive finite number.`);
  }
  return value;
}

function gestureActivationKey(
  overrides: UnknownRecord,
  key: "panActivationKey" | "zoomActivationKey",
): WorkspaceActivationKey {
  const value = Object.hasOwn(overrides, key)
    ? overrides[key]
    : WORKSPACE_DEFAULT_GESTURE_OPTIONS[key];
  if (value === null || (typeof value === "string" && value.length > 0)) {
    return value;
  }
  if (
    isDenseArray(value) &&
    value.length > 0 &&
    value.every((candidate) => typeof candidate === "string" && candidate.length > 0)
  ) {
    return Object.freeze([...value]) as readonly string[];
  }
  throw new TypeError(
    `Workspace gesture option ${key} must be a non-empty key, key list, or null.`,
  );
}

function gesturePanOnDrag(overrides: UnknownRecord): boolean | readonly number[] {
  const value =
    overrides.panOnDrag === undefined
      ? WORKSPACE_DEFAULT_GESTURE_OPTIONS.panOnDrag
      : overrides.panOnDrag;
  if (typeof value === "boolean") {
    return value;
  }
  if (
    isDenseArray(value) &&
    value.every(
      (candidate) =>
        typeof candidate === "number" &&
        Number.isInteger(candidate) &&
        candidate >= 0 &&
        candidate <= 4,
    )
  ) {
    return Object.freeze([...value]) as readonly number[];
  }
  throw new TypeError(
    "Workspace gesture option panOnDrag must be a boolean or mouse-button list from 0 through 4.",
  );
}

function gesturePanOnScrollMode(overrides: UnknownRecord): WorkspacePanOnScrollMode {
  const value =
    overrides.panOnScrollMode === undefined
      ? WORKSPACE_DEFAULT_GESTURE_OPTIONS.panOnScrollMode
      : overrides.panOnScrollMode;
  if (value === "free" || value === "horizontal" || value === "vertical") {
    return value;
  }
  throw new TypeError(
    "Workspace gesture option panOnScrollMode must be free, horizontal, or vertical.",
  );
}

function assertGestureZoomRange(minZoom: number, initialZoom: number, maxZoom: number): void {
  if (minZoom < WORKSPACE_MIN_ZOOM || maxZoom > WORKSPACE_MAX_ZOOM) {
    throw new TypeError(
      `Workspace gesture zoom bounds must stay within ${WORKSPACE_MIN_ZOOM} and ${WORKSPACE_MAX_ZOOM}.`,
    );
  }
  if (minZoom > maxZoom) {
    throw new TypeError("Workspace gesture minZoom cannot exceed maxZoom.");
  }
  if (initialZoom < minZoom || initialZoom > maxZoom) {
    throw new TypeError("Workspace gesture initialZoom must be within the configured zoom bounds.");
  }
}

export function resolveWorkspaceGestureOptions(
  options?: WorkspaceGestureOptionOverrides,
): WorkspaceGestureOptions {
  const overrides = optionOverridesAt(
    options,
    gestureOptionKeys,
    "Workspace gesture options",
    "workspace gesture option",
  );
  const initialZoom = gestureNumber(overrides, "initialZoom");
  const maxZoom = gestureNumber(overrides, "maxZoom");
  const minZoom = gestureNumber(overrides, "minZoom");
  assertGestureZoomRange(minZoom, initialZoom, maxZoom);
  return Object.freeze({
    initialZoom,
    maxZoom,
    minZoom,
    panActivationKey: gestureActivationKey(overrides, "panActivationKey"),
    panOnDrag: gesturePanOnDrag(overrides),
    panOnScroll: gestureBoolean(overrides, "panOnScroll"),
    panOnScrollMode: gesturePanOnScrollMode(overrides),
    panOnScrollSpeed: gestureNumber(overrides, "panOnScrollSpeed"),
    zoomActivationKey: gestureActivationKey(overrides, "zoomActivationKey"),
    zoomOnDoubleClick: gestureBoolean(overrides, "zoomOnDoubleClick"),
    zoomOnPinch: gestureBoolean(overrides, "zoomOnPinch"),
    zoomOnScroll: gestureBoolean(overrides, "zoomOnScroll"),
  });
}
