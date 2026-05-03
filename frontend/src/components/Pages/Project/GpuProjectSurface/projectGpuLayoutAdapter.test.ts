import { KWARGS_CONTROLS_SCENE_HEIGHT_PX } from "components/Section/SectionParts/kwargsControlsLayout";
import { PROJECT_SECTION_SEARCH_HEIGHT_PX } from "components/Section/SectionParts/sectionSearchLayout";
import type { Node } from "gpuFlow/flowTypes";
import { createGpuFlowLayoutStore } from "gpuFlow/layoutStore";
import { getGpuFlowSceneDomSectionNodes } from "gpuFlow/scene";
import { AGENTIC_EDGE_HANDLE_IDS } from "state/actions/agenticEdges";
import { SHARED_CHAT_EDGE_HANDLE_IDS } from "state/actions/chatSharedHandleIds";
import { STATE_MACHINE_EDGE_HANDLE_IDS } from "state/actions/stateMachineEdges";
import type { ZustandProjectState } from "state/definitions";
import { createProjectSearchLookupKey } from "state/hooks/search";
import {
  ButtonActionModeEnum,
  CodeObjTypeEnum,
  DateCalendarWeekStartEnum,
  DateControlModeEnum,
  DateDisplayFormatEnum,
  DateSelectionModeEnum,
  DropzoneModeEnum,
  HTTPRequestMethodEnum,
  ParamNameTypeEnum,
  ParameterPassingStyleEnum,
  TimeControlModeEnum,
  TimeDisplayFontEnum,
  TimeDisplayFormatEnum,
  createButtonParamCodeObjImpl,
  createCallableSectionImpl,
  createChatSectionImpl,
  createCodeParamCodeObjImpl,
  createCore,
  createDateParamCodeObjImpl,
  createDictSectionImpl,
  createDropdownParamCodeObjImpl,
  createDropzoneParamCodeObjImpl,
  createGroupSectionImpl,
  createPasswordParamCodeObjImpl,
  createProjectConfig,
  createShownParamIDs,
  createSingleConfig,
  createStateMachineGateSectionImpl,
  createVariant,
  type BaseCodeObjImplUnion,
  type BaseSectionImplUnion,
  type ColorPickerParamCodeObjImpl,
  type DateParamCodeObjImpl,
  type PasswordParamCodeObjImpl,
  type RotaryParamCodeObjImpl,
  type SingleConfig,
  type SliderParamCodeObjImpl,
  type TimeParamCodeObjImpl,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import {
  getProjectGpuFlowScene,
  syncProjectGpuLayoutStoreFromScene,
} from "./projectGpuLayoutAdapter";
import {
  getProjectGpuLayoutNode,
  getProjectGpuLayoutNodesFromNodeInternals,
} from "./projectGpuLayoutNodeAdapter";
import { getProjectGpuRetainedParamNavigationTarget } from "./projectGpuRetainedParamNavigationTarget";
import { resolveProjectGpuSceneSectionReveal } from "./projectGpuSceneReveal";
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
        height: 23,
        width: 262,
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
        (pinnedSurface?.retainedScene?.rowHeight ?? 0),
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
      8 +
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
      { focused: true, hovered: false, id: "child-param" },
    ]);
    expect(scene.domIslands).toEqual([
      {
        activation: {
          clientPoint: { x: 190, y: 62 },
          kind: "pointer",
        },
        clipOwnerId: "dict-a:param-content:unpinned",
        contentRect: { height: 24, width: 176, x: 0, y: 0 },
        id: "param-control:dict-a:child-param",
        kind: "retained-content-control",
        ownerSectionId: "dict-a",
        rect: {
          height: 24,
          width: 176,
          x: 87,
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

  it("derives button params as canvas-owned retained controls", () => {
    const projectState = projectStateWithSections({
      sections: [
        {
          id: "dict-a",
          impl: createDictSectionImpl({
            codeObjVariantMap: {
              "button-param": "button-param-variant",
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
      createNestedParamImpl("root-param-impl", ["button-param"]),
    );
    addParamToProjectState(
      projectState,
      "button-param",
      "button-param-variant",
      "button-param-impl",
      createButtonParamCodeObjImpl({
        actionMode: ButtonActionModeEnum.WEBSOCKET_LISTENER,
        coreNameEditable: true,
        coreNameType: ParamNameTypeEnum.TEXT,
        defaultVal: "",
        description: "",
        id: "button-param-impl",
        isPreset: false,
        label: "Run",
        name: "button",
        passingStyle: ParameterPassingStyleEnum.DEFAULT,
        requestBody: "",
        requestHeaderKey: "",
        requestHeaderValue: "",
        requestMethod: HTTPRequestMethodEnum.POST,
        requestUrl: "",
        type: CodeObjTypeEnum.ButtonParam,
        typeAnnotation: "",
      }),
    );
    projectState.shownParamIds["dict-a-variant"] = createShownParamIDs({
      unpinned: {
        requiredParamIdsToPaths: {
          "button-param": ["button-param"],
        },
        topLevelParamIds: ["button-param"],
      },
    });

    const scene = getProjectGpuFlowScene(projectState, {
      activeParamDomIsland: {
        hitRecordId: "control:button-param",
        paramInfoId: "button-param",
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
      control: {
        defaultDisplayValue: "Run",
        displayValue: "Run",
        kind: "button",
        label: "Run",
        rendererFamily: "button",
        commitPolicy: "immediate",
      },
      controlKind: "button",
      id: "button-param",
    });
    expect(paramSurface?.retainedScene?.hitRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "control:button-param",
          kind: "control",
        }),
      ]),
    );
    expect(paramSurface?.retainedScene?.drawCommands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          control: expect.objectContaining({
            kind: "button",
            label: "Run",
          }),
          controlKind: "button",
          kind: "row-control",
          rowId: "button-param",
        }),
      ]),
    );
    expect(scene.domIslands).toEqual([]);
  });

  it("keeps nested retained row affordances out of active DOM islands", () => {
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
        hitRecordId: "control:parent-param",
        paramInfoId: "parent-param",
        sectionId: "dict-a",
        surfaceId: "dict-a:param-content:unpinned",
      },
      darkMode: false,
      revision: 4,
    });

    const paramSurface = scene.contentSurfaces.find(
      (surface) => surface.id === "dict-a:param-content:unpinned",
    );
    expect(paramSurface?.retainedScene?.rows[0]).toEqual(
      expect.objectContaining({
        controlKind: "nested",
        id: "parent-param",
      }),
    );
    expect(
      paramSurface?.retainedScene?.hitRecords.some(
        (record) => record.id === "control:parent-param",
      ),
    ).toBe(false);
    expect(scene.domIslands).toEqual([]);
  });

  it("derives editable retained param labels as explicit DOM islands", () => {
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
        coreNameEditable: true,
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
        hitRecordId: "label:child-param",
        paramInfoId: "child-param",
        sectionId: "dict-a",
        surfaceId: "dict-a:param-content:unpinned",
      },
      darkMode: false,
      revision: 5,
    });

    const paramSurface = scene.contentSurfaces.find(
      (surface) => surface.id === "dict-a:param-content:unpinned",
    );
    expect(
      paramSurface?.retainedScene?.rows.map((row) => ({
        focused: row.state.focused,
        id: row.id,
      })),
    ).toEqual([
      { focused: false, id: "parent-param" },
      { focused: true, id: "child-param" },
    ]);
    expect(scene.domIslands).toEqual([
      {
        clipOwnerId: "dict-a:param-content:unpinned",
        contentRect: { height: 24, width: 51, x: 0, y: 0 },
        id: "param-label:dict-a:child-param",
        kind: "retained-content-label",
        ownerSectionId: "dict-a",
        rect: {
          height: 24,
          width: 51,
          x: 24,
          y: 71 + KWARGS_CONTROLS_SCENE_HEIGHT_PX,
        },
        source: {
          hitRecordId: "label:child-param",
          kind: "retained-content",
          ownerRowId: "child-param",
          surfaceId: "dict-a:param-content:unpinned",
        },
        zIndex: 4,
      },
    ]);
  });

  it("keeps canvas-owned retained popups out of native retained param islands", () => {
    const projectState = projectStateWithSections({
      sections: [
        {
          id: "dict-a",
          impl: createDictSectionImpl({
            codeObjVariantMap: {
              "date-calendar-param": "date-calendar-param-variant",
              "dropdown-param": "dropdown-param-variant",
              "dropzone-param": "dropzone-param-variant",
              "root-param": "root-param-variant",
            },
            id: "dict-a-impl",
            size: sectionSize({ height: 420, width: 360 }),
            topLevelParamId: "root-param",
          }),
          parentId: null,
        },
      ],
      topLevelSections: {
        "dict-a": { h: 420, w: 360, x: 10, y: 20, zIndex: 2 },
      },
    });
    addParamToProjectState(
      projectState,
      "root-param",
      "root-param-variant",
      "root-param-impl",
      createNestedParamImpl("root-param-impl", [
        "date-calendar-param",
        "dropdown-param",
        "dropzone-param",
      ]),
    );
    addParamToProjectState(
      projectState,
      "date-calendar-param",
      "date-calendar-param-variant",
      "date-calendar-param-impl",
      createDateParamCodeObjImpl({
        dateCalendarWeekStart: DateCalendarWeekStartEnum.sunday,
        dateControlMode: DateControlModeEnum.calendar,
        dateDisplayFormat: DateDisplayFormatEnum.iso,
        dateIncludesTime: true,
        dateSelectionMode: DateSelectionModeEnum.single,
        id: "date-calendar-param-impl",
        name: "date-calendar",
        type: CodeObjTypeEnum.DateParam,
      }),
    );
    addParamToProjectState(
      projectState,
      "dropdown-param",
      "dropdown-param-variant",
      "dropdown-param-impl",
      createDropdownParamCodeObjImpl({
        choices: ["small", "large"],
        defaultVal: "small",
        id: "dropdown-param-impl",
        name: "dropdown",
        type: CodeObjTypeEnum.DropdownParam,
        value: "small",
      }),
    );
    addParamToProjectState(
      projectState,
      "dropzone-param",
      "dropzone-param-variant",
      "dropzone-param-impl",
      createDropzoneParamCodeObjImpl({
        defaultVal: "",
        id: "dropzone-param-impl",
        maxAttachments: 1,
        mode: DropzoneModeEnum.STATEFUL,
        name: "dropzone",
        placeholder: "Drop an input",
        type: CodeObjTypeEnum.DropzoneParam,
        value: JSON.stringify({
          attachments: [
            {
              kind: "file",
              id: "artifact-a",
              name: "input.csv",
              size: 2048,
            },
          ],
        }),
      }),
    );
    projectState.shownParamIds["dict-a-variant"] = createShownParamIDs({
      unpinned: {
        requiredParamIdsToPaths: {
          "date-calendar-param": ["date-calendar-param"],
          "dropdown-param": ["dropdown-param"],
          "dropzone-param": ["dropzone-param"],
        },
        topLevelParamIds: [
          "date-calendar-param",
          "dropdown-param",
          "dropzone-param",
        ],
      },
    });

    const dateCalendarScene = getProjectGpuFlowScene(projectState, {
      activeParamCanvasPopup: {
        hitRecordId: "control:date-calendar-param",
        kind: "date-calendar",
        paramInfoId: "date-calendar-param",
        sectionId: "dict-a",
        surfaceId: "dict-a:param-content:unpinned",
        visibleMonth: { monthIndex: 4, year: 2026 },
      },
      darkMode: false,
      revision: 4,
    });
    const dateCalendarSurface = dateCalendarScene.contentSurfaces.find(
      (surface) => surface.id === "dict-a:param-content:unpinned",
    );

    expect(dateCalendarScene.domIslands).toEqual([]);
    expect(dateCalendarSurface?.retainedScene?.hitRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "popup-date-cell",
          ownerRowId: "date-calendar-param",
        }),
      ]),
    );

    const staleDateCalendarDomIslandScene = getProjectGpuFlowScene(
      projectState,
      {
        activeParamDomIsland: {
          hitRecordId: "control:date-calendar-param",
          paramInfoId: "date-calendar-param",
          sectionId: "dict-a",
          surfaceId: "dict-a:param-content:unpinned",
        },
        darkMode: false,
        revision: 4,
      },
    );

    expect(staleDateCalendarDomIslandScene.domIslands).toEqual([]);

    const dropdownScene = getProjectGpuFlowScene(projectState, {
      activeParamCanvasPopup: {
        hitRecordId: "control:dropdown-param",
        kind: "dropdown",
        paramInfoId: "dropdown-param",
        sectionId: "dict-a",
        surfaceId: "dict-a:param-content:unpinned",
      },
      darkMode: false,
      revision: 4,
    });
    const dropdownSurface = dropdownScene.contentSurfaces.find(
      (surface) => surface.id === "dict-a:param-content:unpinned",
    );

    expect(dropdownScene.domIslands).toEqual([]);
    expect(dropdownSurface?.retainedScene?.hitRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "popup-option",
          optionValue: "large",
          ownerRowId: "dropdown-param",
        }),
      ]),
    );

    const staleDropdownDomIslandScene = getProjectGpuFlowScene(projectState, {
      activeParamDomIsland: {
        hitRecordId: "control:dropdown-param",
        paramInfoId: "dropdown-param",
        sectionId: "dict-a",
        surfaceId: "dict-a:param-content:unpinned",
      },
      darkMode: false,
      revision: 4,
    });

    expect(staleDropdownDomIslandScene.domIslands).toEqual([]);

    const dropzoneScene = getProjectGpuFlowScene(projectState, {
      activeParamDomIsland: {
        hitRecordId: "control:dropzone-param",
        paramInfoId: "dropzone-param",
        sectionId: "dict-a",
        surfaceId: "dict-a:param-content:unpinned",
      },
      darkMode: false,
      revision: 5,
    });
    const dropzoneIsland = dropzoneScene.domIslands[0];
    const dropzoneSurface = dropzoneScene.contentSurfaces.find(
      (surface) => surface.id === "dict-a:param-content:unpinned",
    );

    expect(dropzoneIsland).toMatchObject({
      contentRect: { height: 132, width: 276, x: 0, y: 0 },
      kind: "retained-content-control",
      ownerSectionId: "dict-a",
      rect: { height: 132, width: 276 },
    });
    expect(
      dropzoneSurface?.retainedScene?.rows.find(
        (row) => row.id === "dropzone-param",
      )?.control,
    ).toEqual({
      attachments: [
        {
          id: "artifact-a",
          kind: "file",
          name: "input.csv",
          sizeLabel: "2 KB",
        },
      ],
      canAttachMore: false,
      defaultDisplayValue: "",
      displayValue: JSON.stringify({
        attachments: [
          {
            kind: "file",
            id: "artifact-a",
            name: "input.csv",
            size: 2048,
          },
        ],
      }),
      kind: "dropzone",
      label: "1 attachment",
      maxAttachments: 1,
      mode: DropzoneModeEnum.STATEFUL,
      placeholder: "Drop an input",
      remainingSlots: 0,
      rendererFamily: "dropzone",
      commitPolicy: "native-island",
    });
  });

  it("keeps native color picker islands while configured choices stay canvas-owned", () => {
    const projectState = projectStateWithSections({
      sections: [
        {
          id: "dict-a",
          impl: createDictSectionImpl({
            codeObjVariantMap: {
              "native-color-param": "native-color-param-variant",
              "palette-color-param": "palette-color-param-variant",
              "root-param": "root-param-variant",
            },
            id: "dict-a-impl",
            size: sectionSize({ height: 420, width: 260 }),
            topLevelParamId: "root-param",
          }),
          parentId: null,
        },
      ],
      topLevelSections: {
        "dict-a": { h: 420, w: 260, x: 10, y: 20, zIndex: 2 },
      },
    });
    addParamToProjectState(
      projectState,
      "root-param",
      "root-param-variant",
      "root-param-impl",
      createNestedParamImpl("root-param-impl", [
        "native-color-param",
        "palette-color-param",
      ]),
    );
    addParamToProjectState(
      projectState,
      "native-color-param",
      "native-color-param-variant",
      "native-color-param-impl",
      createColorPickerParamImpl({
        colorChoices: [],
        id: "native-color-param-impl",
        name: "native-color",
      }),
    );
    addParamToProjectState(
      projectState,
      "palette-color-param",
      "palette-color-param-variant",
      "palette-color-param-impl",
      createColorPickerParamImpl({
        colorChoices: [{ color: "#ef4444", description: "Red" }],
        id: "palette-color-param-impl",
        name: "palette-color",
      }),
    );
    projectState.shownParamIds["dict-a-variant"] = createShownParamIDs({
      unpinned: {
        requiredParamIdsToPaths: {
          "native-color-param": ["native-color-param"],
          "palette-color-param": ["palette-color-param"],
        },
        topLevelParamIds: ["native-color-param", "palette-color-param"],
      },
    });

    const nativeScene = getProjectGpuFlowScene(projectState, {
      activeParamDomIsland: {
        hitRecordId: "control:native-color-param",
        paramInfoId: "native-color-param",
        sectionId: "dict-a",
        surfaceId: "dict-a:param-content:unpinned",
      },
      darkMode: false,
      revision: 6,
    });

    expect(nativeScene.domIslands[0]).toMatchObject({
      contentRect: { height: 24, width: 176, x: 0, y: 0 },
      kind: "retained-content-control",
      ownerSectionId: "dict-a",
      rect: { height: 24, width: 176 },
    });
    expect(
      nativeScene.contentSurfaces
        .find((surface) => surface.id === "dict-a:param-content:unpinned")
        ?.retainedScene?.rows.find((row) => row.id === "native-color-param")
        ?.control,
    ).toMatchObject({
      choices: [],
      kind: "color-picker",
      rendererFamily: "color-picker",
      commitPolicy: "native-island",
    });

    const paletteScene = getProjectGpuFlowScene(projectState, {
      activeParamCanvasPopup: {
        hitRecordId: "control:palette-color-param",
        kind: "color-picker",
        paramInfoId: "palette-color-param",
        sectionId: "dict-a",
        surfaceId: "dict-a:param-content:unpinned",
      },
      darkMode: false,
      revision: 7,
    });
    const paletteSurface = paletteScene.contentSurfaces.find(
      (surface) => surface.id === "dict-a:param-content:unpinned",
    );

    expect(paletteScene.domIslands).toEqual([]);
    expect(
      paletteSurface?.retainedScene?.rows.find(
        (row) => row.id === "palette-color-param",
      )?.control,
    ).toMatchObject({
      choices: [{ color: "#ef4444", description: "Red" }],
      kind: "color-picker",
      rendererFamily: "color-picker",
      commitPolicy: "immediate",
    });
    expect(paletteSurface?.retainedScene?.hitRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "popup-option",
          optionValue: "#ef4444",
          ownerRowId: "palette-color-param",
        }),
      ]),
    );

    const stalePaletteDomIslandScene = getProjectGpuFlowScene(projectState, {
      activeParamDomIsland: {
        hitRecordId: "control:palette-color-param",
        paramInfoId: "palette-color-param",
        sectionId: "dict-a",
        surfaceId: "dict-a:param-content:unpinned",
      },
      darkMode: false,
      revision: 8,
    });

    expect(stalePaletteDomIslandScene.domIslands).toEqual([]);
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
      visibleRange: { endIndex: 5, rowCount: 8, startIndex: 0 },
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
        height: 60,
        nodeId: "current-section",
        tempZIndex: 2,
        width: 180,
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

