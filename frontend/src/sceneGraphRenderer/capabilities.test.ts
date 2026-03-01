import { describe, expect, it } from "vitest";
import {
  probeSceneGraphRendererCapabilities,
  type SceneGraphRendererCanvasLike,
  type SceneGraphRendererGpuAdapterLike,
  type SceneGraphRendererNavigatorLike,
  type SceneGraphRendererWebGlContextLike,
} from "./capabilities";

function createNavigatorWithAdapter(
  adapter: SceneGraphRendererGpuAdapterLike | null,
): SceneGraphRendererNavigatorLike {
  return {
    gpu: {
      requestAdapter: async () => adapter,
    },
  };
}

function createWebGlCanvasFactory(options: {
  contextAvailable: boolean;
  supportsCaveatGuard: boolean;
  renderer?: string;
  vendor?: string;
  exposeDebugRendererInfo?: boolean;
}): () => SceneGraphRendererCanvasLike | null {
  const renderer = options.renderer ?? "Renderer";
  const vendor = options.vendor ?? "Vendor";
  const exposeDebugRendererInfo = options.exposeDebugRendererInfo ?? false;
  const context: SceneGraphRendererWebGlContextLike = {
    RENDERER: 10,
    VENDOR: 11,
    getExtension: (name: string) => {
      if (name !== "WEBGL_debug_renderer_info" || !exposeDebugRendererInfo) {
        return null;
      }
      return {
        UNMASKED_RENDERER_WEBGL: 20,
        UNMASKED_VENDOR_WEBGL: 21,
      };
    },
    getParameter: (parameterName: number) => {
      if (parameterName === 10 || parameterName === 20) {
        return renderer;
      }
      if (parameterName === 11 || parameterName === 21) {
        return vendor;
      }
      return null;
    },
  };

  return () => ({
    getContext: (_contextId, attributes) => {
      if (!options.contextAvailable) {
        return null;
      }
      if (
        attributes?.failIfMajorPerformanceCaveat === true &&
        !options.supportsCaveatGuard
      ) {
        return null;
      }
      return context;
    },
  });
}

describe("probeSceneGraphRendererCapabilities", () => {
  it("reports missing GPU and WebGL context when probe prerequisites are unavailable", async () => {
    // Baseline path: no navigator.gpu and no canvas should force DOM fallback metadata.
    const capabilities = await probeSceneGraphRendererCapabilities({
      environment: {
        navigatorValue: null,
        createCanvas: () => null,
      },
    });

    expect(capabilities.probeStatus).toBe("ready");
    expect(capabilities.webgpu.available).toBe(false);
    expect(capabilities.webgpu.reason).toBe("navigator_gpu_missing");
    expect(capabilities.webgl2.available).toBe(false);
    expect(capabilities.webgl2.reason).toBe("document_unavailable");
    expect(capabilities.softwareFallbackDetected).toBe(false);
  });

  it("marks WebGPU unavailable when required features are missing", async () => {
    // Required-feature checks must be deterministic and explicit, not inferred by heuristics.
    const capabilities = await probeSceneGraphRendererCapabilities({
      requiredWebGpuFeatures: ["timestamp-query"],
      environment: {
        navigatorValue: createNavigatorWithAdapter({
          features: new Set<string>(),
          isFallbackAdapter: false,
        }),
        createCanvas: createWebGlCanvasFactory({
          contextAvailable: true,
          supportsCaveatGuard: true,
          renderer: "GPU Renderer",
          vendor: "GPU Vendor",
        }),
      },
    });

    expect(capabilities.webgpu.available).toBe(false);
    expect(capabilities.webgpu.reason).toBe("required_features_missing");
    expect(capabilities.webgpu.missingRequiredFeatures).toEqual([
      "timestamp-query",
    ]);
    expect(capabilities.webgl2.available).toBe(true);
  });

  it("records software fallback markers from fallback adapter and WebGL caveat probe", async () => {
    // Phase 0 needs explicit fallback markers for perf labels and baseline reporting.
    const capabilities = await probeSceneGraphRendererCapabilities({
      environment: {
        navigatorValue: createNavigatorWithAdapter({
          features: new Set<string>(),
          isFallbackAdapter: true,
        }),
        createCanvas: createWebGlCanvasFactory({
          contextAvailable: true,
          supportsCaveatGuard: false,
          renderer: "Fallback Renderer",
          vendor: "Fallback Vendor",
          exposeDebugRendererInfo: true,
        }),
      },
    });

    expect(capabilities.webgl2.available).toBe(true);
    expect(capabilities.webgl2.majorPerformanceCaveat).toBe(true);
    expect(capabilities.webgl2.renderer).toBe("Fallback Renderer");
    expect(capabilities.webgl2.vendor).toBe("Fallback Vendor");
    expect(capabilities.softwareFallbackDetected).toBe(true);
    expect(capabilities.softwareFallbackReasons).toEqual([
      "webgpu_adapter_is_fallback",
      "webgl2_major_performance_caveat",
    ]);
  });
});
