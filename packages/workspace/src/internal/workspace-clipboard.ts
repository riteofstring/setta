import { isDenseArray, optionOverridesAt } from "./runtime-option-validation.js";
import {
  WORKSPACE_DOCUMENT_SCHEMA_VERSION,
  type WorkspaceDocument,
  type WorkspaceJsonValue,
  type WorkspacePoint,
  type WorkspaceRootSection,
  type WorkspaceSection,
} from "./workspace-document-contract.js";
import {
  WorkspaceDocumentValidationError,
  validateWorkspaceDocument,
} from "./workspace-document-validation.js";
import { deriveWorkspaceParentLookup, getWorkspaceSectionOrder } from "./workspace-document.js";
import type { WorkspaceActionRejectionReason } from "./workspace-surface-contract.js";

export const WORKSPACE_CLIPBOARD_MIME_TYPE =
  "application/vnd.setta.workspace.sections+json" as const;
export const WORKSPACE_CLIPBOARD_SCHEMA_VERSION = 1 as const;

export type WorkspaceClipboardItem = Readonly<{
  mimeType: string;
  serialized: string;
}>;

export type WorkspaceClipboardCloneRequest = Readonly<{
  rootSectionIds: readonly string[];
  sections: readonly WorkspaceSection<unknown>[];
}>;

export type WorkspaceClipboardSectionClone<TSectionData = WorkspaceJsonValue> = Readonly<{
  data: TSectionData;
  id: string;
  sourceSectionId: string;
}>;

export type WorkspaceClipboardCloneRejectionCode = "invalid" | "unauthorized" | "unsupported";

export type WorkspaceClipboardCloneDecision<TSectionData = WorkspaceJsonValue> =
  | Readonly<{
      allowed: false;
      code: WorkspaceClipboardCloneRejectionCode;
      reason: string;
    }>
  | Readonly<{
      allowed: true;
      sections: readonly WorkspaceClipboardSectionClone<TSectionData>[];
    }>;

export type WorkspaceClipboardAdapter<TSectionData = WorkspaceJsonValue> = Readonly<{
  cloneSections(
    request: WorkspaceClipboardCloneRequest,
  ):
    | Promise<WorkspaceClipboardCloneDecision<TSectionData>>
    | WorkspaceClipboardCloneDecision<TSectionData>;
  read(): Promise<WorkspaceClipboardItem | null>;
  write(item: WorkspaceClipboardItem): Promise<void>;
}>;

export type WorkspaceTextClipboard = Readonly<{
  readText(): Promise<string>;
  writeText(value: string): Promise<void>;
}>;

export type WorkspaceJsonClipboardDataValidationRequest = Readonly<{
  data: unknown;
  kind: string;
  sourceSectionId: string;
}>;

export type WorkspaceJsonClipboardAdapterOptions = Readonly<{
  allocateSectionId(request: Readonly<{ kind: string; sourceSectionId: string }>): string;
  clipboard: WorkspaceTextClipboard;
  validateSectionData(request: WorkspaceJsonClipboardDataValidationRequest): boolean;
}>;

type WorkspaceClipboardRect = WorkspacePoint &
  Readonly<{
    height: number;
    width: number;
  }>;

type WorkspaceClipboardFrameRoot = Readonly<{
  position: WorkspacePoint;
  sectionId: string;
  size: Readonly<{ height: number; width: number }>;
}>;

type WorkspaceClipboardFrame = Readonly<{
  mimeType: typeof WORKSPACE_CLIPBOARD_MIME_TYPE;
  rootSections: readonly WorkspaceClipboardFrameRoot[];
  schemaVersion: typeof WORKSPACE_CLIPBOARD_SCHEMA_VERSION;
  sections: Readonly<Record<string, WorkspaceSection<unknown>>>;
}>;

export type WorkspaceClipboardCopyPreparation =
  | Readonly<{
      item: WorkspaceClipboardItem;
      rootCount: number;
      sectionCount: number;
      status: "ready";
    }>
  | Readonly<{
      reason: Extract<
        WorkspaceActionRejectionReason,
        "clipboard-selection-empty" | "section-geometry-unavailable"
      >;
      status: "rejected";
    }>;

