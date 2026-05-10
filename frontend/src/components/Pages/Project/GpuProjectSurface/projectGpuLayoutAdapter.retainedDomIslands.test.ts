import {
  addParamToProjectState,
  createDateParamImpl,
  createNestedParamImpl,
  createPasswordParamImpl,
  createRotaryParamImpl,
  createSliderParamImpl,
  createTimeParamImpl,
  projectStateWithSections,
  sectionSize,
} from "testUtils/projectGpuLayoutAdapter.test.support";
import {
  CodeObjTypeEnum,
  DateControlModeEnum,
  DateSelectionModeEnum,
  TimeControlModeEnum,
  createCodeParamCodeObjImpl,
  createDictSectionImpl,
  createDropdownParamCodeObjImpl,
  createShownParamIDs,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import { getProjectGpuFlowScene } from "./projectGpuLayoutAdapter";

describe("project GPU layout adapter retained DOM islands", () => {
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
