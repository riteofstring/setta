import type { WorkspaceHost } from "@riteofstring/setta";

import type {
  DrawingAlignment,
  DrawingCanvasResizeRequest,
  DrawingDistribution,
  DrawingSelectionAppearancePatch,
  DrawingSelectionSnapshot,
  DrawingSelectionTypographyPatch,
} from "./drawingRuntime";

export type DrawingCanvasSize = Readonly<{
  height: number;
  width: number;
}>;

type DrawingGridOptions = Readonly<{
  snapEnabled: boolean;
  visible: boolean;
}>;

export type DrawingSurfaceController = {
  alignSelection: (alignment: DrawingAlignment) => boolean;
  bringSelectionForward: () => boolean;
  bringSelectionToFront: () => boolean;
  clearDrawing: () => boolean;
  clearSelection: () => boolean;
  copySelection: () => boolean;
  deleteSelection: () => boolean;
  distributeSelection: (distribution: DrawingDistribution) => boolean;
  duplicateSelection: () => Promise<boolean>;
  fitSectionToCanvas: () => boolean;
  getCanvasSize: () => DrawingCanvasSize;
  getGridOptions: () => DrawingGridOptions;
  getSelectionSnapshot: () => DrawingSelectionSnapshot;
  groupSelection: () => boolean;
  nudgeSelection: (x: number, y: number) => boolean;
  pasteSelection: () => Promise<boolean>;
  resizeCanvas: (request: DrawingCanvasResizeRequest) => boolean;
  selectAll: () => boolean;
  sendSelectionBackward: () => boolean;
  sendSelectionToBack: () => boolean;
  setSelectionAppearance: (patch: DrawingSelectionAppearancePatch) => boolean;
  setSelectionTypography: (patch: DrawingSelectionTypographyPatch) => boolean;
  setGridSnapEnabled: (enabled: boolean) => boolean;
  setGridVisible: (visible: boolean) => boolean;
  subscribeSelection: (listener: () => void) => () => void;
  toggleSelectionLock: () => boolean;
  ungroupSelection: () => boolean;
};

type AvailableDrawingSurfaceSnapshot = Readonly<{
  available: true;
  canvasSize: DrawingCanvasSize;
  grid: DrawingGridOptions;
  selection: DrawingSelectionSnapshot;
}>;

type UnavailableDrawingSurfaceSnapshot = Readonly<{
  available: false;
  canvasSize: null;
  grid: null;
  selection: DrawingSelectionSnapshot;
}>;

export type DrawingSurfaceSnapshot =
  AvailableDrawingSurfaceSnapshot | UnavailableDrawingSurfaceSnapshot;

type DrawingSurfaceRegistration = {
  controller: DrawingSurfaceController;
  unsubscribe: (() => void) | null;
};

type DrawingSurfaceSlot = {
  listeners: Set<() => void>;
  registration: DrawingSurfaceRegistration | null;
  snapshot: DrawingSurfaceSnapshot;
  snapshotKey: string | null;
};

export const EMPTY_DRAWING_SELECTION_SNAPSHOT: DrawingSelectionSnapshot =
  Object.freeze({
    canAlign: false,
    canClearSelection: false,
    canCopy: false,
    canDelete: false,
    canDistribute: false,
    canDuplicate: false,
    canGroup: false,
    canLock: false,
    canMoveBackward: false,
    canMoveForward: false,
    canPaste: false,
    canSelectAll: false,
    canUngroup: false,
    cornerRadius: null,
    count: 0,
    fillColor: null,
    fillEnabled: null,
    fontFamily: null,
    fontSize: null,
    fontStyle: null,
    fontWeight: null,
    kind: "none",
    locked: null,
    opacity: null,
    strokeColor: null,
    strokeEnabled: null,
    strokeWidth: null,
    supportsCornerRadius: false,
    supportsFill: false,
    supportsStroke: false,
    supportsTypography: false,
    textAlign: null,
  });

export const UNAVAILABLE_DRAWING_SURFACE_SNAPSHOT: DrawingSurfaceSnapshot =
  Object.freeze({
    available: false,
    canvasSize: null,
    grid: null,
    selection: EMPTY_DRAWING_SELECTION_SNAPSHOT,
  });

