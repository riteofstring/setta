import { renderToStaticMarkup } from "react-dom/server";
import {
  getResizeStartAutoSizeUpdate,
  setSectionSize,
} from "state/actions/sections/sectionSizes";
import {
  useProjectState,
  useResizeEvent,
  useSettings,
  useTemporaryMiscState,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  getEdgesStripHeightKey,
  getKwargsControlsHeightKey,
  getPinnedParamsAreaHeightKey,
  getUnpinnedParamsAreaHeightKey,
} from "utils/constants";
import {
  CodeObjTypeEnum,
  ConfigLanguageEnum,
  SectionTypeEnum,
  createProjectConfig,
  type Core,
  type SectionSizingPolicy,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSectionMinMaxDims } from "./sectionSizes";

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

function baseEntry(
  overrides: Partial<SectionSizingPolicy["byType"]["Dict"]> = {},
) {
  return {
    minHeight: 100,
    maxHeight: 1000,
    minWidth: 200,
    maxWidth: 2000,
    ...overrides,
  };
}

function buildSizingPolicy(): SectionSizingPolicy {
  return {
    byType: {
      Callable: {
        minHeight: 120,
        maxHeight: 1000,
        minWidth: 200,
        maxWidth: 2000,
        hideSearchMinHeight: 80,
        hideParamsMinHeight: 40,
      },
      Dict: baseEntry(),
      ListRoot: baseEntry(),
      Group: baseEntry(),
      Image: baseEntry(),
      Chart: baseEntry({ minHeight: 300, minWidth: 300 }),
      Draw: baseEntry(),
      TextBlock: baseEntry({ minHeight: 49, minWidth: 100 }),
      MetaControl: baseEntry({ minHeight: 10, minWidth: 100 }),
      Social: baseEntry(),
      GlobalVariables: baseEntry(),
      Code: baseEntry(),
      GenPythonCode: baseEntry(),
      GenPythonMetadata: baseEntry(),
      Terminal: baseEntry(),
      IFrame: baseEntry(),
      Chat: baseEntry(),
      Browser: baseEntry(),
    },
    metaControlByType: {
      CodeCallable: {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: "any",
        sizeModeWidth: "any",
      },
      CodeParam: {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: "any",
        sizeModeWidth: "any",
      },
      TextParam: {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: "any",
        sizeModeWidth: "any",
      },
      ButtonParam: {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: "any",
        sizeModeWidth: "any",
      },
      SliderParam: {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: "auto_only",
        sizeModeWidth: "any",
      },
      RotaryParam: {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: "any",
        sizeModeWidth: "any",
      },
      SwitchParam: {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: "any",
        sizeModeWidth: "any",
      },
      ColorPickerParam: {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: "any",
        sizeModeWidth: "any",
      },
      DropdownParam: {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: "auto_only",
        sizeModeWidth: "any",
      },
      PasswordParam: {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: "auto_only",
        sizeModeWidth: "any",
      },
      TextAreaParam: {
        minHeight: 80,
        minWidth: 200,
        sizeModeHeight: "any",
        sizeModeWidth: "any",
      },
      DropzoneParam: {
        minHeight: 120,
        minWidth: 240,
        sizeModeHeight: "auto_only",
        sizeModeWidth: "any",
      },
      NestedParam: {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: "any",
        sizeModeWidth: "any",
      },
    },
    globals: {
      pinnedParamsAreaMinHeight: 64,
      unpinnedParamsAreaMinHeight: 38,
      minimizedHeight: 32,
      infiniteMaxHeight: 100000,
      infiniteMaxWidth: 100000,
      autoMaxHeight: 350,
    },
  };
}

function buildCore(id: string, variantId: string): Core {
  return {
    id,
    name: "Section",
    displayName: "",
    variants: [variantId],
    defaultVariant: variantId,
    sharedModifier: {},
    unsharedKeys: [],
  };
}

function buildVariant(id: string, implId: string): Variant {
  return {
    id,
    name: "Variant",
    impl: implId,
    nonPresetImpls: [],
    modifier: {},
    isFrozen: false,
  };
}

