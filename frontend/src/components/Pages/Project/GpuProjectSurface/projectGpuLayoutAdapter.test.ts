import { PARAM_NAME_EMPTY_DEFAULT_VALUE } from "components/Params/ParamItems/paramNameDefaults";
import { KWARGS_CONTROLS_SCENE_HEIGHT_PX } from "components/Section/SectionParts/kwargsControlsLayout";
import { PROJECT_SECTION_SEARCH_HEIGHT_PX } from "components/Section/SectionParts/sectionSearchLayout";
import { createGpuFlowLayoutStore } from "gpuFlow/layoutStore";
import { AGENTIC_EDGE_HANDLE_IDS } from "state/actions/agenticEdges";
import { SHARED_CHAT_EDGE_HANDLE_IDS } from "state/actions/chatSharedHandleIds";
import { STATE_MACHINE_EDGE_HANDLE_IDS } from "state/actions/stateMachineEdges";
import { createProjectSearchLookupKey } from "state/hooks/search";
import {
  addParamToProjectState,
  createDateParamImpl,
  createNestedParamImpl,
  createPasswordParamImpl,
  createRotaryParamImpl,
  createSliderParamImpl,
  createTimeParamImpl,
  projectNode,
  projectStateWithSections,
  sectionSize,
} from "testUtils/projectGpuLayoutAdapter.test.support";
import {
  CodeObjTypeEnum,
  DateControlModeEnum,
  DateSelectionModeEnum,
  TimeControlModeEnum,
  createCallableSectionImpl,
  createChatSectionImpl,
  createCodeParamCodeObjImpl,
  createDictSectionImpl,
  createDropdownParamCodeObjImpl,
  createGroupSectionImpl,
  createSettingsState,
  createShownParamIDs,
  createStateMachineGateSectionImpl,
  createSwitchParamCodeObjImpl,
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

    const paramSurface = scene.contentSurfaces.find(
      (surface) => surface.id === "dict-a:param-content:unpinned",
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
    expect(paramSurface?.retainedScene).toMatchObject({
      contentRect: { height: 48, width: 262, x: 0, y: 0 },
      ownerSectionId: "dict-a",
      rowHeight: 24,
      viewportRect: { height: 23, width: 262, x: 0, y: 0 },
      visibleRange: { endIndex: 2, rowCount: 2, startIndex: 0 },
    });
    expect(
      paramSurface?.retainedScene?.rows.map((row) => ({
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
      paramSurface?.retainedScene?.rows.find((row) => row.id === "child-param")
        ?.control,
    ).toMatchObject({
      displayValue: "",
      editorKind: "code",
      kind: "text-like",
      rendererFamily: "text-like",
      commitPolicy: "native-island",
    });
    expect(paramSurface?.retainedScene?.portAnchors).toEqual([
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
    const section = scene.sections.find(
      (candidate) => candidate.sectionId === "dict-a",
    );
    const surface = scene.contentSurfaces.find(
      (candidate) => candidate.id === "dict-a:param-content:unpinned",
    );
    const retainedScene = surface?.retainedScene;
    if (!section || !surface || !retainedScene) {
      throw new Error("Expected dict-a section and retained surface.");
    }

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
    const previewSurface = previewScene.contentSurfaces.find(
      (candidate) => candidate.id === "dict-a:param-content:unpinned",
    );

    expect(
      previewScene.sections.find(
        (candidate) => candidate.sectionId === "dict-a",
      )?.worldRect,
    ).toMatchObject({
      height: section.worldRect.height + 60,
      width: section.worldRect.width + 100,
    });
    expect(previewSurface).toMatchObject({
      rect: {
        height: surface.rect.height + 60,
        width: surface.rect.width + 100,
      },
    });
    expect(previewSurface?.retainedScene?.viewportRect).toMatchObject({
      height: retainedScene.viewportRect.height + 60,
      width: retainedScene.viewportRect.width + 100,
    });
    expect(
      previewSurface?.retainedScene?.drawCommands.find(
        (command) =>
          command.kind === "row-control" && command.rowId === "param-a",
      )?.rect.width,
    ).toBeGreaterThan(
      retainedScene.drawCommands.find(
        (command) =>
          command.kind === "row-control" && command.rowId === "param-a",
      )?.rect.width ?? 0,
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

    const pinnedSurface = scene.contentSurfaces.find(
      (surface) => surface.id === "callable-a:param-content:pinned",
    );
    const unpinnedSurface = scene.contentSurfaces.find(
      (surface) => surface.id === "callable-a:param-content:unpinned",
    );

    expect(pinnedSurface?.retainedScene?.rows.map((row) => row.id)).toEqual([
      "pinned-param",
    ]);
    expect(unpinnedSurface?.retainedScene?.rows.map((row) => row.id)).toEqual([
      "body-param",
    ]);
    expect(pinnedSurface?.rect.y).toBe(
      20 +
        PROJECT_SECTION_SCENE_HEADER_HEIGHT_PX +
        PROJECT_SECTION_SEARCH_HEIGHT_PX +
        KWARGS_CONTROLS_SCENE_HEIGHT_PX +
        5,
    );
    expect(unpinnedSurface?.rect.y).toBe(
      (pinnedSurface?.rect.y ?? 0) +
        (pinnedSurface?.retainedScene?.rowHeight ?? 0) +
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
    const section = scene.sections.find(
      (candidate) => candidate.sectionId === "dict-a",
    );
    const expectedHeight =
      PROJECT_SECTION_SCENE_HEADER_HEIGHT_PX +
      KWARGS_CONTROLS_SCENE_HEIGHT_PX +
      PROJECT_GPU_PARAM_CONTENT_BASE_VERTICAL_CHROME_PX +
      3 * 24;

    expect(section?.worldRect).toMatchObject({
      height: expectedHeight,
      width: 262,
      x: 10,
      y: 20,
    });
    expect(
      scene.contentSurfaces.find(
        (surface) => surface.id === "dict-a:param-content:unpinned",
      )?.retainedScene?.contentRect.height,
    ).toBe(72);
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
    const section = scene.sections.find(
      (candidate) => candidate.sectionId === "dict-a",
    );
    const expectedHeight =
      PROJECT_SECTION_SCENE_HEADER_HEIGHT_PX +
      KWARGS_CONTROLS_SCENE_HEIGHT_PX +
      PROJECT_GPU_PARAM_CONTENT_BASE_VERTICAL_CHROME_PX +
      4 +
      3 * 24;

    expect(section?.worldRect).toMatchObject({
      height: expectedHeight,
      width: 262,
      x: 10,
      y: 20,
    });
    expect(
      scene.contentSurfaces
        .find((surface) => surface.id === "dict-a:param-content:unpinned")
        ?.retainedScene?.rows.map((row) => [row.id, row.depth]),
    ).toEqual([
      ["parent-param", 0],
      ["child-param", 1],
      ["sibling-param", 0],
    ]);
    const retainedScene = scene.contentSurfaces.find(
      (surface) => surface.id === "dict-a:param-content:unpinned",
    )?.retainedScene;
    const childControl = retainedScene?.drawCommands.find(
      (command) =>
        command.kind === "row-control" && command.rowId === "child-param",
    );
    const siblingControl = retainedScene?.drawCommands.find(
      (command) =>
        command.kind === "row-control" && command.rowId === "sibling-param",
    );
    expect(childControl?.rect.x).toBe(
      (siblingControl?.rect.x ?? 0) +
        PROJECT_GPU_PARAM_CONTENT_NESTED_GUTTER_PX,
    );
    expect(childControl?.rect.width).toBe(
      (siblingControl?.rect.width ?? 0) -
        PROJECT_GPU_PARAM_CONTENT_NESTED_GUTTER_PX,
    );
    expect(
      retainedScene?.drawCommands.find(
        (command) =>
          command.kind === "nest-guide" && command.rowId === "child-param",
      )?.rect,
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

  it("uses the param name editor placeholder for blank retained kwarg labels", () => {
    const projectState = projectStateWithSections({
      sections: [
        {
          id: "dict-a",
          impl: createDictSectionImpl({
            codeObjVariantMap: {
              "blank-param": "blank-param-variant",
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
      createNestedParamImpl("root-param-impl", ["blank-param"]),
    );
    addParamToProjectState(
      projectState,
      "blank-param",
      "blank-param-variant",
      "blank-param-impl",
      createCodeParamCodeObjImpl({
        coreNameEditable: true,
        id: "blank-param-impl",
        name: "",
      }),
    );
    projectState.codeObjs["blank-param"]!.name = "";
    projectState.shownParamIds["dict-a-variant"] = createShownParamIDs({
      unpinned: {
        requiredParamIdsToPaths: {
          "blank-param": ["blank-param"],
        },
        topLevelParamIds: ["blank-param"],
      },
    });

    const scene = getProjectGpuFlowScene(projectState, {
      darkMode: false,
      revision: 3,
    });

    expect(
      scene.contentSurfaces
        .find((surface) => surface.id === "dict-a:param-content:unpinned")
        ?.retainedScene?.rows.map((row) => ({
          appearance: row.labelAppearance,
          label: row.label,
        })),
    ).toEqual([
      {
        appearance: {
          fontFamily: "mono",
          fontWeight: "normal",
          tone: "muted",
        },
        label: PARAM_NAME_EMPTY_DEFAULT_VALUE,
      },
    ]);
  });

  it("derives section-level data edge handles as section scene anchors", () => {
    const scene = getProjectGpuFlowScene(
      projectStateWithSections({
        sections: [
          {
            id: "dict-a",
            impl: createDictSectionImpl({
              edgeInputParams: ["input-a"],
              edgeOutputPorts: [{ accessor: "result", id: "output-a" }],
              id: "dict-a-impl",
              isMinimized: true,
              size: sectionSize({ height: 80, width: 120 }),
            }),
            parentId: null,
          },
          {
            id: "dict-b",
            impl: createDictSectionImpl({
              edgeInputParams: ["input-b"],
              edgeOutputPorts: [{ accessor: "result", id: "output-b" }],
              id: "dict-b-impl",
              isMinimized: false,
              size: sectionSize({ height: 80, width: 120 }),
            }),
            parentId: null,
          },
        ],
        topLevelSections: {
          "dict-a": { h: 80, w: 120, x: 10, y: 20, zIndex: 1 },
          "dict-b": { h: 80, w: 120, x: 180, y: 20, zIndex: 1 },
        },
      }),
      { darkMode: false },
    );

    expect(
      scene.sections.find((section) => section.sectionId === "dict-a")
        ?.portAnchors,
    ).toEqual(
      expect.arrayContaining([
        {
          id: "input-a",
          kind: "input",
          localPosition: { x: -1, y: 41 },
        },
        {
          id: "output-a",
          kind: "output",
          localPosition: { x: 123, y: 41 },
        },
        expect.objectContaining({
          id: AGENTIC_EDGE_HANDLE_IDS.reverseStart,
          isConnectableEnd: false,
          isConnectableStart: true,
          kind: "output",
          localPosition: { x: -19, y: 41 },
          side: "left",
        }),
        expect.objectContaining({
          id: AGENTIC_EDGE_HANDLE_IDS.target,
          isConnectableStart: false,
          kind: "input",
          localPosition: { x: -19, y: 41 },
          side: "left",
        }),
        expect.objectContaining({
          id: AGENTIC_EDGE_HANDLE_IDS.source,
          isConnectableStart: true,
          kind: "output",
          localPosition: { x: 141, y: 41 },
          side: "right",
        }),
      ]),
    );
    expect(
      scene.sections.find((section) => section.sectionId === "dict-b")
        ?.portAnchors,
    ).toEqual(
      expect.arrayContaining([
        {
          id: "input-b",
          kind: "input",
          localPosition: {
            x: -1,
            y:
              60 +
              PROJECT_SECTION_SCENE_HEADER_HEIGHT_PX +
              KWARGS_CONTROLS_SCENE_HEIGHT_PX,
          },
        },
        {
          id: "output-b",
          kind: "output",
          localPosition: {
            x: 123,
            y:
              60 +
              PROJECT_SECTION_SCENE_HEADER_HEIGHT_PX +
              KWARGS_CONTROLS_SCENE_HEIGHT_PX,
          },
        },
        expect.objectContaining({
          id: AGENTIC_EDGE_HANDLE_IDS.reverseStart,
          isConnectableEnd: false,
          isConnectableStart: true,
          kind: "output",
          localPosition: { x: -19, y: 41 },
          side: "left",
        }),
        expect.objectContaining({
          id: AGENTIC_EDGE_HANDLE_IDS.target,
          isConnectableStart: false,
          kind: "input",
          localPosition: { x: -19, y: 41 },
          side: "left",
        }),
        expect.objectContaining({
          id: AGENTIC_EDGE_HANDLE_IDS.source,
          isConnectableStart: true,
          kind: "output",
          localPosition: { x: 141, y: 41 },
          side: "right",
        }),
      ]),
    );
  });

  it("derives section link handles as side-aware section scene anchors", () => {
    const scene = getProjectGpuFlowScene(
      projectStateWithSections({
        sections: [
          {
            id: "dict-a",
            impl: createDictSectionImpl({
              id: "dict-a-impl",
              size: sectionSize({ height: 100, width: 200 }),
            }),
            parentId: null,
          },
          {
            id: "callable-a",
            impl: createCallableSectionImpl({
              id: "callable-a-impl",
              size: sectionSize({ height: 100, width: 200 }),
            }),
            parentId: null,
          },
          {
            id: "chat-a",
            impl: createChatSectionImpl({
              id: "chat-a-impl",
              size: sectionSize({ height: 100, width: 200 }),
            }),
            parentId: null,
          },
          {
            id: "gate-a",
            impl: createStateMachineGateSectionImpl({
              id: "gate-a-impl",
              label: "Gate",
              machineGroupId: "machine-a",
              name: "gate-a",
              size: sectionSize({ height: 100, width: 200 }),
            }),
            parentId: null,
          },
        ],
        topLevelSections: {
          "callable-a": { h: 100, w: 200, x: 240, y: 20, zIndex: 1 },
          "chat-a": { h: 100, w: 200, x: 470, y: 20, zIndex: 1 },
          "dict-a": { h: 100, w: 200, x: 10, y: 20, zIndex: 1 },
          "gate-a": { h: 100, w: 200, x: 700, y: 20, zIndex: 1 },
        },
      }),
      { darkMode: false },
    );

    expect(
      scene.sections.find((section) => section.sectionId === "dict-a")
        ?.portAnchors,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: AGENTIC_EDGE_HANDLE_IDS.reverseStart,
          isConnectableEnd: false,
          kind: "output",
          localPosition: { x: -19, y: 51 },
          side: "left",
        }),
        expect.objectContaining({
          id: AGENTIC_EDGE_HANDLE_IDS.target,
          kind: "input",
          localPosition: { x: -19, y: 51 },
          side: "left",
        }),
        expect.objectContaining({
          id: AGENTIC_EDGE_HANDLE_IDS.source,
          kind: "output",
          localPosition: { x: 221, y: 51 },
          side: "right",
        }),
      ]),
    );
    expect(
      scene.sections.find((section) => section.sectionId === "callable-a")
        ?.portAnchors,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: AGENTIC_EDGE_HANDLE_IDS.target,
          kind: "input",
          localPosition: {
            x: -19,
            y:
              PROJECT_SECTION_SCENE_HEADER_HEIGHT_PX +
              PROJECT_SECTION_SEARCH_HEIGHT_PX / 2,
          },
          side: "left",
        }),
        expect.objectContaining({
          id: AGENTIC_EDGE_HANDLE_IDS.source,
          kind: "output",
          localPosition: {
            x: 221,
            y:
              PROJECT_SECTION_SCENE_HEADER_HEIGHT_PX +
              PROJECT_SECTION_SEARCH_HEIGHT_PX / 2,
          },
          side: "right",
        }),
      ]),
    );
    expect(
      scene.sections.find((section) => section.sectionId === "chat-a")
        ?.portAnchors,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: SHARED_CHAT_EDGE_HANDLE_IDS.reverseStart,
          isConnectableEnd: false,
          kind: "output",
          localPosition: { x: -19, y: 51 },
          side: "left",
        }),
        expect.objectContaining({
          id: SHARED_CHAT_EDGE_HANDLE_IDS.target,
          kind: "input",
          localPosition: { x: -19, y: 51 },
          side: "left",
        }),
        expect.objectContaining({
          id: SHARED_CHAT_EDGE_HANDLE_IDS.source,
          kind: "output",
          localPosition: { x: 221, y: 51 },
          side: "right",
        }),
      ]),
    );
    expect(
      scene.sections.find((section) => section.sectionId === "gate-a")
        ?.portAnchors,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: STATE_MACHINE_EDGE_HANDLE_IDS.reverseStart,
          isConnectableEnd: false,
          kind: "output",
          localPosition: { x: -19, y: 51 },
          side: "left",
        }),
        expect.objectContaining({
          id: STATE_MACHINE_EDGE_HANDLE_IDS.target,
          kind: "input",
          localPosition: { x: -19, y: 51 },
          side: "left",
        }),
        expect.objectContaining({
          id: STATE_MACHINE_EDGE_HANDLE_IDS.source,
          kind: "output",
          localPosition: { x: 221, y: 51 },
          side: "right",
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
        activation: {
          clientPoint: { x: 190, y: 62 },
          kind: "pointer",
        },
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
      { focused: false, hovered: false, id: "child-param" },
    ]);
    expect(scene.domIslands).toEqual([
      {
        activation: {
          clientPoint: { x: 190, y: 62 },
          kind: "pointer",
        },
        clipOwnerId: "dict-a:param-content:unpinned",
        contentRect: { height: 24, width: 116, x: 0, y: 0 },
        id: "param-control:dict-a:child-param",
        kind: "retained-content-control",
        ownerSectionId: "dict-a",
        rect: {
          height: 24,
          width: 116,
          x: 147,
          y: 71 + KWARGS_CONTROLS_SCENE_HEIGHT_PX,
        },
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

  it("keeps canvas-owned retained controls out of row focus state", () => {
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
      createSwitchParamCodeObjImpl({
        id: "child-param-impl",
        name: "child",
        type: CodeObjTypeEnum.SwitchParam,
        value: "false",
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
      activeParamCanvasControl: {
        hitRecordId: "control:child-param",
        paramInfoId: "child-param",
        sectionId: "dict-a",
        surfaceId: "dict-a:param-content:unpinned",
      },
      darkMode: false,
      revision: 4,
    });

    const paramSurface = scene.contentSurfaces.find(
      (surface) => surface.id === "dict-a:param-content:unpinned",
    );
    expect(
      paramSurface?.retainedScene?.rows.map((row) => ({
        controlFocused: row.state.controlFocused,
        focused: row.state.focused,
        id: row.id,
      })),
    ).toEqual([
      { controlFocused: false, focused: false, id: "parent-param" },
      { controlFocused: true, focused: false, id: "child-param" },
    ]);
    expect(scene.domIslands).toEqual([]);
  });

  it("marks frozen retained param controls disabled and keeps them canvas-owned", () => {
    const projectState = projectStateWithSections({
      sections: [
        {
          id: "dict-a",
          impl: createDictSectionImpl({
            codeObjVariantMap: {
              "frozen-param": "frozen-param-variant",
              "root-param": "root-param-variant",
            },
            id: "dict-a-impl",
            isFrozen: true,
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
      createNestedParamImpl("root-param-impl", ["frozen-param"]),
    );
    addParamToProjectState(
      projectState,
      "frozen-param",
      "frozen-param-variant",
      "frozen-param-impl",
      createCodeParamCodeObjImpl({
        id: "frozen-param-impl",
        name: "frozen",
      }),
    );
    projectState.shownParamIds["dict-a-variant"] = createShownParamIDs({
      unpinned: {
        requiredParamIdsToPaths: {
          "frozen-param": ["frozen-param"],
        },
        topLevelParamIds: ["frozen-param"],
      },
    });

    const scene = getProjectGpuFlowScene(projectState, {
      activeParamDomIsland: {
        hitRecordId: "control:frozen-param",
        paramInfoId: "frozen-param",
        sectionId: "dict-a",
        surfaceId: "dict-a:param-content:unpinned",
      },
      darkMode: false,
      revision: 4,
    });

    const paramSurface = scene.contentSurfaces.find(
      (surface) => surface.id === "dict-a:param-content:unpinned",
    );
    expect(paramSurface?.retainedScene?.rows[0]).toMatchObject({
      controlKind: "text-like",
      id: "frozen-param",
      state: expect.objectContaining({
        disabled: true,
      }),
    });
    expect(scene.domIslands).toEqual([]);
  });

  it("applies retained param edit policy before mounting active islands", () => {
    const projectState = projectStateWithSections({
      sections: [
        {
          id: "dict-a",
          impl: createDictSectionImpl({
            codeObjVariantMap: {
              "code-param": "code-param-variant",
              "dropdown-param": "dropdown-param-variant",
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
      createNestedParamImpl("root-param-impl", [
        "code-param",
        "dropdown-param",
      ]),
    );
    addParamToProjectState(
      projectState,
      "code-param",
      "code-param-variant",
      "code-param-impl",
      createCodeParamCodeObjImpl({
        id: "code-param-impl",
        name: "code",
      }),
    );
    addParamToProjectState(
      projectState,
      "dropdown-param",
      "dropdown-param-variant",
      "dropdown-param-impl",
      createDropdownParamCodeObjImpl({
        choices: ["small", "large"],
        coreNameEditable: true,
        defaultVal: "small",
        id: "dropdown-param-impl",
        name: "dropdown",
        type: CodeObjTypeEnum.DropdownParam,
        value: "small",
      }),
    );
    projectState.shownParamIds["dict-a-variant"] = createShownParamIDs({
      unpinned: {
        requiredParamIdsToPaths: {
          "code-param": ["code-param"],
          "dropdown-param": ["dropdown-param"],
        },
        topLevelParamIds: ["code-param", "dropdown-param"],
      },
    });

    const deploymentEditPolicy = {
      canEditParams: true,
      canEditStructure: false,
      isDeploymentMode: true,
    };
    const codeScene = getProjectGpuFlowScene(projectState, {
      activeParamDomIsland: {
        hitRecordId: "control:code-param",
        paramInfoId: "code-param",
        sectionId: "dict-a",
        surfaceId: "dict-a:param-content:unpinned",
      },
      darkMode: false,
      paramEditPolicy: deploymentEditPolicy,
      revision: 5,
    });
    const codeSurface = codeScene.contentSurfaces.find(
      (surface) => surface.id === "dict-a:param-content:unpinned",
    );

    expect(
      codeSurface?.retainedScene?.rows.map((row) => ({
        disabled: row.state.disabled,
        id: row.id,
      })),
    ).toEqual([
      { disabled: true, id: "code-param" },
      { disabled: false, id: "dropdown-param" },
    ]);
    expect(codeScene.domIslands).toEqual([]);

    const dropdownControlScene = getProjectGpuFlowScene(projectState, {
      activeParamDomIsland: {
        hitRecordId: "control:dropdown-param",
        paramInfoId: "dropdown-param",
        sectionId: "dict-a",
        surfaceId: "dict-a:param-content:unpinned",
      },
      darkMode: false,
      paramEditPolicy: deploymentEditPolicy,
      revision: 6,
    });

    expect(dropdownControlScene.domIslands).toEqual([]);
    expect(
      dropdownControlScene.contentSurfaces
        .find((surface) => surface.id === "dict-a:param-content:unpinned")
        ?.retainedScene?.rows.find((row) => row.id === "dropdown-param")
        ?.control,
    ).toMatchObject({
      choices: [
        { label: "small", value: "small" },
        { label: "large", value: "large" },
      ],
      kind: "dropdown",
      rendererFamily: "dropdown",
      commitPolicy: "immediate",
    });

    const dropdownLabelScene = getProjectGpuFlowScene(projectState, {
      activeParamDomIsland: {
        hitRecordId: "label:dropdown-param",
        paramInfoId: "dropdown-param",
        sectionId: "dict-a",
        surfaceId: "dict-a:param-content:unpinned",
      },
      darkMode: false,
      paramEditPolicy: deploymentEditPolicy,
      revision: 7,
    });

    expect(dropdownLabelScene.domIslands).toEqual([]);
  });

  it("keeps display-only time retained controls canvas-owned", () => {
    const projectState = projectStateWithSections({
      sections: [
        {
          id: "dict-a",
          impl: createDictSectionImpl({
            codeObjVariantMap: {
              "root-param": "root-param-variant",
              "time-display-param": "time-display-param-variant",
              "time-input-param": "time-input-param-variant",
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
      createNestedParamImpl("root-param-impl", [
        "time-display-param",
        "time-input-param",
      ]),
    );
    addParamToProjectState(
      projectState,
      "time-display-param",
      "time-display-param-variant",
      "time-display-param-impl",
      createTimeParamImpl({
        id: "time-display-param-impl",
        name: "time-display",
        timeControlMode: TimeControlModeEnum.display,
      }),
    );
    addParamToProjectState(
      projectState,
      "time-input-param",
      "time-input-param-variant",
      "time-input-param-impl",
      createTimeParamImpl({
        id: "time-input-param-impl",
        name: "time-input",
        timeControlMode: TimeControlModeEnum.input,
      }),
    );
    projectState.shownParamIds["dict-a-variant"] = createShownParamIDs({
      unpinned: {
        requiredParamIdsToPaths: {
          "time-display-param": ["time-display-param"],
          "time-input-param": ["time-input-param"],
        },
        topLevelParamIds: ["time-display-param", "time-input-param"],
      },
    });

    const displayScene = getProjectGpuFlowScene(projectState, {
      activeParamDomIsland: {
        hitRecordId: "control:time-display-param",
        paramInfoId: "time-display-param",
        sectionId: "dict-a",
        surfaceId: "dict-a:param-content:unpinned",
      },
      darkMode: false,
      revision: 8,
    });
    const displaySurface = displayScene.contentSurfaces.find(
      (surface) => surface.id === "dict-a:param-content:unpinned",
    );

    expect(
      displaySurface?.retainedScene?.rows.map((row) => ({
        controlKind: row.controlKind,
        id: row.id,
      })),
    ).toEqual([
      { controlKind: "date-time", id: "time-display-param" },
      { controlKind: "date-time", id: "time-input-param" },
    ]);
    expect(
      displaySurface?.retainedScene?.rows.map((row) => row.control),
    ).toEqual([
      expect.objectContaining({
        displayValue: "12:30",
        kind: "date-time",
        label: "Display time",
        mode: "time-display",
        rendererFamily: "date-time",
        summaryText: null,
        commitPolicy: "native-island",
      }),
      expect.objectContaining({
        displayValue: "12:30",
        kind: "date-time",
        label: "Time input",
        mode: "time-input",
        rendererFamily: "date-time",
        summaryText: null,
        commitPolicy: "native-island",
      }),
    ]);
    expect(displayScene.domIslands).toEqual([]);

    const inputScene = getProjectGpuFlowScene(projectState, {
      activeParamDomIsland: {
        hitRecordId: "control:time-input-param",
        paramInfoId: "time-input-param",
        sectionId: "dict-a",
        surfaceId: "dict-a:param-content:unpinned",
      },
      darkMode: false,
      revision: 9,
    });

    expect(inputScene.domIslands).toEqual([
      expect.objectContaining({
        kind: "retained-content-control",
        source: expect.objectContaining({
          ownerRowId: "time-input-param",
        }),
      }),
    ]);
  });

  it("renders retained date calendar closed state with concrete descriptors", () => {
    const projectState = projectStateWithSections({
      sections: [
        {
          id: "dict-a",
          impl: createDictSectionImpl({
            codeObjVariantMap: {
              "date-param": "date-param-variant",
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
      createNestedParamImpl("root-param-impl", ["date-param"]),
    );
    addParamToProjectState(
      projectState,
      "date-param",
      "date-param-variant",
      "date-param-impl",
      createDateParamImpl({
        dateControlMode: DateControlModeEnum.calendar,
        dateSelectionMode: DateSelectionModeEnum.multiple,
        id: "date-param-impl",
        name: "date",
        value: '["2026-05-04","2026-05-05"]',
      }),
    );
    projectState.shownParamIds["dict-a-variant"] = createShownParamIDs({
      unpinned: {
        requiredParamIdsToPaths: {
          "date-param": ["date-param"],
        },
        topLevelParamIds: ["date-param"],
      },
    });

    const scene = getProjectGpuFlowScene(projectState, {
      activeParamCanvasPopup: {
        hitRecordId: "control:date-param",
        kind: "date-calendar",
        paramInfoId: "date-param",
        sectionId: "dict-a",
        surfaceId: "dict-a:param-content:unpinned",
        visibleMonth: { monthIndex: 4, year: 2026 },
      },
      darkMode: false,
      revision: 10,
    });
    const dateSurface = scene.contentSurfaces.find(
      (surface) => surface.id === "dict-a:param-content:unpinned",
    );

    expect(dateSurface?.retainedScene?.rows[0]).toMatchObject({
      control: {
        displayValue: '["2026-05-04","2026-05-05"]',
        kind: "date-time",
        label: "Calendar",
        mode: "date-calendar",
        rendererFamily: "date-time",
        summaryText: "2 selected",
        commitPolicy: "immediate",
        calendar: expect.objectContaining({
          month: { monthIndex: 4, year: 2026 },
          monthTitle: "May 2026",
          selectedDates: ["2026-05-04", "2026-05-05"],
          selectionMode: DateSelectionModeEnum.multiple,
          summaryText: "2 selected",
          weekdayLabels: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        }),
      },
      controlKind: "date-time",
      id: "date-param",
    });
    expect(scene.domIslands).toEqual([]);
    expect(dateSurface?.retainedScene?.hitRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cellIsoDate: "2026-05-04",
          kind: "popup-date-cell",
          ownerRowId: "date-param",
        }),
        expect.objectContaining({
          kind: "popup-date-navigation",
          navigationDirection: -1,
          ownerRowId: "date-param",
        }),
      ]),
    );

    const previousMonthScene = getProjectGpuFlowScene(projectState, {
      activeParamCanvasPopup: {
        hitRecordId: "popup-date-navigation:date-param:-1",
        kind: "date-calendar",
        paramInfoId: "date-param",
        sectionId: "dict-a",
        surfaceId: "dict-a:param-content:unpinned",
        visibleMonth: { monthIndex: 3, year: 2026 },
      },
      darkMode: false,
      revision: 11,
    });
    expect(
      previousMonthScene.contentSurfaces.find(
        (surface) => surface.id === "dict-a:param-content:unpinned",
      )?.retainedScene?.rows[0]?.control,
    ).toMatchObject({
      calendar: expect.objectContaining({
        month: { monthIndex: 3, year: 2026 },
        monthTitle: "April 2026",
      }),
    });
  });

  it("keeps retained slider controls canvas-owned with concrete descriptors", () => {
    const projectState = projectStateWithSections({
      sections: [
        {
          id: "dict-a",
          impl: createDictSectionImpl({
            codeObjVariantMap: {
              "root-param": "root-param-variant",
              "slider-param": "slider-param-variant",
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
      createNestedParamImpl("root-param-impl", ["slider-param"]),
    );
    addParamToProjectState(
      projectState,
      "slider-param",
      "slider-param-variant",
      "slider-param-impl",
      createSliderParamImpl({
        id: "slider-param-impl",
        name: "slider",
        value: "6",
      }),
    );
    projectState.shownParamIds["dict-a-variant"] = createShownParamIDs({
      unpinned: {
        requiredParamIdsToPaths: {
          "slider-param": ["slider-param"],
        },
        topLevelParamIds: ["slider-param"],
      },
    });

    const scene = getProjectGpuFlowScene(projectState, {
      activeParamDomIsland: {
        hitRecordId: "control:slider-param",
        paramInfoId: "slider-param",
        sectionId: "dict-a",
        surfaceId: "dict-a:param-content:unpinned",
      },
      darkMode: false,
      revision: 10,
    });
    const sliderSurface = scene.contentSurfaces.find(
      (surface) => surface.id === "dict-a:param-content:unpinned",
    );

    expect(sliderSurface?.retainedScene?.rows[0]).toMatchObject({
      control: {
        defaultDisplayValue: "0",
        displayValue: "6",
        kind: "slider",
        rendererFamily: "slider",
        commitPolicy: "preview-commit",
        max: 10,
        min: 0,
        step: 1,
        value: 6,
      },
      controlKind: "slider",
      id: "slider-param",
    });
    expect(scene.domIslands).toEqual([]);
  });

  it("keeps retained rotary controls canvas-owned with concrete descriptors", () => {
    const projectState = projectStateWithSections({
      sections: [
        {
          id: "dict-a",
          impl: createDictSectionImpl({
            codeObjVariantMap: {
              "root-param": "root-param-variant",
              "rotary-param": "rotary-param-variant",
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
      createNestedParamImpl("root-param-impl", ["rotary-param"]),
    );
    addParamToProjectState(
      projectState,
      "rotary-param",
      "rotary-param-variant",
      "rotary-param-impl",
      createRotaryParamImpl({
        id: "rotary-param-impl",
        name: "rotary",
        value: "6",
      }),
    );
    projectState.shownParamIds["dict-a-variant"] = createShownParamIDs({
      unpinned: {
        requiredParamIdsToPaths: {
          "rotary-param": ["rotary-param"],
        },
        topLevelParamIds: ["rotary-param"],
      },
    });

    const scene = getProjectGpuFlowScene(projectState, {
      activeParamDomIsland: {
        hitRecordId: "control:rotary-param",
        paramInfoId: "rotary-param",
        sectionId: "dict-a",
        surfaceId: "dict-a:param-content:unpinned",
      },
      darkMode: false,
      revision: 11,
    });
    const rotarySurface = scene.contentSurfaces.find(
      (surface) => surface.id === "dict-a:param-content:unpinned",
    );

    expect(rotarySurface?.retainedScene?.rows[0]).toMatchObject({
      control: {
        defaultDisplayValue: "0",
        displayValue: "6",
        kind: "rotary",
        rendererFamily: "rotary",
        commitPolicy: "preview-commit",
        max: 10,
        min: 0,
        step: 1,
        value: 6,
      },
      controlKind: "rotary",
      id: "rotary-param",
    });
    expect(scene.domIslands).toEqual([]);
  });

  it("renders retained password controls with concrete closed-state descriptors", () => {
    const projectState = projectStateWithSections({
      sections: [
        {
          id: "dict-a",
          impl: createDictSectionImpl({
            codeObjVariantMap: {
              "password-param": "password-param-variant",
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
      createNestedParamImpl("root-param-impl", ["password-param"]),
    );
    addParamToProjectState(
      projectState,
      "password-param",
      "password-param-variant",
      "password-param-impl",
      createPasswordParamImpl({
        hasSecret: true,
        id: "password-param-impl",
        name: "password",
        value: "",
      }),
    );
    projectState.shownParamIds["dict-a-variant"] = createShownParamIDs({
      unpinned: {
        requiredParamIdsToPaths: {
          "password-param": ["password-param"],
        },
        topLevelParamIds: ["password-param"],
      },
    });

    const scene = getProjectGpuFlowScene(projectState, {
      activeParamDomIsland: {
        hitRecordId: "control:password-param",
        paramInfoId: "password-param",
        sectionId: "dict-a",
        surfaceId: "dict-a:param-content:unpinned",
      },
      darkMode: false,
      revision: 12,
    });
    const passwordSurface = scene.contentSurfaces.find(
      (surface) => surface.id === "dict-a:param-content:unpinned",
    );

    expect(passwordSurface?.retainedScene?.rows[0]).toMatchObject({
      control: {
        defaultDisplayValue: "",
        displayValue: "",
        hasSecret: true,
        kind: "password",
        placeholder: "Saved",
        rendererFamily: "password",
        revealAvailable: true,
        commitPolicy: "native-island",
      },
      controlKind: "password",
      id: "password-param",
    });
    expect(scene.domIslands).toEqual([
      expect.objectContaining({
        kind: "retained-content-control",
        source: expect.objectContaining({
          ownerRowId: "password-param",
        }),
      }),
    ]);

    const deploymentScene = getProjectGpuFlowScene(projectState, {
      darkMode: false,
      paramEditPolicy: {
        canEditParams: true,
        canEditStructure: false,
        isDeploymentMode: true,
      },
      revision: 13,
    });
    const deploymentSurface = deploymentScene.contentSurfaces.find(
      (surface) => surface.id === "dict-a:param-content:unpinned",
    );

    expect(deploymentSurface?.retainedScene?.rows[0]?.control).toMatchObject({
      kind: "password",
      revealAvailable: false,
    });

    const revealedScene = getProjectGpuFlowScene(projectState, {
      darkMode: false,
      passwordRevealStates: new Map([
        [
          "dict-a:password-param",
          {
            pending: false,
            value: "revealed-secret",
          },
        ],
      ]),
      revision: 14,
    });
    const revealedSurface = revealedScene.contentSurfaces.find(
      (surface) => surface.id === "dict-a:param-content:unpinned",
    );

    expect(revealedSurface?.retainedScene?.rows[0]?.control).toMatchObject({
      kind: "password",
      revealPending: false,
      revealedValue: "revealed-secret",
    });
    expect(revealedScene.domIslands).toEqual([]);
  });
});
