/* @vitest-environment jsdom */
import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toggleMiniMap, useWorkspaceOptions } from "../canvas/options";
import { initialCanvasState, useReactFlow } from "../canvas/store";
import { WorkspaceCanvas } from "../canvas/WorkspaceCanvas";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceAppearance,
  useWorkspaceDocument,
} from "../document/stores";
import { ResponsiveMiniMap } from "./ResponsiveMiniMap";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function resetStores() {
  testWorkspace.options.getState().reset();
  testWorkspace.appearance.getState().reset();
  testWorkspace.document.getState().reset();
  testWorkspace.activeSections.getState().reset();
  testWorkspace.nodeInternals.setState({ x: new Map() });
  testWorkspace.reactFlow.setState({ ...initialCanvasState });
}

describe("ResponsiveMiniMap", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetStores();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    resetStores();
  });

  function getPanel(): HTMLDivElement {
    const panel = host.querySelector<HTMLDivElement>(
      '[data-testid="rf__minimap"]',
    );
    if (!panel) {
      throw new Error("Missing minimap panel.");
    }
    return panel;
  }

  it("renders the reference panel chrome at the bottom-left default", async () => {
    testWorkspace.reactFlow.setState({
      viewportInsets: { top: 0, right: 40, bottom: 0, left: 335 },
    });
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {<ResponsiveMiniMap />}
        </WorkspaceTestProvider>,
      );
    });

    const panel = getPanel();
    expect(panel.className).toContain("react-flow__panel");
    expect(panel.className).toContain("react-flow__minimap");
    expect(panel.classList.contains("bottom")).toBe(true);
    expect(panel.classList.contains("left")).toBe(true);
    expect(panel.className).toContain("rounded-md");
    expect(panel.className).toContain("backdrop-blur-sm");
    expect(panel.className).toContain("shadow-md");
    expect(panel.style.transform).toBe("translateX(335px)");

    const svg = panel.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("200");
    expect(svg?.getAttribute("height")).toBe("150");
    expect(svg?.getAttribute("role")).toBe("button");
    expect(svg?.tabIndex).toBe(0);
    expect(svg?.getAttribute("aria-label")).toContain("Use arrow keys to pan");
    const mask = panel.querySelector(".react-flow__minimap-mask");
    expect(mask?.getAttribute("fill")).toBe("rgb(51, 65, 85, 0.3)");
    expect(mask?.getAttribute("stroke")).toBe("rgba(30, 41, 59, 0.6)");
    expect(mask?.getAttribute("stroke-width")).toBe("2");
  });

  it("flips to the bottom-right corner when the minimap side preference is right", async () => {
    testWorkspace.options.setState({ minimapSide: "right" });
    testWorkspace.reactFlow.setState({
      viewportInsets: { top: 0, right: 500, bottom: 0, left: 40 },
    });

    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {<ResponsiveMiniMap />}
        </WorkspaceTestProvider>,
      );
    });

    const panel = getPanel();
    expect(panel.classList.contains("bottom")).toBe(true);
    expect(panel.classList.contains("right")).toBe(true);
    expect(panel.classList.contains("left")).toBe(false);
    expect(panel.style.transform).toBe("translateX(-500px)");
  });

  it("uses the dark mask colors in dark mode", async () => {
    testWorkspace.appearance.setState({ darkMode: true });

    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {<ResponsiveMiniMap />}
        </WorkspaceTestProvider>,
      );
    });

    const mask = getPanel().querySelector(".react-flow__minimap-mask");
    expect(mask?.getAttribute("fill")).toBe("rgb(20, 22, 31, 0.5)");
    expect(mask?.getAttribute("stroke")).toBe("rgba(226, 232, 240, 0.9)");
  });

  it("mounts inside the canvas wrapper and unmounts through the show-minimap preference", async () => {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {<WorkspaceCanvas />}
        </WorkspaceTestProvider>,
      );
    });

    expect(
      host.querySelector('[role="region"][aria-label="Workspace canvas"]'),
    ).not.toBeNull();
    const pane = host.querySelector<HTMLElement>(".react-flow__pane");
    expect(pane?.getAttribute("role")).toBe("group");
    expect(pane?.getAttribute("aria-keyshortcuts")).toBe(
      "Escape Shift+F10 ContextMenu",
    );
    expect(host.querySelector('[data-testid="rf__minimap"]')).not.toBe(null);

    await act(async () => {
      toggleMiniMap(testWorkspace.host);
    });
    expect(host.querySelector('[data-testid="rf__minimap"]')).toBe(null);

    await act(async () => {
      toggleMiniMap(testWorkspace.host);
    });
    expect(host.querySelector('[data-testid="rf__minimap"]')).not.toBe(null);
  });
});
