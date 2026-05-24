import { expect, type Page, type TestInfo } from "@playwright/test";

import { readGpuFlowPerformanceSnapshot } from "../gpuFlowPerformanceProbe";
import {
  percentile,
  type PageRafCadence,
} from "./settings-retained-frame-helpers";

export type ScrollTarget = {
  readonly point: { readonly x: number; readonly y: number };
  readonly screenshotClip: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  };
  readonly scrollbarScreenshotClip: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  };
  readonly surfaceId: string;
  readonly visibleCssArea: number;
};

export type ScrollFrameSample = {
  readonly averageIntervalMs: number;
  readonly frameCount: number;
  readonly p50IntervalMs: number;
  readonly p95IntervalMs: number;
  readonly slowFrameCount: number;
  readonly slowFrameRatio: number;
  readonly worstIntervalMs: number;
};

export type NativeWheelBurstResult = {
  readonly durationMs: number;
  readonly eventCount: number;
  readonly eventSpacingMs: readonly number[];
};

export type RetainedVisualStats = {
  readonly brightPixelRatio: number;
  readonly height: number;
  readonly textBandCount: number;
  readonly width: number;
};

export type RetainedScrollbarVisualStats = {
  readonly bottomY: number | null;
  readonly detectedPixelCount: number;
  readonly height: number;
  readonly longestRunHeight: number;
  readonly thumbContrast: number;
  readonly thumbHeight: number;
  readonly thumbTopY: number | null;
  readonly topY: number | null;
  readonly width: number;
};

export type RetainedScrollSignature = {
  readonly firstRowId: string | null;
  readonly firstRowY: number | null;
  readonly lastRowId: string | null;
  readonly rowCount: number;
};

type ScrollTargetDetails = {
  readonly screenshotClip: ScrollTarget["screenshotClip"];
  readonly surfaceId: string;
  readonly visibleCssArea: number;
};

type ScrollPerformanceSnapshot = Awaited<
  ReturnType<typeof readGpuFlowPerformanceSnapshot>
>;

type TimedGpuFlowPerformanceSnapshot =
  | {
      readonly kind: "snapshot";
      readonly snapshot: ScrollPerformanceSnapshot;
    }
  | {
      readonly kind: "timeout";
      readonly timeoutMs: number;
    };

export function resolveCappedScrollP95FrameBudget({
  baseBudgetMs,
  cadenceSlackMs,
  gesture,
  gestureSlackMs,
  rafCadence,
}: {
  readonly baseBudgetMs: number;
  readonly cadenceSlackMs: number;
  readonly gesture: NativeWheelBurstResult;
  readonly gestureSlackMs: number;
  readonly rafCadence: PageRafCadence;
}): number {
  const gestureP95Ms = percentile(
    [...gesture.eventSpacingMs].sort((left, right) => left - right),
    0.95,
  );
  return Math.max(
    baseBudgetMs,
    rafCadence.p95Ms + cadenceSlackMs,
    gestureP95Ms + gestureSlackMs,
  );
}

