/* @vitest-environment jsdom */

import { act, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, describe, expect, it, vi } from "vitest";
import { markHtmlSurfaceFramePaintDirty } from "../htmlSurfaces/frame";
import {
  createGpuRetainedRowContentScene,
  type GpuRetainedContentControlDescriptor,
} from "../retainedContentScene";
import { createGpuRetainedContentSwitchAnimationStore } from "../retainedContentSwitchAnimation";
import type { GpuContentSurface, GpuFlowScene } from "../scene";
import { createGpuFlowViewportStore } from "../viewportStore";
import { useGpuFlowRetainedContentControllers } from "./retainedContentControllers";

let root: Root | null = null;

describe("GpuFlow retained content controllers", () => {
  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    document.body.replaceChildren();
  });

  it("keeps click activation live when pointerdown rerenders retained interaction options", () => {
    const onHitClick = vi.fn();
    let host: HTMLDivElement | null = null;

    act(() => {
      root = createRoot(
        document.body.appendChild(document.createElement("div")),
      );
      root.render(
        <RetainedContentInteractionHarness
          onHostChange={(element) => {
            host = element;
          }}
          onHitClick={onHitClick}
        />,
      );
    });

    if (!host) {
      throw new Error("Expected retained content interaction host to mount.");
    }

    const pointerDown = createPointerEvent("pointerdown", {
      clientX: 140,
      clientY: 14,
      pointerId: 1,
    });
    const pointerUp = createPointerEvent("pointerup", {
      clientX: 140,
      clientY: 14,
      pointerId: 1,
    });
    const click = createMouseEvent("click", {
      clientX: 140,
      clientY: 14,
    });

    act(() => {
      host?.dispatchEvent(pointerDown);
    });
    act(() => {
      host?.dispatchEvent(pointerUp);
    });
    act(() => {
      host?.dispatchEvent(click);
    });

    expect(onHitClick).toHaveBeenCalledWith(
      expect.objectContaining({
        hit: expect.objectContaining({
          id: "control:param-0",
          kind: "control",
          ownerRowId: "param-0",
        }),
        ownerSectionId: "dict-a",
        surfaceId: "dict-a:param-content:unpinned",
      }),
    );
    expect(click.defaultPrevented).toBe(true);
  });

  it("keeps unrelated retained surfaces clean when one section scrolls", () => {
    const animationFrames = installAnimationFrameStub();
    const dirtySurfaceIds: string[] = [];
    let host: HTMLDivElement | null = null;

    act(() => {
      root = createRoot(
        document.body.appendChild(document.createElement("div")),
      );
      root.render(
        <RetainedContentScrollHarness
          onDirtySurface={(surfaceId) => {
            dirtySurfaceIds.push(surfaceId);
          }}
          onHostChange={(element) => {
            host = element;
          }}
        />,
      );
    });

    if (!host) {
      throw new Error("Expected retained content scroll host to mount.");
    }

    const wheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 20,
      clientY: 20,
      deltaY: 36,
    });

    act(() => {
      host?.dispatchEvent(wheel);
    });
    act(() => {
      animationFrames.flush();
    });

    expect(wheel.defaultPrevented).toBe(true);
    expect(dirtySurfaceIds).toEqual(["dict-a:param-content:unpinned"]);
  });

  it("marks only the hovered retained row source rect dirty on pointer hover", () => {
    const dirtySurfaces: Array<{
      readonly sourceRect?: {
        readonly height: number;
        readonly width: number;
        readonly x: number;
        readonly y: number;
      };
      readonly surfaceId: string;
    }> = [];
    const requestPaint = vi.fn();
    let host: HTMLDivElement | null = null;

    act(() => {
      root = createRoot(
        document.body.appendChild(document.createElement("div")),
      );
      root.render(
        <RetainedContentHoverHarness
          onDirtySurface={(surface) => {
            dirtySurfaces.push(surface);
          }}
          onHostChange={(element) => {
            host = element;
          }}
          onRequestPaint={requestPaint}
        />,
      );
    });

    if (!host) {
      throw new Error("Expected retained content hover host to mount.");
    }

    act(() => {
      host?.dispatchEvent(
        createPointerEvent("pointermove", {
          buttons: 0,
          clientX: 20,
          clientY: 14,
          pointerId: 1,
        }),
      );
    });

    expect(dirtySurfaces).toEqual([
      {
        sourceRect: { height: 28, width: 160, x: 0, y: 0 },
        surfaceId: "dict-a:param-content:unpinned",
      },
    ]);
    expect(requestPaint).toHaveBeenCalledTimes(1);
  });

  it("clears the previous retained row hover after the scene is refreshed", () => {
    const dirtySurfaces: Array<{
      readonly sourceRect?: {
        readonly height: number;
        readonly width: number;
        readonly x: number;
        readonly y: number;
      };
      readonly surfaceId: string;
    }> = [];
    let host: HTMLDivElement | null = null;

    act(() => {
      root = createRoot(
        document.body.appendChild(document.createElement("div")),
      );
      root.render(
        <RetainedContentHoverHarness
          onDirtySurface={(surface) => {
            dirtySurfaces.push(surface);
          }}
          onHostChange={(element) => {
            host = element;
          }}
          resetSceneAfterFirstDirty
          rowCount={2}
        />,
      );
    });

    if (!host) {
      throw new Error("Expected retained content hover host to mount.");
    }

    act(() => {
      host?.dispatchEvent(
        createPointerEvent("pointermove", {
          buttons: 0,
          clientX: 20,
          clientY: 14,
          pointerId: 1,
        }),
      );
    });
    act(() => {
      host?.dispatchEvent(
        createPointerEvent("pointermove", {
          buttons: 0,
          clientX: 20,
          clientY: 42,
          pointerId: 1,
        }),
      );
    });

    expect(dirtySurfaces).toEqual([
      {
        sourceRect: { height: 28, width: 160, x: 0, y: 0 },
        surfaceId: "dict-a:param-content:unpinned",
      },
      {
        sourceRect: { height: 56, width: 160, x: 0, y: 0 },
        surfaceId: "dict-a:param-content:unpinned",
      },
    ]);
  });

  it("keeps recently hovered rows dirty during fast retained row movement", () => {
    const dirtySurfaces: Array<{
      readonly sourceRect?: {
        readonly height: number;
        readonly width: number;
        readonly x: number;
        readonly y: number;
      };
      readonly surfaceId: string;
    }> = [];
    let host: HTMLDivElement | null = null;

    act(() => {
      root = createRoot(
        document.body.appendChild(document.createElement("div")),
      );
      root.render(
        <RetainedContentHoverHarness
          onDirtySurface={(surface) => {
            dirtySurfaces.push(surface);
          }}
          onHostChange={(element) => {
            host = element;
          }}
          rowCount={5}
        />,
      );
    });

    if (!host) {
      throw new Error("Expected retained content hover host to mount.");
    }

    act(() => {
      host?.dispatchEvent(
        createPointerEvent("pointermove", {
          buttons: 0,
          clientX: 20,
          clientY: 14,
          pointerId: 1,
        }),
      );
    });
    act(() => {
      host?.dispatchEvent(
        createPointerEvent("pointermove", {
          buttons: 0,
          clientX: 20,
          clientY: 42,
          pointerId: 1,
        }),
      );
    });
    act(() => {
      host?.dispatchEvent(
        createPointerEvent("pointermove", {
          buttons: 0,
          clientX: 20,
          clientY: 70,
          pointerId: 1,
        }),
      );
    });

    expect(dirtySurfaces).toEqual([
      {
        sourceRect: { height: 28, width: 160, x: 0, y: 0 },
        surfaceId: "dict-a:param-content:unpinned",
      },
      {
        sourceRect: { height: 56, width: 160, x: 0, y: 0 },
        surfaceId: "dict-a:param-content:unpinned",
      },
      {
        sourceRect: { height: 84, width: 160, x: 0, y: 0 },
        surfaceId: "dict-a:param-content:unpinned",
      },
    ]);
  });
});

