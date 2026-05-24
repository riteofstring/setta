import { afterEach, describe, expect, it, vi } from "vitest";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import {
  createGpuFlowVisiblePublicationScheduler,
  type GpuFlowLiveProjectionSample,
  type GpuFlowProjectionTransactionKind,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import {
  runGpuFlowVisibleFrameCoordinator,
  type GpuFlowVisibleFramePublicationSample,
} from "./visibleFrameCoordinator";

describe("GPU Flow visible publication browser visual fault injection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("blocks before rendering candidates when browser visual proof withholding is injected", () => {
    vi.stubGlobal("window", {
      __SETTA_GPU_FLOW_BROWSER_VISUAL_FAULT_INJECTION__: {
        domControlReadiness: "blocked-awaiting-snapshot",
        withholdAllDomControls: true,
      },
    });
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const sample = liveProjectionSample({ id: 51, timestamp: 510 });
    const previousVisibleProjectionState = visibleProjectionState({
      kind: "content-publication",
      sample: liveProjectionSample({ id: 50, timestamp: 500 }),
    });
    const phases: string[] = [];

    const result = runGpuFlowVisibleFrameCoordinator({
      prepareContentPublicationFrame: ({ contentPublicationWorkPlan }) => {
        phases.push(`content:${contentPublicationWorkPlan.kind}`);
        return {
          blockedPublicationCandidate: null,
          rendered: false,
          visibleProjectionState: null,
        };
      },
      prepareMotionProjectionFrame: ({ motionProjectionWorkPlan }) => {
        phases.push(`motion:${motionProjectionWorkPlan.kind}`);
        return {
          frame: {
            blockedPublicationCandidate: null,
            rendered: false,
            visibleProjectionState: null,
          },
          kind: "not-rendered",
        };
      },
      publish: (transaction) => {
        phases.push(`publish:${transaction.outcome.kind}`);
      },
      sampleVisibleFramePublication: () =>
        visibleFramePublicationSample({
          previousVisibleProjectionState,
          rawReasons: ["texture-upload"],
          sample,
        }),
      scheduler,
    });

    expect(phases).toEqual(["motion:skip", "content:skip", "publish:blocked"]);
    expect(result.outcome.kind).toBe("blocked");
    if (result.outcome.kind !== "blocked") {
      throw new Error("Expected blocked publication outcome.");
    }
    expect(result.outcome.token.frozenFrameId).toBe(
      previousVisibleProjectionState.committedFrame.displayFrameId,
    );
    expect(result.outcome.token.blockedReasons).toEqual([
      {
        actorId: null,
        family: "browser-visual",
        reason: "snapshot-pending",
      },
    ]);
    expect(result.completeSchedulerFrame().completion.debt.maintenance).toBe(
      true,
    );
    expect(result.preparedFrame.transactionProof.blockedSource).toBe(
      "browser-visual-proof",
    );
    expect(result.preparedFrame.renderedVisibleFrame).toBe(false);
  });
});

function visibleProjectionState({
  kind,
  sample,
}: {
  readonly kind: GpuFlowProjectionTransactionKind;
  readonly sample: GpuFlowLiveProjectionSample;
}): GpuFlowVisibleProjectionState {
  const committedFrame = committedSurfaceFrame();
  return {
    committedFrame,
    debugState: {
      committedFrameId: committedFrame.displayFrameId,
      gestureOwner: "idle",
      heldPreviousDurationMs: 0,
      heldPreviousFrameCount: 0,
      heldPreviousOverBudget: false,
      heldPreviousReason: null,
      heldPreviousRequestedSampleId: null,
      lane: "content",
      projectionSampleId: sample.id,
      projectionTransactionId: `transaction:${kind}:${sample.id}`,
      transactionKind: kind,
    },
    heldPreviousProjection: null,
    sample,
    transaction: {
      committedFrameId: committedFrame.displayFrameId,
      id: `transaction:${kind}:${sample.id}`,
      kind,
      lane: "content",
      rawReasons: ["manual"],
      sample,
      startedAtMs: sample.timestamp,
    },
  };
}

function committedSurfaceFrame(): GpuFlowCommittedSurfaceFrame {
  return {
    displayFrameId: 7,
  } as unknown as GpuFlowCommittedSurfaceFrame;
}

type VisibleFramePublicationSampleInput = Partial<
  Omit<GpuFlowVisibleFramePublicationSample, "sample">
> & { readonly sample: GpuFlowLiveProjectionSample };

function visibleFramePublicationSample({
  hasCommittedContentFrame = true,
  previousVisibleProjectionState = null,
  rawReasons = ["manual"],
  runtimeViewportFrame = false,
  sample,
  timestamp = sample.timestamp,
  viewportInteractionActive = false,
}: VisibleFramePublicationSampleInput): GpuFlowVisibleFramePublicationSample {
  return {
    hasCommittedContentFrame,
    previousVisibleProjectionState,
    rawReasons,
    runtimeViewportFrame,
    sample,
    timestamp,
    viewportInteractionActive,
  };
}

function liveProjectionSample({
  id,
  timestamp,
}: {
  readonly id: number;
  readonly timestamp: number;
}): GpuFlowLiveProjectionSample {
  return {
    cssViewport: { height: 600, width: 800 },
    devicePixelRatio: 1,
    gestureOwner: "idle",
    id,
    retainedScrollDelta: new Map(),
    retainedScrollOffsets: new Map(),
    retainedScrollRevision: 0,
    retainedScrollVelocityCssPxPerMs: new Map(),
    timestamp,
    viewport: [0, 0, 1],
    viewportDelta: { x: 0, y: 0, zoom: 0 },
    viewportVelocityCssPxPerMs: { x: 0, y: 0, zoom: 0 },
  };
}
