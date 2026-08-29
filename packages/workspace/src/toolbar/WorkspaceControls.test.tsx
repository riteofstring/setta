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

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceOptions } from "../canvas/options";
import { initialCanvasState, useReactFlow } from "../canvas/store";
import { zoomIn, zoomOut } from "../canvas/viewportHelpers";
import { registerWorkspaceCommands } from "../commands/workspaceCommandRegistry";
import { WorkspaceControls } from "./WorkspaceControls";
import { registerWorkspaceToolbarContributions } from "./workspaceToolbarRegistry";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("WorkspaceControls", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    testWorkspace.options.getState().reset();
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {createElement(WorkspaceControls)}
        </WorkspaceTestProvider>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    registerWorkspaceToolbarContributions(testWorkspace.host, []);
    registerWorkspaceCommands(testWorkspace.host, []);
    testWorkspace.options.getState().reset();
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
  });

  function getButton(label: string): HTMLButtonElement {
    const button = host.querySelector<HTMLButtonElement>(
      `button[aria-label="${label}"]`,
    );
    if (!button) {
      throw new Error(`Missing toolbar button: ${label}`);
    }
    return button;
  }

  it("renders the viewport and minimap groups in the reference order without a divider", () => {
    const labels = Array.from(host.querySelectorAll("button")).map((button) =>
      button.getAttribute("aria-label"),
    );
    expect(labels).toEqual([
      "zoom in",
      "zoom out",
      "fit view",
      "toggle snap to grid",
      "reset zoom",
      "toggle minimap",
      "move minimap to right",
    ]);
    expect(host.querySelector('[data-testid="rf__controls"]')).not.toBe(null);
    expect(
      host.querySelector('[data-testid="rf__controls"]')?.getAttribute("role"),
    ).toBe("group");
    expect(
      host
        .querySelector('[data-testid="rf__controls"]')
        ?.getAttribute("aria-label"),
    ).toBe("Workspace view controls");
    expect(
      Array.from(host.querySelectorAll("button svg")).every(
        (icon) =>
          icon.getAttribute("aria-hidden") === "true" &&
          icon.getAttribute("focusable") === "false",
      ),
    ).toBe(true);
    expect(getButton("reset zoom").className).toContain(
      "react-flow__controls-button",
    );
    expect(
      Array.from(host.querySelectorAll("button")).every(
        (button) => button.dataset.settaWorkspaceTouchTarget === "compact",
      ),
    ).toBe(true);

    expect(
      host
        .querySelector('[data-testid="rf__controls"]')
        ?.querySelectorAll("div"),
    ).toHaveLength(0);
  });

  it("seats contributed groups around the package groups, each closed by its own divider", async () => {
    registerWorkspaceCommands(testWorkspace.host, [
      {
        id: "host-before-viewport",
        scope: "pane",
        surfaces: ["toolbar"],
        label: "Host project action",
        run: () => {},
      },
      {
        id: "host-before-minimap",
        scope: "pane",
        surfaces: ["toolbar"],
        label: "Host utility action",
        run: () => {},
      },
    ]);
    registerWorkspaceToolbarContributions(testWorkspace.host, [
      {
        kind: "command",
        commandId: "host-before-viewport",
        icon: () => null,
        placement: "before-viewport",
      },
      {
        kind: "command",
        commandId: "host-before-minimap",
        icon: () => null,
        placement: "before-minimap",
      },
    ]);

    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {createElement(WorkspaceControls)}
        </WorkspaceTestProvider>,
      );
    });

    expect(
      Array.from(host.querySelectorAll("button")).map((button) =>
        button.getAttribute("aria-label"),
      ),
    ).toEqual([
      "Host project action",
      "zoom in",
      "zoom out",
      "fit view",
      "toggle snap to grid",
      "reset zoom",
      "Host utility action",
      "toggle minimap",
      "move minimap to right",
    ]);

    expect(
      host
        .querySelector('[data-testid="rf__controls"]')
        ?.querySelectorAll("div"),
    ).toHaveLength(2);
  });

  it("announces the current zoom as toolbar status", async () => {
    const status = host.querySelector('[role="status"]');
    expect(status?.textContent).toContain("Zoom 100%");
    await act(async () => {
      testWorkspace.reactFlow.setState({ transform: [0, 0, 1.25] });
    });
    expect(status?.textContent).toContain("Zoom 125%");
  });

  it("disables the zoom buttons at the zoom limits", async () => {
    expect(getButton("zoom in").disabled).toBe(false);
    expect(getButton("zoom out").disabled).toBe(false);

    await act(async () => {
      testWorkspace.reactFlow.setState({
        transform: [0, 0, testWorkspace.options.getState().maxZoom],
      });
    });
    expect(getButton("zoom in").disabled).toBe(true);

    await act(async () => {
      testWorkspace.reactFlow.setState({
        transform: [0, 0, testWorkspace.options.getState().minZoom],
      });
    });
    expect(getButton("zoom out").disabled).toBe(true);
  });

  it("zooms on primary pointer-down without repeating on the following click", async () => {
    const scaleBy = vi.fn();
    const transitionObject = { id: "transition" };
    const d3Selection = {
      transition: () => ({ duration: () => transitionObject }),
    } as unknown as NonNullable<typeof initialCanvasState.d3Selection>;
    await act(async () => {
      testWorkspace.reactFlow.setState({
        d3Selection,
        d3Zoom: { scaleBy } as unknown as NonNullable<
          typeof initialCanvasState.d3Zoom
        >,
      });
    });

    await act(async () => {
      getButton("zoom in").dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
      );
    });

    expect(scaleBy).toHaveBeenCalledWith(transitionObject, 1.2);

    await act(async () => {
      getButton("zoom in").dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 1 }),
      );
    });

    expect(scaleBy).toHaveBeenCalledTimes(1);
  });

  it("keeps non-pointer click activation for keyboard and assistive technology", async () => {
    const scaleBy = vi.fn();
    const transitionObject = { id: "transition" };
    const d3Selection = {
      transition: () => ({ duration: () => transitionObject }),
    } as unknown as NonNullable<typeof initialCanvasState.d3Selection>;
    await act(async () => {
      testWorkspace.reactFlow.setState({
        d3Selection,
        d3Zoom: { scaleBy } as unknown as NonNullable<
          typeof initialCanvasState.d3Zoom
        >,
      });
    });

    await act(async () => {
      getButton("zoom out").dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 0 }),
      );
    });

    expect(scaleBy).toHaveBeenCalledWith(transitionObject, 1 / 1.2);
  });

  it("toggles snap to grid on the interaction options", async () => {
    const snapButton = getButton("toggle snap to grid");
    expect(snapButton.getAttribute("aria-pressed")).toBe("true");
    expect(snapButton.className).toContain("bg-blue-500");

    await act(async () => {
      snapButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(testWorkspace.options.getState().snapToGrid).toBe(false);
    expect(snapButton.getAttribute("aria-pressed")).toBe("false");
    expect(snapButton.className).not.toContain("bg-blue-500");
  });

  it("toggles the minimap preference and its active tint", async () => {
    const toggleButton = getButton("toggle minimap");
    expect(toggleButton.getAttribute("aria-pressed")).toBe("true");
    expect(toggleButton.className).toContain("bg-blue-500");

    await act(async () => {
      toggleButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(testWorkspace.options.getState().showMinimap).toBe(false);
    expect(toggleButton.getAttribute("aria-pressed")).toBe("false");
    expect(toggleButton.className).not.toContain("bg-blue-500");
  });

  it("flips the minimap side and the side control label", async () => {
    const sideButton = host.querySelector<HTMLButtonElement>(
      '[data-testid="rf__toggle-minimap-side"]',
    );
    if (!sideButton) {
      throw new Error("Missing minimap side control.");
    }
    expect(sideButton.getAttribute("aria-label")).toBe("move minimap to right");

    await act(async () => {
      sideButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(testWorkspace.options.getState().minimapSide).toBe("right");
    expect(sideButton.getAttribute("aria-label")).toBe("move minimap to left");
  });

  it("tints the fit button while fitViewOnInit is armed", async () => {
    const fitButton = getButton("fit view");
    expect(fitButton.className).not.toContain("bg-blue-500");

    await act(async () => {
      testWorkspace.reactFlow.setState({ fitViewOnInit: true });
    });

    expect(fitButton.className).toContain("bg-blue-500");
  });
});
