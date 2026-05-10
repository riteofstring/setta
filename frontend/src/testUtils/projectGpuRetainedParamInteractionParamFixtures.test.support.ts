import type { GpuFlowScene } from "gpuFlow/scene";
import { useProjectState, type ZustandProjectState } from "state/definitions";
import {
  CodeObjTypeEnum,
  DateCalendarWeekStartEnum,
  DateControlModeEnum,
  DateDisplayFormatEnum,
  DateSelectionModeEnum,
  DropzoneModeEnum,
  ParamNameTypeEnum,
  ParameterPassingStyleEnum,
  TimeDisplayFontEnum,
  TimeDisplayFormatEnum,
  createCodeParamCodeObjImpl,
  createCore,
  createDateParamCodeObjImpl,
  createDictSectionImpl,
  createDropzoneParamCodeObjImpl,
  createNestedParamCodeObjImpl,
  createPasswordParamCodeObjImpl,
  createProjectConfig,
  createSingleConfig,
  createSwitchParamCodeObjImpl,
  createVariant,
  type ColorPickerParamCodeObjImpl,
  type DateParamCodeObjImpl,
  type DropdownParamCodeObjImpl,
  type DropzoneParamCodeObjImpl,
  type PasswordParamCodeObjImpl,
  type RotaryParamCodeObjImpl,
  type SliderParamCodeObjImpl,
  type TimeParamCodeObjImpl,
} from "utils/generatedTypes";

export const EMPTY_TEST_SCENE: GpuFlowScene = {
  contentSurfaces: [],
  domIslands: [],
  edges: [],
  revision: 0,
  sections: [],
};

export function seedSwitchParamProjectState(value: string) {
  const sectionVariantId = "section-1-variant";
  const sectionImplId = "section-1-impl";
  const rootParamId = "root-param";
  const rootVariantId = "root-param-variant";
  const rootImplId = "root-param-impl";
  const paramVariantId = "param-1-variant";
  const paramImplId = "param-1-impl";

  useProjectState.setState(
    createSingleConfig({
      codeObjImpls: {
        [paramImplId]: createSwitchParamCodeObjImpl({
          coreNameEditable: true,
          coreNameType: ParamNameTypeEnum.TEXT,
          defaultVal: "false",
          description: "",
          id: paramImplId,
          isPreset: false,
          name: "param-1",
          passingStyle: ParameterPassingStyleEnum.DEFAULT,
          type: CodeObjTypeEnum.SwitchParam,
          typeAnnotation: "",
          value,
        }),
        [rootImplId]: createNestedParamCodeObjImpl({
          children: ["param-1"],
          coreNameEditable: true,
          coreNameType: ParamNameTypeEnum.TEXT,
          description: "",
          id: rootImplId,
          isPreset: false,
          name: rootParamId,
          passingStyle: ParameterPassingStyleEnum.DEFAULT,
          type: CodeObjTypeEnum.NestedParam,
          typeAnnotation: "",
        }),
      },
      codeObjVariants: {
        [paramVariantId]: createVariant({
          id: paramVariantId,
          impl: paramImplId,
          name: paramVariantId,
          nonPresetImpls: [paramImplId],
        }),
        [rootVariantId]: createVariant({
          id: rootVariantId,
          impl: rootImplId,
          name: rootVariantId,
          nonPresetImpls: [rootImplId],
        }),
      },
      codeObjs: {
        "param-1": createCore({
          defaultVariant: paramVariantId,
          displayName: "",
          id: "param-1",
          name: "param-1",
          variants: [paramVariantId],
        }),
        [rootParamId]: createCore({
          defaultVariant: rootVariantId,
          displayName: "",
          id: rootParamId,
          name: rootParamId,
          variants: [rootVariantId],
        }),
      },
      parentSectionMap: { "section-1": null },
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { "section-1": sectionVariantId },
        showParamDisplayNames: false,
      }),
      sectionImpls: {
        [sectionImplId]: createDictSectionImpl({
          codeObjVariantMap: {
            "param-1": paramVariantId,
            [rootParamId]: rootVariantId,
          },
          id: sectionImplId,
          selectedParams: [],
          topLevelParamId: rootParamId,
        }),
      },
      sectionVariants: {
        [sectionVariantId]: createVariant({
          id: sectionVariantId,
          impl: sectionImplId,
          name: sectionVariantId,
          nonPresetImpls: [sectionImplId],
        }),
      },
      sections: {
        "section-1": createCore({
          defaultVariant: sectionVariantId,
          id: "section-1",
          name: "Section 1",
          variants: [sectionVariantId],
        }),
      },
    }) as ZustandProjectState,
  );
}

