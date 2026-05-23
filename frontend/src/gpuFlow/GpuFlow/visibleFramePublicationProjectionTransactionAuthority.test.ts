import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type {
  GpuFlowHeldPreviousProjection,
  GpuFlowLiveProjectionSample,
  GpuFlowProjectionTransaction,
} from "../projectionRuntime";
import type { GpuFlowRetainedProjectionFrame } from "./flowProjectionFrame";
import {
  selectGpuFlowProjectionFrameTransactionFromPublicationDecision,
  type GpuFlowRetainedProjectionPublicationTransactionDecision,
} from "./visibleFramePublicationProjectionTransactionAuthority";

const PROJECTION_PLAN_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePublicationProjectionPlan.ts", import.meta.url),
);
const PROJECTION_TRANSACTION_AUTHORITY_MODULE_PATH = fileURLToPath(
  new URL(
    "./visibleFramePublicationProjectionTransactionAuthority.ts",
    import.meta.url,
  ),
);

describe("GPU Flow visible publication projection transaction authority", () => {
  it("selects requested, held, and blocked transactions from publication decisions", () => {
    const requestedFrame = projectionFrame({
      needsRetainedPageMaintenance: true,
    });
    const heldFrame = projectionFrame({
      needsRetainedPageMaintenance: false,
    });
    const requestedTransaction = projectionTransaction({
      id: "projection:12:1",
    });
    const heldTransaction = projectionTransaction({
      committedFrameId: 11,
      id: "projection:11:held",
      kind: "held-previous",
    });
    let resolvedHeldTransaction: GpuFlowProjectionTransaction | null = null;

    expect(
      selectGpuFlowProjectionFrameTransactionFromPublicationDecision({
        publicationDecision: publicationDecision({
          kind: "project-requested",
          transaction: requestedTransaction,
        }),
        requestedRetainedProjectionFrame: requestedFrame,
        resolveHeldRetainedProjectionFrame: () => {
          throw new Error("project-requested must not resolve held frame");
        },
      }),
    ).toEqual({
      blockedReason: null,
      heldPreviousProjection: null,
      retainedProjectionFrame: requestedFrame,
      transaction: requestedTransaction,
    });

    const heldPreviousProjection = heldProjection();
    expect(
      selectGpuFlowProjectionFrameTransactionFromPublicationDecision({
        publicationDecision: publicationDecision({
          heldPreviousProjection,
          kind: "held-previous",
          transaction: heldTransaction,
        }),
        requestedRetainedProjectionFrame: requestedFrame,
        resolveHeldRetainedProjectionFrame: ({ transaction }) => {
          resolvedHeldTransaction = transaction;
          return heldFrame;
        },
      }),
    ).toEqual({
      blockedReason: null,
      heldPreviousProjection,
      retainedProjectionFrame: {
        ...heldFrame,
        needsRetainedPageMaintenance: true,
      },
      transaction: heldTransaction,
    });
    expect(resolvedHeldTransaction).toBe(heldTransaction);

    expect(
      selectGpuFlowProjectionFrameTransactionFromPublicationDecision({
        publicationDecision: publicationDecision({
          blockedReason: "held-previous-budget-exceeded",
          heldPreviousProjection,
          kind: "blocked",
          transaction: requestedTransaction,
        }),
        requestedRetainedProjectionFrame: requestedFrame,
        resolveHeldRetainedProjectionFrame: () => {
          throw new Error("blocked must not resolve held frame");
        },
      }),
    ).toEqual({
      blockedReason: "held-previous-budget-exceeded",
      heldPreviousProjection,
      retainedProjectionFrame: requestedFrame,
      transaction: requestedTransaction,
    });
  });

  it("keeps retained projection transaction selection out of render planning", () => {
    const projectionPlanSource = readFileSync(
      PROJECTION_PLAN_MODULE_PATH,
      "utf8",
    );
    const transactionAuthoritySource = readFileSync(
      PROJECTION_TRANSACTION_AUTHORITY_MODULE_PATH,
      "utf8",
    );

    expect(projectionPlanSource).not.toContain(
      "GpuFlowRetainedProjectionPublicationTransactionDecision",
    );
    expect(projectionPlanSource).not.toContain(
      "selectGpuFlowProjectionFrameTransactionFromPublicationDecision",
    );
    expect(projectionPlanSource).not.toContain(
      "createGpuFlowProjectionFrameTransactionSelector",
    );
    expect(transactionAuthoritySource).toContain(
      "GpuFlowRetainedProjectionPublicationTransactionDecision",
    );
    expect(transactionAuthoritySource).toContain(
      "selectGpuFlowProjectionFrameTransactionFromPublicationDecision",
    );
    expect(transactionAuthoritySource).toContain(
      "createGpuFlowProjectionFrameTransactionSelector",
    );
  });
});

