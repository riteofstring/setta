/* @vitest-environment jsdom */

import type { ZoomTransform } from "d3-zoom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceOptions } from "./options";
import { useWorkspacePointerLocation } from "./pointerLocation";
import { initialCanvasState, useReactFlow } from "./store";
import { zoomToPointerLocation } from "./viewportHelpers";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function PointerLocationHost() {
  useWorkspacePointerLocation();
  return null;
}

function setupZoomRuntime() {
  const transform = vi.fn();
  const durations: Array<number> = [];
  const transitionObject = { id: "transition" };
  const d3Selection = {
    transition: () => ({
      duration: (duration: number) => {
        durations.push(duration);
        return transitionObject;
      },
    }),
  } as unknown as NonNullable<typeof initialCanvasState.d3Selection>;
  const d3Zoom = { transform } as unknown as NonNullable<
    typeof initialCanvasState.d3Zoom
  >;

  useReactFlow.setState({
    ...initialCanvasState,
    width: 800,
    height: 600,
    d3Selection,
    d3Zoom,
    domNode: {
      getBoundingClientRect: () => ({ x: 20, y: 40 }),
    } as unknown as HTMLDivElement,
  });

  return { durations, transform, transitionObject };
}

function getAppliedTransform(
  transform: ReturnType<typeof vi.fn>,
): ZoomTransform {
  const call = transform.mock.calls[0];
  if (!call) {
    throw new Error("d3Zoom.transform was not called.");
  }
  return call[1] as ZoomTransform;
}

describe("pointer location", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    useWorkspaceOptions.getState().reset();
    useReactFlow.setState({ ...initialCanvasState });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(createElement(PointerLocationHost));
    });
  });

  afterEach(async () => {
    // Unmounting releases the tracked pointer, so one test's pointer never leaks into the next.
    await act(async () => {
      root.unmount();
    });
    host.remove();
    useWorkspaceOptions.getState().reset();
    useReactFlow.setState({ ...initialCanvasState });
  });

  async function movePointer(clientX: number, clientY: number) {
    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX, clientY }));
    });
  }

  it("centers the tracked pointer position at the default zoom level", async () => {
    const { durations, transform, transitionObject } = setupZoomRuntime();
    useWorkspaceOptions.setState({ snapToGrid: false });
    await movePointer(220, 140);

    expect(zoomToPointerLocation()).toBe(true);

    // The pointer sits at (200, 100) in flow coordinates once the canvas offset is removed.
    expect(transform).toHaveBeenCalledWith(transitionObject, expect.anything());
    const applied = getAppliedTransform(transform);
    expect(applied.k).toBe(1);
    expect(applied.x).toBe(400 - 200);
    expect(applied.y).toBe(300 - 100);
    expect(durations).toEqual([50]);
  });

  it("snaps the pointer position to the grid like every other screen-to-flow conversion", async () => {
    const { transform } = setupZoomRuntime();
    await movePointer(220, 140);

    expect(zoomToPointerLocation()).toBe(true);

    const applied = getAppliedTransform(transform);
    expect(applied.x).toBe(400 - 195);
    expect(applied.y).toBe(300 - 105);
  });

  it("declines until the canvas has seen a pointer", () => {
    const { transform } = setupZoomRuntime();

    expect(zoomToPointerLocation()).toBe(false);
    expect(transform).not.toHaveBeenCalled();
  });

  it("declines before the zoom pane initialized instead of throwing", async () => {
    await movePointer(220, 140);

    expect(zoomToPointerLocation()).toBe(false);
  });

  it("forgets the pointer when the canvas unmounts", async () => {
    const { transform } = setupZoomRuntime();
    await movePointer(220, 140);
    await act(async () => {
      root.unmount();
    });

    await movePointer(300, 300);

    expect(zoomToPointerLocation()).toBe(false);
    expect(transform).not.toHaveBeenCalled();
  });
});
