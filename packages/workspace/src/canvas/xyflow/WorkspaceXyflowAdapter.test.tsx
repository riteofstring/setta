/* @vitest-environment jsdom */
import type { NodeProps, ReactFlowProps } from "@xyflow/react";
import { act, createElement } from "react";
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
import { WorkspaceXyflowAdapter } from "./WorkspaceXyflowAdapter";
import type { WorkspaceXyflowSectionNode } from "./types";

const capturedReactFlow = vi.hoisted(() => ({ props: null as unknown }));

vi.mock("@xyflow/react", () => ({
  ReactFlow: (props: unknown) => {
    capturedReactFlow.props = props;
    return <div data-workspace-xyflow-adapter />;
  },
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

function createSection(id: string): WorkspaceSection {
  return {
    id,
    kind: "leaf",
    name: id,
    size: { width: 200, height: 100 },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children: [],
  };
}

function createNode(id: string): WorkspaceNode {
  return {
    id,
    position: { x: 10, y: 20 },
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
  it("keeps XYFlow changes transient until the drag-stop handoff", async () => {
    const onDragCommit = vi.fn();
    const onViewportChange = vi.fn();
    let publications = 0;
    const unsubscribe = testWorkspace.host.subscribe(() => {
      publications += 1;
    });

    await act(async () => {
      adapterRoot.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          <WorkspaceXyflowAdapter
            viewport={{ x: 0, y: 0, zoom: 1 }}
            onViewportChange={onViewportChange}
            onDragCommit={onDragCommit}
          />
        </WorkspaceTestProvider>,
      );
    });

    const props = getReactFlowProps();
    expect(props.id).toBe(testWorkspace.domId);
    expect(props.proOptions).toEqual({ hideAttribution: true });
    expect(props.onlyRenderVisibleElements).toBe(false);
    expect(props.disableKeyboardA11y).toBe(true);
    expect(props.nodes).toMatchObject([
      { id: "section", selected: false, position: { x: 10, y: 20 } },
    ]);

    await act(async () => {
      props.onNodesChange?.([
        {
          id: "section",
          type: "position",
          position: { x: 40, y: 60 },
          dragging: true,
        },
      ]);
    });

    expect(publications).toBe(0);
    expect(onDragCommit).not.toHaveBeenCalled();
    expect(getReactFlowProps().nodes).toMatchObject([
      { id: "section", position: { x: 40, y: 60 }, dragging: true },
    ]);

    const movedNode = {
      ...getReactFlowProps().nodes?.[0],
      position: { x: 55, y: 75 },
      dragging: false,
    } as WorkspaceXyflowSectionNode;
    await act(async () => {
      getReactFlowProps().onNodeDragStop?.(
        new MouseEvent("mouseup"),
        movedNode,
        [movedNode],
      );
    });

    expect(publications).toBe(0);
    expect(onDragCommit).toHaveBeenCalledTimes(1);
    expect(onDragCommit).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: "section",
          position: { x: 55, y: 75 },
          dragging: false,
        }),
      ]),
    );
    unsubscribe();
  });

  it("renders the current SectionContainer without an adapter wrapper", async () => {
    await act(async () => {
      adapterRoot.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          <WorkspaceXyflowAdapter
            viewport={{ x: 0, y: 0, zoom: 1 }}
            onViewportChange={vi.fn()}
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
