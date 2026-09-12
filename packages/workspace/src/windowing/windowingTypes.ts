export type WorkspaceWindowJsonValue =
  | boolean
  | number
  | string
  | null
  | readonly WorkspaceWindowJsonValue[]
  | { readonly [key: string]: WorkspaceWindowJsonValue };

export interface WorkspaceWindowBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface WorkspaceWindowBoundaryInsets {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface WorkspaceWindowViewport {
  readonly width: number;
  readonly height: number;
  readonly insets: WorkspaceWindowBoundaryInsets;
}

export type WorkspaceFloatingSnapPreset =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "top_left"
  | "top_right"
  | "bottom_left"
  | "bottom_right";

export type WorkspaceWindowPlacement =
  "canvas_section" | "bottom_docked" | "floating" | "maximized";

export type WorkspaceWindowRestorePlacement = "bottom_docked" | "floating";

export const WORKSPACE_SECTION_WINDOW_SURFACE_KIND = "workspace_section";

export interface WorkspaceWindowDockMetrics {
  readonly preferredWidthPx: number;
  readonly widthFraction: number;
}

export interface WorkspaceWindowDockMetricsInput {
  readonly preferredWidthPx: number;
  readonly widthFraction: number;
}

const WORKSPACE_WINDOW_DEFAULT_DOCK_PREFERRED_WIDTH_PX = 460;
const WORKSPACE_WINDOW_DEFAULT_DOCK_WIDTH_FRACTION = 1;

export interface WorkspaceFloatingWindow {
  readonly id: string;
  readonly contentId: string;
  readonly surfaceKind: string;
  readonly title: string;
  readonly rendererData: WorkspaceWindowJsonValue;

  readonly sectionId: string | null;
  readonly bounds: WorkspaceWindowBounds;
  readonly placement: WorkspaceWindowPlacement;
  readonly restoreBounds: WorkspaceWindowBounds | null;

  readonly restorePlacement: WorkspaceWindowRestorePlacement | null;

  readonly lastUnsnappedBounds: WorkspaceWindowBounds | null;
  readonly dockMetrics: WorkspaceWindowDockMetrics;
  readonly isMinimized: boolean;
  readonly isClosed: boolean;
  readonly zIndex: number;
}

export interface WorkspaceWindowingState {
  readonly windows: readonly WorkspaceFloatingWindow[];
  readonly nextFocusOrder: number;
}

export interface WorkspaceFloatingWindowInput {
  readonly id: string;
  readonly contentId: string;
  readonly surfaceKind: string;
  readonly title: string;
  readonly rendererData: WorkspaceWindowJsonValue;
  readonly sectionId?: string | null;
  readonly bounds: WorkspaceWindowBounds;
  readonly placement?: WorkspaceWindowPlacement;
  readonly restoreBounds?: WorkspaceWindowBounds | null;
  readonly restorePlacement?: WorkspaceWindowRestorePlacement | null;
  readonly lastUnsnappedBounds?: WorkspaceWindowBounds | null;
  readonly dockMetrics?: WorkspaceWindowDockMetricsInput;
  readonly isMinimized?: boolean;
  readonly isClosed?: boolean;
  readonly zIndex?: number;
}

export interface WorkspaceWindowingStateInput {
  readonly windows?: readonly WorkspaceFloatingWindowInput[];
  readonly nextFocusOrder?: number;
}

export interface WorkspaceWindowingMutationOptions {
  readonly layoutEditable?: boolean;
}

export type WorkspaceWindowingErrorCode =
  | "duplicate_content_identity"
  | "duplicate_section_binding"
  | "duplicate_window_id"
  | "invalid_bounds"
  | "invalid_input"
  | "invalid_transition"
  | "layout_disabled"
  | "unknown_window";

export class WorkspaceWindowingError extends Error {
  readonly code: WorkspaceWindowingErrorCode;

  constructor(code: WorkspaceWindowingErrorCode, message: string) {
    super(message);
    this.name = "WorkspaceWindowingError";
    this.code = code;
  }
}

const WINDOW_FIELDS = new Set([
  "id",
  "contentId",
  "surfaceKind",
  "title",
  "rendererData",
  "sectionId",
  "bounds",
  "placement",
  "restoreBounds",
  "restorePlacement",
  "lastUnsnappedBounds",
  "dockMetrics",
  "isMinimized",
  "isClosed",
  "zIndex",
]);

const STATE_FIELDS = new Set(["windows", "nextFocusOrder"]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertRecord(value: unknown, owner: string): Record<string, unknown> {
  if (!isPlainRecord(value)) {
    throw new WorkspaceWindowingError(
      "invalid_input",
      `${owner} must be a plain object.`,
    );
  }
  return value;
}

function assertKnownFields(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  owner: string,
): void {
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      throw new WorkspaceWindowingError(
        "invalid_input",
        `${owner} contains unknown field ${field}.`,
      );
    }
  }
}

