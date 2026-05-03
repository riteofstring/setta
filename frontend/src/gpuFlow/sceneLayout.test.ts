import { describe, expect, it } from "vitest";

import {
  getGpuFlowSceneDomSectionNodes,
  type GpuFlowScene,
  type GpuSectionSceneLayoutMode,
  type GpuSectionSceneNode,
} from "./scene";
import { resolveGpuFlowSceneLayout } from "./sceneLayout";
import type { GpuPoint, GpuRect } from "./viewportMath";

describe("GPU flow scene layout", () => {
  it("lays out vertical child sections and culls fully clipped DOM sections", () => {
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
          localRect: rect(0, 0, 80, 50),
          parentId: "parent",
        }),
        sectionNode({
          id: "child-b",
          localRect: rect(0, 0, 80, 50),
          parentId: "parent",
        }),
        sectionNode({
          id: "child-c",
          localRect: rect(0, 0, 80, 20),
          parentId: "parent",
        }),
      ]),
    );

    const sections = sectionById(scene);
    expect(sections.get("child-a")).toMatchObject({
      localRect: rect(0, 0, 80, 50),
      worldRect: rect(0, 0, 80, 50),
      clipRect: rect(0, 0, 80, 50),
    });
    expect(sections.get("child-b")).toMatchObject({
      localRect: rect(0, 58, 80, 50),
      worldRect: rect(0, 58, 80, 50),
      clipRect: rect(0, 58, 80, 42),
    });
    expect(sections.get("child-c")).toMatchObject({
      localRect: rect(0, 116, 80, 20),
      worldRect: rect(0, 116, 80, 20),
      clipRect: rect(0, 116, 80, 0),
    });
    expect(
      getGpuFlowSceneDomSectionNodes(scene).map((section) => section.sectionId),
    ).toEqual(["parent", "child-a", "child-b"]);
  });

  it("lays out horizontal and kanban child sections using parent spacing metadata", () => {
    const scene = resolveGpuFlowSceneLayout(
      sceneWithSections([
        sectionNode({
          childIds: ["column-a", "column-b"],
          childLayoutGap: { x: 12, y: 0 },
          id: "board",
          layoutMode: "kanban",
          worldRect: rect(20, 30, 400, 180),
        }),
        sectionNode({
          id: "column-a",
          localRect: rect(0, 0, 100, 120),
          parentId: "board",
        }),
        sectionNode({
          id: "column-b",
          localRect: rect(0, 0, 120, 120),
          parentId: "board",
        }),
      ]),
    );

    const sections = sectionById(scene);
    expect(sections.get("column-a")).toMatchObject({
      localRect: rect(0, 0, 100, 120),
      worldRect: rect(20, 30, 100, 120),
    });
    expect(sections.get("column-b")).toMatchObject({
      localRect: rect(112, 0, 120, 120),
      worldRect: rect(132, 30, 120, 120),
    });
    expect(scene.contentSurfaces).toEqual([
      expect.objectContaining({
        id: "board",
        ownerSectionId: "board",
        rect: rect(20, 30, 400, 180),
      }),
      expect.objectContaining({
        id: "column-a",
        ownerSectionId: "column-a",
        rect: rect(20, 30, 100, 120),
      }),
      expect.objectContaining({
        id: "column-b",
        ownerSectionId: "column-b",
        rect: rect(132, 30, 120, 120),
      }),
    ]);
  });

  it("projects child sections through renderer-owned scroll offsets", () => {
    const scene = resolveGpuFlowSceneLayout(
      sceneWithSections([
        sectionNode({
          childIds: ["row-a", "row-b"],
          childLayoutGap: { x: 0, y: 8 },
          id: "scroll-parent",
          layoutMode: "vertical",
          scrollOffset: { x: 0, y: 30 },
          worldRect: rect(0, 0, 100, 50),
        }),
        sectionNode({
          id: "row-a",
          localRect: rect(0, 0, 80, 40),
          parentId: "scroll-parent",
        }),
        sectionNode({
          id: "row-b",
          localRect: rect(0, 0, 80, 40),
          parentId: "scroll-parent",
        }),
      ]),
    );

    const sections = sectionById(scene);
    expect(sections.get("row-a")).toMatchObject({
      localRect: rect(0, 0, 80, 40),
      worldRect: rect(0, -30, 80, 40),
      clipRect: rect(0, 0, 80, 10),
    });
    expect(sections.get("row-b")).toMatchObject({
      localRect: rect(0, 48, 80, 40),
      worldRect: rect(0, 18, 80, 40),
      clipRect: rect(0, 18, 80, 32),
    });
  });

  it("fails loudly when child order does not match parent ownership", () => {
    expect(() =>
      resolveGpuFlowSceneLayout(
        sceneWithSections([
          sectionNode({
            childIds: [],
            id: "parent",
          }),
          sectionNode({
            id: "child",
            parentId: "parent",
          }),
        ]),
      ),
    ).toThrow(
      "Section scene node child is parented to parent but is not listed in that parent's child order.",
    );
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

function sectionById(
  scene: GpuFlowScene,
): ReadonlyMap<string, GpuSectionSceneNode> {
  return new Map(scene.sections.map((section) => [section.sectionId, section]));
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
