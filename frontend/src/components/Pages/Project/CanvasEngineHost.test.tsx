/* @vitest-environment jsdom */

import { useReactFlow } from "forks/xyflow/core/store";
import initialState from "forks/xyflow/core/store/initialState";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useActiveSectionUI, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import * as endpoints from "utils/generatedEndpoints";
import { createProjectConfig } from "utils/generatedTypes";
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

  beforeEach(() => {
    resetProjectStores();
    useReactFlow.setState({ ...initialState });
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
    expect(
      host.querySelector('[data-canvas-engine-dom-island="section-a"]'),
    ).not.toBeNull();
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
    expect(engineHost?.dataset.canvasEngineCameraX).toBe("48.00");
    expect(engineHost?.dataset.canvasEngineCameraY).toBe("-32.00");
    expect(engineHost?.dataset.canvasEngineCameraZoom).toBe("1.750");
    expect(useReactFlow.getState().transform).toEqual([48, -32, 1.75]);
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

function setEngineHostBounds(target: HTMLElement) {
  Object.defineProperty(target, "getBoundingClientRect", {
    configurable: true,
    value: () => DOMRect.fromRect({ x: 0, y: 0, width: 640, height: 360 }),
  });
}
