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

  interface GPUCommandBuffer {
    readonly __gpuCommandBufferBrand?: never;
  }

  interface GPUCommandBufferDescriptor {
    label?: string;
  }

  interface GPUCommandEncoder {
    beginRenderPass(descriptor: GPURenderPassDescriptor): GPURenderPassEncoder;
    finish(descriptor?: GPUCommandBufferDescriptor): GPUCommandBuffer;
  }

  interface GPUCommandEncoderDescriptor {
    label?: string;
  }

  interface GPUDevice {
    readonly limits: GPUSupportedLimits;
    readonly queue: GPUQueue;
    createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup;
    createBindGroupLayout(
      descriptor: GPUBindGroupLayoutDescriptor,
    ): GPUBindGroupLayout;
    createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer;
    createCommandEncoder(
      descriptor?: GPUCommandEncoderDescriptor,
    ): GPUCommandEncoder;
    createPipelineLayout(
      descriptor: GPUPipelineLayoutDescriptor,
    ): GPUPipelineLayout;
    createRenderPipeline(
      descriptor: GPURenderPipelineDescriptor,
    ): GPURenderPipeline;
    createSampler(descriptor?: GPUSamplerDescriptor): GPUSampler;
    createShaderModule(descriptor: GPUShaderModuleDescriptor): GPUShaderModule;
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
    submit(commandBuffers: readonly GPUCommandBuffer[]): void;
    writeBuffer(
      buffer: GPUBuffer,
      bufferOffset: number,
      data: BufferSource,
      dataOffset?: number,
      size?: number,
    ): void;
  }

  interface GPUBindGroup {
    readonly __gpuBindGroupBrand?: never;
  }

  interface GPUBindGroupDescriptor {
    entries: GPUBindGroupEntry[];
    label?: string;
    layout: GPUBindGroupLayout;
  }

  interface GPUBindGroupEntry {
    binding: number;
    resource: GPUBindingResource;
  }

  interface GPUBindGroupLayout {
    readonly __gpuBindGroupLayoutBrand?: never;
  }

  interface GPUBindGroupLayoutDescriptor {
    entries: GPUBindGroupLayoutEntry[];
    label?: string;
  }

  interface GPUBindGroupLayoutEntry {
    binding: number;
    buffer?: GPUBufferBindingLayout;
    sampler?: GPUSamplerBindingLayout;
    texture?: GPUTextureBindingLayout;
    visibility: GPUShaderStageFlags;
  }

  type GPUBindingResource = GPUSampler | GPUTextureView | GPUBufferBinding;

  interface GPUBlendComponent {
    dstFactor?: GPUBlendFactor;
    operation?: GPUBlendOperation;
    srcFactor?: GPUBlendFactor;
  }

  type GPUBlendFactor = "one" | "one-minus-src-alpha" | "src-alpha" | "zero";

  type GPUBlendOperation = "add";

  interface GPUBlendState {
    alpha: GPUBlendComponent;
    color: GPUBlendComponent;
  }

  interface GPUBuffer {
    destroy?(): void;
  }

  interface GPUBufferBinding {
    buffer: GPUBuffer;
    offset?: number;
    size?: number;
  }

  interface GPUBufferBindingLayout {
    hasDynamicOffset?: boolean;
    minBindingSize?: number;
    type?: GPUBufferBindingType;
  }

  type GPUBufferBindingType = "read-only-storage" | "storage" | "uniform";

  interface GPUBufferDescriptor {
    label?: string;
    mappedAtCreation?: boolean;
    size: number;
    usage: GPUBufferUsageFlags;
  }

  type GPUBufferUsageFlags = number;

  interface GPUBufferUsage {
    readonly COPY_DST: GPUBufferUsageFlags;
    readonly UNIFORM: GPUBufferUsageFlags;
    readonly VERTEX: GPUBufferUsageFlags;
  }

  var GPUBufferUsage: GPUBufferUsage;

  interface GPUColorDict {
    a: number;
    b: number;
    g: number;
    r: number;
  }

  type GPUColorWriteFlags = number;

  interface GPUColorTargetState {
    blend?: GPUBlendState;
    format: GPUTextureFormat;
    writeMask?: GPUColorWriteFlags;
  }

  type GPUIndexFormat = "uint16" | "uint32";
  type GPULoadOp = "clear" | "load";

  interface GPUPipelineLayout {
    readonly __gpuPipelineLayoutBrand?: never;
  }

  interface GPUPipelineLayoutDescriptor {
    bindGroupLayouts: GPUBindGroupLayout[];
    label?: string;
  }

  type GPUPrimitiveTopology =
    | "line-list"
    | "line-strip"
    | "point-list"
    | "triangle-list"
    | "triangle-strip";

  interface GPUPrimitiveState {
    cullMode?: "back" | "front" | "none";
    frontFace?: "ccw" | "cw";
    stripIndexFormat?: GPUIndexFormat;
    topology?: GPUPrimitiveTopology;
    unclippedDepth?: boolean;
  }

  interface GPURenderPassColorAttachment {
    clearValue?: GPUColorDict;
    loadOp: GPULoadOp;
    storeOp: GPUStoreOp;
    view: GPUTextureView;
  }

  interface GPURenderPassDescriptor {
    colorAttachments: GPURenderPassColorAttachment[];
    label?: string;
  }

  interface GPURenderPassEncoder {
    draw(
      vertexCount: number,
      instanceCount?: number,
      firstVertex?: number,
      firstInstance?: number,
    ): void;
    end(): void;
    setBindGroup(index: number, bindGroup: GPUBindGroup): void;
    setPipeline(pipeline: GPURenderPipeline): void;
    setVertexBuffer(slot: number, buffer: GPUBuffer): void;
  }

  interface GPURenderPipeline {
    readonly __gpuRenderPipelineBrand?: never;
  }

  interface GPURenderPipelineDescriptor {
    fragment?: GPUFragmentState;
    label?: string;
    layout: GPUPipelineLayout;
    primitive?: GPUPrimitiveState;
    vertex: GPUVertexState;
  }

  interface GPUSampler {
    readonly label?: string;
  }

  interface GPUSamplerBindingLayout {
    type?: GPUSamplerBindingType;
  }

  type GPUSamplerBindingType = "comparison" | "filtering" | "non-filtering";

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

  type GPUShaderStageFlags = number;

  interface GPUShaderStage {
    readonly FRAGMENT: GPUShaderStageFlags;
    readonly VERTEX: GPUShaderStageFlags;
  }

  var GPUShaderStage: GPUShaderStage;

  interface GPUShaderModule {
    readonly __gpuShaderModuleBrand?: never;
  }

  interface GPUShaderModuleDescriptor {
    code: string;
    label?: string;
  }

  type GPUStoreOp = "discard" | "store";

  interface GPUSupportedLimits {
    readonly maxTextureDimension2D: number;
  }

  type GPUTextureSampleType =
    | "depth"
    | "float"
    | "sint"
    | "uint"
    | "unfilterable-float";

  type GPUTextureViewDimension =
    | "1d"
    | "2d"
    | "2d-array"
    | "3d"
    | "cube"
    | "cube-array";

  interface GPUTextureBindingLayout {
    multisampled?: boolean;
    sampleType?: GPUTextureSampleType;
    viewDimension?: GPUTextureViewDimension;
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

  type GPUVertexFormat = "float32" | "float32x2" | "float32x3" | "float32x4";

  interface GPUVertexAttribute {
    format: GPUVertexFormat;
    offset: number;
    shaderLocation: number;
  }

  interface GPUVertexBufferLayout {
    arrayStride: number;
    attributes: GPUVertexAttribute[];
    stepMode?: GPUVertexStepMode;
  }

  type GPUVertexStepMode = "instance" | "vertex";

  interface GPUVertexState {
    buffers?: GPUVertexBufferLayout[];
    constants?: Record<string, number>;
    entryPoint: string;
    module: GPUShaderModule;
  }

  interface GPUFragmentState {
    constants?: Record<string, number>;
    entryPoint: string;
    module: GPUShaderModule;
    targets: GPUColorTargetState[];
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
