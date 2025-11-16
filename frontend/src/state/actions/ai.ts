import _ from "lodash";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { useAIStore, useProjectState } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import {
  route_delete_llm_chat,
  route_get_all_llm_chat_metadata,
  route_get_llm_config,
  route_get_llm_presets,
  route_get_llm_chat,
  route_get_llm_response,
  route_get_uuid_mapping_for_llm,
  route_set_llm_config,
  route_test_llm_config,
} from "utils/generatedEndpoints";
import {
  ChatStreamStatusEnum,
  createChatMessage,
  createLLMTextBlock,
  createLLMToolCallBlock,
  createLLMToolResultBlock,
  createToolResult,
  IDToUUIDForLLM,
  LLMRoleEnum,
  LLMStreamEventTypeEnum,
  type LLMConfigPayload,
  type LLMConfigTestResultPayload,
  type LLMPresetCatalogPayload,
  type LLMStreamingResponse,
  type MessageStartedEvent,
  type TextDeltaEvent,
  type ToolCallDeltaEvent,
  type ToolResultEvent,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import { getSectionType, getSectionVariant } from "./sectionInfos";
import {
  decodeModelSelectionKey,
  encodeModelSelectionKey,
} from "utils/llmSelection";

export async function loadLLMConfig() {
  const res = await route_get_llm_config();
  if (res200(res)) {
    applyLLMConfigUpdate(res.data);
    return;
  }

  useAIStore.setState({
    llmConfig: null,
    llmConfigLoaded: true,
  });
}

export function applyLLMConfigUpdate(config: LLMConfigPayload) {
  useAIStore.setState((state) => {
    const availableModels = new Set<string>();
    for (const provider of config.providers) {
      for (const model of provider.models) {
        availableModels.add(
          encodeModelSelectionKey({
            providerId: provider.provider_id,
            modelId: model.model_id,
          }),
        );
      }
    }

    const existingSelection = state.userSelectedLLM;
    const nextSelection =
      existingSelection && availableModels.has(existingSelection)
        ? existingSelection
        : findDefaultModelSelection(config);

    return {
      llmConfig: config,
      llmConfigLoaded: true,
      userSelectedLLM: nextSelection,
    };
  });
}

function findDefaultModelSelection(config: LLMConfigPayload): string | null {
  for (const provider of config.providers) {
    const defaultModelId = provider.default_model_id;
    if (!defaultModelId) {
      continue;
    }

    const hasModel = provider.models.some(
      (model) => model.model_id === defaultModelId,
    );
    if (!hasModel) {
      continue;
    }

    return encodeModelSelectionKey({
      providerId: provider.provider_id,
      modelId: defaultModelId,
    });
  }

  return null;
}

export async function loadLLMPresets() {
  const res = await route_get_llm_presets();
  if (res200(res)) {
    applyLLMPresetsUpdate(res.data);
    return;
  }

  useAIStore.setState({
    llmPresets: null,
    llmPresetsLoaded: true,
  });
}

export function applyLLMPresetsUpdate(catalog: LLMPresetCatalogPayload) {
  useAIStore.setState({
    llmPresets: catalog,
    llmPresetsLoaded: true,
  });
}

export async function saveLLMConfig(payload: LLMConfigPayload) {
  const res = await route_set_llm_config(payload);
  if (res200(res)) {
    applyLLMConfigUpdate(res.data);
    return { ok: true as const };
  }
  const detail =
    res.data && typeof res.data === "object" && "detail" in res.data
      ? String(res.data.detail)
      : "Failed to save LLM configuration";
  return { ok: false as const, error: detail };
}

export async function testLLMConfig(
  payload: LLMConfigPayload,
): Promise<LLMConfigTestResultPayload> {
  const res = await route_test_llm_config({ config: payload });
  if (res200(res)) {
    return res.data;
  }
  const detail =
    res.data && typeof res.data === "object" && "detail" in res.data
      ? String(res.data.detail)
      : "Failed to test LLM configuration";
  throw new Error(detail);
}

function isStreamingStatus(status: string | null | undefined): boolean {
  return status === ChatStreamStatusEnum.STREAMING;
}

export function getDefaultChatDetails() {
  return {
    messages: [],
    toolResults: {},
    waitingForResponse: false,
    streamStatus: ChatStreamStatusEnum.IDLE,
    streamTarget: null,
    modelSelectionKey: null,
  };
}

export async function getLLMChat(chatId: string) {
  const projectConfigId = getCurrProjectConfigId();
  const res = await route_get_llm_chat({ chatId, projectConfigId });
  if (res200(res)) {
    const {
      messages,
      toolResults,
      waitingForResponse,
      modelSelection,
      streamStatus,
    } = res.data;
    const modelSelectionKey = modelSelection
      ? encodeModelSelectionKey({
          providerId: modelSelection.providerId,
          modelId: modelSelection.modelId,
        })
      : null;
    const nextWaitingForResponse =
      isStreamingStatus(streamStatus) || waitingForResponse;
    useAIStore.setState((state) => ({
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...getDefaultChatDetails(),
          ...(state.chatDetails[chatId] ?? {}),
          messages,
          toolResults,
          waitingForResponse: nextWaitingForResponse,
          streamStatus: streamStatus ?? ChatStreamStatusEnum.IDLE,
          modelSelectionKey,
        },
      },
      currentChatId: chatId,
      userSelectedLLM: modelSelectionKey ?? state.userSelectedLLM,
    }));
  } else {
    useAIStore.setState({ currentChatId: null });
  }
}