export function formatScrollPerformanceDetails({
  budgets,
  frameSample,
  fullTargetRetainedUploadCount,
  largestTargetUploadCssArea,
  maxDirtyBacklog,
  retainedUploadSurfaceIds,
  retainedScrollbarSourceCount,
  scrollbarUploadCount,
  scrollbarVisualStats,
  scrollSignatures,
  snapshot,
  target,
  rafCadence,
  scrollGesture,
  targetSurfaceId,
  unexpectedRetainedUploads,
  visualStats,
  visualScrollbarUploadCount,
  worstFrameIntervalMs,
}: {
  readonly budgets: {
    readonly scrollMaxFrameBudgetMs: number;
    readonly scrollMaxLongTaskMs: number;
    readonly scrollP95FrameBudgetMs: number;
  };
  readonly frameSample: ScrollFrameSample;
  readonly fullTargetRetainedUploadCount: number;
  readonly largestTargetUploadCssArea: number;
  readonly maxDirtyBacklog: number;
  readonly retainedUploadSurfaceIds: readonly string[];
  readonly retainedScrollbarSourceCount: number;
  readonly scrollbarUploadCount: number;
  readonly scrollbarVisualStats: readonly RetainedScrollbarVisualStats[];
  readonly scrollSignatures: {
    readonly after: RetainedScrollSignature;
    readonly before: RetainedScrollSignature;
  };
  readonly snapshot: ScrollPerformanceSnapshot;
  readonly target: ScrollTargetDetails;
  readonly rafCadence: { readonly beforeScroll: PageRafCadence };
  readonly scrollGesture: NativeWheelBurstResult;
  readonly targetSurfaceId: string;
  readonly unexpectedRetainedUploads: readonly string[];
  readonly visualStats: {
    readonly after: RetainedVisualStats;
    readonly before: RetainedVisualStats;
  };
  readonly visualScrollbarUploadCount: number;
  readonly worstFrameIntervalMs: number;
}): string {
  return JSON.stringify(
    {
      budgets,
      frameSample,
      fullTargetRetainedUploadCount,
      frameCount: snapshot.frameCount,
      largestTargetUploadCssArea,
      latestFrames: snapshot.nodeLayerFrames.slice(-8).map((frame) => ({
        frameReasons: frame.frameReasons,
        phaseDiagnostics: frame.phaseDiagnostics,
        projectionDiagnostics: frame.projectionDiagnostics,
        remainingDirtyNodeCount: frame.remainingDirtyNodeCount,
        retainedTexturePageRasterMs: frame.retainedTexturePageRasterMs,
        retainedTexturePageUploadMs: frame.retainedTexturePageUploadMs,
        timestampMs: frame.timestampMs,
        solidRoundedRectSurfaceCount: frame.solidRoundedRectSurfaceCount,
        uploadedNodeIds: frame.uploadedNodeIds.slice(0, 8),
      })),
      longTasks: snapshot.longTasks.slice(-12),
      maxDirtyBacklog,
      performanceMeasures: [...snapshot.performanceMeasures]
        .sort((left, right) => right.durationMs - left.durationMs)
        .slice(0, 20)
        .map((entry) => ({
          detail: entry.detail,
          durationMs: entry.durationMs,
          name: entry.name,
          startTimeMs: entry.startTimeMs,
        })),
      subphasePerformanceMeasures: snapshot.performanceMeasures
        .filter(
          (entry) => !entry.name.startsWith("setta.gpuFlow.surface-frame "),
        )
        .sort((left, right) => right.durationMs - left.durationMs)
        .slice(0, 20)
        .map((entry) => ({
          detail: entry.detail,
          durationMs: entry.durationMs,
          name: entry.name,
          startTimeMs: entry.startTimeMs,
        })),
      rafCallbacks: [...snapshot.rafCallbacks]
        .sort((left, right) => right.durationMs - left.durationMs)
        .slice(0, 12)
        .map((callback) => ({
          callbackName: callback.callbackName,
          durationMs: callback.durationMs,
          requestedAtMs: callback.requestedAtMs,
          stack: callback.stack.slice(0, 8),
          startedAtMs: callback.startedAtMs,
        })),
      retainedUploadSurfaceIds,
      retainedScrollbarSourceCount,
      rafCadence,
      scrollbarUploadCount,
      scrollbarVisualStats,
      scrollGesture,
      snapshotFrameIntervalsMs: snapshot.frameIntervalsMs.slice(-24),
      scrollSignatures,
      target,
      targetSurfaceId,
      textureUploadCount: snapshot.queueCalls.filter(
        (call) => call.method === "copyElementImageToTexture",
      ).length,
      unexpectedRetainedUploads,
      visualStats,
      visualScrollbarUploadCount,
      worstFrameIntervalMs,
    },
    null,
    2,
  );
}

