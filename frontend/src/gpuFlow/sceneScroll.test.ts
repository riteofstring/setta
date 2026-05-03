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
