import type { GpuRect } from "../viewportMath";
import {
  assertSurfaceCoverageHasNoTrueHoles,
  surfaceCoverageIsComplete,
  type ProtectedSurfaceResourceHandle,
  type SurfaceCoverageProof,
  type SurfaceResourceHandle,
  type SurfaceResourceProtectionReason,
} from "./surfaceCoverage";
import {
  createSurfaceTransactionHoldDiagnostics,
  type SurfaceTransactionHoldDiagnostics,
} from "./surfaceDiagnostics";
import {
  surfaceGenerationKey,
  type SurfaceActiveDomIslandGeneration,
  type SurfaceGeneration,
  type SurfaceGenerationId,
  type SurfaceId,
  type SurfaceRendererBucket,
} from "./surfaceGeneration";
import type { SurfaceWorkRequest } from "./surfaceScheduler";

type SurfaceMotionFrame = {
  readonly activeIslands: readonly SurfaceActiveDomIslandGeneration[];
  readonly retainedScrollOffset: number | null;
  readonly viewport: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  };
};

export type SurfaceDrawCommand = {
  readonly coverageRect: GpuRect;
  readonly generationId: SurfaceGenerationId;
  readonly rendererBucket: SurfaceRendererBucket;
  readonly surfaceId: SurfaceId;
  readonly zIndex: number;
};

type SurfaceTransactionHitIndex = {
  readonly generationIds: readonly SurfaceGenerationId[];
  readonly id: string;
};

type SurfaceActiveDomIslandTransaction = {
  readonly islands: readonly SurfaceActiveDomIslandGeneration[];
  readonly mode: "attach" | "hold-previous" | "none";
};

type SurfaceDisplayTransactionDiagnostics = {
  readonly hold: SurfaceTransactionHoldDiagnostics | null;
  readonly publishedAtMs: number;
};

export type SurfaceDisplayTransaction = {
  readonly activeDomIslandTransaction: SurfaceActiveDomIslandTransaction;
  readonly coverageProof: SurfaceCoverageProof;
  readonly desiredSurfaceGenerations: readonly SurfaceGeneration[];
  readonly diagnostics: SurfaceDisplayTransactionDiagnostics;
  readonly drawCommands: readonly SurfaceDrawCommand[];
  readonly followUpWorkRequests: readonly SurfaceWorkRequest[];
  readonly hitIndex: SurfaceTransactionHitIndex;
  readonly id: string;
  readonly motionFrame: SurfaceMotionFrame;
  readonly protectedResourceHandles: readonly ProtectedSurfaceResourceHandle[];
  readonly rendererBuckets: readonly SurfaceRendererBucket[];
  readonly zOrder: readonly SurfaceId[];
};

type SurfaceTransactionBlockReason =
  | "active-dom-island-incoherent"
  | "coverage-missing"
  | "generation-incoherent"
  | "render-order-incoherent";

type SurfaceFirstCoverageReason =
  | "coverage-missing"
  | "not-yet-paint-ready"
  | "texture-missing";

type SurfaceTransactionOutcome =
  | {
      readonly kind: "publish-exact";
      readonly transaction: SurfaceDisplayTransaction;
    }
  | {
      readonly compatibilityProof: SurfaceCoverageProof;
      readonly kind: "publish-compatible";
      readonly transaction: SurfaceDisplayTransaction;
    }
  | {
      readonly diagnostics: SurfaceTransactionHoldDiagnostics;
      readonly kind: "hold-previous";
      readonly previousTransactionId: string;
      readonly reason: SurfaceTransactionBlockReason;
    }
  | {
      readonly kind: "block-cold-first-coverage";
      readonly reason: SurfaceFirstCoverageReason;
    }
  | {
      readonly kind: "publish-cold-placeholder";
      readonly reason: SurfaceFirstCoverageReason;
    };

export function createSurfaceDisplayTransaction(
  input: SurfaceDisplayTransaction,
): SurfaceDisplayTransaction {
  assertSurfaceGenerationIdsStable(input.desiredSurfaceGenerations);
  assertSurfaceDisplayTransactionPublishable(input);
  assertSurfaceTransactionRenderOrder(input);
  assertActiveDomIslandCoherent(input);
  return Object.freeze({
    ...input,
    activeDomIslandTransaction: Object.freeze({
      islands: Object.freeze([...input.activeDomIslandTransaction.islands]),
      mode: input.activeDomIslandTransaction.mode,
    }),
    desiredSurfaceGenerations: Object.freeze([
      ...input.desiredSurfaceGenerations,
    ]),
    diagnostics: Object.freeze({
      hold: input.diagnostics.hold,
      publishedAtMs: input.diagnostics.publishedAtMs,
    }),
    drawCommands: Object.freeze(
      input.drawCommands.map((command) =>
        Object.freeze({
          ...command,
          coverageRect: Object.freeze({ ...command.coverageRect }),
        }),
      ),
    ),
    followUpWorkRequests: Object.freeze([...input.followUpWorkRequests]),
    hitIndex: Object.freeze({
      generationIds: Object.freeze([...input.hitIndex.generationIds]),
      id: input.hitIndex.id,
    }),
    motionFrame: Object.freeze({
      activeIslands: Object.freeze([...input.motionFrame.activeIslands]),
      retainedScrollOffset: input.motionFrame.retainedScrollOffset,
      viewport: Object.freeze({ ...input.motionFrame.viewport }),
    }),
    protectedResourceHandles: Object.freeze([
      ...input.protectedResourceHandles,
    ]),
    rendererBuckets: Object.freeze([...input.rendererBuckets]),
    zOrder: Object.freeze([...input.zOrder]),
  });
}