export type WorkspaceClipboardReadResult =
  | Readonly<{ frame: WorkspaceClipboardFrame; status: "ready" }>
  | Readonly<{
      detail?: string;
      reason: Extract<
        WorkspaceActionRejectionReason,
        | "clipboard-empty"
        | "clipboard-format-unsupported"
        | "clipboard-invalid"
        | "clipboard-version-unsupported"
      >;
      status: "rejected";
    }>;

export type WorkspaceClipboardMaterialized<TSectionData> = Readonly<{
  roots: readonly WorkspaceClipboardFrameRoot[];
  sectionCount: number;
  sections: Readonly<Record<string, WorkspaceSection<TSectionData>>>;
}>;

export type WorkspaceClipboardCloneResult<TSectionData> =
  | Readonly<{ paste: WorkspaceClipboardMaterialized<TSectionData>; status: "ready" }>
  | Readonly<{
      detail?: string;
      reason: Extract<
        WorkspaceActionRejectionReason,
        | "clipboard-clone-invalid"
        | "clipboard-clone-partial"
        | "clipboard-data-invalid"
        | "clipboard-data-unsupported"
        | "clipboard-unauthorized"
        | "section-id-exists"
      >;
      status: "rejected";
    }>;

export type WorkspaceClipboardPlacementInput = Readonly<{
  grid: readonly [number, number] | null;
  preferredPosition: WorkspacePoint;
  rootRects: readonly WorkspaceClipboardRect[];
}>;

export type WorkspaceClipboardPlacedSections<TSectionData> = Readonly<{
  rootSections: readonly WorkspaceRootSection[];
  sections: Readonly<Record<string, WorkspaceSection<TSectionData>>>;
}>;

const jsonAdapterOptionKeys = ["allocateSectionId", "clipboard", "validateSectionData"] as const;
const clipboardItemKeys = ["mimeType", "serialized"] as const;
const frameKeys = ["mimeType", "rootSections", "schemaVersion", "sections"] as const;
const frameRootKeys = ["position", "sectionId", "size"] as const;
const pointKeys = ["x", "y"] as const;
const sizeKeys = ["height", "width"] as const;
const cloneDecisionKeys = ["allowed", "code", "reason", "sections"] as const;
const cloneKeys = ["data", "id", "sourceSectionId"] as const;
const PLACEMENT_PADDING = 24;

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
  return value;
}

function positiveNumber(value: unknown, label: string): number {
  const number = finiteNumber(value, label);
  if (number <= 0) {
    throw new TypeError(`${label} must be positive.`);
  }
  return number;
}

function pointAt(value: unknown, label: string): WorkspacePoint {
  const point = optionOverridesAt(value, pointKeys, label, "workspace clipboard point field");
  return {
    x: finiteNumber(point.x, `${label} x`),
    y: finiteNumber(point.y, `${label} y`),
  };
}

function sizeAt(value: unknown, label: string): Readonly<{ height: number; width: number }> {
  const size = optionOverridesAt(value, sizeKeys, label, "workspace clipboard size field");
  return {
    height: positiveNumber(size.height, `${label} height`),
    width: positiveNumber(size.width, `${label} width`),
  };
}

function rectAt(value: unknown, label: string): WorkspaceClipboardRect {
  const rect = optionOverridesAt(
    value,
    ["height", "width", "x", "y"],
    label,
    "workspace clipboard rectangle field",
  );
  return {
    height: positiveNumber(rect.height, `${label} height`),
    width: positiveNumber(rect.width, `${label} width`),
    x: finiteNumber(rect.x, `${label} x`),
    y: finiteNumber(rect.y, `${label} y`),
  };
}

function clipboardItemAt(value: unknown): WorkspaceClipboardItem {
  const item = optionOverridesAt(
    value,
    clipboardItemKeys,
    "Workspace clipboard item",
    "workspace clipboard item field",
  );
  return {
    mimeType: nonEmptyString(item.mimeType, "Workspace clipboard item MIME type"),
    serialized: nonEmptyString(item.serialized, "Workspace clipboard item contents"),
  };
}

