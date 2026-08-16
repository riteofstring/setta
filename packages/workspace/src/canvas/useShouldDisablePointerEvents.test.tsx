/* @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  activateDndMovingFreeMode,
  activateDndSortingMode,
  useDndState,
} from "../dnd/dndState";
import { initialCanvasState, useReactFlow } from "./store";
import { useShouldDisablePointerEvents } from "./useShouldDisablePointerEvents";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let latest: boolean | null = null;

function Probe() {
  latest = useShouldDisablePointerEvents();
  return null;
}

describe("useShouldDisablePointerEvents", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    useReactFlow.setState({ ...initialCanvasState });
    useDndState.getState().reset();
    latest = null;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(createElement(Probe));
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    useReactFlow.setState({ ...initialCanvasState });
    useDndState.getState().reset();
  });

  it("keeps pointer events enabled by default", () => {
    expect(latest).toBe(false);
  });

  it("disables pointer events while a dnd mode is held, as the reference does", async () => {
    await act(async () => {
      activateDndSortingMode();
    });
    expect(latest).toBe(true);

    await act(async () => {
      useDndState.getState().reset();
      activateDndMovingFreeMode();
    });
    expect(latest).toBe(true);
  });

  it("disables pointer events while multi-select or zoom activation is held", async () => {
    await act(async () => {
      useReactFlow.setState({ multiSelectionActive: true });
    });
    expect(latest).toBe(true);

    await act(async () => {
      useReactFlow.setState({
        multiSelectionActive: false,
        zoomActivationKeyPressed: true,
      });
    });
    expect(latest).toBe(true);
  });

  it("disables pointer events only once a marquee rect exists for the selection key", async () => {
    await act(async () => {
      useReactFlow.setState({ selectionKeyPressed: true });
    });
    expect(latest).toBe(false);

    await act(async () => {
      useReactFlow.setState({
        userSelectionRect: {
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          startX: 0,
          startY: 0,
        },
      });
    });
    expect(latest).toBe(true);
  });
});