function publicationDecision({
  blockedReason,
  heldPreviousProjection,
  kind,
  transaction,
}: {
  readonly blockedReason?: string | undefined;
  readonly heldPreviousProjection?:
    | GpuFlowHeldPreviousProjection
    | null
    | undefined;
  readonly kind: GpuFlowRetainedProjectionPublicationTransactionDecision["kind"];
  readonly transaction: GpuFlowProjectionTransaction;
}): GpuFlowRetainedProjectionPublicationTransactionDecision {
  if (kind === "project-requested") {
    return {
      blockedReason: null,
      heldPreviousProjection: null,
      kind,
      transaction,
    };
  }
  if (kind === "blocked") {
    return {
      blockedReason: blockedReason ?? "held-previous-budget-exceeded",
      heldPreviousProjection: heldPreviousProjection ?? heldProjection(),
      kind,
      transaction,
    };
  }
  return {
    blockedReason: null,
    heldPreviousProjection: heldPreviousProjection ?? heldProjection(),
    kind,
    transaction,
  };
}

function projectionFrame({
  needsRetainedPageMaintenance = false,
}: {
  readonly needsRetainedPageMaintenance?: boolean | undefined;
} = {}): GpuFlowRetainedProjectionFrame {
  return {
    flatSurfaces: [],
    missingCoverageSurfaceIds: new Set(),
    needsRetainedPageMaintenance,
  };
}

function heldProjection(): GpuFlowHeldPreviousProjection {
  return {
    activationMappingId: "activation:11:hit:11",
    canvasDrawStateId: "canvas:11",
    committedFrameId: 11,
    consecutiveFrameCount: 1,
    debugStateId: "projection:11:previous",
    domTransformBatchId: "dom-transform:11:sample-2",
    firstHeldAtMs: 16,
    heldAtMs: 32,
    heldDurationMs: 16,
    hitProjectionId: "hit:11",
    maxHeldPreviousFramesExceeded: false,
    maxHeldPreviousMsExceeded: false,
    previousTransactionId: "projection:11:previous",
    projectionSampleId: 2,
    reason: "retained-projection-coverage-missing",
    requestedProjectionSampleId: 2,
  };
}

function projectionTransaction({
  committedFrameId = 12,
  id,
  kind = "motion-projection",
}: {
  readonly committedFrameId?: number | undefined;
  readonly id: string;
  readonly kind?: GpuFlowProjectionTransaction["kind"] | undefined;
}): GpuFlowProjectionTransaction {
  return {
    committedFrameId,
    id,
    kind,
    lane: "motion",
    rawReasons: ["retained-scroll"],
    sample: liveProjectionSample(),
    startedAtMs: 16,
  };
}

function liveProjectionSample(): GpuFlowLiveProjectionSample {
  return {
    cssViewport: { height: 600, width: 800 },
    devicePixelRatio: 1,
    gestureOwner: "idle",
    id: 2,
    retainedScrollDelta: new Map(),
    retainedScrollOffsets: new Map(),
    retainedScrollRevision: 0,
    retainedScrollVelocityCssPxPerMs: new Map(),
    timestamp: 32,
    viewport: [0, 0, 1],
    viewportDelta: { x: 0, y: 10, zoom: 0 },
    viewportVelocityCssPxPerMs: { x: 0, y: 0.5, zoom: 0 },
  };
}
