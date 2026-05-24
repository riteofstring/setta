import { describe, expect, it } from "vitest";

import {
  createGpuFlowCommittedSurfacePresentationProof,
  type GpuFlowCommittedSurfaceFrame,
} from "./committedSurfaceFrame";
import type { GpuFlowBlockedPublicationToken } from "./GpuFlow/visibleFramePresentationProofs";
import {
  createGpuFlowVisibleFrameBlockedPublicationTokenForTest,
  createGpuFlowVisibleFrameCommitPublicationTokenForTest,
  createGpuFlowVisibleFrameHoldPreviousTokenForTest,
} from "./GpuFlow/visibleFrameTestUtils";
import {
  createGpuFlowVisiblePublicationScheduler,
  type GpuFlowLiveProjectionSample,
  type GpuFlowVisiblePublicationDecision,
} from "./projectionRuntime";

describe("GPU Flow projection scheduler content retry throttling", () => {
  it("defers motion retries after motion hits held-previous budget", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const motion = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["retained-scroll", "manual"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });
    expect(motion.lane).toBe("motion");
    completeBlockedFrame(scheduler, motion, [
      {
        actorId: null,
        family: "retained-projection",
        reason: "held-previous-budget-exceeded",
      },
    ]);

    const immediateRetry = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual", "texture-upload"],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: false,
    });
    expect(immediateRetry.schedulerState).toBe("content-catchup");
    expect(immediateRetry.lane).toBe("content");
    expect(immediateRetry.debt).toEqual({
      content: false,
      maintenance: true,
      motion: true,
    });

    const delayedRetry = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(250),
      timestamp: 250,
      viewportInteractionActive: false,
    });
    expect(delayedRetry.schedulerState).toBe("content-catchup");
    expect(delayedRetry.lane).toBe("content");
    expect(delayedRetry.debt.motion).toBe(true);
  });

  it("defers immediate content retries after held-previous budget blocks", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const motion = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["retained-scroll", "manual"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });
    expect(motion.lane).toBe("motion");
    completeBlockedFrame(scheduler, motion);

    const blockedContent = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: false,
    });
    expect(blockedContent.lane).toBe("content");
    completeBlockedFrame(scheduler, blockedContent, [
      {
        actorId: null,
        family: "visible-transaction",
        reason: "held-previous-budget-exceeded",
      },
    ]);

    const immediateRetry = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual", "texture-upload"],
      sample: liveSample(3),
      timestamp: 3,
      viewportInteractionActive: false,
    });
    expect(immediateRetry.schedulerState).toBe("motion-active");
    expect(immediateRetry.lane).toBe("motion");
    expect(immediateRetry.debt).toEqual({
      content: true,
      maintenance: true,
      motion: false,
    });

    const delayedRetry = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(250),
      timestamp: 250,
      viewportInteractionActive: false,
    });
    expect(delayedRetry.schedulerState).toBe("content-catchup");
    expect(delayedRetry.lane).toBe("content");
    expect(delayedRetry.debt.motion).toBe(true);
  });

  it("keeps motion ahead of ordinary manual content repair while a motion reason is current", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const motion = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["viewport"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });
    expect(motion.lane).toBe("motion");
    completeBlockedFrame(scheduler, motion);

    const repair = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual", "viewport"],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: false,
    });
    expect(repair.schedulerState).toBe("motion-active");
    expect(repair.lane).toBe("motion");
    expect(repair.debt).toEqual({
      content: true,
      maintenance: false,
      motion: false,
    });
  });

  it("keeps motion ahead of explicit content repair while motion maintenance is current", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const motion = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["viewport"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });
    expect(motion.lane).toBe("motion");
    completeBlockedFrame(scheduler, motion);

    const repair = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual", "viewport", "texture-upload"],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: false,
    });
    expect(repair.schedulerState).toBe("motion-active");
    expect(repair.lane).toBe("motion");
    expect(repair.debt).toEqual({
      content: true,
      maintenance: true,
      motion: false,
    });

    completeBlockedFrame(scheduler, repair);

    const settledRepair = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(3),
      timestamp: 3,
      viewportInteractionActive: false,
    });
    expect(settledRepair.schedulerState).toBe("content-catchup");
    expect(settledRepair.lane).toBe("content");
    expect(settledRepair.debt).toEqual({
      content: false,
      maintenance: true,
      motion: true,
    });
  });

  it("lets active DOM control publication preempt motion maintenance", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const motion = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["retained-scroll"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });
    expect(motion.lane).toBe("motion");
    completeBlockedFrame(scheduler, motion);

    const activation = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: [
        "dom-control-activation",
        "retained-scroll",
        "texture-upload",
      ],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: false,
    });
    expect(activation.schedulerState).toBe("motion-active");
    expect(activation.lane).toBe("content");
    expect(activation.debt).toEqual({
      content: false,
      maintenance: true,
      motion: true,
    });
  });

  it("lets retained projection coverage recover before retrying blocked active DOM control debt", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();

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
    completeBlockedFrame(scheduler, activation, [
      {
        actorId: null,
        family: "retained-projection",
        reason: "retained-projection-coverage-missing",
      },
    ]);

    const retry = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["retained-scroll", "texture-upload"],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: true,
    });
    expect(retry.schedulerState).toBe("motion-active");
    expect(retry.lane).toBe("motion");
    expect(retry.debt).toEqual({
      content: true,
      maintenance: true,
      motion: false,
    });

    completeCommittedFrame(scheduler, retry);

    const contentRetry = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(3),
      timestamp: 250,
      viewportInteractionActive: false,
    });
    expect(contentRetry.schedulerState).toBe("content-catchup");
    expect(contentRetry.lane).toBe("content");
  });

  it("probes explicit queued content repair during noninteractive viewport motion", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();

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
        viewportInteractionActive: false,
      });
      expect(motion.schedulerState).toBe("motion-active");
      expect(motion.lane).toBe("motion");
      completeCommittedFrame(scheduler, motion);
    }

    const contentProbe = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["viewport", "manual"],
      sample: liveSample(8),
      timestamp: 8,
      viewportInteractionActive: false,
    });
    expect(contentProbe.schedulerState).toBe("content-catchup");
    expect(contentProbe.lane).toBe("content");
  });

  it("does not probe queued content debt during pure viewport motion", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();

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
        viewportInteractionActive: false,
      });
      expect(motion.schedulerState).toBe("motion-active");
      expect(motion.lane).toBe("motion");
      completeCommittedFrame(scheduler, motion);
    }

    const viewport = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["viewport"],
      sample: liveSample(8),
      timestamp: 8,
      viewportInteractionActive: false,
    });
    expect(viewport.schedulerState).toBe("motion-active");
    expect(viewport.lane).toBe("motion");
  });

  it("keeps retained scroll sample interaction ahead of explicit content repair", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();

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
        viewportInteractionActive: false,
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
    const scheduler = createGpuFlowVisiblePublicationScheduler();

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
        sample: liveSample(2 + index),
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
      sample: liveSample(8),
      timestamp: 8,
      viewportInteractionActive: false,
    });
    expect(retainedScroll.schedulerState).toBe("motion-active");
    expect(retainedScroll.lane).toBe("motion");
  });

  it("defers noncritical content catchup after retained scroll motion settles", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();

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

  it("does not keep critical content priority after compatible-previous content commits", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();

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
      sample: liveSample(2),
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

  it("keeps motion ahead of retained native visual repair while motion maintenance is current", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const motion = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["retained-scroll"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });
    expect(motion.lane).toBe("motion");
    completeBlockedFrame(scheduler, motion);

    const nativeVisual = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: [
        "retained-native-visual",
        "retained-scroll",
        "texture-upload",
      ],
      sample: liveSample(2, {
        retainedScrollDelta: new Map([
          ["settings-section__gui:param-content:unpinned", { x: 0, y: 12 }],
        ]),
      }),
      timestamp: 2,
      viewportInteractionActive: false,
    });
    expect(nativeVisual.schedulerState).toBe("motion-active");
    expect(nativeVisual.lane).toBe("motion");
    expect(nativeVisual.debt).toEqual({
      content: true,
      maintenance: true,
      motion: false,
    });
  });

  it("keeps viewport frames ahead of retained native visual repair", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();

    const nativeVisual = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["retained-native-visual", "viewport", "texture-upload"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(nativeVisual.schedulerState).toBe("motion-active");
    expect(nativeVisual.lane).toBe("motion");
    expect(nativeVisual.debt).toEqual({
      content: true,
      maintenance: true,
      motion: false,
    });
  });

  it("lets retained native visuals publish content when no motion reason is current", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();

    const nativeVisual = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["retained-native-visual", "texture-upload"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(nativeVisual.schedulerState).toBe("content-catchup");
    expect(nativeVisual.lane).toBe("content");
    expect(nativeVisual.debt).toEqual({
      content: false,
      maintenance: true,
      motion: false,
    });
  });

  it("projects retained row hover visuals without content publication", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();

    const rowHover = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["retained-row-hover-visual", "texture-upload"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(rowHover.schedulerState).toBe("motion-active");
    expect(rowHover.lane).toBe("motion");
    expect(rowHover.debt).toEqual({
      content: false,
      maintenance: true,
      motion: false,
    });
  });

  it("keeps viewport frames ahead of retained row hover visuals", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();

    const rowHover = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: [
        "retained-row-hover-visual",
        "texture-upload",
        "viewport",
      ],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(rowHover.schedulerState).toBe("motion-active");
    expect(rowHover.lane).toBe("motion");
    expect(rowHover.debt).toEqual({
      content: false,
      maintenance: true,
      motion: false,
    });
  });

  it("lets retained row hover clear preempt viewport maintenance", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();

    const rowHoverClear = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["retained-row-hover-clear", "viewport"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(rowHoverClear.schedulerState).toBe("motion-active");
    expect(rowHoverClear.lane).toBe("motion");
    expect(rowHoverClear.debt).toEqual({
      content: false,
      maintenance: false,
      motion: false,
    });
  });

  it("defers immediate content retries after content holds previous", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const content = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(content.lane).toBe("content");
    completeHeldFrame(scheduler, content);

    const immediateRetry = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual", "texture-upload"],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: false,
    });
    expect(immediateRetry.schedulerState).toBe("maintenance-drain");
    expect(immediateRetry.lane).toBe("maintenance");
    expect(immediateRetry.debt).toEqual({
      content: true,
      maintenance: false,
      motion: false,
    });

    const delayedRetry = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(250),
      timestamp: 250,
      viewportInteractionActive: false,
    });
    expect(delayedRetry.schedulerState).toBe("content-catchup");
    expect(delayedRetry.lane).toBe("content");
    expect(delayedRetry.debt.maintenance).toBe(true);
  });

  it("defers ordinary manual content catchup immediately after content publishes", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const content = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(content.lane).toBe("content");
    completeCommittedFrame(scheduler, content);

    const immediateRetry = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: false,
    });
    expect(immediateRetry.schedulerState).toBe("maintenance-deferred");
    expect(immediateRetry.lane).toBe("idle");
    expect(immediateRetry.debt).toEqual({
      content: true,
      maintenance: false,
      motion: false,
    });

    const delayedRetry = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(250),
      timestamp: 250,
      viewportInteractionActive: false,
    });
    expect(delayedRetry.schedulerState).toBe("content-catchup");
    expect(delayedRetry.lane).toBe("content");
  });

  it("does not extend content retry cooldown after idle held-previous budget blocks", () => {
    const scheduler = createGpuFlowVisiblePublicationScheduler();
    const content = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(content.lane).toBe("content");
    completeHeldFrame(scheduler, content);

    const idle = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: false,
    });
    expect(idle.schedulerState).toBe("idle");
    expect(idle.lane).toBe("idle");
    completeBlockedFrame(scheduler, idle, [
      {
        actorId: null,
        family: "visible-transaction",
        reason: "held-previous-budget-exceeded",
      },
    ]);

    const delayedRetry = scheduler.selectFrame({
      hasCommittedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(250),
      timestamp: 250,
      viewportInteractionActive: false,
    });
    expect(delayedRetry.schedulerState).toBe("content-catchup");
    expect(delayedRetry.lane).toBe("content");
  });
});

