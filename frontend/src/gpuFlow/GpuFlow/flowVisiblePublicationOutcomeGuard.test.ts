import { describe, expect, it } from "vitest";

import type { GpuSurfaceHandle } from "../GpuSurface";
import type {
  GpuFlowLiveProjectionSample,
  GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import { assertGpuFlowSingleVisiblePublicationOutcome } from "./flowVisiblePublicationOutcomeGuard";

describe("GPU Flow visible publication outcome guard", () => {
  it("rejects multiple outcomes for the same surface and projection sample", () => {
    const surface = surfaceHandle();
    assertGpuFlowSingleVisiblePublicationOutcome({
      outcome: { kind: "not-published" },
      publicationDecision: publicationDecision(1),
      surface,
    });

    expect(() =>
      assertGpuFlowSingleVisiblePublicationOutcome({
        outcome: { kind: "not-published" },
        publicationDecision: publicationDecision(1),
        surface,
      }),
    ).toThrow(/already completed an outcome/);
  });

  it("allows independent surfaces and later projection samples", () => {
    const surface = surfaceHandle();
    assertGpuFlowSingleVisiblePublicationOutcome({
      outcome: { kind: "not-published" },
      publicationDecision: publicationDecision(1),
      surface,
    });

    expect(() =>
      assertGpuFlowSingleVisiblePublicationOutcome({
        outcome: { kind: "not-published" },
        publicationDecision: publicationDecision(1),
        surface: surfaceHandle(),
      }),
    ).not.toThrow();
    expect(() =>
      assertGpuFlowSingleVisiblePublicationOutcome({
        outcome: { kind: "not-published" },
        publicationDecision: publicationDecision(2),
        surface,
      }),
    ).not.toThrow();
  });
});

function publicationDecision(
  sampleId: number,
): GpuFlowVisiblePublicationDecision {
  return {
    debt: {
      content: false,
      maintenance: false,
      motion: false,
    },
    lane: "idle",
    rawReasons: [],
    sample: liveProjectionSample(sampleId),
    schedulerState: "idle",
  };
}

function liveProjectionSample(id: number): GpuFlowLiveProjectionSample {
  return {
    cssViewport: {
      height: 600,
      width: 800,
    },
    devicePixelRatio: 1,
    gestureOwner: "idle",
    id,
    retainedScrollDelta: new Map(),
    retainedScrollOffsets: new Map(),
    retainedScrollRevision: 0,
    retainedScrollVelocityCssPxPerMs: new Map(),
    timestamp: id,
    viewport: [0, 0, 1],
    viewportDelta: {
      x: 0,
      y: 0,
      zoom: 0,
    },
    viewportVelocityCssPxPerMs: {
      x: 0,
      y: 0,
      zoom: 0,
    },
  };
}

function surfaceHandle(): GpuSurfaceHandle {
  return {
    getRuntime: () => null,
    requestFrame: () => undefined,
    requestPaint: () => undefined,
  };
}