export async function createNewLLMChat() {
  useAIStore.setState({
    currentChatId: null,
    viewHistory: false,
  });
}

export async function getAllLLMChatMetadata() {
  const res = await route_get_all_llm_chat_metadata();
  if (res200(res)) {
    useAIStore.setState({ allChatMetadata: res.data });
  }
}

export async function deleteLLMChat(chatId: string) {
  await route_delete_llm_chat({ chatId });
  await getAllLLMChatMetadata();
}

export function goToChat(id) {
  useAIStore.setState({ currentChatId: id, viewHistory: false });
}

export async function rehydrateActiveChat() {
  const { currentChatId } = useAIStore.getState();
  if (!currentChatId) {
    return;
  }
  await getLLMChat(currentChatId);
}

export async function submitMessage(message: string, deepThink) {
  if (!message.trim()) return;

  // Add user message immediately for responsive UI
  const userMessage = createChatMessage({
    id: createNewId(),
    role: LLMRoleEnum.USER,
    content: [createLLMTextBlock({ text: message })],
  });

  const state = useAIStore.getState();
  const modelSelection = decodeModelSelectionKey(state.userSelectedLLM);
  if (!modelSelection) {
    throw new Error("LLM model selection is required");
  }

  const res = await route_get_llm_response({
    projectConfigId: getCurrProjectConfigId(),
    modelSelection,
    message: userMessage,
    deepThink,
    chatId: state.currentChatId,
  });
  if (res200(res)) {
    const chatId = res.data;
    await getLLMChat(chatId);
  }
}

export function receiveLLMResponseChunk(msg: LLMStreamingResponse) {
  try {
    const { chatId, assistantMessageId, chunk } = msg;
    const { chatDetails } = useAIStore.getState();
    const streamTarget = chatDetails[chatId]?.streamTarget;

    if (
      streamTarget &&
      chunk.event_type === LLMStreamEventTypeEnum.TEXT_DELTA
    ) {
      streamInto(chatId, streamTarget, chunk.delta);
    }

    switch (chunk.event_type) {
      case LLMStreamEventTypeEnum.MESSAGE_STARTED:
        llmMessageStarted(chatId, chunk);
        return;
      case LLMStreamEventTypeEnum.TEXT_DELTA:
        llmTextDelta(chatId, chunk);
        return;
      case LLMStreamEventTypeEnum.TOOL_CALL_DELTA:
        llmToolCallDelta(chatId, assistantMessageId, chunk);
        return;
      case LLMStreamEventTypeEnum.TOOL_RESULT:
        llmToolResult(chatId, assistantMessageId, chunk);
        return;
      case LLMStreamEventTypeEnum.RESPONSE_COMPLETED:
        llmResponseCompleted(chatId);
        return;
      default:
        return;
    }
  } catch (e) {
    console.error("Error parsing streaming chunk:", e);
  }
}

