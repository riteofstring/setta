import { KWARGS_CONTROLS_SCENE_HEIGHT_PX } from "components/Section/SectionParts/kwargsControlsLayout";
import { PROJECT_SECTION_SEARCH_HEIGHT_PX } from "components/Section/SectionParts/sectionSearchLayout";
import { createGpuFlowLayoutStore } from "gpuFlow/layoutStore";
import { createProjectSearchLookupKey } from "state/hooks/search";
import {
  addParamToProjectState,
  createNestedParamImpl,
  mustContentSurface,
  mustRetainedScene,
  mustSceneSection,
  projectNode,
  projectStateWithSections,
  retainedDrawCommandRect,
  rowControlWidth,
  sectionSize,
} from "testUtils/projectGpuLayoutAdapter.test.support";
import {
  createCallableSectionImpl,
  createCodeParamCodeObjImpl,
  createDictSectionImpl,
  createGroupSectionImpl,
  createSettingsState,
  createShownParamIDs,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import {
  getProjectGpuFlowScene,
  resolveProjectGpuResizePreviewScene,
  syncProjectGpuLayoutStoreFromScene,
} from "./projectGpuLayoutAdapter";
import {
  getProjectGpuLayoutNode,
  getProjectGpuLayoutNodesFromNodeInternals,
} from "./projectGpuLayoutNodeAdapter";
import {
  PROJECT_GPU_PARAM_CONTENT_BASE_VERTICAL_CHROME_PX,
  PROJECT_GPU_PARAM_CONTENT_NESTED_GUTTER_PX,
  PROJECT_GPU_PARAM_CONTENT_UNPINNED_TOP_GAP_WITH_PINNED_PX,
} from "./projectGpuParamContentLayout";
import { getProjectGpuRetainedParamNavigationTarget } from "./projectGpuRetainedParamNavigationTarget";
import { PROJECT_SECTION_SCENE_HEADER_HEIGHT_PX } from "./projectSectionSceneHeaderLayout";

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
            size: sectionSize({
              height: 120 + KWARGS_CONTROLS_SCENE_HEIGHT_PX,
              width: 260,
            }),
            topLevelParamId: "root-param",
          }),
          parentId: null,
        },
      ],
      topLevelSections: {
        "dict-a": {
          h: 120 + KWARGS_CONTROLS_SCENE_HEIGHT_PX,
          w: 260,
          x: 10,
          y: 20,
          zIndex: 2,
        },
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
      projectSearch: {
        focused: {
          name: "child",
          paramInfoId: "child-param",
          sectionId: "dict-a",
        },
        lookup: new Set([
          createProjectSearchLookupKey("dict-a", "parent-param"),
          createProjectSearchLookupKey("dict-a", "child-param"),
        ]),
      },
      revision: 2,
      typeErrors: {
        "dict-a": {
          callable: [],
          params: {
            "child-param": ["expected str, got int"],
          },
        },
      },
    });

    const paramSurface = mustContentSurface(
      scene,
      "dict-a:param-content:unpinned",
    );
    const retainedScene = mustRetainedScene(
      scene,
      "dict-a:param-content:unpinned",
    );
    expect(paramSurface).toMatchObject({
      clipRect: {
        height: 22,
        width: 261,
        x: 10,
        y: 119 + KWARGS_CONTROLS_SCENE_HEIGHT_PX,
      },
      ownerSectionId: "dict-a",
      rect: {
        height: 23,
        width: 262,
        x: 10,
        y: 119 + KWARGS_CONTROLS_SCENE_HEIGHT_PX,
      },
      renderer: {
        kind: "canvas-content",
        surfaceId: "dict-a:param-content:unpinned",
      },
      zIndex: 3,
    });
    expect(retainedScene).toMatchObject({
      contentRect: { height: 48, width: 262, x: 0, y: 0 },
      ownerSectionId: "dict-a",
      rowHeight: 24,
      viewportRect: { height: 23, width: 262, x: 0, y: 0 },
      visibleRange: { endIndex: 2, rowCount: 2, startIndex: 0 },
    });
    expect(
      retainedScene.rows.map((row) => ({
        controlKind: row.controlKind,
        depth: row.depth,
        id: row.id,
        label: row.label,
        ports: row.ports,
        error: row.state.error,
        searchFocused: row.state.searchFocused,
        searchMatched: row.state.searchMatched,
        selected: row.state.selected,
        status: row.status,
      })),
    ).toEqual([
      {
        controlKind: "nested",
        depth: 0,
        id: "parent-param",
        label: "parent-param",
        ports: [],
        error: false,
        searchFocused: false,
        searchMatched: true,
        selected: false,
        status: null,
      },
      {
        controlKind: "text-like",
        depth: 1,
        id: "child-param",
        label: "child-param",
        ports: [{ id: "child-param", kind: "input", side: "left" }],
        error: true,
        searchFocused: true,
        searchMatched: true,
        selected: true,
        status: {
          kind: "error",
          messages: ["expected str, got int"],
          summary: "expected str, got int",
        },
      },
    ]);
    expect(
      retainedScene.rows.find((row) => row.id === "child-param")?.control,
    ).toMatchObject({
      displayValue: "",
      editorKind: "code",
      kind: "text-like",
      rendererFamily: "text-like",
      commitPolicy: "native-island",
    });
    expect(retainedScene.portAnchors).toEqual([
      expect.objectContaining({
        id: "child-param",
        kind: "input",
        localPosition: { x: 0, y: 36 },
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
    const dragPreviewRetainedScene = mustRetainedScene(
      dragPreviewScene,
      "dict-a:param-content:unpinned",
    );
    expect(
      dragPreviewRetainedScene.rows.map((row) => ({
        dragging: row.state.dragging,
        id: row.id,
      })),
    ).toEqual([
      { dragging: false, id: "parent-param" },
      { dragging: true, id: "child-param" },
    ]);
    expect(dragPreviewRetainedScene.drawCommands).toEqual(
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

  it("derives retained param content geometry from resize preview sections", () => {
    const projectState = projectStateWithSections({
      sections: [
        {
          id: "dict-a",
          impl: createDictSectionImpl({
            codeObjVariantMap: {
              "param-a": "param-a-variant",
              "root-param": "root-param-variant",
            },
            id: "dict-a-impl",
            size: sectionSize({ height: 160, width: 260 }),
            topLevelParamId: "root-param",
          }),
          parentId: null,
        },
      ],
      topLevelSections: {
        "dict-a": { h: 160, w: 260, x: 10, y: 20, zIndex: 2 },
      },
    });
    addParamToProjectState(
      projectState,
      "root-param",
      "root-param-variant",
      "root-param-impl",
      createNestedParamImpl("root-param-impl", ["param-a"]),
    );
    addParamToProjectState(
      projectState,
      "param-a",
      "param-a-variant",
      "param-a-impl",
      createCodeParamCodeObjImpl({
        id: "param-a-impl",
        name: "param-a",
      }),
    );
    projectState.shownParamIds["dict-a-variant"] = createShownParamIDs({
      unpinned: {
        requiredParamIdsToPaths: {
          "param-a": ["param-a"],
        },
        topLevelParamIds: ["param-a"],
      },
    });
    const scene = getProjectGpuFlowScene(projectState, {
      darkMode: false,
      revision: 5,
    });
    const section = mustSceneSection(scene, "dict-a");
    const surface = mustContentSurface(scene, "dict-a:param-content:unpinned");
    const retainedScene = mustRetainedScene(
      scene,
      "dict-a:param-content:unpinned",
    );

    const previewScene = resolveProjectGpuResizePreviewScene(
      projectState,
      { darkMode: false, revision: scene.revision },
      {
        resizedWorldRect: {
          ...section.worldRect,
          height: section.worldRect.height + 60,
          width: section.worldRect.width + 100,
        },
        scene,
        sectionId: "dict-a",
      },
    );
    const previewSection = mustSceneSection(previewScene, "dict-a");
    const previewSurface = mustContentSurface(
      previewScene,
      "dict-a:param-content:unpinned",
    );
    const previewRetainedScene = mustRetainedScene(
      previewScene,
      "dict-a:param-content:unpinned",
    );

    expect(previewSection.worldRect).toMatchObject({
      height: section.worldRect.height + 60,
      width: section.worldRect.width + 100,
    });
    expect(previewSurface).toMatchObject({
      rect: {
        height: surface.rect.height + 60,
        width: surface.rect.width + 100,
      },
    });
    expect(previewRetainedScene.viewportRect).toMatchObject({
      height: retainedScene.viewportRect.height + 60,
      width: retainedScene.viewportRect.width + 100,
    });
    expect(rowControlWidth(previewRetainedScene, "param-a")).toBeGreaterThan(
      rowControlWidth(retainedScene, "param-a"),
    );
  });

  it("derives retained callable param content surfaces from shown param metadata", () => {
    const projectState = projectStateWithSections({
      sections: [
        {
          id: "callable-a",
          impl: createCallableSectionImpl({
            callable: "callable-root",
            codeObjVariantMap: {
              "body-param": "body-param-variant",
              "callable-root": "callable-root-variant",
              "pinned-param": "pinned-param-variant",
            },
            id: "callable-a-impl",
            pinnedParams: ["pinned-param"],
            size: sectionSize({ height: 160, width: 260 }),
          }),
          parentId: null,
        },
      ],
      topLevelSections: {
        "callable-a": { h: 160, w: 260, x: 10, y: 20, zIndex: 2 },
      },
    });
    addParamToProjectState(
      projectState,
      "callable-root",
      "callable-root-variant",
      "callable-root-impl",
      createNestedParamImpl("callable-root-impl", [
        "pinned-param",
        "body-param",
      ]),
    );
    addParamToProjectState(
      projectState,
      "pinned-param",
      "pinned-param-variant",
      "pinned-param-impl",
      createCodeParamCodeObjImpl({
        id: "pinned-param-impl",
        name: "pinned",
      }),
    );
    addParamToProjectState(
      projectState,
      "body-param",
      "body-param-variant",
      "body-param-impl",
      createCodeParamCodeObjImpl({
        id: "body-param-impl",
        name: "body",
      }),
    );
    projectState.shownParamIds["callable-a-variant"] = createShownParamIDs({
      pinned: {
        requiredParamIdsToPaths: {
          "pinned-param": ["pinned-param"],
        },
        topLevelParamIds: ["pinned-param"],
      },
      unpinned: {
        requiredParamIdsToPaths: {
          "body-param": ["body-param"],
        },
        topLevelParamIds: ["body-param"],
      },
    });

    const scene = getProjectGpuFlowScene(projectState, {
      darkMode: false,
      revision: 3,
    });

    const pinnedSurface = mustContentSurface(
      scene,
      "callable-a:param-content:pinned",
    );
    const unpinnedSurface = mustContentSurface(
      scene,
      "callable-a:param-content:unpinned",
    );
    const pinnedRetainedScene = mustRetainedScene(
      scene,
      "callable-a:param-content:pinned",
    );
    const unpinnedRetainedScene = mustRetainedScene(
      scene,
      "callable-a:param-content:unpinned",
    );

    expect(pinnedRetainedScene.rows.map((row) => row.id)).toEqual([
      "pinned-param",
    ]);
    expect(unpinnedRetainedScene.rows.map((row) => row.id)).toEqual([
      "body-param",
    ]);
    expect(pinnedSurface.rect.y).toBe(
      20 +
        PROJECT_SECTION_SCENE_HEADER_HEIGHT_PX +
        PROJECT_SECTION_SEARCH_HEIGHT_PX +
        KWARGS_CONTROLS_SCENE_HEIGHT_PX +
        5,
    );
    expect(unpinnedSurface.rect.y).toBe(
      pinnedSurface.rect.y +
        pinnedRetainedScene.rowHeight +
        PROJECT_GPU_PARAM_CONTENT_UNPINNED_TOP_GAP_WITH_PINNED_PX,
    );
  });

  it("derives auto-height param section geometry from retained rows", () => {
    const projectState = projectStateWithSections({
      sections: [
        {
          id: "dict-a",
          impl: createDictSectionImpl({
            codeObjVariantMap: {
              "param-a": "param-a-variant",
              "param-b": "param-b-variant",
              "param-c": "param-c-variant",
              "root-param": "root-param-variant",
            },
            id: "dict-a-impl",
            size: sectionSize({ height: "auto", width: 260 }),
            topLevelParamId: "root-param",
          }),
          parentId: null,
        },
      ],
      topLevelSections: {
        "dict-a": { h: 80, w: 260, x: 10, y: 20, zIndex: 2 },
      },
    });
    addParamToProjectState(
      projectState,
      "root-param",
      "root-param-variant",
      "root-param-impl",
      createNestedParamImpl("root-param-impl", [
        "param-a",
        "param-b",
        "param-c",
      ]),
    );
    for (const paramId of ["param-a", "param-b", "param-c"]) {
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
        requiredParamIdsToPaths: {
          "param-a": ["param-a"],
          "param-b": ["param-b"],
          "param-c": ["param-c"],
        },
        topLevelParamIds: ["param-a", "param-b", "param-c"],
      },
    });

    const scene = getProjectGpuFlowScene(projectState, {
      darkMode: false,
      revision: 2,
    });
    const section = mustSceneSection(scene, "dict-a");
    const retainedScene = mustRetainedScene(
      scene,
      "dict-a:param-content:unpinned",
    );
    const expectedHeight =
      PROJECT_SECTION_SCENE_HEADER_HEIGHT_PX +
      KWARGS_CONTROLS_SCENE_HEIGHT_PX +
      PROJECT_GPU_PARAM_CONTENT_BASE_VERTICAL_CHROME_PX +
      3 * 24;

    expect(section.worldRect).toMatchObject({
      height: expectedHeight,
      width: 262,
      x: 10,
      y: 20,
    });
    expect(retainedScene.contentRect.height).toBe(72);
  });

  it("adds nested retained row chrome to auto-height param sections", () => {
    const projectState = projectStateWithSections({
      sections: [
        {
          id: "dict-a",
          impl: createDictSectionImpl({
            codeObjVariantMap: {
              "child-param": "child-param-variant",
              "parent-param": "parent-param-variant",
              "root-param": "root-param-variant",
              "sibling-param": "sibling-param-variant",
            },
            id: "dict-a-impl",
            size: sectionSize({ height: "auto", width: 260 }),
            topLevelParamId: "root-param",
          }),
          parentId: null,
        },
      ],
      topLevelSections: {
        "dict-a": { h: 80, w: 260, x: 10, y: 20, zIndex: 2 },
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
        name: "child-param",
      }),
    );
    addParamToProjectState(
      projectState,
      "sibling-param",
      "sibling-param-variant",
      "sibling-param-impl",
      createCodeParamCodeObjImpl({
        id: "sibling-param-impl",
        name: "sibling-param",
      }),
    );
    projectState.shownParamIds["dict-a-variant"] = createShownParamIDs({
      unpinned: {
        requiredParamIdsToPaths: {
          "child-param": ["parent-param", "child-param"],
          "parent-param": ["parent-param"],
          "sibling-param": ["sibling-param"],
        },
        topLevelParamIds: ["parent-param", "sibling-param"],
      },
    });

    const scene = getProjectGpuFlowScene(projectState, {
      darkMode: false,
      revision: 2,
    });
    const section = mustSceneSection(scene, "dict-a");
    const retainedScene = mustRetainedScene(
      scene,
      "dict-a:param-content:unpinned",
    );
    const expectedHeight =
      PROJECT_SECTION_SCENE_HEADER_HEIGHT_PX +
      KWARGS_CONTROLS_SCENE_HEIGHT_PX +
      PROJECT_GPU_PARAM_CONTENT_BASE_VERTICAL_CHROME_PX +
      4 +
      3 * 24;

    expect(section.worldRect).toMatchObject({
      height: expectedHeight,
      width: 262,
      x: 10,
      y: 20,
    });
    expect(retainedScene.rows.map((row) => [row.id, row.depth])).toEqual([
      ["parent-param", 0],
      ["child-param", 1],
      ["sibling-param", 0],
    ]);
    const childControlRect = retainedDrawCommandRect(
      retainedScene,
      "row-control",
      "child-param",
    );
    const siblingControlRect = retainedDrawCommandRect(
      retainedScene,
      "row-control",
      "sibling-param",
    );
    expect(childControlRect.x).toBe(
      siblingControlRect.x + PROJECT_GPU_PARAM_CONTENT_NESTED_GUTTER_PX,
    );
    expect(childControlRect.width).toBe(
      siblingControlRect.width - PROJECT_GPU_PARAM_CONTENT_NESTED_GUTTER_PX,
    );
    expect(
      retainedDrawCommandRect(retainedScene, "nest-guide", "child-param"),
    ).toMatchObject({
      width: 6,
      x: PROJECT_GPU_PARAM_CONTENT_NESTED_GUTTER_PX + 1,
    });
  });

  it("reserves blank retained content height for empty auto-height param sections", () => {
    const projectState = projectStateWithSections({
      sections: [
        {
          id: "dict-a",
          impl: createDictSectionImpl({
            codeObjVariantMap: {
              "root-param": "root-param-variant",
            },
            id: "dict-a-impl",
            size: sectionSize({ height: "auto", width: 260 }),
            topLevelParamId: "root-param",
          }),
          parentId: null,
        },
      ],
      topLevelSections: {
        "dict-a": { h: 80, w: 260, x: 10, y: 20, zIndex: 2 },
      },
    });
    addParamToProjectState(
      projectState,
      "root-param",
      "root-param-variant",
      "root-param-impl",
      createNestedParamImpl("root-param-impl", []),
    );
    projectState.shownParamIds["dict-a-variant"] = createShownParamIDs({
      unpinned: {
        requiredParamIdsToPaths: {},
        topLevelParamIds: [],
      },
    });
    const defaultSizingPolicy = createSettingsState().sectionSizingPolicy;
    const sizingPolicy = {
      ...defaultSizingPolicy,
      byType: {
        ...defaultSizingPolicy.byType,
        Dict: {
          ...defaultSizingPolicy.byType.Dict,
          minHeight: 0,
        },
      },
      globals: {
        ...defaultSizingPolicy.globals,
        unpinnedParamsAreaMinHeight: 0,
      },
    };

    const scene = getProjectGpuFlowScene(projectState, {
      darkMode: false,
      resizePolicyContext: {
        resizeEventBySectionId: {},
        sizingPolicy,
      },
      revision: 2,
    });
    const section = scene.sections.find(
      (candidate) => candidate.sectionId === "dict-a",
    );

    expect(section?.worldRect.height).toBe(
      PROJECT_SECTION_SCENE_HEADER_HEIGHT_PX +
        KWARGS_CONTROLS_SCENE_HEIGHT_PX +
        PROJECT_GPU_PARAM_CONTENT_BASE_VERTICAL_CHROME_PX +
        24,
    );
    expect(
      scene.contentSurfaces.some(
        (surface) => surface.id === "dict-a:param-content:unpinned",
      ),
    ).toBe(false);
  });

  it("caps auto-height param section geometry to the section sizing policy", () => {
    const projectState = projectStateWithSections({
      sections: [
        {
          id: "dict-a",
          impl: createDictSectionImpl({
            codeObjVariantMap: {
              "root-param": "root-param-variant",
              ...Object.fromEntries(
                Array.from({ length: 20 }, (_, index) => [
                  `param-${index}`,
                  `param-${index}-variant`,
                ]),
              ),
            },
            id: "dict-a-impl",
            size: sectionSize({ height: "auto", width: 260 }),
            topLevelParamId: "root-param",
          }),
          parentId: null,
        },
      ],
      topLevelSections: {
        "dict-a": { h: 80, w: 260, x: 10, y: 20, zIndex: 2 },
      },
    });
    const paramIds = Array.from({ length: 20 }, (_, index) => `param-${index}`);
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
    const defaultSizingPolicy = createSettingsState().sectionSizingPolicy;
    const sizingPolicy = {
      ...defaultSizingPolicy,
      globals: {
        ...defaultSizingPolicy.globals,
        autoMaxHeight: 96,
      },
    };

    const scene = getProjectGpuFlowScene(projectState, {
      darkMode: false,
      resizePolicyContext: {
        resizeEventBySectionId: {},
        sizingPolicy,
      },
      revision: 2,
    });
    const section = scene.sections.find(
      (candidate) => candidate.sectionId === "dict-a",
    );
    const unpinnedSurface = scene.contentSurfaces.find(
      (surface) => surface.id === "dict-a:param-content:unpinned",
    );
    const expectedCappedHeight = 102;
    const expectedContentTop =
      PROJECT_SECTION_SCENE_HEADER_HEIGHT_PX +
      KWARGS_CONTROLS_SCENE_HEIGHT_PX +
      5;

    expect(section?.worldRect.height).toBe(expectedCappedHeight);
    expect(unpinnedSurface?.rect).toMatchObject({
      height: expectedCappedHeight - expectedContentTop,
      y: 20 + expectedContentTop,
    });
    expect(unpinnedSurface?.retainedScene?.viewportRect.height).toBe(
      expectedCappedHeight - expectedContentTop,
    );
  });

  it("emits retained duplicate-name status from the param duplicate index", () => {
    const projectState = projectStateWithSections({
      sections: [
        {
          id: "dict-a",
          impl: createDictSectionImpl({
            codeObjVariantMap: {
              "duplicate-a": "duplicate-a-variant",
              "duplicate-b": "duplicate-b-variant",
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
      createNestedParamImpl("root-param-impl", ["duplicate-a", "duplicate-b"]),
    );
    addParamToProjectState(
      projectState,
      "duplicate-a",
      "duplicate-a-variant",
      "duplicate-a-impl",
      createCodeParamCodeObjImpl({
        coreNameEditable: true,
        id: "duplicate-a-impl",
        name: "first",
      }),
    );
    addParamToProjectState(
      projectState,
      "duplicate-b",
      "duplicate-b-variant",
      "duplicate-b-impl",
      createCodeParamCodeObjImpl({
        coreNameEditable: true,
        id: "duplicate-b-impl",
        name: "second",
      }),
    );
    projectState.codeObjs["duplicate-a"]!.name = "shared_name";
    projectState.codeObjs["duplicate-b"]!.name = "shared_name";
    projectState.shownParamIds["dict-a-variant"] = createShownParamIDs({
      unpinned: {
        requiredParamIdsToPaths: {
          "duplicate-a": ["duplicate-a"],
          "duplicate-b": ["duplicate-b"],
        },
        topLevelParamIds: ["duplicate-a", "duplicate-b"],
      },
    });

    const scene = getProjectGpuFlowScene(projectState, {
      darkMode: false,
      revision: 4,
    });

    const paramSurface = scene.contentSurfaces.find(
      (surface) => surface.id === "dict-a:param-content:unpinned",
    );
    const duplicateMessage =
      'Param name "shared_name" already exists under this parent.';
    expect(
      paramSurface?.retainedScene?.rows.map((row) => ({
        error: row.state.error,
        id: row.id,
        status: row.status,
      })),
    ).toEqual([
      {
        error: true,
        id: "duplicate-a",
        status: {
          kind: "error",
          messages: [duplicateMessage],
          summary: duplicateMessage,
        },
      },
      {
        error: true,
        id: "duplicate-b",
        status: {
          kind: "error",
          messages: [duplicateMessage],
          summary: duplicateMessage,
        },
      },
    ]);
    expect(paramSurface?.retainedScene?.drawCommands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "row-status-badge",
          rowId: "duplicate-a",
        }),
        expect.objectContaining({
          kind: "row-status-badge",
          rowId: "duplicate-b",
        }),
      ]),
    );
    expect(scene.domIslands).toEqual([]);
  });
});
