/* @vitest-environment jsdom */

import { BackgroundVariantEnum } from "utils/generatedTypes";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGpuEdgeGeometry } from "./edges/edgeGeometry";
import type { GpuEdgeBufferInput } from "./edges/edgeGpuBuffers";
import {
  buildTexturedGpuNodeQuads,
  collectVisibleGpuNodeQuads,
  markGpuNodeLayerPaintDirty,
  renderGpuNodeLayerFrame,
  syncGpuNodeDomTransforms,
  type GpuNodeLayout,
  type GpuTexturedNodeQuad,
} from "./GpuNodeLayer";
import type { RenderNodeTextureQuadsInput } from "./gpuPipelines";
import type {
  NodeTextureRecord,
  UploadDirtyNodeTexturesOptions,
} from "./nodeTextures";
import { NodeTextureManager } from "./nodeTextures";

describe("GpuNodeLayer helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("culls nodes in flow space and preserves z-order draw order", () => {
    const nodes: GpuNodeLayout[] = [
      node("behind", 40, 40, 100, 100, 3),
      node("culled", 1_000, 1_000, 100, 100, 1),
      node("front", 20, 20, 100, 100, 9),
      node("unknown-size", 10, 10, null, 100, 0),
      node("forced", 2_000, 2_000, 100, 100, 2),
    ];

    const quads = collectVisibleGpuNodeQuads({
      canvasHeight: 300,
      canvasWidth: 400,
      forceVisibleNodeIds: ["forced"],
      marginCssPx: 0,
      nodes,
      viewport: [0, 0, 1],
    });

    expect(quads.map((quad) => quad.nodeId)).toEqual([
      "forced",
      "behind",
      "front",
    ]);
  });

  it("pairs visible quads with existing node textures and reports misses", () => {
    const texture = textureRecord("node-a");
    const result = buildTexturedGpuNodeQuads(
      [
        { height: 20, nodeId: "node-a", width: 30, x: 1, y: 2, zIndex: 0 },
        { height: 20, nodeId: "node-b", width: 30, x: 1, y: 2, zIndex: 0 },
      ],
      (nodeId) => (nodeId === "node-a" ? texture : undefined),
    );

    expect(result.texturedQuads).toEqual([
      {
        height: 20,
        nodeId: "node-a",
        texture,
        width: 30,
        x: 1,
        y: 2,
        zIndex: 0,
      },
    ]);
    expect(result.missingTextureNodeIds).toEqual(["node-b"]);
  });

  it("synchronizes visible DOM hit targets and parks culled nodes offscreen", () => {
    const visible = document.createElement("div");
    const culled = document.createElement("div");
    const elements = new Map([
      ["visible", visible],
      ["culled", culled],
    ]);

    syncGpuNodeDomTransforms({
      activeNodeIds: ["visible"],
      elementByNodeId: elements,
      nodes: [
        node("visible", 10, 20, 100, 50, 0),
        node("culled", 30, 40, 100, 50, 0),
      ],
      overlayNodeIds: ["visible"],
      visibleNodeIds: new Set(["visible"]),
      viewport: { x: 5, y: -10, zoom: 1.5 },
    });

    expect(visible.style.position).toBe("absolute");
    expect(visible.style.transformOrigin).toBe("0 0");
    expect(visible.style.transform).toBe("translate(20px, 20px) scale(1.5)");
    expect(visible.style.pointerEvents).toBe("all");
    expect(visible.dataset.gpuFlowInteractive).toBe("true");
    expect(visible.dataset.gpuFlowOverlay).toBe("active");
    expect(
      visible.classList.contains("setta-gpu-flow__node--interactive"),
    ).toBe(true);
    expect(
      visible.classList.contains("setta-gpu-flow__node--overlay-active"),
    ).toBe(true);
    expect(culled.style.transform).toBe(
      "translate(-100000px, -100000px) scale(1)",
    );
    expect(culled.style.pointerEvents).toBe("none");
    expect(culled.dataset.gpuFlowInteractive).toBe("false");
    expect(culled.dataset.gpuFlowOverlay).toBe("none");
  });

  it("registers visible DOM nodes, uploads dirty textures, and renders uploaded quads", () => {
    const visible = document.createElement("div");
    const culled = document.createElement("div");
    const elements = new Map([
      ["visible", visible],
      ["culled", culled],
    ]);
    const manager = createFrameTextureManager();
    const renderer = createFrameRenderer();

    const result = renderGpuNodeLayerFrame({
      canvasSize: canvasSize(),
      activeNodeId: "visible",
      elementByNodeId: elements,
      frame: 1,
      marginCssPx: 0,
      nodes: [
        node("visible", 10, 20, 100, 50, 0),
        node("culled", 1_000, 1_000, 100, 50, 0),
      ],
      overlayNodeId: "visible",
      renderer,
      textureManager: manager,
      viewport: [5, -10, 1.5],
    });

    expect(manager.registerNodeTexture).toHaveBeenCalledTimes(1);
    expect(manager.registerNodeTexture).toHaveBeenCalledWith({
      cssHeight: 50,
      cssWidth: 100,
      devicePixelRatio: 2,
      element: visible,
      frame: 1,
      nodeId: "visible",
      priority: "interactive",
      zoom: 1.5,
    });
    expect(manager.uploadDirtyNodeTextures).toHaveBeenCalledWith({ frame: 1 });
    expect(renderer.render).toHaveBeenCalledWith({
      canvasSize: canvasSize(),
      clearColor: undefined,
      quads: [
        expect.objectContaining({
          nodeId: "visible",
          texture: expect.objectContaining({
            lastUploadFrame: 1,
          }),
        }),
      ],
      viewport: [5, -10, 1.5],
    });
    expect(result).toMatchObject({
      budgetExhausted: false,
      activeNodeId: "visible",
      drawnNodeIds: ["visible"],
      missingElementNodeIds: [],
      missingTextureNodeIds: [],
      overlayNodeId: "visible",
      uploadedNodeIds: ["visible"],
      visibleNodeIds: ["visible"],
    });
    expect(visible.style.transform).toBe("translate(20px, 20px) scale(1.5)");
    expect(culled.style.pointerEvents).toBe("none");
  });

  it("defers non-active resolution upgrades during viewport interactions", () => {
    const visible = document.createElement("div");
    const elements = new Map([["visible", visible]]);
    const manager = createFrameTextureManager();
    const renderer = createFrameRenderer();

    renderGpuNodeLayerFrame({
      canvasSize: canvasSize(),
      deferResolutionUpdates: true,
      elementByNodeId: elements,
      frame: 1,
      nodes: [node("visible", 10, 20, 100, 50, 0)],
      renderer,
      textureManager: manager,
      viewport: [0, 0, 1.5],
    });

    expect(manager.registerNodeTexture).toHaveBeenCalledWith({
      cssHeight: 50,
      cssWidth: 100,
      deferResolution: true,
      devicePixelRatio: 2,
      element: visible,
      frame: 1,
      nodeId: "visible",
      priority: "visible",
      zoom: 1.5,
    });
    expect(manager.uploadDirtyNodeTextures).toHaveBeenCalledWith({
      deferPassiveUploads: true,
      frame: 1,
    });
  });

  it("redraws viewport-only movement from cached textures without another element upload", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new NodeTextureManager(gpu.device);
    const renderer = createFrameRenderer();
    const element = document.createElement("div");
    const elements = new Map([["node-a", element]]);
    const nodes = [node("node-a", 10, 20, 100, 50, 0)];

    renderGpuNodeLayerFrame({
      canvasSize: canvasSize(),
      elementByNodeId: elements,
      frame: 1,
      nodes,
      renderer,
      textureManager: manager,
      viewport: [0, 0, 1],
    });
    renderGpuNodeLayerFrame({
      canvasSize: canvasSize(),
      elementByNodeId: elements,
      frame: 2,
      nodes,
      renderer,
      textureManager: manager,
      viewport: [25, -15, 1],
    });

    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(1);
    expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(renderer.render.mock.calls[1]?.[0]).toMatchObject({
      quads: [
        expect.objectContaining({
          nodeId: "node-a",
          texture: expect.objectContaining({
            lastUploadFrame: 1,
          }),
        }),
      ],
      viewport: [25, -15, 1],
    });
  });

  it("passes renderable GPU edges into the scene renderer", () => {
    const element = document.createElement("div");
    const manager = createFrameTextureManager();
    const renderer = createFrameRenderer();
    const edgeInput = edge("edge-a", 0, 0, 100, 0);

    const result = renderGpuNodeLayerFrame({
      canvasSize: canvasSize(),
      edges: [edgeInput],
      elementByNodeId: new Map([["node-a", element]]),
      frame: 1,
      nodes: [node("node-a", 10, 20, 100, 50, 0)],
      renderer,
      textureManager: manager,
      viewport: [0, 0, 1],
    });

    expect(renderer.render).toHaveBeenCalledWith(
      expect.objectContaining({
        edges: [edgeInput],
      }),
    );
    expect(result.drawnEdgeIds).toEqual(["edge-a"]);
    expect(result.edgeVertexCount).toBe(2);
  });

  it("renders edge-only frames without registering node textures", () => {
    const manager = createFrameTextureManager();
    const renderer = createFrameRenderer();
    const edgeInput = edge("edge-a", 0, 0, 100, 0);

    const result = renderGpuNodeLayerFrame({
      canvasSize: canvasSize(),
      edges: [edgeInput],
      elementByNodeId: new Map(),
      frame: 1,
      nodes: [],
      renderer,
      textureManager: manager,
      viewport: [0, 0, 1],
    });

    expect(manager.registerNodeTexture).not.toHaveBeenCalled();
    expect(manager.uploadDirtyNodeTextures).toHaveBeenCalledWith({ frame: 1 });
    expect(renderer.render).toHaveBeenCalledWith({
      canvasSize: canvasSize(),
      clearColor: undefined,
      edges: [edgeInput],
      quads: [],
      viewport: [0, 0, 1],
    });
    expect(result).toMatchObject({
      drawnEdgeIds: ["edge-a"],
      drawnNodeIds: [],
      edgeVertexCount: 2,
      visibleNodeIds: [],
    });
  });

  it("passes procedural grid settings into the scene renderer", () => {
    const manager = createFrameTextureManager();
    const renderer = createFrameRenderer();
    const grid = {
      color: "#afbacf",
      patternSize: 2,
      snapGrid: [25, 25],
      variant: BackgroundVariantEnum.dots,
    } as const;

    renderGpuNodeLayerFrame({
      canvasSize: canvasSize(),
      elementByNodeId: new Map(),
      frame: 1,
      grid,
      nodes: [],
      renderer,
      textureManager: manager,
      viewport: [0, 0, 1],
    });

    expect(renderer.render).toHaveBeenCalledWith({
      canvasSize: canvasSize(),
      clearColor: undefined,
      grid,
      quads: [],
      viewport: [0, 0, 1],
    });
  });

  it("marks changed paint descendants dirty without requesting another paint", () => {
    const nodeElement = document.createElement("div");
    const input = document.createElement("input");
    nodeElement.append(input);
    const manager = {
      markNodeTextureDirty: vi.fn(),
    };

    const dirtyNodeIds = markGpuNodeLayerPaintDirty({
      changedElements: [input],
      elementByNodeId: new Map([["node-a", nodeElement]]),
      frame: 7,
      textureManager: manager,
    });

    expect(dirtyNodeIds).toEqual(["node-a"]);
    expect(manager.markNodeTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 7,
      nodeId: "node-a",
      reason: "paint",
      requestPaint: false,
    });
  });

  it("does not dirty visible nodes when a paint event omits changed elements", () => {
    const nodeElement = document.createElement("div");
    const manager = {
      markNodeTextureDirty: vi.fn(),
    };

    const dirtyNodeIds = markGpuNodeLayerPaintDirty({
      elementByNodeId: new Map([["node-a", nodeElement]]),
      frame: 8,
      textureManager: manager,
    });

    expect(dirtyNodeIds).toEqual([]);
    expect(manager.markNodeTextureDirty).not.toHaveBeenCalled();
  });

  it("ignores paint changes on the GPU node wrapper itself", () => {
    const nodeElement = document.createElement("div");
    const manager = {
      markNodeTextureDirty: vi.fn(),
    };

    const dirtyNodeIds = markGpuNodeLayerPaintDirty({
      changedElements: [nodeElement],
      elementByNodeId: new Map([["node-a", nodeElement]]),
      frame: 9,
      textureManager: manager,
    });

    expect(dirtyNodeIds).toEqual([]);
    expect(manager.markNodeTextureDirty).not.toHaveBeenCalled();
  });
});

