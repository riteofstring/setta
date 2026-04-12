/* @vitest-environment jsdom */

import { getViewport } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import initialReactFlowState from "forks/xyflow/core/store/initialState";
import { act, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useLocalStorage, useMisc } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveSettingsGraphSubstrateCanarySceneSnapshot,
  type SettingsGraphSubstrateCanarySceneSnapshot,
} from "./settingsGraphSubstrateCanarySceneSnapshot";
import {
  fitSettingsGraphSubstrateCanaryViewport,
  resolveSettingsGraphSubstrateCanaryEffectivePaneWidths,
  resolveSettingsGraphSubstrateCanaryVisibleViewportSize,
} from "./settingsGraphSubstrateCanaryViewport";
import { useSettingsGraphSubstrateCanaryViewportRuntime } from "./settingsGraphSubstrateCanaryViewportRuntime";
import type { GraphViewport } from "./viewportTransform";

type ResizeObserverController = {
  trigger: (
    entries: Array<{
      element: HTMLElement;
      height: number;
      width: number;
    }>,
  ) => Promise<void>;
};

function ViewportRuntimeProbe({
  localViewport,
  onRender,
  onRuntime,
  sceneSnapshot,
  sharedProjectViewport,
}: {
  localViewport: GraphViewport | null;
  onRender?: () => void;
  onRuntime?: (
    runtime: ReturnType<typeof useSettingsGraphSubstrateCanaryViewportRuntime>,
  ) => void;
  sceneSnapshot: SettingsGraphSubstrateCanarySceneSnapshot;
  sharedProjectViewport: GraphViewport | null;
}) {
  onRender?.();
  const rootRef = useRef<HTMLDivElement>(null);
  const runtime = useSettingsGraphSubstrateCanaryViewportRuntime({
    defaultZoomLevel: 1,
    maxZoom: 4,
    minZoom: 0.1,
    overviewTrueWidth: 420,
    rootRef,
    sceneSnapshot,
    sharedProjectViewport,
    uiEditorTrueWidth: 260,
  });

  useEffect(() => {
    onRuntime?.(runtime);
  }, [onRuntime, runtime]);

  useEffect(() => {
    if (!localViewport) {
      return;
    }
    runtime.commitLocalViewport(localViewport);
  }, [localViewport, runtime]);

  return (
    <div
      ref={rootRef}
      data-testid="viewport-runtime-probe"
      data-viewport={JSON.stringify(runtime.resolvedViewport)}
      style={{ width: "100%", height: "100%" }}
    />
  );
}

