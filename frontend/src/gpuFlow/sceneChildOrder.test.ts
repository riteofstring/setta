import { describe, expect, it } from "vitest";

import type {
  GpuFlowScene,
  GpuSectionSceneLayoutMode,
  GpuSectionSceneNode,
} from "./scene";
import {
  resolveGpuSectionSceneChildMoveDropMarker,
  resolveGpuSectionSceneChildMovePlan,
  resolveGpuSectionSceneChildMovePreviewSections,
  resolveGpuSectionSceneChildReorderPlan,
} from "./sceneChildOrder";
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

  it("resolves cross-parent child insertion from scene drop geometry", () => {
    const scene = sceneWithSections([
      sectionNode({
        childIds: ["child-a"],
        id: "parent-a",
        layoutMode: "vertical",
        worldRect: rect(0, 0, 120, 220),
      }),
      sectionNode({
        childIds: ["child-b"],
        id: "parent-b",
        layoutMode: "vertical",
        worldRect: rect(300, 0, 120, 220),
      }),
      sectionNode({
        id: "child-a",
        parentId: "parent-a",
        worldRect: rect(0, 0, 100, 40),
      }),
      sectionNode({
        id: "child-b",
        parentId: "parent-b",
        worldRect: rect(300, 0, 100, 40),
      }),
    ]);

    expect(
      resolveGpuSectionSceneChildMovePlan({
        draggedRect: rect(300, 80, 100, 40),
        scene,
        sectionId: "child-a",
      }),
    ).toMatchObject({
      changed: true,
      childSectionIds: ["child-b", "child-a"],
      nextIndex: 1,
      parentSectionId: "parent-b",
      previousIndex: 0,
      previousParentSectionId: "parent-a",
    });
  });

  it("resolves same-parent live preview sections with stationary siblings displaced", () => {
    const scene = sceneWithSections([
      sectionNode({
        childIds: ["child-a", "child-b", "child-c"],
        childLayoutGap: { x: 0, y: 10 },
        id: "parent",
        layoutMode: "vertical",
      }),
      sectionNode({
        id: "child-a",
        localRect: rect(0, 0, 100, 40),
        parentId: "parent",
        worldRect: rect(0, 0, 100, 40),
      }),
      sectionNode({
        id: "child-b",
        localRect: rect(0, 0, 100, 40),
        parentId: "parent",
        worldRect: rect(0, 50, 100, 40),
      }),
      sectionNode({
        id: "child-c",
        localRect: rect(0, 0, 100, 40),
        parentId: "parent",
        worldRect: rect(0, 100, 100, 40),
      }),
    ]);
    const plan = resolveGpuSectionSceneChildMovePlan({
      draggedRect: rect(0, 126, 100, 40),
      scene,
      sectionId: "child-a",
    });

    if (!plan) {
      throw new Error("Expected same-parent preview plan.");
    }
    const preview = resolveGpuSectionSceneChildMovePreviewSections({
      plan,
      scene,
    });

    expect(getSection(preview, "parent").childSectionIds).toEqual([
      "child-b",
      "child-c",
      "child-a",
    ]);
    expect(getSection(preview, "child-b").worldRect).toMatchObject({
      x: 0,
      y: 0,
    });
    expect(getSection(preview, "child-c").worldRect).toMatchObject({
      x: 0,
      y: 50,
    });
    expect(getSection(preview, "child-a").worldRect).toMatchObject({
      x: 0,
      y: 100,
    });
  });

  it("resolves cross-parent live preview sections by updating both parent orders", () => {
    const scene = sceneWithSections([
      sectionNode({
        childIds: ["child-a"],
        childLayoutGap: { x: 0, y: 10 },
        id: "parent-a",
        layoutMode: "vertical",
        worldRect: rect(0, 0, 120, 220),
      }),
      sectionNode({
        childIds: ["child-b"],
        childLayoutGap: { x: 0, y: 10 },
        id: "parent-b",
        layoutMode: "vertical",
        worldRect: rect(300, 0, 120, 220),
      }),
      sectionNode({
        id: "child-a",
        localRect: rect(0, 0, 100, 40),
        parentId: "parent-a",
        worldRect: rect(0, 0, 100, 40),
      }),
      sectionNode({
        id: "child-b",
        localRect: rect(0, 0, 100, 40),
        parentId: "parent-b",
        worldRect: rect(300, 0, 100, 40),
      }),
    ]);
    const plan = resolveGpuSectionSceneChildMovePlan({
      draggedRect: rect(300, 80, 100, 40),
      scene,
      sectionId: "child-a",
    });

    if (!plan) {
      throw new Error("Expected cross-parent preview plan.");
    }
    const preview = resolveGpuSectionSceneChildMovePreviewSections({
      plan,
      scene,
    });

    expect(getSection(preview, "parent-a").childSectionIds).toEqual([]);
    expect(getSection(preview, "parent-b").childSectionIds).toEqual([
      "child-b",
      "child-a",
    ]);
    expect(getSection(preview, "child-a")).toMatchObject({
      parentSectionId: "parent-b",
      worldRect: { x: 300, y: 50 },
    });
  });

  it("resolves vertical insertion markers from preview scene geometry", () => {
    const scene = sceneWithSections([
      sectionNode({
        childIds: ["child-a", "child-b", "child-c"],
        childLayoutGap: { x: 0, y: 10 },
        id: "parent",
        layoutMode: "vertical",
        worldRect: rect(0, 0, 120, 220),
      }),
      sectionNode({
        id: "child-a",
        localRect: rect(0, 0, 100, 40),
        parentId: "parent",
        worldRect: rect(0, 0, 100, 40),
      }),
      sectionNode({
        id: "child-b",
        localRect: rect(0, 0, 100, 40),
        parentId: "parent",
        worldRect: rect(0, 50, 100, 40),
      }),
      sectionNode({
        id: "child-c",
        localRect: rect(0, 0, 100, 40),
        parentId: "parent",
        worldRect: rect(0, 100, 100, 40),
      }),
    ]);
    const plan = resolveGpuSectionSceneChildMovePlan({
      draggedRect: rect(0, 126, 100, 40),
      scene,
      sectionId: "child-a",
    });

    if (!plan) {
      throw new Error("Expected vertical marker plan.");
    }

    expect(resolveGpuSectionSceneChildMoveDropMarker({ plan, scene })).toEqual({
      axis: "y",
      childNodeId: "child-a",
      index: 2,
      parentNodeId: "parent",
      rect: { height: 4, width: 104, x: 8, y: 98 },
    });
  });

  it("resolves horizontal insertion markers on the child-order axis", () => {
    const scene = sceneWithSections([
      sectionNode({
        childIds: ["child-a", "child-b", "child-c"],
        childLayoutGap: { x: 10, y: 0 },
        id: "parent",
        layoutMode: "horizontal",
        worldRect: rect(0, 0, 220, 120),
      }),
      sectionNode({
        id: "child-a",
        localRect: rect(0, 0, 40, 100),
        parentId: "parent",
        worldRect: rect(0, 0, 40, 100),
      }),
      sectionNode({
        id: "child-b",
        localRect: rect(0, 0, 40, 100),
        parentId: "parent",
        worldRect: rect(50, 0, 40, 100),
      }),
      sectionNode({
        id: "child-c",
        localRect: rect(0, 0, 40, 100),
        parentId: "parent",
        worldRect: rect(100, 0, 40, 100),
      }),
    ]);
    const plan = resolveGpuSectionSceneChildMovePlan({
      draggedRect: rect(30, 0, 40, 100),
      scene,
      sectionId: "child-c",
    });

    if (!plan) {
      throw new Error("Expected horizontal marker plan.");
    }

    expect(resolveGpuSectionSceneChildMoveDropMarker({ plan, scene })).toEqual({
      axis: "x",
      childNodeId: "child-c",
      index: 1,
      parentNodeId: "parent",
      rect: { height: 104, width: 4, x: 48, y: 8 },
    });
  });

  it("allows dropping into an empty ordered parent body", () => {
    const scene = sceneWithSections([
      sectionNode({
        childIds: ["child-a"],
        id: "parent-a",
        layoutMode: "vertical",
        worldRect: rect(0, 0, 120, 220),
      }),
      sectionNode({
        id: "parent-b",
        layoutMode: "vertical",
        worldRect: rect(300, 0, 120, 220),
      }),
      sectionNode({
        id: "child-a",
        parentId: "parent-a",
        worldRect: rect(0, 0, 100, 40),
      }),
    ]);

    expect(
      resolveGpuSectionSceneChildMovePlan({
        draggedRect: rect(300, 40, 100, 40),
        scene,
        sectionId: "child-a",
      }),
    ).toMatchObject({
      changed: true,
      childSectionIds: ["child-a"],
      nextIndex: 0,
      parentSectionId: "parent-b",
      previousParentSectionId: "parent-a",
    });
  });

  it("uses parent eligibility when resolving overlapping drop targets", () => {
    const scene = sceneWithSections([
      sectionNode({
        childIds: ["child-a"],
        id: "parent-a",
        layoutMode: "vertical",
        worldRect: rect(0, 0, 120, 220),
      }),
      sectionNode({
        childIds: ["child-b"],
        id: "parent-b",
        layoutMode: "vertical",
        worldRect: rect(300, 0, 160, 260),
      }),
      sectionNode({
        id: "child-a",
        parentId: "parent-a",
        worldRect: rect(0, 0, 100, 40),
      }),
      sectionNode({
        id: "child-b",
        layoutMode: "vertical",
        parentId: "parent-b",
        worldRect: rect(300, 0, 140, 120),
      }),
    ]);

    expect(
      resolveGpuSectionSceneChildMovePlan({
        canDropInParent: (parent) => parent.sectionId !== "child-b",
        draggedRect: rect(310, 20, 100, 40),
        scene,
        sectionId: "child-a",
      }),
    ).toMatchObject({
      parentSectionId: "parent-b",
      previousParentSectionId: "parent-a",
    });
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

function getSection(
  sections: readonly GpuSectionSceneNode[],
  sectionId: string,
): GpuSectionSceneNode {
  const section = sections.find((item) => item.sectionId === sectionId);
  if (!section) {
    throw new Error(`Missing test section ${sectionId}.`);
  }
  return section;
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
