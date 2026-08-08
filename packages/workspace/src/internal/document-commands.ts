import {
  deriveWorkspaceParentLookup,
  isValidWorkspaceColor,
  validateWorkspaceDocument,
  type SectionOverflow,
  type WorkspaceActionRejectionReason,
  type WorkspaceCapabilities,
  type WorkspaceDocument,
  type WorkspaceDocumentChangeReason,
  type WorkspacePoint,
  type WorkspaceSection,
  type WorkspaceSectionPresentation,
  type WorkspaceSectionSize,
  type WorkspaceViewport,
} from "../core.js";
import {
  denseArrayAt,
  isEnumerableDataProperty,
  optionOverridesAt,
} from "./runtime-option-validation.js";
import {
  planWorkspaceRootStacking,
  workspaceRootStackingMatches,
  type WorkspaceRootStackingAction,
} from "./workspace-root-stacking.js";
import { resolveWorkspaceSiblingSelection } from "./workspace-section-grouping.js";
import type { WorkspaceSectionResizeAxis } from "./workspace-section-sizing.js";
import { normalizeWorkspaceSelectionRoots } from "./workspace-selection.js";

export type WorkspaceDocumentCommand<TSectionData = unknown> =
  | Readonly<{
      position: WorkspacePoint;
      section: WorkspaceSection<TSectionData>;
      type: "create-root-section";
    }>
  | Readonly<{ sectionIds: readonly string[]; type: "delete-sections" }>
  | Readonly<{
      group: WorkspaceSection<TSectionData>;
      position: WorkspacePoint | null;
      sectionIds: readonly string[];
      type: "group-sections";
    }>
  | Readonly<{
      positions: Readonly<Record<string, WorkspacePoint>>;
      type: "move-root-sections";
    }>
  | Readonly<{
      axes: readonly WorkspaceSectionResizeAxis[];
      position: WorkspacePoint;
      sectionId: string;
      size: Readonly<{ height: number; width: number }>;
      type: "resize-root-section";
    }>
  | Readonly<{
      action: WorkspaceRootStackingAction;
      sectionIds: readonly string[];
      type: "stack-root-sections";
    }>
  | Readonly<{
      axes: readonly WorkspaceSectionResizeAxis[];
      sectionId: string;
      type: "set-section-content-size";
    }>
  | Readonly<{
      growWithContentSizing: boolean;
      measuredSize: Readonly<{ height: number; width: number }> | null;
      overflow: SectionOverflow;
      sectionId: string;
      type: "set-section-child-overflow";
    }>
  | Readonly<{ isMinimized: boolean; sectionId: string; type: "set-section-minimized" }>
  | Readonly<{
      presentation: WorkspaceSectionPresentation;
      sectionId: string;
      type: "set-section-presentation";
    }>
  | Readonly<{ sectionId: string; title: string; type: "set-section-title" }>
  | Readonly<{ locked: boolean; sectionIds: readonly string[]; type: "set-sections-locked" }>
  | Readonly<{
      rootPositions: Readonly<Record<string, WorkspacePoint>> | null;
      sectionId: string;
      type: "ungroup-section";
    }>
  | Readonly<{ type: "set-viewport"; viewport: WorkspaceViewport }>;

export type WorkspaceDocumentCommandResult<TSectionData> =
  | Readonly<{
      document: WorkspaceDocument<TSectionData>;
      reason: WorkspaceDocumentChangeReason;
      status: "applied";
    }>
  | Readonly<{ document: WorkspaceDocument<TSectionData>; status: "unchanged" }>
  | Readonly<{
      document: WorkspaceDocument<TSectionData>;
      reason: WorkspaceActionRejectionReason;
      status: "rejected";
    }>;

type WorkspaceCommandErrorCode = "unknown-section";

class WorkspaceCommandError extends Error {
  readonly code: WorkspaceCommandErrorCode;

  constructor(code: WorkspaceCommandErrorCode, detail: string) {
    super(detail);
    this.name = "WorkspaceCommandError";
    this.code = code;
  }
}

type WorkspaceEditCapability = keyof WorkspaceCapabilities;

