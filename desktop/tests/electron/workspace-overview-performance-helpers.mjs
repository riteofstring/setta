import { setTimeout as delay } from "node:timers/promises";

import { waitForState } from "./electron-cdp-harness.mjs";

export const viewport4k = {
  deviceScaleFactor: 1,
  height: 2160,
  mobile: false,
  width: 3840,
};

export const overviewPerformanceTimeoutMs = 60_000;
export const overviewTransitionSampleMs = 1400;
export const maxWorkflowGraphBackingStorePixels = 12_000_000;

const metricDeltaKeys = [
  "canvasBackingStorePixels",
  "canvasRendererResizeCount",
  "canvasTickerFramesWhileFrozen",
  "snapshotBitmapCaptureRequests",
  "snapshotCapturePromisesAwaitedByTransition",
  "snapshotCaptureRequests",
  "snapshotCaptureRequestsDuringTransition",
  "snapshotFreshTextureUses",
  "snapshotMissingTextureUses",
  "snapshotStaleTextureUses",
  "snapshotTextureCaptureRequests",
];
const monotonicMetricDeltaKeys = new Set([
  "snapshotBitmapCaptureRequests",
  "snapshotCapturePromisesAwaitedByTransition",
  "snapshotCaptureRequests",
  "snapshotCaptureRequestsDuringTransition",
  "snapshotFreshTextureUses",
  "snapshotMissingTextureUses",
  "snapshotStaleTextureUses",
  "snapshotTextureCaptureRequests",
]);

export async function configure4kViewport(client) {
  await client.call("Emulation.setDeviceMetricsOverride", viewport4k);
}

export async function ensureNormalMode(client, timeoutMs = overviewPerformanceTimeoutMs) {
  const mode = await client.evaluate(workspacePresentationModeExpression());
  if (mode === "normal") {
    return;
  }
  await clickOverviewButton(client, "Exit overview");
  await waitForState(
    client,
    workspacePresentationModeExpression(),
    (currentMode) => currentMode === "normal",
    timeoutMs,
  );
}

export async function clickOverviewButton(client, buttonLabel) {
  const result = await client.evaluate(`(() => {
    const button = document.querySelector(${JSON.stringify(`button[aria-label="${buttonLabel}"]`)});
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-overview-button", buttonLabel: ${JSON.stringify(
        buttonLabel,
      )} };
    }
    if (button.disabled) {
      return { ok: false, reason: "disabled-overview-button", buttonLabel: ${JSON.stringify(
        buttonLabel,
      )} };
    }
    button.click();
    return { ok: true };
  })()`);
  if (!result.ok) {
    throw new Error(`overview toggle failed: ${JSON.stringify(result)}`);
  }
}

