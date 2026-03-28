/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  useProjectState,
  useSettings,
  useTemporaryMiscState,
  useWaitingForLSPResult,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { getParamsFixedHeightKey } from "utils/constants";
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
import type { LiveDictAreaRendererMode } from "../Section/Layouts/liveDictAreaRendererMode";
import { useGroupContainerShellBoundary } from "./groupContainerShellBoundary";

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

function seedGroupContainerShellBoundaryState({
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

function GroupContainerShellBoundaryHarness({
  bgColor,
  includeFixedBlocks = true,
  renderMode = "dom",
  sectionId,
  sectionTypeName,
  visibleLabels = [],
}: {
  bgColor: string;
  includeFixedBlocks?: boolean;
  renderMode?: LiveDictAreaRendererMode;
  sectionId: string;
  sectionTypeName: SectionTypeEnum;
  visibleLabels?: string[];
}) {
  const {
    liveDictAreaMountProps,
    liveDictAreaSceneBoundary,
    maxNestedDepth,
    setOuterRef,
    waitingForResult,
  } = useGroupContainerShellBoundary({
    bgColor,
    renderMode,
    sectionId,
    sectionTypeName,
  });

  return (
    <div
      className="section-row-pin-main section-w-full relative -mt-3 flex min-h-0 flex-col pt-2"
      data-bg-color={bgColor}
      data-section-id={sectionId}
      data-section-type={sectionTypeName}
      data-block-kinds={liveDictAreaMountProps.liveDictAreaSurface.blocks
        .map((block) => block.kind)
        .join(",")}
      data-max-nested-depth={JSON.stringify(maxNestedDepth)}
      data-scene-renderer-packet-count={liveDictAreaSceneBoundary.blocks.length}
      data-waiting-for-result={waitingForResult}
      ref={setOuterRef}
    >
      {renderMode === "pixi-node-body" ? (
        <>
          <div
            data-live-dict-area-fixed-measurement="edges"
            data-params-fixed="true"
          >
            edge-measure
          </div>
          <div
            data-live-dict-area-fixed-measurement="pinned"
            data-params-fixed="true"
          >
            pinned-measure
          </div>
        </>
      ) : includeFixedBlocks ? (
        <>
          <div data-params-fixed="true">edge-block</div>
          <div data-params-fixed="true">pinned-block</div>
          <div>unpinned-block</div>
        </>
      ) : null}
      {visibleLabels.map((label) => (
        <div key={label}>{label}</div>
      ))}
    </div>
  );
}

describe("useGroupContainerShellBoundary", () => {
  let host: HTMLDivElement;
  let root: Root;
  let resizeObservers: TestResizeObserverInstance[];
  let mutationObservers: TestMutationObserverInstance[];
  let animationFrames: Map<number, FrameRequestCallback>;
  let nextAnimationFrameId: number;

  beforeEach(() => {
    resetProjectStores();
    useSettings.setState(createSettingsState());
    syncStoreInitialState(useSettings);
    syncStoreInitialState(useTemporaryMiscState);
    syncStoreInitialState(useWaitingForLSPResult);
    resizeObservers = [];
    mutationObservers = [];
    animationFrames = new Map();
    nextAnimationFrameId = 1;
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

  async function flushAnimationFrames() {
    while (animationFrames.size > 0) {
      const pendingCallbacks = Array.from(animationFrames.values());
      animationFrames.clear();
      await act(async () => {
        pendingCallbacks.forEach((callback) => callback(performance.now()));
      });
    }
  }

  it("lifts the live dict-area mount seam into the shell boundary layer", async () => {
    const sectionId = "section-group-container-shell-boundary-height";

    seedGroupContainerShellBoundaryState({
      sectionId,
      edgeInputParamIds: ["edge-param"],
      edgeOutputPorts: [{ accessor: "Result", id: "out-1" }],
      pinnedParamIds: ["pinned-param"],
      unpinnedParamIds: ["unpinned-param"],
    });

    await act(async () => {
      root.render(
        <GroupContainerShellBoundaryHarness
          bgColor="bg-transparent"
          sectionId={sectionId}
          sectionTypeName={SectionTypeEnum.Dict}
        />,
      );
    });

    const shell = host.querySelector<HTMLElement>(".section-row-pin-main");
    expect(shell?.dataset.bgColor).toBe("bg-transparent");
    expect(shell?.dataset.sectionId).toBe(sectionId);
    expect(shell?.dataset.sectionType).toBe(SectionTypeEnum.Dict);
    expect(shell?.dataset.blockKinds).toBe(
      "edge-strip,pinned-param-area,unpinned-param-area",
    );
    expect(shell?.dataset.maxNestedDepth).toBe(
      JSON.stringify({ pinned: 1, unpinned: 1 }),
    );
    expect(Number(shell?.dataset.sceneRendererPacketCount)).toBeGreaterThan(0);
    Object.defineProperty(shell, "clientWidth", {
      configurable: true,
      value: 480,
    });
    shell?.style.setProperty("padding-top", "4px");
    shell?.style.setProperty("padding-bottom", "6px");

    const fixedBlocks = Array.from(
      host.querySelectorAll<HTMLElement>('[data-params-fixed="true"]'),
    );
    expect(fixedBlocks.length).toBeGreaterThan(0);
    fixedBlocks.forEach((block, index) => {
      Object.defineProperty(block, "offsetHeight", {
        configurable: true,
        value: 20 + index * 5,
      });
      block.style.setProperty("margin-top", `${index + 1}px`);
      block.style.setProperty("margin-bottom", `${index + 2}px`);
    });

    await flushAnimationFrames();

    const expectedHeight =
      10 +
      fixedBlocks.reduce(
        (total, _block, index) =>
          total + 20 + index * 5 + index + 1 + index + 2,
        0,
      );

    expect(
      useTemporaryMiscState.getState()[getParamsFixedHeightKey(sectionId)],
    ).toBe(expectedHeight);
    expect(resizeObservers.length).toBeGreaterThan(0);
    expect(mutationObservers.length).toBeGreaterThan(0);
  });

  it("keeps the LSP waiting flag on the shell boundary above the live dict-area mount seam", async () => {
    const sectionId = "section-group-container-shell-boundary-waiting";

    seedGroupContainerShellBoundaryState({
      sectionId,
      pinnedParamIds: ["pinned-param"],
      unpinnedParamIds: ["unpinned-param"],
    });
    useWaitingForLSPResult.setState((state) => {
      state.parametersRequest[sectionId] = true;
    });

    await act(async () => {
      root.render(
        <GroupContainerShellBoundaryHarness
          bgColor="bg-transparent"
          includeFixedBlocks={false}
          sectionId={sectionId}
          sectionTypeName={SectionTypeEnum.Dict}
          visibleLabels={["pinned-param", "unpinned-param"]}
        />,
      );
    });

    const shell = host.querySelector<HTMLElement>(".section-row-pin-main");

    expect(shell?.dataset.waitingForResult).toBe("true");
    expect(shell?.textContent).toContain("pinned-param");
    expect(shell?.textContent).toContain("unpinned-param");
  });

  it("uses explicit Pixi fixed-height markers without subtree mutation tracking on the canary path", async () => {
    const sectionId = "section-group-container-shell-boundary-pixi";

    seedGroupContainerShellBoundaryState({
      sectionId,
      edgeInputParamIds: ["edge-param"],
      edgeOutputPorts: [{ accessor: "Result", id: "out-1" }],
      pinnedParamIds: ["pinned-param"],
      unpinnedParamIds: ["unpinned-param"],
    });

    await act(async () => {
      root.render(
        <GroupContainerShellBoundaryHarness
          bgColor="bg-transparent"
          renderMode="pixi-node-body"
          sectionId={sectionId}
          sectionTypeName={SectionTypeEnum.Dict}
        />,
      );
    });

    const shell = host.querySelector<HTMLElement>(".section-row-pin-main");
    expect(shell).not.toBeNull();
    Object.defineProperty(shell!, "clientWidth", {
      configurable: true,
      value: 480,
    });
    shell?.style.setProperty("padding-top", "4px");
    shell?.style.setProperty("padding-bottom", "6px");

    const measurementMarkers = Array.from(
      host.querySelectorAll<HTMLElement>(
        "[data-live-dict-area-fixed-measurement]",
      ),
    );
    expect(
      measurementMarkers.map(
        (element) => element.dataset.liveDictAreaFixedMeasurement,
      ),
    ).toEqual(["edges", "pinned"]);
    measurementMarkers.forEach((block, index) => {
      Object.defineProperty(block, "offsetHeight", {
        configurable: true,
        value: 24 + index * 6,
      });
    });

    await flushAnimationFrames();

    expect(
      useTemporaryMiscState.getState()[getParamsFixedHeightKey(sectionId)],
    ).toBe(10 + 24 + 30);
    expect(mutationObservers[0]?.observe).toHaveBeenCalledWith(shell, {
      childList: true,
      subtree: false,
    });
  });
});
