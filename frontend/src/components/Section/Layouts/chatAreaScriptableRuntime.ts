import {
  type ChatSlashCommand,
  type ChatSlashCommandResult,
} from "components/Chat/ChatInput";
import {
  formatSlashCommandHelp,
  type ChatSlashCommandDefinition,
} from "components/Chat/chatComposerControls";
import { buildBranchFromEdit } from "state/actions/chatBranches";
import {
  ChatRoleEnum,
  createMessageTextContent,
  type ChatFileAttachment,
  type ChatSectionBranch,
  type ChatSectionState,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import {
  emitChatSendAction,
  emitChatStopAction,
} from "./chatAreaRealtimeActions";

type ApplyScriptableChatState = (
  nextState: ChatSectionState,
) => Promise<unknown> | unknown | null;

type ScriptableRuntimeDependencies = {
  createMessageId?: () => string;
  getTimestampMs?: () => number;
  emitSendAction?: typeof emitChatSendAction;
  emitStopAction?: typeof emitChatStopAction;
};

type ScriptableBranchMap = Record<string, ChatSectionBranch>;

async function awaitAppliedChatState(
  pendingResult: ReturnType<ApplyScriptableChatState>,
) {
  if (!pendingResult) {
    return;
  }
  await pendingResult;
}

function buildUserMessageContent(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }
  return [createMessageTextContent({ text })];
}

export async function submitScriptableChatMessage({
  message,
  attachments,
  effectiveBranchId,
  effectiveBranches,
  effectiveMessages,
  effectiveState,
  toolCallArguments,
  applyChatStateWithAck,
  sectionId,
  dependencies = {},
}: {
  message: string;
  attachments: ChatFileAttachment[];
  effectiveBranchId: string | null;
  effectiveBranches: ScriptableBranchMap;
  effectiveMessages: ChatSectionState["messages"];
  effectiveState: ChatSectionState;
  toolCallArguments: Record<string, string>;
  applyChatStateWithAck: ApplyScriptableChatState;
  sectionId: string;
  dependencies?: ScriptableRuntimeDependencies;
}) {
  const trimmed = message.trim();
  if (!trimmed && attachments.length === 0) {
    return false;
  }
  if (!effectiveBranchId) {
    return false;
  }
  const createMessageId = dependencies.createMessageId ?? createNewId;
  const getTimestampMs = dependencies.getTimestampMs ?? Date.now;
  const emitSendAction = dependencies.emitSendAction ?? emitChatSendAction;
  const messageId = createMessageId();
  const timestampMs = getTimestampMs();
  const newMessage = {
    id: messageId,
    role: ChatRoleEnum.user,
    content: buildUserMessageContent(message),
    attachments,
  };
  const currentBranch = effectiveBranches[effectiveBranchId];
  const baseMessages = currentBranch?.messages ?? effectiveMessages;
  const nextMessages = [...baseMessages, newMessage];
  const nextBranches = currentBranch
    ? {
        ...effectiveBranches,
        [effectiveBranchId]: {
          ...currentBranch,
          messages: nextMessages,
        },
      }
    : effectiveBranches;
  const nextState: ChatSectionState = {
    ...effectiveState,
    messages: nextMessages,
    inputText: "",
    waitingForResponse: true,
    toolCallArguments,
    branches: nextBranches,
  };
  await awaitAppliedChatState(applyChatStateWithAck(nextState));
  emitSendAction({
    sectionId,
    messageId,
    text: message,
    attachments,
    role: ChatRoleEnum.user,
    managed: false,
    timestampMs,
  });
  return true;
}

export async function stopScriptableChatResponse({
  effectiveMessages,
  effectiveState,
  toolCallArguments,
  applyChatStateWithAck,
  sectionId,
  dependencies = {},
}: {
  effectiveMessages: ChatSectionState["messages"];
  effectiveState: ChatSectionState;
  toolCallArguments: Record<string, string>;
  applyChatStateWithAck: ApplyScriptableChatState;
  sectionId: string;
  dependencies?: ScriptableRuntimeDependencies;
}) {
  const getTimestampMs = dependencies.getTimestampMs ?? Date.now;
  const emitStopAction = dependencies.emitStopAction ?? emitChatStopAction;
  const nextState: ChatSectionState = {
    ...effectiveState,
    messages: effectiveMessages,
    inputText: effectiveState.inputText ?? "",
    waitingForResponse: false,
    toolCallArguments,
  };
  await awaitAppliedChatState(applyChatStateWithAck(nextState));
  emitStopAction({
    sectionId,
    managed: false,
    timestampMs: getTimestampMs(),
  });
}

