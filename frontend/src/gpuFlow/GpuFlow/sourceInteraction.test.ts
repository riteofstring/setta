/* @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";

import type { GpuNodeLayout } from "../htmlSurfaces/frame";
import type { HtmlSurfaceInteractionProjector } from "../htmlSurfaces/interactionProjector";
import type { CommittedHtmlSurfaceTextureSnapshot } from "../htmlSurfaces/textures";
import { createHtmlSurfaceVisualScene } from "../htmlSurfaces/visualScene";

import {
  clearGpuFlowNodeHoverSourceProjection,
  projectGpuFlowNodeHoverSourceForPointerEvent,
  projectGpuFlowNodeSourceForPointerEvent,
} from "./sourceInteraction";

describe("GPU flow source interaction projection", () => {
  it("aligns active source DOM from the rendered visual scene hit projection", () => {
    const surface = document.createElement("div");
    const source = document.createElement("div");
    const alignSourceToClientPoint = vi.fn(() => ({
      sourceElement: source,
      sourceId: "node-a",
    }));
    setRect(surface, 0, 0, 600, 400);

    projectGpuFlowNodeSourceForPointerEvent({
      event: new MouseEvent("pointermove", {
        clientX: 250,
        clientY: 20,
      }) as PointerEvent,
      nodeElementById: new Map([["node-a", source]]),
      nodeId: "node-a",
      nodes: [node("node-a", 0, 0, 100, 100, 1)],
      projector: {
        alignSourceToClientPoint,
        clearSource: vi.fn(),
        destroy: vi.fn(),
        getProjectedSourceId: vi.fn(() => null),
      } satisfies HtmlSurfaceInteractionProjector,
      surfaceElement: surface,
      viewport: [0, 0, 1],
      visualScene: createHtmlSurfaceVisualScene({
        meshSurfaces: [
          {
            bounds: { height: 100, width: 100, x: 200, y: 0 },
            indices: new Uint32Array([0, 1, 2, 1, 3, 2]),
            kind: "mesh",
            surfaceId: "node-a",
            texture: textureRecord("node-a", 100, 100),
            vertices: [
              { u: 0, v: 0, x: 200, y: 0 },
              { u: 1, v: 0, x: 300, y: 0 },
              { u: 0, v: 1, x: 200, y: 100 },
              { u: 1, v: 1, x: 300, y: 100 },
            ],
            zIndex: 1,
          },
        ],
      }),
    });

    expect(alignSourceToClientPoint).toHaveBeenCalledTimes(1);
    const projection = alignSourceToClientPoint.mock.calls[0]?.[0];
    expect(projection).toMatchObject({
      sourceElement: source,
      sourceId: "node-a",
      surfaceX: 250,
      surfaceY: 20,
    });
    expect(projection?.localX).toBeCloseTo(50);
    expect(projection?.localY).toBeCloseTo(20);
  });

  it("does not fall back to flat projection when the active visual scene surface is missed", () => {
    const surface = document.createElement("div");
    const source = document.createElement("div");
    const alignSourceToClientPoint = vi.fn();
    setRect(surface, 0, 0, 600, 400);

    projectGpuFlowNodeSourceForPointerEvent({
      event: new MouseEvent("pointermove", {
        clientX: 50,
        clientY: 20,
      }) as PointerEvent,
      nodeElementById: new Map([["node-a", source]]),
      nodeId: "node-a",
      nodes: [node("node-a", 0, 0, 100, 100, 1)],
      projector: {
        alignSourceToClientPoint,
        clearSource: vi.fn(),
        destroy: vi.fn(),
        getProjectedSourceId: vi.fn(() => null),
      } satisfies HtmlSurfaceInteractionProjector,
      surfaceElement: surface,
      viewport: [0, 0, 1],
      visualScene: createHtmlSurfaceVisualScene({
        meshSurfaces: [
          {
            bounds: { height: 100, width: 100, x: 200, y: 0 },
            indices: new Uint32Array([0, 1, 2, 1, 3, 2]),
            kind: "mesh",
            surfaceId: "node-a",
            texture: textureRecord("node-a", 100, 100),
            vertices: [
              { u: 0, v: 0, x: 200, y: 0 },
              { u: 1, v: 0, x: 300, y: 0 },
              { u: 0, v: 1, x: 200, y: 100 },
              { u: 1, v: 1, x: 300, y: 100 },
            ],
            zIndex: 1,
          },
        ],
      }),
    });

    expect(alignSourceToClientPoint).not.toHaveBeenCalled();
  });

  it("keeps flat fallback only for active nodes missing from the visual scene", () => {
    const surface = document.createElement("div");
    const source = document.createElement("div");
    const alignSourceToClientPoint = vi.fn();
    setRect(surface, 0, 0, 600, 400);

    projectGpuFlowNodeSourceForPointerEvent({
      event: new MouseEvent("pointermove", {
        clientX: 50,
        clientY: 20,
      }) as PointerEvent,
      nodeElementById: new Map([["node-a", source]]),
      nodeId: "node-a",
      nodes: [node("node-a", 0, 0, 100, 100, 1)],
      projector: {
        alignSourceToClientPoint,
        clearSource: vi.fn(),
        destroy: vi.fn(),
        getProjectedSourceId: vi.fn(() => null),
      } satisfies HtmlSurfaceInteractionProjector,
      surfaceElement: surface,
      viewport: [0, 0, 1],
      visualScene: createHtmlSurfaceVisualScene(),
    });

    expect(alignSourceToClientPoint).toHaveBeenCalledTimes(1);
    expect(alignSourceToClientPoint.mock.calls[0]?.[0]).toMatchObject({
      localX: 50,
      localY: 20,
      sourceElement: source,
      sourceId: "node-a",
      surfaceX: 50,
      surfaceY: 20,
    });
  });

  it("does not synthesize flat projection when scene-owned visuals are required", () => {
    const surface = document.createElement("div");
    const source = document.createElement("div");
    const alignSourceToClientPoint = vi.fn();
    setRect(surface, 0, 0, 600, 400);

    projectGpuFlowNodeSourceForPointerEvent({
      event: new MouseEvent("pointermove", {
        clientX: 50,
        clientY: 20,
      }) as PointerEvent,
      nodeElementById: new Map([["node-a", source]]),
      nodeId: "node-a",
      nodes: [node("node-a", 0, 0, 100, 100, 1)],
      projector: {
        alignSourceToClientPoint,
        clearSource: vi.fn(),
        destroy: vi.fn(),
        getProjectedSourceId: vi.fn(() => null),
      } satisfies HtmlSurfaceInteractionProjector,
      requireVisualSceneHitSurfaces: true,
      surfaceElement: surface,
      viewport: [0, 0, 1],
      visualScene: createHtmlSurfaceVisualScene(),
    });

    expect(alignSourceToClientPoint).not.toHaveBeenCalled();
  });

  it("projects a hovered passive source from the rendered node hit", () => {
    const surface = document.createElement("div");
    const source = document.createElement("div");
    const handle = createAgenticHandle("node-a");
    const alignSourceToClientPoint = vi.fn(() => ({
      sourceElement: source,
      sourceId: "node-a",
    }));
    document.body.append(handle);
    setRect(surface, 0, 0, 600, 400);

    try {
      const nodeId = projectGpuFlowNodeHoverSourceForPointerEvent({
        event: new MouseEvent("pointermove", {
          clientX: 50,
          clientY: 20,
        }) as PointerEvent,
        nodeElementById: new Map([["node-a", source]]),
        nodes: [node("node-a", 0, 0, 100, 100, 1)],
        previousNodeId: null,
        projector: {
          alignSourceToClientPoint,
          clearSource: vi.fn(),
          destroy: vi.fn(),
          getProjectedSourceId: vi.fn(() => null),
        } satisfies HtmlSurfaceInteractionProjector,
        surfaceElement: surface,
        viewport: [0, 0, 1],
        visualScene: createHtmlSurfaceVisualScene(),
      });

      expect(nodeId).toBe("node-a");
      expect(source.getAttribute("data-gpu-flow-hovered")).toBe("true");
      expect(handle.getAttribute("data-gpu-flow-hovered")).toBe("true");
      expect(alignSourceToClientPoint).toHaveBeenCalledTimes(1);
      expect(alignSourceToClientPoint.mock.calls[0]?.[0]).toMatchObject({
        localX: 50,
        localY: 20,
        sourceElement: source,
        sourceId: "node-a",
        surfaceX: 50,
        surfaceY: 20,
      });
    } finally {
      handle.remove();
    }
  });

  it("marks direct source DOM event targets as hovered without a visual hit", () => {
    const surface = document.createElement("div");
    const source = document.createElement("div");
    const child = document.createElement("button");
    const handle = createAgenticHandle("node-a");
    const alignSourceToClientPoint = vi.fn();
    source.dataset.gpuFlowNode = "true";
    source.dataset.id = "node-a";
    source.append(child);
    document.body.append(handle);
    setRect(surface, 0, 0, 600, 400);
    const event = new MouseEvent("pointermove", {
      clientX: 250,
      clientY: 20,
    }) as PointerEvent;
    Object.defineProperty(event, "target", { value: child });

    try {
      const nodeId = projectGpuFlowNodeHoverSourceForPointerEvent({
        event,
        nodeElementById: new Map([["node-a", source]]),
        nodes: [node("node-a", 0, 0, 100, 100, 1)],
        previousNodeId: null,
        projector: {
          alignSourceToClientPoint,
          clearSource: vi.fn(),
          destroy: vi.fn(),
          getProjectedSourceId: vi.fn(() => null),
        } satisfies HtmlSurfaceInteractionProjector,
        surfaceElement: surface,
        viewport: [0, 0, 1],
        visualScene: createHtmlSurfaceVisualScene(),
      });

      expect(nodeId).toBe("node-a");
      expect(source.getAttribute("data-gpu-flow-hovered")).toBe("true");
      expect(handle.getAttribute("data-gpu-flow-hovered")).toBe("true");
      expect(alignSourceToClientPoint).not.toHaveBeenCalled();
    } finally {
      handle.remove();
    }
  });

  it("keeps the hovered source while the pointer is inside its projected bridge", () => {
    const surface = document.createElement("div");
    const source = document.createElement("div");
    const bridge = document.createElement("div");
    source.dataset.gpuFlowNode = "true";
    source.dataset.id = "node-a";
    source.append(bridge);
    const alignSourceToClientPoint = vi.fn();
    setRect(surface, 0, 0, 600, 400);
    const event = new MouseEvent("pointermove", {
      clientX: 250,
      clientY: 20,
    }) as PointerEvent;
    Object.defineProperty(event, "target", { value: bridge });

    const nodeId = projectGpuFlowNodeHoverSourceForPointerEvent({
      event,
      nodeElementById: new Map([["node-a", source]]),
      nodes: [node("node-a", 0, 0, 100, 100, 1)],
      previousNodeId: "node-a",
      projector: {
        alignSourceToClientPoint,
        clearSource: vi.fn(),
        destroy: vi.fn(),
        getProjectedSourceId: vi.fn(() => "node-a"),
      } satisfies HtmlSurfaceInteractionProjector,
      surfaceElement: surface,
      viewport: [0, 0, 1],
      visualScene: createHtmlSurfaceVisualScene(),
    });

    expect(nodeId).toBe("node-a");
    expect(source.getAttribute("data-gpu-flow-hovered")).toBe("true");
    expect(alignSourceToClientPoint).not.toHaveBeenCalled();
  });

  it("clears hovered passive source projection state", () => {
    const source = document.createElement("div");
    const handle = createAgenticHandle("node-a");
    const clearSource = vi.fn();
    source.setAttribute("data-gpu-flow-hovered", "true");
    handle.setAttribute("data-gpu-flow-hovered", "true");
    document.body.append(handle);

    try {
      clearGpuFlowNodeHoverSourceProjection({
        nodeElementById: new Map([["node-a", source]]),
        nodeId: "node-a",
        projector: {
          alignSourceToClientPoint: vi.fn(),
          clearSource,
          destroy: vi.fn(),
          getProjectedSourceId: vi.fn(() => "node-a"),
        } satisfies HtmlSurfaceInteractionProjector,
      });

      expect(source.hasAttribute("data-gpu-flow-hovered")).toBe(false);
      expect(handle.hasAttribute("data-gpu-flow-hovered")).toBe(false);
      expect(clearSource).toHaveBeenCalledWith("node-a");
    } finally {
      handle.remove();
    }
  });

  it("fails loudly for effect-backed active sources without a hit projector", () => {
    const surface = document.createElement("div");
    const source = document.createElement("div");
    const alignSourceToClientPoint = vi.fn();
    setRect(surface, 0, 0, 600, 400);

    expect(() =>
      projectGpuFlowNodeSourceForPointerEvent({
        event: new MouseEvent("pointermove", {
          clientX: 50,
          clientY: 20,
        }) as PointerEvent,
        nodeElementById: new Map([["node-a", source]]),
        nodeId: "node-a",
        nodes: [node("node-a", 0, 0, 100, 100, 1)],
        projector: {
          alignSourceToClientPoint,
          clearSource: vi.fn(),
          destroy: vi.fn(),
          getProjectedSourceId: vi.fn(() => null),
        } satisfies HtmlSurfaceInteractionProjector,
        surfaceElement: surface,
        viewport: [0, 0, 1],
        visualScene: createHtmlSurfaceVisualScene({
          effectSurfaces: [
            {
              bounds: { height: 100, width: 100, x: 0, y: 0 },
              effectId: "setta-ripple",
              kind: "effect",
              projectorId: "missing-projector",
              surfaceId: "node-a",
              texture: textureRecord("node-a", 100, 100),
              zIndex: 1,
            },
          ],
        }),
      }),
    ).toThrow(
      'HTML surface effect "setta-ripple" cannot be hit-tested without projector "missing-projector".',
    );
    expect(alignSourceToClientPoint).not.toHaveBeenCalled();
  });
});

function node(
  nodeId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  zIndex: number,
): GpuNodeLayout {
  return {
    height,
    nodeId,
    width,
    x,
    y,
    zIndex,
  };
}

function textureRecord(
  surfaceId: string,
  cssWidth: number,
  cssHeight: number,
): CommittedHtmlSurfaceTextureSnapshot {
  return {
    clampedByMaxTexture: false,
    cssHeight,
    cssWidth,
    dirtyContent: false,
    dirtyResolution: false,
    lastUploadFrame: 1,
    lastVisibleFrame: 1,
    maxTextureDimension2D: 4096,
    pixelHeight: cssHeight,
    pixelWidth: cssWidth,
    priority: "visible",
    requestedScale: 1,
    resolutionScale: 1,
    sampler: {} as GPUSampler,
    surfaceId,
    texture: {} as GPUTexture,
    textureBytes: cssWidth * cssHeight * 4,
    textureLayout: { kind: "single", tileCount: 1 },
    textureView: {} as GPUTextureView,
    tiles: [],
    zoomBucket: 1,
  };
}

function setRect(
  element: Element,
  left: number,
  top: number,
  width: number,
  height: number,
) {
  element.getBoundingClientRect = () =>
    ({
      bottom: top + height,
      height,
      left,
      right: left + width,
      top,
      width,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}

function createAgenticHandle(nodeId: string): HTMLElement {
  const handle = document.createElement("div");
  handle.className = "setta-gpu-flow__handle agentic-handle";
  handle.setAttribute("data-nodeid", nodeId);
  return handle;
}
