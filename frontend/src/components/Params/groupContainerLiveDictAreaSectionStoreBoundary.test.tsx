/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  useProjectState,
  useSettings,
  useToolArgumentPreview,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  CodeObjTypeEnum,
  ConfigLanguageEnum,
  ParamNameTypeEnum,
  ParameterPassingStyleEnum,
  SectionTypeEnum,
  createProjectConfig,
  createSettingsState,
  type BaseCodeObjImplUnion,
  type Core,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildLiveDictAreaSectionBoundary,
  type LiveDictAreaSectionBoundaryInput,
} from "./groupContainerLiveDictAreaSectionBoundary";
import {
  useLiveDictAreaSectionStoreBoundary,
  type LiveDictAreaSectionStoreBoundaryInput,
} from "./groupContainerLiveDictAreaSectionStoreBoundary";

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

function seedLiveDictAreaSectionStoreBoundaryState({
  sectionId,
  displayNamesById = {},
  edgeInputParamIds = [],
  edgeOutputPorts = [],
  paramValues = {},
  pinnedParamIds = [],
  previewParamValues = {},
  unpinnedParamIds = [],
}: {
  sectionId: string;
  displayNamesById?: Record<string, string>;
  edgeInputParamIds?: string[];
  edgeOutputPorts?: Array<{ accessor: string; id: string }>;
  paramValues?: Record<string, string>;
  pinnedParamIds?: string[];
  previewParamValues?: Record<string, string>;
  unpinnedParamIds?: string[];
}) {
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
    positionAndSizeLocked: false,
    isPreset: false,
    codeObjVariantMap: Object.fromEntries(
      [...pinnedParamIds, ...unpinnedParamIds, ...edgeInputParamIds].map(
        (paramId) => [paramId, `${paramId}-variant`],
      ),
    ),
    hideUnpinnedParams: false,
    paramFilter: "",
    columnWidth: null,
    configLanguage: ConfigLanguageEnum.python,
    pinnedParams: [],
    selectedParams: [],
    ignoreTypeErrors: { callable: false, params: {} },
    edgeInputParams: edgeInputParamIds,
    edgeOutputPorts,
    topLevelParamId: null,
    isJsonSource: false,
    jsonSourceKeys: [],
    jsonSourceMissing: false,
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
      displayName: displayNamesById[paramId] ?? "",
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
      value: paramValues[paramId] ?? "",
    };
  }

  const previewParamEntriesById =
    Object.keys(previewParamValues).length === 0
      ? null
      : Object.fromEntries(
          Object.entries(previewParamValues).map(([paramId, value]) => [
            paramId,
            { toolCallId: "tool-call-1", value },
          ]),
        );

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
            pinnedParamIds.map((paramId) => [paramId, [paramId]]),
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

  useToolArgumentPreview.setState((state) => {
    state.byProjectConfigId =
      previewParamEntriesById === null
        ? {}
        : {
            [projectConfig.id]: {
              previewCallableNameBySectionId: {},
              previewCodeBySectionId: {},
              previewParamValueBySectionAndParamId: {
                [sectionId]: previewParamEntriesById,
              },
            },
          };
  });
  syncStoreInitialState(useToolArgumentPreview);
}

function StoreBoundaryHarness({
  onBoundaryChange,
  ...input
}: LiveDictAreaSectionStoreBoundaryInput & {
  onBoundaryChange: ReturnType<typeof vi.fn>;
}) {
  const boundary = useLiveDictAreaSectionStoreBoundary(input);
  onBoundaryChange(boundary);
  return null;
}

