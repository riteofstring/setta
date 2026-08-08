import {
  getAdjacentWorkspaceSectionId,
  WorkspaceDocumentValidationError,
  type WorkspaceActionResult,
  type WorkspaceCapabilities,
  type WorkspaceController,
  type WorkspaceDocument,
  type WorkspaceDocumentChange,
  type WorkspaceFitOptions,
  type WorkspaceViewport,
} from "../core.js";
import {
  applyWorkspaceDocumentCommand,
  type WorkspaceDocumentCommand,
} from "./document-commands.js";
import { denseArrayAt } from "./runtime-option-validation.js";
import type { WorkspaceCanvasController } from "./workspace-canvas-navigation.js";

export type WorkspaceControllerBindings<TSectionData> = Readonly<{
  commit(document: WorkspaceDocument<TSectionData>, change: WorkspaceDocumentChange): void;
  getCapabilities(): WorkspaceCapabilities;
  getCanvasController?(): WorkspaceCanvasController | null;
  getDocument(): WorkspaceDocument<TSectionData>;
  getViewportBounds?(): Readonly<{ maxZoom: number; minZoom: number }>;
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

function sectionIdAt(value: unknown, label = "Workspace section ID"): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value;
}

function sectionIdsAt(value: unknown): readonly string[] {
  const sectionIds = denseArrayAt(value, "Workspace section IDs");
  return sectionIds.map((sectionId, index) =>
    sectionIdAt(sectionId, `Workspace section ID at index ${String(index)}`),
  );
}

function booleanAt(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`${label} must be a boolean.`);
  }
  return value;
}

function setViewport<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  viewport: WorkspaceViewport,
): WorkspaceActionResult {
  if (typeof viewport !== "object" || viewport === null || Array.isArray(viewport)) {
    throw new TypeError("Workspace viewport must be an object.");
  }
  const bounds = bindings.getViewportBounds?.();
  if (bounds && (viewport.zoom < bounds.minZoom || viewport.zoom > bounds.maxZoom)) {
    throw new TypeError(
      "Workspace viewport zoom must be within the configured gesture zoom bounds.",
    );
  }
  return dispatch(bindings, { type: "set-viewport", viewport });
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
  sectionIdAt(sectionId);
  const document = bindings.getDocument();
  assertKnownSections(document, [sectionId]);
  const canvasController = requireCanvasController(bindings);
  const viewport = await canvasController.focusSection(sectionId, document.viewport);
  const result = setViewport(bindings, viewport);
  await canvasController.waitForViewport(viewport);
  canvasController.focusElement(sectionId);
  return result;
}

async function fitSections<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  sectionIds: readonly string[],
  options?: WorkspaceFitOptions,
): Promise<WorkspaceActionResult> {
  const uniqueSectionIds = [...new Set(sectionIdsAt(sectionIds))];
  if (uniqueSectionIds.length === 0) {
    return { status: "unchanged" };
  }
  assertKnownSections(bindings.getDocument(), uniqueSectionIds);
  const canvasController = requireCanvasController(bindings);
  const viewport = await canvasController.fitSections(uniqueSectionIds, options);
  const result = setViewport(bindings, viewport);
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
    deleteSections: (sectionIds) =>
      dispatch(bindings, { sectionIds: sectionIdsAt(sectionIds), type: "delete-sections" }),
    fitSection: (sectionId, options) => fitSections(bindings, [sectionId], options),
    fitSections: (sectionIds, options) => fitSections(bindings, sectionIds, options),
    focusNextSection: (sectionId) => focusAdjacentSection(bindings, sectionId, "next"),
    focusPreviousSection: (sectionId) => focusAdjacentSection(bindings, sectionId, "previous"),
    focusSection: (sectionId) => focusSection(bindings, sectionId),
    getCapabilities: () => ({ ...bindings.getCapabilities() }),
    getDocument: () => bindings.getDocument(),
    setSectionMinimized: (sectionId, isMinimized) =>
      dispatch(bindings, {
        isMinimized: booleanAt(isMinimized, "Workspace minimized state"),
        sectionId: sectionIdAt(sectionId),
        type: "set-section-minimized",
      }),
    setSectionsLocked: (sectionIds, locked) =>
      dispatch(bindings, {
        locked: booleanAt(locked, "Workspace locked state"),
        sectionIds: sectionIdsAt(sectionIds),
        type: "set-sections-locked",
      }),
    setViewport: (viewport) => setViewport(bindings, viewport),
  };
}