function llmMessageStarted(chatId: string, chunk: MessageStartedEvent) {
  const message = createChatMessage({
    id: chunk.message_id,
    role: chunk.role,
    content: [],
  });

  useAIStore.setState((state) => {
    const currDetails = state.chatDetails[chatId];
    const currMessages = currDetails?.messages ?? [];
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...getDefaultChatDetails(),
          ...(currDetails ?? {}),
          messages: [...currMessages, message],
          waitingForResponse: true,
          streamStatus: ChatStreamStatusEnum.STREAMING,
        },
      },
    };
  });
}

function llmTextDelta(chatId: string, chunk: TextDeltaEvent) {
  useAIStore.setState((state) => {
    const currDetails = state.chatDetails[chatId];
    const currMessages = currDetails?.messages ?? [];
    const messageIndex = currMessages.findIndex(
      (m) => m.id === chunk.message_id,
    );
    if (messageIndex === -1) {
      return {};
    }

    const message = currMessages[messageIndex];
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
        return {};
      }
      newContent = [...content];
      newContent[blockIndex] = {
        ...existingBlock,
        text: `${existingBlock.text ?? ""}${chunk.delta}`,
      };
    }

    const updatedMessage = { ...message, content: newContent };
    const newMessages = [
      ...currMessages.slice(0, messageIndex),
      updatedMessage,
      ...currMessages.slice(messageIndex + 1),
    ];

    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...getDefaultChatDetails(),
          ...(currDetails ?? {}),
          messages: newMessages,
          waitingForResponse: true,
          streamStatus: ChatStreamStatusEnum.STREAMING,
        },
      },
    };
  });
}

function llmToolCallDelta(
  chatId: string,
  assistantMessageId: string | null,
  chunk: ToolCallDeltaEvent,
) {
  if (!assistantMessageId) {
    return;
  }

  useAIStore.setState((state) => {
    const currDetails = state.chatDetails[chatId];
    const currMessages = currDetails?.messages ?? [];
    const messageIndex = currMessages.findIndex(
      (m) => m.id === assistantMessageId,
    );
    if (messageIndex === -1) {
      return {};
    }

    const message = currMessages[messageIndex];
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
        return {};
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
      ...currMessages.slice(0, messageIndex),
      updatedMessage,
      ...currMessages.slice(messageIndex + 1),
    ];

    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...getDefaultChatDetails(),
          ...(currDetails ?? {}),
          messages: newMessages,
          waitingForResponse: true,
          streamStatus: ChatStreamStatusEnum.STREAMING,
        },
      },
    };
  });
}

function llmToolResult(
  chatId: string,
  assistantMessageId: string | null,
  chunk: ToolResultEvent,
) {
  useAIStore.setState((state) => {
    const currDetails = state.chatDetails[chatId];
    const currMessages = currDetails?.messages ?? [];
    let toolCallName: string | null = null;
    let newMessages = currMessages;

    if (assistantMessageId) {
      const messageIndex = currMessages.findIndex(
        (m) => m.id === assistantMessageId,
      );
      if (messageIndex !== -1) {
        const message = currMessages[messageIndex];
        const content = [...message.content];
        const toolCallBlock = content.find(
          (block) =>
            block?.type === "tool_call" &&
            block.tool_call_id === chunk.tool_call_id,
        );

        toolCallName =
          toolCallBlock && toolCallBlock.type === "tool_call"
            ? toolCallBlock.name
            : null;

        const resultBlock = createLLMToolResultBlock({
          tool_call_id: chunk.tool_call_id,
          name: toolCallName,
          output_text: chunk.output_text ?? null,
          output_json: chunk.output ?? null,
          is_error: chunk.is_error ?? false,
        });

        const updatedMessage = {
          ...message,
          content: [...content, resultBlock],
        };

        newMessages = [
          ...currMessages.slice(0, messageIndex),
          updatedMessage,
          ...currMessages.slice(messageIndex + 1),
        ];
      }
    }

    const nextToolResults = {
      ...(currDetails?.toolResults ?? {}),
      [chunk.tool_call_id]: createToolResult({
        tool_call_id: chunk.tool_call_id,
        name: toolCallName,
        output_text: chunk.output_text ?? null,
        output_json: chunk.output ?? null,
        is_error: chunk.is_error ?? false,
      }),
    };

    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...getDefaultChatDetails(),
          ...(currDetails ?? {}),
          messages: newMessages,
          toolResults: nextToolResults,
          waitingForResponse: true,
          streamStatus: ChatStreamStatusEnum.STREAMING,
        },
      },
    };
  });
}

