export const WORKSPACE_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const WORKSPACE_MIN_ZOOM = 0.1;
export const WORKSPACE_MAX_ZOOM = 10;
export const WORKSPACE_DEFAULT_ZOOM = 1;

export type WorkspaceJsonValue =
  | boolean
  | null
  | number
  | string
  | readonly WorkspaceJsonValue[]
  | { readonly [key: string]: WorkspaceJsonValue };

export type WorkspacePoint = Readonly<{
  x: number;
  y: number;
}>;

export type WorkspaceViewport = WorkspacePoint &
  Readonly<{
    zoom: number;
  }>;

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

export type WorkspaceGridPattern = "cross" | "dots" | "lines";

export type WorkspaceGridOptions = Readonly<{
  markSize?: number;
  pattern?: WorkspaceGridPattern;
  snap: boolean;
  spacing: readonly [x: number, y: number];
  visible: boolean;
}>;

export type WorkspaceGridOptionOverrides = Partial<WorkspaceGridOptions>;
export type WorkspaceAppearance = "dark" | "light" | "system";

export type WorkspaceThemeTokens = Readonly<{
  canvasBackground: string;
  focus: string;
  gridColor: string;
  invalid: string;
  minimapBackground: string;
  sectionBackground: string;
  sectionMutedText: string;
  sectionText: string;
  selection: string;
  toolbarBackground: string;
}>;

export type WorkspaceAppearanceOptions = Readonly<{
  appearance: WorkspaceAppearance;
  dark?: Partial<WorkspaceThemeTokens>;
  light?: Partial<WorkspaceThemeTokens>;
}>;

export type WorkspaceAppearanceOptionOverrides = Partial<WorkspaceAppearanceOptions>;

export type SectionOrientation = "horizontal" | "vertical";
export type SectionOverflow = "grow" | "scroll";
export type SectionChrome = "compact" | "default" | "none" | "transparent";
export type SectionDimensionMode = "content" | "fixed";

export type SectionDimension = Readonly<{
  mode: SectionDimensionMode;
  value: number;
}>;

export type WorkspaceSectionSize = Readonly<{
  height: SectionDimension;
  width: SectionDimension;
}>;

export type WorkspaceSectionPresentation = Readonly<{
  accentColor: string | null;
  chrome: SectionChrome;
  tagColor: string | null;
}>;

export type WorkspaceChildLayout = Readonly<{
  orientation: SectionOrientation;
  overflow: SectionOverflow;
  sectionIds: readonly string[];
}>;

export type WorkspaceSection<TSectionData = WorkspaceJsonValue> = Readonly<{
  childLayout: WorkspaceChildLayout | null;
  data: TSectionData;
  id: string;
  isMinimized: boolean;
  kind: string;
  positionAndSizeLocked: boolean;
  presentation: WorkspaceSectionPresentation;
  size: WorkspaceSectionSize;
  title: string;
}>;

export type WorkspaceRootSection = Readonly<{
  position: WorkspacePoint;
  sectionId: string;
}>;

export type WorkspaceDocument<TSectionData = WorkspaceJsonValue> = Readonly<{
  rootSections: readonly WorkspaceRootSection[];
  schemaVersion: typeof WORKSPACE_DOCUMENT_SCHEMA_VERSION;
  sections: Readonly<Record<string, WorkspaceSection<TSectionData>>>;
  viewport: WorkspaceViewport;
}>;

export type WorkspaceParentLookup = ReadonlyMap<string, string | null>;

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

export type WorkspaceActionRejectionReason =
  "layout-edit-disabled" | "presentation-edit-disabled" | "structure-edit-disabled";

export type WorkspaceActionResult =
  | Readonly<{ status: "applied" | "unchanged" }>
  | Readonly<{ reason: WorkspaceActionRejectionReason; status: "rejected" }>;

export type WorkspaceFitOptions = Readonly<{
  padding?: number;
}>;

export type WorkspaceDocumentChangeReason =
  "section-delete" | "section-lock" | "section-minimize" | "viewport";

export type WorkspaceDocumentChange = Readonly<{
  reason: WorkspaceDocumentChangeReason;
}>;