export async function waitForGpuTextureUploadQuiet(
  page: Page,
  options: {
    readonly phase: string;
    readonly testInfo: TestInfo;
  } | null = null,
): Promise<void> {
  let previousUploadCount: number | null = null;
  const samples: unknown[] = [];
  try {
    await expect
      .poll(
        async () => {
          const snapshotResult = await readGpuFlowPerformanceSnapshotWithin(
            page,
            1_000,
          );
          if (snapshotResult.kind === "timeout") {
            samples.push({
              snapshotTimeoutMs: snapshotResult.timeoutMs,
              stable: false,
              timestampMs: Date.now(),
            });
            return false;
          }
          const { snapshot } = snapshotResult;
          const uploadCalls = snapshot.queueCalls.filter(
            (call) => call.method === "copyElementImageToTexture",
          );
          const currentUploadCount = uploadCalls.length;
          const stable = currentUploadCount === previousUploadCount;
          previousUploadCount = currentUploadCount;
          const latestFrame =
            snapshot.nodeLayerFrames[snapshot.nodeLayerFrames.length - 1] ??
            null;
          samples.push({
            latestFrame: latestFrame
              ? {
                  frameReasons: latestFrame.frameReasons,
                  lane: latestFrame.projectionDiagnostics.lane,
                  remainingDirtyNodeCount: latestFrame.remainingDirtyNodeCount,
                  retainedTexturePageTransactionOutcome:
                    latestFrame.retainedTexturePageTransactionOutcome,
                  retainedTexturePageUploadCount:
                    latestFrame.retainedTexturePageUploadCount,
                  uploadDiagnostics: latestFrame.uploadDiagnostics,
                }
              : null,
            recentUploads: uploadCalls.slice(-10).map((call) => ({
              sourceHeight: call.sourceHeight,
              sourceNodeId: call.sourceNodeId,
              sourceWidth: call.sourceWidth,
              timestampMs: call.timestampMs,
            })),
            stable,
            timestampMs: snapshot.timestampMs,
            uploadCount: currentUploadCount,
          });
          if (samples.length > 16) {
            samples.splice(0, samples.length - 16);
          }
          return stable;
        },
        {
          intervals: [200, 200, 200, 200, 200, 200, 200, 200],
          timeout: 12_000,
        },
      )
      .toBe(true);
  } catch (error) {
    const postTimeoutSnapshot = await readGpuFlowPerformanceSnapshotWithin(
      page,
      1_500,
    )
      .then((snapshotResult) => {
        if (snapshotResult.kind === "timeout") {
          return {
            error: `Timed out after ${snapshotResult.timeoutMs}ms while reading GPU flow performance snapshot.`,
          };
        }
        const { snapshot } = snapshotResult;
        return {
          latestFrames: snapshot.nodeLayerFrames.slice(-4).map((frame) => ({
            frameReasons: frame.frameReasons,
            lane: frame.projectionDiagnostics.lane,
            phaseDiagnostics: frame.phaseDiagnostics,
            remainingDirtyNodeCount: frame.remainingDirtyNodeCount,
            retainedTexturePageTransactionOutcome:
              frame.retainedTexturePageTransactionOutcome,
            retainedTexturePageUploadCount:
              frame.retainedTexturePageUploadCount,
            timestampMs: frame.timestampMs,
            uploadDiagnostics: frame.uploadDiagnostics,
          })),
          longTasks: snapshot.longTasks.slice(-8),
          queueCallCount: snapshot.queueCalls.length,
          recentUploads: snapshot.queueCalls
            .filter((call) => call.method === "copyElementImageToTexture")
            .slice(-12)
            .map((call) => ({
              sourceHeight: call.sourceHeight,
              sourceNodeId: call.sourceNodeId,
              sourceWidth: call.sourceWidth,
              timestampMs: call.timestampMs,
            })),
        };
      })
      .catch((snapshotError: unknown) => ({
        error:
          snapshotError instanceof Error
            ? snapshotError.message
            : String(snapshotError),
      }));
    const diagnostic = JSON.stringify(
      {
        phase: options?.phase ?? "texture-quiet",
        postTimeoutSnapshot,
        samples,
      },
      null,
      2,
    );
    await options?.testInfo.attach(`${options.phase}.json`, {
      body: diagnostic,
      contentType: "application/json",
    });
    throw new Error(
      `GPU texture uploads did not become quiet.\n${diagnostic}`,
      {
        cause: error,
      },
    );
  }
}

async function readGpuFlowPerformanceSnapshotWithin(
  page: Page,
  timeoutMs: number,
): Promise<TimedGpuFlowPerformanceSnapshot> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<TimedGpuFlowPerformanceSnapshot>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({ kind: "timeout", timeoutMs });
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      readGpuFlowPerformanceSnapshot(page).then((snapshot) => ({
        kind: "snapshot" as const,
        snapshot,
      })),
      timeout,
    ]);
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}
