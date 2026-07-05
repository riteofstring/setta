import type { IpcMain, IpcMainInvokeEvent, IpcRenderer } from "electron";

import type {
  AppearancePresetList,
  AppearanceSettings,
  AttachSemanticNodeToChatMessageRequest,
  AttachSemanticNodeToChatRunRequest,
  AttachSemanticNodeToFileRangeRequest,
  AttachSemanticNodeToRunItemRequest,
  AttachSemanticNodeToWorkflowExecutionRequest,
  AttachSemanticNodeToWorkflowNodeRequest,
  BackendHealth,
  BackgroundTerminalListProjection,
  BackgroundTerminalOutputPage,
  BackgroundTerminalProcess,
  BuildCartographerWindowRequest,
  CancelCodexLoginRequest,
  CartographerCursorList,
  CartographerPatchList,
  CartographerPatchReviewResult,
  CartographerProcessingState,
  CartographerRunList,
  CartographerRunReadResponse,
  CartographerWindowBuildResult,
  CartographerWindowList,
  CartographerWindowProcessResult,
  ChatCommandExecuteResult,
  ChatCommandListResult,
  ChatCodexDefaultsView,
  ChatInput,
  ChatPermissionPresetID,
  CodexAccountState,
  ComposerPromptHistoryPage,
  Conversation,
  ConversationListItem,
  CreateSemanticEdgeRequest,
  CreateSemanticNodeRequest,
  CreateSemanticSteeringDirectiveRequest,
  CloseTerminalRequest,
  CloseTerminalResponse,
  CreateTerminalProfileRequest,
  DeleteTerminalProfileRequest,
  DeleteWorkflowDefinitionResponse,
  EndSemanticActivityRequest,
  GetActiveRunResponse,
  ImmediateSteeringResult,
  ImageAttachment,
  ListCartographerCursorsRequest,
  ListCartographerPatchesRequest,
  ListCartographerRunsRequest,
  ListCartographerWindowsRequest,
  ListConversationsResponse,
  ListWorkflowExecutionsResponse,
  ListSemanticContextPacksRequest,
  ListWorkflowDefinitionsResponse,
  LogoutCodexAccountRequest,
  MergeSemanticNodesRequest,
  MessagePage,
  OpenWorkspaceResponse,
  ProcessCartographerWindowRequest,
  QueueEditResult,
  QueueMessageResult,
  QueueRemoveResult,
  ReadCartographerProcessingStateRequest,
  ReconcileChatRunsRequest,
  ReconcileChatRunsResponse,
  RenameSemanticNodeRequest,
  ReadCartographerRunRequest,
  ReadSemanticActivitySummaryRequest,
  ReadSemanticContextPackRequest,
  ReadWorkflowGraphProjectionResponse,
  ReadWorkflowNodeTrajectoryRequest,
  ReadSemanticEventHistoryRequest,
  ReadSemanticGraphRequest,
  ReadSemanticNodeDetailRequest,
  ReadSemanticNodeDetailResponse,
  ReadSemanticSteeringStateRequest,
  ReadWorkflowExecutionActivityResponse,
  ReadWorkspaceActivitySnapshotResponse,
  ReasoningEffort,
  RefreshCodexAccountRequest,
  RetryWorkflowNodeRunLivenessRequest,
  ResizeTerminalRequest,
  ReviewCartographerPatchRequest,
  Run,
  RunActivityPage,
  RunLivenessReconciliationResult,
  RunItemOutputPage,
  ListSemanticActivityPageRequest,
  ListSemanticActivityRequest,
  ListSemanticEvidenceRequest,
  SendMessageResult,
  SelectDefaultTerminalProfileRequest,
  SemanticActivityEndResult,
  SemanticActivityList,
  SemanticActivityPage,
  SemanticActivitySummary,
  SemanticAttachmentResult,
  SemanticContextPackList,
  SemanticContextPackReadResponse,
  SemanticEdgeOperationRequest,
  SemanticEventHistory,
  SemanticEvidenceList,
  SemanticGraph,
  SemanticLayoutPositionList,
  SemanticMutationResult,
  SemanticNodeOperationRequest,
  SemanticSteeringState,
  SplitSemanticNodeRequest,
  StartCodexLoginRequest,
  StartCodexLoginResponse,
  SteerMessageResult,
  SteerWorkflowNodeRunRequest,
  SubmitApprovalRequest,
  StopWorkflowNodeRunRequest,
  SubmitWorkflowApprovalRequest,
  TerminalInputRequest,
  TerminalInputResponse,
  TerminalProfileList,
  TerminalSessionResponse,
  UpdateAppearanceSettingsRequest,
  UpdateChatCodexDefaultsRequest,
  UpdateSemanticEdgeRequest,
  UpdateSemanticLayoutPositionsRequest,
  UpdateSemanticNodeRequest,
  UpdateSemanticSteeringDirectiveRequest,
  UpdateTerminalProfileRequest,
  WorkflowAgentTrajectoryPage,
  WorkflowDefinition,
  WorkflowExecution,
  WorkflowExecutionEventPage,
  WorkflowGraph,
  WorkflowValidationResult,
  WorkspaceUIPaneListResult,
  WorkspaceUIPaneReadResult,
  WorkspaceUISchema,
  WorkspaceSelectedConversations,
  WorkspaceUILayout,
  WorkspaceUILayoutReadResult,
  WorkspaceSession,
} from "@generated/backend";
import type {
  AppWindowDragPoint,
  InstalledEditorApp,
  KnownRuntimeView,
  RendererRegionCaptureRequest,
  RendererRegionSnapshot,
  RuntimeRegistrySnapshot,
  WorkspaceBrowserViewStats,
  RuntimeVersions,
  WorkspaceGitInfo,
} from "./types";

