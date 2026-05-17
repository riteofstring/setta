import { describe, expect, it } from "vitest";

import type { RetainedContentTexturePageFrameSurface } from "../retainedContentTexturePageManager";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import {
  assertGpuFlowProjectionOnlyFrameWork,
  isGpuFlowRetainedProjectionSurfaceCovered,
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
