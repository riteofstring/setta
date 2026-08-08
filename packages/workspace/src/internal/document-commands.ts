import {
  deriveWorkspaceParentLookup,
  isValidWorkspaceColor,
  validateWorkspaceDocument,
  type WorkspaceActionRejectionReason,
  type WorkspaceCapabilities,
  type WorkspaceDocument,
  type WorkspaceDocumentChangeReason,
  type WorkspacePoint,
  type WorkspaceSection,
  type WorkspaceSectionPresentation,
  type WorkspaceViewport,
} from "../core.js";
import { isEnumerableDataProperty, optionOverridesAt } from "./runtime-option-validation.js";

export type WorkspaceDocumentCommand<TSectionData = unknown> =
  | Readonly<{
      position: WorkspacePoint;
      section: WorkspaceSection<TSectionData>;
      type: "create-root-section";
    }>
  | Readonly<{ sectionIds: readonly string[]; type: "delete-sections" }>
  | Readonly<{
      positions: Readonly<Record<string, WorkspacePoint>>;
      type: "move-root-sections";
    }>
  | Readonly<{ isMinimized: boolean; sectionId: string; type: "set-section-minimized" }>
  | Readonly<{
      presentation: WorkspaceSectionPresentation;
      sectionId: string;
      type: "set-section-presentation";
    }>
  | Readonly<{ sectionId: string; title: string; type: "set-section-title" }>
  | Readonly<{ locked: boolean; sectionIds: readonly string[]; type: "set-sections-locked" }>
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

function commandCapability(
  command: WorkspaceDocumentCommand<unknown>,
): WorkspaceEditCapability | null {
  if (command.type === "create-root-section" || command.type === "delete-sections") {
    return "editStructure";
  }
  if (command.type === "move-root-sections" || command.type === "set-sections-locked") {
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
  const parentLookup = deriveWorkspaceParentLookup(document);
  const selected = new Set(sectionIds);
  const normalizedIds = sectionIds.filter((sectionId) => {
    let parentId = parentLookup.get(sectionId) ?? null;
    while (parentId !== null) {
      if (selected.has(parentId)) {
        return false;
      }
      parentId = parentLookup.get(parentId) ?? null;
    }
    return true;
  });
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
  if (command.type === "set-viewport") {
    return applyViewport(document, command.viewport);
  }
  if (command.type === "create-root-section") {
    return applyRootCreation(document, command.section, command.position);
  }
  if (command.type === "move-root-sections") {
    return applyRootMovement(document, command.positions);
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
