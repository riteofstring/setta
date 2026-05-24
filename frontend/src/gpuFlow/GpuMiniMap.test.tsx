/* @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import "testUtils/reactRefreshPreamble";
import { describe, expect, it } from "vitest";
import GpuMiniMap from "./GpuMiniMap";
import {
  getXYWidthHeight,
  MinimapSvg,
  syncSelectedMiniMapNodes,
} from "./GpuMiniMapSvg";
import { createGpuFlowLayoutStore } from "./layoutStore";
import { createGpuFlowViewportStore } from "./viewportStore";

describe("GpuMiniMap helpers", () => {
  it("keeps the same minimap viewbox sizing contract", () => {
    expect(
      getXYWidthHeight({
        boundingRect: { height: 100, width: 200, x: 50, y: 25 },
        elementHeight: 50,
        elementWidth: 100,
        offsetScale: 5,
      }),
    ).toEqual({
      height: 120,
      offset: 10,
      viewScale: 2,
      width: 220,
      x: 40,
      y: 15,
    });
  });

  it("renders static svg nodes without subscribing to live selection", () => {
    const markup = renderToStaticMarkup(
      <MinimapSvg
        elementHeight={150}
        elementWidth={200}
        height={150}
        maskColor="rgba(0, 0, 0, 0.2)"
        maskStrokeColor="transparent"
        maskStrokeWidth={1}
        nodes={[
          {
            height: 40,
            id: "section-a",
            position: { x: 10, y: 20 },
            width: 80,
          },
        ]}
        nodeColor="#d6dee8"
        nodeBorderRadius={2}
        nodeStrokeColor="transparent"
        nodeStrokeWidth={1}
        offset={5}
        viewBB={{ height: 100, width: 120, x: 0, y: 0 }}
        width={200}
        x={0}
        y={0}
      />,
    );

    expect(markup).toContain('data-minimap-node-id="section-a"');
    expect(markup).toContain('fill="#d6dee8"');
    expect(markup).toContain("setta-gpu-flow__minimap-mask");
  });

  it("syncs active node classes onto rendered minimap nodes", () => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(
      createElement("svg", null, [
        createElement("rect", {
          "data-minimap-node-id": "section-a",
          key: "a",
        }),
        createElement("rect", {
          "data-minimap-node-id": "section-b",
          key: "b",
        }),
      ]),
    );
    const svg = host.querySelector("svg");

    syncSelectedMiniMapNodes(svg, ["section-b"]);

    expect(
      host
        .querySelector('[data-minimap-node-id="section-a"]')
        ?.classList.contains("selected"),
    ).toBe(false);
    expect(
      host
        .querySelector('[data-minimap-node-id="section-b"]')
        ?.classList.contains("selected"),
    ).toBe(true);
  });

  it("updates viewport chrome from the store without rerendering React", async () => {
    const store = createGpuFlowViewportStore({
      height: 600,
      transform: [0, 0, 1],
      width: 800,
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    let renderCount = 0;
    const frameCallbacks: FrameRequestCallback[] = [];
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        frameCallbacks.push(callback);
        return frameCallbacks.length;
      },
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      value: () => undefined,
    });

    function Harness() {
      renderCount += 1;
      return <GpuMiniMap viewportStore={store} />;
    }

    try {
      await act(async () => {
        root.render(<Harness />);
      });
      const svg = host.querySelector("svg");
      const mask = host.querySelector(".setta-gpu-flow__minimap-mask");
      const initialViewBox = svg?.getAttribute("viewBox");
      const initialMaskPath = mask?.getAttribute("d");

      act(() => {
        store.getState().setTransform([100, 50, 2]);
      });
      expect(renderCount).toBe(1);
      expect(svg?.getAttribute("viewBox")).toBe(initialViewBox);

      await act(async () => {
        for (const callback of frameCallbacks.splice(0)) {
          callback(performance.now());
        }
      });

      expect(renderCount).toBe(1);
      expect(svg?.getAttribute("viewBox")).not.toBe(initialViewBox);
      expect(mask?.getAttribute("d")).not.toBe(initialMaskPath);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
      Object.defineProperty(window, "requestAnimationFrame", {
        configurable: true,
        value: originalRequestAnimationFrame,
      });
      Object.defineProperty(window, "cancelAnimationFrame", {
        configurable: true,
        value: originalCancelAnimationFrame,
      });
    }
  });

  it("renders minimap nodes from the layout store", async () => {
    const viewportStore = createGpuFlowViewportStore({
      height: 600,
      transform: [0, 0, 1],
      width: 800,
    });
    const layoutStore = createGpuFlowLayoutStore({
      nodes: [
        {
          height: 40,
          nodeId: "section-a",
          width: 80,
          x: 10,
          y: 20,
        },
      ],
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    try {
      await act(async () => {
        root.render(
          <GpuMiniMap
            layoutStore={layoutStore}
            viewportStore={viewportStore}
          />,
        );
      });

      const node = host.querySelector('[data-minimap-node-id="section-a"]');
      expect(node?.getAttribute("x")).toBe("10");
      expect(node?.getAttribute("y")).toBe("20");

      await act(async () => {
        layoutStore.getState().patchNodes(
          [
            {
              nodeId: "section-a",
              x: 45,
              y: 55,
            },
          ],
          { reason: "drag" },
        );
      });

      const movedNode = host.querySelector(
        '[data-minimap-node-id="section-a"]',
      );
      expect(movedNode?.getAttribute("x")).toBe("45");
      expect(movedNode?.getAttribute("y")).toBe("55");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("applies explicit visual and selection props to layout-store nodes", async () => {
    const viewportStore = createGpuFlowViewportStore({
      height: 600,
      transform: [0, 0, 1],
      width: 800,
    });
    const layoutStore = createGpuFlowLayoutStore({
      nodes: [
        {
          height: 40,
          nodeId: "section-a",
          width: 80,
          x: 10,
          y: 20,
        },
      ],
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    try {
      await act(async () => {
        root.render(
          <GpuMiniMap
            layoutStore={layoutStore}
            nodeColor={(node) =>
              typeof node.style?.background === "string"
                ? node.style.background
                : "#000000"
            }
            nodeVisuals={[
              {
                id: "section-a",
                style: { background: "rgb(1, 2, 3)" },
                type: "custom",
              },
            ]}
            selectedNodeIds={["section-a"]}
            viewportStore={viewportStore}
          />,
        );
      });

      const node = host.querySelector('[data-minimap-node-id="section-a"]');
      expect(node?.getAttribute("fill")).toBe("rgb(1, 2, 3)");
      expect(node?.classList.contains("selected")).toBe(true);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("marks the viewport interaction active during pannable minimap drag", async () => {
    const store = createGpuFlowViewportStore({
      height: 600,
      transform: [0, 0, 1],
      width: 800,
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    try {
      await act(async () => {
        root.render(<GpuMiniMap pannable viewportStore={store} />);
      });
      const svg = getRenderedMiniMapSvg(host);

      await act(async () => {
        dispatchPointerEvent(svg, "pointerdown", {
          button: 0,
          clientX: 20,
          clientY: 30,
          pointerId: 7,
        });
      });

      expect(store.getState().pointerPanning).toBe(true);
      expect(store.getState().viewportInteractionActive).toBe(true);

      await act(async () => {
        dispatchPointerEvent(svg, "pointermove", {
          button: 0,
          clientX: 30,
          clientY: 45,
          pointerId: 7,
        });
      });

      expect(store.getState().transform).toEqual([-40, -60, 1]);

      await act(async () => {
        dispatchPointerEvent(svg, "pointerup", {
          button: 0,
          clientX: 30,
          clientY: 45,
          pointerId: 7,
        });
      });

      expect(store.getState().pointerPanning).toBe(false);
      expect(store.getState().viewportInteractionActive).toBe(false);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("clears minimap drag ownership when the component unmounts mid-drag", async () => {
    const store = createGpuFlowViewportStore({
      height: 600,
      transform: [0, 0, 1],
      width: 800,
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    try {
      await act(async () => {
        root.render(<GpuMiniMap pannable viewportStore={store} />);
      });

      await act(async () => {
        dispatchPointerEvent(getRenderedMiniMapSvg(host), "pointerdown", {
          button: 0,
          clientX: 20,
          clientY: 30,
          pointerId: 7,
        });
      });

      expect(store.getState().viewportInteractionActive).toBe(true);

      await act(async () => {
        root.unmount();
      });

      expect(store.getState().pointerPanning).toBe(false);
      expect(store.getState().viewportInteractionActive).toBe(false);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});

function getRenderedMiniMapSvg(host: HTMLElement): SVGSVGElement {
  const svg = host.querySelector("svg");
  if (!(svg instanceof SVGSVGElement)) {
    throw new Error("Expected rendered minimap SVG.");
  }
  return svg;
}

function dispatchPointerEvent(
  target: Element,
  type: string,
  init: PointerEventInit,
) {
  target.dispatchEvent(createPointerEvent(type, init));
}

function createPointerEvent(
  type: string,
  init: PointerEventInit,
): PointerEvent {
  if (typeof PointerEvent === "function") {
    return new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      ...init,
    });
  }
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    ...init,
  }) as PointerEvent;
  Object.defineProperty(event, "pointerId", {
    configurable: true,
    value: init.pointerId ?? 1,
  });
  return event;
}
