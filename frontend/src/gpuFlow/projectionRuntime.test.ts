import { describe, expect, it } from "vitest";

import {
  createGpuFlowLiveProjectionSampler,
  createGpuFlowProjectionTransactionForCommittedFrameId,
  createGpuFlowVisiblePublicationScheduler,
  getGpuFlowVisiblePublicationDebtReason,
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
    expect(sample.viewport).toEqual({ x: 1, y: 2, zoom: 1.5 });
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
});

function liveSample(id: number) {
  return {
    cssViewport: { height: 600, width: 800 },
    devicePixelRatio: 1,
    gestureOwner: "idle" as const,
    id,
    retainedScrollOffsets: new Map(),
    retainedScrollRevision: 0,
    timestamp: id,
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}
