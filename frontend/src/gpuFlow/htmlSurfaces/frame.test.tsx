/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGpuEdgeGeometry } from "../edges/edgeGeometry";
import type { GpuEdgeBufferInput } from "../edges/edgeGpuBuffers";
import { evaluateHtmlSurfaceSourcePolicy } from "./apiProbes";
import {
  buildHtmlSurfaceVisuals,
  buildTexturedGpuNodeQuads,
  collectVisibleGpuHtmlSurfaceOverlayQuads,
  collectVisibleGpuNodeQuads,
  configureGpuNodeHostElement,
  createGpuNodeDomTransformSyncCache,
  markHtmlSurfaceFramePaintDirty,
  renderHtmlSurfaceFrame,
  syncGpuNodeDomTransforms,
  syncGpuNodeDomTransformsFromQuads,
  type GpuHtmlSurfaceOverlayLayout,
  type GpuNodeLayout,
} from "./frame";
import type { RenderHtmlSurfacesInput } from "./renderer";
import { createTiledFlatSurfaceDrawTiles } from "./rendererTiledFlat";
import { HTML_SURFACE_PROJECTED_INTERACTION_ATTRIBUTE } from "./sourceDom";
import type {
  HtmlSurfaceTextureRecord,
  UploadDirtyHtmlSurfaceTexturesOptions,
} from "./textures";
import { HtmlSurfaceTextureManager } from "./textures";

