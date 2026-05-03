import type { Node } from "gpuFlow/flowTypes";
import { createGpuFlowLayoutStore } from "gpuFlow/layoutStore";
import { getGpuFlowSceneDomSectionNodes } from "gpuFlow/scene";
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
            size: sectionSize({ height: "auto", width: "auto" }),
          }),
          parentId: null,
        },
        {
          id: "child-a",
          impl: createDictSectionImpl({
            id: "child-a-impl",
            size: sectionSize({ height: 50, width: 100 }),
          }),
          parentId: "group-a",
        },
        {
          id: "child-b",
          impl: createDictSectionImpl({
            id: "child-b-impl",
            positionAndSizeLocked: true,
            size: sectionSize({ height: 60, width: 120 }),
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
      expect.objectContaining({
        id: "child-a",
        ownerSectionId: "child-a",
        renderer: { kind: "dom-section", surfaceId: "child-a" },
      }),
      expect.objectContaining({
        id: "child-b",
        ownerSectionId: "child-b",
        renderer: { kind: "dom-section", surfaceId: "child-b" },
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
      contentRenderer: { kind: "dom-section", surfaceId: "child-a" },
      layoutMode: "none",
      localRect: { height: 50, width: 100, x: 0, y: 0 },
      parentSectionId: "group-a",
      resizePolicy: expect.objectContaining({
        directions: ["right", "bottom", "bottomRight"],
        locked: false,
      }),
      worldRect: { height: 50, width: 100, x: 10, y: 20 },
      zIndex: 4,
    });
    expect(childB).toMatchObject({
      contentRenderer: { kind: "dom-section", surfaceId: "child-b" },
      localRect: { height: 60, width: 120, x: 108, y: 0 },
      parentSectionId: "group-a",
      resizePolicy: expect.objectContaining({
        directions: [],
        locked: true,
      }),
      worldRect: { height: 60, width: 120, x: 118, y: 20 },
      zIndex: 4,
    });

    const store = createGpuFlowLayoutStore();
    syncProjectGpuLayoutStoreFromScene(store, scene);
    expect(
      store
        .getState()
        .getNodes()
        .map((node) => node.nodeId),
    ).toEqual(["group-a", "child-a", "child-b"]);
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
              size: sectionSize({ height: "auto", width: "auto" }),
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

  it("syncs only nested DOM section surfaces inside renderer-owned clips", () => {
    const scene = getProjectGpuFlowScene(
      projectStateWithSections({
        sections: [
          {
            id: "group-a",
            impl: createGroupSectionImpl({
              children: ["child-a", "child-b", "child-c"],
              id: "group-a-impl",
              size: sectionSize({ height: "auto", width: "auto" }),
            }),
            parentId: null,
          },
          {
            id: "child-a",
            impl: createDictSectionImpl({
              id: "child-a-impl",
              size: sectionSize({ height: 50, width: 80 }),
            }),
            parentId: "group-a",
          },
          {
            id: "child-b",
            impl: createDictSectionImpl({
              id: "child-b-impl",
              size: sectionSize({ height: 50, width: 80 }),
            }),
            parentId: "group-a",
          },
          {
            id: "child-c",
            impl: createDictSectionImpl({
              id: "child-c-impl",
              size: sectionSize({ height: 20, width: 80 }),
            }),
            parentId: "group-a",
          },
        ],
        topLevelSections: {
          "group-a": { h: 100, w: 200, x: 0, y: 0, zIndex: 1 },
        },
      }),
      { darkMode: false },
    );

    expect(scene.sections.map((section) => section.sectionId)).toEqual([
      "group-a",
      "child-a",
      "child-b",
      "child-c",
    ]);
    expect(
      getGpuFlowSceneDomSectionNodes(scene).map((section) => section.sectionId),
    ).toEqual(["group-a", "child-a", "child-b"]);

    const store = createGpuFlowLayoutStore();
    syncProjectGpuLayoutStoreFromScene(store, scene);
    expect(
      store
        .getState()
        .getNodes()
        .map((node) => node.nodeId),
    ).toEqual(["group-a", "child-a", "child-b"]);
  });

  it("applies renderer-owned scene scroll offsets before syncing layout nodes", () => {
    const scene = getProjectGpuFlowScene(
      projectStateWithSections({
        sections: [
          {
            id: "group-a",
            impl: createGroupSectionImpl({
              children: ["child-a", "child-b", "child-c"],
              id: "group-a-impl",
              size: sectionSize({ height: "auto", width: "auto" }),
            }),
            parentId: null,
          },
          {
            id: "child-a",
            impl: createDictSectionImpl({
              id: "child-a-impl",
              size: sectionSize({ height: 50, width: 80 }),
            }),
            parentId: "group-a",
          },
          {
            id: "child-b",
            impl: createDictSectionImpl({
              id: "child-b-impl",
              size: sectionSize({ height: 50, width: 80 }),
            }),
            parentId: "group-a",
          },
          {
            id: "child-c",
            impl: createDictSectionImpl({
              id: "child-c-impl",
              size: sectionSize({ height: 50, width: 80 }),
            }),
            parentId: "group-a",
          },
        ],
        topLevelSections: {
          "group-a": { h: 100, w: 200, x: 10, y: 20, zIndex: 1 },
        },
      }),
      {
        darkMode: false,
        scrollOffsets: new Map([["group-a", { x: 0, y: 40 }]]),
      },
    );

    expect(
      scene.sections.find((section) => section.sectionId === "group-a"),
    ).toMatchObject({
      scrollOffset: { x: 0, y: 40 },
    });
    expect(
      scene.sections.find((section) => section.sectionId === "child-a"),
    ).toMatchObject({
      clipRect: { height: 10, width: 80, x: 10, y: 20 },
      worldRect: { height: 50, width: 80, x: 10, y: -20 },
    });
    expect(
      scene.sections.find((section) => section.sectionId === "child-c"),
    ).toMatchObject({
      worldRect: { height: 50, width: 80, x: 10, y: 96 },
    });

    const store = createGpuFlowLayoutStore();
    syncProjectGpuLayoutStoreFromScene(store, scene);
    expect(
      store
        .getState()
        .getNodes()
        .map((node) => [node.nodeId, node.y]),
    ).toEqual([
      ["group-a", 20],
      ["child-a", -20],
      ["child-b", 38],
      ["child-c", 96],
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

function sectionSize(size: {
  readonly height: number | "auto";
  readonly width: number | "auto";
}): never {
  // create*SectionImpl accepts the runtime section-size shape but its generated
  // option type still exposes the Go wrapper representation.
  return size as never;
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

  const state = createSingleConfig({
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
  state.previewSectionVariantMap = {};
  return state;
}
