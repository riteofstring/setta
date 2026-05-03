import { describe, expect, it } from "vitest";

import { hitTestGpuRetainedContentScene } from "./retainedContentHitTest";
import { createGpuRetainedRowContentScene } from "./retainedContentScene";
import type { GpuContentSurface, GpuFlowScene } from "./scene";

describe("retained content hit testing", () => {
  it("hits the topmost retained content record under a flow point", () => {
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

    const hit = hitTestGpuRetainedContentScene({
      point: { x: 140, y: 14 },
      scene,
    });

    expect(hit).toMatchObject({
      hit: {
        id: "control:param-0",
        kind: "control",
        ownerRowId: "param-0",
      },
      localPoint: { x: 140, y: 14 },
      ownerSectionId: "section-a",
      surfaceId: "upper",
      zIndex: 2,
    });
  });

  it("clips retained content hits to the renderer clip rect", () => {
    const scene = sceneWithSurfaces([
      retainedSurface({
        clipRect: { height: 30, width: 160, x: 10, y: 20 },
        id: "params",
        rect: { height: 80, width: 160, x: 10, y: 20 },
      }),
    ]);

    expect(
      hitTestGpuRetainedContentScene({
        point: { x: 20, y: 62 },
        scene,
      }),
    ).toBeNull();
    expect(
      hitTestGpuRetainedContentScene({
        point: { x: 20, y: 32 },
        scene,
      }),
    ).toMatchObject({
      hit: { id: "label:param-0", kind: "label", ownerRowId: "param-0" },
      localPoint: { x: 10, y: 12 },
      surfaceId: "params",
    });
  });

  it("returns null outside retained content surfaces", () => {
    const scene = sceneWithSurfaces([
      retainedSurface({
        id: "params",
        rect: { height: 80, width: 160, x: 0, y: 0 },
      }),
    ]);

    expect(
      hitTestGpuRetainedContentScene({
        point: { x: 180, y: 20 },
        scene,
      }),
    ).toBeNull();
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
  clipRect,
  id,
  rect,
  zIndex = 1,
}: {
  readonly clipRect?:
    | {
        readonly height: number;
        readonly width: number;
        readonly x: number;
        readonly y: number;
      }
    | undefined;
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
    clipRect: clipRect ?? rect,
    id,
    ownerSectionId: "section-a",
    rect,
    renderer: { kind: "canvas-content", surfaceId: id },
    retainedScene: createGpuRetainedRowContentScene({
      controlWidth: 40,
      id,
      ownerSectionId: "section-a",
      rowHeight: 28,
      rows: Array.from({ length: 4 }, (_, index) => ({
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
