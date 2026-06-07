import type { IpcMain, IpcMainInvokeEvent, IpcRenderer } from "electron";

import type {
  AppearancePresetList,
  AppearanceSettings,
  BackendHealth,
  CancelCodexLoginRequest,
  ChatCommandExecuteResult,
  ChatCommandListResult,
  CodexAccountState,
  Conversation,
  ConversationListItem,
  CreateTerminalProfileRequest,
  DeleteTerminalProfileRequest,
  DeleteWorkflowDefinitionResponse,
  GetActiveRunResponse,
  ImmediateSteeringResult,
  ListConversationsResponse,
  ListWorkflowDefinitionsResponse,
  LogoutCodexAccountRequest,
  MessagePage,
  OpenWorkspaceResponse,
  QueueEditResult,
  QueueMessageResult,
  QueueRemoveResult,
  ReadWorkflowGraphProjectionResponse,
  ReasoningEffort,
  RefreshCodexAccountRequest,
  ResizeTerminalRequest,
  Run,
  RunActivityPage,
  RunItemOutputPage,
  SendMessageResult,
  SelectDefaultTerminalProfileRequest,
  StartCodexLoginRequest,
  StartCodexLoginResponse,
  SteerMessageResult,
  SubmitApprovalRequest,
  SubmitWorkflowApprovalRequest,
  TerminalInputRequest,
  TerminalInputResponse,
  TerminalProfileList,
  TerminalSessionResponse,
  UpdateAppearanceSettingsRequest,
  UpdateTerminalProfileRequest,
  WorkflowDefinition,
  WorkflowExecution,
  WorkflowExecutionEventPage,
  WorkflowGraph,
  WorkflowValidationResult,
  WorkspaceSession,
} from "@generated/backend";
import type {
  InstalledEditorApp,
  NiriBrowserViewStats,
  RuntimeVersions,
  WorkspaceGitInfo,
} from "./types";

export const ipcChannels = {
  appInstalledEditors: "app:installed-editors",
  appOpenExternalUrl: "app:open-external-url",
  appOpenWorkspaceInEditor: "app:open-workspace-in-editor",
  appVersions: "app:versions",
  appWorkspaceGitInfo: "app:workspace-git-info",
  appearancePresets: "appearance:presets",
  appearanceRead: "appearance:read",
  appearanceUpdate: "appearance:update",
  backendHealth: "backend:health",
  chatActiveRun: "chat:active-run",
  chatCancelRun: "chat:cancel-run",
  chatCreateConversation: "chat:create-conversation",
  chatEditQueuedMessage: "chat:edit-queued-message",
  chatExecuteCommand: "chat:execute-command",
  chatListConversations: "chat:list-conversations",
  chatListCommands: "chat:list-commands",
  chatMarkConversationRead: "chat:mark-conversation-read",
  chatMessagePage: "chat:message-page",
  chatQueueMessage: "chat:queue-message",
  chatRemoveQueuedMessage: "chat:remove-queued-message",
  chatRunActivity: "chat:run-activity",
  chatRunItemOutput: "chat:run-item-output",
  chatSendMessage: "chat:send-message",
  chatSendSteeringImmediately: "chat:send-steering-immediately",
  chatSetCodexModel: "chat:set-codex-model",
  chatSetCodexReasoningEffort: "chat:set-codex-reasoning-effort",
  chatSteerMessage: "chat:steer-message",
  chatSubmitApproval: "chat:submit-approval",
  codexAccountCancelLogin: "codex-account:cancel-login",
  codexAccountLogout: "codex-account:logout",
  codexAccountRead: "codex-account:read",
  codexAccountRefresh: "codex-account:refresh",
  codexAccountStartLogin: "codex-account:start-login",
  niriBrowserViewStats: "niri:browser-view-stats",
  niriBrowserViewsTeardown: "niri:browser-views-teardown",
  terminalAttach: "terminal:attach",
  terminalClose: "terminal:close",
  terminalCreate: "terminal:create",
  terminalCreateProfile: "terminal:create-profile",
  terminalDeleteProfile: "terminal:delete-profile",
  terminalInput: "terminal:input",
  terminalListProfiles: "terminal:list-profiles",
  terminalResize: "terminal:resize",
  terminalSelectDefaultProfile: "terminal:select-default-profile",
  terminalUpdateProfile: "terminal:update-profile",
  workflowCancelExecution: "workflow:cancel-execution",
  workflowCreateDefinition: "workflow:create-definition",
  workflowDeleteDefinition: "workflow:delete-definition",
  workflowExecutionEvents: "workflow:execution-events",
  workflowGraphProjection: "workflow:graph-projection",
  workflowListDefinitions: "workflow:list-definitions",
  workflowReadDefinition: "workflow:read-definition",
  workflowReadExecution: "workflow:read-execution",
  workflowStartExecution: "workflow:start-execution",
  workflowSubmitApproval: "workflow:submit-approval",
  workflowUpdateDefinition: "workflow:update-definition",
  workflowValidateDefinition: "workflow:validate-definition",
  workspaceClose: "workspace:close",
  workspaceOpenLocalFolder: "workspace:open-local-folder",
  workspaceOpenPath: "workspace:open-path",
  workspaceRemoveRecent: "workspace:remove-recent",
  workspaceReorder: "workspace:reorder",
  workspaceSelect: "workspace:select",
  workspaceSession: "workspace:session",
} as const;

