import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  ChatRoleEnum,
  SectionTypeEnum,
  StreamingEventTypeEnum,
  createChatSectionImpl,
  createCore,
  createProjectConfig,
  createUserDefaultChatSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveStreamingChunkContext } from "./aiChatStreamingRouting";

const projectConfigId = "project-1";
const sectionId = "section-1";
const variantId = "variant-1";
const implId = "impl-1";
const chatId = "chat-1";

function seedChatSection(initialChatId: string | null): void {
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
    createUserDefaultChatSectionImpl({ chatId: initialChatId }),
    {
      id: implId,
      chatId: initialChatId,
      managed: true,
      engineConfigId: "engine-1",
      thinking: true,
    },
  );
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({ id: projectConfigId });
    state.sections = { [sectionId]: sectionCore };
    state.sectionVariants = { [variantId]: sectionVariant };
    state.sectionImpls = { [implId]: sectionImpl };
    state.projectConfig.sectionVariantMap = { [sectionId]: variantId };
    state.previewSectionVariantMap = {};
  });
}

describe("chat streaming routing", () => {
  beforeEach(() => {
    resetProjectStores();
    seedChatSection(chatId);
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("ignores response placeholder start chunks", () => {
    const context = resolveStreamingChunkContext({
      chatId,
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_START,
        message: {
          id: "resp_placeholder_1",
          role: ChatRoleEnum.assistant,
          content: [],
          attachments: [],
          tool_calls: null,
        },
      },
    });

    expect(context).toBeNull();
  });

  it("routes section-scoped chunks by chatId when sectionId is missing", () => {
    const context = resolveStreamingChunkContext({
      chatId,
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_STOP,
        message_id: "msg-1",
      },
    });

    expect(context?.sectionId).toBe(sectionId);
    expect(context?.shouldUpdateChatDetails).toBe(true);
    expect(context?.projectConfigId).toBe(projectConfigId);
  });

  it("rebuilds the chatId lookup when the effective chatId changes", () => {
    resolveStreamingChunkContext({
      chatId,
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_STOP,
        message_id: "msg-initial",
      },
    });

    const updatedChatId = "chat-2";
    useProjectState.setState((state) => {
      const impl = state.sectionImpls[implId];
      if (!impl || impl.type !== SectionTypeEnum.Chat) {
        return;
      }
      impl.chatId = updatedChatId;
    });

    const context = resolveStreamingChunkContext({
      chatId: updatedChatId,
      sectionId: null,
      chunk: {
        type: StreamingEventTypeEnum.MESSAGE_STOP,
        message_id: "msg-updated",
      },
    });

    expect(context?.sectionId).toBe(sectionId);
  });
});
