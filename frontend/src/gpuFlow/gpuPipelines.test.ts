/* @vitest-environment jsdom */

import { BackgroundVariantEnum } from "utils/generatedTypes";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGpuEdgeGeometry } from "./edges/edgeGeometry";
import type { GpuEdgeBufferInput } from "./edges/edgeGpuBuffers";
import type { HtmlSurfaceRenderRuntime } from "./gpuPipelines";
import {
  buildFlatSurfaceVertexData,
  buildMeshSurfaceVertexCache,
  encodeGpuEdgePaletteUniform,
  encodeGpuGridUniform,
  parseGpuGridColor,
} from "./gpuPipelines";
import {
  encodeHtmlSurfaceCameraUniform,
  HtmlSurfaceRenderer,
} from "./htmlSurfaces/renderer";
import {
  HTML_SURFACE_RIPPLE_EFFECT_ID,
  HTML_SURFACE_RIPPLE_PROJECTOR_ID,
} from "./htmlSurfaces/shaderEffects";
import type { HtmlSurfaceTextureRecord } from "./htmlSurfaces/textures";
import {
  createHtmlSurfaceVisualScene,
  type HtmlSurfaceEffectVisual,
  type HtmlSurfaceFlatVisual,
  type HtmlSurfaceMeshVisual,
  type HtmlSurfaceTiledFlatVisual,
} from "./htmlSurfaces/visualScene";

