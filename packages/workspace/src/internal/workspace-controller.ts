import {
  getAdjacentWorkspaceSectionId,
  WorkspaceDocumentValidationError,
  type WorkspaceActionResult,
  type WorkspaceCapabilities,
  type WorkspaceController,
  type WorkspaceDocument,
  type WorkspaceDocumentChange,
  type WorkspaceFitOptions,
} from "../core.js";
import {
  applyWorkspaceDocumentCommand,
  type WorkspaceDocumentCommand,
} from "./document-commands.js";
import type { WorkspaceCanvasController } from "./workspace-canvas-navigation.js";

export type WorkspaceControllerBindings<TSectionData> = Readonly<{
  commit(document: WorkspaceDocument<TSectionData>, change: WorkspaceDocumentChange): void;
  getCapabilities(): WorkspaceCapabilities;
  getCanvasController?(): WorkspaceCanvasController | null;
  getDocument(): WorkspaceDocument<TSectionData>;
}>;

function dispatch<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  command: WorkspaceDocumentCommand,
): WorkspaceActionResult {
  const result = applyWorkspaceDocumentCommand(
    bindings.getDocument(),
    command,
    bindings.getCapabilities(),
  );
  if (result.status === "applied") {
    bindings.commit(result.document, { reason: result.reason });
    return { status: "applied" };
  }
  if (result.status === "rejected") {
    return { reason: result.reason, status: "rejected" };
  }
  return { status: "unchanged" };
}

function requireCanvasController<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
): WorkspaceCanvasController {
  const canvasController = bindings.getCanvasController?.();
  if (!canvasController) {
    throw new Error("Workspace canvas controller is unavailable before mount or after unmount.");
  }
  return canvasController;
}

function assertKnownSections<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  sectionIds: readonly string[],
): void {
  const unknownSectionId = sectionIds.find(
    (sectionId) => !Object.hasOwn(document.sections, sectionId),
  );
  if (unknownSectionId) {
    throw new WorkspaceDocumentValidationError(
      "unknown-section",
      `$.sections[${JSON.stringify(unknownSectionId)}]`,
      `unknown section ${JSON.stringify(unknownSectionId)}`,
    );
  }
}

async function focusSection<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  sectionId: string,
): Promise<WorkspaceActionResult> {
  const document = bindings.getDocument();
  assertKnownSections(document, [sectionId]);
  const canvasController = requireCanvasController(bindings);
  const viewport = await canvasController.focusSection(sectionId, document.viewport);
  const result = dispatch(bindings, { type: "set-viewport", viewport });
  await canvasController.waitForViewport(viewport);
  canvasController.focusElement(sectionId);
  return result;
}

async function fitSections<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  sectionIds: readonly string[],
  options?: WorkspaceFitOptions,
): Promise<WorkspaceActionResult> {
  const uniqueSectionIds = [...new Set(sectionIds)];
  if (uniqueSectionIds.length === 0) {
    return { status: "unchanged" };
  }
  assertKnownSections(bindings.getDocument(), uniqueSectionIds);
  const canvasController = requireCanvasController(bindings);
  const viewport = await canvasController.fitSections(uniqueSectionIds, options);
  const result = dispatch(bindings, { type: "set-viewport", viewport });
  await canvasController.waitForViewport(viewport);
  return result;
}

async function focusAdjacentSection<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  sectionId: string,
  direction: "next" | "previous",
): Promise<WorkspaceActionResult> {
  const adjacentSectionId = getAdjacentWorkspaceSectionId(
    bindings.getDocument(),
    sectionId,
    direction,
  );
  return adjacentSectionId ? focusSection(bindings, adjacentSectionId) : { status: "unchanged" };
}

export function createWorkspaceController<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
): WorkspaceController<TSectionData> {
  return {
    deleteSections: (sectionIds) => dispatch(bindings, { sectionIds, type: "delete-sections" }),
    fitSection: (sectionId, options) => fitSections(bindings, [sectionId], options),
    fitSections: (sectionIds, options) => fitSections(bindings, sectionIds, options),
    focusNextSection: (sectionId) => focusAdjacentSection(bindings, sectionId, "next"),
    focusPreviousSection: (sectionId) => focusAdjacentSection(bindings, sectionId, "previous"),
    focusSection: (sectionId) => focusSection(bindings, sectionId),
    getCapabilities: () => ({ ...bindings.getCapabilities() }),
    getDocument: () => bindings.getDocument(),
    setSectionMinimized: (sectionId, isMinimized) =>
      dispatch(bindings, { isMinimized, sectionId, type: "set-section-minimized" }),
    setSectionsLocked: (sectionIds, locked) =>
      dispatch(bindings, { locked, sectionIds, type: "set-sections-locked" }),
    setViewport: (viewport) => dispatch(bindings, { type: "set-viewport", viewport }),
  };
}
