import type { Node } from "gpuFlow/flowTypes";
import type { ZustandProjectState } from "state/definitions";
import {
  CodeObjTypeEnum,
  DateCalendarWeekStartEnum,
  DateDisplayFormatEnum,
  DateSelectionModeEnum,
  ParamNameTypeEnum,
  ParameterPassingStyleEnum,
  TimeDisplayFontEnum,
  TimeDisplayFormatEnum,
  createCore,
  createPasswordParamCodeObjImpl,
  createProjectConfig,
  createSingleConfig,
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

export function projectNode(
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

export function sectionSize(size: {
  readonly height: number | "auto";
  readonly width: number | "auto";
}): never {
  // create*SectionImpl accepts the runtime section-size shape but its generated
  // option type still exposes the Go wrapper representation.
  return size as never;
}

export function createNestedParamImpl(
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

export function createTimeParamImpl({
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

export function createDateParamImpl({
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

export function createSliderParamImpl({
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

export function createRotaryParamImpl({
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

export function createColorPickerParamImpl({
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

export function createPasswordParamImpl({
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

export function addParamToProjectState(
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

export function projectStateWithSections({
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
