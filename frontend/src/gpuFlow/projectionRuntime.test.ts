/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";

import type { GpuFlowCommittedSurfaceFrame } from "./committedSurfaceFrame";
import {
  createGpuFlowHeldPreviousProjection,
  createGpuFlowLiveProjectionSampler,
  createGpuFlowProjectionHorizonObligations,
  createGpuFlowProjectionTransactionForCommittedFrameId,
  createGpuFlowVisibleProjectionState,
  createGpuFlowVisiblePublicationScheduler,
  getGpuFlowVisiblePublicationDebtReason,
  setProjectionDebugAttributes,
} from "./projectionRuntime";
import { createGpuRetainedContentRuntimeState } from "./retainedContentRuntimeState";

describe("GPU Flow projection runtime", () => {
  it("publishes motion before mixed content and maintenance debt", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const sample = liveSample(1);

    const mixed = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["retained-scroll", "paint", "texture-upload"],
      sample,
      timestamp: 1,
      viewportInteractionActive: true,
    });

    expect(mixed.lane).toBe("motion");
    expect(mixed.debt).toEqual({
      content: true,
      maintenance: true,
      motion: false,
    });
    expect(getGpuFlowVisiblePublicationDebtReason(mixed)).toBe("manual");

    scheduler.completeFrame(mixed);
    const catchup = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: false,
    });

    expect(catchup.lane).toBe("content");
    expect(catchup.debt.maintenance).toBe(true);
    scheduler.completeFrame(catchup);

    const maintenance = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["texture-upload"],
      sample: liveSample(3),
      timestamp: 3,
      viewportInteractionActive: false,
    });

    expect(maintenance.lane).toBe("maintenance");
  });

  it("uses content publication for cold motion without a committed frame", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const decision = scheduler.selectFrame({
      hasCommittedContentFrame: false,
      rawReasons: ["viewport"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });

    expect(decision.lane).toBe("content");
    expect(decision.debt.motion).toBe(true);
  });

  it("captures immutable live projection samples", () => {
    const sampler = createGpuFlowLiveProjectionSampler();
    const retainedState = createGpuRetainedContentRuntimeState();
    retainedState.scrollOffsets.set("surface-a", { x: 0, y: 12 });
    retainedState.scrollRevisions.set("surface-a", 1);

    const sample = sampler.capture({
      canvasSize: {
        cssHeight: 600,
        cssWidth: 800,
        devicePixelRatio: 2,
        pixelHeight: 1200,
        pixelWidth: 1600,
      },
      gestureOwner: "ownedByRetainedSectionScroll",
      retainedContentRuntimeState: retainedState,
      timestamp: 10,
      viewport: [1, 2, 1.5],
    });
    retainedState.scrollOffsets.set("surface-a", { x: 0, y: 48 });

    expect(sample.id).toBe(1);
    expect(sample.cssViewport).toEqual({ height: 600, width: 800 });
    expect(sample.retainedScrollOffsets.get("surface-a")).toEqual({
      x: 0,
      y: 12,
    });
    expect(sample.retainedScrollDelta.get("surface-a")).toEqual({
      x: 0,
      y: 0,
    });
    expect(sample.retainedScrollVelocityCssPxPerMs.get("surface-a")).toEqual({
      x: 0,
      y: 0,
    });
    expect(sample.viewport).toEqual({ x: 1, y: 2, zoom: 1.5 });
    expect(sample.viewportDelta).toEqual({ x: 0, y: 0, zoom: 0 });
  });

  it("records live projection sample motion deltas and velocities", () => {
    const sampler = createGpuFlowLiveProjectionSampler();
    const retainedState = createGpuRetainedContentRuntimeState();
    retainedState.scrollOffsets.set("surface-a", { x: 0, y: 12 });
    sampler.capture({
      canvasSize: null,
      gestureOwner: "idle",
      retainedContentRuntimeState: retainedState,
      timestamp: 10,
      viewport: { x: 1, y: 2, zoom: 1 },
    });
    retainedState.scrollOffsets.set("surface-a", { x: 4, y: 28 });

    const sample = sampler.capture({
      canvasSize: null,
      gestureOwner: "ownedByRetainedSectionScroll",
      retainedContentRuntimeState: retainedState,
      timestamp: 18,
      viewport: { x: 9, y: 6, zoom: 1.25 },
    });

    expect(sample.retainedScrollDelta.get("surface-a")).toEqual({
      x: 4,
      y: 16,
    });
    expect(sample.retainedScrollVelocityCssPxPerMs.get("surface-a")).toEqual({
      x: 0.5,
      y: 2,
    });
    expect(sample.viewportDelta).toEqual({ x: 8, y: 4, zoom: 0.25 });
    expect(sample.viewportVelocityCssPxPerMs).toEqual({
      x: 1,
      y: 0.5,
      zoom: 0.03125,
    });
  });

  it("binds transaction identity to the committed frame and projection sample", () => {
    const sample = liveSample(17);
    const transaction = createGpuFlowProjectionTransactionForCommittedFrameId({
      committedFrameId: 42,
      kind: "motion-projection",
      lane: "motion",
      rawReasons: ["retained-scroll", "paint"],
      sample,
    });

    expect(transaction.id).toBe("motion-projection:content-42:sample-17");
    expect(transaction.committedFrameId).toBe(42);
    expect(transaction.sample.id).toBe(17);
  });

  it("uses the content probe knob to prevent starvation during continuous motion", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler({
      knobs: {
        maxConsecutiveMotionFramesBeforeContentProbe: 2,
        maxContentInterleaveMs: 2,
        maxHeldPreviousFrames: 6,
        maxHeldPreviousMs: 120,
        maxMaintenanceInterleaveMs: 1,
        motionSettleWindowMs: 120,
      },
    });
    for (let index = 0; index < 2; index += 1) {
      const motion = scheduler.selectFrame({
        hasCommittedContentFrame: true,
        rawReasons: ["retained-scroll", "paint"],
        sample: liveSample(index + 1),
        timestamp: index + 1,
        viewportInteractionActive: true,
      });
      expect(motion.lane).toBe("motion");
      scheduler.completeFrame(motion);
    }

    const catchup = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["retained-scroll"],
      sample: liveSample(3),
      timestamp: 3,
      viewportInteractionActive: true,
    });

    expect(catchup.schedulerState).toBe("content-catchup");
    expect(catchup.lane).toBe("content");
    expect(catchup.debt.motion).toBe(true);
  });

  it("keeps projection horizon obligations concrete and lane-scoped", () => {
    const obligations = createGpuFlowProjectionHorizonObligations({
      committedFrame: committedFrameForObligations(),
      sample: liveSample(9),
    });

    expect(obligations.visible).toEqual([
      expect.objectContaining({
        acceptableCoverage: ["live"],
        actorId: "actor-live",
        blockedReason: null,
        deadlineMs: 9,
        kind: "visible",
        surfaceId: "surface-a",
      }),
      expect.objectContaining({
        acceptableCoverage: ["blocked-awaiting-browser-visual"],
        actorId: "actor-blocked",
        blockedReason: "snapshot-pending",
      }),
    ]);
    expect(obligations.nearFuture).toEqual([
      expect.objectContaining({
        acceptableCoverage: ["blocked-awaiting-live-host"],
        actorId: "actor-near-future-blocked",
        blockedReason: "live-dom-budget",
        deadlineMs: 129,
        kind: "near-future",
      }),
    ]);
  });

  it("exposes held-previous diagnostics on visible debug attributes", () => {
    const previousTransaction =
      createGpuFlowProjectionTransactionForCommittedFrameId({
        committedFrameId: 42,
        kind: "motion-projection",
        lane: "motion",
        rawReasons: ["retained-scroll"],
        sample: liveSample(4),
      });
    const previousState = createGpuFlowVisibleProjectionState({
      committedFrame: {
        coherence: {
          hitGenerationId: "hit-42",
        },
        displayFrameId: 42,
      } as GpuFlowCommittedSurfaceFrame,
      transaction: previousTransaction,
    });
    const heldTransaction =
      createGpuFlowProjectionTransactionForCommittedFrameId({
        committedFrameId: 42,
        kind: "held-previous",
        lane: "motion",
        rawReasons: ["retained-scroll", "paint"],
        sample: liveSample(4),
      });
    const heldPreviousProjection = createGpuFlowHeldPreviousProjection({
      heldTransaction,
      knobs: {
        maxConsecutiveMotionFramesBeforeContentProbe: 6,
        maxContentInterleaveMs: 2,
        maxHeldPreviousFrames: 0,
        maxHeldPreviousMs: 5,
        maxMaintenanceInterleaveMs: 1,
        motionSettleWindowMs: 120,
      },
      previousVisibleProjectionState: previousState,
      reason: "retained-projection-coverage-missing",
      requestedSample: liveSample(12),
    });
    const heldState = createGpuFlowVisibleProjectionState({
      committedFrame: previousState.committedFrame,
      heldPreviousProjection,
      transaction: heldTransaction,
    });
    const element = document.createElement("div");

    setProjectionDebugAttributes(element, heldState.debugState);

    expect(element.dataset.gpuFlowHeldPreviousFrameCount).toBe("1");
    expect(element.dataset.gpuFlowHeldPreviousDurationMs).toBe("0");
    expect(element.dataset.gpuFlowHeldPreviousOverBudget).toBe("true");
    expect(element.dataset.gpuFlowHeldPreviousReason).toBe(
      "retained-projection-coverage-missing",
    );
    expect(element.dataset.gpuFlowHeldPreviousRequestedSampleId).toBe("12");
    expect(element.dataset.gpuFlowProjectionTransactionKind).toBe(
      "held-previous",
    );
  });
});