describe("useSettingsGraphSubstrateCanaryViewportRuntime", () => {
  let host: HTMLDivElement;
  let root: Root;
  let resizeObserverController: ResizeObserverController;

  beforeEach(() => {
    resetProjectStores();
    useReactFlow.setState({
      ...initialReactFlowState,
      fitViewOnInit: false,
      fitViewOnInitDone: false,
    });
    useLocalStorage.setState({
      overviewVis: false,
      overviewTrueWidth: 420,
      uiEditorVis: false,
      uiEditorTrueWidth: 260,
    });
    resizeObserverController = installResizeObserverMock();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
    resetProjectStores();
    useReactFlow.setState({ ...initialReactFlowState });
    vi.unstubAllGlobals();
  });

  it("auto-fits the authoritative scene snapshot and syncs the shared viewport controller", async () => {
    await act(async () => {
      root.render(
        <ViewportRuntimeProbe
          localViewport={null}
          sceneSnapshot={createSceneSnapshot()}
          sharedProjectViewport={null}
        />,
      );
    });

    const probe = readViewportProbe(host);
    await resizeObserverController.trigger([
      {
        element: probe,
        height: 600,
        width: 1000,
      },
    ]);

    const effectivePaneWidths =
      resolveSettingsGraphSubstrateCanaryEffectivePaneWidths({
        overviewVisible: false,
        overviewTrueWidth: 420,
        uiEditorVisible: false,
        uiEditorTrueWidth: 260,
      });
    const expectedViewport = fitSettingsGraphSubstrateCanaryViewport(
      { x: 120, y: 80, width: 240, height: 160 },
      { width: 1000, height: 600 },
      {
        defaultZoomLevel: 1,
        maxZoom: 4,
        minZoom: 0.1,
        overviewWidth: effectivePaneWidths.overviewWidth,
        uiEditorWidth: effectivePaneWidths.uiEditorWidth,
      },
    );

    await vi.waitFor(() => {
      expect(readResolvedViewport(host)).toEqual(expectedViewport);
    });

    const reactFlowState = useReactFlow.getState();
    expect(reactFlowState.transform).toEqual([
      expectedViewport.x,
      expectedViewport.y,
      expectedViewport.zoom,
    ]);
    expect(reactFlowState.viewportController).not.toBeNull();
    expect(reactFlowState.width).toBe(
      resolveSettingsGraphSubstrateCanaryVisibleViewportSize(
        { width: 1000, height: 600 },
        effectivePaneWidths.overviewWidth,
        effectivePaneWidths.uiEditorWidth,
      ).width,
    );
    expect(reactFlowState.viewportPersistenceEnabled).toBe(false);
  });

  it("auto-fits the authoritative subset when another section has not resolved current geometry yet", async () => {
    const sceneSnapshot = resolveSettingsGraphSubstrateCanarySceneSnapshot(
      [
        {
          sectionId: "section-a",
          position: { x: 120, y: 80 },
          width: 240,
          height: 160,
          zIndex: 2,
          tempZIndex: 2,
          positionAndSizeLocked: false,
        },
        {
          sectionId: "section-b",
          position: { x: 720, y: 320 },
          width: null,
          height: null,
          zIndex: 1,
          tempZIndex: 1,
          positionAndSizeLocked: false,
        },
      ],
      null,
      null,
    );

    await act(async () => {
      root.render(
        <ViewportRuntimeProbe
          localViewport={null}
          sceneSnapshot={sceneSnapshot}
          sharedProjectViewport={null}
        />,
      );
    });

    const probe = readViewportProbe(host);
    await resizeObserverController.trigger([
      {
        element: probe,
        height: 600,
        width: 1000,
      },
    ]);

    const effectivePaneWidths =
      resolveSettingsGraphSubstrateCanaryEffectivePaneWidths({
        overviewVisible: false,
        overviewTrueWidth: 420,
        uiEditorVisible: false,
        uiEditorTrueWidth: 260,
      });
    const expectedViewport = fitSettingsGraphSubstrateCanaryViewport(
      { x: 120, y: 80, width: 240, height: 160 },
      { width: 1000, height: 600 },
      {
        defaultZoomLevel: 1,
        maxZoom: 4,
        minZoom: 0.1,
        overviewWidth: effectivePaneWidths.overviewWidth,
        uiEditorWidth: effectivePaneWidths.uiEditorWidth,
      },
    );

    await vi.waitFor(() => {
      expect(readResolvedViewport(host)).toEqual(expectedViewport);
    });
  });

  it("restores a shared backend viewport instead of auto-fitting over it", async () => {
    const sharedViewport = { x: 320, y: -180, zoom: 0.42 };

    await act(async () => {
      root.render(
        <ViewportRuntimeProbe
          localViewport={null}
          sceneSnapshot={createSceneSnapshot()}
          sharedProjectViewport={sharedViewport}
        />,
      );
    });

    await resizeObserverController.trigger([
      {
        element: readViewportProbe(host),
        height: 600,
        width: 1000,
      },
    ]);

    await vi.waitFor(() => {
      expect(readResolvedViewport(host)).toEqual(sharedViewport);
    });

    const reactFlowState = useReactFlow.getState();
    expect(reactFlowState.transform).toEqual([
      sharedViewport.x,
      sharedViewport.y,
      sharedViewport.zoom,
    ]);
    expect(reactFlowState.viewportPersistenceEnabled).toBe(true);
  });

  it("mirrors viewport interaction activity onto the canary root attribute", async () => {
    let latestRuntime: ReturnType<
      typeof useSettingsGraphSubstrateCanaryViewportRuntime
    > | null = null;

    await act(async () => {
      root.render(
        <ViewportRuntimeProbe
          localViewport={null}
          onRuntime={(runtime) => {
            latestRuntime = runtime;
          }}
          sceneSnapshot={createSceneSnapshot()}
          sharedProjectViewport={null}
        />,
      );
    });

    const probe = readViewportProbe(host);
    await resizeObserverController.trigger([
      {
        element: probe,
        height: 600,
        width: 1000,
      },
    ]);

    await vi.waitFor(() => {
      expect(latestRuntime?.resolvedViewport).not.toBeNull();
    });

    expect(probe.getAttribute("data-viewport-interaction-active")).toBe(null);

    await act(async () => {
      latestRuntime?.syncViewportInteractionState({
        isPanScrolling: false,
        isViewportPanning: true,
        isWheelZooming: false,
      });
    });

    expect(probe.getAttribute("data-viewport-interaction-active")).toBe("true");

    await act(async () => {
      latestRuntime?.syncViewportInteractionState({
        isPanScrolling: false,
        isViewportPanning: false,
        isWheelZooming: false,
      });
    });

    expect(probe.getAttribute("data-viewport-interaction-active")).toBe(
      "false",
    );
  });

  it("skips redundant misc store writes when the viewport interaction pan state does not change", async () => {
    let latestRuntime: ReturnType<
      typeof useSettingsGraphSubstrateCanaryViewportRuntime
    > | null = null;
    const setMiscStateSpy = vi.spyOn(useMisc, "setState");

    await act(async () => {
      root.render(
        <ViewportRuntimeProbe
          localViewport={null}
          onRuntime={(runtime) => {
            latestRuntime = runtime;
          }}
          sceneSnapshot={createSceneSnapshot()}
          sharedProjectViewport={null}
        />,
      );
    });

    await resizeObserverController.trigger([
      {
        element: readViewportProbe(host),
        height: 600,
        width: 1000,
      },
    ]);

    await vi.waitFor(() => {
      expect(latestRuntime?.resolvedViewport).not.toBeNull();
    });

    await act(async () => {
      latestRuntime?.syncViewportInteractionState({
        isPanScrolling: false,
        isViewportPanning: true,
        isWheelZooming: false,
      });
      latestRuntime?.syncViewportInteractionState({
        isPanScrolling: false,
        isViewportPanning: true,
        isWheelZooming: false,
      });
      latestRuntime?.syncViewportInteractionState({
        isPanScrolling: false,
        isViewportPanning: false,
        isWheelZooming: false,
      });
      latestRuntime?.syncViewportInteractionState({
        isPanScrolling: false,
        isViewportPanning: false,
        isWheelZooming: false,
      });
    });

    expect(setMiscStateSpy).toHaveBeenCalledTimes(2);
    expect(setMiscStateSpy).toHaveBeenNthCalledWith(1, {
      isPanScrolling: true,
    });
    expect(setMiscStateSpy).toHaveBeenNthCalledWith(2, {
      isPanScrolling: false,
    });
  });

  it("does not mirror canary viewport interaction flags into the React Flow store", async () => {
    let latestRuntime: ReturnType<
      typeof useSettingsGraphSubstrateCanaryViewportRuntime
    > | null = null;
    useReactFlow.setState({
      paneDragging: true,
      viewportInteractionActive: true,
    });

    await act(async () => {
      root.render(
        <ViewportRuntimeProbe
          localViewport={null}
          onRuntime={(runtime) => {
            latestRuntime = runtime;
          }}
          sceneSnapshot={createSceneSnapshot()}
          sharedProjectViewport={null}
        />,
      );
    });

    await resizeObserverController.trigger([
      {
        element: readViewportProbe(host),
        height: 600,
        width: 1000,
      },
    ]);

    await vi.waitFor(() => {
      expect(latestRuntime?.resolvedViewport).not.toBeNull();
    });

    await act(async () => {
      latestRuntime?.syncViewportInteractionState({
        isPanScrolling: false,
        isViewportPanning: false,
        isWheelZooming: false,
      });
    });

    const reactFlowState = useReactFlow.getState();
    expect(reactFlowState.paneDragging).toBe(true);
    expect(reactFlowState.viewportInteractionActive).toBe(true);
  });

  it("seeds the canary viewport from the current React Flow transform without auto-fitting over it", async () => {
    const reactFlowViewport = { x: 320, y: -180, zoom: 0.42 };
    useReactFlow.setState({
      fitViewOnInit: false,
      fitViewOnInitDone: true,
      transform: [
        reactFlowViewport.x,
        reactFlowViewport.y,
        reactFlowViewport.zoom,
      ],
    });

    await act(async () => {
      root.render(
        <ViewportRuntimeProbe
          localViewport={null}
          sceneSnapshot={createSceneSnapshot()}
          sharedProjectViewport={null}
        />,
      );
    });

    await resizeObserverController.trigger([
      {
        element: readViewportProbe(host),
        height: 600,
        width: 1000,
      },
    ]);

    await vi.waitFor(() => {
      expect(readResolvedViewport(host)).toEqual(reactFlowViewport);
    });
  });

  it("uses the authoritative rendered scene position for the provisional fallback seed", async () => {
    await act(async () => {
      root.render(
        <ViewportRuntimeProbe
          localViewport={null}
          sceneSnapshot={createSceneSnapshot({
            position: { x: 120, y: 80 },
            renderedPosition: { x: 480, y: 240 },
            sceneBoundsSize: null,
            sceneBounds: null,
          })}
          sharedProjectViewport={null}
        />,
      );
    });

    expect(readResolvedViewport(host)).toEqual({
      x: -432,
      y: -192,
      zoom: 1,
    });
  });

  it("treats local interaction writes as the new authoritative viewport owner", async () => {
    const localViewport = { x: -140, y: 88, zoom: 1.6 };

    await act(async () => {
      root.render(
        <ViewportRuntimeProbe
          localViewport={localViewport}
          sceneSnapshot={createSceneSnapshot()}
          sharedProjectViewport={null}
        />,
      );
    });

    await resizeObserverController.trigger([
      {
        element: readViewportProbe(host),
        height: 600,
        width: 1000,
      },
    ]);

    await vi.waitFor(() => {
      expect(readResolvedViewport(host)).toEqual(localViewport);
    });

    const reactFlowState = useReactFlow.getState();
    expect(reactFlowState.transform).toEqual([
      localViewport.x,
      localViewport.y,
      localViewport.zoom,
    ]);
    expect(reactFlowState.viewportPersistenceEnabled).toBe(true);
  });

  it("ignores mirrored React Flow transform updates while a local viewport owner is active", async () => {
    const localViewport = { x: -140, y: 88, zoom: 1.6 };
    const renderSpy = vi.fn();

    await act(async () => {
      root.render(
        <ViewportRuntimeProbe
          localViewport={localViewport}
          onRender={renderSpy}
          sceneSnapshot={createSceneSnapshot()}
          sharedProjectViewport={null}
        />,
      );
    });

    await vi.waitFor(() => {
      expect(readResolvedViewport(host)).toEqual(localViewport);
    });
    renderSpy.mockClear();

    await act(async () => {
      useReactFlow.setState({
        transform: [640, -320, 0.75],
      });
    });

    await act(async () => {});

    expect(readResolvedViewport(host)).toEqual(localViewport);
    expect(renderSpy).not.toHaveBeenCalled();
  });

  it("keeps pan-only canary motion authoritative without republishing the React Flow transform", async () => {
    const initialViewport = { x: 40, y: -20, zoom: 1.25 };
    const panOnlyViewport = { x: 180, y: 60, zoom: 1.25 };

    await act(async () => {
      root.render(
        <ViewportRuntimeProbe
          localViewport={initialViewport}
          sceneSnapshot={createSceneSnapshot()}
          sharedProjectViewport={null}
        />,
      );
    });

    await resizeObserverController.trigger([
      {
        element: readViewportProbe(host),
        height: 600,
        width: 1000,
      },
    ]);

    await vi.waitFor(() => {
      expect(readResolvedViewport(host)).toEqual(initialViewport);
    });
    expect(useReactFlow.getState().transform).toEqual([
      initialViewport.x,
      initialViewport.y,
      initialViewport.zoom,
    ]);

    await act(async () => {
      root.render(
        <ViewportRuntimeProbe
          localViewport={panOnlyViewport}
          sceneSnapshot={createSceneSnapshot()}
          sharedProjectViewport={null}
        />,
      );
    });

    await vi.waitFor(() => {
      expect(readResolvedViewport(host)).toEqual(panOnlyViewport);
    });

    expect(useReactFlow.getState().transform).toEqual([
      initialViewport.x,
      initialViewport.y,
      initialViewport.zoom,
    ]);
    expect(getViewport()).toEqual(panOnlyViewport);
  });
});