export const ipcMessages = {
  niriBrowserViewBatch: "niri:browser-view-batch",
} as const;

export const ipcEvents = {
  backendEventStreamStatus: "backend:event-stream-status",
  backendProcessStatus: "backend:process-status",
  backendUnexpectedExit: "backend:unexpected-exit",
  chatEvent: "chat:event",
  niriBrowserViewKey: "niri:browser-view-key",
  terminalEvent: "terminal:event",
  workflowEvent: "workflow:event",
} as const;

interface IpcContract {
  appInstalledEditors: {
    args: [];
    result: InstalledEditorApp[];
  };
  appOpenExternalUrl: {
    args: [url: string];
    result: void;
  };
  appOpenWorkspaceInEditor: {
    args: [editorId: string, rootPath: string];
    result: void;
  };
  appVersions: {
    args: [];
    result: RuntimeVersions;
  };
  appWorkspaceGitInfo: {
    args: [rootPath: string];
    result: WorkspaceGitInfo;
  };
  appearanceRead: {
    args: [];
    result: AppearanceSettings;
  };
  appearancePresets: {
    args: [];
    result: AppearancePresetList;
  };
  appearanceUpdate: {
    args: [request: UpdateAppearanceSettingsRequest];
    result: AppearanceSettings;
  };
  backendHealth: {
    args: [];
    result: BackendHealth;
  };
  chatActiveRun: {
    args: [workspaceId: string, conversationId: string];
    result: GetActiveRunResponse;
  };
  chatCancelRun: {
    args: [workspaceId: string, conversationId: string];
    result: Run;
  };
  chatCreateConversation: {
    args: [workspaceId: string, title: string];
    result: Conversation;
  };
  chatEditQueuedMessage: {
    args: [workspaceId: string, conversationId: string, messageId: string, prompt: string];
    result: QueueEditResult;
  };
  chatExecuteCommand: {
    args: [
      workspaceId: string,
      conversationId: string,
      raw: string,
      confirmGoalReplacement: boolean,
    ];
    result: ChatCommandExecuteResult;
  };
  chatSetCodexModel: {
    args: [workspaceId: string, conversationId: string, modelId: string];
    result: ChatCommandExecuteResult;
  };
  chatSetCodexReasoningEffort: {
    args: [workspaceId: string, conversationId: string, effort: ReasoningEffort];
    result: ChatCommandExecuteResult;
  };
  chatListConversations: {
    args: [workspaceId: string];
    result: ListConversationsResponse;
  };
  chatListCommands: {
    args: [workspaceId: string, conversationId: string];
    result: ChatCommandListResult;
  };
  chatMarkConversationRead: {
    args: [workspaceId: string, conversationId: string];
    result: ConversationListItem;
  };
  chatMessagePage: {
    args: [workspaceId: string, conversationId: string, beforeOrdinal: number, limit: number];
    result: MessagePage;
  };
  chatQueueMessage: {
    args: [workspaceId: string, conversationId: string, prompt: string];
    result: QueueMessageResult;
  };
  chatRemoveQueuedMessage: {
    args: [workspaceId: string, conversationId: string, messageId: string];
    result: QueueRemoveResult;
  };
  chatRunActivity: {
    args: [workspaceId: string, runId: string, limit: number];
    result: RunActivityPage;
  };
  chatRunItemOutput: {
    args: [
      workspaceId: string,
      runId: string,
      runItemId: string,
      afterOrdinal: number,
      limit: number,
    ];
    result: RunItemOutputPage;
  };
  chatSendMessage: {
    args: [workspaceId: string, conversationId: string, prompt: string];
    result: SendMessageResult;
  };
  chatSendSteeringImmediately: {
    args: [workspaceId: string, conversationId: string, prompt: string];
    result: ImmediateSteeringResult;
  };
  chatSteerMessage: {
    args: [workspaceId: string, conversationId: string, prompt: string];
    result: SteerMessageResult;
  };
  chatSubmitApproval: {
    args: [input: SubmitApprovalRequest];
    result: Run;
  };
  codexAccountCancelLogin: {
    args: [request: CancelCodexLoginRequest];
    result: CodexAccountState;
  };
  codexAccountLogout: {
    args: [request: LogoutCodexAccountRequest];
    result: CodexAccountState;
  };
  codexAccountRead: {
    args: [];
    result: CodexAccountState;
  };
  codexAccountRefresh: {
    args: [request: RefreshCodexAccountRequest];
    result: CodexAccountState;
  };
  codexAccountStartLogin: {
    args: [request: StartCodexLoginRequest];
    result: StartCodexLoginResponse;
  };
  niriBrowserViewStats: {
    args: [];
    result: NiriBrowserViewStats;
  };
  niriBrowserViewsTeardown: {
    args: [workspaceId: string];
    result: NiriBrowserViewStats;
  };
  terminalAttach: {
    args: [workspaceId: string, paneId: string];
    result: TerminalSessionResponse;
  };
  terminalClose: {
    args: [sessionId: string, mode: "terminate" | "kill"];
    result: TerminalSessionResponse;
  };
  terminalCreate: {
    args: [
      workspaceId: string,
      paneId: string,
      profileId: string,
      cwd: string,
      cols: number,
      rows: number,
    ];
    result: TerminalSessionResponse;
  };
  terminalCreateProfile: {
    args: [request: CreateTerminalProfileRequest];
    result: TerminalProfileList;
  };
  terminalDeleteProfile: {
    args: [request: DeleteTerminalProfileRequest];
    result: TerminalProfileList;
  };
  terminalInput: {
    args: [input: TerminalInputRequest];
    result: TerminalInputResponse;
  };
  terminalListProfiles: {
    args: [];
    result: TerminalProfileList;
  };
  terminalResize: {
    args: [request: ResizeTerminalRequest];
    result: TerminalSessionResponse;
  };
  terminalSelectDefaultProfile: {
    args: [request: SelectDefaultTerminalProfileRequest];
    result: TerminalProfileList;
  };
  terminalUpdateProfile: {
    args: [request: UpdateTerminalProfileRequest];
    result: TerminalProfileList;
  };
  workflowCancelExecution: {
    args: [workspaceId: string, executionId: string];
    result: WorkflowExecution;
  };
  workflowCreateDefinition: {
    args: [workspaceId: string, name: string, description: string, graph: WorkflowGraph];
    result: WorkflowDefinition;
  };
  workflowDeleteDefinition: {
    args: [workspaceId: string, definitionId: string];
    result: DeleteWorkflowDefinitionResponse;
  };
  workflowExecutionEvents: {
    args: [workspaceId: string, executionId: string, beforeOrdinal: number, limit: number];
    result: WorkflowExecutionEventPage;
  };
  workflowGraphProjection: {
    args: [workspaceId: string, definitionId: string, versionId: string, executionId: string];
    result: ReadWorkflowGraphProjectionResponse;
  };
  workflowListDefinitions: {
    args: [workspaceId: string];
    result: ListWorkflowDefinitionsResponse;
  };
  workflowReadDefinition: {
    args: [workspaceId: string, definitionId: string];
    result: WorkflowDefinition;
  };
  workflowReadExecution: {
    args: [workspaceId: string, executionId: string];
    result: WorkflowExecution;
  };
  workflowStartExecution: {
    args: [workspaceId: string, definitionId: string, versionId: string];
    result: WorkflowExecution;
  };
  workflowSubmitApproval: {
    args: [request: SubmitWorkflowApprovalRequest];
    result: WorkflowExecution;
  };
  workflowUpdateDefinition: {
    args: [
      workspaceId: string,
      definitionId: string,
      name: string,
      description: string,
      graph: WorkflowGraph,
    ];
    result: WorkflowDefinition;
  };
  workflowValidateDefinition: {
    args: [workspaceId: string, graph: WorkflowGraph];
    result: WorkflowValidationResult;
  };
  workspaceClose: {
    args: [id: string];
    result: WorkspaceSession;
  };
  workspaceOpenLocalFolder: {
    args: [];
    result: OpenWorkspaceResponse | null;
  };
  workspaceOpenPath: {
    args: [rootPath: string];
    result: OpenWorkspaceResponse;
  };
  workspaceRemoveRecent: {
    args: [id: string];
    result: WorkspaceSession;
  };
  workspaceReorder: {
    args: [ids: string[]];
    result: WorkspaceSession;
  };
  workspaceSelect: {
    args: [id: string];
    result: WorkspaceSession;
  };
  workspaceSession: {
    args: [];
    result: WorkspaceSession;
  };
}