function createTimeParamImpl({
  id,
  name,
  timeControlMode,
}: {
  readonly id: string;
  readonly name: string;
  readonly timeControlMode: TimeParamCodeObjImpl["timeControlMode"];
}): BaseCodeObjImplUnion {
  const impl = {
    coreNameEditable: true,
    coreNameType: ParamNameTypeEnum.TEXT,
    defaultVal: "",
    description: "",
    id,
    isPreset: false,
    name,
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    timeControlMode,
    timeDisplayFont: TimeDisplayFontEnum.monospace,
    timeDisplayFormat: TimeDisplayFormatEnum.twenty_four_hour,
    timeDisplayScale: 1,
    timeDisplayTransparent: false,
    type: CodeObjTypeEnum.TimeParam,
    typeAnnotation: "",
    value: "12:30",
  } satisfies TimeParamCodeObjImpl;
  return impl as BaseCodeObjImplUnion;
}

function createDateParamImpl({
  dateControlMode,
  dateSelectionMode = DateSelectionModeEnum.single,
  id,
  name,
  value,
}: {
  readonly dateControlMode: DateParamCodeObjImpl["dateControlMode"];
  readonly dateSelectionMode?: DateParamCodeObjImpl["dateSelectionMode"];
  readonly id: string;
  readonly name: string;
  readonly value: string;
}): BaseCodeObjImplUnion {
  const impl = {
    coreNameEditable: true,
    coreNameType: ParamNameTypeEnum.TEXT,
    dateCalendarWeekStart: DateCalendarWeekStartEnum.sunday,
    dateControlMode,
    dateDisplayFormat: DateDisplayFormatEnum.iso,
    dateIncludesTime: false,
    dateSelectionMode,
    defaultVal: "",
    description: "",
    id,
    isPreset: false,
    name,
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    type: CodeObjTypeEnum.DateParam,
    typeAnnotation: "",
    value,
  } satisfies DateParamCodeObjImpl;
  return impl as BaseCodeObjImplUnion;
}

