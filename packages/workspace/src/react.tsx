import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";

import {
  createEmptyWorkspaceDocument,
  resolveWorkspaceCapabilities,
  resolveWorkspaceGestureOptions,
  validateWorkspaceDocument,
  type WorkspaceAppearance,
  type WorkspaceAppearanceOptionOverrides,
  type WorkspaceCapabilityOverrides,
  type WorkspaceController,
  type WorkspaceDocument,
  type WorkspaceDocumentChange,
  type WorkspaceGestureOptionOverrides,
  type WorkspaceGestureOptions,
  type WorkspaceGridOptionOverrides,
  type WorkspaceJsonValue,
} from "./core.js";
import {
  WORKSPACE_NO_PAN_CLASS_NAME,
  WORKSPACE_NO_WHEEL_CLASS_NAME,
  WorkspaceCanvasAdapter,
} from "./internal/workspace-canvas-adapter.js";
import type { WorkspaceCanvasController } from "./internal/workspace-canvas-navigation.js";
import { createWorkspaceController } from "./internal/workspace-controller.js";
import {
  resolveWorkspaceAppearanceOptions,
  resolveWorkspaceGridOptions,
  type ResolvedWorkspaceAppearanceOptions,
} from "./internal/workspace-preferences.js";

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

export type WorkspaceBooleanPreferenceChangeHandler = (value: boolean) => void;

type ResolvedWorkspaceMinimapOptions = Readonly<{
  placement: WorkspaceMinimapPlacement;
  visible: boolean;
}>;

type ResolvedWorkspaceOverlaySlots = Partial<Record<WorkspaceOverlayPlacement, ReactNode>>;

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
    (key) =>
      typeof key !== "string" ||
      !Object.prototype.propertyIsEnumerable.call(record, key) ||
      !keys.has(key),
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

