/* @vitest-environment jsdom */

import { BackgroundVariantEnum } from "utils/generatedTypes";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGpuEdgeGeometry } from "./edges/edgeGeometry";
import type { GpuEdgeBufferInput } from "./edges/edgeGpuBuffers";
import type { GpuTexturedNodeQuad } from "./GpuNodeLayer";
import type { NodeQuadRenderRuntime } from "./gpuPipelines";
import {
  buildNodeQuadVertexData,
  encodeGpuEdgePaletteUniform,
  encodeGpuGridUniform,
  encodeNodeQuadCameraUniform,
  GpuNodeQuadRenderer,
  parseGpuGridColor,
} from "./gpuPipelines";
import type { NodeTextureRecord } from "./nodeTextures";

describe("gpu node quad pipeline", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("encodes the camera uniform for the node quad shader", () => {
    expect(
      Array.from(
        encodeNodeQuadCameraUniform({
          canvasHeight: 600,
          canvasWidth: 800,
          viewport: [10, 20, 2],
        }),
      ),
    ).toEqual([10, 20, 2, 0, 800, 600, 0, 0]);
  });

  it("builds two triangles per node quad in flow coordinates", () => {
    expect(
      Array.from(
        buildNodeQuadVertexData([{ height: 20, width: 30, x: 10, y: 15 }]),
      ),
    ).toEqual([
      10, 15, 0, 0, 40, 15, 1, 0, 10, 35, 0, 1, 10, 35, 0, 1, 40, 15, 1, 0, 40,
      35, 1, 1,
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

  it("draws cached node textures with one camera uniform update and per-node texture bindings", () => {
    installGpuConstants();
    const gpu = createGpuRenderMock();
    const renderer = new GpuNodeQuadRenderer(gpu.runtime);
    const quads = [
      texturedQuad("node-a", 0, 0, 100, 50),
      texturedQuad("node-b", 200, 100, 80, 40),
    ];

    const result = renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      quads,
      viewport: [10, 20, 1.25],
    });

    expect(result).toEqual({
      drawnEdgeIds: [],
      drawnNodeIds: ["node-a", "node-b"],
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
      Array.from(buildNodeQuadVertexData(quads)),
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

  it("draws the procedural grid before GPU edges and node textures", () => {
    installGpuConstants();
    const gpu = createGpuRenderMock();
    const renderer = new GpuNodeQuadRenderer(gpu.runtime);

    const result = renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      edges: [edge("edge-a", 0, 0, 100, 0)],
      grid: {
        color: "#afbacf",
        patternSize: 2,
        snapGrid: [25, 25],
        variant: BackgroundVariantEnum.lines,
      },
      quads: [texturedQuad("node-a", 0, 0, 100, 50)],
      viewport: [10, 20, 1.25],
    });

    expect(result).toEqual({
      drawnEdgeIds: ["edge-a"],
      drawnNodeIds: ["node-a"],
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
    const renderer = new GpuNodeQuadRenderer(gpu.runtime);

    renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      edges: [edge("edge-a", 0, 0, 100, 0)],
      quads: [texturedQuad("node-a", 0, 0, 100, 50)],
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
    const renderer = new GpuNodeQuadRenderer(gpu.runtime);
    const grid = {
      color: "#afbacf",
      patternSize: 2,
      snapGrid: [25, 25],
      variant: BackgroundVariantEnum.dots,
    } as const;

    renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      grid,
      quads: [],
      viewport: [0, 0, 1],
    });
    renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      grid,
      quads: [],
      viewport: [50, -25, 1.5],
    });

    const cameraBuffer = getBufferByLabel(
      gpu.buffers,
      "setta-gpu-node-quad-camera-uniform",
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

  it("reuses texture bind groups until a node texture view or sampler changes", () => {
    installGpuConstants();
    const gpu = createGpuRenderMock();
    const renderer = new GpuNodeQuadRenderer(gpu.runtime);
    const firstTexture = textureRecord("node-a");
    const secondTexture = textureRecord("node-a");

    renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      quads: [texturedQuad("node-a", 0, 0, 100, 50, firstTexture)],
      viewport: [0, 0, 1],
    });
    renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      quads: [texturedQuad("node-a", 0, 0, 100, 50, firstTexture)],
      viewport: [0, 0, 1],
    });
    renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      quads: [texturedQuad("node-a", 0, 0, 100, 50, secondTexture)],
      viewport: [0, 0, 1],
    });

    expect(gpu.device.createBindGroup).toHaveBeenCalledTimes(3);
  });

  it("draws GPU edge line lists before node textures in the same pass", () => {
    installGpuConstants();
    const gpu = createGpuRenderMock();
    const renderer = new GpuNodeQuadRenderer(gpu.runtime);
    const edges = [edge("edge-a", 0, 0, 100, 0, true)];

    const result = renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      edges,
      quads: [texturedQuad("node-a", 0, 0, 100, 50)],
      viewport: [10, 20, 1.25],
    });

    expect(result).toEqual({
      drawnEdgeIds: ["edge-a"],
      drawnNodeIds: ["node-a"],
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
    const renderer = new GpuNodeQuadRenderer(gpu.runtime);
    const edges = [edge("edge-a", 0, 0, 100, 0)];

    renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      edges,
      quads: [],
      viewport: [0, 0, 1],
    });
    renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      edges,
      quads: [],
      viewport: [50, -25, 1.5],
    });

    const cameraBuffer = getBufferByLabel(
      gpu.buffers,
      "setta-gpu-node-quad-camera-uniform",
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
    const renderer = new GpuNodeQuadRenderer(gpu.runtime);
    const edges = [edge("edge-a", 0, 0, 100, 0)];

    renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      edgePalette: { color: "#41506c" },
      edges,
      quads: [],
      viewport: [0, 0, 1],
    });
    renderer.render({
      canvasSize: { cssHeight: 600, cssWidth: 800 },
      edgePalette: { color: "#bac2d3" },
      edges,
      quads: [],
      viewport: [0, 0, 1],
    });

    const cameraBuffer = getBufferByLabel(
      gpu.buffers,
      "setta-gpu-node-quad-camera-uniform",
    );
    const edgePaletteBuffer = getBufferByLabel(
      gpu.buffers,
      "setta-gpu-edge-palette-uniform",
    );
    const edgeBuffer = getBufferByLabel(
      gpu.buffers,
      "setta-gpu-edge-line-vertices",
    );
    expect(gpu.device.queue.writeBuffer).toHaveBeenCalledTimes(5);
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
    expect(gpu.device.queue.writeBuffer).toHaveBeenNthCalledWith(
      5,
      edgePaletteBuffer,
      0,
      expect.any(Float32Array),
    );
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
  const runtime: NodeQuadRenderRuntime = {
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

function texturedQuad(
  nodeId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  texture = textureRecord(nodeId),
): GpuTexturedNodeQuad {
  return {
    height,
    nodeId,
    texture,
    width,
    x,
    y,
    zIndex: 0,
  };
}

function textureRecord(nodeId: string): NodeTextureRecord {
  return {
    nodeId,
    sampler: {},
    texture: {},
    textureView: {},
  } as NodeTextureRecord;
}

function getBufferByLabel(buffers: readonly GPUBuffer[], label: string) {
  const buffer = buffers.find((candidate) => getBufferLabel(candidate) === label);
  if (!buffer) {
    throw new Error(`Expected GPU buffer ${label}.`);
  }
  return buffer;
}

function getBufferLabel(buffer: GPUBuffer): string | undefined {
  return (buffer as GPUBuffer & { descriptor?: GPUBufferDescriptor }).descriptor
    ?.label;
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
