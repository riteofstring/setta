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
import { getParamDndListRenderModel } from "./getParamDndListRenderModel";

function setupProjectState({
  paramFilter,
}: {
  paramFilter: string;
}) {
  const sectionId = "section-1";
  const variantId = "variant-1";
  const implId = "impl-1";
  const rootId = "open";
  const modeId = "mode";
  const encodingId = "encoding";
  const errorsId = "errors";
  const rootVariantId = "open-variant";
  const modeVariantId = "mode-variant";
  const encodingVariantId = "encoding-variant";
  const errorsVariantId = "errors-variant";
  const rootImplId = "open-impl";
  const modeImplId = "mode-impl";
  const encodingImplId = "encoding-impl";
  const errorsImplId = "errors-impl";

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
    callable: rootId,
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
      [rootId]: rootVariantId,
      [modeId]: modeVariantId,
      [encodingId]: encodingVariantId,
      [errorsId]: errorsVariantId,
    },
    hideUnpinnedParams: false,
    paramFilter,
    columnWidth: null,
    configLanguage: ConfigLanguageEnum.python,
    pinnedParams: [],
    selectedParams: [],
    ignoreTypeErrors: { callable: false, params: {} },
    edgeInputParams: [],
    edgeOutputPorts: [],
    topLevelParamId: null,
    styleColor: null,
  };

  const codeObjs: Record<string, Core> = {
    [rootId]: {
      id: rootId,
      name: "open",
      displayName: "",
      variants: [rootVariantId],
      defaultVariant: rootVariantId,
      sharedModifier: {},
      unsharedKeys: [],
    },
    [modeId]: {
      id: modeId,
      name: "mode",
      displayName: "",
      variants: [modeVariantId],
      defaultVariant: modeVariantId,
      sharedModifier: {},
      unsharedKeys: [],
    },
    [encodingId]: {
      id: encodingId,
      name: "encoding",
      displayName: "",
      variants: [encodingVariantId],
      defaultVariant: encodingVariantId,
      sharedModifier: {},
      unsharedKeys: [],
    },
    [errorsId]: {
      id: errorsId,
      name: "errors",
      displayName: "",
      variants: [errorsVariantId],
      defaultVariant: errorsVariantId,
      sharedModifier: {},
      unsharedKeys: [],
    },
  };

  const codeObjVariants: Record<string, Variant> = {
    [rootVariantId]: {
      id: rootVariantId,
      name: "OpenVariant",
      impl: rootImplId,
      nonPresetImpls: [],
      modifier: {},
      isFrozen: false,
    },
    [modeVariantId]: {
      id: modeVariantId,
      name: "ModeVariant",
      impl: modeImplId,
      nonPresetImpls: [],
      modifier: {},
      isFrozen: false,
    },
    [encodingVariantId]: {
      id: encodingVariantId,
      name: "EncodingVariant",
      impl: encodingImplId,
      nonPresetImpls: [],
      modifier: {},
      isFrozen: false,
    },
    [errorsVariantId]: {
      id: errorsVariantId,
      name: "ErrorsVariant",
      impl: errorsImplId,
      nonPresetImpls: [],
      modifier: {},
      isFrozen: false,
    },
  };

  const codeObjImpls = {
    [rootImplId]: {
      type: CodeObjTypeEnum.CodeCallable,
      id: rootImplId,
      name: "open",
      description: "",
      isPreset: false,
      children: [modeId, encodingId],
    },
    [modeImplId]: {
      type: CodeObjTypeEnum.CodeParam,
      id: modeImplId,
      name: "mode",
      description: "",
      isPreset: false,
      coreNameType: ParamNameTypeEnum.TEXT,
      coreNameEditable: true,
      passingStyle: ParameterPassingStyleEnum.DEFAULT,
      defaultVal: "",
      value: "",
    },
    [encodingImplId]: {
      type: CodeObjTypeEnum.NestedParam,
      id: encodingImplId,
      name: "encoding",
      description: "",
      isPreset: false,
      coreNameType: ParamNameTypeEnum.TEXT,
      coreNameEditable: true,
      passingStyle: ParameterPassingStyleEnum.DEFAULT,
      typeAnnotation: "",
      children: [errorsId],
    },
    [errorsImplId]: {
      type: CodeObjTypeEnum.CodeParam,
      id: errorsImplId,
      name: "errors",
      description: "",
      isPreset: false,
      coreNameType: ParamNameTypeEnum.TEXT,
      coreNameEditable: true,
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

  return {
    sectionId,
    rootId,
    modeId,
    encodingId,
    errorsId,
  };
}

describe("getParamDndListRenderModel", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("keeps the duplicate index but disables the tree when a param filter is active", () => {
    const { sectionId, rootId, modeId, encodingId, errorsId } =
      setupProjectState({
        paramFilter: "err",
      });

    const model = getParamDndListRenderModel({
      state: useProjectState.getState(),
      sectionId,
      allowTree: true,
      paramIds: [modeId, encodingId],
      requiredParamIdsToPaths: {
        [modeId]: [modeId],
        [encodingId]: [encodingId],
        [errorsId]: [encodingId, errorsId],
      },
    });

    expect(model.paramFilterActive).toBe(true);
    expect(model.tree).toBeNull();
    expect(model.duplicateIndex.parentById).toEqual({
      [rootId]: null,
      [modeId]: rootId,
      [encodingId]: rootId,
      [errorsId]: encodingId,
    });
  });

  it("builds the tree when callable reordering is allowed", () => {
    const { sectionId, rootId, modeId, encodingId, errorsId } =
      setupProjectState({
        paramFilter: "",
      });

    const model = getParamDndListRenderModel({
      state: useProjectState.getState(),
      sectionId,
      allowTree: true,
      paramIds: [modeId, encodingId],
      requiredParamIdsToPaths: {
        [modeId]: [modeId],
        [encodingId]: [encodingId],
        [errorsId]: [encodingId, errorsId],
      },
    });

    expect(model.paramFilterActive).toBe(false);
    expect(model.tree).not.toBeNull();
    expect(model.tree?.rootId).toBe(rootId);
    expect(model.tree?.flat.map((item) => item.id)).toEqual([
      modeId,
      encodingId,
      errorsId,
    ]);
  });
});
