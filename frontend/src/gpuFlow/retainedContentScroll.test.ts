import { TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY } from "testUtils/gpuRetainedTextLikePolicy";
import { describe, expect, it } from "vitest";
import { createGpuRetainedContentSampledSceneForSurface } from "./retainedContentRuntimeSampling";
import { createGpuRetainedRowContentScene } from "./retainedContentScene";
import {
  clampGpuRetainedContentScrollOffset,
  resolveGpuRetainedContentDragAutoScroll,
  resolveGpuRetainedContentWheelScroll,
  resolveGpuRetainedContentWheelScrollOffset,
} from "./retainedContentScroll";
import { createGpuRetainedRuntimeFrame } from "./retainedRuntimeFrame";
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
    expect(
      clampGpuRetainedContentScrollOffset({
        contentRect: surface.retainedScene!.contentRect,
        scrollOffset: { x: -12, y: -4 },
        viewportRect: surface.retainedScene!.viewportRect,
      }),
    ).toEqual({ x: 0, y: 0 });
    expect(() =>
      clampGpuRetainedContentScrollOffset({
        contentRect: surface.retainedScene!.contentRect,
        scrollOffset: { x: Number.NaN, y: 0 },
        viewportRect: surface.retainedScene!.viewportRect,
      }),
    ).toThrow("retained content scroll x must be a finite number.");
  });

  it("ignores wheel up at the top of a retained scroll surface", () => {
    const offsets = new Map([["params", { x: 0, y: 0 }]]);
    const result = resolveGpuRetainedContentWheelScroll({
      event: wheel({ deltaY: -24 }),
      point: { x: 20, y: 20 },
      scene: sceneWithSurfaces([
        retainedSurface({
          id: "params",
          rect: { height: 80, width: 160, x: 0, y: 0 },
        }),
      ]),
      scrollOffsets: offsets,
    });

    expect(result.changed).toBe(false);
    expect(result.handled).toBe(true);
    expect(result.surfaceId).toBe("params");
    expect(result.scrollOffsets).toBe(offsets);
  });

  it("allows negative horizontal wheel deltas when no horizontal range exists", () => {
    const result = resolveGpuRetainedContentWheelScroll({
      event: wheel({ deltaX: -1, deltaY: 24 }),
      point: { x: 20, y: 20 },
      scene: sceneWithSurfaces([
        retainedSurface({
          id: "params",
          rect: { height: 80, width: 160, x: 0, y: 0 },
        }),
      ]),
      scrollOffsets: new Map(),
    });

    expect(result.changed).toBe(true);
    expect(result.scrollOffsets.get("params")).toEqual({ x: 0, y: 24 });
  });

  it("clamps shift-wheel horizontal scroll to the retained content range", () => {
    const result = resolveGpuRetainedContentWheelScroll({
      event: wheel({ deltaY: 40, shiftKey: true }),
      point: { x: 20, y: 20 },
      scene: sceneWithSurfaces([
        retainedSurface({
          contentWidth: 260,
          id: "params",
          rect: { height: 80, width: 160, x: 0, y: 0 },
        }),
      ]),
      scrollOffsets: new Map([["params", { x: 96, y: 0 }]]),
    });

    expect(result.changed).toBe(true);
    expect(result.scrollOffsets.get("params")).toEqual({ x: 100, y: 0 });
  });

  it("leaves offsets unchanged when wheel input pushes past the bottom boundary", () => {
    const offsets = new Map([["params", { x: 0, y: 200 }]]);
    const result = resolveGpuRetainedContentWheelScroll({
      event: wheel({ deltaY: 24 }),
      point: { x: 20, y: 20 },
      scene: sceneWithSurfaces([
        retainedSurface({
          id: "params",
          rect: { height: 80, width: 160, x: 0, y: 0 },
        }),
      ]),
      scrollOffsets: offsets,
    });

    expect(result.changed).toBe(false);
    expect(result.handled).toBe(true);
    expect(result.surfaceId).toBe("params");
    expect(result.scrollOffsets).toBe(offsets);
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
    expect(result.handled).toBe(false);
    expect(result.scrollOffsets).toBe(offsets);
  });

  it("marks retained boundary wheel offsets as handled without a next offset", () => {
    const result = resolveGpuRetainedContentWheelScrollOffset({
      event: wheel({ deltaY: 24 }),
      point: { x: 20, y: 20 },
      scene: sceneWithSurfaces([
        retainedSurface({
          id: "params",
          rect: { height: 80, width: 160, x: 0, y: 0 },
        }),
      ]),
      scrollOffsets: new Map([["params", { x: 0, y: 200 }]]),
    });

    expect(result).toEqual({
      changed: false,
      handled: true,
      scrollOffset: null,
      surfaceId: "params",
    });
  });

  it("uses the published retained runtime frame for wheel ownership when supplied", () => {
    const publishedSurface = retainedSurface({
      id: "published",
      rect: { height: 80, width: 160, x: 0, y: 0 },
      zIndex: 1,
    });
    const desiredSurface = retainedSurface({
      id: "desired",
      rect: { height: 80, width: 160, x: 0, y: 0 },
      zIndex: 2,
    });
    const retainedRuntimeFrame = createGpuRetainedRuntimeFrame({
      devicePixelRatioBucket: 1,
      frameId: 1,
      scene: sceneWithSurfaces([publishedSurface]),
      scrollOffsets: new Map(),
      scrollRevision: 1,
      viewport: [0, 0, 1],
      viewportZoomBucket: 1,
    });

    const result = resolveGpuRetainedContentWheelScrollOffset({
      event: wheel({ deltaY: 24 }),
      point: { x: 20, y: 20 },
      retainedRuntimeFrame,
      scene: sceneWithSurfaces([desiredSurface]),
      scrollOffsets: new Map(),
    });

    expect(result).toEqual({
      changed: true,
      handled: true,
      scrollOffset: { x: 0, y: 24 },
      surfaceId: "published",
    });
  });

  it("samples retained content scroll for only the affected surface", () => {
    const params = retainedSurface({
      id: "params",
      rect: { height: 80, width: 160, x: 0, y: 0 },
    });
    const sibling = retainedSurface({
      id: "sibling",
      rect: { height: 80, width: 160, x: 200, y: 0 },
    });
    const scene = sceneWithSurfaces([params, sibling]);

    const sampledScene = createGpuRetainedContentSampledSceneForSurface({
      scrollOffsets: new Map([["params", { x: 0, y: 84 }]]),
      surface: params as GpuContentSurface & {
        readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
      },
    });

    expect(sampledScene.scrollOffset).toEqual({ x: 0, y: 84 });
    expect(sampledScene.rows[0]?.id).toBe("param-1");
    expect(scene.contentSurfaces[0]).toBe(params);
    expect(scene.contentSurfaces[1]).toBe(sibling);
    expect(params.retainedScene?.scrollOffset).toEqual({ x: 0, y: 0 });
  });

  it("autoscrolls a retained surface from a drag point near the viewport edge", () => {
    const offsets = new Map([["params", { x: 0, y: 24 }]]);
    const result = resolveGpuRetainedContentDragAutoScroll({
      maxSpeedPx: 20,
      point: { x: 20, y: 76 },
      scene: sceneWithSurfaces([
        retainedSurface({
          id: "params",
          rect: { height: 80, width: 160, x: 0, y: 0 },
        }),
      ]),
      scrollOffsets: offsets,
      surfaceId: "params",
    });

    expect(result.changed).toBe(true);
    expect(result.surfaceId).toBe("params");
    expect(result.scrollOffsets.get("params")?.y).toBeGreaterThan(24);
    expect(result.scrollOffsets.get("params")?.y).toBeLessThanOrEqual(44);
  });

  it("does not autoscroll retained drags outside the viewport cross axis", () => {
    const offsets = new Map([["params", { x: 0, y: 24 }]]);
    const result = resolveGpuRetainedContentDragAutoScroll({
      point: { x: 220, y: 76 },
      scene: sceneWithSurfaces([
        retainedSurface({
          id: "params",
          rect: { height: 80, width: 160, x: 0, y: 0 },
        }),
      ]),
      scrollOffsets: offsets,
      surfaceId: "params",
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
  contentWidth,
  id,
  rect,
  zIndex = 1,
}: {
  readonly contentWidth?: number | undefined;
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
    id,
    ownerSectionId: "section-a",
    rowHeight: 28,
    rows: Array.from({ length: 10 }, (_, index) => ({
      control: {
        defaultDisplayValue: "",
        displayValue: `Value ${index}`,
        editorKind: "text",
        kind: "text-like",
        policy: TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY,
        rendererFamily: "text-like",
        commitPolicy: "native-island",
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
    clipRect: rect,
    id,
    ownerSectionId: "section-a",
    rect,
    renderer: { kind: "canvas-content", surfaceId: id },
    retainedScene:
      contentWidth === undefined
        ? retainedScene
        : {
            ...retainedScene,
            contentRect: {
              ...retainedScene.contentRect,
              width: contentWidth,
            },
          },
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