function RetainedContentInteractionHarness({
  onHitClick,
  onHostChange,
}: {
  readonly onHitClick: ReturnType<typeof vi.fn>;
  readonly onHostChange: (element: HTMLDivElement | null) => void;
}) {
  const [revision, setRevision] = useState(1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodeLayerRef = useRef<{ scene: GpuFlowScene | undefined }>({
    scene: retainedContentScene(revision),
  });
  nodeLayerRef.current.scene = retainedContentScene(revision);
  const nodeElementByIdRef = useRef(new Map<string, HTMLElement>());
  const surfaceRef = useRef({
    getRuntime: () => null,
    requestFrame: vi.fn(),
    requestPaint: vi.fn(),
  });
  const textureManagerRef = useRef(null);
  const viewportStore = useMemo(() => createGpuFlowViewportStore(), []);
  const switchAnimations = useMemo(
    () => createGpuRetainedContentSwitchAnimationStore(),
    [],
  );

  useGpuFlowRetainedContentControllers({
    containerRef,
    layoutStore: null,
    nodeElementByIdRef,
    nodeLayerRef,
    retainedContentConnection: false,
    retainedContentInteraction: {
      onHitClick,
      onHitPointerDown: () => {
        setRevision((current) => current + 1);
      },
    },
    retainedContentKeyboard: false,
    retainedContentScroll: false,
    retainedContentSwitchAnimations: switchAnimations,
    scenePortConnection: false,
    surfaceRef,
    textureManagerRef,
    viewportStore,
  });

  return (
    <div
      ref={(element) => {
        containerRef.current = element;
        onHostChange(element);
      }}
    />
  );
}

function RetainedContentScrollHarness({
  onDirtySurface,
  onHostChange,
}: {
  readonly onDirtySurface: (surfaceId: string) => void;
  readonly onHostChange: (element: HTMLDivElement | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodeLayerRef = useRef<{ scene: GpuFlowScene | undefined }>({
    scene: scrollableRetainedContentScene(),
  });
  const nodeElementByIdRef = useRef(
    new Map<string, HTMLElement>([
      [
        "dict-a:param-content:unpinned",
        createRetainedContentSourceElement("dict-a:param-content:unpinned"),
      ],
      [
        "dict-b:param-content:unpinned",
        createRetainedContentSourceElement("dict-b:param-content:unpinned"),
      ],
    ]),
  );
  const textureManagerRef = useRef({
    markSurfaceTextureDirty: ({
      surfaceId,
    }: {
      readonly surfaceId: string;
    }) => {
      onDirtySurface(surfaceId);
    },
    markSurfacesPainted: vi.fn(),
  });
  const surfaceRef = useRef({
    getRuntime: () => null,
    requestFrame: vi.fn(),
    requestPaint: () => {
      markHtmlSurfaceFramePaintDirty({
        changedElements: [...nodeElementByIdRef.current.values()],
        elementByNodeId: nodeElementByIdRef.current,
        frame: 1,
        ignoreDirectNodeIds: new Set(),
        textureManager: textureManagerRef.current,
      });
    },
  });
  const viewportStore = useMemo(() => createGpuFlowViewportStore(), []);
  const switchAnimations = useMemo(
    () => createGpuRetainedContentSwitchAnimationStore(),
    [],
  );
  const scrollOffsetsRef = useRef(new Map<string, { x: number; y: number }>());

  useGpuFlowRetainedContentControllers({
    containerRef,
    layoutStore: null,
    nodeElementByIdRef,
    nodeLayerRef,
    retainedContentConnection: false,
    retainedContentInteraction: false,
    retainedContentKeyboard: false,
    retainedContentScroll: {
      getScrollOffsets: () => scrollOffsetsRef.current,
      onScrollOffsetsChange: (scrollOffsets) => {
        scrollOffsetsRef.current = new Map(scrollOffsets);
      },
    },
    retainedContentSwitchAnimations: switchAnimations,
    scenePortConnection: false,
    surfaceRef,
    textureManagerRef,
    viewportStore,
  });

  return (
    <div
      ref={(element) => {
        containerRef.current = element;
        onHostChange(element);
      }}
    />
  );
}

function RetainedContentHoverHarness({
  onDirtySurface,
  onHostChange,
  onRequestPaint,
  resetSceneAfterFirstDirty = false,
  rowCount = 1,
}: {
  readonly onDirtySurface: (surface: {
    readonly sourceRect?: {
      readonly height: number;
      readonly width: number;
      readonly x: number;
      readonly y: number;
    };
    readonly surfaceId: string;
  }) => void;
  readonly onHostChange: (element: HTMLDivElement | null) => void;
  readonly onRequestPaint?: (() => void) | undefined;
  readonly resetSceneAfterFirstDirty?: boolean | undefined;
  readonly rowCount?: number | undefined;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodeLayerRef = useRef<{ scene: GpuFlowScene | undefined }>({
    scene: retainedContentScene(1, rowCount),
  });
  const dirtySurfaceCountRef = useRef(0);
  const nodeElementByIdRef = useRef(
    new Map<string, HTMLElement>([
      [
        "dict-a:param-content:unpinned",
        createRetainedContentSourceElement("dict-a:param-content:unpinned"),
      ],
    ]),
  );
  const textureManagerRef = useRef({
    markSurfaceTextureDirty: ({
      sourceRect,
      surfaceId,
    }: {
      readonly sourceRect?: {
        readonly height: number;
        readonly width: number;
        readonly x: number;
        readonly y: number;
      };
      readonly surfaceId: string;
    }) => {
      onDirtySurface({
        ...(sourceRect ? { sourceRect } : {}),
        surfaceId,
      });
      dirtySurfaceCountRef.current += 1;
      if (resetSceneAfterFirstDirty && dirtySurfaceCountRef.current === 1) {
        nodeLayerRef.current = {
          ...nodeLayerRef.current,
          scene: retainedContentScene(1, rowCount),
        };
      }
    },
    markSurfacesPainted: vi.fn(),
  });
  const surfaceRef = useRef({
    getRuntime: () => null,
    requestFrame: vi.fn(),
    requestPaint: () => {
      onRequestPaint?.();
    },
  });
  const viewportStore = useMemo(() => createGpuFlowViewportStore(), []);
  const switchAnimations = useMemo(
    () => createGpuRetainedContentSwitchAnimationStore(),
    [],
  );

  useGpuFlowRetainedContentControllers({
    containerRef,
    layoutStore: null,
    nodeElementByIdRef,
    nodeLayerRef,
    retainedContentConnection: false,
    retainedContentInteraction: {},
    retainedContentKeyboard: false,
    retainedContentScroll: false,
    retainedContentSwitchAnimations: switchAnimations,
    scenePortConnection: false,
    surfaceRef,
    textureManagerRef,
    viewportStore,
  });

  return (
    <div
      ref={(element) => {
        containerRef.current = element;
        onHostChange(element);
      }}
    />
  );
}

function retainedContentScene(revision: number, rowCount = 1): GpuFlowScene {
  return {
    contentSurfaces: [retainedSurface(rowCount)],
    domIslands: [],
    edges: [],
    revision,
    sections: [],
  };
}

function scrollableRetainedContentScene(): GpuFlowScene {
  return {
    contentSurfaces: [
      scrollableRetainedSurface({
        id: "dict-a:param-content:unpinned",
        ownerSectionId: "dict-a",
        x: 0,
      }),
      scrollableRetainedSurface({
        id: "dict-b:param-content:unpinned",
        ownerSectionId: "dict-b",
        x: 240,
      }),
    ],
    domIslands: [],
    edges: [],
    revision: 1,
    sections: [],
  };
}

function scrollableRetainedSurface({
  id,
  ownerSectionId,
  x,
}: {
  readonly id: string;
  readonly ownerSectionId: string;
  readonly x: number;
}): GpuContentSurface {
  const rect = { height: 80, width: 160, x, y: 0 };
  return {
    clipRect: rect,
    id,
    ownerSectionId,
    rect,
    renderer: {
      kind: "canvas-content",
      surfaceId: id,
    },
    retainedScene: createGpuRetainedRowContentScene({
      controlWidth: 40,
      id,
      ownerSectionId,
      rowHeight: 28,
      rows: Array.from({ length: 10 }, (_, index) => ({
        control: textLikeControlDescriptor(),
        controlKind: "text-like",
        depth: 0,
        id: `param-${index}`,
        label: `Param ${index}`,
      })),
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: rect.height, width: rect.width, x: 0, y: 0 },
    }),
    zIndex: 1,
  };
}

function retainedSurface(rowCount = 1): GpuContentSurface {
  const rect = { height: 80, width: 160, x: 0, y: 0 };
  return {
    clipRect: rect,
    id: "dict-a:param-content:unpinned",
    ownerSectionId: "dict-a",
    rect,
    renderer: {
      kind: "canvas-content",
      surfaceId: "dict-a:param-content:unpinned",
    },
    retainedScene: createGpuRetainedRowContentScene({
      controlWidth: 40,
      id: "dict-a:param-content:unpinned",
      ownerSectionId: "dict-a",
      rowHeight: 28,
      rows: Array.from({ length: rowCount }, (_, index) => ({
        control: textLikeControlDescriptor(),
        controlKind: "text-like",
        depth: 0,
        id: `param-${index}`,
        label: `Param ${index}`,
      })),
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: rect.height, width: rect.width, x: 0, y: 0 },
    }),
    zIndex: 1,
  };
}

function textLikeControlDescriptor(): GpuRetainedContentControlDescriptor {
  return {
    commitPolicy: "native-island",
    defaultDisplayValue: "",
    displayValue: "Value 0",
    editorKind: "text",
    kind: "text-like",
    rendererFamily: "text-like",
  };
}

function createPointerEvent(
  type: string,
  init: {
    readonly button?: number | undefined;
    readonly buttons?: number | undefined;
    readonly clientX: number;
    readonly clientY: number;
    readonly pointerId: number;
  },
): PointerEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
  }) as PointerEvent;
  Object.defineProperties(event, {
    button: { value: init.button ?? 0 },
    buttons: { value: init.buttons ?? (type === "pointerup" ? 0 : 1) },
    isPrimary: { value: true },
    pointerId: { value: init.pointerId },
    pointerType: { value: "mouse" },
  });
  return event;
}

function createMouseEvent(
  type: string,
  init: {
    readonly clientX: number;
    readonly clientY: number;
  },
): MouseEvent {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
  });
}

function createRetainedContentSourceElement(surfaceId: string): HTMLElement {
  const host = document.createElement("div");
  const canvas = document.createElement("canvas");
  vi.spyOn(canvas, "getContext").mockReturnValue(
    createCanvasContextStub() as never,
  );
  host.dataset.gpuFlowHtmlSource = "true";
  host.setAttribute("data-gpu-flow-source-id", surfaceId);
  canvas.setAttribute("data-gpu-flow-retained-content-canvas", "true");
  host.append(canvas);
  return host;
}

function createCanvasContextStub(): CanvasRenderingContext2D {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    clearRect: vi.fn(),
    clip: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    roundRect: vi.fn(),
    save: vi.fn(),
    setTransform: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
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
