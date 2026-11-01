import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
} from "../../test/workspaceTestHost.js";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNodeInternals } from "../document/stores.js";
import type { Node } from "../document/types.js";
import { fitView, onFitViewHandler } from "./fitView.js";
import { useWorkspaceOptions } from "./options.js";
import { initialCanvasState, useReactFlow } from "./store.js";
import { registerWorkspaceXyflowInstance } from "./xyflow/workspaceXyflowRuntime.js";
import type { WorkspaceXyflowInstance } from "./xyflow/types.js";

function createNode(overrides: Partial<Node> & Pick<Node, "id">): Node {
  return {
    id: overrides.id,
    position: overrides.position ?? { x: 0, y: 0 },
    width: overrides.width === undefined ? 100 : overrides.width,
    height: overrides.height === undefined ? 80 : overrides.height,
    zIndex: overrides.zIndex ?? 0,
    tempZIndex: overrides.tempZIndex ?? 0,
    kind: overrides.kind ?? "leaf",
    style: overrides.style,
  };
}

function setNodes(nodes: Array<Node>) {
  testWorkspace.nodeInternals.setState({
    x: new Map(nodes.map((node) => [node.id, node])),
  });
}

function setupFitViewState(overrides: Partial<typeof initialCanvasState> = {}) {
  const setViewport = vi.fn(() => Promise.resolve(true));
  registerWorkspaceXyflowInstance(testWorkspace.host, {
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    screenToFlowPosition: vi.fn(),
    setViewport,
    zoomTo: vi.fn(() => Promise.resolve(true)),
  } as unknown as WorkspaceXyflowInstance);

  testWorkspace.reactFlow.setState({
    ...initialCanvasState,
    width: 800,
    height: 600,
    ...overrides,
  });

  return { setViewport };
}

describe("fitView", () => {
  beforeEach(() => {
    testWorkspace.nodeInternals.getState().reset();
    testWorkspace.options.getState().reset();
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    testWorkspace.nodeInternals.getState().reset();
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
  });

  it("caps initial fit zoom to the default zoom level", () => {
    const { setViewport } = setupFitViewState({
      fitViewOnInit: true,
      fitViewOnInitDone: false,
    });
    setNodes([createNode({ id: "section-a", width: 100, height: 100 })]);

    expect(fitView(testWorkspace.host, { initial: true, maxZoom: 3 })).toBe(
      true,
    );

    expect(setViewport).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: 1 }),
      { duration: 0 },
    );
  });

  it("filters to explicit fitView targets before checking node measurement", () => {
    const { setViewport } = setupFitViewState();
    setNodes([
      createNode({ id: "target" }),
      createNode({ id: "unmeasured", width: null, height: null }),
    ]);

    expect(fitView(testWorkspace.host, { nodes: [{ id: "target" }] })).toBe(
      true,
    );
    expect(setViewport).toHaveBeenCalledTimes(1);

    setViewport.mockClear();

    expect(fitView(testWorkspace.host)).toBe(false);
    expect(setViewport).not.toHaveBeenCalled();
  });

  it("passes the requested duration to the XYFlow viewport runtime", () => {
    const { setViewport } = setupFitViewState();
    setNodes([createNode({ id: "section-a" })]);

    expect(fitView(testWorkspace.host, { duration: 120 })).toBe(true);
    expect(setViewport).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: expect.any(Number) }),
      { duration: 120 },
    );

    setViewport.mockClear();

    expect(fitView(testWorkspace.host, { duration: 0 })).toBe(true);
    expect(setViewport).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: expect.any(Number) }),
      { duration: 0 },
    );
  });

  it("fits nodes inside the canvas area left visible by shell panes", () => {
    const { setViewport } = setupFitViewState({
      viewportInsets: { top: 0, right: 100, bottom: 0, left: 200 },
    });
    setNodes([createNode({ id: "section-a", width: 400, height: 100 })]);

    expect(fitView(testWorkspace.host, { duration: 0, padding: 0 })).toBe(true);
    expect(setViewport).toHaveBeenCalledWith(
      { x: 200, y: 237.5, zoom: 1.25 },
      { duration: 0 },
    );
  });

  it("applies a positive-duration fit immediately when reduced motion is requested", () => {
    vi.stubGlobal("window", {
      matchMedia: vi.fn(() => ({ matches: true })),
    });
    const { setViewport } = setupFitViewState();
    setNodes([createNode({ id: "section-a" })]);

    expect(fitView(testWorkspace.host, { duration: 120 })).toBe(true);

    expect(setViewport).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: expect.any(Number) }),
      { duration: 0 },
    );
  });

  it("onFitViewHandler fits with the transition duration, then arms fitViewOnInit", () => {
    vi.useFakeTimers();
    try {
      const { setViewport } = setupFitViewState();
      setNodes([createNode({ id: "section-a" })]);

      onFitViewHandler(testWorkspace.host);

      expect(setViewport).toHaveBeenCalledWith(
        expect.objectContaining({ zoom: expect.any(Number) }),
        { duration: testWorkspace.options.getState().transitionDuration },
      );
      expect(testWorkspace.reactFlow.getState().fitViewOnInit).toBe(false);

      vi.advanceTimersByTime(
        testWorkspace.options.getState().transitionDuration + 10,
      );
      expect(testWorkspace.reactFlow.getState().fitViewOnInit).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("onFitViewHandler removes both camera motion and its wait under reduced motion", () => {
    vi.stubGlobal("window", {
      matchMedia: vi.fn(() => ({ matches: true })),
    });
    vi.useFakeTimers();
    try {
      const { setViewport } = setupFitViewState();
      setNodes([createNode({ id: "section-a" })]);

      onFitViewHandler(testWorkspace.host);

      expect(setViewport).toHaveBeenCalledWith(
        expect.objectContaining({ zoom: expect.any(Number) }),
        { duration: 0 },
      );
      vi.advanceTimersByTime(9);
      expect(testWorkspace.reactFlow.getState().fitViewOnInit).toBe(false);
      vi.advanceTimersByTime(1);
      expect(testWorkspace.reactFlow.getState().fitViewOnInit).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("onFitViewHandler is a no-op while fitViewOnInit is armed", () => {
    const { setViewport } = setupFitViewState({ fitViewOnInit: true });
    setNodes([createNode({ id: "section-a" })]);

    onFitViewHandler(testWorkspace.host);

    expect(setViewport).not.toHaveBeenCalled();
  });
});
