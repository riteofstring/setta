import {
  isChromeReproActive,
  postChromeReproEvent,
  roundChromeReproMs,
} from "state/actions/chromeRepro";

import type {
  GpuFlowFramePerformanceEvent,
  GpuFlowFramePerformanceReporter,
  GpuFlowFrameUploadDiagnostic,
} from "gpuFlow/framePerformance";

export const PROJECT_GPU_FLOW_FRAME_PERFORMANCE_REPORTER: GpuFlowFramePerformanceReporter =
  {
    isEnabled: isProjectGpuFlowFramePerformanceEnabled,
    onFrame: postProjectGpuFlowFrameChromeReproEvent,
  };

export function postProjectGpuFlowFrameChromeReproEvent(
  event: GpuFlowFramePerformanceEvent,
): void {
  if (isChromeReproActive()) {
    postChromeReproEvent("gpu-flow-frame", {
      ...event,
      durationMs: roundChromeReproMs(event.durationMs),
      frameReasons: [...event.frameReasons],
      uploadDiagnostics: event.uploadDiagnostics.map(
        roundProjectGpuFlowUploadDiagnosticForChromeRepro,
      ),
      viewport: {
        x: roundChromeReproMs(event.viewport.x),
        y: roundChromeReproMs(event.viewport.y),
        zoom: roundChromeReproMs(event.viewport.zoom),
      },
    });
  }
  getGpuFlowPerformanceProbe()?.recordNodeLayerFrame(event);
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
