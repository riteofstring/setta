import type {
  CanvasEngineBackendSelection,
  CanvasEngineSceneSnapshot,
  CanvasEngineViewport,
} from "./types";

type CanvasEngineRendererApi = {
  selection: CanvasEngineBackendSelection;
  render: (
    scene: CanvasEngineSceneSnapshot,
    viewport: CanvasEngineViewport,
  ) => void;
  destroy: () => void;
};

type GpuNavigatorLike = {
  requestAdapter: () => Promise<GpuAdapterLike | null>;
  getPreferredCanvasFormat?: () => string;
};

type GpuAdapterLike = {
  requestDevice: () => Promise<GpuDeviceLike>;
};

type GpuBufferLike = {};

type GpuRenderPassEncoderLike = {
  setPipeline: (pipeline: unknown) => void;
  setVertexBuffer: (slot: number, buffer: GpuBufferLike) => void;
  draw: (vertexCount: number) => void;
  end: () => void;
};

type GpuCommandEncoderLike = {
  beginRenderPass: (
    descriptor: Record<string, unknown>,
  ) => GpuRenderPassEncoderLike;
  finish: () => unknown;
};

type GpuQueueLike = {
  writeBuffer: (
    buffer: GpuBufferLike,
    bufferOffset: number,
    data: ArrayBufferView,
  ) => void;
  submit: (commands: unknown[]) => void;
};

type GpuDeviceLike = {
  createShaderModule: (descriptor: { code: string }) => unknown;
  createRenderPipeline: (descriptor: Record<string, unknown>) => unknown;
  createBuffer: (descriptor: {
    size: number;
    usage: number;
    mappedAtCreation?: boolean;
  }) => GpuBufferLike;
  createCommandEncoder: () => GpuCommandEncoderLike;
  queue: GpuQueueLike;
  destroy?: () => void;
};

type GpuCanvasContextLike = {
  configure: (descriptor: Record<string, unknown>) => void;
  getCurrentTexture: () => { createView: () => unknown };
};

type WebGpuRuntime = {
  navigator: GpuNavigatorLike;
  adapter: GpuAdapterLike;
  device: GpuDeviceLike;
};

type WebGpuDetectionResult = {
  runtime: WebGpuRuntime | null;
  available: boolean;
  failureReason: string | null;
};

type WebGpuRendererResult = {
  renderer: CanvasEngineRendererApi | null;
  failureReason: string | null;
};

type WebGl2RendererResult = {
  renderer: CanvasEngineRendererApi | null;
  available: boolean;
  failureReason: string | null;
};

type GlobalWithGpuConstants = typeof globalThis & {
  GPUBufferUsage?: { COPY_DST: number; VERTEX: number };
};

const DEFAULT_CLEAR_COLOR: [number, number, number] = [0.06, 0.07, 0.08];
const FLOATS_PER_VERTEX = 5;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
const DATA_EDGE_COLOR: [number, number, number] = [0.27, 0.52, 0.9];
const DATA_EDGE_SELECTED_COLOR: [number, number, number] = [0.58, 0.78, 1.0];
const AGENTIC_EDGE_COLOR: [number, number, number] = [0.96, 0.66, 0.24];
const AGENTIC_EDGE_SELECTED_COLOR: [number, number, number] = [1.0, 0.83, 0.52];
const DATA_EDGE_HOVER_COLOR: [number, number, number] = [0.43, 0.69, 0.98];
const DATA_EDGE_SELECTED_HOVER_COLOR: [number, number, number] = [
  0.75, 0.89, 1.0,
];
const AGENTIC_EDGE_HOVER_COLOR: [number, number, number] = [1.0, 0.79, 0.46];
const AGENTIC_EDGE_SELECTED_HOVER_COLOR: [number, number, number] = [
  1.0, 0.9, 0.66,
];
const ACTIVE_RECT_OUTLINE_COLOR: [number, number, number] = [0.92, 0.96, 1.0];
const ACTIVE_HANDLE_COLOR: [number, number, number] = [0.73, 0.84, 0.99];
const CONNECTION_PREVIEW_COLOR: [number, number, number] = [0.81, 0.91, 1.0];
const CONNECTION_PREVIEW_INVALID_COLOR: [number, number, number] = [
  0.58, 0.62, 0.69,
];
const CONNECTION_PREVIEW_TARGET_COLOR: [number, number, number] = [
  0.89, 0.95, 1.0,
];
const CONNECTION_PREVIEW_TARGET_INVALID_COLOR: [number, number, number] = [
  0.68, 0.73, 0.79,
];
const AGENTIC_CONNECTION_PREVIEW_COLOR: [number, number, number] = [
  1.0, 0.84, 0.58,
];
const AGENTIC_CONNECTION_PREVIEW_INVALID_COLOR: [number, number, number] = [
  0.76, 0.67, 0.54,
];
const AGENTIC_CONNECTION_PREVIEW_TARGET_COLOR: [number, number, number] = [
  1.0, 0.9, 0.72,
];
const AGENTIC_CONNECTION_PREVIEW_TARGET_INVALID_COLOR: [
  number,
  number,
  number,
] = [0.83, 0.75, 0.64];
const EDGE_THICKNESS_PX = 2.4;
const SELECTED_EDGE_THICKNESS_PX = 3.8;
const HOVER_EDGE_THICKNESS_PX = 3.4;
const HOVER_SELECTED_EDGE_THICKNESS_PX = 4.4;
const OUTLINE_THICKNESS_PX = 2.0;
const HANDLE_HALF_SIZE_PX = 4.0;
const CONNECTION_PREVIEW_THICKNESS_PX = 2.8;
const CONNECTION_PREVIEW_TARGET_HALF_SIZE_PX = 5.5;

