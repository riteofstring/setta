import { renderToStaticMarkup } from "react-dom/server";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  BaseChatMessageUnion,
  ChatRoleEnum,
  SectionTypeEnum,
  ToolCall,
  createChatSectionImpl,
  createCore,
  createMessageTextContent,
  createUserDefaultChatSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChatMessageList } from "./ChatMessages";

const TOOL_CALL_ID = "tool-call-1";
const SUB_AGENT_SECTION_ID = "section-child";
const SUB_AGENT_VARIANT_ID = "variant-child";
const SUB_AGENT_IMPL_ID = "impl-child";

function renderMessages(messages: Array<BaseChatMessageUnion>) {
  return renderToStaticMarkup(
    <ChatMessageList
      messages={messages}
      waitingForResponse={false}
      toolCallArguments={{}}
    />,
  );
}

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}) {
  if (!store.getInitialState) {
    return;
  }
  const initial = store.getInitialState();
  Object.assign(initial, store.getState());
}

function buildToolCall(): ToolCall {
  return {
    id: TOOL_CALL_ID,
    type: "function",
    function: {
      name: "task",
      arguments: {
        query: "Summarize logs",
      },
    },
  };
}

function seedSubAgentSection(label: string, toolCall: ToolCall) {
  const sectionCore = createCore({
    id: SUB_AGENT_SECTION_ID,
    name: `Sub-agent - ${label}`,
    variants: [SUB_AGENT_VARIANT_ID],
    defaultVariant: SUB_AGENT_VARIANT_ID,
  });
  const sectionVariant = createVariant({
    id: SUB_AGENT_VARIANT_ID,
    name: `${label} variant`,
    impl: SUB_AGENT_IMPL_ID,
    nonPresetImpls: [],
  });
  const systemMessage: BaseChatMessageUnion = {
    id: "sub-system",
    role: ChatRoleEnum.system,
    content: [createMessageTextContent({ text: `Sub-agent: ${label}` })],
    attachments: [],
  };
  const assistantMessage: BaseChatMessageUnion = {
    id: "sub-assistant",
    role: ChatRoleEnum.assistant,
    content: [],
    attachments: [],
    tool_calls: [toolCall],
  };
  const sectionImpl = createChatSectionImpl(
    createUserDefaultChatSectionImpl({ chatId: null }),
    {
      id: SUB_AGENT_IMPL_ID,
      type: SectionTypeEnum.Chat,
      messages: [systemMessage, assistantMessage],
      waitingForResponse: true,
    },
  );
  useProjectState.setState((state) => {
    state.sections = {
      ...state.sections,
      [SUB_AGENT_SECTION_ID]: sectionCore,
    };
    state.sectionVariants = {
      ...state.sectionVariants,
      [SUB_AGENT_VARIANT_ID]: sectionVariant,
    };
    state.sectionImpls = {
      ...state.sectionImpls,
      [SUB_AGENT_IMPL_ID]: sectionImpl,
    };
    state.projectConfig.sectionVariantMap = {
      ...state.projectConfig.sectionVariantMap,
      [SUB_AGENT_SECTION_ID]: SUB_AGENT_VARIANT_ID,
    };
  });
  syncStoreInitialState(useProjectState);
}

describe("ChatMessageList sub-agent rendering", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("renders sub-agent details for tool calls", () => {
    const toolCall = buildToolCall();
    seedSubAgentSection("Summarize logs", toolCall);
    const parentMessage: BaseChatMessageUnion = {
      id: "parent-message",
      role: ChatRoleEnum.assistant,
      content: [createMessageTextContent({ text: "Starting task" })],
      attachments: [],
      tool_calls: [toolCall],
    };

    const markup = renderMessages([parentMessage]);

    expect(markup).toContain("Sub-agent");
    expect(markup).toContain("Summarize logs");
  });

  it("adds nodrag to chat bubbles for text selection", () => {
    const assistantMessage: BaseChatMessageUnion = {
      id: "assistant-message",
      role: ChatRoleEnum.assistant,
      content: [createMessageTextContent({ text: "Hello there" })],
      attachments: [],
      tool_calls: null,
    };
    const userMessage: BaseChatMessageUnion = {
      id: "user-message",
      role: ChatRoleEnum.user,
      content: [createMessageTextContent({ text: "Hi" })],
      attachments: [],
    };

    const markup = renderMessages([assistantMessage, userMessage]);

    expect(markup).toContain("nodrag flex min-h-[25px]");
    expect(markup).toContain("nodrag flex w-fit max-w");
    expect(markup).toContain("select-text");
  });
});