describe("html surface renderer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("encodes the camera uniform for the flat surface shader", () => {
    expect(
      Array.from(
        encodeHtmlSurfaceCameraUniform({
          canvasHeight: 600,
          canvasWidth: 800,
          viewport: [10, 20, 2],
        }),
      ),
    ).toEqual([10, 20, 2, 0, 800, 600, 0, 0]);
  });

  it("builds two triangles per flat surface in flow coordinates", () => {
    expect(
      Array.from(
        buildFlatSurfaceVertexData([{ height: 20, width: 30, x: 10, y: 15 }]),
      ),
    ).toEqual([
      10, 15, 0, 0, 40, 15, 1, 0, 10, 35, 0, 1, 10, 35, 0, 1, 40, 15, 1, 0, 40,
      35, 1, 1,
    ]);
  });

  it("builds indexed mesh vertices with per-surface draw ranges", () => {
    const mesh = meshSurface("mesh-a", [
      { u: 0, v: 0, x: 0, y: 0 },
      { u: 1, v: 0, x: 10, y: 0 },
      { u: 0, v: 1, x: 0, y: 20 },
    ]);

    const cache = buildMeshSurfaceVertexCache([mesh]);

    expect(Array.from(cache.vertexData)).toEqual([
      0, 0, 0, 0, 10, 0, 1, 0, 0, 20, 0, 1,
    ]);
    expect(Array.from(cache.indexData)).toEqual([0, 1, 2]);
    expect(cache.ranges).toEqual([
      {
        firstVertex: 0,
        surfaceId: "mesh-a",
        vertexCount: 3,
      },
    ]);
  });

  it("encodes procedural grid settings from generated background variants", () => {
    const encoded = Array.from(
      encodeGpuGridUniform({
        color: "#afbacf80",
        patternSize: 2,
        snapGrid: [25, 50],
        variant: BackgroundVariantEnum.dots,
      }),
    );

    expect(encoded[0]).toBeCloseTo(175 / 255);
    expect(encoded[1]).toBeCloseTo(186 / 255);
    expect(encoded[2]).toBeCloseTo(207 / 255);
    expect(encoded[3]).toBeCloseTo(128 / 255);
    expect(encoded.slice(4)).toEqual([25, 50, 2, 1]);
    expect(
      Array.from(
        encodeGpuGridUniform({
          color: "#afbacf",
          patternSize: 3,
          snapGrid: [16, 32],
          variant: BackgroundVariantEnum.lines,
        }),
      ).slice(4),
    ).toEqual([16, 32, 3, 0]);
    expect(parseGpuGridColor("#abc")).toEqual([
      170 / 255,
      187 / 255,
      204 / 255,
      1,
    ]);
    expect(parseGpuGridColor("#abcd")).toEqual([
      170 / 255,
      187 / 255,
      204 / 255,
      221 / 255,
    ]);
    expect(() =>
      encodeGpuGridUniform({
        color: "slate",
        patternSize: 2,
        snapGrid: [25, 25],
        variant: BackgroundVariantEnum.lines,
      }),
    ).toThrow("Setta GPU grid requires a hex color");
  });

  it("fails loudly when procedural grid spacing values are invalid", () => {
    expect(() =>
      encodeGpuGridUniform({
        color: "#afbacf",
        patternSize: 2,
        snapGrid: [0, 25],
        variant: BackgroundVariantEnum.dots,
      }),
    ).toThrow("Setta GPU grid requires a positive finite snapGrid[0]");
    expect(() =>
      encodeGpuGridUniform({
        color: "#afbacf",
        patternSize: Number.NaN,
        snapGrid: [25, 25],
        variant: BackgroundVariantEnum.lines,
      }),
    ).toThrow("Setta GPU grid requires a positive finite patternSize");
  });

  it("encodes the GPU edge palette from project wire colors", () => {
    const encoded = Array.from(
      encodeGpuEdgePaletteUniform({ color: "#41506ccc" }),
    );

    expect(encoded[0]).toBeCloseTo(65 / 255);
    expect(encoded[1]).toBeCloseTo(80 / 255);
    expect(encoded[2]).toBeCloseTo(108 / 255);
    expect(encoded[3]).toBeCloseTo(204 / 255);
    expect(() => encodeGpuEdgePaletteUniform({ color: "wire-blue" })).toThrow(
      "Setta GPU edge palette requires a hex color",
    );
  });

  it("draws cached surface textures with one camera uniform update and per-surface texture bindings", () => {
    installGpuConstants();
    const gpu = createGpuRenderMock();
    const renderer = new HtmlSurfaceRenderer(gpu.runtime);
    const quads = [
      flatSurface("node-a", 0, 0, 100, 50),
      flatSurface("node-b", 200, 100, 80, 40),
    ];

    const result = renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      scene: surfaceScene(quads),
      viewport: [10, 20, 1.25],
    });

    expect(result).toEqual({
      drawnEdgeIds: [],
      drawnSurfaceIds: ["node-a", "node-b"],
      edgeVertexCount: 0,
      vertexCount: 12,
    });
    expect(gpu.device.createRenderPipeline).toHaveBeenCalledTimes(1);
    expect(gpu.device.queue.writeBuffer).toHaveBeenCalledTimes(2);
    expect(gpu.device.queue.writeBuffer).toHaveBeenNthCalledWith(
      1,
      gpu.buffers[0],
      0,
      expect.any(Float32Array),
    );
    const vertexWrite = gpu.device.queue.writeBuffer.mock.calls[1];
    if (!vertexWrite) {
      throw new Error("expected vertex buffer write");
    }
    expect(Array.from(vertexWrite[2])).toEqual(
      Array.from(buildFlatSurfaceVertexData(quads)),
    );
    expect(gpu.pass.setPipeline).toHaveBeenCalledWith(gpu.pipelines[0]);
    expect(gpu.pass.setBindGroup).toHaveBeenNthCalledWith(
      1,
      0,
      gpu.bindGroups[0],
    );
    expect(gpu.pass.setVertexBuffer).toHaveBeenCalledWith(0, gpu.buffers[1]);
    expect(gpu.pass.draw).toHaveBeenNthCalledWith(1, 6, 1, 0, 0);
    expect(gpu.pass.draw).toHaveBeenNthCalledWith(2, 6, 1, 6, 0);
    expect(gpu.pass.end).toHaveBeenCalledTimes(1);
    expect(gpu.device.queue.submit).toHaveBeenCalledWith([gpu.commandBuffer]);
  });

  it("draws warped mesh surfaces with indexed geometry after the flat pass", () => {
    installGpuConstants();
    const gpu = createGpuRenderMock();
    const renderer = new HtmlSurfaceRenderer(gpu.runtime);
    const flat = flatSurface("node-a", 0, 0, 100, 50);
    const mesh = meshSurface("mesh-a", [
      { u: 0, v: 0, x: 0, y: 0 },
      { u: 1, v: 0, x: 120, y: 12 },
      { u: 0, v: 1, x: -12, y: 80 },
      { u: 1, v: 1, x: 120, y: 90 },
    ]);

    const result = renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      scene: createHtmlSurfaceVisualScene({
        flatSurfaces: [flat],
        meshSurfaces: [mesh],
      }),
      viewport: [10, 20, 1.25],
    });

    expect(result).toEqual({
      drawnEdgeIds: [],
      drawnSurfaceIds: ["node-a", "mesh-a"],
      edgeVertexCount: 0,
      vertexCount: 12,
    });
    expect(writeBufferLabels(gpu)).toEqual([
      "setta-html-surface-camera-uniform",
      "setta-html-surface-flat-vertices",
      "setta-html-surface-mesh-vertices",
    ]);
    expect(gpu.pass.setPipeline).toHaveBeenNthCalledWith(1, gpu.pipelines[0]);
    expect(gpu.pass.draw).toHaveBeenNthCalledWith(1, 6, 1, 0, 0);
    expect(gpu.pass.setPipeline).toHaveBeenNthCalledWith(2, gpu.pipelines[1]);
    expect(gpu.pass.draw).toHaveBeenNthCalledWith(2, 6, 1, 0, 0);
  });

  it("draws tiled flat surfaces as one cached quad per texture tile", () => {
    installGpuConstants();
    const gpu = createGpuRenderMock();
    const renderer = new HtmlSurfaceRenderer(gpu.runtime);
    const tiled = tiledFlatSurface("large-node");

    const result = renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      scene: createHtmlSurfaceVisualScene({
        tiledFlatSurfaces: [tiled],
      }),
      viewport: [10, 20, 1.25],
    });

    expect(result).toEqual({
      drawnEdgeIds: [],
      drawnSurfaceIds: ["large-node"],
      edgeVertexCount: 0,
      vertexCount: 12,
    });
    expect(writeBufferLabels(gpu)).toEqual([
      "setta-html-surface-camera-uniform",
      "setta-html-surface-tiled-flat-vertices",
    ]);
    expect(gpu.pass.setPipeline).toHaveBeenCalledWith(gpu.pipelines[0]);
    expect(gpu.pass.setVertexBuffer).toHaveBeenCalledWith(0, gpu.buffers[1]);
    expect(gpu.pass.draw).toHaveBeenNthCalledWith(1, 6, 1, 0, 0);
    expect(gpu.pass.draw).toHaveBeenNthCalledWith(2, 6, 1, 6, 0);
    expect(gpu.device.createBindGroup).toHaveBeenCalledTimes(3);
  });

  it("draws shader-effect surfaces with an explicit supported projector", () => {
    installGpuConstants();
    const gpu = createGpuRenderMock();
    const renderer = new HtmlSurfaceRenderer(gpu.runtime);
    const effect = effectSurface("effect-a");

    const result = renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      scene: createHtmlSurfaceVisualScene({
        effectSurfaces: [effect],
      }),
      viewport: [10, 20, 1.25],
    });

    expect(result).toEqual({
      drawnEdgeIds: [],
      drawnSurfaceIds: ["effect-a"],
      edgeVertexCount: 0,
      vertexCount: 6,
    });
    expect(writeBufferLabels(gpu)).toEqual([
      "setta-html-surface-camera-uniform",
      "setta-html-surface-effect-vertices",
    ]);
    expect(gpu.device.createRenderPipeline).toHaveBeenCalledTimes(1);
    expect(gpu.pass.setPipeline).toHaveBeenCalledWith(gpu.pipelines[0]);
    expect(gpu.pass.setVertexBuffer).toHaveBeenCalledWith(0, gpu.buffers[1]);
    expect(gpu.pass.draw).toHaveBeenCalledWith(6, 1, 0, 0);
  });

  it("rejects shader-effect surfaces without their declared projector", () => {
    installGpuConstants();
    const gpu = createGpuRenderMock();
    const renderer = new HtmlSurfaceRenderer(gpu.runtime);

    expect(() =>
      renderer.render({
        canvasSize: { cssHeight: 600, cssWidth: 800 },
        scene: createHtmlSurfaceVisualScene({
          effectSurfaces: [
            effectSurface("effect-a", {
              projectorId: "missing-projector",
            }),
          ],
        }),
        viewport: [10, 20, 1.25],
      }),
    ).toThrow(
      'Setta HTML surface shader effect "setta-ripple" requires projector "setta-ripple-projector", received "missing-projector".',
    );
  });

  it("draws the procedural grid before GPU edges and surface textures", () => {
    installGpuConstants();
    const gpu = createGpuRenderMock();
    const renderer = new HtmlSurfaceRenderer(gpu.runtime);

    const result = renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      edges: [edge("edge-a", 0, 0, 100, 0)],
      grid: {
        color: "#afbacf",
        patternSize: 2,
        snapGrid: [25, 25],
        variant: BackgroundVariantEnum.lines,
      },
      scene: surfaceScene([flatSurface("node-a", 0, 0, 100, 50)]),
      viewport: [10, 20, 1.25],
    });

    expect(result).toEqual({
      drawnEdgeIds: ["edge-a"],
      drawnSurfaceIds: ["node-a"],
      edgeVertexCount: 2,
      vertexCount: 6,
    });
    expect(gpu.device.createRenderPipeline).toHaveBeenCalledTimes(3);
    expect(gpu.pass.setPipeline).toHaveBeenNthCalledWith(1, gpu.pipelines[0]);
    expect(gpu.pass.draw).toHaveBeenNthCalledWith(1, 3, 1, 0, 0);
    expect(gpu.pass.setPipeline).toHaveBeenNthCalledWith(2, gpu.pipelines[1]);
    expect(gpu.pass.draw).toHaveBeenNthCalledWith(2, 2, 1, 0, 0);
    expect(gpu.pass.setPipeline).toHaveBeenNthCalledWith(3, gpu.pipelines[2]);
    expect(gpu.pass.draw).toHaveBeenNthCalledWith(3, 6, 1, 0, 0);
  });

  it("skips grid resources and draw calls when no grid input is supplied", () => {
    installGpuConstants();
    const gpu = createGpuRenderMock();
    const renderer = new HtmlSurfaceRenderer(gpu.runtime);

    renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      edges: [edge("edge-a", 0, 0, 100, 0)],
      scene: surfaceScene([flatSurface("node-a", 0, 0, 100, 50)]),
      viewport: [10, 20, 1.25],
    });

    expect(
      gpu.buffers.some(
        (buffer) => getBufferLabel(buffer) === "setta-gpu-grid-uniform",
      ),
    ).toBe(false);
    expect(gpu.device.createRenderPipeline).toHaveBeenCalledTimes(2);
    expect(gpu.pass.draw).toHaveBeenCalledTimes(2);
    expect(gpu.pass.draw).toHaveBeenNthCalledWith(1, 2, 1, 0, 0);
    expect(gpu.pass.draw).toHaveBeenNthCalledWith(2, 6, 1, 0, 0);
  });

  it("keeps grid settings uniform stable on viewport-only redraws", () => {
    installGpuConstants();
    const gpu = createGpuRenderMock();
    const renderer = new HtmlSurfaceRenderer(gpu.runtime);
    const grid = {
      color: "#afbacf",
      patternSize: 2,
      snapGrid: [25, 25],
      variant: BackgroundVariantEnum.dots,
    } as const;

    renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      grid,
      scene: surfaceScene([]),
      viewport: [0, 0, 1],
    });
    renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      grid,
      scene: surfaceScene([]),
      viewport: [50, -25, 1.5],
    });

    const cameraBuffer = getBufferByLabel(
      gpu.buffers,
      "setta-html-surface-camera-uniform",
    );
    const gridBuffer = getBufferByLabel(gpu.buffers, "setta-gpu-grid-uniform");
    expect(gpu.device.queue.writeBuffer).toHaveBeenCalledTimes(3);
    expect(gpu.device.queue.writeBuffer).toHaveBeenNthCalledWith(
      1,
      cameraBuffer,
      0,
      expect.any(Float32Array),
    );
    expect(gpu.device.queue.writeBuffer).toHaveBeenNthCalledWith(
      2,
      gridBuffer,
      0,
      expect.any(Float32Array),
    );
    expect(gpu.device.queue.writeBuffer).toHaveBeenNthCalledWith(
      3,
      cameraBuffer,
      0,
      expect.any(Float32Array),
    );
    expect(gpu.pass.draw).toHaveBeenNthCalledWith(1, 3, 1, 0, 0);
    expect(gpu.pass.draw).toHaveBeenNthCalledWith(2, 3, 1, 0, 0);
  });

  it("keeps flat surface vertices stable on viewport-only redraws", () => {
    installGpuConstants();
    const gpu = createGpuRenderMock();
    const renderer = new HtmlSurfaceRenderer(gpu.runtime);
    const quads = [
      flatSurface("node-a", 0, 0, 100, 50),
      flatSurface("node-b", 200, 100, 80, 40),
    ];

    renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      scene: surfaceScene(quads),
      viewport: [0, 0, 1],
    });
    renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      scene: surfaceScene(quads),
      viewport: [50, -25, 1.5],
    });

    expect(writeBufferLabels(gpu)).toEqual([
      "setta-html-surface-camera-uniform",
      "setta-html-surface-flat-vertices",
      "setta-html-surface-camera-uniform",
    ]);
  });

  it("rewrites flat surface vertices once when node geometry changes", () => {
    installGpuConstants();
    const gpu = createGpuRenderMock();
    const renderer = new HtmlSurfaceRenderer(gpu.runtime);
    const firstQuads = [flatSurface("node-a", 0, 0, 100, 50)];
    const movedQuads = [flatSurface("node-a", 24, 12, 100, 50)];

    renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      scene: surfaceScene(firstQuads),
      viewport: [0, 0, 1],
    });
    renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      scene: surfaceScene(movedQuads),
      viewport: [0, 0, 1],
    });

    const nodeVertexWrites = gpu.device.queue.writeBuffer.mock.calls.filter(
      ([buffer]) =>
        getBufferLabel(buffer) === "setta-html-surface-flat-vertices",
    );
    expect(writeBufferLabels(gpu)).toEqual([
      "setta-html-surface-camera-uniform",
      "setta-html-surface-flat-vertices",
      "setta-html-surface-flat-vertices",
    ]);
    expect(nodeVertexWrites).toHaveLength(2);
    expect(Array.from(nodeVertexWrites[1]?.[2] ?? [])).toEqual(
      Array.from(buildFlatSurfaceVertexData(movedQuads)),
    );
  });

  it("skips duplicate camera uniform writes when the viewport is unchanged", () => {
    installGpuConstants();
    const gpu = createGpuRenderMock();
    const renderer = new HtmlSurfaceRenderer(gpu.runtime);
    const edges = [edge("edge-a", 0, 0, 100, 0)];
    const quads = [flatSurface("node-a", 0, 0, 100, 50)];

    renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      edges,
      scene: surfaceScene(quads),
      viewport: [0, 0, 1],
    });
    renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      edges,
      scene: surfaceScene(quads),
      viewport: [0, 0, 1],
    });

    expect(writeBufferLabels(gpu)).toEqual([
      "setta-html-surface-camera-uniform",
      "setta-gpu-edge-palette-uniform",
      "setta-gpu-edge-line-vertices",
      "setta-html-surface-flat-vertices",
    ]);
  });

  it("reuses texture bind groups until a surface texture view or sampler changes", () => {
    installGpuConstants();
    const gpu = createGpuRenderMock();
    const renderer = new HtmlSurfaceRenderer(gpu.runtime);
    const firstTexture = textureRecord("node-a");
    const secondTexture = textureRecord("node-a");

    renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      scene: surfaceScene([flatSurface("node-a", 0, 0, 100, 50, firstTexture)]),
      viewport: [0, 0, 1],
    });
    renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      scene: surfaceScene([flatSurface("node-a", 0, 0, 100, 50, firstTexture)]),
      viewport: [0, 0, 1],
    });
    renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      scene: surfaceScene([
        flatSurface("node-a", 0, 0, 100, 50, secondTexture),
      ]),
      viewport: [0, 0, 1],
    });

    expect(gpu.device.createBindGroup).toHaveBeenCalledTimes(3);
  });

  it("draws GPU edge line lists before surface textures in the same pass", () => {
    installGpuConstants();
    const gpu = createGpuRenderMock();
    const renderer = new HtmlSurfaceRenderer(gpu.runtime);
    const edges = [edge("edge-a", 0, 0, 100, 0, true)];

    const result = renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      edges,
      scene: surfaceScene([flatSurface("node-a", 0, 0, 100, 50)]),
      viewport: [10, 20, 1.25],
    });

    expect(result).toEqual({
      drawnEdgeIds: ["edge-a"],
      drawnSurfaceIds: ["node-a"],
      edgeVertexCount: 2,
      vertexCount: 6,
    });
    expect(gpu.device.createRenderPipeline).toHaveBeenCalledTimes(2);
    expect(gpu.pass.setPipeline).toHaveBeenNthCalledWith(1, gpu.pipelines[0]);
    expect(gpu.pass.draw).toHaveBeenNthCalledWith(1, 2, 1, 0, 0);
    expect(gpu.pass.setPipeline).toHaveBeenNthCalledWith(2, gpu.pipelines[1]);
    expect(gpu.pass.draw).toHaveBeenNthCalledWith(2, 6, 1, 0, 0);
  });

  it("keeps edge GPU buffers stable on viewport-only redraws", () => {
    installGpuConstants();
    const gpu = createGpuRenderMock();
    const renderer = new HtmlSurfaceRenderer(gpu.runtime);
    const edges = [edge("edge-a", 0, 0, 100, 0)];

    renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      edges,
      scene: surfaceScene([]),
      viewport: [0, 0, 1],
    });
    renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      edges,
      scene: surfaceScene([]),
      viewport: [50, -25, 1.5],
    });

    const cameraBuffer = getBufferByLabel(
      gpu.buffers,
      "setta-html-surface-camera-uniform",
    );
    const edgePaletteBuffer = getBufferByLabel(
      gpu.buffers,
      "setta-gpu-edge-palette-uniform",
    );
    const edgeBuffer = getBufferByLabel(
      gpu.buffers,
      "setta-gpu-edge-line-vertices",
    );
    expect(gpu.device.queue.writeBuffer).toHaveBeenCalledTimes(4);
    expect(gpu.device.queue.writeBuffer).toHaveBeenNthCalledWith(
      1,
      cameraBuffer,
      0,
      expect.any(Float32Array),
    );
    expect(gpu.device.queue.writeBuffer).toHaveBeenNthCalledWith(
      2,
      edgePaletteBuffer,
      0,
      expect.any(Float32Array),
    );
    expect(gpu.device.queue.writeBuffer).toHaveBeenNthCalledWith(
      3,
      edgeBuffer,
      0,
      expect.any(Float32Array),
    );
    expect(gpu.device.queue.writeBuffer).toHaveBeenNthCalledWith(
      4,
      cameraBuffer,
      0,
      expect.any(Float32Array),
    );
  });

  it("updates the edge palette without rewriting unchanged edge geometry", () => {
    installGpuConstants();
    const gpu = createGpuRenderMock();
    const renderer = new HtmlSurfaceRenderer(gpu.runtime);
    const edges = [edge("edge-a", 0, 0, 100, 0)];

    renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      edgePalette: { color: "#41506c" },
      edges,
      scene: surfaceScene([]),
      viewport: [0, 0, 1],
    });
    renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      edgePalette: { color: "#bac2d3" },
      edges,
      scene: surfaceScene([]),
      viewport: [0, 0, 1],
    });

    const cameraBuffer = getBufferByLabel(
      gpu.buffers,
      "setta-html-surface-camera-uniform",
    );
    const edgePaletteBuffer = getBufferByLabel(
      gpu.buffers,
      "setta-gpu-edge-palette-uniform",
    );
    const edgeBuffer = getBufferByLabel(
      gpu.buffers,
      "setta-gpu-edge-line-vertices",
    );
    expect(gpu.device.queue.writeBuffer).toHaveBeenCalledTimes(4);
    expect(gpu.device.queue.writeBuffer).toHaveBeenNthCalledWith(
      1,
      cameraBuffer,
      0,
      expect.any(Float32Array),
    );
    expect(gpu.device.queue.writeBuffer).toHaveBeenNthCalledWith(
      2,
      edgePaletteBuffer,
      0,
      expect.any(Float32Array),
    );
    expect(gpu.device.queue.writeBuffer).toHaveBeenNthCalledWith(
      3,
      edgeBuffer,
      0,
      expect.any(Float32Array),
    );
    expect(gpu.device.queue.writeBuffer).toHaveBeenNthCalledWith(
      4,
      edgePaletteBuffer,
      0,
      expect.any(Float32Array),
    );
    expect(writeBufferLabels(gpu)).toEqual([
      "setta-html-surface-camera-uniform",
      "setta-gpu-edge-palette-uniform",
      "setta-gpu-edge-line-vertices",
      "setta-gpu-edge-palette-uniform",
    ]);
  });
});