export async function measureOverviewTransition(
  client,
  { buttonLabel, expectedMode, name, sampleMs = overviewTransitionSampleMs },
) {
  const result = await client.evaluate(`(async () => {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    const button = document.querySelector(${JSON.stringify(`button[aria-label="${buttonLabel}"]`)});
    if (!(area instanceof HTMLElement)) {
      return { ok: false, reason: "missing-workspace-area" };
    }
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-overview-button", buttonLabel: ${JSON.stringify(
        buttonLabel,
      )} };
    }
    const readMetrics = () => window.__settaWorkspaceReadFrameMetrics?.() ?? null;
    const metricsBefore = readMetrics();
    if (metricsBefore === null) {
      return { ok: false, reason: "missing-workspace-frame-metrics" };
    }
    const startedAt = performance.now();
    const longTasks = [];
    let observer = null;
    if (
      "PerformanceObserver" in window &&
      PerformanceObserver.supportedEntryTypes.includes("longtask")
    ) {
      observer = new PerformanceObserver((entries) => {
        for (const entry of entries.getEntries()) {
          longTasks.push({ duration: entry.duration, startTime: entry.startTime });
        }
      });
      observer.observe({ type: "longtask" });
    }
    const frames = [];
    const metricSamples = [];
    const runtimeStateSamples = [];
    const initialMode = area.dataset.presentationMode ?? "";
    let previousTimestamp = performance.now();
    let running = true;
    function recordFrame(timestamp) {
      if (!running) {
        return;
      }
      frames.push(timestamp - previousTimestamp);
      previousTimestamp = timestamp;
      metricSamples.push(readMetrics());
      runtimeStateSamples.push(runtimeStatesForPaneHosts());
      requestAnimationFrame(recordFrame);
    }
    requestAnimationFrame(recordFrame);
    button.click();
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    const metricsAfter80Ms = readMetrics();
    await new Promise((resolve) => window.setTimeout(resolve, ${Math.max(0, sampleMs - 80)}));
    running = false;
    observer?.disconnect();
    const metricsAfterTransition = readMetrics();
    const samples = frames.slice(1).filter((value) => Number.isFinite(value) && value >= 0);
    const sorted = [...samples].sort((left, right) => left - right);
    const quantile = (percentile) => {
      if (sorted.length === 0) {
        return 0;
      }
      const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * percentile));
      return sorted[index];
    };
    const sum = samples.reduce((total, value) => total + value, 0);
    const averageFrameDeltaMs = samples.length > 0 ? sum / samples.length : 0;
    const maxRuntimeStatesDuringTransition = runtimeStateSamples.reduce((maxStates, states) => {
      for (const [state, count] of Object.entries(states)) {
        maxStates[state] = Math.max(maxStates[state] ?? 0, count);
      }
      return maxStates;
    }, {});
    return {
      averageFps: averageFrameDeltaMs > 0 ? 1000 / averageFrameDeltaMs : 0,
      averageFrameDeltaMs,
      durationMs: performance.now() - startedAt,
      finalMode: area.dataset.presentationMode ?? "",
      frameCount: samples.length,
      initialMode,
      longTaskCount: longTasks.filter((entry) => entry.startTime >= startedAt).length,
      longTaskTotalMs: longTasks
        .filter((entry) => entry.startTime >= startedAt)
        .reduce((total, entry) => total + entry.duration, 0),
      maxFrameDeltaMs: sorted.at(-1) ?? 0,
      maxRuntimeStatesDuringTransition,
      metricSamples,
      metricsAfter80Ms,
      metricsAfterTransition,
      metricsBefore,
      name: ${JSON.stringify(name)},
      ok: true,
      p95FrameDeltaMs: quantile(0.95),
      p99FrameDeltaMs: quantile(0.99),
      runtimeStates: runtimeStatesForPaneHosts(),
      slowFramesOver16Ms: samples.filter((value) => value > 16.67).length,
      slowFramesOver32Ms: samples.filter((value) => value > 32).length,
      slowFramesOver50Ms: samples.filter((value) => value > 50).length,
    };
    function runtimeStatesForPaneHosts() {
      return Array.from(document.querySelectorAll(".workspace-pane-host")).reduce((states, host) => {
        const state =
          host instanceof HTMLElement ? host.dataset.runtimeState ?? "unknown" : "unknown";
        states[state] = (states[state] ?? 0) + 1;
        return states;
      }, {});
    }
  })()`);
  if (!result.ok) {
    throw new Error(`overview transition measurement failed: ${JSON.stringify(result)}`);
  }
  if (result.finalMode !== expectedMode) {
    throw new Error(
      `overview transition ended in ${result.finalMode}, want ${expectedMode}: ${JSON.stringify(
        result,
      )}`,
    );
  }
  return {
    ...result,
    metricDelta: metricDelta(result.metricsBefore, result.metricsAfterTransition),
  };
}

export async function readFrameMetrics(client) {
  const metrics = await client.evaluate(workspaceFrameMetricsExpression());
  if (!metrics) {
    throw new Error("workspace frame metrics hook is unavailable");
  }
  return metrics;
}

export async function readPaneHostState(client, query) {
  const state = await client.evaluate(paneHostStateExpression(query));
  if (!state.ok) {
    throw new Error(`workspace pane host unavailable: ${JSON.stringify({ query, state })}`);
  }
  return state;
}