function assertTrimmedNonblankString(value: unknown, owner: string): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value !== value.trim()
  ) {
    throw new WorkspaceWindowingError(
      "invalid_input",
      `${owner} must be a nonblank trimmed string.`,
    );
  }
  return value;
}

function assertFiniteNumber(value: unknown, owner: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new WorkspaceWindowingError(
      "invalid_input",
      `${owner} must be a finite number.`,
    );
  }
  return value;
}

function assertBoolean(value: unknown, owner: string): boolean {
  if (typeof value !== "boolean") {
    throw new WorkspaceWindowingError(
      "invalid_input",
      `${owner} must be a boolean.`,
    );
  }
  return value;
}

function cloneJsonValue(
  value: unknown,
  owner: string,
): WorkspaceWindowJsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new WorkspaceWindowingError(
        "invalid_input",
        `${owner} must contain only finite numbers.`,
      );
    }
    return value;
  }
  if (Array.isArray(value)) {
    return Object.freeze(
      value.map((entry, index) => cloneJsonValue(entry, `${owner}[${index}]`)),
    );
  }
  if (!isPlainRecord(value)) {
    throw new WorkspaceWindowingError(
      "invalid_input",
      `${owner} must contain only JSON values.`,
    );
  }

  const next: Record<string, WorkspaceWindowJsonValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    next[key] = cloneJsonValue(entry, `${owner}.${key}`);
  }
  return Object.freeze(next);
}

function parseBounds(value: unknown, owner: string): WorkspaceWindowBounds {
  const record = assertRecord(value, owner);
  assertKnownFields(record, new Set(["x", "y", "width", "height"]), owner);
  const x = assertFiniteNumber(record.x, `${owner}.x`);
  const y = assertFiniteNumber(record.y, `${owner}.y`);
  const width = assertFiniteNumber(record.width, `${owner}.width`);
  const height = assertFiniteNumber(record.height, `${owner}.height`);
  if (width <= 0 || height <= 0) {
    throw new WorkspaceWindowingError(
      "invalid_bounds",
      `${owner} width and height must be greater than zero.`,
    );
  }
  return Object.freeze({ x, y, width, height });
}

function parsePlacement(
  value: unknown,
  owner: string,
): WorkspaceWindowPlacement {
  if (
    value === "canvas_section" ||
    value === "bottom_docked" ||
    value === "floating" ||
    value === "maximized"
  ) {
    return value;
  }
  throw new WorkspaceWindowingError(
    "invalid_input",
    `${owner} must be canvas_section, bottom_docked, floating, or maximized.`,
  );
}

function parseRestorePlacement(
  value: unknown,
  owner: string,
): WorkspaceWindowRestorePlacement {
  if (value === "bottom_docked" || value === "floating") {
    return value;
  }
  throw new WorkspaceWindowingError(
    "invalid_input",
    `${owner} must be bottom_docked or floating.`,
  );
}

function parseNonnegativeInteger(value: unknown, owner: string): number {
  const number = assertFiniteNumber(value, owner);
  if (!Number.isInteger(number) || number < 0) {
    throw new WorkspaceWindowingError(
      "invalid_input",
      `${owner} must be a nonnegative integer.`,
    );
  }
  return number;
}

function parseOptionalPlacement(value: unknown): WorkspaceWindowPlacement {
  return value === undefined
    ? "floating"
    : parsePlacement(value, "Workspace floating window.placement");
}

function parseOptionalBounds(
  value: unknown,
  owner: string,
): WorkspaceWindowBounds | null {
  return value === undefined || value === null
    ? null
    : parseBounds(value, owner);
}

function parseOptionalRestorePlacement(
  value: unknown,
  owner: string,
  placement: WorkspaceWindowPlacement,
): WorkspaceWindowRestorePlacement | null {
  if (value === undefined) {
    return placement === "maximized" ? "floating" : null;
  }
  return value === null ? null : parseRestorePlacement(value, owner);
}

