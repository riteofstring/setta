// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  GpuFlowScene,
  GpuSectionSceneLayoutMode,
  GpuSectionSceneNode,
} from "../scene";
import { resolveGpuFlowSceneLayout } from "../sceneLayout";
import type { GpuSectionSceneScrollOffsetMap } from "../sceneScroll";
import type { GpuPoint, GpuRect } from "../viewportMath";
import { createGpuFlowViewportRuntime } from "../viewportRuntime";
import { createGpuFlowViewportStore } from "../viewportStore";
import { attachGpuPanZoomController } from "./panZoom";
import { attachGpuSectionSceneScrollController } from "./sceneScroll";

describe("GPU section scene scroll controller", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it("routes page-key scrolling through renderer-owned scene offsets", () => {
    const element = document.createElement("div");
    document.body.append(element);
    const scene = scrollableScene();
    let scrollOffsets: GpuSectionSceneScrollOffsetMap = new Map();
    const requestFrame = vi.fn();
    const cleanup = attachGpuSectionSceneScrollController({
      element,
      getKeyboardScrollParentSectionId: () => "parent",
      getScene: () => scene,
      getScrollOffsets: () => scrollOffsets,
      onScrollOffsetsChange: (nextOffsets) => {
        scrollOffsets = nextOffsets;
      },
      requestFrame,
    });

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "PageDown",
    });
    element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(scrollOffsets.get("parent")).toEqual({
      x: 0,
      y: 66,
    });
    expect(requestFrame).toHaveBeenCalledWith("viewport");

    cleanup();
  });

  it("preserves native keyboard targets inside active DOM islands", () => {
    const element = document.createElement("div");
    const input = document.createElement("input");
    element.append(input);
    document.body.append(element);
    let scrollOffsets: GpuSectionSceneScrollOffsetMap = new Map();
    const cleanup = attachGpuSectionSceneScrollController({
      element,
      getKeyboardScrollParentSectionId: () => "parent",
      getScene: () => scrollableScene(),
      getScrollOffsets: () => scrollOffsets,
      onScrollOffsetsChange: (nextOffsets) => {
        scrollOffsets = nextOffsets;
      },
    });

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "PageDown",
    });
    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(scrollOffsets.size).toBe(0);

    cleanup();
  });

  it("skips section wheel handling while viewport wheel pan owns the burst", () => {
    const element = document.createElement("div");
    document.body.append(element);
    const scene = scrollableScene();
    let scrollOffsets: GpuSectionSceneScrollOffsetMap = new Map();
    const onScrollOffsetsChange = vi.fn(
      (nextOffsets: GpuSectionSceneScrollOffsetMap) => {
        scrollOffsets = nextOffsets;
      },
    );
    const requestFrame = vi.fn();
    const store = createGpuFlowViewportStore();
    store.getState().setViewportInteractionFlags({ panScrolling: true });
    const cleanup = attachGpuSectionSceneScrollController({
      element,
      getScene: () => scene,
      getScrollOffsets: () => scrollOffsets,
      onScrollOffsetsChange,
      requestFrame,
      store,
    });

    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 20,
      clientY: 20,
      deltaY: 30,
    });
    element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(onScrollOffsetsChange).not.toHaveBeenCalled();
    expect(requestFrame).not.toHaveBeenCalled();
    expect(scrollOffsets.size).toBe(0);

    cleanup();
  });

  it.each(["pointerPanning", "paneDragging", "wheelZooming"] as const)(
    "skips section wheel handling while viewport %s is active",
    (flag) => {
      const element = document.createElement("div");
      document.body.append(element);
      const scene = scrollableScene();
      let scrollOffsets: GpuSectionSceneScrollOffsetMap = new Map();
      const onScrollOffsetsChange = vi.fn(
        (nextOffsets: GpuSectionSceneScrollOffsetMap) => {
          scrollOffsets = nextOffsets;
        },
      );
      const store = createGpuFlowViewportStore();
      store.getState().setViewportInteractionFlags(viewportWheelFlags[flag]);
      const cleanup = attachGpuSectionSceneScrollController({
        element,
        getScene: () => scene,
        getScrollOffsets: () => scrollOffsets,
        onScrollOffsetsChange,
        store,
      });

      const event = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
        deltaY: 30,
      });
      element.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(onScrollOffsetsChange).not.toHaveBeenCalled();
      expect(scrollOffsets.size).toBe(0);

      cleanup();
    },
  );

  it("consumes section boundary wheel events without scroll updates", () => {
    const element = document.createElement("div");
    document.body.append(element);
    const scene = scrollableScene();
    const scrollOffsets: GpuSectionSceneScrollOffsetMap = new Map([
      ["parent", { x: 0, y: 66 }],
    ]);
    const onScrollOffsetsChange = vi.fn();
    const requestFrame = vi.fn();
    const bubbleListener = vi.fn();
    element.addEventListener("wheel", bubbleListener);
    const cleanup = attachGpuSectionSceneScrollController({
      element,
      getScene: () => scene,
      getScrollOffsets: () => scrollOffsets,
      onScrollOffsetsChange,
      requestFrame,
    });

    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 20,
      clientY: 20,
      deltaY: 30,
    });
    element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(bubbleListener).not.toHaveBeenCalled();
    expect(onScrollOffsetsChange).not.toHaveBeenCalled();
    expect(requestFrame).not.toHaveBeenCalled();

    cleanup();
  });

  it("keeps section boundary wheel events from falling through to viewport pan", () => {
    vi.useFakeTimers();
    const element = document.createElement("div");
    document.body.append(element);
    const scene = scrollableScene();
    const store = createGpuFlowViewportStore({
      transform: [0, 0, 1],
    });
    const scrollOffsets: GpuSectionSceneScrollOffsetMap = new Map([
      ["parent", { x: 0, y: 66 }],
    ]);
    const onScrollOffsetsChange = vi.fn();
    const viewportRuntime = createGpuFlowViewportRuntime({ store });
    const cleanupScroll = attachGpuSectionSceneScrollController({
      element,
      getScene: () => scene,
      getScrollOffsets: () => scrollOffsets,
      onScrollOffsetsChange,
      store,
    });
    const cleanupPan = attachGpuPanZoomController({
      element,
      isMacOS: false,
      panOnScroll: true,
      requestFrame: vi.fn(),
      store,
      viewportRuntime,
    });

    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 20,
      clientY: 20,
      deltaY: 30,
    });
    element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(store.getState().transform).toEqual([0, 0, 1]);
    expect(store.getState().panScrolling).toBe(false);
    expect(onScrollOffsetsChange).not.toHaveBeenCalled();

    cleanupPan();
    viewportRuntime.destroy();
    cleanupScroll();
  });

  it("lets viewport wheel pan continue over sections during an active burst", () => {
    vi.useFakeTimers();
    const element = document.createElement("div");
    document.body.append(element);
    const scene = scrollableScene();
    const store = createGpuFlowViewportStore({
      transform: [0, 0, 1],
    });
    store.getState().setViewportInteractionFlags({ panScrolling: true });
    const viewportRuntime = createGpuFlowViewportRuntime({
      requestFrame: vi.fn(),
      store,
    });
    let scrollOffsets: GpuSectionSceneScrollOffsetMap = new Map();
    const onScrollOffsetsChange = vi.fn(
      (nextOffsets: GpuSectionSceneScrollOffsetMap) => {
        scrollOffsets = nextOffsets;
      },
    );
    const cleanupScroll = attachGpuSectionSceneScrollController({
      element,
      getScene: () => scene,
      getScrollOffsets: () => scrollOffsets,
      onScrollOffsetsChange,
      store,
    });
    const cleanupPan = attachGpuPanZoomController({
      element,
      isMacOS: false,
      panOnScroll: true,
      requestFrame: vi.fn(),
      store,
      viewportRuntime,
    });

    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 20,
      clientY: 20,
      deltaY: 30,
    });
    element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    viewportRuntime.runFrame(16);
    expect(store.getState().transform).toEqual([0, -15, 1]);
    expect(scrollOffsets.size).toBe(0);
    expect(onScrollOffsetsChange).not.toHaveBeenCalled();

    cleanupPan();
    viewportRuntime.destroy();
    cleanupScroll();
  });
});

