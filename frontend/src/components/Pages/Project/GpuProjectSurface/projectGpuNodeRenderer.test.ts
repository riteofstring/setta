import { describe, expect, it } from "vitest";
import type { GpuFlowScene, GpuSectionSceneNode } from "gpuFlow/scene";
import { createProjectGpuRetainedSectionTextureScene } from "./projectGpuRetainedSectionTextures";

describe("createProjectGpuRetainedSectionTextureScene", () => {
  it("uses full section shell textures for retained content sections", () => {
    const scene = sceneWithSections([
      section("retained-section"),
      section("plain-section"),
    ]);

    const retainedScene = createProjectGpuRetainedSectionTextureScene({
      ...scene,
      contentSurfaces: [
        {
          clipRect: rect(0, 0, 400, 300),
          id: "retained-surface",
          ownerSectionId: "retained-section",
          rect: rect(0, 0, 400, 300),
          renderer: { kind: "canvas-content", surfaceId: "retained-surface" },
          retainedScene: {
            contentRect: rect(0, 0, 400, 300),
            drawCommands: [],
            hitRecords: [],
            id: "retained-scene",
            ownerSectionId: "retained-section",
            portAnchors: [],
            rowHeight: 24,
            rowOrder: [],
            rows: [],
            scrollOffset: { x: 0, y: 0 },
            viewportRect: rect(0, 0, 400, 300),
            visibleRange: { endIndex: 0, rowCount: 0, startIndex: 0 },
          },
          zIndex: 1,
        },
      ],
    });

    expect(retainedScene.sections[0]).toMatchObject({
      textureContentKey: "project-retained-section-shell:v2:retained-section:1",
    });
    expect(retainedScene.sections[0]).not.toHaveProperty("textureCssHeight");
    expect(retainedScene.sections[0]).not.toHaveProperty("textureCssWidth");
    expect(retainedScene.sections[1]).not.toHaveProperty("textureCssHeight");
    expect(retainedScene.sections[1]).not.toHaveProperty("textureCssWidth");
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

function section(sectionId: string): GpuSectionSceneNode {
  return {
    bodyRect: rect(0, 0, 400, 300),
    childLayout: { gap: { x: 0, y: 0 } },
    childSectionIds: [],
    childViewportRect: null,
    chromeRect: rect(0, 0, 400, 300),
    clipRect: rect(0, 0, 400, 300),
    contentRenderer: { kind: "dom-section", surfaceId: sectionId },
    dirty: [],
    height: 300,
    interactionLayer: "content",
    layoutMode: "none",
    localRect: rect(0, 0, 400, 300),
    nodeId: sectionId,
    parentSectionId: null,
    portAnchors: [],
    resizePolicy: {
      aspectRatio: false,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      directions: [],
      locked: false,
      maxHeight: 1_000,
      maxWidth: 1_000,
      minHeight: 1,
      minWidth: 1,
    },
    scrollOffset: { x: 0, y: 0 },
    sectionId,
    width: 400,
    worldRect: rect(0, 0, 400, 300),
    x: 0,
    y: 0,
    zIndex: 1,
  };
}

function rect(x: number, y: number, width: number, height: number) {
  return { height, width, x, y };
}
