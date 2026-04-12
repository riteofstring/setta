/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  useProjectState,
  useResizeEvent,
  useSettings,
  useWaitingForLSPResult,
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
  type Core,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const renderCalls = vi.hoisted(() => ({
  useIsScrollable: vi.fn(() => ({
    ref: { current: null },
    isScrollable: false,
  })),
}));

vi.mock("./ParamDndList", () => ({
  ParamDndList: vi.fn(() => <div data-testid="param-dnd-list" />),
}));

vi.mock("state/hooks/sectionSizes", async () => {
  const actual = await vi.importActual<
    typeof import("state/hooks/sectionSizes")
  >("state/hooks/sectionSizes");

  return {
    ...actual,
    useIsScrollable: renderCalls.useIsScrollable,
  };
});

const resizeObserverCallbacks = new Set<ResizeObserverCallback>();

vi.stubGlobal(
  "ResizeObserver",
  class {
    constructor(callback: ResizeObserverCallback) {
      resizeObserverCallbacks.add(callback);
    }
    observe() {}
    unobserve() {}
    disconnect() {
      resizeObserverCallbacks.clear();
    }
  },
);

vi.stubGlobal(
  "MutationObserver",
  class {
    observe() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  },
);

const { ParamGroupContainer } = await import("./GroupContainer");
const { ParamDndList } = await import("./ParamDndList");

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

function seedParamGroupContainerState() {
  const sectionId = "section-1";
  const variantId = "variant-1";
  const implId = "impl-1";
  const pinnedParamId = "param-pinned";
  const pinnedParamVariantId = "param-pinned-variant";
  const pinnedParamImplId = "param-pinned-impl";
  const unpinnedParamId = "param-unpinned";
  const unpinnedParamVariantId = "param-unpinned-variant";
  const unpinnedParamImplId = "param-unpinned-impl";

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
      [pinnedParamId]: pinnedParamVariantId,
      [unpinnedParamId]: unpinnedParamVariantId,
    },
    hideUnpinnedParams: false,
    paramFilter: "",
    columnWidth: null,
    configLanguage: ConfigLanguageEnum.python,
    pinnedParams: [pinnedParamId],
    selectedParams: [],
    ignoreTypeErrors: { callable: false, params: {} },
    edgeInputParams: [pinnedParamId],
    edgeOutputPorts: [{ accessor: "result", id: "out-1" }],
    topLevelParamId: null,
    isJsonSource: false,
    jsonSourceKeys: [],
    jsonSourceMissing: false,
  };
  const pinnedParamCore: Core = {
    id: pinnedParamId,
    name: "pinned",
    displayName: "",
    variants: [pinnedParamVariantId],
    defaultVariant: pinnedParamVariantId,
    sharedModifier: {},
    unsharedKeys: [],
  };
  const pinnedParamVariant: Variant = {
    id: pinnedParamVariantId,
    name: "PinnedParamVariant",
    impl: pinnedParamImplId,
    nonPresetImpls: [],
    modifier: {},
    isFrozen: false,
  };
  const pinnedParamImpl = {
    type: CodeObjTypeEnum.CodeParam,
    id: pinnedParamImplId,
    name: "PinnedParam",
    description: "",
    isPreset: false,
    coreNameType: ParamNameTypeEnum.TEXT,
    coreNameEditable: true,
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    defaultVal: "",
    value: "",
  };
  const unpinnedParamCore: Core = {
    id: unpinnedParamId,
    name: "unpinned",
    displayName: "",
    variants: [unpinnedParamVariantId],
    defaultVariant: unpinnedParamVariantId,
    sharedModifier: {},
    unsharedKeys: [],
  };
  const unpinnedParamVariant: Variant = {
    id: unpinnedParamVariantId,
    name: "UnpinnedParamVariant",
    impl: unpinnedParamImplId,
    nonPresetImpls: [],
    modifier: {},
    isFrozen: false,
  };
  const unpinnedParamImpl = {
    type: CodeObjTypeEnum.CodeParam,
    id: unpinnedParamImplId,
    name: "UnpinnedParam",
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
      [pinnedParamId]: pinnedParamCore,
      [unpinnedParamId]: unpinnedParamCore,
    };
    state.codeObjVariants = {
      [pinnedParamVariantId]: pinnedParamVariant,
      [unpinnedParamVariantId]: unpinnedParamVariant,
    };
    state.codeObjImpls = {
      [pinnedParamImplId]: pinnedParamImpl,
      [unpinnedParamImplId]: unpinnedParamImpl,
    };
    state.parentSectionMap = { [sectionId]: null };
    state.previewSectionVariantMap = {};
    state.shownParamIds = {
      [variantId]: {
        pinned: {
          requiredParamIdsToPaths: { [pinnedParamId]: [pinnedParamId] },
          topLevelParamIds: [pinnedParamId],
        },
        unpinned: {
          requiredParamIdsToPaths: { [unpinnedParamId]: [unpinnedParamId] },
          topLevelParamIds: [unpinnedParamId],
        },
      },
    };
  });
  syncStoreInitialState(useProjectState);

  return sectionId;
}

