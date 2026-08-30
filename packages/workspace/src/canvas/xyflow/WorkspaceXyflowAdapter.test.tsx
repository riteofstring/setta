/* @vitest-environment jsdom */
import type { NodeProps, ReactFlowProps } from "@xyflow/react";
import { act, createElement, forwardRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../../test/workspaceTestHost";
import type {
  Node as WorkspaceNode,
  WorkspaceSection,
} from "../../document/types";
import { getCanvasGesturesStore } from "../gestureState";
import { WorkspaceXyflowAdapter } from "./WorkspaceXyflowAdapter";
import type { WorkspaceXyflowSectionNode } from "./types";

const capturedReactFlow = vi.hoisted(() => ({
  nodesInitialized: false,
  props: null as unknown,
}));

vi.mock("@xyflow/react", () => ({
  ReactFlow: forwardRef<HTMLDivElement, { children?: ReactNode }>(
    (props, ref) => {
      capturedReactFlow.props = props;
      return (
        <div className="react-flow" data-workspace-xyflow-adapter ref={ref}>
          <div className="react-flow__renderer">
            <div className="react-flow__pane">{props.children}</div>
          </div>
        </div>
      );
    },
  ),
  ViewportPortal: ({ children }: { children: ReactNode }) => children,
  useNodesInitialized: () => capturedReactFlow.nodesInitialized,
  PanOnScrollMode: {
    Free: "free",
    Horizontal: "horizontal",
    Vertical: "vertical",
  },
  SelectionMode: {
    Full: "full",
    Partial: "partial",
  },
}));

vi.mock("../NodesSelection", () => ({
  NodesSelectionDragHandleWrapper: () => null,
  NodesSelectionWrapper: () => null,
}));

vi.mock("../../section/container/SectionContainer", () => ({
  SectionContainer: ({
    isTopLevel,
    sectionId,
  }: {
    isTopLevel: boolean;
    sectionId: string;
  }) => (
    <section
      data-section-container
      data-section-id={sectionId}
      data-top-level={isTopLevel}
    />
  ),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let testWorkspace: WorkspaceTestHost;
let adapterHost: HTMLDivElement;
let adapterRoot: Root;
let nodeHost: HTMLDivElement;
let nodeRoot: Root;

function createSection(
  id: string,
  positionAndSizeLocked = false,
): WorkspaceSection {
  return {
    id,
    kind: "leaf",
    name: id,
    size: { width: 200, height: 100 },
    isMinimized: false,
    positionAndSizeLocked,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children: [],
  };
}

function createNode(id: string, position = { x: 10, y: 20 }): WorkspaceNode {
  return {
    id,
    position,
    width: 200,
    height: 100,
    zIndex: 0,
    tempZIndex: 0,
    kind: "leaf",
  };
}

function getReactFlowProps(): ReactFlowProps<WorkspaceXyflowSectionNode> {
  const props = capturedReactFlow.props;
  if (!props) {
    throw new Error("Workspace XYFlow adapter did not render ReactFlow.");
  }
  return props as ReactFlowProps<WorkspaceXyflowSectionNode>;
}

beforeEach(() => {
  testWorkspace = createWorkspaceTestHost();
  const node = createNode("section");
  testWorkspace.document.setState({
    sections: { section: createSection("section") },
    topLevelSections: {
      section: { x: 10, y: 20, w: 200, h: 100, zIndex: 0 },
    },
  });
  testWorkspace.nodeInternals.setState({ x: new Map([[node.id, node]]) });
  adapterHost = document.createElement("div");
  nodeHost = document.createElement("div");
  document.body.append(adapterHost, nodeHost);
  adapterRoot = createRoot(adapterHost);
  nodeRoot = createRoot(nodeHost);
  capturedReactFlow.nodesInitialized = false;
  capturedReactFlow.props = null;
});

afterEach(async () => {
  await act(async () => {
    adapterRoot.unmount();
    nodeRoot.unmount();
  });
  adapterHost.remove();
  nodeHost.remove();
  testWorkspace.host.dispose();
});

describe("WorkspaceXyflowAdapter", () => {
  it("uses the authoritative Workspace group for a live drag handoff", async () => {
    const onDragCommit = vi.fn();
    const onDragStart = vi.fn();
    const onViewportChange = vi.fn();
    let publications = 0;
    const unsubscribe = testWorkspace.host.subscribe(() => {
      publications += 1;
    });
    const companion = createNode("companion", { x: 70, y: 100 });
    testWorkspace.document.setState({
      sections: {
        section: createSection("section"),
        companion: createSection("companion", true),
      },
      topLevelSections: {
        section: { x: 10, y: 20, w: 200, h: 100, zIndex: 0 },
        companion: { x: 70, y: 100, w: 200, h: 100, zIndex: 1 },
      },
    });
    testWorkspace.nodeInternals.setState((state) => ({
      x: new Map([...state.x, [companion.id, companion]]),
    }));
    testWorkspace.activeSections.setState({
      activeIds: ["section", "companion"],
    });
    testWorkspace.reactFlow.setState({
      autoPanOnNodeDrag: false,
      transform: [0, 0, 2],
    });

    await act(async () => {
      adapterRoot.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          <WorkspaceXyflowAdapter
            viewport={{ x: 0, y: 0, zoom: 2 }}
            onViewportChange={onViewportChange}
            onDragCommit={onDragCommit}
            onDragStart={onDragStart}
            wrapperDimensions={{ width: 800, height: 600 }}
          />
        </WorkspaceTestProvider>,
      );
    });

    const props = getReactFlowProps();
    expect(props.id).toBe(testWorkspace.domId);
    expect(props.proOptions).toEqual({ hideAttribution: true });
    expect(props.onlyRenderVisibleElements).toBe(false);
    expect(props.disableKeyboardA11y).toBeUndefined();
    expect(props.selectionOnDrag).toBe(false);
    expect(props.selectNodesOnDrag).toBe(false);
    expect(props.elementsSelectable).toBe(false);
    expect(props.onSelectionChange).toBeUndefined();
    expect(props.nodeDragThreshold).toBe(2);
    expect(props.snapToGrid).toBe(false);
    expect(props.autoPanOnNodeDrag).toBe(false);
    expect(props.nodes).toMatchObject([
      {
        id: "section",
        position: { x: 10, y: 20 },
        selectable: false,
        selected: true,
        draggable: true,
      },
      {
        id: "companion",
        position: { x: 70, y: 100 },
        selected: true,
        draggable: false,
      },
    ]);

    const startNode = props.nodes?.find((node) => node.id === "section");
    if (!startNode) {
      throw new Error(
        "Workspace XYFlow adapter rendered no draggable section.",
      );
    }
    await act(async () => {
      props.onNodeDragStart?.(
        new MouseEvent("mousemove", { clientX: 50, clientY: 80 }),
        startNode,
        [startNode],
      );
    });

    expect(onDragStart).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "section",
        position: { x: 10, y: 20 },
      }),
      expect.objectContaining({
        id: "companion",
        position: { x: 70, y: 100 },
      }),
    ]);
    expect(
      getCanvasGesturesStore(testWorkspace.host).getState()
        .mouseDownDraggingSection,
    ).toBe(true);

    const movedNode = {
      ...startNode,
      position: { x: 40, y: 60 },
      dragging: true,
    };
    await act(async () => {
      getReactFlowProps().onNodeDrag?.(
        new MouseEvent("mousemove", { clientX: 110, clientY: 160 }),
        movedNode,
        [movedNode],
      );
    });

    expect(publications).toBe(0);
    expect(onDragCommit).not.toHaveBeenCalled();
    const liveNodes = testWorkspace.nodeInternals.getState().x;
    expect(liveNodes.get("section")).toMatchObject({
      position: { x: 40, y: 60 },
    });
    expect(liveNodes.get("companion")).toMatchObject({
      position: { x: 100, y: 140 },
    });
    expect(getReactFlowProps().nodes).toMatchObject([
      { id: "section", position: { x: 40, y: 60 }, dragging: true },
      { id: "companion", position: { x: 100, y: 140 }, dragging: true },
    ]);

    await act(async () => {
      getReactFlowProps().onNodeDragStop?.(
        new MouseEvent("mouseup"),
        movedNode,
        [movedNode],
      );
    });

    expect(publications).toBe(0);
    expect(onDragCommit).toHaveBeenCalledTimes(1);
    expect(onDragCommit).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "section",
        position: { x: 40, y: 60 },
      }),
      expect.objectContaining({
        id: "companion",
        position: { x: 100, y: 140 },
      }),
    ]);
    expect(
      getCanvasGesturesStore(testWorkspace.host).getState()
        .mouseDownDraggingSection,
    ).toBe(false);
    unsubscribe();
  });

  it("keeps measurement changes in the adapter handoff and uses one renderer root", async () => {
    const onNodeDimensionsChange = vi.fn();

    await act(async () => {
      adapterRoot.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          <WorkspaceXyflowAdapter
            viewport={{ x: 0, y: 0, zoom: 1 }}
            onViewportChange={vi.fn()}
            onNodeDimensionsChange={onNodeDimensionsChange}
            wrapperDimensions={{ width: 800, height: 600 }}
          />
        </WorkspaceTestProvider>,
      );
    });

    await act(async () => {
      getReactFlowProps().onNodesChange?.([
        {
          id: "section",
          type: "dimensions",
          dimensions: { width: 240, height: 120 },
          resizing: false,
        },
      ]);
    });

    expect(onNodeDimensionsChange).toHaveBeenCalledWith([
      { id: "section", width: 240, height: 120 },
    ]);
    expect(adapterHost.querySelectorAll(".react-flow__renderer")).toHaveLength(
      1,
    );
    const presentationRoot = adapterHost.firstElementChild;
    if (!(presentationRoot instanceof HTMLElement)) {
      throw new Error(
        "Workspace XYFlow adapter rendered no presentation root.",
      );
    }
    expect(presentationRoot.style.height).toBe("600px");
    expect(presentationRoot.style.width).toBe("800px");
  });

  it("waits for public node measurement before completing an initial fit", async () => {
    const onRuntimeReady = vi.fn();

    await act(async () => {
      adapterRoot.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          <WorkspaceXyflowAdapter
            viewport={{ x: 0, y: 0, zoom: 1 }}
            onRuntimeReady={onRuntimeReady}
            onViewportChange={vi.fn()}
            wrapperDimensions={{ width: 800, height: 600 }}
          />
        </WorkspaceTestProvider>,
      );
    });

    expect(onRuntimeReady).not.toHaveBeenCalled();

    capturedReactFlow.nodesInitialized = true;
    await act(async () => {
      adapterRoot.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          <WorkspaceXyflowAdapter
            viewport={{ x: 0, y: 0, zoom: 1 }}
            onRuntimeReady={onRuntimeReady}
            onViewportChange={vi.fn()}
            wrapperDimensions={{ width: 800, height: 600 }}
          />
        </WorkspaceTestProvider>,
      );
    });

    expect(onRuntimeReady).toHaveBeenCalledTimes(1);
  });

  it("keeps sections hidden until the initial fit has completed", async () => {
    testWorkspace.reactFlow.setState({
      fitViewOnInit: true,
      fitViewOnInitDone: false,
    });

    await act(async () => {
      adapterRoot.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          <WorkspaceXyflowAdapter
            viewport={{ x: 0, y: 0, zoom: 1 }}
            onViewportChange={vi.fn()}
            wrapperDimensions={{ width: 800, height: 600 }}
          />
        </WorkspaceTestProvider>,
      );
    });

    expect(getReactFlowProps().nodes?.[0]?.style).toMatchObject({
      visibility: "hidden",
    });
    expect(
      adapterHost.firstElementChild?.getAttribute("data-ready-to-be-visible"),
    ).toBe("false");

    await act(async () => {
      testWorkspace.reactFlow.setState({ fitViewOnInitDone: true });
    });

    expect(getReactFlowProps().nodes?.[0]?.style).toMatchObject({
      visibility: "visible",
    });
    expect(
      adapterHost.firstElementChild?.getAttribute("data-ready-to-be-visible"),
    ).toBe("true");
  });

  it("restores the pane accessibility contract on the upstream pane", async () => {
    await act(async () => {
      adapterRoot.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          <WorkspaceXyflowAdapter
            viewport={{ x: 0, y: 0, zoom: 1 }}
            onViewportChange={vi.fn()}
            wrapperDimensions={{ width: 800, height: 600 }}
          />
        </WorkspaceTestProvider>,
      );
    });

    const pane = adapterHost.querySelector(".react-flow__pane");
    if (!(pane instanceof HTMLElement)) {
      throw new Error("Workspace XYFlow adapter rendered no pane.");
    }
    expect(pane.getAttribute("role")).toBe("group");
    expect(pane.getAttribute("aria-label")).toBe("Workspace canvas background");
    expect(pane.getAttribute("aria-keyshortcuts")).toBe(
      "Escape Shift+F10 ContextMenu",
    );
    expect(pane.getAttribute("tabindex")).toBe("-1");
  });

  it("leaves Workspace selection layers out of the upstream renderer", async () => {
    await act(async () => {
      adapterRoot.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          <WorkspaceXyflowAdapter
            viewport={{ x: 0, y: 0, zoom: 1 }}
            onViewportChange={vi.fn()}
            wrapperDimensions={{ width: 800, height: 600 }}
          />
        </WorkspaceTestProvider>,
      );
    });

    const props = getReactFlowProps();
    expect(props.selectionOnDrag).toBe(false);
    expect(props.elementsSelectable).toBe(false);
    expect(props.onSelectionStart).toBeUndefined();
    expect(props.onSelectionChange).toBeUndefined();
    expect(props.onSelectionDrag).toBeUndefined();
  });

  it("renders the current SectionContainer without an adapter wrapper", async () => {
    await act(async () => {
      adapterRoot.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          <WorkspaceXyflowAdapter
            viewport={{ x: 0, y: 0, zoom: 1 }}
            onViewportChange={vi.fn()}
            wrapperDimensions={{ width: 800, height: 600 }}
          />
        </WorkspaceTestProvider>,
      );
    });

    const nodeType = getReactFlowProps().nodeTypes?.workspace;
    if (!nodeType) {
      throw new Error(
        "Workspace XYFlow adapter did not register its node type.",
      );
    }

    await act(async () => {
      nodeRoot.render(
        createElement(nodeType, {
          id: "section",
          type: "workspace",
          data: { sectionId: "section" },
          width: 200,
          height: 100,
          dragging: false,
          zIndex: 0,
          selectable: true,
          deletable: false,
          selected: false,
          draggable: true,
          isConnectable: false,
          positionAbsoluteX: 10,
          positionAbsoluteY: 20,
        }),
      );
    });

    expect(nodeHost.childElementCount).toBe(1);
    expect(nodeHost.firstElementChild).toMatchObject({
      tagName: "SECTION",
      dataset: {
        sectionContainer: "true",
        sectionId: "section",
        topLevel: "true",
      },
    });
  });
});
