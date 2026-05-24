import { describe, expect, it } from "vitest";

import {
  createGpuFlowPreparedContentPresentationProof,
  type GpuFlowPreparedContentFrame,
} from "../preparedContentFrame";
import type { GpuFlowLiveProjectionSample } from "../projectionRuntime";
import {
  createGpuFlowVisibleFrameReducerRuntime,
  type GpuFlowVisibleFrameReducerDecision,
} from "./visibleFrameReducerRuntime";
import { createGpuFlowVisibleFramePresentationTokenForTest } from "./visibleFrameTestUtils";

describe("GPU Flow retained scroll scheduling", () => {
  it("keeps retained scroll sample interaction ahead of explicit content repair", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();

    const content = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(content.lane).toBe("content");
    completeCompatiblePreviousPreparedContentFrame(reducerRuntime, content);

    for (let index = 0; index < 6; index += 1) {
      const motion = reducerRuntime.selectFrame({
        hasPresentedContentFrame: true,
        rawReasons: ["viewport"],
        sample: liveSample(2 + index),
        timestamp: 2 + index,
        viewportInteractionActive: true,
      });
      expect(motion.reducerState).toBe("motion-active");
      expect(motion.lane).toBe("motion");
      completePreparedContentFrame(reducerRuntime, motion);
    }

    const retainedScroll = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["viewport", "manual"],
      sample: liveSample(8, {
        gestureOwner: "ownedByRetainedSectionScroll",
      }),
      timestamp: 8,
      viewportInteractionActive: false,
    });
    expect(retainedScroll.reducerState).toBe("motion-active");
    expect(retainedScroll.lane).toBe("motion");
  });

  it("does not probe queued content debt during retained scroll motion", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();

    const content = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(content.lane).toBe("content");
    completeCompatiblePreviousPreparedContentFrame(reducerRuntime, content);

    for (let index = 0; index < 6; index += 1) {
      const motion = reducerRuntime.selectFrame({
        hasPresentedContentFrame: true,
        rawReasons: ["retained-scroll", "viewport"],
        sample: liveSample(2 + index, {
          gestureOwner: "ownedByRetainedSectionScroll",
        }),
        timestamp: 2 + index,
        viewportInteractionActive: false,
      });
      expect(motion.reducerState).toBe("motion-active");
      expect(motion.lane).toBe("motion");
      completePreparedContentFrame(reducerRuntime, motion);
    }

    const retainedScroll = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll", "viewport", "manual"],
      sample: liveSample(8, {
        gestureOwner: "ownedByRetainedSectionScroll",
      }),
      timestamp: 8,
      viewportInteractionActive: false,
    });
    expect(retainedScroll.reducerState).toBe("motion-active");
    expect(retainedScroll.lane).toBe("motion");
  });

  it("defers noncritical content catchup after retained scroll motion settles", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();

    const content = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(content.lane).toBe("content");
    completeCompatiblePreviousPreparedContentFrame(reducerRuntime, content);

    const retainedScroll = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll"],
      sample: liveSample(10, {
        gestureOwner: "ownedByRetainedSectionScroll",
      }),
      timestamp: 10,
      viewportInteractionActive: false,
    });
    expect(retainedScroll.lane).toBe("motion");
    completePreparedContentFrame(reducerRuntime, retainedScroll);

    const postScrollManual = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(100),
      timestamp: 100,
      viewportInteractionActive: false,
    });
    expect(postScrollManual.reducerState).toBe("motion-settling");
    expect(postScrollManual.lane).toBe("idle");
    expect(postScrollManual.debt).toEqual({
      content: true,
      maintenance: false,
      motion: false,
    });

    const postScrollPaint = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["paint"],
      sample: liveSample(500),
      timestamp: 500,
      viewportInteractionActive: false,
    });
    expect(postScrollPaint.reducerState).toBe("maintenance-deferred");
    expect(postScrollPaint.lane).toBe("idle");
    expect(postScrollPaint.debt).toEqual({
      content: true,
      maintenance: true,
      motion: false,
    });

    const criticalContent = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["dom-control-activation"],
      sample: liveSample(600),
      timestamp: 600,
      viewportInteractionActive: false,
    });
    expect(criticalContent.reducerState).toBe("content-catchup");
    expect(criticalContent.lane).toBe("content");

    const settledContent = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(1_600),
      timestamp: 1_600,
      viewportInteractionActive: false,
    });
    expect(settledContent.reducerState).toBe("content-catchup");
    expect(settledContent.lane).toBe("content");
  });

  it("refreshes retained scroll content cooldown before selecting scroll pulse frames", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();

    const content = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(content.lane).toBe("content");
    completeCompatiblePreviousPreparedContentFrame(reducerRuntime, content);

    const retainedScroll = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll"],
      sample: liveSample(10, {
        gestureOwner: "ownedByRetainedSectionScroll",
      }),
      timestamp: 10,
      viewportInteractionActive: false,
    });
    expect(retainedScroll.lane).toBe("motion");
    completePreparedContentFrame(reducerRuntime, retainedScroll);

    const deferredManual = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(100),
      timestamp: 100,
      viewportInteractionActive: false,
    });
    expect(deferredManual.reducerState).toBe("motion-settling");
    expect(deferredManual.lane).toBe("idle");

    const retainedScrollPulse = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["paint", "retained-scroll", "manual", "viewport"],
      sample: liveSample(250, {
        gestureOwner: "ownedByRetainedSectionScroll",
      }),
      timestamp: 250,
      viewportInteractionActive: false,
    });
    expect(retainedScrollPulse.reducerState).toBe("motion-active");
    expect(retainedScrollPulse.lane).toBe("motion");
    completePreparedContentFrame(reducerRuntime, retainedScrollPulse);

    const manualViewportDuringCooldown = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual", "viewport"],
      sample: liveSample(360),
      timestamp: 360,
      viewportInteractionActive: true,
    });
    expect(manualViewportDuringCooldown.reducerState).toBe("motion-active");
    expect(manualViewportDuringCooldown.lane).toBe("motion");
    expect(manualViewportDuringCooldown.debt).toEqual({
      content: true,
      maintenance: true,
      motion: false,
    });
  });

  it("keeps idle retained scroll catch-up in the projection lane", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();

    const content = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(content.lane).toBe("content");
    completeCompatiblePreviousPreparedContentFrame(reducerRuntime, content);

    const retainedScroll = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll"],
      sample: liveSample(10, {
        gestureOwner: "ownedByRetainedSectionScroll",
      }),
      timestamp: 10,
      viewportInteractionActive: false,
    });
    expect(retainedScroll.lane).toBe("motion");
    completePreparedContentFrame(reducerRuntime, retainedScroll);

    const idleCatchup = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll", "manual"],
      sample: liveSample(300),
      timestamp: 300,
      viewportInteractionActive: false,
    });
    expect(idleCatchup.reducerState).toBe("motion-active");
    expect(idleCatchup.lane).toBe("motion");
    expect(idleCatchup.rawReasons).toEqual(["retained-scroll", "manual"]);
    completePreparedContentFrame(reducerRuntime, idleCatchup);

    const contentCatchup = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["texture-upload", "manual"],
      sample: liveSample(1_100),
      timestamp: 1_100,
      viewportInteractionActive: false,
    });
    expect(contentCatchup.reducerState).toBe("content-catchup");
    expect(contentCatchup.lane).toBe("content");
  });

  it("does not keep critical content priority after compatible-previous content commits", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();

    const activation = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: [
        "dom-control-activation",
        "retained-scroll",
        "texture-upload",
      ],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });
    expect(activation.reducerState).toBe("motion-active");
    expect(activation.lane).toBe("content");
    completeCompatiblePreviousPreparedContentFrame(reducerRuntime, activation);

    const motion = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["paint", "retained-scroll", "viewport"],
      sample: liveSample(2, {
        gestureOwner: "ownedByRetainedSectionScroll",
      }),
      timestamp: 2,
      viewportInteractionActive: false,
    });
    expect(motion.reducerState).toBe("motion-active");
    expect(motion.lane).toBe("motion");
    expect(motion.debt).toEqual({
      content: true,
      maintenance: true,
      motion: false,
    });
  });

  it("exposes safety, continuity, and quality debt age in reducer decisions", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();

    const activation = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["dom-control-activation", "texture-upload"],
      sample: liveSample(1),
      timestamp: 10,
      viewportInteractionActive: false,
    });
    expect(activation.classifiedDebt).toEqual({
      continuity: { active: true, ageFrames: 0, ageMs: 0 },
      quality: { active: true, ageFrames: 0, ageMs: 0 },
      safety: { active: true, ageFrames: 0, ageMs: 0 },
    });
    completeCompatiblePreviousPreparedContentFrame(reducerRuntime, activation);

    const retainedScroll = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll", "manual"],
      sample: liveSample(2, {
        gestureOwner: "ownedByRetainedSectionScroll",
      }),
      timestamp: 42,
      viewportInteractionActive: false,
    });
    expect(retainedScroll.classifiedDebt).toEqual({
      continuity: { active: true, ageFrames: 1, ageMs: 32 },
      quality: { active: true, ageFrames: 1, ageMs: 32 },
      safety: { active: false, ageFrames: 0, ageMs: 0 },
    });
  });
});

