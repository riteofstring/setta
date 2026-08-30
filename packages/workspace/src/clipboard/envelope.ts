import {
  WORKSPACE_CLIPBOARD_MAX_TEXT_BYTES,
  WORKSPACE_CLIPBOARD_MAX_SECTION_COUNT,
  WORKSPACE_CLIPBOARD_SCHEMA_ID,
  WORKSPACE_CLIPBOARD_SCHEMA_VERSION,
} from "./types";
import {
  assertWorkspaceClipboardJsonValue,
  cloneFrozenWorkspaceClipboardJsonValue,
  getWorkspaceClipboardUtf8ByteLength,
} from "./json";
import type {
  JsonValue,
  WorkspaceClipboardAuthorityMetadata,
  WorkspaceClipboardEnvelope,
  WorkspaceClipboardEnvelopeErrorCode,
  WorkspaceClipboardEnvelopeParseOptions,
  WorkspaceClipboardEnvelopeParseResult,
  WorkspaceClipboardFragment,
  WorkspaceClipboardSection,
  WorkspaceClipboardTopLevelLayout,
} from "./types";

type UnknownRecord = Record<string, unknown>;

type WorkspaceClipboardEnvelopeSerializeResult =
  | Readonly<{ ok: true; text: string }>
  | Readonly<{ code: "clipboard-too-large"; ok: false }>;

class WorkspaceClipboardEnvelopeValidationError extends Error {
  readonly code: WorkspaceClipboardEnvelopeErrorCode;

  constructor(code: WorkspaceClipboardEnvelopeErrorCode) {
    super(code);
    this.code = code;
  }
}

function fail(code: WorkspaceClipboardEnvelopeErrorCode): never {
  throw new WorkspaceClipboardEnvelopeValidationError(code);
}

function assertRecord(value: unknown): asserts value is UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid-envelope");
  }
}

function assertKnownFields(
  value: UnknownRecord,
  fields: ReadonlyArray<string>,
): void {
  const known = new Set(fields);
  for (const field of Object.keys(value)) {
    if (!known.has(field)) {
      fail("invalid-envelope");
    }
  }
}

function assertSafeRecordKey(value: string): void {
  if (
    value === "__proto__" ||
    value === "constructor" ||
    value === "prototype"
  ) {
    fail("invalid-envelope");
  }
}

function readStableIdentifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value !== value.trim()
  ) {
    fail("invalid-envelope");
  }
  assertSafeRecordKey(value);
  return value;
}

function readString(value: unknown): string {
  if (typeof value !== "string") {
    fail("invalid-envelope");
  }
  return value;
}

function readBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") {
    fail("invalid-envelope");
  }
  return value;
}

function readFiniteNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail("invalid-envelope");
  }
  return value;
}

function readPositiveInteger(value: unknown): number {
  const number = readFiniteNumber(value);
  if (!Number.isInteger(number) || number <= 0) {
    fail("invalid-envelope");
  }
  return number;
}

function readNullableString(value: unknown): string | null {
  if (value === null) {
    return null;
  }
  return readString(value);
}

