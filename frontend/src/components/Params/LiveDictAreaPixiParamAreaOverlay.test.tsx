import { updateParamChildren } from "forks/dnd-kit/paramDndChildren";
import { ParamDndContext } from "forks/dnd-kit/ParamDndContext";
import {
  getParamDndItemId,
  getTempParamDndId,
  setParamDndState,
} from "forks/dnd-kit/paramDndState";
import { renderToStaticMarkup } from "react-dom/server";
import type { ParamTreeView } from "state/actions/params/paramTree";
import {
  useProjectSearch,
  useProjectState,
  useSettings,
  useTypeErrors,
} from "state/definitions";
import { createProjectSearchLookupKey } from "state/hooks/search";
import { resetProjectStores } from "state/utils";
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
import { buildLiveDictAreaPixiDragRowTargets } from "./liveDictAreaPixiDragRowTargets";
import { LiveDictAreaPixiParamAreaOverlay } from "./LiveDictAreaPixiParamAreaOverlay";
import { LiveDictAreaPixiParamAreaOverlayRows } from "./LiveDictAreaPixiParamAreaOverlayRows";
import { ParamDndProvider } from "./ParamDndContext";

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

function seedOverlayState({
  sectionId,
  pinnedParamIds = [],
  selectedParamIds = [],
  unpinnedParamIds = [],
}: {
  sectionId: string;
  pinnedParamIds?: string[];
  selectedParamIds?: string[];
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
      [...pinnedParamIds, ...unpinnedParamIds].map((paramId) => [
        paramId,
        `${paramId}-variant`,
      ]),
    ),
    hideUnpinnedParams: false,
    paramFilter: "",
    columnWidth: null,
    configLanguage: ConfigLanguageEnum.python,
    pinnedParams: [],
    selectedParams: selectedParamIds,
    ignoreTypeErrors: { callable: false, params: {} },
    edgeInputParams: [],
    edgeOutputPorts: [],
    topLevelParamId: null,
    isJsonSource: false,
    jsonSourceKeys: [],
    jsonSourceMissing: false,
  };

  const codeObjs: Record<string, Core> = {};
  const codeObjVariants: Record<string, Variant> = {};
  const codeObjImpls: Record<string, BaseCodeObjImplUnion> = {};

  for (const paramId of [
    ...new Set([...pinnedParamIds, ...unpinnedParamIds]),
  ]) {
    const paramVariantId = `${paramId}-variant`;
    const paramImplId = `${paramId}-impl`;

    codeObjs[paramId] = {
      id: paramId,
      name: paramId,
      displayName: "",
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

describe("LiveDictAreaPixiParamAreaOverlay", () => {
  beforeEach(() => {
    resetProjectStores();
    useSettings.setState(createSettingsState());
    syncStoreInitialState(useSettings);
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("renders drag-overlay param rows without mounting param inputs", () => {
    const sectionId = "section-live-overlay";
    seedOverlayState({
      sectionId,
      pinnedParamIds: ["pinned-param"],
      unpinnedParamIds: ["unpinned-param"],
    });
    const boundary = buildLiveDictAreaMountBoundary({
      input: {
        bgColor: "bg-transparent",
        canConnect: true,
        edgeInputParams: [],
        getParamDisplayName: (paramId: string) =>
          (
            ({
              "pinned-param": "Pinned Param",
              "unpinned-param": "Unpinned Param",
            }) as Record<string, string>
          )[paramId] ?? paramId,
        handleColumnResizeStart: vi.fn(),
        hideUnpinnedParams: false,
        inputPorts: [],
        isSelectingParams: true,
        outputPorts: [],
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
          configuredMinHeight: 80,
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
      },
    });
    useProjectState.setState((state) => {
      state.codeObjs["pinned-param"].name = "Mutated Store Name";
    });
    const target = buildLiveDictAreaPixiDragRowTargets({
      liveDictAreaMountProps: boundary.liveDictAreaMountProps,
      liveDictAreaSceneBoundary: boundary.liveDictAreaSceneBoundary,
    }).find((rowTarget) => rowTarget.blockId === "pinned");

    expect(target).toBeDefined();

    const markup = renderToStaticMarkup(
      <ParamDndContext>
        <LiveDictAreaPixiParamAreaOverlay
          liveDictAreaMountProps={boundary.liveDictAreaMountProps}
          target={target!}
        />
      </ParamDndContext>,
    );

    expect(markup).toContain(
      'data-live-dict-area-drag-overlay-kind="param-list"',
    );
    expect(markup).toContain('data-param-render-mode="drag-overlay"');
    expect(markup).toContain('data-live-dict-area-drag-overlay-row="true"');
    expect(markup).toContain('data-live-dict-area-scene-row-depth="0"');
    expect(markup).toContain("Pinned Param");
    expect(markup).not.toContain("Mutated Store Name");
    expect(markup).not.toContain(
      "ParamContainer-section-live-overlay-pinned-param",
    );
    expect(markup).not.toContain("-ParamInput");
    expect(markup).not.toContain("CodeMirror-");
  });

  it("renders nested drag-overlay rows from the scene row packets with depth markers", () => {
    const sectionId = "section-live-overlay-nested";
    seedOverlayState({
      sectionId,
      pinnedParamIds: ["pinned-group", "pinned-value"],
      unpinnedParamIds: [],
    });
    useProjectState.setState((state) => {
      state.codeObjImpls["pinned-group-impl"] = {
        type: CodeObjTypeEnum.NestedParam,
        id: "pinned-group-impl",
        name: "pinned-group",
        description: "",
        isPreset: false,
        children: ["pinned-value"],
        coreNameType: ParamNameTypeEnum.TEXT,
        coreNameEditable: true,
        passingStyle: ParameterPassingStyleEnum.DEFAULT,
        typeAnnotation: "",
      };
    });
    const boundary = buildLiveDictAreaMountBoundary({
      input: {
        bgColor: "bg-transparent",
        canConnect: true,
        edgeInputParams: [],
        getParamDisplayName: (paramId: string) =>
          (
            ({
              "pinned-group": "Pinned Group",
              "pinned-value": "Pinned Value",
            }) as Record<string, string>
          )[paramId] ?? paramId,
        handleColumnResizeStart: vi.fn(),
        hideUnpinnedParams: false,
        inputPorts: [],
        isSelectingParams: true,
        outputPorts: [],
        paramFilter: "",
        pinned: {
          requiredParamIdsToPaths: {
            "pinned-value": ["pinned-group", "pinned-value"],
          },
          topLevelParamIds: ["pinned-group"],
        },
        positionAndSizeLocked: false,
        sectionId,
        sectionTypeName: SectionTypeEnum.Dict,
        selectedParamIds: [],
        styleColor: null,
        unpinned: {
          canEditLayout: true,
          configuredMinHeight: null,
          pinnedRequiredParamIdsToPaths: {
            "pinned-value": ["pinned-group", "pinned-value"],
          },
          pinnedTopLevelParamIds: ["pinned-group"],
          positionAndSizeLocked: false,
          requiredParamIdsToPaths: {},
          topLevelParamIds: [],
        },
      },
    });
    const target = buildLiveDictAreaPixiDragRowTargets({
      liveDictAreaMountProps: boundary.liveDictAreaMountProps,
      liveDictAreaSceneBoundary: boundary.liveDictAreaSceneBoundary,
    }).find((rowTarget) => rowTarget.blockId === "pinned");

    expect(target).toBeDefined();

    const markup = renderToStaticMarkup(
      <ParamDndContext>
        <LiveDictAreaPixiParamAreaOverlay
          liveDictAreaMountProps={boundary.liveDictAreaMountProps}
          target={target!}
        />
      </ParamDndContext>,
    );

    expect(markup).toContain(
      'data-live-dict-area-drag-overlay-row-id="pinned-group"',
    );
    expect(markup).toContain(
      'data-live-dict-area-drag-overlay-row-id="pinned-value"',
    );
    expect(markup).toContain('data-live-dict-area-scene-row-depth="0"');
    expect(markup).toContain('data-live-dict-area-scene-row-depth="1"');
    expect(markup).not.toContain("ParamContainer-section-live-overlay-nested");
  });

  it("renders temp drag placeholders through the Pixi overlay row boundary", () => {
    const sectionId = "section-live-overlay-temp-placeholder";
    const rootId = "root-param";
    const activeDndId = getParamDndItemId("pinned-param", "pinned");
    const tempParamId = getTempParamDndId(activeDndId);
    const tree: ParamTreeView = {
      rootId,
      parentById: {
        [rootId]: null,
        [tempParamId]: rootId,
      },
      flat: [],
      visibleChildrenByParent: {
        [rootId]: [tempParamId],
      },
    };

    updateParamChildren({
      [rootId]: [tempParamId],
    });
    setParamDndState({
      activeId: "pinned-param",
      listKey: "pinned",
      placeholderHeight: 28,
      placeholderWidth: 320,
      sectionId,
    });

    const markup = renderToStaticMarkup(
      <ParamDndContext>
        <ParamDndProvider
          enabled={true}
          listKey="pinned"
          sectionId={sectionId}
          tree={tree}
        >
          <LiveDictAreaPixiParamAreaOverlayRows
            hasSectionStyleTheme={false}
            isSelectingParams={true}
            listKey="pinned"
            paramIds={[tempParamId]}
            sceneRows={[]}
            sectionId={sectionId}
            selectedParamIds={[]}
          />
        </ParamDndProvider>
      </ParamDndContext>,
    );

    expect(markup).toContain(
      `data-live-dict-area-drag-overlay-row-id="${tempParamId}"`,
    );
    expect(markup).toContain(
      'data-live-dict-area-scene-row-kind="placeholder"',
    );
    expect(markup).toContain("bg-blue-500/40");
    expect(markup).not.toContain("section-args-nested-key-value");
  });

  it("preserves selected row chrome in the drag overlay", () => {
    const sectionId = "section-live-overlay-state";
    seedOverlayState({
      sectionId,
      pinnedParamIds: ["selected-param", "error-param", "focused-param"],
      selectedParamIds: ["selected-param"],
      unpinnedParamIds: [],
    });
    useProjectSearch.setState({
      focused: {
        sectionId,
        paramInfoId: "focused-param",
        name: "Focused Param",
      },
      lookup: new Set([
        createProjectSearchLookupKey(sectionId, "focused-param"),
      ]),
    });
    useTypeErrors.setState({
      errors: {
        [sectionId]: {
          callable: [],
          params: {
            "error-param": ["Bad type"],
          },
        },
      },
      userRequested: false,
    });
    const boundary = buildLiveDictAreaMountBoundary({
      input: {
        bgColor: "bg-transparent",
        canConnect: true,
        edgeInputParams: [],
        getParamDisplayName: (paramId: string) =>
          (
            ({
              "error-param": "Error Param",
              "focused-param": "Focused Param",
              "selected-param": "Selected Param",
            }) as Record<string, string>
          )[paramId] ?? paramId,
        handleColumnResizeStart: vi.fn(),
        hideUnpinnedParams: false,
        inputPorts: [],
        isSelectingParams: true,
        outputPorts: [],
        paramFilter: "",
        pinned: {
          requiredParamIdsToPaths: {
            "error-param": ["error-param"],
            "focused-param": ["focused-param"],
            "selected-param": ["selected-param"],
          },
          topLevelParamIds: ["selected-param", "error-param", "focused-param"],
        },
        positionAndSizeLocked: false,
        sectionId,
        sectionTypeName: SectionTypeEnum.Dict,
        selectedParamIds: ["selected-param"],
        styleColor: null,
        unpinned: {
          canEditLayout: true,
          configuredMinHeight: null,
          pinnedRequiredParamIdsToPaths: {
            "error-param": ["error-param"],
            "focused-param": ["focused-param"],
            "selected-param": ["selected-param"],
          },
          pinnedTopLevelParamIds: [
            "selected-param",
            "error-param",
            "focused-param",
          ],
          positionAndSizeLocked: false,
          requiredParamIdsToPaths: {},
          topLevelParamIds: [],
        },
      },
    });
    const target = buildLiveDictAreaPixiDragRowTargets({
      liveDictAreaMountProps: boundary.liveDictAreaMountProps,
      liveDictAreaSceneBoundary: boundary.liveDictAreaSceneBoundary,
    }).find((rowTarget) => rowTarget.blockId === "pinned");

    expect(target).toBeDefined();

    const markup = renderToStaticMarkup(
      <ParamDndContext>
        <LiveDictAreaPixiParamAreaOverlay
          liveDictAreaMountProps={boundary.liveDictAreaMountProps}
          target={target!}
        />
      </ParamDndContext>,
    );

    expect(markup).toContain("Selected Param");
    expect(markup).toContain("!bg-blue-700");
    expect(markup).toContain("Error Param");
    expect(markup).toContain("Focused Param");
  });
});
