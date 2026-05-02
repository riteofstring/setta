/* @vitest-environment jsdom */

import type { Node } from "gpuFlow/flowTypes";
import { gpuFlowViewportStore } from "gpuFlow/viewportStore";
import {
  useActiveSectionUI,
  useLocalStorage,
  useMisc,
  useNodeInternals,
  useSectionRefs,
  useSettings,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import { createSettingsState } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleEdgeHandlePositionUpdate } from "./edgeHandles";
import {
  getNodeUpdateInformation,
  updateNodeDimensions,
} from "./nodeInternals";
import {
  debounced_route_set_top_level_section_layout,
  getSectionDescendants,
} from "./sectionInfos";

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

function setupGpuViewportStore() {
  gpuFlowViewportStore.getState().setDomNode(createViewportDomNode());
  gpuFlowViewportStore.getState().setViewportSize({
    height: 600,
    width: 800,
  });
  gpuFlowViewportStore.getState().setZoomBounds({
    defaultZoom: 1,
    maxZoom: 4,
    minZoom: 0.1,
  });
  gpuFlowViewportStore.getState().setTransform([0, 0, 1]);
  gpuFlowViewportStore.getState().setFitViewInitializationState({
    fitViewOnInit: false,
    fitViewOnInitDone: false,
    fitViewOnInitOptions: undefined,
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
    vi.mocked(getSectionDescendants).mockImplementation((sectionId) => [
      sectionId,
    ]);
    useSettings.setState(createSettingsState());
    useLocalStorage.setState({ overviewTrueWidth: 0, uiEditorTrueWidth: 0 });
    setupGpuViewportStore();
  });

  afterEach(() => {
    vi.clearAllMocks();
    resetProjectStores();
    const domNode = gpuFlowViewportStore.getState().domNode;
    if (domNode) {
      gpuFlowViewportStore.getState().clearDomNode(domNode);
    }
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
    expect(gpuFlowViewportStore.getState().fitViewOnInitDone).toBe(false);
  });

  it("schedules edge handle refreshes for resized section descendants", () => {
    vi.mocked(getSectionDescendants).mockImplementation((sectionId) =>
      sectionId === "section-1" ? ["section-1", "child-1"] : [sectionId],
    );
    useNodeInternals.setState({
      x: new Map([
        ["section-1", createNode({ id: "section-1", width: 200, height: 100 })],
      ]),
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

    expect(scheduleEdgeHandlePositionUpdate).toHaveBeenCalledWith([
      "section-1",
      "child-1",
    ]);
  });

  it("refreshes existing selected-node bounds when a selected node resizes", () => {
    useNodeInternals.setState({
      x: new Map([
        [
          "section-1",
          createNode({
            id: "section-1",
            height: 50,
            position: { x: 10, y: 20 },
            width: 100,
          }),
        ],
        [
          "section-2",
          createNode({
            id: "section-2",
            height: 40,
            position: { x: 200, y: 40 },
            width: 30,
          }),
        ],
      ]),
    });
    useActiveSectionUI.setState({ activeIds: ["section-1", "section-2"] });
    gpuFlowViewportStore.getState().setNodesSelectionBounds({
      height: 60,
      width: 220,
      x: 10,
      y: 20,
    });

    updateNodeDimensions([
      {
        id: "section-1",
        nodeElement: createMeasuredElement({
          id: "section-1",
          width: 160,
          height: 80,
        }),
        forceUpdate: false,
      },
    ]);

    expect(gpuFlowViewportStore.getState().nodesSelectionBounds).toEqual({
      height: 80,
      width: 220,
      x: 10,
      y: 20,
    });
  });

  it("marks initial fitView complete once measurements are ready and centers into the visible pane", () => {
    useLocalStorage.setState({ overviewTrueWidth: 120 });
    gpuFlowViewportStore.getState().setFitViewInitializationState({
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

    expect(gpuFlowViewportStore.getState().transform).toEqual([430, 240, 1]);
    expect(gpuFlowViewportStore.getState().fitViewOnInitDone).toBe(true);
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
