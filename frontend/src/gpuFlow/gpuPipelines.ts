import type { GpuFlowRuntime } from "./gpuDevice";
import type { GpuTexturedNodeQuad } from "./GpuNodeLayer";
import type { GpuCanvasSize } from "./gpuRenderer";
import { normalizeGpuViewport, type GpuViewportInput } from "./viewportMath";

export type NodeQuadRenderRuntime = Pick<
  GpuFlowRuntime,
  "context" | "device" | "format"
>;

export type RenderNodeTextureQuadsInput = {
  readonly canvasSize: Pick<GpuCanvasSize, "cssHeight" | "cssWidth">;
  readonly clearColor?: GPUColorDict | undefined;
  readonly quads: readonly GpuTexturedNodeQuad[];
  readonly viewport: GpuViewportInput;
};

export type RenderNodeTextureQuadsResult = {
  readonly drawnNodeIds: readonly string[];
  readonly vertexCount: number;
};

const CAMERA_UNIFORM_BYTES = 32;
const FLOATS_PER_VERTEX = 4;
const VERTICES_PER_QUAD = 6;
const NODE_QUAD_VERTEX_BYTES =
  Float32Array.BYTES_PER_ELEMENT * FLOATS_PER_VERTEX;
const DEFAULT_CLEAR_COLOR: GPUColorDict = { a: 0, b: 0, g: 0, r: 0 };

export class GpuNodeQuadRenderer {
  private readonly runtime: NodeQuadRenderRuntime;
  private cameraBindGroup: GPUBindGroup | null = null;
  private cameraBindGroupLayout: GPUBindGroupLayout | null = null;
  private cameraBuffer: GPUBuffer | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private textureBindGroupLayout: GPUBindGroupLayout | null = null;
  private readonly textureBindGroups = new Map<
    string,
    {
      readonly bindGroup: GPUBindGroup;
      readonly sampler: GPUSampler;
      readonly textureView: GPUTextureView;
    }
  >();
  private vertexBuffer: GPUBuffer | null = null;
  private vertexBufferByteCapacity = 0;

  constructor(runtime: NodeQuadRenderRuntime) {
    this.runtime = runtime;
  }

  destroy() {
    this.cameraBuffer?.destroy?.();
    this.vertexBuffer?.destroy?.();
    this.cameraBuffer = null;
    this.vertexBuffer = null;
    this.cameraBindGroup = null;
    this.pipeline = null;
    this.textureBindGroupLayout = null;
    this.cameraBindGroupLayout = null;
    this.textureBindGroups.clear();
    this.vertexBufferByteCapacity = 0;
  }

