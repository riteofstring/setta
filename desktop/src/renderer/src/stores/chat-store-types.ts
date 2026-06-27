import type {
  ApprovalAnswer,
  ChatCommandDescriptor,
  ChatCommandExecuteResult,
  ChatCommandListResult,
  ChatEvent,
  ChatGoalState,
  ChatMessage,
  Conversation,
  ConversationListItem,
  CorruptionSummary,
  Diagnostic,
  ListConversationsResponse,
  ReasoningEffort,
  RunItem,
  RunItemOutput,
  TranscriptBlock,
} from "@generated/backend";
import type { BackendProcessStatus, ChatCommandExecutionOptions } from "@shared/types";

import type { WorkspaceConversationListState } from "./chat-store-conversation-lists";
import type { ConversationDetailState } from "./chat-store-detail-cache";
import type { QueuedRun, RunItemOutputPageState, RunningRun } from "./chat-store-normalization";
import type { ChatOperation } from "./chat-store-operations";

type ChatStatus = "idle" | "loading" | "ready" | "error";
type CommandListStatus = "idle" | "loading" | "loaded" | "failed";

export interface ChatStore {
  activeRun: RunningRun | null;
  applyConversationList: (workspaceId: string, response: ListConversationsResponse) => void;
  applyConversationUpdatedEvent: (workspaceId: string, item: ConversationListItem) => void;
  clearClosedWorkspaceConversationLists: (activeWorkspaceIds: string[]) => void;
  commandListError: string | null;
  commandListStatus: CommandListStatus;
  commandDescriptorCache: Record<string, ChatCommandDescriptor[] | undefined>;
  conversationDetailsById: Record<string, ConversationDetailState | undefined>;
  conversationListsByWorkspaceId: Record<string, WorkspaceConversationListState | undefined>;
  conversations: ConversationListItem[];
  corruption: CorruptionSummary;
  diagnostics: Diagnostic[];
  editingQueuedMessageId: string | null;
  editQueuedMessage: (messageId: string, prompt: string) => Promise<void>;
  ensureWorkspaceConversationList: (workspaceId: string) => Promise<void>;
  error: string | null;
  goal: ChatGoalState | null;
  hasMoreOlder: boolean;
  handleBackendProcessStatus: (status: BackendProcessStatus) => void;
  handleEvent: (event: ChatEvent) => void;
  lastEventSequence: number;
  lastEventStreamId: string;
  loadOlder: () => Promise<void>;
  loadRunActivity: (runId: string, limit?: number) => Promise<void>;
  loadRunItemOutput: (
    runId: string,
    runItemId: string,
    afterOrdinal?: number,
    limit?: number,
  ) => Promise<void>;
  loadWorkspace: (workspaceId: string) => Promise<void>;
  syncWorkspaceChat: (workspaceId: string) => Promise<void>;
  markConversationRead: (conversationId: string) => Promise<void>;
  messageIds: string[];
  messages: ChatMessage[];
  messagesById: Record<string, ChatMessage>;
  olderBeforeBlockOrdinal: number;
  operation: ChatOperation;
  queuedRuns: QueuedRun[];
  queueMessage: (prompt: string) => Promise<void>;
  removeQueuedMessage: (messageId: string) => Promise<void>;
  removingQueuedMessageId: string | null;
  executeCommand: (
    raw: string,
    options?: ChatCommandExecutionOptions,
  ) => Promise<ChatCommandExecuteResult>;
  openCodexModelPicker: () => Promise<ChatCommandExecuteResult>;
  setCodexModel: (modelId: string) => Promise<ChatCommandExecuteResult>;
  setCodexReasoningEffort: (effort: ReasoningEffort) => Promise<ChatCommandExecuteResult>;
  listCommands: () => Promise<ChatCommandListResult | null>;
  resyncActiveConversation: () => Promise<void>;
  createConversation: (title?: string) => Promise<void>;
  createWorkspaceConversation: (workspaceId: string, title?: string) => Promise<void>;
  deleteConversation: (conversationId: string, workspaceId?: string) => Promise<void>;
  runItemIdsByRunId: Record<string, string[]>;
  runItemOutputIdsByRunItemId: Record<string, string[]>;
  runItemOutputPagesByRunItemId: Record<string, RunItemOutputPageState>;
  runItemOutputs: RunItemOutput[];
  runItemOutputsById: Record<string, RunItemOutput>;
  runItems: RunItem[];
  runItemsById: Record<string, RunItem>;
  selectedConversation: Conversation | null;
  selectedConversationIdsByWorkspaceId: Record<string, string | undefined>;
  selectConversation: (conversationId: string, workspaceId?: string) => Promise<void>;
  sendMessage: (prompt: string) => Promise<void>;
  sendSteeringImmediately: (prompt?: string) => Promise<void>;
  setConversationPinned: (
    conversationId: string,
    pinned: boolean,
    workspaceId?: string,
  ) => Promise<void>;
  status: ChatStatus;
  steerMessage: (prompt: string) => Promise<void>;
  stopActiveRun: () => Promise<void>;
  submitApproval: (
    approvalId: string,
    approved: boolean,
    response: string,
    answers: ApprovalAnswer[],
    cancelled: boolean,
  ) => Promise<void>;
  workspaceId: string | null;
  transcriptBlocks: TranscriptBlock[];
  transcriptBlocksById: Record<string, TranscriptBlock>;
}

export type ChatPatch = Partial<
  Pick<
    ChatStore,
    | "activeRun"
    | "commandListError"
    | "commandListStatus"
    | "commandDescriptorCache"
    | "conversationDetailsById"
    | "conversationListsByWorkspaceId"
    | "conversations"
    | "corruption"
    | "diagnostics"
    | "editingQueuedMessageId"
    | "error"
    | "goal"
    | "hasMoreOlder"
    | "lastEventSequence"
    | "lastEventStreamId"
    | "messageIds"
    | "messages"
    | "messagesById"
    | "olderBeforeBlockOrdinal"
    | "operation"
    | "queuedRuns"
    | "removingQueuedMessageId"
    | "runItemIdsByRunId"
    | "runItemOutputIdsByRunItemId"
    | "runItemOutputPagesByRunItemId"
    | "runItemOutputs"
    | "runItemOutputsById"
    | "runItems"
    | "runItemsById"
    | "selectedConversation"
    | "selectedConversationIdsByWorkspaceId"
    | "status"
    | "transcriptBlocks"
    | "transcriptBlocksById"
    | "workspaceId"
  >
>;
