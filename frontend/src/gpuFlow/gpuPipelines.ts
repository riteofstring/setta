import { BackgroundVariantEnum, type ObjectValues } from "utils/generatedTypes";
import {
  buildGpuEdgeLineListBufferData,
  GPU_EDGE_VERTEX_FLOATS,
  type GpuEdgeBufferInput,
  type GpuEdgeLineListBufferData,
} from "./edges/edgeGpuBuffers";
import { parseGpuHexColor } from "./gpuColors";
import type { GpuFlowRuntime } from "./gpuDevice";
import type { GpuTexturedNodeQuad } from "./GpuNodeLayer";
import type { GpuCanvasSize } from "./gpuRenderer";
import { normalizeGpuViewport, type GpuViewportInput } from "./viewportMath";

export type NodeQuadRenderRuntime = Pick<
  GpuFlowRuntime,
  "context" | "device" | "format"
>;

type GpuGridVariant = ObjectValues<typeof BackgroundVariantEnum>;

export type GpuGridInput = {
  readonly color: string;
  readonly patternSize: number;
  readonly snapGrid: readonly [number, number];
  readonly variant: GpuGridVariant;
};

export type GpuEdgePaletteInput = {
  readonly color: string;
};

export type RenderNodeTextureQuadsInput = {
  readonly canvasSize: Pick<GpuCanvasSize, "cssHeight" | "cssWidth">;
  readonly clearColor?: GPUColorDict | undefined;
  readonly edgePalette?: GpuEdgePaletteInput | undefined;
  readonly edges?: readonly GpuEdgeBufferInput[] | undefined;
  readonly grid?: GpuGridInput | undefined;
  readonly quads: readonly GpuTexturedNodeQuad[];
  readonly viewport: GpuViewportInput;
};

export type RenderNodeTextureQuadsResult = {
  readonly drawnEdgeIds: readonly string[];
  readonly drawnNodeIds: readonly string[];
  readonly edgeVertexCount: number;
  readonly vertexCount: number;
};

type EdgeDrawResources = {
  readonly bindGroup: GPUBindGroup;
  readonly pipeline: GPURenderPipeline;
  readonly vertexBuffer: GPUBuffer;
};

type NodeDrawResources = {
  readonly pipeline: GPURenderPipeline;
  readonly vertexBuffer: GPUBuffer;
};

type CachedNodeQuadGeometry = {
  readonly height: number;
  readonly nodeId: string;
  readonly width: number;
  readonly x: number;
  readonly y: number;
  readonly zIndex: number;
};

type NodeQuadVertexCache = {
  readonly geometry: readonly CachedNodeQuadGeometry[];
  readonly vertexData: Float32Array;
};

type GridDrawResources = {
  readonly bindGroup: GPUBindGroup;
  readonly pipeline: GPURenderPipeline;
};

const CAMERA_UNIFORM_BYTES = 32;
const EDGE_PALETTE_UNIFORM_BYTES = 16;
const GRID_UNIFORM_BYTES = 32;
const FLOATS_PER_VERTEX = 4;
const VERTICES_PER_QUAD = 6;
const EDGE_VERTEX_BYTES =
  Float32Array.BYTES_PER_ELEMENT * GPU_EDGE_VERTEX_FLOATS;
const NODE_QUAD_VERTEX_BYTES =
  Float32Array.BYTES_PER_ELEMENT * FLOATS_PER_VERTEX;
const DEFAULT_CLEAR_COLOR: GPUColorDict = { a: 0, b: 0, g: 0, r: 0 };
const DEFAULT_EDGE_PALETTE_INPUT: GpuEdgePaletteInput = { color: "#545e70c7" };
const EMPTY_EDGE_BUFFER_INPUTS: readonly GpuEdgeBufferInput[] = [];