function decodeMarkupPayload(markup: string) {
  return markup
    .replace("<pre>", "")
    .replace("</pre>", "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'");
}

function renderDims(sectionId: string) {
  const markup = renderToStaticMarkup(<Probe sectionId={sectionId} />);
  const payload = decodeMarkupPayload(markup);
  return JSON.parse(payload) as ReturnType<typeof useSectionMinMaxDims>;
}

function Probe({ sectionId }: { sectionId: string }) {
  const dims = useSectionMinMaxDims(sectionId);
  return <pre>{JSON.stringify(dims)}</pre>;
}

describe("useSectionMinMaxDims integration", () => {
  beforeEach(() => {
    resetProjectStores();
    useSettings.setState({ sectionSizingPolicy: buildSizingPolicy() });
    syncStoreInitialState(useSettings);
    syncStoreInitialState(useResizeEvent);
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("accounts for pinned/unpinned/edges/kwargs heights on callables", () => {
    const sectionId = "section-callable";
    const variantId = "variant-callable";
    const implId = "impl-callable";

    const projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: variantId },
      topLevelSections: {
        [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
      },
    });

    const callableImpl = {
      type: SectionTypeEnum.Callable,
      id: implId,
      name: "Callable",
      isFrozen: false,
      isInOtherProjectConfigs: false,
      size: { width: 400, height: 200 },
      aspectRatio: false,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: false,
      positionAndSizeLocked: false,
      isPreset: false,
      codeObjVariantMap: {},
      hideUnpinnedParams: false,
      paramFilter: "",
      columnWidth: null,
      configLanguage: ConfigLanguageEnum.python,
      pinnedParams: [],
      selectedParams: [],
      ignoreTypeErrors: { callable: false, params: {} },
      edgeInputParams: ["edge-param"],
      edgeOutputPorts: [],
      callable: null,
      hideParams: false,
    };

    useProjectState.setState((state) => {
      state.projectConfig = projectConfig;
      state.sections = { [sectionId]: buildCore(sectionId, variantId) };
      state.sectionVariants = { [variantId]: buildVariant(variantId, implId) };
      state.sectionImpls = { [implId]: callableImpl };
      state.previewSectionVariantMap = {};
      state.parentSectionMap = { [sectionId]: null };
      state.shownParamIds = {
        [variantId]: {
          pinned: { requiredParamIdsToPaths: {}, topLevelParamIds: ["pin-1"] },
          unpinned: {
            requiredParamIdsToPaths: {},
            topLevelParamIds: ["unpinned-1"],
          },
        },
      };
    });

    useTemporaryMiscState.setState({
      [getEdgesStripHeightKey(sectionId)]: 80,
      [getKwargsControlsHeightKey(sectionId)]: 22,
    });

    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useTemporaryMiscState);

    const dims = renderDims(sectionId);
    expect(dims.minHeight).toBe(244);
  });

  it("uses policy mins for TextBlock sections", () => {
    const sectionId = "section-text-min";
    const variantId = "variant-text-min";
    const implId = "impl-text-min";

    const projectConfig = createProjectConfig({
      id: "project-text-min",
      sectionVariantMap: { [sectionId]: variantId },
      topLevelSections: {
        [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
      },
    });

    const textImpl = {
      type: SectionTypeEnum.TextBlock,
      id: implId,
      name: "Text",
      isFrozen: false,
      isInOtherProjectConfigs: false,
      size: { width: 200, height: 200 },
      aspectRatio: false,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: false,
      positionAndSizeLocked: false,
      isPreset: false,
      format: "Plaintext",
      headingAsSectionName: false,
      metaControlStyle: false,
      textDisplayMode: "Render",
      text: "",
    };

    useProjectState.setState((state) => {
      state.projectConfig = projectConfig;
      state.sections = { [sectionId]: buildCore(sectionId, variantId) };
      state.sectionVariants = { [variantId]: buildVariant(variantId, implId) };
      state.sectionImpls = { [implId]: textImpl };
      state.previewSectionVariantMap = {};
      state.parentSectionMap = { [sectionId]: null };
      state.shownParamIds = {};
    });

    syncStoreInitialState(useProjectState);

    const dims = renderDims(sectionId);
    const policy = useSettings.getState().sectionSizingPolicy;
    expect(dims.minHeight).toBe(policy.byType.TextBlock.minHeight);
    expect(dims.minWidth).toBe(policy.byType.TextBlock.minWidth);
  });

  it("uses policy mins for MetaControl sections without a control param", () => {
    const sectionId = "section-meta-min";
    const variantId = "variant-meta-min";
    const implId = "impl-meta-min";

    const projectConfig = createProjectConfig({
      id: "project-meta-min",
      sectionVariantMap: { [sectionId]: variantId },
      topLevelSections: {
        [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
      },
    });

    const metaImpl = {
      type: SectionTypeEnum.MetaControl,
      id: implId,
      name: "Meta",
      isFrozen: false,
      isInOtherProjectConfigs: false,
      size: { width: 200, height: 100 },
      aspectRatio: false,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: false,
      positionAndSizeLocked: false,
      isPreset: false,
      metaControlParamId: null,
      codeObjVariantMap: {},
      showSectionTitle: false,
    };

    useProjectState.setState((state) => {
      state.projectConfig = projectConfig;
      state.sections = { [sectionId]: buildCore(sectionId, variantId) };
      state.sectionVariants = { [variantId]: buildVariant(variantId, implId) };
      state.sectionImpls = { [implId]: metaImpl };
      state.previewSectionVariantMap = {};
      state.parentSectionMap = { [sectionId]: null };
      state.shownParamIds = {};
    });

    syncStoreInitialState(useProjectState);

    const dims = renderDims(sectionId);
    const policy = useSettings.getState().sectionSizingPolicy;
    expect(dims.minHeight).toBe(policy.byType.MetaControl.minHeight);
    expect(dims.minWidth).toBe(policy.byType.MetaControl.minWidth);
  });

  it("includes edges and kwargs when shown params are missing", () => {
    const sectionId = "section-no-shown";
    const variantId = "variant-no-shown";
    const implId = "impl-no-shown";

    const projectConfig = createProjectConfig({
      id: "project-no-shown",
      sectionVariantMap: { [sectionId]: variantId },
      topLevelSections: {
        [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
      },
    });

    const callableImpl = {
      type: SectionTypeEnum.Callable,
      id: implId,
      name: "Callable",
      isFrozen: false,
      isInOtherProjectConfigs: false,
      size: { width: 400, height: 200 },
      aspectRatio: false,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: false,
      positionAndSizeLocked: false,
      isPreset: false,
      codeObjVariantMap: {},
      hideUnpinnedParams: false,
      paramFilter: "",
      columnWidth: null,
      configLanguage: ConfigLanguageEnum.python,
      pinnedParams: [],
      selectedParams: [],
      ignoreTypeErrors: { callable: false, params: {} },
      edgeInputParams: ["edge-param"],
      edgeOutputPorts: [],
      callable: null,
      hideParams: false,
    };

    useProjectState.setState((state) => {
      state.projectConfig = projectConfig;
      state.sections = { [sectionId]: buildCore(sectionId, variantId) };
      state.sectionVariants = { [variantId]: buildVariant(variantId, implId) };
      state.sectionImpls = { [implId]: callableImpl };
      state.previewSectionVariantMap = {};
      state.parentSectionMap = { [sectionId]: null };
      state.shownParamIds = {};
    });

    useTemporaryMiscState.setState({
      [getEdgesStripHeightKey(sectionId)]: 90,
      [getKwargsControlsHeightKey(sectionId)]: 18,
    });

    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useTemporaryMiscState);

    const dims = renderDims(sectionId);
    expect(dims.minHeight).toBe(148);
  });

  it("prefers measured pinned/unpinned heights over policy defaults", () => {
    const sectionId = "section-measured";
    const variantId = "variant-measured";
    const implId = "impl-measured";

    const projectConfig = createProjectConfig({
      id: "project-measured",
      sectionVariantMap: { [sectionId]: variantId },
      topLevelSections: {
        [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
      },
    });

    const callableImpl = {
      type: SectionTypeEnum.Callable,
      id: implId,
      name: "Callable",
      isFrozen: false,
      isInOtherProjectConfigs: false,
      size: { width: 400, height: 200 },
      aspectRatio: false,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: false,
      positionAndSizeLocked: false,
      isPreset: false,
      codeObjVariantMap: {},
      hideUnpinnedParams: false,
      paramFilter: "",
      columnWidth: null,
      configLanguage: ConfigLanguageEnum.python,
      pinnedParams: [],
      selectedParams: [],
      ignoreTypeErrors: { callable: false, params: {} },
      edgeInputParams: [],
      edgeOutputPorts: [],
      callable: null,
      hideParams: false,
    };

    useProjectState.setState((state) => {
      state.projectConfig = projectConfig;
      state.sections = { [sectionId]: buildCore(sectionId, variantId) };
      state.sectionVariants = { [variantId]: buildVariant(variantId, implId) };
      state.sectionImpls = { [implId]: callableImpl };
      state.previewSectionVariantMap = {};
      state.parentSectionMap = { [sectionId]: null };
      state.shownParamIds = {
        [variantId]: {
          pinned: { requiredParamIdsToPaths: {}, topLevelParamIds: ["pin-1"] },
          unpinned: {
            requiredParamIdsToPaths: {},
            topLevelParamIds: ["unpinned-1"],
          },
        },
      };
    });

    useTemporaryMiscState.setState({
      [getPinnedParamsAreaHeightKey(sectionId)]: 100,
      [getUnpinnedParamsAreaHeightKey(sectionId)]: 20,
    });

    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useTemporaryMiscState);

    const dims = renderDims(sectionId);
    expect(dims.minHeight).toBe(178);
  });

  it("keeps auto max height at least min height after params expand", () => {
    const sectionId = "section-auto-params";
    const variantId = "variant-auto-params";
    const implId = "impl-auto-params";

    const projectConfig = createProjectConfig({
      id: "project-auto-params",
      sectionVariantMap: { [sectionId]: variantId },
      topLevelSections: {
        [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
      },
    });

    const callableImpl = {
      type: SectionTypeEnum.Callable,
      id: implId,
      name: "Callable",
      isFrozen: false,
      isInOtherProjectConfigs: false,
      size: { width: 400, height: "auto" },
      aspectRatio: false,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: false,
      positionAndSizeLocked: false,
      isPreset: false,
      codeObjVariantMap: {},
      hideUnpinnedParams: false,
      paramFilter: "",
      columnWidth: null,
      configLanguage: ConfigLanguageEnum.python,
      pinnedParams: [],
      selectedParams: [],
      ignoreTypeErrors: { callable: false, params: {} },
      edgeInputParams: [],
      edgeOutputPorts: [],
      callable: null,
      hideParams: false,
    };

    const policy = buildSizingPolicy();
    policy.globals.autoMaxHeight = 200;
    useSettings.setState({ sectionSizingPolicy: policy });

    useProjectState.setState((state) => {
      state.projectConfig = projectConfig;
      state.sections = { [sectionId]: buildCore(sectionId, variantId) };
      state.sectionVariants = { [variantId]: buildVariant(variantId, implId) };
      state.sectionImpls = { [implId]: callableImpl };
      state.previewSectionVariantMap = {};
      state.parentSectionMap = { [sectionId]: null };
      state.shownParamIds = {
        [variantId]: {
          pinned: { requiredParamIdsToPaths: {}, topLevelParamIds: ["pin-1"] },
          unpinned: {
            requiredParamIdsToPaths: {},
            topLevelParamIds: ["unpinned-1"],
          },
        },
      };
    });

    useTemporaryMiscState.setState({
      [getPinnedParamsAreaHeightKey(sectionId)]: 140,
      [getUnpinnedParamsAreaHeightKey(sectionId)]: 140,
    });

    syncStoreInitialState(useSettings);
    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useTemporaryMiscState);

    const dims = renderDims(sectionId);
    expect(dims.minHeight).toBe(320);
    expect(dims.maxHeight).toBe(320);
  });

  it("caps auto max height when height is auto", () => {
    const sectionId = "section-text";
    const variantId = "variant-text";
    const implId = "impl-text";

    const projectConfig = createProjectConfig({
      id: "project-2",
      sectionVariantMap: { [sectionId]: variantId },
      topLevelSections: {
        [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
      },
    });

    const textImpl = {
      type: SectionTypeEnum.TextBlock,
      id: implId,
      name: "Text",
      isFrozen: false,
      isInOtherProjectConfigs: false,
      size: { width: 500, height: "auto" },
      aspectRatio: false,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: false,
      positionAndSizeLocked: false,
      isPreset: false,
      format: "Plaintext",
      headingAsSectionName: false,
      metaControlStyle: false,
      textDisplayMode: "Render",
      text: "",
    };

    useProjectState.setState((state) => {
      state.projectConfig = projectConfig;
      state.sections = { [sectionId]: buildCore(sectionId, variantId) };
      state.sectionVariants = { [variantId]: buildVariant(variantId, implId) };
      state.sectionImpls = { [implId]: textImpl };
      state.previewSectionVariantMap = {};
      state.parentSectionMap = { [sectionId]: null };
      state.shownParamIds = {};
    });

    syncStoreInitialState(useProjectState);

    const dims = renderDims(sectionId);
    expect(dims.maxHeight).toBe(350);
  });

  it("removes auto max height after resize start update", () => {
    const sectionId = "section-auto";
    const variantId = "variant-auto";
    const implId = "impl-auto";

    const projectConfig = createProjectConfig({
      id: "project-auto",
      sectionVariantMap: { [sectionId]: variantId },
      topLevelSections: {
        [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
      },
    });

    const callableImpl = {
      type: SectionTypeEnum.Callable,
      id: implId,
      name: "Callable",
      isFrozen: false,
      isInOtherProjectConfigs: false,
      size: { width: 400, height: "auto" },
      aspectRatio: false,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: false,
      positionAndSizeLocked: false,
      isPreset: false,
      codeObjVariantMap: {},
      hideUnpinnedParams: false,
      paramFilter: "",
      columnWidth: null,
      configLanguage: ConfigLanguageEnum.python,
      pinnedParams: [],
      selectedParams: [],
      ignoreTypeErrors: { callable: false, params: {} },
      edgeInputParams: [],
      edgeOutputPorts: [],
      callable: null,
      hideParams: false,
    };

    useProjectState.setState((state) => {
      state.projectConfig = projectConfig;
      state.sections = { [sectionId]: buildCore(sectionId, variantId) };
      state.sectionVariants = { [variantId]: buildVariant(variantId, implId) };
      state.sectionImpls = { [implId]: callableImpl };
      state.previewSectionVariantMap = {};
      state.parentSectionMap = { [sectionId]: null };
      state.shownParamIds = {
        [variantId]: {
          pinned: { requiredParamIdsToPaths: {}, topLevelParamIds: [] },
          unpinned: { requiredParamIdsToPaths: {}, topLevelParamIds: [] },
        },
      };
    });

    syncStoreInitialState(useProjectState);

    const autoDims = renderDims(sectionId);
    expect(autoDims.maxHeight).toBe(350);

    const nextSize = getResizeStartAutoSizeUpdate({
      size: callableImpl.size,
      direction: "bottom",
      rect: { width: 400, height: 720 },
    });
    expect(nextSize).not.toBeNull();

    useProjectState.setState((state) => {
      if (!nextSize) {
        return;
      }
      setSectionSize(sectionId, nextSize, state);
    });

    syncStoreInitialState(useProjectState);

    const manualDims = renderDims(sectionId);
    expect(manualDims.maxHeight).toBe(1000);
  });

  it("ignores auto max height while resizing", () => {
    const sectionId = "section-resize";
    const variantId = "variant-resize";
    const implId = "impl-resize";

    const projectConfig = createProjectConfig({
      id: "project-resize",
      sectionVariantMap: { [sectionId]: variantId },
      topLevelSections: {
        [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
      },
    });

    const callableImpl = {
      type: SectionTypeEnum.Callable,
      id: implId,
      name: "Callable",
      isFrozen: false,
      isInOtherProjectConfigs: false,
      size: { width: 400, height: "auto" },
      aspectRatio: false,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: false,
      positionAndSizeLocked: false,
      isPreset: false,
      codeObjVariantMap: {},
      hideUnpinnedParams: false,
      paramFilter: "",
      columnWidth: null,
      configLanguage: ConfigLanguageEnum.python,
      pinnedParams: [],
      selectedParams: [],
      ignoreTypeErrors: { callable: false, params: {} },
      edgeInputParams: [],
      edgeOutputPorts: [],
      callable: null,
      hideParams: false,
    };

    useProjectState.setState((state) => {
      state.projectConfig = projectConfig;
      state.sections = { [sectionId]: buildCore(sectionId, variantId) };
      state.sectionVariants = { [variantId]: buildVariant(variantId, implId) };
      state.sectionImpls = { [implId]: callableImpl };
      state.previewSectionVariantMap = {};
      state.parentSectionMap = { [sectionId]: null };
      state.shownParamIds = {
        [variantId]: {
          pinned: { requiredParamIdsToPaths: {}, topLevelParamIds: [] },
          unpinned: { requiredParamIdsToPaths: {}, topLevelParamIds: [] },
        },
      };
    });

    useResizeEvent.setState((state) => {
      state.resizeEvent[sectionId] = "start";
    });

    syncStoreInitialState(useProjectState);
    syncStoreInitialState(useResizeEvent);

    const dims = renderDims(sectionId);
    expect(dims.maxHeight).toBe(1000);
  });

  it("applies meta control sizing policy overrides", () => {
    const sectionId = "section-meta";
    const variantId = "variant-meta";
    const implId = "impl-meta";
    const paramId = "param-1";
    const paramVariantId = "param-variant";
    const paramImplId = "param-impl";

    const projectConfig = createProjectConfig({
      id: "project-3",
      sectionVariantMap: { [sectionId]: variantId },
      topLevelSections: {
        [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
      },
    });

    const metaImpl = {
      type: SectionTypeEnum.MetaControl,
      id: implId,
      name: "Meta",
      isFrozen: false,
      isInOtherProjectConfigs: false,
      size: { width: 200, height: 100 },
      aspectRatio: false,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: false,
      positionAndSizeLocked: false,
      isPreset: false,
      metaControlParamId: paramId,
      codeObjVariantMap: { [paramId]: paramVariantId },
      showSectionTitle: false,
    };

    const dropzoneImpl = {
      type: CodeObjTypeEnum.DropzoneParam,
      id: paramImplId,
      name: "Dropzone",
      description: "",
      isPreset: false,
      coreNameType: "TEXT",
      coreNameEditable: false,
      passingStyle: "DEFAULT",
      defaultVal: "",
      value: "",
      mode: "STATEFUL",
      maxAttachments: null,
      placeholder: "Drop a file here",
    };

    useProjectState.setState((state) => {
      state.projectConfig = projectConfig;
      state.sections = { [sectionId]: buildCore(sectionId, variantId) };
      state.sectionVariants = { [variantId]: buildVariant(variantId, implId) };
      state.sectionImpls = { [implId]: metaImpl };
      state.previewSectionVariantMap = {};
      state.parentSectionMap = { [sectionId]: null };
      state.shownParamIds = {};
      state.codeObjs = {
        [paramId]: buildCore(paramId, paramVariantId),
      };
      state.codeObjVariants = {
        [paramVariantId]: buildVariant(paramVariantId, paramImplId),
      };
      state.codeObjImpls = {
        [paramImplId]: dropzoneImpl,
      };
    });

    syncStoreInitialState(useProjectState);

    const dims = renderDims(sectionId);
    expect(dims.minHeight).toBe(120);
    expect(dims.minWidth).toBe(240);
    expect(dims.sizeMode.height).toBe("auto_only");
  });
});