function readIdentifierArray(value: unknown): Array<string> {
  if (!Array.isArray(value)) {
    fail("invalid-envelope");
  }
  const ids: Array<string> = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const id = readStableIdentifier(entry);
    if (seen.has(id)) {
      fail("invalid-envelope");
    }
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function readSectionSize(value: unknown): WorkspaceClipboardSection["size"] {
  assertRecord(value);
  assertKnownFields(value, ["height", "width"]);
  const readDimension = (dimension: unknown): number | "auto" => {
    if (dimension === "auto") {
      return dimension;
    }
    const number = readFiniteNumber(dimension);
    if (number < 0) {
      fail("invalid-envelope");
    }
    return number;
  };
  return {
    height: readDimension(value["height"]),
    width: readDimension(value["width"]),
  };
}

function readSection(
  value: unknown,
  recordId: string,
): WorkspaceClipboardSection {
  assertRecord(value);
  assertKnownFields(value, [
    "children",
    "id",
    "isHorizontalOrientation",
    "isMinimized",
    "kind",
    "name",
    "overflowMode",
    "positionAndSizeLocked",
    "size",
    "styleColor",
    "tagColor",
  ]);
  const id = readStableIdentifier(value["id"]);
  if (id !== recordId) {
    fail("invalid-envelope");
  }
  return {
    children: readIdentifierArray(value["children"]),
    id,
    isHorizontalOrientation: readBoolean(value["isHorizontalOrientation"]),
    isMinimized: readBoolean(value["isMinimized"]),
    kind: readStableIdentifier(value["kind"]),
    name: readString(value["name"]),
    overflowMode: readBoolean(value["overflowMode"]),
    positionAndSizeLocked: readBoolean(value["positionAndSizeLocked"]),
    size: readSectionSize(value["size"]),
    styleColor: readNullableString(value["styleColor"]),
    tagColor: readNullableString(value["tagColor"]),
  };
}

function readTopLevelLayout(value: unknown): WorkspaceClipboardTopLevelLayout {
  assertRecord(value);
  assertKnownFields(value, ["h", "w", "x", "y", "zIndex"]);
  const readNullableDimension = (dimension: unknown): number | null => {
    if (dimension === null) {
      return null;
    }
    const number = readFiniteNumber(dimension);
    if (number < 0) {
      fail("invalid-envelope");
    }
    return number;
  };
  const zIndex = readFiniteNumber(value["zIndex"]);
  if (!Number.isInteger(zIndex) || zIndex < 0) {
    fail("invalid-envelope");
  }
  return {
    h: readNullableDimension(value["h"]),
    w: readNullableDimension(value["w"]),
    x: readFiniteNumber(value["x"]),
    y: readFiniteNumber(value["y"]),
    zIndex,
  };
}

function createFragmentParentMap(
  fragment: WorkspaceClipboardFragment,
): Map<string, string> {
  const parentById = new Map<string, string>();
  for (const section of Object.values(fragment.sections)) {
    for (const childId of section.children) {
      if (!fragment.sections[childId]) {
        fail("invalid-envelope");
      }
      if (fragment.roots.includes(childId) || parentById.has(childId)) {
        fail("invalid-envelope");
      }
      parentById.set(childId, section.id);
    }
  }
  return parentById;
}

function assertFragmentRootsAreParentless(
  roots: ReadonlyArray<string>,
  parentById: ReadonlyMap<string, string>,
): void {
  for (const rootId of roots) {
    if (parentById.has(rootId)) {
      fail("invalid-envelope");
    }
  }
}

function visitFragmentSection(
  fragment: WorkspaceClipboardFragment,
  sectionId: string,
  visiting: Set<string>,
  reachable: Set<string>,
): void {
  if (visiting.has(sectionId)) {
    fail("invalid-envelope");
  }
  if (reachable.has(sectionId)) {
    return;
  }
  const section = fragment.sections[sectionId];
  if (!section) {
    fail("invalid-envelope");
  }
  visiting.add(sectionId);
  for (const childId of section.children) {
    visitFragmentSection(fragment, childId, visiting, reachable);
  }
  visiting.delete(sectionId);
  reachable.add(sectionId);
}

function collectReachableFragmentSections(
  fragment: WorkspaceClipboardFragment,
): Set<string> {
  const reachable = new Set<string>();
  const visiting = new Set<string>();
  for (const rootId of fragment.roots) {
    visitFragmentSection(fragment, rootId, visiting, reachable);
  }
  return reachable;
}

function assertValidFragmentTree(fragment: WorkspaceClipboardFragment): void {
  const parentById = createFragmentParentMap(fragment);
  assertFragmentRootsAreParentless(fragment.roots, parentById);
  const reachable = collectReachableFragmentSections(fragment);
  if (reachable.size !== Object.keys(fragment.sections).length) {
    fail("invalid-envelope");
  }
}

function readFragmentRoots(value: unknown): Array<string> {
  const roots = readIdentifierArray(value);
  if (
    roots.length === 0 ||
    roots.length > WORKSPACE_CLIPBOARD_MAX_SECTION_COUNT
  ) {
    fail("invalid-envelope");
  }
  return roots;
}

function readFragmentSections(
  value: unknown,
): Record<string, WorkspaceClipboardSection> {
  assertRecord(value);
  const entries = Object.entries(value);
  if (
    entries.length === 0 ||
    entries.length > WORKSPACE_CLIPBOARD_MAX_SECTION_COUNT
  ) {
    fail("invalid-envelope");
  }
  const sections: Record<string, WorkspaceClipboardSection> = Object.create(
    null,
  ) as Record<string, WorkspaceClipboardSection>;
  for (const [recordId, section] of entries) {
    readStableIdentifier(recordId);
    sections[recordId] = readSection(section, recordId);
  }
  return sections;
}

function readFragmentTopLevelLayouts(
  value: unknown,
  roots: ReadonlyArray<string>,
): Record<string, WorkspaceClipboardTopLevelLayout> {
  assertRecord(value);
  const layoutEntries = Object.entries(value);
  if (layoutEntries.length !== roots.length) {
    fail("invalid-envelope");
  }
  const topLevelLayouts: Record<string, WorkspaceClipboardTopLevelLayout> =
    Object.create(null) as Record<string, WorkspaceClipboardTopLevelLayout>;
  for (const [sectionId, layout] of layoutEntries) {
    readStableIdentifier(sectionId);
    if (!roots.includes(sectionId)) {
      fail("invalid-envelope");
    }
    topLevelLayouts[sectionId] = readTopLevelLayout(layout);
  }
  return topLevelLayouts;
}

function assertFragmentRootsHaveLayouts(
  roots: ReadonlyArray<string>,
  sections: Readonly<Record<string, WorkspaceClipboardSection>>,
  topLevelLayouts: Readonly<Record<string, WorkspaceClipboardTopLevelLayout>>,
): void {
  for (const rootId of roots) {
    if (!sections[rootId] || !topLevelLayouts[rootId]) {
      fail("invalid-envelope");
    }
  }
}

function assertNormalizedFragmentRootLayouts(
  roots: ReadonlyArray<string>,
  topLevelLayouts: Readonly<Record<string, WorkspaceClipboardTopLevelLayout>>,
): void {
  const firstRootId = roots[0];
  const firstLayout =
    firstRootId === undefined ? undefined : topLevelLayouts[firstRootId];
  if (!firstLayout) {
    fail("invalid-envelope");
  }
  let minimumX = firstLayout.x;
  let minimumY = firstLayout.y;
  for (const rootId of roots.slice(1)) {
    const layout = topLevelLayouts[rootId];
    if (!layout) {
      fail("invalid-envelope");
    }
    minimumX = Math.min(minimumX, layout.x);
    minimumY = Math.min(minimumY, layout.y);
  }
  if (minimumX !== 0 || minimumY !== 0) {
    fail("invalid-envelope");
  }
}

function readFragment(value: unknown): WorkspaceClipboardFragment {
  assertRecord(value);
  assertKnownFields(value, ["roots", "sections", "topLevelLayouts"]);
  const roots = readFragmentRoots(value["roots"]);
  const sections = readFragmentSections(value["sections"]);
  const topLevelLayouts = readFragmentTopLevelLayouts(
    value["topLevelLayouts"],
    roots,
  );
  assertFragmentRootsHaveLayouts(roots, sections, topLevelLayouts);
  assertNormalizedFragmentRootLayouts(roots, topLevelLayouts);
  const fragment: WorkspaceClipboardFragment = {
    roots,
    sections,
    topLevelLayouts,
  };
  assertValidFragmentTree(fragment);
  return fragment;
}

function readAuthorityMetadata(
  value: unknown,
): WorkspaceClipboardAuthorityMetadata {
  assertRecord(value);
  assertKnownFields(value, ["id", "payloadVersion"]);
  return {
    id: readStableIdentifier(value["id"]),
    payloadVersion: readPositiveInteger(value["payloadVersion"]),
  };
}

function assertEnvelopeJsonValue(value: unknown): asserts value is JsonValue {
  try {
    assertWorkspaceClipboardJsonValue(value);
  } catch {
    fail("invalid-envelope");
  }
}

function readEnvelope(value: unknown): WorkspaceClipboardEnvelope {
  assertEnvelopeJsonValue(value);
  assertRecord(value);
  assertKnownFields(value, [
    "authority",
    "fragment",
    "payload",
    "schema",
    "version",
  ]);
  if (value["schema"] !== WORKSPACE_CLIPBOARD_SCHEMA_ID) {
    fail("unsupported-schema");
  }
  if (value["version"] !== WORKSPACE_CLIPBOARD_SCHEMA_VERSION) {
    fail("unsupported-version");
  }
  const payload = value["payload"];
  assertWorkspaceClipboardJsonValue(payload);
  return {
    authority: readAuthorityMetadata(value["authority"]),
    fragment: readFragment(value["fragment"]),
    payload,
    schema: WORKSPACE_CLIPBOARD_SCHEMA_ID,
    version: WORKSPACE_CLIPBOARD_SCHEMA_VERSION,
  };
}

function assertParserOptionsObject(
  options: WorkspaceClipboardEnvelopeParseOptions,
): void {
  if (!options || typeof options !== "object") {
    throw new Error("Clipboard envelope parser options are required.");
  }
}

function assertSectionKindPredicate(
  options: WorkspaceClipboardEnvelopeParseOptions,
): void {
  if (typeof options.isSectionKindSupported !== "function") {
    throw new Error(
      "Clipboard envelope parser requires a section-kind predicate.",
    );
  }
}

function assertAuthorityParserOption(
  authority: WorkspaceClipboardAuthorityMetadata,
): void {
  if (
    typeof authority?.id !== "string" ||
    authority.id.trim() === "" ||
    authority.id !== authority.id.trim() ||
    !Number.isInteger(authority.payloadVersion) ||
    authority.payloadVersion <= 0
  ) {
    throw new Error(
      "Clipboard envelope parser requires valid authority metadata.",
    );
  }
}

function assertMaximumTextBytes(maxTextBytes: number | undefined): void {
  if (
    maxTextBytes !== undefined &&
    (!Number.isInteger(maxTextBytes) || maxTextBytes <= 0)
  ) {
    throw new Error(
      "Clipboard envelope parser maxTextBytes must be a positive integer.",
    );
  }
}

function assertParseOptions(
  options: WorkspaceClipboardEnvelopeParseOptions,
): void {
  assertParserOptionsObject(options);
  assertSectionKindPredicate(options);
  assertAuthorityParserOption(options.authority);
  assertMaximumTextBytes(options.maxTextBytes);
}

function parseClipboardEnvelopeJson(
  text: string,
): Readonly<{ ok: true; value: unknown }> | Readonly<{ ok: false }> {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { ok: false };
    }
    throw error;
  }
}

