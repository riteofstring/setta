import {
  buildGpuEdgeLineListBufferData,
  type GpuEdgeBufferInput,
  type GpuEdgeLineListBufferData,
} from "../edges/edgeGpuBuffers";

import type { GpuTexturedNodeQuad } from "../GpuNodeLayer";

import { normalizeGpuViewport, type GpuViewportInput } from "../viewportMath";

import {
  CAMERA_UNIFORM_BYTES,
  DEFAULT_CLEAR_COLOR,
  DEFAULT_EDGE_PALETTE_INPUT,
  EDGE_PALETTE_UNIFORM_BYTES,
  EDGE_VERTEX_BYTES,
  EMPTY_EDGE_BUFFER_INPUTS,
  EdgeDrawResources,
  GRID_UNIFORM_BYTES,
  GpuEdgePaletteInput,
  GpuGridInput,
  GridDrawResources,
  NODE_QUAD_VERTEX_BYTES,
  NodeDrawResources,
  NodeQuadRenderRuntime,
  NodeQuadVertexCache,
  RenderNodeTextureQuadsInput,
  RenderNodeTextureQuadsResult,
  VERTICES_PER_QUAD,
} from "./pipelineTypes";

import {
  EDGE_LINE_SHADER,
  GRID_SHADER,
  NODE_QUAD_SHADER,
  alignToFourBytes,
  areFloat32ArraysEqual,
  buildNodeQuadVertexData,
  captureNodeQuadGeometry,
  encodeGpuEdgePaletteUniform,
  encodeGpuGridUniform,
  isNodeQuadVertexCacheValid,
} from "./bufferAndShaders";

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

export function destroyGpuBuffers(buffers: readonly (GPUBuffer | null)[]) {
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
