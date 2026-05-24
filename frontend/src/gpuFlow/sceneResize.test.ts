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