export async function resetScriptableConversation({
  applyChatStateWithAck,
}: {
  applyChatStateWithAck: ApplyScriptableChatState;
}) {
  const nextState: ChatSectionState = {
    messages: [],
    inputText: "",
    waitingForResponse: false,
    toolCallArguments: {},
    activeBranchId: null,
    branches: {},
  };
  await awaitAppliedChatState(applyChatStateWithAck(nextState));
}

export async function resumeLatestScriptableBranch({
  effectiveBranches,
  effectiveState,
  applyChatStateWithAck,
}: {
  effectiveBranches: ScriptableBranchMap;
  effectiveState: ChatSectionState;
  applyChatStateWithAck: ApplyScriptableChatState;
}) {
  const latestBranch = Object.entries(effectiveBranches)
    .sort((left, right) => (right[1].createdAt ?? 0) - (left[1].createdAt ?? 0))
    .at(0);
  const branchId = latestBranch?.[0] ?? null;
  if (!branchId) {
    return false;
  }
  const nextBranch = effectiveBranches[branchId];
  if (!nextBranch) {
    return false;
  }
  const nextState: ChatSectionState = {
    ...effectiveState,
    activeBranchId: branchId,
    messages: [...(nextBranch.messages ?? [])],
    waitingForResponse: false,
    inputText: "",
  };
  await awaitAppliedChatState(applyChatStateWithAck(nextState));
  return true;
}

export async function switchScriptableChatBranch({
  nextBranchId,
  effectiveBranchId,
  effectiveBranches,
  effectiveState,
  applyChatStateWithAck,
}: {
  nextBranchId: string;
  effectiveBranchId: string | null;
  effectiveBranches: ScriptableBranchMap;
  effectiveState: ChatSectionState;
  applyChatStateWithAck: ApplyScriptableChatState;
}) {
  if (!nextBranchId || nextBranchId === effectiveBranchId) {
    return;
  }
  const nextBranch = effectiveBranches[nextBranchId];
  if (!nextBranch) {
    return;
  }
  const nextState: ChatSectionState = {
    ...effectiveState,
    activeBranchId: nextBranchId,
    messages: [...(nextBranch.messages ?? [])],
  };
  await awaitAppliedChatState(applyChatStateWithAck(nextState));
}

export async function editScriptableChatMessage({
  messageId,
  text,
  attachments,
  waitingForResponse,
  effectiveState,
  toolCallArguments,
  applyChatStateWithAck,
  sectionId,
  dependencies = {},
}: {
  messageId: string;
  text: string;
  attachments: ChatFileAttachment[];
  waitingForResponse: boolean;
  effectiveState: ChatSectionState;
  toolCallArguments: Record<string, string>;
  applyChatStateWithAck: ApplyScriptableChatState;
  sectionId: string;
  dependencies?: ScriptableRuntimeDependencies;
}) {
  if (waitingForResponse) {
    return false;
  }
  const trimmed = text.trim();
  if (!trimmed && attachments.length === 0) {
    return false;
  }
  const getTimestampMs = dependencies.getTimestampMs ?? Date.now;
  const emitSendAction = dependencies.emitSendAction ?? emitChatSendAction;
  const editedMessage = {
    id: messageId,
    role: ChatRoleEnum.user,
    content: buildUserMessageContent(text),
    attachments,
  };
  const result = buildBranchFromEdit({
    state: effectiveState,
    editedMessage,
    branchFromMessageId: messageId,
  });
  if (!result) {
    return false;
  }
  const nextState: ChatSectionState = {
    ...result.nextState,
    inputText: "",
    waitingForResponse: true,
    toolCallArguments,
  };
  await awaitAppliedChatState(applyChatStateWithAck(nextState));
  emitSendAction({
    sectionId,
    messageId,
    text,
    attachments,
    role: ChatRoleEnum.user,
    managed: false,
    timestampMs: getTimestampMs(),
  });
  return true;
}

export async function executeScriptableChatSlashCommand({
  command,
  slashCommands,
  onStartNewChat,
  onResumeLatestChat,
}: {
  command: ChatSlashCommand;
  slashCommands: ChatSlashCommandDefinition[];
  onStartNewChat: () => Promise<void>;
  onResumeLatestChat: () => Promise<boolean>;
}): Promise<ChatSlashCommandResult> {
  if (command.action === "new") {
    await onStartNewChat();
    return { feedback: "Started a new scriptable chat." };
  }
  if (command.action === "resume") {
    const resumed = await onResumeLatestChat();
    return resumed
      ? { feedback: "Resumed the latest branch." }
      : {
          feedback: "No previous branch found to resume.",
          keepInput: true,
        };
  }
  if (command.action === "help") {
    return {
      feedback: formatSlashCommandHelp(slashCommands),
    };
  }
  return false;
}
