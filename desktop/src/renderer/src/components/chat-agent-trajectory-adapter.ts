import type { ChatInput, ChatMessage, Conversation, Run, RunItemOutput } from "@generated/backend";

import type { RunItemOutputPageState } from "../stores/chat-store";
import type {
  AgentTrajectoryActions,
  AgentTrajectoryCapabilities,
  AgentTrajectoryViewModel,
} from "./agent-trajectory";
import type { LoadRunItemOutput } from "./chat-transcript-activity";
import type { SubmitApproval } from "./chat-transcript-approvals";

const selectedChatCapabilities = {
  loadOlderHistory: true,
  loadRunItemOutput: true,
  queuedMessageActions: true,
  sendSteering: true,
  submitApproval: true,
} satisfies AgentTrajectoryCapabilities;

export interface SelectedConversationAgentTrajectorySource {
  activeRun: Run | null;
  activeRunLiveness: AgentTrajectoryViewModel["activeRunLiveness"];
  editQueuedMessage: (messageId: string, input: ChatInput) => Promise<void>;
  editingQueuedMessageId: string | null;
  hasMoreOlder: boolean;
  loadOlder: () => Promise<void>;
  loadRunItemOutput: LoadRunItemOutput;
  messages: ChatMessage[];
  operation: string | null;
  queuedMessages: ChatMessage[];
  removeQueuedMessage: (messageId: string) => Promise<void>;
  removingQueuedMessageId: string | null;
  runItemOutputIdsByRunItemId: Record<string, string[]>;
  runItemOutputPagesByRunItemId: Record<string, RunItemOutputPageState>;
  runItemOutputsById: Record<string, RunItemOutput>;
  selectedConversation: Conversation | null;
  sendSteeringImmediately: (input?: ChatInput) => Promise<void>;
  submitApproval: SubmitApproval;
  transcriptBlocks: AgentTrajectoryViewModel["blocks"];
}

export function selectedConversationAgentTrajectory(
  source: SelectedConversationAgentTrajectorySource,
): AgentTrajectoryViewModel {
  const conversation = source.selectedConversation;
  if (conversation === null) {
    throw new Error("selected conversation is required for the chat agent trajectory");
  }
  return {
    activeRun: source.activeRun,
    activeRunLiveness: source.activeRunLiveness,
    blocks: source.transcriptBlocks,
    capabilities: selectedChatCapabilities,
    editingQueuedMessageId: source.editingQueuedMessageId,
    hasMoreOlder: source.hasMoreOlder,
    messages: source.messages,
    operation: source.operation,
    queuedMessages: source.queuedMessages,
    removingQueuedMessageId: source.removingQueuedMessageId,
    runItemOutputIdsByRunItemId: source.runItemOutputIdsByRunItemId,
    runItemOutputPagesByRunItemId: source.runItemOutputPagesByRunItemId,
    runItemOutputsById: source.runItemOutputsById,
    scope: {
      conversationId: conversation.id,
      kind: "chatConversation",
      workspaceId: conversation.workspaceId,
    },
  };
}

export function selectedConversationAgentTrajectoryActions(
  source: SelectedConversationAgentTrajectorySource,
): AgentTrajectoryActions {
  return {
    editQueuedMessage: source.editQueuedMessage,
    loadOlder: source.loadOlder,
    loadRunItemOutput: source.loadRunItemOutput,
    removeQueuedMessage: source.removeQueuedMessage,
    sendSteering: source.sendSteeringImmediately,
    submitApproval: source.submitApproval,
  };
}