export class GpuNodeQuadRenderer {
  private readonly runtime: NodeQuadRenderRuntime;
  private cameraBindGroup: GPUBindGroup | null = null;
  private cameraBindGroupLayout: GPUBindGroupLayout | null = null;
  private cameraBuffer: GPUBuffer | null = null;
  private edgeBufferCache: {
    readonly bufferData: GpuEdgeLineListBufferData;
    readonly edges: readonly GpuEdgeBufferInput[];
  } | null = null;
  private edgePaletteBindGroup: GPUBindGroup | null = null;
  private edgePaletteBindGroupLayout: GPUBindGroupLayout | null = null;
  private edgePaletteBuffer: GPUBuffer | null = null;
  private edgePipeline: GPURenderPipeline | null = null;
  private edgeVertexBuffer: GPUBuffer | null = null;
  private edgeVertexBufferByteCapacity = 0;
  private gridBindGroup: GPUBindGroup | null = null;
  private gridBindGroupLayout: GPUBindGroupLayout | null = null;
  private gridBuffer: GPUBuffer | null = null;
  private gridPipeline: GPURenderPipeline | null = null;
  private nodePipeline: GPURenderPipeline | null = null;
  private nodeVertexCache: NodeQuadVertexCache | null = null;
  private uploadedCameraUniform: Float32Array | null = null;
  private uploadedEdgeBufferData: GpuEdgeLineListBufferData | null = null;
  private uploadedEdgePaletteUniform: Float32Array | null = null;
  private uploadedGridUniform: Float32Array | null = null;
  private uploadedNodeVertexCache: NodeQuadVertexCache | null = null;
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
    destroyGpuBuffers([
      this.cameraBuffer,
      this.edgePaletteBuffer,
      this.edgeVertexBuffer,
      this.gridBuffer,
      this.vertexBuffer,
    ]);
    this.cameraBuffer = null;
    this.edgeBufferCache = null;
    this.edgePaletteBindGroup = null;
    this.edgePaletteBindGroupLayout = null;
    this.edgePaletteBuffer = null;
    this.edgePipeline = null;
    this.edgeVertexBuffer = null;
    this.edgeVertexBufferByteCapacity = 0;
    this.gridBindGroup = null;
    this.gridBindGroupLayout = null;
    this.gridBuffer = null;
    this.gridPipeline = null;
    this.vertexBuffer = null;
    this.cameraBindGroup = null;
    this.nodePipeline = null;
    this.nodeVertexCache = null;
    this.textureBindGroupLayout = null;
    this.cameraBindGroupLayout = null;
    this.textureBindGroups.clear();
    this.uploadedCameraUniform = null;
    this.uploadedEdgeBufferData = null;
    this.uploadedEdgePaletteUniform = null;
    this.uploadedGridUniform = null;
    this.uploadedNodeVertexCache = null;
    this.vertexBufferByteCapacity = 0;
  }

  render({
    canvasSize,
    clearColor = DEFAULT_CLEAR_COLOR,
    edgePalette = DEFAULT_EDGE_PALETTE_INPUT,
    edges = EMPTY_EDGE_BUFFER_INPUTS,
    grid,
    quads,
    viewport,
  }: RenderNodeTextureQuadsInput): RenderNodeTextureQuadsResult {
    const edgeBufferData = this.resolveEdgeBufferData(edges);
    const gridDraw = this.prepareGridDraw(grid);
    const edgeDraw = this.prepareEdgeDraw(edgeBufferData);
    const cameraBindGroup = this.ensureCameraBindGroup();
    const cameraUniform = encodeNodeQuadCameraUniform({
      canvasHeight: canvasSize.cssHeight,
      canvasWidth: canvasSize.cssWidth,
      viewport,
    });
    const nodeDraw = this.prepareNodeDraw(quads);
    this.writeSceneBuffers({
      cameraUniform,
      edgeBufferData,
      edgeDraw,
      edgePalette,
      grid,
      gridDraw,
      nodeDraw,
      quads,
    });

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

    this.drawGrid(pass, cameraBindGroup, gridDraw);
    this.drawEdges(pass, cameraBindGroup, edgeDraw, edgeBufferData);
    this.drawNodes(pass, cameraBindGroup, nodeDraw, quads);
    pass.end();

    this.runtime.device.queue.submit([commandEncoder.finish()]);

    return {
      drawnEdgeIds: edgeBufferData.ranges.map((range) => range.edgeId),
      drawnNodeIds: quads.map((quad) => quad.nodeId),
      edgeVertexCount: edgeBufferData.vertexCount,
      vertexCount: quads.length * VERTICES_PER_QUAD,
    };
  }

  private ensureCameraBindGroup(): GPUBindGroup {
    if (this.cameraBindGroup) {
      return this.cameraBindGroup;
    }
    const cameraBindGroupLayout = this.ensureCameraBindGroupLayout();
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

  private ensureCameraBindGroupLayout(): GPUBindGroupLayout {
    if (this.cameraBindGroupLayout) {
      return this.cameraBindGroupLayout;
    }
    const device = this.runtime.device;
    this.cameraBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          buffer: {
            type: "uniform",
          },
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        },
      ],
      label: "setta-gpu-node-quad-camera-bind-group-layout",
    });
    return this.cameraBindGroupLayout;
  }

  private ensureTextureBindGroupLayout(): GPUBindGroupLayout {
    if (this.textureBindGroupLayout) {
      return this.textureBindGroupLayout;
    }
    const device = this.runtime.device;
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
    return this.textureBindGroupLayout;
  }

  private ensureGridBindGroup(): GPUBindGroup {
    if (this.gridBindGroup) {
      return this.gridBindGroup;
    }
    const device = this.runtime.device;
    const gridBindGroupLayout = this.ensureGridBindGroupLayout();
    this.gridBuffer = device.createBuffer({
      label: "setta-gpu-grid-uniform",
      size: GRID_UNIFORM_BYTES,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    this.gridBindGroup = device.createBindGroup({
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.gridBuffer,
          },
        },
      ],
      label: "setta-gpu-grid-bind-group",
      layout: gridBindGroupLayout,
    });
    return this.gridBindGroup;
  }

  private ensureGridBindGroupLayout(): GPUBindGroupLayout {
    if (this.gridBindGroupLayout) {
      return this.gridBindGroupLayout;
    }
    this.gridBindGroupLayout = this.runtime.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          buffer: {
            type: "uniform",
          },
          visibility: GPUShaderStage.FRAGMENT,
        },
      ],
      label: "setta-gpu-grid-bind-group-layout",
    });
    return this.gridBindGroupLayout;
  }

  private ensureEdgePaletteBindGroup(): GPUBindGroup {
    if (this.edgePaletteBindGroup) {
      return this.edgePaletteBindGroup;
    }
    const device = this.runtime.device;
    const edgePaletteBindGroupLayout = this.ensureEdgePaletteBindGroupLayout();
    this.edgePaletteBuffer = device.createBuffer({
      label: "setta-gpu-edge-palette-uniform",
      size: EDGE_PALETTE_UNIFORM_BYTES,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    this.edgePaletteBindGroup = device.createBindGroup({
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.edgePaletteBuffer,
          },
        },
      ],
      label: "setta-gpu-edge-palette-bind-group",
      layout: edgePaletteBindGroupLayout,
    });
    return this.edgePaletteBindGroup;
  }

  private ensureEdgePaletteBindGroupLayout(): GPUBindGroupLayout {
    if (this.edgePaletteBindGroupLayout) {
      return this.edgePaletteBindGroupLayout;
    }
    this.edgePaletteBindGroupLayout = this.runtime.device.createBindGroupLayout(
      {
        entries: [
          {
            binding: 0,
            buffer: {
              type: "uniform",
            },
            visibility: GPUShaderStage.FRAGMENT,
          },
        ],
        label: "setta-gpu-edge-palette-bind-group-layout",
      },
    );
    return this.edgePaletteBindGroupLayout;
  }

  private ensureGridPipeline(): GPURenderPipeline {
    if (this.gridPipeline) {
      return this.gridPipeline;
    }
    const device = this.runtime.device;
    const cameraBindGroupLayout = this.ensureCameraBindGroupLayout();
    const gridBindGroupLayout = this.ensureGridBindGroupLayout();
    const shaderModule = device.createShaderModule({
      code: GRID_SHADER,
      label: "setta-gpu-grid-shader",
    });
    this.gridPipeline = device.createRenderPipeline({
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
      label: "setta-gpu-grid-pipeline",
      layout: device.createPipelineLayout({
        bindGroupLayouts: [cameraBindGroupLayout, gridBindGroupLayout],
        label: "setta-gpu-grid-pipeline-layout",
      }),
      primitive: {
        topology: "triangle-list",
      },
      vertex: {
        entryPoint: "vs_main",
        module: shaderModule,
      },
    });
    return this.gridPipeline;
  }

  private ensureNodePipeline(): GPURenderPipeline {
    if (this.nodePipeline) {
      return this.nodePipeline;
    }
    const device = this.runtime.device;
    const cameraBindGroupLayout = this.ensureCameraBindGroupLayout();
    const textureBindGroupLayout = this.ensureTextureBindGroupLayout();
    const shaderModule = device.createShaderModule({
      code: NODE_QUAD_SHADER,
      label: "setta-gpu-node-quad-shader",
    });
    this.nodePipeline = device.createRenderPipeline({
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
        bindGroupLayouts: [cameraBindGroupLayout, textureBindGroupLayout],
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
    return this.nodePipeline;
  }

  private prepareGridDraw(
    grid: GpuGridInput | undefined,
  ): GridDrawResources | null {
    if (!grid) {
      return null;
    }
    return {
      bindGroup: this.ensureGridBindGroup(),
      pipeline: this.ensureGridPipeline(),
    };
  }

  private prepareEdgeDraw(
    edgeBufferData: GpuEdgeLineListBufferData,
  ): EdgeDrawResources | null {
    if (edgeBufferData.vertexCount === 0) {
      return null;
    }
    return {
      bindGroup: this.ensureEdgePaletteBindGroup(),
      pipeline: this.ensureEdgePipeline(),
      vertexBuffer: this.ensureEdgeVertexBuffer(
        edgeBufferData.vertexData.byteLength,
      ),
    };
  }

  private ensureEdgePipeline(): GPURenderPipeline {
    if (this.edgePipeline) {
      return this.edgePipeline;
    }
    const device = this.runtime.device;
    const cameraBindGroupLayout = this.ensureCameraBindGroupLayout();
    const edgePaletteBindGroupLayout = this.ensureEdgePaletteBindGroupLayout();
    const shaderModule = device.createShaderModule({
      code: EDGE_LINE_SHADER,
      label: "setta-gpu-edge-line-shader",
    });
    this.edgePipeline = device.createRenderPipeline({
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
      label: "setta-gpu-edge-line-pipeline",
      layout: device.createPipelineLayout({
        bindGroupLayouts: [cameraBindGroupLayout, edgePaletteBindGroupLayout],
        label: "setta-gpu-edge-line-pipeline-layout",
      }),
      primitive: {
        topology: "line-list",
      },
      vertex: {
        buffers: [
          {
            arrayStride: EDGE_VERTEX_BYTES,
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
              {
                format: "float32x4",
                offset: Float32Array.BYTES_PER_ELEMENT * 4,
                shaderLocation: 2,
              },
            ],
          },
        ],
        entryPoint: "vs_main",
        module: shaderModule,
      },
    });
    return this.edgePipeline;
  }

  private ensureEdgeVertexBuffer(byteLength: number): GPUBuffer {
    if (
      this.edgeVertexBuffer &&
      this.edgeVertexBufferByteCapacity >= byteLength
    ) {
      return this.edgeVertexBuffer;
    }

    this.edgeVertexBuffer?.destroy?.();
    const size = Math.max(EDGE_VERTEX_BYTES, alignToFourBytes(byteLength));
    this.edgeVertexBuffer = this.runtime.device.createBuffer({
      label: "setta-gpu-edge-line-vertices",
      size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
    });
    this.edgeVertexBufferByteCapacity = size;
    this.uploadedEdgeBufferData = null;
    return this.edgeVertexBuffer;
  }

  private ensureNodeVertexBuffer(byteLength: number): GPUBuffer {
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
    this.uploadedNodeVertexCache = null;
    return this.vertexBuffer;
  }

  private prepareNodeDraw(
    quads: readonly GpuTexturedNodeQuad[],
  ): NodeDrawResources | null {
    if (quads.length === 0) {
      return null;
    }
    const byteLength =
      quads.length * VERTICES_PER_QUAD * NODE_QUAD_VERTEX_BYTES;
    return {
      pipeline: this.ensureNodePipeline(),
      vertexBuffer: this.ensureNodeVertexBuffer(byteLength),
    };
  }

  private resolveEdgeBufferData(
    edges: readonly GpuEdgeBufferInput[],
  ): GpuEdgeLineListBufferData {
    if (this.edgeBufferCache?.edges === edges) {
      return this.edgeBufferCache.bufferData;
    }
    const bufferData = buildGpuEdgeLineListBufferData({ edges });
    this.edgeBufferCache = { bufferData, edges };
    return bufferData;
  }

  private writeSceneBuffers({
    cameraUniform,
    edgeBufferData,
    edgeDraw,
    edgePalette,
    grid,
    gridDraw,
    nodeDraw,
    quads,
  }: {
    readonly cameraUniform: Float32Array;
    readonly edgeBufferData: GpuEdgeLineListBufferData;
    readonly edgeDraw: EdgeDrawResources | null;
    readonly edgePalette: GpuEdgePaletteInput;
    readonly grid: GpuGridInput | undefined;
    readonly gridDraw: GridDrawResources | null;
    readonly nodeDraw: NodeDrawResources | null;
    readonly quads: readonly GpuTexturedNodeQuad[];
  }) {
    this.writeCameraBuffer(cameraUniform);
    this.writeGridBuffer(gridDraw, grid);
    this.writeEdgePaletteBuffer(edgeDraw, edgePalette);
    this.writeEdgeBuffer(edgeDraw, edgeBufferData);
    this.writeNodeBuffer(nodeDraw, quads);
  }

  private writeCameraBuffer(cameraUniform: Float32Array) {
    if (areFloat32ArraysEqual(this.uploadedCameraUniform, cameraUniform)) {
      return;
    }
    this.runtime.device.queue.writeBuffer(
      this.getCameraBuffer(),
      0,
      cameraUniform,
    );
    this.uploadedCameraUniform = cameraUniform;
  }

  private writeGridBuffer(
    gridDraw: GridDrawResources | null,
    grid: GpuGridInput | undefined,
  ) {
    if (!gridDraw || !grid) {
      return;
    }
    const gridUniform = encodeGpuGridUniform(grid);
    if (areFloat32ArraysEqual(this.uploadedGridUniform, gridUniform)) {
      return;
    }
    this.runtime.device.queue.writeBuffer(this.getGridBuffer(), 0, gridUniform);
    this.uploadedGridUniform = gridUniform;
  }

  private writeEdgePaletteBuffer(
    edgeDraw: EdgeDrawResources | null,
    edgePalette: GpuEdgePaletteInput,
  ) {
    if (!edgeDraw) {
      return;
    }
    const edgePaletteUniform = encodeGpuEdgePaletteUniform(edgePalette);
    if (
      areFloat32ArraysEqual(this.uploadedEdgePaletteUniform, edgePaletteUniform)
    ) {
      return;
    }
    this.runtime.device.queue.writeBuffer(
      this.getEdgePaletteBuffer(),
      0,
      edgePaletteUniform,
    );
    this.uploadedEdgePaletteUniform = edgePaletteUniform;
  }

  private writeEdgeBuffer(
    edgeDraw: EdgeDrawResources | null,
    edgeBufferData: GpuEdgeLineListBufferData,
  ) {
    if (!edgeDraw || this.uploadedEdgeBufferData === edgeBufferData) {
      return;
    }
    this.runtime.device.queue.writeBuffer(
      edgeDraw.vertexBuffer,
      0,
      edgeBufferData.vertexData,
    );
    this.uploadedEdgeBufferData = edgeBufferData;
  }

  private writeNodeBuffer(
    nodeDraw: NodeDrawResources | null,
    quads: readonly GpuTexturedNodeQuad[],
  ) {
    if (!nodeDraw) {
      this.uploadedNodeVertexCache = null;
      return;
    }
    const vertexCache = this.resolveNodeVertexCache(quads);
    if (this.uploadedNodeVertexCache === vertexCache) {
      return;
    }
    this.runtime.device.queue.writeBuffer(
      nodeDraw.vertexBuffer,
      0,
      vertexCache.vertexData,
    );
    this.uploadedNodeVertexCache = vertexCache;
  }

  private resolveNodeVertexCache(
    quads: readonly GpuTexturedNodeQuad[],
  ): NodeQuadVertexCache {
    if (isNodeQuadVertexCacheValid(this.nodeVertexCache, quads)) {
      return this.nodeVertexCache;
    }
    const vertexCache = {
      geometry: captureNodeQuadGeometry(quads),
      vertexData: buildNodeQuadVertexData(quads),
    };
    this.nodeVertexCache = vertexCache;
    return vertexCache;
  }

  private drawGrid(
    pass: GPURenderPassEncoder,
    cameraBindGroup: GPUBindGroup,
    gridDraw: GridDrawResources | null,
  ) {
    if (!gridDraw) {
      return;
    }
    pass.setPipeline(gridDraw.pipeline);
    pass.setBindGroup(0, cameraBindGroup);
    pass.setBindGroup(1, gridDraw.bindGroup);
    pass.draw(3, 1, 0, 0);
  }

  private drawEdges(
    pass: GPURenderPassEncoder,
    cameraBindGroup: GPUBindGroup,
    edgeDraw: EdgeDrawResources | null,
    edgeBufferData: GpuEdgeLineListBufferData,
  ) {
    if (!edgeDraw) {
      return;
    }
    pass.setPipeline(edgeDraw.pipeline);
    pass.setBindGroup(0, cameraBindGroup);
    pass.setBindGroup(1, edgeDraw.bindGroup);
    pass.setVertexBuffer(0, edgeDraw.vertexBuffer);
    pass.draw(edgeBufferData.vertexCount, 1, 0, 0);
  }

  private drawNodes(
    pass: GPURenderPassEncoder,
    cameraBindGroup: GPUBindGroup,
    nodeDraw: NodeDrawResources | null,
    quads: readonly GpuTexturedNodeQuad[],
  ) {
    if (!nodeDraw) {
      return;
    }
    pass.setPipeline(nodeDraw.pipeline);
    pass.setBindGroup(0, cameraBindGroup);
    pass.setVertexBuffer(0, nodeDraw.vertexBuffer);
    quads.forEach((quad, index) => {
      pass.setBindGroup(1, this.getTextureBindGroup(quad));
      pass.draw(VERTICES_PER_QUAD, 1, index * VERTICES_PER_QUAD, 0);
    });
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

    const textureBindGroupLayout = this.ensureTextureBindGroupLayout();

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

  private getCameraBuffer(): GPUBuffer {
    const cameraBuffer = this.cameraBuffer;
    if (!cameraBuffer) {
      throw new Error(
        "Setta GPU node rendering failed to create camera buffer.",
      );
    }
    return cameraBuffer;
  }

  private getGridBuffer(): GPUBuffer {
    const gridBuffer = this.gridBuffer;
    if (!gridBuffer) {
      throw new Error("Setta GPU grid rendering failed to create grid buffer.");
    }
    return gridBuffer;
  }

  private getEdgePaletteBuffer(): GPUBuffer {
    const edgePaletteBuffer = this.edgePaletteBuffer;
    if (!edgePaletteBuffer) {
      throw new Error(
        "Setta GPU edge rendering failed to create edge palette buffer.",
      );
    }
    return edgePaletteBuffer;
  }
}

function destroyGpuBuffers(buffers: readonly (GPUBuffer | null)[]) {
  for (const buffer of buffers) {
    buffer?.destroy?.();
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

function isNodeQuadVertexCacheValid(
  cache: NodeQuadVertexCache | null,
  quads: readonly GpuTexturedNodeQuad[],
): cache is NodeQuadVertexCache {
  if (!cache || cache.geometry.length !== quads.length) {
    return false;
  }
  for (let index = 0; index < quads.length; index += 1) {
    const cached = cache.geometry[index];
    const quad = quads[index];
    if (!cached || !isCachedNodeQuadGeometryEqual(cached, quad)) {
      return false;
    }
  }
  return true;
}

function isCachedNodeQuadGeometryEqual(
  cached: CachedNodeQuadGeometry,
  quad: GpuTexturedNodeQuad,
): boolean {
  return (
    cached.nodeId === quad.nodeId &&
    cached.x === quad.x &&
    cached.y === quad.y &&
    cached.width === quad.width &&
    cached.height === quad.height &&
    cached.zIndex === quad.zIndex
  );
}

function captureNodeQuadGeometry(
  quads: readonly GpuTexturedNodeQuad[],
): readonly CachedNodeQuadGeometry[] {
  return quads.map((quad) => ({
    height: quad.height,
    nodeId: quad.nodeId,
    width: quad.width,
    x: quad.x,
    y: quad.y,
    zIndex: quad.zIndex,
  }));
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

export function encodeGpuGridUniform(grid: GpuGridInput): Float32Array {
  const [red, green, blue, alpha] = parseGpuGridColor(grid.color);
  return new Float32Array([
    red,
    green,
    blue,
    alpha,
    requirePositiveFiniteGpuGridValue(grid.snapGrid[0], "snapGrid[0]"),
    requirePositiveFiniteGpuGridValue(grid.snapGrid[1], "snapGrid[1]"),
    requirePositiveFiniteGpuGridValue(grid.patternSize, "patternSize"),
    encodeGpuGridVariant(grid.variant),
  ]);
}

export function encodeGpuEdgePaletteUniform(
  palette: GpuEdgePaletteInput,
): Float32Array {
  const [red, green, blue, alpha] = parseGpuEdgeColor(palette.color);
  return new Float32Array([red, green, blue, alpha]);
}

export function parseGpuGridColor(
  color: string,
): readonly [number, number, number, number] {
  return parseGpuHexColor(color, "grid");
}

export function parseGpuEdgeColor(
  color: string,
): readonly [number, number, number, number] {
  return parseGpuHexColor(color, "edge palette");
}

function requirePositiveFiniteGpuGridValue(
  value: number,
  field: string,
): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Setta GPU grid requires a positive finite ${field}.`);
  }
  return value;
}

function encodeGpuGridVariant(variant: GpuGridVariant): number {
  switch (variant) {
    case BackgroundVariantEnum.lines:
      return 0;
    case BackgroundVariantEnum.dots:
      return 1;
    case BackgroundVariantEnum.cross:
      return 2;
    default:
      throw new Error(
        `Setta GPU grid received unsupported variant ${JSON.stringify(
          variant,
        )}.`,
      );
  }
}

function areFloat32ArraysEqual(
  left: Float32Array | null,
  right: Float32Array,
): boolean {
  if (!left || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function alignToFourBytes(value: number): number {
  return Math.ceil(value / 4) * 4;
}

const GRID_SHADER = `
struct Camera {
  viewport: vec4<f32>,
  canvas: vec4<f32>,
};

struct Grid {
  color: vec4<f32>,
  settings: vec4<f32>,
};

@group(0) @binding(0) var<uniform> camera: Camera;
@group(1) @binding(0) var<uniform> grid: Grid;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) screen: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  let clip = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  )[vertexIndex];
  var output: VertexOutput;
  output.position = vec4<f32>(clip, 0.0, 1.0);
  output.screen = vec2<f32>(
    (clip.x + 1.0) * 0.5 * camera.canvas.x,
    (1.0 - clip.y) * 0.5 * camera.canvas.y
  );
  return output;
}

fn axis_alpha(distance: f32, halfWidth: f32) -> f32 {
  return 1.0 - smoothstep(halfWidth, halfWidth + 1.0, distance);
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  let zoom = max(camera.viewport.z, 0.0001);
  let snap = max(grid.settings.xy, vec2<f32>(0.0001, 0.0001));
  let patternSize = max(grid.settings.z, 0.0001) * zoom;
  let variant = grid.settings.w;
  let flow = (input.screen - camera.viewport.xy) / zoom;
  let nearest = abs(fract(flow / snap + vec2<f32>(0.5, 0.5)) - vec2<f32>(0.5, 0.5));
  let distance = nearest * snap * zoom;
  let halfWidth = max(0.5, patternSize * 0.5);
  let halfLength = max(0.5, patternSize * 0.5);
  var alpha = 0.0;
  if (variant >= 1.5) {
    let vertical = axis_alpha(distance.x, halfWidth) * axis_alpha(distance.y, halfLength);
    let horizontal = axis_alpha(distance.y, halfWidth) * axis_alpha(distance.x, halfLength);
    alpha = max(vertical, horizontal);
  } else if (variant >= 0.5) {
    alpha = 1.0 - smoothstep(halfWidth, halfWidth + 1.0, length(distance));
  } else {
    alpha = max(axis_alpha(distance.x, halfWidth), axis_alpha(distance.y, halfWidth));
  }
  return vec4<f32>(grid.color.rgb, grid.color.a * alpha);
}
`;

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

const EDGE_LINE_SHADER = `
struct Camera {
  viewport: vec4<f32>,
  canvas: vec4<f32>,
};

@group(0) @binding(0) var<uniform> camera: Camera;

struct EdgePalette {
  base: vec4<f32>,
};

@group(1) @binding(0) var<uniform> edgePalette: EdgePalette;

struct VertexInput {
  @location(0) flowPosition: vec2<f32>,
  @location(1) edgeMeta: vec2<f32>,
  @location(2) edgeColor: vec4<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) flags: f32,
  @location(1) edgeColor: vec4<f32>,
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
  output.flags = input.edgeMeta.y;
  output.edgeColor = input.edgeColor;
  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  let flags = u32(input.flags);
  if ((flags & 8u) != 0u) {
    return vec4<f32>(0.92, 0.18, 0.18, 0.95);
  }
  if ((flags & 4u) != 0u) {
    return vec4<f32>(0.12, 0.62, 0.32, 0.95);
  }
  if ((flags & 64u) != 0u) {
    return vec4<f32>(0.94, 0.27, 0.27, 0.95);
  }
  if (((flags & 1u) != 0u) && ((flags & 128u) != 0u)) {
    return vec4<f32>(0.92, 0.35, 0.05, 0.95);
  }
  if ((flags & 1u) != 0u) {
    return vec4<f32>(0.15, 0.39, 0.92, 0.95);
  }
  if (((flags & 2u) != 0u) && ((flags & 32u) != 0u)) {
    return vec4<f32>(0.15, 0.39, 0.92, 0.95);
  }
  if ((flags & 2u) != 0u) {
    return vec4<f32>(0.92, 0.35, 0.05, 0.95);
  }
  if ((flags & 16u) != 0u) {
    return input.edgeColor;
  }
  if ((flags & 256u) != 0u) {
    return vec4<f32>(0.22, 0.74, 0.97, 0.9);
  }
  if ((flags & 128u) != 0u) {
    return vec4<f32>(0.96, 0.62, 0.04, 0.95);
  }
  if ((flags & 32u) != 0u) {
    return vec4<f32>(0.38, 0.65, 0.98, 0.95);
  }
  return edgePalette.base;
}
`;
