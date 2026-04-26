/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { GpuTexturedNodeQuad } from "./GpuNodeLayer";
import type { NodeQuadRenderRuntime } from "./gpuPipelines";
import {
  buildNodeQuadVertexData,
  encodeNodeQuadCameraUniform,
  GpuNodeQuadRenderer,
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
      drawnNodeIds: ["node-a", "node-b"],
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
    expect(gpu.pass.setPipeline).toHaveBeenCalledWith(gpu.pipeline);
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
  const pipeline = {} as GPURenderPipeline;
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
    createRenderPipeline: vi.fn(() => pipeline),
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
    pipeline,
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
