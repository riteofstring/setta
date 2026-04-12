/* @vitest-environment jsdom */

import { act, Profiler, type ProfilerOnRenderCallback } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReactFlow } from "../core/store";
import initialState from "../core/store/initialState";
import { BackgroundCore, getBackgroundPatternAttributes } from "./Background";

type RenderedBackground = {
  host: HTMLDivElement;
  root: Root;
};

async function renderBackground(
  onRender: ProfilerOnRenderCallback,
): Promise<RenderedBackground> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <svg>
        <Profiler id="background-profiler" onRender={onRender}>
          <BackgroundCore
            offset={2}
            gapXY={[20, 20]}
            patternColor="#41506c"
            patternSize={1}
            isCross={false}
            isDots={true}
          />
        </Profiler>
      </svg>,
    );
  });

  return { host, root };
}

describe("BackgroundCore", () => {
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

  it("keeps the mounted background out of transform-only commits", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderBackground(onRender);

    try {
      const initialCommitCount = onRender.mock.calls.length;
      const pattern = host.querySelector("#ReactFlowBackground");
      const dot = host.querySelector("circle");

      if (!(pattern instanceof SVGElement)) {
        throw new Error("Expected background pattern.");
      }

      if (!(dot instanceof SVGElement)) {
        throw new Error("Expected background dot.");
      }

      const initialAttributes = getBackgroundPatternAttributes([10, 20, 1], {
        gapXY: [20, 20],
        patternSize: 1,
        isCross: false,
        isDots: true,
        offset: 2,
      });

      expect(pattern.getAttribute("x")).toBe(`${initialAttributes.x}`);
      expect(pattern.getAttribute("y")).toBe(`${initialAttributes.y}`);
      expect(pattern.getAttribute("width")).toBe(
        `${initialAttributes.patternWidth}`,
      );
      expect(dot.getAttribute("r")).toBe(`${initialAttributes.radius}`);

      await act(async () => {
        useReactFlow.setState({
          transform: [45, -15, 1.5],
        });
      });

      const updatedAttributes = getBackgroundPatternAttributes([45, -15, 1.5], {
        gapXY: [20, 20],
        patternSize: 1,
        isCross: false,
        isDots: true,
        offset: 2,
      });

      expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
      expect(pattern.getAttribute("x")).toBe(`${updatedAttributes.x}`);
      expect(pattern.getAttribute("y")).toBe(`${updatedAttributes.y}`);
      expect(pattern.getAttribute("width")).toBe(
        `${updatedAttributes.patternWidth}`,
      );
      expect(pattern.getAttribute("height")).toBe(
        `${updatedAttributes.patternHeight}`,
      );
      expect(pattern.getAttribute("patternTransform")).toBe(
        `translate(-${updatedAttributes.patternOffsetX},-${updatedAttributes.patternOffsetY})`,
      );
      expect(dot.getAttribute("cx")).toBe(`${updatedAttributes.radius}`);
      expect(dot.getAttribute("cy")).toBe(`${updatedAttributes.radius}`);
      expect(dot.getAttribute("r")).toBe(`${updatedAttributes.radius}`);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
