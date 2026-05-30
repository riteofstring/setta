import { renderToStaticMarkup } from "react-dom/server";
import { useProjectState, useSettings } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  CodeObjTypeEnum,
  ConfigLanguageEnum,
  ParamNameTypeEnum,
  ParameterPassingStyleEnum,
  SectionTypeEnum,
  createProjectConfig,
  createSettingsState,
  type Core,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EdgesStrip } from "./EdgesStrip";
import { ParamGroupContainer } from "./GroupContainer";

vi.mock("./ParamDndList", () => ({
  ParamDndList: () => <div data-testid="param-dnd-list" />,
}));

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

type SeedParamGroupOptions = {
  sectionId?: string;
  variantId?: string;
  implId?: string;
  sectionTypeName?: SectionTypeEnum;
  pinnedParamCount?: number;
  unpinnedParamCount?: number;
  unpinnedParamsAreaMinHeight?: number;
  edgeInputParams?: Array<string>;
  edgeOutputPorts?: Array<{ id: string; accessor: string }>;
};

type ParamEntry = {
  paramId: string;
  paramImplId: string;
  paramVariantId: string;
};

function configureParamGroupSettings(
  unpinnedParamsAreaMinHeight: number | undefined,
) {
  const settingsState = createSettingsState();
  if (unpinnedParamsAreaMinHeight !== undefined) {
    settingsState.sectionSizingPolicy.globals.unpinnedParamsAreaMinHeight =
      unpinnedParamsAreaMinHeight;
  }
  useSettings.setState(settingsState);
  syncStoreInitialState(useSettings);
}

function buildParamEntries(
  pinnedParamCount: number,
  unpinnedParamCount: number,
): Array<ParamEntry> {
  return Array.from(
    { length: pinnedParamCount + unpinnedParamCount },
    (_, index) => {
      const number = index + 1;
      return {
        paramId: `param-${number}`,
        paramVariantId: `param-variant-${number}`,
        paramImplId: `param-impl-${number}`,
      };
    },
  );
}

function buildParamCoreRecords(paramEntries: Array<ParamEntry>) {
  const codeObjVariantMap = Object.fromEntries(
    paramEntries.map(({ paramId, paramVariantId }) => [
      paramId,
      paramVariantId,
    ]),
  );
  return {
    codeObjVariantMap,
    codeObjs: Object.fromEntries(
      paramEntries.map(({ paramId }) => [
        paramId,
        {
          id: paramId,
          name: paramId,
          displayName: "",
          variants: [codeObjVariantMap[paramId]],
          defaultVariant: codeObjVariantMap[paramId],
          sharedModifier: {},
          unsharedKeys: [],
        } satisfies Core,
      ]),
    ),
    codeObjVariants: Object.fromEntries(
      paramEntries.map(({ paramVariantId, paramImplId }) => [
        paramVariantId,
        {
          id: paramVariantId,
          name: `ParamVariant-${paramVariantId}`,
          impl: paramImplId,
          nonPresetImpls: [],
          modifier: {},
          isFrozen: false,
        } satisfies Variant,
      ]),
    ),
    codeObjImpls: Object.fromEntries(
      paramEntries.map(({ paramImplId }) => [
        paramImplId,
        {
          type: CodeObjTypeEnum.CodeParam,
          id: paramImplId,
          name: "Param",
          description: "",
          isPreset: false,
          coreNameType: ParamNameTypeEnum.TEXT,
          coreNameEditable: true,
          passingStyle: ParameterPassingStyleEnum.DEFAULT,
          defaultVal: "",
          value: "",
        },
      ]),
    ),
  };
}

function buildShownParamIdState({
  pinnedEntries,
  pinnedParamIds,
  unpinnedEntries,
  unpinnedParamIds,
  variantId,
}: {
  pinnedEntries: Array<ParamEntry>;
  pinnedParamIds: Array<string>;
  unpinnedEntries: Array<ParamEntry>;
  unpinnedParamIds: Array<string>;
  variantId: string;
}) {
  return {
    [variantId]: {
      pinned: {
        requiredParamIdsToPaths: Object.fromEntries(
          pinnedEntries.map(({ paramId }) => [paramId, [paramId]]),
        ),
        topLevelParamIds: pinnedParamIds,
      },
      unpinned: {
        requiredParamIdsToPaths: Object.fromEntries(
          unpinnedEntries.map(({ paramId }) => [paramId, [paramId]]),
        ),
        topLevelParamIds: unpinnedParamIds,
      },
    },
  };
}

function normalizeSeedParamGroupOptions(options: SeedParamGroupOptions) {
  return {
    sectionId: "section-1",
    variantId: "variant-1",
    implId: "impl-1",
    sectionTypeName: SectionTypeEnum.Dict,
    pinnedParamCount: 0,
    unpinnedParamCount: 1,
    edgeInputParams: [],
    edgeOutputPorts: [],
    ...options,
  };
}