export function resolveSurfaceTransaction({
  coldPlaceholderAllowed = false,
  desired,
  nowMs,
  previous,
}: {
  readonly coldPlaceholderAllowed?: boolean | undefined;
  readonly desired: SurfaceDisplayTransaction;
  readonly nowMs: number;
  readonly previous: SurfaceDisplayTransaction | null;
}): SurfaceTransactionOutcome {
  const blockReason = resolveSurfaceTransactionBlockReason(desired);
  if (blockReason) {
    if (previous) {
      return holdPreviousSurfaceTransaction({
        desired,
        nowMs,
        previous,
        reason: blockReason,
      });
    }
    return coldPlaceholderAllowed
      ? { kind: "publish-cold-placeholder", reason: "coverage-missing" }
      : { kind: "block-cold-first-coverage", reason: "coverage-missing" };
  }

  const transaction = createSurfaceDisplayTransaction(desired);
  return hasCompatibleSurfaceCoverage(transaction.coverageProof)
    ? {
        compatibilityProof: transaction.coverageProof,
        kind: "publish-compatible",
        transaction,
      }
    : { kind: "publish-exact", transaction };
}

export function selectPublishedSurfaceTransaction({
  outcome,
  previous,
}: {
  readonly outcome: SurfaceTransactionOutcome;
  readonly previous: SurfaceDisplayTransaction | null;
}): SurfaceDisplayTransaction | null {
  if (
    outcome.kind === "publish-exact" ||
    outcome.kind === "publish-compatible"
  ) {
    return outcome.transaction;
  }
  if (outcome.kind === "hold-previous") {
    return previous;
  }
  return null;
}

function assertSurfaceDisplayTransactionPublishable(
  transaction: Pick<SurfaceDisplayTransaction, "coverageProof">,
): void {
  assertSurfaceCoverageHasNoTrueHoles(transaction.coverageProof);
}

function assertSurfaceGenerationIdsStable(
  generations: readonly SurfaceGeneration[],
): void {
  const generationIdBySurfaceId = new Map<SurfaceId, SurfaceGenerationId>();
  for (const generation of generations) {
    const existing = generationIdBySurfaceId.get(generation.surfaceId);
    if (existing && existing !== generation.generationId) {
      throw new Error(
        `Surface "${generation.surfaceId}" has multiple generation ids in one transaction: "${existing}", "${generation.generationId}".`,
      );
    }
    generationIdBySurfaceId.set(generation.surfaceId, generation.generationId);
  }
}

function assertSurfaceTransactionRenderOrder(
  transaction: Pick<
    SurfaceDisplayTransaction,
    "drawCommands" | "rendererBuckets" | "zOrder"
  >,
): void {
  const zOrderRank = new Map(
    transaction.zOrder.map((surfaceId, index) => [surfaceId, index]),
  );
  const bucketRank = new Map(
    transaction.rendererBuckets.map((bucket, index) => [bucket, index]),
  );
  for (let index = 1; index < transaction.drawCommands.length; index += 1) {
    const previous = transaction.drawCommands[index - 1];
    const current = transaction.drawCommands[index];
    if (!previous || !current) {
      continue;
    }
    const bucketOrder = readSurfaceCommandBucketOrder({
      bucketRank,
      current,
      previous,
    });
    assertSurfaceCommandBucketOrder(bucketOrder);
    assertSurfaceCommandZOrder({
      ...bucketOrder,
      current,
      previous,
      zOrderRank,
    });
  }
}

function readSurfaceCommandBucketOrder({
  bucketRank,
  current,
  previous,
}: {
  readonly bucketRank: ReadonlyMap<string, number>;
  readonly current: SurfaceDrawCommand;
  readonly previous: SurfaceDrawCommand;
}): {
  readonly currentBucket: number;
  readonly previousBucket: number;
} {
  const previousBucket = bucketRank.get(previous.rendererBucket);
  const currentBucket = bucketRank.get(current.rendererBucket);
  if (previousBucket === undefined || currentBucket === undefined) {
    throw new Error(
      "Surface draw command references an unknown renderer bucket.",
    );
  }
  return { currentBucket, previousBucket };
}

