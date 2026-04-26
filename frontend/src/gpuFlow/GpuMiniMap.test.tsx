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
    expect(markup).toContain("react-flow__minimap-mask");
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
      const mask = host.querySelector(".react-flow__minimap-mask");
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
});
