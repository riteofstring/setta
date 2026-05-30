import {
  buildGpuEdgeLineListBufferData,
  type GpuEdgeBufferInput,
  type GpuEdgeLineListBufferData,
} from "../edges/edgeGpuBuffers";

import { normalizeGpuViewport, type GpuViewportInput } from "../viewportMath";

import {
  CAMERA_UNIFORM_BYTES,
  DEFAULT_CLEAR_COLOR,
  DEFAULT_EDGE_PALETTE_INPUT,
  EDGE_PALETTE_UNIFORM_BYTES,
  EDGE_VERTEX_BYTES,
  EMPTY_EDGE_BUFFER_INPUTS,
  EdgeDrawResources,
  FLAT_SURFACE_VERTEX_BYTES,
  FlatSurfaceDrawResources,
  FlatSurfaceVertexCache,
  GRID_UNIFORM_BYTES,
  GpuEdgePaletteInput,
  GpuGridInput,
  GridDrawResources,
  HtmlSurfaceRenderRuntime,
  RenderHtmlSurfaceSceneBaseInput,
  RenderHtmlSurfaceSceneResult,
  VERTICES_PER_QUAD,
} from "../gpuPipelines/pipelineTypes";

import {
  alignToFourBytes,
  areFloat32ArraysEqual,
  buildFlatSurfaceVertexData,
  captureFlatSurfaceGeometry,
  encodeGpuEdgePaletteUniform,
  encodeGpuGridUniform,
  isFlatSurfaceVertexCacheValid,
} from "../gpuPipelines/bufferAndShaders";

import { HtmlSurfaceEffectPass } from "./rendererEffect";
import { HtmlSurfaceMeshPass } from "./rendererMesh";
import {
  createHtmlSurfaceEdgePipeline,
  createHtmlSurfaceFlatPipeline,
  createHtmlSurfaceGridPipeline,
} from "./rendererPipelineFactories";
import {
  HtmlSurfaceTiledFlatPass,
  createTiledFlatSurfaceDrawTiles,
  type TiledFlatSurfaceDrawTile,
} from "./rendererTiledFlat";

import type {
  HtmlSurfaceFlatVisual,
  HtmlSurfaceVisualScene,
} from "./visualScene";

export type RenderHtmlSurfacesInput = RenderHtmlSurfaceSceneBaseInput & {
  readonly scene: HtmlSurfaceVisualScene;
};

export type RenderHtmlSurfacesResult = RenderHtmlSurfaceSceneResult;

type PreparedMeshSurfaceDraw = {
  readonly draw: ReturnType<HtmlSurfaceMeshPass["prepare"]>;
  readonly pass: HtmlSurfaceMeshPass;
};

type PreparedEffectSurfaceDraw = {
  readonly draw: ReturnType<HtmlSurfaceEffectPass["prepare"]>;
  readonly pass: HtmlSurfaceEffectPass;
};

export class HtmlSurfaceRenderer {
  private readonly runtime: HtmlSurfaceRenderRuntime;
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
  private flatSurfacePipeline: GPURenderPipeline | null = null;
  private flatSurfaceVertexCache: FlatSurfaceVertexCache | null = null;
  private effectSurfacePass: HtmlSurfaceEffectPass | null = null;
  private meshSurfacePass: HtmlSurfaceMeshPass | null = null;
  private uploadedCameraUniform: Float32Array | null = null;
  private uploadedEdgeBufferData: GpuEdgeLineListBufferData | null = null;
  private uploadedEdgePaletteUniform: Float32Array | null = null;
  private uploadedGridUniform: Float32Array | null = null;
  private uploadedFlatSurfaceVertexCache: FlatSurfaceVertexCache | null = null;
  private textureBindGroupLayout: GPUBindGroupLayout | null = null;
  private readonly textureBindGroups = new Map<
    string,
    {
      readonly bindGroup: GPUBindGroup;
      readonly sampler: GPUSampler;
      readonly textureView: GPUTextureView;
    }
  >();
  private tiledFlatSurfacePass: HtmlSurfaceTiledFlatPass | null = null;
  private vertexBuffer: GPUBuffer | null = null;
  private vertexBufferByteCapacity = 0;