export async function waitForPaneHostState(
  client,
  query,
  predicate,
  timeoutMs = overviewPerformanceTimeoutMs,
) {
  return waitForState(client, paneHostStateExpression(query), predicate, timeoutMs);
}

export async function waitForWorkflowGraphSnapshot(
  client,
  surfaceId,
  predicate,
  timeoutMs = overviewPerformanceTimeoutMs,
) {
  return waitForState(
    client,
    workflowGraphSnapshotExpression(surfaceId),
    (result) => result.ok && predicate(result.snapshot),
    timeoutMs,
  ).then((result) => result.snapshot);
}

export async function readWorkflowGraphSnapshot(client, surfaceId) {
  const result = await client.evaluate(workflowGraphSnapshotExpression(surfaceId));
  if (!result.ok) {
    throw new Error(`workflow graph debug snapshot unavailable: ${JSON.stringify(result)}`);
  }
  return result.snapshot;
}

export async function waitForFrameMetrics(
  client,
  predicate,
  timeoutMs = overviewPerformanceTimeoutMs,
) {
  return waitForState(client, workspaceFrameMetricsExpression(), predicate, timeoutMs);
}

export function assertNoTransitionCaptureBlocking(transition) {
  const { metricDelta } = transition;
  if (metricDelta.snapshotCaptureRequestsDuringTransition !== 0) {
    throw new Error(
      `${transition.name} started snapshot capture during transition: ${JSON.stringify(
        metricDelta,
      )}`,
    );
  }
  if (metricDelta.snapshotCapturePromisesAwaitedByTransition !== 0) {
    throw new Error(
      `${transition.name} awaited snapshot capture during transition: ${JSON.stringify(
        metricDelta,
      )}`,
    );
  }
}

export function assertSnapshotTextureUseRecorded(transition) {
  const { metricDelta } = transition;
  const textureUses =
    metricDelta.snapshotFreshTextureUses +
    metricDelta.snapshotStaleTextureUses +
    metricDelta.snapshotMissingTextureUses;
  if (textureUses <= 0) {
    throw new Error(`${transition.name} did not record snapshot texture use`);
  }
}

export function assertAspectRatioStable(before, after, label, tolerance = 0.015) {
  const diff = Math.abs(before.aspectRatio - after.aspectRatio);
  if (diff > tolerance) {
    throw new Error(
      `${label} aspect ratio changed by ${diff.toFixed(4)}: before=${before.aspectRatio.toFixed(
        4,
      )} after=${after.aspectRatio.toFixed(4)} beforeState=${JSON.stringify(
        before,
      )} afterState=${JSON.stringify(after)}`,
    );
  }
}

export function assertBackingStoreCap(snapshot, label) {
  const pixels = snapshot.canvas.width * snapshot.canvas.height;
  if (pixels > maxWorkflowGraphBackingStorePixels) {
    throw new Error(
      `${label} backing store ${pixels} exceeds ${maxWorkflowGraphBackingStorePixels}: ${JSON.stringify(
        snapshot.canvas,
      )}`,
    );
  }
}

export function metricDelta(before, after) {
  return Object.fromEntries(
    metricDeltaKeys.map((key) => {
      const delta = numericMetric(after, key) - numericMetric(before, key);
      return [key, monotonicMetricDeltaKeys.has(key) ? Math.max(0, delta) : delta];
    }),
  );
}

export function roundMetric(value) {
  return Math.round(value * 100) / 100;
}

export async function shortDelay(ms) {
  await delay(ms);
}