export function seedSliderParamProjectState(value: string) {
  const sectionVariantId = "section-1-variant";
  const sectionImplId = "section-1-impl";
  const rootParamId = "root-param";
  const rootVariantId = "root-param-variant";
  const rootImplId = "root-param-impl";
  const paramVariantId = "param-1-variant";
  const paramImplId = "param-1-impl";
  const paramImpl = {
    coreNameEditable: true,
    coreNameType: ParamNameTypeEnum.TEXT,
    defaultVal: "0",
    description: "",
    id: paramImplId,
    isPreset: false,
    max: 10,
    min: 0,
    name: "param-1",
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    step: 1,
    type: CodeObjTypeEnum.SliderParam,
    typeAnnotation: "",
    value,
  } satisfies SliderParamCodeObjImpl;

  useProjectState.setState(
    createSingleConfig({
      codeObjImpls: {
        [paramImplId]: paramImpl,
        [rootImplId]: createNestedParamCodeObjImpl({
          children: ["param-1"],
          coreNameEditable: true,
          coreNameType: ParamNameTypeEnum.TEXT,
          description: "",
          id: rootImplId,
          isPreset: false,
          name: rootParamId,
          passingStyle: ParameterPassingStyleEnum.DEFAULT,
          type: CodeObjTypeEnum.NestedParam,
          typeAnnotation: "",
        }),
      },
      codeObjVariants: {
        [paramVariantId]: createVariant({
          id: paramVariantId,
          impl: paramImplId,
          name: paramVariantId,
          nonPresetImpls: [paramImplId],
        }),
        [rootVariantId]: createVariant({
          id: rootVariantId,
          impl: rootImplId,
          name: rootVariantId,
          nonPresetImpls: [rootImplId],
        }),
      },
      codeObjs: {
        "param-1": createCore({
          defaultVariant: paramVariantId,
          displayName: "",
          id: "param-1",
          name: "param-1",
          variants: [paramVariantId],
        }),
        [rootParamId]: createCore({
          defaultVariant: rootVariantId,
          displayName: "",
          id: rootParamId,
          name: rootParamId,
          variants: [rootVariantId],
        }),
      },
      parentSectionMap: { "section-1": null },
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { "section-1": sectionVariantId },
        showParamDisplayNames: false,
      }),
      sectionImpls: {
        [sectionImplId]: createDictSectionImpl({
          codeObjVariantMap: {
            "param-1": paramVariantId,
            [rootParamId]: rootVariantId,
          },
          id: sectionImplId,
          selectedParams: [],
          topLevelParamId: rootParamId,
        }),
      },
      sectionVariants: {
        [sectionVariantId]: createVariant({
          id: sectionVariantId,
          impl: sectionImplId,
          name: sectionVariantId,
          nonPresetImpls: [sectionImplId],
        }),
      },
      sections: {
        "section-1": createCore({
          defaultVariant: sectionVariantId,
          id: "section-1",
          name: "Section 1",
          variants: [sectionVariantId],
        }),
      },
    }) as ZustandProjectState,
  );
}