function selectedRootIds(
  document: WorkspaceDocument<unknown>,
  selectedSectionIds: readonly string[],
): readonly string[] {
  if (!isDenseArray(selectedSectionIds)) {
    throw new TypeError(
      "Workspace clipboard selection must be a dense array without extra fields.",
    );
  }
  const order = getWorkspaceSectionOrder(document);
  const known = new Set(order);
  const unknown = selectedSectionIds.find(
    (sectionId) => typeof sectionId !== "string" || !known.has(sectionId),
  );
  if (unknown !== undefined) {
    throw new WorkspaceDocumentValidationError(
      "unknown-section",
      `$.sections[${JSON.stringify(unknown)}]`,
      `unknown section ${JSON.stringify(unknown)}`,
    );
  }
  const selected = new Set(selectedSectionIds);
  const parents = deriveWorkspaceParentLookup(document);
  return order.filter((sectionId) => {
    if (!selected.has(sectionId)) return false;
    let parentId = parents.get(sectionId) ?? null;
    while (parentId !== null) {
      if (selected.has(parentId)) return false;
      parentId = parents.get(parentId) ?? null;
    }
    return true;
  });
}

function subtreeIds(
  document: WorkspaceDocument<unknown>,
  rootSectionIds: readonly string[],
): ReadonlySet<string> {
  const included = new Set<string>();
  const pending = [...rootSectionIds];
  while (pending.length > 0) {
    const sectionId = pending.pop();
    if (!sectionId || included.has(sectionId)) continue;
    included.add(sectionId);
    pending.push(...(document.sections[sectionId]?.childLayout?.sectionIds ?? []));
  }
  return included;
}

function copiedSections(
  document: WorkspaceDocument<unknown>,
  rootSectionIds: readonly string[],
): Readonly<Record<string, WorkspaceSection<unknown>>> {
  const included = subtreeIds(document, rootSectionIds);
  return Object.fromEntries(
    getWorkspaceSectionOrder(document).flatMap((sectionId) => {
      const section = document.sections[sectionId];
      return included.has(sectionId) && section ? [[sectionId, section] as const] : [];
    }),
  );
}

function measuredRoots(
  rootSectionIds: readonly string[],
  getSectionRect: (sectionId: string) => WorkspaceClipboardRect | undefined,
): readonly WorkspaceClipboardRect[] | null {
  const roots = rootSectionIds.map((sectionId) => getSectionRect(sectionId));
  return roots.some((rect) => rect === undefined)
    ? null
    : (roots as readonly WorkspaceClipboardRect[]);
}

function clipboardFrameRoots(
  sectionIds: readonly string[],
  rects: readonly WorkspaceClipboardRect[],
): readonly WorkspaceClipboardFrameRoot[] {
  const minimumX = Math.min(...rects.map(({ x }) => x));
  const minimumY = Math.min(...rects.map(({ y }) => y));
  return sectionIds.map((sectionId, index) => {
    const rect = rectAt(rects[index], `Workspace clipboard root ${JSON.stringify(sectionId)}`);
    return {
      position: { x: rect.x - minimumX, y: rect.y - minimumY },
      sectionId,
      size: { height: rect.height, width: rect.width },
    };
  });
}

export function prepareWorkspaceClipboardCopy(
  document: WorkspaceDocument<unknown>,
  selectedSectionIds: readonly string[],
  getSectionRect: (sectionId: string) => WorkspaceClipboardRect | undefined,
): WorkspaceClipboardCopyPreparation {
  validateWorkspaceDocument(document);
  const rootSectionIds = selectedRootIds(document, selectedSectionIds);
  if (rootSectionIds.length === 0) {
    return { reason: "clipboard-selection-empty", status: "rejected" };
  }
  const rects = measuredRoots(rootSectionIds, getSectionRect);
  if (!rects) {
    return { reason: "section-geometry-unavailable", status: "rejected" };
  }
  const sections = copiedSections(document, rootSectionIds);
  const frame: WorkspaceClipboardFrame = {
    mimeType: WORKSPACE_CLIPBOARD_MIME_TYPE,
    rootSections: clipboardFrameRoots(rootSectionIds, rects),
    schemaVersion: WORKSPACE_CLIPBOARD_SCHEMA_VERSION,
    sections,
  };
  return {
    item: { mimeType: WORKSPACE_CLIPBOARD_MIME_TYPE, serialized: JSON.stringify(frame) },
    rootCount: rootSectionIds.length,
    sectionCount: Object.keys(sections).length,
    status: "ready",
  };
}

