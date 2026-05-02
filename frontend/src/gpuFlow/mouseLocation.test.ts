/* @vitest-environment jsdom */

import { useLocalStorage } from "state/definitions";
import { describe, expect, it } from "vitest";
import {
  addGpuMouseLocationListener,
  mouseLocation,
  zoomToMouseLocation,
} from "./mouseLocation";
import { createGpuFlowViewportStore } from "./viewportStore";

describe("gpu mouse location helpers", () => {
  it("tracks the latest window mouse position until unsubscribed", () => {
    const cleanup = addGpuMouseLocationListener();

    window.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 32, clientY: 48 }),
    );

    expect(mouseLocation).toEqual({ x: 32, y: 48 });

    cleanup();
    window.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 64, clientY: 96 }),
    );

    expect(mouseLocation).toEqual({ x: 32, y: 48 });
  });

  it("centers the gpu viewport on the latest mouse flow position", () => {
    useLocalStorage.setState({ overviewTrueWidth: 0 });
    const cleanup = addGpuMouseLocationListener();
    const store = createGpuFlowViewportStore({
      height: 300,
      transform: [0, 0, 1],
      width: 400,
    });

    window.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 150, clientY: 90 }),
    );

    expect(zoomToMouseLocation({ store })).toBe(true);
    expect(store.getState().transform).toEqual([50, 60, 1]);

    cleanup();
  });

  it("centers mouse-location zoom into the visible pane when the overview is open", () => {
    useLocalStorage.setState({ overviewTrueWidth: 100 });
    const cleanup = addGpuMouseLocationListener();
    const store = createGpuFlowViewportStore({
      height: 300,
      transform: [0, 0, 1],
      width: 400,
    });

    window.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 150, clientY: 90 }),
    );

    expect(zoomToMouseLocation({ store })).toBe(true);
    expect(store.getState().transform).toEqual([150, 60, 1]);

    cleanup();
  });
});
