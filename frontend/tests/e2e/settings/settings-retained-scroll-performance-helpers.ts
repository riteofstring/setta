import type { readGpuFlowPerformanceSnapshot } from "../gpuFlowPerformanceProbe";
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
        remainingDirtyNodeCount: frame.remainingDirtyNodeCount,
        solidRoundedRectSurfaceCount: frame.solidRoundedRectSurfaceCount,
        uploadedNodeIds: frame.uploadedNodeIds.slice(0, 8),
      })),
      maxDirtyBacklog,
      retainedUploadSurfaceIds,
      retainedScrollbarSourceCount,
      rafCadence,
      scrollbarUploadCount,
      scrollbarVisualStats,
      scrollGesture,
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
