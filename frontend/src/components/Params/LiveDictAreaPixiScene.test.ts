/* @vitest-environment jsdom */

import React, { act } from "react";
import ReactDOMClient, { type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { SectionTypeEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildLiveDictAreaMountBoundary } from "./groupContainerLiveDictAreaMountBoundary";
import {
  configureLiveDictAreaPixiStaticScene,
  LiveDictAreaPixiScene,
} from "./LiveDictAreaPixiScene";
import { LIVE_DICT_AREA_PIXI_OVERVIEW_QUERY_PARAM } from "./liveDictAreaPixiSceneView";

const mockApplicationRender = vi.hoisted(() => vi.fn());
const mockViewportZoom = vi.hoisted(() => ({ value: 1 }));

vi.hoisted(() => {
  class ResizeObserverMock {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
  }

  globalThis.ResizeObserver =
    ResizeObserverMock as unknown as typeof ResizeObserver;
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = vi.fn();
});

vi.mock("forks/xyflow/core/store", () => ({
  useReactFlow: (
    selector: (state: { transform: [number, number, number] }) => unknown,
  ) => selector({ transform: [0, 0, mockViewportZoom.value] }),
}));

vi.mock("state/definitions", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useLocalStorage: (selector: (state: { darkMode: boolean }) => unknown) =>
      selector({ darkMode: false }),
  };
});

vi.mock("pixi.js", () => {
  class MockGraphics {
    children: unknown[] = [];

    addChild(child: unknown) {
      this.children.push(child);
      return child;
    }

    circle() {
      return this;
    }

    destroy() {}

    fill() {
      return this;
    }

    roundRect() {
      return this;
    }

    stroke() {
      return this;
    }
  }

  class MockText {
    text: string;
    x = 0;
    y = 0;

    constructor({ text }: { text: string }) {
      this.text = text;
    }

    destroy() {}

    get width() {
      return this.text.length * 6;
    }
  }

  class MockApplication {
    canvas = document.createElement("canvas");
    renderer = {
      resize: vi.fn(),
    };
    stage = {
      children: [] as unknown[],
      eventMode: "auto",
      interactiveChildren: true,
      addChild: (child: unknown) => {
        this.stage.children.push(child);
        return child;
      },
      removeChildren: () => {
        const children = [...this.stage.children];
        this.stage.children = [];
        return children;
      },
    };

    async init() {}

    destroy() {}

    render = mockApplicationRender;
  }

  return {
    Application: MockApplication,
    Graphics: MockGraphics,
    Text: MockText,
  };
});

describe("configureLiveDictAreaPixiStaticScene", () => {
  it("disables Pixi stage interactivity for the scene-owned dict-area shell", () => {
    const app = {
      canvas: {
        style: {
          pointerEvents: "auto",
        },
      },
      stage: {
        eventMode: "auto",
        interactiveChildren: true,
      },
    };

    configureLiveDictAreaPixiStaticScene(app);

    expect(app.stage.eventMode).toBe("none");
    expect(app.stage.interactiveChildren).toBe(false);
    expect(app.canvas.style.pointerEvents).toBe("none");
  });
});