export type WorkspaceController<TSectionData = WorkspaceJsonValue> = Readonly<{
  deleteSections(sectionIds: readonly string[]): WorkspaceActionResult;
  fitSection(sectionId: string, options?: WorkspaceFitOptions): Promise<WorkspaceActionResult>;
  fitSections(
    sectionIds: readonly string[],
    options?: WorkspaceFitOptions,
  ): Promise<WorkspaceActionResult>;
  focusNextSection(sectionId: string): Promise<WorkspaceActionResult>;
  focusPreviousSection(sectionId: string): Promise<WorkspaceActionResult>;
  focusSection(sectionId: string): Promise<WorkspaceActionResult>;
  getCapabilities(): WorkspaceCapabilities;
  getDocument(): WorkspaceDocument<TSectionData>;
  setSectionMinimized(sectionId: string, isMinimized: boolean): WorkspaceActionResult;
  setSectionsLocked(sectionIds: readonly string[], locked: boolean): WorkspaceActionResult;
  setViewport(viewport: WorkspaceViewport): WorkspaceActionResult;
}>;

export type WorkspaceDocumentValidationCode =
  | "cycle"
  | "duplicate-placement"
  | "invalid-color"
  | "invalid-json"
  | "invalid-section"
  | "invalid-value"
  | "unknown-section"
  | "unreachable-section"
  | "unsupported-schema-version";

export class WorkspaceDocumentValidationError extends TypeError {
  readonly code: WorkspaceDocumentValidationCode;
  readonly path: string;

  constructor(code: WorkspaceDocumentValidationCode, path: string, detail: string) {
    super(`${path}: ${detail}`);
    this.name = "WorkspaceDocumentValidationError";
    this.code = code;
    this.path = path;
  }
}

type UnknownRecord = Record<string, unknown>;

const documentKeys = ["rootSections", "schemaVersion", "sections", "viewport"] as const;
const viewportKeys = ["x", "y", "zoom"] as const;
const rootSectionKeys = ["position", "sectionId"] as const;
const positionKeys = ["x", "y"] as const;
const sectionKeys = [
  "childLayout",
  "data",
  "id",
  "isMinimized",
  "kind",
  "positionAndSizeLocked",
  "presentation",
  "size",
  "title",
] as const;
const sizeKeys = ["height", "width"] as const;
const dimensionKeys = ["mode", "value"] as const;
const presentationKeys = ["accentColor", "chrome", "tagColor"] as const;
const childLayoutKeys = ["orientation", "overflow", "sectionIds"] as const;
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

