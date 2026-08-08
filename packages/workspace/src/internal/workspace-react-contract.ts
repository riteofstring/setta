import type { HTMLAttributes, ReactNode, Ref } from "react";

import {
  createEmptyWorkspaceDocument,
  type WorkspaceAppearanceOptionOverrides,
  type WorkspaceCapabilities,
  type WorkspaceCapabilityOverrides,
  type WorkspaceController,
  type WorkspaceDocument,
  type WorkspaceDocumentChange,
  type WorkspaceGestureOptionOverrides,
  type WorkspaceGestureOptions,
  type WorkspaceGridOptionOverrides,
  type WorkspaceJsonValue,
} from "../core.js";
import { isDenseArray, isEnumerableDataProperty } from "./runtime-option-validation.js";
import type {
  SectionDefinition,
  WorkspaceSectionColorOption,
  WorkspaceSectionFactory,
  WorkspaceSectionTitleValidator,
} from "./workspace-section-contract.js";
import type { WorkspaceSectionRegistry } from "./workspace-section-registry.js";

export type WorkspaceDocumentChangeHandler<TSectionData = WorkspaceJsonValue> = (
  document: WorkspaceDocument<TSectionData>,
  change: WorkspaceDocumentChange,
) => void;

export type WorkspaceToolbarControlPlacement = "project" | "utility" | "viewport";

export type WorkspaceToolbarControl<TSectionData = WorkspaceJsonValue> = Readonly<{
  disabled?: boolean;
  icon: ReactNode;
  id: string;
  label: string;
  onPress(controller: WorkspaceController<TSectionData>): void;
  placement: WorkspaceToolbarControlPlacement;
  pressed?: boolean;
}>;

export type WorkspaceOverlayPlacement = WorkspaceToolbarControlPlacement | "canvas";

export type WorkspaceOverlayRenderer<TSectionData = WorkspaceJsonValue> = (
  controller: WorkspaceController<TSectionData>,
) => ReactNode;

export type WorkspaceOverlaySlots<TSectionData = WorkspaceJsonValue> = Partial<
  Record<WorkspaceOverlayPlacement, WorkspaceOverlayRenderer<TSectionData>>
>;

export type WorkspaceMinimapPlacement = "left" | "right";

export type WorkspaceMinimapOptions = Readonly<{
  placement?: WorkspaceMinimapPlacement;
  visible?: boolean;
}>;

export type WorkspaceMarqueeSelectionMode = "full" | "partial";

export type WorkspaceSelectionOptions = Readonly<{
  marqueeMode?: WorkspaceMarqueeSelectionMode;
}>;

export type WorkspaceBooleanPreferenceChangeHandler = (value: boolean) => void;

export type ResolvedWorkspaceMinimapOptions = Readonly<{
  placement: WorkspaceMinimapPlacement;
  visible: boolean;
}>;

export type ResolvedWorkspaceSelectionOptions = Readonly<{
  marqueeMode: WorkspaceMarqueeSelectionMode;
}>;

export type ResolvedWorkspaceOverlaySlots = Partial<Record<WorkspaceOverlayPlacement, ReactNode>>;

type SharedWorkspaceProps<TSectionData> = Omit<
  HTMLAttributes<HTMLElement>,
  "aria-label" | "children"
> & {
  ariaLabel?: string;
  appearanceOptions?: WorkspaceAppearanceOptionOverrides;
  capabilities?: WorkspaceCapabilityOverrides;
  controllerRef?: Ref<WorkspaceController<TSectionData>>;
  emptyState?: ReactNode;
  gestureOptions?: WorkspaceGestureOptionOverrides;
  gridOptions?: WorkspaceGridOptionOverrides;
  minimapOptions?: WorkspaceMinimapOptions;
  onGridSnapChange?: WorkspaceBooleanPreferenceChangeHandler;
  onMinimapVisibilityChange?: WorkspaceBooleanPreferenceChangeHandler;
  overlaySlots?: WorkspaceOverlaySlots<TSectionData>;
  readOnly?: boolean;
  sectionColorPalette?: readonly WorkspaceSectionColorOption[];
  sectionDefinitions?: readonly SectionDefinition<TSectionData>[];
  sectionFactory?: WorkspaceSectionFactory<TSectionData>;
  selectionOptions?: WorkspaceSelectionOptions;
  toolbarControls?: readonly WorkspaceToolbarControl<TSectionData>[];
  validateSectionTitle?: WorkspaceSectionTitleValidator;
};

type ControlledWorkspaceProps<TSectionData> = {
  defaultDocument?: never;
  document: WorkspaceDocument<TSectionData>;
  onDocumentChange: WorkspaceDocumentChangeHandler<TSectionData>;
};

type UncontrolledWorkspaceProps<TSectionData> = {
  defaultDocument?: WorkspaceDocument<TSectionData>;
  document?: never;
  onDocumentChange?: WorkspaceDocumentChangeHandler<TSectionData>;
};

