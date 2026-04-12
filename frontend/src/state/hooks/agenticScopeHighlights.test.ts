import {
  AgenticEdgeKindEnum,
  createAgenticEdge,
  createChatSectionImpl,
  createCodeSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  buildAgenticScopeHighlightMaps,
  resolveActiveChatSectionIds,
} from "./agenticScopeHighlights";

describe("buildAgenticScopeHighlightMaps", () => {
  it("keeps peer-chat targets out of the read highlight map", () => {
    // Linked chats should stay discoverable elsewhere, but not as readable sections.
    const maps = buildAgenticScopeHighlightMaps(
      [
        createAgenticEdge({
          id: "edge-read",
          sourceSectionId: "chat-1",
          targetSectionId: "section-a",
          kind: AgenticEdgeKindEnum.chat_section,
        }),
        createAgenticEdge({
          id: "edge-peer",
          sourceSectionId: "chat-1",
          targetSectionId: "chat-2",
          kind: AgenticEdgeKindEnum.chat_chat,
        }),
      ],
      ["chat-1"],
    );

    expect(maps.readMap).toEqual({ "section-a": true });
    expect(maps.writeMap).toEqual({ "section-a": true });
    expect(maps.readMap["chat-2"]).toBeUndefined();
  });
});

describe("resolveActiveChatSectionIds", () => {
  it("keeps active chats and waiting top-level chats while skipping invalid or duplicate entries", () => {
    const activeChatImplId = "impl-chat-active";
    const waitingChatImplId = "impl-chat-waiting";
    const idleChatImplId = "impl-chat-idle";
    const codeImplId = "impl-code";

    const activeChatVariantId = "variant-chat-active";
    const waitingChatVariantId = "variant-chat-waiting";
    const idleChatVariantId = "variant-chat-idle";
    const codeVariantId = "variant-code";

    const activeChatSectionIds = resolveActiveChatSectionIds({
      activeIds: [
        "section-chat-active",
        "section-code",
        "section-missing-variant",
      ],
      topLevelSectionIds: [
        "section-chat-waiting",
        "section-chat-idle",
        "section-chat-active",
        "section-missing-impl",
      ],
      sectionVariantMap: {
        "section-chat-active": activeChatVariantId,
        "section-chat-waiting": waitingChatVariantId,
        "section-chat-idle": idleChatVariantId,
        "section-code": codeVariantId,
        "section-missing-impl": "variant-missing-impl",
      },
      sectionVariants: {
        [activeChatVariantId]: createVariant({
          id: activeChatVariantId,
          impl: activeChatImplId,
          name: "Active Chat",
          nonPresetImpls: [],
        }),
        [waitingChatVariantId]: createVariant({
          id: waitingChatVariantId,
          impl: waitingChatImplId,
          name: "Waiting Chat",
          nonPresetImpls: [],
        }),
        [idleChatVariantId]: createVariant({
          id: idleChatVariantId,
          impl: idleChatImplId,
          name: "Idle Chat",
          nonPresetImpls: [],
        }),
        [codeVariantId]: createVariant({
          id: codeVariantId,
          impl: codeImplId,
          name: "Code",
          nonPresetImpls: [],
        }),
        "variant-missing-impl": createVariant({
          id: "variant-missing-impl",
          impl: "impl-missing",
          name: "Missing Impl",
          nonPresetImpls: [],
        }),
      },
      sectionImpls: {
        [activeChatImplId]: createChatSectionImpl({
          id: activeChatImplId,
          chatId: "chat-active",
        }),
        [waitingChatImplId]: createChatSectionImpl({
          id: waitingChatImplId,
          chatId: "chat-waiting",
          waitingForResponse: true,
        }),
        [idleChatImplId]: createChatSectionImpl({
          id: idleChatImplId,
          chatId: "chat-idle",
          waitingForResponse: false,
        }),
        [codeImplId]: createCodeSectionImpl({
          id: codeImplId,
        }),
      },
    });

    expect(activeChatSectionIds).toEqual([
      "section-chat-active",
      "section-chat-waiting",
    ]);
  });
});