export const ipcChannels = {
  appInstalledEditors: "app:installed-editors",
  appCaptureRendererRegion: "app:capture-renderer-region",
  appWindowDragEnd: "app:window-drag-end",
  appWindowDragMove: "app:window-drag-move",
  appWindowDragStart: "app:window-drag-start",
  appOpenExternalUrl: "app:open-external-url",
  appOpenWorkspaceInEditor: "app:open-workspace-in-editor",
  appVersions: "app:versions",
  appWorkspaceGitInfo: "app:workspace-git-info",
  appearancePresets: "appearance:presets",
  appearanceRead: "appearance:read",
  appearanceUpdate: "appearance:update",
  backendHealth: "backend:health",
  runtimeAddByPairingUrl: "runtimes:add-by-pairing-url",
  runtimeCurrent: "runtimes:current",
  runtimeList: "runtimes:list",
  runtimeRemove: "runtimes:remove",
  runtimeSwitch: "runtimes:switch",
  chatActiveRun: "chat:active-run",
  chatCancelRun: "chat:cancel-run",
  chatReconcileRuns: "chat:reconcile-runs",
  chatCreateImageAttachmentFromBytes: "chat:create-image-attachment-from-bytes",
  chatCreateConversation: "chat:create-conversation",
  chatDeleteConversation: "chat:delete-conversation",
  chatEditQueuedMessage: "chat:edit-queued-message",
  chatExecuteCommand: "chat:execute-command",
  chatReadCodexDefaults: "chat:read-codex-defaults",
  chatListConversations: "chat:list-conversations",
  chatListCommands: "chat:list-commands",
  chatListBackgroundTerminals: "chat:list-background-terminals",
  chatGetBackgroundTerminalOutput: "chat:get-background-terminal-output",
  chatKillBackgroundTerminal: "chat:kill-background-terminal",
  chatKillAllBackgroundTerminals: "chat:kill-all-background-terminals",
  chatMarkConversationRead: "chat:mark-conversation-read",
  chatMessagePage: "chat:message-page",
  chatListComposerPromptHistory: "chat:list-composer-prompt-history",
  chatQueueMessage: "chat:queue-message",
  chatRemoveQueuedMessage: "chat:remove-queued-message",
  chatRunActivity: "chat:run-activity",
  chatRunItemOutput: "chat:run-item-output",
  chatSendMessage: "chat:send-message",
  chatSendSteeringImmediately: "chat:send-steering-immediately",
  chatOpenCodexModelPicker: "chat:open-codex-model-picker",
  chatOpenCodexPermissionPicker: "chat:open-codex-permission-picker",
  chatSetCodexModel: "chat:set-codex-model",
  chatSetCodexPermissionPreset: "chat:set-codex-permission-preset",
  chatSetCodexReasoningEffort: "chat:set-codex-reasoning-effort",
  chatUpdateCodexDefaults: "chat:update-codex-defaults",
  chatSetConversationPinned: "chat:set-conversation-pinned",
  chatSelectImageAttachments: "chat:select-image-attachments",
  chatSteerMessage: "chat:steer-message",
  chatSubmitApproval: "chat:submit-approval",
  codexAccountCancelLogin: "codex-account:cancel-login",
  codexAccountLogout: "codex-account:logout",
  codexAccountRead: "codex-account:read",
  codexAccountRefresh: "codex-account:refresh",
  codexAccountStartLogin: "codex-account:start-login",
  semanticGraphActivityEnd: "semantic-graph:activity-end",
  semanticGraphActivityList: "semantic-graph:activity-list",
  semanticGraphActivityPage: "semantic-graph:activity-page",
  semanticGraphActivitySummary: "semantic-graph:activity-summary",
  semanticGraphAttachChatMessage: "semantic-graph:attach-chat-message",
  semanticGraphAttachChatRun: "semantic-graph:attach-chat-run",
  semanticGraphAttachFileRange: "semantic-graph:attach-file-range",
  semanticGraphAttachRunItem: "semantic-graph:attach-run-item",
  semanticGraphAttachWorkflowExecution: "semantic-graph:attach-workflow-execution",
  semanticGraphAttachWorkflowNode: "semantic-graph:attach-workflow-node",
  semanticGraphCartographerCursorList: "semantic-graph:cartographer-cursor-list",
  semanticGraphCartographerPatchAccept: "semantic-graph:cartographer-patch-accept",
  semanticGraphCartographerPatchList: "semantic-graph:cartographer-patch-list",
  semanticGraphCartographerPatchReject: "semantic-graph:cartographer-patch-reject",
  semanticGraphCartographerProcessingState: "semantic-graph:cartographer-processing-state",
  semanticGraphCartographerRunList: "semantic-graph:cartographer-run-list",
  semanticGraphCartographerRunRead: "semantic-graph:cartographer-run-read",
  semanticGraphCartographerWindowBuild: "semantic-graph:cartographer-window-build",
  semanticGraphCartographerWindowProcess: "semantic-graph:cartographer-window-process",
  semanticGraphCartographerWindowList: "semantic-graph:cartographer-window-list",
  semanticGraphCreateEdge: "semantic-graph:create-edge",
  semanticGraphCreateNode: "semantic-graph:create-node",
  semanticGraphCreateSteeringDirective: "semantic-graph:create-steering-directive",
  semanticGraphContextPackList: "semantic-graph:context-pack-list",
  semanticGraphContextPackRead: "semantic-graph:context-pack-read",
  semanticGraphDismissNode: "semantic-graph:dismiss-node",
  semanticGraphEventHistory: "semantic-graph:event-history",
  semanticGraphEvidenceList: "semantic-graph:evidence-list",
  semanticGraphLayoutUpdate: "semantic-graph:layout-update",
  semanticGraphMergeNodes: "semantic-graph:merge-nodes",
  semanticGraphNodeDetail: "semantic-graph:node-detail",
  semanticGraphPromoteNode: "semantic-graph:promote-node",
  semanticGraphRead: "semantic-graph:read",
  semanticGraphRemoveEdge: "semantic-graph:remove-edge",
  semanticGraphRenameNode: "semantic-graph:rename-node",
  semanticGraphSplitNode: "semantic-graph:split-node",
  semanticGraphSteeringRead: "semantic-graph:steering-read",
  semanticGraphUpdateEdge: "semantic-graph:update-edge",
  semanticGraphUpdateNode: "semantic-graph:update-node",
  semanticGraphUpdateSteeringDirective: "semantic-graph:update-steering-directive",
  workspaceActivitySnapshot: "workspace-activity:snapshot",
  workspaceActivityExecutionSnapshot: "workspace-activity:execution-snapshot",
  workspaceBrowserViewStats: "workspace:browser-view-stats",
  workspaceBrowserViewsTeardown: "workspace:browser-views-teardown",
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
  workflowListExecutions: "workflow:list-executions",
  workflowReadDefinition: "workflow:read-definition",
  workflowReadExecution: "workflow:read-execution",
  workflowReadNodeTrajectory: "workflow:read-node-trajectory",
  workflowRetryNodeRunLiveness: "workflow:retry-node-run-liveness",
  workflowStartExecution: "workflow:start-execution",
  workflowSteerNodeRun: "workflow:steer-node-run",
  workflowStopNodeRun: "workflow:stop-node-run",
  workflowSubmitApproval: "workflow:submit-approval",
  workflowUpdateDefinition: "workflow:update-definition",
  workflowValidateDefinition: "workflow:validate-definition",
  workspaceClose: "workspace:close",
  workspaceListUIPanes: "workspace:list-ui-panes",
  workspaceOpenLocalFolder: "workspace:open-local-folder",
  workspaceOpenPath: "workspace:open-path",
  workspaceReadUIPane: "workspace:read-ui-pane",
  workspaceReadUISchema: "workspace:read-ui-schema",
  workspaceReadUILayout: "workspace:read-ui-layout",
  workspaceRemoveRecent: "workspace:remove-recent",
  workspaceReorder: "workspace:reorder",
  workspaceSaveUILayout: "workspace:save-ui-layout",
  workspaceSelect: "workspace:select",
  workspaceSelectedConversations: "workspace:selected-conversations",
  workspaceSetSelectedConversation: "workspace:set-selected-conversation",
  workspaceSession: "workspace:session",
} as const;

