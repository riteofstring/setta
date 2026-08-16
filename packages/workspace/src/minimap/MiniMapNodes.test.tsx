/* @vitest-environment jsdom */
import { beforeEach as beforeEachWorkspaceTestHost } from "vitest";
import { createWorkspaceTestHost, type WorkspaceTestHost, WorkspaceTestProvider } from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});


import { act, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initialCanvasState, useReactFlow } from "../canvas/store";
import {
  useNodeInternals,
  useWorkspaceAppearance,
  useWorkspaceDocument,
} from "../document/stores";
import type { Node, WorkspaceSection } from "../document/types";
import {
  areMiniMapNodesRenderableInputsEqual,
  MiniMapNodes,
  MiniMapNodesReactive,
} from "./MiniMapNodes";
import type { MiniMapNodeProps } from "./types";

// Ported from the reference fork's `minimap/MiniMapNodes.test.tsx`. The reactive-visuals cases
// resolve through the package document (the application resolves variant indirection on its
// side of the seam); the section-style *preview* case left with the app's style-color editing
// feature, and the dark-mode case freezes the reactive appearance dependency the reference
// exercises through its localStorage store.

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createSection(
  overrides: Partial<WorkspaceSection> & { id: string },
): WorkspaceSection {
  return {
    kind: "note",
    name: overrides.id,
    size: { width: 100, height: 80 },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children: [],
    ...overrides,
  };
}

function createMiniMapNode(overrides: Partial<Node> & { id: string }): Node {
  return {
    position: { x: 10, y: 20 },
    width: 100,
    height: 80,
    zIndex: 0,
    tempZIndex: 0,
    kind: "note",
    ...overrides,
  };
}

function resetMiniMapStores() {
  testWorkspace.document.getState().reset();
  testWorkspace.nodeInternals.setState({ x: new Map() });
  testWorkspace.appearance.getState().reset();
  testWorkspace.reactFlow.setState({
    ...initialCanvasState,
    fitViewOnInit: false,
    fitViewOnInitDone: true,
  });
}