export function seedRotaryParamProjectState(value: string) {
  const sectionVariantId = "section-1-variant";
  const sectionImplId = "section-1-impl";
  const rootParamId = "root-param";
  const rootVariantId = "root-param-variant";
  const rootImplId = "root-param-impl";
  const paramVariantId = "param-1-variant";
  const paramImplId = "param-1-impl";
  const paramImpl = {
    coreNameEditable: true,
    coreNameType: ParamNameTypeEnum.TEXT,
    defaultVal: "0",
    description: "",
    id: paramImplId,
    isPreset: false,
    max: 10,
    min: 0,
    name: "param-1",
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    step: 1,
    type: CodeObjTypeEnum.RotaryParam,
    typeAnnotation: "",
    value,
  } satisfies RotaryParamCodeObjImpl;

  useProjectState.setState(
    createSingleConfig({
      codeObjImpls: {
        [paramImplId]: paramImpl,
        [rootImplId]: createNestedParamCodeObjImpl({
          children: ["param-1"],
          coreNameEditable: true,
          coreNameType: ParamNameTypeEnum.TEXT,
          description: "",
          id: rootImplId,
          isPreset: false,
          name: rootParamId,
          passingStyle: ParameterPassingStyleEnum.DEFAULT,
          type: CodeObjTypeEnum.NestedParam,
          typeAnnotation: "",
        }),
      },
      codeObjVariants: {
        [paramVariantId]: createVariant({
          id: paramVariantId,
          impl: paramImplId,
          name: paramVariantId,
          nonPresetImpls: [paramImplId],
        }),
        [rootVariantId]: createVariant({
          id: rootVariantId,
          impl: rootImplId,
          name: rootVariantId,
          nonPresetImpls: [rootImplId],
        }),
      },
      codeObjs: {
        "param-1": createCore({
          defaultVariant: paramVariantId,
          displayName: "",
          id: "param-1",
          name: "param-1",
          variants: [paramVariantId],
        }),
        [rootParamId]: createCore({
          defaultVariant: rootVariantId,
          displayName: "",
          id: rootParamId,
          name: rootParamId,
          variants: [rootVariantId],
        }),
      },
      parentSectionMap: { "section-1": null },
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { "section-1": sectionVariantId },
        showParamDisplayNames: false,
      }),
      sectionImpls: {
        [sectionImplId]: createDictSectionImpl({
          codeObjVariantMap: {
            "param-1": paramVariantId,
            [rootParamId]: rootVariantId,
          },
          id: sectionImplId,
          selectedParams: [],
          topLevelParamId: rootParamId,
        }),
      },
      sectionVariants: {
        [sectionVariantId]: createVariant({
          id: sectionVariantId,
          impl: sectionImplId,
          name: sectionVariantId,
          nonPresetImpls: [sectionImplId],
        }),
      },
      sections: {
        "section-1": createCore({
          defaultVariant: sectionVariantId,
          id: "section-1",
          name: "Section 1",
          variants: [sectionVariantId],
        }),
      },
    }) as ZustandProjectState,
  );
}

export function seedColorPickerParamProjectState(value: string) {
  const sectionVariantId = "section-1-variant";
  const sectionImplId = "section-1-impl";
  const rootParamId = "root-param";
  const rootVariantId = "root-param-variant";
  const rootImplId = "root-param-impl";
  const paramVariantId = "param-1-variant";
  const paramImplId = "param-1-impl";
  const paramImpl = {
    colorChoices: [
      { color: "#ef4444", description: "Red" },
      { color: "#22c55e", description: "Green" },
    ],
    coreNameEditable: true,
    coreNameType: ParamNameTypeEnum.TEXT,
    defaultVal: "#ef4444",
    description: "",
    id: paramImplId,
    isPreset: false,
    name: "param-1",
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    type: CodeObjTypeEnum.ColorPickerParam,
    typeAnnotation: "",
    value,
  } satisfies ColorPickerParamCodeObjImpl;

  useProjectState.setState(
    createSingleConfig({
      codeObjImpls: {
        [paramImplId]: paramImpl,
        [rootImplId]: createNestedParamCodeObjImpl({
          children: ["param-1"],
          coreNameEditable: true,
          coreNameType: ParamNameTypeEnum.TEXT,
          description: "",
          id: rootImplId,
          isPreset: false,
          name: rootParamId,
          passingStyle: ParameterPassingStyleEnum.DEFAULT,
          type: CodeObjTypeEnum.NestedParam,
          typeAnnotation: "",
        }),
      },
      codeObjVariants: {
        [paramVariantId]: createVariant({
          id: paramVariantId,
          impl: paramImplId,
          name: paramVariantId,
          nonPresetImpls: [paramImplId],
        }),
        [rootVariantId]: createVariant({
          id: rootVariantId,
          impl: rootImplId,
          name: rootVariantId,
          nonPresetImpls: [rootImplId],
        }),
      },
      codeObjs: {
        "param-1": createCore({
          defaultVariant: paramVariantId,
          displayName: "",
          id: "param-1",
          name: "param-1",
          variants: [paramVariantId],
        }),
        [rootParamId]: createCore({
          defaultVariant: rootVariantId,
          displayName: "",
          id: rootParamId,
          name: rootParamId,
          variants: [rootVariantId],
        }),
      },
      parentSectionMap: { "section-1": null },
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { "section-1": sectionVariantId },
        showParamDisplayNames: false,
      }),
      sectionImpls: {
        [sectionImplId]: createDictSectionImpl({
          codeObjVariantMap: {
            "param-1": paramVariantId,
            [rootParamId]: rootVariantId,
          },
          id: sectionImplId,
          selectedParams: [],
          topLevelParamId: rootParamId,
        }),
      },
      sectionVariants: {
        [sectionVariantId]: createVariant({
          id: sectionVariantId,
          impl: sectionImplId,
          name: sectionVariantId,
          nonPresetImpls: [sectionImplId],
        }),
      },
      sections: {
        "section-1": createCore({
          defaultVariant: sectionVariantId,
          id: "section-1",
          name: "Section 1",
          variants: [sectionVariantId],
        }),
      },
    }) as ZustandProjectState,
  );
}

