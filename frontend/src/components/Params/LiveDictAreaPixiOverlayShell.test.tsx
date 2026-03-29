/* @vitest-environment jsdom */

import { useReactFlow } from "forks/xyflow/core/store";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { SectionTypeEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildLiveDictAreaMountBoundary } from "./groupContainerLiveDictAreaMountBoundary";
import type { LiveDictAreaSceneBoundary } from "./groupContainerLiveDictAreaSceneBoundary";
import {
  LIVE_DICT_AREA_PIXI_LAYOUT,
  type LiveDictAreaPixiLayout,
} from "./liveDictAreaPixiLayout";
import { LiveDictAreaPixiOverlayShell } from "./LiveDictAreaPixiOverlayShell";
import {
  LiveDictAreaPixiPageRuntimeBoundary,
  useOptionalLiveDictAreaPixiPageRuntime,
} from "./LiveDictAreaPixiPageRuntime";

vi.mock("./groupContainerLiveDictAreaMount", () => ({
  LiveDictAreaMount: () => <div data-param-row="true" />,
}));

vi.hoisted(() => {
  class ResizeObserverMock {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
  }

  globalThis.ResizeObserver =
    ResizeObserverMock as unknown as typeof ResizeObserver;
});

const liveMiscState = vi.hoisted(() => ({
  isSelectingParams: false,
  requestUpdateNodeDimensions: false,
}));
const localStorageState = vi.hoisted(() => ({
  darkMode: false,
}));
const searchState = vi.hoisted(() => ({
  focused: null as { paramInfoId: string; sectionId: string } | null,
  lookup: new Set<string>(),
}));
const temporaryMiscState = vi.hoisted(() => ({}) as Record<string, unknown>);
const typeErrorState = vi.hoisted(() => ({
  errors: {} as Record<string, { params?: Record<string, string[]> }>,
}));
const activeValueRowBaseStateRequests = vi.hoisted(
  () => [] as Array<{ rowId: string; sectionId: string }>,
);
const activeValueRowCoreRequests = vi.hoisted(() => [] as string[]);
const toggleParamSelectedRequests = vi.hoisted(
  () => [] as Array<{ rowId: string; sectionId: string }>,
);
const useMiscStoreMock = vi.hoisted(() => {
  const store = ((selector: (state: typeof liveMiscState) => unknown) =>
    selector(liveMiscState)) as ((
    selector: (state: typeof liveMiscState) => unknown,
  ) => unknown) & {
    setState: ReturnType<typeof vi.fn>;
  };

  store.setState = vi.fn(
    (
      nextState:
        | Partial<typeof liveMiscState>
        | ((state: typeof liveMiscState) => Partial<typeof liveMiscState>),
    ) => {
      Object.assign(
        liveMiscState,
        typeof nextState === "function" ? nextState(liveMiscState) : nextState,
      );
    },
  );

  return store;
});
const projectStateStore = vi.hoisted(() => ({
  projectConfig: {
    showParamDisplayNames: true,
    viewportInitialized: false,
  },
  sections: {
    "draw-section": { name: "drawSectionDefault" },
    "button-param-section": { name: "buttonParamCodeObjDefault" },
    "backend-section": { name: "backend" },
    "browser-section": { name: "browserSectionDefault" },
    "code-param-section": { name: "codeParamCodeObjDefault" },
    "gen-python-metadata-section": { name: "genPythonMetadataSectionDefault" },
    "iframe-section": { name: "iFrameSectionDefault" },
    "prompt-section": { name: "promptSectionDefault" },
    "section-sizing-policy-section": { name: "sectionSizingPolicy" },
    "section-1": { name: "section-1" },
    "section-2": { name: "section-2" },
    "text-block-section": { name: "textBlockSectionDefault" },
  },
}));

vi.mock("./LiveDictAreaPixiScene", async () => {
  const React = await import("react");
  const { buildLiveDictAreaPixiLayout } = await import(
    "./liveDictAreaPixiLayout"
  );

  return {
    LiveDictAreaPixiScene: ({
      edgeRowInteractionState,
      liveDictAreaSceneBoundary,
      onSummaryLayoutChange,
      onWebglContextLost,
      renderBackend,
      sectionId,
      sectionName,
      valueRowInteractionState,
    }: {
      edgeRowInteractionState?: {
        focusedPortId: string | null;
        hoveredPortId: string | null;
        pressedPortId: string | null;
      };
      liveDictAreaSceneBoundary: LiveDictAreaSceneBoundary;
      onSummaryLayoutChange?: (layout: LiveDictAreaPixiLayout | null) => void;
      onWebglContextLost?: () => void;
      renderBackend?: "local-app" | "shared-page-runtime";
      sectionId?: string | null;
      sectionName?: string | null;
      valueRowInteractionState?: {
        focusedRowId: string | null;
        hoveredRowId: string | null;
        pressedRowId: string | null;
      };
    }) => {
      React.useLayoutEffect(() => {
        onSummaryLayoutChange?.(
          buildLiveDictAreaPixiLayout({
            liveDictAreaSceneBoundary,
            maxCanvasHeight: 600,
            width: 320,
          }),
        );
      }, [liveDictAreaSceneBoundary, onSummaryLayoutChange]);

      return (
        <div
          data-live-dict-area-scene="pixi"
          data-live-dict-area-scene-edge-focused-port-id={
            edgeRowInteractionState?.focusedPortId ?? undefined
          }
          data-live-dict-area-scene-edge-hovered-port-id={
            edgeRowInteractionState?.hoveredPortId ?? undefined
          }
          data-live-dict-area-scene-edge-pressed-port-id={
            edgeRowInteractionState?.pressedPortId ?? undefined
          }
          data-live-dict-area-scene-value-focused-row-id={
            valueRowInteractionState?.focusedRowId ?? undefined
          }
          data-live-dict-area-scene-value-hovered-row-id={
            valueRowInteractionState?.hoveredRowId ?? undefined
          }
          data-live-dict-area-scene-value-pressed-row-id={
            valueRowInteractionState?.pressedRowId ?? undefined
          }
          data-live-dict-area-scene-section-id={sectionId ?? undefined}
          data-live-dict-area-scene-section-name={sectionName ?? undefined}
          data-live-dict-area-scene-render-backend={renderBackend}
        >
          <button
            data-live-dict-area-scene-trigger-context-lost="true"
            onClick={() => {
              onWebglContextLost?.();
            }}
            type="button"
          />
        </div>
      );
    },
  };
});

