/* @vitest-environment jsdom */

import {
  useLocalStorage,
  useNodeInternals,
  useSettings,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import { createSettingsState } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useReactFlow } from ".";
import type { Node } from "../types";
import initialState from "./initialState";
import { fitView } from "./utils";

function createNode(overrides: Partial<Node> & Pick<Node, "id">): Node {
  const node: Node = {
    id: overrides.id,
    position: overrides.position ?? { x: 0, y: 0 },
    width: overrides.width === undefined ? 100 : overrides.width,
    height: overrides.height === undefined ? 80 : overrides.height,
    zIndex: overrides.zIndex === undefined ? 0 : overrides.zIndex,
    tempZIndex: overrides.tempZIndex === undefined ? 0 : overrides.tempZIndex,
  };
  if (overrides.type !== undefined) {
    node.type = overrides.type;
  }
  if (overrides.style !== undefined) {
    node.style = overrides.style;
  }
  return node;
}

function setNodes(nodes: Node[]) {
  useNodeInternals.setState({
    x: new Map(nodes.map((node) => [node.id, node])),
  });
}

function setupFitViewState(overrides: Partial<typeof initialState> = {}) {
  useReactFlow.setState({
    ...initialState,
    width: 800,
    height: 600,
    ...overrides,
  });
}

describe("fitView", () => {
  beforeEach(() => {
    resetProjectStores();
    useSettings.setState(createSettingsState());
    useLocalStorage.setState({ overviewTrueWidth: 0 });
    useReactFlow.setState({ ...initialState });
  });

  afterEach(() => {
    resetProjectStores();
    useReactFlow.setState({ ...initialState });
  });

  it("caps initial fit zoom to the default zoom level", () => {
    setupFitViewState({
      fitViewOnInit: true,
      fitViewOnInitDone: false,
    });
    setNodes([createNode({ id: "section-a", width: 100, height: 100 })]);

    expect(fitView({ initial: true, maxZoom: 3 })).toBe(true);

    expect(useReactFlow.getState().transform[2]).toBe(1);
  });

  it("filters to explicit fitView targets before checking node measurement", () => {
    setupFitViewState();
    setNodes([
      createNode({ id: "target" }),
      createNode({ id: "unmeasured", width: null, height: null }),
    ]);

    expect(fitView({ nodes: [{ id: "target" }] })).toBe(true);
    const fittedTransform = useReactFlow.getState().transform;
    expect(fittedTransform).not.toEqual(initialState.transform);

    expect(fitView()).toBe(false);
    expect(useReactFlow.getState().transform).toEqual(fittedTransform);
  });

  it("sets the canvas viewport directly when a duration is provided", () => {
    setupFitViewState();
    setNodes([createNode({ id: "section-a" })]);

    expect(fitView({ duration: 120 })).toBe(true);
    const transformWithDuration = useReactFlow.getState().transform;

    useReactFlow.setState({ transform: initialState.transform });
    expect(fitView({ duration: 0 })).toBe(true);
    expect(useReactFlow.getState().transform).toEqual(transformWithDuration);
  });
});
