import { describe, expect, it } from "vitest";

import {
  createGpuFlowCommittedSurfacePresentationProof,
  type GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import type { GpuFlowLiveProjectionSample } from "../projectionRuntime";
import {
  createGpuFlowVisibleFrameRequestCoordinator,
  type GpuFlowVisiblePublicationDecision,
} from "./visibleFrameScheduling";
import { createGpuFlowVisibleFrameCommitPublicationTokenForTest } from "./visibleFrameTestUtils";

describe("GPU Flow retained scroll scheduling", () => {
  it("keeps retained scroll sample interaction ahead of explicit content repair", () => {
    const scheduler = createGpuFlowVisibleFrameRequestCoordinator();

    const content = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(content.lane).toBe("content");
    completeCompatiblePreviousCommittedFrame(scheduler, content);

    for (let index = 0; index < 6; index += 1) {
      const motion = scheduler.selectFrame({
        hasCommittedContentFrame: true,
        rawReasons: ["viewport"],
        sample: liveSample(2 + index),
        timestamp: 2 + index,
        viewportInteractionActive: true,
      });
      expect(motion.schedulerState).toBe("motion-active");
      expect(motion.lane).toBe("motion");
      completeCommittedFrame(scheduler, motion);
    }

    const retainedScroll = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["viewport", "manual"],
      sample: liveSample(8, {
        gestureOwner: "ownedByRetainedSectionScroll",
      }),
      timestamp: 8,
      viewportInteractionActive: false,
    });
    expect(retainedScroll.schedulerState).toBe("motion-active");
    expect(retainedScroll.lane).toBe("motion");
  });

  it("does not probe queued content debt during retained scroll motion", () => {
    const scheduler = createGpuFlowVisibleFrameRequestCoordinator();

    const content = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(content.lane).toBe("content");
    completeCompatiblePreviousCommittedFrame(scheduler, content);

    for (let index = 0; index < 6; index += 1) {
      const motion = scheduler.selectFrame({
        hasCommittedContentFrame: true,
        rawReasons: ["retained-scroll", "viewport"],
        sample: liveSample(2 + index, {
          gestureOwner: "ownedByRetainedSectionScroll",
        }),
        timestamp: 2 + index,
        viewportInteractionActive: false,
      });
      expect(motion.schedulerState).toBe("motion-active");
      expect(motion.lane).toBe("motion");
      completeCommittedFrame(scheduler, motion);
    }

    const retainedScroll = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["retained-scroll", "viewport", "manual"],
      sample: liveSample(8, {
        gestureOwner: "ownedByRetainedSectionScroll",
      }),
      timestamp: 8,
      viewportInteractionActive: false,
    });
    expect(retainedScroll.schedulerState).toBe("motion-active");
    expect(retainedScroll.lane).toBe("motion");
  });

  it("defers noncritical content catchup after retained scroll motion settles", () => {
    const scheduler = createGpuFlowVisibleFrameRequestCoordinator();

    const content = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(content.lane).toBe("content");
    completeCompatiblePreviousCommittedFrame(scheduler, content);

    const retainedScroll = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["retained-scroll"],
      sample: liveSample(10, {
        gestureOwner: "ownedByRetainedSectionScroll",
      }),
      timestamp: 10,
      viewportInteractionActive: false,
    });
    expect(retainedScroll.lane).toBe("motion");
    completeCommittedFrame(scheduler, retainedScroll);

    const postScrollManual = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(100),
      timestamp: 100,
      viewportInteractionActive: false,
    });
    expect(postScrollManual.schedulerState).toBe("motion-settling");
    expect(postScrollManual.lane).toBe("idle");
    expect(postScrollManual.debt).toEqual({
      content: true,
      maintenance: false,
      motion: false,
    });

    const postScrollPaint = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["paint"],
      sample: liveSample(500),
      timestamp: 500,
      viewportInteractionActive: false,
    });
    expect(postScrollPaint.schedulerState).toBe("maintenance-deferred");
    expect(postScrollPaint.lane).toBe("idle");
    expect(postScrollPaint.debt).toEqual({
      content: true,
      maintenance: true,
      motion: false,
    });

    const criticalContent = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["dom-control-activation"],
      sample: liveSample(600),
      timestamp: 600,
      viewportInteractionActive: false,
    });
    expect(criticalContent.schedulerState).toBe("content-catchup");
    expect(criticalContent.lane).toBe("content");

    const settledContent = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(1_600),
      timestamp: 1_600,
      viewportInteractionActive: false,
    });
    expect(settledContent.schedulerState).toBe("content-catchup");
    expect(settledContent.lane).toBe("content");
  });

  it("refreshes retained scroll content cooldown before selecting scroll pulse frames", () => {
    const scheduler = createGpuFlowVisibleFrameRequestCoordinator();

    const content = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(content.lane).toBe("content");
    completeCompatiblePreviousCommittedFrame(scheduler, content);

    const retainedScroll = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["retained-scroll"],
      sample: liveSample(10, {
        gestureOwner: "ownedByRetainedSectionScroll",
      }),
      timestamp: 10,
      viewportInteractionActive: false,
    });
    expect(retainedScroll.lane).toBe("motion");
    completeCommittedFrame(scheduler, retainedScroll);

    const deferredManual = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(100),
      timestamp: 100,
      viewportInteractionActive: false,
    });
    expect(deferredManual.schedulerState).toBe("motion-settling");
    expect(deferredManual.lane).toBe("idle");

    const retainedScrollPulse = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["paint", "retained-scroll", "manual", "viewport"],
      sample: liveSample(250, {
        gestureOwner: "ownedByRetainedSectionScroll",
      }),
      timestamp: 250,
      viewportInteractionActive: false,
    });
    expect(retainedScrollPulse.schedulerState).toBe("motion-active");
    expect(retainedScrollPulse.lane).toBe("motion");
    completeCommittedFrame(scheduler, retainedScrollPulse);

    const manualViewportDuringCooldown = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual", "viewport"],
      sample: liveSample(360),
      timestamp: 360,
      viewportInteractionActive: true,
    });
    expect(manualViewportDuringCooldown.schedulerState).toBe("motion-active");
    expect(manualViewportDuringCooldown.lane).toBe("motion");
    expect(manualViewportDuringCooldown.debt).toEqual({
      content: true,
      maintenance: true,
      motion: false,
    });
  });

  it("publishes idle retained scroll catch-up content after scroll motion settles", () => {
    const scheduler = createGpuFlowVisibleFrameRequestCoordinator();

    const content = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(content.lane).toBe("content");
    completeCompatiblePreviousCommittedFrame(scheduler, content);

    const retainedScroll = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["retained-scroll"],
      sample: liveSample(10, {
        gestureOwner: "ownedByRetainedSectionScroll",
      }),
      timestamp: 10,
      viewportInteractionActive: false,
    });
    expect(retainedScroll.lane).toBe("motion");
    completeCommittedFrame(scheduler, retainedScroll);

    const idleCatchup = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["retained-scroll", "manual"],
      sample: liveSample(300),
      timestamp: 300,
      viewportInteractionActive: false,
    });
    expect(idleCatchup.schedulerState).toBe("content-catchup");
    expect(idleCatchup.lane).toBe("content");
    expect(idleCatchup.rawReasons).toEqual(["manual"]);
  });

  it("does not keep critical content priority after compatible-previous content commits", () => {
    const scheduler = createGpuFlowVisibleFrameRequestCoordinator();

    const activation = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: [
        "dom-control-activation",
        "retained-scroll",
        "texture-upload",
      ],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });
    expect(activation.schedulerState).toBe("motion-active");
    expect(activation.lane).toBe("content");
    completeCompatiblePreviousCommittedFrame(scheduler, activation);

    const motion = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["paint", "retained-scroll", "viewport"],
      sample: liveSample(2, {
        gestureOwner: "ownedByRetainedSectionScroll",
      }),
      timestamp: 2,
      viewportInteractionActive: false,
    });
    expect(motion.schedulerState).toBe("motion-active");
    expect(motion.lane).toBe("motion");
    expect(motion.debt).toEqual({
      content: true,
      maintenance: true,
      motion: false,
    });
  });
});

