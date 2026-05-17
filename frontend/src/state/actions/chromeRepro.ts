const SETTA_CHROME_REPRO_MESSAGE_SOURCE =
  "setta.chrome-repro-recorder/app-state";

declare global {
  interface Window {
    __SETTA_CHROME_REPRO_ACTIVE__?: boolean;
    __SETTA_CHROME_REPRO_VERBOSE_GPU_FLOW__?: boolean;
  }
}

export function postChromeReproEvent(
  kind: string,
  payload: Record<string, unknown>,
): void {
  if (!isChromeReproActive()) {
    return;
  }
  window.postMessage(
    {
      source: SETTA_CHROME_REPRO_MESSAGE_SOURCE,
      type: "app-state",
      kind,
      timestampMs: Date.now(),
      payload,
    },
    "*",
  );
}

export function postChromeReproFinishLineMarker(
  name: "finish-line-start" | "start" = "finish-line-start",
): void {
  postChromeReproEvent("gpu-flow-finish-line-marker", { name });
}

export function postMeasuredChromeReproEvent(
  kind: string,
  payload: Record<string, unknown>,
  options: {
    readonly buildDurationMs?: number | undefined;
  } = {},
): ChromeReproPayloadMetric | null {
  if (!isChromeReproActive()) {
    return null;
  }
  const measureStartedAtMs = nowChromeReproPerformanceMs();
  const payloadBytes = estimateChromeReproPayloadBytes(payload);
  const measureDurationMs = roundChromeReproMs(
    nowChromeReproPerformanceMs() - measureStartedAtMs,
  );
  const metric = {
    buildDurationMs:
      options.buildDurationMs === undefined
        ? null
        : roundChromeReproMs(options.buildDurationMs),
    measureDurationMs,
    payloadBytes,
  };
  recordChromeReproPayloadMetric(kind, metric);
  postChromeReproEvent(kind, payload);
  return metric;
}

export function isChromeReproActive(): boolean {
  return (
    typeof window !== "undefined" &&
    window.__SETTA_CHROME_REPRO_ACTIVE__ === true
  );
}

export function isChromeReproVerboseGpuFlowActive(): boolean {
  return (
    isChromeReproActive() &&
    typeof window !== "undefined" &&
    window.__SETTA_CHROME_REPRO_VERBOSE_GPU_FLOW__ === true
  );
}

export function postChromeReproPerfEvent(
  kind: string,
  payload: Record<string, unknown>,
): void {
  postChromeReproEvent(`perf-${kind}`, payload);
}

export function createChromeReproPerfTimer(
  kind: string,
  basePayload: Record<string, unknown> = {},
): ChromeReproPerfTimer {
  if (!isChromeReproActive()) {
    return NOOP_CHROME_REPRO_PERF_TIMER;
  }
  const startedAtMs = nowChromeReproPerformanceMs();
  let previousMarkMs = startedAtMs;
  const phases: ChromeReproPerfPhase[] = [];
  return {
    active: true,
    finish(payload: Record<string, unknown> = {}) {
      const finishedAtMs = nowChromeReproPerformanceMs();
      postChromeReproPerfEvent(kind, {
        ...basePayload,
        ...payload,
        durationMs: roundChromeReproMs(finishedAtMs - startedAtMs),
        phases,
      });
    },
    mark(label: string) {
      const nowMs = nowChromeReproPerformanceMs();
      phases.push({
        label,
        durationMs: roundChromeReproMs(nowMs - previousMarkMs),
        sinceStartMs: roundChromeReproMs(nowMs - startedAtMs),
      });
      previousMarkMs = nowMs;
    },
  };
}

export function nowChromeReproPerformanceMs(): number {
  if (typeof performance === "undefined") {
    return Date.now();
  }
  return performance.now();
}

export function roundChromeReproMs(value: number): number {
  return Math.round(value * 10) / 10;
}

type ChromeReproPerfPhase = {
  readonly durationMs: number;
  readonly label: string;
  readonly sinceStartMs: number;
};

type ChromeReproPerfTimer = {
  readonly active: boolean;
  finish(payload?: Record<string, unknown>): void;
  mark(label: string): void;
};

type ChromeReproPayloadMetric = {
  readonly buildDurationMs: number | null;
  readonly measureDurationMs: number;
  readonly payloadBytes: number | null;
};