const drawingSurfacesByHost = new WeakMap<
  WorkspaceHost,
  Map<string, DrawingSurfaceSlot>
>();

function getDrawingSurfaces(
  host: WorkspaceHost,
): Map<string, DrawingSurfaceSlot> {
  const existing = drawingSurfacesByHost.get(host);
  if (existing !== undefined) {
    return existing;
  }
  const surfaces = new Map<string, DrawingSurfaceSlot>();
  drawingSurfacesByHost.set(host, surfaces);
  return surfaces;
}

function getDrawingSurfaceSlot(
  host: WorkspaceHost,
  sectionId: string,
): DrawingSurfaceSlot {
  const surfaces = getDrawingSurfaces(host);
  const existing = surfaces.get(sectionId);
  if (existing !== undefined) {
    return existing;
  }
  const slot: DrawingSurfaceSlot = {
    listeners: new Set(),
    registration: null,
    snapshot: UNAVAILABLE_DRAWING_SURFACE_SNAPSHOT,
    snapshotKey: null,
  };
  surfaces.set(sectionId, slot);
  return slot;
}

function getDrawingSurfaceRegistration(
  host: WorkspaceHost,
  sectionId: string,
): DrawingSurfaceRegistration | null {
  return drawingSurfacesByHost.get(host)?.get(sectionId)?.registration ?? null;
}

function notifyDrawingSurface(slot: DrawingSurfaceSlot): void {
  for (const listener of [...slot.listeners]) {
    listener();
  }
}

function drawingSurfaceSnapshotKey(
  canvasSize: DrawingCanvasSize,
  grid: DrawingGridOptions,
  selection: DrawingSelectionSnapshot,
): string {
  return JSON.stringify([
    canvasSize.width,
    canvasSize.height,
    grid.visible,
    grid.snapEnabled,
    selection,
  ]);
}

function publishDrawingSurface(
  slot: DrawingSurfaceSlot,
  registration: DrawingSurfaceRegistration,
): void {
  if (slot.registration !== registration) {
    return;
  }
  const canvasSize = registration.controller.getCanvasSize();
  const grid = registration.controller.getGridOptions();
  const selection = registration.controller.getSelectionSnapshot();
  const snapshotKey = drawingSurfaceSnapshotKey(canvasSize, grid, selection);
  if (slot.snapshot.available && slot.snapshotKey === snapshotKey) {
    return;
  }
  slot.snapshot = Object.freeze({
    available: true,
    canvasSize: Object.freeze({
      height: canvasSize.height,
      width: canvasSize.width,
    }),
    grid: Object.freeze({ ...grid }),
    selection: Object.freeze({ ...selection }),
  });
  slot.snapshotKey = snapshotKey;
  notifyDrawingSurface(slot);
}

function publishUnavailableDrawingSurface(slot: DrawingSurfaceSlot): void {
  if (slot.snapshot === UNAVAILABLE_DRAWING_SURFACE_SNAPSHOT) {
    return;
  }
  slot.snapshot = UNAVAILABLE_DRAWING_SURFACE_SNAPSHOT;
  slot.snapshotKey = null;
  notifyDrawingSurface(slot);
}

function removeUnusedDrawingSurfaceSlot(
  host: WorkspaceHost,
  sectionId: string,
  slot: DrawingSurfaceSlot,
): void {
  if (slot.registration !== null || slot.listeners.size > 0) {
    return;
  }
  const surfaces = drawingSurfacesByHost.get(host);
  if (surfaces?.get(sectionId) === slot) {
    surfaces.delete(sectionId);
  }
}

function runDrawingSurfaceCommand(
  host: WorkspaceHost,
  sectionId: string,
  command: (controller: DrawingSurfaceController) => boolean,
): boolean {
  const registration = getDrawingSurfaceRegistration(host, sectionId);
  if (registration === null) {
    return false;
  }
  const result = command(registration.controller);
  const slot = drawingSurfacesByHost.get(host)?.get(sectionId);
  if (slot !== undefined) {
    publishDrawingSurface(slot, registration);
  }
  return result;
}

