/* @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { setActiveSectionUIIds } from "state/activeSectionUI";
import {
  NULL_PROJECT_CONFIG_ID,
  useLocalStorage,
  useMisc,
  useNodeInternals,
  useProjectState,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createCodeSectionImpl,
  createCore,
  createProjectConfig,
  createSingleConfig,
  createVariant,
  type SingleConfig,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GPU_FLOW_CLASS_NAMES } from "gpuFlow/gpuFlowDomClasses";
import { gpuFlowViewportStore } from "gpuFlow/viewportStore";
import "testUtils/reactRefreshPreamble";

import {
  GpuProjectNodesSelectionOverlay,
  handleProjectNodeDrag,
  handleProjectNodeDragStart,
  handleProjectNodeDragStop,
  updateSelectedNodePositionsFromKeyboard,
} from "./nodeSelectionOverlay";

vi.mock("forks/dnd-kit/dndState", () => ({
  useDndMode: () => ({ isMovingFree: false, isSorting: false }),
}));

vi.mock("forks/dnd-kit/selectionDragHandle", () => ({
  setSelectionDragHandle: vi.fn(),
  setSelectionDragPrimaryId: vi.fn(),
}));

vi.mock("./projectGpuSurface", () => ({
  SELECTION_ARROW_KEY_DIFFS: {
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 },
  },
}));

describe("GpuProjectNodesSelectionOverlay movement adapters", () => {
  beforeEach(() => {
    resetProjectStores();
    useLocalStorage.setState({ snapToGrid: false });
    resetGpuViewportState();
    resetQueuedAnimationFrames();
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(
      (callback) => {
        const id = nextAnimationFrameId++;
        queuedAnimationFrames.push({ callback, canceled: false, id });
        return id;
      },
    );
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation((id) => {
      const frame = queuedAnimationFrames.find((item) => item.id === id);
      if (frame) {
        frame.canceled = true;
      }
    });
  });

  afterEach(() => {
    flushQueuedAnimationFrames();
    vi.restoreAllMocks();
    resetProjectStores();
    resetGpuViewportState();
    resetQueuedAnimationFrames();
    document.body.innerHTML = "";
  });

  it("keeps direct node drag live updates in node internals and commits z-order on stop", () => {
    loadProjectStateForSections([{ id: "section-a" }, { id: "section-b" }]);
    useNodeInternals.setState({
      x: new Map([
        [
          "section-a",
          {
            height: 40,
            id: "section-a",
            position: { x: 10, y: 20 },
            tempZIndex: 0,
            width: 80,
            zIndex: 0,
          },
        ],
        [
          "section-b",
          {
            height: 30,
            id: "section-b",
            position: { x: 100, y: 120 },
            tempZIndex: 1,
            width: 60,
            zIndex: 1,
          },
        ],
      ]),
    });
    setActiveSectionUIIds(["section-a"]);
    gpuFlowViewportStore.getState().setNodesSelectionBounds({
      height: 40,
      width: 80,
      x: 10,
      y: 20,
    });

    handleProjectNodeDragStart({
      active: true,
      delta: { x: 0, y: 0 },
      items: [
        {
          distance: { x: 0, y: 0 },
          height: 40,
          nodeId: "section-a",
          position: { x: 10, y: 20 },
          width: 80,
        },
      ],
      nodeId: "section-a",
      phase: "start",
    });

    expect(useMisc.getState().mouseDownDraggingSection).toBe(true);
    expect(useNodeInternals.getState().x.get("section-a")).toMatchObject({
      tempZIndex: 1000,
      zIndex: 0,
    });

    const dragChange = {
      active: true,
      delta: { x: 15, y: -5 },
      items: [
        {
          distance: { x: 0, y: 0 },
          height: 40,
          nodeId: "section-a",
          position: { x: 25, y: 15 },
          width: 80,
        },
      ],
      nodeId: "section-a",
      phase: "drag" as const,
    };
    handleProjectNodeDrag(dragChange);

    expect(useNodeInternals.getState().x.get("section-a")?.position).toEqual({
      x: 25,
      y: 15,
    });
    expect(gpuFlowViewportStore.getState().nodesSelectionBounds).toEqual({
      height: 40,
      width: 80,
      x: 25,
      y: 15,
    });

    handleProjectNodeDragStop({
      ...dragChange,
      active: false,
      phase: "stop",
    });

    expect(useMisc.getState().mouseDownDraggingSection).toBe(false);
    expect(useNodeInternals.getState().x.get("section-a")).toMatchObject({
      position: { x: 25, y: 15 },
      tempZIndex: 1,
      zIndex: 1,
    });
    expect(useNodeInternals.getState().x.get("section-b")).toMatchObject({
      tempZIndex: 0,
      zIndex: 0,
    });
  });

  it("moves selected nodes through the selection rect and commits z-order on pointer up", async () => {
    loadProjectStateForSections([
      { id: "section-a" },
      { id: "section-b" },
      { id: "section-c" },
    ]);
    loadNodeInternals([
      node("section-a", 10, 20, 80, 40, 0),
      node("section-b", 100, 120, 60, 30, 1),
      node("section-c", 300, 320, 90, 70, 2),
    ]);
    setActiveSectionUIIds(["section-a", "section-b"]);
    gpuFlowViewportStore.setState({
      height: 400,
      nodesSelectionBounds: { height: 130, width: 150, x: 10, y: 20 },
      transform: [0, 0, 1],
      width: 600,
    });
    const overlay = await renderSelectionOverlay();

    try {
      await act(async () => {
        dispatchPointerEvent(overlay.rect, "pointerdown", {
          button: 0,
          clientX: 15,
          clientY: 25,
          pointerId: 7,
        });
      });

      expect(overlay.setPointerCapture).toHaveBeenCalledWith(7);
      expect(useMisc.getState().mouseDownDraggingSection).toBe(true);
      expect(gpuFlowViewportStore.getState().nodeDragging).toBe(true);
      expect(gpuFlowViewportStore.getState().viewportInteractionActive).toBe(
        true,
      );
      expect(useNodeInternals.getState().x.get("section-a")).toMatchObject({
        tempZIndex: 1000,
        zIndex: 0,
      });
      expect(useNodeInternals.getState().x.get("section-b")).toMatchObject({
        tempZIndex: 1001,
        zIndex: 1,
      });

      await act(async () => {
        dispatchPointerEvent(overlay.rect, "pointermove", {
          button: 0,
          clientX: 35,
          clientY: 45,
          pointerId: 7,
        });
      });

      expect(useNodeInternals.getState().x.get("section-a")?.position).toEqual(
        { x: 30, y: 40 },
      );
      expect(useNodeInternals.getState().x.get("section-b")?.position).toEqual(
        { x: 120, y: 140 },
      );
      expect(gpuFlowViewportStore.getState().nodesSelectionBounds).toEqual({
        height: 130,
        width: 150,
        x: 30,
        y: 40,
      });

      await act(async () => {
        dispatchPointerEvent(overlay.rect, "pointerup", {
          button: 0,
          clientX: 35,
          clientY: 45,
          pointerId: 7,
        });
      });

      expect(overlay.releasePointerCapture).toHaveBeenCalledWith(7);
      expect(useMisc.getState().mouseDownDraggingSection).toBe(false);
      expect(gpuFlowViewportStore.getState().nodeDragging).toBe(false);
      expect(gpuFlowViewportStore.getState().viewportInteractionActive).toBe(
        false,
      );
      expect(useNodeInternals.getState().x.get("section-c")).toMatchObject({
        tempZIndex: 0,
        zIndex: 0,
      });
      expect(useNodeInternals.getState().x.get("section-a")).toMatchObject({
        position: { x: 30, y: 40 },
        tempZIndex: 1,
        zIndex: 1,
      });
      expect(useNodeInternals.getState().x.get("section-b")).toMatchObject({
        position: { x: 120, y: 140 },
        tempZIndex: 2,
        zIndex: 2,
      });
    } finally {
      await overlay.unmount();
    }
  });

  it("uses selection drag auto-pan frames to pan the viewport and keep selected nodes under the pointer", async () => {
    loadProjectStateForSections([{ id: "section-a" }, { id: "section-b" }]);
    loadNodeInternals([
      node("section-a", 10, 20, 80, 40, 0),
      node("section-b", 100, 120, 60, 30, 1),
    ]);
    setActiveSectionUIIds(["section-a", "section-b"]);
    gpuFlowViewportStore.setState({
      height: 400,
      nodesSelectionBounds: { height: 130, width: 150, x: 10, y: 20 },
      transform: [0, 0, 1],
      width: 600,
    });
    const overlay = await renderSelectionOverlay();

    try {
      await act(async () => {
        dispatchPointerEvent(overlay.rect, "pointerdown", {
          button: 0,
          clientX: 590,
          clientY: 390,
          pointerId: 11,
        });
      });

      expect(gpuFlowViewportStore.getState().transform).toEqual([0, 0, 1]);

      await act(async () => {
        runNextAnimationFrame();
      });

      expect(gpuFlowViewportStore.getState().transform).toEqual([
        -10,
        -10,
        1,
      ]);
      expect(useNodeInternals.getState().x.get("section-a")?.position).toEqual(
        { x: 20, y: 30 },
      );
      expect(useNodeInternals.getState().x.get("section-b")?.position).toEqual(
        { x: 110, y: 130 },
      );
      expect(gpuFlowViewportStore.getState().nodesSelectionBounds).toEqual({
        height: 130,
        width: 150,
        x: 20,
        y: 30,
      });

      await act(async () => {
        dispatchPointerEvent(overlay.rect, "pointerup", {
          button: 0,
          clientX: 590,
          clientY: 390,
          pointerId: 11,
        });
      });
    } finally {
      await overlay.unmount();
    }
  });

  it("keeps live selection-drag positions and clears interaction state on pointer cancel", async () => {
    loadProjectStateForSections([{ id: "section-a" }, { id: "section-b" }]);
    loadNodeInternals([
      node("section-a", 10, 20, 80, 40, 0),
      node("section-b", 100, 120, 60, 30, 1),
    ]);
    setActiveSectionUIIds(["section-a", "section-b"]);
    gpuFlowViewportStore.setState({
      height: 400,
      nodesSelectionBounds: { height: 130, width: 150, x: 10, y: 20 },
      transform: [0, 0, 1],
      width: 600,
    });
    const overlay = await renderSelectionOverlay();

    try {
      await act(async () => {
        dispatchPointerEvent(overlay.rect, "pointerdown", {
          button: 0,
          clientX: 20,
          clientY: 30,
          pointerId: 13,
        });
      });
      await act(async () => {
        dispatchPointerEvent(overlay.rect, "pointermove", {
          button: 0,
          clientX: 45,
          clientY: 65,
          pointerId: 13,
        });
      });
      await act(async () => {
        dispatchPointerEvent(overlay.rect, "pointercancel", {
          button: 0,
          clientX: 45,
          clientY: 65,
          pointerId: 13,
        });
      });

      expect(overlay.releasePointerCapture).toHaveBeenCalledWith(13);
      expect(useMisc.getState().mouseDownDraggingSection).toBe(false);
      expect(gpuFlowViewportStore.getState().nodeDragging).toBe(false);
      expect(gpuFlowViewportStore.getState().viewportInteractionActive).toBe(
        false,
      );
      expect(useNodeInternals.getState().x.get("section-a")).toMatchObject({
        position: { x: 35, y: 55 },
        tempZIndex: 0,
        zIndex: 0,
      });
      expect(useNodeInternals.getState().x.get("section-b")).toMatchObject({
        position: { x: 125, y: 155 },
        tempZIndex: 1,
        zIndex: 1,
      });
      expect(gpuFlowViewportStore.getState().nodesSelectionBounds).toEqual({
        height: 130,
        width: 150,
        x: 35,
        y: 55,
      });
    } finally {
      await overlay.unmount();
    }
  });

  it("refreshes selection bounds when keyboard nudge skips a locked selected node", () => {
    loadProjectStateForSections([
      { id: "section-a" },
      { id: "section-b", positionAndSizeLocked: true },
    ]);
    useNodeInternals.setState({
      x: new Map([
        [
          "section-a",
          {
            height: 40,
            id: "section-a",
            position: { x: 10, y: 20 },
            tempZIndex: 0,
            width: 80,
            zIndex: 0,
          },
        ],
        [
          "section-b",
          {
            height: 30,
            id: "section-b",
            position: { x: 100, y: 120 },
            tempZIndex: 1,
            width: 60,
            zIndex: 1,
          },
        ],
      ]),
    });
    setActiveSectionUIIds(["section-a", "section-b"]);
    gpuFlowViewportStore.getState().setNodesSelectionBounds({
      height: 130,
      width: 150,
      x: 10,
      y: 20,
    });

    updateSelectedNodePositionsFromKeyboard({
      isShiftPressed: false,
      x: 1,
      y: 0,
    });

    expect(useNodeInternals.getState().x.get("section-a")?.position).toEqual({
      x: 15,
      y: 20,
    });
    expect(useNodeInternals.getState().x.get("section-b")?.position).toEqual({
      x: 100,
      y: 120,
    });
    expect(gpuFlowViewportStore.getState().nodesSelectionBounds).toEqual({
      height: 130,
      width: 145,
      x: 15,
      y: 20,
    });
  });
});

type QueuedAnimationFrame = {
  readonly callback: FrameRequestCallback;
  canceled: boolean;
  readonly id: number;
};

let nextAnimationFrameId = 1;
let queuedAnimationFrames: QueuedAnimationFrame[] = [];

type MovementSectionInput = {
  readonly id: string;
  readonly positionAndSizeLocked?: boolean | undefined;
};

type MovementNodeInput = {
  readonly height: number;
  readonly id: string;
  readonly width: number;
  readonly x: number;
  readonly y: number;
  readonly zIndex: number;
};

function node(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  zIndex: number,
): MovementNodeInput {
  return { height, id, width, x, y, zIndex };
}

function loadNodeInternals(nodes: readonly MovementNodeInput[]) {
  useNodeInternals.setState({
    x: new Map(
      nodes.map((item) => [
        item.id,
        {
          height: item.height,
          id: item.id,
          position: { x: item.x, y: item.y },
          tempZIndex: item.zIndex,
          width: item.width,
          zIndex: item.zIndex,
        },
      ]),
    ),
  });
}

function loadProjectStateForSections(
  sections: readonly MovementSectionInput[],
) {
  const sectionVariantMap: Record<string, string> = {};
  const stateSections: SingleConfig["sections"] = {};
  const sectionImpls: SingleConfig["sectionImpls"] = {};
  const sectionVariants: SingleConfig["sectionVariants"] = {};
  const parentSectionMap: SingleConfig["parentSectionMap"] = {};
  const topLevelSections: SingleConfig["projectConfig"]["topLevelSections"] =
    {};

  for (const [index, section] of sections.entries()) {
    const variantId = `variant-${section.id}`;
    const implId = `impl-${section.id}`;
    sectionVariantMap[section.id] = variantId;
    parentSectionMap[section.id] = null;
    topLevelSections[section.id] = {
      h: 160,
      w: 200,
      x: index * 240,
      y: index * 120,
      zIndex: index,
    };
    stateSections[section.id] = createCore({ id: section.id });
    sectionVariants[variantId] = createVariant({
      id: variantId,
      impl: implId,
      name: variantId,
      nonPresetImpls: [implId],
    });
    sectionImpls[implId] = createCodeSectionImpl({
      id: implId,
      positionAndSizeLocked: section.positionAndSizeLocked ?? false,
    });
  }

  useProjectState.setState(
    createSingleConfig({
      parentSectionMap,
      projectConfig: createProjectConfig({
        id: NULL_PROJECT_CONFIG_ID,
        sectionVariantMap,
        topLevelSections,
      }),
      sectionImpls,
      sections: stateSections,
      sectionVariants,
    }),
  );
}

async function renderSelectionOverlay(snapToGrid = false) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(GpuProjectNodesSelectionOverlay, {
        snapToGrid,
      }),
    );
  });
  const rect = host.querySelector<HTMLDivElement>(
    `.${GPU_FLOW_CLASS_NAMES.nodesSelectionRect}`,
  );
  if (!rect) {
    throw new Error("Expected rendered GPU selection bounds rect.");
  }
  const setPointerCapture = vi.fn();
  const releasePointerCapture = vi.fn();
  rect.setPointerCapture = setPointerCapture;
  rect.releasePointerCapture = releasePointerCapture;
  return {
    host,
    rect,
    releasePointerCapture,
    root,
    setPointerCapture,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

function dispatchPointerEvent(
  target: Element,
  type: string,
  init: PointerEventInit,
) {
  target.dispatchEvent(createPointerEvent(type, init));
}

function createPointerEvent(
  type: string,
  init: PointerEventInit,
): PointerEvent {
  if (typeof PointerEvent === "function") {
    return new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      ...init,
    });
  }
  const event = new MouseEvent(type, {
    bubbles: true,
    button: init.button,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
  }) as PointerEvent;
  Object.defineProperties(event, {
    pointerId: { value: init.pointerId ?? 1 },
    pointerType: { value: init.pointerType ?? "mouse" },
  });
  return event;
}

function runNextAnimationFrame(): boolean {
  while (queuedAnimationFrames.length > 0) {
    const frame = queuedAnimationFrames.shift();
    if (!frame || frame.canceled) {
      continue;
    }
    frame.callback(0);
    return true;
  }
  return false;
}

function flushQueuedAnimationFrames() {
  for (let index = 0; index < 50 && runNextAnimationFrame(); index += 1) {
    // Continue until queued callbacks, including coalesced handle updates, run.
  }
}

function resetQueuedAnimationFrames() {
  nextAnimationFrameId = 1;
  queuedAnimationFrames = [];
}

function resetGpuViewportState() {
  gpuFlowViewportStore.setState({
    domNode: null,
    height: 0,
    nodeDragging: false,
    nodeResizing: false,
    nodesSelectionBounds: null,
    panScrolling: false,
    paneDragging: false,
    pointerPanning: false,
    transform: [0, 0, 1],
    userSelectionActive: false,
    userSelectionRect: null,
    viewportAnimating: false,
    viewportInteractionActive: false,
    wheelZooming: false,
    width: 0,
  });
}
