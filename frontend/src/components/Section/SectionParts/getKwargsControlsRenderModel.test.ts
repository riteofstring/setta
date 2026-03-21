import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  CodeObjTypeEnum,
  ConfigLanguageEnum,
  ParamNameTypeEnum,
  ParameterPassingStyleEnum,
  SectionTypeEnum,
  createProjectConfig,
  type Core,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getKwargsControlsRenderModel } from "./getKwargsControlsRenderModel";

function setupProjectState({
  callable = "root",
  selectedParams = ["editable", "locked"],
  pinnedParams = ["editable"],
  edgeInputParams = ["locked"],
  paramFilter = "mode",
}: {
  callable?: string | null;
  selectedParams?: string[];
  pinnedParams?: string[];
  edgeInputParams?: string[];
  paramFilter?: string;
}) {
  const sectionId = "section-1";
  const variantId = "variant-1";
  const implId = "impl-1";
  const rootVariantId = "root-variant";
  const editableVariantId = "editable-variant";
  const lockedVariantId = "locked-variant";
  const rootImplId = "root-impl";
  const editableImplId = "editable-impl";
  const lockedImplId = "locked-impl";

  const projectConfig = createProjectConfig({
    id: "project-1",
    sectionVariantMap: { [sectionId]: variantId },
    topLevelSections: {
      [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
    },
  });

  const sectionCore: Core = {
    id: sectionId,
    name: "Callable",
    displayName: "",
    variants: [variantId],
    defaultVariant: variantId,
    sharedModifier: {},
    unsharedKeys: [],
  };

  const sectionVariant: Variant = {
    id: variantId,
    name: "Variant",
    impl: implId,
    nonPresetImpls: [],
    modifier: {},
    isFrozen: false,
  };

  const callableImpl = {
    type: SectionTypeEnum.Callable,
    id: implId,
    name: "Callable",
    callable,
    isFrozen: false,
    isInOtherProjectConfigs: false,
    tagColor: null,
    size: { width: 240, height: 160 },
    aspectRatio: false,
    aspectRatioExtraHeight: 0,
    aspectRatioExtraWidth: 0,
    isMinimized: false,
    positionAndSizeLocked: false,
    isPreset: false,
    codeObjVariantMap: {
      root: rootVariantId,
      editable: editableVariantId,
      locked: lockedVariantId,
    },
    hideUnpinnedParams: false,
    paramFilter,
    columnWidth: null,
    configLanguage: ConfigLanguageEnum.python,
    pinnedParams,
    selectedParams,
    ignoreTypeErrors: { callable: false, params: {} },
    edgeInputParams,
    edgeOutputPorts: [],
    topLevelParamId: null,
    styleColor: "sky",
  };

  const codeObjs: Record<string, Core> = {
    root: {
      id: "root",
      name: "math.sqrt",
      displayName: "",
      variants: [rootVariantId],
      defaultVariant: rootVariantId,
      sharedModifier: {},
      unsharedKeys: [],
    },
    editable: {
      id: "editable",
      name: "editable",
      displayName: "",
      variants: [editableVariantId],
      defaultVariant: editableVariantId,
      sharedModifier: {},
      unsharedKeys: [],
    },
    locked: {
      id: "locked",
      name: "locked",
      displayName: "",
      variants: [lockedVariantId],
      defaultVariant: lockedVariantId,
      sharedModifier: {},
      unsharedKeys: [],
    },
  };

  const codeObjVariants: Record<string, Variant> = {
    [rootVariantId]: {
      id: rootVariantId,
      name: "RootVariant",
      impl: rootImplId,
      nonPresetImpls: [],
      modifier: {},
      isFrozen: false,
    },
    [editableVariantId]: {
      id: editableVariantId,
      name: "EditableVariant",
      impl: editableImplId,
      nonPresetImpls: [],
      modifier: {},
      isFrozen: false,
    },
    [lockedVariantId]: {
      id: lockedVariantId,
      name: "LockedVariant",
      impl: lockedImplId,
      nonPresetImpls: [],
      modifier: {},
      isFrozen: false,
    },
  };

  const codeObjImpls = {
    [rootImplId]: {
      type: CodeObjTypeEnum.CodeCallable,
      id: rootImplId,
      name: "math.sqrt",
      description: "",
      isPreset: false,
      children: ["editable", "locked"],
    },
    [editableImplId]: {
      type: CodeObjTypeEnum.CodeParam,
      id: editableImplId,
      name: "editable",
      description: "",
      isPreset: false,
      coreNameType: ParamNameTypeEnum.TEXT,
      coreNameEditable: true,
      passingStyle: ParameterPassingStyleEnum.DEFAULT,
      defaultVal: "",
      value: "",
    },
    [lockedImplId]: {
      type: CodeObjTypeEnum.CodeParam,
      id: lockedImplId,
      name: "locked",
      description: "",
      isPreset: false,
      coreNameType: ParamNameTypeEnum.TEXT,
      coreNameEditable: false,
      passingStyle: ParameterPassingStyleEnum.DEFAULT,
      defaultVal: "",
      value: "",
    },
  };

  useProjectState.setState((state) => {
    state.projectConfig = projectConfig;
    state.sections = { [sectionId]: sectionCore };
    state.sectionVariants = { [variantId]: sectionVariant };
    state.sectionImpls = { [implId]: callableImpl };
    state.codeObjs = codeObjs;
    state.codeObjVariants = codeObjVariants;
    state.codeObjImpls = codeObjImpls;
    state.parentSectionMap = { [sectionId]: null };
    state.previewSectionVariantMap = {};
  });

  return { sectionId };
}

describe("getKwargsControlsRenderModel", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("returns the callable controls model with only editable selected params deletable", () => {
    const { sectionId } = setupProjectState({});

    const model = getKwargsControlsRenderModel({
      state: useProjectState.getState(),
      sectionId,
    });

    expect(model).toEqual({
      callableMissing: false,
      isCallableSection: true,
      styleColor: "sky",
      selectedParams: ["editable", "locked"],
      edgeInputParams: ["locked"],
      pinnedParams: ["editable"],
      paramFilterValue: "mode",
      deletableSelectedParamIds: ["editable"],
    });
  });

  it("marks the callable as missing when the section has no callable target", () => {
    const { sectionId } = setupProjectState({
      callable: null,
      selectedParams: [],
      pinnedParams: [],
      edgeInputParams: [],
      paramFilter: "",
    });

    const model = getKwargsControlsRenderModel({
      state: useProjectState.getState(),
      sectionId,
    });

    expect(model.callableMissing).toBe(true);
    expect(model.deletableSelectedParamIds).toEqual([]);
    expect(model.paramFilterValue).toBe("");
  });
});
