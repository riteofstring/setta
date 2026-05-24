/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";

import type {
  GpuFlowBlockedPresentationToken,
  GpuFlowHoldPreviousToken,
  GpuFlowVisibleFramePresentationToken,
} from "./GpuFlow/visibleFramePresentationProofs";
import {
  createGpuFlowVisibleFrameBlockedPresentationTokenForTest,
  createGpuFlowVisibleFrameHoldPreviousTokenForTest,
  createGpuFlowVisibleFramePresentationTokenForTest,
} from "./GpuFlow/visibleFrameTestUtils";
import {
  createGpuFlowPreparedContentPresentationProof,
  type GpuFlowPreparedContentFrame,
} from "./preparedContentFrame";
import {
  applyGpuFlowProjectionDebugAttributes,
  createGpuFlowHeldPreviousProjection,
  createGpuFlowLiveProjectionSampler,
  createGpuFlowProjectionHorizonObligations,
  createGpuFlowProjectionTransactionForPreparedContentFrameId,
  createGpuFlowVisibleFrameReducerRuntime,
  createGpuFlowVisibleProjectionState,
  getGpuFlowVisibleFrameReducerDebtReason,
  setProjectionDebugAttributes,
  type GpuFlowVisibleFrameReducerDecision,
} from "./projectionRuntime";
import { createGpuRetainedContentRuntimeState } from "./retainedContentRuntimeState";

