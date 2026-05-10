import {
  EDGE_LINE_SHADER,
  FLAT_SURFACE_SHADER,
  GRID_SHADER,
} from "../gpuPipelines/bufferAndShaders";
import {
  EDGE_VERTEX_BYTES,
  FLAT_SURFACE_VERTEX_BYTES,
  type HtmlSurfaceRenderRuntime,
} from "../gpuPipelines/pipelineTypes";

type CreateGridPipelineInput = {
  readonly cameraBindGroupLayout: GPUBindGroupLayout;
  readonly gridBindGroupLayout: GPUBindGroupLayout;
  readonly runtime: HtmlSurfaceRenderRuntime;
};

type CreateEdgePipelineInput = {
  readonly cameraBindGroupLayout: GPUBindGroupLayout;
  readonly edgePaletteBindGroupLayout: GPUBindGroupLayout;
  readonly runtime: HtmlSurfaceRenderRuntime;
};

type CreateFlatPipelineInput = {
  readonly cameraBindGroupLayout: GPUBindGroupLayout;
  readonly runtime: HtmlSurfaceRenderRuntime;
  readonly textureBindGroupLayout: GPUBindGroupLayout;
};

export function createHtmlSurfaceGridPipeline({
  cameraBindGroupLayout,
  gridBindGroupLayout,
  runtime,
}: CreateGridPipelineInput): GPURenderPipeline {
  const device = runtime.device;
  const shaderModule = device.createShaderModule({
    code: GRID_SHADER,
    label: "setta-gpu-grid-shader",
  });
  return device.createRenderPipeline({
    fragment: {
      entryPoint: "fs_main",
      module: shaderModule,
      targets: [createAlphaBlendTarget(runtime.format)],
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
}

export function createHtmlSurfaceEdgePipeline({
  cameraBindGroupLayout,
  edgePaletteBindGroupLayout,
  runtime,
}: CreateEdgePipelineInput): GPURenderPipeline {
  const device = runtime.device;
  const shaderModule = device.createShaderModule({
    code: EDGE_LINE_SHADER,
    label: "setta-gpu-edge-line-shader",
  });
  return device.createRenderPipeline({
    fragment: {
      entryPoint: "fs_main",
      module: shaderModule,
      targets: [createAlphaBlendTarget(runtime.format)],
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
}

export function createHtmlSurfaceFlatPipeline({
  cameraBindGroupLayout,
  runtime,
  textureBindGroupLayout,
}: CreateFlatPipelineInput): GPURenderPipeline {
  const device = runtime.device;
  const shaderModule = device.createShaderModule({
    code: FLAT_SURFACE_SHADER,
    label: "setta-html-surface-flat-shader",
  });
  return device.createRenderPipeline({
    fragment: {
      entryPoint: "fs_main",
      module: shaderModule,
      targets: [createAlphaBlendTarget(runtime.format)],
    },
    label: "setta-html-surface-flat-pipeline",
    layout: device.createPipelineLayout({
      bindGroupLayouts: [cameraBindGroupLayout, textureBindGroupLayout],
      label: "setta-html-surface-flat-pipeline-layout",
    }),
    primitive: {
      topology: "triangle-list",
    },
    vertex: {
      buffers: [
        {
          arrayStride: FLAT_SURFACE_VERTEX_BYTES,
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
}

function createAlphaBlendTarget(format: GPUTextureFormat): GPUColorTargetState {
  return {
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
    format,
  };
}
