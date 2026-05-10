import {
  isChromeReproActive,
  isChromeReproVerboseGpuFlowActive,
  nowChromeReproPerformanceMs,
  postMeasuredChromeReproEvent,
  roundChromeReproMs,
} from "state/actions/chromeRepro";

import type {
  GpuFlowFramePerformanceEvent,
  GpuFlowFramePerformanceReporter,
  GpuFlowFrameUploadDiagnostic,
} from "gpuFlow/framePerformance";
import type { GpuFlowInteractionDiagnostics } from "gpuFlow/interactionDiagnostics";

export const PROJECT_GPU_FLOW_FRAME_PERFORMANCE_REPORTER: GpuFlowFramePerformanceReporter =
  {
    isEnabled: isProjectGpuFlowFramePerformanceEnabled,
    onFrame: postProjectGpuFlowFrameChromeReproEvent,
  };

export function postProjectGpuFlowFrameChromeReproEvent(
  event: GpuFlowFramePerformanceEvent,
): void {
  if (isChromeReproActive()) {
    const buildStartedAtMs = nowChromeReproPerformanceMs();
    const verbose = isChromeReproVerboseGpuFlowActive();
    const {
      interactionDiagnostics,
      textureLifecycleDiagnostics,
      uploadDiagnostics,
      ...metrics
    } = event;
    postMeasuredChromeReproEvent(
      "gpu-flow-frame",
      {
        ...metrics,
        durationMs: roundChromeReproMs(event.durationMs),
        frameReasons: [...event.frameReasons],
        interactionDiagnostics:
          summarizeProjectGpuFlowInteractionDiagnosticsForChromeRepro(
            interactionDiagnostics,
          ),
        retainedTexturePageRasterMs: roundChromeReproMs(
          event.retainedTexturePageRasterMs,
        ),
        retainedTexturePageUploadMs: roundChromeReproMs(
          event.retainedTexturePageUploadMs,
        ),
        textureLifecycleDiagnostics: verbose ? textureLifecycleDiagnostics : [],
        uploadDiagnosticSummary:
          summarizeProjectGpuFlowUploadDiagnosticsForChromeRepro(
            uploadDiagnostics,
          ),
        uploadDiagnostics: verbose
          ? uploadDiagnostics.map(
              roundProjectGpuFlowUploadDiagnosticForChromeRepro,
            )
          : [],
        viewport: {
          x: roundChromeReproMs(event.viewport.x),
          y: roundChromeReproMs(event.viewport.y),
          zoom: roundChromeReproMs(event.viewport.zoom),
        },
      },
      {
        buildDurationMs: nowChromeReproPerformanceMs() - buildStartedAtMs,
      },
    );
  }
  getGpuFlowPerformanceProbe()?.recordNodeLayerFrame?.(event);
}

function isProjectGpuFlowFramePerformanceEnabled(): boolean {
  return isChromeReproActive() || Boolean(getGpuFlowPerformanceProbe());
}

function getGpuFlowPerformanceProbe():
  | { readonly recordNodeLayerFrame?: (result: unknown) => void }
  | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const probe = (
    window as Window & {
      readonly __settaGpuFlowPerformanceProbe?: {
        readonly recordNodeLayerFrame?: (result: unknown) => void;
      };
    }
  ).__settaGpuFlowPerformanceProbe;
  return typeof probe?.recordNodeLayerFrame === "function" ? probe : undefined;
}

function roundProjectGpuFlowUploadDiagnosticForChromeRepro(
  diagnostic: GpuFlowFrameUploadDiagnostic,
): GpuFlowFrameUploadDiagnostic {
  return {
    ...diagnostic,
    cssHeight: roundChromeReproMs(diagnostic.cssHeight),
    cssWidth: roundChromeReproMs(diagnostic.cssWidth),
    dirtySourceRect: diagnostic.dirtySourceRect
      ? {
          height: roundChromeReproMs(diagnostic.dirtySourceRect.height),
          width: roundChromeReproMs(diagnostic.dirtySourceRect.width),
          x: roundChromeReproMs(diagnostic.dirtySourceRect.x),
          y: roundChromeReproMs(diagnostic.dirtySourceRect.y),
        }
      : null,
    durationMs: roundChromeReproMs(diagnostic.durationMs),
    reasons: [...diagnostic.reasons],
  };
}

