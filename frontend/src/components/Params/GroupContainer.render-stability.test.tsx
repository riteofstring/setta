/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  useProjectState,
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
  useParamColumnWidthHandler: vi.fn(),
  useParamColumnWidth: vi.fn(() => renderCalls.useParamColumnWidthHandler),
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

vi.mock("state/hooks/useParamColumnWidth", () => ({
  useParamColumnWidth: renderCalls.useParamColumnWidth,
}));

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

function seedParamGroupContainerState({
  hideUnpinnedParams = false,
  includeUnpinnedParam = true,
  unpinnedPath = ["param-unpinned"],
}: {
  hideUnpinnedParams?: boolean;
  includeUnpinnedParam?: boolean;
  unpinnedPath?: string[];
} = {}) {
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
      ...(includeUnpinnedParam
        ? { [unpinnedParamId]: unpinnedParamVariantId }
        : {}),
    },
    hideUnpinnedParams,
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
      ...(includeUnpinnedParam ? { [unpinnedParamId]: unpinnedParamCore } : {}),
    };
    state.codeObjVariants = {
      [pinnedParamVariantId]: pinnedParamVariant,
      ...(includeUnpinnedParam
        ? { [unpinnedParamVariantId]: unpinnedParamVariant }
        : {}),
    };
    state.codeObjImpls = {
      [pinnedParamImplId]: pinnedParamImpl,
      ...(includeUnpinnedParam
        ? { [unpinnedParamImplId]: unpinnedParamImpl }
        : {}),
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
          requiredParamIdsToPaths: includeUnpinnedParam
            ? { [unpinnedParamId]: unpinnedPath }
            : {},
          topLevelParamIds: includeUnpinnedParam ? [unpinnedParamId] : [],
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
    renderCalls.useParamColumnWidth.mockClear();
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

  it("keeps the remaining fixed-height and edge-strip resize observers alive when the column-width hook is mocked", async () => {
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

    expect(resizeObserverCallbacks.size).toBe(2);
  });

  it("derives column-width nesting depth from the deepest visible param path", async () => {
    const sectionId = seedParamGroupContainerState({
      unpinnedPath: ["param-unpinned", "nested-child", "deep-leaf"],
    });

    await act(async () => {
      root.render(
        <ParamGroupContainer
          sectionId={sectionId}
          bgColor="bg-transparent"
          sectionTypeName={SectionTypeEnum.Dict}
        />,
      );
    });

    expect(renderCalls.useParamColumnWidth).toHaveBeenCalledWith(
      expect.objectContaining({
        maxNestedDepth: 3,
        sectionId,
      }),
    );
  });

  it("does not mount the unpinned area when it is hidden", async () => {
    const sectionId = seedParamGroupContainerState({
      hideUnpinnedParams: true,
    });

    await act(async () => {
      root.render(
        <ParamGroupContainer
          sectionId={sectionId}
          bgColor="bg-transparent"
          sectionTypeName={SectionTypeEnum.Dict}
        />,
      );
    });

    expect(renderCalls.useIsScrollable).not.toHaveBeenCalled();
    expect(vi.mocked(ParamDndList)).not.toHaveBeenCalled();
  });

  it("does not mount the unpinned area when there are no unpinned params and no editable empty state", async () => {
    const sectionId = seedParamGroupContainerState({
      includeUnpinnedParam: false,
    });

    useProjectState.setState((state) => {
      const impl = state.sectionImpls["impl-1"];
      if (!impl || impl.type !== SectionTypeEnum.Dict) {
        throw new Error("Expected seeded dict impl.");
      }
      impl.positionAndSizeLocked = true;
    });

    await act(async () => {
      root.render(
        <ParamGroupContainer
          sectionId={sectionId}
          bgColor="bg-transparent"
          sectionTypeName={SectionTypeEnum.Dict}
        />,
      );
    });

    expect(renderCalls.useIsScrollable).not.toHaveBeenCalled();
    expect(vi.mocked(ParamDndList)).not.toHaveBeenCalled();
  });
});
