import {
  markChatStreamActive,
  resetStreamingTracker,
} from "state/aiStreamingTracker";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  SectionTypeEnum,
  createAssistantChatMessage,
  createChatSectionImpl,
  createCore,
  createMessageTextContent,
  createProjectConfig,
  createUserChatMessage,
  createUserDefaultChatSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyHydratedChatDetailsToSectionState } from "./aiHydrationSectionState";
import { getCurrEffectiveSectionImplOfType } from "./sectionInfos";

describe("aiHydrationSectionState", () => {
  const projectConfigId = "project-1";
  const chatId = "chat-1";
  const sectionId = "section-1";
  const variantId = "variant-1";
  const implId = "impl-1";

  beforeEach(() => {
    resetProjectStores();
    resetStreamingTracker();
  });

  afterEach(() => {
    resetProjectStores();
    resetStreamingTracker();
  });

  it("merges hydrated section state while preserving local draft fields during active streams", () => {
    const sectionCore = createCore({
      id: sectionId,
      name: "Chat",
      variants: [variantId],
      defaultVariant: variantId,
    });
    const sectionVariant = createVariant({
      id: variantId,
      name: "Chat Variant",
      impl: implId,
      nonPresetImpls: [],
    });
    const sectionImpl = createChatSectionImpl(
      createUserDefaultChatSectionImpl({ chatId }),
      {
        id: implId,
        chatId,
        managed: true,
        engineConfigId: "engine-1",
        thinking: true,
        messages: [
          createAssistantChatMessage({
            id: "assistant-local",
            content: [createMessageTextContent({ text: "Local speculative" })],
            attachments: [],
            tool_calls: null,
          }),
        ],
        inputText: "draft prompt",
        waitingForResponse: true,
        toolCallArguments: { local: "1" },
        activeBranchId: null,
        branches: {},
      },
    );
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({
        id: projectConfigId,
        sectionVariantMap: { [sectionId]: variantId },
      });
      state.sections = { [sectionId]: sectionCore };
      state.sectionVariants = { [variantId]: sectionVariant };
      state.sectionImpls = { [implId]: sectionImpl };
      state.previewSectionVariantMap = {};
    });
    markChatStreamActive(chatId, sectionId);

    const nextState = applyHydratedChatDetailsToSectionState({
      sectionId,
      messages: [
        createUserChatMessage({
          id: "user-1",
          content: [createMessageTextContent({ text: "Hello" })],
          attachments: [],
        }),
      ],
      waitingForResponse: false,
      toolCallArguments: { backend: "{}" },
    });

    expect(nextState).toMatchObject({
      inputText: "draft prompt",
      waitingForResponse: true,
      toolCallArguments: {
        local: "1",
        backend: "{}",
      },
    });
    expect(nextState?.messages.map((message) => message.id)).toEqual([
      "user-1",
      "assistant-local",
    ]);
    const effectiveSection = getCurrEffectiveSectionImplOfType(
      useProjectState.getState(),
      sectionId,
      SectionTypeEnum.Chat,
    );
    expect(effectiveSection.inputText).toBe("draft prompt");
    expect(effectiveSection.waitingForResponse).toBe(true);
    expect(effectiveSection.toolCallArguments).toEqual({
      local: "1",
      backend: "{}",
    });
  });
});