const presentationCommandTypes = new Set<WorkspaceDocumentCommand<unknown>["type"]>([
  "set-section-minimized",
  "set-section-presentation",
  "set-section-title",
]);
const layoutCommandTypes = new Set<WorkspaceDocumentCommand<unknown>["type"]>([
  "move-root-sections",
  "resize-root-section",
  "set-section-child-overflow",
  "set-section-content-size",
  "set-sections-locked",
  "stack-root-sections",
]);

function commandCapability(
  command: WorkspaceDocumentCommand<unknown>,
): WorkspaceEditCapability | null {
  if (command.type === "create-root-section" || command.type === "delete-sections") {
    return "editStructure";
  }
  if (layoutCommandTypes.has(command.type)) {
    return "editLayout";
  }
  return presentationCommandTypes.has(command.type) ? "editPresentation" : null;
}

function capabilityRejection(capability: WorkspaceEditCapability): WorkspaceActionRejectionReason {
  if (capability === "editStructure") {
    return "structure-edit-disabled";
  }
  return capability === "editLayout" ? "layout-edit-disabled" : "presentation-edit-disabled";
}

function rejectionFor(
  command: WorkspaceDocumentCommand<unknown>,
  capabilities: WorkspaceCapabilities,
): WorkspaceActionRejectionReason | null {
  if (command.type === "group-sections" || command.type === "ungroup-section") {
    if (!capabilities.editStructure) {
      return "structure-edit-disabled";
    }
    if (!capabilities.editLayout) {
      return "layout-edit-disabled";
    }
    return null;
  }
  const capability = commandCapability(command);
  return capability && !capabilities[capability] ? capabilityRejection(capability) : null;
}

function assertKnownSections<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  sectionIds: readonly string[],
): void {
  const unknownId = sectionIds.find((sectionId) => !Object.hasOwn(document.sections, sectionId));
  if (unknownId) {
    throw new WorkspaceCommandError("unknown-section", `Unknown workspace section ${unknownId}.`);
  }
}

function applied<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  reason: WorkspaceDocumentChangeReason,
): WorkspaceDocumentCommandResult<TSectionData> {
  validateWorkspaceDocument(document);
  return { document, reason, status: "applied" };
}

export function normalizeWorkspaceSectionTitle(value: unknown): string {
  if (typeof value !== "string") {
    throw new TypeError("Workspace section title must be a string.");
  }
  const title = value.trim();
  if (title.length === 0) {
    throw new TypeError("Workspace section title must not be empty.");
  }
  return title;
}

export function resolveWorkspaceSectionPresentation(value: unknown): WorkspaceSectionPresentation {
  const record = optionOverridesAt(
    value,
    ["accentColor", "chrome", "tagColor"],
    "Workspace section presentation",
    "workspace section presentation field",
  );
  const missingKey = (["accentColor", "chrome", "tagColor"] as const).find(
    (key) => !Object.hasOwn(record, key),
  );
  if (missingKey) {
    throw new TypeError(`Workspace section presentation must provide ${missingKey}.`);
  }
  return {
    accentColor: sectionPresentationColor(record.accentColor, "accent color"),
    chrome: sectionChrome(record.chrome),
    tagColor: sectionPresentationColor(record.tagColor, "tag color"),
  };
}

function sectionChrome(value: unknown): WorkspaceSectionPresentation["chrome"] {
  if (value !== "compact" && value !== "default" && value !== "none" && value !== "transparent") {
    throw new TypeError(
      "Workspace section presentation chrome must be compact, default, none, or transparent.",
    );
  }
  return value;
}

function sectionPresentationColor(value: unknown, label: string): string | null {
  if (value !== null && (typeof value !== "string" || !isValidWorkspaceColor(value))) {
    throw new TypeError(`Workspace section presentation ${label} must be null or a valid color.`);
  }
  return value;
}

function finiteCoordinate(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
  return value;
}

