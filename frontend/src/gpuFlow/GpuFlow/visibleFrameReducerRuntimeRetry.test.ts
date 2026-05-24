import { describe, expect, it } from "vitest";

import {
  createGpuFlowPreparedContentPresentationProof,
  type GpuFlowPreparedContentFrame,
} from "../preparedContentFrame";
import type { GpuFlowLiveProjectionSample } from "../projectionRuntime";
import type { GpuFlowBlockedPublicationToken } from "./visibleFramePresentationProofs";
import {
  createGpuFlowVisibleFrameReducerRuntime,
  type GpuFlowVisibleFrameReducerDecision,
} from "./visibleFrameReducerRuntime";
import {
  createGpuFlowVisibleFrameBlockedPublicationTokenForTest,
  createGpuFlowVisibleFrameHoldPreviousTokenForTest,
  createGpuFlowVisibleFramePresentationTokenForTest,
} from "./visibleFrameTestUtils";

describe("GPU Flow visible frame reducer runtime content retry throttling", () => {
  it("defers motion retries after motion hits held-previous budget", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const motion = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll", "manual"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });
    expect(motion.lane).toBe("motion");
    completeBlockedFrame(reducerRuntime, motion, [
      {
        actorId: null,
        family: "retained-projection",
        reason: "held-previous-budget-exceeded",
      },
    ]);

    const immediateRetry = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual", "texture-upload"],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: false,
    });
    expect(immediateRetry.reducerState).toBe("content-catchup");
    expect(immediateRetry.lane).toBe("content");
    expect(immediateRetry.debt).toEqual({
      content: false,
      maintenance: true,
      motion: true,
    });

    const delayedRetry = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(250),
      timestamp: 250,
      viewportInteractionActive: false,
    });
    expect(delayedRetry.reducerState).toBe("content-catchup");
    expect(delayedRetry.lane).toBe("content");
    expect(delayedRetry.debt.motion).toBe(true);
  });

  it("keeps current retained scroll motion ahead of motion retry backoff", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const motion = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll", "manual"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });
    expect(motion.lane).toBe("motion");
    completeBlockedFrame(reducerRuntime, motion, [
      {
        actorId: null,
        family: "retained-projection",
        reason: "held-previous-budget-exceeded",
      },
    ]);

    const retainedScroll = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll"],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: false,
    });
    expect(retainedScroll.reducerState).toBe("content-catchup");
    expect(retainedScroll.lane).toBe("motion");

    const nonMotionRepair = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual", "texture-upload"],
      sample: liveSample(3),
      timestamp: 3,
      viewportInteractionActive: false,
    });
    expect(nonMotionRepair.reducerState).toBe("content-catchup");
    expect(nonMotionRepair.lane).toBe("content");
  });

  it("keeps current retained scroll motion ahead of stale critical content debt", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const activation = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["dom-control-activation"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(activation.lane).toBe("content");
    completeBlockedFrame(reducerRuntime, activation);

    const retainedScroll = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll"],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: false,
    });
    expect(retainedScroll.reducerState).toBe("motion-active");
    expect(retainedScroll.lane).toBe("motion");
    expect(retainedScroll.debt).toEqual({
      content: true,
      maintenance: false,
      motion: false,
    });
  });

  it("keeps current viewport motion ahead of stale critical content debt", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const activation = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["dom-control-activation"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(activation.lane).toBe("content");
    completeBlockedFrame(reducerRuntime, activation);

    const viewport = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["viewport", "manual"],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: true,
    });
    expect(viewport.reducerState).toBe("motion-active");
    expect(viewport.lane).toBe("motion");
    expect(viewport.debt).toEqual({
      content: true,
      maintenance: false,
      motion: false,
    });
  });

  it("defers immediate content retries after held-previous budget blocks", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const motion = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll", "manual"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });
    expect(motion.lane).toBe("motion");
    completeBlockedFrame(reducerRuntime, motion);

    const blockedContent = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: false,
    });
    expect(blockedContent.lane).toBe("content");
    completeBlockedFrame(reducerRuntime, blockedContent, [
      {
        actorId: null,
        family: "visible-transaction",
        reason: "held-previous-budget-exceeded",
      },
    ]);

    const immediateRetry = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual", "texture-upload"],
      sample: liveSample(3),
      timestamp: 3,
      viewportInteractionActive: false,
    });
    expect(immediateRetry.reducerState).toBe("maintenance-drain");
    expect(immediateRetry.lane).toBe("maintenance");
    expect(immediateRetry.debt).toEqual({
      content: true,
      maintenance: false,
      motion: true,
    });

    const delayedRetry = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(250),
      timestamp: 250,
      viewportInteractionActive: false,
    });
    expect(delayedRetry.reducerState).toBe("content-catchup");
    expect(delayedRetry.lane).toBe("content");
    expect(delayedRetry.debt.motion).toBe(true);
  });

  it("keeps motion ahead of ordinary manual content repair while a motion reason is current", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const motion = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["viewport"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });
    expect(motion.lane).toBe("motion");
    completeBlockedFrame(reducerRuntime, motion);

    const repair = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual", "viewport"],
      sample: liveSample(250),
      timestamp: 250,
      viewportInteractionActive: true,
    });
    expect(repair.reducerState).toBe("motion-active");
    expect(repair.lane).toBe("motion");
    expect(repair.debt).toEqual({
      content: true,
      maintenance: false,
      motion: false,
    });
  });

  it("keeps motion ahead of explicit content repair while motion maintenance is current", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const motion = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["viewport"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });
    expect(motion.lane).toBe("motion");
    completeBlockedFrame(reducerRuntime, motion);

    const repair = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual", "viewport", "texture-upload"],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: true,
    });
    expect(repair.reducerState).toBe("motion-active");
    expect(repair.lane).toBe("motion");
    expect(repair.debt).toEqual({
      content: true,
      maintenance: true,
      motion: false,
    });

    completeBlockedFrame(reducerRuntime, repair);

    const settledRepair = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(3),
      timestamp: 3,
      viewportInteractionActive: false,
    });
    expect(settledRepair.reducerState).toBe("content-catchup");
    expect(settledRepair.lane).toBe("content");
    expect(settledRepair.debt).toEqual({
      content: false,
      maintenance: true,
      motion: true,
    });
  });

  it("lets content repair run after motion is blocked by missing section surface actors", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const motion = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual", "viewport"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });
    expect(motion.reducerState).toBe("motion-active");
    expect(motion.lane).toBe("motion");
    completeBlockedFrame(reducerRuntime, motion, [
      {
        actorId: "section-a:section-shell",
        family: "section-shell",
        reason: "section-surface-not-drawn",
      },
      {
        actorId: "section-a:section-body-clip",
        family: "section-body-clip",
        reason: "section-surface-not-drawn",
      },
    ]);

    const repair = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual", "viewport"],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: false,
    });
    expect(repair.reducerState).toBe("content-catchup");
    expect(repair.lane).toBe("content");
    expect(repair.debt).toEqual({
      content: false,
      maintenance: false,
      motion: true,
    });
  });

  it("keeps content repair ahead of motion after content is blocked by missing section surface actors", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const content = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(content.reducerState).toBe("content-catchup");
    expect(content.lane).toBe("content");
    expect(content.debt).toEqual({
      content: false,
      maintenance: false,
      motion: false,
    });
    completeBlockedFrame(reducerRuntime, content, [
      {
        actorId: "section-a:section-shell",
        family: "section-shell",
        reason: "section-surface-not-drawn",
      },
      {
        actorId: "section-a:section-body-clip",
        family: "section-body-clip",
        reason: "section-surface-not-drawn",
      },
    ]);

    const repair = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll", "texture-upload"],
      sample: liveSample(250),
      timestamp: 250,
      viewportInteractionActive: true,
    });
    expect(repair.reducerState).toBe("content-catchup");
    expect(repair.lane).toBe("content");
    expect(repair.debt).toEqual({
      content: false,
      maintenance: true,
      motion: true,
    });
  });

  it("lets maintenance upload run after content is blocked by pending browser text snapshots", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const content = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual", "texture-upload"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(content.reducerState).toBe("content-catchup");
    expect(content.lane).toBe("content");
    expect(content.debt).toEqual({
      content: false,
      maintenance: true,
      motion: false,
    });
    completeBlockedFrame(reducerRuntime, content, [
      {
        actorId: "retained-dom-control:a",
        family: "browser-text-snapshot",
        reason: "snapshot-pending",
      },
    ]);

    const upload = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["texture-upload"],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: false,
    });
    expect(upload.reducerState).toBe("maintenance-drain");
    expect(upload.lane).toBe("maintenance");
    expect(upload.debt).toEqual({
      content: true,
      maintenance: false,
      motion: false,
    });
  });

  it("retries content immediately after browser text snapshot maintenance uploads", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const content = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual", "texture-upload"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(content.reducerState).toBe("content-catchup");
    expect(content.lane).toBe("content");
    completeBlockedFrame(reducerRuntime, content, [
      {
        actorId: "retained-dom-control:a",
        family: "browser-text-snapshot",
        reason: "snapshot-pending",
      },
    ]);

    const upload = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["texture-upload"],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: false,
    });
    expect(upload.reducerState).toBe("maintenance-drain");
    expect(upload.lane).toBe("maintenance");
    completePreparedContentFrame(reducerRuntime, upload);

    const retry = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(3),
      timestamp: 3,
      viewportInteractionActive: false,
    });
    expect(retry.reducerState).toBe("content-catchup");
    expect(retry.lane).toBe("content");
    expect(retry.debt).toEqual({
      content: false,
      maintenance: false,
      motion: false,
    });
  });

  it("keeps projection-only viewport frames ahead of browser visual maintenance", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const content = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual", "texture-upload"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(content.reducerState).toBe("content-catchup");
    expect(content.lane).toBe("content");
    completeBlockedFrame(reducerRuntime, content, [
      {
        actorId: "retained-dom-control:a",
        family: "browser-text-snapshot",
        reason: "snapshot-pending",
      },
    ]);

    const viewport = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["viewport", "texture-upload"],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: false,
    });
    expect(viewport.reducerState).toBe("motion-active");
    expect(viewport.lane).toBe("motion");
    expect(viewport.debt).toEqual({
      content: true,
      maintenance: true,
      motion: false,
    });
  });

  it("lets browser text snapshot content repair preempt noninteractive viewport motion after retry delay", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const content = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual", "texture-upload"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(content.reducerState).toBe("content-catchup");
    expect(content.lane).toBe("content");
    completeBlockedFrame(reducerRuntime, content, [
      {
        actorId: "retained-dom-control:a",
        family: "browser-text-snapshot",
        reason: "snapshot-pending",
      },
    ]);

    const immediateViewportRepair = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual", "viewport"],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: true,
    });
    expect(immediateViewportRepair.reducerState).toBe("motion-active");
    expect(immediateViewportRepair.lane).toBe("motion");
    expect(immediateViewportRepair.debt).toEqual({
      content: true,
      maintenance: true,
      motion: false,
    });
    completePreparedContentFrame(reducerRuntime, immediateViewportRepair);

    const deferredViewportRepair = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual", "viewport"],
      sample: liveSample(250),
      timestamp: 250,
      viewportInteractionActive: false,
    });
    expect(deferredViewportRepair.reducerState).toBe("maintenance-deferred");
    expect(deferredViewportRepair.lane).toBe("idle");
    expect(deferredViewportRepair.debt).toEqual({
      content: true,
      maintenance: true,
      motion: true,
    });

    const delayedViewportRepair = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual", "viewport"],
      sample: liveSample(600),
      timestamp: 600,
      viewportInteractionActive: false,
    });
    expect(delayedViewportRepair.reducerState).toBe("content-catchup");
    expect(delayedViewportRepair.lane).toBe("content");
    expect(delayedViewportRepair.debt).toEqual({
      content: false,
      maintenance: true,
      motion: true,
    });
  });

  it("lets active DOM control publication preempt motion maintenance", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const motion = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });
    expect(motion.lane).toBe("motion");
    completeBlockedFrame(reducerRuntime, motion);

    const activation = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: [
        "dom-control-activation",
        "retained-scroll",
        "texture-upload",
      ],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: false,
    });
    expect(activation.reducerState).toBe("motion-active");
    expect(activation.lane).toBe("content");
    expect(activation.debt).toEqual({
      content: false,
      maintenance: true,
      motion: true,
    });
  });

  it("lets retained projection coverage recover before retrying blocked active DOM control debt", () => {
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
    completeBlockedFrame(reducerRuntime, activation, [
      {
        actorId: null,
        family: "retained-projection",
        reason: "retained-projection-coverage-missing",
      },
    ]);

    const retry = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll", "texture-upload"],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: true,
    });
    expect(retry.reducerState).toBe("motion-active");
    expect(retry.lane).toBe("motion");
    expect(retry.debt).toEqual({
      content: true,
      maintenance: true,
      motion: false,
    });

    completePreparedContentFrame(reducerRuntime, retry);

    const deferredContentRetry = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(3),
      timestamp: 250,
      viewportInteractionActive: false,
    });
    expect(deferredContentRetry.reducerState).toBe("maintenance-deferred");
    expect(deferredContentRetry.lane).toBe("idle");

    const contentRetry = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(4),
      timestamp: 600,
      viewportInteractionActive: false,
    });
    expect(contentRetry.reducerState).toBe("content-catchup");
    expect(contentRetry.lane).toBe("content");
  });

  it("probes explicit queued content repair during noninteractive viewport motion", () => {
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

    const contentProbe = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["viewport", "manual"],
      sample: liveSample(8),
      timestamp: 8,
      viewportInteractionActive: false,
    });
    expect(contentProbe.reducerState).toBe("content-catchup");
    expect(contentProbe.lane).toBe("content");
  });

  it("does not probe queued content debt while motion maintenance is still pending", () => {
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
        rawReasons: ["retained-scroll", "paint", "viewport"],
        sample: liveSample(2 + index),
        timestamp: 2 + index,
        viewportInteractionActive: true,
      });
      expect(motion.reducerState).toBe("motion-active");
      expect(motion.lane).toBe("motion");
      completePreparedContentFrame(reducerRuntime, motion);
    }

    const contentProbe = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["viewport", "manual"],
      sample: liveSample(8),
      timestamp: 8,
      viewportInteractionActive: true,
    });
    expect(contentProbe.reducerState).toBe("motion-active");
    expect(contentProbe.lane).toBe("motion");
    expect(contentProbe.debt).toEqual({
      content: true,
      maintenance: true,
      motion: false,
    });
  });

  it("publishes short non-scroll maintenance content catchup", () => {
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

    const motion = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["paint", "viewport"],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: true,
    });
    expect(motion.reducerState).toBe("motion-active");
    expect(motion.lane).toBe("motion");
    completePreparedContentFrame(reducerRuntime, motion);

    const contentCatchup = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(3),
      timestamp: 3,
      viewportInteractionActive: false,
    });
    expect(contentCatchup.reducerState).toBe("content-catchup");
    expect(contentCatchup.lane).toBe("content");
    expect(contentCatchup.debt).toEqual({
      content: false,
      maintenance: true,
      motion: false,
    });
  });

  it("does not probe queued content debt during pure viewport motion", () => {
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

    const viewport = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["viewport"],
      sample: liveSample(8),
      timestamp: 8,
      viewportInteractionActive: true,
    });
    expect(viewport.reducerState).toBe("motion-active");
    expect(viewport.lane).toBe("motion");
  });

  it("keeps motion ahead of retained native visual repair while motion maintenance is current", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const motion = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });
    expect(motion.lane).toBe("motion");
    completeBlockedFrame(reducerRuntime, motion);

    const nativeVisual = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
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
    expect(nativeVisual.reducerState).toBe("motion-active");
    expect(nativeVisual.lane).toBe("motion");
    expect(nativeVisual.debt).toEqual({
      content: true,
      maintenance: true,
      motion: false,
    });
  });

  it("keeps viewport frames ahead of retained native visual repair", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();

    const nativeVisual = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-native-visual", "viewport", "texture-upload"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });
    expect(nativeVisual.reducerState).toBe("motion-active");
    expect(nativeVisual.lane).toBe("motion");
    expect(nativeVisual.debt).toEqual({
      content: true,
      maintenance: true,
      motion: false,
    });
  });

  it("projects retained native visuals while carrying content repair debt", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();

    const nativeVisual = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-native-visual", "texture-upload"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(nativeVisual.reducerState).toBe("motion-active");
    expect(nativeVisual.lane).toBe("motion");
    expect(nativeVisual.debt).toEqual({
      content: true,
      maintenance: true,
      motion: false,
    });
  });

  it("projects retained row hover visuals without content preparation", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();

    const rowHover = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-row-hover-visual", "texture-upload"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(rowHover.reducerState).toBe("motion-active");
    expect(rowHover.lane).toBe("motion");
    expect(rowHover.debt).toEqual({
      content: false,
      maintenance: true,
      motion: false,
    });
  });

  it("keeps viewport frames ahead of retained row hover visuals", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();

    const rowHover = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-row-hover-visual", "texture-upload", "viewport"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(rowHover.reducerState).toBe("motion-active");
    expect(rowHover.lane).toBe("motion");
    expect(rowHover.debt).toEqual({
      content: false,
      maintenance: true,
      motion: false,
    });
  });

  it("lets retained row hover clear preempt viewport maintenance", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();

    const rowHoverClear = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-row-hover-clear", "viewport"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(rowHoverClear.reducerState).toBe("motion-active");
    expect(rowHoverClear.lane).toBe("motion");
    expect(rowHoverClear.debt).toEqual({
      content: false,
      maintenance: false,
      motion: false,
    });
  });

  it("defers immediate content retries after content holds previous", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const content = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(content.lane).toBe("content");
    completeHeldFrame(reducerRuntime, content);

    const immediateRetry = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual", "texture-upload"],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: false,
    });
    expect(immediateRetry.reducerState).toBe("maintenance-drain");
    expect(immediateRetry.lane).toBe("maintenance");
    expect(immediateRetry.debt).toEqual({
      content: true,
      maintenance: false,
      motion: false,
    });

    const delayedRetry = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(250),
      timestamp: 250,
      viewportInteractionActive: false,
    });
    expect(delayedRetry.reducerState).toBe("content-catchup");
    expect(delayedRetry.lane).toBe("content");
    expect(delayedRetry.debt.maintenance).toBe(true);
  });

  it("defers ordinary manual content catchup immediately after content publishes", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const content = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(content.lane).toBe("content");
    completePreparedContentFrame(reducerRuntime, content);

    const immediateRetry = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: false,
    });
    expect(immediateRetry.reducerState).toBe("maintenance-deferred");
    expect(immediateRetry.lane).toBe("idle");
    expect(immediateRetry.debt).toEqual({
      content: true,
      maintenance: false,
      motion: false,
    });

    const delayedRetry = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(250),
      timestamp: 250,
      viewportInteractionActive: false,
    });
    expect(delayedRetry.reducerState).toBe("content-catchup");
    expect(delayedRetry.lane).toBe("content");
  });

  it("does not extend content retry cooldown after idle held-previous budget blocks", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const content = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(content.lane).toBe("content");
    completeHeldFrame(reducerRuntime, content);

    const idle = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: false,
    });
    expect(idle.reducerState).toBe("idle");
    expect(idle.lane).toBe("idle");
    completeBlockedFrame(reducerRuntime, idle, [
      {
        actorId: null,
        family: "visible-transaction",
        reason: "held-previous-budget-exceeded",
      },
    ]);

    const delayedRetry = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(250),
      timestamp: 250,
      viewportInteractionActive: false,
    });
    expect(delayedRetry.reducerState).toBe("content-catchup");
    expect(delayedRetry.lane).toBe("content");
  });
});

