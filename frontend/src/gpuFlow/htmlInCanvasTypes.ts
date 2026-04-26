import "react";

export type HtmlInCanvasPaintEvent = Event & {
  readonly changedElements?: readonly Element[];
};

export type HtmlInCanvasPaintHandler = (
  this: HTMLCanvasElement,
  event: HtmlInCanvasPaintEvent,
) => void;

export type HtmlInCanvasCanvas = HTMLCanvasElement & {
  layoutSubtree: boolean;
  onpaint: HtmlInCanvasPaintHandler | null;
  requestPaint(): void;
  getElementTransform?(element: Element, drawTransform: DOMMatrix): DOMMatrix;
};

export type HtmlInCanvas2DContext = CanvasRenderingContext2D & {
  drawElementImage?(
    element: Element,
    dx: number,
    dy: number,
    dWidth?: number,
    dHeight?: number,
  ): DOMMatrix;
};

// Chromium's html-in-canvas WebGPU upload API is experimental and is not in
// TypeScript's DOM lib yet.
export type GpuQueueWithElementUpload = GPUQueue & {
  copyElementImageToTexture?(
    source: Element,
    width: GPUIntegerCoordinate,
    height: GPUIntegerCoordinate,
    destination: GPUImageCopyTextureTagged,
  ): void;
};

declare global {
  type GPUCanvasAlphaMode = "opaque" | "premultiplied";
  type GPUIntegerCoordinate = number;
  type GPUPowerPreference = "high-performance" | "low-power";
  type GPUTextureFormat = string;
  type GPUTextureUsageFlags = number;

  interface GPU {
    getPreferredCanvasFormat(): GPUTextureFormat;
    requestAdapter(
      options?: GPURequestAdapterOptions,
    ): Promise<GPUAdapter | null>;
  }

  interface GPUAdapter {
    readonly limits: GPUSupportedLimits;
    requestDevice(descriptor?: GPUDeviceDescriptor): Promise<GPUDevice>;
  }

  interface GPUCanvasConfiguration {
    alphaMode?: GPUCanvasAlphaMode;
    colorSpace?: PredefinedColorSpace;
    device: GPUDevice;
    format: GPUTextureFormat;
    usage?: GPUTextureUsageFlags;
    viewFormats?: GPUTextureFormat[];
  }

  interface GPUCanvasContext {
    configure(configuration: GPUCanvasConfiguration): void;
    getCurrentTexture(): GPUTexture;
    unconfigure?(): void;
  }

  interface GPUDevice {
    readonly limits: GPUSupportedLimits;
    readonly queue: GPUQueue;
    destroy(): void;
  }

  interface GPUDeviceDescriptor {
    label?: string;
    requiredFeatures?: readonly string[];
    requiredLimits?: Record<string, number>;
  }

  interface GPUImageCopyTextureTagged {
    aspect?: "all" | "depth-only" | "stencil-only";
    colorSpace?: PredefinedColorSpace;
    mipLevel?: number;
    origin?: GPUOrigin3D;
    premultipliedAlpha?: boolean;
    texture: GPUTexture;
  }

  interface GPUOrigin3D {
    x?: number;
    y?: number;
    z?: number;
  }

  interface GPUQueue {
    submit?(commandBuffers: readonly unknown[]): void;
  }

  interface GPURequestAdapterOptions {
    forceFallbackAdapter?: boolean;
    powerPreference?: GPUPowerPreference;
  }

  interface GPUSupportedLimits {
    readonly maxTextureDimension2D: number;
  }

  interface GPUTexture {
    createView?(): unknown;
    destroy?(): void;
  }

  interface HTMLCanvasElement {
    getContext(contextId: "webgpu", options?: unknown): GPUCanvasContext | null;
  }

  interface Navigator {
    readonly gpu?: GPU;
  }
}

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface CanvasHTMLAttributes<T> {
    layoutsubtree?: string | boolean | undefined;
  }
}
