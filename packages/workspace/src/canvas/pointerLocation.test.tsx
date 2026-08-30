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
import { useWorkspacePointerLocation } from "./pointerLocation";
import { initialCanvasState } from "./store";
import { zoomToPointerLocation } from "./viewportHelpers";
import { registerWorkspaceXyflowInstance } from "./xyflow/workspaceXyflowRuntime";
import type { WorkspaceXyflowInstance } from "./xyflow/types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function PointerLocationHost() {
  useWorkspacePointerLocation();
  return null;
}

function setupXyflowRuntime() {
  const setViewport = vi.fn(() => Promise.resolve(true));
  registerWorkspaceXyflowInstance(testWorkspace.host, {
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    screenToFlowPosition: vi.fn(),
    setViewport,
    zoomTo: vi.fn(() => Promise.resolve(true)),
  } as unknown as WorkspaceXyflowInstance);
  testWorkspace.reactFlow.setState({
    ...initialCanvasState,
    width: 800,
    height: 600,
    domNode: {
      getBoundingClientRect: () => ({ x: 20, y: 40 }),
    } as unknown as HTMLDivElement,
  });
  return { setViewport };
}

describe("pointer location", () => {
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
          {createElement(PointerLocationHost)}
        </WorkspaceTestProvider>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    testWorkspace.options.getState().reset();
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
  });

  async function movePointer(clientX: number, clientY: number) {
    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX, clientY }));
    });
  }

  it("centers the tracked pointer position at the default zoom level", async () => {
    const { setViewport } = setupXyflowRuntime();
    testWorkspace.options.setState({ snapToGrid: false });
    await movePointer(220, 140);

    expect(zoomToPointerLocation(testWorkspace.host)).toBe(true);

    expect(setViewport).toHaveBeenCalledWith(
      { x: 400 - 200, y: 300 - 100, zoom: 1 },
      { duration: 50 },
    );
  });

  it("snaps the pointer position to the grid like every other screen-to-flow conversion", async () => {
    const { setViewport } = setupXyflowRuntime();
    await movePointer(220, 140);

    expect(zoomToPointerLocation(testWorkspace.host)).toBe(true);

    expect(setViewport).toHaveBeenCalledWith(
      { x: 400 - 195, y: 300 - 105, zoom: 1 },
      { duration: 50 },
    );
  });

  it("declines until the canvas has seen a pointer", () => {
    const { setViewport } = setupXyflowRuntime();

    expect(zoomToPointerLocation(testWorkspace.host)).toBe(false);
    expect(setViewport).not.toHaveBeenCalled();
  });

  it("declines before the XYFlow runtime initializes instead of throwing", async () => {
    await movePointer(220, 140);

    expect(zoomToPointerLocation(testWorkspace.host)).toBe(false);
  });

  it("forgets the pointer when the canvas unmounts", async () => {
    const { setViewport } = setupXyflowRuntime();
    await movePointer(220, 140);
    await act(async () => {
      root.unmount();
    });

    await movePointer(300, 300);

    expect(zoomToPointerLocation(testWorkspace.host)).toBe(false);
    expect(setViewport).not.toHaveBeenCalled();
  });
});
