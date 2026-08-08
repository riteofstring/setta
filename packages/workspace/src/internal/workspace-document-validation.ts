import { isDenseArray } from "./runtime-option-validation.js";
import {
  WORKSPACE_DOCUMENT_SCHEMA_VERSION,
  type SectionDimension,
  type WorkspaceChildLayout,
  type WorkspaceDocument,
  type WorkspaceRootSection,
  type WorkspaceSection,
  type WorkspaceSectionSize,
} from "./workspace-document-contract.js";
import { WORKSPACE_MAX_ZOOM, WORKSPACE_MIN_ZOOM } from "./workspace-policy.js";

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

function enumerableStringKeys(record: UnknownRecord, path: string): readonly string[] {
  const ownKeys = Reflect.ownKeys(record);
  const invalidKey = ownKeys.find(
    (key) => typeof key !== "string" || !Object.prototype.propertyIsEnumerable.call(record, key),
  );
  if (invalidKey !== undefined) {
    fail("invalid-value", path, "fields must be enumerable strings");
  }
  return ownKeys as string[];
}

function exactKeys(record: UnknownRecord, expected: readonly string[], path: string): void {
  const ownKeys = enumerableStringKeys(record, path);
  const expectedKeys = new Set(expected);
  const unexpected = ownKeys.find((key) => !expectedKeys.has(key));
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
  if (!isDenseArray(value)) {
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
  if (typeof value !== "string") return false;
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
  enumerableStringKeys(sections, "$.sections");
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

export function buildWorkspaceParentLookup(
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
  const lookup = buildWorkspaceParentLookup(roots, sections);
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
