/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectVisibleGpuNodeQuads,
  createGpuNodeDomTransformSyncCache,
  renderGpuNodeLayerFrame,
  syncGpuNodeDomTransformsFromQuads,
  type GpuNodeLayout,
  type GpuTexturedNodeQuad,
} from "../../src/gpuFlow/GpuNodeLayer";
import type { RenderNodeTextureQuadsInput } from "../../src/gpuFlow/gpuPipelines";
import { NodeTextureManager } from "../../src/gpuFlow/nodeTextures";
import {
  createGpuFlowLargeGraphStressFixture,
  moveGpuFlowStressFixtureNodes,
} from "./gpuFlowLargeGraphStressFixture";

describe("GPU flow large graph stress fixture", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("generates deterministic production GPU flow inputs for smoke, medium, and stress scales", () => {
    const smoke = createGpuFlowLargeGraphStressFixture({ scale: "smoke" });
    const medium = createGpuFlowLargeGraphStressFixture({ scale: "medium" });
    const stress = createGpuFlowLargeGraphStressFixture({ scale: "stress" });

    expect(smoke).toEqual(
      createGpuFlowLargeGraphStressFixture({ scale: "smoke" }),
    );
    expect(smoke.nodes).toHaveLength(250);
    expect(medium.nodes).toHaveLength(1_000);
    expect(stress.nodes).toHaveLength(5_000);
    expect(new Set(smoke.nodes.map((node) => node.width)).size).toBeGreaterThan(
      1,
    );
    expect(
      new Set(smoke.nodes.map((node) => node.height)).size,
    ).toBeGreaterThan(1);
    expect(smoke.edges.length).toBeGreaterThan(smoke.nodes.length);
    expect(smoke.edges[0]?.geometry.edgeId).toBe(smoke.edges[0]?.edgeId);
    expect(smoke.panViewports).toHaveLength(5);
    expect(smoke.zoomViewports.map((sample) => sample.zoom)).toEqual([
      0.5, 1, 2,
    ]);
  });

  it("keeps viewport-only movement on cached textures without passive uploads after warmup", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const fixture = createGpuFlowLargeGraphStressFixture({
      canvas: { height: 500, width: 800 },
      scale: "smoke",
    });
    const manager = new NodeTextureManager(gpu.device);
    const renderer = createFrameRenderer();
    const elements = createNodeElements(fixture.nodes);
    const viewport = fixture.zoomViewports[1]?.viewport;
    if (!viewport) {
      throw new Error("Expected a zoom 1 stress viewport.");
    }

    const warmup = renderGpuNodeLayerFrame({
      canvasSize: canvasSize(fixture.canvas),
      edges: fixture.edges,
      elementByNodeId: elements,
      frame: 1,
      marginCssPx: 0,
      nodes: fixture.nodes,
      renderer,
      textureManager: manager,
      viewport,
    });
    gpu.copyElementImageToTexture.mockClear();

    const viewportOnly = renderGpuNodeLayerFrame({
      canvasSize: canvasSize(fixture.canvas),
      deferResolutionUpdates: true,
      edges: fixture.edges,
      elementByNodeId: elements,
      frame: 2,
      marginCssPx: 0,
      nodes: fixture.nodes,
      renderer,
      textureManager: manager,
      viewport: [viewport[0] + 24, viewport[1] - 18, viewport[2]],
    });

    expect(warmup.uploadedNodeIds.length).toBeGreaterThan(0);
    expect(gpu.copyElementImageToTexture).not.toHaveBeenCalled();
    expect(viewportOnly.drawnEdgeIds).toHaveLength(fixture.edges.length);
    expect(viewportOnly.drawnNodeIds.length).toBeGreaterThan(0);
  });

  it("bounds DOM transform work to visible and previous-visible nodes in a medium graph", () => {
    const fixture = createGpuFlowLargeGraphStressFixture({
      canvas: { height: 500, width: 800 },
      scale: "medium",
    });
    const cache = createGpuNodeDomTransformSyncCache();
    const elements = createNodeElements(fixture.nodes);
    const firstViewport = fixture.panViewports[0]?.viewport;
    const secondViewport = fixture.panViewports[2]?.viewport;
    if (!firstViewport || !secondViewport) {
      throw new Error("Expected stress pan viewport samples.");
    }
    const firstQuads = collectVisibleGpuNodeQuads({
      canvasHeight: fixture.canvas.height,
      canvasWidth: fixture.canvas.width,
      marginCssPx: 0,
      nodes: fixture.nodes,
      viewport: firstViewport,
    });
    const secondQuads = collectVisibleGpuNodeQuads({
      canvasHeight: fixture.canvas.height,
      canvasWidth: fixture.canvas.width,
      marginCssPx: 0,
      nodes: fixture.nodes,
      viewport: secondViewport,
    });
    const resolvedNodeIds: string[] = [];
    const resolveElement = (nodeId: string) => {
      resolvedNodeIds.push(nodeId);
      return elements.get(nodeId);
    };

    syncGpuNodeDomTransformsFromQuads({
      cache,
      elementByNodeId: resolveElement,
      visibleQuads: firstQuads,
      viewport: firstViewport,
    });
    resolvedNodeIds.length = 0;
    const result = syncGpuNodeDomTransformsFromQuads({
      cache,
      elementByNodeId: resolveElement,
      visibleQuads: secondQuads,
      viewport: secondViewport,
    });

    const allowedNodeIds = new Set([
      ...firstQuads.map((quad) => quad.nodeId),
      ...secondQuads.map((quad) => quad.nodeId),
    ]);
    expect(fixture.nodes).toHaveLength(1_000);
    expect(firstQuads.length).toBeLessThan(fixture.nodes.length / 10);
    expect(secondQuads.length).toBeLessThan(fixture.nodes.length / 10);
    expect(resolvedNodeIds.every((nodeId) => allowedNodeIds.has(nodeId))).toBe(
      true,
    );
    expect(result.parkedNodeIds.length).toBeGreaterThan(0);
    expect(elements.get("stress-node-999")?.style.transform).toBe("");
  });

  it("covers node movement plus texture eviction and recapture on the production node-layer path", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const fixture = createGpuFlowLargeGraphStressFixture({
      canvas: { height: 420, width: 720 },
      scale: "smoke",
    });
    const manager = new NodeTextureManager(gpu.device);
    const renderer = createFrameRenderer();
    const elements = createNodeElements(fixture.nodes);
    const firstViewport = fixture.panViewports[0]?.viewport;
    const moveViewport = fixture.zoomViewports[1]?.viewport;
    if (!firstViewport || !moveViewport) {
      throw new Error("Expected stress viewport samples.");
    }
    const budgetBytes = 1_600_000;
    let frame = 1;
    const first = renderStressFrame({
      budgetBytes,
      elements,
      fixture,
      frame: frame++,
      manager,
      nodes: fixture.nodes,
      renderer,
      viewport: firstViewport,
    });
    const firstVisibleIds = new Set(first.visibleNodeIds);
    const evictedNodeIds = new Set<string>();

    for (const sample of fixture.panViewports.slice(1)) {
      const result = renderStressFrame({
        budgetBytes,
        elements,
        fixture,
        frame: frame++,
        manager,
        nodes: fixture.nodes,
        renderer,
        viewport: sample.viewport,
      });
      result.evictedTextureNodeIds.forEach((nodeId) =>
        evictedNodeIds.add(nodeId),
      );
    }

    const movedNodes = moveGpuFlowStressFixtureNodes({
      ...fixture.movement,
      nodes: fixture.nodes,
    });
    const movedNodeId = fixture.movement.nodeIds[0];
    const beforeMove = requireNode(fixture.nodes, movedNodeId);
    renderStressFrame({
      budgetBytes,
      elements,
      fixture,
      frame: frame++,
      manager,
      nodes: fixture.nodes,
      renderer,
      viewport: moveViewport,
    });
    renderStressFrame({
      budgetBytes,
      elements,
      fixture,
      frame: frame++,
      manager,
      nodes: movedNodes,
      renderer,
      viewport: moveViewport,
    });
    const movedRenderInput =
      renderer.render.mock.calls[renderer.render.mock.calls.length - 1]?.[0];
    const movedQuad = movedRenderInput?.quads.find(
      (quad) => quad.nodeId === movedNodeId,
    );
    gpu.copyElementImageToTexture.mockClear();
    const returned = renderStressFrame({
      budgetBytes,
      elements,
      fixture,
      frame: frame++,
      manager,
      nodes: fixture.nodes,
      renderer,
      viewport: firstViewport,
    });

    expect(evictedNodeIds.size).toBeGreaterThan(0);
    expect([...evictedNodeIds].some((nodeId) => firstVisibleIds.has(nodeId))).toBe(
      true,
    );
    expect(returned.uploadedNodeIds.some((nodeId) => firstVisibleIds.has(nodeId)))
      .toBe(true);
    expect(gpu.copyElementImageToTexture).toHaveBeenCalled();
    expect(movedQuad).toMatchObject({
      nodeId: movedNodeId,
      x: beforeMove.x + fixture.movement.dx,
      y: beforeMove.y + fixture.movement.dy,
    });
  });
});