export function seedDropdownParamProjectState(value: string) {
  const sectionVariantId = "section-1-variant";
  const sectionImplId = "section-1-impl";
  const rootParamId = "root-param";
  const rootVariantId = "root-param-variant";
  const rootImplId = "root-param-impl";
  const paramVariantId = "param-1-variant";
  const paramImplId = "param-1-impl";
  const paramImpl = {
    choices: ["small", "large"],
    coreNameEditable: true,
    coreNameType: ParamNameTypeEnum.TEXT,
    defaultVal: "small",
    description: "",
    id: paramImplId,
    isPreset: false,
    name: "param-1",
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    type: CodeObjTypeEnum.DropdownParam,
    typeAnnotation: "",
    value,
  } satisfies DropdownParamCodeObjImpl;

  useProjectState.setState(
    createSingleConfig({
      codeObjImpls: {
        [paramImplId]: paramImpl,
        [rootImplId]: createNestedParamCodeObjImpl({
          children: ["param-1"],
          coreNameEditable: true,
          coreNameType: ParamNameTypeEnum.TEXT,
          description: "",
          id: rootImplId,
          isPreset: false,
          name: rootParamId,
          passingStyle: ParameterPassingStyleEnum.DEFAULT,
          type: CodeObjTypeEnum.NestedParam,
          typeAnnotation: "",
        }),
      },
      codeObjVariants: {
        [paramVariantId]: createVariant({
          id: paramVariantId,
          impl: paramImplId,
          name: paramVariantId,
          nonPresetImpls: [paramImplId],
        }),
        [rootVariantId]: createVariant({
          id: rootVariantId,
          impl: rootImplId,
          name: rootVariantId,
          nonPresetImpls: [rootImplId],
        }),
      },
      codeObjs: {
        "param-1": createCore({
          defaultVariant: paramVariantId,
          displayName: "",
          id: "param-1",
          name: "param-1",
          variants: [paramVariantId],
        }),
        [rootParamId]: createCore({
          defaultVariant: rootVariantId,
          displayName: "",
          id: rootParamId,
          name: rootParamId,
          variants: [rootVariantId],
        }),
      },
      parentSectionMap: { "section-1": null },
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { "section-1": sectionVariantId },
        showParamDisplayNames: false,
      }),
      sectionImpls: {
        [sectionImplId]: createDictSectionImpl({
          codeObjVariantMap: {
            "param-1": paramVariantId,
            [rootParamId]: rootVariantId,
          },
          id: sectionImplId,
          selectedParams: [],
          topLevelParamId: rootParamId,
        }),
      },
      sectionVariants: {
        [sectionVariantId]: createVariant({
          id: sectionVariantId,
          impl: sectionImplId,
          name: sectionVariantId,
          nonPresetImpls: [sectionImplId],
        }),
      },
      sections: {
        "section-1": createCore({
          defaultVariant: sectionVariantId,
          id: "section-1",
          name: "Section 1",
          variants: [sectionVariantId],
        }),
      },
    }) as ZustandProjectState,
  );
}

