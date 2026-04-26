/* @vitest-environment jsdom */

import { useReactFlow } from "forks/xyflow/core/store";
import initialState from "forks/xyflow/core/store/initialState";
import type { Node } from "forks/xyflow/core/types";
import {
  useLocalStorage,
  useMisc,
  useNodeInternals,
  useSectionRefs,
  useSettings,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import { createSettingsState } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  flushPendingNodeDimensionLayoutPersistence,
  getNodeUpdateInformation,
  updateNodeDimensions,
} from "./nodeInternals";
import { debounced_route_set_top_level_section_layout } from "./sectionInfos";

vi.mock("./edgeHandles", () => ({
  scheduleEdgeHandlePositionUpdate: vi.fn(),
}));

vi.mock("./sectionInfos", () => ({
  debounced_route_set_top_level_section_layout: vi.fn(),
  getSectionDescendants: vi.fn(() => []),
}));

function createNode(overrides: Partial<Node> & Pick<Node, "id">): Node {
  const node: Node = {
    id: overrides.id,
    position: overrides.position ?? { x: 0, y: 0 },
    width: overrides.width ?? null,
    height: overrides.height ?? null,
    zIndex: overrides.zIndex ?? 0,
    tempZIndex: overrides.tempZIndex ?? 0,
  };
  if (overrides.type !== undefined) {
    node.type = overrides.type;
  }
  if (overrides.style !== undefined) {
    node.style = overrides.style;
  }
  return node;
}

function createViewportDomNode() {
  const domNode = document.createElement("div");
  const viewport = document.createElement("div");
  viewport.className = "canvas-flow__canvas";
  domNode.appendChild(viewport);
  return domNode;
}

function setupFitViewState(overrides: Partial<typeof initialState> = {}) {
  useReactFlow.setState({
    ...initialState,
    domNode: createViewportDomNode(),
    width: 800,
    height: 600,
    ...overrides,
  });
}

function createMeasuredElement({
  id,
  width,
  height,
}: {
  id: string;
  width: number;
  height: number;
}) {
  const element = document.createElement("div") as HTMLDivElement;
  element.dataset.id = id;
  Object.defineProperty(element, "offsetWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(element, "offsetHeight", {
    configurable: true,
    value: height,
  });
  return element;
}

