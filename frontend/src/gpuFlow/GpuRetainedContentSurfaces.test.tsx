import { describe, expect, it } from "vitest";

import { getGpuRetainedContentScrollbarVisuals } from "./GpuRetainedContentScrollbarVisuals";
import {
  getGpuRetainedContentSourceRectForRows,
  getGpuRetainedContentSourceSurfaces,
} from "./GpuRetainedContentSurfaces";
import { createGpuRetainedRowContentScene } from "./retainedContentScene";
import type { GpuContentSurface } from "./scene";

describe("GpuRetainedContentSurfaces", () => {
  it("maps retained content scene geometry to page source windows", () => {
    const source = getGpuRetainedContentSourceSurfaces([
      retainedSurface(),
    ])[0];

    expect(source).toMatchObject({
      id: "dict-a:param-content:unpinned",
      rect: { height: 96, width: 240, x: 12, y: 34 },
      sourceClipOffset: { x: 0, y: 0 },
      textureWindow: {
        cacheScrollOffset: { x: 0, y: 0 },
        sourceRect: { height: 96, width: 240, x: 0, y: 0 },
        textureHeight: 96,
        textureWidth: 240,
      },
      zIndex: 7,
    });
  });

  it("clips retained content source geometry to the renderer clip rect", () => {
    const source = getGpuRetainedContentSourceSurfaces([
      retainedSurface({
        clipRect: { height: 40, width: 200, x: 32, y: 70 },
        rect: { height: 96, width: 240, x: 12, y: 34 },
      }),
    ])[0];

    expect(source).toMatchObject({
      rect: { height: 40, width: 200, x: 32, y: 70 },
      sourceClipOffset: { x: 20, y: 36 },
      textureWindow: {
        sourceRect: { height: 40, width: 200, x: 20, y: 36 },
        textureHeight: 96,
        textureWidth: 240,
      },
    });
  });

  it("drops retained content source geometry outside the renderer clip rect", () => {
    expect(
      getGpuRetainedContentSourceSurfaces([
        retainedSurface({
          clipRect: { height: 20, width: 200, x: 12, y: 200 },
          rect: { height: 96, width: 240, x: 12, y: 34 },
        }),
      ]),
    ).toEqual([]);
  });

  it("resolves dirty source rectangles for retained rows", () => {
    expect(
      getGpuRetainedContentSourceRectForRows({
        rowIds: ["param-a"],
        surface: retainedSurface(),
      }),
    ).toEqual({ height: 28, width: 240, x: 0, y: 0 });
    expect(
      getGpuRetainedContentSourceRectForRows({
        rowIds: ["param-1", "param-3"],
        surface: overflowRetainedSurface(),
      }),
    ).toEqual({ height: 84, width: 240, x: 0, y: 28 });
  });

  it("resolves retained row dirty source rectangles inside the texture cache window", () => {
    expect(
      getGpuRetainedContentSourceRectForRows({
        rowIds: ["param-55"],
        surface: scrolledLargeRetainedSurface(),
      }),
    ).toEqual({ height: 28, width: 240, x: 0, y: 196 });
  });

  it("adds viewport-anchored GPU scrollbar visuals for overflowing retained content", () => {
    expect(
      getGpuRetainedContentScrollbarVisuals([overflowRetainedSurface()]).map(
        (visual) => ({
          color: visual.color,
          radius: visual.radius,
          rect: visual.rect,
          surfaceId: visual.surfaceId,
          zIndex: visual.zIndex,
        }),
      ),
    ).toEqual([
      {
        color: { a: 0.0688, b: 42 / 255, g: 23 / 255, r: 15 / 255 },
        radius: 4,
        rect: { height: 92, width: 8, x: 242, y: 36 },
        surfaceId: "dict-a:param-content:unpinned:scrollbar:y:track",
        zIndex: 7,
      },
      {
        color: { a: 0.46, b: 105 / 255, g: 85 / 255, r: 71 / 255 },
        radius: 4,
        rect: { height: 31.542857142857144, width: 8, x: 242, y: 36 },
        surfaceId: "dict-a:param-content:unpinned:scrollbar:y:thumb",
        zIndex: 7,
      },
    ]);
  });
});

function retainedSurface(
  overrides: Partial<Pick<GpuContentSurface, "clipRect" | "rect">> = {},
): GpuContentSurface & {
  readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
} {
  const rect = overrides.rect ?? { height: 96, width: 240, x: 12, y: 34 };
  return {
    clipRect: overrides.clipRect ?? rect,
    id: "dict-a:param-content:unpinned",
    ownerSectionId: "dict-a",
    rect,
    renderer: {
      kind: "canvas-content",
      surfaceId: "dict-a:param-content:unpinned",
    },
    retainedScene: createGpuRetainedRowContentScene({
      id: "dict-a:param-content:unpinned",
      ownerSectionId: "dict-a",
      rowHeight: 28,
      rows: [
        {
          control: textLikeControlDescriptor(),
          controlKind: "text-like",
          depth: 0,
          id: "param-a",
          label: "Param A",
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 96, width: 240, x: 0, y: 0 },
    }),
    zIndex: 7,
  };
}

function overflowRetainedSurface(): GpuContentSurface & {
  readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
} {
  const rect = { height: 96, width: 240, x: 12, y: 34 };
  return {
    clipRect: rect,
    id: "dict-a:param-content:unpinned",
    ownerSectionId: "dict-a",
    rect,
    renderer: {
      kind: "canvas-content",
      surfaceId: "dict-a:param-content:unpinned",
    },
    retainedScene: createGpuRetainedRowContentScene({
      id: "dict-a:param-content:unpinned",
      ownerSectionId: "dict-a",
      rowHeight: 28,
      rows: Array.from({ length: 10 }, (_, index) => ({
        control: textLikeControlDescriptor(),
        controlKind: "text-like" as const,
        depth: 0,
        id: `param-${index}`,
        label: `Param ${index}`,
      })),
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 96, width: 240, x: 0, y: 0 },
    }),
    zIndex: 7,
  };
}

function scrolledLargeRetainedSurface(): GpuContentSurface & {
  readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
} {
  const rect = { height: 96, width: 240, x: 12, y: 34 };
  return {
    clipRect: rect,
    id: "dict-a:param-content:unpinned",
    ownerSectionId: "dict-a",
    rect,
    renderer: {
      kind: "canvas-content",
      surfaceId: "dict-a:param-content:unpinned",
    },
    retainedScene: createGpuRetainedRowContentScene({
      id: "dict-a:param-content:unpinned",
      ownerSectionId: "dict-a",
      rowHeight: 28,
      rows: Array.from({ length: 100 }, (_, index) => ({
        control: textLikeControlDescriptor(),
        controlKind: "text-like" as const,
        depth: 0,
        id: `param-${index}`,
        label: `Param ${index}`,
      })),
      scrollOffset: { x: 0, y: 1500 },
      viewportRect: { height: 96, width: 240, x: 0, y: 0 },
    }),
    zIndex: 7,
  };
}

function textLikeControlDescriptor() {
  return {
    commitPolicy: "native-island" as const,
    defaultDisplayValue: "",
    displayValue: "",
    editorKind: "text" as const,
    kind: "text-like" as const,
    rendererFamily: "text-like",
  };
}