function installGpuConstants() {
  vi.stubGlobal("GPUBufferUsage", {
    COPY_DST: 1,
    UNIFORM: 2,
    VERTEX: 4,
  });
  vi.stubGlobal("GPUShaderStage", {
    FRAGMENT: 2,
    VERTEX: 1,
  });
}

function createGpuRenderMock() {
  const buffers: GPUBuffer[] = [];
  const bindGroups: GPUBindGroup[] = [];
  const pipelines: GPURenderPipeline[] = [];
  const commandBuffer = {} as GPUCommandBuffer;
  const pass = {
    draw: vi.fn(),
    end: vi.fn(),
    setBindGroup: vi.fn(),
    setPipeline: vi.fn(),
    setVertexBuffer: vi.fn(),
  };
  const commandEncoder = {
    beginRenderPass: vi.fn(() => pass as unknown as GPURenderPassEncoder),
    finish: vi.fn(() => commandBuffer),
  };
  const currentTexture = {
    createView: vi.fn(() => ({}) as GPUTextureView),
  };
  const device = {
    createBindGroup: vi.fn((descriptor: GPUBindGroupDescriptor) => {
      const bindGroup = { descriptor } as unknown as GPUBindGroup;
      bindGroups.push(bindGroup);
      return bindGroup;
    }),
    createBindGroupLayout: vi.fn(() => ({}) as GPUBindGroupLayout),
    createBuffer: vi.fn((descriptor: GPUBufferDescriptor) => {
      const buffer = {
        descriptor,
        destroy: vi.fn(),
      } as unknown as GPUBuffer;
      buffers.push(buffer);
      return buffer;
    }),
    createCommandEncoder: vi.fn(() => commandEncoder),
    createPipelineLayout: vi.fn(() => ({}) as GPUPipelineLayout),
    createRenderPipeline: vi.fn((descriptor: GPURenderPipelineDescriptor) => {
      const pipeline = { descriptor } as unknown as GPURenderPipeline;
      pipelines.push(pipeline);
      return pipeline;
    }),
    createSampler: vi.fn(),
    createShaderModule: vi.fn(() => ({}) as GPUShaderModule),
    createTexture: vi.fn(),
    destroy: vi.fn(),
    limits: { maxTextureDimension2D: 4096 },
    queue: {
      submit: vi.fn(),
      writeBuffer: vi.fn(),
    },
  } as unknown as GPUDevice & {
    createRenderPipeline: ReturnType<typeof vi.fn>;
    queue: {
      submit: ReturnType<typeof vi.fn>;
      writeBuffer: ReturnType<typeof vi.fn>;
    };
  };
  const runtime: HtmlSurfaceRenderRuntime = {
    context: {
      configure: vi.fn(),
      getCurrentTexture: vi.fn(() => currentTexture as unknown as GPUTexture),
    },
    device,
    format: "bgra8unorm",
  };

  return {
    bindGroups,
    buffers,
    commandBuffer,
    device,
    pass,
    pipelines,
    runtime,
  };
}