function parsedJson(serialized: string): unknown {
  try {
    return JSON.parse(serialized) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function frameRootAt(value: unknown, index: number): WorkspaceClipboardFrameRoot {
  const label = `Workspace clipboard root at index ${String(index)}`;
  const root = optionOverridesAt(value, frameRootKeys, label, "workspace clipboard root field");
  return {
    position: pointAt(root.position, `${label} position`),
    sectionId: nonEmptyString(root.sectionId, `${label} section ID`),
    size: sizeAt(root.size, `${label} size`),
  };
}

function parsedFrame(value: unknown): WorkspaceClipboardFrame | null {
  if (value === null) return null;
  const frame = optionOverridesAt(
    value,
    frameKeys,
    "Workspace clipboard frame",
    "workspace clipboard frame field",
  );
  if (!isDenseArray(frame.rootSections) || frame.rootSections.length === 0) return null;
  const rootSections = frame.rootSections.map(frameRootAt);
  const temporaryDocument = {
    rootSections: rootSections.map(({ position, sectionId }) => ({ position, sectionId })),
    schemaVersion: WORKSPACE_DOCUMENT_SCHEMA_VERSION,
    sections: frame.sections,
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  try {
    validateWorkspaceDocument(temporaryDocument);
  } catch (error) {
    if (error instanceof WorkspaceDocumentValidationError) return null;
    throw error;
  }
  const minimumX = Math.min(...rootSections.map(({ position }) => position.x));
  const minimumY = Math.min(...rootSections.map(({ position }) => position.y));
  if (minimumX !== 0 || minimumY !== 0) return null;
  return {
    mimeType: WORKSPACE_CLIPBOARD_MIME_TYPE,
    rootSections,
    schemaVersion: WORKSPACE_CLIPBOARD_SCHEMA_VERSION,
    sections: temporaryDocument.sections,
  };
}

function invalidClipboardResult(detail?: string): WorkspaceClipboardReadResult {
  return {
    ...(detail === undefined ? {} : { detail }),
    reason: "clipboard-invalid",
    status: "rejected",
  };
}

function clipboardFrameRecord(serialized: string): Record<string, unknown> | null {
  const parsed = parsedJson(serialized);
  if (parsed === null) return null;
  if (typeof parsed !== "object") return null;
  if (Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

function validatedClipboardFrame(value: unknown): WorkspaceClipboardReadResult {
  try {
    const frame = parsedFrame(value);
    return frame ? { frame, status: "ready" } : invalidClipboardResult();
  } catch (error) {
    if (error instanceof TypeError) return invalidClipboardResult(error.message);
    throw error;
  }
}

function readValidatedClipboardItem(item: WorkspaceClipboardItem): WorkspaceClipboardReadResult {
  if (item.mimeType !== WORKSPACE_CLIPBOARD_MIME_TYPE) {
    return { reason: "clipboard-format-unsupported", status: "rejected" };
  }
  const record = clipboardFrameRecord(item.serialized);
  if (!record) return invalidClipboardResult();
  if (record.mimeType !== WORKSPACE_CLIPBOARD_MIME_TYPE) {
    return { reason: "clipboard-format-unsupported", status: "rejected" };
  }
  if (record.schemaVersion !== WORKSPACE_CLIPBOARD_SCHEMA_VERSION) {
    return { reason: "clipboard-version-unsupported", status: "rejected" };
  }
  return validatedClipboardFrame(record);
}

export function readWorkspaceClipboardItem(value: unknown): WorkspaceClipboardReadResult {
  if (value === null) return { reason: "clipboard-empty", status: "rejected" };
  let item: WorkspaceClipboardItem;
  try {
    item = clipboardItemAt(value);
  } catch (error) {
    if (error instanceof TypeError) {
      return invalidClipboardResult(error.message);
    }
    throw error;
  }
  return readValidatedClipboardItem(item);
}

function cloneRejectionReason(
  code: WorkspaceClipboardCloneRejectionCode,
): Extract<
  WorkspaceActionRejectionReason,
  "clipboard-data-invalid" | "clipboard-data-unsupported" | "clipboard-unauthorized"
> {
  if (code === "unauthorized") return "clipboard-unauthorized";
  return code === "unsupported" ? "clipboard-data-unsupported" : "clipboard-data-invalid";
}

function cloneDecisionAt<TSectionData>(
  value: unknown,
): WorkspaceClipboardCloneDecision<TSectionData> {
  const decision = optionOverridesAt(
    value,
    cloneDecisionKeys,
    "Workspace clipboard clone decision",
    "workspace clipboard clone decision field",
  );
  if (decision.allowed === false) {
    if (
      decision.code !== "invalid" &&
      decision.code !== "unauthorized" &&
      decision.code !== "unsupported"
    ) {
      throw new TypeError("Workspace clipboard clone rejection code is invalid.");
    }
    return {
      allowed: false,
      code: decision.code,
      reason: nonEmptyString(decision.reason, "Workspace clipboard clone rejection reason"),
    };
  }
  if (decision.allowed !== true || !isDenseArray(decision.sections)) {
    throw new TypeError(
      "Workspace clipboard clone acceptance must provide a dense sections array.",
    );
  }
  return {
    allowed: true,
    sections: decision.sections.map((candidate, index) => {
      const label = `Workspace clipboard clone at index ${String(index)}`;
      const clone = optionOverridesAt(
        candidate,
        cloneKeys,
        label,
        "workspace clipboard clone field",
      );
      if (!Object.hasOwn(clone, "data")) {
        throw new TypeError(`${label} must provide data.`);
      }
      return {
        data: clone.data as TSectionData,
        id: nonEmptyString(clone.id, `${label} ID`),
        sourceSectionId: nonEmptyString(clone.sourceSectionId, `${label} source section ID`),
      };
    }),
  };
}

function cloneIndex<TSectionData>(
  sourceIds: readonly string[],
  clones: readonly WorkspaceClipboardSectionClone<TSectionData>[],
): ReadonlyMap<string, WorkspaceClipboardSectionClone<TSectionData>> | null {
  if (clones.length !== sourceIds.length) return null;
  const sourceIdSet = new Set(sourceIds);
  const index = new Map<string, WorkspaceClipboardSectionClone<TSectionData>>();
  for (const clone of clones) {
    if (!sourceIdSet.has(clone.sourceSectionId) || index.has(clone.sourceSectionId)) return null;
    index.set(clone.sourceSectionId, clone);
  }
  return index.size === sourceIds.length ? index : null;
}

function remappedSections<TSectionData>(
  frame: WorkspaceClipboardFrame,
  clones: ReadonlyMap<string, WorkspaceClipboardSectionClone<TSectionData>>,
): Readonly<Record<string, WorkspaceSection<TSectionData>>> {
  return Object.fromEntries(
    Object.values(frame.sections).map((source) => {
      const clone = clones.get(source.id) as WorkspaceClipboardSectionClone<TSectionData>;
      const childLayout = source.childLayout
        ? {
            ...source.childLayout,
            sectionIds: source.childLayout.sectionIds.map(
              (sourceId) =>
                (clones.get(sourceId) as WorkspaceClipboardSectionClone<TSectionData>).id,
            ),
          }
        : null;
      return [clone.id, { ...source, childLayout, data: clone.data, id: clone.id }] as const;
    }),
  );
}

function remappedRoots<TSectionData>(
  frame: WorkspaceClipboardFrame,
  clones: ReadonlyMap<string, WorkspaceClipboardSectionClone<TSectionData>>,
): readonly WorkspaceClipboardFrameRoot[] {
  return frame.rootSections.map((root) => ({
    ...root,
    sectionId: (clones.get(root.sectionId) as WorkspaceClipboardSectionClone<TSectionData>).id,
  }));
}

export function materializeWorkspaceClipboardClone<TSectionData>(
  frame: WorkspaceClipboardFrame,
  decisionValue: unknown,
  existingSectionIds: ReadonlySet<string>,
): WorkspaceClipboardCloneResult<TSectionData> {
  let decision: WorkspaceClipboardCloneDecision<TSectionData>;
  try {
    decision = cloneDecisionAt<TSectionData>(decisionValue);
  } catch (error) {
    if (error instanceof TypeError) {
      return { detail: error.message, reason: "clipboard-clone-invalid", status: "rejected" };
    }
    throw error;
  }
  if (!decision.allowed) {
    return {
      detail: decision.reason,
      reason: cloneRejectionReason(decision.code),
      status: "rejected",
    };
  }
  const sourceIds = Object.keys(frame.sections);
  const clones = cloneIndex(sourceIds, decision.sections);
  if (!clones) return { reason: "clipboard-clone-partial", status: "rejected" };
  const newIds = decision.sections.map(({ id }) => id);
  if (new Set(newIds).size !== newIds.length) {
    return { reason: "clipboard-clone-invalid", status: "rejected" };
  }
  if (newIds.some((id) => existingSectionIds.has(id))) {
    return { reason: "section-id-exists", status: "rejected" };
  }
  const sections = remappedSections(frame, clones);
  const roots = remappedRoots(frame, clones);
  try {
    validateWorkspaceDocument({
      rootSections: roots.map(({ position, sectionId }) => ({ position, sectionId })),
      schemaVersion: WORKSPACE_DOCUMENT_SCHEMA_VERSION,
      sections,
      viewport: { x: 0, y: 0, zoom: 1 },
    });
  } catch (error) {
    if (error instanceof WorkspaceDocumentValidationError) {
      return { detail: error.message, reason: "clipboard-clone-invalid", status: "rejected" };
    }
    throw error;
  }
  return { paste: { roots, sectionCount: sourceIds.length, sections }, status: "ready" };
}

export function workspaceClipboardCloneRequest(
  frame: WorkspaceClipboardFrame,
): WorkspaceClipboardCloneRequest {
  return {
    rootSectionIds: frame.rootSections.map(({ sectionId }) => sectionId),
    sections: structuredClone(Object.values(frame.sections)),
  };
}

export function workspaceClipboardFrameDocument(
  frame: WorkspaceClipboardFrame,
): WorkspaceDocument<unknown> {
  return {
    rootSections: frame.rootSections.map(({ position, sectionId }) => ({ position, sectionId })),
    schemaVersion: WORKSPACE_DOCUMENT_SCHEMA_VERSION,
    sections: frame.sections,
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function snapped(value: number, spacing: number | undefined): number {
  if (spacing === undefined) return value;
  const result = spacing * Math.round(value / spacing);
  return Object.is(result, -0) ? 0 : result;
}

function originAt(
  position: WorkspacePoint,
  grid: readonly [number, number] | null,
): WorkspacePoint {
  return { x: snapped(position.x, grid?.[0]), y: snapped(position.y, grid?.[1]) };
}

function blockBounds(roots: readonly WorkspaceClipboardFrameRoot[]): WorkspaceClipboardRect {
  const width = Math.max(...roots.map((root) => root.position.x + root.size.width));
  const height = Math.max(...roots.map((root) => root.position.y + root.size.height));
  return { height, width, x: 0, y: 0 };
}

function rectanglesOverlap(
  position: WorkspacePoint,
  block: WorkspaceClipboardRect,
  existing: WorkspaceClipboardRect,
): boolean {
  return (
    position.x < existing.x + existing.width + PLACEMENT_PADDING &&
    position.x + block.width + PLACEMENT_PADDING > existing.x &&
    position.y < existing.y + existing.height + PLACEMENT_PADDING &&
    position.y + block.height + PLACEMENT_PADDING > existing.y
  );
}

function uniqueOrigins(
  positions: readonly WorkspacePoint[],
  grid: readonly [number, number] | null,
): readonly WorkspacePoint[] {
  const seen = new Set<string>();
  return positions.flatMap((position) => {
    const origin = originAt(position, grid);
    const key = `${String(origin.x)}:${String(origin.y)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [origin];
  });
}

function placementCandidates(
  preferred: WorkspacePoint,
  rootRects: readonly WorkspaceClipboardRect[],
  block: WorkspaceClipboardRect,
  grid: readonly [number, number] | null,
): readonly WorkspacePoint[] {
  const edgeCandidates = rootRects.flatMap((rect) => [
    { x: rect.x + rect.width + PLACEMENT_PADDING, y: preferred.y },
    { x: preferred.x, y: rect.y + rect.height + PLACEMENT_PADDING },
  ]);
  const farRight = Math.max(preferred.x, ...rootRects.map((rect) => rect.x + rect.width));
  return uniqueOrigins(
    [
      preferred,
      { x: preferred.x + PLACEMENT_PADDING, y: preferred.y + PLACEMENT_PADDING },
      ...edgeCandidates,
      { x: farRight + PLACEMENT_PADDING, y: preferred.y },
      { x: farRight + block.width + PLACEMENT_PADDING, y: preferred.y },
    ],
    grid,
  );
}

export function placeWorkspaceClipboardSections<TSectionData>(
  paste: WorkspaceClipboardMaterialized<TSectionData>,
  input: WorkspaceClipboardPlacementInput,
): WorkspaceClipboardPlacedSections<TSectionData> {
  const preferred = pointAt(input.preferredPosition, "Workspace clipboard preferred position");
  const rootRects = input.rootRects.map((rect, index) =>
    rectAt(rect, `Workspace clipboard existing root at index ${String(index)}`),
  );
  const block = blockBounds(paste.roots);
  const candidates = placementCandidates(preferred, rootRects, block, input.grid);
  const origin =
    candidates.find(
      (candidate) => !rootRects.some((rect) => rectanglesOverlap(candidate, block, rect)),
    ) ?? candidates.at(-1);
  if (!origin) throw new Error("Workspace clipboard placement did not produce a candidate.");
  return {
    rootSections: paste.roots.map((root) => ({
      position: { x: origin.x + root.position.x, y: origin.y + root.position.y },
      sectionId: root.sectionId,
    })),
    sections: paste.sections,
  };
}

function adapterFailureReason(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;
}

function jsonCloneDecision<TSectionData extends WorkspaceJsonValue>(
  request: WorkspaceClipboardCloneRequest,
  options: WorkspaceJsonClipboardAdapterOptions,
): WorkspaceClipboardCloneDecision<TSectionData> {
  try {
    const dataBySourceId = new Map<string, TSectionData>();
    for (const section of request.sections) {
      const validationRequest = {
        data: section.data,
        kind: section.kind,
        sourceSectionId: section.id,
      };
      if (!options.validateSectionData(validationRequest)) {
        return {
          allowed: false,
          code: "invalid",
          reason: `Section ${JSON.stringify(section.id)} has data this host cannot clone.`,
        };
      }
      dataBySourceId.set(section.id, structuredClone(section.data) as TSectionData);
    }
    return {
      allowed: true,
      sections: request.sections.map((section) => ({
        data: dataBySourceId.get(section.id) as TSectionData,
        id: nonEmptyString(
          options.allocateSectionId({ kind: section.kind, sourceSectionId: section.id }),
          `Cloned workspace section ID for ${JSON.stringify(section.id)}`,
        ),
        sourceSectionId: section.id,
      })),
    };
  } catch (error) {
    return {
      allowed: false,
      code: "invalid",
      reason: adapterFailureReason(error, "The host could not clone the clipboard section data."),
    };
  }
}

export function createWorkspaceJsonClipboardAdapter<TSectionData extends WorkspaceJsonValue>(
  value: WorkspaceJsonClipboardAdapterOptions,
): WorkspaceClipboardAdapter<TSectionData> {
  const options = optionOverridesAt(
    value,
    jsonAdapterOptionKeys,
    "Workspace JSON clipboard adapter options",
    "workspace JSON clipboard adapter option",
  ) as WorkspaceJsonClipboardAdapterOptions;
  if (typeof options.allocateSectionId !== "function") {
    throw new TypeError("Workspace JSON clipboard adapter allocateSectionId must be a function.");
  }
  if (typeof options.validateSectionData !== "function") {
    throw new TypeError("Workspace JSON clipboard adapter validateSectionData must be a function.");
  }
  if (
    typeof options.clipboard !== "object" ||
    options.clipboard === null ||
    typeof options.clipboard.readText !== "function" ||
    typeof options.clipboard.writeText !== "function"
  ) {
    throw new TypeError(
      "Workspace JSON clipboard adapter requires readText and writeText methods.",
    );
  }
  return Object.freeze({
    cloneSections: (request: WorkspaceClipboardCloneRequest) =>
      jsonCloneDecision<TSectionData>(request, options),
    read: async () => {
      const serialized = await options.clipboard.readText();
      return serialized.trim().length === 0
        ? null
        : { mimeType: WORKSPACE_CLIPBOARD_MIME_TYPE, serialized };
    },
    write: async (item: WorkspaceClipboardItem) => {
      const resolved = clipboardItemAt(item);
      if (resolved.mimeType !== WORKSPACE_CLIPBOARD_MIME_TYPE) {
        throw new TypeError("Workspace JSON clipboard adapter received an unsupported MIME type.");
      }
      await options.clipboard.writeText(resolved.serialized);
    },
  });
}

export function resolveWorkspaceClipboardShortcut(
  event: Readonly<{
    altKey: boolean;
    ctrlKey: boolean;
    key: string;
    metaKey: boolean;
    shiftKey: boolean;
  }>,
): "copySelection" | "paste" | null {
  if (event.altKey || event.shiftKey || (!event.ctrlKey && !event.metaKey)) return null;
  const key = event.key.toLowerCase();
  if (key === "c") return "copySelection";
  return key === "v" ? "paste" : null;
}