describe("useLiveDictAreaSectionStoreBoundary", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetProjectStores();
    useSettings.setState(createSettingsState());
    syncStoreInitialState(useSettings);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    resetProjectStores();
  });

  it("lifts the remaining store-backed section selector above the pure section boundary", async () => {
    const sectionId = "section-live-dict-area-section-store-boundary";
    const handleColumnResizeStart = vi.fn();
    const onBoundaryChange = vi.fn();
    const displayNamesById = {
      "edge-param": "Edge Display",
      "pinned-param": "Pinned Display",
      "unpinned-param": "Unpinned Display",
    };

    seedLiveDictAreaSectionStoreBoundaryState({
      sectionId,
      edgeInputParamIds: ["edge-param"],
      edgeOutputPorts: [{ accessor: "Result", id: "out-1" }],
      pinnedParamIds: ["pinned-param"],
      unpinnedParamIds: ["unpinned-param"],
      displayNamesById,
    });

    await act(async () => {
      root.render(
        <StoreBoundaryHarness
          bgColor="bg-transparent"
          handleColumnResizeStart={handleColumnResizeStart}
          onBoundaryChange={onBoundaryChange}
          sectionId={sectionId}
          sectionTypeName={SectionTypeEnum.Dict}
        />,
      );
    });

    const boundary = onBoundaryChange.mock.lastCall?.[0];
    const expectedBoundaryInput: LiveDictAreaSectionBoundaryInput = {
      bgColor: "bg-transparent",
      canEditLayout: true,
      canEditStructure: true,
      handleColumnResizeStart,
      isSelectingParams: false,
      sectionId,
      sectionTypeName: SectionTypeEnum.Dict,
      state: useProjectState.getState(),
      unpinnedParamsAreaMinHeight:
        useSettings.getState().sectionSizingPolicy.globals
          .unpinnedParamsAreaMinHeight,
    };
    const expectedBoundary = buildLiveDictAreaSectionBoundary(
      expectedBoundaryInput,
    );

    expect(boundary).toMatchObject({
      canConnect: true,
      edgeInputParams: expectedBoundary.edgeInputParams,
      hideUnpinnedParams: expectedBoundary.hideUnpinnedParams,
      inputPorts: expectedBoundary.inputPorts,
      isSelectingParams: expectedBoundary.isSelectingParams,
      outputPorts: expectedBoundary.outputPorts,
      paramFilter: expectedBoundary.paramFilter,
      pinned: expectedBoundary.pinned,
      positionAndSizeLocked: expectedBoundary.positionAndSizeLocked,
      sectionId,
      sectionTypeName: SectionTypeEnum.Dict,
      selectedParamIds: expectedBoundary.selectedParamIds,
      styleColor: expectedBoundary.styleColor,
      unpinned: expectedBoundary.unpinned,
    });
    expect(boundary.handleColumnResizeStart).toBe(handleColumnResizeStart);
    expect(boundary.getParamDisplayName("pinned-param")).toBe(
      expectedBoundary.getParamDisplayName("pinned-param"),
    );
    expect(boundary.getParamDisplayName("missing-param")).toBe("missing-param");
  });

  it("stays stable across unrelated project-state updates once the function-bearing boundary is memoized outside the selector", async () => {
    const sectionId = "section-live-dict-area-section-store-stability";
    const handleColumnResizeStart = vi.fn();
    const onBoundaryChange = vi.fn();

    seedLiveDictAreaSectionStoreBoundaryState({
      sectionId,
      pinnedParamIds: ["pinned-param"],
      unpinnedParamIds: ["unpinned-param"],
    });

    await act(async () => {
      root.render(
        <StoreBoundaryHarness
          bgColor="bg-transparent"
          handleColumnResizeStart={handleColumnResizeStart}
          onBoundaryChange={onBoundaryChange}
          sectionId={sectionId}
          sectionTypeName={SectionTypeEnum.Dict}
        />,
      );
    });

    expect(onBoundaryChange).toHaveBeenCalledTimes(1);

    await act(async () => {
      useProjectState.setState((state) => {
        state.previewSectionVariantMap = {
          ...state.previewSectionVariantMap,
          unrelated: "next-variant",
        };
      });
    });

    expect(onBoundaryChange).toHaveBeenCalledTimes(1);
  });

  it("recomputes the boundary when tool preview values change", async () => {
    const sectionId = "section-live-dict-area-section-store-preview";
    const handleColumnResizeStart = vi.fn();
    const onBoundaryChange = vi.fn();
    const projectConfigId = `project-${sectionId}`;

    seedLiveDictAreaSectionStoreBoundaryState({
      sectionId,
      paramValues: {
        "preview-param": "base value",
      },
      previewParamValues: {
        "preview-param": "preview value",
      },
      unpinnedParamIds: ["preview-param"],
    });

    await act(async () => {
      root.render(
        <StoreBoundaryHarness
          bgColor="bg-transparent"
          handleColumnResizeStart={handleColumnResizeStart}
          onBoundaryChange={onBoundaryChange}
          sectionId={sectionId}
          sectionTypeName={SectionTypeEnum.Dict}
        />,
      );
    });

    const boundary = onBoundaryChange.mock.lastCall?.[0];
    expect(boundary.getParamValuePreview("preview-param")).toBe(
      "preview value",
    );

    await act(async () => {
      useToolArgumentPreview.setState((state) => {
        const previewProjectState = state.byProjectConfigId[projectConfigId];
        if (!previewProjectState) {
          throw new Error("Expected preview project state");
        }

        previewProjectState.previewParamValueBySectionAndParamId[sectionId] = {
          "preview-param": {
            toolCallId: "tool-call-2",
            value: "updated preview value",
          },
        };
      });
    });

    const updatedBoundary = onBoundaryChange.mock.lastCall?.[0];
    expect(updatedBoundary.getParamValuePreview("preview-param")).toBe(
      "updated preview value",
    );
    expect(onBoundaryChange).toHaveBeenCalledTimes(2);
  });
});