function seedParamGroupState(options: SeedParamGroupOptions = {}) {
  const {
    sectionId,
    variantId,
    implId,
    sectionTypeName,
    pinnedParamCount,
    unpinnedParamCount,
    unpinnedParamsAreaMinHeight,
    edgeInputParams,
    edgeOutputPorts,
  } = normalizeSeedParamGroupOptions(options);
  configureParamGroupSettings(unpinnedParamsAreaMinHeight);
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

  const paramEntries = buildParamEntries(pinnedParamCount, unpinnedParamCount);
  const pinnedEntries = paramEntries.slice(0, pinnedParamCount);
  const unpinnedEntries = paramEntries.slice(pinnedParamCount);
  const { codeObjVariantMap, codeObjs, codeObjVariants, codeObjImpls } =
    buildParamCoreRecords(paramEntries);
  const pinnedParamIds = pinnedEntries.map(({ paramId }) => paramId);
  const unpinnedParamIds = unpinnedEntries.map(({ paramId }) => paramId);
  const shownParamIds = buildShownParamIdState({
    pinnedEntries,
    pinnedParamIds,
    unpinnedEntries,
    unpinnedParamIds,
    variantId,
  });

  useProjectState.setState((state) => {
    state.projectConfig = projectConfig;
    state.sections = { [sectionId]: sectionCore };
    state.sectionVariants = { [variantId]: sectionVariant };
    state.sectionImpls = {
      [implId]: {
        type: sectionTypeName,
        id: implId,
        name: "Section",
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
        codeObjVariantMap,
        hideUnpinnedParams: false,
        paramFilter: "",
        columnWidth: null,
        configLanguage: ConfigLanguageEnum.python,
        pinnedParams: pinnedParamIds,
        selectedParams: [],
        ignoreTypeErrors: { callable: false, params: {} },
        edgeInputParams,
        edgeOutputPorts,
        topLevelParamId: null,
        isJsonSource: false,
        jsonSourceKeys: [],
        jsonSourceMissing: false,
      },
    };
    state.codeObjs = codeObjs;
    state.codeObjVariants = codeObjVariants;
    state.codeObjImpls = codeObjImpls;
    state.parentSectionMap = { [sectionId]: null };
    state.previewSectionVariantMap = {};
    state.shownParamIds = shownParamIds;
  });
  syncStoreInitialState(useProjectState);

  return { sectionId, variantId, sectionTypeName };
}

function renderParamGroupContainer(
  options: Parameters<typeof seedParamGroupState>[0] = {},
) {
  const { sectionId, sectionTypeName } = seedParamGroupState(options);
  return renderToStaticMarkup(
    <ParamGroupContainer
      sectionId={sectionId}
      bgColor="bg-transparent"
      sectionTypeName={sectionTypeName}
    />,
  );
}

describe("ParamGroupContainer layout", () => {
  beforeEach(() => {
    resetProjectStores();
    useSettings.setState(createSettingsState());
    syncStoreInitialState(useSettings);
  });

  afterEach(() => {
    resetProjectStores();
  });

  it.each([
    [SectionTypeEnum.Dict, "bg-setta-100/50 dark:bg-blue-950/30"],
    [SectionTypeEnum.GlobalVariables, "bg-setta-50 dark:bg-blue-950/30"],
    [SectionTypeEnum.Callable, "bg-white dark:bg-blue-950/30"],
  ] as const)(
    "uses the pinned params background classes for %s sections through ParamGroupContainer",
    (sectionTypeName, expectedBgClassName) => {
      const markup = renderParamGroupContainer({
        sectionTypeName,
        pinnedParamCount: 1,
      });

      expect(markup).toContain("Pinned Params");
      expect(markup).toContain(expectedBgClassName);
    },
  );

  it("normalizes the legacy unpinned params min height through ParamGroupContainer", () => {
    const markup = renderParamGroupContainer({
      unpinnedParamsAreaMinHeight: 38,
    });

    expect(markup).toContain("min-height:36px");
  });

  it("preserves explicit custom unpinned min heights through ParamGroupContainer", () => {
    const markup = renderParamGroupContainer({
      pinnedParamCount: 1,
      unpinnedParamsAreaMinHeight: 52,
    });

    expect(markup).toContain("min-height:52px");
  });

  it("keeps the unpinned params list scrollable", () => {
    const { sectionId, variantId } = seedParamGroupState();
    const snapshot = useProjectState.getState();
    expect(snapshot.projectConfig.sectionVariantMap[sectionId]).toBe(variantId);

    const markup = renderParamGroupContainer();
    const match = markup.match(
      /class=\"([^\"]*section-args-nested[^\"]*overflow-y-scroll[^\"]*)\"/,
    );
    expect(match).not.toBeNull();
    const classes = (match?.[1] ?? "").split(" ");
    expect(classes).toContain("section-args-nested");
    expect(classes).toContain("overflow-y-scroll");
    expect(markup).toContain("section-row-pin-main");
  });

  it("renders a compact edge strip for bare canvas nodes", () => {
    const { sectionId } = seedParamGroupState({
      edgeInputParams: ["param-1"],
      edgeOutputPorts: [{ id: "result", accessor: "result" }],
    });

    const markup = renderToStaticMarkup(
      <EdgesStrip
        sectionId={sectionId}
        bgColor="bg-transparent"
        variant="bare-node"
      />,
    );

    expect(markup).toContain('data-testid="bare-section-edge-strip"');
    expect(markup).toContain('data-edge-param-id="param-1"');
    expect(markup).toContain('data-edge-param-side="in"');
    expect(markup).toContain('data-edge-param-id="result"');
    expect(markup).toContain('data-edge-param-side="out"');
    expect(markup).not.toContain("-mt-4");
  });
});
