import type {
  GpuQueueWithElementUpload,
  HtmlInCanvas2DContext,
  HtmlInCanvasCanvas,
} from "./htmlInCanvasTypes";

export type GpuFlowSupportFailure =
  | "layout-subtree-missing"
  | "request-paint-missing"
  | "paint-event-missing"
  | "draw-element-image-missing"
  | "webgpu-missing"
  | "adapter-missing"
  | "copy-element-image-to-texture-missing"
  | "resize-observer-missing"
  | "webgpu-context-missing";

const SUPPORT_ERROR_MESSAGES: Record<GpuFlowSupportFailure, string> = {
  "layout-subtree-missing":
    "Setta GPU flow requires HTMLCanvasElement.layoutSubtree. Enable Chromium's CanvasDrawElement/html-in-canvas support.",
  "request-paint-missing":
    "Setta GPU flow requires HTMLCanvasElement.requestPaint. Enable Chromium's CanvasDrawElement/html-in-canvas support.",
  "paint-event-missing":
    "Setta GPU flow requires the canvas paint event. Enable Chromium's CanvasDrawElement/html-in-canvas support.",
  "draw-element-image-missing":
    "Setta GPU flow requires CanvasRenderingContext2D.drawElementImage for html-in-canvas support verification.",
  "webgpu-missing":
    "Setta GPU flow requires navigator.gpu. Start Chromium with WebGPU enabled.",
  "adapter-missing": "Setta GPU flow could not acquire a WebGPU adapter.",
  "copy-element-image-to-texture-missing":
    "Setta GPU flow requires GPUQueue.copyElementImageToTexture for native HTML texture upload.",
  "resize-observer-missing":
    "Setta GPU flow requires ResizeObserver for DPR-aware WebGPU canvas sizing.",
  "webgpu-context-missing":
    "Setta GPU flow could not create a webgpu canvas context.",
};

export class GpuFlowSupportError extends Error {
  readonly reason: GpuFlowSupportFailure;

  constructor(reason: GpuFlowSupportFailure, detail?: string) {
    super(
      detail
        ? `${SUPPORT_ERROR_MESSAGES[reason]} ${detail}`
        : SUPPORT_ERROR_MESSAGES[reason],
    );
    this.name = "GpuFlowSupportError";
    this.reason = reason;
  }
}

export type GpuFlowDeviceOptions = {
  alphaMode?: GPUCanvasAlphaMode;
  format?: GPUTextureFormat;
  powerPreference?: GPUPowerPreference;
  requestAdapterMaxTextureLimit?: boolean;
};

export type GpuFlowRuntime = {
  adapter: GPUAdapter;
  canvas: HtmlInCanvasCanvas;
  context: GPUCanvasContext;
  device: GPUDevice;
  format: GPUTextureFormat;
  maxTextureDimension2D: number;
  destroy(): void;
};

export async function initializeGpuFlowDevice(
  canvas: HTMLCanvasElement,
  options: GpuFlowDeviceOptions = {},
): Promise<GpuFlowRuntime> {
  const htmlCanvas = assertHtmlInCanvasSupport(canvas);
  const gpu = getRequiredGpu();
  const adapter = await requestGpuAdapter(gpu, options);
  const device = await requestGpuDevice(adapter, options);
  assertElementTextureUploadSupport(device);
  const { context, format } = configureGpuCanvas(
    htmlCanvas,
    device,
    gpu,
    options,
  );

  return {
    adapter,
    canvas: htmlCanvas,
    context,
    device,
    format,
    maxTextureDimension2D: device.limits.maxTextureDimension2D,
    destroy() {
      const configurableContext = context as GPUCanvasContext & {
        unconfigure?: () => void;
      };
      configurableContext.unconfigure?.();
      device.destroy();
    },
  };
}

export function assertHtmlInCanvasSupport(
  canvas: HTMLCanvasElement,
): HtmlInCanvasCanvas {
  const candidate = canvas as Partial<HtmlInCanvasCanvas>;
  if (!("layoutSubtree" in candidate)) {
    throw new GpuFlowSupportError("layout-subtree-missing");
  }
  if (typeof candidate.requestPaint !== "function") {
    throw new GpuFlowSupportError("request-paint-missing");
  }
  if (!("onpaint" in candidate)) {
    throw new GpuFlowSupportError("paint-event-missing");
  }
  if (!hasDrawElementImageSupport()) {
    throw new GpuFlowSupportError("draw-element-image-missing");
  }
  return canvas as HtmlInCanvasCanvas;
}

export function configureGpuCanvas(
  canvas: HtmlInCanvasCanvas,
  device: GPUDevice,
  gpu: GPU,
  options: GpuFlowDeviceOptions = {},
): { context: GPUCanvasContext; format: GPUTextureFormat } {
  canvas.layoutSubtree = true;
  canvas.setAttribute("layoutsubtree", "");

  const context = canvas.getContext("webgpu");
  if (!context) {
    throw new GpuFlowSupportError("webgpu-context-missing");
  }

  const format = options.format ?? gpu.getPreferredCanvasFormat();
  const configuration: GPUCanvasConfiguration = {
    alphaMode: options.alphaMode ?? "premultiplied",
    device,
    format,
  };
  context.configure(configuration);

  return { context, format };
}

function getRequiredGpu(): GPU {
  const gpu = globalThis.navigator?.gpu;
  if (!gpu) {
    throw new GpuFlowSupportError("webgpu-missing");
  }
  return gpu;
}

async function requestGpuAdapter(
  gpu: GPU,
  options: GpuFlowDeviceOptions,
): Promise<GPUAdapter> {
  const adapterOptions =
    options.powerPreference === undefined
      ? undefined
      : { powerPreference: options.powerPreference };
  const adapter = await gpu.requestAdapter(adapterOptions);
  if (!adapter) {
    throw new GpuFlowSupportError("adapter-missing");
  }
  return adapter;
}

async function requestGpuDevice(
  adapter: GPUAdapter,
  options: GpuFlowDeviceOptions,
): Promise<GPUDevice> {
  const descriptor: GPUDeviceDescriptor = {};
  if (options.requestAdapterMaxTextureLimit !== false) {
    descriptor.requiredLimits = {
      maxTextureDimension2D: adapter.limits.maxTextureDimension2D,
    };
  }
  return adapter.requestDevice(descriptor);
}

function assertElementTextureUploadSupport(device: GPUDevice) {
  const queue = device.queue as GpuQueueWithElementUpload;
  if (typeof queue.copyElementImageToTexture !== "function") {
    throw new GpuFlowSupportError("copy-element-image-to-texture-missing");
  }
}

function hasDrawElementImageSupport(): boolean {
  const contextPrototype = globalThis.CanvasRenderingContext2D?.prototype as
    | HtmlInCanvas2DContext
    | undefined;
  return typeof contextPrototype?.drawElementImage === "function";
}
