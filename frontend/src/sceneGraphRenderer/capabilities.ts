export const DEFAULT_REQUIRED_WEBGPU_FEATURES: readonly string[] = [];

export type SceneGraphRendererCapabilityProbeStatus = "pending" | "ready";

export type SceneGraphRendererWebGpuUnavailableReason =
  | "navigator_gpu_missing"
  | "adapter_request_failed"
  | "adapter_unavailable"
  | "required_features_missing";

export type SceneGraphRendererWebGl2UnavailableReason =
  | "document_unavailable"
  | "canvas_context_unavailable";

export type SceneGraphRendererSoftwareFallbackReason =
  | "webgpu_adapter_is_fallback"
  | "webgl2_major_performance_caveat";

export type SceneGraphRendererWebGpuCapabilities = {
  available: boolean;
  reason: SceneGraphRendererWebGpuUnavailableReason | null;
  missingRequiredFeatures: string[];
  adapterIsFallback: boolean;
};

export type SceneGraphRendererWebGl2Capabilities = {
  available: boolean;
  reason: SceneGraphRendererWebGl2UnavailableReason | null;
  renderer: string | null;
  vendor: string | null;
  majorPerformanceCaveat: boolean | null;
};

export type SceneGraphRendererCapabilities = {
  probeStatus: SceneGraphRendererCapabilityProbeStatus;
  requiredWebGpuFeatures: string[];
  webgpu: SceneGraphRendererWebGpuCapabilities;
  webgl2: SceneGraphRendererWebGl2Capabilities;
  softwareFallbackDetected: boolean;
  softwareFallbackReasons: SceneGraphRendererSoftwareFallbackReason[];
};

export type SceneGraphRendererGpuFeatureSetLike =
  | Set<string>
  | ReadonlySet<string>
  | {
      has: (feature: string) => boolean;
    };

export type SceneGraphRendererGpuAdapterLike = {
  features?: SceneGraphRendererGpuFeatureSetLike;
  isFallbackAdapter?: boolean;
};

export type SceneGraphRendererGpuLike = {
  requestAdapter: () => Promise<SceneGraphRendererGpuAdapterLike | null>;
};

export type SceneGraphRendererNavigatorLike = {
  gpu?: SceneGraphRendererGpuLike;
};

export type SceneGraphRendererWebGlContextLike = {
  RENDERER: number;
  VENDOR: number;
  getExtension: (name: string) => unknown;
  getParameter: (parameterName: number) => unknown;
};

export type SceneGraphRendererCanvasLike = {
  getContext: (
    contextId: "webgl2",
    options?: WebGLContextAttributes,
  ) => SceneGraphRendererWebGlContextLike | null;
};

type SceneGraphRendererProbeEnvironment = {
  navigatorValue: SceneGraphRendererNavigatorLike | null;
  createCanvas: () => SceneGraphRendererCanvasLike | null;
};

type SceneGraphRendererProbeOptions = {
  requiredWebGpuFeatures?: readonly string[];
  environment?: Partial<SceneGraphRendererProbeEnvironment>;
};

type WebGlDebugRendererInfoLike = {
  UNMASKED_RENDERER_WEBGL: number;
  UNMASKED_VENDOR_WEBGL: number;
};

export function createInitialSceneGraphRendererCapabilities(
  requiredWebGpuFeatures: readonly string[] = DEFAULT_REQUIRED_WEBGPU_FEATURES,
): SceneGraphRendererCapabilities {
  return {
    probeStatus: "pending",
    requiredWebGpuFeatures: [...requiredWebGpuFeatures],
    webgpu: {
      available: false,
      reason: null,
      missingRequiredFeatures: [],
      adapterIsFallback: false,
    },
    webgl2: {
      available: false,
      reason: null,
      renderer: null,
      vendor: null,
      majorPerformanceCaveat: null,
    },
    softwareFallbackDetected: false,
    softwareFallbackReasons: [],
  };
}

export async function probeSceneGraphRendererCapabilities(
  options: SceneGraphRendererProbeOptions = {},
): Promise<SceneGraphRendererCapabilities> {
  const requiredWebGpuFeatures = [
    ...(options.requiredWebGpuFeatures ?? DEFAULT_REQUIRED_WEBGPU_FEATURES),
  ];
  const environment = resolveProbeEnvironment(options.environment);
  const [webgpu, webgl2] = await Promise.all([
    probeWebGpuCapabilities(environment.navigatorValue, requiredWebGpuFeatures),
    Promise.resolve(probeWebGl2Capabilities(environment.createCanvas)),
  ]);
  const softwareFallbackReasons: SceneGraphRendererSoftwareFallbackReason[] =
    [];

  if (webgpu.adapterIsFallback) {
    softwareFallbackReasons.push("webgpu_adapter_is_fallback");
  }
  if (webgl2.majorPerformanceCaveat === true) {
    softwareFallbackReasons.push("webgl2_major_performance_caveat");
  }

  return {
    probeStatus: "ready",
    requiredWebGpuFeatures,
    webgpu,
    webgl2,
    softwareFallbackDetected: softwareFallbackReasons.length > 0,
    softwareFallbackReasons,
  };
}

