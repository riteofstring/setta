type GpuFlowPerformanceMeasureDetail = Readonly<
  Record<string, boolean | number | string | null | undefined>
>;

const GPU_FLOW_PERFORMANCE_MEASURE_PREFIX = "setta.gpuFlow";
let gpuFlowPerformanceMeasureSequence = 0;

export function startGpuFlowPerformanceMeasure(
  phase: string,
  detail: GpuFlowPerformanceMeasureDetail = {},
): () => number {
  const performanceApi = globalThis.performance;
  const startedAt = performanceApi?.now?.() ?? Date.now();
  if (
    !performanceApi ||
    typeof performanceApi.mark !== "function" ||
    typeof performanceApi.measure !== "function"
  ) {
    return () => (performanceApi?.now?.() ?? Date.now()) - startedAt;
  }

  const token = `${gpuFlowPerformanceMeasureSequence++}`;
  const startMark = `${GPU_FLOW_PERFORMANCE_MEASURE_PREFIX}.${phase}:start:${token}`;
  const endMark = `${GPU_FLOW_PERFORMANCE_MEASURE_PREFIX}.${phase}:end:${token}`;
  try {
    performanceApi.mark(startMark);
  } catch {
    return () => (performanceApi.now?.() ?? Date.now()) - startedAt;
  }

  return () => {
    const endedAt = performanceApi.now?.() ?? Date.now();
    try {
      performanceApi.mark(endMark);
      measureGpuFlowPerformanceEntry({
        detail,
        endMark,
        performanceApi,
        phase,
        startMark,
      });
    } finally {
      clearGpuFlowPerformanceMarks(performanceApi, startMark, endMark);
    }
    return endedAt - startedAt;
  };
}

export function measureGpuFlowPerformance<T>(
  phase: string,
  detail: GpuFlowPerformanceMeasureDetail,
  callback: () => T,
): T {
  const finishMeasure = startGpuFlowPerformanceMeasure(phase, detail);
  try {
    return callback();
  } finally {
    finishMeasure();
  }
}

export function startGpuFlowFramePerformanceMeasure(
  phase: string,
  frame: number,
  detail: GpuFlowPerformanceMeasureDetail = {},
): () => number {
  return startGpuFlowPerformanceMeasure(phase, { frame, ...detail });
}

function measureGpuFlowPerformanceEntry({
  detail,
  endMark,
  performanceApi,
  phase,
  startMark,
}: {
  readonly detail: GpuFlowPerformanceMeasureDetail;
  readonly endMark: string;
  readonly performanceApi: Performance;
  readonly phase: string;
  readonly startMark: string;
}) {
  const measureName = createGpuFlowPerformanceMeasureName(phase, detail);
  const measureDetail = createGpuFlowPerformanceMeasureDetail(phase, detail);
  try {
    performanceApi.measure(measureName, {
      detail: measureDetail,
      end: endMark,
      start: startMark,
    } as PerformanceMeasureOptions);
    return;
  } catch {
    try {
      performanceApi.measure(measureName, startMark, endMark);
    } catch {
      // Runtime attribution must not affect rendering when browser support varies.
    }
  }
}

function clearGpuFlowPerformanceMarks(
  performanceApi: Performance,
  startMark: string,
  endMark: string,
) {
  try {
    performanceApi.clearMarks(startMark);
    performanceApi.clearMarks(endMark);
  } catch {
    // Missing mark cleanup must not affect rendering.
  }
}

function createGpuFlowPerformanceMeasureName(
  phase: string,
  detail: GpuFlowPerformanceMeasureDetail,
): string {
  const fields = [`${GPU_FLOW_PERFORMANCE_MEASURE_PREFIX}.${phase}`];
  for (const [key, value] of Object.entries(detail)) {
    if (value === undefined || value === null) {
      continue;
    }
    fields.push(`${key}=${String(value)}`);
  }
  return fields.join(" ");
}

function createGpuFlowPerformanceMeasureDetail(
  phase: string,
  detail: GpuFlowPerformanceMeasureDetail,
): GpuFlowPerformanceMeasureDetail {
  return {
    phase,
    ...detail,
  };
}
