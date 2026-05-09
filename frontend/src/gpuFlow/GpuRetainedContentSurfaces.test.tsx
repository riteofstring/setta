// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
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

  it("renders retained content source anchors inside the canvas subtree", () => {
    const markup = renderToStaticMarkup(
      <canvas>
        <GpuRetainedContentSurfaceLayer surfaces={[retainedSurface()]} />
      </canvas>,
    );

    expect(markup).toContain(
      'data-gpu-flow-source-id="dict-a:param-content:unpinned"',
    );
    expect(markup).not.toContain("data-gpu-flow-retained-content-source");
  });

  it("redraws a retained source canvas imperatively for renderer-owned scroll", () => {
    const surface = emptyRetainedSurface();
    const host = document.createElement("div");
    const canvas = document.createElement("canvas");
    const context = createCanvasContextStub();
    vi.spyOn(canvas, "getContext").mockReturnValue(context as never);
    canvas.setAttribute("data-gpu-flow-retained-content-canvas", "true");
    host.append(canvas);

    const drawEvent = redrawGpuRetainedContentSourceElement({
      element: host,
      surface,
    });

    expect(drawEvent).toEqual({ reason: "content" });
    expect(canvas.width).toBeGreaterThan(0);
    expect(context.clearRect).toHaveBeenCalled();
    expect(context.fillRect).toHaveBeenCalled();
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
    clearRect: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    setTransform: vi.fn(),
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}