export type WorkspaceProps<TSectionData = WorkspaceJsonValue> = SharedWorkspaceProps<TSectionData> &
  (ControlledWorkspaceProps<TSectionData> | UncontrolledWorkspaceProps<TSectionData>);

export type WorkspaceMode<TSectionData> =
  | Readonly<{ document: WorkspaceDocument<TSectionData>; type: "controlled" }>
  | Readonly<{ document: WorkspaceDocument<TSectionData>; type: "uncontrolled" }>;

const toolbarControlPlacements = new Set<WorkspaceToolbarControlPlacement>([
  "project",
  "utility",
  "viewport",
]);
const overlayPlacements = new Set<WorkspaceOverlayPlacement>([
  "canvas",
  "project",
  "utility",
  "viewport",
]);
const reservedToolbarControlIds = new Set([
  "add-section",
  "fit-sections",
  "reset-zoom",
  "show-minimap",
  "snap-to-grid",
  "zoom-in",
  "zoom-out",
]);
const toolbarControlKeys = new Set([
  "disabled",
  "icon",
  "id",
  "label",
  "onPress",
  "placement",
  "pressed",
]);
const minimapOptionKeys = new Set(["placement", "visible"]);
const selectionOptionKeys = new Set(["marqueeMode"]);

function plainRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  return value as Record<string, unknown>;
}

function assertKnownKeys(
  record: Record<string, unknown>,
  keys: ReadonlySet<string>,
  label: string,
): void {
  const invalidKey = Reflect.ownKeys(record).find(
    (key) => typeof key !== "string" || !isEnumerableDataProperty(record, key) || !keys.has(key),
  );
  if (invalidKey !== undefined) {
    throw new TypeError(`Unknown ${label} ${String(invalidKey)}.`);
  }
}

function optionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value !== undefined && typeof value !== "boolean") {
    throw new TypeError(`${label} must be a boolean.`);
  }
  return value;
}

function validateToolbarControl<TSectionData>(
  value: WorkspaceToolbarControl<TSectionData>,
  index: number,
): WorkspaceToolbarControl<TSectionData> {
  const label = `Workspace toolbar control at index ${String(index)}`;
  const record = plainRecord(value, label);
  assertKnownKeys(record, toolbarControlKeys, "workspace toolbar control field");
  if (typeof record.id !== "string" || record.id.trim().length === 0) {
    throw new TypeError(`${label} id must be a non-empty string.`);
  }
  if (reservedToolbarControlIds.has(record.id)) {
    throw new TypeError(`Workspace toolbar control id ${JSON.stringify(record.id)} is reserved.`);
  }
  if (typeof record.label !== "string" || record.label.trim().length === 0) {
    throw new TypeError(`${label} label must be a non-empty string.`);
  }
  if (!toolbarControlPlacements.has(record.placement as WorkspaceToolbarControlPlacement)) {
    throw new TypeError(`${label} placement must be project, viewport, or utility.`);
  }
  if (!Object.hasOwn(record, "icon")) {
    throw new TypeError(`${label} must provide an icon.`);
  }
  if (typeof record.onPress !== "function") {
    throw new TypeError(`${label} onPress must be a function.`);
  }
  optionalBoolean(record.disabled, `${label} disabled`);
  optionalBoolean(record.pressed, `${label} pressed`);
  return Object.freeze({ ...value });
}

export function resolveWorkspaceToolbarControls<TSectionData>(
  controls: readonly WorkspaceToolbarControl<TSectionData>[] | undefined,
): readonly WorkspaceToolbarControl<TSectionData>[] {
  if (controls === undefined) {
    return Object.freeze([]);
  }
  if (!isDenseArray(controls)) {
    throw new TypeError("Workspace toolbar controls must be a dense array without extra fields.");
  }
  const resolved = controls.map((control, index) => validateToolbarControl(control, index));
  const ids = new Set<string>();
  for (const control of resolved) {
    if (ids.has(control.id)) {
      throw new TypeError(`Duplicate workspace toolbar control id ${JSON.stringify(control.id)}.`);
    }
    ids.add(control.id);
  }
  return Object.freeze(resolved);
}

export function resolveWorkspaceOverlayRenderers<TSectionData>(
  slots: WorkspaceOverlaySlots<TSectionData> | undefined,
): WorkspaceOverlaySlots<TSectionData> {
  if (slots === undefined) {
    return Object.freeze({});
  }
  const record = plainRecord(slots, "Workspace overlay slots");
  assertKnownKeys(record, overlayPlacements, "workspace overlay placement");
  for (const [placement, renderer] of Object.entries(record)) {
    if (typeof renderer !== "function") {
      throw new TypeError(`Workspace overlay slot ${placement} must be a render function.`);
    }
  }
  return Object.freeze({ ...slots });
}

