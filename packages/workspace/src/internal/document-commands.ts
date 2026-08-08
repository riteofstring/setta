import {
  deriveWorkspaceParentLookup,
  validateWorkspaceDocument,
  type WorkspaceActionRejectionReason,
  type WorkspaceCapabilities,
  type WorkspaceDocument,
  type WorkspaceDocumentChangeReason,
  type WorkspaceSection,
  type WorkspaceViewport,
} from "../core.js";

export type WorkspaceDocumentCommand =
  | Readonly<{ sectionIds: readonly string[]; type: "delete-sections" }>
  | Readonly<{ isMinimized: boolean; sectionId: string; type: "set-section-minimized" }>
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

function rejectionFor(
  command: WorkspaceDocumentCommand,
  capabilities: WorkspaceCapabilities,
): WorkspaceActionRejectionReason | null {
  if (command.type === "delete-sections" && !capabilities.editStructure) {
    return "structure-edit-disabled";
  }
  if (command.type === "set-sections-locked" && !capabilities.editLayout) {
    return "layout-edit-disabled";
  }
  if (command.type === "set-section-minimized" && !capabilities.editPresentation) {
    return "presentation-edit-disabled";
  }
  return null;
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
  command: WorkspaceDocumentCommand,
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
  if (command.type === "set-sections-locked") {
    return applySectionLocks(document, command.sectionIds, command.locked);
  }
  if (command.type === "set-section-minimized") {
    return applySectionMinimized(document, command.sectionId, command.isMinimized);
  }
  return applySectionDeletion(document, command.sectionIds);
}
