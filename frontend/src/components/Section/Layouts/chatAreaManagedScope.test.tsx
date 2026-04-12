/* @vitest-environment jsdom */

import { act, Profiler, type ProfilerOnRenderCallback } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { AgenticEdgeKindEnum, createAgenticEdge } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useManagedChatAgenticScope } from "./ChatArea";

function ManagedChatAgenticScopeProbe({ sectionId }: { sectionId: string }) {
  const { hasAnyAgenticEdge, hasWriteScope } =
    useManagedChatAgenticScope(sectionId);

  return (
    <div
      data-testid="managed-chat-agentic-scope"
      data-has-any-agentic-edge={hasAnyAgenticEdge ? "true" : "false"}
      data-has-write-scope={hasWriteScope ? "true" : "false"}
    />
  );
}

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
      <Profiler id="managed-chat-agentic-scope-profiler" onRender={onRender}>
        <ManagedChatAgenticScopeProbe sectionId="section-chat" />
      </Profiler>,
    );
  });

  return { host, root };
}

describe("useManagedChatAgenticScope", () => {
  beforeEach(() => {
    resetProjectStores();
    useProjectState.setState((state) => {
      state.projectConfig.agenticEdges = [
        createAgenticEdge({
          id: "edge-a",
          sourceSectionId: "section-chat",
          targetSectionId: "section-scope",
          kind: AgenticEdgeKindEnum.chat_section,
        }),
      ];
    });
  });

  afterEach(() => {
    resetProjectStores();
    document.body.innerHTML = "";
  });

  it("keeps the managed chat scope probe out of unrelated edge commits", async () => {
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
              sourceSectionId: "section-other",
              targetSectionId: "section-third",
              kind: AgenticEdgeKindEnum.chat_section,
            }),
          ];
        });
      });

      expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
      expect(
        host.querySelector<HTMLElement>(
          '[data-testid="managed-chat-agentic-scope"]',
        )?.dataset.hasAnyAgenticEdge,
      ).toBe("true");
      expect(
        host.querySelector<HTMLElement>(
          '[data-testid="managed-chat-agentic-scope"]',
        )?.dataset.hasWriteScope,
      ).toBe("true");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("still rerenders when this chat gains its first chat-chat scope edge", async () => {
    useProjectState.setState((state) => {
      state.projectConfig.agenticEdges = [];
    });

    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderWithProfiler(onRender);

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        useProjectState.setState((state) => {
          state.projectConfig.agenticEdges = [
            createAgenticEdge({
              id: "edge-relevant",
              sourceSectionId: "section-chat",
              targetSectionId: "section-peer",
              kind: AgenticEdgeKindEnum.chat_chat,
            }),
          ];
        });
      });

      expect(onRender.mock.calls.length).toBeGreaterThan(initialCommitCount);
      expect(
        host.querySelector<HTMLElement>(
          '[data-testid="managed-chat-agentic-scope"]',
        )?.dataset.hasAnyAgenticEdge,
      ).toBe("true");
      expect(
        host.querySelector<HTMLElement>(
          '[data-testid="managed-chat-agentic-scope"]',
        )?.dataset.hasWriteScope,
      ).toBe("false");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