const cssNumber = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?`;
const cssNumberOrPercent = String.raw`${cssNumber}%?`;
const cssPercent = String.raw`${cssNumber}%`;
const cssAngle = String.raw`${cssNumber}(?:deg|grad|rad|turn)?`;
const cssAlpha = cssNumberOrPercent;
const spaceSeparatedAlpha = String.raw`(?:\s*\/\s*${cssAlpha})?`;
const commaSeparatedAlpha = String.raw`(?:\s*,\s*${cssAlpha})?`;
const colorFunctionPatterns = [
  new RegExp(
    String.raw`^rgba?\(\s*(?:${cssNumberOrPercent}\s+${cssNumberOrPercent}\s+${cssNumberOrPercent}${spaceSeparatedAlpha}|${cssNumberOrPercent}\s*,\s*${cssNumberOrPercent}\s*,\s*${cssNumberOrPercent}${commaSeparatedAlpha})\s*\)$`,
    "iu",
  ),
  new RegExp(
    String.raw`^hsla?\(\s*(?:${cssAngle}\s+${cssPercent}\s+${cssPercent}${spaceSeparatedAlpha}|${cssAngle}\s*,\s*${cssPercent}\s*,\s*${cssPercent}${commaSeparatedAlpha})\s*\)$`,
    "iu",
  ),
  new RegExp(
    String.raw`^hwb\(\s*${cssAngle}\s+${cssPercent}\s+${cssPercent}${spaceSeparatedAlpha}\s*\)$`,
    "iu",
  ),
  new RegExp(
    String.raw`^(?:lab|oklab)\(\s*${cssNumberOrPercent}\s+${cssNumberOrPercent}\s+${cssNumberOrPercent}${spaceSeparatedAlpha}\s*\)$`,
    "iu",
  ),
  new RegExp(
    String.raw`^(?:lch|oklch)\(\s*${cssNumberOrPercent}\s+${cssNumberOrPercent}\s+${cssAngle}${spaceSeparatedAlpha}\s*\)$`,
    "iu",
  ),
  new RegExp(
    String.raw`^color\(\s*(?:a98-rgb|display-p3|prophoto-rgb|rec2020|srgb|srgb-linear|xyz|xyz-d50|xyz-d65)\s+${cssNumberOrPercent}\s+${cssNumberOrPercent}\s+${cssNumberOrPercent}${spaceSeparatedAlpha}\s*\)$`,
    "iu",
  ),
] as const;
const cssNamedColors = new Set(
  (
    "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue " +
    "blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk " +
    "crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki " +
    "darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen " +
    "darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue " +
    "dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite " +
    "gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki " +
    "lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan " +
    "lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen " +
    "lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen " +
    "magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen " +
    "mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream " +
    "mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid " +
    "palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum " +
    "powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown " +
    "seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen " +
    "steelblue tan teal thistle tomato transparent turquoise violet wheat white whitesmoke yellow " +
    "yellowgreen"
  ).split(" "),
);

function resolvedCapability(
  overrides: WorkspaceCapabilityOverrides | undefined,
  capability: keyof WorkspaceCapabilities,
): boolean {
  const value = overrides?.[capability];
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
  const resolved = {
    editLayout: resolvedCapability(overrides, "editLayout"),
    editPresentation: resolvedCapability(overrides, "editPresentation"),
    editStructure: resolvedCapability(overrides, "editStructure"),
  };
  if (readOnly) {
    return { editLayout: false, editPresentation: false, editStructure: false };
  }
  return resolved;
}

function gestureOverridesAt(value: WorkspaceGestureOptionOverrides | undefined): UnknownRecord {
  if (value === undefined) {
    return {};
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Workspace gesture options must be an object.");
  }
  const overrides = value as UnknownRecord;
  const supported = new Set<string>(gestureOptionKeys);
  const unknown = Object.keys(overrides).find((key) => !supported.has(key));
  if (unknown) {
    throw new TypeError(`Unknown workspace gesture option ${unknown}.`);
  }
  return overrides;
}

function gestureBoolean(
  overrides: UnknownRecord,
  key: "panOnScroll" | "zoomOnDoubleClick" | "zoomOnPinch" | "zoomOnScroll",
): boolean {
  const value = overrides[key] ?? WORKSPACE_DEFAULT_GESTURE_OPTIONS[key];
  if (typeof value !== "boolean") {
    throw new TypeError(`Workspace gesture option ${key} must be a boolean.`);
  }
  return value;
}

function gestureNumber(
  overrides: UnknownRecord,
  key: "initialZoom" | "maxZoom" | "minZoom" | "panOnScrollSpeed",
): number {
  const value = overrides[key] ?? WORKSPACE_DEFAULT_GESTURE_OPTIONS[key];
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
    Array.isArray(value) &&
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
  const value = overrides.panOnDrag ?? WORKSPACE_DEFAULT_GESTURE_OPTIONS.panOnDrag;
  if (typeof value === "boolean") {
    return value;
  }
  if (
    Array.isArray(value) &&
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
  const value = overrides.panOnScrollMode ?? WORKSPACE_DEFAULT_GESTURE_OPTIONS.panOnScrollMode;
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
  const overrides = gestureOverridesAt(options);
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

function fail(code: WorkspaceDocumentValidationCode, path: string, detail: string): never {
  throw new WorkspaceDocumentValidationError(code, path, detail);
}

function recordAt(value: unknown, path: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("invalid-value", path, "expected an object");
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    fail("invalid-value", path, "expected a plain object");
  }
  return value as UnknownRecord;
}

function exactKeys(record: UnknownRecord, expected: readonly string[], path: string): void {
  const ownKeys = Reflect.ownKeys(record);
  const nonEnumerableOrSymbol = ownKeys.find(
    (key) => typeof key !== "string" || !Object.prototype.propertyIsEnumerable.call(record, key),
  );
  if (nonEnumerableOrSymbol !== undefined) {
    fail("invalid-value", path, "fields must be enumerable strings");
  }
  const expectedKeys = new Set(expected);
  const unexpected = (ownKeys as string[]).find((key) => !expectedKeys.has(key));
  if (unexpected) {
    fail("invalid-value", `${path}.${unexpected}`, "unexpected field");
  }
  const missing = expected.find((key) => !Object.hasOwn(record, key));
  if (missing) {
    fail("invalid-value", `${path}.${missing}`, "missing required field");
  }
}

function stringAt(value: unknown, path: string, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail("invalid-value", path, `${label} must be a non-empty string`);
  }
  return value;
}

function booleanAt(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    fail("invalid-value", path, "expected a boolean");
  }
  return value;
}

function finiteNumberAt(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail("invalid-value", path, "expected a finite number");
  }
  return value;
}

function positiveNumberAt(value: unknown, path: string): number {
  const number = finiteNumberAt(value, path);
  if (number <= 0) {
    fail("invalid-value", path, "expected a positive number");
  }
  return number;
}

function enumAt<T extends string>(
  value: unknown,
  values: readonly T[],
  path: string,
  label: string,
): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    fail("invalid-value", path, `unsupported ${label}`);
  }
  return value as T;
}

function arrayAt(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    fail("invalid-value", path, "expected an array");
  }
  const entries = Object.entries(value);
  const isDense =
    entries.length === value.length &&
    entries.every(([key], index) => key === String(index)) &&
    Reflect.ownKeys(value).length === entries.length + 1;
  if (!isDense) {
    fail("invalid-value", path, "expected a dense array without extra fields");
  }
  return value;
}

function validateViewport(value: unknown): void {
  const viewport = recordAt(value, "$.viewport");
  exactKeys(viewport, viewportKeys, "$.viewport");
  finiteNumberAt(viewport.x, "$.viewport.x");
  finiteNumberAt(viewport.y, "$.viewport.y");
  const zoom = finiteNumberAt(viewport.zoom, "$.viewport.zoom");
  if (zoom < WORKSPACE_MIN_ZOOM || zoom > WORKSPACE_MAX_ZOOM) {
    fail(
      "invalid-value",
      "$.viewport.zoom",
      `expected a zoom from ${WORKSPACE_MIN_ZOOM} through ${WORKSPACE_MAX_ZOOM}`,
    );
  }
}

function validateRootSections(value: unknown): readonly WorkspaceRootSection[] {
  const roots = arrayAt(value, "$.rootSections");
  roots.forEach((candidate, index) => {
    const path = `$.rootSections[${index}]`;
    const root = recordAt(candidate, path);
    exactKeys(root, rootSectionKeys, path);
    stringAt(root.sectionId, `${path}.sectionId`, "section ID");
    const position = recordAt(root.position, `${path}.position`);
    exactKeys(position, positionKeys, `${path}.position`);
    finiteNumberAt(position.x, `${path}.position.x`);
    finiteNumberAt(position.y, `${path}.position.y`);
  });
  return roots as readonly WorkspaceRootSection[];
}

function validateDimension(value: unknown, path: string): SectionDimension {
  const dimension = recordAt(value, path);
  exactKeys(dimension, dimensionKeys, path);
  enumAt(dimension.mode, ["content", "fixed"], `${path}.mode`, "size mode");
  positiveNumberAt(dimension.value, `${path}.value`);
  return dimension as SectionDimension;
}

function validateSize(value: unknown, path: string): WorkspaceSectionSize {
  const size = recordAt(value, path);
  exactKeys(size, sizeKeys, path);
  validateDimension(size.height, `${path}.height`);
  validateDimension(size.width, `${path}.width`);
  return size as WorkspaceSectionSize;
}

export function isValidWorkspaceColor(value: string): boolean {
  if (value !== value.trim() || value.length === 0) {
    return false;
  }
  if (/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/iu.test(value)) {
    return true;
  }
  if (cssNamedColors.has(value.toLowerCase())) {
    return true;
  }
  return colorFunctionPatterns.some((pattern) => pattern.test(value));
}

function validateColor(value: unknown, path: string): void {
  if (value !== null && (typeof value !== "string" || !isValidWorkspaceColor(value))) {
    fail("invalid-color", path, "expected null or a supported CSS color");
  }
}

function validatePresentation(value: unknown, path: string): void {
  const presentation = recordAt(value, path);
  exactKeys(presentation, presentationKeys, path);
  enumAt(
    presentation.chrome,
    ["compact", "default", "none", "transparent"],
    `${path}.chrome`,
    "section chrome",
  );
  validateColor(presentation.accentColor, `${path}.accentColor`);
  validateColor(presentation.tagColor, `${path}.tagColor`);
}

function validateChildLayout(value: unknown, path: string): WorkspaceChildLayout | null {
  if (value === null) {
    return null;
  }
  const layout = recordAt(value, path);
  exactKeys(layout, childLayoutKeys, path);
  enumAt(layout.orientation, ["horizontal", "vertical"], `${path}.orientation`, "orientation");
  enumAt(layout.overflow, ["grow", "scroll"], `${path}.overflow`, "overflow mode");
  const childIds = arrayAt(layout.sectionIds, `${path}.sectionIds`);
  childIds.forEach((sectionId, index) =>
    stringAt(sectionId, `${path}.sectionIds[${index}]`, "section ID"),
  );
  return layout as unknown as WorkspaceChildLayout;
}

type JsonFrame =
  | Readonly<{ object: object; type: "leave" }>
  | Readonly<{ path: string; type: "value"; value: unknown }>;

function validateJsonPrimitive(value: unknown, path: string): boolean {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return true;
  }
  if (typeof value === "number") {
    finiteNumberAt(value, path);
    return true;
  }
  return false;
}

function jsonEntries(value: object, path: string): readonly [string, unknown][] {
  if (Array.isArray(value)) {
    arrayAt(value, path);
    return Object.entries(value);
  }
  recordAt(value, path);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) {
    fail("invalid-value", path, "JSON data cannot contain symbol keys");
  }
  const entries = Object.entries(value);
  if (entries.length !== keys.length) {
    fail("invalid-value", path, "JSON data cannot contain non-enumerable fields");
  }
  return entries;
}

function jsonObjectAt(value: unknown, path: string): object {
  if (typeof value !== "object" || value === null) {
    fail("invalid-value", path, "expected JSON-serializable section data");
  }
  return value;
}

function queueJsonChildren(value: object, path: string, pending: JsonFrame[]): void {
  const entries = jsonEntries(value, path);
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (!entry) {
      continue;
    }
    const childPath = Array.isArray(value)
      ? `${path}[${entry[0]}]`
      : `${path}[${JSON.stringify(entry[0])}]`;
    pending.push({ path: childPath, type: "value", value: entry[1] });
  }
}

function validateJsonValue(value: unknown, path: string): void {
  const active = new WeakSet<object>();
  const pending: JsonFrame[] = [{ path, type: "value", value }];
  while (pending.length > 0) {
    const frame = pending.pop() as JsonFrame;
    if (frame.type === "leave") {
      active.delete(frame.object);
      continue;
    }
    if (validateJsonPrimitive(frame.value, frame.path)) {
      continue;
    }
    const object = jsonObjectAt(frame.value, frame.path);
    if (active.has(object)) {
      fail("invalid-value", frame.path, "section data cannot contain a cycle");
    }
    active.add(object);
    pending.push({ object, type: "leave" });
    queueJsonChildren(object, frame.path, pending);
  }
}

function validateScrollSize(section: WorkspaceSection<unknown>, path: string): void {
  const layout = section.childLayout;
  if (!layout || layout.overflow !== "scroll") {
    return;
  }
  const mainDimension =
    layout.orientation === "vertical" ? section.size.height : section.size.width;
  if (mainDimension.mode !== "fixed") {
    fail(
      "invalid-section",
      `${path}.size`,
      `scroll overflow requires a fixed ${layout.orientation === "vertical" ? "height" : "width"}`,
    );
  }
}

function validateSection(value: unknown, recordId: string): WorkspaceSection<unknown> {
  const path = `$.sections[${JSON.stringify(recordId)}]`;
  const section = recordAt(value, path);
  exactKeys(section, sectionKeys, path);
  const id = stringAt(section.id, `${path}.id`, "section ID");
  if (id !== recordId) {
    fail("invalid-section", `${path}.id`, `expected the record key ${JSON.stringify(recordId)}`);
  }
  stringAt(section.kind, `${path}.kind`, "section kind");
  stringAt(section.title, `${path}.title`, "section title");
  booleanAt(section.positionAndSizeLocked, `${path}.positionAndSizeLocked`);
  booleanAt(section.isMinimized, `${path}.isMinimized`);
  validateSize(section.size, `${path}.size`);
  validatePresentation(section.presentation, `${path}.presentation`);
  validateChildLayout(section.childLayout, `${path}.childLayout`);
  validateJsonValue(section.data, `${path}.data`);
  const validated = section as unknown as WorkspaceSection<unknown>;
  validateScrollSize(validated, path);
  return validated;
}

function validateSections(value: unknown): Readonly<Record<string, WorkspaceSection<unknown>>> {
  const sections = recordAt(value, "$.sections");
  for (const [sectionId, candidate] of Object.entries(sections)) {
    stringAt(sectionId, "$.sections", "section record key");
    validateSection(candidate, sectionId);
  }
  return sections as Readonly<Record<string, WorkspaceSection<unknown>>>;
}

function addPlacement(
  lookup: Map<string, string | null>,
  sections: Readonly<Record<string, WorkspaceSection<unknown>>>,
  sectionId: string,
  parentId: string | null,
  path: string,
): void {
  if (!Object.hasOwn(sections, sectionId)) {
    fail("unknown-section", path, `unknown section ${JSON.stringify(sectionId)}`);
  }
  if (lookup.has(sectionId)) {
    fail("duplicate-placement", path, `section ${JSON.stringify(sectionId)} is already placed`);
  }
  lookup.set(sectionId, parentId);
}

function buildParentLookup(
  roots: readonly WorkspaceRootSection[],
  sections: Readonly<Record<string, WorkspaceSection<unknown>>>,
): Map<string, string | null> {
  const lookup = new Map<string, string | null>();
  roots.forEach((root, index) =>
    addPlacement(lookup, sections, root.sectionId, null, `$.rootSections[${index}].sectionId`),
  );
  for (const [parentId, section] of Object.entries(sections)) {
    section.childLayout?.sectionIds.forEach((childId, index) =>
      addPlacement(
        lookup,
        sections,
        childId,
        parentId,
        `$.sections[${JSON.stringify(parentId)}].childLayout.sectionIds[${index}]`,
      ),
    );
  }
  return lookup;
}

function validateNoCycles(lookup: ReadonlyMap<string, string | null>): void {
  const resolved = new Set<string>();
  for (const sectionId of [...lookup.keys()].sort()) {
    const path = new Map<string, number>();
    const chain: string[] = [];
    let current: string | null = sectionId;
    while (current !== null && !resolved.has(current)) {
      const cycleStart = path.get(current);
      if (cycleStart !== undefined) {
        const cycle = [...chain.slice(cycleStart), current].join(" -> ");
        fail(
          "cycle",
          `$.sections[${JSON.stringify(current)}].childLayout`,
          `cycle detected: ${cycle}`,
        );
      }
      path.set(current, chain.length);
      chain.push(current);
      current = lookup.get(current) ?? null;
    }
    chain.forEach((visitedId) => resolved.add(visitedId));
  }
}

function validateContainment(
  roots: readonly WorkspaceRootSection[],
  sections: Readonly<Record<string, WorkspaceSection<unknown>>>,
): Map<string, string | null> {
  const lookup = buildParentLookup(roots, sections);
  const unreachable = Object.keys(sections).find((sectionId) => !lookup.has(sectionId));
  if (unreachable) {
    fail(
      "unreachable-section",
      `$.sections[${JSON.stringify(unreachable)}]`,
      `section ${JSON.stringify(unreachable)} has no canonical placement`,
    );
  }
  validateNoCycles(lookup);
  return lookup;
}

export function createEmptyWorkspaceDocument(): WorkspaceDocument {
  return {
    rootSections: [],
    schemaVersion: WORKSPACE_DOCUMENT_SCHEMA_VERSION,
    sections: {},
    viewport: { x: 0, y: 0, zoom: WORKSPACE_DEFAULT_ZOOM },
  };
}

export function validateWorkspaceDocument(
  value: unknown,
): asserts value is WorkspaceDocument<unknown> {
  const document = recordAt(value, "$");
  exactKeys(document, documentKeys, "$");
  if (document.schemaVersion !== WORKSPACE_DOCUMENT_SCHEMA_VERSION) {
    fail(
      "unsupported-schema-version",
      "$.schemaVersion",
      `expected schema version ${WORKSPACE_DOCUMENT_SCHEMA_VERSION}`,
    );
  }
  validateViewport(document.viewport);
  const roots = validateRootSections(document.rootSections);
  const sections = validateSections(document.sections);
  validateContainment(roots, sections);
}

export function parseWorkspaceDocument(serialized: string): WorkspaceDocument<unknown> {
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch {
    fail("invalid-json", "$", "document is not valid JSON");
  }
  validateWorkspaceDocument(value);
  return value;
}

export function serializeWorkspaceDocument<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
): string {
  validateWorkspaceDocument(document);
  return JSON.stringify(document);
}

export function deriveWorkspaceParentLookup(
  document: WorkspaceDocument<unknown>,
): WorkspaceParentLookup {
  validateWorkspaceDocument(document);
  return buildParentLookup(document.rootSections, document.sections);
}

function traverseWorkspaceSections(
  document: WorkspaceDocument<unknown>,
  rootSectionIds: readonly string[],
): readonly string[] {
  const ordered: string[] = [];
  const pending = [...rootSectionIds].reverse();
  while (pending.length > 0) {
    const sectionId = pending.pop();
    if (!sectionId) {
      continue;
    }
    ordered.push(sectionId);
    const children = document.sections[sectionId]?.childLayout?.sectionIds ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const childId = children[index];
      if (childId) {
        pending.push(childId);
      }
    }
  }
  return ordered;
}

export function getWorkspaceSectionOrder(document: WorkspaceDocument<unknown>): readonly string[] {
  validateWorkspaceDocument(document);
  return traverseWorkspaceSections(
    document,
    document.rootSections.map(({ sectionId }) => sectionId),
  );
}

export function getWorkspaceNavigationOrder(
  document: WorkspaceDocument<unknown>,
): readonly string[] {
  validateWorkspaceDocument(document);
  const persistentOrder = new Map(
    document.rootSections.map(({ sectionId }, index) => [sectionId, index]),
  );
  const rootSectionIds = [...document.rootSections]
    .sort(
      (left, right) =>
        left.position.y - right.position.y ||
        left.position.x - right.position.x ||
        (persistentOrder.get(left.sectionId) ?? 0) - (persistentOrder.get(right.sectionId) ?? 0) ||
        left.sectionId.localeCompare(right.sectionId),
    )
    .map((root) => root.sectionId);
  return traverseWorkspaceSections(document, rootSectionIds);
}

export function getAdjacentWorkspaceSectionId(
  document: WorkspaceDocument<unknown>,
  sectionId: string,
  direction: "next" | "previous",
): string | null {
  const ordered = getWorkspaceNavigationOrder(document);
  const currentIndex = ordered.indexOf(sectionId);
  if (currentIndex < 0) {
    throw new WorkspaceDocumentValidationError(
      "unknown-section",
      `$.sections[${JSON.stringify(sectionId)}]`,
      `unknown section ${JSON.stringify(sectionId)}`,
    );
  }
  const offset = direction === "next" ? 1 : -1;
  return ordered[currentIndex + offset] ?? null;
}

export function isWorkspaceSectionDescendant(
  parentLookup: WorkspaceParentLookup,
  sectionId: string,
  possibleAncestorId: string,
): boolean {
  let parentId = parentLookup.get(sectionId) ?? null;
  while (parentId !== null) {
    if (parentId === possibleAncestorId) {
      return true;
    }
    parentId = parentLookup.get(parentId) ?? null;
  }
  return false;
}
