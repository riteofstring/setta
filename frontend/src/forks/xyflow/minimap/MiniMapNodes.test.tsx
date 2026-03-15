/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { useNodeInternals, useProjectState } from "state/definitions";
import { useTemporaryMiscState } from "state/stores/layoutInteractionStores";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  createCore,
  createProjectConfig,
  createSingletonSections,
  createTerminalSectionImpl,
  createVariant,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useReactFlow } from "../core/store";
import initialState from "../core/store/initialState";
import type { Node } from "../core/types";
import {
  areMiniMapNodesRenderableInputsEqual,
  MiniMapNodes,
  MiniMapNodesReactive,
} from "./MiniMapNodes";
import type { MiniMapNodeProps } from "./types";

describe("MiniMapNodes", () => {
  beforeEach(() => {
    resetProjectStores();
    useLocalStorage.setState({ darkMode: false });
    useNodeInternals.setState({ x: new Map() });
    useReactFlow.setState({
      ...initialState,
      fitViewOnInit: false,
      fitViewOnInitDone: true,
    });
  });

  afterEach(() => {
    resetProjectStores();
    useNodeInternals.setState({ x: new Map() });
    useReactFlow.setState({ ...initialState });
    document.body.innerHTML = "";
  });

  it("renders stable node ids for imperative selection syncing", () => {
    const nodes: Node[] = [
      {
        id: "section-a",
        position: { x: 10, y: 20 },
        width: 100,
        height: 80,
        zIndex: 0,
        tempZIndex: 0,
      },
      {
        id: "section-b",
        position: { x: 180, y: 40 },
        width: 120,
        height: 90,
        zIndex: 0,
        tempZIndex: 0,
      },
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
    const left: Node[] = [
      {
        id: "section-a",
        position: { x: 10, y: 20 },
        width: 100,
        height: 80,
        zIndex: 0,
        tempZIndex: 0,
        style: { background: "#111111" },
      },
    ];
    const right: Node[] = [
      {
        ...left[0]!,
        style: { background: "#ff0000" },
      },
    ];

    expect(areMiniMapNodesRenderableInputsEqual(left, right)).toBe(false);
  });

  it("re-renders fill when only node style changes", async () => {
    useNodeInternals.setState({
      x: new Map([
        [
          "section-a",
          {
            id: "section-a",
            position: { x: 10, y: 20 },
            width: 100,
            height: 80,
            zIndex: 0,
            tempZIndex: 0,
            style: { background: "#111111" },
          },
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
        useNodeInternals.setState({
          x: new Map([
            [
              "section-a",
              {
                id: "section-a",
                position: { x: 10, y: 20 },
                width: 100,
                height: 80,
                zIndex: 0,
                tempZIndex: 0,
                style: { background: "#ff0000" },
              },
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

  it("re-renders stroke when only node type changes", async () => {
    useNodeInternals.setState({
      x: new Map([
        [
          "section-a",
          {
            id: "section-a",
            position: { x: 10, y: 20 },
            width: 100,
            height: 80,
            zIndex: 0,
            tempZIndex: 0,
            type: "default",
          },
        ],
      ]),
    });
    const rendered = await renderReactiveMiniMap(
      <MiniMapNodesReactive
        nodeStrokeColor={(node) =>
          node.type === "input" ? "#0041d0" : "#e2e8f0"
        }
      />,
    );

    try {
      expect(rendered.getRect("section-a")?.getAttribute("stroke")).toBe(
        "#e2e8f0",
      );

      await act(async () => {
        useNodeInternals.setState({
          x: new Map([
            [
              "section-a",
              {
                id: "section-a",
                position: { x: 10, y: 20 },
                width: 100,
                height: 80,
                zIndex: 0,
                tempZIndex: 0,
                type: "input",
              },
            ],
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

  it("re-renders fill when project state updates a section style without geometry changes", async () => {
    useNodeInternals.setState({
      x: new Map([
        [
          "section-a",
          {
            id: "section-a",
            position: { x: 10, y: 20 },
            width: 100,
            height: 80,
            zIndex: 0,
            tempZIndex: 0,
          },
        ],
      ]),
    });
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { "section-a": "variant-a" },
        topLevelSections: {
          "section-a": { x: 10, y: 20, w: 100, h: 80, zIndex: 0 },
        },
      }),
      sections: { "section-a": createCore({ id: "section-a" }) },
      sectionImpls: {
        "impl-a": createTerminalSectionImpl({
          id: "impl-a",
          type: SectionTypeEnum.Terminal,
          styleColor: null,
        }),
      },
      sectionVariants: {
        "variant-a": createVariant({
          id: "variant-a",
          impl: "impl-a",
          nonPresetImpls: [],
        }),
      },
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
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
        useProjectState.setState((state) => {
          state.sectionImpls["impl-a"] = createTerminalSectionImpl({
            id: "impl-a",
            type: SectionTypeEnum.Terminal,
            styleColor: "#ff0000",
          });
        });
      });

      expect(rendered.getRect("section-a")?.getAttribute("fill")).toBe(
        "#ffe0e0",
      );
    } finally {
      await rendered.dispose();
    }
  });

  it("re-renders fill when a section style preview changes without geometry changes", async () => {
    useNodeInternals.setState({
      x: new Map([
        [
          "section-a",
          {
            id: "section-a",
            position: { x: 10, y: 20 },
            width: 100,
            height: 80,
            zIndex: 0,
            tempZIndex: 0,
          },
        ],
      ]),
    });
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { "section-a": "variant-a" },
        topLevelSections: {
          "section-a": { x: 10, y: 20, w: 100, h: 80, zIndex: 0 },
        },
      }),
      sections: { "section-a": createCore({ id: "section-a" }) },
      sectionImpls: {
        "impl-a": createTerminalSectionImpl({
          id: "impl-a",
          type: SectionTypeEnum.Terminal,
          styleColor: null,
        }),
      },
      sectionVariants: {
        "variant-a": createVariant({
          id: "variant-a",
          impl: "impl-a",
          nonPresetImpls: [],
        }),
      },
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
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
        useTemporaryMiscState.setState({
          "section-style-preview-color-section-a": "#ff0000",
        });
      });

      expect(rendered.getRect("section-a")?.getAttribute("fill")).toBe(
        "#ffe0e0",
      );
    } finally {
      await rendered.dispose();
    }
  });

  it("passes the explicit minimap selection id contract to custom nodes", () => {
    const nodes: Node[] = [
      {
        id: "section-a",
        position: { x: 10, y: 20 },
        width: 100,
        height: 80,
        zIndex: 0,
        tempZIndex: 0,
      },
    ];
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
});

async function renderReactiveMiniMap(element: JSX.Element): Promise<{
  dispose: () => Promise<void>;
  getRect: (sectionId: string) => SVGRectElement | null;
}> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(<svg>{element}</svg>);
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