function assertEnvelopeAuthorityMatchesOptions(
  envelope: WorkspaceClipboardEnvelope,
  authority: WorkspaceClipboardAuthorityMetadata,
): void {
  if (envelope.authority.id !== authority.id) {
    fail("authority-mismatch");
  }
  if (envelope.authority.payloadVersion !== authority.payloadVersion) {
    fail("authority-version-mismatch");
  }
}

function assertEnvelopeSectionKindsSupported(
  envelope: WorkspaceClipboardEnvelope,
  isSectionKindSupported: (kind: string) => boolean,
): void {
  for (const section of Object.values(envelope.fragment.sections)) {
    if (!isSectionKindSupported(section.kind)) {
      fail("unknown-section-kind");
    }
  }
}

function validateParsedClipboardEnvelope(
  value: unknown,
  options: WorkspaceClipboardEnvelopeParseOptions,
): WorkspaceClipboardEnvelopeParseResult {
  try {
    const envelope = readEnvelope(value);
    assertEnvelopeAuthorityMatchesOptions(envelope, options.authority);
    assertEnvelopeSectionKindsSupported(
      envelope,
      options.isSectionKindSupported,
    );
    return {
      envelope: cloneFrozenWorkspaceClipboardJsonValue(
        envelope as unknown as JsonValue,
      ) as unknown as WorkspaceClipboardEnvelope,
      ok: true,
    };
  } catch (error) {
    if (error instanceof WorkspaceClipboardEnvelopeValidationError) {
      return { code: error.code, ok: false };
    }
    throw error;
  }
}