function llmResponseCompleted(chatId: string) {
  useAIStore.setState((state) => {
    const currDetails = state.chatDetails[chatId];
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...getDefaultChatDetails(),
          ...(currDetails ?? {}),
          waitingForResponse: false,
          streamStatus: ChatStreamStatusEnum.COMPLETED,
        },
      },
    };
  });
}

function streamInto(chatId, streamTarget, content) {
  const { sectionId, before, after, contentToInsert } = streamTarget;

  let currentContentToInsert;
  useProjectState.setState((x) => {
    const sectionType = getSectionType(sectionId, x);
    const sectionVariant = getSectionVariant(sectionId, x);
    // Update current streamed content
    currentContentToInsert = contentToInsert + content;
    const newContent = [before, currentContentToInsert, after]
      .filter(Boolean)
      .join("\n");

    if (sectionType === UITypeNameEnum.CODE) {
      // Reconstruct the text with the updated streamed content in the middle
      sectionVariant.code = newContent;
    } else if (sectionType === UITypeNameEnum.TEXT_BLOCK) {
      sectionVariant.description = newContent;
    }
  });

  // Store the updated streamed content for next time
  useAIStore.setState((state) => {
    const currDetails = state.chatDetails[chatId];
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...getDefaultChatDetails(),
          ...(currDetails ?? {}),
          streamTarget: {
            sectionId,
            before,
            after,
            contentToInsert: currentContentToInsert,
          },
        },
      },
    };
  });
}

/**
 * Start streaming text into a section. Text can be streamed into sections of type CODE and TEXT_BLOCK. After you call this tool, everything you respond with will be redirected and written to this section. For example, if you start writing code into a CODE section, you shouldn't start with '```python' or end with '```' because those are markdown specific things that make sense in a chat context or a TEXT_BLOCK section, but not in a CODE section. If you want to replace code, use the deleteCodeRange tool first. Then use insertAtLine to specify the line number where new code should appear.
 * @SETTA_MCP_TOOL
 * @param {ID} sectionId The id of the section that you want to start writing into.
 * @param {integer} [insertAtLine] Optional line number (1-indexed) to insert at. If omitted, appends to the end.
 */
export function startStreamingInto({ sectionId, insertAtLine, chatId }) {
  // Get the current code
  let currText;
  const sectionType = getSectionType(sectionId);
  switch (sectionType) {
    case UITypeNameEnum.CODE:
      currText = getSectionVariant(sectionId).code;
      break;
    case UITypeNameEnum.TEXT_BLOCK:
      currText = getSectionVariant(sectionId).description;
      break;
    default:
      throw new Error(
        `Cannot write text into a ${sectionType} section. Section must of type CODE or TEXT_BLOCK`,
      );
  }

  const lines = currText.split("\n");
  const totalLines = lines.length;

  // Initialize streaming state
  let beforeLines = "";
  let afterLines = "";

  // Handle insertAtLine if specified
  if (!_.isNil(insertAtLine)) {
    // Convert to 0-indexed for array operations
    const insertIndex = insertAtLine - 1;

    // Validate insertion point
    if (insertAtLine < 1 || (totalLines > 0 && insertAtLine > totalLines + 1)) {
      throw new Error(
        `Invalid insertAtLine: ${insertAtLine}. Valid range is 1 to ${totalLines + 1}.`,
      );
    }

    // Split the code at the insertion point
    beforeLines = lines.slice(0, insertIndex).join("\n");
    afterLines = lines.slice(insertIndex).join("\n");
  } else {
    // If no insertion point, append to the end
    beforeLines = currText;
    afterLines = "";
  }

  useAIStore.setState((state) => {
    const currDetails = state.chatDetails[chatId];
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...getDefaultChatDetails(),
          ...(currDetails ?? {}),
          streamTarget: {
            sectionId,
            before: beforeLines,
            after: afterLines,
            contentToInsert: "",
          },
        },
      },
    };
  });
}

/**
 * Stop streaming text into a section.
 * @SETTA_MCP_TOOL
 * @returns {string} the seciton's text with all the changes applied.
 */
