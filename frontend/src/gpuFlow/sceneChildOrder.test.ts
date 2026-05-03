import { describe, expect, it } from "vitest";

import type {
  GpuFlowScene,
  GpuSectionSceneLayoutMode,
  GpuSectionSceneNode,
} from "./scene";
import { resolveGpuSectionSceneChildReorderPlan } from "./sceneChildOrder";
import type { GpuPoint, GpuRect } from "./viewportMath";

describe("GPU flow scene child order", () => {
  it("resolves vertical same-parent child insertion from dragged scene geometry", () => {
    const scene = sceneWithSections([
      sectionNode({
        childIds: ["child-a", "child-b", "child-c"],
        id: "parent",
        layoutMode: "vertical",
      }),
      sectionNode({
        id: "child-a",
        parentId: "parent",
        worldRect: rect(0, 0, 100, 40),
      }),
      sectionNode({
        id: "child-b",
        parentId: "parent",
        worldRect: rect(0, 50, 100, 40),
      }),
      sectionNode({
        id: "child-c",
        parentId: "parent",
        worldRect: rect(0, 100, 100, 40),
      }),
    ]);

    expect(
      resolveGpuSectionSceneChildReorderPlan({
        draggedRect: rect(0, 126, 100, 40),
        scene,
        sectionId: "child-a",
      }),
    ).toMatchObject({
      changed: true,
      childSectionIds: ["child-b", "child-c", "child-a"],
      nextIndex: 2,
      parentSectionId: "parent",
      previousIndex: 0,
    });
  });

  it("resolves horizontal child insertion on the x axis", () => {
    const scene = sceneWithSections([
      sectionNode({
        childIds: ["child-a", "child-b", "child-c"],
        id: "parent",
        layoutMode: "horizontal",
      }),
      sectionNode({
        id: "child-a",
        parentId: "parent",
        worldRect: rect(0, 0, 40, 100),
      }),
      sectionNode({
        id: "child-b",
        parentId: "parent",
        worldRect: rect(50, 0, 40, 100),
      }),
      sectionNode({
        id: "child-c",
        parentId: "parent",
        worldRect: rect(100, 0, 40, 100),
      }),
    ]);

    expect(
      resolveGpuSectionSceneChildReorderPlan({
        draggedRect: rect(30, 0, 40, 100),
        scene,
        sectionId: "child-c",
      }),
    ).toMatchObject({
      changed: true,
      childSectionIds: ["child-a", "child-c", "child-b"],
      nextIndex: 1,
      previousIndex: 2,
    });
  });

  it("returns unchanged plans when the dragged child remains in order", () => {
    const scene = sceneWithSections([
      sectionNode({
        childIds: ["child-a", "child-b"],
        id: "parent",
        layoutMode: "vertical",
      }),
      sectionNode({
        id: "child-a",
        parentId: "parent",
        worldRect: rect(0, 0, 100, 40),
      }),
      sectionNode({
        id: "child-b",
        parentId: "parent",
        worldRect: rect(0, 50, 100, 40),
      }),
    ]);

    expect(
      resolveGpuSectionSceneChildReorderPlan({
        draggedRect: rect(0, 4, 100, 40),
        scene,
        sectionId: "child-a",
      }),
    ).toMatchObject({
      changed: false,
      childSectionIds: ["child-a", "child-b"],
      nextIndex: 0,
      previousIndex: 0,
    });
  });

  it("does not produce reorder plans for root or unordered scene nodes", () => {
    const scene = sceneWithSections([
      sectionNode({
        childIds: ["absolute-child"],
        id: "root",
        layoutMode: "absolute",
      }),
      sectionNode({
        id: "absolute-child",
        parentId: "root",
        worldRect: rect(0, 0, 100, 40),
      }),
    ]);

    expect(
      resolveGpuSectionSceneChildReorderPlan({
        draggedRect: rect(0, 100, 100, 40),
        scene,
        sectionId: "root",
      }),
    ).toBeNull();
    expect(
      resolveGpuSectionSceneChildReorderPlan({
        draggedRect: rect(0, 100, 100, 40),
        scene,
        sectionId: "absolute-child",
      }),
    ).toBeNull();
  });
});

function sceneWithSections(
  sections: readonly GpuSectionSceneNode[],
): GpuFlowScene {
  return {
    contentSurfaces: [],
    domIslands: [],
    edges: [],
    revision: 1,
    sections,
  };
}

function sectionNode({
  childIds = [],
  childLayoutGap = { x: 0, y: 0 },
  id,
  layoutMode = "none",
  localRect,
  parentId = null,
  scrollOffset = { x: 0, y: 0 },
  worldRect = rect(0, 0, 100, 80),
}: {
  readonly childIds?: readonly string[] | undefined;
  readonly childLayoutGap?: GpuPoint | undefined;
  readonly id: string;
  readonly layoutMode?: GpuSectionSceneLayoutMode | undefined;
  readonly localRect?: GpuRect | undefined;
  readonly parentId?: string | null | undefined;
  readonly scrollOffset?: GpuPoint | undefined;
  readonly worldRect?: GpuRect | undefined;
}): GpuSectionSceneNode {
  const resolvedLocalRect =
    localRect ?? rect(0, 0, worldRect.width, worldRect.height);
  return {
    bodyRect: worldRect,
    childLayout: { gap: childLayoutGap },
    childSectionIds: childIds,
    childViewportRect: childIds.length > 0 ? worldRect : null,
    chromeRect: worldRect,
    clipRect: worldRect,
    contentRenderer: { kind: "dom-section", surfaceId: id },
    dirty: [],
    height: worldRect.height,
    interactionLayer: "content",
    layoutMode,
    localRect: resolvedLocalRect,
    nodeId: id,
    parentSectionId: parentId,
    portAnchors: [],
    resizePolicy: {
      locked: false,
      maxHeight: null,
      maxWidth: null,
      minHeight: 0,
      minWidth: 0,
    },
    scrollOffset,
    sectionId: id,
    width: worldRect.width,
    worldRect,
    x: worldRect.x,
    y: worldRect.y,
    zIndex: 0,
  };
}

function rect(x: number, y: number, width: number, height: number): GpuRect {
  return { height, width, x, y };
}
