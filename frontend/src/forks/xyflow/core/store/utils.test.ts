/* @vitest-environment jsdom */

import {
  useLocalStorage,
  useNodeInternals,
  useSettings,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import { createSettingsState } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReactFlow } from ".";
import type { Node } from "../types";
import * as graphUtils from "../utils/graph";
import initialState from "./initialState";
import { fitView } from "./utils";

function createNode(overrides: Partial<Node> & Pick<Node, "id">): Node {
  return {
    id: overrides.id,
    position: overrides.position ?? { x: 0, y: 0 },
    width: overrides.width === undefined ? 100 : overrides.width,
    height: overrides.height === undefined ? 80 : overrides.height,
    zIndex: overrides.zIndex === undefined ? 0 : overrides.zIndex,
    tempZIndex: overrides.tempZIndex === undefined ? 0 : overrides.tempZIndex,
    type: overrides.type,
    style: overrides.style,
  };
}

function setNodes(nodes: Node[]) {
  useNodeInternals.setState({
    x: new Map(nodes.map((node) => [node.id, node])),
  });
}

function setupFitViewState(overrides: Partial<typeof initialState> = {}) {
  const transform = vi.fn();
  const d3Selection = { id: "selection" } as unknown as NonNullable<
    typeof initialState.d3Selection
  >;
  const d3Zoom = { transform } as unknown as NonNullable<
    typeof initialState.d3Zoom
  >;

  useReactFlow.setState({
    ...initialState,
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
    resetProjectStores();
    useSettings.setState(createSettingsState());
    useLocalStorage.setState({ overviewTrueWidth: 0 });
    useReactFlow.setState({ ...initialState });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetProjectStores();
    useReactFlow.setState({ ...initialState });
  });

  it("caps initial fit zoom to the default zoom level", () => {
    const { transform } = setupFitViewState({
      fitViewOnInit: true,
      fitViewOnInitDone: false,
    });
    setNodes([createNode({ id: "section-a", width: 100, height: 100 })]);

    expect(fitView({ initial: true, maxZoom: 3 })).toBe(true);

    expect(transform).toHaveBeenCalledTimes(1);
    expect(transform.mock.calls[0][1]).toMatchObject({ k: 1 });
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
    const transition = { id: "transition" } as ReturnType<
      typeof graphUtils.getD3Transition
    >;
    const getD3TransitionSpy = vi
      .spyOn(graphUtils, "getD3Transition")
      .mockReturnValue(transition);
    setNodes([createNode({ id: "section-a" })]);

    expect(fitView({ duration: 120 })).toBe(true);
    expect(getD3TransitionSpy).toHaveBeenCalledWith(d3Selection, 120);
    expect(transform).toHaveBeenCalledWith(
      transition,
      expect.objectContaining({ k: expect.any(Number) }),
    );

    transform.mockClear();
    getD3TransitionSpy.mockClear();

    expect(fitView({ duration: 0 })).toBe(true);
    expect(getD3TransitionSpy).not.toHaveBeenCalled();
    expect(transform).toHaveBeenCalledWith(
      d3Selection,
      expect.objectContaining({ k: expect.any(Number) }),
    );
  });
});
