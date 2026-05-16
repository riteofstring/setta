// @vitest-environment jsdom

import { TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY } from "testUtils/gpuRetainedTextLikePolicy";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGpuRetainedRowContentScene,
  type GpuRetainedContentControlDescriptor,
} from "../retainedContentScene";
import type { GpuRetainedContentScrollOffsetMap } from "../retainedContentScroll";
import type { GpuContentSurface, GpuFlowScene } from "../scene";
import { createGpuFlowViewportRuntime } from "../viewportRuntime";
import { createGpuFlowViewportStore } from "../viewportStore";
import { attachGpuPanZoomController } from "./panZoom";
import { attachGpuRetainedContentScrollController } from "./retainedContentScroll";

const chromeReproMock = vi.hoisted(() => ({
  isChromeReproActive: vi.fn(() => false),
  nowChromeReproPerformanceMs: vi.fn(() => 0),
  postChromeReproEvent: vi.fn(),
  roundChromeReproMs: (value: number) => Math.round(value * 1000) / 1000,
}));

vi.mock("state/actions/chromeRepro", () => chromeReproMock);

describe("GPU retained content scroll controller", () => {
  afterEach(() => {
    document.body.replaceChildren();
    chromeReproMock.isChromeReproActive.mockReturnValue(false);
    chromeReproMock.nowChromeReproPerformanceMs.mockClear();
    chromeReproMock.postChromeReproEvent.mockClear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("routes wheel scrolling through retained content offsets", () => {
    const animationFrames = installAnimationFrameStub();
    const element = document.createElement("div");
    document.body.append(element);
    let scrollOffsets: GpuRetainedContentScrollOffsetMap = new Map();
    const requestFrame = vi.fn();
    const cleanup = attachGpuRetainedContentScrollController({
      element,
      getScene: () => retainedContentScene(),
      getScrollOffsets: () => scrollOffsets,
      onScrollOffsetsChange: (nextOffsets) => {
        scrollOffsets = nextOffsets;
      },
      requestFrame,
    });

    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 20,
      clientY: 20,
      deltaY: 36,
    });
    element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(scrollOffsets.size).toBe(0);
    animationFrames.flush();
    expect(scrollOffsets.get("dict-a:param-content:unpinned")).toEqual({
      x: 0,
      y: 36,
    });
    expect(requestFrame).toHaveBeenCalledWith("viewport");

    cleanup();
  });

  it("clamps negative horizontal wheel deltas before notifying scroll owners", () => {
    const animationFrames = installAnimationFrameStub();
    const element = document.createElement("div");
    document.body.append(element);
    let scrollOffsets: GpuRetainedContentScrollOffsetMap = new Map();
    const requestFrame = vi.fn();
    const cleanup = attachGpuRetainedContentScrollController({
      element,
      getScene: () => retainedContentScene(),
      getScrollOffsets: () => scrollOffsets,
      onScrollOffsetsChange: (nextOffsets) => {
        scrollOffsets = nextOffsets;
      },
      requestFrame,
    });

    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 20,
      clientY: 20,
      deltaX: -1,
      deltaY: 36,
    });
    element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    animationFrames.flush();
    expect(scrollOffsets.get("dict-a:param-content:unpinned")).toEqual({
      x: 0,
      y: 36,
    });
    expect(requestFrame).toHaveBeenCalledWith("viewport");

    cleanup();
  });

  it("coalesces retained wheel changes into one animation-frame scroll flush", () => {
    const animationFrames = installAnimationFrameStub();
    const element = document.createElement("div");
    document.body.append(element);
    let scrollOffsets: GpuRetainedContentScrollOffsetMap = new Map();
    const onScrollOffsetsChange = vi.fn(
      (nextOffsets: GpuRetainedContentScrollOffsetMap) => {
        scrollOffsets = nextOffsets;
      },
    );
    const requestFrame = vi.fn();
    const cleanup = attachGpuRetainedContentScrollController({
      element,
      getScene: () => retainedContentScene(),
      getScrollOffsets: () => scrollOffsets,
      onScrollOffsetsChange,
      requestFrame,
    });

    element.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
        deltaY: 10,
      }),
    );
    element.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
        deltaY: 15,
      }),
    );

    expect(onScrollOffsetsChange).not.toHaveBeenCalled();
    expect(requestFrame).not.toHaveBeenCalled();
    animationFrames.flush();

    expect(onScrollOffsetsChange).toHaveBeenCalledTimes(1);
    expect(scrollOffsets.get("dict-a:param-content:unpinned")).toEqual({
      x: 0,
      y: 25,
    });
    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(requestFrame).toHaveBeenCalledWith("viewport");

    cleanup();
  });

  it("requests a transform frame before idle retained texture work", () => {
    vi.useFakeTimers();
    const animationFrames = installAnimationFrameStub();
    const element = document.createElement("div");
    document.body.append(element);
    let scrollOffsets: GpuRetainedContentScrollOffsetMap = new Map();
    const requestFrame = vi.fn();
    const cleanup = attachGpuRetainedContentScrollController({
      element,
      getScene: () => retainedContentScene(),
      getScrollOffsets: () => scrollOffsets,
      onScrollOffsetsChange: (nextOffsets) => {
        scrollOffsets = nextOffsets;
      },
      requestFrame,
    });

    element.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
        deltaY: 36,
      }),
    );
    animationFrames.flush();

    expect(requestFrame).toHaveBeenCalledWith("viewport");
    expect(requestFrame).not.toHaveBeenCalledWith("texture-upload");
    vi.advanceTimersByTime(119);
    expect(requestFrame).not.toHaveBeenCalledWith("texture-upload");
    vi.advanceTimersByTime(1);
    expect(requestFrame).toHaveBeenCalledWith("texture-upload");

    cleanup();
  });

  it("defers idle retained texture work while viewport interaction is active", () => {
    vi.useFakeTimers();
    const animationFrames = installAnimationFrameStub();
    const element = document.createElement("div");
    document.body.append(element);
    const store = createGpuFlowViewportStore();
    let scrollOffsets: GpuRetainedContentScrollOffsetMap = new Map();
    const requestFrame = vi.fn();
    const cleanup = attachGpuRetainedContentScrollController({
      element,
      getScene: () => retainedContentScene(),
      getScrollOffsets: () => scrollOffsets,
      onScrollOffsetsChange: (nextOffsets) => {
        scrollOffsets = nextOffsets;
      },
      requestFrame,
      store,
    });

    element.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
        deltaY: 36,
      }),
    );
    animationFrames.flush();
    store.getState().setViewportInteractionFlags({ panScrolling: true });

    vi.advanceTimersByTime(120);
    expect(requestFrame).not.toHaveBeenCalledWith("texture-upload");

    store.getState().setViewportInteractionFlags({ panScrolling: false });
    vi.advanceTimersByTime(119);
    expect(requestFrame).not.toHaveBeenCalledWith("texture-upload");
    vi.advanceTimersByTime(1);
    expect(requestFrame).toHaveBeenCalledWith("texture-upload");

    cleanup();
  });

  it("skips retained wheel handling while viewport pan-scroll is active", () => {
    const element = document.createElement("div");
    document.body.append(element);
    let scrollOffsets: GpuRetainedContentScrollOffsetMap = new Map();
    const onScrollOffsetsChange = vi.fn(
      (nextOffsets: GpuRetainedContentScrollOffsetMap) => {
        scrollOffsets = nextOffsets;
      },
    );
    const requestFrame = vi.fn();
    const store = createGpuFlowViewportStore();
    store.getState().setViewportInteractionFlags({ panScrolling: true });
    const cleanup = attachGpuRetainedContentScrollController({
      element,
      getScene: () => retainedContentScene(),
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
      deltaY: 36,
    });
    element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(onScrollOffsetsChange).not.toHaveBeenCalled();
    expect(requestFrame).not.toHaveBeenCalled();
    expect(scrollOffsets.size).toBe(0);

    cleanup();
  });

  it.each([
    "panScrolling",
    "pointerPanning",
    "paneDragging",
    "wheelZooming",
  ] as const)(
    "skips retained wheel handling while viewport %s is active",
    (flag) => {
      const element = document.createElement("div");
      document.body.append(element);
      let scrollOffsets: GpuRetainedContentScrollOffsetMap = new Map();
      const onScrollOffsetsChange = vi.fn(
        (nextOffsets: GpuRetainedContentScrollOffsetMap) => {
          scrollOffsets = nextOffsets;
        },
      );
      const store = createGpuFlowViewportStore();
      store.getState().setViewportInteractionFlags(viewportWheelFlags[flag]);
      const cleanup = attachGpuRetainedContentScrollController({
        element,
        getScene: () => retainedContentScene(),
        getScrollOffsets: () => scrollOffsets,
        onScrollOffsetsChange,
        store,
      });

      const event = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
        deltaY: 36,
      });
      element.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(onScrollOffsetsChange).not.toHaveBeenCalled();
      expect(scrollOffsets.size).toBe(0);

      cleanup();
    },
  );

  it("consumes retained boundary wheel events without flushing scroll updates", () => {
    const animationFrames = installAnimationFrameStub();
    const element = document.createElement("div");
    document.body.append(element);
    const scrollOffsets: GpuRetainedContentScrollOffsetMap = new Map([
      ["dict-a:param-content:unpinned", { x: 0, y: 200 }],
    ]);
    const onScrollOffsetsChange = vi.fn();
    const requestFrame = vi.fn();
    const bubbleListener = vi.fn();
    element.addEventListener("wheel", bubbleListener);
    const cleanup = attachGpuRetainedContentScrollController({
      element,
      getScene: () => retainedContentScene(),
      getScrollOffsets: () => scrollOffsets,
      onScrollOffsetsChange,
      requestFrame,
    });

    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 20,
      clientY: 20,
      deltaY: 36,
    });
    element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(bubbleListener).not.toHaveBeenCalled();
    animationFrames.flush();
    expect(onScrollOffsetsChange).not.toHaveBeenCalled();
    expect(requestFrame).not.toHaveBeenCalled();

    cleanup();
  });

  it("consumes retained shift-wheel boundary events without viewport pan fallthrough", () => {
    vi.useFakeTimers();
    const animationFrames = installAnimationFrameStub();
    const element = document.createElement("div");
    document.body.append(element);
    const store = createGpuFlowViewportStore({
      transform: [0, 0, 1],
    });
    const scrollOffsets: GpuRetainedContentScrollOffsetMap = new Map([
      ["dict-a:param-content:unpinned", { x: 100, y: 0 }],
    ]);
    const onScrollOffsetsChange = vi.fn();
    const viewportRuntime = createGpuFlowViewportRuntime({ store });
    const cleanupScroll = attachGpuRetainedContentScrollController({
      element,
      getScene: () => retainedContentScene({ contentWidth: 260 }),
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
      deltaY: 36,
      shiftKey: true,
    });
    element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(store.getState().transform).toEqual([0, 0, 1]);
    expect(store.getState().panScrolling).toBe(false);
    animationFrames.flush();
    expect(onScrollOffsetsChange).not.toHaveBeenCalled();

    cleanupPan();
    viewportRuntime.destroy();
    cleanupScroll();
  });

  it("lets an active viewport wheel pan burst keep wheel events over retained content", () => {
    vi.useFakeTimers();
    const animationFrames = installAnimationFrameStub();
    const element = document.createElement("div");
    document.body.append(element);
    const store = createGpuFlowViewportStore({
      transform: [0, 0, 1],
    });
    store.getState().setViewportInteractionFlags({ panScrolling: true });
    const viewportRuntime = createGpuFlowViewportRuntime({
      requestFrame: vi.fn(),
      store,
    });
    let scrollOffsets: GpuRetainedContentScrollOffsetMap = new Map();
    const onScrollOffsetsChange = vi.fn(
      (nextOffsets: GpuRetainedContentScrollOffsetMap) => {
        scrollOffsets = nextOffsets;
      },
    );
    const cleanupScroll = attachGpuRetainedContentScrollController({
      element,
      getScene: () => retainedContentScene(),
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
      deltaY: 36,
    });
    element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    viewportRuntime.runFrame(16);
    expect(store.getState().transform).toEqual([0, -18, 1]);
    expect(store.getState().panScrolling).toBe(true);
    expect(onScrollOffsetsChange).not.toHaveBeenCalled();
    animationFrames.flush();
    expect(scrollOffsets.size).toBe(0);
    expect(onScrollOffsetsChange).not.toHaveBeenCalled();

    cleanupPan();
    viewportRuntime.destroy();
    cleanupScroll();
  });

  it.each(preservedWheelTargetCases)(
    "preserves wheel events from %s",
    (_name, createTarget) => {
      const element = document.createElement("div");
      const { root, target } = createTarget();
      element.append(root);
      document.body.append(element);
      let scrollOffsets: GpuRetainedContentScrollOffsetMap = new Map();
      const cleanup = attachGpuRetainedContentScrollController({
        element,
        getScene: () => retainedContentScene(),
        getScrollOffsets: () => scrollOffsets,
        onScrollOffsetsChange: (nextOffsets) => {
          scrollOffsets = nextOffsets;
        },
      });

      const event = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
        deltaY: 36,
      });
      target.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(scrollOffsets.size).toBe(0);

      cleanup();
    },
  );

  it("hands off CodeMirror native wheel events to retained scrolling when the editor cannot scroll", () => {
    const animationFrames = installAnimationFrameStub();
    const element = document.createElement("div");
    const root = document.createElement("div");
    root.setAttribute("data-gpu-flow-retained-content-native", "true");
    const editor = document.createElement("div");
    editor.className = "cm-editor";
    const scroller = document.createElement("div");
    scroller.className = "cm-scroller";
    const content = document.createElement("div");
    content.className = "cm-content";
    scroller.append(content);
    editor.append(scroller);
    root.append(editor);
    element.append(root);
    document.body.append(element);
    let scrollOffsets: GpuRetainedContentScrollOffsetMap = new Map();
    const cleanup = attachGpuRetainedContentScrollController({
      element,
      getScene: () => retainedContentScene(),
      getScrollOffsets: () => scrollOffsets,
      onScrollOffsetsChange: (nextOffsets) => {
        scrollOffsets = nextOffsets;
      },
    });

    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 20,
      clientY: 20,
      deltaY: 36,
    });
    content.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    animationFrames.flush();
    expect(scrollOffsets.get("dict-a:param-content:unpinned")).toEqual({
      x: 0,
      y: 36,
    });

    cleanup();
  });

  it("preserves CodeMirror native wheel events while the editor can scroll", () => {
    const element = document.createElement("div");
    const root = document.createElement("div");
    root.setAttribute("data-gpu-flow-retained-content-native", "true");
    const editor = document.createElement("div");
    editor.className = "cm-editor";
    const scroller = document.createElement("div");
    scroller.className = "cm-scroller";
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 300 },
      scrollTop: { configurable: true, value: 40 },
    });
    const content = document.createElement("div");
    content.className = "cm-content";
    scroller.append(content);
    editor.append(scroller);
    root.append(editor);
    element.append(root);
    document.body.append(element);
    let scrollOffsets: GpuRetainedContentScrollOffsetMap = new Map();
    const cleanup = attachGpuRetainedContentScrollController({
      element,
      getScene: () => retainedContentScene(),
      getScrollOffsets: () => scrollOffsets,
      onScrollOffsetsChange: (nextOffsets) => {
        scrollOffsets = nextOffsets;
      },
    });

    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 20,
      clientY: 20,
      deltaY: 36,
    });
    content.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(scrollOffsets.size).toBe(0);

    cleanup();
  });

  it("logs CodeMirror wheel handoff decisions for Chrome repro recordings", () => {
    chromeReproMock.isChromeReproActive.mockReturnValue(true);
    const animationFrames = installAnimationFrameStub();
    const element = document.createElement("div");
    const root = document.createElement("div");
    root.setAttribute("data-gpu-flow-retained-content-native", "true");
    const editor = document.createElement("div");
    editor.className = "cm-editor";
    editor.setAttribute("data-gpu-flow-control", "control-a");
    const scroller = document.createElement("div");
    scroller.className = "cm-scroller";
    const content = document.createElement("div");
    content.className = "cm-content";
    scroller.append(content);
    editor.append(scroller);
    root.append(editor);
    element.append(root);
    document.body.append(element);
    let scrollOffsets: GpuRetainedContentScrollOffsetMap = new Map();
    const cleanup = attachGpuRetainedContentScrollController({
      element,
      getScene: () => retainedContentScene(),
      getScrollOffsets: () => scrollOffsets,
      onScrollOffsetsChange: (nextOffsets) => {
        scrollOffsets = nextOffsets;
      },
    });

    content.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
        deltaY: 36,
      }),
    );

    animationFrames.flush();
    expect(chromeReproMock.postChromeReproEvent).toHaveBeenCalledWith(
      "gpu-flow-retained-active-editor-wheel-ownership",
      expect.objectContaining({
        activeControlId: "control-a",
        decision: "retained-section-handoff",
        deltaY: 36,
        nativeTargetKind: '[data-gpu-flow-retained-content-native="true"]',
      }),
    );

    cleanup();
  });

  it("logs CodeMirror wheel consume decisions for Chrome repro recordings", () => {
    chromeReproMock.isChromeReproActive.mockReturnValue(true);
    const element = document.createElement("div");
    const root = document.createElement("div");
    root.setAttribute("data-gpu-flow-retained-content-native", "true");
    const editor = document.createElement("div");
    editor.className = "cm-editor";
    editor.setAttribute("data-gpu-flow-control", "control-a");
    const scroller = document.createElement("div");
    scroller.className = "cm-scroller";
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 300 },
      scrollTop: { configurable: true, value: 40 },
    });
    const content = document.createElement("div");
    content.className = "cm-content";
    scroller.append(content);
    editor.append(scroller);
    root.append(editor);
    element.append(root);
    document.body.append(element);
    let scrollOffsets: GpuRetainedContentScrollOffsetMap = new Map();
    const cleanup = attachGpuRetainedContentScrollController({
      element,
      getScene: () => retainedContentScene(),
      getScrollOffsets: () => scrollOffsets,
      onScrollOffsetsChange: (nextOffsets) => {
        scrollOffsets = nextOffsets;
      },
    });

    content.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
        deltaY: 36,
      }),
    );

    expect(chromeReproMock.postChromeReproEvent).toHaveBeenCalledWith(
      "gpu-flow-retained-active-editor-wheel-ownership",
      expect.objectContaining({
        activeControlId: "control-a",
        decision: "editor-consume",
        editorScroll: expect.objectContaining({
          clientHeight: 100,
          scrollHeight: 300,
          scrollTop: 40,
        }),
      }),
    );
    expect(scrollOffsets.size).toBe(0);

    cleanup();
  });

  it("does not preserve plain GpuFlow portal buttons as native wheel targets", () => {
    const animationFrames = installAnimationFrameStub();
    const element = document.createElement("div");
    const { root, target } = createMarkedWheelTarget(
      "data-gpu-flow-portal-root",
      "button",
    );
    element.append(root);
    document.body.append(element);
    let scrollOffsets: GpuRetainedContentScrollOffsetMap = new Map();
    const cleanup = attachGpuRetainedContentScrollController({
      element,
      getScene: () => retainedContentScene(),
      getScrollOffsets: () => scrollOffsets,
      onScrollOffsetsChange: (nextOffsets) => {
        scrollOffsets = nextOffsets;
      },
    });

    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 20,
      clientY: 20,
      deltaY: 36,
    });
    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    animationFrames.flush();
    expect(scrollOffsets.get("dict-a:param-content:unpinned")).toEqual({
      x: 0,
      y: 36,
    });

    cleanup();
  });

  it("does not preserve generic source-surface interactive wheel targets", () => {
    const animationFrames = installAnimationFrameStub();
    const element = document.createElement("div");
    const { root, target } = createMarkedWheelTarget(
      "data-gpu-flow-interactive",
      "button",
    );
    element.append(root);
    document.body.append(element);
    let scrollOffsets: GpuRetainedContentScrollOffsetMap = new Map();
    const cleanup = attachGpuRetainedContentScrollController({
      element,
      getScene: () => retainedContentScene(),
      getScrollOffsets: () => scrollOffsets,
      onScrollOffsetsChange: (nextOffsets) => {
        scrollOffsets = nextOffsets;
      },
    });

    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 20,
      clientY: 20,
      deltaY: 36,
    });
    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    animationFrames.flush();
    expect(scrollOffsets.get("dict-a:param-content:unpinned")).toEqual({
      x: 0,
      y: 36,
    });

    cleanup();
  });
});

