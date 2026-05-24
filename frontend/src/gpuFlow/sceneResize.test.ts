import { describe, expect, it } from "vitest";

import {
  getGpuFlowSceneDomSectionNodes,
  type GpuFlowScene,
  type GpuSectionSceneLayoutMode,
  type GpuSectionSceneNode,
} from "./scene";
import { resolveGpuFlowSceneLayout } from "./sceneLayout";
import { resolveGpuSectionSceneResizePreviewSections } from "./sceneResize";
import type { GpuPoint, GpuRect } from "./viewportMath";

describe("GPU flow scene resize preview", () => {
  it("reflows ordered siblings from resized child geometry", () => {
    const scene = resolveGpuFlowSceneLayout(
      sceneWithSections([
        sectionNode({
          childIds: ["child-a", "child-b"],
          childLayoutGap: { x: 0, y: 8 },
          id: "parent",
          layoutMode: "vertical",
          worldRect: rect(10, 20, 160, 220),
        }),
        sectionNode({
          id: "child-a",
          localRect: rect(0, 0, 120, 50),
          parentId: "parent",
        }),
        sectionNode({
          id: "child-b",
          localRect: rect(0, 0, 120, 40),
          parentId: "parent",
        }),
      ]),
    );

    const sections = sectionById({
      ...scene,
      sections: resolveGpuSectionSceneResizePreviewSections({
        resizedWorldRect: rect(10, 20, 120, 90),
        scene,
        sectionId: "child-a",
      }),
    });

    expect(sections.get("child-a")).toMatchObject({
      localRect: rect(0, 0, 120, 90),
      worldRect: rect(10, 20, 120, 90),
    });
    expect(sections.get("child-b")).toMatchObject({
      localRect: rect(0, 98, 120, 40),
      worldRect: rect(10, 118, 120, 40),
    });
  });

  it("reconciles child visibility when a parent resize changes the clip", () => {
    const scene = resolveGpuFlowSceneLayout(
      sceneWithSections([
        sectionNode({
          childIds: ["row-a", "row-b"],
          childLayoutGap: { x: 0, y: 8 },
          id: "parent",
          layoutMode: "vertical",
          worldRect: rect(0, 0, 120, 80),
        }),
        sectionNode({
          id: "row-a",
          localRect: rect(0, 0, 100, 50),
          parentId: "parent",
        }),
        sectionNode({
          id: "row-b",
          localRect: rect(0, 0, 100, 50),
          parentId: "parent",
        }),
      ]),
    );

    const previewScene = {
      ...scene,
      sections: resolveGpuSectionSceneResizePreviewSections({
        resizedWorldRect: rect(0, 0, 120, 40),
        scene,
        sectionId: "parent",
      }),
    };

    expect(
      getGpuFlowSceneDomSectionNodes(previewScene).map(
        (section) => section.sectionId,
      ),
    ).toEqual(["parent", "row-a"]);
    expect(sectionById(previewScene).get("row-b")).toMatchObject({
      clipRect: rect(0, 58, 100, 0),
    });
  });

  it("grows root clip geometry with the resized root", () => {
    const scene = resolveGpuFlowSceneLayout(
      sceneWithSections([
        sectionNode({
          id: "root",
          worldRect: rect(20, 30, 120, 90),
        }),
      ]),
    );

    const sections = sectionById({
      ...scene,
      sections: resolveGpuSectionSceneResizePreviewSections({
        resizedWorldRect: rect(20, 30, 180, 90),
        scene,
        sectionId: "root",
      }),
    });

    expect(sections.get("root")).toMatchObject({
      bodyRect: rect(20, 30, 180, 90),
      clipRect: rect(20, 30, 180, 90),
      worldRect: rect(20, 30, 180, 90),
    });
  });

  it("grows an inset child viewport with the resized parent", () => {
    const scene = resolveGpuFlowSceneLayout(
      sceneWithSections([
        sectionNode({
          bodyRect: rect(0, 20, 120, 60),
          childIds: ["row-a"],
          childViewportRect: rect(0, 20, 120, 60),
          id: "parent",
          layoutMode: "vertical",
          worldRect: rect(0, 0, 120, 80),
        }),
        sectionNode({
          id: "row-a",
          localRect: rect(0, 0, 100, 50),
          parentId: "parent",
        }),
      ]),
    );

    const sections = sectionById({
      ...scene,
      sections: resolveGpuSectionSceneResizePreviewSections({
        resizedWorldRect: rect(0, 0, 120, 120),
        scene,
        sectionId: "parent",
      }),
    });

    expect(sections.get("parent")).toMatchObject({
      bodyRect: rect(0, 20, 120, 100),
      childViewportRect: rect(0, 20, 120, 100),
      chromeRect: rect(0, 0, 120, 120),
      worldRect: rect(0, 0, 120, 120),
    });
    expect(sections.get("row-a")).toMatchObject({
      clipRect: rect(0, 20, 100, 50),
      worldRect: rect(0, 20, 100, 50),
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

function sectionById(
  scene: Pick<GpuFlowScene, "sections">,
): ReadonlyMap<string, GpuSectionSceneNode> {
  return new Map(scene.sections.map((section) => [section.sectionId, section]));
}

function sectionNode({
  bodyRect,
  childIds = [],
  childViewportRect,
  childLayoutGap = { x: 0, y: 0 },
  chromeRect,
  id,
  layoutMode = "none",
  localRect,
  parentId = null,
  scrollOffset = { x: 0, y: 0 },
  worldRect = rect(0, 0, 100, 80),
}: {
  readonly bodyRect?: GpuRect | undefined;
  readonly childIds?: readonly string[] | undefined;
  readonly childViewportRect?: GpuRect | null | undefined;
  readonly childLayoutGap?: GpuPoint | undefined;
  readonly chromeRect?: GpuRect | undefined;
  readonly id: string;
  readonly layoutMode?: GpuSectionSceneLayoutMode | undefined;
  readonly localRect?: GpuRect | undefined;
  readonly parentId?: string | null | undefined;
  readonly scrollOffset?: GpuPoint | undefined;
  readonly worldRect?: GpuRect | undefined;
}): GpuSectionSceneNode {
  const resolvedLocalRect = resolveSectionNodeLocalRect({
    localRect,
    worldRect,
  });
  const resolvedBodyRect = bodyRect ?? worldRect;
  const resolvedChildViewportRect = resolveSectionNodeChildViewportRect({
    bodyRect: resolvedBodyRect,
    childIds,
    childViewportRect,
  });
  return {
    bodyRect: resolvedBodyRect,
    childLayout: { gap: childLayoutGap },
    childSectionIds: childIds,
    childViewportRect: resolvedChildViewportRect,
    chromeRect: chromeRect ?? worldRect,
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

function resolveSectionNodeLocalRect({
  localRect,
  worldRect,
}: {
  readonly localRect: GpuRect | undefined;
  readonly worldRect: GpuRect;
}): GpuRect {
  return localRect ?? rect(0, 0, worldRect.width, worldRect.height);
}

function resolveSectionNodeChildViewportRect({
  bodyRect,
  childIds,
  childViewportRect,
}: {
  readonly bodyRect: GpuRect;
  readonly childIds: readonly string[];
  readonly childViewportRect: GpuRect | null | undefined;
}): GpuRect | null {
  if (childViewportRect !== undefined) {
    return childViewportRect;
  }
  return childIds.length > 0 ? bodyRect : null;
}

function rect(x: number, y: number, width: number, height: number): GpuRect {
  return { height, width, x, y };
}
