/* @vitest-environment jsdom */
import { beforeEach as beforeEachWorkspaceTestHost } from "vitest";
import { createWorkspaceTestHost, type WorkspaceTestHost, WorkspaceTestProvider } from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});


import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useWorkspaceAppearance } from "../document/stores";
import { useWorkspaceOptions } from "./options";
import { initialCanvasState, useReactFlow } from "./store";
import { WorkspaceBackground } from "./WorkspaceBackground";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("WorkspaceBackground", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    testWorkspace.appearance.getState().reset();
    testWorkspace.options.getState().reset();
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {createElement(WorkspaceBackground)
        }</WorkspaceTestProvider>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    testWorkspace.appearance.getState().reset();
    testWorkspace.options.getState().reset();
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
  });

  it("renders the reference dot grid from the snap-grid and appearance defaults", () => {
    const pattern = requireElement("pattern");
    const dot = requireElement("circle");

    expect(pattern.getAttribute("width")).toBe("15");
    expect(pattern.getAttribute("height")).toBe("15");
    expect(pattern.getAttribute("patternTransform")).toBe("translate(-1,-1)");
    expect(dot.getAttribute("r")).toBe("1");
    expect(dot.getAttribute("fill")).toBe("#afbacf");
  });

  it("tracks viewport translation and zoom", async () => {
    await act(async () => {
      testWorkspace.reactFlow.setState({ transform: [4, 7, 2] });
    });

    const pattern = requireElement("pattern");
    const dot = requireElement("circle");
    expect(pattern.getAttribute("x")).toBe("4");
    expect(pattern.getAttribute("y")).toBe("7");
    expect(pattern.getAttribute("width")).toBe("30");
    expect(pattern.getAttribute("height")).toBe("30");
    expect(pattern.getAttribute("patternTransform")).toBe("translate(-2,-2)");
    expect(dot.getAttribute("r")).toBe("2");
  });

  it("uses the dark grid color from the appearance seam", async () => {
    await act(async () => {
      testWorkspace.appearance.setState({ darkMode: true });
    });

    expect(requireElement("circle").getAttribute("fill")).toBe("#2b364a");
  });

  it("renders the line and cross variants with reference geometry", async () => {
    await act(async () => {
      testWorkspace.options.setState({ gridPattern: "lines" });
      testWorkspace.reactFlow.setState({ transform: [0, 0, 2] });
    });

    let line = requireElement("path");
    expect(line.getAttribute("d")).toBe("M15 0 V30 M0 15 H30");
    expect(line.getAttribute("stroke-width")).toBe("4");

    await act(async () => {
      testWorkspace.options.setState({ gridPattern: "cross" });
    });

    line = requireElement("path");
    expect(line.getAttribute("d")).toBe("M2 0 V4 M0 2 H4");
    expect(requireElement("pattern").getAttribute("patternTransform")).toBe(
      "translate(-2,-2)",
    );
  });

  it("hides the grid when grid snapping or grid visibility is disabled", async () => {
    await act(async () => {
      testWorkspace.options.setState({ snapToGrid: false });
    });
    expect(host.querySelector(".react-flow__background")).toBeNull();

    await act(async () => {
      testWorkspace.options.setState({ snapToGrid: true, showGridLines: false });
    });
    expect(host.querySelector(".react-flow__background")).toBeNull();
  });

  function requireElement(selector: string): Element {
    const element = host.querySelector(selector);
    if (!element) {
      throw new Error(`Missing expected background element: ${selector}`);
    }
    return element;
  }
});