type PreservedWheelTargetFixture = {
  readonly root: HTMLElement;
  readonly target: HTMLElement;
};

const preservedWheelTargetCases: readonly [
  string,
  () => PreservedWheelTargetFixture,
][] = [
  [
    "native input targets inside explicit DOM island wrappers",
    () => createMarkedWheelTarget("data-gpu-flow-dom-island", "input"),
  ],
  [
    "retained native portal roots",
    () =>
      createMarkedWheelTarget(
        "data-gpu-flow-retained-content-native",
        "button",
      ),
  ],
];

const viewportWheelFlags = {
  panScrolling: { panScrolling: true },
  paneDragging: { paneDragging: true },
  pointerPanning: { pointerPanning: true },
  wheelZooming: { wheelZooming: true },
} as const;

function createMarkedWheelTarget(
  attribute: string,
  tagName: "button" | "input" | "span" = "span",
): PreservedWheelTargetFixture {
  const root = document.createElement("div");
  root.setAttribute(attribute, "true");
  const target = document.createElement(tagName);
  root.append(target);
  return { root, target };
}

function retainedContentScene({
  contentWidth,
}: {
  readonly contentWidth?: number | undefined;
} = {}): GpuFlowScene {
  return {
    contentSurfaces: [retainedSurface({ contentWidth })],
    domIslands: [],
    edges: [],
    revision: 1,
    sections: [],
  };
}

