import { describe, expect, it } from "vitest";

import {
  createGpuFlowVisibleFrameBlockedPublicationTokenForTest,
  createGpuFlowVisibleFrameHoldPreviousTokenForTest,
} from "./GpuFlow/visibleFrameTestUtils";
import type { GpuFlowBlockedPublicationToken } from "./GpuFlow/visibleFramePresentationProofs";
import {
  createGpuFlowVisiblePublicationScheduler,
  type GpuFlowVisiblePublicationDecision,
} from "./projectionRuntime";

describe("GPU Flow projection scheduler content retry throttling", () => {
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
    expect(immediateRetry.schedulerState).toBe("idle");
    expect(immediateRetry.lane).toBe("idle");
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
    expect(delayedRetry.debt.maintenance).toBe(true);
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