function committedFrameForObligations(): GpuFlowCommittedSurfaceFrame {
  return {
    actorGenerations: [
      {
        actorId: "actor-live",
        ownerSurfaceId: "surface-a",
        projectionReadiness: "ready",
        textCoverageProof: {
          projectionCoverage: "exact-live-dom",
        },
      },
      {
        actorId: "actor-blocked",
        ownerSurfaceId: "surface-a",
        projectionReadiness: "not-required",
        textCoverageProof: {
          projectionCoverage: "blocked-awaiting-browser-visual",
          readinessReason: "snapshot-pending",
        },
      },
      {
        actorId: "actor-near-future-blocked",
        ownerSurfaceId: "surface-a",
        projectionReadiness: "not-required",
        textCoverageProof: {
          projectionCoverage: "blocked-awaiting-live-host",
          readinessReason: "live-dom-budget",
        },
      },
    ],
    projectionHorizon: {
      obligations: {
        activePinnedActorIds: [],
        maintenanceActorIds: [],
        nearFutureActorIds: ["actor-near-future-blocked"],
        visibleActorIds: ["actor-live", "actor-blocked"],
      },
    },
  } as unknown as GpuFlowCommittedSurfaceFrame;
}

function liveSample(id: number) {
  return {
    cssViewport: { height: 600, width: 800 },
    devicePixelRatio: 1,
    gestureOwner: "idle" as const,
    id,
    retainedScrollDelta: new Map(),
    retainedScrollOffsets: new Map(),
    retainedScrollRevision: 0,
    retainedScrollVelocityCssPxPerMs: new Map(),
    timestamp: id,
    viewport: { x: 0, y: 0, zoom: 1 },
    viewportDelta: { x: 0, y: 0, zoom: 0 },
    viewportVelocityCssPxPerMs: { x: 0, y: 0, zoom: 0 },
  };
}
