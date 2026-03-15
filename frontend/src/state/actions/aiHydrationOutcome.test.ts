import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_get_llm_chat: vi.fn(),
    route_get_external_agent_chat: vi.fn(),
  };
});

import {
  buildChatHydrationFailureOutcome,
  probeExternalAgentChatHydration,
  probeLLMChatHydration,
} from "./aiHydrationOutcome";

describe("ai hydration outcomes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("classifies typed 404 failures as terminal chat_not_found", () => {
    expect(
      buildChatHydrationFailureOutcome({
        status: 404,
        data: {
          detail: {
            errorCode: "chat_not_found",
            message: "missing",
          },
        },
      }),
    ).toEqual({
      outcome: "terminal_failure",
      status: 404,
      errorCode: "chat_not_found",
    });
  });

  it("probes llm chat hydration and returns a success payload", async () => {
    const routeGetLlmChat = (await import("utils/generatedEndpoints"))
      .route_get_llm_chat as unknown as vi.Mock;
    routeGetLlmChat.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        messages: [],
        waitingForResponse: false,
        llmConfig: null,
      },
    });

    const result = await probeLLMChatHydration("chat-1", "project-1");

    expect(result).toMatchObject({
      outcome: "success",
      status: 200,
      errorCode: null,
      payload: {
        messages: [],
        waitingForResponse: false,
      },
    });
  });

  it("classifies untyped external 500 failures as transient", async () => {
    const routeGetExternalChat = (await import("utils/generatedEndpoints"))
      .route_get_external_agent_chat as unknown as vi.Mock;
    routeGetExternalChat.mockResolvedValue({
      status: 500,
      hasResponse: true,
      data: {
        detail: "server exploded",
      },
    });

    const result = await probeExternalAgentChatHydration("chat-2", "project-2");

    expect(result).toEqual({
      outcome: "transient_failure",
      status: 500,
      errorCode: null,
      payload: null,
    });
  });
});
