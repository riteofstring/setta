import { getTempParamDndId } from "forks/dnd-kit/paramDndState";
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
import { getFilteredRenderableParamIds } from "./getFilteredRenderableParamIds";

function setupProjectState({
  paramFilter,
  showParamDisplayNames = true,
}: {
  paramFilter: string;
  showParamDisplayNames?: boolean;
}) {
  const sectionId = "section-1";
  const variantId = "variant-1";
  const implId = "impl-1";
  const encodingId = "encoding";
  const errorsId = "errors";
  const modeId = "mode";
  const encodingVariantId = "encoding-variant";
  const errorsVariantId = "errors-variant";
  const modeVariantId = "mode-variant";
  const encodingImplId = "encoding-impl";
  const errorsImplId = "errors-impl";
  const modeImplId = "mode-impl";

  const projectConfig = createProjectConfig({
    id: "project-1",
    showParamDisplayNames,
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
    callable: encodingId,
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
      [encodingId]: encodingVariantId,
      [errorsId]: errorsVariantId,
      [modeId]: modeVariantId,
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
    [encodingId]: {
      id: encodingId,
      name: "encoding",
      displayName: "Encoding",
      variants: [encodingVariantId],
      defaultVariant: encodingVariantId,
      sharedModifier: {},
      unsharedKeys: [],
    },
    [errorsId]: {
      id: errorsId,
      name: "errors",
      displayName: "Errors",
      variants: [errorsVariantId],
      defaultVariant: errorsVariantId,
      sharedModifier: {},
      unsharedKeys: [],
    },
    [modeId]: {
      id: modeId,
      name: "mode",
      displayName: "File mode",
      variants: [modeVariantId],
      defaultVariant: modeVariantId,
      sharedModifier: {},
      unsharedKeys: [],
    },
  };

  const codeObjVariants: Record<string, Variant> = {
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
    [modeVariantId]: {
      id: modeVariantId,
      name: "ModeVariant",
      impl: modeImplId,
      nonPresetImpls: [],
      modifier: {},
      isFrozen: false,
    },
  };

  const codeObjImpls = {
    [encodingImplId]: {
      type: CodeObjTypeEnum.CodeParam,
      id: encodingImplId,
      name: "encoding",
      description: "",
      isPreset: false,
      coreNameType: ParamNameTypeEnum.TEXT,
      coreNameEditable: false,
      passingStyle: ParameterPassingStyleEnum.DEFAULT,
      defaultVal: "",
      value: "",
    },
    [errorsImplId]: {
      type: CodeObjTypeEnum.CodeParam,
      id: errorsImplId,
      name: "errors",
      description: "",
      isPreset: false,
      coreNameType: ParamNameTypeEnum.TEXT,
      coreNameEditable: false,
      passingStyle: ParameterPassingStyleEnum.DEFAULT,
      defaultVal: "",
      value: "",
    },
    [modeImplId]: {
      type: CodeObjTypeEnum.CodeParam,
      id: modeImplId,
      name: "mode",
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
    state.shownParamIds = {
      [variantId]: {
        pinned: { requiredParamIdsToPaths: {}, topLevelParamIds: [] },
        unpinned: {
          requiredParamIdsToPaths: {
            [encodingId]: [encodingId],
            [errorsId]: [encodingId, errorsId],
            [modeId]: [modeId],
          },
          topLevelParamIds: [encodingId, modeId],
        },
      },
    };
  });

  return {
    sectionId,
    encodingId,
    errorsId,
    modeId,
  };
}

describe("getFilteredRenderableParamIds", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("returns the render ids unchanged when no param filter is active", () => {
    const { sectionId, encodingId, errorsId, modeId } = setupProjectState({
      paramFilter: "",
    });
    const tempModeId = getTempParamDndId(modeId);

    const filteredIds = getFilteredRenderableParamIds({
      state: useProjectState.getState(),
      sectionId,
      renderParamIds: [encodingId, errorsId, modeId, tempModeId],
      requiredParamIdsToPaths: {
        [encodingId]: [encodingId],
        [errorsId]: [encodingId, errorsId],
        [modeId]: [modeId],
      },
    });

    expect(filteredIds).toEqual([encodingId, errorsId, modeId, tempModeId]);
  });

  it("keeps the matched nested path and any temp placeholder ids", () => {
    const { sectionId, encodingId, errorsId, modeId } = setupProjectState({
      paramFilter: "Errors",
    });
    const tempModeId = getTempParamDndId(modeId);

    const filteredIds = getFilteredRenderableParamIds({
      state: useProjectState.getState(),
      sectionId,
      renderParamIds: [encodingId, errorsId, modeId, tempModeId],
      requiredParamIdsToPaths: {
        [encodingId]: [encodingId],
        [errorsId]: [encodingId, errorsId],
        [modeId]: [modeId],
      },
    });

    // Filtering a nested child must keep the full visible path.
    expect(filteredIds).toEqual([encodingId, errorsId, tempModeId]);
  });

  it("respects display names when filtering visible params", () => {
    const { sectionId, encodingId, errorsId, modeId } = setupProjectState({
      paramFilter: "File mode",
    });

    const filteredIds = getFilteredRenderableParamIds({
      state: useProjectState.getState(),
      sectionId,
      renderParamIds: [encodingId, errorsId, modeId],
      requiredParamIdsToPaths: {
        [encodingId]: [encodingId],
        [errorsId]: [encodingId, errorsId],
        [modeId]: [modeId],
      },
    });

    expect(filteredIds).toEqual([modeId]);
  });
});
