import { TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY } from "testUtils/gpuRetainedTextLikePolicy";
import { describe, expect, it } from "vitest";

import { createGpuRetainedContentFrameGeneration } from "./retainedContentFrameGeneration";
import { createGpuRetainedRowContentScene } from "./retainedContentScene";
import type { GpuContentSurface } from "./scene";

describe("createGpuRetainedContentFrameGeneration", () => {
  it("exposes text-like row sources separately from retained content page surfaces", () => {
    const generation = createGpuRetainedContentFrameGeneration({
      contentSurfaces: [surface()],
      viewportZoomBucket: 1,
    });

    expect(generation.sourceSurfaces).toHaveLength(1);
    expect(generation.contentPageSurfaces).toHaveLength(1);
    expect(generation.textLikeRowSnapshotSources).toHaveLength(1);
    expect(generation.textLikeRowSnapshotSources[0]).toEqual(
      expect.objectContaining({
        rowId: "param-a",
        sourceId: expect.stringContaining("surface-a:param-a"),
        targetRectCss: expect.any(Object),
      }),
    );
  });
});

function surface(): GpuContentSurface {
  const retainedScene = createGpuRetainedRowContentScene({
    controlWidth: 80,
    id: "surface-a",
    ownerSectionId: "section-a",
    rowHeight: 24,
    rows: [
      {
        control: {
          commitPolicy: "native-island",
          defaultDisplayValue: "",
          displayValue: "alpha",
          editorKind: "text",
          kind: "text-like",
          policy: TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY,
          rendererFamily: "text-like",
        },
        controlKind: "text-like",
        depth: 0,
        id: "param-a",
        label: "Param A",
      },
    ],
    scrollOffset: { x: 0, y: 12 },
    viewportRect: { height: 48, width: 200, x: 0, y: 0 },
  });
  return {
    clipRect: { height: 200, width: 200, x: 0, y: 0 },
    id: "surface-a",
    ownerSectionId: "section-a",
    rect: { height: 48, width: 200, x: 10, y: 20 },
    renderer: { kind: "canvas-content", surfaceId: "surface-a" },
    retainedScene,
    zIndex: 7,
  };
}
