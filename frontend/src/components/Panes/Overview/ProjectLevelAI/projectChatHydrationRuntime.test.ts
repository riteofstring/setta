import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("state/actions/ai/chatRuntime", async () => {
  const actual = await vi.importActual<
    typeof import("state/actions/ai/chatRuntime")
  >("state/actions/ai/chatRuntime");
  return {
    ...actual,
    getProjectChatHydrationOutcomeWithFallback: vi.fn(),
    getExternalAgentChatHydrationOutcome: vi.fn(),
    getLLMChatHydrationOutcome: vi.fn(),
  };
});

import {
  getExternalAgentChatHydrationOutcome,
  getLLMChatHydrationOutcome,
  getProjectChatHydrationOutcomeWithFallback,
} from "state/actions/ai/chatRuntime";
import { hydrateProjectChatFromRuntime } from "./ProjectChatCore";

describe("hydrateProjectChatFromRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the current project scope when probing missing provenance", async () => {
    vi.mocked(getProjectChatHydrationOutcomeWithFallback).mockResolvedValue({
      outcome: "success",
      status: 200,
      errorCode: null,
    });

    await hydrateProjectChatFromRuntime({
      chatId: "shared-chat",
      projectConfigId: "project-a",
      hydrationRunType: "external_agent",
      shouldProbeMissingProvenance: true,
    });

    expect(getProjectChatHydrationOutcomeWithFallback).toHaveBeenCalledWith(
      "shared-chat",
      "project-a",
      "external_agent",
    );
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
      shouldProbeMissingProvenance: false,
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
      shouldProbeMissingProvenance: false,
    });

    expect(getLLMChatHydrationOutcome).toHaveBeenCalledWith("llm-chat");
    expect(getExternalAgentChatHydrationOutcome).not.toHaveBeenCalled();
    expect(getProjectChatHydrationOutcomeWithFallback).not.toHaveBeenCalled();
  });
});
