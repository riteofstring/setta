import { setTimeout as delay } from "node:timers/promises";

import { driverCallExpression } from "./cdp-client.mjs";
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
  const mode = await client.driver("overviewPresentationMode");
  if (mode === "normal") {
    return;
  }
  await clickOverviewButton(client, "Exit overview");
  await waitForDriverState(
    client,
    "overviewPresentationMode",
    {},
    (currentMode) => currentMode === "normal",
    timeoutMs,
  );
}

export async function clickOverviewButton(client, buttonLabel) {
  const result = await client.driver("overviewClickButton", { buttonLabel });
  if (!result.ok) {
    throw new Error(`overview toggle failed: ${JSON.stringify(result)}`);
  }
}

export async function measureOverviewTransition(
  client,
  { buttonLabel, expectedMode, name, sampleMs = overviewTransitionSampleMs },
) {
  const result = await client.driver("overviewMeasureTransition", {
    buttonLabel,
    includeMetricSamples: true,
    name,
    requireWorkspaceFrameMetrics: true,
    sampleMs,
  });
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
  const metrics = await client.driver("overviewFrameMetrics");
  if (!metrics) {
    throw new Error("workspace frame metrics hook is unavailable");
  }
  return metrics;
}

export async function readPaneHostState(client, query) {
  const state = await client.driver("overviewPaneHostState", query);
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
  return waitForDriverState(client, "overviewPaneHostState", query, predicate, timeoutMs);
}

export async function waitForWorkflowGraphSnapshot(
  client,
  surfaceId,
  predicate,
  timeoutMs = overviewPerformanceTimeoutMs,
) {
  await client.installDriver();
  return waitForState(
    client,
    driverCallExpression("workflowGraphDebugSnapshotReady", { includeVisual: false, surfaceId }),
    (result) => result.ready && predicate(result.snapshot),
    timeoutMs,
  ).then((result) => result.snapshot);
}

export async function readWorkflowGraphSnapshot(client, surfaceId) {
  const result = await client.driver("workflowGraphDebugSnapshotReady", {
    includeVisual: false,
    surfaceId,
  });
  if (!result.ready) {
    throw new Error(`workflow graph debug snapshot unavailable: ${JSON.stringify(result)}`);
  }
  return result.snapshot;
}

export async function waitForFrameMetrics(
  client,
  predicate,
  timeoutMs = overviewPerformanceTimeoutMs,
) {
  return waitForDriverState(client, "overviewFrameMetrics", {}, predicate, timeoutMs);
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

async function waitForDriverState(client, method, args, predicate, timeoutMs) {
  await client.installDriver();
  return waitForState(client, driverCallExpression(method, args), predicate, timeoutMs);
}
