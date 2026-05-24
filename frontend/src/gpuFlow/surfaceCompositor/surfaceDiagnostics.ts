export type SurfaceTransactionHoldDiagnostics = {
  readonly heldTransactionCount: number;
  readonly heldTransactionDurationMs: number;
  readonly heldMotionFrameCount: number;
  readonly maxHeldMotionAgeMs: number;
  readonly desiredScrollOffset: number | null;
  readonly presentedScrollOffset: number | null;
  readonly desiredViewport: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  };
  readonly presentedViewport: {
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
  previousPresentedAtMs,
  presentedScrollOffset,
  presentedViewport,
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
  readonly previousPresentedAtMs: number;
  readonly presentedScrollOffset: number | null;
  readonly presentedViewport: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  };
}): SurfaceTransactionHoldDiagnostics {
  const heldDurationMs = Math.max(0, nowMs - previousPresentedAtMs);
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
    presentedScrollOffset,
    presentedViewport: Object.freeze({ ...presentedViewport }),
  });
}
