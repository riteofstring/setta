import { afterEach, describe, expect, test, vi } from "vitest";

import type { WorkspaceLayoutStore } from "./layout-store";
import {
  applyPaneDrop,
  paneDropTargetFromPointer,
  updatePaneDragSession,
  type PaneDragSession,
} from "./pane-drag-reorder";
import type { WorkspaceColumn, WorkspacePane, WorkspaceScene } from "./types";

describe("pane drag drop intent hit-testing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("maps the target center band to a row drop across columns", () => {
    const target = paneDropTargetFromPointer(
      pointerEvent({ clientX: 200, clientY: 150 }),
      "source_pane",
      storeForDragTests(),
    );

    expect(target).toEqual({
      axis: "vertical",
      intent: {
        kind: "row",
        placement: "after",
        targetPaneId: "target_pane",
      },
      paneId: "target_pane",
      placement: "after",
    });
  });

  test("maps target edges to destination column slots", () => {
    const target = paneDropTargetFromPointer(
      pointerEvent({ clientX: 108, clientY: 100 }),
      "source_pane",
      storeForDragTests(),
    );

    expect(target).toEqual({
      axis: "horizontal",
      intent: {
        kind: "column",
        planeIndex: 2,
        slotPlacement: "before",
        targetColumnId: "target_column",
      },
      paneId: "target_pane",
      placement: "before",
    });
  });

  test("maps nearby gutters to destination column slots", () => {
    const target = paneDropTargetFromPointer(
      pointerEvent({ clientX: 96, clientY: 100 }),
      "source_pane",
      storeForDragTests(),
    );

    expect(target?.intent).toEqual({
      kind: "column",
      planeIndex: 2,
      slotPlacement: "before",
      targetColumnId: "target_column",
    });
  });

  test("commits through a single intent-based store call", () => {
    const store = {
      applyPaneDropIntent: vi.fn(() => true),
    } as unknown as WorkspaceLayoutStore;
    const target = {
      axis: "vertical",
      intent: {
        kind: "row",
        placement: "after",
        targetPaneId: "target_pane",
      },
      paneId: "target_pane",
      placement: "after",
    } as const;

    expect(applyPaneDrop(store, "source_pane", target)).toBe(true);
    expect(store.applyPaneDropIntent).toHaveBeenCalledOnce();
    expect(store.applyPaneDropIntent).toHaveBeenCalledWith("source_pane", target.intent);
  });

  test("coalesces preview updates to one per animation frame", () => {
    const harness = dragTestHarness();
    const session: PaneDragSession = {
      dragging: false,
      handle: { hasPointerCapture: () => false } as HTMLElement,
      pendingDropFrame: null,
      pendingDropPointer: null,
      pointerId: 1,
      sourcePaneId: "source_pane",
      startClientX: 0,
      startClientY: 0,
      target: null,
    };

    updatePaneDragSession(
      pointerEvent({ clientX: 200, clientY: 150 }),
      harness.root,
      session,
      harness.store,
      harness.metrics,
    );
    updatePaneDragSession(
      pointerEvent({ clientX: 108, clientY: 100 }),
      harness.root,
      session,
      harness.store,
      harness.metrics,
    );

    expect(harness.previewPaneDropIntent).not.toHaveBeenCalled();
    expect(harness.frameCallbacks).toHaveLength(1);

    harness.frameCallbacks[0]?.(0);

    expect(harness.previewPaneDropIntent).toHaveBeenCalledOnce();
    expect(harness.previewPaneDropIntent).toHaveBeenCalledWith("source_pane", {
      kind: "column",
      planeIndex: 2,
      slotPlacement: "before",
      targetColumnId: "target_column",
    });
    expect(harness.recordPaneDragPreviewUpdate).toHaveBeenCalledOnce();
    expect(harness.recordPaneDragPreviewClear).not.toHaveBeenCalled();
  });

  test("records preview clears when a drag leaves valid targets", () => {
    const harness = dragTestHarness();
    const session: PaneDragSession = {
      dragging: true,
      handle: { hasPointerCapture: () => false } as HTMLElement,
      pendingDropFrame: null,
      pendingDropPointer: null,
      pointerId: 1,
      sourcePaneId: "source_pane",
      startClientX: 0,
      startClientY: 0,
      target: {
        axis: "vertical",
        intent: {
          kind: "row",
          placement: "after",
          targetPaneId: "target_pane",
        },
        paneId: "target_pane",
        placement: "after",
      },
    };

    updatePaneDragSession(
      pointerEvent({ clientX: 900, clientY: 900 }),
      harness.root,
      session,
      harness.store,
      harness.metrics,
    );

    harness.frameCallbacks[0]?.(0);

    expect(harness.store.clearPaneDropPreview).toHaveBeenCalledOnce();
    expect(harness.recordPaneDragPreviewClear).toHaveBeenCalledOnce();
    expect(harness.recordPaneDragPreviewUpdate).not.toHaveBeenCalled();
  });
});