export type IpcChannelKey = keyof IpcContract;

export type RendererIpcInvoke = <Channel extends IpcChannelKey>(
  channel: Channel,
  ...args: IpcContract[Channel]["args"]
) => Promise<IpcContract[Channel]["result"]>;

export type MainIpcHandler<Channel extends IpcChannelKey> = (
  event: IpcMainInvokeEvent,
  ...args: IpcContract[Channel]["args"]
) => IpcContract[Channel]["result"] | Promise<IpcContract[Channel]["result"]>;

export interface IpcObserver {
  failed: (event: IpcObservedFailure) => void;
  finished: (event: IpcObservedFinish) => void;
  started: (event: IpcObservedStart) => void;
}

export interface IpcObservedStart {
  args: unknown[];
  channel: string;
  id: number;
}

export interface IpcObservedFinish {
  channel: string;
  durationMs: number;
  id: number;
  result: unknown;
}

export interface IpcObservedFailure {
  channel: string;
  durationMs: number;
  error: unknown;
  id: number;
}

let nextObservedIpcID = 1;

export function createRendererIpcInvoke(renderer: Pick<IpcRenderer, "invoke">): RendererIpcInvoke {
  return async (channel, ...args) => {
    const channelName = ipcChannels[channel];
    try {
      return (await renderer.invoke(channelName, ...args)) as IpcContract[typeof channel]["result"];
    } catch (error) {
      throw normalizeRendererIpcError(channelName, error);
    }
  };
}

function normalizeRendererIpcError(channelName: string, error: unknown) {
  if (!(error instanceof Error)) {
    return error;
  }
  const prefix = `Error invoking remote method '${channelName}': Error: `;
  if (!error.message.startsWith(prefix)) {
    return error;
  }
  return new Error(error.message.slice(prefix.length));
}

export function handleIpc<Channel extends IpcChannelKey>(
  main: Pick<IpcMain, "handle">,
  channel: Channel,
  handler: MainIpcHandler<Channel>,
  observer?: IpcObserver,
) {
  const channelName = ipcChannels[channel];
  main.handle(channelName, async (event, ...args) => {
    const id = nextObservedIpcID;
    nextObservedIpcID += 1;
    const startedAt = Date.now();
    observer?.started({ args, channel: channelName, id });
    try {
      const result = await handler(event, ...(args as IpcContract[Channel]["args"]));
      observer?.finished({
        channel: channelName,
        durationMs: Date.now() - startedAt,
        id,
        result,
      });
      return result;
    } catch (error) {
      observer?.failed({
        channel: channelName,
        durationMs: Date.now() - startedAt,
        error,
        id,
      });
      throw error;
    }
  });
}