const viewportWheelFlags = {
  paneDragging: { paneDragging: true },
  pointerPanning: { pointerPanning: true },
  wheelZooming: { wheelZooming: true },
} as const;

function scrollableScene(): GpuFlowScene {
  return resolveGpuFlowSceneLayout(
    sceneWithSections([
      sectionNode({
        childIds: ["child-a", "child-b", "child-c"],
        childLayoutGap: { x: 0, y: 8 },
        id: "parent",
        layoutMode: "vertical",
        worldRect: rect(0, 0, 100, 100),
      }),
      sectionNode({
        id: "child-a",
        localRect: rect(0, 0, 80, 50),
        parentId: "parent",
      }),
      sectionNode({
        id: "child-b",
        localRect: rect(0, 0, 80, 50),
        parentId: "parent",
      }),
      sectionNode({
        id: "child-c",
        localRect: rect(0, 0, 80, 50),
        parentId: "parent",
      }),
    ]),
  );
}

function sceneWithSections(
  sections: readonly GpuSectionSceneNode[],
): GpuFlowScene {
  return {
    contentSurfaces: [],
    domIslands: [],
    edges: [],
    revision: 1,
    sections,
  };
}

function sectionNode({
  childIds = [],
  childLayoutGap = { x: 0, y: 0 },
  id,
  layoutMode = "none",
  localRect,
  parentId = null,
  scrollOffset = { x: 0, y: 0 },
  worldRect = rect(0, 0, 100, 100),
}: {
  readonly childIds?: readonly string[] | undefined;
  readonly childLayoutGap?: GpuPoint | undefined;
  readonly id: string;
  readonly layoutMode?: GpuSectionSceneLayoutMode | undefined;
  readonly localRect?: GpuRect | undefined;
  readonly parentId?: string | null | undefined;
  readonly scrollOffset?: GpuPoint | undefined;
  readonly worldRect?: GpuRect | undefined;
}): GpuSectionSceneNode {
  return {
    bodyRect: worldRect,
    childLayout: { gap: childLayoutGap },
    childSectionIds: childIds,
    childViewportRect: childIds.length > 0 ? worldRect : null,
    chromeRect: worldRect,
    clipRect: worldRect,
    contentRenderer: { kind: "dom-section", surfaceId: id },
    dirty: [],
    height: worldRect.height,
    interactionLayer: "content",
    layoutMode,
    localRect: localRect ?? worldRect,
    nodeId: id,
    parentSectionId: parentId,
    portAnchors: [],
    resizePolicy: {
      aspectRatio: false,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      directions: ["right", "bottom", "bottomRight"],
      locked: false,
      maxHeight: 100_000,
      maxWidth: 100_000,
      minHeight: 0,
      minWidth: 0,
    },
    scrollOffset,
    sectionId: id,
    width: worldRect.width,
    worldRect,
    x: worldRect.x,
    y: worldRect.y,
    zIndex: 0,
  };
}

function rect(x: number, y: number, width: number, height: number): GpuRect {
  return { height, width, x, y };
}