function parseOptionalSectionId(value: unknown, owner: string): string | null {
  return value === undefined || value === null
    ? null
    : assertTrimmedNonblankString(value, owner);
}

function parseDockMetrics(
  value: unknown,
  owner: string,
): WorkspaceWindowDockMetrics {
  const record = assertRecord(value, owner);
  assertKnownFields(
    record,
    new Set(["preferredWidthPx", "widthFraction"]),
    owner,
  );
  const preferredWidthPx = assertFiniteNumber(
    record.preferredWidthPx,
    `${owner}.preferredWidthPx`,
  );
  const widthFraction = assertFiniteNumber(
    record.widthFraction,
    `${owner}.widthFraction`,
  );
  if (preferredWidthPx <= 0) {
    throw new WorkspaceWindowingError(
      "invalid_input",
      `${owner}.preferredWidthPx must be greater than zero.`,
    );
  }
  if (widthFraction <= 0 || widthFraction > 1) {
    throw new WorkspaceWindowingError(
      "invalid_input",
      `${owner}.widthFraction must be greater than zero and no greater than one.`,
    );
  }
  return Object.freeze({ preferredWidthPx, widthFraction });
}

function parseOptionalDockMetrics(value: unknown): WorkspaceWindowDockMetrics {
  return value === undefined
    ? Object.freeze({
        preferredWidthPx: WORKSPACE_WINDOW_DEFAULT_DOCK_PREFERRED_WIDTH_PX,
        widthFraction: WORKSPACE_WINDOW_DEFAULT_DOCK_WIDTH_FRACTION,
      })
    : parseDockMetrics(value, "Workspace floating window.dockMetrics");
}

function parseOptionalBoolean(value: unknown, owner: string): boolean {
  return value === undefined ? false : assertBoolean(value, owner);
}

function parseOptionalZIndex(value: unknown): number {
  return value === undefined
    ? 0
    : parseNonnegativeInteger(value, "Workspace floating window.zIndex");
}

function assertWindowIsNotMinimizedAndClosed(
  isMinimized: boolean,
  isClosed: boolean,
): void {
  if (isMinimized && isClosed) {
    throw new WorkspaceWindowingError(
      "invalid_transition",
      "A workspace floating window cannot be minimized and closed at the same time.",
    );
  }
}

function assertMaximizedWindowHasRestoreState(
  placement: WorkspaceWindowPlacement,
  restoreBounds: WorkspaceWindowBounds | null,
  restorePlacement: WorkspaceWindowRestorePlacement | null,
): void {
  if (placement === "maximized" && restoreBounds === null) {
    throw new WorkspaceWindowingError(
      "invalid_transition",
      "A maximized workspace floating window requires restore bounds.",
    );
  }
  if (placement === "maximized" && restorePlacement === null) {
    throw new WorkspaceWindowingError(
      "invalid_transition",
      "A maximized workspace floating window requires a restore placement.",
    );
  }
}

function assertNonMaximizedWindowHasNoRestoreState(
  placement: WorkspaceWindowPlacement,
  restoreBounds: WorkspaceWindowBounds | null,
  restorePlacement: WorkspaceWindowRestorePlacement | null,
): void {
  if (placement !== "maximized" && restoreBounds !== null) {
    throw new WorkspaceWindowingError(
      "invalid_transition",
      "Only a maximized workspace floating window can retain restore bounds.",
    );
  }
  if (placement !== "maximized" && restorePlacement !== null) {
    throw new WorkspaceWindowingError(
      "invalid_transition",
      "Only a maximized workspace floating window can retain a restore placement.",
    );
  }
}

function assertWindowLifecycle(
  placement: WorkspaceWindowPlacement,
  restoreBounds: WorkspaceWindowBounds | null,
  restorePlacement: WorkspaceWindowRestorePlacement | null,
  isMinimized: boolean,
  isClosed: boolean,
): void {
  assertWindowIsNotMinimizedAndClosed(isMinimized, isClosed);
  assertMaximizedWindowHasRestoreState(
    placement,
    restoreBounds,
    restorePlacement,
  );
  assertNonMaximizedWindowHasNoRestoreState(
    placement,
    restoreBounds,
    restorePlacement,
  );
}

