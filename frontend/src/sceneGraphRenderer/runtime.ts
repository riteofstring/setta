import type {
  SceneGraphRendererCapabilities,
  SceneGraphRendererWebGl2UnavailableReason,
  SceneGraphRendererWebGpuUnavailableReason,
} from "./capabilities";
import type {
  SceneGraphRendererBackendPreference,
  SceneGraphRendererFlags,
} from "./flags";

export type SceneGraphRendererResolvedBackend = "webgpu" | "webgl" | "dom";

type SceneGraphRendererBackendResolutionReason =
  | "renderer_disabled"
  | "capability_probe_pending"
  | "forced_dom"
  | "forced_webgpu_selected"
  | "forced_webgpu_unavailable"
  | "forced_webgl_selected"
  | "forced_webgl_unavailable"
  | "auto_webgpu_selected"
  | "auto_webgl_selected"
  | "auto_dom_fallback";

export type SceneGraphRendererBackendSelection = {
  requestedBackend: SceneGraphRendererBackendPreference;
  resolvedBackend: SceneGraphRendererResolvedBackend;
  reason: SceneGraphRendererBackendResolutionReason;
};

export type SceneGraphRendererPerfLabels = {
  enabled: boolean;
  requestedBackend: SceneGraphRendererBackendPreference;
  resolvedBackend: SceneGraphRendererResolvedBackend;
  resolutionReason: SceneGraphRendererBackendResolutionReason;
  probeStatus: SceneGraphRendererCapabilities["probeStatus"];
  webgpuAvailable: boolean;
  webgpuReason: SceneGraphRendererWebGpuUnavailableReason | null;
  webgl2Available: boolean;
  webgl2Reason: SceneGraphRendererWebGl2UnavailableReason | null;
  softwareFallbackDetected: boolean;
  softwareFallbackReasons: string[];
  domIslandRadius: number;
  debugOverlay: boolean;
};

export function resolveSceneGraphRendererBackend(
  flags: SceneGraphRendererFlags,
  capabilities: SceneGraphRendererCapabilities,
): SceneGraphRendererBackendSelection {
  if (!flags.enabled) {
    return {
      requestedBackend: flags.backend,
      resolvedBackend: "dom",
      reason: "renderer_disabled",
    };
  }

  if (capabilities.probeStatus !== "ready") {
    return {
      requestedBackend: flags.backend,
      resolvedBackend: "dom",
      reason: "capability_probe_pending",
    };
  }

  if (flags.backend === "dom") {
    return {
      requestedBackend: "dom",
      resolvedBackend: "dom",
      reason: "forced_dom",
    };
  }

  if (flags.backend === "webgpu") {
    if (capabilities.webgpu.available) {
      return {
        requestedBackend: "webgpu",
        resolvedBackend: "webgpu",
        reason: "forced_webgpu_selected",
      };
    }
    return {
      requestedBackend: "webgpu",
      resolvedBackend: "dom",
      reason: "forced_webgpu_unavailable",
    };
  }

  if (flags.backend === "webgl") {
    if (capabilities.webgl2.available) {
      return {
        requestedBackend: "webgl",
        resolvedBackend: "webgl",
        reason: "forced_webgl_selected",
      };
    }
    return {
      requestedBackend: "webgl",
      resolvedBackend: "dom",
      reason: "forced_webgl_unavailable",
    };
  }

  if (capabilities.webgpu.available) {
    return {
      requestedBackend: "auto",
      resolvedBackend: "webgpu",
      reason: "auto_webgpu_selected",
    };
  }
  if (capabilities.webgl2.available) {
    return {
      requestedBackend: "auto",
      resolvedBackend: "webgl",
      reason: "auto_webgl_selected",
    };
  }
  return {
    requestedBackend: "auto",
    resolvedBackend: "dom",
    reason: "auto_dom_fallback",
  };
}

export function buildSceneGraphRendererPerfLabels(
  flags: SceneGraphRendererFlags,
  capabilities: SceneGraphRendererCapabilities,
  selection: SceneGraphRendererBackendSelection,
): SceneGraphRendererPerfLabels {
  return {
    enabled: flags.enabled,
    requestedBackend: selection.requestedBackend,
    resolvedBackend: selection.resolvedBackend,
    resolutionReason: selection.reason,
    probeStatus: capabilities.probeStatus,
    webgpuAvailable: capabilities.webgpu.available,
    webgpuReason: capabilities.webgpu.reason,
    webgl2Available: capabilities.webgl2.available,
    webgl2Reason: capabilities.webgl2.reason,
    softwareFallbackDetected: capabilities.softwareFallbackDetected,
    softwareFallbackReasons: [...capabilities.softwareFallbackReasons],
    domIslandRadius: flags.domIslandRadius,
    debugOverlay: flags.debugOverlay,
  };
}
