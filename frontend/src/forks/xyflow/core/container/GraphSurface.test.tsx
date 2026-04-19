/* @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import initialState from "../store/initialState";
import { useReactFlow } from "../store";
import GraphSurface from "./GraphSurface";

vi.mock("./AgenticEdgeRenderer", () => ({
  default: () => <div data-testid="agentic-edge-renderer" />,
}));

vi.mock("./EdgeRenderer", () => ({
  default: () => <div data-testid="edge-renderer" />,
}));

vi.mock("./NodeRenderer", () => ({
  default: () => <div data-testid="node-renderer" />,
}));

vi.mock("./SectionShellBackdropCanvas", () => ({
  default: () => <div data-testid="section-shell-backdrop-canvas" />,
}));

vi.mock("./StateMachineEdgeRenderer", () => ({
  default: () => <div data-testid="state-machine-edge-renderer" />,
}));

let root: Root | null = null;

describe("GraphSurface", () => {
  beforeEach(() => {
    useReactFlow.setState({
      ...initialState,
      transform: [120, 80, 1.5],
    });
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    root = null;
    document.body.innerHTML = "";
    useReactFlow.setState({ ...initialState });
  });

  it("renders the retained canvas in a sibling camera layer outside the DOM viewport", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(createElement(GraphSurface, { readyToRender: true }));
    });

    const cameraLayer = host.querySelector(".react-flow__graph-surface-camera");
    if (!(cameraLayer instanceof HTMLDivElement)) {
      throw new Error("Expected the graph surface camera layer to render.");
    }

    const viewport = host.querySelector(".react-flow__viewport");
    if (!(viewport instanceof HTMLDivElement)) {
      throw new Error("Expected the viewport wrapper to render.");
    }

    expect(cameraLayer.style.transform).toBe(
      "translate(120px,80px) scale(1.5)",
    );
    expect(viewport.style.transform).toBe(
      "translate(120px,80px) scale(1.5)",
    );

    await act(async () => {
      useReactFlow.setState({
        transform: [-40, 25, 0.75],
      });
    });

    expect(cameraLayer.style.transform).toBe(
      "translate(-40px,25px) scale(0.75)",
    );
    expect(viewport.style.transform).toBe(
      "translate(-40px,25px) scale(0.75)",
    );
    expect(cameraLayer.nextElementSibling).toBe(viewport);
    expect(
      cameraLayer.querySelector('[data-testid="section-shell-backdrop-canvas"]'),
    ).not.toBeNull();
    expect(viewport.querySelector('[data-testid="node-renderer"]')).not.toBeNull();
  });

  it("renders nothing until the wrapper dimensions are ready", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(createElement(GraphSurface, { readyToRender: false }));
    });

    expect(host.innerHTML).toBe("");
  });
});