function renderStressFrame({
  budgetBytes,
  elements,
  fixture,
  frame,
  manager,
  nodes,
  renderer,
  viewport,
}: {
  readonly budgetBytes: number;
  readonly elements: ReadonlyMap<string, HTMLElement>;
  readonly fixture: ReturnType<typeof createGpuFlowLargeGraphStressFixture>;
  readonly frame: number;
  readonly manager: NodeTextureManager;
  readonly nodes: readonly GpuNodeLayout[];
  readonly renderer: ReturnType<typeof createFrameRenderer>;
  readonly viewport: NonNullable<
    ReturnType<typeof createGpuFlowLargeGraphStressFixture>["panViewports"][number]
  >["viewport"];
}) {
  return renderGpuNodeLayerFrame({
    canvasSize: canvasSize(fixture.canvas),
    edges: fixture.edges,
    elementByNodeId: elements,
    frame,
    marginCssPx: 0,
    nodes,
    nodeTextureMemoryBudgetBytes: budgetBytes,
    renderer,
    textureManager: manager,
    viewport,
  });
}

function createNodeElements(
  nodes: readonly GpuNodeLayout[],
): Map<string, HTMLElement> {
  return new Map(
    nodes.map((node) => {
      const element = document.createElement("div");
      element.dataset.gpuFlowNode = "true";
      element.dataset.id = node.nodeId;
      return [node.nodeId, element];
    }),
  );
}

function requireNode(
  nodes: readonly GpuNodeLayout[],
  nodeId: string | undefined,
): GpuNodeLayout {
  const node = nodes.find((candidate) => candidate.nodeId === nodeId);
  if (!node) {
    throw new Error(`Expected stress node ${nodeId}.`);
  }
  return node;
}

function canvasSize(canvas: { readonly height: number; readonly width: number }) {
  return {
    cssHeight: canvas.height,
    cssWidth: canvas.width,
    devicePixelRatio: 2,
    pixelHeight: canvas.height * 2,
    pixelWidth: canvas.width * 2,
  };
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
  const device = {
    createSampler: vi.fn(() => ({}) as GPUSampler),
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
