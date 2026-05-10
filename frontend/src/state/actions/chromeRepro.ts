const SETTA_CHROME_REPRO_MESSAGE_SOURCE =
  "setta.chrome-repro-recorder/app-state";

declare global {
  interface Window {
    __SETTA_CHROME_REPRO_ACTIVE__?: boolean;
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

export function isChromeReproActive(): boolean {
  return (
    typeof window !== "undefined" &&
    window.__SETTA_CHROME_REPRO_ACTIVE__ === true
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

const NOOP_CHROME_REPRO_PERF_TIMER: ChromeReproPerfTimer = {
  active: false,
  finish: () => undefined,
  mark: () => undefined,
};