function flatSurface(
  surfaceId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  texture = textureRecord(surfaceId),
): HtmlSurfaceFlatVisual {
  return {
    height,
    kind: "flat",
    surfaceId,
    texture,
    width,
    x,
    y,
    zIndex: 0,
  };
}

function meshSurface(
  surfaceId: string,
  vertices: HtmlSurfaceMeshVisual["vertices"],
  texture = textureRecord(surfaceId),
): HtmlSurfaceMeshVisual {
  return {
    bounds: { height: 90, width: 132, x: -12, y: 0 },
    indices: new Uint32Array([0, 1, 2, 2, 1, 3]).slice(
      0,
      vertices.length === 3 ? 3 : 6,
    ),
    kind: "mesh",
    surfaceId,
    texture,
    vertices,
    zIndex: 0,
  };
}

function tiledFlatSurface(surfaceId: string): HtmlSurfaceTiledFlatVisual {
  const firstTileTexture = textureRecord(`${surfaceId}:0:0`);
  const secondTileTexture = textureRecord(`${surfaceId}:1:0`);
  return {
    kind: "tiled-flat",
    rect: { height: 100, width: 200, x: 20, y: 30 },
    surfaceId,
    texture: textureRecord(surfaceId),
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
        sampler: firstTileTexture.sampler,
        surfaceId,
        texture: firstTileTexture.texture,
        textureBytes: 51_200,
        textureView: firstTileTexture.textureView,
        tileId: `${surfaceId}:0:0`,
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
        sampler: secondTileTexture.sampler,
        surfaceId,
        texture: secondTileTexture.texture,
        textureBytes: 28_800,
        textureView: secondTileTexture.textureView,
        tileId: `${surfaceId}:1:0`,
        u0: 0.64,
        u1: 1,
        v0: 0,
        v1: 1,
      },
    ],
    zIndex: 0,
  };
}

