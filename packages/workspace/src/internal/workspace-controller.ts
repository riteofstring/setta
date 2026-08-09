import {
  getAdjacentWorkspaceSectionId,
  getWorkspaceSectionOrder,
  planWorkspaceRootAutoLayout,
  WorkspaceDocumentValidationError,
  type SectionOrientation,
  type SectionOverflow,
  type WorkspaceActionResult,
  type WorkspaceCapabilities,
  type WorkspaceChildLayoutPositioningChange,
  type WorkspaceController,
  type WorkspaceCreateSectionOptions,
  type WorkspaceDocument,
  type WorkspaceDocumentChange,
  type WorkspaceFitOptions,
  type WorkspaceHistoryState,
  type WorkspacePoint,
  type WorkspaceRootAutoLayoutOptions,
  type WorkspaceSection,
  type WorkspaceViewport,
} from "../core.js";
import {
  applyWorkspaceDocumentCommand,
  type WorkspaceDocumentCommand,
} from "./document-commands.js";
import { denseArrayAt, optionOverridesAt } from "./runtime-option-validation.js";
import type { SectionMovePlan } from "./section-move-planning.js";
import type { WorkspaceCanvasController } from "./workspace-canvas-navigation.js";
import type { WorkspaceClipboardPlacedSections } from "./workspace-clipboard.js";
import { validateWorkspaceViewport } from "./workspace-document-validation.js";
import type { WorkspaceRootStackingAction } from "./workspace-root-stacking.js";
import {
  normalizeWorkspaceSectionTitle,
  resolveWorkspaceSectionPresentation,
} from "./workspace-section-input-validation.js";
import {
  resolveWorkspaceSectionOrientation,
  workspaceSectionOrientationRequiresMeasurement,
} from "./workspace-section-orientation-command.js";
import {
  resolveWorkspaceChildLayoutPositioningChange,
  workspaceSectionPositioningRequiresMeasurement,
} from "./workspace-section-positioning-command.js";
import type {
  WorkspaceRootResizeSnapshot,
  WorkspaceSectionResizeAxis,
} from "./workspace-section-sizing.js";

export type WorkspaceControllerBindings<TSectionData> = Readonly<{
  canMinimizeSection?(sectionId: string): boolean;
  commit(document: WorkspaceDocument<TSectionData>, change: WorkspaceDocumentChange): void;
  copySelection?(): Promise<WorkspaceActionResult>;
  createSection?(kind: string, options: WorkspaceCreateSectionOptions): WorkspaceActionResult;
  getCapabilities(): WorkspaceCapabilities;
  getCanvasController?(): WorkspaceCanvasController | null;
  getCollapsedAncestorSectionId?(sectionId: string): string | null;
  getDocument(): WorkspaceDocument<TSectionData>;
  getHistoryState?(): WorkspaceHistoryState;
  getSelection?(): readonly string[];
  getViewportBounds?(): Readonly<{ maxZoom: number; minZoom: number }>;
  groupSections?(sectionIds: readonly string[]): WorkspaceActionResult;
  paste?(): Promise<WorkspaceActionResult>;
  requestViewportSynchronization?(): void;
  redo?(): WorkspaceActionResult;
  setSelection?(sectionIds: readonly string[]): WorkspaceActionResult;
  undo?(): WorkspaceActionResult;
  ungroupSection?(sectionId: string): WorkspaceActionResult;
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

function rootAutoLayoutOptionsAt(value: unknown): WorkspaceRootAutoLayoutOptions {
  const options = optionOverridesAt(
    value,
    ["gap"],
    "Workspace root auto-layout options",
    "workspace root auto-layout option",
  );
  if (options.gap === undefined) {
    return Object.freeze({});
  }
  if (typeof options.gap !== "number" || !Number.isFinite(options.gap) || options.gap < 0) {
    throw new TypeError("Workspace root auto-layout gap must be a finite non-negative number.");
  }
  return Object.freeze({ gap: options.gap });
}

function measuredRootAutoLayoutRectangles<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  canvasController: WorkspaceCanvasController,
) {
  const rectangles = document.rootSections.map(({ sectionId }) => {
    const rect = canvasController.getSectionRect(sectionId);
    if (
      !rect ||
      !Number.isFinite(rect.x) ||
      !Number.isFinite(rect.y) ||
      !Number.isFinite(rect.width) ||
      !Number.isFinite(rect.height) ||
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return null;
    }
    return { ...rect, sectionId };
  });
  return rectangles.some((rectangle) => rectangle === null)
    ? null
    : rectangles.filter((rectangle) => rectangle !== null);
}

