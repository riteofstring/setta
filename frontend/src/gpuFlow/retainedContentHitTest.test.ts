import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY } from "testUtils/gpuRetainedTextLikePolicy";
import { hitTestGpuRetainedContentScene } from "./retainedContentHitTest";
import type { GpuRetainedContentHitRecord } from "./retainedContentHitTypes";
import { createGpuRetainedRowContentScene } from "./retainedContentScene";
import type { GpuContentSurface, GpuFlowScene } from "./scene";
import type { GpuPoint, GpuRect } from "./viewportMath";

const RETAINED_HIT_PROPERTY_RUNS = 100;

describe("retained content hit testing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("clips generated hits by both surface and clip rects", () => {
    fc.assert(
      fc.property(
        fc.record({
          clipRect: rectArbitrary({ maxOrigin: 100, maxSize: 100 }),
          point: fc.record({
            x: fc.integer({ max: 150, min: -50 }),
            y: fc.integer({ max: 150, min: -50 }),
          }),
        }),
        ({ clipRect, point }) => {
          const surfaceRect = { height: 100, width: 100, x: 0, y: 0 };
          const hit = hitTestGpuRetainedContentScene({
            point,
            scene: sceneWithSurfaces([
              retainedSurface({
                clipRect,
                id: "params",
                rect: surfaceRect,
              }),
            ]),
          });
          const expectedHit =
            rectContainsPoint(surfaceRect, point) &&
            rectContainsPoint(clipRect, point);

          expect(hit !== null).toBe(expectedHit);
        },
      ),
      { numRuns: RETAINED_HIT_PROPERTY_RUNS },
    );
  });

  it("uses later hit records only when they contain the point", () => {
    fc.assert(
      fc.property(
        fc.record({
          point: fc.record({
            x: fc.integer({ max: 180, min: 20 }),
            y: fc.integer({ max: 180, min: 20 }),
          }),
          secondRect: rectArbitrary({ maxOrigin: 220, maxSize: 80 }),
        }),
        ({ point, secondRect }) => {
          const firstHit: GpuRetainedContentHitRecord = {
            id: "first",
            kind: "row",
            ownerRowId: "param-0",
            rect: { height: 220, width: 220, x: 0, y: 0 },
          };
          const secondHit: GpuRetainedContentHitRecord = {
            id: "second",
            kind: "label",
            ownerRowId: "param-0",
            rect: secondRect,
          };
          const hit = hitTestGpuRetainedContentScene({
            point,
            scene: sceneWithSurfaces([
              retainedSurface({
                hitRecords: [firstHit, secondHit],
                id: "params",
                rect: { height: 240, width: 240, x: 0, y: 0 },
              }),
            ]),
          });

          expect(hit?.hit.id).toBe(
            rectContainsPoint(secondRect, point) ? "second" : "first",
          );
        },
      ),
      { numRuns: RETAINED_HIT_PROPERTY_RUNS },
    );
  });

  it("records retained hit-test diagnostics when a probe is installed", () => {
    const recordHitTest = vi.fn();
    vi.stubGlobal("window", {
      __SETTA_GPU_RETAINED_CONTENT_DIAGNOSTICS__: { recordHitTest },
    });
    const firstHit: GpuRetainedContentHitRecord = {
      id: "first",
      kind: "row",
      ownerRowId: "param-0",
      rect: { height: 220, width: 220, x: 0, y: 0 },
    };
    const secondHit: GpuRetainedContentHitRecord = {
      id: "second",
      kind: "label",
      ownerRowId: "param-0",
      rect: { height: 10, width: 10, x: 500, y: 500 },
    };

    const hit = hitTestGpuRetainedContentScene({
      point: { x: 40, y: 40 },
      scene: sceneWithSurfaces([
        retainedSurface({
          hitRecords: [firstHit, secondHit],
          id: "params",
          rect: { height: 240, width: 240, x: 0, y: 0 },
        }),
      ]),
    });

    expect(hit?.hit.id).toBe("first");
    expect(recordHitTest).toHaveBeenCalledWith(
      expect.objectContaining({
        checkedHitRecordCount: 2,
        contentSurfaceCount: 1,
        matched: true,
        retainedSurfaceCount: 1,
        testedHitRecordCount: 2,
        testedSurfaceCount: 1,
      }),
    );
    expect(recordHitTest.mock.calls[0]?.[0].surfaces).toEqual([
      expect.objectContaining({
        checkedHitRecordCount: 2,
        hitRecordCount: 2,
        matched: true,
        surfaceId: "params",
      }),
    ]);
  });

  it("uses row geometry to limit retained hit record checks", () => {
    const recordHitTest = vi.fn();
    vi.stubGlobal("window", {
      __SETTA_GPU_RETAINED_CONTENT_DIAGNOSTICS__: { recordHitTest },
    });
    const surface = retainedSurface({
      id: "params",
      rect: { height: 112, width: 160, x: 0, y: 0 },
    });
    const scene = sceneWithSurfaces([surface]);
    const hitRecordCount = surface.retainedScene?.hitRecords.length ?? 0;

    const hit = hitTestGpuRetainedContentScene({
      point: { x: 12, y: 14 },
      scene,
    });

    expect(hit).toMatchObject({
      hit: { kind: "label", ownerRowId: "param-0" },
    });
    expect(recordHitTest).toHaveBeenCalledWith(
      expect.objectContaining({
        checkedHitRecordCount: expect.any(Number),
        matched: true,
        testedHitRecordCount: expect.any(Number),
      }),
    );
    const payload = recordHitTest.mock.calls[0]?.[0];
    expect(payload).toBeDefined();
    if (!payload) {
      throw new Error("Expected retained hit-test diagnostics.");
    }
    expect(payload.checkedHitRecordCount).toBeLessThan(hitRecordCount);
    expect(payload.testedHitRecordCount).toBeLessThan(hitRecordCount);
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
  hitRecords,
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
  readonly hitRecords?: readonly GpuRetainedContentHitRecord[] | undefined;
  readonly id: string;
  readonly rect: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  };
  readonly zIndex?: number | undefined;
}): GpuContentSurface {
  const retainedScene = createGpuRetainedRowContentScene({
    controlWidth: 40,
    id,
    ownerSectionId: "section-a",
    rowHeight: 28,
    rows: Array.from({ length: 4 }, (_, index) => ({
      control: {
        commitPolicy: "native-island",
        defaultDisplayValue: "",
        displayValue: "",
        editorKind: "text",
        kind: "text-like",
        policy: TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY,
        rendererFamily: "text-like",
      },
      controlKind: "text-like",
      depth: 0,
      id: `param-${index}`,
      label: `Param ${index}`,
    })),
    scrollOffset: { x: 0, y: 0 },
    viewportRect: { height: rect.height, width: rect.width, x: 0, y: 0 },
  });
  return {
    clipRect: clipRect ?? rect,
    id,
    ownerSectionId: "section-a",
    rect,
    renderer: { kind: "canvas-content", surfaceId: id },
    retainedScene: hitRecords
      ? { ...retainedScene, hitRecords }
      : retainedScene,
    zIndex,
  };
}

function rectArbitrary({
  maxOrigin,
  maxSize,
}: {
  readonly maxOrigin: number;
  readonly maxSize: number;
}) {
  return fc.record({
    height: fc.integer({ max: maxSize, min: 0 }),
    width: fc.integer({ max: maxSize, min: 0 }),
    x: fc.integer({ max: maxOrigin, min: 0 }),
    y: fc.integer({ max: maxOrigin, min: 0 }),
  });
}

function rectContainsPoint(rect: GpuRect, point: GpuPoint): boolean {
  return (
    point.x >= rect.x &&
    point.y >= rect.y &&
    point.x < rect.x + rect.width &&
    point.y < rect.y + rect.height
  );
}