function createSliderParamImpl({
  id,
  name,
  value,
}: {
  readonly id: string;
  readonly name: string;
  readonly value: string;
}): BaseCodeObjImplUnion {
  const impl = {
    coreNameEditable: true,
    coreNameType: ParamNameTypeEnum.TEXT,
    defaultVal: "0",
    description: "",
    id,
    isPreset: false,
    max: 10,
    min: 0,
    name,
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    step: 1,
    type: CodeObjTypeEnum.SliderParam,
    typeAnnotation: "",
    value,
  } satisfies SliderParamCodeObjImpl;
  return impl as BaseCodeObjImplUnion;
}

function createRotaryParamImpl({
  id,
  name,
  value,
}: {
  readonly id: string;
  readonly name: string;
  readonly value: string;
}): BaseCodeObjImplUnion {
  const impl = {
    coreNameEditable: true,
    coreNameType: ParamNameTypeEnum.TEXT,
    defaultVal: "0",
    description: "",
    id,
    isPreset: false,
    max: 10,
    min: 0,
    name,
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    step: 1,
    type: CodeObjTypeEnum.RotaryParam,
    typeAnnotation: "",
    value,
  } satisfies RotaryParamCodeObjImpl;
  return impl as BaseCodeObjImplUnion;
}

function createColorPickerParamImpl({
  colorChoices,
  id,
  name,
}: {
  readonly colorChoices: ColorPickerParamCodeObjImpl["colorChoices"];
  readonly id: string;
  readonly name: string;
}): BaseCodeObjImplUnion {
  const impl = {
    colorChoices: colorChoices ? [...colorChoices] : colorChoices,
    coreNameEditable: true,
    coreNameType: ParamNameTypeEnum.TEXT,
    defaultVal: "#000000",
    description: "",
    id,
    isPreset: false,
    name,
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    type: CodeObjTypeEnum.ColorPickerParam,
    typeAnnotation: "",
    value: "#000000",
  } satisfies ColorPickerParamCodeObjImpl;
  return impl as BaseCodeObjImplUnion;
}

function createPasswordParamImpl({
  hasSecret,
  id,
  name,
  value,
}: {
  readonly hasSecret: boolean;
  readonly id: string;
  readonly name: string;
  readonly value: string;
}): BaseCodeObjImplUnion {
  const impl = createPasswordParamCodeObjImpl({
    coreNameEditable: true,
    coreNameType: ParamNameTypeEnum.TEXT,
    defaultVal: "",
    description: "",
    hasSecret,
    id,
    isPreset: false,
    name,
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    type: CodeObjTypeEnum.PasswordParam,
    typeAnnotation: "",
    value,
  }) satisfies PasswordParamCodeObjImpl;
  return impl as BaseCodeObjImplUnion;
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
