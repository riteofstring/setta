import {
  markChatStreamActive,
  resetStreamingTracker,
} from "state/aiStreamingTracker";
import { useAIStore } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  type LLMConfig,
  createAssistantChatMessage,
  createMessageTextContent,
  createUserChatMessage,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getDefaultChatDetails } from "./aiChatDetails";
import {
  applyExternalHydratedChatDetails,
  applyLLMHydratedChatDetails,
} from "./aiHydrationChatState";

describe("aiHydrationChatState", () => {
  const chatId = "chat-1";

  beforeEach(() => {
    resetProjectStores();
    resetStreamingTracker();
  });

  afterEach(() => {
    resetProjectStores();
    resetStreamingTracker();
  });

  it("preserves active-stream waiting and local-only assistant state for llm hydration", () => {
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          messages: [
            createAssistantChatMessage({
              id: "assistant-1",
              content: [
                createMessageTextContent({ text: "Hello there streaming" }),
              ],
              attachments: [],
              tool_calls: null,
            }),
          ],
          waitingForResponse: true,
        },
      },
    });
    markChatStreamActive(chatId, null);

    const nextWaitingForResponse = applyLLMHydratedChatDetails({
      chatId,
      payload: {
        messages: [
          createUserChatMessage({
            id: "user-1",
            content: [createMessageTextContent({ text: "Hi" })],
            attachments: [],
          }),
          createAssistantChatMessage({
            id: "assistant-1",
            content: [createMessageTextContent({ text: "Hello" })],
            attachments: [],
            tool_calls: null,
          }),
        ],
        waitingForResponse: false,
        llmConfig: null,
        contextUsage: null,
        appGenerationByMessageId: {
          "user-1": "prompt_builder",
        },
      },
    });

    expect(nextWaitingForResponse).toBe(true);
    const details = useAIStore.getState().chatDetails[chatId];
    expect(details.waitingForResponse).toBe(true);
    expect(details.messages.map((message) => message.id)).toEqual([
      "user-1",
      "assistant-1",
    ]);
    expect(
      details.messages.find((message) => message.id === "assistant-1")?.content,
    ).toEqual([createMessageTextContent({ text: "Hello there streaming" })]);
    expect(
      useAIStore.getState().chatAppGenerationDetailsByChatId[chatId],
    ).toEqual({
      activeAppGeneration: {
        mode: "prompt_builder",
      },
      appGenerationByMessageId: {
        "user-1": {
          mode: "prompt_builder",
        },
      },
    });
  });

  it("applies external hydration tool arguments and clears any stale llm config", () => {
    const staleLLMConfig: LLMConfig = {
      id: "llm-1",
      model: "test-model",
      provider: null,
      base_url: null,
      api_key_env: null,
      other_params: null,
      mcpServerIds: null,
      temporary: false,
    };
    useAIStore.setState({
      chatDetails: {
        [chatId]: {
          ...getDefaultChatDetails(),
          llmConfig: staleLLMConfig,
        },
      },
    });

    const nextWaitingForResponse = applyExternalHydratedChatDetails({
      chatId,
      payload: {
        messages: [],
        waitingForResponse: false,
        toolCallArguments: { "tool-1": "{}" },
        contextUsage: null,
        appGenerationByMessageId: {},
      },
    });

    expect(nextWaitingForResponse).toBe(false);
    expect(useAIStore.getState().chatDetails[chatId]).toMatchObject({
      llmConfig: null,
      toolCallArguments: { "tool-1": "{}" },
      waitingForResponse: false,
    });
  });
});
