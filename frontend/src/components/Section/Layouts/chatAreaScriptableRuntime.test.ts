import { buildChatSlashCommands } from "components/Chat/chatComposerControls";
import {
  type ChatSectionBranch,
  type ChatSectionState,
  ChatRoleEnum,
  createMessageTextContent,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  editScriptableChatMessage,
  executeScriptableChatSlashCommand,
  resetScriptableConversation,
  resumeLatestScriptableBranch,
  stopScriptableChatResponse,
  submitScriptableChatMessage,
  switchScriptableChatBranch,
} from "./chatAreaScriptableRuntime";

function createUserMessage(id: string, text: string) {
  return {
    id,
    role: ChatRoleEnum.user,
    content: [createMessageTextContent({ text })],
    attachments: [],
  };
}

function buildState(
  overrides: Partial<ChatSectionState> = {},
): ChatSectionState {
  const branchA: ChatSectionBranch = {
    messages: [createUserMessage("msg-1", "Hello")],
    createdAt: 10,
    parentBranchId: null,
    branchFromMessageId: null,
  };
  return {
    messages: [...branchA.messages],
    inputText: "draft",
    waitingForResponse: false,
    toolCallArguments: {},
    activeBranchId: "branch-a",
    branches: {
      "branch-a": branchA,
    },
    ...overrides,
  };
}

