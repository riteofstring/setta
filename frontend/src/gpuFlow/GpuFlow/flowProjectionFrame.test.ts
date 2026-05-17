import { describe, expect, it } from "vitest";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import {
  createGpuFlowProjectionTransactionForCommittedFrameId,
  type GpuFlowLiveProjectionSample,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import { createGpuRetainedRowContentScene } from "../retainedContentScene";
import type { RetainedContentTexturePageFrameSurface } from "../retainedContentTexturePageManager";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import type { GpuContentSurface, GpuFlowScene } from "../scene";
import type { GpuFlowNodeLayerState } from "./flowLayerState";
import {
  assertGpuFlowProjectionOnlyFrameWork,
  isGpuFlowRetainedProjectionSurfaceCovered,
  resolveGpuFlowProjectionFrameTransaction,
} from "./flowProjectionFrame";

describe("GPU flow projection frame coverage", () => {
  it("requires committed retained pages to cover the projected scroll sample", () => {
    const surface = retainedSurface({ height: 100, width: 100, x: 0, y: 0 });

    expect(
      isGpuFlowRetainedProjectionSurfaceCovered({
        pages: retainedPages([
          { height: 50, width: 100, x: 0, y: 0 },
          { height: 50, width: 100, x: 0, y: 50 },
        ]),
        surface,
      }),
    ).toBe(true);
    expect(
      isGpuFlowRetainedProjectionSurfaceCovered({
        pages: retainedPages([{ height: 60, width: 100, x: 0, y: 0 }]),
        surface,
      }),
    ).toBe(false);
  });

  it("rejects uploads and resource churn during projection-only frames", () => {
    expect(() =>
      assertGpuFlowProjectionOnlyFrameWork({
        frameReasons: ["viewport"],
        layerResult: projectionLayerResult({
          uploadedNodeIds: ["node-a"],
        }),
      }),
    ).toThrow(/forbidden content work/);

    expect(() =>
      assertGpuFlowProjectionOnlyFrameWork({
        frameReasons: ["texture-upload"],
        layerResult: projectionLayerResult({
          uploadedNodeIds: ["node-a"],
        }),
      }),
    ).not.toThrow();

    expect(() =>
      assertGpuFlowProjectionOnlyFrameWork({
        frameReasons: ["retained-scroll", "paint", "texture-upload"],
        layerResult: projectionLayerResult({
          uploadedNodeIds: ["node-a"],
        }),
      }),
    ).toThrow(/forbidden content work/);

    expect(() =>
      assertGpuFlowProjectionOnlyFrameWork({
        frameReasons: ["retained-scroll", "paint", "texture-upload"],
        layerResult: projectionLayerResult({
          remainingDirtyNodeIds: ["node-a"],
          skippedNodeIds: ["node-a"],
        }),
      }),
    ).not.toThrow();
  });

  it("holds the previous transaction sample when retained projection coverage is missing", () => {
    const previousSample = liveSample({
      id: 1,
      retainedScrollY: 0,
    });
    const requestedSample = liveSample({
      id: 2,
      retainedScrollY: 400,
    });
    const requestedTransaction =
      createGpuFlowProjectionTransactionForCommittedFrameId({
        committedFrameId: 12,
        kind: "motion-projection",
        lane: "motion",
        rawReasons: ["retained-scroll", "paint", "texture-upload"],
        sample: requestedSample,
      });

    const result = resolveGpuFlowProjectionFrameTransaction({
      frameReasons: ["retained-scroll", "paint", "texture-upload"],
      heldPreviousProjectionState: visibleProjectionState({
        committedFrameId: 11,
        sample: previousSample,
      }),
      layer: retainedLayer(),
      retainedDisplayFrame: retainedDisplayFrame(),
      requestedTransaction,
    });

    expect(result.transaction.kind).toBe("held-previous");
    expect(result.transaction.committedFrameId).toBe(11);
    expect(result.transaction.sample.id).toBe(1);
    expect(result.retainedProjectionFrame.needsRetainedPageMaintenance).toBe(
      true,
    );
  });
});

function retainedSurface(
  visibleSourceRectCss: RetainedContentTexturePageFrameSurface["visibleSourceRectCss"],
): RetainedContentTexturePageFrameSurface {
  return {
    visibleSourceRectCss,
  } as RetainedContentTexturePageFrameSurface;
}

function retainedPages(
  rects: readonly RetainedDisplayFrame["drawRegions"][number]["page"]["descriptor"]["sourceRectCss"][],
): ReadonlyMap<string, RetainedDisplayFrame["drawRegions"][number]["page"]> {
  return new Map(
    rects.map((sourceRectCss, index) => [
      `page-${index}`,
      {
        descriptor: {
          sourceRectCss,
        },
      } as RetainedDisplayFrame["drawRegions"][number]["page"],
    ]),
  );
}

function projectionLayerResult(
  overrides: Partial<
    Parameters<typeof assertGpuFlowProjectionOnlyFrameWork>[0]["layerResult"]
  > = {},
): Parameters<typeof assertGpuFlowProjectionOnlyFrameWork>[0]["layerResult"] {
  return {
    budgetExhausted: false,
    deferredNodeIds: [],
    evictedTextureBytes: 0,
    evictedTextureNodeIds: [],
    missingElementNodeIds: [],
    remainingDirtyNodeIds: [],
    skippedNodeIds: [],
    uploadedNodeIds: [],
    ...overrides,
  };
}

function liveSample({
  id,
  retainedScrollY,
}: {
  readonly id: number;
  readonly retainedScrollY: number;
}): GpuFlowLiveProjectionSample {
  return {
    cssViewport: { height: 100, width: 100 },
    devicePixelRatio: 1,
    gestureOwner: "idle",
    id,
    retainedScrollDelta: new Map([["surface-a", { x: 0, y: retainedScrollY }]]),
    retainedScrollOffsets: new Map([
      ["surface-a", { x: 0, y: retainedScrollY }],
    ]),
    retainedScrollRevision: id,
    retainedScrollVelocityCssPxPerMs: new Map([["surface-a", { x: 0, y: 0 }]]),
    timestamp: id,
    viewport: { x: 0, y: 0, zoom: 1 },
    viewportDelta: { x: 0, y: 0, zoom: 0 },
    viewportVelocityCssPxPerMs: { x: 0, y: 0, zoom: 0 },
  };
}

function visibleProjectionState({
  committedFrameId,
  sample,
}: {
  readonly committedFrameId: number;
  readonly sample: GpuFlowLiveProjectionSample;
}): GpuFlowVisibleProjectionState {
  const transaction = createGpuFlowProjectionTransactionForCommittedFrameId({
    committedFrameId,
    kind: "motion-projection",
    lane: "motion",
    rawReasons: ["retained-scroll"],
    sample,
  });
  return {
    committedFrame: {
      displayFrameId: committedFrameId,
    } as GpuFlowCommittedSurfaceFrame,
    debugState: {
      committedFrameId,
      lane: "motion",
      projectionSampleId: sample.id,
      projectionTransactionId: transaction.id,
      transactionKind: transaction.kind,
    },
    sample,
    transaction,
  };
}

function retainedLayer(): GpuFlowNodeLayerState {
  return {
    scene: retainedScene(),
    viewport: { x: 0, y: 0, zoom: 1 },
  } as GpuFlowNodeLayerState;
}

function retainedScene(): GpuFlowScene {
  return {
    contentSurfaces: [retainedContentSurface()],
    domIslands: [],
    edges: [],
    revision: 1,
    sections: [],
  };
}

function retainedContentSurface(): GpuContentSurface {
  const rect = { height: 100, width: 100, x: 0, y: 0 };
  return {
    clipRect: rect,
    id: "surface-a",
    ownerSectionId: "section-a",
    rect,
    renderer: {
      kind: "canvas-content",
      surfaceId: "surface-a",
    },
    retainedScene: createGpuRetainedRowContentScene({
      id: "surface-a",
      ownerSectionId: "section-a",
      rowHeight: 20,
      rows: Array.from({ length: 30 }, (_, index) => ({
        controlKind: null,
        depth: 0,
        id: `row-${index}`,
        label: `Row ${index}`,
      })),
      scrollOffset: { x: 0, y: 0 },
      viewportRect: rect,
    }),
    zIndex: 1,
  };
}

function retainedDisplayFrame(): RetainedDisplayFrame {
  return {
    drawRegions: [
      {
        page: {
          descriptor: {
            sourceRectCss: { height: 100, width: 100, x: 0, y: 0 },
            surfaceId: "surface-a",
          },
          key: "page-a",
        },
        sampleRectCss: { height: 100, width: 100, x: 0, y: 0 },
      },
    ],
    flatSurfaces: [],
    retainedRuntimeFrame: {
      input: {
        scrollOffsets: new Map([["surface-a", { x: 0, y: 0 }]]),
        viewportZoomBucket: 1,
      },
    },
  } as unknown as RetainedDisplayFrame;
}