function createSceneSnapshot({
  position = { x: 120, y: 80 },
  renderedPosition = position,
  sceneBoundsSize = { width: 240, height: 160 },
  sceneBounds = {
    x: renderedPosition.x,
    y: renderedPosition.y,
    width: sceneBoundsSize?.width ?? 0,
    height: sceneBoundsSize?.height ?? 0,
  },
}: {
  position?: { x: number; y: number };
  renderedPosition?: { x: number; y: number };
  sceneBoundsSize?: { width: number; height: number } | null;
  sceneBounds?: SettingsGraphSubstrateCanarySceneSnapshot["sceneBounds"];
} = {}): SettingsGraphSubstrateCanarySceneSnapshot {
  const section = {
    height: sceneBoundsSize?.height ?? 160,
    position,
    positionAndSizeLocked: false,
    renderedPosition,
    sceneBoundsSize,
    sectionId: "section-a",
    tempZIndex: 2,
    width: sceneBoundsSize?.width ?? 240,
    zIndex: 2,
  };

  return {
    sceneBounds,
    sections: [section],
    sectionsById: new Map([[section.sectionId, section]]),
  };
}

function installResizeObserverMock(): ResizeObserverController {
  const callbacks = new Set<ResizeObserverCallback>();

  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserverMock {
      private callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        callbacks.add(callback);
      }

      observe() {}

      unobserve() {}

      disconnect() {
        callbacks.delete(this.callback);
      }
    },
  );

  return {
    trigger: async (entries) => {
      await act(async () => {
        callbacks.forEach((callback) =>
          callback(
            entries.map(({ element, height, width }) => {
              return {
                contentRect: {
                  height,
                  width,
                },
                target: element,
              } as ResizeObserverEntry;
            }),
            {} as ResizeObserver,
          ),
        );
      });
    },
  };
}

function readViewportProbe(hostElement: HTMLDivElement): HTMLDivElement {
  const probe = hostElement.querySelector(
    '[data-testid="viewport-runtime-probe"]',
  );
  if (!(probe instanceof HTMLDivElement)) {
    throw new Error("Expected viewport runtime probe.");
  }
  return probe;
}

function readResolvedViewport(
  hostElement: HTMLDivElement,
): GraphViewport | null {
  const viewportAttribute =
    readViewportProbe(hostElement).getAttribute("data-viewport");
  if (!viewportAttribute) {
    throw new Error("Expected viewport runtime attribute.");
  }
  return JSON.parse(viewportAttribute) as GraphViewport | null;
}