function storeForDragTests(): WorkspaceLayoutStore {
  return dragTestHarness().store;
}

function dragTestHarness(): {
  clearPaneDropPreview: ReturnType<typeof vi.fn>;
  frameCallbacks: FrameRequestCallback[];
  metrics: {
    recordPaneDragPreviewClear: ReturnType<typeof vi.fn>;
    recordPaneDragPreviewUpdate: ReturnType<typeof vi.fn>;
  };
  previewPaneDropIntent: ReturnType<typeof vi.fn>;
  recordPaneDragPreviewClear: ReturnType<typeof vi.fn>;
  recordPaneDragPreviewUpdate: ReturnType<typeof vi.fn>;
  root: HTMLElement;
  store: WorkspaceLayoutStore;
} {
  const frameCallbacks: FrameRequestCallback[] = [];
  const hosts = [
    paneHost("source_pane", {
      bottom: 200,
      height: 200,
      left: -220,
      right: -20,
      top: 0,
      width: 200,
    }),
    paneHost("target_pane", {
      bottom: 200,
      height: 200,
      left: 100,
      right: 300,
      top: 0,
      width: 200,
    }),
  ];
  const clearPaneDropPreview = vi.fn(() => true);
  const previewPaneDropIntent = vi.fn(() => true);
  const recordPaneDragPreviewClear = vi.fn();
  const recordPaneDragPreviewUpdate = vi.fn();
  const metrics = {
    recordPaneDragPreviewClear,
    recordPaneDragPreviewUpdate,
  };
  vi.stubGlobal("document", {
    querySelectorAll: vi.fn(() => hosts),
  });
  vi.stubGlobal("window", {
    cancelAnimationFrame: vi.fn(),
    getComputedStyle: vi.fn(() => ({ zIndex: "1" })),
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    }),
  });
  const root = {
    dataset: {},
    querySelectorAll: vi.fn(() => hosts),
  } as unknown as HTMLElement;
  const store = {
    clearPaneDropPreview,
    previewPaneDropIntent,
    toScene: () => dragTestScene(),
  } as unknown as WorkspaceLayoutStore;
  return {
    clearPaneDropPreview,
    frameCallbacks,
    metrics,
    previewPaneDropIntent,
    recordPaneDragPreviewClear,
    recordPaneDragPreviewUpdate,
    root,
    store,
  };
}

function dragTestScene(): WorkspaceScene {
  const panes: WorkspacePane[] = [
    pane("source_pane", "source_column", 0),
    pane("target_pane", "target_column", 1),
  ];
  const columns: WorkspaceColumn[] = [
    column("source_column", ["source_pane"], 0, 0),
    column("target_column", ["target_pane"], 1, 2),
  ];
  return {
    columnGap: 8,
    columns,
    defaultColumnWidthSpec: { unit: "px", value: 520 },
    id: "drag-test-scene",
    padding: 10,
    paneById: new Map(panes.map((candidate) => [candidate.paneId, candidate])),
    panes,
    panesPerColumn: 1,
    renderOverscanColumns: 2,
    rowGap: 8,
    targetVisiblePanes: 2,
    totalPanes: 2,
    visibleColumnCount: 2,
  };
}

function pane(paneId: string, columnId: string, sequence: number): WorkspacePane {
  return {
    columnId,
    heat: 0,
    paneId,
    sequence,
    subtitle: "workspace surface",
    surfaceId: `surface_${sequence}`,
    surfaceKind: "empty-frame",
    title: paneId,
    tone: "slate",
    weight: 1,
  };
}

function column(
  columnId: string,
  paneIds: string[],
  slotIndex: number,
  planeIndex: number,
): WorkspaceColumn {
  return {
    columnId,
    idealWidthSpec: { unit: "px", value: 520 },
    index: slotIndex,
    paneIds,
    planeIndex,
    slotIndex,
    widthSpec: { unit: "px", value: 520 },
  };
}

function paneHost(
  paneId: string,
  rect: Pick<DOMRect, "bottom" | "height" | "left" | "right" | "top" | "width">,
): HTMLElement {
  return {
    dataset: {
      paneId,
    },
    getBoundingClientRect: () => rect,
    style: {},
  } as HTMLElement;
}

function pointerEvent({ clientX, clientY }: { clientX: number; clientY: number }): PointerEvent {
  return {
    clientX,
    clientY,
  } as PointerEvent;
}