function rootPositionAt(value: unknown, sectionId: string): WorkspacePoint {
  const label = `Workspace root position for ${JSON.stringify(sectionId)}`;
  const position = optionOverridesAt(value, ["x", "y"], label, "workspace root position field");
  if (!Object.hasOwn(position, "x") || !Object.hasOwn(position, "y")) {
    throw new TypeError(`${label} must provide x and y.`);
  }
  return {
    x: finiteCoordinate(position.x, `${label} x`),
    y: finiteCoordinate(position.y, `${label} y`),
  };
}

function rootMovementEntriesAt(
  value: unknown,
): readonly (readonly [sectionId: string, position: WorkspacePoint])[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Workspace root positions must be a plain object.");
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Workspace root positions must be a plain object.");
  }
  const positions = value as Record<string, unknown>;
  return Reflect.ownKeys(positions).map((key) => {
    if (typeof key !== "string" || !isEnumerableDataProperty(positions, key)) {
      throw new TypeError(`Invalid workspace root position field ${String(key)}.`);
    }
    if (key.trim().length === 0) {
      throw new TypeError("Workspace root position section IDs must be non-empty strings.");
    }
    return [key, rootPositionAt(positions[key], key)] as const;
  });
}

function applyRootMovement<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  positionsValue: Readonly<Record<string, WorkspacePoint>>,
): WorkspaceDocumentCommandResult<TSectionData> {
  const entries = rootMovementEntriesAt(positionsValue);
  const sectionIds = entries.map(([sectionId]) => sectionId);
  assertKnownSections(document, sectionIds);
  if (entries.length === 0) {
    return { document, status: "unchanged" };
  }
  const roots = new Set(document.rootSections.map(({ sectionId }) => sectionId));
  if (sectionIds.some((sectionId) => !roots.has(sectionId))) {
    return { document, reason: "section-not-root", status: "rejected" };
  }
  if (sectionIds.some((sectionId) => document.sections[sectionId]?.positionAndSizeLocked)) {
    return { document, reason: "section-locked", status: "rejected" };
  }
  const positions = new Map(entries);
  let changed = false;
  const rootSections = document.rootSections.map((root) => {
    const position = positions.get(root.sectionId);
    if (!position || (position.x === root.position.x && position.y === root.position.y)) {
      return root;
    }
    changed = true;
    return { ...root, position };
  });
  return changed
    ? applied({ ...document, rootSections }, "section-move")
    : { document, status: "unchanged" };
}

function resizeAxesAt(
  value: readonly WorkspaceSectionResizeAxis[],
): readonly WorkspaceSectionResizeAxis[] {
  const candidate = denseArrayAt(value, "Workspace resize axes");
  if (candidate.length === 0 || candidate.length > 2) {
    throw new TypeError("Workspace resize axes must contain width, height, or both.");
  }
  const axes = candidate.map((axis) => {
    if (axis !== "height" && axis !== "width") {
      throw new TypeError("Workspace resize axes must contain only width or height.");
    }
    return axis;
  });
  if (new Set(axes).size !== axes.length) {
    throw new TypeError("Workspace resize axes must not contain duplicates.");
  }
  return axes;
}

