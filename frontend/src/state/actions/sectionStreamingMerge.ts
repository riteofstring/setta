import {
  getMessageCompletenessScore,
  mergeChatMessages,
} from "state/actions/chatMergeUtils";
import { isSectionStreamActive } from "state/aiStreamingTracker";
import { type ZustandProjectState } from "state/definitions";
import {
  type BaseChatMessageUnion,
  type BaseSectionImplUnion,
  type ProjectStateSingleConfig,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { setEffectiveImplValue } from "./sectionEffectiveImplMutations";
import { getEffectiveImpl } from "./sectionEffectiveImpls";

type ChatSectionImpl = Extract<
  BaseSectionImplUnion,
  { type: SectionTypeEnum.Chat }
>;

export function mergeStreamingChatSections(
  projectState: ProjectStateSingleConfig,
  currentState: ZustandProjectState,
): string[] {
  const mergedSectionIds: string[] = [];
  const incomingVariantMap = projectState.projectConfig.sectionVariantMap;
  const currentVariantMap = currentState.projectConfig.sectionVariantMap;

  for (const [sectionId, variantId] of Object.entries(incomingVariantMap)) {
    const variant = projectState.sectionVariants[variantId];
    if (!variant) {
      continue;
    }
    const incomingCore = projectState.sections[sectionId];
    if (!incomingCore) {
      continue;
    }
    const incomingImpl = projectState.sectionImpls[variant.impl];
    if (!incomingImpl || incomingImpl.type !== SectionTypeEnum.Chat) {
      continue;
    }
    const currentVariantId = currentVariantMap[sectionId];
    if (!currentVariantId) {
      continue;
    }
    const currentVariant = currentState.sectionVariants[currentVariantId];
    if (!currentVariant) {
      continue;
    }
    const currentImpl = currentState.sectionImpls[currentVariant.impl];
    if (!currentImpl || currentImpl.type !== SectionTypeEnum.Chat) {
      continue;
    }
    const currentCore = currentState.sections[sectionId];
    if (!currentCore) {
      continue;
    }
    const incomingChat = getEffectiveImpl(
      incomingImpl,
      incomingCore,
      variant,
    ) as ChatSectionImpl;
    const currentChat = getEffectiveImpl(
      currentImpl,
      currentCore,
      currentVariant,
    ) as ChatSectionImpl;

    const incomingMessages = Array.isArray(incomingChat.messages)
      ? incomingChat.messages
      : [];
    const currentMessages = Array.isArray(currentChat.messages)
      ? currentChat.messages
      : [];
    const incomingToolArgs = incomingChat.toolCallArguments ?? {};
    const currentToolArgs = currentChat.toolCallArguments ?? {};
    const incomingInputText = incomingChat.inputText ?? "";
    const currentInputText = currentChat.inputText ?? "";
    const shouldPreserveStreaming = isSectionStreamActive(sectionId);
    const shouldMergeFast =
      shouldPreserveStreaming ||
      currentMessages.length > incomingMessages.length ||
      Object.keys(currentToolArgs).length >
        Object.keys(incomingToolArgs).length ||
      currentInputText.length > incomingInputText.length;
    const shouldMerge = shouldMergeFast
      ? true
      : hasMoreCompleteChatMessages(currentMessages, incomingMessages);
    if (!shouldMerge) {
      continue;
    }

    const mergedMessages = mergeChatMessages(incomingMessages, currentMessages);
    const mergedToolArgs = {
      ...incomingToolArgs,
      ...currentToolArgs,
    };
    const mergedInputText =
      currentInputText.length > incomingInputText.length
        ? currentInputText
        : incomingInputText;
    const mergedWaitingForResponse = shouldPreserveStreaming
      ? incomingChat.waitingForResponse || currentChat.waitingForResponse
      : incomingChat.waitingForResponse;
    setEffectiveImplValue<"ChatSection">(incomingImpl, incomingCore, variant, {
      messages: mergedMessages,
      toolCallArguments: mergedToolArgs,
      inputText: mergedInputText,
      waitingForResponse: mergedWaitingForResponse,
    });
    mergedSectionIds.push(sectionId);
  }

  return mergedSectionIds;
}

function hasMoreCompleteChatMessages(
  currentMessages: Array<BaseChatMessageUnion>,
  incomingMessages: Array<BaseChatMessageUnion>,
): boolean {
  if (currentMessages.length === 0) {
    return false;
  }
  if (incomingMessages.length === 0) {
    return currentMessages.length > 0;
  }
  const incomingById = new Map<string, BaseChatMessageUnion>();
  for (const message of incomingMessages) {
    incomingById.set(message.id, message);
  }
  for (const message of currentMessages) {
    const incoming = incomingById.get(message.id);
    if (!incoming) {
      return true;
    }
    if (
      getMessageCompletenessScore(message) >
      getMessageCompletenessScore(incoming)
    ) {
      return true;
    }
  }
  return false;
}
