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
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLiveDictAreaSectionBoundary,
  buildLiveDictAreaSectionBoundaryFromState,
} from "./groupContainerLiveDictAreaSectionBoundary";
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

function seedLiveDictAreaSectionBoundaryState({
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

describe("groupContainerLiveDictAreaSectionBoundary", () => {
  afterEach(() => {
    resetProjectStores();
  });

  it("composes the section state and section input helpers into one higher-level boundary", () => {
    const state = seedLiveDictAreaSectionBoundaryState({
      sectionId: "section-live-dict-area-boundary",
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
    const handleColumnResizeStart = vi.fn();

    const result = buildLiveDictAreaSectionBoundary({
      bgColor: "bg-surface",
      canEditLayout: true,
      canEditStructure: true,
      handleColumnResizeStart,
      isSelectingParams: false,
      sectionId: "section-live-dict-area-boundary",
      sectionTypeName: SectionTypeEnum.Dict,
      state,
      unpinnedParamsAreaMinHeight: 88,
    });

    expect(result.canConnect).toBe(true);
    expect(result.handleColumnResizeStart).toBe(handleColumnResizeStart);
    expect(result.hideUnpinnedParams).toBe(true);
    expect(result.inputPorts).toEqual([
      { id: "edge-direct", label: "edge-direct" },
      { id: "edge-unnamed", label: 'group-parent["edge-unnamed"]' },
    ]);
    expect(result.outputPorts).toEqual([
      { id: "out-1", label: "Result" },
      { id: "out-2", label: "value" },
    ]);
    expect(result.getParamDisplayName("group-parent")).toBe("group-parent");
    expect(result.getParamDisplayName("missing-param")).toBe("missing-param");
    expect(result.pinned).toEqual({
      requiredParamIdsToPaths: {
        "edge-unnamed": ["group-parent", "edge-unnamed"],
        "group-parent": ["group-parent"],
      },
      topLevelParamIds: ["edge-unnamed", "group-parent"],
    });
    expect(result.unpinned).toEqual({
      canEditLayout: true,
      configuredMinHeight: 88,
      pinnedRequiredParamIdsToPaths: {
        "edge-unnamed": ["group-parent", "edge-unnamed"],
        "group-parent": ["group-parent"],
      },
      pinnedTopLevelParamIds: ["edge-unnamed", "group-parent"],
      positionAndSizeLocked: true,
      requiredParamIdsToPaths: {
        "unpinned-param": ["unpinned-param"],
      },
      topLevelParamIds: ["unpinned-param"],
    });
  });

  it("can rebuild the higher-level boundary from a preselected pure section-state payload", () => {
    const sectionId = "section-live-dict-area-boundary-from-state";
    const state = seedLiveDictAreaSectionBoundaryState({
      sectionId,
      edgeInputParamIds: ["edge-direct"],
      pinnedParamIds: ["pinned-param"],
      unpinnedParamIds: ["unpinned-param"],
    });
    const handleColumnResizeStart = vi.fn();

    const result = buildLiveDictAreaSectionBoundaryFromState({
      bgColor: "bg-surface",
      canEditLayout: true,
      canEditStructure: true,
      handleColumnResizeStart,
      isSelectingParams: false,
      sectionId,
      sectionState: buildLiveDictAreaSectionState({ sectionId, state }),
      sectionTypeName: SectionTypeEnum.Dict,
      unpinnedParamsAreaMinHeight: 88,
    });

    const expected = buildLiveDictAreaSectionBoundary({
      bgColor: "bg-surface",
      canEditLayout: true,
      canEditStructure: true,
      handleColumnResizeStart,
      isSelectingParams: false,
      sectionId,
      sectionTypeName: SectionTypeEnum.Dict,
      state,
      unpinnedParamsAreaMinHeight: 88,
    });

    expect(result).toMatchObject({
      canConnect: expected.canConnect,
      edgeInputParams: expected.edgeInputParams,
      hideUnpinnedParams: expected.hideUnpinnedParams,
      inputPorts: expected.inputPorts,
      outputPorts: expected.outputPorts,
      pinned: expected.pinned,
      selectedParamIds: expected.selectedParamIds,
      styleColor: expected.styleColor,
      unpinned: expected.unpinned,
    });
    expect(result.handleColumnResizeStart).toBe(handleColumnResizeStart);
    expect(result.getParamDisplayName("pinned-param")).toBe(
      expected.getParamDisplayName("pinned-param"),
    );
    expect(result.getParamEditorKind("pinned-param")).toBe(
      expected.getParamEditorKind("pinned-param"),
    );
  });
});