function autoLayoutRootSections<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  optionsValue: WorkspaceRootAutoLayoutOptions | undefined,
): WorkspaceActionResult {
  const options = rootAutoLayoutOptionsAt(optionsValue);
  if (!bindings.getCapabilities().editLayout) {
    return { reason: "layout-edit-disabled", status: "rejected" };
  }
  const document = bindings.getDocument();
  if (document.rootSections.length < 2) {
    return { status: "unchanged" };
  }
  if (
    document.rootSections.some(
      ({ sectionId }) => document.sections[sectionId]?.positionAndSizeLocked,
    )
  ) {
    return { reason: "section-locked", status: "rejected" };
  }
  const canvasController = bindings.getCanvasController?.();
  if (!canvasController) {
    return { reason: "canvas-unavailable", status: "rejected" };
  }
  const rootRects = measuredRootAutoLayoutRectangles(document, canvasController);
  if (!rootRects) {
    return { reason: "section-geometry-unavailable", status: "rejected" };
  }
  const plan = planWorkspaceRootAutoLayout({ ...options, rootRects });
  return dispatch(bindings, { positions: plan.positions, type: "move-root-sections" });
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

function requireStructuralMovementCapabilities<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
): WorkspaceActionResult | null {
  const capabilities = bindings.getCapabilities();
  if (!capabilities.editStructure) {
    return { reason: "structure-edit-disabled", status: "rejected" };
  }
  return capabilities.editLayout ? null : { reason: "layout-edit-disabled", status: "rejected" };
}

function groupSections<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  sectionIdsValue: readonly string[],
): WorkspaceActionResult {
  const sectionIds = sectionIdsAt(sectionIdsValue);
  const rejection = requireStructuralMovementCapabilities(bindings);
  if (rejection) {
    return rejection;
  }
  assertKnownSections(bindings.getDocument(), sectionIds);
  return (
    bindings.groupSections?.(sectionIds) ?? {
      reason: "grouping-unavailable",
      status: "rejected",
    }
  );
}

