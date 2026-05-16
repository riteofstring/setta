import { TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY } from "testUtils/gpuRetainedTextLikePolicy";
import { describe, expect, it } from "vitest";

import { getGpuRetainedContentTexturePageFrameSurfaces } from "./GpuRetainedContentPageFrameSurfaces";
import { createGpuRetainedRowContentScene } from "./retainedContentScene";
import { createGpuRetainedRuntimeFrame } from "./retainedRuntimeFrame";
import type { GpuContentSurface } from "./scene";

describe("getGpuRetainedContentTexturePageFrameSurfaces", () => {
  it("tracks retained content freshness at row segments instead of whole surfaces", () => {
    const first = pageSurface({
      hovered: false,
      switchChecked: false,
    });
    const hovered = pageSurface({
      hovered: true,
      switchChecked: false,
    });
    const switched = pageSurface({
      hovered: false,
      switchChecked: true,
    });

    const firstFrame = getGpuRetainedContentTexturePageFrameSurfaces([
      first,
    ])[0];
    const hoveredFrame = getGpuRetainedContentTexturePageFrameSurfaces([
      hovered,
    ])[0];
    const switchedFrame = getGpuRetainedContentTexturePageFrameSurfaces([
      switched,
    ])[0];

    expect(firstFrame?.contentVersion).toBe(hoveredFrame?.contentVersion);
    expect(firstFrame?.contentVersion).toBe(switchedFrame?.contentVersion);
    expect(segmentVersion(firstFrame, "row-a")).toBe(
      segmentVersion(hoveredFrame, "row-a"),
    );
    expect(segmentVersion(firstFrame, "row-b")).toBe(
      segmentVersion(switchedFrame, "row-b"),
    );
    expect(segmentVersion(firstFrame, "row-a")).not.toBe(
      segmentVersion(switchedFrame, "row-a"),
    );
  });

  it("keeps passive source identity stable when one text row becomes a native island", () => {
    const inactiveFrame = createGpuRetainedRuntimeFrame({
      devicePixelRatioBucket: 1,
      frameId: 1,
      scene: sceneWithSurface(
        textLikePageSurface({ nativeControlActive: false }),
      ),
      scrollOffsets: new Map(),
      scrollRevision: 1,
      viewport: [0, 0, 1],
      viewportZoomBucket: 1,
    });
    const activeFrame = createGpuRetainedRuntimeFrame({
      devicePixelRatioBucket: 1,
      frameId: 2,
      scene: sceneWithSurface(
        textLikePageSurface({ nativeControlActive: true }),
      ),
      scrollOffsets: new Map(),
      scrollRevision: 2,
      viewport: [0, 0, 1],
      viewportZoomBucket: 1,
    });
    const inactiveSurface = inactiveFrame.descriptors.contentPageSurfaces[0];
    const activeSurface = activeFrame.descriptors.contentPageSurfaces[0];

    expect(inactiveSurface?.sourceKey).toBe(activeSurface?.sourceKey);
    expect(inactiveSurface?.textLikeSnapshots).toHaveLength(1);
    expect(activeSurface?.textLikeSnapshots).toHaveLength(0);
    expect(segmentVersion(inactiveSurface, "row-a")).not.toBe(
      segmentVersion(activeSurface, "row-a"),
    );
    expect(segmentVersion(inactiveSurface, "row-b")).toBe(
      segmentVersion(activeSurface, "row-b"),
    );
  });

  it("describes visible retained pages in absolute content coordinates", () => {
    const frame = createGpuRetainedRuntimeFrame({
      devicePixelRatioBucket: 1,
      frameId: 3,
      scene: sceneWithSurface(scrollablePageSurface()),
      scrollOffsets: new Map([["surface-a", { x: 0, y: 24 }]]),
      scrollRevision: 2,
      viewport: [0, 0, 1],
      viewportZoomBucket: 1,
    });
    const surface = frame.descriptors.contentPageSurfaces[0];

    expect(surface?.visibleSourceRectCss).toEqual({
      height: 48,
      width: 240,
      x: 0,
      y: 24,
    });
    expect(surface?.layout.textureSourceRect).toEqual(
      surface?.visibleSourceRectCss,
    );
    expect(surface?.sourceWindowCss.y).toBe(0);
  });
});

function segmentVersion(
  surface:
    | ReturnType<typeof getGpuRetainedContentTexturePageFrameSurfaces>[number]
    | undefined,
  id: string,
): number | undefined {
  return surface?.contentSegments?.find((segment) => segment.id === id)
    ?.contentVersion;
}

function pageSurface({
  hovered,
  switchChecked,
}: {
  readonly hovered: boolean;
  readonly switchChecked: boolean;
}): GpuContentSurface {
  const rect = { height: 48, width: 240, x: 0, y: 0 };
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
      rowHeight: 24,
      rows: [
        {
          control: {
            checked: switchChecked,
            commitPolicy: "immediate",
            defaultDisplayValue: "false",
            displayValue: String(switchChecked),
            kind: "switch",
            rendererFamily: "switch",
          },
          controlKind: "switch",
          depth: 0,
          id: "row-a",
          label: "Switch",
          state: hovered ? { hovered: true } : undefined,
        },
        {
          controlKind: null,
          depth: 0,
          id: "row-b",
          label: "Unchanged",
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: rect,
    }),
    zIndex: 1,
  };
}

function sceneWithSurface(surface: GpuContentSurface) {
  return {
    contentSurfaces: [surface],
    domIslands: [],
    edges: [],
    revision: 1,
    sections: [],
  };
}

function textLikePageSurface({
  nativeControlActive,
}: {
  readonly nativeControlActive: boolean;
}): GpuContentSurface {
  const rect = { height: 48, width: 240, x: 0, y: 0 };
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
      controlWidth: 96,
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
          id: "row-a",
          label: "Text",
          state: nativeControlActive
            ? { controlFocused: true, nativeControlActive: true }
            : undefined,
        },
        {
          controlKind: null,
          depth: 0,
          id: "row-b",
          label: "Unchanged",
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: rect,
    }),
    zIndex: 1,
  };
}

function scrollablePageSurface(): GpuContentSurface {
  const rect = { height: 48, width: 240, x: 0, y: 0 };
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
      rowHeight: 24,
      rows: Array.from({ length: 5 }, (_, index) => ({
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