export function seedDateParamProjectState(value: string) {
  const sectionVariantId = "section-1-variant";
  const sectionImplId = "section-1-impl";
  const rootParamId = "root-param";
  const rootVariantId = "root-param-variant";
  const rootImplId = "root-param-impl";
  const paramVariantId = "param-1-variant";
  const paramImplId = "param-1-impl";
  const paramImpl = createDateParamCodeObjImpl({
    coreNameEditable: true,
    coreNameType: ParamNameTypeEnum.TEXT,
    dateCalendarWeekStart: DateCalendarWeekStartEnum.sunday,
    dateControlMode: DateControlModeEnum.calendar,
    dateDisplayFormat: DateDisplayFormatEnum.iso,
    dateIncludesTime: false,
    dateSelectionMode: DateSelectionModeEnum.multiple,
    defaultVal: "",
    description: "",
    id: paramImplId,
    isPreset: false,
    name: "param-1",
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    type: CodeObjTypeEnum.DateParam,
    typeAnnotation: "",
    value,
  }) satisfies DateParamCodeObjImpl;

  useProjectState.setState(
    createSingleConfig({
      codeObjImpls: {
        [paramImplId]: paramImpl,
        [rootImplId]: createNestedParamCodeObjImpl({
          children: ["param-1"],
          coreNameEditable: true,
          coreNameType: ParamNameTypeEnum.TEXT,
          description: "",
          id: rootImplId,
          isPreset: false,
          name: rootParamId,
          passingStyle: ParameterPassingStyleEnum.DEFAULT,
          type: CodeObjTypeEnum.NestedParam,
          typeAnnotation: "",
        }),
      },
      codeObjVariants: {
        [paramVariantId]: createVariant({
          id: paramVariantId,
          impl: paramImplId,
          name: paramVariantId,
          nonPresetImpls: [paramImplId],
        }),
        [rootVariantId]: createVariant({
          id: rootVariantId,
          impl: rootImplId,
          name: rootVariantId,
          nonPresetImpls: [rootImplId],
        }),
      },
      codeObjs: {
        "param-1": createCore({
          defaultVariant: paramVariantId,
          displayName: "",
          id: "param-1",
          name: "param-1",
          variants: [paramVariantId],
        }),
        [rootParamId]: createCore({
          defaultVariant: rootVariantId,
          displayName: "",
          id: rootParamId,
          name: rootParamId,
          variants: [rootVariantId],
        }),
      },
      parentSectionMap: { "section-1": null },
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { "section-1": sectionVariantId },
        showParamDisplayNames: false,
      }),
      sectionImpls: {
        [sectionImplId]: createDictSectionImpl({
          codeObjVariantMap: {
            "param-1": paramVariantId,
            [rootParamId]: rootVariantId,
          },
          id: sectionImplId,
          selectedParams: [],
          topLevelParamId: rootParamId,
        }),
      },
      sectionVariants: {
        [sectionVariantId]: createVariant({
          id: sectionVariantId,
          impl: sectionImplId,
          name: sectionVariantId,
          nonPresetImpls: [sectionImplId],
        }),
      },
      sections: {
        "section-1": createCore({
          defaultVariant: sectionVariantId,
          id: "section-1",
          name: "Section 1",
          variants: [sectionVariantId],
        }),
      },
    }) as ZustandProjectState,
  );
}

export function calendarCells(selectedIsoDate: string) {
  return Array.from({ length: 42 }, (_, index) => {
    const day = index + 1;
    const isoDate = `2026-05-${String(day).padStart(2, "0")}`;
    return {
      dayOfMonth: day,
      inCurrentMonth: true,
      isoDate,
      selected: isoDate === selectedIsoDate,
      today: false,
    };
  });
}

