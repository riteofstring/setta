import { describe, expect, it } from "vitest";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import type { GpuViewportInput } from "../viewportMath";
import {
  hasGpuFlowCommittedContentFrame,
  shouldDeferGpuFlowContentPublicationResolutionUpdatesForSample,
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
