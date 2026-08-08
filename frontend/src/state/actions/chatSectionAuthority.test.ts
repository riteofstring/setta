import {
  markChatStreamActive,
  resetStreamingTracker,
} from "state/aiStreamingTracker";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  ChatRoleEnum,
  createChatSectionImpl,
  createCore,
  createMessageTextContent,
  createProjectConfig,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applyHydratedChatDetailsToSectionState,
  getChatSectionStateFromStore,
} from "./chatSectionAuthority";

const projectConfigId = "project-1";
const sectionId = "section-1";
const variantId = "variant-1";
const implId = "impl-1";
const activeBranchId = "branch-active";
const inactiveBranchId = "branch-inactive";

function createAssistantMessage(id: string, text: string) {
  return {
    id,
    role: ChatRoleEnum.assistant,
    content: [createMessageTextContent({ text })],
    attachments: [],
    tool_calls: null,
  };
}

function seedChatSection() {
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
  const sectionImpl = createChatSectionImpl({
    id: implId,
    chatId: "chat-1",
    inputText: "Base draft",
    messages: [createAssistantMessage("impl-message", "Impl message")],
    toolCallArguments: { impl: "{}" },
    activeBranchId,
    branches: {
      [activeBranchId]: {
        branchFromMessageId: null,
        createdAt: 1,
        parentBranchId: null,
        messages: [createAssistantMessage("branch-message", "Branch message")],
      },
      [inactiveBranchId]: {
        branchFromMessageId: null,
        createdAt: 2,
        parentBranchId: null,
        messages: [
          createAssistantMessage("inactive-message", "Inactive branch message"),
        ],
      },
    },
    managed: true,
    thinking: true,
  });
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({ id: projectConfigId });
    state.sections = { [sectionId]: sectionCore };
    state.sectionVariants = { [variantId]: sectionVariant };
    state.sectionImpls = { [implId]: sectionImpl };
    state.projectConfig.sectionVariantMap = { [sectionId]: variantId };
    state.previewSectionVariantMap = {};
  });
}

describe("chatSectionAuthority", () => {
  beforeEach(() => {
    resetProjectStores();
    resetStreamingTracker();
    seedChatSection();
  });

  afterEach(() => {
    resetProjectStores();
    resetStreamingTracker();
  });

  it("returns a cloned effective chat section state", () => {
    useProjectState.setState((state) => {
      const section = state.sections[sectionId];
      const variant = state.sectionVariants[variantId];
      if (!section || !variant) {
        return;
      }
      section.sharedModifier = {
        inputText: "Shared draft",
      };
      variant.modifier = {
        inputText: "Variant draft",
        messages: [
          createAssistantMessage("variant-message", "Variant message"),
        ],
        toolCallArguments: { variant: "{}" },
      };
    });

    const firstResult = getChatSectionStateFromStore(
      useProjectState.getState(),
      sectionId,
    );
    expect(firstResult).not.toBeNull();
    expect(firstResult).toMatchObject({
      inputText: "Variant draft",
      messages: [createAssistantMessage("variant-message", "Variant message")],
      toolCallArguments: { variant: "{}" },
    });

    firstResult?.messages.push(createAssistantMessage("mutated", "Mutated"));
    firstResult?.toolCallArguments &&
      (firstResult.toolCallArguments.extra = "1");
    if (firstResult?.branches[activeBranchId]) {
      firstResult.branches[activeBranchId].messages = [];
    }

    const secondResult = getChatSectionStateFromStore(
      useProjectState.getState(),
      sectionId,
    );
    expect(secondResult).toMatchObject({
      inputText: "Variant draft",
      messages: [createAssistantMessage("variant-message", "Variant message")],
      toolCallArguments: { variant: "{}" },
    });
    expect(secondResult?.branches[activeBranchId]?.messages).toEqual([
      createAssistantMessage("branch-message", "Branch message"),
    ]);
  });

  it("preserves local overlays during active streaming while syncing the active branch", () => {
    useProjectState.setState((state) => {
      const impl = state.sectionImpls[implId];
      if (!impl || impl.type !== "Chat") {
        return;
      }
      impl.inputText = "Local draft";
      impl.messages = [
        createAssistantMessage("local-message", "Local message"),
      ];
      impl.waitingForResponse = true;
      impl.toolCallArguments = { "local-tool": '{"partial":true' };
    });
    markChatStreamActive(null, sectionId);

    const hydratedState = applyHydratedChatDetailsToSectionState({
      sectionId,
      messages: [createAssistantMessage("server-message", "Backend message")],
      waitingForResponse: false,
      toolCallArguments: { "server-tool": "{}" },
    });

    expect(hydratedState).toEqual({
      messages: [createAssistantMessage("server-message", "Backend message")],
      inputText: "Local draft",
      waitingForResponse: true,
      toolCallArguments: {
        "server-tool": "{}",
        "local-tool": '{"partial":true',
      },
      activeBranchId,
      branches: {
        [activeBranchId]: {
          branchFromMessageId: null,
          createdAt: 1,
          parentBranchId: null,
          messages: [
            createAssistantMessage("server-message", "Backend message"),
          ],
        },
        [inactiveBranchId]: {
          branchFromMessageId: null,
          createdAt: 2,
          parentBranchId: null,
          messages: [
            createAssistantMessage(
              "inactive-message",
              "Inactive branch message",
            ),
          ],
        },
      },
    });

    expect(
      getChatSectionStateFromStore(useProjectState.getState(), sectionId),
    ).toEqual(hydratedState);
  });
});
