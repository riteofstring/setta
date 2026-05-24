export type GpuRetainedContentHitTestSurfaceDiagnostic = {
  readonly checkedHitRecordCount: number;
  readonly hitRecordCount: number;
  readonly matched: boolean;
  readonly surfaceId: string;
};

type GpuRetainedContentHitTestDiagnostic = {
  readonly checkedHitRecordCount: number;
  readonly contentSurfaceCount: number;
  readonly durationMs: number;
  readonly matched: boolean;
  readonly retainedSurfaceCount: number;
  readonly surfaces: readonly GpuRetainedContentHitTestSurfaceDiagnostic[];
  readonly testedHitRecordCount: number;
  readonly testedSurfaceCount: number;
  readonly timestampMs: number;
};

type GpuRetainedContentSceneBuildDiagnostic = {
  readonly activePopup: boolean;
  readonly durationMs: number;
  readonly hitRecordBuildDurationMs: number;
  readonly hitRecordCount: number;
  readonly rowCount: number;
  readonly sceneId: string;
  readonly timestampMs: number;
  readonly visibleRowCount: number;
};

type GpuRetainedContentDiagnosticsRecorder = {
  readonly recordHitTest?: (
    sample: GpuRetainedContentHitTestDiagnostic,
  ) => void;
  readonly recordSceneBuild?: (
    sample: GpuRetainedContentSceneBuildDiagnostic,
  ) => void;
};

const RETAINED_CONTENT_DIAGNOSTICS_KEY =
  "__SETTA_GPU_RETAINED_CONTENT_DIAGNOSTICS__";

declare global {
  interface Window {
    __SETTA_GPU_RETAINED_CONTENT_DIAGNOSTICS__?:
      | GpuRetainedContentDiagnosticsRecorder
      | undefined;
  }
}

export function getGpuRetainedContentDiagnosticsRecorder(): GpuRetainedContentDiagnosticsRecorder | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window[RETAINED_CONTENT_DIAGNOSTICS_KEY] ?? null;
}

export function nowForGpuRetainedContentDiagnostics(): number {
  if (typeof performance === "undefined") {
    return Date.now();
  }
  return performance.now();
}