export function parseWorkspaceClipboardEnvelope(
  text: string,
  options: WorkspaceClipboardEnvelopeParseOptions,
): WorkspaceClipboardEnvelopeParseResult {
  assertParseOptions(options);
  if (typeof text !== "string") {
    throw new Error("Clipboard envelope text must be a string.");
  }
  const maximumTextBytes =
    options.maxTextBytes ?? WORKSPACE_CLIPBOARD_MAX_TEXT_BYTES;
  if (getWorkspaceClipboardUtf8ByteLength(text) > maximumTextBytes) {
    return { code: "clipboard-too-large", ok: false };
  }
  const parsed = parseClipboardEnvelopeJson(text);
  if (!parsed.ok) {
    return { code: "invalid-json", ok: false };
  }
  return validateParsedClipboardEnvelope(parsed.value, options);
}

export function serializeWorkspaceClipboardEnvelope(
  envelope: WorkspaceClipboardEnvelope,
): WorkspaceClipboardEnvelopeSerializeResult {
  const normalized = readEnvelope(envelope);
  const text = JSON.stringify(normalized);
  return getWorkspaceClipboardUtf8ByteLength(text) >
    WORKSPACE_CLIPBOARD_MAX_TEXT_BYTES
    ? { code: "clipboard-too-large", ok: false }
    : { ok: true, text };
}
