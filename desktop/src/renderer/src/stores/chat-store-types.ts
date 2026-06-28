import type {
  ApprovalAnswer,
  ChatCommandDescriptor,
  ChatCommandExecuteResult,
  ChatCommandListResult,
  ChatEvent,
  ChatGoalState,
  ChatInput,
  ChatMessage,
  Conversation,
  ConversationListItem,
  CorruptionSummary,
  Diagnostic,
  BackgroundTerminalOutput,
  BackgroundTerminalProcess,
  ImageAttachment,
  ListConversationsResponse,
  ReasoningEffort,
  RunItemOutput,
  TranscriptBlock,
} from "@generated/backend";
import type { BackendProcessStatus, ChatCommandExecutionOptions } from "@shared/types";

import type { WorkspaceConversationListState } from "./chat-store-conversation-lists";
import type { ConversationDetailState } from "./chat-store-detail-cache";
import type { QueuedRun, RunItemOutputPageState, RunningRun } from "./chat-store-normalization";
import type { ChatOperation } from "./chat-store-operations";
import type { BackgroundTerminalOutputPageState } from "./chat-store-background-terminals";

type ChatStatus = "idle" | "loading" | "ready" | "error";
type CommandListStatus = "idle" | "loading" | "loaded" | "failed";

interface PendingGoalSubmission {
  conversationId: string;
  objective: string;
}

export interface ChatCommandClientOptions {
  pendingGoalObjective?: string;
}

export interface ChatStore {
  activeRun: RunningRun | null;
  applyConversationList: (workspaceId: string, response: ListConversationsResponse) => void;
  applyConversationUpdatedEvent: (workspaceId: string, item: ConversationListItem) => void;
  backgroundTerminalIdsByConversationId: Record<string, string[]>;
  backgroundTerminalOutputIdsByProcessId: Record<string, string[]>;
  backgroundTerminalOutputPagesByProcessId: Record<string, BackgroundTerminalOutputPageState>;
  backgroundTerminalOutputsById: Record<string, BackgroundTerminalOutput>;
  backgroundTerminalsById: Record<string, BackgroundTerminalProcess>;
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
  createImageAttachmentFromBytes: (
    fileName: string,
    dataBase64: string,
  ) => Promise<ImageAttachment>;
  createImageAttachmentsFromPicker: (maxCount: number) => Promise<ImageAttachment[]>;
  editQueuedMessage: (messageId: string, input: ChatInput) => Promise<void>;
  ensureWorkspaceConversationList: (workspaceId: string) => Promise<void>;
  error: string | null;
  goal: ChatGoalState | null;
  hasMoreOlder: boolean;
  handleBackendProcessStatus: (status: BackendProcessStatus) => void;
  handleEvent: (event: ChatEvent) => void;
  lastEventSequence: number;
  lastEventStreamId: string;
  loadOlder: () => Promise<void>;
  loadRunItemOutput: (
    runId: string,
    runItemId: string,
    afterOrdinal?: number,
    limit?: number,
  ) => Promise<void>;
  loadBackgroundTerminalOutput: (
    processId: string,
    afterOrdinal?: number,
    limit?: number,
  ) => Promise<void>;
  loadWorkspace: (workspaceId: string) => Promise<void>;
  refreshBackgroundTerminals: () => Promise<void>;
  syncWorkspaceChat: (workspaceId: string) => Promise<void>;
  killBackgroundTerminal: (processId: string) => Promise<void>;
  killAllBackgroundTerminals: () => Promise<void>;
  markConversationRead: (conversationId: string) => Promise<void>;
  messageIds: string[];
  messages: ChatMessage[];
  messagesById: Record<string, ChatMessage>;
  olderBeforeBlockOrdinal: number;
  operation: ChatOperation;
  pendingGoalSubmission: PendingGoalSubmission | null;
  queuedRuns: QueuedRun[];
  queueMessage: (input: ChatInput) => Promise<void>;
  removeQueuedMessage: (messageId: string) => Promise<void>;
  removingQueuedMessageId: string | null;
  executeCommand: (
    raw: string,
    options?: ChatCommandExecutionOptions,
    clientOptions?: ChatCommandClientOptions,
  ) => Promise<ChatCommandExecuteResult>;
  openCodexModelPicker: () => Promise<ChatCommandExecuteResult>;
  setCodexModel: (modelId: string) => Promise<ChatCommandExecuteResult>;
  setCodexReasoningEffort: (effort: ReasoningEffort) => Promise<ChatCommandExecuteResult>;
  listCommands: () => Promise<ChatCommandListResult | null>;
  resyncActiveConversation: () => Promise<void>;
  createConversation: (title?: string) => Promise<void>;
  createWorkspaceConversation: (workspaceId: string, title?: string) => Promise<void>;
  deleteConversation: (conversationId: string, workspaceId?: string) => Promise<void>;
  runItemOutputIdsByRunItemId: Record<string, string[]>;
  runItemOutputPagesByRunItemId: Record<string, RunItemOutputPageState>;
  runItemOutputs: RunItemOutput[];
  runItemOutputsById: Record<string, RunItemOutput>;
  selectedConversation: Conversation | null;
  selectedConversationIdsByWorkspaceId: Record<string, string | undefined>;
  selectConversation: (conversationId: string, workspaceId?: string) => Promise<void>;
  sendMessage: (input: ChatInput) => Promise<void>;
  sendSteeringImmediately: (input?: ChatInput) => Promise<void>;
  setConversationPinned: (
    conversationId: string,
    pinned: boolean,
    workspaceId?: string,
  ) => Promise<void>;
  status: ChatStatus;
  steerMessage: (input: ChatInput) => Promise<void>;
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
    | "backgroundTerminalIdsByConversationId"
    | "backgroundTerminalOutputIdsByProcessId"
    | "backgroundTerminalOutputPagesByProcessId"
    | "backgroundTerminalOutputsById"
    | "backgroundTerminalsById"
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
    | "pendingGoalSubmission"
    | "queuedRuns"
    | "removingQueuedMessageId"
    | "runItemOutputIdsByRunItemId"
    | "runItemOutputPagesByRunItemId"
    | "runItemOutputs"
    | "runItemOutputsById"
    | "selectedConversation"
    | "selectedConversationIdsByWorkspaceId"
    | "status"
    | "transcriptBlocks"
    | "transcriptBlocksById"
    | "workspaceId"
  >
>;