function resolveProbeEnvironment(
  environmentOverrides?: Partial<SceneGraphRendererProbeEnvironment>,
): SceneGraphRendererProbeEnvironment {
  return {
    navigatorValue:
      environmentOverrides?.navigatorValue ?? getNavigatorForCapabilityProbe(),
    createCanvas:
      environmentOverrides?.createCanvas ?? createCanvasForCapabilityProbe,
  };
}

function getNavigatorForCapabilityProbe(): SceneGraphRendererNavigatorLike | null {
  if (typeof navigator === "undefined") {
    return null;
  }
  return navigator as SceneGraphRendererNavigatorLike;
}

function createCanvasForCapabilityProbe(): SceneGraphRendererCanvasLike | null {
  if (typeof document === "undefined") {
    return null;
  }
  const canvasElement = document.createElement("canvas");
  if (!canvasElement || typeof canvasElement.getContext !== "function") {
    return null;
  }
  return canvasElement as unknown as SceneGraphRendererCanvasLike;
}

async function probeWebGpuCapabilities(
  navigatorValue: SceneGraphRendererNavigatorLike | null,
  requiredWebGpuFeatures: readonly string[],
): Promise<SceneGraphRendererWebGpuCapabilities> {
  if (!navigatorValue || !navigatorValue.gpu) {
    return {
      available: false,
      reason: "navigator_gpu_missing",
      missingRequiredFeatures: [],
      adapterIsFallback: false,
    };
  }

  let adapter: SceneGraphRendererGpuAdapterLike | null = null;
  try {
    adapter = await navigatorValue.gpu.requestAdapter();
  } catch {
    return {
      available: false,
      reason: "adapter_request_failed",
      missingRequiredFeatures: [],
      adapterIsFallback: false,
    };
  }

  if (!adapter) {
    return {
      available: false,
      reason: "adapter_unavailable",
      missingRequiredFeatures: [],
      adapterIsFallback: false,
    };
  }

  const missingRequiredFeatures = requiredWebGpuFeatures.filter(
    (feature) => !gpuAdapterHasFeature(adapter, feature),
  );
  const adapterIsFallback = adapter.isFallbackAdapter === true;
  if (missingRequiredFeatures.length > 0) {
    return {
      available: false,
      reason: "required_features_missing",
      missingRequiredFeatures,
      adapterIsFallback,
    };
  }

  return {
    available: true,
    reason: null,
    missingRequiredFeatures: [],
    adapterIsFallback,
  };
}

function probeWebGl2Capabilities(
  createCanvas: () => SceneGraphRendererCanvasLike | null,
): SceneGraphRendererWebGl2Capabilities {
  const canvas = createCanvas();
  if (!canvas) {
    return {
      available: false,
      reason: "document_unavailable",
      renderer: null,
      vendor: null,
      majorPerformanceCaveat: null,
    };
  }

  const context = canvas.getContext("webgl2");
  if (!context) {
    return {
      available: false,
      reason: "canvas_context_unavailable",
      renderer: null,
      vendor: null,
      majorPerformanceCaveat: null,
    };
  }

  const caveatCanvas = createCanvas();
  let majorPerformanceCaveat: boolean | null = null;
  if (caveatCanvas) {
    const contextWithCaveatGuard = caveatCanvas.getContext("webgl2", {
      failIfMajorPerformanceCaveat: true,
    });
    majorPerformanceCaveat = contextWithCaveatGuard === null;
  }

  const rendererAndVendor = readWebGl2RendererAndVendor(context);
  return {
    available: true,
    reason: null,
    renderer: rendererAndVendor.renderer,
    vendor: rendererAndVendor.vendor,
    majorPerformanceCaveat,
  };
}

function gpuAdapterHasFeature(
  adapter: SceneGraphRendererGpuAdapterLike,
  feature: string,
) {
  if (!adapter.features) {
    return false;
  }
  return adapter.features.has(feature);
}

function readWebGl2RendererAndVendor(
  context: SceneGraphRendererWebGlContextLike,
): {
  renderer: string | null;
  vendor: string | null;
} {
  const debugInfo = context.getExtension(
    "WEBGL_debug_renderer_info",
  ) as WebGlDebugRendererInfoLike | null;
  if (debugInfo) {
    return {
      renderer: normalizeWebGlParameter(
        context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL),
      ),
      vendor: normalizeWebGlParameter(
        context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
      ),
    };
  }

  return {
    renderer: normalizeWebGlParameter(context.getParameter(context.RENDERER)),
    vendor: normalizeWebGlParameter(context.getParameter(context.VENDOR)),
  };
}

function normalizeWebGlParameter(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }
  return trimmedValue;
}
