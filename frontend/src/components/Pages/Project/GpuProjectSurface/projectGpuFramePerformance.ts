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
    isEnabled: isChromeReproActive,
    onFrame: postProjectGpuFlowFrameChromeReproEvent,
  };

export function postProjectGpuFlowFrameChromeReproEvent(
  event: GpuFlowFramePerformanceEvent,
): void {
  if (!isChromeReproActive()) {
    return;
  }
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