export function seedDropzoneParamProjectState(value: string) {
  const sectionVariantId = "section-1-variant";
  const sectionImplId = "section-1-impl";
  const rootParamId = "root-param";
  const rootVariantId = "root-param-variant";
  const rootImplId = "root-param-impl";
  const paramVariantId = "param-1-variant";
  const paramImplId = "param-1-impl";
  const paramImpl = createDropzoneParamCodeObjImpl({
    coreNameEditable: true,
    coreNameType: ParamNameTypeEnum.TEXT,
    defaultVal: "",
    description: "",
    id: paramImplId,
    isPreset: false,
    maxAttachments: 1,
    mode: DropzoneModeEnum.STATEFUL,
    name: "param-1",
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    placeholder: "Drop a file here",
    type: CodeObjTypeEnum.DropzoneParam,
    typeAnnotation: "",
    value,
  }) satisfies DropzoneParamCodeObjImpl;

  useProjectState.setState(
    createSingleConfig({
      codeObjImpls: {
        [paramImplId]: paramImpl,
        [rootImplId]: createNestedParamCodeObjImpl({
          children: ["param-1"],
          coreNameEditable: true,
          coreNameType: ParamNameTypeEnum.TEXT,
          description: "",
          id: rootImplId,
          isPreset: false,
          name: rootParamId,
          passingStyle: ParameterPassingStyleEnum.DEFAULT,
          type: CodeObjTypeEnum.NestedParam,
          typeAnnotation: "",
        }),
      },
      codeObjVariants: {
        [paramVariantId]: createVariant({
          id: paramVariantId,
          impl: paramImplId,
          name: paramVariantId,
          nonPresetImpls: [paramImplId],
        }),
        [rootVariantId]: createVariant({
          id: rootVariantId,
          impl: rootImplId,
          name: rootVariantId,
          nonPresetImpls: [rootImplId],
        }),
      },
      codeObjs: {
        "param-1": createCore({
          defaultVariant: paramVariantId,
          displayName: "",
          id: "param-1",
          name: "param-1",
          variants: [paramVariantId],
        }),
        [rootParamId]: createCore({
          defaultVariant: rootVariantId,
          displayName: "",
          id: rootParamId,
          name: rootParamId,
          variants: [rootVariantId],
        }),
      },
      parentSectionMap: { "section-1": null },
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { "section-1": sectionVariantId },
        showParamDisplayNames: false,
      }),
      sectionImpls: {
        [sectionImplId]: createDictSectionImpl({
          codeObjVariantMap: {
            "param-1": paramVariantId,
            [rootParamId]: rootVariantId,
          },
          id: sectionImplId,
          selectedParams: [],
          topLevelParamId: rootParamId,
        }),
      },
      sectionVariants: {
        [sectionVariantId]: createVariant({
          id: sectionVariantId,
          impl: sectionImplId,
          name: sectionVariantId,
          nonPresetImpls: [sectionImplId],
        }),
      },
      sections: {
        "section-1": createCore({
          defaultVariant: sectionVariantId,
          id: "section-1",
          name: "Section 1",
          variants: [sectionVariantId],
        }),
      },
    }) as ZustandProjectState,
  );
}