describe("GPU Flow projection runtime", () => {
  it("presents motion before mixed content and maintenance debt", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const sample = liveSample(1);
    expect(Object.isFrozen(reducerRuntime.getKnobs())).toBe(true);
    const mixed = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll", "manual", "texture-upload"],
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
    expect(getGpuFlowVisibleFrameReducerDebtReason(mixed)).toBe("manual");
    completePreparedContentFrame(reducerRuntime, mixed);
    const deferredCatchup = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: false,
    });
    expect(deferredCatchup.reducerState).toBe("motion-settling");
    expect(deferredCatchup.lane).toBe("idle");
    expect(deferredCatchup.debt.maintenance).toBe(true);
    completeHeldFrame(reducerRuntime, deferredCatchup);

    const catchup = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(600),
      timestamp: 600,
      viewportInteractionActive: false,
    });
    expect(catchup.reducerState).toBe("content-catchup");
    expect(catchup.lane).toBe("content");
    expect(catchup.debt.maintenance).toBe(true);
    completePreparedContentFrame(reducerRuntime, catchup);

    const maintenance = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["texture-upload"],
      sample: liveSample(3),
      timestamp: 3,
      viewportInteractionActive: false,
    });
    expect(maintenance.reducerState).toBe("maintenance-deferred");
    expect(maintenance.lane).toBe("idle");
    completeHeldFrame(reducerRuntime, maintenance);

    const delayedMaintenance = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["texture-upload"],
      sample: liveSample(900),
      timestamp: 900,
      viewportInteractionActive: false,
    });
    expect(delayedMaintenance.reducerState).toBe("maintenance-drain");
    expect(delayedMaintenance.lane).toBe("maintenance");
  });

  it("keeps stale-sample catch-up debt queued behind retained-scroll motion", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const motion = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll", "manual", "texture-upload"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(motion.reducerState).toBe("motion-active");
    expect(motion.lane).toBe("motion");
    expect(motion.debt).toEqual({
      content: true,
      maintenance: true,
      motion: false,
    });

    completePreparedContentFrame(reducerRuntime, motion);
    const deferredCatchup = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: false,
    });
    expect(deferredCatchup.reducerState).toBe("motion-settling");
    expect(deferredCatchup.lane).toBe("idle");
    expect(deferredCatchup.debt.maintenance).toBe(true);
    completeHeldFrame(reducerRuntime, deferredCatchup);

    const catchup = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(600),
      timestamp: 600,
      viewportInteractionActive: false,
    });
    expect(catchup.reducerState).toBe("content-catchup");
    expect(catchup.lane).toBe("content");
    expect(catchup.debt.maintenance).toBe(true);
    completePreparedContentFrame(reducerRuntime, catchup);

    const postContentTextureUpload = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["texture-upload"],
      sample: liveSample(720),
      timestamp: 720,
      viewportInteractionActive: false,
    });

    expect(postContentTextureUpload.reducerState).toBe("maintenance-deferred");
    expect(postContentTextureUpload.lane).toBe("idle");
    expect(postContentTextureUpload.debt).toEqual({
      content: false,
      maintenance: true,
      motion: false,
    });
    completeHeldFrame(reducerRuntime, postContentTextureUpload);

    const maintenance = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["texture-upload"],
      sample: liveSample(900),
      timestamp: 900,
      viewportInteractionActive: false,
    });

    expect(maintenance.reducerState).toBe("maintenance-drain");
    expect(maintenance.lane).toBe("maintenance");
  });

  it("defers maintenance-only frames while explicit content debt is queued", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const motion = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll", "manual"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });
    completePreparedContentFrame(reducerRuntime, motion);

    const textureUpload = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["texture-upload"],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: false,
    });

    expect(textureUpload.reducerState).toBe("maintenance-deferred");
    expect(textureUpload.lane).toBe("idle");
    expect(textureUpload.debt).toEqual({
      content: true,
      maintenance: true,
      motion: false,
    });
    completeHeldFrame(reducerRuntime, textureUpload);

    const paint = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["paint"],
      sample: liveSample(3),
      timestamp: 3,
      viewportInteractionActive: false,
    });

    expect(paint.reducerState).toBe("maintenance-deferred");
    expect(paint.lane).toBe("idle");
    expect(paint.debt).toEqual({
      content: true,
      maintenance: true,
      motion: false,
    });
    completeHeldFrame(reducerRuntime, paint);

    const deferredCatchup = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(4),
      timestamp: 4,
      viewportInteractionActive: false,
    });

    expect(deferredCatchup.reducerState).toBe("motion-settling");
    expect(deferredCatchup.lane).toBe("idle");
    expect(deferredCatchup.debt.maintenance).toBe(true);
    completeHeldFrame(reducerRuntime, deferredCatchup);

    const catchup = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(600),
      timestamp: 600,
      viewportInteractionActive: false,
    });

    expect(catchup.reducerState).toBe("content-catchup");
    expect(catchup.lane).toBe("content");
    expect(catchup.debt.maintenance).toBe(true);
  });

  it("uses content preparation for cold motion without a prepared content frame", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const decision = reducerRuntime.selectFrame({
      hasPresentedContentFrame: false,
      rawReasons: ["viewport"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });

    expect(decision.lane).toBe("content");
    expect(decision.debt.motion).toBe(true);
  });

  it("keeps selected lane debt queued when a frame blocks", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const decision = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll", "manual", "texture-upload"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });

    expect(decision.lane).toBe("motion");
    expect(decision.debt).toEqual({
      content: true,
      maintenance: true,
      motion: false,
    });

    const completion = completeBlockedFrame(reducerRuntime, decision);

    expect(completion.outcome).toBe("blocked");
    expect(completion.debt).toEqual({
      content: true,
      maintenance: true,
      motion: true,
    });
    expect(getGpuFlowVisibleFrameReducerDebtReason(completion.debt)).toBe(
      "retained-scroll",
    );
  });

  it("keeps selected lane debt queued when a held-previous frame is presented", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const decision = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll", "manual", "texture-upload"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });

    const completion = reducerRuntime.recordUnpresentedFrame(decision, {
      kind: "hold-previous",
      token: createGpuFlowVisibleFrameHoldPreviousTokenForTest({
        preparedContentFrameId: 41,
        holdAgeFrames: 1,
        holdAgeMs: 0,
        projectionSample: decision.sample,
      }),
    });

    expect(completion.outcome).toBe("hold-previous");
    expect(completion.debt).toEqual({
      content: true,
      maintenance: true,
      motion: true,
    });
  });

  it("keeps selected lane debt queued when a blocked presentation is recorded", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const decision = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll", "manual", "texture-upload"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });

    const completion = reducerRuntime.recordUnpresentedFrame(decision, {
      kind: "blocked",
      token: createGpuFlowVisibleFrameBlockedPresentationTokenForTest({
        blockedReasons: [
          { actorId: "actor-a", family: "dom-control", reason: "pending" },
        ],
        frozenFrameId: 41,
        projectionSample: decision.sample,
      }),
    });

    expect(completion.outcome).toBe("blocked");
    expect(completion.debt).toEqual({
      content: true,
      maintenance: true,
      motion: true,
    });
  });

  it("does not clear selected lane debt without committed proof coverage", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const decision = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll", "manual", "texture-upload"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });

    const completion = completePreparedContentFrame(reducerRuntime, decision, {
      content: false,
      maintenance: false,
      motion: false,
    });

    expect(completion.outcome).toBe("present");
    expect(completion.debt).toEqual({
      content: true,
      maintenance: true,
      motion: true,
    });
  });

  it("rejects committed debt proof for lanes outside the selected presentation outcome", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const decision = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll", "manual", "texture-upload"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });

    expect(decision.lane).toBe("motion");
    expect(() =>
      completePreparedContentFrame(reducerRuntime, decision, {
        content: true,
        maintenance: false,
        motion: true,
      }),
    ).toThrow(/selected work lane/);
  });

  it("rejects committed debt completion for a different projection sample", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const decision = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });

    expect(() =>
      reducerRuntime.completeFrame(decision, {
        debtProof: createDebtProofForSelectedLane(decision),
        kind: "present",
        token: createGpuFlowVisibleFramePresentationTokenForTest({
          frame: preparedContentFrameForReducerToken(decision),
          projectionSample: liveSample(2),
        }),
      }),
    ).toThrow(/selected projection sample/);
  });

  it("rejects unbranded visible frame presentation tokens", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const decision = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });

    expect(() =>
      reducerRuntime.completeFrame(decision, {
        debtProof: createDebtProofForSelectedLane(decision),
        kind: "present",
        token: {
          projectionSampleId: decision.sample.id,
        } as unknown as GpuFlowVisibleFramePresentationToken,
      }),
    ).toThrow(/presentation token for the selected projection sample/);
  });

  it("rejects blocked debt completion for a different projection sample", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const decision = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });

    expect(() =>
      reducerRuntime.recordUnpresentedFrame(decision, {
        kind: "blocked",
        token: createGpuFlowVisibleFrameBlockedPresentationTokenForTest({
          blockedReasons: [
            { actorId: "actor-a", family: "dom-control", reason: "pending" },
          ],
          frozenFrameId: 41,
          projectionSample: liveSample(2),
        }),
      }),
    ).toThrow(/blocked token for the selected projection sample/);
  });

  it("rejects unbranded hold and blocked presentation tokens", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const heldDecision = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });

    expect(() =>
      reducerRuntime.recordUnpresentedFrame(heldDecision, {
        kind: "hold-previous",
        token: {
          projectionSampleId: heldDecision.sample.id,
        } as unknown as GpuFlowHoldPreviousToken,
      }),
    ).toThrow(/hold-previous token for the selected projection sample/);

    const blockedDecision = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll"],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: true,
    });

    expect(() =>
      reducerRuntime.recordUnpresentedFrame(blockedDecision, {
        kind: "blocked",
        token: {
          projectionSampleId: blockedDecision.sample.id,
        } as unknown as GpuFlowBlockedPresentationToken,
      }),
    ).toThrow(/blocked token for the selected projection sample/);
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
    expect(Object.isFrozen(sample)).toBe(true);
    expect(Object.isFrozen(sample.retainedScrollOffsets)).toBe(true);
    expect(Object.isFrozen(sample.retainedScrollOffsets.get("surface-a"))).toBe(
      true,
    );
    expect("set" in sample.retainedScrollOffsets).toBe(false);
    expect([...sample.retainedScrollOffsets]).toEqual([
      ["surface-a", { x: 0, y: 12 }],
    ]);
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

  it("binds transaction identity to the prepared content frame and projection sample", () => {
    const sample = liveSample(17);
    const transaction =
      createGpuFlowProjectionTransactionForPreparedContentFrameId({
        preparedContentFrameId: 42,
        kind: "motion-projection",
        lane: "motion",
        rawReasons: ["retained-scroll", "paint"],
        sample,
      });

    expect(transaction.id).toBe("motion-projection:content-42:sample-17");
    expect(transaction.preparedContentFrameId).toBe(42);
    expect(transaction.sample.id).toBe(17);
  });

  it("keeps unpresented motion ahead of content probes during continuous motion", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime({
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
      const motion = reducerRuntime.selectFrame({
        hasPresentedContentFrame: true,
        rawReasons: ["retained-scroll", "manual"],
        sample: liveSample(index + 1),
        timestamp: index + 1,
        viewportInteractionActive: true,
      });
      expect(motion.lane).toBe("motion");
      completePreparedContentFrame(reducerRuntime, motion);
    }

    const catchup = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll"],
      sample: liveSample(3),
      timestamp: 3,
      viewportInteractionActive: true,
    });

    expect(catchup.reducerState).toBe("motion-active");
    expect(catchup.lane).toBe("motion");
    expect(catchup.debt.content).toBe(true);
  });

  it("uses the content probe knob when motion has no unpresented sample", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime({
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
      const motion = reducerRuntime.selectFrame({
        hasPresentedContentFrame: true,
        rawReasons: ["retained-scroll", "manual"],
        sample: liveSample(index + 1),
        timestamp: index + 1,
        viewportInteractionActive: true,
      });
      completePreparedContentFrame(reducerRuntime, motion);
    }

    const deferredCatchup = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(3),
      timestamp: 3,
      viewportInteractionActive: false,
    });

    expect(deferredCatchup.reducerState).toBe("motion-settling");
    expect(deferredCatchup.lane).toBe("idle");
    completeHeldFrame(reducerRuntime, deferredCatchup);

    const catchup = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(600),
      timestamp: 600,
      viewportInteractionActive: false,
    });

    expect(catchup.reducerState).toBe("content-catchup");
    expect(catchup.lane).toBe("content");
    expect(catchup.debt.motion).toBe(false);
  });

  it("keeps an inactive retained-scroll sample ahead of queued content debt", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime({
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
      const motion = reducerRuntime.selectFrame({
        hasPresentedContentFrame: true,
        rawReasons: ["retained-scroll", "manual"],
        sample: liveSample(index + 1),
        timestamp: index + 1,
        viewportInteractionActive: true,
      });
      expect(motion.lane).toBe("motion");
      completePreparedContentFrame(reducerRuntime, motion);
    }

    const motion = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll"],
      sample: liveSample(3),
      timestamp: 3,
      viewportInteractionActive: false,
    });

    expect(motion.reducerState).toBe("motion-active");
    expect(motion.lane).toBe("motion");
    expect(motion.debt.content).toBe(true);
    expect(motion.debt.motion).toBe(false);
  });

  it("prioritizes inactive explicit content debt over queued motion debt", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime();
    const motion = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });
    expect(motion.lane).toBe("motion");
    completeHeldFrame(reducerRuntime, motion);

    const catchup = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(2),
      timestamp: 2,
      viewportInteractionActive: false,
    });

    expect(catchup.reducerState).toBe("content-catchup");
    expect(catchup.lane).toBe("content");
    expect(catchup.debt.motion).toBe(true);
  });

  it("keeps content debt deferred while viewport interaction remains active", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime({
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
      const motion = reducerRuntime.selectFrame({
        hasPresentedContentFrame: true,
        rawReasons: ["retained-scroll", "paint"],
        sample: liveSample(index + 1),
        timestamp: index + 1,
        viewportInteractionActive: true,
      });
      completePreparedContentFrame(reducerRuntime, motion);
    }

    const activeViewport = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual"],
      sample: liveSample(3),
      timestamp: 3,
      viewportInteractionActive: true,
    });

    expect(activeViewport.reducerState).toBe("motion-active");
    expect(activeViewport.lane).toBe("motion");
    expect(activeViewport.debt.content).toBe(true);
  });

  it("honors motion-settling interleave budgets for content and maintenance debt", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime({
      knobs: {
        maxConsecutiveMotionFramesBeforeContentProbe: 2,
        maxContentInterleaveMs: 0,
        maxHeldPreviousFrames: 6,
        maxHeldPreviousMs: 120,
        maxMaintenanceInterleaveMs: 1,
        motionSettleWindowMs: 120,
      },
    });
    const motion = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["retained-scroll"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });
    completePreparedContentFrame(reducerRuntime, motion);

    const settling = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["manual", "texture-upload"],
      sample: liveSample(20),
      timestamp: 20,
      viewportInteractionActive: false,
    });

    expect(settling.reducerState).toBe("motion-settling");
    expect(settling.lane).toBe("idle");
    expect(settling.debt).toEqual({
      content: true,
      maintenance: true,
      motion: false,
    });
    completeHeldFrame(reducerRuntime, settling);

    const catchup = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: [],
      sample: liveSample(600),
      timestamp: 600,
      viewportInteractionActive: false,
    });

    expect(catchup.reducerState).toBe("content-catchup");
    expect(catchup.lane).toBe("content");
    expect(catchup.debt).toEqual({
      content: false,
      maintenance: true,
      motion: false,
    });
  });

  it("honors the maintenance interleave budget while motion is settling", () => {
    const reducerRuntime = createGpuFlowVisibleFrameReducerRuntime({
      knobs: {
        maxConsecutiveMotionFramesBeforeContentProbe: 2,
        maxContentInterleaveMs: 2,
        maxHeldPreviousFrames: 6,
        maxHeldPreviousMs: 120,
        maxMaintenanceInterleaveMs: 0,
        motionSettleWindowMs: 120,
      },
    });
    const motion = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["viewport"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: true,
    });
    completePreparedContentFrame(reducerRuntime, motion);

    const settling = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: ["texture-upload"],
      sample: liveSample(20),
      timestamp: 20,
      viewportInteractionActive: false,
    });

    expect(settling.reducerState).toBe("maintenance-deferred");
    expect(settling.lane).toBe("idle");
    expect(settling.debt).toEqual({
      content: false,
      maintenance: true,
      motion: false,
    });
    completeHeldFrame(reducerRuntime, settling);

    const maintenance = reducerRuntime.selectFrame({
      hasPresentedContentFrame: true,
      rawReasons: [],
      sample: liveSample(140),
      timestamp: 140,
      viewportInteractionActive: false,
    });

    expect(maintenance.reducerState).toBe("maintenance-drain");
    expect(maintenance.lane).toBe("maintenance");
  });

  it("keeps projection horizon obligations concrete and lane-scoped", () => {
    const obligations = createGpuFlowProjectionHorizonObligations({
      preparedContentFrame: preparedContentFrameForObligations(),
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

  it("rejects held-previous diagnostics as visible debug attributes", () => {
    const previousTransaction =
      createGpuFlowProjectionTransactionForPreparedContentFrameId({
        preparedContentFrameId: 42,
        kind: "motion-projection",
        lane: "motion",
        rawReasons: ["retained-scroll"],
        sample: liveSample(4),
      });
    const previousState = createGpuFlowVisibleProjectionState({
      preparedContentFrame: {
        coherence: {
          hitGenerationId: "hit-42",
        },
        displayFrameId: 42,
      } as GpuFlowPreparedContentFrame,
      transaction: previousTransaction,
    });
    const heldTransaction =
      createGpuFlowProjectionTransactionForPreparedContentFrameId({
        preparedContentFrameId: 42,
        kind: "held-previous",
        lane: "motion",
        rawReasons: ["retained-scroll", "paint"],
        sample: liveSample(4),
      });
    const requestedSample = liveSample(12);
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
      requestedSample,
    });
    const heldState = createGpuFlowVisibleProjectionState({
      preparedContentFrame: previousState.preparedContentFrame,
      heldPreviousProjection,
      transaction: heldTransaction,
    });
    const element = document.createElement("div");

    expect(() =>
      setProjectionDebugAttributes(
        element,
        heldState.debugState,
        createGpuFlowVisibleFrameHoldPreviousTokenForTest({
          preparedContentFrameId: heldState.preparedContentFrame.displayFrameId,
          holdAgeFrames: heldPreviousProjection.consecutiveFrameCount,
          holdAgeMs: heldPreviousProjection.heldDurationMs,
          projectionSample: requestedSample,
        }) as unknown as GpuFlowVisibleFramePresentationToken,
      ),
    ).toThrow(/visible frame presentation token/);
    expect(element.dataset.gpuFlowHeldPreviousFrameCount).toBeUndefined();
    expect(element.dataset.gpuFlowProjectionTransactionKind).toBeUndefined();
  });

  it("scopes projection debug attributes to the canvas owning DOM control plane", () => {
    document.body.innerHTML = `
      <div data-tab-scope="canvas">
        <canvas id="canvas-a"></canvas>
        <div id="plane-a" data-gpu-flow-dom-control-plane="true"></div>
      </div>
      <div data-tab-scope="canvas">
        <canvas id="canvas-b"></canvas>
        <div id="plane-b" data-gpu-flow-dom-control-plane="true"></div>
      </div>
    `;
    const transaction =
      createGpuFlowProjectionTransactionForPreparedContentFrameId({
        preparedContentFrameId: 7,
        kind: "motion-projection",
        lane: "motion",
        rawReasons: ["retained-scroll"],
        sample: liveSample(3),
      });
    const visibleState = createGpuFlowVisibleProjectionState({
      preparedContentFrame: {
        displayFrameId: 7,
      } as GpuFlowPreparedContentFrame,
      transaction,
    });
    const canvasB = document.getElementById("canvas-b");
    const planeA = document.getElementById("plane-a");
    const planeB = document.getElementById("plane-b");
    if (
      !(canvasB instanceof HTMLCanvasElement) ||
      !(planeA instanceof HTMLElement) ||
      !(planeB instanceof HTMLElement)
    ) {
      throw new Error("Expected projection debug test elements.");
    }

    const token = createGpuFlowVisibleFramePresentationTokenForTest({
      frame: preparedContentFrameForDebugToken(7),
      projectionSample: visibleState.sample,
    });

    applyGpuFlowProjectionDebugAttributes({
      canvas: canvasB,
      debugState: visibleState.debugState,
      token,
    });

    expect(canvasB.dataset.gpuFlowContentFrameId).toBe(
      String(token.contentFrameId),
    );
    expect(canvasB.dataset.gpuFlowPresentationId).toBe(
      String(token.presentationId),
    );
    expect(canvasB.dataset.gpuFlowProjectionTransactionId).toBe(
      "motion-projection:content-7:sample-3",
    );
    expect(planeB.dataset.gpuFlowContentFrameId).toBe(
      String(token.contentFrameId),
    );
    expect(planeB.dataset.gpuFlowPresentationId).toBe(
      String(token.presentationId),
    );
    expect(planeB.dataset.gpuFlowProjectionTransactionId).toBe(
      "motion-projection:content-7:sample-3",
    );
    expect(planeA.dataset.gpuFlowProjectionTransactionId).toBeUndefined();
  });
});