function assertSurfaceCommandBucketOrder({
  currentBucket,
  previousBucket,
}: {
  readonly currentBucket: number;
  readonly previousBucket: number;
}) {
  if (previousBucket > currentBucket) {
    throw new Error(
      "Surface draw commands do not preserve renderer bucket order.",
    );
  }
}

function assertSurfaceCommandZOrder({
  current,
  currentBucket,
  previous,
  previousBucket,
  zOrderRank,
}: {
  readonly current: SurfaceDrawCommand;
  readonly currentBucket: number;
  readonly previous: SurfaceDrawCommand;
  readonly previousBucket: number;
  readonly zOrderRank: ReadonlyMap<SurfaceId, number>;
}) {
  if (previousBucket !== currentBucket) {
    return;
  }
  const previousZ = zOrderRank.get(previous.surfaceId);
  const currentZ = zOrderRank.get(current.surfaceId);
  if (previousZ === undefined || currentZ === undefined) {
    throw new Error(
      "Surface draw command references an unknown z-order surface.",
    );
  }
  if (previousZ > currentZ) {
    throw new Error("Surface draw commands do not preserve global z-order.");
  }
}

export function protectedSurfaceResourcesForTransaction({
  handles,
  reason,
}: {
  readonly handles: readonly SurfaceResourceHandle[];
  readonly reason: SurfaceResourceProtectionReason;
}): readonly ProtectedSurfaceResourceHandle[] {
  return Object.freeze(
    handles.map((handle) =>
      Object.freeze({
        ...handle,
        reason,
      }),
    ),
  );
}

function resolveSurfaceTransactionBlockReason(
  desired: SurfaceDisplayTransaction,
): SurfaceTransactionBlockReason | null {
  try {
    assertSurfaceGenerationIdsStable(desired.desiredSurfaceGenerations);
  } catch {
    return "generation-incoherent";
  }
  try {
    assertSurfaceTransactionRenderOrder(desired);
  } catch {
    return "render-order-incoherent";
  }
  try {
    assertActiveDomIslandCoherent(desired);
  } catch {
    return "active-dom-island-incoherent";
  }
  if (!surfaceCoverageIsComplete(desired.coverageProof)) {
    return "coverage-missing";
  }
  return null;
}

function holdPreviousSurfaceTransaction({
  desired,
  nowMs,
  previous,
  reason,
}: {
  readonly desired: SurfaceDisplayTransaction;
  readonly nowMs: number;
  readonly previous: SurfaceDisplayTransaction;
  readonly reason: SurfaceTransactionBlockReason;
}): SurfaceTransactionOutcome {
  const previousHold = previous.diagnostics.hold;
  return {
    diagnostics: createSurfaceTransactionHoldDiagnostics({
      blockingGenerationIds: desired.coverageProof.blockingGenerationIds,
      blockingSurfaceIds: desired.coverageProof.blockingSurfaceIds,
      desiredScrollOffset: desired.motionFrame.retainedScrollOffset,
      desiredViewport: desired.motionFrame.viewport,
      holdReason: reason,
      nowMs,
      previousHeldMotionFrameCount: previousHold?.heldMotionFrameCount ?? 0,
      previousHeldTransactionCount: previousHold?.heldTransactionCount ?? 0,
      previousHeldTransactionDurationMs:
        previousHold?.heldTransactionDurationMs ?? 0,
      previousPublishedAtMs: previous.diagnostics.publishedAtMs,
      publishedScrollOffset: previous.motionFrame.retainedScrollOffset,
      publishedViewport: previous.motionFrame.viewport,
    }),
    kind: "hold-previous",
    previousTransactionId: previous.id,
    reason,
  };
}

function hasCompatibleSurfaceCoverage(proof: SurfaceCoverageProof): boolean {
  return proof.compatibleCoverage.length > 0;
}

function assertActiveDomIslandCoherent(
  transaction: SurfaceDisplayTransaction,
): void {
  if (transaction.activeDomIslandTransaction.mode === "none") {
    return;
  }
  if (
    !transaction.coverageProof.compatibilityProof.compatibleForActiveDomIsland
  ) {
    throw new Error("Active DOM island coverage is not transaction-coherent.");
  }
  const generationKeys = new Set(
    transaction.desiredSurfaceGenerations.map(surfaceGenerationKey),
  );
  for (const island of transaction.activeDomIslandTransaction.islands) {
    if (
      !generationKeys.has(`${island.ownerSurfaceId}:${island.generationId}`)
    ) {
      throw new Error(
        `Active DOM island "${island.islandId}" does not match a published visual generation.`,
      );
    }
  }
}
