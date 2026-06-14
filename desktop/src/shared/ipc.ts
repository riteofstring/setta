import type { IpcMain, IpcMainInvokeEvent, IpcRenderer } from "electron";

import type {
  AddWorkflowEdgeRequest,
  AddWorkflowNodeRequest,
  AppearancePresetList,
  AppearanceSettings,
  AttachSemanticNodeToChatMessageRequest,
  AttachSemanticNodeToChatRunRequest,
  AttachSemanticNodeToFileRangeRequest,
  AttachSemanticNodeToRunItemRequest,
  AttachSemanticNodeToWorkflowExecutionRequest,
  AttachSemanticNodeToWorkflowNodeRequest,
  BackendHealth,
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
  ChatModelOption,
  CodexAccountState,
  Conversation,
  ConversationListItem,
  CreateSemanticEdgeRequest,
  CreateSemanticNodeRequest,
  CreateSemanticSteeringDirectiveRequest,
  CreateTerminalProfileRequest,
  DeleteTerminalProfileRequest,
  DeleteWorkflowDefinitionResponse,
  DeleteWorkflowEdgesRequest,
  DeleteWorkflowNodesRequest,
  EndSemanticActivityRequest,
  GetActiveRunResponse,
  ImmediateSteeringResult,
  ListCartographerCursorsRequest,
  ListCartographerPatchesRequest,
  ListCartographerRunsRequest,
  ListCartographerWindowsRequest,
  ListConversationsResponse,
  ListSemanticContextPacksRequest,
  ListSemanticCartographerModelOptionsRequest,
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
  ReadSemanticCartographerSettingsRequest,
  ReadSemanticCartographerSettingsMetadataRequest,
  RenameSemanticNodeRequest,
  ReadCartographerRunRequest,
  ReadSemanticActivitySummaryRequest,
  ReadSemanticContextPackRequest,
  ReadWorkflowGraphProjectionResponse,
  ReadSemanticEventHistoryRequest,
  ReadSemanticGraphRequest,
  ReadSemanticNodeDetailRequest,
  ReadSemanticNodeDetailResponse,
  ReadSemanticSteeringStateRequest,
  ReadSemanticWorkingSetRequest,
  ReasoningEffort,
  RefreshCodexAccountRequest,
  ResizeTerminalRequest,
  ReviewCartographerPatchRequest,
  Run,
  RunActivityPage,
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
  SemanticCartographerSettingsRecord,
  SemanticCartographerSettingsMetadata,
  SemanticEdgeOperationRequest,
  SemanticEventHistory,
  SemanticEvidenceList,
  SemanticGraph,
  SemanticWorkingSet,
  SemanticLayoutPositionList,
  SemanticMutationResult,
  SemanticNodeOperationRequest,
  SemanticSteeringState,
  SplitSemanticNodeRequest,
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
  UpdateSemanticCartographerSettingsRequest,
  UpdateSemanticEdgeRequest,
  UpdateSemanticLayoutPositionsRequest,
  UpdateSemanticNodeRequest,
  UpdateSemanticSteeringDirectiveRequest,
  UpdateTerminalProfileRequest,
  UpdateWorkflowDefinitionRequest,
  UpdateWorkflowDefinitionLayoutRequest,
  UpdateWorkflowDefinitionSettingsRequest,
  UpdateWorkflowEdgeRequest,
  UpdateWorkflowNodeRequest,
  ValidateWorkflowDefinitionDraftRequest,
  WorkflowDefinition,
  WorkflowExecution,
  WorkflowExecutionEventPage,
  WorkflowGraph,
  WorkflowGraphProjection,
  WorkflowValidationResult,
  WorkspaceSelectedConversations,
  WorkspaceUILayout,
  WorkspaceUILayoutReadResult,
  WorkspaceSession,
} from "@generated/backend";
import type {
  AppWindowDragPoint,
  InstalledEditorApp,
  RendererRegionCaptureRequest,
  RendererRegionSnapshot,
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
  chatActiveRun: "chat:active-run",
  chatCancelRun: "chat:cancel-run",
  chatCreateConversation: "chat:create-conversation",
  chatDeleteConversation: "chat:delete-conversation",
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
  chatSetConversationPinned: "chat:set-conversation-pinned",
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
  semanticGraphCartographerModelOptionsList: "semantic-graph:cartographer-model-options-list",
  semanticGraphCartographerPatchAccept: "semantic-graph:cartographer-patch-accept",
  semanticGraphCartographerPatchList: "semantic-graph:cartographer-patch-list",
  semanticGraphCartographerPatchReject: "semantic-graph:cartographer-patch-reject",
  semanticGraphCartographerProcessingState: "semantic-graph:cartographer-processing-state",
  semanticGraphCartographerRunList: "semantic-graph:cartographer-run-list",
  semanticGraphCartographerRunRead: "semantic-graph:cartographer-run-read",
  semanticGraphCartographerSettingsRead: "semantic-graph:cartographer-settings-read",
  semanticGraphCartographerSettingsMetadata: "semantic-graph:cartographer-settings-metadata",
  semanticGraphCartographerSettingsUpdate: "semantic-graph:cartographer-settings-update",
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
  semanticGraphWorkingSetRead: "semantic-graph:working-set-read",
  semanticGraphUpdateEdge: "semantic-graph:update-edge",
  semanticGraphUpdateNode: "semantic-graph:update-node",
  semanticGraphUpdateSteeringDirective: "semantic-graph:update-steering-directive",
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
  workflowAddEdge: "workflow:add-edge",
  workflowAddNode: "workflow:add-node",
  workflowCreateDefinition: "workflow:create-definition",
  workflowDeleteDefinition: "workflow:delete-definition",
  workflowDeleteEdges: "workflow:delete-edges",
  workflowDeleteNodes: "workflow:delete-nodes",
  workflowExecutionEvents: "workflow:execution-events",
  workflowGraphProjection: "workflow:graph-projection",
  workflowListDefinitions: "workflow:list-definitions",
  workflowReadDefinition: "workflow:read-definition",
  workflowReadExecution: "workflow:read-execution",
  workflowStartExecution: "workflow:start-execution",
  workflowSubmitApproval: "workflow:submit-approval",
  workflowUpdateDefinition: "workflow:update-definition",
  workflowUpdateDefinitionLayout: "workflow:update-definition-layout",
  workflowUpdateDefinitionSettings: "workflow:update-definition-settings",
  workflowUpdateEdge: "workflow:update-edge",
  workflowUpdateNode: "workflow:update-node",
  workflowValidateDefinition: "workflow:validate-definition",
  workflowValidateDefinitionDraft: "workflow:validate-definition-draft",
  workspaceClose: "workspace:close",
  workspaceOpenLocalFolder: "workspace:open-local-folder",
  workspaceOpenPath: "workspace:open-path",
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
  semanticGraphEvent: "semantic-graph:event",
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
  chatDeleteConversation: {
    args: [workspaceId: string, conversationId: string];
    result: ListConversationsResponse;
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
  semanticGraphCartographerModelOptionsList: {
    args: [request: ListSemanticCartographerModelOptionsRequest];
    result: ChatModelOption[];
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
  semanticGraphCartographerSettingsRead: {
    args: [request: ReadSemanticCartographerSettingsRequest];
    result: SemanticCartographerSettingsRecord;
  };
  semanticGraphCartographerSettingsMetadata: {
    args: [request: ReadSemanticCartographerSettingsMetadataRequest];
    result: SemanticCartographerSettingsMetadata;
  };
  semanticGraphCartographerSettingsUpdate: {
    args: [request: UpdateSemanticCartographerSettingsRequest];
    result: SemanticCartographerSettingsRecord;
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
  semanticGraphWorkingSetRead: {
    args: [request: ReadSemanticWorkingSetRequest];
    result: SemanticWorkingSet;
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
  workflowAddEdge: {
    args: [request: AddWorkflowEdgeRequest];
    result: WorkflowGraphProjection;
  };
  workflowAddNode: {
    args: [request: AddWorkflowNodeRequest];
    result: WorkflowGraphProjection;
  };
  workflowCreateDefinition: {
    args: [workspaceId: string, name: string, description: string, graph: WorkflowGraph];
    result: WorkflowDefinition;
  };
  workflowDeleteDefinition: {
    args: [workspaceId: string, definitionId: string];
    result: DeleteWorkflowDefinitionResponse;
  };
  workflowDeleteEdges: {
    args: [request: DeleteWorkflowEdgesRequest];
    result: WorkflowGraphProjection;
  };
  workflowDeleteNodes: {
    args: [request: DeleteWorkflowNodesRequest];
    result: WorkflowGraphProjection;
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
    args: [request: UpdateWorkflowDefinitionRequest];
    result: WorkflowDefinition;
  };
  workflowUpdateDefinitionLayout: {
    args: [request: UpdateWorkflowDefinitionLayoutRequest];
    result: WorkflowGraphProjection;
  };
  workflowUpdateDefinitionSettings: {
    args: [request: UpdateWorkflowDefinitionSettingsRequest];
    result: WorkflowDefinition;
  };
  workflowUpdateEdge: {
    args: [request: UpdateWorkflowEdgeRequest];
    result: WorkflowGraphProjection;
  };
  workflowUpdateNode: {
    args: [request: UpdateWorkflowNodeRequest];
    result: WorkflowGraphProjection;
  };
  workflowValidateDefinition: {
    args: [workspaceId: string, graph: WorkflowGraph];
    result: WorkflowValidationResult;
  };
  workflowValidateDefinitionDraft: {
    args: [request: ValidateWorkflowDefinitionDraftRequest];
    result: WorkflowGraphProjection;
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
  workspaceReadUILayout: {
    args: [workspaceId: string];
    result: WorkspaceUILayoutReadResult;
  };
  workspaceRemoveRecent: {
    args: [id: string];
    result: WorkspaceSession;
  };
  workspaceReorder: {
    args: [ids: string[]];
    result: WorkspaceSession;
  };
  workspaceSaveUILayout: {
    args: [layout: WorkspaceUILayout];
    result: WorkspaceUILayout;
  };
  workspaceSelect: {
    args: [id: string];
    result: WorkspaceSession;
  };
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
