/* @vitest-environment jsdom */

import {
  act,
  createElement,
  createRef,
  Profiler,
  type ProfilerOnRenderCallback,
} from "react";
import { createRoot } from "react-dom/client";
import { useActiveSectionUI, useNodeInternals } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReactFlow } from "../core/store";
import initialState from "../core/store/initialState";
import {
  getMiniMapMaskPath,
  getMiniMapViewBox,
  getMiniMapViewportMetrics,
  getXYWidthHeight,
  default as MiniMap,
  MinimapSvg,
  syncSelectedMiniMapNodes,
} from "./MiniMap";
import type { MiniMapNodeProps } from "./types";

beforeEach(() => {
  resetProjectStores();
  useNodeInternals.setState({ x: new Map() });
  useReactFlow.setState({ ...initialState });
});

afterEach(() => {
  document.body.innerHTML = "";
  resetProjectStores();
  useNodeInternals.setState({ x: new Map() });
  useReactFlow.setState({ ...initialState });
});

describe("getXYWidthHeight", () => {
  it("centers bounds and applies offset when bounds are smaller", () => {
    const result = getXYWidthHeight({
      boundingRect: { x: 0, y: 0, width: 100, height: 50 },
      elementWidth: 200,
      elementHeight: 100,
      offsetScale: 5,
    });

    expect(result.viewScale).toBeCloseTo(0.5);
    expect(result.offset).toBeCloseTo(2.5);
    expect(result.x).toBeCloseTo(-2.5);
    expect(result.y).toBeCloseTo(-2.5);
    expect(result.width).toBeCloseTo(105);
    expect(result.height).toBeCloseTo(55);
  });

  it("expands view when bounds are wider than the minimap element", () => {
    const result = getXYWidthHeight({
      boundingRect: { x: 10, y: 20, width: 300, height: 100 },
      elementWidth: 200,
      elementHeight: 100,
      offsetScale: 2,
    });

    expect(result.viewScale).toBeCloseTo(1.5);
    expect(result.offset).toBeCloseTo(3);
    expect(result.x).toBeCloseTo(7);
    expect(result.y).toBeCloseTo(-8);
    expect(result.width).toBeCloseTo(306);
    expect(result.height).toBeCloseTo(156);
  });
});

describe("syncSelectedMiniMapNodes", () => {
  it("does nothing when the minimap svg is not available yet", () => {
    expect(() => {
      syncSelectedMiniMapNodes(undefined, ["alpha"]);
    }).not.toThrow();
  });

  it("reconciles against the currently rendered minimap DOM", () => {
    const lateMount = createMiniMapSvg(["section-a"]);

    syncSelectedMiniMapNodes(lateMount.svg, ["section-a"]);

    expect(lateMount.nodes["section-a"]?.classList.contains("selected")).toBe(
      true,
    );
  });

  it("restores selected styling after a rerender resets node classes", () => {
    const svg = createMiniMapSvg(["section-a", "section-b"], {
      "section-b": ["selected"],
    });

    syncSelectedMiniMapNodes(svg.svg, ["section-a"]);

    expect(svg.nodes["section-a"]?.classList.contains("selected")).toBe(true);
    expect(svg.nodes["section-b"]?.classList.contains("selected")).toBe(false);
  });

  it("keeps custom minimap nodes on the typed selection-sync contract", async () => {
    resetProjectStores();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const svgRef = createRef<SVGSVGElement>();
    const CustomNode = (props: MiniMapNodeProps) =>
      createElement("rect", {
        className: props.className,
        "data-minimap-node-id": props.dataMinimapNodeId,
        "data-testid": `custom-minimap-node-${props.id}`,
        x: props.x,
        y: props.y,
        width: props.width,
        height: props.height,
      });

    try {
      await act(async () => {
        root.render(
          createElement(MinimapSvg, {
            elementWidth: 200,
            elementHeight: 150,
            viewBox: "0 0 200 150",
            maskPath: "M0,0h200v150h-200z\nM0,0h200v150h-200z",
            maskColor: "rgba(0, 0, 0, 0.1)",
            maskStrokeColor: "transparent",
            maskStrokeWidth: 0,
            svgRef,
            nodes: [
              {
                id: "section-a",
                position: { x: 10, y: 20 },
                width: 100,
                height: 80,
                zIndex: 0,
                tempZIndex: 0,
              },
            ],
            nodeComponent: CustomNode,
            enableSelectionSync: true,
          }),
        );
      });

      await act(async () => {
        useActiveSectionUI.setState({ activeIds: ["section-a"] });
      });

      expect(
        host
          .querySelector('[data-minimap-node-id="section-a"]')
          ?.classList.contains("selected"),
      ).toBe(true);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
      resetProjectStores();
    }
  });
});