function assertSectionSurfaceOwnership(
  surfaceKind: string,
  sectionId: string | null,
): void {
  if (
    sectionId !== null &&
    surfaceKind !== WORKSPACE_SECTION_WINDOW_SURFACE_KIND
  ) {
    throw new WorkspaceWindowingError(
      "invalid_transition",
      "A workspace section window must use the reserved section surface kind.",
    );
  }
  if (
    sectionId === null &&
    surfaceKind === WORKSPACE_SECTION_WINDOW_SURFACE_KIND
  ) {
    throw new WorkspaceWindowingError(
      "invalid_transition",
      "The reserved workspace section surface kind requires a section id.",
    );
  }
}

function assertCanvasSectionOwnership(
  sectionId: string | null,
  placement: WorkspaceWindowPlacement,
  isMinimized: boolean,
  isClosed: boolean,
): void {
  if (placement === "canvas_section" && sectionId === null) {
    throw new WorkspaceWindowingError(
      "invalid_transition",
      "Only a section-bound workspace window can be canvas-owned.",
    );
  }
  if (placement === "canvas_section" && (isMinimized || isClosed)) {
    throw new WorkspaceWindowingError(
      "invalid_transition",
      "A canvas-owned workspace section window cannot be minimized or closed.",
    );
  }
}

function assertWindowOwnership(
  surfaceKind: string,
  sectionId: string | null,
  placement: WorkspaceWindowPlacement,
  isMinimized: boolean,
  isClosed: boolean,
): void {
  assertSectionSurfaceOwnership(surfaceKind, sectionId);
  assertCanvasSectionOwnership(sectionId, placement, isMinimized, isClosed);
}

export function createWorkspaceFloatingWindow(
  input: WorkspaceFloatingWindowInput | unknown,
): WorkspaceFloatingWindow {
  const record = assertRecord(input, "Workspace floating window");
  assertKnownFields(record, WINDOW_FIELDS, "Workspace floating window");
  const id = assertTrimmedNonblankString(
    record.id,
    "Workspace floating window.id",
  );
  const contentId = assertTrimmedNonblankString(
    record.contentId,
    "Workspace floating window.contentId",
  );
  const surfaceKind = assertTrimmedNonblankString(
    record.surfaceKind,
    "Workspace floating window.surfaceKind",
  );
  const title = assertTrimmedNonblankString(
    record.title,
    "Workspace floating window.title",
  );
  const sectionId = parseOptionalSectionId(
    record.sectionId,
    "Workspace floating window.sectionId",
  );
  const bounds = parseBounds(record.bounds, "Workspace floating window.bounds");
  const placement = parseOptionalPlacement(record.placement);
  const restoreBounds = parseOptionalBounds(
    record.restoreBounds,
    "Workspace floating window.restoreBounds",
  );
  const restorePlacement = parseOptionalRestorePlacement(
    record.restorePlacement,
    "Workspace floating window.restorePlacement",
    placement,
  );
  const lastUnsnappedBounds = parseOptionalBounds(
    record.lastUnsnappedBounds,
    "Workspace floating window.lastUnsnappedBounds",
  );
  const dockMetrics = parseOptionalDockMetrics(record.dockMetrics);
  const isMinimized = parseOptionalBoolean(
    record.isMinimized,
    "Workspace floating window.isMinimized",
  );
  const isClosed = parseOptionalBoolean(
    record.isClosed,
    "Workspace floating window.isClosed",
  );
  const zIndex = parseOptionalZIndex(record.zIndex);

  assertWindowLifecycle(
    placement,
    restoreBounds,
    restorePlacement,
    isMinimized,
    isClosed,
  );
  assertWindowOwnership(
    surfaceKind,
    sectionId,
    placement,
    isMinimized,
    isClosed,
  );

  return Object.freeze({
    id,
    contentId,
    surfaceKind,
    title,
    rendererData: cloneJsonValue(
      record.rendererData,
      "Workspace floating window.rendererData",
    ),
    sectionId,
    bounds,
    placement,
    restoreBounds,
    restorePlacement,
    lastUnsnappedBounds,
    dockMetrics,
    isMinimized,
    isClosed,
    zIndex,
  });
}

