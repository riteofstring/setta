import { TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY } from "testUtils/gpuRetainedTextLikePolicy";
import { describe, expect, it } from "vitest";

import { createGpuRetainedContentFrameGeneration } from "./retainedContentFrameGeneration";
import { createGpuRetainedRowContentScene } from "./retainedContentScene";
import type { GpuContentSurface } from "./scene";

describe("createGpuRetainedContentFrameGeneration", () => {
  it("attaches text-like row snapshots to the owning retained content page surface", () => {
    const generation = createGpuRetainedContentFrameGeneration({
      contentSurfaces: [surface()],
      viewportZoomBucket: 1,
    });

    expect(generation.sourceSurfaces).toHaveLength(1);
    expect(generation.contentPageSurfaces).toHaveLength(1);
    expect(generation.domControlSources).toHaveLength(1);
    expect(generation.contentPageSurfaces[0]?.domControlTextures).toEqual([
      expect.objectContaining({
        rectCss: generation.domControlSources[0]?.textureRectCssPx,
        rowId: "param-a",
        sourceId: generation.domControlSources[0]?.sourceId,
      }),
    ]);
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
          renderOwner: "dom-owned",
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
