import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("state/actions/ai", async () => {
  const actual =
    await vi.importActual<typeof import("state/actions/ai")>(
      "state/actions/ai",
    );
  return {
    ...actual,
    getExternalAgentChatHydrationOutcome: vi.fn(),
    getLLMChatHydrationOutcome: vi.fn(),
  };
});

import {
  getExternalAgentChatHydrationOutcome,
  getLLMChatHydrationOutcome,
} from "state/actions/ai";
import { hydrateProjectChatFromRuntime } from "./projectChatCoreUtils";

describe("hydrateProjectChatFromRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the current project scope for direct external-agent hydration", async () => {
    vi.mocked(getExternalAgentChatHydrationOutcome).mockResolvedValue({
      outcome: "success",
      status: 200,
      errorCode: null,
    });

    await hydrateProjectChatFromRuntime({
      chatId: "shared-chat",
      projectConfigId: "project-a",
      hydrationRunType: "external_agent",
    });

    expect(getExternalAgentChatHydrationOutcome).toHaveBeenCalledWith(
      "shared-chat",
      "project-a",
    );
  });

  it("uses the managed runtime without probing external history when hydration stays on llm chat", async () => {
    vi.mocked(getLLMChatHydrationOutcome).mockResolvedValue({
      outcome: "success",
      status: 200,
      errorCode: null,
    });

    await hydrateProjectChatFromRuntime({
      chatId: "llm-chat",
      projectConfigId: "project-a",
      hydrationRunType: "llm_chat",
    });

    expect(getLLMChatHydrationOutcome).toHaveBeenCalledWith("llm-chat");
    expect(getExternalAgentChatHydrationOutcome).not.toHaveBeenCalled();
  });
});
