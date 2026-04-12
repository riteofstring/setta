/* @vitest-environment jsdom */

import {
  act,
  Profiler,
  type ProfilerOnRenderCallback,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { useSettings } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { createSettingsState } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReactFlow } from "../store";
import initialState from "../store/initialState";
import FlowRenderer from "./FlowRenderer";

vi.mock("../components/NodesSelection", () => ({
  NodesSelectionDragHandleWrapper: () => (
    <div data-testid="selection-drag-handle" />
  ),
  NodesSelectionWrapper: () => <div data-testid="selection-wrapper" />,
}));

vi.mock("./Pane", () => ({
  default: ({
    children,
    isSelecting,
  }: {
    children: ReactNode;
    isSelecting: boolean;
  }) => (
    <div data-is-selecting={isSelecting ? "true" : "false"}>{children}</div>
  ),
}));

vi.mock("./ZoomPane", () => ({
  default: ({
    children,
    wrapperDimensions,
  }: {
    children: ReactNode;
    wrapperDimensions: { width: number; height: number };
  }) => (
    <div
      data-wrapper-height={wrapperDimensions.height}
      data-wrapper-width={wrapperDimensions.width}
    >
      {children}
    </div>
  ),
}));

describe("FlowRenderer", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetProjectStores();
    class ResizeObserverStub {
      disconnect() {}
      observe() {}
      unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    useSettings.setState(createSettingsState());
    useReactFlow.setState({
      ...initialState,
      zoomActivationKeyPressed: false,
      selectionKeyPressed: false,
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    resetProjectStores();
    useReactFlow.setState({ ...initialState });
  });

  it("does not rerender the flow shell when only zoom activation changes", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();

    await act(async () => {
      root.render(
        <Profiler id="flow-renderer-profiler" onRender={onRender}>
          <FlowRenderer wrapperDimensions={{ width: 800, height: 600 }}>
            <div data-testid="flow-child" />
          </FlowRenderer>
        </Profiler>,
      );
    });

    const initialCommitCount = onRender.mock.calls.length;

    await act(async () => {
      useReactFlow.setState({ zoomActivationKeyPressed: true });
    });

    expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
    expect(host.querySelector("[data-testid='flow-child']")).not.toBeNull();
  });
});
