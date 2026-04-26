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
  return {
    id: overrides.id,
    position: overrides.position ?? { x: 0, y: 0 },
    width: overrides.width ?? null,
    height: overrides.height ?? null,
    zIndex: overrides.zIndex ?? 0,
    tempZIndex: overrides.tempZIndex ?? 0,
    type: overrides.type,
    style: overrides.style,
  };
}

function createViewportDomNode() {
  const domNode = document.createElement("div");
  const viewport = document.createElement("div");
  viewport.className = "react-flow__viewport";
  domNode.appendChild(viewport);
  return domNode;
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
    domNode: createViewportDomNode(),
    width: 800,
    height: 600,
    d3Selection,
    d3Zoom,
    ...overrides,
  });

  return { transform };
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

  it("marks initial fitView complete once measurements are ready", () => {
    const { transform } = setupFitViewState({
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

    expect(transform).toHaveBeenCalledTimes(1);
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
