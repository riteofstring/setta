/* @vitest-environment jsdom */

import { act, Profiler, type ProfilerOnRenderCallback } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReactFlow } from "../store";
import initialState from "../store/initialState";
import Viewport, { getViewportTransformStyle } from "./Viewport";

type RenderedViewport = {
  host: HTMLDivElement;
  root: Root;
};

async function renderViewport(
  onRender: ProfilerOnRenderCallback,
): Promise<RenderedViewport> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <Profiler id="viewport-profiler" onRender={onRender}>
        <Viewport>
          <div data-testid="viewport-child" />
        </Viewport>
      </Profiler>,
    );
  });

  return { host, root };
}

describe("Viewport", () => {
  beforeEach(() => {
    useReactFlow.setState({
      ...initialState,
      transform: [10, 20, 1],
    });
  });

  afterEach(async () => {
    useReactFlow.setState({ ...initialState });
    document.body.innerHTML = "";
  });

  it("keeps the mounted viewport shell out of transform-only commits", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderViewport(onRender);

    try {
      const initialCommitCount = onRender.mock.calls.length;
      const viewport = host.querySelector(".react-flow__viewport");
      if (!(viewport instanceof HTMLDivElement)) {
        throw new Error("Expected viewport host.");
      }

      expect(viewport.style.transform).toBe(
        getViewportTransformStyle([10, 20, 1]),
      );

      await act(async () => {
        useReactFlow.setState({
          transform: [40, -15, 1.5],
        });
      });

      expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
      expect(viewport.style.transform).toBe(
        getViewportTransformStyle([40, -15, 1.5]),
      );
      expect(
        host.querySelector("[data-testid='viewport-child']"),
      ).not.toBeNull();
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
