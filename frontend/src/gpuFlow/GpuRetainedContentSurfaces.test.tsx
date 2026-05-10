// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getGpuRetainedContentScrollbarVisuals } from "./GpuRetainedContentScrollbarVisuals";
import {
  getGpuRetainedContentSourceRectForRows,
  getGpuRetainedContentSourceStyle,
  getGpuRetainedContentSurfaceLayouts,
  GpuRetainedContentSurfaceLayer,
  redrawGpuRetainedContentSourceElement,
} from "./GpuRetainedContentSurfaces";
import { createGpuRetainedRowContentScene } from "./retainedContentScene";
import type { GpuContentSurface } from "./scene";

describe("GpuRetainedContentSurfaceLayer", () => {
  it("maps retained content scene geometry to renderer-owned surface layouts", () => {
    const surface = retainedSurface();

    expect(getGpuRetainedContentSurfaceLayouts([surface])).toEqual([
      {
        height: 96,
        ownerNodeId: "dict-a",
        surfaceId: "dict-a:param-content:unpinned",
        textureContentKey: "retained-content-v1:0:0:0:0:240:96:1:1",
        textureCssHeight: 96,
        textureCssWidth: 240,
        textureSourceRect: { height: 96, width: 240, x: 0, y: 0 },
        width: 240,
        x: 12,
        y: 34,
        zIndex: 7,
      },
    ]);
    expect(getGpuRetainedContentSourceStyle(surface)).toEqual({
      height: 96,
      width: 240,
    });
  });

  it("adds viewport-anchored GPU scrollbar visuals for overflowing retained content", () => {
    const surface = overflowRetainedSurface();

    expect(getGpuRetainedContentSurfaceLayouts([surface])).toEqual([
      {
        height: 96,
        ownerNodeId: "dict-a",
        surfaceId: "dict-a:param-content:unpinned",
        textureContentKey: "retained-content-v1:0:0:0:0:240:280:1:1",
        textureCssHeight: 280,
        textureCssWidth: 240,
        textureSourceRect: { height: 96, width: 240, x: 0, y: 0 },
        width: 240,
        x: 12,
        y: 34,
        zIndex: 7,
      },
    ]);
    expect(
      getGpuRetainedContentScrollbarVisuals([surface]).map((visual) => ({
        color: visual.color,
        radius: visual.radius,
        rect: visual.rect,
        surfaceId: visual.surfaceId,
        zIndex: visual.zIndex,
      })),
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

  it("clips retained content source geometry to the renderer clip rect", () => {
    const surface = retainedSurface({
      clipRect: { height: 40, width: 200, x: 32, y: 70 },
      rect: { height: 96, width: 240, x: 12, y: 34 },
    });

    expect(getGpuRetainedContentSurfaceLayouts([surface])).toEqual([
      {
        height: 40,
        ownerNodeId: "dict-a",
        surfaceId: "dict-a:param-content:unpinned",
        textureContentKey: "retained-content-v1:0:0:20:36:240:96:1:1",
        textureCssHeight: 96,
        textureCssWidth: 240,
        textureSourceRect: { height: 40, width: 200, x: 20, y: 36 },
        width: 200,
        x: 32,
        y: 70,
        zIndex: 7,
      },
    ]);
    expect(getGpuRetainedContentSourceStyle(surface)).toEqual({
      height: 96,
      width: 240,
    });
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

  it("drops retained content source geometry outside the renderer clip rect", () => {
    const surface = retainedSurface({
      clipRect: { height: 20, width: 200, x: 12, y: 200 },
      rect: { height: 96, width: 240, x: 12, y: 34 },
    });

    expect(getGpuRetainedContentSurfaceLayouts([surface])).toEqual([]);
    expect(getGpuRetainedContentSourceStyle(surface)).toEqual({
      height: 0,
      width: 0,
    });
  });

  it("renders retained content canvases as direct texture sources", () => {
    const markup = renderToStaticMarkup(
      <canvas>
        <GpuRetainedContentSurfaceLayer
          surfaces={[overflowRetainedSurface()]}
        />
      </canvas>,
    );

    expect(markup).toContain(
      'data-gpu-flow-source-id="dict-a:param-content:unpinned"',
    );
    expect(markup).toContain('data-gpu-flow-retained-content-source="true"');
    expect(markup).toContain('data-gpu-flow-retained-content-canvas="true"');
    expect(markup).toContain('data-gpu-flow-retained-content-zoom-bucket="1"');
    expect(markup).not.toContain(":scrollbar");
  });

  it("redraws a retained source canvas imperatively for renderer-owned scroll", () => {
    const surface = emptyRetainedSurface();
    const canvas = document.createElement("canvas");
    const context = createCanvasContextStub();
    vi.spyOn(canvas, "getContext").mockReturnValue(context as never);
    canvas.setAttribute("data-gpu-flow-retained-content-canvas", "true");

    const drawEvent = redrawGpuRetainedContentSourceElement({
      element: canvas,
      surface,
    });

    expect(drawEvent).toEqual({ reason: "content" });
    expect(canvas.width).toBeGreaterThan(0);
    expect(context.clearRect).toHaveBeenCalled();
    expect(context.fillRect).toHaveBeenCalled();
  });

  it("sizes retained source canvas backing pixels from the viewport zoom bucket", () => {
    const surface = emptyRetainedSurface();
    const canvas = document.createElement("canvas");
    const context = createCanvasContextStub();
    vi.spyOn(canvas, "getContext").mockReturnValue(context as never);
    canvas.setAttribute("data-gpu-flow-retained-content-canvas", "true");

    const drawEvent = redrawGpuRetainedContentSourceElement({
      element: canvas,
      surface,
      viewportZoomBucket: 3,
    });

    expect(drawEvent).toEqual({ reason: "content" });
    expect(canvas.width).toBe(720);
    expect(canvas.height).toBe(288);
    expect(context.setTransform).toHaveBeenCalledWith(3, 0, 0, 3, 0, 0);
  });

  it("does not create a texture-backed source for retained scrollbars", () => {
    const surface = overflowRetainedSurface();
    const host = document.createElement("div");
    const canvas = document.createElement("canvas");
    const context = createCanvasContextStub();
    vi.spyOn(canvas, "getContext").mockReturnValue(context as never);
    canvas.setAttribute("data-gpu-flow-retained-content-canvas", "true");
    host.append(canvas);

    const drawEvent = redrawGpuRetainedContentSourceElement({
      element: host,
      sourceId: "dict-a:param-content:unpinned:scrollbar",
      surface,
    });

    expect(drawEvent).toBeNull();
    expect(context.clearRect).not.toHaveBeenCalled();
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

function emptyRetainedSurface(): GpuContentSurface & {
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
      rows: [],
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
    defaultDisplayValue: "",
    displayValue: "",
    editorKind: "text" as const,
    kind: "text-like" as const,
    rendererFamily: "text-like",
    commitPolicy: "native-island" as const,
  };
}

function createCanvasContextStub(): CanvasRenderingContext2D {
  return {
    beginPath: vi.fn(),
    closePath: vi.fn(),
    clearRect: vi.fn(),
    clip: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    setTransform: vi.fn(),
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}