function ungroupSection<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  sectionIdValue: string,
): WorkspaceActionResult {
  const sectionId = sectionIdAt(sectionIdValue);
  const rejection = requireStructuralMovementCapabilities(bindings);
  if (rejection) {
    return rejection;
  }
  assertKnownSections(bindings.getDocument(), [sectionId]);
  return (
    bindings.ungroupSection?.(sectionId) ?? {
      reason: "grouping-unavailable",
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

function sectionDescendantsAreCollapsed<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  sectionId: string,
): boolean {
  return typeof bindings.getCollapsedAncestorSectionId?.(sectionId) === "string";
}

async function focusSection<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  setSelection: (sectionIds: readonly string[]) => WorkspaceActionResult,
  sectionId: string,
): Promise<WorkspaceActionResult> {
  sectionIdAt(sectionId);
  const document = bindings.getDocument();
  assertKnownSections(document, [sectionId]);
  if (sectionDescendantsAreCollapsed(bindings, sectionId)) {
    return { reason: "section-descendants-collapsed", status: "rejected" };
  }
  setSelection([sectionId]);
  const canvasController = requireCanvasController(bindings);
  const release = canvasController.revealSection(sectionId);
  try {
    const viewport = await canvasController.focusSection(sectionId, document.viewport);
    const result = setViewport(bindings, viewport);
    const synchronized = await canvasController.waitForViewport(viewport);
    if (synchronized) {
      await canvasController.focusElementWhenReady(sectionId);
    }
    return result;
  } finally {
    release();
  }
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
  if (uniqueSectionIds.some((sectionId) => sectionDescendantsAreCollapsed(bindings, sectionId))) {
    return { reason: "section-descendants-collapsed", status: "rejected" };
  }
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
  const document = bindings.getDocument();
  let adjacentSectionId = getAdjacentWorkspaceSectionId(document, sectionId, direction);
  while (adjacentSectionId && sectionDescendantsAreCollapsed(bindings, adjacentSectionId)) {
    adjacentSectionId = getAdjacentWorkspaceSectionId(document, adjacentSectionId, direction);
  }
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

function stackRootSections<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  sectionIds: readonly string[],
  action: WorkspaceRootStackingAction,
): WorkspaceActionResult {
  return dispatch(bindings, {
    action,
    sectionIds: sectionIdsAt(sectionIds),
    type: "stack-root-sections",
  });
}

function sectionAllowsOrientationMeasurement<TSectionData>(
  section: WorkspaceSection<TSectionData> | undefined,
  orientation: SectionOrientation,
): section is WorkspaceSection<TSectionData> {
  if (!section) {
    return false;
  }
  if (section.positionAndSizeLocked) {
    return false;
  }
  if (section.isMinimized) {
    return false;
  }
  return workspaceSectionOrientationRequiresMeasurement(section, orientation);
}

function measuredSizeFromRect(
  rect: ReturnType<WorkspaceCanvasController["getSectionRect"]>,
): Readonly<{ height: number; width: number }> | null {
  if (!rect) {
    return null;
  }
  if (!Number.isFinite(rect.height) || rect.height <= 0) {
    return null;
  }
  if (!Number.isFinite(rect.width) || rect.width <= 0) {
    return null;
  }
  return { height: rect.height, width: rect.width };
}

function measuredSizeForSectionOrientation<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  sectionId: string,
  orientation: SectionOrientation,
): Readonly<{ height: number; width: number }> | null {
  if (!bindings.getCapabilities().editLayout) {
    return null;
  }
  const section = bindings.getDocument().sections[sectionId];
  if (!sectionAllowsOrientationMeasurement(section, orientation)) {
    return null;
  }
  return measuredSizeFromRect(bindings.getCanvasController?.()?.getSectionRect(sectionId));
}

function measuredSizeForSectionPositioning<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  sectionId: string,
  change: WorkspaceChildLayoutPositioningChange,
): Readonly<{ height: number; width: number }> | null {
  if (!bindings.getCapabilities().editLayout) {
    return null;
  }
  const section = bindings.getDocument().sections[sectionId];
  if (
    !section ||
    section.positionAndSizeLocked ||
    section.isMinimized ||
    !workspaceSectionPositioningRequiresMeasurement(section, change)
  ) {
    return null;
  }
  return measuredSizeFromRect(bindings.getCanvasController?.()?.getSectionRect(sectionId));
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
    autoLayoutRootSections: (options) => autoLayoutRootSections(bindings, options),
    bringForward: (sectionIds) => stackRootSections(bindings, sectionIds, "bring-forward"),
    bringToFront: (sectionIds) => stackRootSections(bindings, sectionIds, "bring-to-front"),
    clearSelection: () => setSelection([]),
    copySelection: () =>
      bindings.copySelection?.() ??
      Promise.resolve({ reason: "clipboard-unavailable", status: "rejected" }),
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
    getHistoryState: () => bindings.getHistoryState?.() ?? { canRedo: false, canUndo: false },
    getSelectedSectionIds: () => [...getSelection()],
    groupSections: (sectionIds) => groupSections(bindings, sectionIds),
    paste: () =>
      bindings.paste?.() ??
      Promise.resolve({ reason: "clipboard-unavailable", status: "rejected" }),
    redo: () => bindings.redo?.() ?? { status: "unchanged" },
    selectSections: (sectionIds) => {
      const selectedIds = sectionIdsAt(sectionIds);
      const document = bindings.getDocument();
      assertKnownSections(document, selectedIds);
      if (selectedIds.some((sectionId) => sectionDescendantsAreCollapsed(bindings, sectionId))) {
        return { reason: "section-descendants-collapsed", status: "rejected" };
      }
      const selected = new Set(selectedIds);
      return setSelection(
        getWorkspaceSectionOrder(document).filter((sectionId) => selected.has(sectionId)),
      );
    },
    sendBackward: (sectionIds) => stackRootSections(bindings, sectionIds, "send-backward"),
    sendToBack: (sectionIds) => stackRootSections(bindings, sectionIds, "send-to-back"),
    setSectionChildOrientation: (sectionId, orientation) => {
      const resolvedSectionId = sectionIdAt(sectionId);
      const resolvedOrientation = resolveWorkspaceSectionOrientation(orientation);
      return setWorkspaceSectionChildOrientation(
        bindings,
        resolvedSectionId,
        resolvedOrientation,
        measuredSizeForSectionOrientation(bindings, resolvedSectionId, resolvedOrientation),
      );
    },
    setSectionChildPositioning: (sectionId, change) => {
      const resolvedSectionId = sectionIdAt(sectionId);
      const resolvedChange = resolveWorkspaceChildLayoutPositioningChange(change);
      return setWorkspaceSectionChildPositioning(
        bindings,
        resolvedSectionId,
        resolvedChange,
        measuredSizeForSectionPositioning(bindings, resolvedSectionId, resolvedChange),
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
    undo: () => bindings.undo?.() ?? { status: "unchanged" },
    ungroupSection: (sectionId) => ungroupSection(bindings, sectionId),
  };
}

export function moveWorkspaceRootSections<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  positions: Readonly<Record<string, WorkspacePoint>>,
): WorkspaceActionResult {
  return dispatch(bindings, { positions, type: "move-root-sections" });
}

