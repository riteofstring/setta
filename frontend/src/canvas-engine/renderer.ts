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

        const vertexData = buildRectVertexData(scene, viewport);
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

        const vertexData = buildRectVertexData(scene, viewport);
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

function buildRectVertexData(
  scene: CanvasEngineSceneSnapshot,
  viewport: CanvasEngineViewport,
): Float32Array {
  const clampedZoom = clamp(scene.camera.zoom, MIN_ZOOM, MAX_ZOOM);
  const sortedRects = [...scene.rects].sort((left, right) => {
    if (left.zIndex === right.zIndex) {
      return left.id.localeCompare(right.id);
    }
    return left.zIndex - right.zIndex;
  });

  const values: number[] = [];
  for (const rect of sortedRects) {
    if (rect.width <= 0 || rect.height <= 0) {
      continue;
    }

    const x0 = (rect.x - scene.camera.x) * clampedZoom;
    const y0 = (rect.y - scene.camera.y) * clampedZoom;
    const x1 = x0 + rect.width * clampedZoom;
    const y1 = y0 + rect.height * clampedZoom;
    const color = rect.color;

    appendRectTriangles(values, viewport, x0, y0, x1, y1, color);
  }

  return new Float32Array(values);
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
