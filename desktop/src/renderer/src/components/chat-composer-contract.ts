import type {
  ChatCommandExecuteResult,
  ChatCommandListResult,
  ChatGoalState,
  ChatInput,
  ChatMessage,
  ChatPermissionPresetID,
  ComposerPromptHistoryPage,
  ImageAttachment,
  QueueMessageResult,
  ReasoningEffort,
  SendMessageResult,
  SteerMessageResult,
} from "@generated/backend";
import type { ChatCommandExecutionOptions } from "@shared/types";

type ComposerSessionStatus = "idle" | "loading" | "ready" | "error";
type ComposerCommandListStatus = "idle" | "loading" | "loaded" | "failed";

export interface ComposerSessionViewModel {
  commandListContextKey: string;
  id: string;
  modelLabel: string;
  permissionLabel: string;
  reasoningLabel: string;
  supportsImages: boolean;
  workspaceId: string | null;
}

export interface ComposerViewModel {
  activeRunId: string;
  commandListError: string | null;
  commandListStatus: ComposerCommandListStatus;
  goal: ChatGoalState | null;
  operation: string | null;
  pendingSteeringMessageIds: string[];
  session: ComposerSessionViewModel | null;
  status: ComposerSessionStatus;
}

interface ComposerCommandActions {
  executeCommand: (
    raw: string,
    options?: ChatCommandExecutionOptions,
    clientOptions?: { pendingGoalObjective?: string },
  ) => Promise<ChatCommandExecuteResult>;
  listCommands: () => Promise<ChatCommandListResult | null>;
}

interface ComposerAttachmentActions {
  createImageAttachmentFromBytes: (
    fileName: string,
    dataBase64: string,
  ) => Promise<ImageAttachment>;
  createImageAttachmentsFromPicker: (maxCount: number) => Promise<ImageAttachment[]>;
}

interface ComposerPromptHistoryActions {
  listComposerPromptHistory: (
    beforeOrdinal: number,
    limit: number,
  ) => Promise<ComposerPromptHistoryPage | null>;
}

interface ComposerModelActions {
  openCodexModelPicker: () => Promise<ChatCommandExecuteResult>;
  setCodexModel: (modelId: string) => Promise<ChatCommandExecuteResult>;
  setCodexReasoningEffort: (effort: ReasoningEffort) => Promise<ChatCommandExecuteResult>;
}

export interface ComposerPermissionActions {
  openCodexPermissionPicker: () => Promise<ChatCommandExecuteResult>;
  setCodexPermissionPreset: (
    preset: ChatPermissionPresetID,
    confirmed: boolean,
  ) => Promise<ChatCommandExecuteResult>;
}

export interface ComposerActions {
  attachments?: ComposerAttachmentActions;
  commands?: ComposerCommandActions;
  modelSettings?: ComposerModelActions;
  permissionSettings?: ComposerPermissionActions;
  promptHistory?: ComposerPromptHistoryActions;
  queueMessage?: (input: ChatInput) => Promise<QueueMessageResult | null>;
  retryActiveRunLiveness?: () => Promise<void>;
  sendMessage?: (input: ChatInput) => Promise<SendMessageResult | null>;
  sendSteeringImmediately?: (input?: ChatInput) => Promise<void>;
  steerMessage?: (input: ChatInput) => Promise<SteerMessageResult | null>;
  stopActiveRun?: () => Promise<void>;
}

export interface AcceptedComposerSubmission {
  attachments: ImageAttachment[];
  input: ChatInput;
  userMessage: ChatMessage;
}
