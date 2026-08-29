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
import { useNodeInternals } from "../document/stores";
import type { Node } from "../document/types";
import { fitView, onFitViewHandler } from "./fitView";
import { useWorkspaceOptions } from "./options";
import { initialCanvasState, useReactFlow } from "./store";

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

const transitionObject = { id: "transition" };

function setupFitViewState(overrides: Partial<typeof initialCanvasState> = {}) {
  const transform = vi.fn();
  const transition = vi.fn(() => ({ duration: () => transitionObject }));
  const d3Selection = {
    id: "selection",
    transition,
  } as unknown as NonNullable<typeof initialCanvasState.d3Selection>;
  const d3Zoom = { transform } as unknown as NonNullable<
    typeof initialCanvasState.d3Zoom
  >;

  testWorkspace.reactFlow.setState({
    ...initialCanvasState,
    width: 800,
    height: 600,
    d3Selection,
    d3Zoom,
    ...overrides,
  });

  return { d3Selection, transform, transition };
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
    const { d3Selection, transform } = setupFitViewState({
      fitViewOnInit: true,
      fitViewOnInitDone: false,
    });
    setNodes([createNode({ id: "section-a", width: 100, height: 100 })]);

    expect(fitView(testWorkspace.host, { initial: true, maxZoom: 3 })).toBe(
      true,
    );

    expect(transform).toHaveBeenCalledTimes(1);
    expect(transform).toHaveBeenCalledWith(
      d3Selection,
      expect.objectContaining({ k: 1 }),
    );
  });

  it("filters to explicit fitView targets before checking node measurement", () => {
    const { transform } = setupFitViewState();
    setNodes([
      createNode({ id: "target" }),
      createNode({ id: "unmeasured", width: null, height: null }),
    ]);

    expect(fitView(testWorkspace.host, { nodes: [{ id: "target" }] })).toBe(
      true,
    );
    expect(transform).toHaveBeenCalledTimes(1);

    transform.mockClear();

    expect(fitView(testWorkspace.host)).toBe(false);
    expect(transform).not.toHaveBeenCalled();
  });

  it("uses a transition wrapper only for positive durations", () => {
    const { d3Selection, transform } = setupFitViewState();
    setNodes([createNode({ id: "section-a" })]);

    expect(fitView(testWorkspace.host, { duration: 120 })).toBe(true);
    expect(transform).toHaveBeenCalledWith(
      transitionObject,
      expect.objectContaining({ k: expect.any(Number) }),
    );

    transform.mockClear();

    expect(fitView(testWorkspace.host, { duration: 0 })).toBe(true);
    expect(transform).toHaveBeenCalledWith(
      d3Selection,
      expect.objectContaining({ k: expect.any(Number) }),
    );
  });

  it("fits nodes inside the canvas area left visible by shell panes", () => {
    const { d3Selection, transform } = setupFitViewState({
      viewportInsets: { top: 0, right: 100, bottom: 0, left: 200 },
    });
    setNodes([createNode({ id: "section-a", width: 400, height: 100 })]);

    expect(fitView(testWorkspace.host, { duration: 0, padding: 0 })).toBe(true);
    expect(transform).toHaveBeenCalledWith(
      d3Selection,
      expect.objectContaining({ x: 200, y: 237.5, k: 1.25 }),
    );
  });

  it("applies a positive-duration fit immediately when reduced motion is requested", () => {
    vi.stubGlobal("window", {
      matchMedia: vi.fn(() => ({ matches: true })),
    });
    const { d3Selection, transform, transition } = setupFitViewState();
    setNodes([createNode({ id: "section-a" })]);

    expect(fitView(testWorkspace.host, { duration: 120 })).toBe(true);

    expect(transition).not.toHaveBeenCalled();
    expect(transform).toHaveBeenCalledWith(
      d3Selection,
      expect.objectContaining({ k: expect.any(Number) }),
    );
  });

  it("onFitViewHandler fits with the transition duration, then arms fitViewOnInit", () => {
    vi.useFakeTimers();
    try {
      const { transform } = setupFitViewState();
      setNodes([createNode({ id: "section-a" })]);

      onFitViewHandler(testWorkspace.host);

      expect(transform).toHaveBeenCalledWith(
        transitionObject,
        expect.objectContaining({ k: expect.any(Number) }),
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
      const { d3Selection, transform, transition } = setupFitViewState();
      setNodes([createNode({ id: "section-a" })]);

      onFitViewHandler(testWorkspace.host);

      expect(transition).not.toHaveBeenCalled();
      expect(transform).toHaveBeenCalledWith(
        d3Selection,
        expect.objectContaining({ k: expect.any(Number) }),
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
    const { transform } = setupFitViewState({ fitViewOnInit: true });
    setNodes([createNode({ id: "section-a" })]);

    onFitViewHandler(testWorkspace.host);

    expect(transform).not.toHaveBeenCalled();
  });
});
