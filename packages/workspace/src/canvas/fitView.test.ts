import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNodeInternals } from "../document/stores";
import type { Node } from "../document/types";
import { fitView } from "./fitView";
import { useWorkspaceOptions } from "./options";
import { initialCanvasState, useReactFlow } from "./store";

// Ported from the reference fork's `store/utils.test.ts`.

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
  useNodeInternals.setState({
    x: new Map(nodes.map((node) => [node.id, node])),
  });
}

const transitionObject = { id: "transition" };

function setupFitViewState(overrides: Partial<typeof initialCanvasState> = {}) {
  const transform = vi.fn();
  const d3Selection = {
    id: "selection",
    transition: () => ({ duration: () => transitionObject }),
  } as unknown as NonNullable<typeof initialCanvasState.d3Selection>;
  const d3Zoom = { transform } as unknown as NonNullable<typeof initialCanvasState.d3Zoom>;

  useReactFlow.setState({
    ...initialCanvasState,
    width: 800,
    height: 600,
    d3Selection,
    d3Zoom,
    ...overrides,
  });

  return { d3Selection, transform };
}

describe("fitView", () => {
  beforeEach(() => {
    useNodeInternals.getState().reset();
    useWorkspaceOptions.getState().reset();
    useReactFlow.setState({ ...initialCanvasState });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useNodeInternals.getState().reset();
    useReactFlow.setState({ ...initialCanvasState });
  });

  it("caps initial fit zoom to the default zoom level", () => {
    const { d3Selection, transform } = setupFitViewState({
      fitViewOnInit: true,
      fitViewOnInitDone: false,
    });
    setNodes([createNode({ id: "section-a", width: 100, height: 100 })]);

    expect(fitView({ initial: true, maxZoom: 3 })).toBe(true);

    expect(transform).toHaveBeenCalledTimes(1);
    expect(transform).toHaveBeenCalledWith(d3Selection, expect.objectContaining({ k: 1 }));
  });

  it("filters to explicit fitView targets before checking node measurement", () => {
    const { transform } = setupFitViewState();
    setNodes([
      createNode({ id: "target" }),
      createNode({ id: "unmeasured", width: null, height: null }),
    ]);

    expect(fitView({ nodes: [{ id: "target" }] })).toBe(true);
    expect(transform).toHaveBeenCalledTimes(1);

    transform.mockClear();

    expect(fitView()).toBe(false);
    expect(transform).not.toHaveBeenCalled();
  });

  it("uses a transition wrapper only for positive durations", () => {
    const { d3Selection, transform } = setupFitViewState();
    setNodes([createNode({ id: "section-a" })]);

    expect(fitView({ duration: 120 })).toBe(true);
    expect(transform).toHaveBeenCalledWith(
      transitionObject,
      expect.objectContaining({ k: expect.any(Number) }),
    );

    transform.mockClear();

    expect(fitView({ duration: 0 })).toBe(true);
    expect(transform).toHaveBeenCalledWith(
      d3Selection,
      expect.objectContaining({ k: expect.any(Number) }),
    );
  });
});