describe("ParamGroupContainer render stability", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetProjectStores();
    resizeObserverCallbacks.clear();
    useSettings.setState(createSettingsState());
    syncStoreInitialState(useSettings);
    syncStoreInitialState(useWaitingForLSPResult);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    vi.mocked(ParamDndList).mockClear();
    renderCalls.useIsScrollable.mockClear();
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
    resetProjectStores();
    vi.restoreAllMocks();
  });

  it("does not rematerialize param rows when resizeEvent changes", async () => {
    const sectionId = seedParamGroupContainerState();

    await act(async () => {
      root.render(
        <ParamGroupContainer
          sectionId={sectionId}
          bgColor="bg-transparent"
          sectionTypeName={SectionTypeEnum.Dict}
        />,
      );
    });

    expect(vi.mocked(ParamDndList)).toHaveBeenCalledTimes(1);

    await act(async () => {
      useResizeEvent.setState((state) => {
        state.resizeEvent[sectionId] = "start";
      });
    });

    expect(vi.mocked(ParamDndList)).toHaveBeenCalledTimes(1);
  });

  it("does not rematerialize param rows when waiting-for-result changes", async () => {
    const sectionId = seedParamGroupContainerState();

    await act(async () => {
      root.render(
        <ParamGroupContainer
          sectionId={sectionId}
          bgColor="bg-transparent"
          sectionTypeName={SectionTypeEnum.Dict}
        />,
      );
    });

    expect(vi.mocked(ParamDndList)).toHaveBeenCalledTimes(1);

    await act(async () => {
      useWaitingForLSPResult.setState((state) => {
        state.parametersRequest[sectionId] = true;
      });
    });

    expect(vi.mocked(ParamDndList)).toHaveBeenCalledTimes(1);
  });

  it("does not rematerialize param rows when scrollability observers update", async () => {
    const sectionId = seedParamGroupContainerState();

    await act(async () => {
      root.render(
        <ParamGroupContainer
          sectionId={sectionId}
          bgColor="bg-transparent"
          sectionTypeName={SectionTypeEnum.Dict}
        />,
      );
    });

    expect(vi.mocked(ParamDndList)).toHaveBeenCalledTimes(1);

    const scrollContainer = host.querySelector<HTMLDivElement>(
      ".section-args-nested",
    );
    expect(scrollContainer).not.toBeNull();

    Object.defineProperties(scrollContainer!, {
      clientHeight: { configurable: true, value: 120 },
      clientWidth: { configurable: true, value: 120 },
      scrollHeight: { configurable: true, value: 240 },
      scrollWidth: { configurable: true, value: 120 },
    });

    await act(async () => {
      for (const callback of resizeObserverCallbacks) {
        callback(
          [
            {
              borderBoxSize: [{ inlineSize: 120 }],
              contentRect: { width: 120, height: 240 },
            } as ResizeObserverEntry,
          ],
          {} as ResizeObserver,
        );
      }
    });

    expect(vi.mocked(ParamDndList)).toHaveBeenCalledTimes(1);
  });

  it("subscribes to unpinned scrollability once per rendered container", async () => {
    const sectionId = seedParamGroupContainerState();

    await act(async () => {
      root.render(
        <ParamGroupContainer
          sectionId={sectionId}
          bgColor="bg-transparent"
          sectionTypeName={SectionTypeEnum.Dict}
        />,
      );
    });

    expect(renderCalls.useIsScrollable).toHaveBeenCalledTimes(1);
  });
});
