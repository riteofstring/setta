import { describe, expect, it } from "vitest";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import {
  createGpuRetainedContentRuntimeState,
  setGpuRetainedContentRuntimeScrollOffset,
} from "../retainedContentRuntimeState";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import type { GpuViewportInput } from "../viewportMath";
import {
  shouldDeferGpuFlowContentPublicationResolutionUpdatesForFrame,
  shouldDeferGpuFlowContentPublicationResolutionUpdatesForSample,
} from "./visibleFrameResolutionDeferral";
import {
  hasGpuFlowCommittedContentFrame,
  shouldRequestGpuFlowRetainedScrollCatchupFrame,
  withGpuFlowContentCatchupReasonForStalePublicationSample,
} from "./visibleFrameSurfaceFrame";

describe("GPU Flow surface frame publication", () => {
  it("keeps raw reasons unchanged when the committed sample is current", () => {
    const rawReasons: readonly GpuFrameReason[] = ["viewport"];

    expect(
      withGpuFlowContentCatchupReasonForStalePublicationSample({
        committedFrame: committedFrameSample({
          retainedScrollRevision: 3,
          viewportSample: [10, 20, 1],
        }),
        rawReasons,
        sample: {
          retainedScrollRevision: 3,
          viewport: { x: 10, y: 20, zoom: 1 },
        },
      }),
    ).toBe(rawReasons);
  });

  it("adds content catch-up debt for stale committed viewport samples", () => {
    expect(
      withGpuFlowContentCatchupReasonForStalePublicationSample({
        committedFrame: committedFrameSample({
          retainedScrollRevision: 3,
          viewportSample: [0, 0, 1],
        }),
        rawReasons: ["viewport"],
        sample: {
          retainedScrollRevision: 3,
          viewport: { x: 10, y: 20, zoom: 1 },
        },
      }),
    ).toEqual(["viewport", "manual"]);
  });

  it("strips unchanged viewport motion while keeping content catch-up debt", () => {
    expect(
      withGpuFlowContentCatchupReasonForStalePublicationSample({
        committedFrame: committedFrameSample({
          retainedScrollRevision: 3,
          viewportSample: [0, 0, 1],
        }),
        previousVisibleProjectionState: visibleProjectionStateSample({
          viewport: [10, 20, 1],
        }),
        rawReasons: ["viewport"],
        sample: {
          retainedScrollRevision: 3,
          viewport: { x: 10, y: 20, zoom: 1 },
        },
      }),
    ).toEqual(["manual"]);
  });

  it("keeps viewport motion when the visible sample changes", () => {
    expect(
      withGpuFlowContentCatchupReasonForStalePublicationSample({
        committedFrame: committedFrameSample({
          retainedScrollRevision: 3,
          viewportSample: [0, 0, 1],
        }),
        previousVisibleProjectionState: visibleProjectionStateSample({
          viewport: [0, 0, 1],
        }),
        rawReasons: ["viewport"],
        sample: {
          retainedScrollRevision: 3,
          viewport: { x: 10, y: 20, zoom: 1 },
        },
      }),
    ).toEqual(["viewport", "manual"]);
  });

  it("adds content catch-up debt for stale retained-scroll samples", () => {
    expect(
      withGpuFlowContentCatchupReasonForStalePublicationSample({
        committedFrame: committedFrameSample({
          retainedScrollRevision: 2,
          viewportSample: [10, 20, 1],
        }),
        rawReasons: ["retained-scroll"],
        sample: {
          retainedScrollRevision: 3,
          viewport: { x: 10, y: 20, zoom: 1 },
        },
      }),
    ).toEqual(["retained-scroll", "manual"]);
  });

  it("does not duplicate existing content reasons", () => {
    expect(
      withGpuFlowContentCatchupReasonForStalePublicationSample({
        committedFrame: committedFrameSample({
          retainedScrollRevision: 2,
          viewportSample: [0, 0, 1],
        }),
        rawReasons: ["viewport", "manual"],
        sample: {
          retainedScrollRevision: 3,
          viewport: { x: 10, y: 20, zoom: 1 },
        },
      }),
    ).toEqual(["viewport", "manual"]);
  });

  it("requests retained-scroll catch-up when the visible sample is stale", () => {
    const retainedContentRuntimeState = createGpuRetainedContentRuntimeState();
    setGpuRetainedContentRuntimeScrollOffset({
      scrollOffset: { x: 0, y: 120 },
      state: retainedContentRuntimeState,
      surfaceId: "surface-a",
    });

    expect(
      shouldRequestGpuFlowRetainedScrollCatchupFrame({
        retainedContentRuntimeState,
        visibleProjectionState: {
          sample: {
            retainedScrollOffsets: new Map([["surface-a", { x: 0, y: 120 }]]),
            retainedScrollRevision: 0,
          },
        } as never,
      }),
    ).toBe(true);
    expect(
      shouldRequestGpuFlowRetainedScrollCatchupFrame({
        retainedContentRuntimeState,
        visibleProjectionState: {
          sample: {
            retainedScrollOffsets: new Map([["surface-a", { x: 0, y: 0 }]]),
            retainedScrollRevision: 1,
          },
        } as never,
      }),
    ).toBe(true);
    expect(
      shouldRequestGpuFlowRetainedScrollCatchupFrame({
        retainedContentRuntimeState,
        visibleProjectionState: {
          sample: {
            retainedScrollOffsets: new Map([["surface-a", { x: 0, y: 120 }]]),
            retainedScrollRevision: 1,
          },
        } as never,
      }),
    ).toBe(false);
    expect(
      shouldRequestGpuFlowRetainedScrollCatchupFrame({
        retainedContentRuntimeState,
        visibleProjectionState: null,
      }),
    ).toBe(false);
  });

  it("does not defer resolution updates for stale committed samples", () => {
    expect(
      shouldDeferGpuFlowContentPublicationResolutionUpdatesForSample({
        committedFrame: committedFrameSample({
          retainedScrollRevision: 2,
          viewportSample: [0, 0, 1],
        }),
        deferResolutionUpdates: true,
        sample: {
          retainedScrollRevision: 2,
          viewport: { x: 10, y: 20, zoom: 1 },
        },
      }),
    ).toBe(false);
    expect(
      shouldDeferGpuFlowContentPublicationResolutionUpdatesForSample({
        committedFrame: committedFrameSample({
          retainedScrollRevision: 2,
          viewportSample: [10, 20, 1],
        }),
        deferResolutionUpdates: true,
        sample: {
          retainedScrollRevision: 2,
          viewport: { x: 10, y: 20, zoom: 1 },
        },
      }),
    ).toBe(true);
  });

  it("defers viewport-frame content resolution when a previous presentation can be projected", () => {
    expect(
      shouldDeferGpuFlowContentPublicationResolutionUpdatesForFrame({
        committedFrame: committedFrameSample({
          retainedScrollRevision: 2,
          viewportSample: [0, 0, 1],
        }),
        deferResolutionUpdates: false,
        hasPreviousVisibleProjectionState: true,
        sample: {
          retainedScrollRevision: 2,
          viewport: { x: 10, y: 20, zoom: 1 },
        },
        viewportFrame: true,
      }),
    ).toBe(true);
    expect(
      shouldDeferGpuFlowContentPublicationResolutionUpdatesForFrame({
        committedFrame: committedFrameSample({
          retainedScrollRevision: 2,
          viewportSample: [0, 0, 1],
        }),
        deferResolutionUpdates: false,
        hasPreviousVisibleProjectionState: false,
        sample: {
          retainedScrollRevision: 2,
          viewport: { x: 10, y: 20, zoom: 1 },
        },
        viewportFrame: true,
      }),
    ).toBe(false);
  });

  it("does not treat the startup committed frame as published content", () => {
    expect(hasGpuFlowCommittedContentFrame(null)).toBe(false);
    expect(
      hasGpuFlowCommittedContentFrame(
        committedContentFrame({ retainedDisplayFrame: null }),
      ),
    ).toBe(false);
  });

  it("treats committed retained-display frames as content", () => {
    expect(
      hasGpuFlowCommittedContentFrame(
        committedContentFrame({
          retainedDisplayFrame: {} as RetainedDisplayFrame,
        }),
      ),
    ).toBe(true);
  });
});

function committedFrameSample({
  retainedScrollRevision,
  viewportSample,
}: {
  readonly retainedScrollRevision: number;
  readonly viewportSample: GpuViewportInput;
}): Pick<GpuFlowCommittedSurfaceFrame, "coherence" | "viewportSample"> {
  return {
    coherence: {
      retainedScrollRevision,
    } as GpuFlowCommittedSurfaceFrame["coherence"],
    viewportSample,
  };
}

function committedContentFrame({
  retainedDisplayFrame,
}: {
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
}): Pick<GpuFlowCommittedSurfaceFrame, "retainedDisplayFrame"> {
  return {
    retainedDisplayFrame,
  };
}

function visibleProjectionStateSample({
  viewport,
}: {
  readonly viewport: GpuViewportInput;
}) {
  return { sample: { viewport } } as never;
}