describe("MiniMap", () => {
  it("keeps the mounted minimap out of transform-only commits while syncing the viewport mask", async () => {
    useNodeInternals.setState({
      x: new Map([
        [
          "section-a",
          {
            id: "section-a",
            position: { x: 20, y: 30 },
            width: 120,
            height: 80,
            zIndex: 0,
            tempZIndex: 0,
          },
        ],
      ]),
    });
    useReactFlow.setState({
      ...initialState,
      width: 800,
      height: 600,
      transform: [0, 0, 1],
      fitViewOnInit: false,
      fitViewOnInitDone: true,
    });

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const onRender = vi.fn<ProfilerOnRenderCallback>();

    try {
      await act(async () => {
        root.render(
          createElement(
            Profiler,
            { id: "minimap-profiler", onRender },
            createElement(MiniMap, {
              style: { width: 200, height: 100 },
            }),
          ),
        );
      });

      const svg = host.querySelector("svg");
      const mask = host.querySelector<SVGPathElement>(
        ".react-flow__minimap-mask",
      );
      expect(svg).not.toBeNull();
      expect(mask).not.toBeNull();
      const initialCommitCount = onRender.mock.calls.length;
      const initialViewBox = svg?.getAttribute("viewBox");
      const initialMaskPath = mask?.getAttribute("d");

      await act(async () => {
        useReactFlow.setState({
          transform: [140, -60, 1.5],
        });
      });

      expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
      expect(svg?.getAttribute("viewBox")).not.toBe(initialViewBox);
      expect(mask?.getAttribute("d")).not.toBe(initialMaskPath);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});

describe("mini map viewport helpers", () => {
  it("derives the reactive viewBox and mask path from viewport state", () => {
    const metrics = getMiniMapViewportMetrics({
      elementHeight: 100,
      elementWidth: 200,
      nodes: [
        {
          id: "section-a",
          position: { x: 20, y: 40 },
          width: 100,
          height: 80,
          zIndex: 0,
          tempZIndex: 0,
        },
      ],
      offsetScale: 5,
      overviewWidth: 40,
      reactFlowState: {
        width: 800,
        height: 600,
        transform: [120, -60, 2],
      },
      uiEditorWidth: 20,
    });

    expect(getMiniMapViewBox(metrics)).toMatchInlineSnapshot(
      '"-155 15 630 330"',
    );
    expect(
      getMiniMapMaskPath({
        height: metrics.height,
        maskRect: metrics.viewBB,
        offset: metrics.offset,
        width: metrics.width,
        x: metrics.x,
        y: metrics.y,
      }),
    ).toBe("M-170,0h660v360h-660z\nM-40,30h400v300h-400z");
  });
});

function createMiniMapSvg(
  sectionIds: string[],
  initialClassesById: Record<string, string[]> = {},
) {
  const nodes: Record<string, StubSvgRect> = {};
  for (const sectionId of sectionIds) {
    nodes[sectionId] = createStubSvgRect(
      sectionId,
      initialClassesById[sectionId] ?? [],
    );
  }

  return {
    svg: {
      querySelectorAll: () => Object.values(nodes),
    } as unknown as SVGSVGElement,
    nodes,
  };
}

function createStubSvgRect(
  sectionId: string,
  initialClasses: string[],
): StubSvgRect {
  const classes = new Set(initialClasses);
  return {
    dataset: {
      minimapNodeId: sectionId,
    },
    classList: {
      toggle: (className: string, enabled?: boolean) => {
        if (enabled) {
          classes.add(className);
          return true;
        }
        classes.delete(className);
        return false;
      },
      contains: (className: string) => classes.has(className),
    },
  };
}

type StubSvgRect = {
  dataset: {
    minimapNodeId?: string;
  };
  classList: {
    toggle: (className: string, enabled?: boolean) => boolean;
    contains: (className: string) => boolean;
  };
};