function node(
  nodeId: string,
  x: number,
  y: number,
  width: number | null,
  height: number | null,
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

function textureRecord(nodeId: string): NodeTextureRecord {
  return {
    lastUploadFrame: 0,
    nodeId,
    sampler: {},
    texture: {},
    textureView: {},
  } as NodeTextureRecord;
}

function canvasSize() {
  return {
    cssHeight: 300,
    cssWidth: 400,
    devicePixelRatio: 2,
    pixelHeight: 600,
    pixelWidth: 800,
  };
}

function createFrameTextureManager() {
  const records = new Map<string, NodeTextureRecord>();
  const manager = {
    getNodeTexture: vi.fn((nodeId: string) => records.get(nodeId)),
    markNodeTextureDirty: vi.fn(),
    registerNodeTexture: vi.fn(({ nodeId }: { readonly nodeId: string }) => {
      const record = textureRecord(nodeId) as NodeTextureRecord & {
        lastUploadFrame: number;
      };
      record.lastUploadFrame = -1;
      records.set(nodeId, record);
      return record;
    }),
    uploadDirtyNodeTextures: vi.fn(
      ({ frame }: UploadDirtyNodeTexturesOptions) => {
        const uploaded = Array.from(records.values()) as Array<
          NodeTextureRecord & { lastUploadFrame: number }
        >;
        uploaded.forEach((record) => {
          record.lastUploadFrame = frame;
        });
        return {
          budgetExhausted: false,
          remainingDirtyNodeIds: [],
          skippedNodeIds: [],
          uploaded,
        };
      },
    ),
  };
  return manager;
}

function createFrameRenderer() {
  return {
    render: vi.fn(({ edges, quads }: RenderNodeTextureQuadsInput) => ({
      drawnEdgeIds: edges?.map((edge) => edge.edgeId) ?? [],
      drawnNodeIds: (quads as readonly GpuTexturedNodeQuad[]).map(
        (quad) => quad.nodeId,
      ),
      edgeVertexCount: (edges?.length ?? 0) * 2,
      vertexCount: quads.length * 6,
    })),
  };
}

function createGpuTextureMock() {
  const copyElementImageToTexture = vi.fn();
  const createTexture = vi.fn(() => {
    return {
      createView: vi.fn(() => ({}) as GPUTextureView),
      destroy: vi.fn(),
    } as unknown as GPUTexture;
  });
  const createSampler = vi.fn(() => ({}) as GPUSampler);
  const device = {
    createSampler,
    createTexture,
    destroy: vi.fn(),
    limits: {
      maxTextureDimension2D: 4096,
    },
    queue: {
      copyElementImageToTexture,
    },
  } as unknown as GPUDevice;

  return {
    copyElementImageToTexture,
    createSampler,
    createTexture,
    device,
  };
}

function installTextureUsage() {
  vi.stubGlobal("GPUTextureUsage", {
    COPY_DST: 2,
    RENDER_ATTACHMENT: 4,
    TEXTURE_BINDING: 1,
  });
}

function edge(
  edgeId: string,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): GpuEdgeBufferInput {
  return {
    edgeId,
    geometry: buildGpuEdgeGeometry({
      edgeId,
      source: { x: sourceX, y: sourceY },
      target: { x: targetX, y: targetY },
      type: "straight",
    }),
  };
}