function summarizeProjectGpuFlowUploadDiagnosticsForChromeRepro(
  diagnostics: readonly GpuFlowFrameUploadDiagnostic[],
) {
  const summaries = new Map<
    string,
    {
      count: number;
      dirtyTileBytes: number;
      dirtyTileCount: number;
      durationMs: number;
      priority: string;
      reasons: string[];
      sampleSurfaceIds: string[];
      textureLayoutKind: string;
      uploadedBytes: number;
      uploadedTextureCount: number;
      uploadedTileCount: number;
      workKinds: string[];
    }
  >();
  for (const diagnostic of diagnostics) {
    const workKinds = [...(diagnostic.workKinds ?? [])].sort();
    const key = [
      diagnostic.priority,
      diagnostic.textureLayoutKind,
      workKinds.join(","),
    ].join("|");
    const existing = summaries.get(key) ?? {
      count: 0,
      dirtyTileBytes: 0,
      dirtyTileCount: 0,
      durationMs: 0,
      priority: diagnostic.priority,
      reasons: [],
      sampleSurfaceIds: [],
      textureLayoutKind: diagnostic.textureLayoutKind,
      uploadedBytes: 0,
      uploadedTextureCount: 0,
      uploadedTileCount: 0,
      workKinds,
    };
    existing.count += 1;
    existing.dirtyTileBytes += diagnostic.dirtyTileBytes;
    existing.dirtyTileCount += diagnostic.dirtyTileCount;
    existing.durationMs += diagnostic.durationMs;
    existing.uploadedBytes += diagnostic.uploadedBytes;
    existing.uploadedTextureCount += diagnostic.uploadedTextureCount;
    existing.uploadedTileCount += diagnostic.uploadedTileCount;
    for (const reason of diagnostic.reasons) {
      if (existing.reasons.length >= 8) {
        break;
      }
      if (!existing.reasons.includes(reason)) {
        existing.reasons.push(reason);
      }
    }
    if (
      existing.sampleSurfaceIds.length < 5 &&
      !existing.sampleSurfaceIds.includes(diagnostic.surfaceId)
    ) {
      existing.sampleSurfaceIds.push(diagnostic.surfaceId);
    }
    summaries.set(key, existing);
  }
  return [...summaries.values()]
    .map((summary) => ({
      ...summary,
      durationMs: roundChromeReproMs(summary.durationMs),
    }))
    .sort(
      (left, right) =>
        right.durationMs - left.durationMs ||
        right.uploadedBytes - left.uploadedBytes ||
        left.priority.localeCompare(right.priority),
    )
    .slice(0, 16);
}

function summarizeProjectGpuFlowInteractionDiagnosticsForChromeRepro(
  diagnostics: GpuFlowInteractionDiagnostics | null,
): GpuFlowInteractionDiagnostics | null {
  if (!diagnostics) {
    return null;
  }
  return {
    ...diagnostics,
    activeDomIsland: summarizeProjectGpuFlowElementDiagnosticsForChromeRepro(
      diagnostics.activeDomIsland,
    ),
    activeRetainedHit: summarizeProjectGpuFlowRetainedHitForChromeRepro(
      diagnostics.activeRetainedHit,
    ),
    hoveredRetainedHit: summarizeProjectGpuFlowRetainedHitForChromeRepro(
      diagnostics.hoveredRetainedHit,
    ),
    lastPointer: diagnostics.lastPointer
      ? {
          ...diagnostics.lastPointer,
          elementFromPoint:
            summarizeProjectGpuFlowElementDiagnosticsForChromeRepro(
              diagnostics.lastPointer.elementFromPoint,
            ),
          target: summarizeProjectGpuFlowElementDiagnosticsForChromeRepro(
            diagnostics.lastPointer.target,
          ),
        }
      : null,
  };
}

function summarizeProjectGpuFlowElementDiagnosticsForChromeRepro(
  diagnostics: GpuFlowInteractionDiagnostics["activeDomIsland"],
): GpuFlowInteractionDiagnostics["activeDomIsland"] {
  if (!diagnostics) {
    return diagnostics;
  }
  return {
    ...diagnostics,
    className: limitChromeReproDiagnosticString(diagnostics.className, 160),
  };
}

function summarizeProjectGpuFlowRetainedHitForChromeRepro(
  diagnostics: GpuFlowInteractionDiagnostics["activeRetainedHit"],
): GpuFlowInteractionDiagnostics["activeRetainedHit"] {
  if (!diagnostics) {
    return diagnostics;
  }
  return {
    ...diagnostics,
    rowLabel: limitChromeReproDiagnosticString(diagnostics.rowLabel, 160),
  };
}

function limitChromeReproDiagnosticString(
  value: string | null,
  maxLength: number,
): string | null {
  if (value === null || value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...(${value.length})`;
}