  render({
    canvasSize,
    clearColor = DEFAULT_CLEAR_COLOR,
    quads,
    viewport,
  }: RenderNodeTextureQuadsInput): RenderNodeTextureQuadsResult {
    const pipeline = this.ensurePipeline();
    const cameraBindGroup = this.ensureCameraBindGroup();
    const cameraUniform = encodeNodeQuadCameraUniform({
      canvasHeight: canvasSize.cssHeight,
      canvasWidth: canvasSize.cssWidth,
      viewport,
    });
    const vertexData = buildNodeQuadVertexData(quads);
    const vertexBuffer = this.ensureVertexBuffer(vertexData.byteLength);
    const cameraBuffer = this.cameraBuffer;
    if (!cameraBuffer) {
      throw new Error(
        "Setta GPU node rendering failed to create camera buffer.",
      );
    }

    this.runtime.device.queue.writeBuffer(cameraBuffer, 0, cameraUniform);
    if (vertexData.byteLength > 0) {
      this.runtime.device.queue.writeBuffer(vertexBuffer, 0, vertexData);
    }

    const commandEncoder = this.runtime.device.createCommandEncoder({
      label: "setta-gpu-node-quad-encoder",
    });
    const currentTexture = this.runtime.context.getCurrentTexture();
    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          clearValue: clearColor,
          loadOp: "clear",
          storeOp: "store",
          view: currentTexture.createView({
            label: "setta-gpu-node-quad-current-texture-view",
          }),
        },
      ],
      label: "setta-gpu-node-quad-pass",
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, cameraBindGroup);
    pass.setVertexBuffer(0, vertexBuffer);
    quads.forEach((quad, index) => {
      pass.setBindGroup(1, this.getTextureBindGroup(quad));
      pass.draw(VERTICES_PER_QUAD, 1, index * VERTICES_PER_QUAD, 0);
    });
    pass.end();

    this.runtime.device.queue.submit([commandEncoder.finish()]);

    return {
      drawnNodeIds: quads.map((quad) => quad.nodeId),
      vertexCount: quads.length * VERTICES_PER_QUAD,
    };
  }

  private ensureCameraBindGroup(): GPUBindGroup {
    if (this.cameraBindGroup) {
      return this.cameraBindGroup;
    }
    const cameraBindGroupLayout = this.cameraBindGroupLayout;
    if (!cameraBindGroupLayout) {
      throw new Error(
        "Setta GPU node rendering requires a camera bind group layout.",
      );
    }
    const device = this.runtime.device;
    this.cameraBuffer = device.createBuffer({
      label: "setta-gpu-node-quad-camera-uniform",
      size: CAMERA_UNIFORM_BYTES,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    this.cameraBindGroup = device.createBindGroup({
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.cameraBuffer,
          },
        },
      ],
      label: "setta-gpu-node-quad-camera-bind-group",
      layout: cameraBindGroupLayout,
    });
    return this.cameraBindGroup;
  }

  private ensurePipeline(): GPURenderPipeline {
    if (this.pipeline) {
      return this.pipeline;
    }
    const device = this.runtime.device;
    this.cameraBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          buffer: {
            type: "uniform",
          },
          visibility: GPUShaderStage.VERTEX,
        },
      ],
      label: "setta-gpu-node-quad-camera-bind-group-layout",
    });
    this.textureBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          sampler: {
            type: "filtering",
          },
          visibility: GPUShaderStage.FRAGMENT,
        },
        {
          binding: 1,
          texture: {
            sampleType: "float",
            viewDimension: "2d",
          },
          visibility: GPUShaderStage.FRAGMENT,
        },
      ],
      label: "setta-gpu-node-quad-texture-bind-group-layout",
    });
    const shaderModule = device.createShaderModule({
      code: NODE_QUAD_SHADER,
      label: "setta-gpu-node-quad-shader",
    });
    this.pipeline = device.createRenderPipeline({
      fragment: {
        entryPoint: "fs_main",
        module: shaderModule,
        targets: [
          {
            blend: {
              alpha: {
                dstFactor: "one-minus-src-alpha",
                operation: "add",
                srcFactor: "one",
              },
              color: {
                dstFactor: "one-minus-src-alpha",
                operation: "add",
                srcFactor: "src-alpha",
              },
            },
            format: this.runtime.format,
          },
        ],
      },
      label: "setta-gpu-node-quad-pipeline",
      layout: device.createPipelineLayout({
        bindGroupLayouts: [
          this.cameraBindGroupLayout,
          this.textureBindGroupLayout,
        ],
        label: "setta-gpu-node-quad-pipeline-layout",
      }),
      primitive: {
        topology: "triangle-list",
      },
      vertex: {
        buffers: [
          {
            arrayStride: NODE_QUAD_VERTEX_BYTES,
            attributes: [
              {
                format: "float32x2",
                offset: 0,
                shaderLocation: 0,
              },
              {
                format: "float32x2",
                offset: Float32Array.BYTES_PER_ELEMENT * 2,
                shaderLocation: 1,
              },
            ],
          },
        ],
        entryPoint: "vs_main",
        module: shaderModule,
      },
    });
    return this.pipeline;
  }

  private ensureVertexBuffer(byteLength: number): GPUBuffer {
    if (this.vertexBuffer && this.vertexBufferByteCapacity >= byteLength) {
      return this.vertexBuffer;
    }
    this.vertexBuffer?.destroy?.();
    const size = Math.max(NODE_QUAD_VERTEX_BYTES, alignToFourBytes(byteLength));
    this.vertexBuffer = this.runtime.device.createBuffer({
      label: "setta-gpu-node-quad-vertices",
      size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
    });
    this.vertexBufferByteCapacity = size;
    return this.vertexBuffer;
  }

  private getTextureBindGroup(quad: GpuTexturedNodeQuad): GPUBindGroup {
    const cached = this.textureBindGroups.get(quad.nodeId);
    if (
      cached &&
      cached.textureView === quad.texture.textureView &&
      cached.sampler === quad.texture.sampler
    ) {
      return cached.bindGroup;
    }

    const textureBindGroupLayout = this.textureBindGroupLayout;
    if (!textureBindGroupLayout) {
      throw new Error(
        "Setta GPU node rendering requires a texture bind group layout.",
      );
    }

    const bindGroup = this.runtime.device.createBindGroup({
      entries: [
        {
          binding: 0,
          resource: quad.texture.sampler,
        },
        {
          binding: 1,
          resource: quad.texture.textureView,
        },
      ],
      label: `setta-gpu-node-quad-texture-bind-group-${quad.nodeId}`,
      layout: textureBindGroupLayout,
    });
    this.textureBindGroups.set(quad.nodeId, {
      bindGroup,
      sampler: quad.texture.sampler,
      textureView: quad.texture.textureView,
    });
    return bindGroup;
  }
}