function completePreparedContentFrame(
  reducerRuntime: ReturnType<typeof createGpuFlowVisibleFrameReducerRuntime>,
  decision: GpuFlowVisibleFrameReducerDecision,
  debtProof = createDebtProofForSelectedLane(decision),
) {
  return reducerRuntime.completeFrame(decision, {
    debtProof,
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

function completeBlockedFrame(
  reducerRuntime: ReturnType<typeof createGpuFlowVisibleFrameReducerRuntime>,
  decision: GpuFlowVisibleFrameReducerDecision,
  blockedReasons: GpuFlowBlockedPresentationToken["blockedReasons"] = [
    { actorId: null, family: "visible-transaction", reason: "blocked" },
  ],
) {
  return reducerRuntime.recordUnpresentedFrame(decision, {
    kind: "blocked",
    token: createGpuFlowVisibleFrameBlockedPresentationTokenForTest({
      blockedReasons,
      frozenFrameId: 41,
      projectionSample: decision.sample,
    }),
  });
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
  return preparedContentFrameForDebugToken(decision.sample.id);
}

function preparedContentFrameForDebugToken(
  displayFrameId: number,
): GpuFlowPreparedContentFrame {
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

function preparedContentFrameForObligations(): GpuFlowPreparedContentFrame {
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
  } as unknown as GpuFlowPreparedContentFrame;
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
