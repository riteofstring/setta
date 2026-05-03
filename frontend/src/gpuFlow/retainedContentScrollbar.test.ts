import { describe, expect, it } from "vitest";

import type { GpuRetainedContentHitTarget } from "./retainedContentHitTest";
import { hitTestGpuRetainedContentScene } from "./retainedContentHitTest";
import { createGpuRetainedRowContentScene } from "./retainedContentScene";
import {
  createGpuRetainedContentScrollbarLayouts,
  resolveGpuRetainedContentScrollbarThumbDrag,
  resolveGpuRetainedContentScrollbarTrackClick,
} from "./retainedContentScrollbar";
import type { GpuContentSurface, GpuFlowScene } from "./scene";

describe("retained content scrollbars", () => {
  it("creates vertical scrollbar geometry from retained scene scroll metadata", () => {
    const layouts = createGpuRetainedContentScrollbarLayouts({
      contentRect: { height: 280, width: 160 },
      scrollOffset: { x: 0, y: 40 },
      viewportRect: { height: 80, width: 160, x: 0, y: 0 },
    });

    expect(layouts).toHaveLength(1);
    expect(layouts[0]).toMatchObject({
      axis: "y",
      maxOffset: 200,
      trackRect: { height: 76, width: 8, x: 150, y: 2 },
      viewportLength: 80,
    });
    expect(layouts[0]?.thumbRect).toMatchObject({
      width: 8,
      x: 150,
    });
    expect(layouts[0]?.thumbRect.height).toBeCloseTo(21.714, 3);
    expect(layouts[0]?.thumbRect.y).toBeCloseTo(12.857, 3);
  });

  it("creates horizontal scrollbar geometry only when horizontal overflow exists", () => {
    const layouts = createGpuRetainedContentScrollbarLayouts({
      contentRect: { height: 80, width: 260 },
      scrollOffset: { x: 50, y: 0 },
      viewportRect: { height: 80, width: 160, x: 0, y: 0 },
    });

    expect(layouts).toHaveLength(1);
    expect(layouts[0]).toMatchObject({
      axis: "x",
      maxOffset: 100,
      trackRect: { height: 8, width: 156, x: 2, y: 70 },
      viewportLength: 160,
    });
    expect(layouts[0]?.thumbRect).toMatchObject({
      height: 8,
      y: 70,
    });
    expect(layouts[0]?.thumbRect.width).toBeCloseTo(96, 3);
    expect(layouts[0]?.thumbRect.x).toBeCloseTo(32, 3);
  });

  it("pages retained content from scrollbar track clicks", () => {
    const scene = sceneWithRetainedSurface();
    const trackHit = requiredHit(scene, { x: 154, y: 70 });

    const result = resolveGpuRetainedContentScrollbarTrackClick({
      hit: trackHit,
      scene,
      scrollOffsets: new Map(),
    });

    expect(result.changed).toBe(true);
    expect(result.surfaceId).toBe("surface-a");
    expect(result.scrollOffsets.get("surface-a")).toEqual({ x: 0, y: 80 });
  });

  it("maps retained scrollbar thumb drags back to content offsets", () => {
    const scene = sceneWithRetainedSurface();
    const thumbHit = requiredHit(scene, { x: 154, y: 12 });
    const layout = createGpuRetainedContentScrollbarLayouts({
      contentRect: scene.contentSurfaces[0]!.retainedScene!.contentRect,
      scrollOffset: { x: 0, y: 0 },
      viewportRect: scene.contentSurfaces[0]!.retainedScene!.viewportRect,
    })[0]!;
    const trackTravel = layout.trackRect.height - layout.thumbRect.height;

    const result = resolveGpuRetainedContentScrollbarThumbDrag({
      activeHit: thumbHit,
      flowPoint: { x: 154, y: thumbHit.localPoint.y + trackTravel / 2 },
      scene,
      scrollOffsets: new Map(),
    });

    expect(result.changed).toBe(true);
    expect(result.surfaceId).toBe("surface-a");
    expect(result.scrollOffsets.get("surface-a")?.x).toBe(0);
    expect(result.scrollOffsets.get("surface-a")?.y).toBeCloseTo(100, 3);
  });
});

function sceneWithRetainedSurface(): GpuFlowScene {
  return {
    contentSurfaces: [retainedSurface()],
    domIslands: [],
    edges: [],
    revision: 1,
    sections: [],
  };
}

function retainedSurface(): GpuContentSurface {
  const rect = { height: 80, width: 160, x: 0, y: 0 };
  return {
    clipRect: rect,
    id: "surface-a",
    ownerSectionId: "section-a",
    rect,
    renderer: { kind: "canvas-content", surfaceId: "surface-a" },
    retainedScene: createGpuRetainedRowContentScene({
      id: "surface-a",
      ownerSectionId: "section-a",
      rowHeight: 28,
      rows: Array.from({ length: 10 }, (_, index) => ({
        control: {
          defaultDisplayValue: "",
          displayValue: `Value ${index}`,
          editorKind: "text",
          kind: "text-like",
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
    }),
    zIndex: 1,
  };
}

function requiredHit(
  scene: GpuFlowScene,
  point: { readonly x: number; readonly y: number },
): GpuRetainedContentHitTarget {
  const hit = hitTestGpuRetainedContentScene({ point, scene });
  if (!hit) {
    throw new Error(`Expected retained hit at ${point.x}, ${point.y}.`);
  }
  return hit;
}
