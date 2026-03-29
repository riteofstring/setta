/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { CodeObjTypeEnum, SectionTypeEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildLiveDictAreaMountBoundary } from "./groupContainerLiveDictAreaMountBoundary";
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

vi.mock("./LiveDictAreaPixiScene", () => ({
  LiveDictAreaPixiScene: () => <div data-live-dict-area-scene="pixi" />,
}));

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
    rowState,
    target,
  }: {
    rowState: { paramName: string };
    target: { rowId: string };
  }) => (
    <div
      data-live-dict-area-editor-overlay="active"
      data-live-dict-area-editor-overlay-param-name={rowState.paramName}
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
  getCodeObjCore: (_state: object, rowId: string) => ({
    displayName:
      rowId === "pinned-value"
        ? "Pinned Value Display"
        : "Unpinned Value Display",
    name: rowId,
  }),
  getCurrEffectiveCodeObjImpl: (
    _state: object,
    _sectionId: string,
    rowId: string,
  ) => ({
    ...(rowId === "pinned-value"
      ? {
          type: CodeObjTypeEnum.DropdownParam,
        }
      : {
          colorChoices: [
            { color: "#ff0000", description: "Red" },
            { color: "#00ff00", description: "Green" },
          ],
          type: CodeObjTypeEnum.ColorPickerParam,
        }),
  }),
  getCurrEffectiveCodeObjImplWithTypeGuard: (
    _state: object,
    _sectionId: string,
    rowId: string,
  ) => ({
    coreNameEditable: rowId === "unpinned-value",
    description:
      rowId === "pinned-value"
        ? "Pinned value description"
        : "Unpinned value description",
  }),
  getCurrEffectiveSectionImplWithTypeGuard: () => ({
    selectedParams: ["pinned-value"],
  }),
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
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("mounts a value-row editor overlay on demand over the Pixi scene canary", () => {
    const liveDictAreaMountBoundary = buildLiveDictAreaMountBoundary({
      input: {
        bgColor: "bg-transparent",
        canConnect: true,
        edgeInputParams: [],
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
        ?.getAttribute("data-live-dict-area-editor-overlay-param-name"),
    ).toBe("Pinned Value Display");
    expect(
      container.querySelector(
        `[data-live-dict-area-editor-overlay-row-id='${activatedRowId}']`,
      ),
    ).not.toBeNull();
  });

  it("mounts a param-list drag overlay when param selection mode is active", () => {
    liveMiscState.isSelectingParams = true;
    const liveDictAreaMountBoundary = buildLiveDictAreaMountBoundary({
      input: {
        bgColor: "bg-transparent",
        canConnect: true,
        edgeInputParams: [],
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
});