describe("chatAreaScriptableRuntime", () => {
  it("submits a scriptable chat message by appending to the active branch", async () => {
    const appliedStates: ChatSectionState[] = [];
    const sendActions: unknown[] = [];
    const state = buildState();

    const result = await submitScriptableChatMessage({
      message: " New draft ",
      attachments: [],
      effectiveBranchId: state.activeBranchId,
      effectiveBranches: state.branches,
      effectiveMessages: state.messages,
      effectiveState: state,
      toolCallArguments: { tool: "args" },
      applyChatStateWithAck: async (nextState) => {
        appliedStates.push(nextState);
      },
      sectionId: "section-1",
      dependencies: {
        createMessageId: () => "msg-2",
        getTimestampMs: () => 42,
        emitSendAction: (payload) => {
          sendActions.push(payload);
        },
      },
    });

    expect(result).toBe(true);
    expect(appliedStates).toHaveLength(1);
    expect(appliedStates[0]?.waitingForResponse).toBe(true);
    expect(appliedStates[0]?.inputText).toBe("");
    expect(appliedStates[0]?.branches?.["branch-a"]?.messages).toEqual([
      createUserMessage("msg-1", "Hello"),
      {
        id: "msg-2",
        role: ChatRoleEnum.user,
        content: [createMessageTextContent({ text: " New draft " })],
        attachments: [],
      },
    ]);
    expect(sendActions).toEqual([
      {
        sectionId: "section-1",
        messageId: "msg-2",
        text: " New draft ",
        attachments: [],
        role: ChatRoleEnum.user,
        managed: false,
        timestampMs: 42,
      },
    ]);
  });

  it("resets the scriptable conversation state for a new chat", async () => {
    const appliedStates: ChatSectionState[] = [];

    await resetScriptableConversation({
      applyChatStateWithAck: async (nextState) => {
        appliedStates.push(nextState);
      },
    });

    expect(appliedStates).toEqual([
      {
        messages: [],
        inputText: "",
        waitingForResponse: false,
        toolCallArguments: {},
        activeBranchId: null,
        branches: {},
      },
    ]);
  });

  it("resumes the latest scriptable branch by created time", async () => {
    const appliedStates: ChatSectionState[] = [];
    const branchB: ChatSectionBranch = {
      messages: [createUserMessage("msg-2", "Later branch")],
      createdAt: 20,
      parentBranchId: "branch-a",
      branchFromMessageId: "msg-1",
    };
    const state = buildState({
      waitingForResponse: true,
      branches: {
        "branch-a": buildState().branches["branch-a"] as ChatSectionBranch,
        "branch-b": branchB,
      },
    });

    const resumed = await resumeLatestScriptableBranch({
      effectiveBranches: state.branches,
      effectiveState: state,
      applyChatStateWithAck: async (nextState) => {
        appliedStates.push(nextState);
      },
    });

    expect(resumed).toBe(true);
    expect(appliedStates[0]?.activeBranchId).toBe("branch-b");
    expect(appliedStates[0]?.messages).toEqual(branchB.messages);
    expect(appliedStates[0]?.waitingForResponse).toBe(false);
    expect(appliedStates[0]?.inputText).toBe("");
  });

  it("switches the active scriptable branch when a different branch is selected", async () => {
    const appliedStates: ChatSectionState[] = [];
    const branchB: ChatSectionBranch = {
      messages: [createUserMessage("msg-3", "Branch B")],
      createdAt: 20,
      parentBranchId: "branch-a",
      branchFromMessageId: "msg-1",
    };
    const state = buildState({
      branches: {
        "branch-a": buildState().branches["branch-a"] as ChatSectionBranch,
        "branch-b": branchB,
      },
    });

    await switchScriptableChatBranch({
      nextBranchId: "branch-b",
      effectiveBranchId: "branch-a",
      effectiveBranches: state.branches,
      effectiveState: state,
      applyChatStateWithAck: async (nextState) => {
        appliedStates.push(nextState);
      },
    });

    expect(appliedStates).toHaveLength(1);
    expect(appliedStates[0]?.activeBranchId).toBe("branch-b");
    expect(appliedStates[0]?.messages).toEqual(branchB.messages);
  });

  it("edits a message by creating a new scriptable branch", async () => {
    const appliedStates: ChatSectionState[] = [];
    const sendActions: unknown[] = [];
    const assistantMessage = {
      id: "msg-2",
      role: ChatRoleEnum.assistant,
      content: [createMessageTextContent({ text: "Reply" })],
      attachments: [],
    };
    const branchA: ChatSectionBranch = {
      messages: [createUserMessage("msg-1", "Hello"), assistantMessage],
      createdAt: 10,
      parentBranchId: null,
      branchFromMessageId: null,
    };
    const state = buildState({
      messages: branchA.messages,
      branches: {
        "branch-a": branchA,
      },
    });

    const edited = await editScriptableChatMessage({
      messageId: "msg-1",
      text: "Updated hello",
      attachments: [],
      waitingForResponse: false,
      effectiveState: state,
      toolCallArguments: { tool: "args" },
      applyChatStateWithAck: async (nextState) => {
        appliedStates.push(nextState);
      },
      sectionId: "section-1",
      dependencies: {
        getTimestampMs: () => 77,
        emitSendAction: (payload) => {
          sendActions.push(payload);
        },
      },
    });

    expect(edited).toBe(true);
    expect(appliedStates).toHaveLength(1);
    const nextState = appliedStates[0];
    expect(nextState?.activeBranchId).not.toBe("branch-a");
    expect(nextState?.waitingForResponse).toBe(true);
    expect(nextState?.inputText).toBe("");
    expect(nextState?.messages).toEqual([
      createUserMessage("msg-1", "Updated hello"),
    ]);
    expect(
      nextState?.branches?.[nextState.activeBranchId as string]?.parentBranchId,
    ).toBe("branch-a");
    expect(sendActions).toEqual([
      {
        sectionId: "section-1",
        messageId: "msg-1",
        text: "Updated hello",
        attachments: [],
        role: ChatRoleEnum.user,
        managed: false,
        timestampMs: 77,
      },
    ]);
  });

  it("stops a scriptable chat response and clears the waiting state", async () => {
    const appliedStates: ChatSectionState[] = [];
    const stopActions: unknown[] = [];
    const state = buildState({
      waitingForResponse: true,
      inputText: null,
    });

    await stopScriptableChatResponse({
      effectiveMessages: state.messages,
      effectiveState: state,
      toolCallArguments: { tool: "args" },
      applyChatStateWithAck: async (nextState) => {
        appliedStates.push(nextState);
      },
      sectionId: "section-1",
      dependencies: {
        getTimestampMs: () => 88,
        emitStopAction: (payload) => {
          stopActions.push(payload);
        },
      },
    });

    expect(appliedStates).toEqual([
      {
        ...state,
        inputText: "",
        waitingForResponse: false,
        toolCallArguments: { tool: "args" },
      },
    ]);
    expect(stopActions).toEqual([
      {
        sectionId: "section-1",
        managed: false,
        timestampMs: 88,
      },
    ]);
  });

  it("handles scriptable chat slash commands through the extracted helper", async () => {
    const slashCommands = buildChatSlashCommands({
      model: false,
      permissions: false,
      search: false,
    });
    let startedNewChat = 0;

    const helpResult = await executeScriptableChatSlashCommand({
      command: { action: "help", raw: "/help" },
      slashCommands,
      onStartNewChat: async () => {
        startedNewChat += 1;
      },
      onResumeLatestChat: async () => true,
    });
    const resumeResult = await executeScriptableChatSlashCommand({
      command: { action: "resume", raw: "/resume" },
      slashCommands,
      onStartNewChat: async () => {
        startedNewChat += 1;
      },
      onResumeLatestChat: async () => false,
    });
    const newResult = await executeScriptableChatSlashCommand({
      command: { action: "new", raw: "/new" },
      slashCommands,
      onStartNewChat: async () => {
        startedNewChat += 1;
      },
      onResumeLatestChat: async () => true,
    });

    expect(helpResult).toEqual({
      feedback: expect.stringContaining("/help"),
    });
    expect(resumeResult).toEqual({
      feedback: "No previous branch found to resume.",
      keepInput: true,
    });
    expect(newResult).toEqual({
      feedback: "Started a new scriptable chat.",
    });
    expect(startedNewChat).toBe(1);
  });
});
