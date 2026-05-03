import type { Node } from "gpuFlow/flowTypes";
import { createGpuFlowLayoutStore } from "gpuFlow/layoutStore";
import type { ZustandProjectState } from "state/definitions";
import {
  createCore,
  createDictSectionImpl,
  createGroupSectionImpl,
  createProjectConfig,
  createSingleConfig,
  createVariant,
  type BaseSectionImplUnion,
  type SingleConfig,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import {
  getProjectGpuFlowScene,
  getProjectGpuLayoutNode,
  getProjectGpuLayoutNodesFromNodeInternals,
  syncProjectGpuLayoutStoreFromScene,
} from "./projectGpuLayoutAdapter";

describe("project GPU layout adapter", () => {
  it("maps project node internals into renderer layout nodes", () => {
    const node = projectNode("section-a", {
      height: null,
      position: { x: 10, y: 20 },
      tempZIndex: 7,
      width: 120,
      zIndex: 3,
    });

    expect(getProjectGpuLayoutNode(node)).toEqual({
      height: null,
      nodeId: "section-a",
      tempZIndex: 7,
      width: 120,
      x: 10,
      y: 20,
      zIndex: 3,
    });
    expect(
      getProjectGpuLayoutNodesFromNodeInternals({
        x: new Map([[node.id, node]]),
      }),
    ).toEqual([getProjectGpuLayoutNode(node)]);
  });

  it("derives a flat renderer scene from authoritative project state", () => {
    const projectState = projectStateWithSections({
      sections: [
        {
          id: "group-a",
          impl: createGroupSectionImpl({
            children: ["child-a", "child-b"],
            id: "group-impl",
            isHorizontalOrientation: true,
            size: { height: "auto", width: "auto" },
          }),
          parentId: null,
        },
        {
          id: "child-a",
          impl: createDictSectionImpl({
            id: "child-a-impl",
            size: { height: 50, width: 100 },
          }),
          parentId: "group-a",
        },
        {
          id: "child-b",
          impl: createDictSectionImpl({
            id: "child-b-impl",
            size: { height: 60, width: 120 },
          }),
          parentId: "group-a",
        },
      ],
      topLevelSections: {
        "group-a": { h: 200, w: 320, x: 10, y: 20, zIndex: 4 },
      },
    });

    const scene = getProjectGpuFlowScene(projectState, {
      darkMode: false,
      revision: 12,
    });

    expect(scene.revision).toBe(12);
    expect(scene.sections.map((section) => section.sectionId)).toEqual([
      "group-a",
      "child-a",
      "child-b",
    ]);
    expect(scene.contentSurfaces).toEqual([
      expect.objectContaining({
        id: "group-a",
        ownerSectionId: "group-a",
        renderer: { kind: "dom-section", surfaceId: "group-a" },
      }),
    ]);
    expect(scene.domIslands).toEqual([]);

    const [group, childA, childB] = scene.sections;
    expect(group).toMatchObject({
      childSectionIds: ["child-a", "child-b"],
      contentRenderer: { kind: "dom-section", surfaceId: "group-a" },
      layoutMode: "horizontal",
      parentSectionId: null,
      worldRect: { height: 200, width: 320, x: 10, y: 20 },
      x: 10,
      y: 20,
      zIndex: 4,
    });
    expect(childA).toMatchObject({
      contentRenderer: { kind: "scene-only" },
      layoutMode: "none",
      localRect: { height: 50, width: 100, x: 0, y: 0 },
      parentSectionId: "group-a",
      worldRect: { height: 50, width: 100, x: 10, y: 20 },
    });
    expect(childB).toMatchObject({
      contentRenderer: { kind: "scene-only" },
      localRect: { height: 60, width: 120, x: 108, y: 0 },
      parentSectionId: "group-a",
      worldRect: { height: 60, width: 120, x: 118, y: 20 },
    });
  });

  it("replaces the renderer layout store from scene-owned DOM surfaces", () => {
    const store = createGpuFlowLayoutStore({
      nodes: [
        {
          height: 40,
          nodeId: "stale-section",
          width: 80,
          x: 0,
          y: 0,
          zIndex: 1,
        },
      ],
    });
    const scene = getProjectGpuFlowScene(
      projectStateWithSections({
        sections: [
          {
            id: "current-section",
            impl: createGroupSectionImpl({
              id: "current-section-impl",
              size: { height: "auto", width: "auto" },
            }),
            parentId: null,
          },
        ],
        topLevelSections: {
          "current-section": {
            h: 60,
            w: 180,
            x: 100,
            y: 140,
            zIndex: 2,
          },
        },
      }),
      { darkMode: false },
    );

    const change = syncProjectGpuLayoutStoreFromScene(store, scene);

    expect(change).toMatchObject({
      changedNodeIds: ["stale-section", "current-section"],
      phase: "commit",
      reason: "project-sync",
    });
    expect(store.getState().getNodes()).toEqual([
      expect.objectContaining({
        height: null,
        nodeId: "current-section",
        tempZIndex: 2,
        width: null,
        worldRect: { height: 60, width: 180, x: 100, y: 140 },
        x: 100,
        y: 140,
        zIndex: 2,
      }),
    ]);
    expect(store.getState().dirty).toEqual([
      "node-geometry",
      "edge-geometry",
      "selection-bounds",
      "visible-set",
      "texture-size",
      "source-size",
    ]);
  });
});

function projectNode(
  id: string,
  overrides: Partial<Omit<Node, "id">> = {},
): Node {
  return {
    height: 50,
    id,
    position: { x: 0, y: 0 },
    tempZIndex: overrides.zIndex ?? 1,
    width: 100,
    zIndex: 1,
    ...overrides,
  };
}

function projectStateWithSections({
  sections,
  topLevelSections,
}: {
  readonly sections: readonly {
    readonly id: string;
    readonly impl: BaseSectionImplUnion;
    readonly parentId: string | null;
  }[];
  readonly topLevelSections: SingleConfig["projectConfig"]["topLevelSections"];
}): ZustandProjectState {
  const sectionCores: ZustandProjectState["sections"] = {};
  const sectionImpls: ZustandProjectState["sectionImpls"] = {};
  const sectionVariants: ZustandProjectState["sectionVariants"] = {};
  const sectionVariantMap: Record<string, string> = {};
  const parentSectionMap: Record<string, string | null> = {};

  for (const section of sections) {
    const variantId = `${section.id}-variant`;
    sectionCores[section.id] = createCore({
      defaultVariant: variantId,
      id: section.id,
      name: section.id,
      variants: [variantId],
    });
    sectionImpls[section.impl.id] = section.impl;
    sectionVariants[variantId] = createVariant({
      id: variantId,
      impl: section.impl.id,
      name: variantId,
      nonPresetImpls: [],
    });
    sectionVariantMap[section.id] = variantId;
    parentSectionMap[section.id] = section.parentId;
  }

  return createSingleConfig({
    parentSectionMap,
    projectConfig: createProjectConfig({
      id: "project-1",
      sectionVariantMap,
      topLevelSections,
    }),
    sectionImpls,
    sectionVariants,
    sections: sectionCores,
  }) as ZustandProjectState;
}
