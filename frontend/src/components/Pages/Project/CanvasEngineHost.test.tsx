/* @vitest-environment jsdom */

import { useReactFlow } from "forks/xyflow/core/store";
import initialState from "forks/xyflow/core/store/initialState";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { makeEdgeHandleKey } from "state/actions/edgeHandles";
import { getCurrEffectiveSectionImplIfPresent } from "state/actions/sectionInfos";
import {
  useActiveSectionUI,
  useContextMenus,
  useEdgeHandleRegistry,
  useProjectState,
  useSettings,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { NO_WHEEL_CLASS_NAME } from "utils/constants";
import * as endpoints from "utils/generatedEndpoints";
import {
  createCallableSectionImpl,
  createCore,
  createProjectConfig,
  createSectionSize,
  createSettingsState,
  createUserDefaultCallableSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CanvasEngineHost,
  createCanvasEngineHostSnapshotResult,
} from "./CanvasEngineHost";

vi.mock("components/Section/Container/SectionContainer", () => ({
  SectionContainer: ({
    sectionId,
  }: {
    sectionId: string;
    isTopLevel: boolean;
  }) => <div data-testid={`mock-section-container-${sectionId}`} />,
}));

describe("CanvasEngineHost", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let originalClientWidth: PropertyDescriptor | undefined;
  let originalClientHeight: PropertyDescriptor | undefined;
  let originalCanvasGetContext: typeof HTMLCanvasElement.prototype.getContext;
  let originalSetPointerCapture: PropertyDescriptor | undefined;
  let originalReleasePointerCapture: PropertyDescriptor | undefined;
  let originalHasPointerCapture: PropertyDescriptor | undefined;
  let originalUserAgent: PropertyDescriptor | undefined;

  beforeEach(() => {
    resetProjectStores();
    useReactFlow.setState({ ...initialState });
    useSettings.setState(createSettingsState());
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    originalCanvasGetContext = HTMLCanvasElement.prototype.getContext;

    originalClientWidth = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "clientWidth",
    );
    originalClientHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "clientHeight",
    );
    originalSetPointerCapture = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "setPointerCapture",
    );
    originalReleasePointerCapture = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "releasePointerCapture",
    );
    originalHasPointerCapture = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "hasPointerCapture",
    );
    originalUserAgent = Object.getOwnPropertyDescriptor(
      Navigator.prototype,
      "userAgent",
    );

    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return 640;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get() {
        return 360;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: () => undefined,
    });
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
      configurable: true,
      value: () => undefined,
    });
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
      configurable: true,
      value: () => true,
    });

    class ResizeObserverStub {
      observe() {}

      disconnect() {}

      unobserve() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    HTMLCanvasElement.prototype.getContext = function getContext() {
      return null;
    };
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    vi.useRealTimers();
    resetProjectStores();
    useReactFlow.setState({ ...initialState });
    vi.unstubAllGlobals();

    if (originalClientWidth) {
      Object.defineProperty(
        HTMLElement.prototype,
        "clientWidth",
        originalClientWidth,
      );
    }
    if (originalClientHeight) {
      Object.defineProperty(
        HTMLElement.prototype,
        "clientHeight",
        originalClientHeight,
      );
    }
    if (originalSetPointerCapture) {
      Object.defineProperty(
        HTMLElement.prototype,
        "setPointerCapture",
        originalSetPointerCapture,
      );
    } else {
      delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
    }
    if (originalReleasePointerCapture) {
      Object.defineProperty(
        HTMLElement.prototype,
        "releasePointerCapture",
        originalReleasePointerCapture,
      );
    } else {
      delete (HTMLElement.prototype as Partial<HTMLElement>)
        .releasePointerCapture;
    }
    if (originalHasPointerCapture) {
      Object.defineProperty(
        HTMLElement.prototype,
        "hasPointerCapture",
        originalHasPointerCapture,
      );
    } else {
      delete (HTMLElement.prototype as Partial<HTMLElement>).hasPointerCapture;
    }
    if (originalUserAgent) {
      Object.defineProperty(
        Navigator.prototype,
        "userAgent",
        originalUserAgent,
      );
    }
    HTMLCanvasElement.prototype.getContext = originalCanvasGetContext;
  });

  it("builds scene counts for the scaffold host from project state inputs", () => {
    const projectConfig = createProjectConfig({
      id: "project-config-1",
    });
    projectConfig.activeIds = ["section-b"];
    projectConfig.topLevelSections = {
      "section-a": {
        x: 0,
        y: 0,
        zIndex: 0,
        w: 320,
        h: 200,
      },
      "section-b": {
        x: 420,
        y: 80,
        zIndex: 1,
        w: 360,
        h: 220,
      },
    };
    projectConfig.edges = [
      {
        id: "edge-data-1",
        sourceSectionId: "section-a",
        sourceVariantId: "variant-a",
        sourcePortId: "out-a",
        targetSectionId: "section-b",
        targetVariantId: "variant-b",
        targetPortId: "in-b",
        type: "default",
        label: null,
        style: null,
        animated: false,
        hidden: false,
        zIndex: 0,
        data: null,
        selected: false,
      },
    ];
    projectConfig.agenticEdges = [
      {
        id: "edge-agentic-1",
        sourceSectionId: "section-b",
        targetSectionId: "section-a",
        kind: "chat_chat",
        contextMode: "reference_only",
        style: null,
        hidden: false,
        zIndex: 0,
        selected: false,
      },
    ];
    const snapshotResult = createCanvasEngineHostSnapshotResult({
      topLevelSections: projectConfig.topLevelSections,
      activeSectionIds: projectConfig.activeIds,
      nestedPreviewRects: [],
      edges: projectConfig.edges,
      agenticEdges: projectConfig.agenticEdges,
      edgeHandlePositions: {},
      sectionEdgePortsBySectionId: {},
    });

    expect(snapshotResult.totalRectCount).toBe(2);
    expect(snapshotResult.totalDataEdgeCount).toBe(1);
    expect(snapshotResult.totalAgenticEdgeCount).toBe(1);
    expect(snapshotResult.snapshot.rects.map((rect) => rect.id)).toEqual([
      "section-a",
      "section-b",
    ]);
  });

  it("renders the canvas after async renderer initialization completes", async () => {
    useProjectState.setState((state) => {
      state.projectConfig.topLevelSections = {
        "section-a": {
          x: 24,
          y: 16,
          zIndex: 0,
          w: 320,
          h: 180,
        },
      };
      state.projectConfig.activeIds = ["section-a"];
      state.projectConfig.edges = [];
      state.projectConfig.agenticEdges = [];
    });

    await act(async () => {
      root.render(<CanvasEngineHost />);
    });

    // The renderer initializes asynchronously; the host still needs a draw pass
    // once that backend selection promise settles.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const canvas = host.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(canvas?.width).toBe(640);
    expect(canvas?.height).toBe(360);

    const engineHost = host.querySelector(
      '[data-canvas-engine-host="v1"]',
    ) as HTMLElement | null;
    expect(engineHost?.dataset.canvasEngineRectCount).toBe("1");
    expect(engineHost?.dataset.canvasEngineDomIslandMountedCount).toBe("1");
    expect(engineHost?.classList.contains("react-flow__pane")).toBe(true);
    expect(
      engineHost?.querySelector('[data-canvas-engine-viewport-proxy="v1"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('[data-canvas-engine-dom-island="section-a"]'),
    ).not.toBeNull();
  });

  it("retains recently offscreen dom islands before unmounting them after expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T12:00:00Z"));

    useProjectState.setState((state) => {
      state.projectConfig.topLevelSections = {
        "section-a": {
          x: 24,
          y: 16,
          zIndex: 0,
          w: 320,
          h: 180,
        },
        "section-b": {
          x: 372,
          y: 16,
          zIndex: 1,
          w: 320,
          h: 180,
        },
      };
      state.projectConfig.activeIds = [];
      state.projectConfig.edges = [];
      state.projectConfig.agenticEdges = [];
    });

    await act(async () => {
      root.render(<CanvasEngineHost />);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const engineHost = host.querySelector(
      '[data-canvas-engine-host="v1"]',
    ) as HTMLElement | null;
    if (!engineHost) {
      throw new Error("Canvas engine host failed to render.");
    }
    setEngineHostBounds(engineHost);

    expect(engineHost.dataset.canvasEngineDomIslandMountedCount).toBe("2");
    expect(engineHost.dataset.canvasEngineDomIslandRetainedCount).toBe("0");
    expect(
      host.querySelector('[data-canvas-engine-dom-island="section-b"]'),
    ).not.toBeNull();

    await act(async () => {
      useProjectState.setState((state) => {
        state.projectConfig.topLevelSections["section-b"] = {
          ...state.projectConfig.topLevelSections["section-b"],
          x: 2400,
        };
      });
    });

    expect(engineHost.dataset.canvasEngineDomIslandMountedCount).toBe("2");
    expect(engineHost.dataset.canvasEngineDomIslandRetainedCount).toBe("1");
    expect(
      host
        .querySelector('[data-canvas-engine-dom-island="section-b"]')
        ?.getAttribute("data-canvas-engine-dom-island-retained"),
    ).toBe("true");

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(engineHost.dataset.canvasEngineDomIslandMountedCount).toBe("1");
    expect(engineHost.dataset.canvasEngineDomIslandRetainedCount).toBe("0");
    expect(
      host.querySelector('[data-canvas-engine-dom-island="section-b"]'),
    ).toBeNull();
  });

  it("mounts readable large sections below the old global zoom cutoff", async () => {
    useProjectState.setState((state) => {
      state.projectConfig.topLevelSections = {
        "section-large": {
          x: 80,
          y: 60,
          zIndex: 0,
          w: 960,
          h: 540,
        },
        "section-small": {
          x: 1240,
          y: 60,
          zIndex: 1,
          w: 320,
          h: 180,
        },
      };
      state.projectConfig.viewport = {
        x: 0,
        y: 0,
        zoom: 0.2,
      };
      state.projectConfig.viewportInitialized = true;
      state.projectConfig.activeIds = [];
      state.projectConfig.edges = [];
      state.projectConfig.agenticEdges = [];
    });

    await act(async () => {
      root.render(<CanvasEngineHost />);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const engineHost = host.querySelector(
      '[data-canvas-engine-host="v1"]',
    ) as HTMLElement | null;
    if (!engineHost) {
      throw new Error("Canvas engine host failed to render.");
    }
    setEngineHostBounds(engineHost);

    expect(engineHost.dataset.canvasEngineCameraZoom).toBe("0.200");
    expect(engineHost.dataset.canvasEngineDomIslandMountedCount).toBe("1");
    expect(
      host.querySelector('[data-canvas-engine-dom-island="section-large"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('[data-canvas-engine-dom-island="section-small"]'),
    ).toBeNull();
  });

  it("syncs an initialized persisted viewport into the engine camera and React Flow store", async () => {
    useProjectState.setState((state) => {
      state.projectConfig.viewport = {
        x: 48,
        y: -32,
        zoom: 1.75,
      };
      state.projectConfig.viewportInitialized = true;
    });

    await act(async () => {
      root.render(<CanvasEngineHost />);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const engineHost = host.querySelector(
      '[data-canvas-engine-host="v1"]',
    ) as HTMLElement | null;
    expect(engineHost?.dataset.canvasEngineCameraX).toBe("-27.43");
    expect(engineHost?.dataset.canvasEngineCameraY).toBe("18.29");
    expect(engineHost?.dataset.canvasEngineCameraZoom).toBe("1.750");
    expect(
      (
        engineHost?.querySelector(
          '[data-canvas-engine-viewport-proxy="v1"]',
        ) as HTMLElement | null
      )?.style.transform,
    ).toBe("translate(48px, -32px) scale(1.75)");
    expect(useReactFlow.getState().transform).toEqual([48, -32, 1.75]);
  });

  it("follows external React Flow transform updates after hydration", async () => {
    await act(async () => {
      root.render(<CanvasEngineHost />);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      useReactFlow.setState({
        transform: [80, -40, 2],
      });
    });

    const engineHost = host.querySelector(
      '[data-canvas-engine-host="v1"]',
    ) as HTMLElement | null;
    expect(engineHost?.dataset.canvasEngineCameraX).toBe("-40.00");
    expect(engineHost?.dataset.canvasEngineCameraY).toBe("20.00");
    expect(engineHost?.dataset.canvasEngineCameraZoom).toBe("2.000");
  });

  it("uses a native wheel listener to prevent default and zoom the canvas host", async () => {
    Object.defineProperty(Navigator.prototype, "userAgent", {
      configurable: true,
      get() {
        return "Macintosh";
      },
    });

    await act(async () => {
      root.render(<CanvasEngineHost />);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const engineHost = host.querySelector(
      '[data-canvas-engine-host="v1"]',
    ) as HTMLDivElement | null;
    if (!engineHost) {
      throw new Error("Canvas engine host failed to render.");
    }
    setEngineHostBounds(engineHost);

    const wheelWasPrevented = await dispatchWheelEvent(engineHost, {
      clientX: 320,
      clientY: 180,
      ctrlKey: true,
      deltaY: -120,
    });

    expect(wheelWasPrevented).toBe(true);
    expect(
      Number(engineHost.dataset.canvasEngineCameraZoom ?? "0"),
    ).toBeGreaterThan(1);
  });

  it("treats ctrl-wheel from a nowheel dom-island descendant as pinch zoom", async () => {
    await act(async () => {
      root.render(<CanvasEngineHost />);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const engineHost = host.querySelector(
      '[data-canvas-engine-host="v1"]',
    ) as HTMLDivElement | null;
    if (!engineHost) {
      throw new Error("Canvas engine host failed to render.");
    }
    setEngineHostBounds(engineHost);

    const domIsland = document.createElement("div");
    domIsland.setAttribute("data-canvas-engine-dom-island", "section-a");
    const blockedChild = document.createElement("div");
    blockedChild.className = NO_WHEEL_CLASS_NAME;
    domIsland.appendChild(blockedChild);
    engineHost.appendChild(domIsland);

    // Pinch-equivalent wheel input should bypass the usual nowheel guard.
    const wheelWasPrevented = await dispatchWheelEvent(blockedChild, {
      clientX: 320,
      clientY: 180,
      ctrlKey: true,
      deltaY: -120,
    });

    expect(wheelWasPrevented).toBe(true);
    expect(
      Number(engineHost.dataset.canvasEngineCameraZoom ?? "0"),
    ).toBeGreaterThan(1);
  });

  it("suppresses native gesture events so browser zoom does not win over the host", async () => {
    await act(async () => {
      root.render(<CanvasEngineHost />);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const engineHost = host.querySelector(
      '[data-canvas-engine-host="v1"]',
    ) as HTMLDivElement | null;
    if (!engineHost) {
      throw new Error("Canvas engine host failed to render.");
    }

    // WebKit-style gesture events should also be suppressed on the host.
    const gestureWasPrevented = await dispatchCancelableEvent(
      engineHost,
      "gesturestart",
    );

    expect(gestureWasPrevented).toBe(true);
  });

  it("opens the pane context menu from a blank host contextmenu event", async () => {
    await act(async () => {
      root.render(<CanvasEngineHost />);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const engineHost = host.querySelector(
      '[data-canvas-engine-host="v1"]',
    ) as HTMLDivElement | null;
    if (!engineHost) {
      throw new Error("Canvas engine host failed to render.");
    }
    setEngineHostBounds(engineHost);

    await dispatchContextMenuEvent(engineHost, {
      clientX: 520,
      clientY: 280,
    });

    expect(useContextMenus.getState().pane).toMatchObject({
      isOpen: true,
      x: 520,
      y: 280,
    });
  });

  it("opens the selection context menu from a selected top-level dom island", async () => {
    useProjectState.setState((state) => {
      state.projectConfig.topLevelSections = {
        "section-a": {
          x: 24,
          y: 16,
          zIndex: 0,
          w: 320,
          h: 180,
        },
      };
      state.projectConfig.activeIds = ["section-a"];
      state.projectConfig.edges = [];
      state.projectConfig.agenticEdges = [];
    });
    useActiveSectionUI.setState({
      activeIds: ["section-a"],
      selectionGeneration: 1,
      backendGeneration: 1,
      backendHydrationEnabled: true,
      pendingBackendSyncOpIds: [],
      pendingBackendSyncGenerationByOpId: {},
      scheduledBackendSync: null,
    });

    await act(async () => {
      root.render(<CanvasEngineHost />);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const engineHost = host.querySelector(
      '[data-canvas-engine-host="v1"]',
    ) as HTMLDivElement | null;
    if (!engineHost) {
      throw new Error("Canvas engine host failed to render.");
    }
    setEngineHostBounds(engineHost);

    const domIsland = host.querySelector(
      '[data-canvas-engine-dom-island="section-a"]',
    ) as HTMLDivElement | null;
    if (!domIsland) {
      throw new Error("Missing DOM island for section-a.");
    }
    setElementBounds(domIsland, { x: 24, y: 16, width: 320, height: 180 });

    await dispatchContextMenuEvent(domIsland, {
      clientX: 80,
      clientY: 72,
    });

    expect(useContextMenus.getState().selection).toMatchObject({
      isOpen: true,
      x: 80,
      y: 72,
      nodeIds: ["section-a"],
    });
  });

  it("tracks hovered data-edge state when the pointer moves over an edge", async () => {
    seedSectionsWithDataEdge({
      includeExistingEdge: true,
    });

    await act(async () => {
      root.render(<CanvasEngineHost />);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const engineHost = host.querySelector(
      '[data-canvas-engine-host="v1"]',
    ) as HTMLDivElement | null;
    if (!engineHost) {
      throw new Error("Canvas engine host failed to render.");
    }
    setEngineHostBounds(engineHost);

    await dispatchPointerEvent(engineHost, "pointermove", {
      button: 0,
      clientX: 382,
      clientY: 106,
      pointerId: 1,
    });

    expect(engineHost.dataset.canvasEngineHoveredEdgeActive).toBe("true");
    expect(engineHost.dataset.canvasEngineHoveredEdgeKind).toBe("data");
    expect(engineHost.dataset.canvasEngineHoveredEdgeId).toBe("edge-data-1");
  });

  it("creates a data edge from a source handle drag onto a valid target handle", async () => {
    const createEdgeSpy = vi
      .spyOn(endpoints, "route_create_edge")
      .mockResolvedValue({
        status: 200,
        hasResponse: true,
        data: undefined,
      });
    seedSectionsWithDataEdge({
      includeExistingEdge: false,
    });

    await act(async () => {
      root.render(<CanvasEngineHost />);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const engineHost = host.querySelector(
      '[data-canvas-engine-host="v1"]',
    ) as HTMLDivElement | null;
    if (!engineHost) {
      throw new Error("Canvas engine host failed to render.");
    }
    setEngineHostBounds(engineHost);

    await dispatchPointerEvent(engineHost, "pointerdown", {
      button: 0,
      clientX: 344,
      clientY: 106,
      pointerId: 1,
    });
    await dispatchPointerEvent(engineHost, "pointermove", {
      button: 0,
      clientX: 420,
      clientY: 106,
      pointerId: 1,
    });

    expect(engineHost.dataset.canvasEngineConnectionPreviewActive).toBe("true");
    expect(engineHost.dataset.canvasEngineConnectionPreviewKind).toBe(
      "data-connect",
    );
    expect(engineHost.dataset.canvasEngineConnectionPreviewValid).toBe("true");
    expect(
      engineHost.dataset.canvasEngineConnectionPreviewHasTargetHandle,
    ).toBe("true");

    await dispatchPointerEvent(engineHost, "pointerup", {
      button: 0,
      clientX: 420,
      clientY: 106,
      pointerId: 1,
    });

    expect(createEdgeSpy).toHaveBeenCalledOnce();
    expect(createEdgeSpy).toHaveBeenCalledWith({
      projectConfigId: "project-a",
      sourceSectionId: "section-a",
      sourceVariantId: "variant-a",
      sourcePortId: "out-a",
      targetSectionId: "section-b",
      targetVariantId: "variant-b",
      targetPortId: "in-b",
      type: "default",
    });
  });

  it("updates active ids while shift-dragging a marquee selection", async () => {
    vi.spyOn(endpoints, "route_set_active_ids").mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: undefined,
    });
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-a";
      state.projectConfig.topLevelSections = {
        "section-a": {
          x: 80,
          y: 60,
          zIndex: 0,
          w: 200,
          h: 120,
        },
        "section-b": {
          x: 340,
          y: 80,
          zIndex: 1,
          w: 200,
          h: 120,
        },
      };
      state.projectConfig.edges = [];
      state.projectConfig.agenticEdges = [];
    });
    useReactFlow.setState({
      selectionKeyPressed: true,
    });

    await act(async () => {
      root.render(<CanvasEngineHost />);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const engineHost = host.querySelector(
      '[data-canvas-engine-host="v1"]',
    ) as HTMLDivElement | null;
    if (!engineHost) {
      throw new Error("Canvas engine host failed to render.");
    }
    setEngineHostBounds(engineHost);

    await dispatchPointerEvent(engineHost, "pointerdown", {
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerId: 1,
    });
    await dispatchPointerEvent(engineHost, "pointermove", {
      button: 0,
      clientX: 580,
      clientY: 240,
      pointerId: 1,
    });

    expect(engineHost.dataset.canvasEngineSelectionRectActive).toBe("true");
    expect(useActiveSectionUI.getState().activeIds).toEqual([
      "section-a",
      "section-b",
    ]);

    await dispatchPointerEvent(engineHost, "pointerup", {
      button: 0,
      clientX: 580,
      clientY: 240,
      pointerId: 1,
    });

    expect(engineHost.dataset.canvasEngineSelectionRectActive).toBe("false");
    expect(useActiveSectionUI.getState().activeIds).toEqual([
      "section-a",
      "section-b",
    ]);
  });

  it("includes mounted nested sections in marquee selection even when they are outside the top-level scene", async () => {
    vi.spyOn(endpoints, "route_set_active_ids").mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: undefined,
    });
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-a";
      state.projectConfig.topLevelSections = {
        "group-a": {
          x: 80,
          y: 60,
          zIndex: 0,
          w: 320,
          h: 220,
        },
      };
      state.projectConfig.sectionVariantMap = {
        "group-a": "variant-group-a",
        "child-a": "variant-child-a",
      };
      state.projectConfig.edges = [];
      state.projectConfig.agenticEdges = [];
      state.parentSectionMap = {
        "group-a": null,
        "child-a": "group-a",
      };
      state.sections["group-a"] = createCore({ id: "group-a" });
      state.sections["child-a"] = createCore({ id: "child-a" });
      state.sectionVariants["variant-group-a"] = createVariant({
        id: "variant-group-a",
        impl: "impl-group-a",
        nonPresetImpls: [],
      });
      state.sectionVariants["variant-child-a"] = createVariant({
        id: "variant-child-a",
        impl: "impl-child-a",
        nonPresetImpls: [],
      });
      state.sectionImpls["impl-group-a"] = createCallableSectionImpl(
        createUserDefaultCallableSectionImpl(),
        {
          id: "impl-group-a",
        },
      );
      state.sectionImpls["impl-child-a"] = createCallableSectionImpl(
        createUserDefaultCallableSectionImpl(),
        {
          id: "impl-child-a",
        },
      );
    });
    useReactFlow.setState({
      selectionKeyPressed: true,
    });

    await act(async () => {
      root.render(<CanvasEngineHost />);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const engineHost = host.querySelector(
      '[data-canvas-engine-host="v1"]',
    ) as HTMLDivElement | null;
    if (!engineHost) {
      throw new Error("Canvas engine host failed to render.");
    }
    setEngineHostBounds(engineHost);

    const domIsland = host.querySelector(
      '[data-canvas-engine-dom-island="group-a"]',
    ) as HTMLDivElement | null;
    if (!domIsland) {
      throw new Error("Missing DOM island for group-a.");
    }
    setElementBounds(domIsland, { x: 80, y: 60, width: 320, height: 220 });

    const nestedSection = document.createElement("section");
    nestedSection.setAttribute("data-section-id", "child-a");
    setElementBounds(nestedSection, { x: 120, y: 96, width: 180, height: 88 });
    domIsland.appendChild(nestedSection);

    await dispatchPointerEvent(engineHost, "pointerdown", {
      button: 0,
      clientX: 40,
      clientY: 40,
      pointerId: 1,
    });
    await dispatchPointerEvent(engineHost, "pointermove", {
      button: 0,
      clientX: 320,
      clientY: 220,
      pointerId: 1,
    });

    expect(engineHost.dataset.canvasEngineSelectionRectActive).toBe("true");
    expect(useActiveSectionUI.getState().activeIds).toContain("child-a");

    await dispatchPointerEvent(engineHost, "pointerup", {
      button: 0,
      clientX: 320,
      clientY: 220,
      pointerId: 1,
    });

    expect(engineHost.dataset.canvasEngineSelectionRectActive).toBe("false");
    expect(useActiveSectionUI.getState().activeIds).toContain("child-a");
  });

  it("hovers and selects a data edge when the pointer hits the edge line", async () => {
    const setEdgesSpy = vi
      .spyOn(endpoints, "route_set_edges")
      .mockResolvedValue({
        status: 200,
        hasResponse: true,
        data: undefined,
      });

    seedSectionsWithDataEdge({
      includeExistingEdge: true,
    });

    await act(async () => {
      root.render(<CanvasEngineHost />);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const engineHost = host.querySelector(
      '[data-canvas-engine-host="v1"]',
    ) as HTMLDivElement | null;
    if (!engineHost) {
      throw new Error("Canvas engine host failed to render.");
    }
    setEngineHostBounds(engineHost);

    await dispatchPointerEvent(engineHost, "pointermove", {
      button: 0,
      clientX: 382,
      clientY: 106,
      pointerId: 1,
    });

    expect(engineHost.dataset.canvasEngineHoveredEdgeActive).toBe("true");
    expect(engineHost.dataset.canvasEngineHoveredEdgeKind).toBe("data");
    expect(engineHost.dataset.canvasEngineHoveredEdgeId).toBe("edge-data-1");

    await dispatchPointerEvent(engineHost, "pointerdown", {
      button: 0,
      clientX: 382,
      clientY: 106,
      pointerId: 1,
    });
    await dispatchPointerEvent(engineHost, "pointerup", {
      button: 0,
      clientX: 382,
      clientY: 106,
      pointerId: 1,
    });

    expect(
      useProjectState
        .getState()
        .projectConfig.edges.find((edge) => edge.id === "edge-data-1")
        ?.selected,
    ).toBe(true);
    expect(setEdgesSpy).toHaveBeenCalledOnce();
  });

  it("drags a top-level section and persists the updated layout", async () => {
    const layoutSpy = vi
      .spyOn(endpoints, "route_set_top_level_section_layout")
      .mockResolvedValue({
        status: 200,
        hasResponse: true,
        data: undefined,
      });

    useProjectState.setState((state) => {
      state.projectConfig.id = "project-a";
      state.projectConfig.topLevelSections = {
        "section-a": {
          x: 24,
          y: 16,
          zIndex: 0,
          w: 320,
          h: 180,
        },
      };
      state.projectConfig.activeIds = ["section-a", "section-b"];
      state.projectConfig.edges = [];
      state.projectConfig.agenticEdges = [];
    });
    useActiveSectionUI.setState({
      activeIds: ["section-a", "section-b"],
      selectionGeneration: 1,
      backendGeneration: 1,
      backendHydrationEnabled: true,
      pendingBackendSyncOpIds: [],
      pendingBackendSyncGenerationByOpId: {},
      scheduledBackendSync: null,
    });

    await act(async () => {
      root.render(<CanvasEngineHost />);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const engineHost = host.querySelector(
      '[data-canvas-engine-host="v1"]',
    ) as HTMLDivElement | null;
    if (!engineHost) {
      throw new Error("Canvas engine host failed to render.");
    }
    setEngineHostBounds(engineHost);

    await dispatchPointerEvent(engineHost, "pointerdown", {
      button: 0,
      clientX: 80,
      clientY: 80,
      pointerId: 1,
    });
    await dispatchPointerEvent(engineHost, "pointermove", {
      button: 0,
      clientX: 160,
      clientY: 140,
      pointerId: 1,
    });
    await dispatchPointerEvent(engineHost, "pointerup", {
      button: 0,
      clientX: 160,
      clientY: 140,
      pointerId: 1,
    });

    expect(
      useProjectState.getState().projectConfig.topLevelSections,
    ).toMatchObject({
      "section-a": expect.objectContaining({
        x: 104,
        y: 76,
      }),
    });
    expect(layoutSpy).toHaveBeenCalledOnce();
    expect(layoutSpy).toHaveBeenCalledWith({
      projectConfigId: "project-a",
      topLevelSections: expect.objectContaining({
        "section-a": expect.objectContaining({
          x: 104,
          y: 76,
        }),
      }),
    });
  });

  it("resizes a top-level section and persists layout plus section sizes", async () => {
    const layoutSpy = vi
      .spyOn(endpoints, "route_set_top_level_section_layout")
      .mockResolvedValue({
        status: 200,
        hasResponse: true,
        data: undefined,
      });
    const sizeSpy = vi
      .spyOn(endpoints, "route_set_section_sizes")
      .mockResolvedValue({
        status: 200,
        hasResponse: true,
        data: undefined,
      });

    seedResizableCallableSection("section-a");

    await act(async () => {
      root.render(<CanvasEngineHost />);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const engineHost = host.querySelector(
      '[data-canvas-engine-host="v1"]',
    ) as HTMLDivElement | null;
    if (!engineHost) {
      throw new Error("Canvas engine host failed to render.");
    }
    setEngineHostBounds(engineHost);

    await dispatchPointerEvent(engineHost, "pointerdown", {
      button: 0,
      clientX: 344,
      clientY: 196,
      pointerId: 1,
    });
    await dispatchPointerEvent(engineHost, "pointermove", {
      button: 0,
      clientX: 404,
      clientY: 236,
      pointerId: 1,
    });
    await dispatchPointerEvent(engineHost, "pointerup", {
      button: 0,
      clientX: 404,
      clientY: 236,
      pointerId: 1,
    });

    expect(
      useProjectState.getState().projectConfig.topLevelSections,
    ).toMatchObject({
      "section-a": expect.objectContaining({
        x: 24,
        y: 16,
        w: 380,
        h: 220,
      }),
    });
    expect(layoutSpy).toHaveBeenCalledOnce();
    expect(layoutSpy).toHaveBeenCalledWith({
      projectConfigId: "project-a",
      topLevelSections: expect.objectContaining({
        "section-a": expect.objectContaining({
          w: 380,
          h: 220,
        }),
      }),
    });
    expect(sizeSpy).toHaveBeenCalledOnce();
    expect(sizeSpy).toHaveBeenCalledWith({
      projectConfigId: "project-a",
      sectionSizes: expect.objectContaining({
        "section-a": expect.objectContaining({
          width: 380,
          height: 220,
        }),
      }),
    });
    expect(
      getCurrEffectiveSectionImplIfPresent(
        useProjectState.getState(),
        "section-a",
      )?.size,
    ).toEqual(
      createSectionSize({
        width: 380,
        height: 220,
      }),
    );
  });

  it("publishes a selection overlay and nudges selected sections with arrow keys", async () => {
    const layoutSpy = vi
      .spyOn(endpoints, "route_set_top_level_section_layout")
      .mockResolvedValue({
        status: 200,
        hasResponse: true,
        data: undefined,
      });

    useProjectState.setState((state) => {
      state.projectConfig.id = "project-a";
      state.projectConfig.topLevelSections = {
        "section-a": {
          x: 24,
          y: 16,
          zIndex: 0,
          w: 320,
          h: 180,
        },
        "section-b": {
          x: 420,
          y: 80,
          zIndex: 1,
          w: 360,
          h: 220,
        },
      };
      state.projectConfig.edges = [];
      state.projectConfig.agenticEdges = [];
    });
    useActiveSectionUI.setState({
      activeIds: ["section-a", "section-b"],
      selectionGeneration: 1,
      backendGeneration: 1,
      backendHydrationEnabled: true,
      pendingBackendSyncOpIds: [],
      pendingBackendSyncGenerationByOpId: {},
      scheduledBackendSync: null,
    });

    await act(async () => {
      root.render(<CanvasEngineHost />);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const selectionOverlay = host.querySelector(
      '[data-canvas-engine-selection-overlay-rect="v1"]',
    ) as HTMLDivElement | null;
    if (!selectionOverlay) {
      throw new Error("Canvas engine selection overlay failed to render.");
    }

    expect(useReactFlow.getState().nodesSelectionDims).toEqual({
      x: 24,
      y: 16,
      width: 756,
      height: 284,
    });
    expect(document.activeElement).toBe(selectionOverlay);

    await act(async () => {
      selectionOverlay.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "ArrowRight",
        }),
      );
      await Promise.resolve();
    });

    expect(
      useProjectState.getState().projectConfig.topLevelSections,
    ).toMatchObject({
      "section-a": expect.objectContaining({
        x: 39,
        y: 16,
      }),
      "section-b": expect.objectContaining({
        x: 435,
        y: 80,
      }),
    });
    expect(useReactFlow.getState().nodesSelectionDims).toEqual({
      x: 39,
      y: 16,
      width: 756,
      height: 284,
    });
    expect(layoutSpy).toHaveBeenCalledOnce();
    expect(layoutSpy).toHaveBeenCalledWith({
      projectConfigId: "project-a",
      topLevelSections: expect.objectContaining({
        "section-a": expect.objectContaining({
          x: 39,
          y: 16,
        }),
        "section-b": expect.objectContaining({
          x: 435,
          y: 80,
        }),
      }),
    });
  });

  it("clears active sections from a stationary blank-pane click", async () => {
    const endpointSpy = vi
      .spyOn(endpoints, "route_set_active_ids")
      .mockResolvedValue({
        status: 200,
        hasResponse: true,
        data: undefined,
      });

    let scheduledFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      scheduledFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    useProjectState.setState((state) => {
      state.projectConfig.id = "project-a";
      state.projectConfig.topLevelSections = {
        "section-a": {
          x: 24,
          y: 16,
          zIndex: 0,
          w: 320,
          h: 180,
        },
      };
      state.projectConfig.activeIds = ["section-a"];
      state.projectConfig.edges = [];
      state.projectConfig.agenticEdges = [];
    });
    useActiveSectionUI.setState({
      activeIds: ["section-a"],
      selectionGeneration: 1,
      backendGeneration: 1,
      backendHydrationEnabled: true,
      pendingBackendSyncOpIds: [],
      pendingBackendSyncGenerationByOpId: {},
      scheduledBackendSync: null,
    });

    await act(async () => {
      root.render(<CanvasEngineHost />);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const engineHost = host.querySelector(
      '[data-canvas-engine-host="v1"]',
    ) as HTMLDivElement | null;
    if (!engineHost) {
      throw new Error("Canvas engine host failed to render.");
    }
    setEngineHostBounds(engineHost);

    expect(
      engineHost.getAttribute("data-canvas-engine-active-section-ids"),
    ).toBe("section-a");

    await dispatchPointerEvent(engineHost, "pointerdown", {
      button: 0,
      clientX: 500,
      clientY: 300,
      pointerId: 1,
    });
    await dispatchPointerEvent(engineHost, "pointerup", {
      button: 0,
      clientX: 500,
      clientY: 300,
      pointerId: 1,
    });

    // A no-move pane click should clear the UI selection immediately and then
    // schedule a single durable backend publish of the cleared state.
    expect(useActiveSectionUI.getState().activeIds).toEqual([]);
    expect(
      engineHost.getAttribute("data-canvas-engine-active-section-ids"),
    ).toBe("");
    expect(scheduledFrame).not.toBeNull();
    expect(endpointSpy).not.toHaveBeenCalled();

    scheduledFrame?.(16);

    expect(endpointSpy).toHaveBeenCalledOnce();
    expect(endpointSpy).toHaveBeenCalledWith({
      activeIds: [],
      frontendOpId: expect.any(String),
      projectConfigId: "project-a",
    });
  });
});

async function dispatchPointerEvent(
  target: HTMLElement,
  type: "pointerdown" | "pointermove" | "pointerup",
  init: {
    button: number;
    clientX: number;
    clientY: number;
    pointerId: number;
  },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: init.button,
    clientX: init.clientX,
    clientY: init.clientY,
  });
  Object.defineProperty(event, "pointerId", {
    configurable: true,
    value: init.pointerId,
  });

  await act(async () => {
    target.dispatchEvent(event);
  });
}

async function dispatchWheelEvent(
  target: HTMLElement,
  init: {
    clientX: number;
    clientY: number;
    ctrlKey: boolean;
    deltaY: number;
  },
): Promise<boolean> {
  const event = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
    ctrlKey: init.ctrlKey,
    deltaY: init.deltaY,
  });

  await act(async () => {
    target.dispatchEvent(event);
  });

  return event.defaultPrevented;
}

async function dispatchCancelableEvent(
  target: HTMLElement,
  eventType: string,
): Promise<boolean> {
  const event = new Event(eventType, {
    bubbles: true,
    cancelable: true,
  });

  await act(async () => {
    target.dispatchEvent(event);
  });

  return event.defaultPrevented;
}

async function dispatchContextMenuEvent(
  target: HTMLElement,
  init: {
    clientX: number;
    clientY: number;
  },
): Promise<boolean> {
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
    button: 2,
  });

  await act(async () => {
    target.dispatchEvent(event);
  });

  return event.defaultPrevented;
}

function setEngineHostBounds(target: HTMLElement) {
  setElementBounds(target, { x: 0, y: 0, width: 640, height: 360 });
}

function setElementBounds(
  target: HTMLElement,
  rect: { x: number; y: number; width: number; height: number },
) {
  Object.defineProperty(target, "getBoundingClientRect", {
    configurable: true,
    value: () => DOMRect.fromRect(rect),
  });
}

function seedResizableCallableSection(sectionId: string) {
  useProjectState.setState((state) => {
    state.projectConfig.id = "project-a";
    state.projectConfig.topLevelSections = {
      [sectionId]: {
        x: 24,
        y: 16,
        zIndex: 0,
        w: 320,
        h: 180,
      },
    };
    state.projectConfig.sectionVariantMap = {
      [sectionId]: "variant-a",
    };
    state.projectConfig.activeIds = [];
    state.projectConfig.edges = [];
    state.projectConfig.agenticEdges = [];
    state.sections[sectionId] = createCore({ id: sectionId });
    state.sectionVariants["variant-a"] = createVariant({
      id: "variant-a",
      impl: "impl-a",
      nonPresetImpls: [],
    });
    state.sectionImpls["impl-a"] = createCallableSectionImpl(
      createUserDefaultCallableSectionImpl(),
      {
        id: "impl-a",
        size: createSectionSize({
          width: 320,
          height: 180,
        }),
      },
    );
  });
}

function seedSectionsWithDataEdge({
  includeExistingEdge,
}: {
  includeExistingEdge: boolean;
}) {
  useProjectState.setState((state) => {
    state.projectConfig.id = "project-a";
    state.projectConfig.topLevelSections = {
      "section-a": {
        x: 24,
        y: 16,
        zIndex: 0,
        w: 320,
        h: 180,
      },
      "section-b": {
        x: 420,
        y: 16,
        zIndex: 1,
        w: 320,
        h: 180,
      },
    };
    state.projectConfig.sectionVariantMap = {
      "section-a": "variant-a",
      "section-b": "variant-b",
    };
    state.sections["section-a"] = createCore({ id: "section-a" });
    state.sections["section-b"] = createCore({ id: "section-b" });
    state.sectionVariants["variant-a"] = createVariant({
      id: "variant-a",
      impl: "impl-a",
      nonPresetImpls: [],
    });
    state.sectionVariants["variant-b"] = createVariant({
      id: "variant-b",
      impl: "impl-b",
      nonPresetImpls: [],
    });
    state.sectionImpls["impl-a"] = createCallableSectionImpl(
      createUserDefaultCallableSectionImpl(),
      {
        id: "impl-a",
        edgeInputParams: [],
        edgeOutputPorts: [{ id: "out-a", accessor: "output" }],
      },
    );
    state.sectionImpls["impl-b"] = createCallableSectionImpl(
      createUserDefaultCallableSectionImpl(),
      {
        id: "impl-b",
        edgeInputParams: ["in-b"],
        edgeOutputPorts: [],
      },
    );
    state.projectConfig.edges = includeExistingEdge
      ? [
          {
            id: "edge-data-1",
            sourceSectionId: "section-a",
            sourceVariantId: "variant-a",
            sourcePortId: "out-a",
            targetSectionId: "section-b",
            targetVariantId: "variant-b",
            targetPortId: "in-b",
            type: "default",
            label: null,
            style: null,
            animated: false,
            hidden: false,
            zIndex: 0,
            data: null,
            selected: false,
          },
        ]
      : [];
    state.projectConfig.agenticEdges = [];
  });
  useEdgeHandleRegistry.setState((state) => {
    state.positions = {
      [makeEdgeHandleKey("section-a", "out-a", "source")]: {
        sectionId: "section-a",
        portId: "out-a",
        type: "source",
        side: "right",
        x: 344,
        y: 106,
      },
      [makeEdgeHandleKey("section-b", "in-b", "target")]: {
        sectionId: "section-b",
        portId: "in-b",
        type: "target",
        side: "left",
        x: 420,
        y: 106,
      },
    };
  });
}