vi.mock("./LiveDictAreaPixiParamAreaOverlay", () => ({
  LiveDictAreaPixiParamAreaOverlay: ({
    target,
  }: {
    target: { blockId: string; rowId: string };
  }) => (
    <div
      data-live-dict-area-drag-overlay="active"
      data-live-dict-area-drag-overlay-block-id={target.blockId}
      data-live-dict-area-drag-overlay-kind="param-list"
      data-live-dict-area-drag-overlay-row-id={target.rowId}
    />
  ),
}));

vi.mock("./LiveDictAreaPixiValueRowOverlay", () => ({
  LiveDictAreaPixiValueRowOverlay: ({
    errorMessage,
    overlaySurface,
    target,
  }: {
    errorMessage: string;
    overlaySurface: "full-row" | "value-only";
    target: { rowId: string };
  }) => (
    <div
      data-live-dict-area-editor-overlay="active"
      data-live-dict-area-editor-overlay-error-message={errorMessage}
      data-live-dict-area-editor-overlay-surface={overlaySurface}
      data-live-dict-area-editor-overlay-row-id={target.rowId}
    />
  ),
}));

vi.mock(import("state/definitions"), async (importOriginal) => {
  const actual = await importOriginal();
  const useProjectStateStore = ((selector: (state: object) => unknown) =>
    selector(projectStateStore)) as ((
    selector: (state: object) => unknown,
  ) => unknown) & {
    getState: () => typeof projectStateStore;
  };
  useProjectStateStore.getState = () => projectStateStore;
  return {
    ...actual,
    useLocalStorage: (selector: (state: typeof localStorageState) => unknown) =>
      selector(localStorageState),
    useMisc: useMiscStoreMock,
    useProjectSearch: (selector: (state: typeof searchState) => unknown) =>
      selector(searchState),
    useProjectState: useProjectStateStore,
    useTemporaryMiscState: (
      selector: (state: typeof temporaryMiscState) => unknown,
    ) => selector(temporaryMiscState),
    useTypeErrors: (selector: (state: typeof typeErrorState) => unknown) =>
      selector(typeErrorState),
  };
});

vi.mock("state/actions/sectionInfos", () => ({
  buildFitViewOnInitState: () => ({
    fitViewOnInit: true,
    fitViewOnInitDone: false,
    fitViewOnInitOptions: { nodes: [{ id: "section-1" }] },
  }),
  getCodeObjCore: (_state: object, rowId: string) => {
    activeValueRowCoreRequests.push(rowId);
    return {
      displayName:
        rowId === "pinned-value"
          ? "Pinned Value Display"
          : "Unpinned Value Display",
      name: rowId,
    };
  },
  getCurrEffectiveCodeObjImplWithTypeGuard: (
    _state: object,
    sectionId: string,
    rowId: string,
  ) => {
    activeValueRowBaseStateRequests.push({ rowId, sectionId });
    return {
      coreNameEditable: rowId === "unpinned-value",
      description:
        rowId === "pinned-value"
          ? "Pinned value description"
          : "Unpinned value description",
    };
  },
  getCurrEffectiveSectionImplWithTypeGuard: () => ({
    selectedParams: ["pinned-value"],
  }),
  toggleParamSelected: (sectionId: string, rowId: string) => {
    toggleParamSelectedRequests.push({ rowId, sectionId });
  },
}));

function buildTestLiveDictAreaMountBoundary(sectionId: string) {
  return buildLiveDictAreaMountBoundary({
    input: {
      bgColor: "bg-transparent",
      canConnect: true,
      edgeInputParams: [],
      getParamEditorKind: (paramId: string) =>
        paramId === "pinned-value" ? "combobox" : "color-picker",
      getParamDisplayName: (paramId: string) =>
        (
          ({
            "pinned-group": "Pinned Group",
            "pinned-value": "Pinned Value",
            "unpinned-group": "Unpinned Group",
            "unpinned-value": "Unpinned Value",
          }) as Record<string, string>
        )[paramId] ?? paramId,
      handleColumnResizeStart: vi.fn(),
      hideUnpinnedParams: false,
      inputPorts: [{ id: "input-a", label: "Input A" }],
      isSelectingParams: false,
      outputPorts: [{ id: "output-a", label: "Output A" }],
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
        configuredMinHeight: 80,
        pinnedRequiredParamIdsToPaths: {
          "pinned-value": ["pinned-group", "pinned-value"],
        },
        pinnedTopLevelParamIds: ["pinned-group"],
        positionAndSizeLocked: false,
        requiredParamIdsToPaths: {
          "unpinned-value": ["unpinned-group", "unpinned-value"],
        },
        topLevelParamIds: ["unpinned-group"],
      },
    },
  });
}

function RuntimeProbe() {
  const runtime = useOptionalLiveDictAreaPixiPageRuntime();

  return (
    <div
      data-live-dict-area-pixi-runtime-count={
        runtime?.registeredSceneCount ?? -1
      }
      data-live-dict-area-pixi-runtime-lost-scene={
        runtime?.contextLostScene?.sectionId ?? ""
      }
      data-live-dict-area-pixi-runtime-render-modes={
        runtime?.registeredScenes
          .map((scene) => `${scene.sectionId ?? ""}:${scene.renderMode}`)
          .join(",") ?? ""
      }
    />
  );
}