function resolveToolbarControls<TSectionData>(
  controls: readonly WorkspaceToolbarControl<TSectionData>[] | undefined,
): readonly WorkspaceToolbarControl<TSectionData>[] {
  if (controls === undefined) {
    return Object.freeze([]);
  }
  if (!Array.isArray(controls)) {
    throw new TypeError("Workspace toolbar controls must be an array.");
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

function resolveOverlayRenderers<TSectionData>(
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

function renderOverlaySlots<TSectionData>(
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

function resolveMinimapOptions(
  options: WorkspaceMinimapOptions | undefined,
): ResolvedWorkspaceMinimapOptions {
  const record = options === undefined ? {} : plainRecord(options, "Workspace minimap options");
  assertKnownKeys(record, minimapOptionKeys, "workspace minimap option");
  const placement = record.placement ?? "right";
  if (placement !== "left" && placement !== "right") {
    throw new TypeError("Workspace minimap placement must be left or right.");
  }
  return Object.freeze({
    placement,
    visible: optionalBoolean(record.visible, "Workspace minimap visible") ?? true,
  });
}

function useBooleanPreference(
  label: string,
  value: boolean,
  onChange: WorkspaceBooleanPreferenceChangeHandler | undefined,
): readonly [boolean, WorkspaceBooleanPreferenceChangeHandler] {
  if (onChange !== undefined && typeof onChange !== "function") {
    throw new TypeError(`${label} change handler must be a function.`);
  }
  const controlled = onChange !== undefined;
  const initialControlledRef = useRef(controlled);
  if (initialControlledRef.current !== controlled) {
    throw new TypeError(`${label} cannot switch between controlled and uncontrolled usage.`);
  }
  const [uncontrolledValue, setUncontrolledValue] = useState(value);
  const resolvedValue = controlled ? value : uncontrolledValue;
  useEffect(() => {
    if (!controlled) {
      setUncontrolledValue(value);
    }
  }, [controlled, value]);
  const setValue = useCallback(
    (nextValue: boolean) => {
      if (onChange) {
        onChange(nextValue);
      } else {
        setUncontrolledValue(nextValue);
      }
    },
    [onChange],
  );
  return [resolvedValue, setValue];
}

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
  toolbarControls?: readonly WorkspaceToolbarControl<TSectionData>[];
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

type WorkspaceMode<TSectionData> =
  | Readonly<{ document: WorkspaceDocument<TSectionData>; type: "controlled" }>
  | Readonly<{ document: WorkspaceDocument<TSectionData>; type: "uncontrolled" }>;

function resolveMode<TSectionData>(
  document: WorkspaceDocument<TSectionData> | undefined,
  defaultDocument: WorkspaceDocument<TSectionData> | undefined,
  initialZoom: number,
  onDocumentChange: WorkspaceDocumentChangeHandler<TSectionData> | undefined,
): WorkspaceMode<TSectionData> {
  if (document && defaultDocument) {
    throw new TypeError("Workspace cannot receive both document and defaultDocument.");
  }
  if (document) {
    if (typeof onDocumentChange !== "function") {
      throw new TypeError("A controlled Workspace requires onDocumentChange.");
    }
    return { document, type: "controlled" };
  }
  const emptyDocument = createEmptyWorkspaceDocument();
  return {
    document:
      defaultDocument ??
      ({
        ...emptyDocument,
        viewport: { ...emptyDocument.viewport, zoom: initialZoom },
      } as WorkspaceDocument<TSectionData>),
    type: "uncontrolled",
  };
}

function assertStableMode(initialMode: WorkspaceMode<unknown>["type"], currentMode: string): void {
  if (initialMode !== currentMode) {
    throw new TypeError("Workspace cannot switch between controlled and uncontrolled usage.");
  }
}

function assertViewportWithinGestureBounds(
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

const DARK_APPEARANCE_QUERY = "(prefers-color-scheme: dark)";
type ResolvedWorkspaceAppearance = Exclude<WorkspaceAppearance, "system">;
const lightAppearanceSnapshot = (): ResolvedWorkspaceAppearance => "light";
const emptyAppearanceSubscription = () => () => undefined;

function currentSystemAppearance(): ResolvedWorkspaceAppearance {
  return window.matchMedia(DARK_APPEARANCE_QUERY).matches ? "dark" : "light";
}

function subscribeToSystemAppearance(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_APPEARANCE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function useResolvedWorkspaceAppearance(
  appearance: WorkspaceAppearance,
): ResolvedWorkspaceAppearance {
  const followsSystem = appearance === "system";
  const systemAppearance = useSyncExternalStore(
    followsSystem ? subscribeToSystemAppearance : emptyAppearanceSubscription,
    followsSystem ? currentSystemAppearance : lightAppearanceSnapshot,
    lightAppearanceSnapshot,
  );
  return appearance === "system" ? systemAppearance : appearance;
}

function workspaceThemeStyle(
  options: ResolvedWorkspaceAppearanceOptions,
  appearance: ResolvedWorkspaceAppearance,
): CSSProperties {
  const tokens = options[appearance];
  return {
    "--setta-workspace-canvas-background": tokens.canvasBackground,
    "--setta-workspace-focus": tokens.focus,
    "--setta-workspace-grid-color": tokens.gridColor,
    "--setta-workspace-invalid": tokens.invalid,
    "--setta-workspace-minimap-background": tokens.minimapBackground,
    "--setta-workspace-section-background": tokens.sectionBackground,
    "--setta-workspace-section-muted-text": tokens.sectionMutedText,
    "--setta-workspace-section-text": tokens.sectionText,
    "--setta-workspace-selection": tokens.selection,
    "--setta-workspace-toolbar-background": tokens.toolbarBackground,
    colorScheme: appearance,
  } as CSSProperties;
}

export type WorkspaceInteractionBoundaryProps = HTMLAttributes<HTMLDivElement> &
  Readonly<{
    preventPan?: boolean;
    preventWheel?: boolean;
  }>;

export function WorkspaceInteractionBoundary({
  className,
  preventPan = true,
  preventWheel = true,
  ...props
}: WorkspaceInteractionBoundaryProps) {
  if (typeof preventPan !== "boolean" || typeof preventWheel !== "boolean") {
    throw new TypeError("Workspace interaction boundary options must be boolean.");
  }
  const resolvedClassName = [
    "setta-workspace__interaction-boundary",
    preventPan ? WORKSPACE_NO_PAN_CLASS_NAME : null,
    preventWheel ? WORKSPACE_NO_WHEEL_CLASS_NAME : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      {...props}
      className={resolvedClassName}
      data-workspace-prevent-pan={preventPan ? "true" : undefined}
      data-workspace-prevent-wheel={preventWheel ? "true" : undefined}
    />
  );
}

export function Workspace<TSectionData = WorkspaceJsonValue>(props: WorkspaceProps<TSectionData>) {
  const {
    ariaLabel = "Workspace",
    appearanceOptions: appearanceOptionOverrides,
    capabilities: capabilityOverrides,
    className,
    controllerRef,
    defaultDocument,
    document: controlledDocument,
    emptyState = "No sections yet. Add a section to start.",
    gestureOptions: gestureOptionOverrides,
    gridOptions: gridOptionOverrides,
    minimapOptions: minimapOptionOverrides,
    onDocumentChange,
    onGridSnapChange,
    onMinimapVisibilityChange,
    overlaySlots: overlaySlotOverrides,
    readOnly = false,
    style,
    toolbarControls: toolbarControlOverrides,
    ...sectionProps
  } = props;
  const gestureOptions = useMemo(
    () => resolveWorkspaceGestureOptions(gestureOptionOverrides),
    [gestureOptionOverrides],
  );
  const appearanceOptions = useMemo(
    () => resolveWorkspaceAppearanceOptions(appearanceOptionOverrides),
    [appearanceOptionOverrides],
  );
  const gridOptions = useMemo(
    () => resolveWorkspaceGridOptions(gridOptionOverrides),
    [gridOptionOverrides],
  );
  const minimapOptions = useMemo(
    () => resolveMinimapOptions(minimapOptionOverrides),
    [minimapOptionOverrides],
  );
  const toolbarControls = useMemo(
    () => resolveToolbarControls(toolbarControlOverrides),
    [toolbarControlOverrides],
  );
  const overlayRenderers = useMemo(
    () => resolveOverlayRenderers(overlaySlotOverrides),
    [overlaySlotOverrides],
  );
  const [gridSnap, setGridSnap] = useBooleanPreference(
    "Workspace grid snap",
    gridOptions.snap,
    onGridSnapChange,
  );
  const [minimapVisible, setMinimapVisible] = useBooleanPreference(
    "Workspace minimap visibility",
    minimapOptions.visible,
    onMinimapVisibilityChange,
  );
  const effectiveGridOptions = useMemo(
    () => Object.freeze({ ...gridOptions, snap: gridSnap }),
    [gridOptions, gridSnap],
  );
  const resolvedAppearance = useResolvedWorkspaceAppearance(appearanceOptions.appearance);
  const themeStyle = useMemo(
    () => workspaceThemeStyle(appearanceOptions, resolvedAppearance),
    [appearanceOptions, resolvedAppearance],
  );
  const mode = resolveMode(
    controlledDocument,
    defaultDocument,
    gestureOptions.initialZoom,
    onDocumentChange,
  );
  const initialModeRef = useRef(mode.type);
  assertStableMode(initialModeRef.current, mode.type);
  const [uncontrolledDocument, setUncontrolledDocument] = useState(mode.document);
  const document = mode.type === "controlled" ? mode.document : uncontrolledDocument;
  const validatedDocument = useMemo(() => {
    validateWorkspaceDocument(document);
    assertViewportWithinGestureBounds(document, gestureOptions);
    return document;
  }, [document, gestureOptions]);
  const capabilities = useMemo(
    () => resolveWorkspaceCapabilities(capabilityOverrides, readOnly),
    [capabilityOverrides, readOnly],
  );
  const documentRef = useRef(validatedDocument);
  const capabilitiesRef = useRef(capabilities);
  const controlledRef = useRef(mode.type === "controlled");
  const onDocumentChangeRef = useRef(onDocumentChange);
  documentRef.current = validatedDocument;
  capabilitiesRef.current = capabilities;
  controlledRef.current = mode.type === "controlled";
  onDocumentChangeRef.current = onDocumentChange;

  const canvasControllerRef = useRef<WorkspaceCanvasController | null>(null);
  const handleCanvasControllerChange = useCallback((next: WorkspaceCanvasController | null) => {
    canvasControllerRef.current = next;
  }, []);
  const internalControllerRef = useRef<WorkspaceController<TSectionData> | null>(null);
  if (!internalControllerRef.current) {
    internalControllerRef.current = createWorkspaceController({
      commit: (nextDocument, change) => {
        if (!controlledRef.current) {
          documentRef.current = nextDocument;
          setUncontrolledDocument(nextDocument);
        }
        onDocumentChangeRef.current?.(nextDocument, change);
      },
      getCapabilities: () => capabilitiesRef.current,
      getCanvasController: () => canvasControllerRef.current,
      getDocument: () => documentRef.current,
    });
  }
  const controller = internalControllerRef.current;
  useImperativeHandle(controllerRef, () => controller, [controller]);
  const overlaySlots = renderOverlaySlots(overlayRenderers, controller);

  const resolvedClassName = ["setta-workspace", className].filter(Boolean).join(" ");
  const hasNoSections = validatedDocument.rootSections.length === 0;
  const resolvedEmptyState = hasNoSections ? emptyState : null;

  return (
    <section
      {...sectionProps}
      aria-label={ariaLabel}
      className={resolvedClassName}
      data-read-only={readOnly ? "true" : "false"}
      data-setta-workspace=""
      data-workspace-appearance={appearanceOptions.appearance}
      data-workspace-mode={mode.type}
      data-workspace-resolved-appearance={resolvedAppearance}
      style={{ ...style, ...themeStyle }}
    >
      <WorkspaceCanvasAdapter
        ariaLabel={ariaLabel}
        document={validatedDocument}
        emptyState={resolvedEmptyState}
        gestureOptions={gestureOptions}
        gridOptions={effectiveGridOptions}
        minimapPlacement={minimapOptions.placement}
        minimapVisible={minimapVisible}
        onCanvasControllerChange={handleCanvasControllerChange}
        onGridSnapChange={setGridSnap}
        onMinimapVisibilityChange={setMinimapVisible}
        onViewportCommit={controller.setViewport}
        overlaySlots={overlaySlots}
        toolbarControls={toolbarControls}
        workspaceController={controller}
      />
    </section>
  );
}
