import { createGpuRetainedRowContentScene } from "gpuFlow/retainedContentScene";
import type { GpuContentSurface, GpuFlowScene } from "gpuFlow/scene";
import { describe, expect, it } from "vitest";
import { resolveProjectGpuRetainedParamSearchReveal } from "./projectGpuSearchReveal";

describe("project GPU search reveal", () => {
  it("reveals offscreen retained param rows through retained content scroll offsets", () => {
    const scene = sceneWithRetainedParamSurface();

    const result = resolveProjectGpuRetainedParamSearchReveal({
      scene,
      scrollOffsets: new Map(),
      target: {
        paramInfoId: "param-10",
        sectionId: "section-1",
      },
    });

    expect(result).toEqual({
      changed: true,
      rowCenter: { x: 200, y: 136 },
      scrollOffsets: new Map([
        ["section-1:param-content:main", { x: 0, y: 124 }],
      ]),
      surfaceId: "section-1:param-content:main",
      target: {
        ownerSectionId: "section-1",
        rowId: "param-10",
        rowIndex: 10,
        surfaceId: "section-1:param-content:main",
      },
    });
  });

  it("returns visible retained row geometry without changing scroll offsets", () => {
    const scene = sceneWithRetainedParamSurface();
    const scrollOffsets = new Map<string, { x: number; y: number }>();

    const result = resolveProjectGpuRetainedParamSearchReveal({
      scene,
      scrollOffsets,
      target: {
        paramInfoId: "param-1",
        sectionId: "section-1",
      },
    });

    expect(result).toEqual({
      changed: false,
      rowCenter: { x: 200, y: 80 },
      scrollOffsets,
      surfaceId: "section-1:param-content:main",
      target: {
        ownerSectionId: "section-1",
        rowId: "param-1",
        rowIndex: 1,
        surfaceId: "section-1:param-content:main",
      },
    });
  });

  it("centers search reveals on mixed-height retained row bounds", () => {
    const scene = sceneWithRetainedParamSurface({}, [20, 40, 20]);

    const result = resolveProjectGpuRetainedParamSearchReveal({
      scene,
      scrollOffsets: new Map(),
      target: {
        paramInfoId: "param-2",
        sectionId: "section-1",
      },
    });

    expect(result).toMatchObject({
      changed: false,
      rowCenter: { x: 200, y: 120 },
      surfaceId: "section-1:param-content:main",
      target: {
        ownerSectionId: "section-1",
        rowId: "param-2",
        rowIndex: 2,
        surfaceId: "section-1:param-content:main",
      },
    });
  });

  it("ignores search targets that are not retained canvas rows", () => {
    const scene = sceneWithRetainedParamSurface({
      renderer: { kind: "dom-section", surfaceId: "section-1" },
    });

    const result = resolveProjectGpuRetainedParamSearchReveal({
      scene,
      scrollOffsets: new Map(),
      target: {
        paramInfoId: "param-1",
        sectionId: "section-1",
      },
    });

    expect(result).toBeNull();
  });
});

function sceneWithRetainedParamSurface(
  surfaceOverrides: Partial<GpuContentSurface> = {},
  rowHeights: readonly number[] = [],
): GpuFlowScene {
  const rowOrder = Array.from({ length: 20 }, (_, index) => `param-${index}`);
  const rows = rowOrder.map((id, index) => ({
    controlKind: null,
    depth: 0,
    ...(rowHeights[index] === undefined ? {} : { height: rowHeights[index] }),
    id,
    label: id,
  }));
  return {
    contentSurfaces: [
      {
        clipRect: { height: 100, width: 200, x: 100, y: 50 },
        id: "section-1:param-content:main",
        ownerSectionId: "section-1",
        rect: { height: 100, width: 200, x: 100, y: 50 },
        renderer: {
          kind: "canvas-content",
          surfaceId: "section-1:param-content:main",
        },
        retainedScene: createGpuRetainedRowContentScene({
          id: "section-1:param-content:main",
          ownerSectionId: "section-1",
          rowHeight: 20,
          scrollOffset: { x: 0, y: 0 },
          rows,
          viewportRect: { height: 100, width: 200, x: 0, y: 0 },
        }),
        zIndex: 1,
        ...surfaceOverrides,
      },
    ],
    domIslands: [],
    edges: [],
    revision: 1,
    sections: [],
  };
}
