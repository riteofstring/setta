import { PARAM_NAME_EMPTY_DEFAULT_VALUE } from "components/Params/ParamItems/paramNameDefaults";
import { KWARGS_CONTROLS_SCENE_HEIGHT_PX } from "components/Section/SectionParts/kwargsControlsLayout";
import { PROJECT_SECTION_SEARCH_HEIGHT_PX } from "components/Section/SectionParts/sectionSearchLayout";
import { AGENTIC_EDGE_HANDLE_IDS } from "state/actions/agenticEdges";
import { SHARED_CHAT_EDGE_HANDLE_IDS } from "state/actions/chatSharedHandleIds";
import { STATE_MACHINE_EDGE_HANDLE_IDS } from "state/actions/stateMachineEdges";
import {
  addParamToProjectState,
  createNestedParamImpl,
  projectStateWithSections,
  sectionSize,
} from "testUtils/projectGpuLayoutAdapter.test.support";
import {
  CodeObjTypeEnum,
  createCallableSectionImpl,
  createChatSectionImpl,
  createCodeParamCodeObjImpl,
  createDictSectionImpl,
  createShownParamIDs,
  createStateMachineGateSectionImpl,
  createSwitchParamCodeObjImpl,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { getProjectGpuFlowScene } from "./projectGpuLayoutAdapter";
import { PROJECT_SECTION_SCENE_HEADER_HEIGHT_PX } from "./projectSectionSceneHeaderLayout";

describe("project GPU layout adapter edge and retained control state", () => {
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

  it("marks active text-like retained param controls for projected DOM-control sources", () => {
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
        nativeControlActive: row.state.nativeControlActive,
        domControlActivation: row.state.domControlActivation,
      })),
    ).toEqual([
      {
        domControlActivation: null,
        focused: false,
        hovered: true,
        id: "parent-param",
        nativeControlActive: false,
      },
      {
        domControlActivation: {
          clientPoint: { x: 190, y: 62 },
          kind: "pointer",
        },
        focused: false,
        hovered: false,
        id: "child-param",
        nativeControlActive: true,
      },
    ]);
    expect(scene.domIslands).toEqual([]);
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
});
