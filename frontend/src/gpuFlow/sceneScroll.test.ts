import { describe, expect, it } from "vitest";

import type {
  GpuFlowScene,
  GpuSectionSceneLayoutMode,
  GpuSectionSceneNode,
} from "./scene";
import { resolveGpuFlowSceneLayout } from "./sceneLayout";
import {
  applyGpuSectionSceneScrollOffsets,
  resolveGpuSectionSceneDragAutoScroll,
  resolveGpuSectionSceneWheelScroll,
} from "./sceneScroll";
import type { GpuPoint, GpuRect } from "./viewportMath";

describe("GPU flow scene scroll", () => {
  it("applies scroll offsets through renderer-owned scene layout", () => {
    const scene = sceneWithSections([
      sectionNode({
        childIds: ["child-a", "child-b"],
        childLayoutGap: { x: 0, y: 8 },
        id: "parent",
        layoutMode: "vertical",
        worldRect: rect(0, 0, 100, 80),
      }),
      sectionNode({
        id: "child-a",
        localRect: rect(0, 0, 80, 60),
        parentId: "parent",
      }),
      sectionNode({
        id: "child-b",
        localRect: rect(0, 0, 80, 60),
        parentId: "parent",
      }),
    ]);

    const scrolled = applyGpuSectionSceneScrollOffsets(
      scene,
      new Map([["parent", { x: 0, y: 40 }]]),
    );

    expect(getSection(scrolled, "parent").dirty).toContain("scroll");
    expect(getSection(scrolled, "child-a")).toMatchObject({
      clipRect: rect(0, 0, 80, 20),
      worldRect: rect(0, -40, 80, 60),
    });
    expect(getSection(scrolled, "child-b")).toMatchObject({
      clipRect: rect(0, 28, 80, 52),
      worldRect: rect(0, 28, 80, 60),
    });
  });

  it("resolves child-viewport drag autoscroll and clamps to content bounds", () => {
    const scene = resolveGpuFlowSceneLayout(
      sceneWithSections([
        sectionNode({
          childIds: ["child-a", "child-b", "child-c"],
          childLayoutGap: { x: 0, y: 8 },
          id: "parent",
          layoutMode: "vertical",
          worldRect: rect(0, 0, 100, 100),
        }),
        sectionNode({
          id: "child-a",
          localRect: rect(0, 0, 80, 70),
          parentId: "parent",
        }),
        sectionNode({
          id: "child-b",
          localRect: rect(0, 0, 80, 70),
          parentId: "parent",
        }),
        sectionNode({
          id: "child-c",
          localRect: rect(0, 0, 80, 70),
          parentId: "parent",
        }),
      ]),
    );

    const first = resolveGpuSectionSceneDragAutoScroll({
      draggedRect: rect(0, 88, 80, 40),
      marginPx: 30,
      maxSpeedPx: 20,
      parentSectionId: "parent",
      scene,
      scrollOffsets: new Map(),
    });

    expect(first).toMatchObject({
      changed: true,
      parentSectionId: "parent",
    });
    expect(first.scrollOffsets.get("parent")?.x).toBe(0);
    expect(first.scrollOffsets.get("parent")?.y).toBeCloseTo(15.2);

    const clamped = resolveGpuSectionSceneDragAutoScroll({
      draggedRect: rect(0, 200, 80, 40),
      marginPx: 30,
      maxSpeedPx: 1000,
      parentSectionId: "parent",
      scene,
      scrollOffsets: first.scrollOffsets,
    });

    expect(clamped.scrollOffsets.get("parent")).toMatchObject({
      x: 0,
      y: 126,
    });
  });

  it("resolves wheel scroll against the deepest renderer-owned child viewport", () => {
    const scene = resolveGpuFlowSceneLayout(
      sceneWithSections([
        sectionNode({
          childIds: ["nested-parent", "outer-child"],
          childLayoutGap: { x: 0, y: 8 },
          id: "outer-parent",
          layoutMode: "vertical",
          worldRect: rect(0, 0, 200, 140),
        }),
        sectionNode({
          childIds: ["inner-a", "inner-b", "inner-c"],
          childLayoutGap: { x: 0, y: 8 },
          id: "nested-parent",
          layoutMode: "vertical",
          localRect: rect(0, 0, 160, 80),
          parentId: "outer-parent",
        }),
        sectionNode({
          id: "outer-child",
          localRect: rect(0, 0, 160, 80),
          parentId: "outer-parent",
        }),
        sectionNode({
          id: "inner-a",
          localRect: rect(0, 0, 120, 50),
          parentId: "nested-parent",
        }),
        sectionNode({
          id: "inner-b",
          localRect: rect(0, 0, 120, 50),
          parentId: "nested-parent",
        }),
        sectionNode({
          id: "inner-c",
          localRect: rect(0, 0, 120, 50),
          parentId: "nested-parent",
        }),
      ]),
    );

    const result = resolveGpuSectionSceneWheelScroll({
      event: wheelEvent({ deltaY: 30 }),
      point: { x: 20, y: 20 },
      scene,
      scrollOffsets: new Map(),
    });

    expect(result).toMatchObject({
      changed: true,
      parentSectionId: "nested-parent",
    });
    expect(result.scrollOffsets.get("nested-parent")).toEqual({
      x: 0,
      y: 30,
    });
    expect(result.scrollOffsets.has("outer-parent")).toBe(false);
  });

  it("clamps wheel scroll and applies horizontal deltas for kanban parents", () => {
    const scene = resolveGpuFlowSceneLayout(
      sceneWithSections([
        sectionNode({
          childIds: ["child-a", "child-b", "child-c"],
          childLayoutGap: { x: 12, y: 0 },
          id: "parent",
          layoutMode: "kanban",
          worldRect: rect(0, 0, 100, 80),
        }),
        sectionNode({
          id: "child-a",
          localRect: rect(0, 0, 60, 60),
          parentId: "parent",
        }),
        sectionNode({
          id: "child-b",
          localRect: rect(0, 0, 60, 60),
          parentId: "parent",
        }),
        sectionNode({
          id: "child-c",
          localRect: rect(0, 0, 60, 60),
          parentId: "parent",
        }),
      ]),
    );

    const result = resolveGpuSectionSceneWheelScroll({
      event: wheelEvent({ deltaX: 500 }),
      point: { x: 40, y: 20 },
      scene,
      scrollOffsets: new Map(),
    });

    expect(result.scrollOffsets.get("parent")).toEqual({
      x: 104,
      y: 0,
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
  scene: GpuFlowScene,
  sectionId: string,
): GpuSectionSceneNode {
  const section = scene.sections.find(
    (candidate) => candidate.sectionId === sectionId,
  );
  if (!section) {
    throw new Error(`Missing section ${sectionId}.`);
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
  worldRect = rect(0, 0, 100, 100),
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
    localRect: localRect ?? worldRect,
    nodeId: id,
    parentSectionId: parentId,
    portAnchors: [],
    resizePolicy: {
      aspectRatio: false,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      directions: ["right", "bottom", "bottomRight"],
      locked: false,
      maxHeight: 100_000,
      maxWidth: 100_000,
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

function wheelEvent({
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
  return {
    deltaMode,
    deltaX,
    deltaY,
    shiftKey,
  };
}
