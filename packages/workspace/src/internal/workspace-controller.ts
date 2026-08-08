import {
  getAdjacentWorkspaceSectionId,
  getWorkspaceSectionOrder,
  WorkspaceDocumentValidationError,
  type WorkspaceActionResult,
  type WorkspaceCapabilities,
  type WorkspaceController,
  type WorkspaceCreateSectionOptions,
  type WorkspaceDocument,
  type WorkspaceDocumentChange,
  type WorkspaceFitOptions,
  type WorkspacePoint,
  type WorkspaceSection,
  type WorkspaceViewport,
} from "../core.js";
import {
  applyWorkspaceDocumentCommand,
  normalizeWorkspaceSectionTitle,
  resolveWorkspaceSectionPresentation,
  type WorkspaceDocumentCommand,
} from "./document-commands.js";
import { denseArrayAt, optionOverridesAt } from "./runtime-option-validation.js";
import type { WorkspaceCanvasController } from "./workspace-canvas-navigation.js";
import { validateWorkspaceViewport } from "./workspace-document-validation.js";
import type {
  WorkspaceRootResizeSnapshot,
  WorkspaceSectionResizeAxis,
} from "./workspace-section-sizing.js";

export type WorkspaceControllerBindings<TSectionData> = Readonly<{
  canMinimizeSection?(sectionId: string): boolean;
  commit(document: WorkspaceDocument<TSectionData>, change: WorkspaceDocumentChange): void;
  createSection?(kind: string, options: WorkspaceCreateSectionOptions): WorkspaceActionResult;
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
  command: WorkspaceDocumentCommand<TSectionData>,
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

function pointAt(value: unknown, label: string): WorkspacePoint {
  const point = optionOverridesAt(value, ["x", "y"], label, "workspace point field");
  if (!Object.hasOwn(point, "x") || !Object.hasOwn(point, "y")) {
    throw new TypeError(`${label} must provide x and y.`);
  }
  const x = point.x;
  const y = point.y;
  if (
    typeof x !== "number" ||
    !Number.isFinite(x) ||
    typeof y !== "number" ||
    !Number.isFinite(y)
  ) {
    throw new TypeError(`${label} coordinates must be finite numbers.`);
  }
  return { x, y };
}

function createSectionOptionsAt(value: unknown): WorkspaceCreateSectionOptions {
  const options = optionOverridesAt(
    value,
    ["position"],
    "Workspace create-section options",
    "workspace create-section option",
  );
  return options.position === undefined
    ? Object.freeze({})
    : Object.freeze({ position: pointAt(options.position, "Workspace creation position") });
}

function createSection<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  kindValue: string,
  optionsValue: WorkspaceCreateSectionOptions | undefined,
): WorkspaceActionResult {
  const kind = sectionIdAt(kindValue, "Workspace section kind");
  const options = createSectionOptionsAt(optionsValue);
  if (!bindings.getCapabilities().editStructure) {
    return { reason: "structure-edit-disabled", status: "rejected" };
  }
  return (
    bindings.createSection?.(kind, options) ?? {
      reason: "section-creation-unavailable",
      status: "rejected",
    }
  );
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
    createSection: (kind, options) => createSection(bindings, kind, options),
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
    setSectionPresentation: (sectionId, presentation) =>
      dispatch(bindings, {
        presentation: resolveWorkspaceSectionPresentation(presentation),
        sectionId: sectionIdAt(sectionId),
        type: "set-section-presentation",
      }),
    setSectionTitle: (sectionId, title) =>
      dispatch(bindings, {
        sectionId: sectionIdAt(sectionId),
        title: normalizeWorkspaceSectionTitle(title),
        type: "set-section-title",
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

export function moveWorkspaceRootSections<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  positions: Readonly<Record<string, WorkspacePoint>>,
): WorkspaceActionResult {
  return dispatch(bindings, { positions, type: "move-root-sections" });
}

export function resizeWorkspaceRootSection<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  sectionId: string,
  axes: readonly WorkspaceSectionResizeAxis[],
  resize: WorkspaceRootResizeSnapshot,
): WorkspaceActionResult {
  return dispatch(bindings, {
    axes,
    position: resize.position,
    sectionId,
    size: resize.size,
    type: "resize-root-section",
  });
}

export function setWorkspaceSectionContentSize<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  sectionId: string,
  axes: readonly WorkspaceSectionResizeAxis[],
): WorkspaceActionResult {
  return dispatch(bindings, { axes, sectionId, type: "set-section-content-size" });
}

export function createWorkspaceRootSection<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  section: WorkspaceSection<TSectionData>,
  position: WorkspacePoint,
): WorkspaceActionResult {
  return dispatch(bindings, { position, section, type: "create-root-section" });
}
