import { useAIStore } from "state/definitions";
import { ChatStreamStatusEnum } from "utils/generatedTypes";
import {
  createChatMessage,
  createLLMTextBlock,
  createLLMToolCallBlock,
  createLLMToolResultBlock,
  ResponseFinishStatusEnum,
  type MessageStartedEvent,
  type ResponseCompletedEvent,
  type TextDeltaEvent,
  type ToolCallDeltaEvent,
  type ToolResultEvent,
} from "utils/generatedTypes";

type ChatDetailState = ReturnType<typeof getDefaultChatDetails>;

export function getDefaultChatDetails() {
  return {
    messages: [],
    waitingForResponse: false,
    streamStatus: ChatStreamStatusEnum.IDLE,
    streamTarget: null,
    modelSelectionKey: null as string | null,
  };
}

export function isStreamingStatus(status: string | null | undefined): boolean {
  return status === ChatStreamStatusEnum.STREAMING;
}

export function applyMessageStarted(
  chatId: string,
  chunk: MessageStartedEvent,
): void {
  const message = createChatMessage({
    id: chunk.message_id,
    role: chunk.role,
    content: [],
  });
  updateChatDetails(chatId, (details) => ({
    ...details,
    messages: [...details.messages, message],
    waitingForResponse: true,
    streamStatus: ChatStreamStatusEnum.STREAMING,
  }));
}

export function applyTextDelta(chatId: string, chunk: TextDeltaEvent): void {
  updateChatDetails(chatId, (details) => {
    const messageIndex = details.messages.findIndex(
      (m) => m.id === chunk.message_id,
    );
    if (messageIndex === -1) {
      return details;
    }

    const message = details.messages[messageIndex];
    const content = [...message.content];
    const streamTarget = chunk.stream_target ?? null;

    const blockIndex = content.findIndex(
      (block) =>
        block?.type === "text" &&
        (block.stream_target ?? null) === streamTarget,
    );

    let newContent = content;
    if (blockIndex === -1) {
      newContent = [
        ...content,
        createLLMTextBlock({ text: chunk.delta, stream_target: streamTarget }),
      ];
    } else {
      const existingBlock = content[blockIndex];
      if (!existingBlock || existingBlock.type !== "text") {
        return details;
      }
      newContent = [...content];
      newContent[blockIndex] = {
        ...existingBlock,
        text: `${existingBlock.text ?? ""}${chunk.delta}`,
      };
    }

    const updatedMessage = { ...message, content: newContent };
    const newMessages = [
      ...details.messages.slice(0, messageIndex),
      updatedMessage,
      ...details.messages.slice(messageIndex + 1),
    ];

    return {
      ...details,
      messages: newMessages,
      waitingForResponse: true,
      streamStatus: ChatStreamStatusEnum.STREAMING,
    };
  });
}

export function applyToolCallDelta(
  chatId: string,
  assistantMessageId: string | null,
  chunk: ToolCallDeltaEvent,
): void {
  if (!assistantMessageId) {
    return;
  }

  updateChatDetails(chatId, (details) => {
    const messageIndex = details.messages.findIndex(
      (m) => m.id === assistantMessageId,
    );
    if (messageIndex === -1) {
      return details;
    }

    const message = details.messages[messageIndex];
    const content = [...message.content];
    const blockIndex = content.findIndex(
      (block) =>
        block?.type === "tool_call" &&
        block.tool_call_id === chunk.tool_call_id,
    );

    let newContent = content;
    if (blockIndex === -1) {
      newContent = [
        ...content,
        createLLMToolCallBlock({
          tool_call_id: chunk.tool_call_id,
          name: chunk.name ?? "",
          arguments_text: chunk.arguments_delta ?? "",
        }),
      ];
    } else {
      const existingBlock = content[blockIndex];
      if (!existingBlock || existingBlock.type !== "tool_call") {
        return details;
      }
      newContent = [...content];
      newContent[blockIndex] = {
        ...existingBlock,
        name: chunk.name ?? existingBlock.name,
        arguments_text: `${existingBlock.arguments_text ?? ""}${
          chunk.arguments_delta
        }`,
      };
    }

    const updatedMessage = { ...message, content: newContent };
    const newMessages = [
      ...details.messages.slice(0, messageIndex),
      updatedMessage,
      ...details.messages.slice(messageIndex + 1),
    ];

    return {
      ...details,
      messages: newMessages,
      waitingForResponse: true,
      streamStatus: ChatStreamStatusEnum.STREAMING,
    };
  });
}

export function applyToolResult(
  chatId: string,
  assistantMessageId: string | null,
  chunk: ToolResultEvent,
): void {
  updateChatDetails(chatId, (details) => {
    let newMessages = details.messages;

    if (assistantMessageId) {
      const messageIndex = details.messages.findIndex(
        (m) => m.id === assistantMessageId,
      );
      if (messageIndex !== -1) {
        const message = details.messages[messageIndex];
        const content = [...message.content];
        const toolCallBlock = content.find(
          (block) =>
            block?.type === "tool_call" &&
            block.tool_call_id === chunk.tool_call_id,
        );

        const resultBlock = createLLMToolResultBlock({
          tool_call_id: chunk.tool_call_id,
          name:
            toolCallBlock && toolCallBlock.type === "tool_call"
              ? toolCallBlock.name
              : null,
          output_text: chunk.output_text ?? null,
          output_json: chunk.output ?? null,
          is_error: chunk.is_error ?? false,
        });

        const updatedMessage = {
          ...message,
          content: [...content, resultBlock],
        };

        newMessages = [
          ...details.messages.slice(0, messageIndex),
          updatedMessage,
          ...details.messages.slice(messageIndex + 1),
        ];
      }
    }

    return {
      ...details,
      messages: newMessages,
      waitingForResponse: true,
      streamStatus: ChatStreamStatusEnum.STREAMING,
    };
  });
}

export function applyResponseCompleted(
  chatId: string,
  chunk: ResponseCompletedEvent | null,
): void {
  const finishStatus = chunk?.status;
  const finishReason = chunk?.finish_reason;
  let streamStatus = ChatStreamStatusEnum.COMPLETED;

  if (
    finishStatus === ResponseFinishStatusEnum.CANCELED ||
    finishReason === "canceled"
  ) {
    streamStatus = ChatStreamStatusEnum.CANCELED;
  } else if (finishStatus === ResponseFinishStatusEnum.ERROR) {
    streamStatus = ChatStreamStatusEnum.ERROR;
  }

  updateChatDetails(chatId, (details) => ({
    ...details,
    waitingForResponse: false,
    streamStatus,
  }));
}

export function updateChatDetails(
  chatId: string,
  updater: (details: ChatDetailState) => ChatDetailState,
): void {
  useAIStore.setState((state) => {
    const baseDetails = {
      ...getDefaultChatDetails(),
      ...(state.chatDetails[chatId] ?? {}),
    };
    const updated = updater(baseDetails);
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: updated,
      },
    };
  });
}
