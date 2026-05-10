import { KWARGS_CONTROLS_SCENE_HEIGHT_PX } from "components/Section/SectionParts/kwargsControlsLayout";
import { createGpuFlowLayoutStore } from "gpuFlow/layoutStore";
import { getGpuFlowSceneDomSectionNodes } from "gpuFlow/scene";
import {
  addParamToProjectState,
  createColorPickerParamImpl,
  createNestedParamImpl,
  projectStateWithSections,
  sectionSize,
} from "testUtils/projectGpuLayoutAdapter.test.support";
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
  createButtonParamCodeObjImpl,
  createCodeParamCodeObjImpl,
  createDateParamCodeObjImpl,
  createDictSectionImpl,
  createDropdownParamCodeObjImpl,
  createDropzoneParamCodeObjImpl,
  createGroupSectionImpl,
  createShownParamIDs,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import {
  getProjectGpuFlowScene,
  syncProjectGpuLayoutStoreFromScene,
} from "./projectGpuLayoutAdapter";

describe("project GPU layout adapter retained controls", () => {
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
      { focused: false, id: "child-param" },
    ]);
    expect(scene.domIslands).toEqual([
      {
        clipOwnerId: "dict-a:param-content:unpinned",
        contentRect: { height: 24, width: 113, x: 0, y: 0 },
        id: "param-label:dict-a:child-param",
        kind: "retained-content-label",
        ownerSectionId: "dict-a",
        rect: {
          height: 24,
          width: 113,
          x: 22,
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
      contentRect: { height: 132, width: 240, x: 0, y: 0 },
      kind: "retained-content-control",
      ownerSectionId: "dict-a",
      rect: { height: 132, width: 240 },
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
      contentRect: { height: 24, width: 128, x: 0, y: 0 },
      kind: "retained-content-control",
      ownerSectionId: "dict-a",
      rect: { height: 24, width: 128 },
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
});