function retainedSurface({
  contentWidth,
}: {
  readonly contentWidth?: number | undefined;
} = {}): GpuContentSurface {
  const rect = { height: 80, width: 160, x: 0, y: 0 };
  const retainedScene = createGpuRetainedRowContentScene({
    id: "dict-a:param-content:unpinned",
    ownerSectionId: "dict-a",
    rowHeight: 28,
    rows: Array.from({ length: 10 }, (_, index) => ({
      control: textLikeControlDescriptor(`Value ${index}`),
      controlKind: "text-like",
      depth: 0,
      id: `param-${index}`,
      label: `Param ${index}`,
    })),
    scrollOffset: { x: 0, y: 0 },
    viewportRect: { height: rect.height, width: rect.width, x: 0, y: 0 },
  });
  return {
    clipRect: rect,
    id: "dict-a:param-content:unpinned",
    ownerSectionId: "dict-a",
    rect,
    renderer: {
      kind: "canvas-content",
      surfaceId: "dict-a:param-content:unpinned",
    },
    retainedScene:
      contentWidth === undefined
        ? retainedScene
        : {
            ...retainedScene,
            contentRect: {
              ...retainedScene.contentRect,
              width: contentWidth,
            },
          },
    zIndex: 1,
  };
}

function textLikeControlDescriptor(
  displayValue: string,
): GpuRetainedContentControlDescriptor {
  return {
    defaultDisplayValue: "",
    displayValue,
    editorKind: "text",
    kind: "text-like",
    policy: TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY,
    rendererFamily: "text-like",
    commitPolicy: "native-island",
  };
}

function installAnimationFrameStub() {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = nextId;
    nextId += 1;
    callbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    callbacks.delete(id);
  });
  return {
    flush() {
      const pending = [...callbacks.entries()];
      callbacks.clear();
      for (const [id, callback] of pending) {
        callback(id);
      }
    },
  };
}