function positiveSize(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive finite number.`);
  }
  return value;
}

function resizedSectionSize<TSectionData>(
  section: WorkspaceSection<TSectionData>,
  axesValue: readonly WorkspaceSectionResizeAxis[],
  sizeValue: Readonly<{ height: number; width: number }>,
): WorkspaceSectionSize {
  const axes = new Set(resizeAxesAt(axesValue));
  const height = positiveSize(sizeValue.height, "Workspace resized height");
  const width = positiveSize(sizeValue.width, "Workspace resized width");
  return {
    height: axes.has("height") ? { mode: "fixed", value: height } : section.size.height,
    width: axes.has("width") ? { mode: "fixed", value: width } : section.size.width,
  };
}

function sectionSizesMatch(left: WorkspaceSectionSize, right: WorkspaceSectionSize): boolean {
  return (
    left.height.mode === right.height.mode &&
    left.height.value === right.height.value &&
    left.width.mode === right.width.mode &&
    left.width.value === right.width.value
  );
}

function applyRootResize<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  command: Extract<WorkspaceDocumentCommand<TSectionData>, { type: "resize-root-section" }>,
): WorkspaceDocumentCommandResult<TSectionData> {
  assertKnownSections(document, [command.sectionId]);
  const rootIndex = document.rootSections.findIndex(
    ({ sectionId }) => sectionId === command.sectionId,
  );
  if (rootIndex < 0) {
    return { document, reason: "section-not-root", status: "rejected" };
  }
  const section = document.sections[command.sectionId] as WorkspaceSection<TSectionData>;
  if (section.positionAndSizeLocked) {
    return { document, reason: "section-locked", status: "rejected" };
  }
  if (section.isMinimized) {
    return { document, reason: "section-minimized", status: "rejected" };
  }
  const position = rootPositionAt(command.position, command.sectionId);
  const size = resizedSectionSize(section, command.axes, command.size);
  const currentRoot = document.rootSections[rootIndex] as (typeof document.rootSections)[number];
  const positionChanged =
    currentRoot.position.x !== position.x || currentRoot.position.y !== position.y;
  if (!positionChanged && sectionSizesMatch(section.size, size)) {
    return { document, status: "unchanged" };
  }
  const rootSections = document.rootSections.map((root, index) =>
    index === rootIndex ? { ...root, position } : root,
  );
  return applied(
    {
      ...document,
      rootSections,
      sections: { ...document.sections, [command.sectionId]: { ...section, size } },
    },
    "section-resize",
  );
}

function applyRootStacking<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  sectionIds: readonly string[],
  action: WorkspaceRootStackingAction,
): WorkspaceDocumentCommandResult<TSectionData> {
  assertKnownSections(document, sectionIds);
  const rootSections = planWorkspaceRootStacking(document, sectionIds, action);
  return workspaceRootStackingMatches(document.rootSections, rootSections)
    ? { document, status: "unchanged" }
    : applied({ ...document, rootSections }, "section-stack");
}

function applySectionContentSize<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  sectionId: string,
  axesValue: readonly WorkspaceSectionResizeAxis[],
): WorkspaceDocumentCommandResult<TSectionData> {
  assertKnownSections(document, [sectionId]);
  const section = document.sections[sectionId] as WorkspaceSection<TSectionData>;
  if (section.positionAndSizeLocked) {
    return { document, reason: "section-locked", status: "rejected" };
  }
  if (section.isMinimized) {
    return { document, reason: "section-minimized", status: "rejected" };
  }
  const axes = new Set(resizeAxesAt(axesValue));
  const size: WorkspaceSectionSize = {
    height: axes.has("height") ? { ...section.size.height, mode: "content" } : section.size.height,
    width: axes.has("width") ? { ...section.size.width, mode: "content" } : section.size.width,
  };
  if (sectionSizesMatch(section.size, size)) {
    return { document, status: "unchanged" };
  }
  return applied(
    {
      ...document,
      sections: { ...document.sections, [sectionId]: { ...section, size } },
    },
    "section-size-mode",
  );
}

function sectionOverflowAt(value: unknown): SectionOverflow {
  if (value !== "grow" && value !== "scroll") {
    throw new TypeError("Workspace section overflow must be grow or scroll.");
  }
  return value;
}

type SectionOverflowCommand<TSectionData> = Extract<
  WorkspaceDocumentCommand<TSectionData>,
  { type: "set-section-child-overflow" }
>;

function sectionOverflowRejection<TSectionData>(
  section: WorkspaceSection<TSectionData>,
  command: SectionOverflowCommand<TSectionData>,
  overflow: SectionOverflow,
): WorkspaceActionRejectionReason | null {
  if (section.positionAndSizeLocked) {
    return "section-locked";
  }
  if (section.isMinimized) {
    return "section-minimized";
  }
  const axis = section.childLayout?.orientation === "vertical" ? "height" : "width";
  return overflow === "scroll" && section.size[axis].mode === "content" && !command.measuredSize
    ? "section-geometry-unavailable"
    : null;
}

function sectionOverflowDimension<TSectionData>(
  section: WorkspaceSection<TSectionData>,
  command: SectionOverflowCommand<TSectionData>,
  axis: WorkspaceSectionResizeAxis,
  overflow: SectionOverflow,
): WorkspaceSectionSize["height"] {
  const currentDimension = section.size[axis];
  if (overflow === "grow") {
    return command.growWithContentSizing
      ? { ...currentDimension, mode: "content" }
      : currentDimension;
  }
  return {
    mode: "fixed",
    value: command.measuredSize
      ? positiveSize(command.measuredSize[axis], `Workspace measured ${axis}`)
      : currentDimension.value,
  };
}

function applySectionChildOverflow<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  command: SectionOverflowCommand<TSectionData>,
): WorkspaceDocumentCommandResult<TSectionData> {
  assertKnownSections(document, [command.sectionId]);
  const section = document.sections[command.sectionId] as WorkspaceSection<TSectionData>;
  const childLayout = section.childLayout;
  if (!childLayout) {
    return { document, reason: "section-not-container", status: "rejected" };
  }
  const overflow = sectionOverflowAt(command.overflow);
  if (overflow === childLayout.overflow) {
    return { document, status: "unchanged" };
  }
  const rejection = sectionOverflowRejection(section, command, overflow);
  if (rejection) {
    return { document, reason: rejection, status: "rejected" };
  }
  const axis = childLayout.orientation === "vertical" ? "height" : "width";
  const nextDimension = sectionOverflowDimension(section, command, axis, overflow);
  return applied(
    {
      ...document,
      sections: {
        ...document.sections,
        [command.sectionId]: {
          ...section,
          childLayout: { ...childLayout, overflow },
          size: { ...section.size, [axis]: nextDimension },
        },
      },
    },
    "section-overflow",
  );
}

function applyRootCreation<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  section: WorkspaceSection<TSectionData>,
  positionValue: WorkspacePoint,
): WorkspaceDocumentCommandResult<TSectionData> {
  if (Object.hasOwn(document.sections, section.id)) {
    return { document, reason: "section-id-exists", status: "rejected" };
  }
  const position = rootPositionAt(positionValue, section.id);
  return applied(
    {
      ...document,
      rootSections: [...document.rootSections, { position, sectionId: section.id }],
      sections: { ...document.sections, [section.id]: section },
    },
    "section-create",
  );
}

function replaceSelectedIds(
  siblingIds: readonly string[],
  selectedIds: ReadonlySet<string>,
  replacementId: string,
): readonly string[] {
  const firstSelectedIndex = siblingIds.findIndex((sectionId) => selectedIds.has(sectionId));
  return siblingIds.flatMap((sectionId, index) => {
    if (!selectedIds.has(sectionId)) {
      return [sectionId];
    }
    return index === firstSelectedIndex ? [replacementId] : [];
  });
}

function groupedSections<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  group: WorkspaceSection<TSectionData>,
  childSectionIds: readonly string[],
): Readonly<Record<string, WorkspaceSection<TSectionData>>> {
  if (!group.childLayout) {
    throw new TypeError("Workspace group section must provide a child layout.");
  }
  if (group.childLayout.sectionIds.length > 0) {
    throw new TypeError("Workspace group section child layout must start empty.");
  }
  return {
    ...document.sections,
    [group.id]: {
      ...group,
      childLayout: { ...group.childLayout, sectionIds: childSectionIds },
    },
  };
}

function applySectionGrouping<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  command: Extract<WorkspaceDocumentCommand<TSectionData>, { type: "group-sections" }>,
): WorkspaceDocumentCommandResult<TSectionData> {
  assertKnownSections(document, command.sectionIds);
  const resolved = resolveWorkspaceSiblingSelection(document, command.sectionIds);
  if (resolved.status === "rejected") {
    return { document, reason: resolved.reason, status: "rejected" };
  }
  const { parentSectionId, sectionIds } = resolved.selection;
  if (Object.hasOwn(document.sections, command.group.id)) {
    return { document, reason: "section-id-exists", status: "rejected" };
  }
  const selected = new Set(sectionIds);
  const sections = groupedSections(document, command.group, sectionIds);
  if (parentSectionId === null) {
    if (command.position === null) {
      throw new TypeError("Top-level workspace grouping requires a position.");
    }
    const position = rootPositionAt(command.position, command.group.id);
    const firstSelectedIndex = document.rootSections.findIndex(({ sectionId }) =>
      selected.has(sectionId),
    );
    const rootSections = document.rootSections.flatMap((root, index) => {
      if (!selected.has(root.sectionId)) {
        return [root];
      }
      return index === firstSelectedIndex ? [{ position, sectionId: command.group.id }] : [];
    });
    return applied({ ...document, rootSections, sections }, "section-group");
  }
  if (command.position !== null) {
    throw new TypeError("Nested workspace grouping must not provide a root position.");
  }
  const parent = document.sections[parentSectionId] as WorkspaceSection<TSectionData>;
  const childLayout = parent.childLayout;
  if (!childLayout) {
    throw new Error(`Workspace parent section ${parentSectionId} is missing its child layout.`);
  }
  return applied(
    {
      ...document,
      sections: {
        ...sections,
        [parentSectionId]: {
          ...parent,
          childLayout: {
            ...childLayout,
            sectionIds: replaceSelectedIds(childLayout.sectionIds, selected, command.group.id),
          },
        },
      },
    },
    "section-group",
  );
}

function promotedSections<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  removedSectionId: string,
): Readonly<Record<string, WorkspaceSection<TSectionData>>> {
  return Object.fromEntries(
    Object.entries(document.sections).filter(([sectionId]) => sectionId !== removedSectionId),
  );
}

function ungroupRootPositions(
  childSectionIds: readonly string[],
  positionsValue: Readonly<Record<string, WorkspacePoint>> | null,
): ReadonlyMap<string, WorkspacePoint> {
  if (positionsValue === null) {
    throw new TypeError("Top-level workspace ungrouping requires child positions.");
  }
  const entries = rootMovementEntriesAt(positionsValue);
  const childIds = new Set(childSectionIds);
  if (
    entries.length !== childSectionIds.length ||
    entries.some(([sectionId]) => !childIds.has(sectionId))
  ) {
    throw new TypeError("Workspace ungroup positions must match the direct child sections.");
  }
  return new Map(entries);
}

function applySectionUngrouping<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  command: Extract<WorkspaceDocumentCommand<TSectionData>, { type: "ungroup-section" }>,
): WorkspaceDocumentCommandResult<TSectionData> {
  assertKnownSections(document, [command.sectionId]);
  const group = document.sections[command.sectionId] as WorkspaceSection<TSectionData>;
  const childSectionIds = group.childLayout?.sectionIds;
  if (!childSectionIds || childSectionIds.length === 0) {
    return { document, reason: "section-not-container", status: "rejected" };
  }
  const parentSectionId = deriveWorkspaceParentLookup(document).get(command.sectionId) ?? null;
  const sections = promotedSections(document, command.sectionId);
  if (parentSectionId === null) {
    const positions = ungroupRootPositions(childSectionIds, command.rootPositions);
    const rootSections = document.rootSections.flatMap((root) =>
      root.sectionId === command.sectionId
        ? childSectionIds.map((sectionId) => ({
            position: positions.get(sectionId) as WorkspacePoint,
            sectionId,
          }))
        : [root],
    );
    return applied({ ...document, rootSections, sections }, "section-ungroup");
  }
  if (command.rootPositions !== null) {
    throw new TypeError("Nested workspace ungrouping must not provide root positions.");
  }
  const parent = sections[parentSectionId] as WorkspaceSection<TSectionData>;
  const childLayout = parent.childLayout;
  if (!childLayout) {
    throw new Error(`Workspace parent section ${parentSectionId} is missing its child layout.`);
  }
  return applied(
    {
      ...document,
      sections: {
        ...sections,
        [parentSectionId]: {
          ...parent,
          childLayout: {
            ...childLayout,
            sectionIds: childLayout.sectionIds.flatMap((sectionId) =>
              sectionId === command.sectionId ? childSectionIds : [sectionId],
            ),
          },
        },
      },
    },
    "section-ungroup",
  );
}

function applyViewport<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  viewport: WorkspaceViewport,
): WorkspaceDocumentCommandResult<TSectionData> {
  const candidate = { ...document, viewport: { ...viewport } };
  validateWorkspaceDocument(candidate);
  const current = document.viewport;
  if (
    current.x === candidate.viewport.x &&
    current.y === candidate.viewport.y &&
    current.zoom === candidate.viewport.zoom
  ) {
    return { document, status: "unchanged" };
  }
  return { document: candidate, reason: "viewport", status: "applied" };
}

function applySectionLocks<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  sectionIds: readonly string[],
  locked: boolean,
): WorkspaceDocumentCommandResult<TSectionData> {
  assertKnownSections(document, sectionIds);
  const changedIds = new Set(
    sectionIds.filter(
      (sectionId) => document.sections[sectionId]?.positionAndSizeLocked !== locked,
    ),
  );
  if (changedIds.size === 0) {
    return { document, status: "unchanged" };
  }
  const sections = Object.fromEntries(
    Object.entries(document.sections).map(([sectionId, section]) => [
      sectionId,
      changedIds.has(sectionId) ? { ...section, positionAndSizeLocked: locked } : section,
    ]),
  ) as Readonly<Record<string, WorkspaceSection<TSectionData>>>;
  return applied({ ...document, sections }, "section-lock");
}

function applySectionMinimized<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  sectionId: string,
  isMinimized: boolean,
): WorkspaceDocumentCommandResult<TSectionData> {
  assertKnownSections(document, [sectionId]);
  const section = document.sections[sectionId] as WorkspaceSection<TSectionData>;
  if (section.isMinimized === isMinimized) {
    return { document, status: "unchanged" };
  }
  return applied(
    {
      ...document,
      sections: {
        ...document.sections,
        [sectionId]: { ...section, isMinimized },
      },
    },
    "section-minimize",
  );
}

function applySectionTitle<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  sectionId: string,
  title: string,
): WorkspaceDocumentCommandResult<TSectionData> {
  assertKnownSections(document, [sectionId]);
  const section = document.sections[sectionId] as WorkspaceSection<TSectionData>;
  if (section.title === title) {
    return { document, status: "unchanged" };
  }
  return applied(
    {
      ...document,
      sections: { ...document.sections, [sectionId]: { ...section, title } },
    },
    "section-title",
  );
}

function presentationsMatch(
  left: WorkspaceSectionPresentation,
  right: WorkspaceSectionPresentation,
): boolean {
  return (
    left.accentColor === right.accentColor &&
    left.chrome === right.chrome &&
    left.tagColor === right.tagColor
  );
}

function applySectionPresentation<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  sectionId: string,
  presentation: WorkspaceSectionPresentation,
): WorkspaceDocumentCommandResult<TSectionData> {
  assertKnownSections(document, [sectionId]);
  const section = document.sections[sectionId] as WorkspaceSection<TSectionData>;
  if (presentationsMatch(section.presentation, presentation)) {
    return { document, status: "unchanged" };
  }
  return applied(
    {
      ...document,
      sections: { ...document.sections, [sectionId]: { ...section, presentation } },
    },
    "section-presentation",
  );
}

function collectSubtreeIds<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  selectedIds: readonly string[],
): ReadonlySet<string> {
  const removed = new Set<string>();
  const pending = [...selectedIds];
  while (pending.length > 0) {
    const sectionId = pending.pop();
    if (!sectionId || removed.has(sectionId)) {
      continue;
    }
    removed.add(sectionId);
    pending.push(...(document.sections[sectionId]?.childLayout?.sectionIds ?? []));
  }
  return removed;
}

function withoutRemovedChildren<TSectionData>(
  section: WorkspaceSection<TSectionData>,
  removed: ReadonlySet<string>,
): WorkspaceSection<TSectionData> {
  const childLayout = section.childLayout;
  if (!childLayout || !childLayout.sectionIds.some((sectionId) => removed.has(sectionId))) {
    return section;
  }
  return {
    ...section,
    childLayout: {
      ...childLayout,
      sectionIds: childLayout.sectionIds.filter((sectionId) => !removed.has(sectionId)),
    },
  };
}

function remainingSections<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  removed: ReadonlySet<string>,
): Readonly<Record<string, WorkspaceSection<TSectionData>>> {
  return Object.fromEntries(
    Object.entries(document.sections)
      .filter(([sectionId]) => !removed.has(sectionId))
      .map(([sectionId, section]) => [sectionId, withoutRemovedChildren(section, removed)]),
  );
}

function applySectionDeletion<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  sectionIds: readonly string[],
): WorkspaceDocumentCommandResult<TSectionData> {
  assertKnownSections(document, sectionIds);
  if (sectionIds.length === 0) {
    return { document, status: "unchanged" };
  }
  const normalizedIds = normalizeWorkspaceSelectionRoots(document, sectionIds);
  const removed = collectSubtreeIds(document, normalizedIds);
  return applied(
    {
      ...document,
      rootSections: document.rootSections.filter((root) => !removed.has(root.sectionId)),
      sections: remainingSections(document, removed),
    },
    "section-delete",
  );
}

type WorkspaceRootDocumentCommand<TSectionData> = Extract<
  WorkspaceDocumentCommand<TSectionData>,
  {
    type:
      | "create-root-section"
      | "move-root-sections"
      | "resize-root-section"
      | "set-viewport"
      | "stack-root-sections";
  }
>;

type WorkspaceSectionDocumentCommand<TSectionData> = Exclude<
  WorkspaceDocumentCommand<TSectionData>,
  WorkspaceRootDocumentCommand<TSectionData>
>;

function isRootDocumentCommand<TSectionData>(
  command: WorkspaceDocumentCommand<TSectionData>,
): command is WorkspaceRootDocumentCommand<TSectionData> {
  return (
    command.type === "create-root-section" ||
    command.type === "move-root-sections" ||
    command.type === "resize-root-section" ||
    command.type === "stack-root-sections" ||
    command.type === "set-viewport"
  );
}

function applyRootDocumentCommand<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  command: WorkspaceRootDocumentCommand<TSectionData>,
): WorkspaceDocumentCommandResult<TSectionData> {
  if (command.type === "set-viewport") {
    return applyViewport(document, command.viewport);
  }
  if (command.type === "create-root-section") {
    return applyRootCreation(document, command.section, command.position);
  }
  if (command.type === "move-root-sections") {
    return applyRootMovement(document, command.positions);
  }
  if (command.type === "stack-root-sections") {
    return applyRootStacking(document, command.sectionIds, command.action);
  }
  return applyRootResize(document, command);
}

function applySectionDocumentCommand<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  command: WorkspaceSectionDocumentCommand<TSectionData>,
): WorkspaceDocumentCommandResult<TSectionData> {
  if (command.type === "group-sections") {
    return applySectionGrouping(document, command);
  }
  if (command.type === "ungroup-section") {
    return applySectionUngrouping(document, command);
  }
  if (command.type === "set-section-content-size") {
    return applySectionContentSize(document, command.sectionId, command.axes);
  }
  if (command.type === "set-section-child-overflow") {
    return applySectionChildOverflow(document, command);
  }
  if (command.type === "set-sections-locked") {
    return applySectionLocks(document, command.sectionIds, command.locked);
  }
  if (command.type === "set-section-minimized") {
    return applySectionMinimized(document, command.sectionId, command.isMinimized);
  }
  if (command.type === "set-section-title") {
    return applySectionTitle(document, command.sectionId, command.title);
  }
  if (command.type === "set-section-presentation") {
    return applySectionPresentation(document, command.sectionId, command.presentation);
  }
  return applySectionDeletion(document, command.sectionIds);
}

export function applyWorkspaceDocumentCommand<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  command: WorkspaceDocumentCommand<TSectionData>,
  capabilities: WorkspaceCapabilities,
): WorkspaceDocumentCommandResult<TSectionData> {
  validateWorkspaceDocument(document);
  const rejection = rejectionFor(command, capabilities);
  if (rejection) {
    return { document, reason: rejection, status: "rejected" };
  }
  return isRootDocumentCommand(command)
    ? applyRootDocumentCommand(document, command)
    : applySectionDocumentCommand(document, command);
}