export function seedPasswordParamProjectState() {
  const sectionVariantId = "section-1-variant";
  const sectionImplId = "section-1-impl";
  const rootParamId = "root-param";
  const rootVariantId = "root-param-variant";
  const rootImplId = "root-param-impl";
  const paramVariantId = "param-1-variant";
  const paramImplId = "param-1-impl";
  const paramImpl = createPasswordParamCodeObjImpl({
    coreNameEditable: true,
    coreNameType: ParamNameTypeEnum.TEXT,
    defaultVal: "",
    description: "",
    hasSecret: true,
    id: paramImplId,
    isPreset: false,
    name: "param-1",
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    type: CodeObjTypeEnum.PasswordParam,
    typeAnnotation: "",
    value: "",
  }) satisfies PasswordParamCodeObjImpl;

  useProjectState.setState(
    createSingleConfig({
      codeObjImpls: {
        [paramImplId]: paramImpl,
        [rootImplId]: createNestedParamCodeObjImpl({
          children: ["param-1"],
          coreNameEditable: true,
          coreNameType: ParamNameTypeEnum.TEXT,
          description: "",
          id: rootImplId,
          isPreset: false,
          name: rootParamId,
          passingStyle: ParameterPassingStyleEnum.DEFAULT,
          type: CodeObjTypeEnum.NestedParam,
          typeAnnotation: "",
        }),
      },
      codeObjVariants: {
        [paramVariantId]: createVariant({
          id: paramVariantId,
          impl: paramImplId,
          name: paramVariantId,
          nonPresetImpls: [paramImplId],
        }),
        [rootVariantId]: createVariant({
          id: rootVariantId,
          impl: rootImplId,
          name: rootVariantId,
          nonPresetImpls: [rootImplId],
        }),
      },
      codeObjs: {
        "param-1": createCore({
          defaultVariant: paramVariantId,
          displayName: "",
          id: "param-1",
          name: "param-1",
          variants: [paramVariantId],
        }),
        [rootParamId]: createCore({
          defaultVariant: rootVariantId,
          displayName: "",
          id: rootParamId,
          name: rootParamId,
          variants: [rootVariantId],
        }),
      },
      parentSectionMap: { "section-1": null },
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { "section-1": sectionVariantId },
        showParamDisplayNames: false,
      }),
      sectionImpls: {
        [sectionImplId]: createDictSectionImpl({
          codeObjVariantMap: {
            "param-1": paramVariantId,
            [rootParamId]: rootVariantId,
          },
          id: sectionImplId,
          selectedParams: [],
          topLevelParamId: rootParamId,
        }),
      },
      sectionVariants: {
        [sectionVariantId]: createVariant({
          id: sectionVariantId,
          impl: sectionImplId,
          name: sectionVariantId,
          nonPresetImpls: [sectionImplId],
        }),
      },
      sections: {
        "section-1": createCore({
          defaultVariant: sectionVariantId,
          id: "section-1",
          name: "Section 1",
          variants: [sectionVariantId],
        }),
      },
    }) as ZustandProjectState,
  );
}

export function seedTimeParamProjectState(
  timeControlMode: TimeParamCodeObjImpl["timeControlMode"],
) {
  const sectionVariantId = "section-1-variant";
  const sectionImplId = "section-1-impl";
  const rootParamId = "root-param";
  const rootVariantId = "root-param-variant";
  const rootImplId = "root-param-impl";
  const paramVariantId = "param-1-variant";
  const paramImplId = "param-1-impl";

  useProjectState.setState(
    createSingleConfig({
      codeObjImpls: {
        [paramImplId]: createTimeParamImpl({
          id: paramImplId,
          name: "param-1",
          timeControlMode,
        }),
        [rootImplId]: createNestedParamCodeObjImpl({
          children: ["param-1"],
          coreNameEditable: true,
          coreNameType: ParamNameTypeEnum.TEXT,
          description: "",
          id: rootImplId,
          isPreset: false,
          name: rootParamId,
          passingStyle: ParameterPassingStyleEnum.DEFAULT,
          type: CodeObjTypeEnum.NestedParam,
          typeAnnotation: "",
        }),
      },
      codeObjVariants: {
        [paramVariantId]: createVariant({
          id: paramVariantId,
          impl: paramImplId,
          name: paramVariantId,
          nonPresetImpls: [paramImplId],
        }),
        [rootVariantId]: createVariant({
          id: rootVariantId,
          impl: rootImplId,
          name: rootVariantId,
          nonPresetImpls: [rootImplId],
        }),
      },
      codeObjs: {
        "param-1": createCore({
          defaultVariant: paramVariantId,
          displayName: "",
          id: "param-1",
          name: "param-1",
          variants: [paramVariantId],
        }),
        [rootParamId]: createCore({
          defaultVariant: rootVariantId,
          displayName: "",
          id: rootParamId,
          name: rootParamId,
          variants: [rootVariantId],
        }),
      },
      parentSectionMap: { "section-1": null },
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { "section-1": sectionVariantId },
        showParamDisplayNames: false,
      }),
      sectionImpls: {
        [sectionImplId]: createDictSectionImpl({
          codeObjVariantMap: {
            "param-1": paramVariantId,
            [rootParamId]: rootVariantId,
          },
          id: sectionImplId,
          selectedParams: [],
          topLevelParamId: rootParamId,
        }),
      },
      sectionVariants: {
        [sectionVariantId]: createVariant({
          id: sectionVariantId,
          impl: sectionImplId,
          name: sectionVariantId,
          nonPresetImpls: [sectionImplId],
        }),
      },
      sections: {
        "section-1": createCore({
          defaultVariant: sectionVariantId,
          id: "section-1",
          name: "Section 1",
          variants: [sectionVariantId],
        }),
      },
    }) as ZustandProjectState,
  );
}