export function renderWorkspaceOverlaySlots<TSectionData>(
  slots: WorkspaceOverlaySlots<TSectionData>,
  controller: WorkspaceController<TSectionData>,
): ResolvedWorkspaceOverlaySlots {
  const rendered: ResolvedWorkspaceOverlaySlots = {};
  for (const placement of overlayPlacements) {
    const renderer = slots[placement];
    if (renderer) {
      rendered[placement] = renderer(controller);
    }
  }
  return rendered;
}

export function resolveWorkspaceMinimapOptions(
  options: WorkspaceMinimapOptions | undefined,
): ResolvedWorkspaceMinimapOptions {
  const record = options === undefined ? {} : plainRecord(options, "Workspace minimap options");
  assertKnownKeys(record, minimapOptionKeys, "workspace minimap option");
  const placement = record.placement === undefined ? "right" : record.placement;
  if (placement !== "left" && placement !== "right") {
    throw new TypeError("Workspace minimap placement must be left or right.");
  }
  return Object.freeze({
    placement,
    visible: optionalBoolean(record.visible, "Workspace minimap visible") ?? true,
  });
}

export function resolveWorkspaceSelectionOptions(
  options: WorkspaceSelectionOptions | undefined,
): ResolvedWorkspaceSelectionOptions {
  const record = options === undefined ? {} : plainRecord(options, "Workspace selection options");
  assertKnownKeys(record, selectionOptionKeys, "workspace selection option");
  const marqueeMode = record.marqueeMode ?? "partial";
  if (marqueeMode !== "full" && marqueeMode !== "partial") {
    throw new TypeError("Workspace marquee selection mode must be full or partial.");
  }
  return Object.freeze({ marqueeMode });
}

export function resolveWorkspaceMode<TSectionData>(
  document: WorkspaceDocument<TSectionData> | undefined,
  defaultDocument: WorkspaceDocument<TSectionData> | undefined,
  initialZoom: number,
  onDocumentChange: WorkspaceDocumentChangeHandler<TSectionData> | undefined,
): WorkspaceMode<TSectionData> {
  if (onDocumentChange !== undefined && typeof onDocumentChange !== "function") {
    throw new TypeError("Workspace onDocumentChange must be a function.");
  }
  if (document !== undefined && defaultDocument !== undefined) {
    throw new TypeError("Workspace cannot receive both document and defaultDocument.");
  }
  if (document !== undefined) {
    if (typeof onDocumentChange !== "function") {
      throw new TypeError("A controlled Workspace requires onDocumentChange.");
    }
    return { document, type: "controlled" };
  }
  if (defaultDocument !== undefined) {
    return { document: defaultDocument, type: "uncontrolled" };
  }
  const emptyDocument = createEmptyWorkspaceDocument() as WorkspaceDocument<TSectionData>;
  return {
    document: {
      ...emptyDocument,
      viewport: { ...emptyDocument.viewport, zoom: initialZoom },
    },
    type: "uncontrolled",
  };
}

export function assertStableWorkspaceMode(
  initialMode: WorkspaceMode<unknown>["type"],
  currentMode: string,
): void {
  if (initialMode !== currentMode) {
    throw new TypeError("Workspace cannot switch between controlled and uncontrolled usage.");
  }
}

export function assertWorkspaceViewportWithinGestureBounds(
  document: WorkspaceDocument<unknown>,
  gestureOptions: WorkspaceGestureOptions,
): void {
  const { zoom } = document.viewport;
  if (zoom < gestureOptions.minZoom || zoom > gestureOptions.maxZoom) {
    throw new TypeError(
      "Workspace document viewport zoom must be within the configured gesture zoom bounds.",
    );
  }
}

export function assertWorkspaceAccessibleName(ariaLabel: unknown): asserts ariaLabel is string {
  if (typeof ariaLabel !== "string" || ariaLabel.trim().length === 0) {
    throw new TypeError("Workspace ariaLabel must be a non-empty string.");
  }
}

export function assertWorkspaceSectionTitleValidator(
  value: unknown,
): asserts value is WorkspaceSectionTitleValidator | undefined {
  if (value !== undefined && typeof value !== "function") {
    throw new TypeError("Workspace validateSectionTitle must be a function.");
  }
}

export function assertWorkspaceSectionFactory<TSectionData>(
  value: unknown,
): asserts value is WorkspaceSectionFactory<TSectionData> | undefined {
  if (value !== undefined && typeof value !== "function") {
    throw new TypeError("Workspace sectionFactory must be a function.");
  }
}

export function workspaceCapabilitiesAreReadOnly(capabilities: WorkspaceCapabilities): boolean {
  return Object.values(capabilities).every((value) => !value);
}

export function workspaceCreationAvailability<TSectionData>(
  factory: WorkspaceSectionFactory<TSectionData> | undefined,
  registry: WorkspaceSectionRegistry<TSectionData>,
  capabilities: WorkspaceCapabilities,
  canvasReady: boolean,
): Readonly<{ configured: boolean; enabled: boolean }> {
  const configured = Boolean(factory) && registry.definitions().length > 0;
  return {
    configured,
    enabled: configured && capabilities.editStructure && canvasReady,
  };
}