async function runAsyncDrawingSurfaceCommand(
  host: WorkspaceHost,
  sectionId: string,
  command: (controller: DrawingSurfaceController) => Promise<boolean>,
): Promise<boolean> {
  const registration = getDrawingSurfaceRegistration(host, sectionId);
  if (registration === null) {
    return false;
  }
  const result = await command(registration.controller);
  const slot = drawingSurfacesByHost.get(host)?.get(sectionId);
  if (slot !== undefined) {
    publishDrawingSurface(slot, registration);
  }
  return result;
}

export function registerDrawingSurface(
  host: WorkspaceHost,
  sectionId: string,
  controller: DrawingSurfaceController,
): () => void {
  const slot = getDrawingSurfaceSlot(host, sectionId);
  const previousRegistration = slot.registration;
  const registration: DrawingSurfaceRegistration = {
    controller,
    unsubscribe: null,
  };
  slot.registration = registration;
  previousRegistration?.unsubscribe?.();
  const unsubscribe = controller.subscribeSelection(() => {
    publishDrawingSurface(slot, registration);
  });
  if (slot.registration === registration) {
    registration.unsubscribe = unsubscribe;
    publishDrawingSurface(slot, registration);
  } else {
    unsubscribe();
  }
  return () => {
    if (slot.registration !== registration) {
      return;
    }
    slot.registration = null;
    const unsubscribeSelection = registration.unsubscribe;
    registration.unsubscribe = null;
    unsubscribeSelection?.();
    if (slot.registration === null) {
      publishUnavailableDrawingSurface(slot);
      removeUnusedDrawingSurfaceSlot(host, sectionId, slot);
    }
  };
}

export function subscribeDrawingSurface(
  host: WorkspaceHost,
  sectionId: string,
  listener: () => void,
): () => void {
  const slot = getDrawingSurfaceSlot(host, sectionId);
  slot.listeners.add(listener);
  let subscribed = true;
  return () => {
    if (!subscribed) {
      return;
    }
    subscribed = false;
    slot.listeners.delete(listener);
    removeUnusedDrawingSurfaceSlot(host, sectionId, slot);
  };
}

export function getDrawingSurfaceSnapshot(
  host: WorkspaceHost,
  sectionId: string,
): DrawingSurfaceSnapshot {
  return (
    drawingSurfacesByHost.get(host)?.get(sectionId)?.snapshot ??
    UNAVAILABLE_DRAWING_SURFACE_SNAPSHOT
  );
}

export function getDrawingCanvasSize(
  host: WorkspaceHost,
  sectionId: string,
): DrawingCanvasSize | null {
  return (
    getDrawingSurfaceRegistration(
      host,
      sectionId,
    )?.controller.getCanvasSize() ?? null
  );
}

export function resizeDrawingCanvas(
  host: WorkspaceHost,
  sectionId: string,
  request: DrawingCanvasResizeRequest,
): boolean {
  return runDrawingSurfaceCommand(host, sectionId, (controller) =>
    controller.resizeCanvas(request),
  );
}

export function fitDrawingSectionToCanvas(
  host: WorkspaceHost,
  sectionId: string,
): boolean {
  return runDrawingSurfaceCommand(host, sectionId, (controller) =>
    controller.fitSectionToCanvas(),
  );
}

export function clearDrawing(host: WorkspaceHost, sectionId: string): boolean {
  return runDrawingSurfaceCommand(host, sectionId, (controller) =>
    controller.clearDrawing(),
  );
}

export function setDrawingGridVisible(
  host: WorkspaceHost,
  sectionId: string,
  visible: boolean,
): boolean {
  return runDrawingSurfaceCommand(host, sectionId, (controller) =>
    controller.setGridVisible(visible),
  );
}

export function setDrawingGridSnapEnabled(
  host: WorkspaceHost,
  sectionId: string,
  enabled: boolean,
): boolean {
  return runDrawingSurfaceCommand(host, sectionId, (controller) =>
    controller.setGridSnapEnabled(enabled),
  );
}

export function setDrawingSelectionAppearance(
  host: WorkspaceHost,
  sectionId: string,
  patch: DrawingSelectionAppearancePatch,
): boolean {
  return runDrawingSurfaceCommand(host, sectionId, (controller) =>
    controller.setSelectionAppearance(patch),
  );
}