function completeCommittedFrame(
  scheduler: ReturnType<typeof createGpuFlowVisibleFrameRequestCoordinator>,
  decision: GpuFlowVisiblePublicationDecision,
) {
  return scheduler.completeFrame(decision, {
    debtProof: {
      content: decision.lane === "content",
      maintenance: decision.lane === "maintenance",
      motion: decision.lane === "motion",
    },
    kind: "commit",
    token: createGpuFlowVisibleFrameCommitPublicationTokenForTest({
      frame: committedFrameForSchedulerToken(decision),
      projectionSample: decision.sample,
    }),
  });
}

function completeCompatiblePreviousCommittedFrame(
  scheduler: ReturnType<typeof createGpuFlowVisibleFrameRequestCoordinator>,
  decision: GpuFlowVisiblePublicationDecision,
) {
  return scheduler.completeFrame(decision, {
    debtProof: {
      content: false,
      maintenance: false,
      motion: false,
    },
    kind: "commit",
    token: createGpuFlowVisibleFrameCommitPublicationTokenForTest({
      frame: committedFrameForSchedulerToken(decision),
      projectionSample: decision.sample,
    }),
  });
}

function liveSample(
  id: number,
  overrides: Partial<GpuFlowLiveProjectionSample> = {},
): GpuFlowLiveProjectionSample {
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
    ...overrides,
  };
}

function committedFrameForSchedulerToken(
  decision: GpuFlowVisiblePublicationDecision,
): GpuFlowCommittedSurfaceFrame {
  const displayFrameId = decision.sample.id;
  const coherence = {
    canvasRetainedFrameId: displayFrameId,
    clipChainRevision: "clip-chain",
    debugSnapshotFrameId: displayFrameId,
    domControlCommittedFrameId: displayFrameId,
    domIslandCommittedFrameId: displayFrameId,
    gpuNativeVisualCommittedFrameId: displayFrameId,
    hitGenerationId: "hit-generation",
    htmlTextureOverlayCommittedFrameId: displayFrameId,
    retainedScrollRevision: 0,
  };
  return {
    actorGenerations: [],
    coherence,
    diagnostics: {
      actorCount: 0,
      domControlActorCount: 0,
      domIslandActorCount: 0,
      gpuNativeVisualActorCount: 0,
      htmlTextureActorCount: 0,
      retainedPageActorCount: 0,
      textActorCount: 0,
      textActorExactCoverageCount: 0,
      transactionOutcome: "content-publication",
    },
    displayFrameId,
    presentationProof: createGpuFlowCommittedSurfacePresentationProof({
      coherence,
      displayFrameId,
    }),
    projectionHorizon: {
      textActorCoverage: {
        blockedAwaitingBrowserVisualActorIds: [],
        blockedAwaitingLiveHostActorIds: [],
        compatiblePreviousActorIds: [],
        exactLiveDomActorIds: [],
        exactSnapshotActorIds: [],
        trueHoleActorIds: [],
      },
    },
    publishability: {
      blockingActorIds: [],
      kind: "publishable",
    },
    surfaceTransaction: null,
    viewportSample: { x: 0, y: 0, zoom: 1 },
  } as unknown as GpuFlowCommittedSurfaceFrame;
}