describe("LiveDictAreaPixiScene", () => {
  let container: HTMLDivElement;
  let root: Root;
  let unhandledRejectionErrors: unknown[];

  beforeEach(() => {
    mockApplicationRender.mockClear();
    mockViewportZoom.value = 1;
    unhandledRejectionErrors = [];
    window.history.replaceState({}, "", "/");
    container = document.createElement("div");
    document.body.append(container);
    root = ReactDOMClient.createRoot(container);

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
  });

  afterEach(() => {
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    window.history.replaceState({}, "", "/");
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders the live Pixi dict-area scene without throwing an unhandled draw error", async () => {
    const getParamValuePresentationKind = (
      paramId: string,
    ): "combobox" | "switch" | "text" => {
      if (paramId === "pinned-value") {
        return "combobox";
      }
      if (paramId === "unpinned-value") {
        return "switch";
      }
      return "text";
    };
    const getParamValuePreview = (paramId: string): string | null => {
      if (paramId === "pinned-value") {
        return "Choice A";
      }
      if (paramId === "unpinned-value") {
        return "true";
      }
      return null;
    };
    const liveDictAreaMountBoundary = buildLiveDictAreaMountBoundary({
      input: {
        bgColor: "bg-transparent",
        canConnect: true,
        edgeInputParams: [{ id: "edge-input", label: "Edge Input" }],
        getParamDisplayName: (paramId: string) =>
          (
            ({
              "pinned-group": "Pinned Group",
              "pinned-value": "Pinned Value",
              "unpinned-group": "Unpinned Group",
              "unpinned-value": "Unpinned Value",
            }) as Record<string, string>
          )[paramId] ?? paramId,
        getParamEditorKind: (paramId: string) =>
          paramId === "pinned-value" ? "combobox" : "other",
        getParamValuePresentationKind,
        getParamValuePreview,
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

    await act(async () => {
      root.render(
        React.createElement(LiveDictAreaPixiScene, {
          liveDictAreaSceneBoundary:
            liveDictAreaMountBoundary.liveDictAreaSceneBoundary,
          sectionId: "section-1",
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockApplicationRender).toHaveBeenCalled();
    expect(unhandledRejectionErrors).toEqual([]);
    expect(
      container.querySelector("[data-live-dict-area-scene='pixi'] canvas"),
    ).not.toBeNull();
    expect(
      container
        .querySelector("[data-live-dict-area-scene='pixi']")
        ?.getAttribute("data-live-dict-area-scene-section-id"),
    ).toBe("section-1");
    expect(
      container
        .querySelector("[data-live-dict-area-scene='pixi']")
        ?.getAttribute("data-live-dict-area-scene-edge-hovered-port-id"),
    ).toBeNull();
    expect(
      container
        .querySelector("[data-live-dict-area-scene='pixi']")
        ?.getAttribute("data-live-dict-area-scene-value-hovered-row-id"),
    ).toBeNull();
    expect(
      container
        .querySelector("[data-live-dict-area-scene='pixi']")
        ?.getAttribute("data-live-dict-area-scene-compact-row-surface"),
    ).toBe("transparent");
    expect(
      container
        .querySelector("[data-live-dict-area-scene='pixi']")
        ?.getAttribute("data-live-dict-area-scene-compact-row-radius"),
    ).toBe("2");
    expect(
      container
        .querySelector("[data-live-dict-area-scene='pixi']")
        ?.getAttribute(
          "data-live-dict-area-scene-compact-row-horizontal-padding",
        ),
    ).toBe("2");
    expect(
      container.querySelectorAll(
        "[data-live-dict-area-scene-block-anchor='true'][data-live-dict-area-scene-section-id='section-1']",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("publishes the current edge-row interaction state on the scene host for canary diagnostics", async () => {
    const liveDictAreaMountBoundary = buildLiveDictAreaMountBoundary({
      input: {
        bgColor: "bg-transparent",
        canConnect: true,
        edgeInputParams: [{ id: "edge-input", label: "Edge Input" }],
        getParamDisplayName: (paramId: string) => paramId,
        getParamEditorKind: () => "other",
        getParamValuePresentationKind: () => "text",
        handleColumnResizeStart: vi.fn(),
        hideUnpinnedParams: false,
        inputPorts: [{ id: "edge-input", label: "Edge Input" }],
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

    await act(async () => {
      root.render(
        React.createElement(LiveDictAreaPixiScene, {
          edgeRowInteractionState: {
            focusedPortId: "edge-input",
            hoveredPortId: "edge-input",
            pressedPortId: "edge-input",
          },
          liveDictAreaSceneBoundary:
            liveDictAreaMountBoundary.liveDictAreaSceneBoundary,
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const scene = container.querySelector("[data-live-dict-area-scene='pixi']");

    expect(
      scene?.getAttribute("data-live-dict-area-scene-edge-focused-port-id"),
    ).toBe("edge-input");
    expect(
      scene?.getAttribute("data-live-dict-area-scene-edge-hovered-port-id"),
    ).toBe("edge-input");
    expect(
      scene?.getAttribute("data-live-dict-area-scene-edge-pressed-port-id"),
    ).toBe("edge-input");
  });

  it("publishes the current value-row interaction state on the scene host for canary diagnostics", async () => {
    const liveDictAreaMountBoundary = buildLiveDictAreaMountBoundary({
      input: {
        bgColor: "bg-transparent",
        canConnect: true,
        edgeInputParams: [],
        getParamDisplayName: (paramId: string) => paramId,
        getParamEditorKind: () => "other",
        getParamValuePresentationKind: () => "text",
        handleColumnResizeStart: vi.fn(),
        hideUnpinnedParams: false,
        inputPorts: [],
        isSelectingParams: false,
        outputPorts: [],
        paramFilter: "",
        pinned: {
          requiredParamIdsToPaths: {
            "value-row": ["value-group", "value-row"],
          },
          topLevelParamIds: ["value-group"],
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
            "value-row": ["value-group", "value-row"],
          },
          pinnedTopLevelParamIds: ["value-group"],
          positionAndSizeLocked: false,
          requiredParamIdsToPaths: {},
          topLevelParamIds: [],
        },
      },
    });

    await act(async () => {
      root.render(
        React.createElement(LiveDictAreaPixiScene, {
          liveDictAreaSceneBoundary:
            liveDictAreaMountBoundary.liveDictAreaSceneBoundary,
          valueRowInteractionState: {
            focusedRowId: "value-row",
            hoveredRowId: "value-row",
            pressedRowId: "value-row",
          },
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const scene = container.querySelector("[data-live-dict-area-scene='pixi']");

    expect(
      scene?.getAttribute("data-live-dict-area-scene-value-focused-row-id"),
    ).toBe("value-row");
    expect(
      scene?.getAttribute("data-live-dict-area-scene-value-hovered-row-id"),
    ).toBe("value-row");
    expect(
      scene?.getAttribute("data-live-dict-area-scene-value-pressed-row-id"),
    ).toBe("value-row");
  });

  it("keeps the mounted scene host in detail presentation mode by default when the flow viewport is heavily zoomed out", async () => {
    mockViewportZoom.value = 0.12;
    const liveDictAreaMountBoundary = buildLiveDictAreaMountBoundary({
      input: {
        bgColor: "bg-transparent",
        canConnect: true,
        edgeInputParams: [],
        getParamDisplayName: (paramId: string) =>
          (
            ({
              "unpinned-group": "Unpinned Group",
              "unpinned-value": "Unpinned Value",
            }) as Record<string, string>
          )[paramId] ?? paramId,
        getParamEditorKind: () => "other",
        getParamValuePresentationKind: () => "text",
        handleColumnResizeStart: vi.fn(),
        hideUnpinnedParams: false,
        inputPorts: [],
        isSelectingParams: false,
        outputPorts: [],
        paramFilter: "",
        pinned: {
          requiredParamIdsToPaths: {},
          topLevelParamIds: [],
        },
        positionAndSizeLocked: false,
        sectionId: "section-overview",
        sectionTypeName: SectionTypeEnum.Dict,
        selectedParamIds: [],
        styleColor: null,
        unpinned: {
          canEditLayout: true,
          configuredMinHeight: 80,
          pinnedRequiredParamIdsToPaths: {},
          pinnedTopLevelParamIds: [],
          positionAndSizeLocked: false,
          requiredParamIdsToPaths: {
            "unpinned-value": ["unpinned-group", "unpinned-value"],
          },
          topLevelParamIds: ["unpinned-group"],
        },
      },
    });

    await act(async () => {
      root.render(
        React.createElement(LiveDictAreaPixiScene, {
          liveDictAreaSceneBoundary:
            liveDictAreaMountBoundary.liveDictAreaSceneBoundary,
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      container
        .querySelector("[data-live-dict-area-scene='pixi']")
        ?.getAttribute("data-live-dict-area-scene-presentation-mode"),
    ).toBe("detail");
  });

  it("restores the overview presentation mode only for the explicit query-param opt-in", async () => {
    window.history.replaceState(
      {},
      "",
      `/?${LIVE_DICT_AREA_PIXI_OVERVIEW_QUERY_PARAM}=enabled`,
    );
    mockViewportZoom.value = 0.12;
    const liveDictAreaMountBoundary = buildLiveDictAreaMountBoundary({
      input: {
        bgColor: "bg-transparent",
        canConnect: true,
        edgeInputParams: [],
        getParamDisplayName: (paramId: string) =>
          (
            ({
              "unpinned-group": "Unpinned Group",
              "unpinned-value": "Unpinned Value",
            }) as Record<string, string>
          )[paramId] ?? paramId,
        getParamEditorKind: () => "other",
        getParamValuePresentationKind: () => "text",
        handleColumnResizeStart: vi.fn(),
        hideUnpinnedParams: false,
        inputPorts: [],
        isSelectingParams: false,
        outputPorts: [],
        paramFilter: "",
        pinned: {
          requiredParamIdsToPaths: {},
          topLevelParamIds: [],
        },
        positionAndSizeLocked: false,
        sectionId: "section-overview-opt-in",
        sectionTypeName: SectionTypeEnum.Dict,
        selectedParamIds: [],
        styleColor: null,
        unpinned: {
          canEditLayout: true,
          configuredMinHeight: 80,
          pinnedRequiredParamIdsToPaths: {},
          pinnedTopLevelParamIds: [],
          positionAndSizeLocked: false,
          requiredParamIdsToPaths: {
            "unpinned-value": ["unpinned-group", "unpinned-value"],
          },
          topLevelParamIds: ["unpinned-group"],
        },
      },
    });

    await act(async () => {
      root.render(
        React.createElement(LiveDictAreaPixiScene, {
          liveDictAreaSceneBoundary:
            liveDictAreaMountBoundary.liveDictAreaSceneBoundary,
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      container
        .querySelector("[data-live-dict-area-scene='pixi']")
        ?.getAttribute("data-live-dict-area-scene-presentation-mode"),
    ).toBe("overview");
  });

  it("prevents default WebGL context loss handling and reports the loss to the owner", async () => {
    const onWebglContextLost = vi.fn();
    const getParamValuePresentationKind = (
      paramId: string,
    ): "combobox" | "switch" | "text" => {
      if (paramId === "pinned-value") {
        return "combobox";
      }
      if (paramId === "unpinned-value") {
        return "switch";
      }
      return "text";
    };
    const getParamValuePreview = (paramId: string): string | null => {
      if (paramId === "pinned-value") {
        return "Choice A";
      }
      if (paramId === "unpinned-value") {
        return "true";
      }
      return null;
    };
    const liveDictAreaMountBoundary = buildLiveDictAreaMountBoundary({
      input: {
        bgColor: "bg-transparent",
        canConnect: true,
        edgeInputParams: [{ id: "edge-input", label: "Edge Input" }],
        getParamDisplayName: (paramId: string) =>
          (
            ({
              "pinned-group": "Pinned Group",
              "pinned-value": "Pinned Value",
              "unpinned-group": "Unpinned Group",
              "unpinned-value": "Unpinned Value",
            }) as Record<string, string>
          )[paramId] ?? paramId,
        getParamEditorKind: (paramId: string) =>
          paramId === "pinned-value" ? "combobox" : "other",
        getParamValuePresentationKind,
        getParamValuePreview,
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

    await act(async () => {
      root.render(
        React.createElement(LiveDictAreaPixiScene, {
          liveDictAreaSceneBoundary:
            liveDictAreaMountBoundary.liveDictAreaSceneBoundary,
          onWebglContextLost,
          sectionId: "section-1",
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    let sceneCanvas = container.querySelector("canvas");
    if (!sceneCanvas) {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      sceneCanvas = container.querySelector("canvas");
    }
    expect(sceneCanvas).not.toBeNull();

    const contextLossEvent = new Event("webglcontextlost", {
      cancelable: true,
    });

    act(() => {
      sceneCanvas?.dispatchEvent(contextLossEvent);
    });

    expect(contextLossEvent.defaultPrevented).toBe(true);
    expect(onWebglContextLost).toHaveBeenCalledTimes(1);
  });

  function handleUnhandledRejection(event: PromiseRejectionEvent) {
    unhandledRejectionErrors.push(event.reason);
    event.preventDefault();
  }
});
