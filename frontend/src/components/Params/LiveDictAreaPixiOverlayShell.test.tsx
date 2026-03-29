/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { SectionTypeEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildLiveDictAreaMountBoundary } from "./groupContainerLiveDictAreaMountBoundary";
import type { LiveDictAreaSceneBoundary } from "./groupContainerLiveDictAreaSceneBoundary";
import type { LiveDictAreaPixiLayout } from "./liveDictAreaPixiLayout";
import { LiveDictAreaPixiOverlayShell } from "./LiveDictAreaPixiOverlayShell";

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
      sectionId,
      valueRowInteractionState,
    }: {
      edgeRowInteractionState?: {
        focusedPortId: string | null;
        hoveredPortId: string | null;
        pressedPortId: string | null;
      };
      liveDictAreaSceneBoundary: LiveDictAreaSceneBoundary;
      onSummaryLayoutChange?: (layout: LiveDictAreaPixiLayout | null) => void;
      sectionId?: string | null;
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
        />
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
  return {
    ...actual,
    useLocalStorage: (selector: (state: typeof localStorageState) => unknown) =>
      selector(localStorageState),
    useMisc: (selector: (state: typeof liveMiscState) => unknown) =>
      selector(liveMiscState),
    useProjectSearch: (selector: (state: typeof searchState) => unknown) =>
      selector(searchState),
    useProjectState: (selector: (state: object) => unknown) =>
      selector({
        projectConfig: {
          showParamDisplayNames: true,
        },
      }),
    useTemporaryMiscState: (
      selector: (state: typeof temporaryMiscState) => unknown,
    ) => selector(temporaryMiscState),
    useTypeErrors: (selector: (state: typeof typeErrorState) => unknown) =>
      selector(typeErrorState),
  };
});

vi.mock("state/actions/sectionInfos", () => ({
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

describe("LiveDictAreaPixiOverlayShell", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    liveMiscState.isSelectingParams = false;
    localStorageState.darkMode = false;
    searchState.focused = null;
    searchState.lookup = new Set<string>();
    for (const key of Object.keys(temporaryMiscState)) {
      delete temporaryMiscState[key];
    }
    typeErrorState.errors = {};
    activeValueRowBaseStateRequests.length = 0;
    activeValueRowCoreRequests.length = 0;
    toggleParamSelectedRequests.length = 0;
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
    expect(handoffButtons[0]?.style.width).toBe("296px");
    expect(activeValueRowBaseStateRequests).toEqual([]);
    expect(activeValueRowCoreRequests).toEqual([]);

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
