import { describe, expect, it } from "vitest";

import type { GpuFrameReason } from "../gpuRenderer";
import type { GpuFlowPreparedContentFrame } from "../preparedContentFrame";
import {
  createGpuRetainedContentRuntimeState,
  setGpuRetainedContentRuntimeScrollOffset,
} from "../retainedContentRuntimeState";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import type { GpuViewportInput } from "../viewportMath";
import {
  shouldDeferGpuFlowContentPreparationResolutionUpdatesForFrame,
  shouldDeferGpuFlowContentPreparationResolutionUpdatesForSample,
} from "./visibleFrameResolutionDeferral";
import {
  hasGpuFlowPresentedContentFrame,
  shouldRequestGpuFlowRetainedScrollCatchupFrame,
  withGpuFlowContentCatchupReasonForStalePreparedContentSample,
} from "./visibleFrameSurfaceFrame";

describe("GPU Flow surface frame presentation", () => {
  it("keeps raw reasons unchanged when the presented sample is current", () => {
    const rawReasons: readonly GpuFrameReason[] = ["viewport"];

    expect(
      withGpuFlowContentCatchupReasonForStalePreparedContentSample({
        preparedContentFrame: preparedContentFrameSample({
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

  it("adds content catch-up debt for stale presented viewport samples", () => {
    expect(
      withGpuFlowContentCatchupReasonForStalePreparedContentSample({
        preparedContentFrame: preparedContentFrameSample({
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
      withGpuFlowContentCatchupReasonForStalePreparedContentSample({
        preparedContentFrame: preparedContentFrameSample({
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
      withGpuFlowContentCatchupReasonForStalePreparedContentSample({
        preparedContentFrame: preparedContentFrameSample({
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
      withGpuFlowContentCatchupReasonForStalePreparedContentSample({
        preparedContentFrame: preparedContentFrameSample({
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
      withGpuFlowContentCatchupReasonForStalePreparedContentSample({
        preparedContentFrame: preparedContentFrameSample({
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

  it("does not defer resolution updates for stale presented samples", () => {
    expect(
      shouldDeferGpuFlowContentPreparationResolutionUpdatesForSample({
        preparedContentFrame: null,
        deferResolutionUpdates: true,
        sample: {
          retainedScrollRevision: 2,
          viewport: { x: 10, y: 20, zoom: 1 },
        },
      }),
    ).toBe(false);
    expect(
      shouldDeferGpuFlowContentPreparationResolutionUpdatesForSample({
        preparedContentFrame: preparedContentFrameSample({
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
      shouldDeferGpuFlowContentPreparationResolutionUpdatesForSample({
        preparedContentFrame: preparedContentFrameSample({
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

  it("uses coordinator resolution deferral for viewport-frame content catchup", () => {
    expect(
      shouldDeferGpuFlowContentPreparationResolutionUpdatesForFrame({
        preparedContentFrame: preparedContentFrameSample({
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
    ).toBe(false);
    expect(
      shouldDeferGpuFlowContentPreparationResolutionUpdatesForFrame({
        preparedContentFrame: preparedContentFrameSample({
          retainedScrollRevision: 2,
          viewportSample: [0, 0, 1],
        }),
        deferResolutionUpdates: true,
        hasPreviousVisibleProjectionState: true,
        sample: {
          retainedScrollRevision: 2,
          viewport: { x: 10, y: 20, zoom: 1 },
        },
        viewportFrame: true,
      }),
    ).toBe(true);
    expect(
      shouldDeferGpuFlowContentPreparationResolutionUpdatesForFrame({
        preparedContentFrame: preparedContentFrameSample({
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

  it("does not treat the startup prepared content frame as presented content", () => {
    expect(hasGpuFlowPresentedContentFrame(null)).toBe(false);
    expect(
      hasGpuFlowPresentedContentFrame(
        presentedContentFrame({ retainedDisplayFrame: null }),
      ),
    ).toBe(false);
  });

  it("treats presented retained-display frames as content", () => {
    expect(
      hasGpuFlowPresentedContentFrame(
        presentedContentFrame({
          retainedDisplayFrame: {} as RetainedDisplayFrame,
        }),
      ),
    ).toBe(true);
  });
});

function preparedContentFrameSample({
  retainedScrollRevision,
  viewportSample,
}: {
  readonly retainedScrollRevision: number;
  readonly viewportSample: GpuViewportInput;
}): Pick<GpuFlowPreparedContentFrame, "coherence" | "viewportSample"> {
  return {
    coherence: {
      retainedScrollRevision,
    } as GpuFlowPreparedContentFrame["coherence"],
    viewportSample,
  };
}

function presentedContentFrame({
  retainedDisplayFrame,
}: {
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
}): Pick<GpuFlowPreparedContentFrame, "retainedDisplayFrame"> {
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