export function stopStreamingInto({ chatId }) {
  const { chatDetails } = useAIStore.getState();
  const chatStreamTarget = chatDetails[chatId]?.streamTarget;
  if (!chatStreamTarget) {
    return "";
  }
  const { sectionId } = chatStreamTarget;
  const code = getSectionVariant(sectionId).code;

  useAIStore.setState((state) => {
    const currDetails = state.chatDetails[chatId];
    return {
      chatDetails: {
        ...state.chatDetails,
        [chatId]: {
          ...getDefaultChatDetails(),
          ...(currDetails ?? {}),
          streamTarget: null,
        },
      },
    };
  });

  return code;
}

/**
 * Delete a range of text from a CODE or TEXT_BLOCK section.
 * @SETTA_MCP_TOOL
 * @param {ID} sectionId The id of the section.
 * @param {integer} [startLine] Optional starting line number (1-indexed). If omitted, starts from the first line.
 * @param {integer} [endLine] Optional ending line number (1-indexed, inclusive). If omitted, ends at the last line.
 * @return {string} A string containing the text with the specified range deleted.
 * @throws {Error} If the provided line numbers are invalid or out of range.
 */
export function deleteTextRange({ sectionId, startLine, endLine }) {
  // Update the state
  let updatedCode;
  useProjectState.setState((x) => {
    const sectionVariant = getSectionVariant(sectionId, x);
    if (_.isNil(startLine) && _.isNil(endLine)) {
      updatedCode = "";
    } else {
      const lines = sectionVariant.code.split("\n");
      const totalLines = lines.length;
      const [start, end] = convertAndValidateLineNumbers(
        startLine,
        endLine,
        totalLines,
      );

      // Delete the specified range by keeping everything before start and after end
      const updatedLines = [...lines.slice(0, start), ...lines.slice(end)];

      // Join the lines back together
      updatedCode = updatedLines.join("\n");
    }
    sectionVariant.code = updatedCode;
  });

  return updatedCode;
}

/**
 * Get the current code that's in a code block.
 * @SETTA_MCP_TOOL
 * @param {ID} sectionId The id of the code block that you want to retrieve code from.
 * @param {integer} [startLine] Optional starting line number (1-indexed). If omitted, starts from the first line.
 * @param {integer} [endLine] Optional ending line number (1-indexed, inclusive). If omitted, ends at the last line.
 * @return {string} A string containing the requested code from the code block.
 * @throws {Error} If the provided line numbers are invalid or out of range.
 */
export function getCurrentCode({ sectionId, startLine, endLine }) {
  const code = getSectionVariant(sectionId).code;

  // If no line parameters are provided, return the entire code
  if (_.isNil(startLine) && _.isNil(endLine)) {
    return code;
  }

  const lines = code.split("\n");
  const [start, end] = convertAndValidateLineNumbers(
    startLine,
    endLine,
    lines.length,
  );

  // Extract and return the requested lines
  return lines.slice(start, end).join("\n");
}

// inputs are 1-indexed line numbers
// outputs are standard 0-indexed indices for array operations
function convertAndValidateLineNumbers(startLine, endLine, totalLines) {
  // Handle empty code case (totalLines could be 0)
  if (totalLines === 0) {
    if (!_.isNil(startLine) || !_.isNil(endLine)) {
      throw new Error(`Cannot specify line numbers for empty code.`);
    }
    return [0, 0]; // Safe values for empty arrays
  }

  // Convert to 0-indexed for array access, and provide defaults
  const start = !_.isNil(startLine) ? startLine - 1 : 0;
  const end = !_.isNil(endLine) ? endLine : totalLines;

  // Validate line numbers
  if (start < 0 || start >= totalLines) {
    throw new Error(
      `Invalid startLine: ${startLine}. Valid range is 1 to ${totalLines}.`,
    );
  }

  if (end < 1 || end > totalLines) {
    throw new Error(
      `Invalid endLine: ${endLine}. Valid range is 1 to ${totalLines}.`,
    );
  }

  if (start > end - 1) {
    throw new Error(
      `startLine (${startLine}) must be less than or equal to endLine (${endLine}).`,
    );
  }

  return [start, end];
}

export function updateUUIDMappingForLLM(idToUUIDForLLM: IDToUUIDForLLM) {
  useAIStore.setState({ idToUUIDForLLM });
}

export async function getUUIDMappingForLLM() {
  const res = await route_get_uuid_mapping_for_llm();
  if (res200(res)) {
    updateUUIDMappingForLLM(res.data);
  }
}