function completeBlockedFrame(
  reducerRuntime: ReturnType<typeof createGpuFlowVisibleFrameReducerRuntime>,
  decision: GpuFlowVisibleFrameReducerDecision,
  blockedReasons: GpuFlowBlockedPublicationToken["blockedReasons"] = [
    { actorId: null, family: "visible-transaction", reason: "blocked" },
  ],
) {
  return reducerRuntime.recordUnpresentedFrame(decision, {
    kind: "blocked",
    token: createGpuFlowVisibleFrameBlockedPublicationTokenForTest({
      blockedReasons,
      frozenFrameId: 41,
      projectionSample: decision.sample,
    }),
  });
}

function completePreparedContentFrame(
  reducerRuntime: ReturnType<typeof createGpuFlowVisibleFrameReducerRuntime>,
  decision: GpuFlowVisibleFrameReducerDecision,
) {
  return reducerRuntime.completeFrame(decision, {
    debtProof: createDebtProofForSelectedLane(decision),
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

function completeHeldFrame(
  reducerRuntime: ReturnType<typeof createGpuFlowVisibleFrameReducerRuntime>,
  decision: GpuFlowVisibleFrameReducerDecision,
) {
  return reducerRuntime.recordUnpresentedFrame(decision, {
    kind: "hold-previous",
    token: createGpuFlowVisibleFrameHoldPreviousTokenForTest({
      preparedContentFrameId: 41,
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
  decision: GpuFlowVisibleFrameReducerDecision,
) {
  return {
    content: decision.lane === "content",
    maintenance: decision.lane === "maintenance",
    motion: decision.lane === "motion",
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
    publishability: {
      blockingActorIds: [],
      kind: "publishable",
    },
    surfaceTransaction: null,
    viewportSample: { x: 0, y: 0, zoom: 1 },
  } as unknown as GpuFlowPreparedContentFrame;
}
