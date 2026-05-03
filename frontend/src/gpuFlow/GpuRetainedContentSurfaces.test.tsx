import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  getGpuRetainedContentSourceStyle,
  getGpuRetainedContentSurfaceLayouts,
  GpuRetainedContentSurfaceLayer,
} from "./GpuRetainedContentSurfaces";
import { createGpuRetainedRowContentScene } from "./retainedContentScene";
import type { GpuContentSurface } from "./scene";

describe("GpuRetainedContentSurfaceLayer", () => {
  it("maps retained content scene geometry to renderer-owned surface layouts", () => {
    const surface = retainedSurface();

    expect(getGpuRetainedContentSurfaceLayouts([surface])).toEqual([
      {
        height: 96,
        surfaceId: "dict-a:param-content:unpinned",
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
});

function retainedSurface(): GpuContentSurface & {
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
