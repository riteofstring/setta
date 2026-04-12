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
import { buildParamDuplicateIndex } from "./paramDuplicateIndex";

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}) {
  if (!store.getInitialState) {
    return;
  }
  const initial = store.getInitialState();
  Object.assign(initial, store.getState());
}

function seedDuplicateIndexState() {
  const sectionId = "section-1";
  const variantId = "variant-1";
  const implId = "impl-1";
  const rootParamId = "root-param";
  const rootParamVariantId = "root-param-variant";
  const rootParamImplId = "root-param-impl";
  const firstChildId = "child-a";
  const secondChildId = "child-b";
  const firstChildVariantId = "child-a-variant";
  const secondChildVariantId = "child-b-variant";
  const firstChildImplId = "child-a-impl";
  const secondChildImplId = "child-b-impl";

  const projectConfig = createProjectConfig({
    id: "project-1",
    sectionVariantMap: { [sectionId]: variantId },
    topLevelSections: {
      [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
    },
  });

  const sectionCore: Core = {
    id: sectionId,
    name: "Dict",
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
  const dictImpl = {
    type: SectionTypeEnum.Dict,
    id: implId,
    name: "Dict",
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
      [rootParamId]: rootParamVariantId,
      [firstChildId]: firstChildVariantId,
      [secondChildId]: secondChildVariantId,
    },
    hideUnpinnedParams: false,
    paramFilter: "",
    columnWidth: null,
    configLanguage: ConfigLanguageEnum.python,
    pinnedParams: [],
    selectedParams: [],
    ignoreTypeErrors: { callable: false, params: {} },
    edgeInputParams: [],
    edgeOutputPorts: [],
    topLevelParamId: rootParamId,
    isJsonSource: false,
    jsonSourceKeys: [],
    jsonSourceMissing: false,
  };
  const rootParamCore: Core = {
    id: rootParamId,
    name: "root",
    displayName: "",
    variants: [rootParamVariantId],
    defaultVariant: rootParamVariantId,
    sharedModifier: {},
    unsharedKeys: [],
  };
  const firstChildCore: Core = {
    id: firstChildId,
    name: "alpha",
    displayName: "",
    variants: [firstChildVariantId],
    defaultVariant: firstChildVariantId,
    sharedModifier: {},
    unsharedKeys: [],
  };
  const secondChildCore: Core = {
    id: secondChildId,
    name: "beta",
    displayName: "",
    variants: [secondChildVariantId],
    defaultVariant: secondChildVariantId,
    sharedModifier: {},
    unsharedKeys: [],
  };
  const rootParamVariant: Variant = {
    id: rootParamVariantId,
    name: "RootParamVariant",
    impl: rootParamImplId,
    nonPresetImpls: [],
    modifier: {},
    isFrozen: false,
  };
  const firstChildVariant: Variant = {
    id: firstChildVariantId,
    name: "FirstChildVariant",
    impl: firstChildImplId,
    nonPresetImpls: [],
    modifier: {},
    isFrozen: false,
  };
  const secondChildVariant: Variant = {
    id: secondChildVariantId,
    name: "SecondChildVariant",
    impl: secondChildImplId,
    nonPresetImpls: [],
    modifier: {},
    isFrozen: false,
  };
  const rootParamImpl = {
    type: CodeObjTypeEnum.NestedParam,
    id: rootParamImplId,
    name: "RootParam",
    description: "",
    isPreset: false,
    children: [firstChildId, secondChildId],
    coreNameType: ParamNameTypeEnum.TEXT,
    coreNameEditable: false,
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    typeAnnotation: "",
  };
  const firstChildImpl = {
    type: CodeObjTypeEnum.CodeParam,
    id: firstChildImplId,
    name: "FirstChildParam",
    description: "",
    isPreset: false,
    coreNameType: ParamNameTypeEnum.TEXT,
    coreNameEditable: true,
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    defaultVal: "",
    value: "",
  };
  const secondChildImpl = {
    type: CodeObjTypeEnum.CodeParam,
    id: secondChildImplId,
    name: "SecondChildParam",
    description: "",
    isPreset: false,
    coreNameType: ParamNameTypeEnum.TEXT,
    coreNameEditable: true,
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    defaultVal: "",
    value: "",
  };

  useProjectState.setState((state) => {
    state.projectConfig = projectConfig;
    state.sections = { [sectionId]: sectionCore };
    state.sectionVariants = { [variantId]: sectionVariant };
    state.sectionImpls = { [implId]: dictImpl };
    state.codeObjs = {
      [rootParamId]: rootParamCore,
      [firstChildId]: firstChildCore,
      [secondChildId]: secondChildCore,
    };
    state.codeObjVariants = {
      [rootParamVariantId]: rootParamVariant,
      [firstChildVariantId]: firstChildVariant,
      [secondChildVariantId]: secondChildVariant,
    };
    state.codeObjImpls = {
      [rootParamImplId]: rootParamImpl,
      [firstChildImplId]: firstChildImpl,
      [secondChildImplId]: secondChildImpl,
    };
    state.parentSectionMap = { [sectionId]: null };
    state.previewSectionVariantMap = {};
  });
  syncStoreInitialState(useProjectState);

  return { firstChildId, sectionId, secondChildId };
}

describe("buildParamDuplicateIndex", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("reuses the cached index when unrelated project state changes", () => {
    const { sectionId } = seedDuplicateIndexState();

    const initialIndex = buildParamDuplicateIndex(
      useProjectState.getState(),
      sectionId,
    );

    useProjectState.setState((state) => {
      state.projectConfig.topLevelSections[sectionId].x = 24;
    });

    const nextIndex = buildParamDuplicateIndex(
      useProjectState.getState(),
      sectionId,
    );

    expect(nextIndex).toBe(initialIndex);
  });

  it("invalidates the cache when a param name changes", () => {
    const { firstChildId, sectionId } = seedDuplicateIndexState();

    const initialIndex = buildParamDuplicateIndex(
      useProjectState.getState(),
      sectionId,
    );

    useProjectState.setState((state) => {
      state.codeObjs[firstChildId].name = "renamed_child";
    });

    const nextIndex = buildParamDuplicateIndex(
      useProjectState.getState(),
      sectionId,
    );

    expect(nextIndex).not.toBe(initialIndex);
    expect(nextIndex.parentById[firstChildId]).toBe("root-param");
    expect(nextIndex.namesByParent["root-param"]).toEqual({
      beta: ["child-b"],
      renamed_child: ["child-a"],
    });
  });
});