const WEBGPU_SHADER = `
struct VertexInput {
  @location(0) position: vec2f,
  @location(1) color: vec3f,
};

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f,
};

@vertex
fn vsMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position = vec4f(input.position, 0.0, 1.0);
  output.color = input.color;
  return output;
}

@fragment
fn fsMain(input: VertexOutput) -> @location(0) vec4f {
  return vec4f(input.color, 1.0);
}
`;

const WEBGL_VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec3 a_color;
varying vec3 v_color;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_color = a_color;
}
`;

const WEBGL_FRAGMENT_SHADER = `
precision mediump float;
varying vec3 v_color;

void main() {
  gl_FragColor = vec4(v_color, 1.0);
}
`;

export type CanvasEngineRenderer = CanvasEngineRendererApi;

export async function createCanvasEngineRenderer(
  canvas: HTMLCanvasElement,
): Promise<CanvasEngineRendererApi> {
  const webgpuDetection = await detectWebGpuRuntime();
  if (webgpuDetection.runtime) {
    const webgpuRenderer = createWebGpuRenderer(
      canvas,
      webgpuDetection.runtime,
    );
    if (webgpuRenderer.renderer) {
      return webgpuRenderer.renderer;
    }

    const webgl2Renderer = createWebGl2Renderer(canvas, {
      webgpuAvailable: true,
      webgpuFailureReason: webgpuRenderer.failureReason,
    });
    if (webgl2Renderer.renderer) {
      return webgl2Renderer.renderer;
    }

    return createNoopRenderer(canvas, {
      webgpuAvailable: true,
      webgl2Available: false,
      fallbackReason:
        webgl2Renderer.failureReason ??
        webgpuRenderer.failureReason ??
        "Failed to initialize WebGPU and WebGL2 renderer.",
    });
  }

  const webgl2Renderer = createWebGl2Renderer(canvas, {
    webgpuAvailable: webgpuDetection.available,
    webgpuFailureReason: webgpuDetection.failureReason,
  });
  if (webgl2Renderer.renderer) {
    return webgl2Renderer.renderer;
  }

  return createNoopRenderer(canvas, {
    webgpuAvailable: webgpuDetection.available,
    webgl2Available: false,
    fallbackReason:
      webgl2Renderer.failureReason ??
      webgpuDetection.failureReason ??
      "No GPU backend available.",
  });
}

async function detectWebGpuRuntime(): Promise<WebGpuDetectionResult> {
  const navigatorWithGpu = navigator as Navigator & { gpu?: GpuNavigatorLike };
  const gpuNavigator = navigatorWithGpu.gpu;
  if (!gpuNavigator) {
    return {
      runtime: null,
      available: false,
      failureReason: "navigator.gpu is unavailable.",
    };
  }

  const adapter = await gpuNavigator.requestAdapter();
  if (!adapter) {
    return {
      runtime: null,
      available: true,
      failureReason: "WebGPU adapter unavailable.",
    };
  }

  try {
    const device = await adapter.requestDevice();
    return {
      runtime: {
        navigator: gpuNavigator,
        adapter,
        device,
      },
      available: true,
      failureReason: null,
    };
  } catch (error) {
    return {
      runtime: null,
      available: true,
      failureReason: `WebGPU device creation failed: ${String(error)}`,
    };
  }
}

function createWebGpuRenderer(
  canvas: HTMLCanvasElement,
  runtime: WebGpuRuntime,
): WebGpuRendererResult {
  const context = canvas.getContext(
    "webgpu",
  ) as unknown as GpuCanvasContextLike | null;
  if (!context) {
    return {
      renderer: null,
      failureReason: "Canvas does not support WebGPU context.",
    };
  }

  const gpuConstants = (globalThis as GlobalWithGpuConstants).GPUBufferUsage;
  if (!gpuConstants) {
    return {
      renderer: null,
      failureReason: "GPUBufferUsage constants unavailable.",
    };
  }

  const format = runtime.navigator.getPreferredCanvasFormat?.() ?? "bgra8unorm";
  const { device } = runtime;
  const shaderModule = device.createShaderModule({ code: WEBGPU_SHADER });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: shaderModule,
      entryPoint: "vsMain",
      buffers: [
        {
          arrayStride: FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT,
          attributes: [
            {
              shaderLocation: 0,
              offset: 0,
              format: "float32x2",
            },
            {
              shaderLocation: 1,
              offset: 2 * Float32Array.BYTES_PER_ELEMENT,
              format: "float32x3",
            },
          ],
        },
      ],
    },
    fragment: {
      module: shaderModule,
      entryPoint: "fsMain",
      targets: [{ format }],
    },
    primitive: { topology: "triangle-list" },
  });

  let vertexBuffer = device.createBuffer({
    size: 4,
    usage: gpuConstants.COPY_DST | gpuConstants.VERTEX,
  });
  let vertexBufferByteLength = 4;
  let configuredWidth = 0;
  let configuredHeight = 0;

  const configureContext = (pixelWidth: number, pixelHeight: number): void => {
    if (configuredWidth === pixelWidth && configuredHeight === pixelHeight) {
      return;
    }
    configuredWidth = pixelWidth;
    configuredHeight = pixelHeight;
    context.configure({
      device,
      format,
      alphaMode: "premultiplied",
    });
  };

  const ensureVertexBufferCapacity = (requiredBytes: number): void => {
    if (vertexBufferByteLength >= requiredBytes) {
      return;
    }
    const alignedByteSize = alignTo(requiredBytes, 256);
    vertexBuffer = device.createBuffer({
      size: alignedByteSize,
      usage: gpuConstants.COPY_DST | gpuConstants.VERTEX,
    });
    vertexBufferByteLength = alignedByteSize;
  };

  const selection: CanvasEngineBackendSelection = {
    preferredBackend: "webgpu",
    activeBackend: "webgpu",
    webgpuAvailable: true,
    webgl2Available: true,
    fallbackReason: null,
  };

  return {
    renderer: {
      selection,
      render: (scene, viewport) => {
        const pixelWidth = Math.max(
          1,
          Math.floor(viewport.width * viewport.dpr),
        );
        const pixelHeight = Math.max(
          1,
          Math.floor(viewport.height * viewport.dpr),
        );

        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
          canvas.width = pixelWidth;
          canvas.height = pixelHeight;
        }
        configureContext(pixelWidth, pixelHeight);

        const vertexData = buildSceneVertexData(scene, viewport);
        ensureVertexBufferCapacity(vertexData.byteLength);
        if (vertexData.byteLength > 0) {
          device.queue.writeBuffer(vertexBuffer, 0, vertexData);
        }

        const clearColor = scene.clearColor ?? DEFAULT_CLEAR_COLOR;
        const commandEncoder = device.createCommandEncoder();
        const renderPass = commandEncoder.beginRenderPass({
          colorAttachments: [
            {
              view: context.getCurrentTexture().createView(),
              clearValue: {
                r: clearColor[0],
                g: clearColor[1],
                b: clearColor[2],
                a: 1,
              },
              loadOp: "clear",
              storeOp: "store",
            },
          ],
        });

        if (vertexData.byteLength > 0) {
          renderPass.setPipeline(pipeline);
          renderPass.setVertexBuffer(0, vertexBuffer);
          renderPass.draw(vertexData.length / FLOATS_PER_VERTEX);
        }
        renderPass.end();
        device.queue.submit([commandEncoder.finish()]);
      },
      destroy: () => {
        device.destroy?.();
      },
    },
    failureReason: null,
  };
}

function createWebGl2Renderer(
  canvas: HTMLCanvasElement,
  options: {
    webgpuAvailable: boolean;
    webgpuFailureReason: string | null;
  },
): WebGl2RendererResult {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    premultipliedAlpha: true,
  });

  if (!(gl instanceof WebGL2RenderingContext)) {
    return {
      renderer: null,
      available: false,
      failureReason: "WebGL2 context unavailable.",
    };
  }

  const program = createWebGlProgram(gl);
  if (!program) {
    return {
      renderer: null,
      available: true,
      failureReason: "WebGL2 shader program initialization failed.",
    };
  }

  const vertexBuffer = gl.createBuffer();
  if (!vertexBuffer) {
    return {
      renderer: null,
      available: true,
      failureReason: "WebGL2 buffer initialization failed.",
    };
  }

  const positionLocation = gl.getAttribLocation(program, "a_position");
  const colorLocation = gl.getAttribLocation(program, "a_color");
  if (positionLocation < 0 || colorLocation < 0) {
    return {
      renderer: null,
      available: true,
      failureReason: "WebGL2 attribute locations unavailable.",
    };
  }

  const fallbackReason = options.webgpuAvailable
    ? options.webgpuFailureReason ??
      "WebGPU unavailable; using WebGL2 fallback."
    : null;

  const selection: CanvasEngineBackendSelection = {
    preferredBackend: "webgpu",
    activeBackend: "webgl2",
    webgpuAvailable: options.webgpuAvailable,
    webgl2Available: true,
    fallbackReason,
  };

  return {
    available: true,
    failureReason: null,
    renderer: {
      selection,
      render: (scene, viewport) => {
        const pixelWidth = Math.max(
          1,
          Math.floor(viewport.width * viewport.dpr),
        );
        const pixelHeight = Math.max(
          1,
          Math.floor(viewport.height * viewport.dpr),
        );
        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
          canvas.width = pixelWidth;
          canvas.height = pixelHeight;
        }

        gl.viewport(0, 0, canvas.width, canvas.height);
        const clearColor = scene.clearColor ?? DEFAULT_CLEAR_COLOR;
        gl.clearColor(clearColor[0], clearColor[1], clearColor[2], 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        const vertexData = buildSceneVertexData(scene, viewport);
        if (vertexData.length === 0) {
          return;
        }

        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.DYNAMIC_DRAW);

        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(
          positionLocation,
          2,
          gl.FLOAT,
          false,
          FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT,
          0,
        );

        gl.enableVertexAttribArray(colorLocation);
        gl.vertexAttribPointer(
          colorLocation,
          3,
          gl.FLOAT,
          false,
          FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT,
          2 * Float32Array.BYTES_PER_ELEMENT,
        );

        gl.drawArrays(gl.TRIANGLES, 0, vertexData.length / FLOATS_PER_VERTEX);
      },
      destroy: () => {
        gl.deleteBuffer(vertexBuffer);
        gl.deleteProgram(program);
      },
    },
  };
}

function createNoopRenderer(
  canvas: HTMLCanvasElement,
  {
    webgpuAvailable,
    webgl2Available,
    fallbackReason,
  }: {
    webgpuAvailable: boolean;
    webgl2Available: boolean;
    fallbackReason: string;
  },
): CanvasEngineRendererApi {
  const selection: CanvasEngineBackendSelection = {
    preferredBackend: "webgpu",
    activeBackend: "webgl2",
    webgpuAvailable,
    webgl2Available,
    fallbackReason,
  };

  return {
    selection,
    render: (_scene, viewport) => {
      const pixelWidth = Math.max(1, Math.floor(viewport.width * viewport.dpr));
      const pixelHeight = Math.max(
        1,
        Math.floor(viewport.height * viewport.dpr),
      );
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
    },
    destroy: () => {
      // No-op: we intentionally keep this minimal when no GPU renderer is available.
    },
  };
}

function createWebGlProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const vertexShader = compileWebGlShader(
    gl,
    gl.VERTEX_SHADER,
    WEBGL_VERTEX_SHADER,
  );
  if (!vertexShader) {
    return null;
  }

  const fragmentShader = compileWebGlShader(
    gl,
    gl.FRAGMENT_SHADER,
    WEBGL_FRAGMENT_SHADER,
  );
  if (!fragmentShader) {
    gl.deleteShader(vertexShader);
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return null;
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }

  return program;
}

function compileWebGlShader(
  gl: WebGL2RenderingContext,
  shaderType: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(shaderType);
  if (!shader) {
    return null;
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function buildSceneVertexData(
  scene: CanvasEngineSceneSnapshot,
  viewport: CanvasEngineViewport,
): Float32Array {
  const clampedZoom = clamp(scene.camera.zoom, MIN_ZOOM, MAX_ZOOM);
  // Scene adapter snapshots are already ordered by z-index then id.
  const orderedRects = scene.rects;
  const rectById = new Map(orderedRects.map((rect) => [rect.id, rect]));
  const dataEdgeById = new Map(
    scene.dataEdges.map((edge) => [edge.id, edge] as const),
  );
  const agenticEdgeById = new Map(
    scene.agenticEdges.map((edge) => [edge.id, edge] as const),
  );
  const values: number[] = [];

  appendDataEdgePrimitives(values, scene, viewport, clampedZoom, rectById);
  appendAgenticEdgePrimitives(values, scene, viewport, clampedZoom, rectById);
  appendHoveredEdgePrimitives(
    values,
    scene,
    viewport,
    clampedZoom,
    rectById,
    dataEdgeById,
    agenticEdgeById,
  );

  for (const rect of orderedRects) {
    if (rect.width <= 0 || rect.height <= 0) {
      continue;
    }

    const x0 = (rect.x - scene.camera.x) * clampedZoom;
    const y0 = (rect.y - scene.camera.y) * clampedZoom;
    const x1 = x0 + rect.width * clampedZoom;
    const y1 = y0 + rect.height * clampedZoom;

    appendRectTriangles(values, viewport, x0, y0, x1, y1, rect.color);
    if (rect.isActive) {
      appendActiveRectOverlays(values, viewport, x0, y0, x1, y1);
    }
  }
  appendConnectionPreviewPrimitives(values, scene, viewport, clampedZoom);

  return new Float32Array(values);
}

function appendDataEdgePrimitives(
  destination: number[],
  scene: CanvasEngineSceneSnapshot,
  viewport: CanvasEngineViewport,
  zoom: number,
  rectById: Map<string, CanvasEngineSceneSnapshot["rects"][number]>,
): void {
  for (const edge of scene.dataEdges) {
    if (edge.hidden) {
      continue;
    }
    const sourceRect = rectById.get(edge.sourceSectionId);
    const targetRect = rectById.get(edge.targetSectionId);
    if (!sourceRect || !targetRect) {
      continue;
    }

    const anchors = resolveDataEdgeAnchors(edge, sourceRect, targetRect);
    const start = worldToScreen(
      anchors.startX,
      anchors.startY,
      scene.camera.x,
      scene.camera.y,
      zoom,
    );
    const end = worldToScreen(
      anchors.endX,
      anchors.endY,
      scene.camera.x,
      scene.camera.y,
      zoom,
    );

    appendLineSegmentQuad(
      destination,
      viewport,
      start.x,
      start.y,
      end.x,
      end.y,
      edge.selected ? SELECTED_EDGE_THICKNESS_PX : EDGE_THICKNESS_PX,
      edge.selected ? DATA_EDGE_SELECTED_COLOR : DATA_EDGE_COLOR,
    );
  }
}

function appendAgenticEdgePrimitives(
  destination: number[],
  scene: CanvasEngineSceneSnapshot,
  viewport: CanvasEngineViewport,
  zoom: number,
  rectById: Map<string, CanvasEngineSceneSnapshot["rects"][number]>,
): void {
  for (const edge of scene.agenticEdges) {
    if (edge.hidden) {
      continue;
    }
    const sourceRect = rectById.get(edge.sourceSectionId);
    const targetRect = rectById.get(edge.targetSectionId);
    if (!sourceRect || !targetRect) {
      continue;
    }

    const anchors = resolveEdgeAnchors(sourceRect, targetRect);
    const start = worldToScreen(
      anchors.startX,
      anchors.startY,
      scene.camera.x,
      scene.camera.y,
      zoom,
    );
    const end = worldToScreen(
      anchors.endX,
      anchors.endY,
      scene.camera.x,
      scene.camera.y,
      zoom,
    );

    appendLineSegmentQuad(
      destination,
      viewport,
      start.x,
      start.y,
      end.x,
      end.y,
      edge.selected
        ? SELECTED_EDGE_THICKNESS_PX + 0.8
        : EDGE_THICKNESS_PX + 0.6,
      edge.selected ? AGENTIC_EDGE_SELECTED_COLOR : AGENTIC_EDGE_COLOR,
    );
  }
}

function appendHoveredEdgePrimitives(
  destination: number[],
  scene: CanvasEngineSceneSnapshot,
  viewport: CanvasEngineViewport,
  zoom: number,
  rectById: Map<string, CanvasEngineSceneSnapshot["rects"][number]>,
  dataEdgeById: Map<string, CanvasEngineSceneSnapshot["dataEdges"][number]>,
  agenticEdgeById: Map<
    string,
    CanvasEngineSceneSnapshot["agenticEdges"][number]
  >,
): void {
  const hoveredEdge = scene.hoveredEdge;
  if (!hoveredEdge) {
    return;
  }

  if (hoveredEdge.kind === "data") {
    const edge = dataEdgeById.get(hoveredEdge.id);
    if (!edge || edge.hidden) {
      return;
    }
    const sourceRect = rectById.get(edge.sourceSectionId);
    const targetRect = rectById.get(edge.targetSectionId);
    if (!sourceRect || !targetRect) {
      return;
    }

    const anchors = resolveDataEdgeAnchors(edge, sourceRect, targetRect);
    const start = worldToScreen(
      anchors.startX,
      anchors.startY,
      scene.camera.x,
      scene.camera.y,
      zoom,
    );
    const end = worldToScreen(
      anchors.endX,
      anchors.endY,
      scene.camera.x,
      scene.camera.y,
      zoom,
    );

    appendLineSegmentQuad(
      destination,
      viewport,
      start.x,
      start.y,
      end.x,
      end.y,
      edge.selected
        ? HOVER_SELECTED_EDGE_THICKNESS_PX
        : HOVER_EDGE_THICKNESS_PX,
      edge.selected ? DATA_EDGE_SELECTED_HOVER_COLOR : DATA_EDGE_HOVER_COLOR,
    );
    return;
  }

  const edge = agenticEdgeById.get(hoveredEdge.id);
  if (!edge || edge.hidden) {
    return;
  }
  const sourceRect = rectById.get(edge.sourceSectionId);
  const targetRect = rectById.get(edge.targetSectionId);
  if (!sourceRect || !targetRect) {
    return;
  }

  const anchors = resolveEdgeAnchors(sourceRect, targetRect);
  const start = worldToScreen(
    anchors.startX,
    anchors.startY,
    scene.camera.x,
    scene.camera.y,
    zoom,
  );
  const end = worldToScreen(
    anchors.endX,
    anchors.endY,
    scene.camera.x,
    scene.camera.y,
    zoom,
  );

  appendLineSegmentQuad(
    destination,
    viewport,
    start.x,
    start.y,
    end.x,
    end.y,
    edge.selected ? HOVER_SELECTED_EDGE_THICKNESS_PX : HOVER_EDGE_THICKNESS_PX,
    edge.selected
      ? AGENTIC_EDGE_SELECTED_HOVER_COLOR
      : AGENTIC_EDGE_HOVER_COLOR,
  );
}

function appendConnectionPreviewPrimitives(
  destination: number[],
  scene: CanvasEngineSceneSnapshot,
  viewport: CanvasEngineViewport,
  zoom: number,
): void {
  const preview = scene.connectionPreview;
  if (!preview) {
    return;
  }

  const start = worldToScreen(
    preview.startX,
    preview.startY,
    scene.camera.x,
    scene.camera.y,
    zoom,
  );
  const end = worldToScreen(
    preview.endX,
    preview.endY,
    scene.camera.x,
    scene.camera.y,
    zoom,
  );
  const isAgenticPreview = preview.kind === "agentic-connect";
  const lineColor = isAgenticPreview
    ? preview.targetValid
      ? AGENTIC_CONNECTION_PREVIEW_COLOR
      : AGENTIC_CONNECTION_PREVIEW_INVALID_COLOR
    : preview.targetValid
      ? CONNECTION_PREVIEW_COLOR
      : CONNECTION_PREVIEW_INVALID_COLOR;
  const targetColor = isAgenticPreview
    ? preview.targetValid
      ? AGENTIC_CONNECTION_PREVIEW_TARGET_COLOR
      : AGENTIC_CONNECTION_PREVIEW_TARGET_INVALID_COLOR
    : preview.targetValid
      ? CONNECTION_PREVIEW_TARGET_COLOR
      : CONNECTION_PREVIEW_TARGET_INVALID_COLOR;

  appendLineSegmentQuad(
    destination,
    viewport,
    start.x,
    start.y,
    end.x,
    end.y,
    CONNECTION_PREVIEW_THICKNESS_PX,
    lineColor,
  );

  if (
    typeof preview.targetHandleX === "number" &&
    typeof preview.targetHandleY === "number"
  ) {
    const targetHandle = worldToScreen(
      preview.targetHandleX,
      preview.targetHandleY,
      scene.camera.x,
      scene.camera.y,
      zoom,
    );
    appendRectTriangles(
      destination,
      viewport,
      targetHandle.x - CONNECTION_PREVIEW_TARGET_HALF_SIZE_PX,
      targetHandle.y - CONNECTION_PREVIEW_TARGET_HALF_SIZE_PX,
      targetHandle.x + CONNECTION_PREVIEW_TARGET_HALF_SIZE_PX,
      targetHandle.y + CONNECTION_PREVIEW_TARGET_HALF_SIZE_PX,
      targetColor,
    );
  }
}

function appendRectTriangles(
  destination: number[],
  viewport: CanvasEngineViewport,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: [number, number, number],
): void {
  const left = toClipX(x0, viewport.width);
  const right = toClipX(x1, viewport.width);
  const top = toClipY(y0, viewport.height);
  const bottom = toClipY(y1, viewport.height);

  // Triangle 1: top-left, bottom-left, top-right.
  pushVertex(destination, left, top, color);
  pushVertex(destination, left, bottom, color);
  pushVertex(destination, right, top, color);

  // Triangle 2: top-right, bottom-left, bottom-right.
  pushVertex(destination, right, top, color);
  pushVertex(destination, left, bottom, color);
  pushVertex(destination, right, bottom, color);
}

function appendActiveRectOverlays(
  destination: number[],
  viewport: CanvasEngineViewport,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  const thickness = OUTLINE_THICKNESS_PX;

  appendRectTriangles(
    destination,
    viewport,
    x0 - thickness,
    y0 - thickness,
    x1 + thickness,
    y0,
    ACTIVE_RECT_OUTLINE_COLOR,
  );
  appendRectTriangles(
    destination,
    viewport,
    x0 - thickness,
    y1,
    x1 + thickness,
    y1 + thickness,
    ACTIVE_RECT_OUTLINE_COLOR,
  );
  appendRectTriangles(
    destination,
    viewport,
    x0 - thickness,
    y0,
    x0,
    y1,
    ACTIVE_RECT_OUTLINE_COLOR,
  );
  appendRectTriangles(
    destination,
    viewport,
    x1,
    y0,
    x1 + thickness,
    y1,
    ACTIVE_RECT_OUTLINE_COLOR,
  );

  const centerX = (x0 + x1) / 2;
  const centerY = (y0 + y1) / 2;
  appendHandleSquare(destination, viewport, x1, centerY);
  appendHandleSquare(destination, viewport, centerX, y1);
  appendHandleSquare(destination, viewport, x1, y1);
}

function appendHandleSquare(
  destination: number[],
  viewport: CanvasEngineViewport,
  centerX: number,
  centerY: number,
): void {
  appendRectTriangles(
    destination,
    viewport,
    centerX - HANDLE_HALF_SIZE_PX,
    centerY - HANDLE_HALF_SIZE_PX,
    centerX + HANDLE_HALF_SIZE_PX,
    centerY + HANDLE_HALF_SIZE_PX,
    ACTIVE_HANDLE_COLOR,
  );
}

function resolveEdgeAnchors(
  sourceRect: CanvasEngineSceneSnapshot["rects"][number],
  targetRect: CanvasEngineSceneSnapshot["rects"][number],
): {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
} {
  const sourceCenterX = sourceRect.x + sourceRect.width / 2;
  const sourceCenterY = sourceRect.y + sourceRect.height / 2;
  const targetCenterX = targetRect.x + targetRect.width / 2;
  const targetCenterY = targetRect.y + targetRect.height / 2;
  const targetOnRight = targetCenterX >= sourceCenterX;

  return {
    startX: targetOnRight ? sourceRect.x + sourceRect.width : sourceRect.x,
    startY: sourceCenterY,
    endX: targetOnRight ? targetRect.x : targetRect.x + targetRect.width,
    endY: targetCenterY,
  };
}

function resolveDataEdgeAnchors(
  edge: CanvasEngineSceneSnapshot["dataEdges"][number],
  sourceRect: CanvasEngineSceneSnapshot["rects"][number],
  targetRect: CanvasEngineSceneSnapshot["rects"][number],
): {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
} {
  if (
    typeof edge.sourceX === "number" &&
    typeof edge.sourceY === "number" &&
    typeof edge.targetX === "number" &&
    typeof edge.targetY === "number"
  ) {
    return {
      startX: edge.sourceX,
      startY: edge.sourceY,
      endX: edge.targetX,
      endY: edge.targetY,
    };
  }
  return resolveEdgeAnchors(sourceRect, targetRect);
}

function worldToScreen(
  worldX: number,
  worldY: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
): { x: number; y: number } {
  return {
    x: (worldX - cameraX) * zoom,
    y: (worldY - cameraY) * zoom,
  };
}

function appendLineSegmentQuad(
  destination: number[],
  viewport: CanvasEngineViewport,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  thicknessPx: number,
  color: [number, number, number],
): void {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const length = Math.hypot(deltaX, deltaY);
  if (length <= 0.001) {
    return;
  }

  const halfThickness = thicknessPx / 2;
  const normalX = (-deltaY / length) * halfThickness;
  const normalY = (deltaX / length) * halfThickness;
  const topLeft = { x: startX + normalX, y: startY + normalY };
  const bottomLeft = { x: startX - normalX, y: startY - normalY };
  const topRight = { x: endX + normalX, y: endY + normalY };
  const bottomRight = { x: endX - normalX, y: endY - normalY };

  appendQuadTriangles(
    destination,
    viewport,
    topLeft,
    bottomLeft,
    topRight,
    bottomRight,
    color,
  );
}

function appendQuadTriangles(
  destination: number[],
  viewport: CanvasEngineViewport,
  topLeft: { x: number; y: number },
  bottomLeft: { x: number; y: number },
  topRight: { x: number; y: number },
  bottomRight: { x: number; y: number },
  color: [number, number, number],
): void {
  // Triangle 1: top-left, bottom-left, top-right.
  pushVertex(
    destination,
    toClipX(topLeft.x, viewport.width),
    toClipY(topLeft.y, viewport.height),
    color,
  );
  pushVertex(
    destination,
    toClipX(bottomLeft.x, viewport.width),
    toClipY(bottomLeft.y, viewport.height),
    color,
  );
  pushVertex(
    destination,
    toClipX(topRight.x, viewport.width),
    toClipY(topRight.y, viewport.height),
    color,
  );

  // Triangle 2: top-right, bottom-left, bottom-right.
  pushVertex(
    destination,
    toClipX(topRight.x, viewport.width),
    toClipY(topRight.y, viewport.height),
    color,
  );
  pushVertex(
    destination,
    toClipX(bottomLeft.x, viewport.width),
    toClipY(bottomLeft.y, viewport.height),
    color,
  );
  pushVertex(
    destination,
    toClipX(bottomRight.x, viewport.width),
    toClipY(bottomRight.y, viewport.height),
    color,
  );
}

function pushVertex(
  destination: number[],
  x: number,
  y: number,
  color: [number, number, number],
): void {
  destination.push(x, y, color[0], color[1], color[2]);
}

function toClipX(screenX: number, viewportWidth: number): number {
  const width = Math.max(1, viewportWidth);
  return (screenX / width) * 2 - 1;
}

function toClipY(screenY: number, viewportHeight: number): number {
  const height = Math.max(1, viewportHeight);
  return 1 - (screenY / height) * 2;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function alignTo(value: number, alignment: number): number {
  if (alignment <= 0) {
    return value;
  }
  return Math.ceil(value / alignment) * alignment;
}