describe("LiveDictAreaPixiOverlayShell", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    liveMiscState.isSelectingParams = false;
    liveMiscState.requestUpdateNodeDimensions = false;
    localStorageState.darkMode = false;
    projectStateStore.projectConfig.viewportInitialized = false;
    searchState.focused = null;
    searchState.lookup = new Set<string>();
    for (const key of Object.keys(temporaryMiscState)) {
      delete temporaryMiscState[key];
    }
    typeErrorState.errors = {};
    activeValueRowBaseStateRequests.length = 0;
    activeValueRowCoreRequests.length = 0;
    toggleParamSelectedRequests.length = 0;
    useMiscStoreMock.setState.mockClear();
    useReactFlow.setState({
      fitViewOnInit: false,
      fitViewOnInitDone: true,
      fitViewOnInitOptions: undefined,
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    activeValueRowBaseStateRequests.length = 0;
    activeValueRowCoreRequests.length = 0;
    toggleParamSelectedRequests.length = 0;
    useReactFlow.setState({
      fitViewOnInit: false,
      fitViewOnInitDone: false,
      fitViewOnInitOptions: undefined,
    });
  });

  it("mounts a value-row editor overlay on demand over the Pixi scene canary", () => {
    const liveDictAreaMountBoundary = buildLiveDictAreaMountBoundary({
      input: {
        bgColor: "bg-transparent",
        canConnect: true,
        edgeInputParams: [],
        getParamEditorKind: (paramId: string) =>
          paramId === "pinned-value" ? "combobox" : "color-picker",
        getParamDisplayName: (paramId: string) =>
          (
            ({
              "pinned-group": "Pinned Group",
              "pinned-value": "Pinned Value",
              "unpinned-group": "Unpinned Group",
              "unpinned-value": "Unpinned Value",
            }) as Record<string, string>
          )[paramId] ?? paramId,
        handleColumnResizeStart: vi.fn(),
        hideUnpinnedParams: false,
        inputPorts: [{ id: "input-a", label: "Input A" }],
        isSelectingParams: false,
        outputPorts: [{ id: "output-a", label: "Output A" }],
        paramFilter: "",
        pinned: {
          requiredParamIdsToPaths: {
            "pinned-value": ["pinned-group", "pinned-value"],
          },
          topLevelParamIds: ["pinned-group"],
        },
        positionAndSizeLocked: false,
        sectionId: "section-1",
        sectionTypeName: SectionTypeEnum.Dict,
        selectedParamIds: [],
        styleColor: null,
        unpinned: {
          canEditLayout: true,
          configuredMinHeight: 80,
          pinnedRequiredParamIdsToPaths: {
            "pinned-value": ["pinned-group", "pinned-value"],
          },
          pinnedTopLevelParamIds: ["pinned-group"],
          positionAndSizeLocked: false,
          requiredParamIdsToPaths: {
            "unpinned-value": ["unpinned-group", "unpinned-value"],
          },
          topLevelParamIds: ["unpinned-group"],
        },
      },
    });

    act(() => {
      root.render(
        <LiveDictAreaPixiOverlayShell
          liveDictAreaMountProps={
            liveDictAreaMountBoundary.liveDictAreaMountProps
          }
          liveDictAreaSceneBoundary={
            liveDictAreaMountBoundary.liveDictAreaSceneBoundary
          }
        />,
      );
    });

    expect(
      container.querySelector("[data-live-dict-area-scene='pixi']"),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-live-dict-area-scene='pixi']")
        ?.parentElement?.className,
    ).toContain("overflow-hidden");
    expect(
      container.querySelector("[data-live-dict-area-scene='pixi']")
        ?.parentElement?.className,
    ).toContain("flex-1");
    expect(
      container
        .querySelector("[data-live-dict-area-scene='pixi']")
        ?.parentElement?.getAttribute(
          "data-live-dict-area-pixi-clipping-container",
        ),
    ).toBe("true");
    expect(
      container
        .querySelector("[data-live-dict-area-scene='pixi']")
        ?.getAttribute("data-live-dict-area-scene-section-id"),
    ).toBe("section-1");
    const handoffButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        "[data-live-dict-area-editor-handoff='value-row']",
      ),
    );
    expect(handoffButtons).toHaveLength(2);
    expect(
      container.querySelector("[data-live-dict-area-editor-overlay='active']"),
    ).toBeNull();
    expect(
      container.querySelector(
        "[data-live-dict-area-editor-handoff-editor-kind='combobox']",
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        "[data-live-dict-area-editor-handoff-editor-kind='color-picker']",
      ),
    ).not.toBeNull();
    expect(
      handoffButtons.every((button) => {
        const ariaLabel = button.getAttribute("aria-label");
        return (
          ariaLabel !== null &&
          ariaLabel.length > 0 &&
          !ariaLabel.includes("Activate editor overlay for")
        );
      }),
    ).toBe(true);
    expect(handoffButtons[0]?.style.right).toBe("");
    expect(handoffButtons[0]?.style.width).toBe(
      `${LIVE_DICT_AREA_PIXI_LAYOUT.canvasMinWidth}px`,
    );
    expect(activeValueRowBaseStateRequests).toEqual([]);
    expect(activeValueRowCoreRequests).toEqual([]);
    expect(liveMiscState.requestUpdateNodeDimensions).toBe(true);
    expect(useMiscStoreMock.setState).toHaveBeenCalledWith({
      requestUpdateNodeDimensions: true,
    });

    const activatedRowId =
      handoffButtons[0]?.getAttribute(
        "data-live-dict-area-editor-handoff-row-id",
      ) ?? null;

    act(() => {
      handoffButtons[0]?.click();
    });

    expect(
      container.querySelector("[data-live-dict-area-editor-overlay='active']"),
    ).not.toBeNull();
    expect(
      container
        .querySelector("[data-live-dict-area-editor-overlay='active']")
        ?.getAttribute("data-live-dict-area-editor-overlay-surface"),
    ).toBe("full-row");
    expect(
      container.querySelector(
        `[data-live-dict-area-editor-overlay-row-id='${activatedRowId}']`,
      ),
    ).not.toBeNull();
    expect(activeValueRowBaseStateRequests).toEqual([]);
    expect(activeValueRowCoreRequests).toEqual([]);
  });

  it("falls back to the DOM mount when the live Pixi scene loses its WebGL context", () => {
    const liveDictAreaMountBoundary = buildLiveDictAreaMountBoundary({
      input: {
        bgColor: "bg-transparent",
        canConnect: true,
        edgeInputParams: [],
        getParamEditorKind: (paramId: string) =>
          paramId === "pinned-value" ? "combobox" : "color-picker",
        getParamDisplayName: (paramId: string) =>
          (
            ({
              "pinned-group": "Pinned Group",
              "pinned-value": "Pinned Value",
              "unpinned-group": "Unpinned Group",
              "unpinned-value": "Unpinned Value",
            }) as Record<string, string>
          )[paramId] ?? paramId,
        handleColumnResizeStart: vi.fn(),
        hideUnpinnedParams: false,
        inputPorts: [{ id: "input-a", label: "Input A" }],
        isSelectingParams: false,
        outputPorts: [{ id: "output-a", label: "Output A" }],
        paramFilter: "",
        pinned: {
          requiredParamIdsToPaths: {
            "pinned-value": ["pinned-group", "pinned-value"],
          },
          topLevelParamIds: ["pinned-group"],
        },
        positionAndSizeLocked: false,
        sectionId: "section-1",
        sectionTypeName: SectionTypeEnum.Dict,
        selectedParamIds: [],
        styleColor: null,
        unpinned: {
          canEditLayout: true,
          configuredMinHeight: 80,
          pinnedRequiredParamIdsToPaths: {
            "pinned-value": ["pinned-group", "pinned-value"],
          },
          pinnedTopLevelParamIds: ["pinned-group"],
          positionAndSizeLocked: false,
          requiredParamIdsToPaths: {
            "unpinned-value": ["unpinned-group", "unpinned-value"],
          },
          topLevelParamIds: ["unpinned-group"],
        },
      },
    });

    act(() => {
      root.render(
        <LiveDictAreaPixiOverlayShell
          liveDictAreaMountProps={
            liveDictAreaMountBoundary.liveDictAreaMountProps
          }
          liveDictAreaSceneBoundary={
            liveDictAreaMountBoundary.liveDictAreaSceneBoundary
          }
        />,
      );
    });

    const contextLossTrigger = container.querySelector<HTMLButtonElement>(
      "[data-live-dict-area-scene-trigger-context-lost='true']",
    );
    expect(contextLossTrigger).not.toBeNull();

    act(() => {
      contextLossTrigger?.click();
    });

    expect(
      container.querySelector("[data-live-dict-area-scene='pixi']"),
    ).toBeNull();
    expect(
      container.querySelector(
        "[data-live-dict-area-scene-fallback='dom-context-lost']",
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        "[data-live-dict-area-scene-fallback='dom-context-lost'] [data-param-row='true']",
      ),
    ).not.toBeNull();
  });

  it("registers Pixi shells with the shared page runtime and reports context loss into it", () => {
    const firstBoundary = buildTestLiveDictAreaMountBoundary("section-1");
    const secondBoundary = buildTestLiveDictAreaMountBoundary("section-2");

    act(() => {
      root.render(
        <LiveDictAreaPixiPageRuntimeBoundary>
          <RuntimeProbe />
          <LiveDictAreaPixiOverlayShell
            liveDictAreaMountProps={firstBoundary.liveDictAreaMountProps}
            liveDictAreaSceneBoundary={firstBoundary.liveDictAreaSceneBoundary}
          />
          <LiveDictAreaPixiOverlayShell
            liveDictAreaMountProps={secondBoundary.liveDictAreaMountProps}
            liveDictAreaSceneBoundary={secondBoundary.liveDictAreaSceneBoundary}
          />
        </LiveDictAreaPixiPageRuntimeBoundary>,
      );
    });

    expect(
      container.querySelectorAll("[data-live-dict-area-scene='pixi']"),
    ).toHaveLength(2);
    expect(
      container
        .querySelector("[data-live-dict-area-pixi-runtime-count]")
        ?.getAttribute("data-live-dict-area-pixi-runtime-count"),
    ).toBe("2");
    expect(
      container
        .querySelector("[data-live-dict-area-pixi-runtime-count]")
        ?.getAttribute("data-live-dict-area-pixi-runtime-render-modes"),
    ).toBe("section-1:pixi,section-2:pixi");

    const contextLossTrigger = container.querySelector<HTMLButtonElement>(
      "[data-live-dict-area-scene-trigger-context-lost='true']",
    );
    expect(contextLossTrigger).not.toBeNull();

    act(() => {
      contextLossTrigger?.click();
    });

    expect(
      container.querySelectorAll("[data-live-dict-area-scene='pixi']"),
    ).toHaveLength(1);
    expect(
      container
        .querySelector("[data-live-dict-area-pixi-runtime-count]")
        ?.getAttribute("data-live-dict-area-pixi-runtime-lost-scene"),
    ).toBe("section-1");
    expect(
      container
        .querySelector("[data-live-dict-area-pixi-runtime-count]")
        ?.getAttribute("data-live-dict-area-pixi-runtime-render-modes"),
    ).toBe("section-1:dom-context-lost,section-2:pixi");
    expect(
      container.querySelectorAll(
        "[data-live-dict-area-scene-fallback='dom-context-lost']",
      ),
    ).toHaveLength(1);
    expect(
      container
        .querySelector(
          "[data-live-dict-area-scene-fallback='dom-context-lost']",
        )
        ?.getAttribute("data-live-dict-area-scene-fallback-section-id"),
    ).toBe("section-1");
    expect(
      container
        .querySelector(
          "[data-live-dict-area-scene-fallback='dom-context-lost']",
        )
        ?.getAttribute("data-live-dict-area-scene-fallback-section-name"),
    ).toBe("section-1");
  });

  it("switches the promptSectionDefault canary scene over to the shared page-runtime backend", () => {
    const promptBoundary = buildTestLiveDictAreaMountBoundary("prompt-section");

    act(() => {
      root.render(
        <LiveDictAreaPixiPageRuntimeBoundary>
          <LiveDictAreaPixiOverlayShell
            liveDictAreaMountProps={promptBoundary.liveDictAreaMountProps}
            liveDictAreaSceneBoundary={promptBoundary.liveDictAreaSceneBoundary}
          />
        </LiveDictAreaPixiPageRuntimeBoundary>,
      );
    });

    expect(
      container
        .querySelector("[data-live-dict-area-scene='pixi']")
        ?.getAttribute("data-live-dict-area-scene-render-backend"),
    ).toBe("shared-page-runtime");
    expect(
      container
        .querySelector("[data-live-dict-area-scene='pixi']")
        ?.getAttribute("data-live-dict-area-scene-section-name"),
    ).toBe("promptSectionDefault");
  });

  it("switches the browserSectionDefault canary scene over to the shared page-runtime backend", () => {
    const browserBoundary =
      buildTestLiveDictAreaMountBoundary("browser-section");

    act(() => {
      root.render(
        <LiveDictAreaPixiPageRuntimeBoundary>
          <LiveDictAreaPixiOverlayShell
            liveDictAreaMountProps={browserBoundary.liveDictAreaMountProps}
            liveDictAreaSceneBoundary={
              browserBoundary.liveDictAreaSceneBoundary
            }
          />
        </LiveDictAreaPixiPageRuntimeBoundary>,
      );
    });

    expect(
      container
        .querySelector("[data-live-dict-area-scene='pixi']")
        ?.getAttribute("data-live-dict-area-scene-render-backend"),
    ).toBe("shared-page-runtime");
    expect(
      container
        .querySelector("[data-live-dict-area-scene='pixi']")
        ?.getAttribute("data-live-dict-area-scene-section-name"),
    ).toBe("browserSectionDefault");
  });

  it("switches the textBlockSectionDefault canary scene over to the shared page-runtime backend", () => {
    const textBlockBoundary =
      buildTestLiveDictAreaMountBoundary("text-block-section");

    act(() => {
      root.render(
        <LiveDictAreaPixiPageRuntimeBoundary>
          <LiveDictAreaPixiOverlayShell
            liveDictAreaMountProps={textBlockBoundary.liveDictAreaMountProps}
            liveDictAreaSceneBoundary={
              textBlockBoundary.liveDictAreaSceneBoundary
            }
          />
        </LiveDictAreaPixiPageRuntimeBoundary>,
      );
    });

    expect(
      container
        .querySelector("[data-live-dict-area-scene='pixi']")
        ?.getAttribute("data-live-dict-area-scene-render-backend"),
    ).toBe("shared-page-runtime");
    expect(
      container
        .querySelector("[data-live-dict-area-scene='pixi']")
        ?.getAttribute("data-live-dict-area-scene-section-name"),
    ).toBe("textBlockSectionDefault");
  });

  it("switches the codeParamCodeObjDefault canary scene over to the shared page-runtime backend", () => {
    const codeParamBoundary =
      buildTestLiveDictAreaMountBoundary("code-param-section");

    act(() => {
      root.render(
        <LiveDictAreaPixiPageRuntimeBoundary>
          <LiveDictAreaPixiOverlayShell
            liveDictAreaMountProps={codeParamBoundary.liveDictAreaMountProps}
            liveDictAreaSceneBoundary={
              codeParamBoundary.liveDictAreaSceneBoundary
            }
          />
        </LiveDictAreaPixiPageRuntimeBoundary>,
      );
    });

    expect(
      container
        .querySelector("[data-live-dict-area-scene='pixi']")
        ?.getAttribute("data-live-dict-area-scene-render-backend"),
    ).toBe("shared-page-runtime");
    expect(
      container
        .querySelector("[data-live-dict-area-scene='pixi']")
        ?.getAttribute("data-live-dict-area-scene-section-name"),
    ).toBe("codeParamCodeObjDefault");
  });

  it("switches the sectionSizingPolicy canary scene over to the shared page-runtime backend", () => {
    const sectionSizingPolicyBoundary = buildTestLiveDictAreaMountBoundary(
      "section-sizing-policy-section",
    );

    act(() => {
      root.render(
        <LiveDictAreaPixiPageRuntimeBoundary>
          <LiveDictAreaPixiOverlayShell
            liveDictAreaMountProps={
              sectionSizingPolicyBoundary.liveDictAreaMountProps
            }
            liveDictAreaSceneBoundary={
              sectionSizingPolicyBoundary.liveDictAreaSceneBoundary
            }
          />
        </LiveDictAreaPixiPageRuntimeBoundary>,
      );
    });

    expect(
      container
        .querySelector("[data-live-dict-area-scene='pixi']")
        ?.getAttribute("data-live-dict-area-scene-render-backend"),
    ).toBe("shared-page-runtime");
    expect(
      container
        .querySelector("[data-live-dict-area-scene='pixi']")
        ?.getAttribute("data-live-dict-area-scene-section-name"),
    ).toBe("sectionSizingPolicy");
  });

  it("switches the buttonParamCodeObjDefault canary scene over to the shared page-runtime backend", () => {
    const buttonParamBoundary = buildTestLiveDictAreaMountBoundary(
      "button-param-section",
    );

    act(() => {
      root.render(
        <LiveDictAreaPixiPageRuntimeBoundary>
          <LiveDictAreaPixiOverlayShell
            liveDictAreaMountProps={buttonParamBoundary.liveDictAreaMountProps}
            liveDictAreaSceneBoundary={
              buttonParamBoundary.liveDictAreaSceneBoundary
            }
          />
        </LiveDictAreaPixiPageRuntimeBoundary>,
      );
    });

    expect(
      container
        .querySelector("[data-live-dict-area-scene='pixi']")
        ?.getAttribute("data-live-dict-area-scene-render-backend"),
    ).toBe("shared-page-runtime");
    expect(
      container
        .querySelector("[data-live-dict-area-scene='pixi']")
        ?.getAttribute("data-live-dict-area-scene-section-name"),
    ).toBe("buttonParamCodeObjDefault");
  });

  it("switches the genPythonMetadataSectionDefault canary scene over to the shared page-runtime backend", () => {
    const genPythonMetadataBoundary = buildTestLiveDictAreaMountBoundary(
      "gen-python-metadata-section",
    );

    act(() => {
      root.render(
        <LiveDictAreaPixiPageRuntimeBoundary>
          <LiveDictAreaPixiOverlayShell
            liveDictAreaMountProps={
              genPythonMetadataBoundary.liveDictAreaMountProps
            }
            liveDictAreaSceneBoundary={
              genPythonMetadataBoundary.liveDictAreaSceneBoundary
            }
          />
        </LiveDictAreaPixiPageRuntimeBoundary>,
      );
    });

    expect(
      container
        .querySelector("[data-live-dict-area-scene='pixi']")
        ?.getAttribute("data-live-dict-area-scene-render-backend"),
    ).toBe("shared-page-runtime");
    expect(
      container
        .querySelector("[data-live-dict-area-scene='pixi']")
        ?.getAttribute("data-live-dict-area-scene-section-name"),
    ).toBe("genPythonMetadataSectionDefault");
  });

  it("switches the drawSectionDefault canary scene over to the shared page-runtime backend", () => {
    const drawBoundary = buildTestLiveDictAreaMountBoundary("draw-section");

    act(() => {
      root.render(
        <LiveDictAreaPixiPageRuntimeBoundary>
          <LiveDictAreaPixiOverlayShell
            liveDictAreaMountProps={drawBoundary.liveDictAreaMountProps}
            liveDictAreaSceneBoundary={drawBoundary.liveDictAreaSceneBoundary}
          />
        </LiveDictAreaPixiPageRuntimeBoundary>,
      );
    });

    expect(
      container
        .querySelector("[data-live-dict-area-scene='pixi']")
        ?.getAttribute("data-live-dict-area-scene-render-backend"),
    ).toBe("shared-page-runtime");
    expect(
      container
        .querySelector("[data-live-dict-area-scene='pixi']")
        ?.getAttribute("data-live-dict-area-scene-section-name"),
    ).toBe("drawSectionDefault");
  });

  it("switches the iFrameSectionDefault canary scene over to the shared page-runtime backend", () => {
    const iframeBoundary = buildTestLiveDictAreaMountBoundary("iframe-section");

    act(() => {
      root.render(
        <LiveDictAreaPixiPageRuntimeBoundary>
          <LiveDictAreaPixiOverlayShell
            liveDictAreaMountProps={iframeBoundary.liveDictAreaMountProps}
            liveDictAreaSceneBoundary={iframeBoundary.liveDictAreaSceneBoundary}
          />
        </LiveDictAreaPixiPageRuntimeBoundary>,
      );
    });

    expect(
      container
        .querySelector("[data-live-dict-area-scene='pixi']")
        ?.getAttribute("data-live-dict-area-scene-render-backend"),
    ).toBe("shared-page-runtime");
    expect(
      container
        .querySelector("[data-live-dict-area-scene='pixi']")
        ?.getAttribute("data-live-dict-area-scene-section-name"),
    ).toBe("iFrameSectionDefault");
  });

  it("switches the backend canary scene over to the shared page-runtime backend", () => {
    const backendBoundary =
      buildTestLiveDictAreaMountBoundary("backend-section");

    act(() => {
      root.render(
        <LiveDictAreaPixiPageRuntimeBoundary>
          <LiveDictAreaPixiOverlayShell
            liveDictAreaMountProps={backendBoundary.liveDictAreaMountProps}
            liveDictAreaSceneBoundary={
              backendBoundary.liveDictAreaSceneBoundary
            }
          />
        </LiveDictAreaPixiPageRuntimeBoundary>,
      );
    });

    expect(
      container
        .querySelector("[data-live-dict-area-scene='pixi']")
        ?.getAttribute("data-live-dict-area-scene-render-backend"),
    ).toBe("shared-page-runtime");
    expect(
      container
        .querySelector("[data-live-dict-area-scene='pixi']")
        ?.getAttribute("data-live-dict-area-scene-section-name"),
    ).toBe("backend");
  });

  it("re-arms fit-view when the first Pixi summary layout arrives before the viewport is initialized", () => {
    const liveDictAreaMountBoundary = buildLiveDictAreaMountBoundary({
      input: {
        bgColor: "bg-transparent",
        canConnect: true,
        edgeInputParams: [],
        getParamEditorKind: () => "text",
        getParamDisplayName: (paramId: string) =>
          (
            ({
              "pinned-group": "Pinned Group",
              "pinned-value": "Pinned Value",
              "unpinned-group": "Unpinned Group",
              "unpinned-value": "Unpinned Value",
            }) as Record<string, string>
          )[paramId] ?? paramId,
        handleColumnResizeStart: vi.fn(),
        hideUnpinnedParams: false,
        inputPorts: [],
        isSelectingParams: false,
        outputPorts: [],
        paramFilter: "",
        pinned: {
          requiredParamIdsToPaths: {
            "pinned-value": ["pinned-group", "pinned-value"],
          },
          topLevelParamIds: ["pinned-group"],
        },
        positionAndSizeLocked: false,
        sectionId: "section-1",
        sectionTypeName: SectionTypeEnum.Dict,
        selectedParamIds: [],
        styleColor: null,
        unpinned: {
          canEditLayout: true,
          configuredMinHeight: 80,
          pinnedRequiredParamIdsToPaths: {
            "pinned-value": ["pinned-group", "pinned-value"],
          },
          pinnedTopLevelParamIds: ["pinned-group"],
          positionAndSizeLocked: false,
          requiredParamIdsToPaths: {
            "unpinned-value": ["unpinned-group", "unpinned-value"],
          },
          topLevelParamIds: ["unpinned-group"],
        },
      },
    });

    act(() => {
      root.render(
        <LiveDictAreaPixiOverlayShell
          liveDictAreaMountProps={
            liveDictAreaMountBoundary.liveDictAreaMountProps
          }
          liveDictAreaSceneBoundary={
            liveDictAreaMountBoundary.liveDictAreaSceneBoundary
          }
        />,
      );
    });

    expect(useReactFlow.getState()).toMatchObject({
      fitViewOnInit: true,
      fitViewOnInitDone: false,
      fitViewOnInitOptions: { nodes: [{ id: "section-1" }] },
    });
    expect(useMiscStoreMock.setState).toHaveBeenCalledWith({
      requestUpdateNodeDimensions: true,
    });
  });

  it("keeps the normal CodeMirror handoff on the value-only overlay path without full row state lookups", () => {
    const liveDictAreaMountBoundary = buildLiveDictAreaMountBoundary({
      input: {
        bgColor: "bg-transparent",
        canConnect: true,
        edgeInputParams: [],
        getParamEditorKind: (paramId: string) =>
          paramId === "pinned-value" ? "codemirror" : "color-picker",
        getParamDisplayName: (paramId: string) =>
          (
            ({
              "pinned-group": "Pinned Group",
              "pinned-value": "Pinned Value",
              "unpinned-group": "Unpinned Group",
              "unpinned-value": "Unpinned Value",
            }) as Record<string, string>
          )[paramId] ?? paramId,
        handleColumnResizeStart: vi.fn(),
        hideUnpinnedParams: false,
        inputPorts: [{ id: "input-a", label: "Input A" }],
        isSelectingParams: false,
        outputPorts: [{ id: "output-a", label: "Output A" }],
        paramFilter: "",
        pinned: {
          requiredParamIdsToPaths: {
            "pinned-value": ["pinned-group", "pinned-value"],
          },
          topLevelParamIds: ["pinned-group"],
        },
        positionAndSizeLocked: false,
        sectionId: "section-1",
        sectionTypeName: SectionTypeEnum.Dict,
        selectedParamIds: [],
        styleColor: null,
        unpinned: {
          canEditLayout: true,
          configuredMinHeight: 80,
          pinnedRequiredParamIdsToPaths: {
            "pinned-value": ["pinned-group", "pinned-value"],
          },
          pinnedTopLevelParamIds: ["pinned-group"],
          positionAndSizeLocked: false,
          requiredParamIdsToPaths: {
            "unpinned-value": ["unpinned-group", "unpinned-value"],
          },
          topLevelParamIds: ["unpinned-group"],
        },
      },
    });

    act(() => {
      root.render(
        <LiveDictAreaPixiOverlayShell
          liveDictAreaMountProps={
            liveDictAreaMountBoundary.liveDictAreaMountProps
          }
          liveDictAreaSceneBoundary={
            liveDictAreaMountBoundary.liveDictAreaSceneBoundary
          }
        />,
      );
    });

    const handoffButton = container.querySelector<HTMLButtonElement>(
      "[data-live-dict-area-editor-handoff='value-row'][data-live-dict-area-editor-handoff-editor-kind='codemirror']",
    );
    expect(handoffButton).not.toBeNull();

    act(() => {
      handoffButton?.click();
    });

    expect(
      container
        .querySelector("[data-live-dict-area-editor-overlay='active']")
        ?.getAttribute("data-live-dict-area-editor-overlay-surface"),
    ).toBe("value-only");
    expect(
      container
        .querySelector("[data-live-dict-area-editor-overlay='active']")
        ?.getAttribute("data-live-dict-area-editor-overlay-error-message"),
    ).toBe("");
    expect(activeValueRowBaseStateRequests.length).toBeGreaterThan(0);
    expect(activeValueRowCoreRequests).toEqual([]);
  });

  it("mounts a param-list drag overlay when param selection mode is active", () => {
    liveMiscState.isSelectingParams = true;
    const liveDictAreaMountBoundary = buildLiveDictAreaMountBoundary({
      input: {
        bgColor: "bg-transparent",
        canConnect: true,
        edgeInputParams: [],
        getParamEditorKind: (paramId: string) =>
          paramId === "pinned-value" ? "combobox" : "color-picker",
        getParamDisplayName: (paramId: string) =>
          (
            ({
              "pinned-group": "Pinned Group",
              "pinned-value": "Pinned Value",
              "unpinned-group": "Unpinned Group",
              "unpinned-value": "Unpinned Value",
            }) as Record<string, string>
          )[paramId] ?? paramId,
        handleColumnResizeStart: vi.fn(),
        hideUnpinnedParams: false,
        inputPorts: [{ id: "input-a", label: "Input A" }],
        isSelectingParams: true,
        outputPorts: [{ id: "output-a", label: "Output A" }],
        paramFilter: "",
        pinned: {
          requiredParamIdsToPaths: {
            "pinned-group": ["pinned-group"],
            "pinned-value": ["pinned-group", "pinned-value"],
          },
          topLevelParamIds: ["pinned-group"],
        },
        positionAndSizeLocked: false,
        sectionId: "section-1",
        sectionTypeName: SectionTypeEnum.Dict,
        selectedParamIds: [],
        styleColor: null,
        unpinned: {
          canEditLayout: true,
          configuredMinHeight: 80,
          pinnedRequiredParamIdsToPaths: {
            "pinned-group": ["pinned-group"],
            "pinned-value": ["pinned-group", "pinned-value"],
          },
          pinnedTopLevelParamIds: ["pinned-group"],
          positionAndSizeLocked: false,
          requiredParamIdsToPaths: {
            "unpinned-group": ["unpinned-group"],
            "unpinned-value": ["unpinned-group", "unpinned-value"],
          },
          topLevelParamIds: ["unpinned-group"],
        },
      },
    });

    act(() => {
      root.render(
        <LiveDictAreaPixiOverlayShell
          liveDictAreaMountProps={
            liveDictAreaMountBoundary.liveDictAreaMountProps
          }
          liveDictAreaSceneBoundary={
            liveDictAreaMountBoundary.liveDictAreaSceneBoundary
          }
        />,
      );
    });

    const handoffButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        "[data-live-dict-area-drag-handoff='param-row']",
      ),
    );
    expect(handoffButtons).toHaveLength(4);
    expect(handoffButtons.every((button) => button.style.width !== "")).toBe(
      true,
    );
    expect(
      container.querySelector(
        "[data-live-dict-area-editor-handoff='value-row']",
      ),
    ).toBeNull();

    const activatedRowId =
      handoffButtons[0]?.getAttribute(
        "data-live-dict-area-drag-handoff-row-id",
      ) ?? null;
    const activatedBlockId =
      handoffButtons[0]?.getAttribute(
        "data-live-dict-area-drag-handoff-block-id",
      ) ?? null;

    act(() => {
      handoffButtons[0]?.click();
    });

    expect(
      container.querySelector("[data-live-dict-area-drag-overlay='active']"),
    ).not.toBeNull();
    expect(
      container.querySelector(
        `[data-live-dict-area-drag-overlay-row-id='${activatedRowId}']`,
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        `[data-live-dict-area-drag-overlay-block-id='${activatedBlockId}']`,
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        "[data-live-dict-area-drag-overlay-kind='param-list']",
      ),
    ).not.toBeNull();
  });

  it("mounts selectable edge-row handoff buttons when param selection mode is active", () => {
    liveMiscState.isSelectingParams = true;
    const liveDictAreaMountBoundary = buildLiveDictAreaMountBoundary({
      input: {
        bgColor: "bg-transparent",
        canConnect: true,
        edgeInputParams: [{ id: "input-a", label: "Input A" }],
        getParamEditorKind: () => "other",
        getParamDisplayName: (paramId: string) => paramId,
        getParamValuePresentationKind: () => "text",
        handleColumnResizeStart: vi.fn(),
        hideUnpinnedParams: false,
        inputPorts: [{ id: "input-a", label: "Input A" }],
        isSelectingParams: true,
        outputPorts: [],
        paramFilter: "",
        pinned: {
          requiredParamIdsToPaths: {},
          topLevelParamIds: [],
        },
        positionAndSizeLocked: false,
        sectionId: "section-edge-overlay",
        sectionTypeName: SectionTypeEnum.Dict,
        selectedParamIds: ["input-a"],
        styleColor: null,
        unpinned: {
          canEditLayout: true,
          configuredMinHeight: 80,
          pinnedRequiredParamIdsToPaths: {},
          pinnedTopLevelParamIds: [],
          positionAndSizeLocked: false,
          requiredParamIdsToPaths: {},
          topLevelParamIds: [],
        },
      },
    });

    act(() => {
      root.render(
        <LiveDictAreaPixiOverlayShell
          liveDictAreaMountProps={
            liveDictAreaMountBoundary.liveDictAreaMountProps
          }
          liveDictAreaSceneBoundary={
            liveDictAreaMountBoundary.liveDictAreaSceneBoundary
          }
        />,
      );
    });

    const button = container.querySelector<HTMLButtonElement>(
      "[data-live-dict-area-edge-handoff='input-port'][data-live-dict-area-edge-handoff-port-id='input-a']",
    );

    expect(button).not.toBeNull();
    expect(
      button?.getAttribute("data-live-dict-area-edge-handoff-selected"),
    ).toBe("true");

    act(() => {
      button?.click();
    });

    expect(toggleParamSelectedRequests).toEqual([
      {
        rowId: "input-a",
        sectionId: "section-edge-overlay",
      },
    ]);
  });

  it("propagates value-row hover, focus, and press state into the Pixi scene while editor handoff buttons are active", () => {
    const liveDictAreaMountBoundary = buildLiveDictAreaMountBoundary({
      input: {
        bgColor: "bg-transparent",
        canConnect: true,
        edgeInputParams: [],
        getParamEditorKind: (paramId: string) =>
          paramId === "pinned-value" ? "combobox" : "other",
        getParamDisplayName: (paramId: string) =>
          (
            ({
              "pinned-group": "Pinned Group",
              "pinned-value": "Pinned Value",
              "unpinned-group": "Unpinned Group",
              "unpinned-value": "Unpinned Value",
            }) as Record<string, string>
          )[paramId] ?? paramId,
        getParamValuePresentationKind: () => "text",
        handleColumnResizeStart: vi.fn(),
        hideUnpinnedParams: false,
        inputPorts: [],
        isSelectingParams: false,
        outputPorts: [],
        paramFilter: "",
        pinned: {
          requiredParamIdsToPaths: {
            "pinned-value": ["pinned-group", "pinned-value"],
          },
          topLevelParamIds: ["pinned-group"],
        },
        positionAndSizeLocked: false,
        sectionId: "section-value-state",
        sectionTypeName: SectionTypeEnum.Dict,
        selectedParamIds: [],
        styleColor: null,
        unpinned: {
          canEditLayout: true,
          configuredMinHeight: 80,
          pinnedRequiredParamIdsToPaths: {
            "pinned-value": ["pinned-group", "pinned-value"],
          },
          pinnedTopLevelParamIds: ["pinned-group"],
          positionAndSizeLocked: false,
          requiredParamIdsToPaths: {
            "unpinned-value": ["unpinned-group", "unpinned-value"],
          },
          topLevelParamIds: ["unpinned-group"],
        },
      },
    });

    act(() => {
      root.render(
        <LiveDictAreaPixiOverlayShell
          liveDictAreaMountProps={
            liveDictAreaMountBoundary.liveDictAreaMountProps
          }
          liveDictAreaSceneBoundary={
            liveDictAreaMountBoundary.liveDictAreaSceneBoundary
          }
        />,
      );
    });

    const button = container.querySelector<HTMLButtonElement>(
      "[data-live-dict-area-editor-handoff='value-row'][data-live-dict-area-editor-handoff-row-id='pinned-value']",
    );
    const scene = container.querySelector<HTMLElement>(
      "[data-live-dict-area-scene='pixi']",
    );

    expect(button).not.toBeNull();
    expect(scene).not.toBeNull();

    act(() => {
      button?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(
      scene?.getAttribute("data-live-dict-area-scene-value-hovered-row-id"),
    ).toBe("pinned-value");

    act(() => {
      button?.focus();
    });
    expect(
      scene?.getAttribute("data-live-dict-area-scene-value-focused-row-id"),
    ).toBe("pinned-value");

    act(() => {
      button?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(
      scene?.getAttribute("data-live-dict-area-scene-value-pressed-row-id"),
    ).toBe("pinned-value");

    act(() => {
      button?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      button?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      button?.blur();
    });
    expect(
      scene?.hasAttribute("data-live-dict-area-scene-value-pressed-row-id"),
    ).toBe(false);
    expect(
      scene?.hasAttribute("data-live-dict-area-scene-value-hovered-row-id"),
    ).toBe(false);
    expect(
      scene?.hasAttribute("data-live-dict-area-scene-value-focused-row-id"),
    ).toBe(false);
  });

  it("propagates edge-row hover, focus, and press state into the Pixi scene while param selection is active", () => {
    liveMiscState.isSelectingParams = true;
    const liveDictAreaMountBoundary = buildLiveDictAreaMountBoundary({
      input: {
        bgColor: "bg-transparent",
        canConnect: true,
        edgeInputParams: [{ id: "input-a", label: "Input A" }],
        getParamEditorKind: () => "other",
        getParamDisplayName: (paramId: string) => paramId,
        getParamValuePresentationKind: () => "text",
        handleColumnResizeStart: vi.fn(),
        hideUnpinnedParams: false,
        inputPorts: [{ id: "input-a", label: "Input A" }],
        isSelectingParams: true,
        outputPorts: [],
        paramFilter: "",
        pinned: {
          requiredParamIdsToPaths: {},
          topLevelParamIds: [],
        },
        positionAndSizeLocked: false,
        sectionId: "section-edge-state",
        sectionTypeName: SectionTypeEnum.Dict,
        selectedParamIds: [],
        styleColor: null,
        unpinned: {
          canEditLayout: true,
          configuredMinHeight: 80,
          pinnedRequiredParamIdsToPaths: {},
          pinnedTopLevelParamIds: [],
          positionAndSizeLocked: false,
          requiredParamIdsToPaths: {},
          topLevelParamIds: [],
        },
      },
    });

    act(() => {
      root.render(
        <LiveDictAreaPixiOverlayShell
          liveDictAreaMountProps={
            liveDictAreaMountBoundary.liveDictAreaMountProps
          }
          liveDictAreaSceneBoundary={
            liveDictAreaMountBoundary.liveDictAreaSceneBoundary
          }
        />,
      );
    });

    const button = container.querySelector<HTMLButtonElement>(
      "[data-live-dict-area-edge-handoff='input-port'][data-live-dict-area-edge-handoff-port-id='input-a']",
    );
    const scene = container.querySelector<HTMLElement>(
      "[data-live-dict-area-scene='pixi']",
    );

    expect(button).not.toBeNull();
    expect(scene).not.toBeNull();

    act(() => {
      button?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(
      scene?.getAttribute("data-live-dict-area-scene-edge-hovered-port-id"),
    ).toBe("input-a");

    act(() => {
      button?.focus();
    });
    expect(
      scene?.getAttribute("data-live-dict-area-scene-edge-focused-port-id"),
    ).toBe("input-a");

    act(() => {
      button?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(
      scene?.getAttribute("data-live-dict-area-scene-edge-pressed-port-id"),
    ).toBe("input-a");

    act(() => {
      button?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      button?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      button?.blur();
    });
    expect(
      scene?.hasAttribute("data-live-dict-area-scene-edge-pressed-port-id"),
    ).toBe(false);
    expect(
      scene?.hasAttribute("data-live-dict-area-scene-edge-hovered-port-id"),
    ).toBe(false);
    expect(
      scene?.hasAttribute("data-live-dict-area-scene-edge-focused-port-id"),
    ).toBe(false);
  });
});
