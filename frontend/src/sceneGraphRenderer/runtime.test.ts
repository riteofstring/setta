import { describe, expect, it } from "vitest";
import type { SceneGraphRendererCapabilities } from "./capabilities";
import type { SceneGraphRendererFlags } from "./flags";
import {
  buildSceneGraphRendererPerfLabels,
  resolveSceneGraphRendererBackend,
} from "./runtime";

function createCapabilities(
  overrides: Partial<SceneGraphRendererCapabilities> = {},
): SceneGraphRendererCapabilities {
  return {
    probeStatus: "ready",
    requiredWebGpuFeatures: [],
    webgpu: {
      available: false,
      reason: "navigator_gpu_missing",
      missingRequiredFeatures: [],
      adapterIsFallback: false,
    },
    webgl2: {
      available: false,
      reason: "canvas_context_unavailable",
      renderer: null,
      vendor: null,
      majorPerformanceCaveat: null,
    },
    softwareFallbackDetected: false,
    softwareFallbackReasons: [],
    ...overrides,
  };
}

function createFlags(overrides: Partial<SceneGraphRendererFlags> = {}) {
  return {
    enabled: false,
    backend: "auto",
    domIslandRadius: 2,
    debugOverlay: false,
    ...overrides,
  } as SceneGraphRendererFlags;
}

describe("resolveSceneGraphRendererBackend", () => {
  it("stays on DOM while the rollout flag is disabled", () => {
    // Disabled rollout must remain deterministic regardless of capability probe results.
    const selection = resolveSceneGraphRendererBackend(
      createFlags({ enabled: false }),
      createCapabilities({
        webgpu: {
          available: true,
          reason: null,
          missingRequiredFeatures: [],
          adapterIsFallback: false,
        },
      }),
    );

    expect(selection).toEqual({
      requestedBackend: "auto",
      resolvedBackend: "dom",
      reason: "renderer_disabled",
    });
  });

  it("returns DOM until capability probing completes", () => {
    // Probe-pending state should be explicit so harness labels are stable during startup.
    const selection = resolveSceneGraphRendererBackend(
      createFlags({ enabled: true }),
      createCapabilities({ probeStatus: "pending" }),
    );

    expect(selection).toEqual({
      requestedBackend: "auto",
      resolvedBackend: "dom",
      reason: "capability_probe_pending",
    });
  });

  it("prefers WebGPU for auto mode when available", () => {
    // Auto backend ordering should pick WebGPU first when capability checks pass.
    const selection = resolveSceneGraphRendererBackend(
      createFlags({ enabled: true }),
      createCapabilities({
        webgpu: {
          available: true,
          reason: null,
          missingRequiredFeatures: [],
          adapterIsFallback: false,
        },
      }),
    );

    expect(selection.resolvedBackend).toBe("webgpu");
    expect(selection.reason).toBe("auto_webgpu_selected");
  });

  it("falls back to WebGL when WebGPU is unavailable in auto mode", () => {
    // Auto mode must still pick a GPU path before DOM if WebGL2 remains available.
    const selection = resolveSceneGraphRendererBackend(
      createFlags({ enabled: true }),
      createCapabilities({
        webgpu: {
          available: false,
          reason: "adapter_unavailable",
          missingRequiredFeatures: [],
          adapterIsFallback: false,
        },
        webgl2: {
          available: true,
          reason: null,
          renderer: "Renderer",
          vendor: "Vendor",
          majorPerformanceCaveat: false,
        },
      }),
    );

    expect(selection.resolvedBackend).toBe("webgl");
    expect(selection.reason).toBe("auto_webgl_selected");
  });

  it("falls back to DOM when a forced backend is unavailable", () => {
    // Forced backend requests should not silently jump to a different GPU API.
    const webgpuSelection = resolveSceneGraphRendererBackend(
      createFlags({ enabled: true, backend: "webgpu" }),
      createCapabilities(),
    );
    const webglSelection = resolveSceneGraphRendererBackend(
      createFlags({ enabled: true, backend: "webgl" }),
      createCapabilities(),
    );

    expect(webgpuSelection).toEqual({
      requestedBackend: "webgpu",
      resolvedBackend: "dom",
      reason: "forced_webgpu_unavailable",
    });
    expect(webglSelection).toEqual({
      requestedBackend: "webgl",
      resolvedBackend: "dom",
      reason: "forced_webgl_unavailable",
    });
  });

  it("keeps forced GPU backends when capabilities are available", () => {
    // Forced backends should stay explicit (no auto-* reason) when checks pass.
    const capabilities = createCapabilities({
      webgpu: {
        available: true,
        reason: null,
        missingRequiredFeatures: [],
        adapterIsFallback: false,
      },
      webgl2: {
        available: true,
        reason: null,
        renderer: "Renderer",
        vendor: "Vendor",
        majorPerformanceCaveat: false,
      },
    });

    expect(
      resolveSceneGraphRendererBackend(
        createFlags({ enabled: true, backend: "webgpu" }),
        capabilities,
      ),
    ).toEqual({
      requestedBackend: "webgpu",
      resolvedBackend: "webgpu",
      reason: "forced_webgpu_selected",
    });
    expect(
      resolveSceneGraphRendererBackend(
        createFlags({ enabled: true, backend: "webgl" }),
        capabilities,
      ),
    ).toEqual({
      requestedBackend: "webgl",
      resolvedBackend: "webgl",
      reason: "forced_webgl_selected",
    });
  });
});

describe("buildSceneGraphRendererPerfLabels", () => {
  it("produces stable labels for perf harness reads", () => {
    // Perf harness output should include all rollout, capability, and resolution metadata.
    const flags = createFlags({
      enabled: true,
      backend: "auto",
      domIslandRadius: 4,
      debugOverlay: true,
    });
    const capabilities = createCapabilities({
      webgpu: {
        available: true,
        reason: null,
        missingRequiredFeatures: [],
        adapterIsFallback: false,
      },
    });
    const selection = resolveSceneGraphRendererBackend(flags, capabilities);

    const labels = buildSceneGraphRendererPerfLabels(
      flags,
      capabilities,
      selection,
      "project_config_name_default",
      false,
    );

    expect(labels).toEqual({
      enabled: true,
      rolloutDefaultOn: true,
      rolloutDefaultOnReason: "project_config_name_default",
      hasEnabledStorageOverride: false,
      requestedBackend: "auto",
      resolvedBackend: "webgpu",
      resolutionReason: "auto_webgpu_selected",
      probeStatus: "ready",
      webgpuAvailable: true,
      webgpuReason: null,
      webgl2Available: false,
      webgl2Reason: "canvas_context_unavailable",
      softwareFallbackDetected: false,
      softwareFallbackReasons: [],
      domIslandRadius: 4,
      debugOverlay: true,
    });
  });
});