type ChromeReproPayloadMetricAggregate = {
  buildDurationMsTotal: number;
  count: number;
  failedEstimateCount: number;
  maxBuildDurationMs: number;
  maxMeasureDurationMs: number;
  maxPayloadBytes: number;
  measureDurationMsTotal: number;
  payloadBytesTotal: number;
};

const NOOP_CHROME_REPRO_PERF_TIMER: ChromeReproPerfTimer = {
  active: false,
  finish: () => undefined,
  mark: () => undefined,
};

const chromeReproPayloadMetrics = new Map<
  string,
  ChromeReproPayloadMetricAggregate
>();
let chromeReproPayloadMetricFlushHandle: ReturnType<typeof setTimeout> | null =
  null;

function recordChromeReproPayloadMetric(
  kind: string,
  metric: ChromeReproPayloadMetric,
) {
  const aggregate = chromeReproPayloadMetrics.get(kind) ?? {
    buildDurationMsTotal: 0,
    count: 0,
    failedEstimateCount: 0,
    maxBuildDurationMs: 0,
    maxMeasureDurationMs: 0,
    maxPayloadBytes: 0,
    measureDurationMsTotal: 0,
    payloadBytesTotal: 0,
  };
  aggregate.count += 1;
  aggregate.measureDurationMsTotal += metric.measureDurationMs;
  aggregate.maxMeasureDurationMs = Math.max(
    aggregate.maxMeasureDurationMs,
    metric.measureDurationMs,
  );
  if (metric.buildDurationMs !== null) {
    aggregate.buildDurationMsTotal += metric.buildDurationMs;
    aggregate.maxBuildDurationMs = Math.max(
      aggregate.maxBuildDurationMs,
      metric.buildDurationMs,
    );
  }
  if (metric.payloadBytes === null) {
    aggregate.failedEstimateCount += 1;
  } else {
    aggregate.payloadBytesTotal += metric.payloadBytes;
    aggregate.maxPayloadBytes = Math.max(
      aggregate.maxPayloadBytes,
      metric.payloadBytes,
    );
  }
  chromeReproPayloadMetrics.set(kind, aggregate);
  scheduleChromeReproPayloadMetricFlush();
}

function scheduleChromeReproPayloadMetricFlush() {
  if (
    chromeReproPayloadMetricFlushHandle !== null ||
    typeof globalThis.setTimeout !== "function"
  ) {
    return;
  }
  chromeReproPayloadMetricFlushHandle = globalThis.setTimeout(() => {
    chromeReproPayloadMetricFlushHandle = null;
    flushChromeReproPayloadMetrics();
  }, 1000);
}

function flushChromeReproPayloadMetrics() {
  if (!isChromeReproActive() || chromeReproPayloadMetrics.size === 0) {
    chromeReproPayloadMetrics.clear();
    return;
  }
  const eventMetrics = [...chromeReproPayloadMetrics.entries()]
    .map(([kind, aggregate]) => ({
      buildDurationMsMax: roundChromeReproMs(aggregate.maxBuildDurationMs),
      buildDurationMsTotal: roundChromeReproMs(aggregate.buildDurationMsTotal),
      count: aggregate.count,
      failedEstimateCount: aggregate.failedEstimateCount,
      kind,
      measureDurationMsMax: roundChromeReproMs(aggregate.maxMeasureDurationMs),
      measureDurationMsTotal: roundChromeReproMs(
        aggregate.measureDurationMsTotal,
      ),
      payloadBytesMax: aggregate.maxPayloadBytes,
      payloadBytesTotal: aggregate.payloadBytesTotal,
    }))
    .sort(
      (left, right) =>
        right.payloadBytesTotal - left.payloadBytesTotal ||
        right.count - left.count ||
        left.kind.localeCompare(right.kind),
    );
  chromeReproPayloadMetrics.clear();
  postChromeReproEvent("chrome-repro-event-payload-summary", {
    eventMetrics,
  });
}

function estimateChromeReproPayloadBytes(
  payload: Record<string, unknown>,
): number | null {
  try {
    const serialized = JSON.stringify(payload);
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(serialized).byteLength;
    }
    return serialized.length;
  } catch {
    return null;
  }
}
