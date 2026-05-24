import { TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY } from "testUtils/gpuRetainedTextLikePolicy";
import { describe, expect, it } from "vitest";

import { hitTestGpuRetainedContentRuntimeFrame } from "./retainedContentHitTest";
import { createGpuRetainedRowContentScene } from "./retainedContentScene";
import { createGpuRetainedRuntimeFrame } from "./retainedRuntimeFrame";
import type { GpuContentSurface, GpuFlowScene } from "./scene";

describe("createGpuRetainedRuntimeFrame", () => {
  it("samples sources, pages, native islands, and hit testing from one scroll frame", () => {
    const scene = retainedSceneWithNativeIsland();
    const frame = createGpuRetainedRuntimeFrame({
      devicePixelRatioBucket: 2,
      frameId: 7,
      scene,
      scrollOffsets: new Map([["surface-a", { x: 0, y: 240 }]]),
      scrollRevision: 3,
      viewport: [0, 0, 1],
      viewportZoomBucket: 1,
    });

    const sourceSurface = frame.descriptors.sourceSurfaces[0];
    const pageSurface = frame.descriptors.contentPageSurfaces[0];
    expect(sourceSurface?.textureWindow.sourceRect.y).toBe(240);
    expect(pageSurface?.visibleSourceRectCss.y).toBe(240);
    expect(pageSurface?.sourceKey).toContain('"surfaceId":"surface-a"');
    expect(pageSurface).not.toHaveProperty("domControlTextures");
    expect(
      frame.descriptors.domControlSources.map((source) => source.rowId),
    ).toContain("param-10");
    expect(frame.descriptors.domControlSources[0]).toEqual(
      expect.objectContaining({
        sectionScrollRevision: 3,
        surfaceId: "surface-a",
      }),
    );

    expect(frame.descriptors.nativeDomIslands[0]).toEqual(
      expect.objectContaining({
        id: "island-a",
        rect: expect.objectContaining({ x: 130, y: 20 }),
      }),
    );
    expect(
      hitTestGpuRetainedContentRuntimeFrame({
        frame,
        point: { x: 135, y: 25 },
      }),
    ).toEqual(
      expect.objectContaining({
        hit: expect.objectContaining({
          id: "control:param-10",
          ownerRowId: "param-10",
        }),
        surfaceId: "surface-a",
      }),
    );
  });
});

function retainedSceneWithNativeIsland(): GpuFlowScene {
  return {
    contentSurfaces: [retainedSurface()],
    domIslands: [
      {
        clipOwnerId: "surface-a",
        contentRect: { height: 24, width: 80, x: 0, y: 0 },
        id: "island-a",
        kind: "retained-content-control",
        ownerSectionId: "section-a",
        rect: { height: 24, width: 80, x: 130, y: 20 },
        source: {
          hitRecordId: "control:param-10",
          kind: "retained-content",
          ownerRowId: "param-10",
          surfaceId: "surface-a",
        },
        zIndex: 8,
      },
    ],
    edges: [],
    revision: 11,
    sections: [],
  };
}

function retainedSurface(): GpuContentSurface {
  const retainedScene = createGpuRetainedRowContentScene({
    controlWidth: 80,
    id: "surface-a",
    ownerSectionId: "section-a",
    rowHeight: 24,
    rows: Array.from({ length: 30 }, (_, index) => ({
      control: {
        commitPolicy: "native-island" as const,
        defaultDisplayValue: "",
        displayValue: `value-${index}`,
        editorKind: "text" as const,
        kind: "text-like" as const,
        policy: TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY,
        renderOwner: "dom-owned" as const,
        rendererFamily: "text-like",
      },
      controlKind: "text-like" as const,
      depth: 0,
      id: `param-${index}`,
      label: `Param ${index}`,
    })),
    scrollOffset: { x: 0, y: 0 },
    viewportRect: { height: 48, width: 200, x: 0, y: 0 },
  });
  return {
    clipRect: { height: 48, width: 200, x: 10, y: 20 },
    id: "surface-a",
    ownerSectionId: "section-a",
    rect: { height: 48, width: 200, x: 10, y: 20 },
    renderer: { kind: "canvas-content", surfaceId: "surface-a" },
    retainedScene,
    zIndex: 7,
  };
}