describe("HTML surface frame helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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

  it("culls HTML surface overlays without merging them into node queries", () => {
    const overlays: GpuHtmlSurfaceOverlayLayout[] = [
      surfaceOverlay("visible-label", 20, 30, 80, 18, 1),
      surfaceOverlay("culled-label", 1_000, 1_000, 80, 18, 0),
    ];

    const quads = collectVisibleGpuHtmlSurfaceOverlayQuads({
      canvasHeight: 300,
      canvasWidth: 400,
      marginCssPx: 0,
      overlays,
      viewport: [0, 0, 1],
    });

    expect(quads).toEqual([
      {
        height: 18,
        nodeId: "visible-label",
        width: 80,
        x: 20,
        y: 30,
        zIndex: 1,
      },
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

  it("routes tiled texture records into the tiled-flat visual bucket", () => {
    const texture = textureRecord("large-node", {
      cssHeight: 100,
      cssWidth: 200,
      textureLayout: {
        columns: 2,
        kind: "tiled",
        maxTilePixelHeight: 128,
        maxTilePixelWidth: 128,
        rows: 1,
        tileCount: 2,
      },
      tiles: [
        {
          cssHeight: 100,
          cssWidth: 128,
          cssX: 0,
          cssY: 0,
          dirtyContent: false,
          dirtyResolution: false,
          lastUploadFrame: 1,
          pixelHeight: 100,
          pixelWidth: 128,
          sampler: {},
          surfaceId: "large-node",
          texture: {} as GPUTexture,
          textureBytes: 51_200,
          textureView: {},
          tileId: "large-node:0:0",
          u0: 0,
          u1: 0.5,
          v0: 0,
          v1: 1,
        },
        {
          cssHeight: 100,
          cssWidth: 72,
          cssX: 128,
          cssY: 0,
          dirtyContent: false,
          dirtyResolution: false,
          lastUploadFrame: 1,
          pixelHeight: 100,
          pixelWidth: 72,
          sampler: {},
          surfaceId: "large-node",
          texture: {} as GPUTexture,
          textureBytes: 28_800,
          textureView: {},
          tileId: "large-node:1:0",
          u0: 0.5,
          u1: 1,
          v0: 0,
          v1: 1,
        },
      ],
    });

    expect(
      buildHtmlSurfaceVisuals([
        {
          height: 100,
          nodeId: "large-node",
          texture,
          width: 200,
          x: 10,
          y: 20,
          zIndex: 3,
        },
      ]),
    ).toEqual({
      flatSurfaces: [],
      tiledFlatSurfaces: [
        {
          kind: "tiled-flat",
          rect: { height: 100, width: 200, x: 10, y: 20 },
          surfaceId: "large-node",
          texture,
          tiles: texture.tiles,
          zIndex: 3,
        },
      ],
    });
  });

  it("stretches tiled texture tiles across resized visual quads", () => {
    const texture = textureRecord("large-node", {
      cssHeight: 100,
      cssWidth: 200,
      textureLayout: {
        columns: 2,
        kind: "tiled",
        maxTilePixelHeight: 128,
        maxTilePixelWidth: 128,
        rows: 1,
        tileCount: 2,
      },
      tiles: [
        {
          cssHeight: 100,
          cssWidth: 128,
          cssX: 0,
          cssY: 0,
          dirtyContent: false,
          dirtyResolution: false,
          lastUploadFrame: 1,
          pixelHeight: 100,
          pixelWidth: 128,
          sampler: {},
          surfaceId: "large-node",
          texture: {} as GPUTexture,
          textureBytes: 51_200,
          textureView: {},
          tileId: "large-node:0:0",
          u0: 0,
          u1: 0.64,
          v0: 0,
          v1: 1,
        },
        {
          cssHeight: 100,
          cssWidth: 72,
          cssX: 128,
          cssY: 0,
          dirtyContent: false,
          dirtyResolution: false,
          lastUploadFrame: 1,
          pixelHeight: 100,
          pixelWidth: 72,
          sampler: {},
          surfaceId: "large-node",
          texture: {} as GPUTexture,
          textureBytes: 28_800,
          textureView: {},
          tileId: "large-node:1:0",
          u0: 0.64,
          u1: 1,
          v0: 0,
          v1: 1,
        },
      ],
    });

    expect(
      createTiledFlatSurfaceDrawTiles([
        {
          kind: "tiled-flat",
          rect: { height: 150, width: 400, x: 10, y: 20 },
          surfaceId: "large-node",
          texture,
          tiles: texture.tiles,
          zIndex: 3,
        },
      ]),
    ).toMatchObject([
      {
        height: 150,
        surfaceId: "large-node:0:0",
        width: 256,
        x: 10,
        y: 20,
      },
      {
        height: 150,
        surfaceId: "large-node:1:0",
        width: 144,
        x: 266,
        y: 20,
      },
    ]);
  });

  it("configures node source hosts without hidden-source styles", () => {
    const canvas = document.createElement("canvas");
    const host = document.createElement("div");
    host.style.visibility = "hidden";
    canvas.append(host);
    document.body.append(canvas);
    mockElementBox(host, {
      bottom: 60,
      height: 60,
      left: 0,
      right: 120,
      width: 120,
    });

    configureGpuNodeHostElement({
      className: "setta-gpu-flow__html-source setta-gpu-flow__node",
      host,
      node: node("source-a", 0, 0, 120, 60, 0),
    });

    expect(host.style.visibility).toBe("");
    expect(evaluateHtmlSurfaceSourcePolicy(canvas, host)).toEqual({
      issues: [],
      ok: true,
    });

    canvas.remove();
  });

  it("synchronizes stable source geometry without viewport placement", () => {
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
        node("visible", 10, 20, 100, 50, 5),
        node("culled", 30, 40, 100, 50, 0),
      ],
      visibleNodeIds: new Set(["visible"]),
      viewport: { x: 5, y: -10, zoom: 1.5 },
    });

    expect(visible.style.position).toBe("absolute");
    expect(visible.style.height).toBe("50px");
    expect(visible.style.transformOrigin).toBe("0 0");
    expect(visible.style.transform).toBe("translate(0px, 0px) scale(1)");
    expect(visible.style.pointerEvents).toBe("none");
    expect(visible.style.width).toBe("100px");
    expect(visible.style.zIndex).toBe("5");
    expect(visible.dataset.gpuFlowInteractive).toBe("true");
    expect(
      visible.classList.contains("setta-gpu-flow__node--interactive"),
    ).toBe(true);
    expect(culled.style.transform).toBe("translate(0px, 0px) scale(1)");
    expect(culled.style.height).toBe("");
    expect(culled.style.pointerEvents).toBe("none");
    expect(culled.style.width).toBe("");
    expect(culled.style.zIndex).toBe("");
    expect(culled.dataset.gpuFlowInteractive).toBe("false");
  });

  it("keeps active source hosts passive unless they are projected", () => {
    const visible = document.createElement("div");
    const elements = new Map([["visible", visible]]);
    const nodes = [node("visible", 10, 20, 100, 50, 5)];

    syncGpuNodeDomTransforms({
      activeNodeIds: ["visible"],
      elementByNodeId: elements,
      nodes,
      visibleNodeIds: new Set(["visible"]),
      viewport: [0, 0, 1],
    });

    expect(visible.dataset.gpuFlowInteractive).toBe("true");
    expect(visible.style.pointerEvents).toBe("none");
    expect(visible.style.transform).toBe("translate(0px, 0px) scale(1)");

    visible.setAttribute(HTML_SURFACE_PROJECTED_INTERACTION_ATTRIBUTE, "true");
    visible.style.transform = "translate(40px, 50px)";
    syncGpuNodeDomTransforms({
      activeNodeIds: ["visible"],
      elementByNodeId: elements,
      nodes,
      visibleNodeIds: new Set(["visible"]),
      viewport: [0, 0, 1],
    });

    expect(visible.style.pointerEvents).toBe("auto");
    expect(visible.style.transform).toBe("translate(40px, 50px)");

    visible.removeAttribute(HTML_SURFACE_PROJECTED_INTERACTION_ATTRIBUTE);
    syncGpuNodeDomTransforms({
      activeNodeIds: ["visible"],
      elementByNodeId: elements,
      nodes,
      visibleNodeIds: new Set(["visible"]),
      viewport: [0, 0, 1],
    });

    expect(visible.style.pointerEvents).toBe("none");
    expect(visible.style.transform).toBe("translate(0px, 0px) scale(1)");
  });

  it("syncs stable source geometry from visible and previous-visible diffs", () => {
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

    expect(resolvedNodeIds).toEqual(["node-10", "node-11", "node-500"]);
    expect(result.updatedNodeIds).toEqual(["node-500"]);
    expect(result.parkedNodeIds).toEqual([]);
    expect(elements.get("node-10")?.style.transform).toBe(
      "translate(0px, 0px) scale(1)",
    );
    expect(elements.get("node-10")?.style.width).toBe("10px");
    expect(elements.get("node-12")?.style.transform).toBe(
      "translate(0px, 0px) scale(1)",
    );
    expect(elements.get("node-12")?.style.width).toBe("10px");
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
    expect(element.style.transform).toBe("translate(0px, 0px) scale(1)");
    expect(element.style.height).toBe("10px");
    expect(element.style.width).toBe("10px");
    expect(element.style.zIndex).toBe("0");
  });

  it("rewrites DOM hit-target z-index when node stacking changes", () => {
    const element = document.createElement("div");
    const cache = createGpuNodeDomTransformSyncCache();

    syncGpuNodeDomTransformsFromQuads({
      cache,
      elementByNodeId: new Map([["node-a", element]]),
      visibleQuads: [
        { height: 10, nodeId: "node-a", width: 20, x: 10, y: 20, zIndex: 2 },
      ],
      viewport: [0, 0, 1],
    });
    const result = syncGpuNodeDomTransformsFromQuads({
      cache,
      elementByNodeId: new Map([["node-a", element]]),
      visibleQuads: [
        { height: 10, nodeId: "node-a", width: 20, x: 10, y: 20, zIndex: 7 },
      ],
      viewport: [0, 0, 1],
    });

    expect(result.updatedNodeIds).toEqual(["node-a"]);
    expect(result.skippedNodeIds).toEqual([]);
    expect(element.style.transform).toBe("translate(0px, 0px) scale(1)");
    expect(element.style.zIndex).toBe("7");
  });

  it("rewrites DOM hit-target dimensions when node geometry changes", () => {
    const element = document.createElement("div");
    const cache = createGpuNodeDomTransformSyncCache();

    syncGpuNodeDomTransformsFromQuads({
      cache,
      elementByNodeId: new Map([["node-a", element]]),
      visibleQuads: [
        { height: 10, nodeId: "node-a", width: 20, x: 10, y: 20, zIndex: 0 },
      ],
      viewport: [0, 0, 1],
    });
    const result = syncGpuNodeDomTransformsFromQuads({
      cache,
      elementByNodeId: new Map([["node-a", element]]),
      visibleQuads: [
        { height: 12, nodeId: "node-a", width: 24, x: 10, y: 20, zIndex: 0 },
      ],
      viewport: [0, 0, 1],
    });

    expect(result.updatedNodeIds).toEqual(["node-a"]);
    expect(result.skippedNodeIds).toEqual([]);
    expect(element.style.height).toBe("12px");
    expect(element.style.width).toBe("24px");
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
    expect(element.style.transform).toBe("translate(0px, 0px) scale(1)");
    expect(element.style.pointerEvents).toBe("auto");
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

    const result = renderHtmlSurfaceFrame({
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

    expect(manager.registerSurfaceTexture).toHaveBeenCalledTimes(1);
    expect(manager.registerSurfaceTexture).toHaveBeenCalledWith({
      cssHeight: 50,
      cssWidth: 100,
      devicePixelRatio: 2,
      element: visible,
      frame: 1,
      priority: "interactive",
      surfaceId: "visible",
      zoom: 1.5,
    });
    expect(manager.uploadDirtySurfaceTextures).toHaveBeenCalledWith({
      frame: 1,
    });
    expect(renderer.render).toHaveBeenCalledWith({
      canvasSize: canvasSize(),
      clearColor: undefined,
      scene: expect.objectContaining({
        flatSurfaces: [
          expect.objectContaining({
            kind: "flat",
            surfaceId: "visible",
            texture: expect.objectContaining({
              lastUploadFrame: 1,
            }),
          }),
        ],
      }),
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
    expect(visible.style.transform).toBe("translate(0px, 0px) scale(1)");
    expect(culled.style.pointerEvents).toBe("none");
  });

  it("renders HTML surface overlays after node surfaces without counting them as nodes", () => {
    const nodeElement = document.createElement("div");
    const labelElement = document.createElement("div");
    const manager = createFrameTextureManager();
    const renderer = createFrameRenderer();

    const result = renderHtmlSurfaceFrame({
      canvasSize: canvasSize(),
      elementByNodeId: new Map([
        ["front-node", nodeElement],
        ["edge-label:edge-a", labelElement],
      ]),
      frame: 1,
      htmlSurfaceOverlays: [
        surfaceOverlay("edge-label:edge-a", 40, 60, 80, 18, 0),
      ],
      nodes: [node("front-node", 10, 20, 100, 50, 100)],
      renderer,
      textureManager: manager,
      viewport: [0, 0, 1],
    });

    expect(manager.registerSurfaceTexture).toHaveBeenCalledWith(
      expect.objectContaining({
        element: nodeElement,
        surfaceId: "front-node",
      }),
    );
    expect(manager.registerSurfaceTexture).toHaveBeenCalledWith(
      expect.objectContaining({
        element: labelElement,
        surfaceId: "edge-label:edge-a",
      }),
    );
    expect(renderer.render).toHaveBeenCalledWith(
      expect.objectContaining({
        scene: expect.objectContaining({
          flatSurfaces: [
            expect.objectContaining({
              surfaceId: "front-node",
              zIndex: 100,
            }),
            expect.objectContaining({
              surfaceId: "edge-label:edge-a",
              zIndex: 0,
            }),
          ],
        }),
      }),
    );
    expect(result.drawnNodeIds).toEqual(["front-node"]);
    expect(result.uploadedNodeIds).toEqual(["front-node"]);
    expect(result.visibleNodeIds).toEqual(["front-node"]);
  });

  it("defers non-active resolution upgrades during viewport interactions", () => {
    const visible = document.createElement("div");
    const elements = new Map([["visible", visible]]);
    const manager = createFrameTextureManager();
    const renderer = createFrameRenderer();

    renderHtmlSurfaceFrame({
      canvasSize: canvasSize(),
      deferResolutionUpdates: true,
      elementByNodeId: elements,
      frame: 1,
      nodes: [node("visible", 10, 20, 100, 50, 0)],
      renderer,
      textureManager: manager,
      viewport: [0, 0, 1.5],
    });

    expect(manager.registerSurfaceTexture).toHaveBeenCalledWith({
      cssHeight: 50,
      cssWidth: 100,
      deferResolution: true,
      devicePixelRatio: 2,
      element: visible,
      frame: 1,
      priority: "visible",
      surfaceId: "visible",
      zoom: 1.5,
    });
    expect(manager.uploadDirtySurfaceTextures).toHaveBeenCalledWith({
      deferPassiveUploads: true,
      frame: 1,
    });
  });

  it("skips source transform sync and texture uploads during active viewport pan/zoom frames", () => {
    const previouslyVisible = document.createElement("div");
    const newlyVisible = document.createElement("div");
    const elements = new Map([
      ["previously-visible", previouslyVisible],
      ["newly-visible", newlyVisible],
    ]);
    const manager = createFrameTextureManager();
    const renderer = createFrameRenderer();
    const cache = createGpuNodeDomTransformSyncCache();
    const nodes = [
      node("previously-visible", 0, 0, 100, 50, 0),
      node("newly-visible", 1_000, 0, 100, 50, 0),
    ];

    renderHtmlSurfaceFrame({
      canvasSize: canvasSize(),
      domTransformCache: cache,
      elementByNodeId: elements,
      frame: 1,
      marginCssPx: 0,
      nodes,
      renderer,
      textureManager: manager,
      viewport: [0, 0, 1],
    });
    manager.registerSurfaceTexture.mockClear();
    manager.uploadDirtySurfaceTextures.mockClear();

    const result = renderHtmlSurfaceFrame({
      canvasSize: canvasSize(),
      deferResolutionUpdates: true,
      domTransformCache: cache,
      elementByNodeId: elements,
      frame: 2,
      marginCssPx: 0,
      nodes,
      renderer,
      skipSourceDomTransformSync: true,
      skipTextureUploads: true,
      textureManager: manager,
      viewport: [-1_000, 0, 1],
    });

    expect(newlyVisible.style.transform).toBe("");
    expect(result.domTransformUpdatedNodeIds).toEqual([]);
    expect(manager.registerSurfaceTexture).toHaveBeenCalledWith(
      expect.objectContaining({
        deferResolution: true,
        element: newlyVisible,
        surfaceId: "newly-visible",
      }),
    );
    expect(manager.uploadDirtySurfaceTextures).not.toHaveBeenCalled();
    expect(result.uploadedNodeIds).toEqual([]);
  });

  it("marks active resize nodes for deferred rerasterization", () => {
    const active = document.createElement("div");
    const passive = document.createElement("div");
    const elements = new Map([
      ["active", active],
      ["passive", passive],
    ]);
    const manager = createFrameTextureManager();
    const renderer = createFrameRenderer();

    renderHtmlSurfaceFrame({
      activeNodeId: "active",
      canvasSize: canvasSize(),
      deferRerasterizationNodeIds: ["active"],
      deferResolutionUpdates: true,
      elementByNodeId: elements,
      frame: 1,
      nodes: [
        node("active", 10, 20, 100, 50, 2),
        node("passive", 40, 60, 100, 50, 1),
      ],
      renderer,
      textureManager: manager,
      viewport: [0, 0, 1.5],
    });

    expect(manager.registerSurfaceTexture).toHaveBeenCalledWith({
      cssHeight: 50,
      cssWidth: 100,
      deferRerasterization: true,
      devicePixelRatio: 2,
      element: active,
      frame: 1,
      priority: "interactive",
      surfaceId: "active",
      zoom: 1.5,
    });
    expect(manager.registerSurfaceTexture).toHaveBeenCalledWith({
      cssHeight: 50,
      cssWidth: 100,
      deferResolution: true,
      devicePixelRatio: 2,
      element: passive,
      frame: 1,
      priority: "visible",
      surfaceId: "passive",
      zoom: 1.5,
    });
  });

  it("keeps active node GPU quads rendered during interaction", () => {
    const active = document.createElement("div");
    const passive = document.createElement("div");
    const elements = new Map([
      ["active", active],
      ["passive", passive],
    ]);
    const manager = createFrameTextureManager();
    const renderer = createFrameRenderer();

    const result = renderHtmlSurfaceFrame({
      activeNodeId: "active",
      canvasSize: canvasSize(),
      elementByNodeId: elements,
      frame: 1,
      nodes: [
        node("active", 10, 20, 100, 50, 2),
        node("passive", 40, 60, 100, 50, 1),
      ],
      renderer,
      textureManager: manager,
      viewport: [0, 0, 1],
    });

    expect(manager.registerSurfaceTexture).toHaveBeenCalledWith(
      expect.objectContaining({
        element: active,
        priority: "interactive",
        surfaceId: "active",
      }),
    );
    expect(manager.uploadDirtySurfaceTextures).toHaveBeenCalledWith({
      frame: 1,
    });
    expect(renderer.render).toHaveBeenCalledWith(
      expect.objectContaining({
        scene: expect.objectContaining({
          flatSurfaces: [
            expect.objectContaining({
              surfaceId: "passive",
            }),
            expect.objectContaining({
              surfaceId: "active",
            }),
          ],
        }),
      }),
    );
    expect(result.drawnNodeIds).toEqual(["passive", "active"]);
    expect(result.visibleNodeIds).toEqual(["passive", "active"]);
  });

  it("forwards upload byte budgets to the texture manager", () => {
    const visible = document.createElement("div");
    const manager = createFrameTextureManager();
    const renderer = createFrameRenderer();

    renderHtmlSurfaceFrame({
      canvasSize: canvasSize(),
      elementByNodeId: new Map([["visible", visible]]),
      frame: 1,
      nodes: [node("visible", 10, 20, 100, 50, 0)],
      renderer,
      textureManager: manager,
      uploadBudget: {
        maxBytes: 1_048_576,
        maxDurationMs: 4,
        maxUploads: 2,
      },
      viewport: [0, 0, 1],
    });

    expect(manager.uploadDirtySurfaceTextures).toHaveBeenCalledWith({
      frame: 1,
      maxBytes: 1_048_576,
      maxDurationMs: 4,
      maxUploads: 2,
    });
  });

  it("reports texture eviction and memory summaries from the manager", () => {
    const visible = document.createElement("div");
    const manager = createFrameTextureManager();
    const renderer = createFrameRenderer();
    manager.evictSurfaceTextures.mockReturnValueOnce({
      budgetBytes: 800,
      evictedBytes: 400,
      evictedSurfaceIds: ["offscreen"],
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
      protectedSurfaceIds: ["visible"],
      reason: "html-surface-frame",
    });

    const result = renderHtmlSurfaceFrame({
      activeNodeId: "visible",
      canvasSize: canvasSize(),
      elementByNodeId: new Map([["visible", visible]]),
      frame: 1,
      nodes: [node("visible", 10, 20, 100, 50, 0)],
      renderer,
      textureManager: manager,
      viewport: [0, 0, 1],
    });

    expect(manager.evictSurfaceTextures).toHaveBeenCalledWith({
      protectedSurfaceIds: expect.any(Set),
      reason: "html-surface-frame",
      visibleSurfaceIds: expect.any(Set),
    });
    const evictionInput = manager.evictSurfaceTextures.mock.calls[0]?.[0];
    expect([...(evictionInput?.visibleSurfaceIds ?? [])]).toEqual(["visible"]);
    expect([...(evictionInput?.protectedSurfaceIds ?? [])]).toEqual([
      "visible",
    ]);
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

  it("passes the configured texture memory budget to frame eviction", () => {
    const visible = document.createElement("div");
    const manager = createFrameTextureManager();
    const renderer = createFrameRenderer();

    renderHtmlSurfaceFrame({
      activeNodeId: "visible",
      canvasSize: canvasSize(),
      elementByNodeId: new Map([["visible", visible]]),
      frame: 1,
      nodes: [node("visible", 10, 20, 100, 50, 0)],
      nodeTextureMemoryBudgetBytes: 1_048_576,
      renderer,
      textureManager: manager,
      viewport: [0, 0, 1],
    });

    expect(manager.evictSurfaceTextures).toHaveBeenCalledWith({
      budgetBytes: 1_048_576,
      protectedSurfaceIds: expect.any(Set),
      reason: "html-surface-frame",
      visibleSurfaceIds: expect.any(Set),
    });
  });

  it("redraws viewport-only movement from cached textures without another element upload", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device);
    const renderer = createFrameRenderer();
    const element = document.createElement("div");
    const elements = new Map([["node-a", element]]);
    const nodes = [node("node-a", 10, 20, 100, 50, 0)];
    const domTransformCache = createGpuNodeDomTransformSyncCache();

    const firstFrame = renderHtmlSurfaceFrame({
      canvasSize: canvasSize(),
      domTransformCache,
      elementByNodeId: elements,
      frame: 1,
      nodes,
      renderer,
      textureManager: manager,
      viewport: [0, 0, 1],
    });
    const secondFrame = renderHtmlSurfaceFrame({
      canvasSize: canvasSize(),
      domTransformCache,
      elementByNodeId: elements,
      frame: 2,
      nodes,
      renderer,
      textureManager: manager,
      viewport: [25, -15, 1],
    });

    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(1);
    expect(firstFrame.domTransformUpdatedNodeIds).toEqual(["node-a"]);
    expect(secondFrame.domTransformUpdatedNodeIds).toEqual([]);
    expect(secondFrame.domTransformParkedNodeIds).toEqual([]);
    expect(element.style.transform).toBe("translate(0px, 0px) scale(1)");
    expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(renderer.render.mock.calls[1]?.[0]).toMatchObject({
      scene: expect.objectContaining({
        flatSurfaces: [
          expect.objectContaining({
            surfaceId: "node-a",
            texture: expect.objectContaining({
              lastUploadFrame: 1,
            }),
          }),
        ],
      }),
      viewport: [25, -15, 1],
    });
  });

  it("passes renderable GPU edges into the scene renderer", () => {
    const element = document.createElement("div");
    const manager = createFrameTextureManager();
    const renderer = createFrameRenderer();
    const edgeInput = edge("edge-a", 0, 0, 100, 0);

    const result = renderHtmlSurfaceFrame({
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

    renderHtmlSurfaceFrame({
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
      scene: expect.objectContaining({
        flatSurfaces: [],
      }),
      viewport: [0, 0, 1],
    });
  });

  it("renders edge-only frames without registering node textures", () => {
    const manager = createFrameTextureManager();
    const renderer = createFrameRenderer();
    const edgeInput = edge("edge-a", 0, 0, 100, 0);

    const result = renderHtmlSurfaceFrame({
      canvasSize: canvasSize(),
      edges: [edgeInput],
      elementByNodeId: new Map(),
      frame: 1,
      nodes: [],
      renderer,
      textureManager: manager,
      viewport: [0, 0, 1],
    });

    expect(manager.registerSurfaceTexture).not.toHaveBeenCalled();
    expect(manager.uploadDirtySurfaceTextures).toHaveBeenCalledWith({
      frame: 1,
    });
    expect(renderer.render).toHaveBeenCalledWith({
      canvasSize: canvasSize(),
      clearColor: undefined,
      edges: [edgeInput],
      scene: expect.objectContaining({
        flatSurfaces: [],
      }),
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
      variant: "dots",
    } as const;

    renderHtmlSurfaceFrame({
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
      scene: expect.objectContaining({
        flatSurfaces: [],
      }),
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
      markSurfaceTextureDirty: vi.fn(),
    };

    const dirtyNodeIds = markHtmlSurfaceFramePaintDirty({
      changedElements: [input],
      elementByNodeId,
      frame: 7,
      textureManager: manager,
    });

    expect(dirtyNodeIds).toEqual(["node-a"]);
    expect(elementByNodeId.iterationCount).toBe(0);
    expect(manager.markSurfaceTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 7,
      reason: "paint",
      requestPaint: false,
      surfaceId: "node-a",
    });
  });

  it("marks a changed GPU node wrapper dirty", () => {
    const nodeElement = createGpuPaintNodeElement("node-a");
    const manager = {
      markSurfaceTextureDirty: vi.fn(),
    };

    const dirtyNodeIds = markHtmlSurfaceFramePaintDirty({
      changedElements: [nodeElement],
      elementByNodeId: new Map([["node-a", nodeElement]]),
      frame: 8,
      textureManager: manager,
    });

    expect(dirtyNodeIds).toEqual(["node-a"]);
    expect(manager.markSurfaceTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 8,
      reason: "paint",
      requestPaint: false,
      surfaceId: "node-a",
    });
  });

  it("ignores direct node-wrapper paints caused by viewport transform sync", () => {
    const nodeElement = createGpuPaintNodeElement("node-a");
    const child = document.createElement("input");
    nodeElement.append(child);
    const manager = {
      markSurfaceTextureDirty: vi.fn(),
    };

    const dirtyNodeIds = markHtmlSurfaceFramePaintDirty({
      changedElements: [nodeElement, child],
      elementByNodeId: new Map([["node-a", nodeElement]]),
      frame: 9,
      ignoreDirectNodeIds: new Set(["node-a"]),
      textureManager: manager,
    });

    expect(dirtyNodeIds).toEqual(["node-a"]);
    expect(manager.markSurfaceTextureDirty).toHaveBeenCalledTimes(1);
    expect(manager.markSurfaceTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 9,
      reason: "paint",
      requestPaint: false,
      surfaceId: "node-a",
    });
  });

  it("does not dirty transform-only node-wrapper paints", () => {
    const nodeElement = createGpuPaintNodeElement("node-a");
    const manager = {
      markSurfaceTextureDirty: vi.fn(),
    };

    const dirtyNodeIds = markHtmlSurfaceFramePaintDirty({
      changedElements: [nodeElement],
      elementByNodeId: new Map([["node-a", nodeElement]]),
      frame: 9,
      ignoreDirectNodeIds: ["node-a"],
      textureManager: manager,
    });

    expect(dirtyNodeIds).toEqual([]);
    expect(manager.markSurfaceTextureDirty).not.toHaveBeenCalled();
  });

  it("ignores resize-rerasterization paints anywhere in a deferred node subtree", () => {
    const nodeElement = createGpuPaintNodeElement("node-a");
    const child = document.createElement("input");
    nodeElement.append(child);
    const manager = {
      markSurfaceTextureDirty: vi.fn(),
    };

    const dirtyNodeIds = markHtmlSurfaceFramePaintDirty({
      changedElements: [child],
      elementByNodeId: new Map([["node-a", nodeElement]]),
      frame: 9,
      ignoreContentNodeIds: ["node-a"],
      textureManager: manager,
    });

    expect(dirtyNodeIds).toEqual([]);
    expect(manager.markSurfaceTextureDirty).not.toHaveBeenCalled();
  });

  it("uses the narrow ancestor fallback only for a single registered node subtree", () => {
    const nodeElement = createGpuPaintNodeElement("node-a");
    const wrapper = document.createElement("div");
    wrapper.append(nodeElement);
    const manager = {
      markSurfaceTextureDirty: vi.fn(),
    };

    const dirtyNodeIds = markHtmlSurfaceFramePaintDirty({
      changedElements: [wrapper],
      elementByNodeId: new Map([["node-a", nodeElement]]),
      frame: 9,
      textureManager: manager,
    });

    expect(dirtyNodeIds).toEqual(["node-a"]);
    expect(manager.markSurfaceTextureDirty).toHaveBeenCalledWith({
      content: true,
      frame: 9,
      reason: "paint",
      requestPaint: false,
      surfaceId: "node-a",
    });
  });

  it("does not dirty visible nodes when a paint event omits changed elements", () => {
    const nodeElement = createGpuPaintNodeElement("node-a");
    const manager = {
      markSurfaceTextureDirty: vi.fn(),
    };

    const dirtyNodeIds = markHtmlSurfaceFramePaintDirty({
      elementByNodeId: new Map([["node-a", nodeElement]]),
      frame: 8,
      textureManager: manager,
    });

    expect(dirtyNodeIds).toEqual([]);
    expect(manager.markSurfaceTextureDirty).not.toHaveBeenCalled();
  });

  it("ignores unrelated and canvas-level paint changes", () => {
    const nodeElement = createGpuPaintNodeElement("node-a");
    const canvas = document.createElement("canvas");
    const unrelated = document.createElement("div");
    canvas.dataset.gpuFlowSurface = "true";
    canvas.append(nodeElement);
    const manager = {
      markSurfaceTextureDirty: vi.fn(),
    };

    const dirtyNodeIds = markHtmlSurfaceFramePaintDirty({
      changedElements: [unrelated, canvas],
      elementByNodeId: new Map([["node-a", nodeElement]]),
      frame: 10,
      textureManager: manager,
    });

    expect(dirtyNodeIds).toEqual([]);
    expect(manager.markSurfaceTextureDirty).not.toHaveBeenCalled();
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

function surfaceOverlay(
  surfaceId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  zIndex: number,
): GpuHtmlSurfaceOverlayLayout {
  return {
    height,
    surfaceId,
    width,
    x,
    y,
    zIndex,
  };
}

function mockElementBox(
  element: HTMLElement,
  rect: Pick<DOMRect, "bottom" | "height" | "left" | "right" | "width">,
) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    ...rect,
    x: rect.left,
    y: rect.bottom - rect.height,
    toJSON: () => rect,
  } as DOMRect);
  vi.spyOn(element, "getClientRects").mockReturnValue({
    length: 1,
  } as DOMRectList);
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

function createGpuPaintNodeElement(nodeId: string): HTMLElement {
  const element = document.createElement("div");
  element.dataset.gpuFlowHtmlSource = "true";
  element.setAttribute("data-gpu-flow-source-id", nodeId);
  element.dataset.gpuFlowNode = "true";
  element.dataset.id = nodeId;
  return element;
}

class ThrowOnMapIteration<K, V> extends Map<K, V> {
  iterationCount = 0;

  override [Symbol.iterator](): MapIterator<[K, V]> {
    this.iterationCount += 1;
    throw new Error("Paint owner resolution must not iterate mounted nodes.");
  }

  override entries(): MapIterator<[K, V]> {
    this.iterationCount += 1;
    throw new Error("Paint owner resolution must not iterate mounted nodes.");
  }
}

function textureRecord(
  nodeId: string,
  overrides: Partial<HtmlSurfaceTextureRecord> = {},
): HtmlSurfaceTextureRecord {
  return {
    lastUploadFrame: 0,
    sampler: {},
    surfaceId: nodeId,
    texture: {},
    textureBytes: 0,
    textureLayout: { kind: "single", tileCount: 1 },
    textureView: {},
    tiles: [],
    ...overrides,
  } as HtmlSurfaceTextureRecord;
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
  const records = new Map<string, HtmlSurfaceTextureRecord>();
  type EvictSurfaceTexturesInput = {
    readonly budgetBytes?: number | undefined;
    readonly protectedSurfaceIds?:
      | ReadonlySet<string>
      | readonly string[]
      | undefined;
    readonly reason?: string | undefined;
    readonly visibleSurfaceIds?:
      | ReadonlySet<string>
      | readonly string[]
      | undefined;
  };
  const manager = {
    evictSurfaceTextures: vi.fn((input?: EvictSurfaceTexturesInput) => {
      void input;
      return {
        budgetBytes: Number.POSITIVE_INFINITY,
        evictedBytes: 0,
        evictedSurfaceIds: [] as string[],
        memory: EMPTY_TEXTURE_MEMORY_SNAPSHOT,
        memoryBefore: EMPTY_TEXTURE_MEMORY_SNAPSHOT,
        overBudgetBytes: 0,
        protectedSurfaceIds: [] as string[],
        reason: "html-surface-frame",
      };
    }),
    getSurfaceTexture: vi.fn((nodeId: string) => records.get(nodeId)),
    markSurfaceTextureDirty: vi.fn(),
    registerSurfaceTexture: vi.fn(
      ({ surfaceId }: { readonly surfaceId: string }) => {
        const record = textureRecord(surfaceId) as HtmlSurfaceTextureRecord & {
          lastUploadFrame: number;
        };
        record.lastUploadFrame = -1;
        records.set(surfaceId, record);
        return record;
      },
    ),
    uploadDirtySurfaceTextures: vi.fn(
      ({ frame }: UploadDirtyHtmlSurfaceTexturesOptions) => {
        const uploaded = Array.from(records.values()) as Array<
          HtmlSurfaceTextureRecord & { lastUploadFrame: number }
        >;
        uploaded.forEach((record) => {
          record.lastUploadFrame = frame;
        });
        return {
          budgetExhausted: false,
          diagnostics: [],
          remainingDirtySurfaceIds: [],
          skippedSurfaceIds: [],
          skippedUploadBytes: 0,
          uploaded,
          uploadedBytes: uploaded.reduce(
            (bytes, record) => bytes + record.textureBytes,
            0,
          ),
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
    render: vi.fn(({ edges, scene }: RenderHtmlSurfacesInput) => ({
      drawnEdgeIds: edges?.map((edge) => edge.edgeId) ?? [],
      drawnSurfaceIds: scene.flatSurfaces.map((surface) => surface.surfaceId),
      edgeVertexCount: (edges?.length ?? 0) * 2,
      vertexCount: scene.flatSurfaces.length * 6,
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