function completeBlockedFrame(
  scheduler: ReturnType<typeof createGpuFlowVisiblePublicationScheduler>,
  decision: GpuFlowVisiblePublicationDecision,
  blockedReasons: GpuFlowBlockedPublicationToken["blockedReasons"] = [
    { actorId: null, family: "visible-transaction", reason: "blocked" },
  ],
) {
  return scheduler.recordUncommittedFrame(decision, {
    kind: "blocked",
    token: createGpuFlowVisibleFrameBlockedPublicationTokenForTest({
      blockedReasons,
      frozenFrameId: 41,
      projectionSample: decision.sample,
    }),
  });
}

function completeCommittedFrame(
  scheduler: ReturnType<typeof createGpuFlowVisiblePublicationScheduler>,
  decision: GpuFlowVisiblePublicationDecision,
) {
  return scheduler.completeFrame(decision, {
    debtProof: createDebtProofForSelectedLane(decision),
    kind: "commit",
    token: createGpuFlowVisibleFrameCommitPublicationTokenForTest({
      frame: committedFrameForSchedulerToken(decision),
      projectionSample: decision.sample,
    }),
  });
}

function completeCompatiblePreviousCommittedFrame(
  scheduler: ReturnType<typeof createGpuFlowVisiblePublicationScheduler>,
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

function completeHeldFrame(
  scheduler: ReturnType<typeof createGpuFlowVisiblePublicationScheduler>,
  decision: GpuFlowVisiblePublicationDecision,
) {
  return scheduler.recordUncommittedFrame(decision, {
    kind: "hold-previous",
    token: createGpuFlowVisibleFrameHoldPreviousTokenForTest({
      committedFrameId: 41,
      holdAgeFrames: 1,
      holdAgeMs: 0,
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

function createDebtProofForSelectedLane(
  decision: GpuFlowVisiblePublicationDecision,
) {
  return {
    content: decision.lane === "content",
    maintenance: decision.lane === "maintenance",
    motion: decision.lane === "motion",
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