  constructor(runtime: HtmlSurfaceRenderRuntime) {
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
    this.effectSurfacePass?.destroy();
    this.meshSurfacePass?.destroy();
    this.tiledFlatSurfacePass?.destroy();
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
    this.effectSurfacePass = null;
    this.meshSurfacePass = null;
    this.tiledFlatSurfacePass = null;
    this.vertexBuffer = null;
    this.cameraBindGroup = null;
    this.flatSurfacePipeline = null;
    this.flatSurfaceVertexCache = null;
    this.textureBindGroupLayout = null;
    this.cameraBindGroupLayout = null;
    this.textureBindGroups.clear();
    this.uploadedCameraUniform = null;
    this.uploadedEdgeBufferData = null;
    this.uploadedEdgePaletteUniform = null;
    this.uploadedGridUniform = null;
    this.uploadedFlatSurfaceVertexCache = null;
    this.vertexBufferByteCapacity = 0;
  }

  render({
    canvasSize,
    clearColor = DEFAULT_CLEAR_COLOR,
    edgePalette = DEFAULT_EDGE_PALETTE_INPUT,
    edges = EMPTY_EDGE_BUFFER_INPUTS,
    grid,
    scene,
    viewport,
  }: RenderHtmlSurfacesInput): RenderHtmlSurfacesResult {
    const flatSurfaces = scene.flatSurfaces;
    const tiledFlatSurfaceTiles = createTiledFlatSurfaceDrawTiles(
      scene.tiledFlatSurfaces,
    );
    const meshSurfaces = scene.meshSurfaces;
    const effectSurfaces = scene.effectSurfaces;
    const edgeBufferData = this.resolveEdgeBufferData(edges);
    const gridDraw = this.prepareGridDraw(grid);
    const edgeDraw = this.prepareEdgeDraw(edgeBufferData);
    const cameraBindGroup = this.ensureCameraBindGroup();
    const cameraUniform = encodeHtmlSurfaceCameraUniform({
      canvasHeight: canvasSize.cssHeight,
      canvasWidth: canvasSize.cssWidth,
      viewport,
    });
    const flatSurfaceDraw = this.prepareFlatSurfaceDraw(flatSurfaces);
    const tiledFlatSurfaceDraw = this.prepareTiledFlatSurfaceDraw(
      tiledFlatSurfaceTiles,
    );
    const meshSurfaceDraw = this.prepareMeshSurfaceDraw(meshSurfaces);
    const effectSurfaceDraw = this.prepareEffectSurfaceDraw(effectSurfaces);
    this.writeSceneBuffers({
      cameraUniform,
      edgeBufferData,
      edgeDraw,
      edgePalette,
      effectSurfaceDraw,
      effectSurfaces,
      grid,
      gridDraw,
      flatSurfaceDraw,
      flatSurfaces,
      meshSurfaceDraw,
      meshSurfaces,
      tiledFlatSurfaceDraw,
      tiledFlatSurfaceTiles,
    });

    const commandEncoder = this.runtime.device.createCommandEncoder({
      label: "setta-html-surface-renderer-encoder",
    });
    const currentTexture = this.runtime.context.getCurrentTexture();
    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          clearValue: clearColor,
          loadOp: "clear",
          storeOp: "store",
          view: currentTexture.createView({
            label: "setta-html-surface-current-texture-view",
          }),
        },
      ],
      label: "setta-html-surface-render-pass",
    });

    this.drawGrid(pass, cameraBindGroup, gridDraw);
    this.drawEdges(pass, cameraBindGroup, edgeDraw, edgeBufferData);
    this.drawFlatSurfaces(pass, cameraBindGroup, flatSurfaceDraw, flatSurfaces);
    this.drawTiledFlatSurfaces(
      pass,
      cameraBindGroup,
      tiledFlatSurfaceDraw,
      tiledFlatSurfaceTiles,
    );
    this.drawMeshSurfaces(pass, cameraBindGroup, meshSurfaceDraw, meshSurfaces);
    this.drawEffectSurfaces(
      pass,
      cameraBindGroup,
      effectSurfaceDraw,
      effectSurfaces,
    );
    pass.end();

    this.runtime.device.queue.submit([commandEncoder.finish()]);
    const meshVertexCount = this.getMeshSurfaceVertexCount(
      meshSurfaceDraw,
      meshSurfaces,
    );
    const effectVertexCount = this.getEffectSurfaceVertexCount(
      effectSurfaceDraw,
      effectSurfaces,
    );

    return {
      drawnEdgeIds: edgeBufferData.ranges.map((range) => range.edgeId),
      drawnSurfaceIds: [
        ...flatSurfaces.map((surface) => surface.surfaceId),
        ...scene.tiledFlatSurfaces.map((surface) => surface.surfaceId),
        ...meshSurfaces.map((surface) => surface.surfaceId),
        ...effectSurfaces.map((surface) => surface.surfaceId),
      ],
      edgeVertexCount: edgeBufferData.vertexCount,
      vertexCount:
        (flatSurfaces.length + tiledFlatSurfaceTiles.length) *
          VERTICES_PER_QUAD +
        meshVertexCount +
        effectVertexCount,
    };
  }

  private ensureCameraBindGroup(): GPUBindGroup {
    if (this.cameraBindGroup) {
      return this.cameraBindGroup;
    }
    const cameraBindGroupLayout = this.ensureCameraBindGroupLayout();
    const device = this.runtime.device;
    this.cameraBuffer = device.createBuffer({
      label: "setta-html-surface-camera-uniform",
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
      label: "setta-html-surface-camera-bind-group",
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
      label: "setta-html-surface-camera-bind-group-layout",
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
      label: "setta-html-surface-texture-bind-group-layout",
    });
    return this.textureBindGroupLayout;
  }

  private ensureMeshSurfacePass(): HtmlSurfaceMeshPass {
    if (this.meshSurfacePass) {
      return this.meshSurfacePass;
    }
    this.meshSurfacePass = new HtmlSurfaceMeshPass({
      getCameraBindGroupLayout: () => this.ensureCameraBindGroupLayout(),
      getTextureBindGroup: (surface) => this.getTextureBindGroup(surface),
      getTextureBindGroupLayout: () => this.ensureTextureBindGroupLayout(),
      runtime: this.runtime,
    });
    return this.meshSurfacePass;
  }

  private ensureTiledFlatSurfacePass(): HtmlSurfaceTiledFlatPass {
    if (this.tiledFlatSurfacePass) {
      return this.tiledFlatSurfacePass;
    }
    this.tiledFlatSurfacePass = new HtmlSurfaceTiledFlatPass({
      getFlatSurfacePipeline: () => this.ensureFlatSurfacePipeline(),
      getTextureBindGroup: (tile) => this.getTextureBindGroup(tile),
      runtime: this.runtime,
    });
    return this.tiledFlatSurfacePass;
  }

  private ensureEffectSurfacePass(): HtmlSurfaceEffectPass {
    if (this.effectSurfacePass) {
      return this.effectSurfacePass;
    }
    this.effectSurfacePass = new HtmlSurfaceEffectPass({
      getCameraBindGroupLayout: () => this.ensureCameraBindGroupLayout(),
      getTextureBindGroup: (surface) => this.getTextureBindGroup(surface),
      getTextureBindGroupLayout: () => this.ensureTextureBindGroupLayout(),
      runtime: this.runtime,
    });
    return this.effectSurfacePass;
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
    this.gridPipeline = createHtmlSurfaceGridPipeline({
      cameraBindGroupLayout: this.ensureCameraBindGroupLayout(),
      gridBindGroupLayout: this.ensureGridBindGroupLayout(),
      runtime: this.runtime,
    });
    return this.gridPipeline;
  }

  private ensureFlatSurfacePipeline(): GPURenderPipeline {
    if (this.flatSurfacePipeline) {
      return this.flatSurfacePipeline;
    }
    this.flatSurfacePipeline = createHtmlSurfaceFlatPipeline({
      cameraBindGroupLayout: this.ensureCameraBindGroupLayout(),
      runtime: this.runtime,
      textureBindGroupLayout: this.ensureTextureBindGroupLayout(),
    });
    return this.flatSurfacePipeline;
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
    this.edgePipeline = createHtmlSurfaceEdgePipeline({
      cameraBindGroupLayout: this.ensureCameraBindGroupLayout(),
      edgePaletteBindGroupLayout: this.ensureEdgePaletteBindGroupLayout(),
      runtime: this.runtime,
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

  private ensureFlatSurfaceVertexBuffer(byteLength: number): GPUBuffer {
    if (this.vertexBuffer && this.vertexBufferByteCapacity >= byteLength) {
      return this.vertexBuffer;
    }
    this.vertexBuffer?.destroy?.();
    const size = Math.max(
      FLAT_SURFACE_VERTEX_BYTES,
      alignToFourBytes(byteLength),
    );
    this.vertexBuffer = this.runtime.device.createBuffer({
      label: "setta-html-surface-flat-vertices",
      size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
    });
    this.vertexBufferByteCapacity = size;
    this.uploadedFlatSurfaceVertexCache = null;
    return this.vertexBuffer;
  }

  private prepareFlatSurfaceDraw(
    flatSurfaces: readonly HtmlSurfaceFlatVisual[],
  ): FlatSurfaceDrawResources | null {
    if (flatSurfaces.length === 0) {
      return null;
    }
    const byteLength =
      flatSurfaces.length * VERTICES_PER_QUAD * FLAT_SURFACE_VERTEX_BYTES;
    return {
      pipeline: this.ensureFlatSurfacePipeline(),
      vertexBuffer: this.ensureFlatSurfaceVertexBuffer(byteLength),
    };
  }

  private prepareTiledFlatSurfaceDraw(
    tiledFlatSurfaceTiles: readonly TiledFlatSurfaceDrawTile[],
  ): FlatSurfaceDrawResources | null {
    return this.ensureTiledFlatSurfacePass().prepare(tiledFlatSurfaceTiles);
  }

  private prepareMeshSurfaceDraw(
    meshSurfaces: HtmlSurfaceVisualScene["meshSurfaces"],
  ): PreparedMeshSurfaceDraw | null {
    if (meshSurfaces.length === 0) {
      return null;
    }
    const pass = this.ensureMeshSurfacePass();
    return {
      draw: pass.prepare(meshSurfaces),
      pass,
    };
  }

  private prepareEffectSurfaceDraw(
    effectSurfaces: HtmlSurfaceVisualScene["effectSurfaces"],
  ): PreparedEffectSurfaceDraw | null {
    if (effectSurfaces.length === 0) {
      return null;
    }
    const pass = this.ensureEffectSurfacePass();
    return {
      draw: pass.prepare(effectSurfaces),
      pass,
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
    effectSurfaceDraw,
    effectSurfaces,
    grid,
    gridDraw,
    flatSurfaceDraw,
    flatSurfaces,
    meshSurfaceDraw,
    meshSurfaces,
    tiledFlatSurfaceDraw,
    tiledFlatSurfaceTiles,
  }: {
    readonly cameraUniform: Float32Array;
    readonly edgeBufferData: GpuEdgeLineListBufferData;
    readonly edgeDraw: EdgeDrawResources | null;
    readonly edgePalette: GpuEdgePaletteInput;
    readonly effectSurfaceDraw: PreparedEffectSurfaceDraw | null;
    readonly effectSurfaces: HtmlSurfaceVisualScene["effectSurfaces"];
    readonly grid: GpuGridInput | undefined;
    readonly gridDraw: GridDrawResources | null;
    readonly flatSurfaceDraw: FlatSurfaceDrawResources | null;
    readonly flatSurfaces: readonly HtmlSurfaceFlatVisual[];
    readonly meshSurfaceDraw: PreparedMeshSurfaceDraw | null;
    readonly meshSurfaces: HtmlSurfaceVisualScene["meshSurfaces"];
    readonly tiledFlatSurfaceDraw: FlatSurfaceDrawResources | null;
    readonly tiledFlatSurfaceTiles: readonly TiledFlatSurfaceDrawTile[];
  }) {
    this.writeCameraBuffer(cameraUniform);
    this.writeGridBuffer(gridDraw, grid);
    this.writeEdgePaletteBuffer(edgeDraw, edgePalette);
    this.writeEdgeBuffer(edgeDraw, edgeBufferData);
    this.writeFlatSurfaceBuffer(flatSurfaceDraw, flatSurfaces);
    this.writeTiledFlatSurfaceBuffer(
      tiledFlatSurfaceDraw,
      tiledFlatSurfaceTiles,
    );
    meshSurfaceDraw?.pass.write(meshSurfaceDraw.draw, meshSurfaces);
    effectSurfaceDraw?.pass.write(effectSurfaceDraw.draw, effectSurfaces);
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

  private writeFlatSurfaceBuffer(
    flatSurfaceDraw: FlatSurfaceDrawResources | null,
    flatSurfaces: readonly HtmlSurfaceFlatVisual[],
  ) {
    if (!flatSurfaceDraw) {
      this.uploadedFlatSurfaceVertexCache = null;
      return;
    }
    const vertexCache = this.resolveFlatSurfaceVertexCache(flatSurfaces);
    if (this.uploadedFlatSurfaceVertexCache === vertexCache) {
      return;
    }
    this.runtime.device.queue.writeBuffer(
      flatSurfaceDraw.vertexBuffer,
      0,
      vertexCache.vertexData,
    );
    this.uploadedFlatSurfaceVertexCache = vertexCache;
  }

  private writeTiledFlatSurfaceBuffer(
    tiledFlatSurfaceDraw: FlatSurfaceDrawResources | null,
    tiledFlatSurfaceTiles: readonly TiledFlatSurfaceDrawTile[],
  ) {
    this.ensureTiledFlatSurfacePass().write(
      tiledFlatSurfaceDraw,
      tiledFlatSurfaceTiles,
    );
  }

  private resolveFlatSurfaceVertexCache(
    flatSurfaces: readonly HtmlSurfaceFlatVisual[],
  ): FlatSurfaceVertexCache {
    if (
      isFlatSurfaceVertexCacheValid(this.flatSurfaceVertexCache, flatSurfaces)
    ) {
      return this.flatSurfaceVertexCache;
    }
    const vertexCache = {
      geometry: captureFlatSurfaceGeometry(flatSurfaces),
      vertexData: buildFlatSurfaceVertexData(flatSurfaces),
    };
    this.flatSurfaceVertexCache = vertexCache;
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

  private drawFlatSurfaces(
    pass: GPURenderPassEncoder,
    cameraBindGroup: GPUBindGroup,
    flatSurfaceDraw: FlatSurfaceDrawResources | null,
    flatSurfaces: readonly HtmlSurfaceFlatVisual[],
  ) {
    if (!flatSurfaceDraw) {
      return;
    }
    pass.setPipeline(flatSurfaceDraw.pipeline);
    pass.setBindGroup(0, cameraBindGroup);
    pass.setVertexBuffer(0, flatSurfaceDraw.vertexBuffer);
    flatSurfaces.forEach((surface, index) => {
      pass.setBindGroup(1, this.getTextureBindGroup(surface));
      pass.draw(VERTICES_PER_QUAD, 1, index * VERTICES_PER_QUAD, 0);
    });
  }

  private drawTiledFlatSurfaces(
    pass: GPURenderPassEncoder,
    cameraBindGroup: GPUBindGroup,
    tiledFlatSurfaceDraw: FlatSurfaceDrawResources | null,
    tiledFlatSurfaceTiles: readonly TiledFlatSurfaceDrawTile[],
  ) {
    this.ensureTiledFlatSurfacePass().draw({
      cameraBindGroup,
      pass,
      tiledFlatSurfaceDraw,
      tiledFlatSurfaceTiles,
    });
  }

  private drawMeshSurfaces(
    pass: GPURenderPassEncoder,
    cameraBindGroup: GPUBindGroup,
    meshSurfaceDraw: PreparedMeshSurfaceDraw | null,
    meshSurfaces: HtmlSurfaceVisualScene["meshSurfaces"],
  ) {
    if (!meshSurfaceDraw) {
      return;
    }
    meshSurfaceDraw.pass.draw({
      cameraBindGroup,
      meshSurfaceDraw: meshSurfaceDraw.draw,
      meshSurfaces,
      pass,
    });
  }

  private drawEffectSurfaces(
    pass: GPURenderPassEncoder,
    cameraBindGroup: GPUBindGroup,
    effectSurfaceDraw: PreparedEffectSurfaceDraw | null,
    effectSurfaces: HtmlSurfaceVisualScene["effectSurfaces"],
  ) {
    if (!effectSurfaceDraw) {
      return;
    }
    effectSurfaceDraw.pass.draw({
      cameraBindGroup,
      effectSurfaceDraw: effectSurfaceDraw.draw,
      effectSurfaces,
      pass,
    });
  }

  private getMeshSurfaceVertexCount(
    meshSurfaceDraw: PreparedMeshSurfaceDraw | null,
    meshSurfaces: HtmlSurfaceVisualScene["meshSurfaces"],
  ): number {
    return meshSurfaceDraw?.pass.getVertexCount(meshSurfaces) ?? 0;
  }

  private getEffectSurfaceVertexCount(
    effectSurfaceDraw: PreparedEffectSurfaceDraw | null,
    effectSurfaces: HtmlSurfaceVisualScene["effectSurfaces"],
  ): number {
    return effectSurfaceDraw?.pass.getVertexCount(effectSurfaces) ?? 0;
  }

  private getTextureBindGroup(surface: {
    readonly surfaceId: string;
    readonly texture: Pick<
      HtmlSurfaceFlatVisual["texture"],
      "sampler" | "textureView"
    >;
  }): GPUBindGroup {
    const cached = this.textureBindGroups.get(surface.surfaceId);
    if (
      cached &&
      cached.textureView === surface.texture.textureView &&
      cached.sampler === surface.texture.sampler
    ) {
      return cached.bindGroup;
    }

    const textureBindGroupLayout = this.ensureTextureBindGroupLayout();

    const bindGroup = this.runtime.device.createBindGroup({
      entries: [
        {
          binding: 0,
          resource: surface.texture.sampler,
        },
        {
          binding: 1,
          resource: surface.texture.textureView,
        },
      ],
      label: `setta-html-surface-texture-bind-group-${surface.surfaceId}`,
      layout: textureBindGroupLayout,
    });
    this.textureBindGroups.set(surface.surfaceId, {
      bindGroup,
      sampler: surface.texture.sampler,
      textureView: surface.texture.textureView,
    });
    return bindGroup;
  }

  private getCameraBuffer(): GPUBuffer {
    const cameraBuffer = this.cameraBuffer;
    if (!cameraBuffer) {
      throw new Error(
        "Setta HTML surface rendering failed to create camera buffer.",
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

export function encodeHtmlSurfaceCameraUniform({
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
    throw new Error(
      "Setta HTML surface rendering requires positive canvas size.",
    );
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
