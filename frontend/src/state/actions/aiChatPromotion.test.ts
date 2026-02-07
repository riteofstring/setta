import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useAIStore, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { StreamingEventTypeEnum, createProjectConfig } from "utils/generatedTypes";

import { getDefaultChatDetails, receiveLLMResponseChunk } from "./ai";

describe("ai pending chat promotion", () => {
  beforeEach(() => {
    resetProjectStores();
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({ id: "project-1" });
    });
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("does not emit a store update when promotion is a no-op", () => {
    useAIStore.setState({
      activeChatId: "existing-chat",
      pendingChatDetails: null,
      chatDetails: {},
    });

    let updateCount = 0;
    const unsubscribe = useAIStore.subscribe(() => {
      updateCount += 1;
    });

    receiveLLMResponseChunk({
      chatId: "some-chat",
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.DELTA,
        message_id: "msg-1",
        content: null,
      },
    });

    unsubscribe();

    expect(updateCount).toBe(0);
  });

  it("promotes pending chat details when the active chat is pending", () => {
    useAIStore.setState({
      activeChatId: null,
      pendingChatDetails: getDefaultChatDetails(),
      chatDetails: {},
    });

    let updateCount = 0;
    const unsubscribe = useAIStore.subscribe(() => {
      updateCount += 1;
    });

    receiveLLMResponseChunk({
      chatId: "new-chat",
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.DELTA,
        message_id: "msg-1",
        content: null,
      },
    });

    unsubscribe();

    const state = useAIStore.getState();
    expect(updateCount).toBe(1);
    expect(state.activeChatId).toBe("new-chat");
    expect(state.pendingChatDetails).toBeNull();
    expect(state.chatDetails["new-chat"]).toMatchObject({
      messages: [],
      toolCallArguments: {},
      waitingForResponse: false,
    });
  });
});

