import { useProjectState, type ZustandProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  CodeObjTypeEnum,
  ConfigLanguageEnum,
  ParamNameTypeEnum,
  ParameterPassingStyleEnum,
  SectionTypeEnum,
  createProjectConfig,
  type BaseCodeObjImplUnion,
  type Core,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, describe, expect, it } from "vitest";
import { buildLiveDictAreaSectionState } from "./groupContainerLiveDictAreaSectionState";

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}) {
  if (!store.getInitialState) {
    return;
  }

  Object.assign(store.getInitialState(), store.getState());
}

function seedLiveDictAreaSectionState({
  sectionId,
  edgeInputParamIds = [],
  edgeOutputPorts = [],
  hiddenUnpinned = false,
  paramFilter = "",
  pinnedParamIds = [],
  positionAndSizeLocked = false,
  selectedParamIds = [],
  styleColor = null,
  unpinnedParamIds = [],
}: {
  sectionId: string;
  edgeInputParamIds?: string[];
  edgeOutputPorts?: Array<{ accessor: string; id: string }>;
  hiddenUnpinned?: boolean;
  paramFilter?: string;
  pinnedParamIds?: string[];
  positionAndSizeLocked?: boolean;
  selectedParamIds?: string[];
  styleColor?: string | null;
  unpinnedParamIds?: string[];
}): ZustandProjectState {
  const variantId = `${sectionId}-variant`;
  const implId = `${sectionId}-impl`;
  const projectConfig = createProjectConfig({
    id: `project-${sectionId}`,
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
    positionAndSizeLocked,
    isPreset: false,
    codeObjVariantMap: Object.fromEntries(
      [...pinnedParamIds, ...unpinnedParamIds, ...edgeInputParamIds].map(
        (paramId) => [paramId, `${paramId}-variant`],
      ),
    ),
    hideUnpinnedParams: hiddenUnpinned,
    paramFilter,
    columnWidth: null,
    configLanguage: ConfigLanguageEnum.python,
    pinnedParams: [],
    selectedParams: selectedParamIds,
    ignoreTypeErrors: { callable: false, params: {} },
    edgeInputParams: edgeInputParamIds,
    edgeOutputPorts,
    topLevelParamId: null,
    isJsonSource: false,
    jsonSourceKeys: [],
    jsonSourceMissing: false,
    styleColor,
  };

  const codeObjs: Record<string, Core> = {};
  const codeObjVariants: Record<string, Variant> = {};
  const codeObjImpls: Record<string, BaseCodeObjImplUnion> = {};

  for (const paramId of [
    ...new Set([...pinnedParamIds, ...unpinnedParamIds, ...edgeInputParamIds]),
  ]) {
    const paramVariantId = `${paramId}-variant`;
    const paramImplId = `${paramId}-impl`;

    codeObjs[paramId] = {
      id: paramId,
      name: paramId,
      displayName:
        paramId === "edge-unnamed"
          ? ""
          : paramId === "edge-direct"
            ? "Direct Edge Display"
            : `${paramId}-display`,
      variants: [paramVariantId],
      defaultVariant: paramVariantId,
      sharedModifier: {},
      unsharedKeys: [],
    };
    codeObjVariants[paramVariantId] = {
      id: paramVariantId,
      name: `${paramId}-variant-name`,
      impl: paramImplId,
      nonPresetImpls: [],
      modifier: {},
      isFrozen: false,
    };
    codeObjImpls[paramImplId] = {
      type: CodeObjTypeEnum.CodeParam,
      id: paramImplId,
      name: paramId,
      description: "",
      isPreset: false,
      coreNameType: ParamNameTypeEnum.TEXT,
      coreNameEditable: true,
      passingStyle: ParameterPassingStyleEnum.DEFAULT,
      defaultVal: "",
      value: "",
    };
  }

  useProjectState.setState((state) => {
    state.projectConfig = projectConfig;
    state.sections = { [sectionId]: sectionCore };
    state.sectionVariants = { [variantId]: sectionVariant };
    state.sectionImpls = { [implId]: dictImpl };
    state.codeObjs = codeObjs;
    state.codeObjVariants = codeObjVariants;
    state.codeObjImpls = codeObjImpls;
    state.parentSectionMap = { [sectionId]: null };
    state.previewSectionVariantMap = {};
    state.shownParamIds = {
      [variantId]: {
        pinned: {
          requiredParamIdsToPaths: Object.fromEntries(
            pinnedParamIds.map((paramId) => [
              paramId,
              paramId === "edge-unnamed"
                ? ["group-parent", "edge-unnamed"]
                : [paramId],
            ]),
          ),
          topLevelParamIds: pinnedParamIds,
        },
        unpinned: {
          requiredParamIdsToPaths: Object.fromEntries(
            unpinnedParamIds.map((paramId) => [paramId, [paramId]]),
          ),
          topLevelParamIds: unpinnedParamIds,
        },
      },
    };
  });
  syncStoreInitialState(useProjectState);

  return useProjectState.getState();
}

describe("groupContainerLiveDictAreaSectionState", () => {
  afterEach(() => {
    resetProjectStores();
  });

  it("builds the store-backed section state with existing label fallbacks and display-name coverage", () => {
    const state = seedLiveDictAreaSectionState({
      sectionId: "section-live-dict-area-state",
      edgeInputParamIds: ["edge-direct", "edge-unnamed"],
      edgeOutputPorts: [
        { accessor: "Result", id: "out-1" },
        { accessor: "   ", id: "out-2" },
      ],
      hiddenUnpinned: true,
      paramFilter: "edge",
      pinnedParamIds: ["edge-unnamed", "group-parent"],
      positionAndSizeLocked: true,
      selectedParamIds: ["edge-direct"],
      styleColor: "cyan",
      unpinnedParamIds: ["unpinned-param"],
    });

    const result = buildLiveDictAreaSectionState({
      sectionId: "section-live-dict-area-state",
      state,
    });

    expect(result).toEqual({
      displayNamesById: {
        "edge-unnamed": "edge-unnamed",
        "group-parent": "group-parent",
        "unpinned-param": "unpinned-param",
      },
      editorKindsById: {
        "edge-unnamed": "codemirror",
        "group-parent": "codemirror",
        "unpinned-param": "codemirror",
      },
      edgeInputParams: ["edge-direct", "edge-unnamed"],
      edgeInputPorts: [
        { id: "edge-direct", label: "edge-direct" },
        { id: "edge-unnamed", label: 'group-parent["edge-unnamed"]' },
      ],
      edgeOutputPorts: [
        { id: "out-1", label: "Result" },
        { id: "out-2", label: "value" },
      ],
      hideUnpinnedParams: true,
      paramFilter: "edge",
      pinnedRequiredParamIdsToPaths: {
        "edge-unnamed": ["group-parent", "edge-unnamed"],
        "group-parent": ["group-parent"],
      },
      pinnedTopLevelParamIds: ["edge-unnamed", "group-parent"],
      positionAndSizeLocked: true,
      selectedParamIds: ["edge-direct"],
      styleColor: "cyan",
      unpinnedRequiredParamIdsToPaths: {
        "unpinned-param": ["unpinned-param"],
      },
      unpinnedTopLevelParamIds: ["unpinned-param"],
    });
  });

  it("normalizes nullish optional section fields to the existing defaults", () => {
    const state = seedLiveDictAreaSectionState({
      sectionId: "section-live-dict-area-state-defaults",
      edgeOutputPorts: [],
      pinnedParamIds: [],
      selectedParamIds: [],
      styleColor: null,
      unpinnedParamIds: [],
    });

    useProjectState.setState((projectState) => {
      const variantId =
        projectState.projectConfig.sectionVariantMap[
          "section-live-dict-area-state-defaults"
        ];
      const implId = projectState.sectionVariants[variantId].impl;
      const dictImpl = projectState.sectionImpls[implId];

      if (dictImpl.type !== SectionTypeEnum.Dict) {
        throw new Error("Expected dict section impl");
      }

      dictImpl.selectedParams = null;
      dictImpl.styleColor = undefined;
    });

    const result = buildLiveDictAreaSectionState({
      sectionId: "section-live-dict-area-state-defaults",
      state: useProjectState.getState(),
    });

    expect(result.selectedParamIds).toEqual([]);
    expect(result.styleColor).toBeNull();
  });
});