export function createWorkspaceWindowViewport(
  input: WorkspaceWindowViewport | unknown,
): WorkspaceWindowViewport {
  const record = assertRecord(input, "Workspace window viewport");
  assertKnownFields(
    record,
    new Set(["width", "height", "insets"]),
    "Workspace window viewport",
  );
  const width = assertFiniteNumber(
    record.width,
    "Workspace window viewport.width",
  );
  const height = assertFiniteNumber(
    record.height,
    "Workspace window viewport.height",
  );
  if (width <= 0 || height <= 0) {
    throw new WorkspaceWindowingError(
      "invalid_input",
      "Workspace window viewport width and height must be greater than zero.",
    );
  }
  const insetRecord = assertRecord(
    record.insets,
    "Workspace window viewport.insets",
  );
  assertKnownFields(
    insetRecord,
    new Set(["left", "right", "top", "bottom"]),
    "Workspace window viewport.insets",
  );
  const left = assertFiniteNumber(
    insetRecord.left,
    "Workspace window viewport.insets.left",
  );
  const right = assertFiniteNumber(
    insetRecord.right,
    "Workspace window viewport.insets.right",
  );
  const top = assertFiniteNumber(
    insetRecord.top,
    "Workspace window viewport.insets.top",
  );
  const bottom = assertFiniteNumber(
    insetRecord.bottom,
    "Workspace window viewport.insets.bottom",
  );
  if (left < 0 || right < 0 || top < 0 || bottom < 0) {
    throw new WorkspaceWindowingError(
      "invalid_input",
      "Workspace window viewport insets must be nonnegative.",
    );
  }
  return Object.freeze({
    width,
    height,
    insets: Object.freeze({ left, right, top, bottom }),
  });
}

export function createWorkspaceWindowingState(
  input: WorkspaceWindowingStateInput | unknown = {},
): WorkspaceWindowingState {
  const record = assertRecord(input, "Workspace windowing state");
  assertKnownFields(record, STATE_FIELDS, "Workspace windowing state");
  const windowsValue = record.windows === undefined ? [] : record.windows;
  if (!Array.isArray(windowsValue)) {
    throw new WorkspaceWindowingError(
      "invalid_input",
      "Workspace windowing state.windows must be an array.",
    );
  }

  const ids = new Set<string>();
  const contentIds = new Set<string>();
  const sectionIds = new Set<string>();
  const windows = windowsValue.map((value, index) => {
    const window = createWorkspaceFloatingWindow(value);
    if (ids.has(window.id)) {
      throw new WorkspaceWindowingError(
        "duplicate_window_id",
        `Workspace windowing state contains duplicate window id ${window.id} at index ${index}.`,
      );
    }
    if (contentIds.has(window.contentId)) {
      throw new WorkspaceWindowingError(
        "duplicate_content_identity",
        `Workspace windowing state contains duplicate content identity ${window.contentId} at index ${index}.`,
      );
    }
    if (window.sectionId !== null && sectionIds.has(window.sectionId)) {
      throw new WorkspaceWindowingError(
        "duplicate_section_binding",
        `Workspace windowing state contains duplicate section binding ${window.sectionId} at index ${index}.`,
      );
    }
    ids.add(window.id);
    contentIds.add(window.contentId);
    if (window.sectionId !== null) sectionIds.add(window.sectionId);
    return window;
  });
  const highestZIndex = windows.reduce(
    (highest, window) => Math.max(highest, window.zIndex),
    0,
  );
  const requestedNextFocusOrder =
    record.nextFocusOrder === undefined
      ? highestZIndex + 1
      : parseNonnegativeInteger(
          record.nextFocusOrder,
          "Workspace windowing state.nextFocusOrder",
        );
  const nextFocusOrder = Math.max(
    highestZIndex + 1,
    requestedNextFocusOrder,
    1,
  );
  return Object.freeze({
    windows: Object.freeze(windows),
    nextFocusOrder,
  });
}

export function isWorkspaceWindowVisible(
  window: WorkspaceFloatingWindow,
): boolean {
  return (
    window.placement !== "canvas_section" &&
    !window.isClosed &&
    !window.isMinimized
  );
}

export function assertWorkspaceWindowingLayoutEditable(
  options: WorkspaceWindowingMutationOptions | undefined,
): void {
  if (options?.layoutEditable === false) {
    throw new WorkspaceWindowingError(
      "layout_disabled",
      "Workspace window layout editing is disabled.",
    );
  }
}

export function createWorkspaceWindowBounds(
  input: WorkspaceWindowBounds | unknown,
): WorkspaceWindowBounds {
  return parseBounds(input, "Workspace window bounds");
}

export function createWorkspaceWindowDockMetrics(
  input: WorkspaceWindowDockMetricsInput | unknown,
): WorkspaceWindowDockMetrics {
  return parseDockMetrics(input, "Workspace window dock metrics");
}
