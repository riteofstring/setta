import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
} from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceSection } from "../document/types";
import { initialCanvasState } from "./store";
import { registerWorkspaceXyflowInstance } from "./xyflow/workspaceXyflowRuntime";
import type { WorkspaceXyflowInstance } from "./xyflow/types";
import {
  focusWorkspaceSection,
  getCanZoomIn,
  getCanZoomOut,
  getIsZoomRuntimeReady,
  movePaneToIncludeElement,
  resetZoom,
  setCenter,
  shiftWorkspaceMapForLeadingPane,
  zoomIn,
  zoomOut,
} from "./viewportHelpers";

function setupXyflowRuntime(viewport = { x: 0, y: 0, zoom: 1 }) {
  const setViewport = vi.fn(() => Promise.resolve(true));
  const zoomTo = vi.fn(() => Promise.resolve(true));
  registerWorkspaceXyflowInstance(testWorkspace.host, {
    getViewport: () => viewport,
    screenToFlowPosition: vi.fn(),
    setViewport,
    zoomTo,
  } as unknown as WorkspaceXyflowInstance);
  return { setViewport, zoomTo };
}

describe("viewport zoom helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    testWorkspace.options.getState().reset();
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
    testWorkspace.document.getState().reset();
    testWorkspace.activeSections.getState().reset();
    testWorkspace.sectionRefs.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    testWorkspace.options.getState().reset();
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
    testWorkspace.document.getState().reset();
    testWorkspace.activeSections.getState().reset();
    testWorkspace.sectionRefs.getState().reset();
    vi.unstubAllGlobals();
  });

  it("zooms in by 1.2 through XYFlow", () => {
    const { zoomTo } = setupXyflowRuntime();

    zoomIn(testWorkspace.host);

    expect(zoomTo).toHaveBeenCalledWith(1.2, { duration: 0 });
  });

  it("zooms out by 1/1.2 through XYFlow", () => {
    const { zoomTo } = setupXyflowRuntime();

    zoomOut(testWorkspace.host);

    expect(zoomTo).toHaveBeenCalledWith(1 / 1.2, { duration: 0 });
  });

  it("throttles repeated zoom commands to the 50ms window", () => {
    const { zoomTo } = setupXyflowRuntime();

    zoomIn(testWorkspace.host);
    zoomIn(testWorkspace.host);
    expect(zoomTo).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50);
    expect(zoomTo).toHaveBeenCalledTimes(2);
  });

  it("resets zoom to the default level over 100ms", () => {
    const { zoomTo } = setupXyflowRuntime();
    testWorkspace.options.setState({ defaultZoomLevel: 1.5 });

    resetZoom(testWorkspace.host);

    expect(zoomTo).toHaveBeenCalledWith(1.5, { duration: 100 });
  });

  it("matches frozen main's 100ms leading-pane map shift", () => {
    const { setViewport } = setupXyflowRuntime({ x: 15, y: 25, zoom: 1.5 });

    shiftWorkspaceMapForLeadingPane(testWorkspace.host, 295);

    expect(setViewport).toHaveBeenCalledWith(
      { x: 310, y: 25, zoom: 1.5 },
      { duration: 100 },
    );
  });

  it("collapses requested camera transitions when reduced motion is requested", () => {
    vi.stubGlobal("window", {
      matchMedia: vi.fn(() => ({ matches: true })),
    });
    const { setViewport, zoomTo } = setupXyflowRuntime();
    testWorkspace.reactFlow.setState({ width: 800, height: 600 });

    resetZoom(testWorkspace.host);
    setCenter(testWorkspace.host, 100, 50, { zoom: 2, duration: 120 });

    expect(zoomTo).toHaveBeenCalledWith(1, { duration: 0 });
    expect(setViewport).toHaveBeenCalledWith(
      { x: 200, y: 200, zoom: 2 },
      { duration: 0 },
    );
  });

  it("passes zero duration when reduced-motion centering has no duration", () => {
    vi.stubGlobal("window", {
      matchMedia: vi.fn(() => ({ matches: true })),
    });
    const { setViewport } = setupXyflowRuntime();
    testWorkspace.reactFlow.setState({ width: 800, height: 600 });

    setCenter(testWorkspace.host, 100, 50, { zoom: 2 });

    expect(setViewport).toHaveBeenCalledWith(
      { x: 200, y: 200, zoom: 2 },
      { duration: 0 },
    );
  });

  it("fails loud when zooming before the XYFlow runtime initializes", () => {
    expect(() => resetZoom(testWorkspace.host)).toThrowError(
      "Cannot zoom before the zoom pane initialized.",
    );
  });

  it("reports the zoom runtime as unavailable until XYFlow initializes", () => {
    expect(getIsZoomRuntimeReady(testWorkspace.host)).toBe(false);
    expect(getCanZoomIn(testWorkspace.host)).toBe(false);
    expect(getCanZoomOut(testWorkspace.host)).toBe(false);

    setupXyflowRuntime();

    expect(getIsZoomRuntimeReady(testWorkspace.host)).toBe(true);
    expect(getCanZoomIn(testWorkspace.host)).toBe(true);
    expect(getCanZoomOut(testWorkspace.host)).toBe(true);
  });

  it("reports each zoom direction as unavailable at its configured limit", () => {
    setupXyflowRuntime();
    testWorkspace.options.setState({ minZoom: 0.5, maxZoom: 2 });

    testWorkspace.reactFlow.setState({ transform: [0, 0, 2] });
    expect(getCanZoomIn(testWorkspace.host)).toBe(false);
    expect(getCanZoomOut(testWorkspace.host)).toBe(true);

    testWorkspace.reactFlow.setState({ transform: [0, 0, 0.5] });
    expect(getCanZoomIn(testWorkspace.host)).toBe(true);
    expect(getCanZoomOut(testWorkspace.host)).toBe(false);
  });

  it("centers the flow position in the area left visible by shell panes", () => {
    const { setViewport } = setupXyflowRuntime();
    testWorkspace.reactFlow.setState({
      width: 800,
      height: 600,
      viewportInsets: { top: 0, right: 100, bottom: 0, left: 200 },
    });

    setCenter(testWorkspace.host, 100, 50, { zoom: 2, duration: 120 });

    expect(setViewport).toHaveBeenCalledWith(
      { x: 250, y: 200, zoom: 2 },
      { duration: 120 },
    );
  });

  it("centers on the whole canvas when open panes cover it", () => {
    const { setViewport } = setupXyflowRuntime();
    testWorkspace.reactFlow.setState({
      width: 320,
      height: 861,
      viewportInsets: { top: 0, right: 40, bottom: 0, left: 280 },
    });

    setCenter(testWorkspace.host, 100, 50, { zoom: 2 });

    expect(setViewport).toHaveBeenCalledWith(
      { x: 320 / 2 - 100 * 2, y: 861 / 2 - 50 * 2, zoom: 2 },
      { duration: 0 },
    );
  });

  it("defaults centering to the configured max zoom", () => {
    const { setViewport } = setupXyflowRuntime();
    testWorkspace.reactFlow.setState({ width: 800, height: 600 });
    testWorkspace.options.setState({ maxZoom: 4 });

    setCenter(testWorkspace.host, 0, 0);

    expect(setViewport).toHaveBeenCalledWith(
      { x: 400, y: 300, zoom: 4 },
      { duration: 0 },
    );
  });

  it("focuses a mounted section at a maximum of 100% without changing selection", () => {
    const { setViewport } = setupXyflowRuntime();
    const section: WorkspaceSection = {
      id: "section-a",
      kind: "leaf",
      name: "Section A",
      size: { width: 200, height: 100 },
      isMinimized: false,
      positionAndSizeLocked: false,
      isHorizontalOrientation: false,
      styleColor: null,
      overflowMode: false,
      tagColor: null,
      children: [],
    };
    testWorkspace.document.setState({ sections: { "section-a": section } });
    testWorkspace.activeSections.setState({
      activeIds: ["section-a", "section-b"],
    });
    testWorkspace.options.setState({ minZoom: 2, maxZoom: 10 });
    testWorkspace.reactFlow.setState({
      width: 800,
      height: 600,
      domNode: {
        getBoundingClientRect: () => ({ x: 0, y: 0 }),
      } as unknown as HTMLDivElement,
    });
    testWorkspace.sectionRefs.setState({
      selfOnly: {
        "section-a": {
          clientWidth: 200,
          clientHeight: 100,
          getBoundingClientRect: () => ({ x: 100, y: 50 }),
        } as unknown as HTMLElement,
      },
    });

    focusWorkspaceSection(testWorkspace.host, "section-a");

    expect(setViewport).toHaveBeenCalledWith(
      { x: 195, y: 205, zoom: 1 },
      { duration: 50 },
    );
    expect(testWorkspace.activeSections.getState().activeIds).toEqual([
      "section-a",
      "section-b",
    ]);
  });

  it("focuses a section from a pane that covers the canvas", () => {
    const { setViewport } = setupXyflowRuntime();
    testWorkspace.document.setState({
      sections: {
        "section-a": {
          id: "section-a",
          kind: "leaf",
          name: "Section A",
          size: { width: 200, height: 100 },
          isMinimized: false,
          positionAndSizeLocked: false,
          isHorizontalOrientation: false,
          styleColor: null,
          overflowMode: false,
          tagColor: null,
          children: [],
        },
      },
    });
    testWorkspace.reactFlow.setState({
      width: 320,
      height: 861,
      viewportInsets: { top: 0, right: 40, bottom: 0, left: 280 },
      domNode: {
        getBoundingClientRect: () => ({ x: 0, y: 0 }),
      } as unknown as HTMLDivElement,
    });
    testWorkspace.sectionRefs.setState({
      selfOnly: {
        "section-a": {
          clientWidth: 200,
          clientHeight: 100,
          getBoundingClientRect: () => ({ x: 100, y: 50 }),
        } as unknown as HTMLElement,
      },
    });

    expect(() =>
      focusWorkspaceSection(testWorkspace.host, "section-a"),
    ).not.toThrow();

    expect(setViewport).toHaveBeenCalledWith(
      { x: 320 / 2 - 205, y: 861 / 2 - 95, zoom: 1 },
      { duration: 50 },
    );
  });

  it("rejects direct focus toward a section hidden by the active saved view", () => {
    testWorkspace.document.setState({
      parentSectionMap: {},
      savedViews: {
        activeViewId: "overview",
        views: {
          overview: {
            id: "overview",
            isTab: false,
            name: "Overview",
            sectionVisibility: { "section-a": false },
            sortIndex: 0,
            topLevelSections: {
              "section-a": { h: 100, w: 200, x: 0, y: 0, zIndex: 0 },
            },
            viewport: null,
          },
        },
      },
      sections: {
        "section-a": {
          children: [],
          id: "section-a",
          isHorizontalOrientation: false,
          isMinimized: false,
          kind: "leaf",
          name: "Section A",
          overflowMode: false,
          positionAndSizeLocked: false,
          size: { height: 100, width: 200 },
          styleColor: null,
          tagColor: null,
        },
      },
    });

    expect(() =>
      focusWorkspaceSection(testWorkspace.host, "section-a"),
    ).toThrowError("Cannot focus hidden workspace section section-a.");
  });

  function elementAt(x: number, y: number): HTMLElement {
    return {
      getBoundingClientRect: () => ({ x, y }),
    } as unknown as HTMLElement;
  }

  it("moves the canvas by the shortest distance that brings a focused element into view", () => {
    const { setViewport } = setupXyflowRuntime();
    testWorkspace.reactFlow.setState({ width: 800, height: 600 });

    movePaneToIncludeElement(testWorkspace.host, elementAt(1000, 300));

    expect(setViewport).toHaveBeenCalledWith({ x: -300, y: 0, zoom: 1 });
  });

  it("leaves the canvas alone for an element already inside the padded pane", () => {
    const { setViewport } = setupXyflowRuntime();
    testWorkspace.reactFlow.setState({ width: 800, height: 600 });

    movePaneToIncludeElement(testWorkspace.host, elementAt(400, 300));

    expect(setViewport).not.toHaveBeenCalled();
  });

  it("has nowhere to travel before the XYFlow runtime initializes", () => {
    testWorkspace.reactFlow.setState({ width: 800, height: 600 });

    expect(() =>
      movePaneToIncludeElement(testWorkspace.host, elementAt(1000, 300)),
    ).not.toThrow();
  });

  it("fails specifically for unknown and unmounted focus targets", () => {
    expect(() =>
      focusWorkspaceSection(testWorkspace.host, "missing"),
    ).toThrowError("Cannot focus unknown workspace section missing.");
    testWorkspace.document.setState({
      sections: {
        known: {
          id: "known",
          kind: "leaf",
          name: "Known",
          size: { width: 200, height: 100 },
          isMinimized: false,
          positionAndSizeLocked: false,
          isHorizontalOrientation: false,
          styleColor: null,
          overflowMode: false,
          tagColor: null,
          children: [],
        },
      },
    });
    expect(() =>
      focusWorkspaceSection(testWorkspace.host, "known"),
    ).toThrowError(
      "Cannot focus workspace section known before its canvas element mounted.",
    );
  });
});
