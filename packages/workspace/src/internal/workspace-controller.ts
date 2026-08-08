import {
  getAdjacentWorkspaceSectionId,
  getWorkspaceSectionOrder,
  WorkspaceDocumentValidationError,
  type WorkspaceActionResult,
  type WorkspaceCapabilities,
  type WorkspaceController,
  type WorkspaceDocument,
  type WorkspaceDocumentChange,
  type WorkspaceFitOptions,
  type WorkspacePoint,
  type WorkspaceViewport,
} from "../core.js";
import {
  applyWorkspaceDocumentCommand,
  type WorkspaceDocumentCommand,
} from "./document-commands.js";
import { denseArrayAt } from "./runtime-option-validation.js";
import type { WorkspaceCanvasController } from "./workspace-canvas-navigation.js";
import { validateWorkspaceViewport } from "./workspace-document-validation.js";

export type WorkspaceControllerBindings<TSectionData> = Readonly<{
  canMinimizeSection?(sectionId: string): boolean;
  commit(document: WorkspaceDocument<TSectionData>, change: WorkspaceDocumentChange): void;
  getCapabilities(): WorkspaceCapabilities;
  getCanvasController?(): WorkspaceCanvasController | null;
  getDocument(): WorkspaceDocument<TSectionData>;
  getSelection?(): readonly string[];
  getViewportBounds?(): Readonly<{ maxZoom: number; minZoom: number }>;
  requestViewportSynchronization?(): void;
  setSelection?(sectionIds: readonly string[]): WorkspaceActionResult;
}>;

function selectionsMatch(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length && left.every((sectionId, index) => sectionId === right[index])
  );
}

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

function validateViewportArgument(value: unknown): asserts value is WorkspaceViewport {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Workspace viewport must be an object.");
  }
  validateWorkspaceViewport(value);
}

function validateViewportBounds(
  viewport: WorkspaceViewport,
  bounds: Readonly<{ maxZoom: number; minZoom: number }> | undefined,
): void {
  if (!bounds) {
    return;
  }
  if (viewport.zoom < bounds.minZoom || viewport.zoom > bounds.maxZoom) {
    throw new TypeError(
      "Workspace viewport zoom must be within the configured gesture zoom bounds.",
    );
  }
}

function setViewport<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  viewport: WorkspaceViewport,
): WorkspaceActionResult {
  validateViewportArgument(viewport);
  validateViewportBounds(viewport, bindings.getViewportBounds?.());
  const result = dispatch(bindings, { type: "set-viewport", viewport });
  if (result.status === "applied") {
    bindings.requestViewportSynchronization?.();
  }
  return result;
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
  setSelection: (sectionIds: readonly string[]) => WorkspaceActionResult,
  sectionId: string,
): Promise<WorkspaceActionResult> {
  sectionIdAt(sectionId);
  const document = bindings.getDocument();
  assertKnownSections(document, [sectionId]);
  setSelection([sectionId]);
  const canvasController = requireCanvasController(bindings);
  const viewport = await canvasController.focusSection(sectionId, document.viewport);
  const result = setViewport(bindings, viewport);
  const synchronized = await canvasController.waitForViewport(viewport);
  if (synchronized) {
    canvasController.focusElement(sectionId);
  }
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
  setSelection: (sectionIds: readonly string[]) => WorkspaceActionResult,
  sectionId: string,
  direction: "next" | "previous",
): Promise<WorkspaceActionResult> {
  const adjacentSectionId = getAdjacentWorkspaceSectionId(
    bindings.getDocument(),
    sectionId,
    direction,
  );
  return adjacentSectionId
    ? focusSection(bindings, setSelection, adjacentSectionId)
    : { status: "unchanged" };
}

function setSectionMinimized<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  sectionIdValue: string,
  isMinimizedValue: boolean,
): WorkspaceActionResult {
  const sectionId = sectionIdAt(sectionIdValue);
  const isMinimized = booleanAt(isMinimizedValue, "Workspace minimized state");
  const command = { isMinimized, sectionId, type: "set-section-minimized" } as const;
  if (!bindings.getCapabilities().editPresentation) {
    return dispatch(bindings, command);
  }
  assertKnownSections(bindings.getDocument(), [sectionId]);
  if (isMinimized && bindings.canMinimizeSection?.(sectionId) === false) {
    return { reason: "section-not-minimizable", status: "rejected" };
  }
  return dispatch(bindings, command);
}

export function createWorkspaceController<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
): WorkspaceController<TSectionData> {
  let fallbackSelection: readonly string[] = [];
  const getSelection = () => bindings.getSelection?.() ?? fallbackSelection;
  const setSelection = (sectionIds: readonly string[]): WorkspaceActionResult => {
    if (bindings.setSelection) {
      return bindings.setSelection(sectionIds);
    }
    if (selectionsMatch(fallbackSelection, sectionIds)) {
      return { status: "unchanged" };
    }
    fallbackSelection = [...sectionIds];
    return { status: "applied" };
  };
  return {
    clearSelection: () => setSelection([]),
    deleteSections: (sectionIds) =>
      dispatch(bindings, { sectionIds: sectionIdsAt(sectionIds), type: "delete-sections" }),
    fitSection: (sectionId, options) => fitSections(bindings, [sectionId], options),
    fitSections: (sectionIds, options) => fitSections(bindings, sectionIds, options),
    focusNextSection: (sectionId) =>
      focusAdjacentSection(bindings, setSelection, sectionId, "next"),
    focusPreviousSection: (sectionId) =>
      focusAdjacentSection(bindings, setSelection, sectionId, "previous"),
    focusSection: (sectionId) => focusSection(bindings, setSelection, sectionId),
    getCapabilities: () => ({ ...bindings.getCapabilities() }),
    getDocument: () => bindings.getDocument(),
    getSelectedSectionIds: () => [...getSelection()],
    selectSections: (sectionIds) => {
      const selectedIds = sectionIdsAt(sectionIds);
      const document = bindings.getDocument();
      assertKnownSections(document, selectedIds);
      const selected = new Set(selectedIds);
      return setSelection(
        getWorkspaceSectionOrder(document).filter((sectionId) => selected.has(sectionId)),
      );
    },
    setSectionMinimized: (sectionId, isMinimized) =>
      setSectionMinimized(bindings, sectionId, isMinimized),
    setSectionsLocked: (sectionIds, locked) =>
      dispatch(bindings, {
        locked: booleanAt(locked, "Workspace locked state"),
        sectionIds: sectionIdsAt(sectionIds),
        type: "set-sections-locked",
      }),
    setViewport: (viewport) => setViewport(bindings, viewport),
  };
}

export function moveWorkspaceRootSections<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  positions: Readonly<Record<string, WorkspacePoint>>,
): WorkspaceActionResult {
  return dispatch(bindings, { positions, type: "move-root-sections" });
}
