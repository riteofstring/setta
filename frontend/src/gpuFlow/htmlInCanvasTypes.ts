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
  type GPUAddressMode = "clamp-to-edge" | "mirror-repeat" | "repeat";
  type GPUFilterMode = "linear" | "nearest";
  type GPUIntegerCoordinate = number;
  type GPUMipmapFilterMode = "linear" | "nearest";
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
    createSampler(descriptor?: GPUSamplerDescriptor): GPUSampler;
    createTexture(descriptor: GPUTextureDescriptor): GPUTexture;
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

  interface GPUSampler {
    readonly label?: string;
  }

  interface GPUSamplerDescriptor {
    addressModeU?: GPUAddressMode;
    addressModeV?: GPUAddressMode;
    addressModeW?: GPUAddressMode;
    label?: string;
    magFilter?: GPUFilterMode;
    minFilter?: GPUFilterMode;
    mipmapFilter?: GPUMipmapFilterMode;
  }

  interface GPURequestAdapterOptions {
    forceFallbackAdapter?: boolean;
    powerPreference?: GPUPowerPreference;
  }

  interface GPUSupportedLimits {
    readonly maxTextureDimension2D: number;
  }

  interface GPUExtent3DDict {
    depthOrArrayLayers?: number;
    height?: GPUIntegerCoordinate;
    width: GPUIntegerCoordinate;
  }

  interface GPUTexture {
    createView(descriptor?: GPUTextureViewDescriptor): GPUTextureView;
    destroy?(): void;
  }

  interface GPUTextureDescriptor {
    dimension?: "1d" | "2d" | "3d";
    format: GPUTextureFormat;
    label?: string;
    mipLevelCount?: GPUIntegerCoordinate;
    sampleCount?: GPUIntegerCoordinate;
    size: GPUExtent3DDict | [GPUIntegerCoordinate, GPUIntegerCoordinate];
    usage: GPUTextureUsageFlags;
    viewFormats?: GPUTextureFormat[];
  }

  interface GPUTextureUsage {
    readonly COPY_DST: GPUTextureUsageFlags;
    readonly RENDER_ATTACHMENT: GPUTextureUsageFlags;
    readonly TEXTURE_BINDING: GPUTextureUsageFlags;
  }

  var GPUTextureUsage: GPUTextureUsage;

  interface GPUTextureView {
    readonly label?: string;
  }

  interface GPUTextureViewDescriptor {
    label?: string;
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
