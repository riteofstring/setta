/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useProjectState, useSettings } from "state/definitions";
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
import { buildLiveDictAreaMountBoundary } from "./groupContainerLiveDictAreaMountBoundary";

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

function seedLiveDictAreaSectionState({
  sectionId,
  edgeInputParamIds = [],
  edgeOutputPorts = [],
  pinnedParamIds = [],
  unpinnedParamIds = [],
  displayNamesById = {},
}: {
  sectionId: string;
  edgeInputParamIds?: string[];
  edgeOutputPorts?: Array<{ accessor: string; id: string }>;
  pinnedParamIds?: string[];
  unpinnedParamIds?: string[];
  displayNamesById?: Record<string, string>;
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
}

describe("LiveDictAreaSection", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetProjectStores();
    useSettings.setState(createSettingsState());
    syncStoreInitialState(useSettings);
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserverMock {
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    );
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    vi.unstubAllGlobals();
    resetProjectStores();
  });

  it("composes the live dict-area section state through one higher-level boundary", async () => {
    const { ParamDndContext } = await import("forks/dnd-kit/ParamDndContext");
    const { LiveDictAreaSection } = await import(
      "./groupContainerLiveDictAreaSection"
    );
    const sectionId = "section-live-dict-area-section";
    const handleColumnResizeStart = vi.fn();
    const onMaxNestedDepthChange = vi.fn();
    const displayNamesById = {
      "edge-param": "Edge Display",
      "pinned-param": "Pinned Display",
      "unpinned-param": "Unpinned Display",
    };

    seedLiveDictAreaSectionState({
      sectionId,
      edgeInputParamIds: ["edge-param"],
      edgeOutputPorts: [{ accessor: "Result", id: "out-1" }],
      pinnedParamIds: ["pinned-param"],
      unpinnedParamIds: ["unpinned-param"],
      displayNamesById,
    });

    const expectedInput = {
      bgColor: "bg-transparent",
      canConnect: true,
      edgeInputParams: ["edge-param"],
      getParamDisplayName: (paramId: string) =>
        displayNamesById[paramId] ?? paramId,
      handleColumnResizeStart,
      hideUnpinnedParams: false,
      inputPorts: [{ id: "edge-param", label: "Edge Display" }],
      isSelectingParams: false,
      outputPorts: [{ id: "out-1", label: "Result" }],
      paramFilter: "",
      pinned: {
        requiredParamIdsToPaths: {
          "pinned-param": ["pinned-param"],
        },
        topLevelParamIds: ["pinned-param"],
      },
      positionAndSizeLocked: false,
      sectionId,
      sectionTypeName: SectionTypeEnum.Dict,
      selectedParamIds: [],
      styleColor: null,
      unpinned: {
        canEditLayout: true,
        configuredMinHeight:
          useSettings.getState().sectionSizingPolicy.globals
            .unpinnedParamsAreaMinHeight,
        pinnedRequiredParamIdsToPaths: {
          "pinned-param": ["pinned-param"],
        },
        pinnedTopLevelParamIds: ["pinned-param"],
        positionAndSizeLocked: false,
        requiredParamIdsToPaths: {
          "unpinned-param": ["unpinned-param"],
        },
        topLevelParamIds: ["unpinned-param"],
      },
    };
    const expectedMountBoundary = buildLiveDictAreaMountBoundary({
      input: expectedInput,
    });

    await act(async () => {
      root.render(
        <ParamDndContext>
          <LiveDictAreaSection
            bgColor="bg-transparent"
            handleColumnResizeStart={handleColumnResizeStart}
            onMaxNestedDepthChange={onMaxNestedDepthChange}
            sectionId={sectionId}
            sectionTypeName={SectionTypeEnum.Dict}
          />
        </ParamDndContext>,
      );
    });

    const frameIds = Array.from(
      host.querySelectorAll<HTMLElement>("[data-dict-area-block-frame-id]"),
      (element) => element.dataset.dictAreaBlockFrameId,
    );

    expect(frameIds).toEqual([
      "dict-area-block:edges",
      "dict-area-block:pinned",
      "dict-area-block:unpinned",
    ]);
    expect(host.textContent).toContain("edge-param");
    expect(host.textContent).toContain("unpinned-param");
    expect(host.textContent).toContain("Result");
    expect(onMaxNestedDepthChange).toHaveBeenCalledWith(
      expectedMountBoundary.maxNestedDepth,
    );
  });
});