function completePreparedContentFrame(
  reducerRuntime: ReturnType<typeof createGpuFlowVisibleFrameReducerRuntime>,
  decision: GpuFlowVisibleFrameReducerDecision,
) {
  return reducerRuntime.completeFrame(decision, {
    debtProof: {
      content: decision.lane === "content",
      maintenance: decision.lane === "maintenance",
      motion: decision.lane === "motion",
    },
    kind: "present",
    token: createGpuFlowVisibleFramePresentationTokenForTest({
      frame: preparedContentFrameForReducerToken(decision),
      projectionSample: decision.sample,
    }),
  });
}

function completeCompatiblePreviousPreparedContentFrame(
  reducerRuntime: ReturnType<typeof createGpuFlowVisibleFrameReducerRuntime>,
  decision: GpuFlowVisibleFrameReducerDecision,
) {
  return reducerRuntime.completeFrame(decision, {
    debtProof: {
      content: false,
      maintenance: false,
      motion: false,
    },
    kind: "present",
    token: createGpuFlowVisibleFramePresentationTokenForTest({
      frame: preparedContentFrameForReducerToken(decision),
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

function preparedContentFrameForReducerToken(
  decision: GpuFlowVisibleFrameReducerDecision,
): GpuFlowPreparedContentFrame {
  const displayFrameId = decision.sample.id;
  const coherence = {
    canvasRetainedFrameId: displayFrameId,
    clipChainRevision: "clip-chain",
    debugSnapshotFrameId: displayFrameId,
    domControlPreparedFrameId: displayFrameId,
    domIslandPreparedFrameId: displayFrameId,
    gpuNativeVisualPreparedFrameId: displayFrameId,
    hitGenerationId: "hit-generation",
    htmlTextureOverlayPreparedFrameId: displayFrameId,
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
      transactionOutcome: "prepared-content",
    },
    displayFrameId,
    presentationProof: createGpuFlowPreparedContentPresentationProof({
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
    presentability: {
      blockingActorIds: [],
      kind: "presentable",
    },
    surfaceTransaction: null,
    viewportSample: { x: 0, y: 0, zoom: 1 },
  } as unknown as GpuFlowPreparedContentFrame;
}
