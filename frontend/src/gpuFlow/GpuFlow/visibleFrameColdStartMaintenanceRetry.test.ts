import { describe, expect, it } from "vitest";

import type { GpuFlowLiveProjectionSample } from "../projectionRuntime";
import type { GpuFlowBlockedPublicationToken } from "./visibleFramePresentationProofs";
import {
  createGpuFlowVisibleFrameRequestCoordinator,
  type GpuFlowVisiblePublicationDecision,
} from "./visibleFrameScheduling";
import { createGpuFlowVisibleFrameBlockedPublicationTokenForTest } from "./visibleFrameTestUtils";

describe("GPU Flow cold-start maintenance retry", () => {
  it("lets maintenance upload run after browser text snapshots block first content", () => {
    const scheduler = createGpuFlowVisibleFrameRequestCoordinator();
    const content = scheduler.selectFrame({
      hasCommittedContentFrame: false,
      rawReasons: ["manual", "texture-upload"],
      sample: liveSample(1),
      timestamp: 1,
      viewportInteractionActive: false,
    });
    expect(content.schedulerState).toBe("content-catchup");
    expect(content.lane).toBe("content");

    completeBlockedFrame(scheduler, content, [
      {
        actorId: "retained-dom-control:a",
        family: "browser-text-snapshot",
        reason: "snapshot-pending",
      },
    ]);

    const upload = scheduler.selectFrame({
      hasCommittedContentFrame: false,
      rawReasons: ["manual", "texture-upload", "paint"],
      sample: liveSample(250),
      timestamp: 250,
      viewportInteractionActive: false,
    });
    expect(upload.schedulerState).toBe("maintenance-drain");
    expect(upload.lane).toBe("maintenance");
    expect(upload.debt).toEqual({
      content: true,
      maintenance: false,
      motion: false,
    });
  });
});

function completeBlockedFrame(
  scheduler: ReturnType<typeof createGpuFlowVisibleFrameRequestCoordinator>,
  decision: GpuFlowVisiblePublicationDecision,
  blockedReasons: GpuFlowBlockedPublicationToken["blockedReasons"],
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

function liveSample(id: number): GpuFlowLiveProjectionSample {
  return {
    cssViewport: { height: 600, width: 800 },
    devicePixelRatio: 1,
    gestureOwner: "idle",
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