describe("nodeInternals", () => {
  beforeEach(() => {
    resetProjectStores();
    useSettings.setState(createSettingsState());
    useLocalStorage.setState({ overviewTrueWidth: 0, uiEditorTrueWidth: 0 });
    useReactFlow.setState({
      ...initialState,
      domNode: createViewportDomNode(),
      fitViewOnInit: false,
      fitViewOnInitDone: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    resetProjectStores();
    useReactFlow.setState({ ...initialState });
  });

  it("updates measured dimensions and defers fitView until code areas finish rendering", () => {
    useNodeInternals.setState({
      x: new Map([
        [
          "section-1",
          createNode({ id: "section-1", width: null, height: null }),
        ],
      ]),
    });
    useMisc.setState({
      numDisplayedCodeAreas: 2,
      numInitializedCodeAreas: 1,
    });

    updateNodeDimensions([
      {
        id: "section-1",
        nodeElement: createMeasuredElement({
          id: "section-1",
          width: 240,
          height: 120,
        }),
        forceUpdate: false,
      },
    ]);

    const node = useNodeInternals.getState().x.get("section-1");
    expect(node?.width).toBe(240);
    expect(node?.height).toBe(120);
    expect(debounced_route_set_top_level_section_layout).toHaveBeenCalledTimes(
      1,
    );
    expect(useReactFlow.getState().fitViewOnInitDone).toBe(false);
  });

  it("does not write state or persist layout for an empty dimension update list", () => {
    const nodes = new Map([
      ["section-1", createNode({ id: "section-1", width: 240, height: 120 })],
    ]);
    useNodeInternals.setState({ x: nodes });

    updateNodeDimensions([]);

    expect(useNodeInternals.getState().x).toBe(nodes);
    expect(debounced_route_set_top_level_section_layout).not.toHaveBeenCalled();
  });

  it("does not write state or persist layout when observed dimensions are unchanged", () => {
    const nodes = new Map([
      ["section-1", createNode({ id: "section-1", width: 240, height: 120 })],
    ]);
    useNodeInternals.setState({ x: nodes });

    updateNodeDimensions([
      {
        id: "section-1",
        nodeElement: createMeasuredElement({
          id: "section-1",
          width: 240,
          height: 120,
        }),
        forceUpdate: true,
      },
    ]);

    expect(useNodeInternals.getState().x).toBe(nodes);
    expect(debounced_route_set_top_level_section_layout).not.toHaveBeenCalled();
  });

  it("updates one changed dimension and keeps the existing layout persistence path", () => {
    useNodeInternals.setState({
      x: new Map([
        ["section-1", createNode({ id: "section-1", width: 240, height: 120 })],
      ]),
    });

    updateNodeDimensions([
      {
        id: "section-1",
        nodeElement: createMeasuredElement({
          id: "section-1",
          width: 260,
          height: 120,
        }),
        forceUpdate: true,
      },
    ]);

    const node = useNodeInternals.getState().x.get("section-1");
    expect(node?.width).toBe(260);
    expect(node?.height).toBe(120);
    expect(debounced_route_set_top_level_section_layout).toHaveBeenCalledTimes(
      1,
    );
  });

  it("defers changed dimension layout persistence until the viewport gesture finishes", () => {
    useReactFlow.setState({ viewportInteractionActive: true });
    useNodeInternals.setState({
      x: new Map([
        ["section-1", createNode({ id: "section-1", width: 240, height: 120 })],
      ]),
    });

    updateNodeDimensions([
      {
        id: "section-1",
        nodeElement: createMeasuredElement({
          id: "section-1",
          width: 240,
          height: 150,
        }),
        forceUpdate: true,
      },
    ]);

    const node = useNodeInternals.getState().x.get("section-1");
    expect(node?.height).toBe(150);
    expect(debounced_route_set_top_level_section_layout).not.toHaveBeenCalled();

    useReactFlow.setState({ viewportInteractionActive: false });
    flushPendingNodeDimensionLayoutPersistence();

    expect(debounced_route_set_top_level_section_layout).toHaveBeenCalledTimes(
      1,
    );
  });

  it("marks initial fitView complete once measurements are ready", () => {
    setupFitViewState({
      fitViewOnInit: true,
      fitViewOnInitDone: false,
      fitViewOnInitOptions: { maxZoom: 1.5 },
    });
    useNodeInternals.setState({
      x: new Map([
        ["section-1", createNode({ id: "section-1", width: 100, height: 80 })],
      ]),
    });
    useMisc.setState({
      numDisplayedCodeAreas: 1,
      numInitializedCodeAreas: 1,
    });

    updateNodeDimensions([
      {
        id: "section-1",
        nodeElement: createMeasuredElement({
          id: "section-1",
          width: 180,
          height: 120,
        }),
        forceUpdate: false,
      },
    ]);

    expect(useReactFlow.getState().transform).not.toEqual(
      initialState.transform,
    );
    expect(useReactFlow.getState().fitViewOnInitDone).toBe(true);
  });

  it("collects stored refs for explicit node refresh requests", () => {
    const sectionRef = createMeasuredElement({
      id: "section-1",
      width: 200,
      height: 100,
    });
    useSectionRefs.setState({
      withNested: {
        "section-1": sectionRef,
      },
      selfOnly: {},
    });

    expect(
      getNodeUpdateInformation(["section-1", "missing-section"], false),
    ).toEqual([
      {
        id: "section-1",
        nodeElement: sectionRef,
        forceUpdate: true,
      },
    ]);
  });
});