function numericMetric(metrics, key) {
  const value = metrics?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function workspacePresentationModeExpression() {
  return `(() => {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    return area instanceof HTMLElement ? area.dataset.presentationMode ?? "" : "";
  })()`;
}

function workspaceFrameMetricsExpression() {
  return `(() => window.__settaWorkspaceReadFrameMetrics?.() ?? null)()`;
}

function paneHostStateExpression({ paneId = null, surfaceId = null, surfaceKind = null }) {
  return `(() => {
    const hosts = Array.from(document.querySelectorAll('[data-testid="workspace-pane-host"]'));
    const host = hosts.find((candidate) => {
      if (!(candidate instanceof HTMLElement)) {
        return false;
      }
      if (${JSON.stringify(paneId)} !== null && candidate.dataset.paneId !== ${JSON.stringify(
        paneId,
      )}) {
        return false;
      }
      if (${JSON.stringify(surfaceId)} !== null && candidate.dataset.surfaceId !== ${JSON.stringify(
        surfaceId,
      )}) {
        return false;
      }
      if (${JSON.stringify(surfaceKind)} !== null && candidate.dataset.surfaceKind !== ${JSON.stringify(
        surfaceKind,
      )}) {
        return false;
      }
      return true;
    });
    if (!(host instanceof HTMLElement)) {
      return {
        hosts: hosts.map((candidate) =>
          candidate instanceof HTMLElement
            ? {
                focused: candidate.dataset.focused ?? "",
                maximized: candidate.dataset.maximized ?? "",
                paneId: candidate.dataset.paneId ?? "",
                runtimeState: candidate.dataset.runtimeState ?? "",
                surfaceFrozen: candidate.dataset.surfaceFrozen ?? "",
                surfaceId: candidate.dataset.surfaceId ?? "",
                surfaceKind: candidate.dataset.surfaceKind ?? "",
                visible: candidate.dataset.visible ?? "",
              }
            : {},
        ),
        ok: false,
        reason: "missing-host",
      };
    }
    const rect = host.getBoundingClientRect();
    const width = Number.parseFloat(host.style.width || "0") || rect.width;
    const height = Number.parseFloat(host.style.height || "0") || rect.height;
    return {
      aspectRatio: height > 0 ? width / height : 0,
      childSurfaceKinds: Array.from(host.children)
        .filter((child) => child instanceof HTMLElement)
        .map((child) => child.dataset.surfaceKind ?? child.getAttribute("data-react-surface-kind") ?? ""),
      focused: host.dataset.focused === "true",
      height,
      maximized: host.dataset.maximized === "true",
      moving: host.dataset.moving === "true",
      ok: true,
      paneId: host.dataset.paneId ?? "",
      presentationMode: host.dataset.presentationMode ?? "",
      rect: {
        height: rect.height,
        left: rect.left,
        top: rect.top,
        width: rect.width,
      },
      runtimeState: host.dataset.runtimeState ?? "",
      snapshotBitmapCount: host.querySelectorAll(".workspace-snapshot-bitmap").length,
      snapshotTextureCount: host.querySelectorAll(".workspace-snapshot-texture").length,
      surfaceFrozen: host.dataset.surfaceFrozen ?? "",
      surfaceId: host.dataset.surfaceId ?? "",
      surfaceKind: host.dataset.surfaceKind ?? "",
      surfaceVisible: host.dataset.surfaceVisible ?? "",
      visible: host.dataset.visible === "true",
      width,
    };
  })()`;
}

function workflowGraphSnapshotExpression(surfaceId) {
  return `(() => {
    const api = window.__settaWorkflowGraphDebug;
    if (!api) {
      return { ok: false, reason: "missing-debug-api" };
    }
    const surfaceIds = api.getSurfaceIds();
    if (${JSON.stringify(surfaceId)} !== null && !surfaceIds.includes(${JSON.stringify(
      surfaceId,
    )})) {
      return { ok: false, reason: "surface-not-registered", surfaceIds };
    }
    try {
      return {
        ok: true,
        snapshot: api.getSnapshot(${JSON.stringify(surfaceId)}, { includeVisual: false }),
        surfaceIds,
      };
    } catch (error) {
      return {
        message: error instanceof Error ? error.message : String(error),
        ok: false,
        reason: "snapshot-error",
        surfaceIds,
      };
    }
  })()`;
}
