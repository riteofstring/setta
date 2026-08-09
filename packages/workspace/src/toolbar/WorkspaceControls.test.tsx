/* @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceOptions } from "../canvas/options";
import { initialCanvasState, useReactFlow } from "../canvas/store";
import { zoomIn, zoomOut } from "../canvas/viewportHelpers";
import { WorkspaceControls } from "./WorkspaceControls";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("WorkspaceControls", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    useWorkspaceOptions.getState().reset();
    useReactFlow.setState({ ...initialCanvasState });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(createElement(WorkspaceControls));
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    zoomIn.cancel();
    zoomOut.cancel();
    useWorkspaceOptions.getState().reset();
    useReactFlow.setState({ ...initialCanvasState });
  });

  function getButton(label: string): HTMLButtonElement {
    const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    if (!button) {
      throw new Error(`Missing toolbar button: ${label}`);
    }
    return button;
  }

  it("renders the viewport group in the reference order", () => {
    const labels = Array.from(host.querySelectorAll("button")).map((button) =>
      button.getAttribute("aria-label"),
    );
    expect(labels).toEqual([
      "zoom in",
      "zoom out",
      "fit view",
      "toggle snap to grid",
      "reset zoom",
    ]);
    expect(host.querySelector('[data-testid="rf__controls"]')).not.toBe(null);
    expect(getButton("reset zoom").className).toContain("react-flow__controls-button");
  });

  it("disables the zoom buttons at the zoom limits", async () => {
    expect(getButton("zoom in").disabled).toBe(false);
    expect(getButton("zoom out").disabled).toBe(false);

    await act(async () => {
      useReactFlow.setState({ transform: [0, 0, useWorkspaceOptions.getState().maxZoom] });
    });
    expect(getButton("zoom in").disabled).toBe(true);

    await act(async () => {
      useReactFlow.setState({ transform: [0, 0, useWorkspaceOptions.getState().minZoom] });
    });
    expect(getButton("zoom out").disabled).toBe(true);
  });

  it("zoom in scales the viewport by 1.2", async () => {
    const scaleBy = vi.fn();
    const transitionObject = { id: "transition" };
    await act(async () => {
      useReactFlow.setState({
        d3Selection: {
          transition: () => ({ duration: () => transitionObject }),
        } as unknown as NonNullable<typeof initialCanvasState.d3Selection>,
        d3Zoom: { scaleBy } as unknown as NonNullable<typeof initialCanvasState.d3Zoom>,
      });
    });

    await act(async () => {
      getButton("zoom in").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(scaleBy).toHaveBeenCalledWith(transitionObject, 1.2);
  });

  it("toggles snap to grid on the interaction options", async () => {
    const snapButton = getButton("toggle snap to grid");
    expect(snapButton.getAttribute("aria-pressed")).toBe("true");
    expect(snapButton.className).toContain("bg-blue-500");

    await act(async () => {
      snapButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(useWorkspaceOptions.getState().snapToGrid).toBe(false);
    expect(snapButton.getAttribute("aria-pressed")).toBe("false");
    expect(snapButton.className).not.toContain("bg-blue-500");
  });

  it("tints the fit button while fitViewOnInit is armed", async () => {
    const fitButton = getButton("fit view");
    expect(fitButton.className).not.toContain("bg-blue-500");

    await act(async () => {
      useReactFlow.setState({ fitViewOnInit: true });
    });

    expect(fitButton.className).toContain("bg-blue-500");
  });
});