export function createTimeParamImpl({
  id,
  name,
  timeControlMode,
}: {
  readonly id: string;
  readonly name: string;
  readonly timeControlMode: TimeParamCodeObjImpl["timeControlMode"];
}): TimeParamCodeObjImpl {
  return {
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
  };
}

export function seedNestedParamNameProjectState() {
  const sectionVariantId = "section-1-variant";
  const sectionImplId = "section-1-impl";
  const rootParamId = "root-param";
  const rootVariantId = "root-param-variant";
  const rootImplId = "root-param-impl";
  const paramVariantId = "param-1-variant";
  const paramImplId = "param-1-impl";
  const childParamId = "param-child";
  const childVariantId = "param-child-variant";
  const childImplId = "param-child-impl";

  useProjectState.setState(
    createSingleConfig({
      codeObjImpls: {
        [childImplId]: createCodeParamCodeObjImpl({
          id: childImplId,
          name: childParamId,
        }),
        [paramImplId]: createNestedParamCodeObjImpl({
          children: [childParamId],
          coreNameEditable: true,
          coreNameType: ParamNameTypeEnum.TEXT,
          description: "",
          id: paramImplId,
          isPreset: false,
          name: "param-1",
          passingStyle: ParameterPassingStyleEnum.DEFAULT,
          type: CodeObjTypeEnum.NestedParam,
          typeAnnotation: "",
        }),
        [rootImplId]: createNestedParamCodeObjImpl({
          children: ["param-1"],
          coreNameEditable: true,
          coreNameType: ParamNameTypeEnum.TEXT,
          description: "",
          id: rootImplId,
          isPreset: false,
          name: rootParamId,
          passingStyle: ParameterPassingStyleEnum.DEFAULT,
          type: CodeObjTypeEnum.NestedParam,
          typeAnnotation: "",
        }),
      },
      codeObjVariants: {
        [childVariantId]: createVariant({
          id: childVariantId,
          impl: childImplId,
          name: childVariantId,
          nonPresetImpls: [childImplId],
        }),
        [paramVariantId]: createVariant({
          id: paramVariantId,
          impl: paramImplId,
          name: paramVariantId,
          nonPresetImpls: [paramImplId],
        }),
        [rootVariantId]: createVariant({
          id: rootVariantId,
          impl: rootImplId,
          name: rootVariantId,
          nonPresetImpls: [rootImplId],
        }),
      },
      codeObjs: {
        [childParamId]: createCore({
          defaultVariant: childVariantId,
          displayName: "",
          id: childParamId,
          name: childParamId,
          variants: [childVariantId],
        }),
        "param-1": createCore({
          defaultVariant: paramVariantId,
          displayName: "",
          id: "param-1",
          name: "param-1",
          variants: [paramVariantId],
        }),
        [rootParamId]: createCore({
          defaultVariant: rootVariantId,
          displayName: "",
          id: rootParamId,
          name: rootParamId,
          variants: [rootVariantId],
        }),
      },
      parentSectionMap: { "section-1": null },
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { "section-1": sectionVariantId },
        showParamDisplayNames: false,
      }),
      sectionImpls: {
        [sectionImplId]: createDictSectionImpl({
          codeObjVariantMap: {
            [childParamId]: childVariantId,
            "param-1": paramVariantId,
            [rootParamId]: rootVariantId,
          },
          id: sectionImplId,
          selectedParams: ["param-1"],
          topLevelParamId: rootParamId,
        }),
      },
      sectionVariants: {
        [sectionVariantId]: createVariant({
          id: sectionVariantId,
          impl: sectionImplId,
          name: sectionVariantId,
          nonPresetImpls: [sectionImplId],
        }),
      },
      sections: {
        "section-1": createCore({
          defaultVariant: sectionVariantId,
          id: "section-1",
          name: "Section 1",
          variants: [sectionVariantId],
        }),
      },
    }) as ZustandProjectState,
  );
}
