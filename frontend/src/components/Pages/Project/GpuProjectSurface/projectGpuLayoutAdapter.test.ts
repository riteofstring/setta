import type { Node } from "gpuFlow/flowTypes";
import { createGpuFlowLayoutStore } from "gpuFlow/layoutStore";
import { getGpuFlowSceneDomSectionNodes } from "gpuFlow/scene";
import type { ZustandProjectState } from "state/definitions";
import {
  CodeObjTypeEnum,
  ParamNameTypeEnum,
  ParameterPassingStyleEnum,
  createCodeParamCodeObjImpl,
  createCore,
  createDictSectionImpl,
  createGroupSectionImpl,
  createProjectConfig,
  createShownParamIDs,
  createSingleConfig,
  createVariant,
  type BaseCodeObjImplUnion,
  type BaseSectionImplUnion,
  type SingleConfig,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import {
  getProjectGpuFlowScene,
  getProjectGpuLayoutNode,
  getProjectGpuLayoutNodesFromNodeInternals,
  resolveProjectGpuSceneSectionReveal,
  syncProjectGpuLayoutStoreFromScene,
} from "./projectGpuLayoutAdapter";
import { getProjectGpuRetainedParamNavigationTarget } from "./projectGpuParamContentAdapter";

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

  it("derives retained dict param content surfaces from shown param metadata", () => {
    const projectState = projectStateWithSections({
      sections: [
        {
          id: "dict-a",
          impl: createDictSectionImpl({
            codeObjVariantMap: {
              "child-param": "child-param-variant",
              "edge-param": "edge-param-variant",
              "parent-param": "parent-param-variant",
              "root-param": "root-param-variant",
            },
            edgeInputParams: ["child-param"],
            id: "dict-a-impl",
            paramFilter: "child",
            selectedParams: ["child-param"],
            size: sectionSize({ height: 120, width: 260 }),
            topLevelParamId: "root-param",
          }),
          parentId: null,
        },
      ],
      topLevelSections: {
        "dict-a": { h: 120, w: 260, x: 10, y: 20, zIndex: 2 },
      },
    });
    addParamToProjectState(
      projectState,
      "root-param",
      "root-param-variant",
      "root-param-impl",
      createNestedParamImpl("root-param-impl", ["parent-param", "edge-param"]),
    );
    addParamToProjectState(
      projectState,
      "parent-param",
      "parent-param-variant",
      "parent-param-impl",
      createNestedParamImpl("parent-param-impl", ["child-param"]),
    );
    addParamToProjectState(
      projectState,
      "child-param",
      "child-param-variant",
      "child-param-impl",
      createCodeParamCodeObjImpl({
        coreNameEditable: true,
        id: "child-param-impl",
        name: "child",
      }),
    );
    addParamToProjectState(
      projectState,
      "edge-param",
      "edge-param-variant",
      "edge-param-impl",
      createCodeParamCodeObjImpl({
        id: "edge-param-impl",
        name: "edge",
      }),
    );
    projectState.shownParamIds["dict-a-variant"] = createShownParamIDs({
      unpinned: {
        requiredParamIdsToPaths: {
          "child-param": ["parent-param", "child-param"],
          "edge-param": ["edge-param"],
          "parent-param": ["parent-param"],
        },
        topLevelParamIds: ["parent-param", "edge-param"],
      },
    });

    const scene = getProjectGpuFlowScene(projectState, {
      darkMode: false,
      revision: 2,
    });

    const paramSurface = scene.contentSurfaces.find(
      (surface) => surface.id === "dict-a:param-content:unpinned",
    );
    expect(paramSurface).toMatchObject({
      clipRect: { height: 122, width: 262, x: 10, y: 20 },
      ownerSectionId: "dict-a",
      rect: { height: 122, width: 262, x: 10, y: 20 },
      renderer: {
        kind: "canvas-content",
        surfaceId: "dict-a:param-content:unpinned",
      },
      zIndex: 3,
    });
    expect(paramSurface?.retainedScene).toMatchObject({
      contentRect: { height: 56, width: 262, x: 0, y: 0 },
      ownerSectionId: "dict-a",
      rowHeight: 28,
      viewportRect: { height: 122, width: 262, x: 0, y: 0 },
      visibleRange: { endIndex: 2, rowCount: 2, startIndex: 0 },
    });
    expect(
      paramSurface?.retainedScene?.rows.map((row) => ({
        controlKind: row.controlKind,
        depth: row.depth,
        id: row.id,
        label: row.label,
        ports: row.ports,
        selected: row.state.selected,
      })),
    ).toEqual([
      {
        controlKind: "nested",
        depth: 0,
        id: "parent-param",
        label: "parent-param",
        ports: [],
        selected: false,
      },
      {
        controlKind: "text-like",
        depth: 1,
        id: "child-param",
        label: "child-param",
        ports: [{ id: "child-param", kind: "input", side: "left" }],
        selected: true,
      },
    ]);
    expect(paramSurface?.retainedScene?.portAnchors).toEqual([
      expect.objectContaining({
        id: "child-param",
        kind: "input",
        localPosition: { x: 0, y: 42 },
        ownerRowId: "child-param",
      }),
    ]);
    expect(
      getProjectGpuRetainedParamNavigationTarget({
        activeSectionIds: ["dict-a"],
        projectState,
        scene,
      }),
    ).toEqual({
      ownerSectionId: "dict-a",
      rowId: "child-param",
      surfaceId: "dict-a:param-content:unpinned",
    });

    const dragPreviewScene = getProjectGpuFlowScene(projectState, {
      darkMode: false,
      retainedParamDragPreview: {
        draggingParamIds: ["child-param"],
        dropMarker: { edge: "before", rowId: "parent-param" },
        pointerLocal: { x: 32, y: 44 },
        sectionId: "dict-a",
        surfaceId: "dict-a:param-content:unpinned",
      },
      revision: 3,
    });
    const dragPreviewSurface = dragPreviewScene.contentSurfaces.find(
      (surface) => surface.id === "dict-a:param-content:unpinned",
    );
    expect(
      dragPreviewSurface?.retainedScene?.rows.map((row) => ({
        dragging: row.state.dragging,
        id: row.id,
      })),
    ).toEqual([
      { dragging: false, id: "parent-param" },
      { dragging: true, id: "child-param" },
    ]);
    expect(dragPreviewSurface?.retainedScene?.drawCommands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "row-drop-marker",
          rowId: "parent-param",
        }),
        expect.objectContaining({
          kind: "row-drag-preview",
          rowId: "child-param",
        }),
      ]),
    );
  });

  it("derives active retained param controls as explicit DOM islands", () => {
    const projectState = projectStateWithSections({
      sections: [
        {
          id: "dict-a",
          impl: createDictSectionImpl({
            codeObjVariantMap: {
              "child-param": "child-param-variant",
              "parent-param": "parent-param-variant",
              "root-param": "root-param-variant",
            },
            id: "dict-a-impl",
            size: sectionSize({ height: 120, width: 260 }),
            topLevelParamId: "root-param",
          }),
          parentId: null,
        },
      ],
      topLevelSections: {
        "dict-a": { h: 120, w: 260, x: 10, y: 20, zIndex: 2 },
      },
    });
    addParamToProjectState(
      projectState,
      "root-param",
      "root-param-variant",
      "root-param-impl",
      createNestedParamImpl("root-param-impl", ["parent-param"]),
    );
    addParamToProjectState(
      projectState,
      "parent-param",
      "parent-param-variant",
      "parent-param-impl",
      createNestedParamImpl("parent-param-impl", ["child-param"]),
    );
    addParamToProjectState(
      projectState,
      "child-param",
      "child-param-variant",
      "child-param-impl",
      createCodeParamCodeObjImpl({
        id: "child-param-impl",
        name: "child",
      }),
    );
    projectState.shownParamIds["dict-a-variant"] = createShownParamIDs({
      unpinned: {
        requiredParamIdsToPaths: {
          "child-param": ["parent-param", "child-param"],
          "parent-param": ["parent-param"],
        },
        topLevelParamIds: ["parent-param"],
      },
    });

    const scene = getProjectGpuFlowScene(projectState, {
      activeParamDomIsland: {
        hitRecordId: "control:child-param",
        paramInfoId: "child-param",
        sectionId: "dict-a",
        surfaceId: "dict-a:param-content:unpinned",
      },
      darkMode: false,
      hoveredParamTarget: {
        hitRecordId: "row:parent-param",
        paramInfoId: "parent-param",
        sectionId: "dict-a",
        surfaceId: "dict-a:param-content:unpinned",
      },
      revision: 4,
    });

    const paramSurface = scene.contentSurfaces.find(
      (surface) => surface.id === "dict-a:param-content:unpinned",
    );
    expect(
      paramSurface?.retainedScene?.rows.map((row) => ({
        focused: row.state.focused,
        hovered: row.state.hovered,
        id: row.id,
      })),
    ).toEqual([
      { focused: false, hovered: true, id: "parent-param" },
      { focused: true, hovered: false, id: "child-param" },
    ]);
    expect(scene.domIslands).toEqual([
      {
        clipOwnerId: "dict-a:param-content:unpinned",
        id: "param-control:dict-a:child-param",
        kind: "retained-content-control",
        ownerSectionId: "dict-a",
        rect: { height: 28, width: 112, x: 160, y: 48 },
        source: {
          hitRecordId: "control:child-param",
          kind: "retained-content",
          ownerRowId: "child-param",
          surfaceId: "dict-a:param-content:unpinned",
        },
        zIndex: 4,
      },
    ]);
  });

  it("applies renderer-owned retained content scroll offsets to dict param surfaces", () => {
    const paramIds = Array.from({ length: 8 }, (_, index) => `param-${index}`);
    const projectState = projectStateWithSections({
      sections: [
        {
          id: "dict-a",
          impl: createDictSectionImpl({
            codeObjVariantMap: Object.fromEntries([
              ["root-param", "root-param-variant"],
              ...paramIds.map((paramId) => [paramId, `${paramId}-variant`]),
            ]),
            id: "dict-a-impl",
            size: sectionSize({ height: 60, width: 260 }),
            topLevelParamId: "root-param",
          }),
          parentId: null,
        },
      ],
      topLevelSections: {
        "dict-a": { h: 60, w: 260, x: 10, y: 20, zIndex: 2 },
      },
    });
    addParamToProjectState(
      projectState,
      "root-param",
      "root-param-variant",
      "root-param-impl",
      createNestedParamImpl("root-param-impl", paramIds),
    );
    for (const paramId of paramIds) {
      addParamToProjectState(
        projectState,
        paramId,
        `${paramId}-variant`,
        `${paramId}-impl`,
        createCodeParamCodeObjImpl({
          id: `${paramId}-impl`,
          name: paramId,
        }),
      );
    }
    projectState.shownParamIds["dict-a-variant"] = createShownParamIDs({
      unpinned: {
        requiredParamIdsToPaths: Object.fromEntries(
          paramIds.map((paramId) => [paramId, [paramId]]),
        ),
        topLevelParamIds: paramIds,
      },
    });

    const scene = getProjectGpuFlowScene(projectState, {
      contentScrollOffsets: new Map([
        ["dict-a:param-content:unpinned", { x: 0, y: 56 }],
      ]),
      darkMode: false,
      revision: 3,
    });

    const paramSurface = scene.contentSurfaces.find(
      (surface) => surface.id === "dict-a:param-content:unpinned",
    );

    expect(paramSurface?.retainedScene).toMatchObject({
      scrollOffset: { x: 0, y: 56 },
      visibleRange: { endIndex: 7, rowCount: 8, startIndex: 0 },
    });
    expect(paramSurface?.retainedScene?.rows[0]).toMatchObject({
      id: "param-0",
      projectedRect: { y: -56 },
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

  it("reveals nested sections through renderer-owned scene scroll offsets", () => {
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
      { darkMode: false },
    );

    const result = resolveProjectGpuSceneSectionReveal({
      scene,
      scrollOffsets: new Map(),
      sectionId: "child-c",
    });

    expect(result).toMatchObject({
      changed: true,
      parentSectionId: "group-a",
    });
    expect(result.scrollOffsets.get("group-a")).toEqual({
      x: 0,
      y: 66,
    });
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

function createNestedParamImpl(
  id: string,
  children: readonly string[],
): BaseCodeObjImplUnion {
  return {
    children: [...children],
    coreNameEditable: true,
    coreNameType: ParamNameTypeEnum.TEXT,
    description: "",
    id,
    isPreset: false,
    name: id,
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    type: CodeObjTypeEnum.NestedParam,
    typeAnnotation: "",
  };
}

function addParamToProjectState(
  state: ZustandProjectState,
  paramId: string,
  variantId: string,
  implId: string,
  impl: BaseCodeObjImplUnion,
) {
  state.codeObjs[paramId] = createCore({
    defaultVariant: variantId,
    displayName: "",
    id: paramId,
    name: paramId,
    variants: [variantId],
  });
  state.codeObjVariants[variantId] = createVariant({
    id: variantId,
    impl: implId,
    name: variantId,
    nonPresetImpls: [],
  });
  state.codeObjImpls[implId] = impl;
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