export const ipcMessages = {
  workspaceBrowserViewBatch: "workspace:browser-view-batch",
} as const;

export const ipcEvents = {
  backendEventStreamStatus: "backend:event-stream-status",
  backendProcessStatus: "backend:process-status",
  backendUnexpectedExit: "backend:unexpected-exit",
  chatEvent: "chat:event",
  runtimeConnectionState: "runtimes:connection-state",
  semanticGraphEvent: "semantic-graph:event",
  workspaceActivityEvent: "workspace-activity:event",
  workspaceBrowserViewKey: "workspace:browser-view-key",
  workspaceBrowserViewSnapshot: "workspace:browser-view-snapshot",
  terminalEvent: "terminal:event",
  workflowEvent: "workflow:event",
} as const;

interface IpcContract {
  appInstalledEditors: {
    args: [];
    result: InstalledEditorApp[];
  };
  appCaptureRendererRegion: {
    args: [request: RendererRegionCaptureRequest];
    result: RendererRegionSnapshot;
  };
  appWindowDragEnd: {
    args: [];
    result: void;
  };
  appWindowDragMove: {
    args: [point: AppWindowDragPoint];
    result: void;
  };
  appWindowDragStart: {
    args: [point: AppWindowDragPoint];
    result: void;
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
  runtimeAddByPairingUrl: {
    args: [pairingUrl: string];
    result: RuntimeRegistrySnapshot;
  };
  runtimeCurrent: {
    args: [];
    result: RuntimeRegistrySnapshot;
  };
  runtimeList: {
    args: [];
    result: KnownRuntimeView[];
  };
  runtimeRemove: {
    args: [runtimeId: string];
    result: RuntimeRegistrySnapshot;
  };
  runtimeSwitch: {
    args: [runtimeId: string];
    result: RuntimeRegistrySnapshot;
  };
  chatActiveRun: {
    args: [workspaceId: string, conversationId: string];
    result: GetActiveRunResponse;
  };
  chatCancelRun: {
    args: [workspaceId: string, conversationId: string];
    result: Run;
  };
  chatReconcileRuns: {
    args: [request: ReconcileChatRunsRequest];
    result: ReconcileChatRunsResponse;
  };
  chatCreateConversation: {
    args: [workspaceId: string, title: string];
    result: Conversation;
  };
  chatDeleteConversation: {
    args: [workspaceId: string, conversationId: string];
    result: ListConversationsResponse;
  };
  chatEditQueuedMessage: {
    args: [workspaceId: string, conversationId: string, messageId: string, input: ChatInput];
    result: QueueEditResult;
  };
  chatCreateImageAttachmentFromBytes: {
    args: [workspaceId: string, conversationId: string, fileName: string, dataBase64: string];
    result: ImageAttachment;
  };
  chatSelectImageAttachments: {
    args: [workspaceId: string, conversationId: string, maxCount: number];
    result: ImageAttachment[];
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
  chatReadCodexDefaults: {
    args: [];
    result: ChatCodexDefaultsView;
  };
  chatOpenCodexModelPicker: {
    args: [workspaceId: string, conversationId: string];
    result: ChatCommandExecuteResult;
  };
  chatOpenCodexPermissionPicker: {
    args: [workspaceId: string, conversationId: string];
    result: ChatCommandExecuteResult;
  };
  chatSetCodexModel: {
    args: [workspaceId: string, conversationId: string, modelId: string];
    result: ChatCommandExecuteResult;
  };
  chatSetCodexPermissionPreset: {
    args: [
      workspaceId: string,
      conversationId: string,
      preset: ChatPermissionPresetID,
      confirmed: boolean,
    ];
    result: ChatCommandExecuteResult;
  };
  chatSetCodexReasoningEffort: {
    args: [workspaceId: string, conversationId: string, effort: ReasoningEffort];
    result: ChatCommandExecuteResult;
  };
  chatUpdateCodexDefaults: {
    args: [request: UpdateChatCodexDefaultsRequest];
    result: ChatCodexDefaultsView;
  };
  chatSetConversationPinned: {
    args: [workspaceId: string, conversationId: string, pinned: boolean];
    result: ConversationListItem;
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
    args: [workspaceId: string, conversationId: string, beforeBlockOrdinal: number, limit: number];
    result: MessagePage;
  };
  chatListComposerPromptHistory: {
    args: [workspaceId: string, conversationId: string, beforeOrdinal: number, limit: number];
    result: ComposerPromptHistoryPage;
  };
  chatQueueMessage: {
    args: [workspaceId: string, conversationId: string, input: ChatInput];
    result: QueueMessageResult;
  };
  chatRemoveQueuedMessage: {
    args: [workspaceId: string, conversationId: string, messageId: string];
    result: QueueRemoveResult;
  };
  chatRunActivity: {
    args: [workspaceId: string, runId: string, afterItemId: string, limit: number];
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
  chatListBackgroundTerminals: {
    args: [workspaceId: string, conversationId: string];
    result: BackgroundTerminalListProjection;
  };
  chatGetBackgroundTerminalOutput: {
    args: [
      workspaceId: string,
      conversationId: string,
      processId: string,
      afterOrdinal: number,
      limit: number,
    ];
    result: BackgroundTerminalOutputPage;
  };
  chatKillBackgroundTerminal: {
    args: [workspaceId: string, conversationId: string, processId: string];
    result: BackgroundTerminalProcess;
  };
  chatKillAllBackgroundTerminals: {
    args: [workspaceId: string, conversationId: string];
    result: BackgroundTerminalListProjection;
  };
  chatSendMessage: {
    args: [workspaceId: string, conversationId: string, input: ChatInput];
    result: SendMessageResult;
  };
  chatSendSteeringImmediately: {
    args: [workspaceId: string, conversationId: string, input: ChatInput | null];
    result: ImmediateSteeringResult;
  };
  chatSteerMessage: {
    args: [workspaceId: string, conversationId: string, input: ChatInput];
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
  semanticGraphActivityList: {
    args: [request: ListSemanticActivityRequest];
    result: SemanticActivityList;
  };
  semanticGraphActivityPage: {
    args: [request: ListSemanticActivityPageRequest];
    result: SemanticActivityPage;
  };
  semanticGraphActivitySummary: {
    args: [request: ReadSemanticActivitySummaryRequest];
    result: SemanticActivitySummary;
  };
  semanticGraphActivityEnd: {
    args: [request: EndSemanticActivityRequest];
    result: SemanticActivityEndResult;
  };
  semanticGraphAttachChatMessage: {
    args: [request: AttachSemanticNodeToChatMessageRequest];
    result: SemanticAttachmentResult;
  };
  semanticGraphAttachChatRun: {
    args: [request: AttachSemanticNodeToChatRunRequest];
    result: SemanticAttachmentResult;
  };
  semanticGraphAttachFileRange: {
    args: [request: AttachSemanticNodeToFileRangeRequest];
    result: SemanticAttachmentResult;
  };
  semanticGraphAttachRunItem: {
    args: [request: AttachSemanticNodeToRunItemRequest];
    result: SemanticAttachmentResult;
  };
  semanticGraphAttachWorkflowExecution: {
    args: [request: AttachSemanticNodeToWorkflowExecutionRequest];
    result: SemanticAttachmentResult;
  };
  semanticGraphAttachWorkflowNode: {
    args: [request: AttachSemanticNodeToWorkflowNodeRequest];
    result: SemanticAttachmentResult;
  };
  semanticGraphCartographerCursorList: {
    args: [request: ListCartographerCursorsRequest];
    result: CartographerCursorList;
  };
  semanticGraphCartographerPatchAccept: {
    args: [request: ReviewCartographerPatchRequest];
    result: CartographerPatchReviewResult;
  };
  semanticGraphCartographerPatchList: {
    args: [request: ListCartographerPatchesRequest];
    result: CartographerPatchList;
  };
  semanticGraphCartographerPatchReject: {
    args: [request: ReviewCartographerPatchRequest];
    result: CartographerPatchReviewResult;
  };
  semanticGraphCartographerProcessingState: {
    args: [request: ReadCartographerProcessingStateRequest];
    result: CartographerProcessingState;
  };
  semanticGraphCartographerRunList: {
    args: [request: ListCartographerRunsRequest];
    result: CartographerRunList;
  };
  semanticGraphCartographerRunRead: {
    args: [request: ReadCartographerRunRequest];
    result: CartographerRunReadResponse;
  };
  semanticGraphCartographerWindowBuild: {
    args: [request: BuildCartographerWindowRequest];
    result: CartographerWindowBuildResult;
  };
  semanticGraphCartographerWindowProcess: {
    args: [request: ProcessCartographerWindowRequest];
    result: CartographerWindowProcessResult;
  };
  semanticGraphCartographerWindowList: {
    args: [request: ListCartographerWindowsRequest];
    result: CartographerWindowList;
  };
  semanticGraphCreateEdge: {
    args: [request: CreateSemanticEdgeRequest];
    result: SemanticMutationResult;
  };
  semanticGraphCreateNode: {
    args: [request: CreateSemanticNodeRequest];
    result: SemanticMutationResult;
  };
  semanticGraphCreateSteeringDirective: {
    args: [request: CreateSemanticSteeringDirectiveRequest];
    result: SemanticMutationResult;
  };
  semanticGraphContextPackList: {
    args: [request: ListSemanticContextPacksRequest];
    result: SemanticContextPackList;
  };
  semanticGraphContextPackRead: {
    args: [request: ReadSemanticContextPackRequest];
    result: SemanticContextPackReadResponse;
  };
  semanticGraphDismissNode: {
    args: [request: SemanticNodeOperationRequest];
    result: SemanticMutationResult;
  };
  semanticGraphEventHistory: {
    args: [request: ReadSemanticEventHistoryRequest];
    result: SemanticEventHistory;
  };
  semanticGraphEvidenceList: {
    args: [request: ListSemanticEvidenceRequest];
    result: SemanticEvidenceList;
  };
  semanticGraphLayoutUpdate: {
    args: [request: UpdateSemanticLayoutPositionsRequest];
    result: SemanticLayoutPositionList;
  };
  semanticGraphMergeNodes: {
    args: [request: MergeSemanticNodesRequest];
    result: SemanticMutationResult;
  };
  semanticGraphNodeDetail: {
    args: [request: ReadSemanticNodeDetailRequest];
    result: ReadSemanticNodeDetailResponse;
  };
  semanticGraphPromoteNode: {
    args: [request: SemanticNodeOperationRequest];
    result: SemanticMutationResult;
  };
  semanticGraphRead: {
    args: [request: ReadSemanticGraphRequest];
    result: SemanticGraph;
  };
  semanticGraphRemoveEdge: {
    args: [request: SemanticEdgeOperationRequest];
    result: SemanticMutationResult;
  };
  semanticGraphRenameNode: {
    args: [request: RenameSemanticNodeRequest];
    result: SemanticMutationResult;
  };
  semanticGraphSplitNode: {
    args: [request: SplitSemanticNodeRequest];
    result: SemanticMutationResult;
  };
  semanticGraphSteeringRead: {
    args: [request: ReadSemanticSteeringStateRequest];
    result: SemanticSteeringState;
  };
  semanticGraphUpdateEdge: {
    args: [request: UpdateSemanticEdgeRequest];
    result: SemanticMutationResult;
  };
  semanticGraphUpdateNode: {
    args: [request: UpdateSemanticNodeRequest];
    result: SemanticMutationResult;
  };
  semanticGraphUpdateSteeringDirective: {
    args: [request: UpdateSemanticSteeringDirectiveRequest];
    result: SemanticMutationResult;
  };
  workspaceBrowserViewStats: {
    args: [];
    result: WorkspaceBrowserViewStats;
  };
  workspaceBrowserViewsTeardown: {
    args: [workspaceId: string];
    result: WorkspaceBrowserViewStats;
  };
  workspaceActivitySnapshot: {
    args: [workspaceId: string, limit: number];
    result: ReadWorkspaceActivitySnapshotResponse;
  };
  workspaceActivityExecutionSnapshot: {
    args: [workspaceId: string, executionId: string, limit: number];
    result: ReadWorkflowExecutionActivityResponse;
  };
  terminalAttach: {
    args: [workspaceId: string, paneId: string];
    result: TerminalSessionResponse;
  };
  terminalClose: {
    args: [request: CloseTerminalRequest];
    result: CloseTerminalResponse;
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
  workflowListExecutions: {
    args: [workspaceId: string, definitionId: string, limit: number];
    result: ListWorkflowExecutionsResponse;
  };
  workflowReadDefinition: {
    args: [workspaceId: string, definitionId: string];
    result: WorkflowDefinition;
  };
  workflowReadExecution: {
    args: [workspaceId: string, executionId: string];
    result: WorkflowExecution;
  };
  workflowReadNodeTrajectory: {
    args: [request: ReadWorkflowNodeTrajectoryRequest];
    result: WorkflowAgentTrajectoryPage;
  };
  workflowRetryNodeRunLiveness: {
    args: [request: RetryWorkflowNodeRunLivenessRequest];
    result: RunLivenessReconciliationResult;
  };
  workflowStartExecution: {
    args: [workspaceId: string, definitionId: string, versionId: string];
    result: WorkflowExecution;
  };
  workflowSteerNodeRun: {
    args: [request: SteerWorkflowNodeRunRequest];
    result: SteerMessageResult;
  };
  workflowStopNodeRun: {
    args: [request: StopWorkflowNodeRunRequest];
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
  workspaceClose: { args: [id: string]; result: WorkspaceSession };
  workspaceListUIPanes: { args: [workspaceId: string]; result: WorkspaceUIPaneListResult };
  workspaceOpenLocalFolder: { args: []; result: OpenWorkspaceResponse | null };
  workspaceOpenPath: { args: [rootPath: string]; result: OpenWorkspaceResponse };
  workspaceReadUIPane: {
    args: [workspaceId: string, paneId: string];
    result: WorkspaceUIPaneReadResult;
  };
  workspaceReadUISchema: { args: []; result: WorkspaceUISchema };
  workspaceReadUILayout: { args: [workspaceId: string]; result: WorkspaceUILayoutReadResult };
  workspaceRemoveRecent: { args: [id: string]; result: WorkspaceSession };
  workspaceReorder: { args: [ids: string[]]; result: WorkspaceSession };
  workspaceSaveUILayout: { args: [layout: WorkspaceUILayout]; result: WorkspaceUILayout };
  workspaceSelect: { args: [id: string]; result: WorkspaceSession };
  workspaceSelectedConversations: {
    args: [];
    result: WorkspaceSelectedConversations;
  };
  workspaceSetSelectedConversation: {
    args: [workspaceId: string, conversationId: string];
    result: WorkspaceSelectedConversations;
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
