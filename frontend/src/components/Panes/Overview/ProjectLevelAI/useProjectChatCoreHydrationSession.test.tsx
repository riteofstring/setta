/* @vitest-environment jsdom */

import "testUtils/reactRefreshPreamble";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("state/actions/aiHydration", async () => {
  const actual = await vi.importActual<
    typeof import("state/actions/aiHydration")
  >("state/actions/aiHydration");
  return {
    ...actual,
    getExternalAgentChatHydrationOutcome: vi.fn(),
    getLLMChatHydrationOutcome: vi.fn(),
  };
});

import {
  getExternalAgentChatHydrationOutcome,
  getLLMChatHydrationOutcome,
} from "state/actions/aiHydration";
import { type ProjectChatHydrationAuthority } from "./projectChatHydrationAuthority";
import { useProjectChatCoreHydrationSession } from "./useProjectChatCoreHydrationSession";

type HydrationHarnessProps = {
  chatId: string | null | undefined;
  hydrationAuthority: ProjectChatHydrationAuthority;
  hydrationMetadataRevision: string;
  projectConfigId: string;
  waitingForResponse: boolean;
};

function HydrationHarness(props: HydrationHarnessProps) {
  const { blockedErrorCode } = useProjectChatCoreHydrationSession(props);
  return (
    <output data-testid="hydration-blocked-code">
      {blockedErrorCode ?? ""}
    </output>
  );
}

describe("useProjectChatCoreHydrationSession", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it("hydrates a selected managed thread even while the current chat is waiting", async () => {
    vi.mocked(getLLMChatHydrationOutcome).mockResolvedValue({
      outcome: "success",
      status: 200,
      errorCode: null,
    });

    await act(async () => {
      root.render(
        <HydrationHarness
          chatId="chat-a"
          hydrationAuthority={{
            status: "ready",
            hydrationRunType: "llm_chat",
            blockedErrorCode: null,
          }}
          hydrationMetadataRevision="revision-1"
          projectConfigId="project-1"
          waitingForResponse={true}
        />,
      );
    });

    await vi.waitFor(() => {
      expect(getLLMChatHydrationOutcome).toHaveBeenCalledWith("chat-a");
    });
  });

  it("cancels transient hydration retries when the selected chat changes", async () => {
    vi.useFakeTimers();
    vi.mocked(getLLMChatHydrationOutcome).mockImplementation(async (chatId) => {
      if (chatId === "chat-a") {
        return {
          outcome: "transient_failure",
          status: 500,
          errorCode: null,
        };
      }
      return {
        outcome: "success",
        status: 200,
        errorCode: null,
      };
    });

    await act(async () => {
      root.render(
        <HydrationHarness
          chatId="chat-a"
          hydrationAuthority={{
            status: "ready",
            hydrationRunType: "llm_chat",
            blockedErrorCode: null,
          }}
          hydrationMetadataRevision="revision-retry-a"
          projectConfigId="project-1"
          waitingForResponse={false}
        />,
      );
    });

    await vi.waitFor(() => {
      expect(getLLMChatHydrationOutcome).toHaveBeenCalledWith("chat-a");
    });

    await act(async () => {
      root.render(
        <HydrationHarness
          chatId="chat-b"
          hydrationAuthority={{
            status: "ready",
            hydrationRunType: "llm_chat",
            blockedErrorCode: null,
          }}
          hydrationMetadataRevision="revision-retry-b"
          projectConfigId="project-1"
          waitingForResponse={false}
        />,
      );
    });

    await vi.waitFor(() => {
      expect(getLLMChatHydrationOutcome).toHaveBeenCalledWith("chat-b");
    });

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(
      vi
        .mocked(getLLMChatHydrationOutcome)
        .mock.calls.filter(([chatId]) => chatId === "chat-a"),
    ).toHaveLength(1);
  });

  it("surfaces terminal hydration failures as blocked error codes", async () => {
    vi.mocked(getLLMChatHydrationOutcome).mockResolvedValue({
      outcome: "terminal_failure",
      status: 500,
      errorCode: "chat_runtime_ambiguous",
    });

    await act(async () => {
      root.render(
        <HydrationHarness
          chatId="chat-a"
          hydrationAuthority={{
            status: "ready",
            hydrationRunType: "llm_chat",
            blockedErrorCode: null,
          }}
          hydrationMetadataRevision="revision-terminal"
          projectConfigId="project-1"
          waitingForResponse={false}
        />,
      );
    });

    await vi.waitFor(() => {
      expect(getLLMChatHydrationOutcome).toHaveBeenCalledWith("chat-a");
    });

    const blockedCode = host.querySelector(
      '[data-testid="hydration-blocked-code"]',
    );
    expect(blockedCode?.textContent).toBe("chat_runtime_ambiguous");
    expect(getExternalAgentChatHydrationOutcome).not.toHaveBeenCalled();
  });
});
