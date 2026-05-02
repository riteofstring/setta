/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { BackgroundVariantEnum } from "utils/generatedTypes";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGpuEdgeGeometry } from "./edges/edgeGeometry";
import type { GpuEdgeBufferInput } from "./edges/edgeGpuBuffers";
import type { GpuActiveNodeSnapshot } from "./GpuActiveNodeSnapshot";
import { createGpuActiveNodeTeleportController } from "./GpuActiveNodeTeleport";
import {
  buildTexturedGpuNodeQuads,
  collectVisibleGpuNodeQuads,
  createGpuNodeDomTransformSyncCache,
  GpuNodeLayer,
  markGpuNodeLayerPaintDirty,
  renderGpuNodeLayerFrame,
  syncGpuNodeDomTransforms,
  syncGpuNodeDomTransformsFromQuads,
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
      visibleNodeIds: new Set(["visible"]),
      viewport: { x: 5, y: -10, zoom: 1.5 },
    });

    expect(visible.style.position).toBe("absolute");
    expect(visible.style.transformOrigin).toBe("0 0");
    expect(visible.style.transform).toBe("translate(20px, 20px) scale(1.5)");
    expect(visible.style.pointerEvents).toBe("all");
    expect(visible.dataset.gpuFlowInteractive).toBe("true");
    expect(
      visible.classList.contains("setta-gpu-flow__node--interactive"),
    ).toBe(true);
    expect(culled.style.transform).toBe(
      "translate(-100000px, -100000px) scale(1)",
    );
    expect(culled.style.pointerEvents).toBe("none");
    expect(culled.dataset.gpuFlowInteractive).toBe("false");
  });

  it("syncs DOM hit targets from visible and previous-visible diffs", () => {
    const elements = new Map<string, HTMLElement>();
    const nodes = Array.from({ length: 1_000 }, (_, index) => {
      const nodeId = `node-${index}`;
      elements.set(nodeId, document.createElement("div"));
      return node(nodeId, index * 20, 0, 10, 10, 0);
    });
    const cache = createGpuNodeDomTransformSyncCache();
    const resolvedNodeIds: string[] = [];
    const resolveElement = (nodeId: string) => {
      resolvedNodeIds.push(nodeId);
      return elements.get(nodeId);
    };

    syncGpuNodeDomTransformsFromQuads({
      cache,
      elementByNodeId: resolveElement,
      visibleQuads: nodes.slice(10, 13).map(toVisibleQuad),
      viewport: [0, 0, 1],
    });
    resolvedNodeIds.length = 0;

    const result = syncGpuNodeDomTransformsFromQuads({
      cache,
      elementByNodeId: resolveElement,
      visibleQuads: [
        toVisibleQuad(nodes[10] as GpuNodeLayout),
        toVisibleQuad(nodes[11] as GpuNodeLayout),
        toVisibleQuad(nodes[500] as GpuNodeLayout),
      ],
      viewport: [5, 0, 2],
    });

    expect(resolvedNodeIds).toEqual([
      "node-10",
      "node-11",
      "node-500",
      "node-12",
    ]);
    expect(result.updatedNodeIds).toEqual(["node-10", "node-11", "node-500"]);
    expect(result.parkedNodeIds).toEqual(["node-12"]);
    expect(elements.get("node-10")?.style.transform).toBe(
      "translate(405px, 0px) scale(2)",
    );
    expect(elements.get("node-12")?.style.transform).toBe(
      "translate(-100000px, -100000px) scale(1)",
    );
    expect(elements.get("node-999")?.style.transform).toBe("");
  });

  it("does not rewrite unchanged DOM hit-target transforms", () => {
    const element = document.createElement("div");
    const cache = createGpuNodeDomTransformSyncCache();
    const visibleQuads = [
      { height: 10, nodeId: "node-a", width: 10, x: 10, y: 20, zIndex: 0 },
    ];

    syncGpuNodeDomTransformsFromQuads({
      cache,
      elementByNodeId: new Map([["node-a", element]]),
      visibleQuads,
      viewport: [0, 0, 1],
    });
    const result = syncGpuNodeDomTransformsFromQuads({
      cache,
      elementByNodeId: new Map([["node-a", element]]),
      visibleQuads,
      viewport: [0, 0, 1],
    });

    expect(result.updatedNodeIds).toEqual([]);
    expect(result.parkedNodeIds).toEqual([]);
    expect(result.skippedNodeIds).toEqual(["node-a"]);
    expect(element.style.transform).toBe("translate(10px, 20px) scale(1)");
  });

  it("retains protected previous-visible nodes instead of parking them", () => {
    const element = document.createElement("div");
    const cache = createGpuNodeDomTransformSyncCache();

    syncGpuNodeDomTransformsFromQuads({
      cache,
      elementByNodeId: new Map([["active", element]]),
      visibleQuads: [
        { height: 10, nodeId: "active", width: 10, x: 10, y: 20, zIndex: 0 },
      ],
      viewport: [0, 0, 1],
    });
    const result = syncGpuNodeDomTransformsFromQuads({
      activeNodeIds: ["active"],
      cache,
      elementByNodeId: new Map([["active", element]]),
      retainNodeIds: ["active"],
      visibleQuads: [],
      viewport: [100, 100, 1],
    });

    expect(result.parkedNodeIds).toEqual([]);
    expect(result.visibleNodeIds).toEqual(["active"]);
    expect(element.style.transform).toBe("translate(10px, 20px) scale(1)");
    expect(element.style.pointerEvents).toBe("all");
  });

  it("keeps React reconciliation stable while a node host is teleported", () => {
    const canvas = document.createElement("canvas");
    const teleportLayer = document.createElement("div");
    document.body.append(canvas, teleportLayer);
    const root = createRoot(canvas);
    const elements = new Map<string, HTMLElement>();
    const onNodeElementChange = (
      nodeId: string,
      element: HTMLElement | null,
    ) => {
      if (element) {
        elements.set(nodeId, element);
        return;
      }
      elements.delete(nodeId);
    };

    act(() => {
      root.render(
        <GpuNodeLayer
          nodes={[
            node("node-a", 10, 20, 100, 50, 1),
            node("node-b", 40, 50, 100, 50, 2),
          ]}
          onNodeElementChange={onNodeElementChange}
          renderNode={(renderedNode) => (
            <span data-testid={`content-${renderedNode.nodeId}`}>
              {renderedNode.nodeId}
            </span>
          )}
        />,
      );
    });

    const nodeHost = elements.get("node-a");
    expect(nodeHost).toBeInstanceOf(HTMLElement);
    expect(nodeHost?.parentElement).toBe(canvas);
    expect(nodeHost?.dataset.gpuFlowNode).toBe("true");
    expect(
      canvas.querySelector(
        '[data-gpu-flow-node-anchor="true"][data-id="node-a"]',
      ),
    ).not.toBeNull();

    const teleport = createGpuActiveNodeTeleportController(teleportLayer);
    teleport.sync(activeSnapshot(nodeHost as HTMLElement, "node-a"));
    expect(nodeHost?.parentElement).toBe(teleportLayer);

    act(() => {
      root.render(
        <GpuNodeLayer
          nodes={[
            node("node-a", 20, 30, 100, 50, 4),
            node("node-b", 40, 50, 100, 50, 2),
          ]}
          onNodeElementChange={onNodeElementChange}
          renderNode={(renderedNode) => (
            <span data-testid={`content-${renderedNode.nodeId}`}>
              {renderedNode.nodeId}
            </span>
          )}
        />,
      );
    });
    expect(nodeHost?.parentElement).toBe(teleportLayer);
    expect(
      nodeHost?.classList.contains("setta-gpu-flow__node--teleported"),
    ).toBe(true);

    expect(() => {
      act(() => {
        root.render(
          <GpuNodeLayer
            nodes={[
              node("node-b", 40, 50, 100, 50, 2),
              node("node-c", 70, 80, 100, 50, 3),
            ]}
            onNodeElementChange={onNodeElementChange}
            renderNode={(renderedNode) => (
              <span data-testid={`content-${renderedNode.nodeId}`}>
                {renderedNode.nodeId}
              </span>
            )}
          />,
        );
      });
    }).not.toThrow();
    expect(elements.has("node-a")).toBe(false);

    act(() => root.unmount());
    teleport.destroy();
    canvas.remove();
    teleportLayer.remove();
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

  it("passes explicitly deferred upload nodes to the texture manager", () => {
    const visible = document.createElement("div");
    const elements = new Map([["visible", visible]]);
    const manager = createFrameTextureManager();
    const renderer = createFrameRenderer();

    renderGpuNodeLayerFrame({
      canvasSize: canvasSize(),
      deferUploadNodeIds: ["visible"],
      elementByNodeId: elements,
      frame: 1,
      nodes: [node("visible", 10, 20, 100, 50, 0)],
      renderer,
      textureManager: manager,
      viewport: [0, 0, 1],
    });

    expect(manager.uploadDirtyNodeTextures).toHaveBeenCalledWith({
      deferNodeIds: ["visible"],
      frame: 1,
    });
  });

  it("suppresses live active node quads while preserving texture bookkeeping", () => {
    const active = document.createElement("div");
    const passive = document.createElement("div");
    const elements = new Map([
      ["active", active],
      ["passive", passive],
    ]);
    const manager = createFrameTextureManager();
    const renderer = createFrameRenderer();

    const result = renderGpuNodeLayerFrame({
      canvasSize: canvasSize(),
      deferUploadNodeIds: ["active"],
      elementByNodeId: elements,
      frame: 1,
      nodes: [
        node("active", 10, 20, 100, 50, 2),
        node("passive", 40, 60, 100, 50, 1),
      ],
      renderer,
      suppressNodeIds: ["active"],
      textureManager: manager,
      viewport: [0, 0, 1],
    });

    expect(manager.registerNodeTexture).toHaveBeenCalledWith(
      expect.objectContaining({
        element: active,
        nodeId: "active",
      }),
    );
    expect(manager.uploadDirtyNodeTextures).toHaveBeenCalledWith({
      deferNodeIds: ["active"],
      frame: 1,
    });
    expect(renderer.render).toHaveBeenCalledWith(
      expect.objectContaining({
        quads: [
          expect.objectContaining({
            nodeId: "passive",
          }),
        ],
      }),
    );
    expect(result.drawnNodeIds).toEqual(["passive"]);
    expect(result.visibleNodeIds).toEqual(["passive", "active"]);
  });

  it("keeps deferred and suppressed restored nodes in the visible sync set", () => {
    const settling = document.createElement("div");
    const manager = createFrameTextureManager();
    const renderer = createFrameRenderer();

    const result = renderGpuNodeLayerFrame({
      canvasSize: canvasSize(),
      deferUploadNodeIds: ["settling"],
      elementByNodeId: new Map([["settling", settling]]),
      frame: 1,
      marginCssPx: 0,
      nodes: [node("settling", 10_000, 10_000, 100, 50, 0)],
      renderer,
      suppressNodeIds: ["settling"],
      textureManager: manager,
      viewport: [0, 0, 1],
    });

    expect(result.visibleNodeIds).toEqual(["settling"]);
    expect(manager.registerNodeTexture).toHaveBeenCalledWith(
      expect.objectContaining({
        element: settling,
        nodeId: "settling",
      }),
    );
    expect(renderer.render).toHaveBeenCalledWith(
      expect.objectContaining({
        quads: [],
      }),
    );
  });

  it("reports texture eviction and memory summaries from the manager", () => {
    const visible = document.createElement("div");
    const manager = createFrameTextureManager();
    const renderer = createFrameRenderer();
    manager.evictNodeTextures.mockReturnValueOnce({
      budgetBytes: 800,
      evictedBytes: 400,
      evictedNodeIds: ["offscreen"],
      memory: {
        allocatedBytes: 800,
        largestTextureBytes: 400,
        textureCount: 2,
        visibleBytes: 400,
        visibleTextureCount: 1,
      },
      memoryBefore: {
        allocatedBytes: 1_200,
        largestTextureBytes: 400,
        textureCount: 3,
        visibleBytes: 400,
        visibleTextureCount: 1,
      },
      overBudgetBytes: 0,
      protectedNodeIds: ["visible"],
      reason: "node-layer-frame",
    });

    const result = renderGpuNodeLayerFrame({
      activeNodeId: "visible",
      canvasSize: canvasSize(),
      elementByNodeId: new Map([["visible", visible]]),
      frame: 1,
      nodes: [node("visible", 10, 20, 100, 50, 0)],
      renderer,
      textureManager: manager,
      viewport: [0, 0, 1],
    });

    expect(manager.evictNodeTextures).toHaveBeenCalledWith({
      protectedNodeIds: expect.any(Set),
      reason: "node-layer-frame",
      visibleNodeIds: expect.any(Set),
    });
    const evictionInput = manager.evictNodeTextures.mock.calls[0]?.[0];
    expect([...(evictionInput?.visibleNodeIds ?? [])]).toEqual(["visible"]);
    expect([...(evictionInput?.protectedNodeIds ?? [])]).toEqual(["visible"]);
    expect(result).toMatchObject({
      evictedTextureBytes: 400,
      evictedTextureNodeIds: ["offscreen"],
      textureMemory: {
        allocatedBytes: 800,
        textureCount: 2,
        visibleBytes: 400,
      },
      textureMemoryBeforeEviction: {
        allocatedBytes: 1_200,
        textureCount: 3,
      },
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

  it("passes GPU edge palette settings into the scene renderer", () => {
    const manager = createFrameTextureManager();
    const renderer = createFrameRenderer();
    const edgePalette = { color: "#41506c" };

    renderGpuNodeLayerFrame({
      canvasSize: canvasSize(),
      edgePalette,
      elementByNodeId: new Map(),
      frame: 1,
      nodes: [],
      renderer,
      textureManager: manager,
      viewport: [0, 0, 1],
    });

    expect(renderer.render).toHaveBeenCalledWith({
      canvasSize: canvasSize(),
      clearColor: undefined,
      edgePalette,
      quads: [],
      viewport: [0, 0, 1],
    });
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

  it("marks changed paint descendants dirty from GPU node ancestry without iterating mounted nodes", () => {
    const nodeElement = createGpuPaintNodeElement("node-a");
    const input = document.createElement("input");
    nodeElement.append(input);
    const elementByNodeId = new ThrowOnMapIteration<string, HTMLElement>();
    elementByNodeId.set("node-a", nodeElement);
    for (let index = 0; index < 2_500; index += 1) {
      elementByNodeId.set(
        `other-${index}`,
        createGpuPaintNodeElement(`other-${index}`),
      );
    }
    const manager = {
      markNodeTextureDirty: vi.fn(),
    };

    const dirtyNodeIds = markGpuNodeLayerPaintDirty({
      changedElements: [input],
      elementByNodeId,
      frame: 7,
      textureManager: manager,
    });

    expect(dirtyNodeIds).toEqual(["node-a"]);
    expect(elementByNodeId.iterationCount).toBe(0);
    expect(manager.markNodeTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 7,
      nodeId: "node-a",
      reason: "paint",
      requestPaint: false,
    });
  });

  it("marks a changed GPU node wrapper dirty", () => {
    const nodeElement = createGpuPaintNodeElement("node-a");
    const manager = {
      markNodeTextureDirty: vi.fn(),
    };

    const dirtyNodeIds = markGpuNodeLayerPaintDirty({
      changedElements: [nodeElement],
      elementByNodeId: new Map([["node-a", nodeElement]]),
      frame: 8,
      textureManager: manager,
    });

    expect(dirtyNodeIds).toEqual(["node-a"]);
    expect(manager.markNodeTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 8,
      nodeId: "node-a",
      reason: "paint",
      requestPaint: false,
    });
  });

  it("uses the narrow ancestor fallback only for a single registered node subtree", () => {
    const nodeElement = createGpuPaintNodeElement("node-a");
    const wrapper = document.createElement("div");
    wrapper.append(nodeElement);
    const manager = {
      markNodeTextureDirty: vi.fn(),
    };

    const dirtyNodeIds = markGpuNodeLayerPaintDirty({
      changedElements: [wrapper],
      elementByNodeId: new Map([["node-a", nodeElement]]),
      frame: 9,
      textureManager: manager,
    });

    expect(dirtyNodeIds).toEqual(["node-a"]);
    expect(manager.markNodeTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 9,
      nodeId: "node-a",
      reason: "paint",
      requestPaint: false,
    });
  });

  it("does not dirty visible nodes when a paint event omits changed elements", () => {
    const nodeElement = createGpuPaintNodeElement("node-a");
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

  it("ignores unrelated and canvas-level paint changes", () => {
    const nodeElement = createGpuPaintNodeElement("node-a");
    const canvas = document.createElement("canvas");
    const unrelated = document.createElement("div");
    canvas.dataset.gpuFlowSurface = "true";
    canvas.append(nodeElement);
    const manager = {
      markNodeTextureDirty: vi.fn(),
    };

    const dirtyNodeIds = markGpuNodeLayerPaintDirty({
      changedElements: [unrelated, canvas],
      elementByNodeId: new Map([["node-a", nodeElement]]),
      frame: 10,
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

function toVisibleQuad(layout: GpuNodeLayout) {
  if (layout.width === null || layout.height === null) {
    throw new Error("Expected a renderable node layout.");
  }
  return {
    height: layout.height,
    nodeId: layout.nodeId,
    width: layout.width,
    x: layout.x,
    y: layout.y,
    zIndex: layout.zIndex ?? 0,
  };
}

function activeSnapshot(
  sourceElement: HTMLElement,
  nodeId: string,
): GpuActiveNodeSnapshot {
  return {
    frame: 1,
    height: 50,
    nodeId,
    screenX: 10,
    screenY: 20,
    sourceElement,
    width: 100,
    zIndex: 2,
    zoom: 1,
  };
}

function createGpuPaintNodeElement(nodeId: string): HTMLElement {
  const element = document.createElement("div");
  element.dataset.gpuFlowNode = "true";
  element.dataset.id = nodeId;
  return element;
}

class ThrowOnMapIteration<K, V> extends Map<K, V> {
  iterationCount = 0;

  override [Symbol.iterator](): IterableIterator<[K, V]> {
    this.iterationCount += 1;
    throw new Error("Paint owner resolution must not iterate mounted nodes.");
  }

  override entries(): IterableIterator<[K, V]> {
    this.iterationCount += 1;
    throw new Error("Paint owner resolution must not iterate mounted nodes.");
  }
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
    evictNodeTextures: vi.fn(() => ({
      budgetBytes: Number.POSITIVE_INFINITY,
      evictedBytes: 0,
      evictedNodeIds: [],
      memory: EMPTY_TEXTURE_MEMORY_SNAPSHOT,
      memoryBefore: EMPTY_TEXTURE_MEMORY_SNAPSHOT,
      overBudgetBytes: 0,
      protectedNodeIds: [],
      reason: "node-layer-frame",
    })),
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

const EMPTY_TEXTURE_MEMORY_SNAPSHOT = {
  allocatedBytes: 0,
  largestTextureBytes: 0,
  textureCount: 0,
  visibleBytes: 0,
  visibleTextureCount: 0,
};

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