describe("MiniMapNodes", () => {
  beforeEach(() => {
    resetMiniMapStores();
  });

  afterEach(() => {
    resetMiniMapStores();
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
    document.body.innerHTML = "";
  });

  it("renders stable node ids for imperative selection syncing", () => {
    const nodes: Array<Node> = [
      createMiniMapNode({ id: "section-a" }),
      createMiniMapNode({
        id: "section-b",
        position: { x: 180, y: 40 },
        width: 120,
        height: 90,
      }),
    ];

    const markup = renderToStaticMarkup(
      <svg>
        <MiniMapNodes nodes={nodes} />
      </svg>,
    );

    expect(markup).toContain('data-minimap-node-id="section-a"');
    expect(markup).toContain('data-minimap-node-id="section-b"');
    expect(markup).not.toContain("react-flow__minimap-node selected");
  });

  it("tracks style changes as render-affecting minimap inputs", () => {
    const left: Array<Node> = [
      createMiniMapNode({ id: "section-a", style: { background: "#111111" } }),
    ];
    const right: Array<Node> = [
      createMiniMapNode({ id: "section-a", style: { background: "#ff0000" } }),
    ];

    expect(areMiniMapNodesRenderableInputsEqual(left, right)).toBe(false);
  });

  it("re-renders fill when only node style changes", async () => {
    testWorkspace.nodeInternals.setState({
      x: new Map([
        [
          "section-a",
          createMiniMapNode({
            id: "section-a",
            style: { background: "#111111" },
          }),
        ],
      ]),
    });
    const rendered = await renderReactiveMiniMap(
      <MiniMapNodesReactive
        nodeColor={(node) => node.style?.background?.toString() ?? "#000000"}
      />,
    );

    try {
      expect(rendered.getRect("section-a")?.getAttribute("fill")).toBe(
        "#111111",
      );

      await act(async () => {
        testWorkspace.nodeInternals.setState({
          x: new Map([
            [
              "section-a",
              createMiniMapNode({
                id: "section-a",
                style: { background: "#ff0000" },
              }),
            ],
          ]),
        });
      });

      expect(rendered.getRect("section-a")?.getAttribute("fill")).toBe(
        "#ff0000",
      );
    } finally {
      await rendered.dispose();
    }
  });

  it("re-renders stroke when only the node kind changes", async () => {
    testWorkspace.nodeInternals.setState({
      x: new Map([
        ["section-a", createMiniMapNode({ id: "section-a", kind: "note" })],
      ]),
    });
    const rendered = await renderReactiveMiniMap(
      <MiniMapNodesReactive
        nodeStrokeColor={(node) =>
          node.kind === "card" ? "#0041d0" : "#e2e8f0"
        }
      />,
    );

    try {
      expect(rendered.getRect("section-a")?.getAttribute("stroke")).toBe(
        "#e2e8f0",
      );

      await act(async () => {
        testWorkspace.nodeInternals.setState({
          x: new Map([
            ["section-a", createMiniMapNode({ id: "section-a", kind: "card" })],
          ]),
        });
      });

      expect(rendered.getRect("section-a")?.getAttribute("stroke")).toBe(
        "#0041d0",
      );
    } finally {
      await rendered.dispose();
    }
  });

  it("re-renders fill when the document updates a section style without geometry changes", async () => {
    testWorkspace.nodeInternals.setState({
      x: new Map([["section-a", createMiniMapNode({ id: "section-a" })]]),
    });
    testWorkspace.document.setState({
      sections: { "section-a": createSection({ id: "section-a" }) },
      topLevelSections: {
        "section-a": { x: 10, y: 20, w: 100, h: 80, zIndex: 0 },
      },
      parentSectionMap: {},
    });
    const rendered = await renderReactiveMiniMap(
      <MiniMapNodesReactive
        nodeColor={(node) => node.style?.background?.toString() ?? "#000000"}
      />,
    );

    try {
      expect(rendered.getRect("section-a")?.getAttribute("fill")).toBe(
        "#000000",
      );

      await act(async () => {
        testWorkspace.document.setState({
          sections: {
            "section-a": createSection({
              id: "section-a",
              styleColor: "#ff0000",
            }),
          },
        });
      });

      expect(rendered.getRect("section-a")?.getAttribute("fill")).toBe(
        "#ffe0e0",
      );
    } finally {
      await rendered.dispose();
    }
  });

  it("re-renders fill when dark mode flips without a document commit", async () => {
    testWorkspace.nodeInternals.setState({
      x: new Map([["section-a", createMiniMapNode({ id: "section-a" })]]),
    });
    testWorkspace.document.setState({
      sections: {
        "section-a": createSection({ id: "section-a", styleColor: "#ff0000" }),
      },
      topLevelSections: {
        "section-a": { x: 10, y: 20, w: 100, h: 80, zIndex: 0 },
      },
      parentSectionMap: {},
    });
    const rendered = await renderReactiveMiniMap(
      <MiniMapNodesReactive
        nodeColor={(node) => node.style?.background?.toString() ?? "#000000"}
      />,
    );

    try {
      expect(rendered.getRect("section-a")?.getAttribute("fill")).toBe(
        "#ffe0e0",
      );

      await act(async () => {
        testWorkspace.appearance.setState({ darkMode: true });
      });

      expect(rendered.getRect("section-a")?.getAttribute("fill")).toBe(
        "#2e0000",
      );
    } finally {
      await rendered.dispose();
    }
  });

  it("passes the explicit minimap selection id contract to custom nodes", () => {
    const nodes: Array<Node> = [createMiniMapNode({ id: "section-a" })];
    const recordedProps: Array<MiniMapNodeProps> = [];
    const CustomNode = (props: MiniMapNodeProps) => {
      recordedProps.push(props);
      return <rect data-minimap-node-id={props.dataMinimapNodeId} />;
    };

    renderToStaticMarkup(
      <svg>
        <MiniMapNodes nodes={nodes} nodeComponent={CustomNode} />
      </svg>,
    );

    expect(recordedProps).toHaveLength(1);
    expect(recordedProps[0]?.dataMinimapNodeId).toBe("section-a");
  });

  it("skips nodes without renderable dimensions during direct minimap rendering", () => {
    const nodes: Array<Node> = [
      createMiniMapNode({ id: "section-a" }),
      createMiniMapNode({
        id: "section-b",
        position: { x: 180, y: 40 },
        width: null,
        height: 90,
      }),
    ];

    const markup = renderToStaticMarkup(
      <svg>
        <MiniMapNodes nodes={nodes} />
      </svg>,
    );

    expect(markup).toContain('data-minimap-node-id="section-a"');
    expect(markup).not.toContain('data-minimap-node-id="section-b"');
  });
});

async function renderReactiveMiniMap(element: JSX.Element): Promise<{
  dispose: () => Promise<void>;
  getRect: (sectionId: string) => SVGRectElement | null;
}> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {<svg>{element}</svg>
        }</WorkspaceTestProvider>,
      );
  });

  return {
    dispose: async () => {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
    getRect: (sectionId: string) =>
      host.querySelector<SVGRectElement>(
        `[data-minimap-node-id="${sectionId}"]`,
      ),
  };
}
