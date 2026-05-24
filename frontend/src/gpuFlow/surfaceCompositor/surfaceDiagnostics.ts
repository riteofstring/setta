export type SurfaceTransactionHoldDiagnostics = {
  readonly heldTransactionCount: number;
  readonly heldTransactionDurationMs: number;
  readonly heldMotionFrameCount: number;
  readonly maxHeldMotionAgeMs: number;
  readonly desiredScrollOffset: number | null;
  readonly publishedScrollOffset: number | null;
  readonly desiredViewport: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  };
  readonly publishedViewport: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  };
  readonly holdReason: string | null;
  readonly blockingSurfaceIds: readonly string[];
  readonly blockingGenerationIds: readonly string[];
};

export function createSurfaceTransactionHoldDiagnostics({
  blockingGenerationIds,
  blockingSurfaceIds,
  desiredScrollOffset,
  desiredViewport,
  holdReason,
  nowMs,
  previousHeldTransactionCount = 0,
  previousHeldTransactionDurationMs = 0,
  previousHeldMotionFrameCount = 0,
  previousPublishedAtMs,
  publishedScrollOffset,
  publishedViewport,
}: {
  readonly blockingGenerationIds: readonly string[];
  readonly blockingSurfaceIds: readonly string[];
  readonly desiredScrollOffset: number | null;
  readonly desiredViewport: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  };
  readonly holdReason: string | null;
  readonly nowMs: number;
  readonly previousHeldMotionFrameCount?: number | undefined;
  readonly previousHeldTransactionCount?: number | undefined;
  readonly previousHeldTransactionDurationMs?: number | undefined;
  readonly previousPublishedAtMs: number;
  readonly publishedScrollOffset: number | null;
  readonly publishedViewport: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  };
}): SurfaceTransactionHoldDiagnostics {
  const heldDurationMs = Math.max(0, nowMs - previousPublishedAtMs);
  return Object.freeze({
    blockingGenerationIds: Object.freeze([...blockingGenerationIds]),
    blockingSurfaceIds: Object.freeze([...blockingSurfaceIds]),
    desiredScrollOffset,
    desiredViewport: Object.freeze({ ...desiredViewport }),
    heldMotionFrameCount: previousHeldMotionFrameCount + 1,
    heldTransactionCount: previousHeldTransactionCount + 1,
    heldTransactionDurationMs:
      previousHeldTransactionDurationMs + heldDurationMs,
    holdReason,
    maxHeldMotionAgeMs: heldDurationMs,
    publishedScrollOffset,
    publishedViewport: Object.freeze({ ...publishedViewport }),
  });
}
