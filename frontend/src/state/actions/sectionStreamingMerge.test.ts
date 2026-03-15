import { describe, expect, it } from "vitest";

import { type ZustandProjectState } from "state/definitions";
import {
  createAssistantChatMessage,
  createChatSectionImpl,
  createCore,
  createMessageTextContent,
  createProjectConfig,
  createProjectStateSingleConfig,
  createSingletonSections,
  createUserDefaultChatSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { getEffectiveImpl } from "./sectionEffectiveImplCore";
import { mergeStreamingChatSections } from "./sectionStreamingMerge";

function buildChatState(messageText: string): {
  currentState: ZustandProjectState;
  incomingState: ReturnType<typeof createProjectStateSingleConfig>;
} {
  const sectionId = "chat-section";
  const variantId = "chat-variant";
  const currentImplId = "current-chat-impl";
  const incomingImplId = "incoming-chat-impl";
  const message = createAssistantChatMessage({
    id: "assistant-message",
    content: [createMessageTextContent({ text: messageText })],
  });

  const currentState = {
    projectConfig: createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: variantId },
    }),
    sections: {
      [sectionId]: createCore({
        id: sectionId,
        variants: [variantId],
        defaultVariant: variantId,
      }),
    },
    sectionImpls: {
      [currentImplId]: createChatSectionImpl(
        createUserDefaultChatSectionImpl(),
        {
          id: currentImplId,
          chatId: "chat-1",
          managed: true,
          messages: [message],
          inputText: "current draft",
        },
      ),
    },
    sectionVariants: {
      [variantId]: createVariant({
        id: variantId,
        impl: currentImplId,
        nonPresetImpls: [],
      }),
    },
    codeObjs: {},
    codeObjImpls: {},
    codeObjVariants: {},
    artifactGroups: {},
    singletonSections: createSingletonSections(),
    parentSectionMap: { [sectionId]: null },
    shownParamIds: {},
    previewSectionVariantMap: {},
    requiredDecodedImages: [],
  } as ZustandProjectState;

  const incomingState = createProjectStateSingleConfig({
    projectConfig: createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: variantId },
    }),
    sections: {
      [sectionId]: createCore({
        id: sectionId,
        variants: [variantId],
        defaultVariant: variantId,
      }),
    },
    sectionImpls: {
      [incomingImplId]: createChatSectionImpl(
        createUserDefaultChatSectionImpl(),
        {
          id: incomingImplId,
          chatId: "chat-1",
          managed: true,
          messages: [
            createAssistantChatMessage({
              id: "assistant-message",
              content: [createMessageTextContent({ text: "Hi" })],
            }),
          ],
          inputText: "incoming",
        },
      ),
    },
    sectionVariants: {
      [variantId]: createVariant({
        id: variantId,
        impl: incomingImplId,
        nonPresetImpls: [],
      }),
    },
    parentSectionMap: { [sectionId]: null },
    shownParamIds: {},
    singletonSections: createSingletonSections(),
    requiredDecodedImages: [],
  });

  return { currentState, incomingState };
}

describe("mergeStreamingChatSections", () => {
  it("keeps the more complete local chat message and input text", () => {
    const { currentState, incomingState } = buildChatState("Hello there");

    expect(mergeStreamingChatSections(incomingState, currentState)).toEqual([
      "chat-section",
    ]);

    const mergedImpl = getEffectiveImpl(
      incomingState.sectionImpls["incoming-chat-impl"],
      incomingState.sections["chat-section"],
      incomingState.sectionVariants["chat-variant"],
    );
    if (mergedImpl.type !== "Chat") {
      throw new Error("Expected chat section impl.");
    }

    expect(mergedImpl.messages[0]?.content?.[0]).toEqual(
      createMessageTextContent({ text: "Hello there" }),
    );
    expect(mergedImpl.inputText).toBe("current draft");
  });
});
