/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import {
  useProjectState,
  useSettings,
  useTemporaryMiscState,
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
  type BaseCodeObjImplUnion,
  type Core,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPinnedParamsBgClassName } from "./groupContainerView";

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
  sectionId,
  edgeInputParamIds = [],
  edgeOutputPorts = [],
  pinnedParamIds = [],
  unpinnedParamIds = [],
}: {
  sectionId: string;
  edgeInputParamIds?: string[];
  edgeOutputPorts?: Array<{ accessor: string; id: string }>;
  pinnedParamIds?: string[];
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

type TestResizeObserverInstance = {
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  unobserve: ReturnType<typeof vi.fn>;
};

type TestMutationObserverInstance = {
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

describe("getPinnedParamsBgClassName", () => {
  it("uses a setta light tint with the dark blue shade", () => {
    const result = getPinnedParamsBgClassName(SectionTypeEnum.Dict);
    expect(result).toBe("bg-setta-100/50 dark:bg-blue-950/30");
  });

  it("uses a solid light tint for global variables and keeps the dark blue shade", () => {
    const result = getPinnedParamsBgClassName(SectionTypeEnum.GlobalVariables);
    expect(result).toBe("bg-setta-50 dark:bg-blue-950/30");
  });

  it("uses the standard light tint for other sections", () => {
    const result = getPinnedParamsBgClassName(SectionTypeEnum.Dict);
    expect(result).toBe("bg-setta-100/50 dark:bg-blue-950/30");
  });

  it("uses a pure white background for callable sections", () => {
    const result = getPinnedParamsBgClassName(SectionTypeEnum.Callable);
    expect(result).toBe("bg-white dark:bg-blue-950/30");
  });
});

describe("ParamGroupContainer layout", () => {
  beforeEach(() => {
    resetProjectStores();
    useSettings.setState(createSettingsState());
    syncStoreInitialState(useSettings);
    syncStoreInitialState(useTemporaryMiscState);
    syncStoreInitialState(useWaitingForLSPResult);
    vi.stubGlobal(
      "ResizeObserver",
      class TestResizeObserver {
        observe = vi.fn();
        disconnect = vi.fn();
        unobserve = vi.fn();
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetProjectStores();
  });

  it("keeps the unpinned params list scrollable", async () => {
    const sectionId = "section-1";
    const { ParamGroupContainer } = await import("./GroupContainer");

    seedParamGroupContainerState({
      sectionId,
      unpinnedParamIds: ["param-1"],
    });

    const markup = renderToStaticMarkup(
      <ParamGroupContainer
        sectionId={sectionId}
        bgColor="bg-transparent"
        sectionTypeName={SectionTypeEnum.Dict}
      />,
    );
    const match = markup.match(
      /class=\"([^\"]*section-args-nested[^\"]*overflow-y-scroll[^\"]*)\"/,
    );
    expect(match).not.toBeNull();
    const classes = (match?.[1] ?? "").split(" ");
    expect(classes).toContain("section-args-nested");
    expect(classes).toContain("overflow-y-scroll");
    expect(markup).toContain("section-row-pin-main");
  }, 10000);

  it("provides the param DnD wrapper for the shell-backed live dict area path", async () => {
    const sectionId = "section-wrapper";
    const { ParamGroupContainer } = await import("./GroupContainer");

    seedParamGroupContainerState({
      sectionId,
      edgeInputParamIds: ["edge-param"],
      edgeOutputPorts: [{ accessor: "Result", id: "out-1" }],
      pinnedParamIds: ["pinned-param"],
      unpinnedParamIds: ["unpinned-param"],
    });

    const markup = renderToStaticMarkup(
      <ParamGroupContainer
        sectionId={sectionId}
        bgColor="bg-transparent"
        sectionTypeName={SectionTypeEnum.Dict}
      />,
    );

    expect(markup).toContain("section-row-pin-main");
    expect(markup).toContain(
      'data-dict-area-block-frame-id="dict-area-block:edges"',
    );
    expect(markup).toContain(
      'data-dict-area-block-frame-id="dict-area-block:pinned"',
    );
    expect(markup).toContain(
      'data-dict-area-block-frame-id="dict-area-block:unpinned"',
    );
  });

  it("mounts ordered dict-area block frames for the live DOM path", async () => {
    const sectionId = "section-ordered";
    const { ParamGroupContainer } = await import("./GroupContainer");

    seedParamGroupContainerState({
      sectionId,
      edgeInputParamIds: ["edge-param"],
      edgeOutputPorts: [{ accessor: "Result", id: "out-1" }],
      pinnedParamIds: ["pinned-param"],
      unpinnedParamIds: ["unpinned-param"],
    });

    const markup = renderToStaticMarkup(
      <ParamGroupContainer
        sectionId={sectionId}
        bgColor="bg-transparent"
        sectionTypeName={SectionTypeEnum.Dict}
      />,
    );
    const frameIds = Array.from(
      markup.matchAll(/data-dict-area-block-frame-id=\"([^\"]+)\"/g),
      (match) => match[1],
    );

    expect(frameIds).toEqual([
      "dict-area-block:edges",
      "dict-area-block:pinned",
      "dict-area-block:unpinned",
    ]);
    expect(markup).toMatch(
      /data-dict-area-block-frame-id="dict-area-block:edges"[^>]*data-dict-area-block-mount-kind="fixed"[^>]*data-dict-area-block-order-index="0"/,
    );
    expect(markup).toMatch(
      /data-dict-area-block-frame-id="dict-area-block:pinned"[^>]*data-dict-area-block-mount-kind="fixed"[^>]*data-dict-area-block-order-index="1"/,
    );
    expect(markup).toMatch(
      /data-dict-area-block-frame-id="dict-area-block:unpinned"[^>]*data-dict-area-block-mount-kind="grow"[^>]*data-dict-area-block-order-index="2"/,
    );
  });
});

describe("ParamGroupContainer boundary", () => {
  let animationFrames: Map<number, FrameRequestCallback>;
  let host: HTMLDivElement;
  let mutationObservers: TestMutationObserverInstance[];
  let nextAnimationFrameId: number;
  let resizeObservers: TestResizeObserverInstance[];
  let root: Root;

  beforeEach(() => {
    resetProjectStores();
    useSettings.setState(createSettingsState());
    syncStoreInitialState(useSettings);
    syncStoreInitialState(useTemporaryMiscState);
    syncStoreInitialState(useWaitingForLSPResult);
    animationFrames = new Map();
    mutationObservers = [];
    nextAnimationFrameId = 1;
    resizeObservers = [];
    vi.stubGlobal(
      "ResizeObserver",
      class TestResizeObserver {
        observe = vi.fn();
        disconnect = vi.fn();
        unobserve = vi.fn();

        constructor(_callback: ResizeObserverCallback) {
          resizeObservers.push(this);
        }
      },
    );
    vi.stubGlobal(
      "MutationObserver",
      class TestMutationObserver {
        observe = vi.fn();
        disconnect = vi.fn();

        constructor(_callback: MutationCallback) {
          mutationObservers.push(this);
        }
      },
    );
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const frameId = nextAnimationFrameId++;
      animationFrames.set(frameId, callback);
      return frameId;
    });
    vi.stubGlobal("cancelAnimationFrame", (frameId: number) => {
      animationFrames.delete(frameId);
    });
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

  it("owns the shell boundary seam above the pure wrapper view", async () => {
    const sectionId = "section-group-container-shell";
    const { ParamGroupContainer } = await import("./GroupContainer");

    seedParamGroupContainerState({
      sectionId,
      edgeInputParamIds: ["edge-param"],
      edgeOutputPorts: [{ accessor: "Result", id: "out-1" }],
      pinnedParamIds: ["pinned-param"],
      unpinnedParamIds: ["unpinned-param"],
    });

    await act(async () => {
      root.render(
        <ParamGroupContainer
          bgColor="bg-transparent"
          sectionId={sectionId}
          sectionTypeName={SectionTypeEnum.Dict}
        />,
      );
    });

    expect(host.querySelector(".section-row-pin-main")).not.toBeNull();
    expect(host.querySelector('[data-dict-area-block-frame-id]')).not.toBeNull();
    expect(resizeObservers.length).toBeGreaterThan(0);
    expect(mutationObservers.length).toBeGreaterThan(0);
  });

  it("keeps the waiting overlay on the pure wrapper mount path", async () => {
    const sectionId = "section-group-container-waiting";
    const { ParamGroupContainer } = await import("./GroupContainer");

    seedParamGroupContainerState({
      sectionId,
      pinnedParamIds: ["pinned-param"],
      unpinnedParamIds: ["unpinned-param"],
    });
    useWaitingForLSPResult.setState((state) => {
      state.parametersRequest[sectionId] = true;
    });

    await act(async () => {
      root.render(
        <ParamGroupContainer
          bgColor="bg-transparent"
          sectionId={sectionId}
          sectionTypeName={SectionTypeEnum.Dict}
        />,
      );
    });

    expect(host.querySelector(".gg-spinner")).not.toBeNull();
    expect(host.textContent).toContain("pinned-param");
    expect(host.textContent).toContain("unpinned-param");
  });
});