export function encodeNodeQuadCameraUniform({
  canvasHeight,
  canvasWidth,
  viewport,
}: {
  readonly canvasHeight: number;
  readonly canvasWidth: number;
  readonly viewport: GpuViewportInput;
}): Float32Array {
  const normalizedViewport = normalizeGpuViewport(viewport);
  if (canvasWidth <= 0 || canvasHeight <= 0) {
    throw new Error("Setta GPU node rendering requires positive canvas size.");
  }
  return new Float32Array([
    normalizedViewport.x,
    normalizedViewport.y,
    normalizedViewport.zoom,
    0,
    canvasWidth,
    canvasHeight,
    0,
    0,
  ]);
}

export function buildNodeQuadVertexData(
  quads: readonly Pick<GpuTexturedNodeQuad, "height" | "width" | "x" | "y">[],
): Float32Array {
  const data = new Float32Array(
    quads.length * VERTICES_PER_QUAD * FLOATS_PER_VERTEX,
  );
  let offset = 0;
  for (const quad of quads) {
    const left = quad.x;
    const top = quad.y;
    const right = quad.x + quad.width;
    const bottom = quad.y + quad.height;
    offset = writeNodeQuadVertex(data, offset, { u: 0, v: 0, x: left, y: top });
    offset = writeNodeQuadVertex(data, offset, {
      u: 1,
      v: 0,
      x: right,
      y: top,
    });
    offset = writeNodeQuadVertex(data, offset, {
      u: 0,
      v: 1,
      x: left,
      y: bottom,
    });
    offset = writeNodeQuadVertex(data, offset, {
      u: 0,
      v: 1,
      x: left,
      y: bottom,
    });
    offset = writeNodeQuadVertex(data, offset, {
      u: 1,
      v: 0,
      x: right,
      y: top,
    });
    offset = writeNodeQuadVertex(data, offset, {
      u: 1,
      v: 1,
      x: right,
      y: bottom,
    });
  }
  return data;
}

type NodeQuadVertex = {
  readonly u: number;
  readonly v: number;
  readonly x: number;
  readonly y: number;
};

function writeNodeQuadVertex(
  data: Float32Array,
  offset: number,
  vertex: NodeQuadVertex,
): number {
  data[offset] = vertex.x;
  data[offset + 1] = vertex.y;
  data[offset + 2] = vertex.u;
  data[offset + 3] = vertex.v;
  return offset + FLOATS_PER_VERTEX;
}

function alignToFourBytes(value: number): number {
  return Math.ceil(value / 4) * 4;
}

const NODE_QUAD_SHADER = `
struct Camera {
  viewport: vec4<f32>,
  canvas: vec4<f32>,
};

@group(0) @binding(0) var<uniform> camera: Camera;
@group(1) @binding(0) var nodeSampler: sampler;
@group(1) @binding(1) var nodeTexture: texture_2d<f32>;

struct VertexInput {
  @location(0) flowPosition: vec2<f32>,
  @location(1) uv: vec2<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  let screen = camera.viewport.xy + input.flowPosition * camera.viewport.z;
  let clip = vec2<f32>(
    (screen.x / camera.canvas.x) * 2.0 - 1.0,
    1.0 - (screen.y / camera.canvas.y) * 2.0
  );
  var output: VertexOutput;
  output.position = vec4<f32>(clip, 0.0, 1.0);
  output.uv = input.uv;
  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  return textureSample(nodeTexture, nodeSampler, input.uv);
}
`;
