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
import {
  getNodeUpdateInformation,
  updateNodeDimensions,
  updateNodeDimensionsFromGpuIntrinsicSize,
  updateNodeDimensionsFromGpuResize,
} from "./nodeInternals";
import { debounced_route_set_top_level_section_layout } from "./sectionInfos";

vi.mock("./sectionInfos", () => ({
  debounced_route_set_top_level_section_layout: vi.fn(),
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
  viewport.className = "setta-gpu-flow__canvas";
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

  it("ignores DOM measurements and defers fitView until code areas finish rendering", () => {
    useNodeInternals.setState({
      x: new Map([
        ["section-1", createNode({ id: "section-1", width: 100, height: 80 })],
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
    expect(node?.width).toBe(100);
    expect(node?.height).toBe(80);
    expect(debounced_route_set_top_level_section_layout).not.toHaveBeenCalled();
    expect(gpuFlowViewportStore.getState().fitViewOnInitDone).toBe(false);
  });

  it("updates GPU resize dimensions without scheduling top-level layout persistence", () => {
    useNodeInternals.setState({
      x: new Map([
        [
          "section-1",
          createNode({
            id: "section-1",
            width: 100,
            height: 50,
          }),
        ],
      ]),
    });

    expect(
      updateNodeDimensionsFromGpuResize({
        id: "section-1",
        width: 140,
        height: 80,
      }),
    ).toBe(true);

    const node = useNodeInternals.getState().x.get("section-1");
    expect(node?.width).toBe(140);
    expect(node?.height).toBe(80);
    expect(debounced_route_set_top_level_section_layout).not.toHaveBeenCalled();
  });

  it("updates intrinsic GPU auto-size dimensions without scheduling top-level layout persistence", () => {
    useNodeInternals.setState({
      x: new Map([
        [
          "section-1",
          createNode({
            id: "section-1",
            width: 550,
            height: null,
          }),
        ],
      ]),
    });

    expect(
      updateNodeDimensionsFromGpuIntrinsicSize({
        id: "section-1",
        height: 352,
      }),
    ).toBe(true);

    const node = useNodeInternals.getState().x.get("section-1");
    expect(node?.width).toBe(550);
    expect(node?.height).toBe(352);
    expect(debounced_route_set_top_level_section_layout).not.toHaveBeenCalled();
  });

  it("keeps GPU-resized section dimensions in project state", () => {
    useNodeInternals.setState({
      x: new Map([
        ["section-1", createNode({ id: "section-1", width: 200, height: 100 })],
      ]),
    });

    updateNodeDimensionsFromGpuResize({
      id: "section-1",
      width: 240,
      height: 120,
    });

    expect(useNodeInternals.getState().x.get("section-1")).toMatchObject({
      width: 240,
      height: 120,
    });
  });

  it("refreshes existing selected-node bounds when a selected node GPU-resizes", () => {
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

    updateNodeDimensionsFromGpuResize({
      id: "section-1",
      width: 160,
      height: 80,
    });

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

    expect(gpuFlowViewportStore.getState().transform).toEqual([470, 260, 1]);
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

  it("ignores ResizeObserver entries as graph dimension updates", () => {
    useNodeInternals.setState({
      x: new Map([
        ["section-1", createNode({ id: "section-1", width: 200, height: 100 })],
      ]),
    });
    const observedSourceHost = createMeasuredElement({
      id: "section-1",
      width: 260,
      height: 140,
    });

    const updates = getNodeUpdateInformation(
      [{ target: observedSourceHost } as unknown as ResizeObserverEntry],
      true,
    );

    expect(updates).toEqual([
      {
        id: "section-1",
        nodeElement: observedSourceHost,
        forceUpdate: true,
      },
    ]);

    updateNodeDimensions(updates);

    expect(useNodeInternals.getState().x.get("section-1")).toMatchObject({
      width: 200,
      height: 100,
    });
    expect(debounced_route_set_top_level_section_layout).not.toHaveBeenCalled();
  });
});