export function setDrawingSelectionTypography(
  host: WorkspaceHost,
  sectionId: string,
  patch: DrawingSelectionTypographyPatch,
): boolean {
  return runDrawingSurfaceCommand(host, sectionId, (controller) =>
    controller.setSelectionTypography(patch),
  );
}

export function toggleDrawingSelectionLock(
  host: WorkspaceHost,
  sectionId: string,
): boolean {
  return runDrawingSurfaceCommand(host, sectionId, (controller) =>
    controller.toggleSelectionLock(),
  );
}

export function bringDrawingSelectionForward(
  host: WorkspaceHost,
  sectionId: string,
): boolean {
  return runDrawingSurfaceCommand(host, sectionId, (controller) =>
    controller.bringSelectionForward(),
  );
}

export function sendDrawingSelectionBackward(
  host: WorkspaceHost,
  sectionId: string,
): boolean {
  return runDrawingSurfaceCommand(host, sectionId, (controller) =>
    controller.sendSelectionBackward(),
  );
}

export function bringDrawingSelectionToFront(
  host: WorkspaceHost,
  sectionId: string,
): boolean {
  return runDrawingSurfaceCommand(host, sectionId, (controller) =>
    controller.bringSelectionToFront(),
  );
}

export function sendDrawingSelectionToBack(
  host: WorkspaceHost,
  sectionId: string,
): boolean {
  return runDrawingSurfaceCommand(host, sectionId, (controller) =>
    controller.sendSelectionToBack(),
  );
}

export function alignDrawingSelection(
  host: WorkspaceHost,
  sectionId: string,
  alignment: DrawingAlignment,
): boolean {
  return runDrawingSurfaceCommand(host, sectionId, (controller) =>
    controller.alignSelection(alignment),
  );
}

export function distributeDrawingSelection(
  host: WorkspaceHost,
  sectionId: string,
  distribution: DrawingDistribution,
): boolean {
  return runDrawingSurfaceCommand(host, sectionId, (controller) =>
    controller.distributeSelection(distribution),
  );
}

export function groupDrawingSelection(
  host: WorkspaceHost,
  sectionId: string,
): boolean {
  return runDrawingSurfaceCommand(host, sectionId, (controller) =>
    controller.groupSelection(),
  );
}

export function ungroupDrawingSelection(
  host: WorkspaceHost,
  sectionId: string,
): boolean {
  return runDrawingSurfaceCommand(host, sectionId, (controller) =>
    controller.ungroupSelection(),
  );
}

export function duplicateDrawingSelection(
  host: WorkspaceHost,
  sectionId: string,
): Promise<boolean> {
  return runAsyncDrawingSurfaceCommand(host, sectionId, (controller) =>
    controller.duplicateSelection(),
  );
}

export function copyDrawingSelection(
  host: WorkspaceHost,
  sectionId: string,
): boolean {
  return runDrawingSurfaceCommand(host, sectionId, (controller) =>
    controller.copySelection(),
  );
}

export function pasteDrawingSelection(
  host: WorkspaceHost,
  sectionId: string,
): Promise<boolean> {
  return runAsyncDrawingSurfaceCommand(host, sectionId, (controller) =>
    controller.pasteSelection(),
  );
}

export function selectAllDrawingObjects(
  host: WorkspaceHost,
  sectionId: string,
): boolean {
  return runDrawingSurfaceCommand(host, sectionId, (controller) =>
    controller.selectAll(),
  );
}

export function clearDrawingSelection(
  host: WorkspaceHost,
  sectionId: string,
): boolean {
  return runDrawingSurfaceCommand(host, sectionId, (controller) =>
    controller.clearSelection(),
  );
}

export function deleteDrawingSelection(
  host: WorkspaceHost,
  sectionId: string,
): boolean {
  return runDrawingSurfaceCommand(host, sectionId, (controller) =>
    controller.deleteSelection(),
  );
}

export function nudgeDrawingSelection(
  host: WorkspaceHost,
  sectionId: string,
  x: number,
  y: number,
): boolean {
  return runDrawingSurfaceCommand(host, sectionId, (controller) =>
    controller.nudgeSelection(x, y),
  );
}
