/* @vitest-environment jsdom */

import { act, Profiler, type ProfilerOnRenderCallback } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useNodeInternals } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { Position } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReactFlow } from "../store";
import initialState from "../store/initialState";
import type { Node } from "../types/nodes";
import NodeRenderer from "./NodeRenderer";

vi.mock("../components/wrapNode", () => ({
  NodeWrapper: ({ id, visibility }: { id: string; visibility: string }) => (
    <div data-node-id={id} data-visibility={visibility} />
  ),
}));

type RenderedNodeRenderer = {
  host: HTMLDivElement;
  root: Root;
};

function createNode(id: string, position: Position): Node {
  return {
    id,
    position,
    width: 120,
    height: 80,
    zIndex: 0,
    tempZIndex: 0,
  };
}

async function renderNodeRenderer(
  onRender: ProfilerOnRenderCallback,
): Promise<RenderedNodeRenderer> {
  const host = document.createElement("div");
  document.body.appendChild(host);

  const root = createRoot(host);
  await act(async () => {
    root.render(
      <Profiler id="node-renderer-profiler" onRender={onRender}>
        <NodeRenderer />
      </Profiler>,
    );
  });

  return { host, root };
}

describe("NodeRenderer", () => {
  beforeEach(() => {
    resetProjectStores();
    useReactFlow.setState({
      ...initialState,
      fitViewOnInit: false,
      fitViewOnInitDone: true,
    });
    useNodeInternals.setState({
      x: new Map([
        ["section-a", createNode("section-a", { x: 10, y: 20 })],
        ["section-b", createNode("section-b", { x: 220, y: 140 })],
      ]),
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
    resetProjectStores();
    useReactFlow.setState({ ...initialState });
    useNodeInternals.setState({ x: new Map() });
    document.body.innerHTML = "";
  });

  it("does not rerender the node list when only pan activation changes", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderNodeRenderer(onRender);

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        useReactFlow.setState({ panActivationKeyPressed: true });
      });

      expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
      expect(host.querySelectorAll("[data-node-id]")).toHaveLength(2);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
