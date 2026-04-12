/* @vitest-environment jsdom */

import { act, Profiler, type ProfilerOnRenderCallback } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReactFlow } from "../store";
import initialState from "../store/initialState";
import ReactFlow from "./ReactFlow";

vi.mock("forks/xyflow/background/Background", () => ({
  default: () => <div data-testid="background" />,
}));

vi.mock("./AgenticEdgeRenderer", () => ({
  default: () => <div data-testid="agentic-edge-renderer" />,
}));

vi.mock("./EdgeRenderer", () => ({
  default: () => <div data-testid="edge-renderer" />,
}));

vi.mock("./NodeRenderer", () => ({
  default: () => <div data-testid="node-renderer" />,
}));

vi.mock("./StateMachineEdgeRenderer", () => ({
  default: () => <div data-testid="state-machine-edge-renderer" />,
}));

vi.mock("./FlowRenderer", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="flow-renderer">{children}</div>
  ),
}));

vi.mock("./Viewport", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="viewport-wrapper">{children}</div>
  ),
}));

vi.mock("state/definitions", () => ({
  useLocalStorage: (
    selector: (state: {
      darkMode: boolean;
      overviewTrueWidth: number;
      showAgenticEdges: boolean;
      showArgEdges: boolean;
      snapToGrid: boolean;
      uiEditorTrueWidth: number;
    }) => unknown,
  ) =>
    selector({
      darkMode: false,
      overviewTrueWidth: 0,
      showAgenticEdges: true,
      showArgEdges: true,
      snapToGrid: false,
      uiEditorTrueWidth: 0,
    }),
  useSettings: (
    selector: (state: {
      gui: {
        showGridLines: boolean;
        wireColor: string;
        wireColorDarkMode: string;
      };
    }) => unknown,
  ) =>
    selector({
      gui: {
        showGridLines: false,
        wireColor: "#41506c",
        wireColorDarkMode: "#bac2d3",
      },
    }),
}));

vi.mock("utils/focusManager", () => ({
  useTabScope: () => undefined,
}));

type RenderedReactFlow = {
  host: HTMLDivElement;
  root: Root;
};

async function renderReactFlow(
  onRender: ProfilerOnRenderCallback,
): Promise<RenderedReactFlow> {
  const host = document.createElement("div");
  document.body.appendChild(host);

  const root = createRoot(host);
  await act(async () => {
    root.render(
      <Profiler id="react-flow-profiler" onRender={onRender}>
        <ReactFlow />
      </Profiler>,
    );
  });

  return { host, root };
}

describe("ReactFlow", () => {
  beforeEach(() => {
    useReactFlow.setState({
      ...initialState,
      connectionStartHandle: null,
    });

    class ResizeObserverStub {
      disconnect() {}
      observe() {}
      unobserve() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    useReactFlow.setState({ ...initialState });
    document.body.innerHTML = "";
  });

  it("keeps the root out of connection-start commits while updating the attribute", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderReactFlow(onRender);

    try {
      const reactFlowRoot = host.querySelector(".react-flow");
      expect(reactFlowRoot).not.toBeNull();
      expect(reactFlowRoot?.getAttribute("data-connecting")).toBe("false");

      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        useReactFlow.setState({
          connectionStartHandle: {
            handleId: "agentic-source",
            sectionId: "section-a",
            type: "source",
          },
        });
      });

      expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
      expect(reactFlowRoot?.getAttribute("data-connecting")).toBe("true");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