export function pasteWorkspaceSections<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  paste: WorkspaceClipboardPlacedSections<TSectionData>,
): WorkspaceActionResult {
  return dispatch(bindings, { paste, type: "paste-sections" });
}

export function moveWorkspaceSections<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  plan: SectionMovePlan,
): WorkspaceActionResult {
  return dispatch(bindings, { plan, type: "move-sections" });
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

export function setWorkspaceSectionChildOverflow<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  sectionId: string,
  overflow: SectionOverflow,
  measuredSize: Readonly<{ height: number; width: number }> | null,
  growWithContentSizing: Readonly<{ height: boolean; width: boolean }>,
): WorkspaceActionResult {
  return dispatch(bindings, {
    growWithContentSizing,
    measuredSize,
    overflow,
    sectionId,
    type: "set-section-child-overflow",
  });
}

function setWorkspaceSectionChildOrientation<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  sectionId: string,
  orientation: SectionOrientation,
  measuredSize: Readonly<{ height: number; width: number }> | null,
): WorkspaceActionResult {
  return dispatch(bindings, {
    measuredSize,
    orientation,
    sectionId,
    type: "set-section-child-orientation",
  });
}

function setWorkspaceSectionChildPositioning<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  sectionId: string,
  change: WorkspaceChildLayoutPositioningChange,
  measuredSize: Readonly<{ height: number; width: number }> | null,
): WorkspaceActionResult {
  return dispatch(bindings, {
    change,
    measuredSize,
    sectionId,
    type: "set-section-child-positioning",
  });
}

export function createWorkspaceRootSection<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  section: WorkspaceSection<TSectionData>,
  position: WorkspacePoint,
): WorkspaceActionResult {
  return dispatch(bindings, { position, section, type: "create-root-section" });
}

export function groupWorkspaceSections<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  group: WorkspaceSection<TSectionData>,
  sectionIds: readonly string[],
  position: WorkspacePoint | null,
): WorkspaceActionResult {
  return dispatch(bindings, { group, position, sectionIds, type: "group-sections" });
}

export function ungroupWorkspaceSection<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  sectionId: string,
  positions: Readonly<Record<string, WorkspacePoint>> | null,
): WorkspaceActionResult {
  return dispatch(bindings, { positions, sectionId, type: "ungroup-section" });
}
