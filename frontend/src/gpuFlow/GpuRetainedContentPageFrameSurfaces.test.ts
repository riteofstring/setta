import { describe, expect, it } from "vitest";

import { getGpuRetainedContentTexturePageFrameSurfaces } from "./GpuRetainedContentPageFrameSurfaces";
import { createGpuRetainedRowContentScene } from "./retainedContentScene";
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
