/* @vitest-environment jsdom */

import { act, Profiler, type ProfilerOnRenderCallback } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useNodeInternals, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { Position } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Node } from "../types";
import { NodeWrapper } from "./wrapNode";

vi.mock("components/Section/Container/SectionContainer", () => ({
  SectionContainer: ({
    sectionId,
    isTopLevel,
  }: {
    sectionId: string;
    isTopLevel: boolean;
  }) => (
    <div data-testid="section-container" data-section-id={sectionId}>
      {isTopLevel ? "top-level" : "nested"}
    </div>
  ),
}));

vi.mock("../hooks/useDrag", () => ({
  default: vi.fn(),
}));

vi.mock("state/actions/sectionInfos", () => ({
  getCurrEffectiveSectionImpl: () => ({
    positionAndSizeLocked: false,
  }),
}));

type RenderedNodeWrapper = {
  host: HTMLDivElement;
  root: Root;
};

function createNode(
  id: string,
  position: Position,
  overrides: Partial<Node> = {},
): Node {
  return {
    id,
    position,
    width: 120,
    height: 80,
    zIndex: 0,
    tempZIndex: 0,
    ...overrides,
  };
}

async function renderNodeWrapper(
  onRender: ProfilerOnRenderCallback,
): Promise<RenderedNodeWrapper> {
  const host = document.createElement("div");
  document.body.appendChild(host);

  const root = createRoot(host);
  await act(async () => {
    root.render(
      <Profiler id="node-wrapper-profiler" onRender={onRender}>
        <NodeWrapper
          id="section-a"
          resizeObserver={null}
          visibility="visible"
        />
      </Profiler>,
    );
  });

  return { host, root };
}

describe("NodeWrapper", () => {
  beforeEach(() => {
    resetProjectStores();
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-config";
    });
    useNodeInternals.setState({
      x: new Map([["section-a", createNode("section-a", { x: 10, y: 20 })]]),
    });
  });

  afterEach(async () => {
    resetProjectStores();
    useNodeInternals.setState({ x: new Map() });
    document.body.innerHTML = "";
  });

  it("keeps the mounted section wrapper out of unrelated node-internals commits", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderNodeWrapper(onRender);

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        useNodeInternals.setState((state) => {
          const next = new Map(state.x);
          const current = next.get("section-a");
          if (!current) {
            throw new Error("Expected node internals for section-a.");
          }
          next.set("section-a", {
            ...current,
            width: 240,
            height: 160,
            measured: {
              width: 240,
              height: 160,
            },
            handleBounds: {
              source: [],
              target: [],
            },
          });
          return { x: next };
        });
      });

      expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
      expect(
        host.querySelector("[data-testid='rf__node-section-a']"),
      ).not.toBeNull();
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("still rerenders when node position changes", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderNodeWrapper(onRender);

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        useNodeInternals.setState((state) => {
          const next = new Map(state.x);
          const current = next.get("section-a");
          if (!current) {
            throw new Error("Expected node internals for section-a.");
          }
          next.set("section-a", {
            ...current,
            position: { x: 40, y: 70 },
          });
          return { x: next };
        });
      });

      expect(onRender.mock.calls.length).toBeGreaterThan(initialCommitCount);
      const node = host.querySelector("[data-testid='rf__node-section-a']");
      expect(node).not.toBeNull();
      expect((node as HTMLDivElement).style.transform).toBe(
        "translate(40px,70px)",
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
