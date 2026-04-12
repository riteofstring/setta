/* @vitest-environment jsdom */

import { useReactFlow } from "forks/xyflow/core/store";
import initialReactFlowState from "forks/xyflow/core/store/initialState";
import {
  act,
  createElement,
  Profiler,
  type ProfilerOnRenderCallback,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("forks/dnd-kit/adapter", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

import {
  TempParamPlaceholderRow,
  TempParamPlaceholderShell,
} from "./ParamSwitch";

describe("TempParamPlaceholderRow", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useReactFlow.setState({
      ...initialReactFlowState,
      transform: [0, 0, 1],
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
    useReactFlow.setState({ ...initialReactFlowState });
  });

  it("keeps the placeholder shell out of React Flow zoom commits", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();

    await act(async () => {
      root.render(
        <Profiler id="temp-param-placeholder-shell" onRender={onRender}>
          <TempParamPlaceholderShell
            dndAttributes={{ "data-testid": "temp-param-shell" }}
            dndListeners={{}}
            dndRef={vi.fn()}
            rowStyle={{ width: 120, height: 48 }}
          />
        </Profiler>,
      );
    });

    const initialCommitCount = onRender.mock.calls.length;

    await act(async () => {
      useReactFlow.setState({ transform: [0, 0, 2] });
    });

    expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
  });

  it("updates only the placeholder dimensions when React Flow zoom changes", async () => {
    await act(async () => {
      root.render(
        createElement(TempParamPlaceholderRow, {
          dndAttributes: { "data-testid": "temp-param-row" },
          dndListeners: {},
          dndRef: vi.fn(),
          rowStyle: {
            transform: "translate3d(0px, 0px, 0px)",
            transition: "transform 120ms ease",
          },
          placeholderHeight: 96,
          placeholderWidth: 240,
        }),
      );
    });

    const row = host.querySelector<HTMLElement>(
      '[data-testid="temp-param-row"]',
    );
    expect(row?.style.width).toBe("240px");
    expect(row?.style.height).toBe("96px");

    await act(async () => {
      useReactFlow.setState({ transform: [0, 0, 2] });
    });

    expect(row?.style.width).toBe("120px");
    expect(row?.style.height).toBe("48px");
    expect(row?.style.transform).toBe("translate3d(0px, 0px, 0px)");
  });
});
