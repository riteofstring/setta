import { describe, expect, it } from "vitest";
import {
  resolveGpuRetainedContentKeyboardNavigation,
  resolveGpuRetainedContentRowReveal,
} from "./retainedContentKeyboard";
import { createGpuRetainedRowContentScene } from "./retainedContentScene";
import type { GpuContentSurface, GpuFlowScene } from "./scene";

describe("retained content keyboard navigation", () => {
  it("moves through retained row order without requiring offscreen row DOM", () => {
    const result = resolveGpuRetainedContentKeyboardNavigation({
      command: "page-forward",
      currentTarget: {
        ownerSectionId: "section-a",
        rowId: "param-2",
        surfaceId: "params",
      },
      scene: sceneWithSurfaces([
        retainedSurface({
          id: "params",
          rect: { height: 60, width: 160, x: 0, y: 0 },
        }),
      ]),
      scrollOffsets: new Map(),
    });

    expect(result.changed).toBe(true);
    expect(result.target).toMatchObject({
      ownerSectionId: "section-a",
      rowId: "param-4",
      rowIndex: 4,
      surfaceId: "params",
    });
    expect(result.scrollOffsets.get("params")).toEqual({ x: 0, y: 84 });
  });

  it("reveals a retained row by row order and preserves unchanged offsets", () => {
    const scene = sceneWithSurfaces([
      retainedSurface({
        id: "params",
        rect: { height: 60, width: 160, x: 0, y: 0 },
      }),
    ]);

    expect(
      resolveGpuRetainedContentRowReveal({
        rowId: "param-1",
        scene,
        scrollOffsets: new Map(),
        surfaceId: "params",
      }),
    ).toMatchObject({
      changed: false,
      surfaceId: "params",
      target: {
        ownerSectionId: "section-a",
        rowId: "param-1",
        rowIndex: 1,
        surfaceId: "params",
      },
    });

    const result = resolveGpuRetainedContentRowReveal({
      rowId: "param-8",
      scene,
      scrollOffsets: new Map(),
      surfaceId: "params",
    });
    expect(result.changed).toBe(true);
    expect(result.scrollOffsets.get("params")).toEqual({ x: 0, y: 196 });
  });

  it("leaves navigation unchanged when the current row is not in the retained scene", () => {
    const offsets = new Map([["params", { x: 0, y: 40 }]]);
    const result = resolveGpuRetainedContentKeyboardNavigation({
      command: "row-forward",
      currentTarget: {
        ownerSectionId: "section-a",
        rowId: "missing-param",
        surfaceId: "params",
      },
      scene: sceneWithSurfaces([
        retainedSurface({
          id: "params",
          rect: { height: 60, width: 160, x: 0, y: 0 },
        }),
      ]),
      scrollOffsets: offsets,
    });

    expect(result.changed).toBe(false);
    expect(result.scrollOffsets).toBe(offsets);
    expect(result.target).toBeNull();
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
}: {
  readonly id: string;
  readonly rect: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  };
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
        control: {
          commitPolicy: "native-island",
          defaultDisplayValue: "",
          displayValue: `Value ${index}`,
          editorKind: "text",
          kind: "text-like",
          rendererFamily: "text-like",
        },
        controlKind: null,
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
