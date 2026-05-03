import { describe, expect, it } from "vitest";
import { createGpuRetainedRowContentScene } from "./retainedContentScene";
import {
  clampGpuRetainedContentScrollOffset,
  resolveGpuRetainedContentWheelScroll,
} from "./retainedContentScroll";
import type { GpuContentSurface, GpuFlowScene } from "./scene";

describe("retained content scroll", () => {
  it("scrolls the topmost retained content surface under the wheel point", () => {
    const scene = sceneWithSurfaces([
      retainedSurface({
        id: "lower",
        rect: { height: 80, width: 160, x: 0, y: 0 },
        zIndex: 1,
      }),
      retainedSurface({
        id: "upper",
        rect: { height: 80, width: 160, x: 0, y: 0 },
        zIndex: 2,
      }),
    ]);

    const result = resolveGpuRetainedContentWheelScroll({
      event: wheel({ deltaY: 48 }),
      point: { x: 20, y: 20 },
      scene,
      scrollOffsets: new Map(),
    });

    expect(result.changed).toBe(true);
    expect(result.surfaceId).toBe("upper");
    expect(result.scrollOffsets.get("upper")).toEqual({ x: 0, y: 48 });
    expect(result.scrollOffsets.has("lower")).toBe(false);
  });

  it("clamps retained content offsets to the virtualized content bounds", () => {
    const surface = retainedSurface({
      id: "params",
      rect: { height: 80, width: 160, x: 0, y: 0 },
    });
    const scene = sceneWithSurfaces([surface]);

    const result = resolveGpuRetainedContentWheelScroll({
      event: wheel({ deltaY: 400 }),
      point: { x: 20, y: 20 },
      scene,
      scrollOffsets: new Map(),
    });

    expect(result.scrollOffsets.get("params")).toEqual({ x: 0, y: 200 });
    expect(
      clampGpuRetainedContentScrollOffset({
        contentRect: surface.retainedScene!.contentRect,
        scrollOffset: { x: 12, y: 400 },
        viewportRect: surface.retainedScene!.viewportRect,
      }),
    ).toEqual({ x: 0, y: 200 });
  });

  it("leaves offsets unchanged when no retained surface can scroll", () => {
    const offsets = new Map([["params", { x: 0, y: 12 }]]);
    const result = resolveGpuRetainedContentWheelScroll({
      event: wheel({ deltaY: 24 }),
      point: { x: 300, y: 20 },
      scene: sceneWithSurfaces([
        retainedSurface({
          id: "params",
          rect: { height: 80, width: 160, x: 0, y: 0 },
        }),
      ]),
      scrollOffsets: offsets,
    });

    expect(result.changed).toBe(false);
    expect(result.scrollOffsets).toBe(offsets);
  });
});

function sceneWithSurfaces(
  contentSurfaces: readonly GpuContentSurface[],
): GpuFlowScene {
  return {
    contentSurfaces,
    domIslands: [],
    edges: [],
    revision: 1,
    sections: [],
  };
}

function retainedSurface({
  id,
  rect,
  zIndex = 1,
}: {
  readonly id: string;
  readonly rect: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  };
  readonly zIndex?: number | undefined;
}): GpuContentSurface {
  return {
    clipRect: rect,
    id,
    ownerSectionId: "section-a",
    rect,
    renderer: { kind: "canvas-content", surfaceId: id },
    retainedScene: createGpuRetainedRowContentScene({
      id,
      ownerSectionId: "section-a",
      rowHeight: 28,
      rows: Array.from({ length: 10 }, (_, index) => ({
        controlKind: "text-like",
        depth: 0,
        id: `param-${index}`,
        label: `Param ${index}`,
      })),
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: rect.height, width: rect.width, x: 0, y: 0 },
    }),
    zIndex,
  };
}

function wheel({
  deltaMode = 0,
  deltaX = 0,
  deltaY = 0,
  shiftKey = false,
}: {
  readonly deltaMode?: number | undefined;
  readonly deltaX?: number | undefined;
  readonly deltaY?: number | undefined;
  readonly shiftKey?: boolean | undefined;
}): Pick<WheelEvent, "deltaMode" | "deltaX" | "deltaY" | "shiftKey"> {
  return { deltaMode, deltaX, deltaY, shiftKey };
}
