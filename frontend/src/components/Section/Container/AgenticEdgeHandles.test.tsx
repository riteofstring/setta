/* @vitest-environment jsdom */

import { act, Profiler, type ProfilerOnRenderCallback } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { AgenticEdgeKindEnum, createAgenticEdge } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgenticEdgeHandles } from "./AgenticEdgeHandles";

vi.mock("components/Utils/FloatingBox", () => ({
  getFloatingBoxHandlers: () => ({}),
}));

vi.mock("forks/xyflow/core/components/Handle", () => ({
  Handle: ({ className, id }: { className?: string; id?: string }) => (
    <div data-testid={id ?? "handle"} className={className} />
  ),
}));

vi.mock("forks/xyflow/core/contexts/NodeIdContext", () => ({
  useNodeId: () => "section-a",
}));

vi.mock("state/hooks/share", () => ({
  useShareCapabilities: () => ({ canEditStructure: true }),
}));

vi.mock("state/actions/agenticEdges", () => ({
  AGENTIC_EDGE_HANDLE_IDS: {
    reverseStart: "agentic-reverse-start",
    target: "agentic-target",
    source: "agentic-source",
  },
  createAgenticEdgeFromConnection: vi.fn(),
  isValidAgenticEdgeConnection: vi.fn(),
}));

type RenderedComponent = {
  host: HTMLDivElement;
  root: Root;
};

async function renderWithProfiler(
  onRender: ProfilerOnRenderCallback,
): Promise<RenderedComponent> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <Profiler id="agentic-edge-handles-profiler" onRender={onRender}>
        <AgenticEdgeHandles isUserView={false} />
      </Profiler>,
    );
  });

  return { host, root };
}

describe("AgenticEdgeHandles", () => {
  beforeEach(() => {
    resetProjectStores();
    useProjectState.setState((state) => {
      state.projectConfig.agenticEdges = [
        createAgenticEdge({
          id: "edge-a",
          sourceSectionId: "section-a",
          targetSectionId: "section-b",
          kind: AgenticEdgeKindEnum.chat_section,
        }),
      ];
    });
  });

  afterEach(() => {
    resetProjectStores();
    document.body.innerHTML = "";
  });

  it("keeps mounted handles out of unrelated agentic edge commits", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderWithProfiler(onRender);

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        useProjectState.setState((state) => {
          state.projectConfig.agenticEdges = [
            ...state.projectConfig.agenticEdges,
            createAgenticEdge({
              id: "edge-unrelated",
              sourceSectionId: "section-c",
              targetSectionId: "section-d",
              kind: AgenticEdgeKindEnum.chat_section,
            }),
          ];
        });
      });

      expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
      expect(host.querySelectorAll(".agentic-handle")).toHaveLength(3);
      expect(
        host.querySelector(".agentic-handle--source.agentic-handle--connected"),
      ).not.toBeNull();
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("still rerenders when this section gains an incoming agentic edge", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderWithProfiler(onRender);

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        useProjectState.setState((state) => {
          state.projectConfig.agenticEdges = [
            ...state.projectConfig.agenticEdges,
            createAgenticEdge({
              id: "edge-relevant",
              sourceSectionId: "section-z",
              targetSectionId: "section-a",
              kind: AgenticEdgeKindEnum.chat_section,
            }),
          ];
        });
      });

      expect(onRender.mock.calls.length).toBeGreaterThan(initialCommitCount);
      expect(
        host.querySelector(".agentic-handle--target.agentic-handle--connected"),
      ).not.toBeNull();
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