function effectSurface(
  surfaceId: string,
  overrides: Partial<Pick<HtmlSurfaceEffectVisual, "projectorId">> = {},
): HtmlSurfaceEffectVisual {
  return {
    bounds: { height: 80, width: 120, x: 24, y: 16 },
    effectId: HTML_SURFACE_RIPPLE_EFFECT_ID,
    kind: "effect",
    projectorId: overrides.projectorId ?? HTML_SURFACE_RIPPLE_PROJECTOR_ID,
    surfaceId,
    texture: textureRecord(surfaceId),
    zIndex: 0,
  };
}

function surfaceScene(flatSurfaces: readonly HtmlSurfaceFlatVisual[]) {
  return createHtmlSurfaceVisualScene({ flatSurfaces });
}

function textureRecord(surfaceId: string): HtmlSurfaceTextureRecord {
  return {
    sampler: {},
    surfaceId,
    texture: {},
    textureBytes: 0,
    textureView: {},
  } as HtmlSurfaceTextureRecord;
}

function getBufferByLabel(buffers: readonly GPUBuffer[], label: string) {
  const buffer = buffers.find(
    (candidate) => getBufferLabel(candidate) === label,
  );
  if (!buffer) {
    throw new Error(`Expected GPU buffer ${label}.`);
  }
  return buffer;
}

function getBufferLabel(buffer: GPUBuffer): string | undefined {
  return (buffer as GPUBuffer & { descriptor?: GPUBufferDescriptor }).descriptor
    ?.label;
}

function writeBufferLabels(gpu: ReturnType<typeof createGpuRenderMock>) {
  return gpu.device.queue.writeBuffer.mock.calls.map(([buffer]) =>
    getBufferLabel(buffer),
  );
}

function edge(
  edgeId: string,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  selected = false,
): GpuEdgeBufferInput {
  return {
    edgeId,
    geometry: buildGpuEdgeGeometry({
      edgeId,
      source: { x: sourceX, y: sourceY },
      target: { x: targetX, y: targetY },
      type: "straight",
    }),
    selected,
  };
}
