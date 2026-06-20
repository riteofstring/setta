package httpapi

import (
	"net/http"
	"reflect"

	"setta/internal/appearance"
	"setta/internal/chat"
	"setta/internal/codexaccount"
	"setta/internal/orchestrator"
	"setta/internal/semanticgraph"
	"setta/internal/terminal"
	"setta/internal/workspacesession"
	"setta/internal/workspacetrajectory"
	"setta/internal/workspaceui"
)

type ContractSchema struct {
	Endpoints      []ContractEndpoint
	ErrorResponses []reflect.Type
}

type ContractEndpoint struct {
	Name        string
	Method      string
	Path        string
	Request     reflect.Type
	Response    reflect.Type
	StreamEvent reflect.Type
	Streaming   bool
}

type endpoint struct {
	ContractEndpoint
	Handler routeHandler
}

type routeHandler func(handler, http.ResponseWriter, *http.Request)

var apiEndpoints = []endpoint{
	get[BackendHealth]("BackendHealth", "/health", handler.health),
	get[appearance.AppearanceSettings]("ReadAppearanceSettings", "/appearance/settings", handler.readAppearanceSettings),
	get[appearance.AppearancePresetList]("ReadAppearancePresets", "/appearance/presets", handler.readAppearancePresets),
	post[UpdateAppearanceSettingsRequest, appearance.AppearanceSettings]("UpdateAppearanceSettings", "/appearance/settings", handler.updateAppearanceSettings),
	get[workspacesession.WorkspaceSession]("WorkspaceSession", "/workspace-session", handler.workspaceSession),
	get[WorkspaceSelectedConversations]("WorkspaceSelectedConversations", "/workspaces/selected-conversations", handler.workspaceSelectedConversations),
	post[OpenWorkspaceRequest, OpenWorkspaceResponse]("OpenWorkspace", "/workspaces/open", handler.openWorkspace),
	post[SelectWorkspaceRequest, workspacesession.WorkspaceSession]("SelectWorkspace", "/workspaces/select", handler.selectWorkspace),
	post[SetWorkspaceSelectedConversationRequest, WorkspaceSelectedConversations]("SetWorkspaceSelectedConversation", "/workspaces/selected-conversation", handler.setWorkspaceSelectedConversation),
	post[CloseWorkspaceRequest, workspacesession.WorkspaceSession]("CloseWorkspace", "/workspaces/close", handler.closeWorkspace),
	post[ReorderWorkspaceRequest, workspacesession.WorkspaceSession]("ReorderWorkspace", "/workspaces/reorder", handler.reorderWorkspaces),
	post[RemoveRecentWorkspaceRequest, workspacesession.WorkspaceSession]("RemoveRecentWorkspace", "/workspaces/remove-recent", handler.removeRecentWorkspace),
	post[ReadWorkspaceUILayoutRequest, workspaceui.WorkspaceUILayoutReadResult]("ReadWorkspaceUILayout", "/workspaces/ui/layout/read", handler.readWorkspaceUILayout),
	post[SaveWorkspaceUILayoutRequest, workspaceui.WorkspaceUILayout]("SaveWorkspaceUILayout", "/workspaces/ui/layout/save", handler.saveWorkspaceUILayout),
	post[ListConversationsRequest, ListConversationsResponse]("ListConversations", "/chat/conversations/list", handler.listConversations),
	post[CreateConversationRequest, chat.Conversation]("CreateConversation", "/chat/conversations/create", handler.createConversation),
	post[DeleteConversationRequest, ListConversationsResponse]("DeleteConversation", "/chat/conversations/delete", handler.deleteConversation),
	post[MarkConversationReadRequest, chat.ConversationListItem]("MarkConversationRead", "/chat/conversations/mark-read", handler.markConversationRead),
	post[SetConversationPinnedRequest, chat.ConversationListItem]("SetConversationPinned", "/chat/conversations/pin", handler.setConversationPinned),
	post[GetMessagePageRequest, chat.MessagePage]("GetMessagePage", "/chat/messages/page", handler.getMessagePage),
	post[SendChatMessageRequest, chat.SendMessageResult]("SendChatMessage", "/chat/messages/send", handler.sendChatMessage),
	post[QueueChatMessageRequest, chat.QueueMessageResult]("QueueChatMessage", "/chat/messages/queue", handler.queueChatMessage),
	post[EditQueuedChatMessageRequest, chat.QueueEditResult]("EditQueuedChatMessage", "/chat/messages/queue/edit", handler.editQueuedChatMessage),
	post[RemoveQueuedChatMessageRequest, chat.QueueRemoveResult]("RemoveQueuedChatMessage", "/chat/messages/queue/remove", handler.removeQueuedChatMessage),
	post[SteerChatMessageRequest, chat.SteerMessageResult]("SteerChatMessage", "/chat/messages/steer", handler.steerChatMessage),
	post[SendSteeringImmediatelyRequest, chat.ImmediateSteeringResult]("SendSteeringImmediately", "/chat/messages/steer/immediate", handler.sendSteeringImmediately),
	post[ListChatCommandsRequest, chat.ChatCommandListResult]("ListChatCommands", "/chat/commands/list", handler.listChatCommands),
	post[ExecuteChatCommandRequest, chat.ChatCommandExecuteResult]("ExecuteChatCommand", "/chat/commands/execute", handler.executeChatCommand),
	post[SetChatCodexModelRequest, chat.ChatCommandExecuteResult]("SetChatCodexModel", "/chat/codex/model/set", handler.setChatCodexModel),
	post[SetChatCodexReasoningEffortRequest, chat.ChatCommandExecuteResult]("SetChatCodexReasoningEffort", "/chat/codex/reasoning-effort/set", handler.setChatCodexReasoningEffort),
	post[CancelRunRequest, chat.Run]("CancelRun", "/chat/runs/cancel", handler.cancelRun),
	post[GetActiveRunRequest, GetActiveRunResponse]("GetActiveRun", "/chat/runs/active", handler.getActiveRun),
	post[ListRunsRequest, ListRunsResponse]("ListRuns", "/chat/runs/list", handler.listRuns),
	post[GetRunActivityRequest, chat.RunActivityPage]("GetRunActivity", "/chat/runs/activity", handler.getRunActivity),
	post[GetRunItemOutputRequest, chat.RunItemOutputPage]("GetRunItemOutputPage", "/chat/runs/item-output", handler.getRunItemOutput),
	post[ListDiagnosticsRequest, ListDiagnosticsResponse]("ListDiagnostics", "/chat/diagnostics/list", handler.listDiagnostics),
	post[SubmitApprovalRequest, chat.Run]("SubmitApproval", "/chat/approvals/submit", handler.submitApproval),
	post[ListWorkflowDefinitionsRequest, ListWorkflowDefinitionsResponse]("ListWorkflowDefinitions", "/workflows/definitions/list", handler.listWorkflowDefinitions),
	post[CreateWorkflowDefinitionRequest, orchestrator.WorkflowDefinition]("CreateWorkflowDefinition", "/workflows/definitions/create", handler.createWorkflowDefinition),
	post[ReadWorkflowDefinitionRequest, orchestrator.WorkflowDefinition]("ReadWorkflowDefinition", "/workflows/definitions/read", handler.readWorkflowDefinition),
	post[UpdateWorkflowDefinitionRequest, orchestrator.WorkflowDefinition]("UpdateWorkflowDefinition", "/workflows/definitions/update", handler.updateWorkflowDefinition),
	post[DeleteWorkflowDefinitionRequest, DeleteWorkflowDefinitionResponse]("DeleteWorkflowDefinition", "/workflows/definitions/delete", handler.deleteWorkflowDefinition),
	post[ValidateWorkflowDefinitionRequest, orchestrator.WorkflowValidationResult]("ValidateWorkflowDefinition", "/workflows/definitions/validate", handler.validateWorkflowDefinition),
	post[ValidateWorkflowDefinitionDraftRequest, orchestrator.WorkflowGraphProjection]("ValidateWorkflowDefinitionDraft", "/workflows/definitions/validate-draft", handler.validateWorkflowDefinitionDraft),
	post[UpdateWorkflowDefinitionLayoutRequest, orchestrator.WorkflowGraphProjection]("UpdateWorkflowDefinitionLayout", "/workflows/definitions/layout", handler.updateWorkflowDefinitionLayout),
	post[AddWorkflowNodeRequest, orchestrator.WorkflowGraphProjection]("AddWorkflowNode", "/workflows/definitions/nodes/add", handler.addWorkflowNode),
	post[AddWorkflowEdgeRequest, orchestrator.WorkflowGraphProjection]("AddWorkflowEdge", "/workflows/definitions/edges/add", handler.addWorkflowEdge),
	post[DeleteWorkflowNodesRequest, orchestrator.WorkflowGraphProjection]("DeleteWorkflowNodes", "/workflows/definitions/nodes/delete", handler.deleteWorkflowNodes),
	post[DeleteWorkflowEdgesRequest, orchestrator.WorkflowGraphProjection]("DeleteWorkflowEdges", "/workflows/definitions/edges/delete", handler.deleteWorkflowEdges),
	post[UpdateWorkflowNodeRequest, orchestrator.WorkflowGraphProjection]("UpdateWorkflowNode", "/workflows/definitions/nodes/update", handler.updateWorkflowNode),
	post[UpdateWorkflowEdgeRequest, orchestrator.WorkflowGraphProjection]("UpdateWorkflowEdge", "/workflows/definitions/edges/update", handler.updateWorkflowEdge),
	post[UpdateWorkflowDefinitionSettingsRequest, orchestrator.WorkflowDefinition]("UpdateWorkflowDefinitionSettings", "/workflows/definitions/settings", handler.updateWorkflowDefinitionSettings),
	post[StartWorkflowExecutionRequest, orchestrator.WorkflowExecution]("StartWorkflowExecution", "/workflows/executions/start", handler.startWorkflowExecution),
	post[CancelWorkflowExecutionRequest, orchestrator.WorkflowExecution]("CancelWorkflowExecution", "/workflows/executions/cancel", handler.cancelWorkflowExecution),
	post[ReadWorkflowExecutionRequest, orchestrator.WorkflowExecution]("ReadWorkflowExecution", "/workflows/executions/read", handler.readWorkflowExecution),
	post[ReadWorkflowGraphProjectionRequest, ReadWorkflowGraphProjectionResponse]("ReadWorkflowGraphProjection", "/workflows/graph/read", handler.readWorkflowGraphProjection),
	post[ReadWorkflowGraphViewLayoutRequest, orchestrator.WorkflowGraphViewLayout]("ReadWorkflowGraphViewLayout", "/workflows/graph/view-layout/read", handler.readWorkflowGraphViewLayout),
	post[UpdateWorkflowGraphViewLayoutRequest, orchestrator.WorkflowGraphViewLayout]("UpdateWorkflowGraphViewLayout", "/workflows/graph/view-layout/update", handler.updateWorkflowGraphViewLayout),
	post[GetWorkflowExecutionEventsRequest, orchestrator.WorkflowExecutionEventPage]("GetWorkflowExecutionEvents", "/workflows/executions/events", handler.getWorkflowExecutionEvents),
	post[SubmitWorkflowApprovalRequest, orchestrator.WorkflowExecution]("SubmitWorkflowApproval", "/workflows/approvals/submit", handler.submitWorkflowApproval),
	stream("WorkflowEventStream", "/workflows/events", handler.workflowEventStream),
	post[ReadWorkspaceTrajectoryRuntimeSnapshotRequest, workspacetrajectory.WorkspaceTrajectoryRuntimeSnapshot]("ReadWorkspaceTrajectoryRuntimeSnapshot", "/workspace-trajectory/runtime/snapshot", handler.readWorkspaceTrajectoryRuntimeSnapshot),
	streamEvent[workspacetrajectory.WorkspaceTrajectoryRuntimeEvent]("WorkspaceTrajectoryRuntimeEventStream", "/workspace-trajectory/runtime/events", handler.workspaceTrajectoryRuntimeEventStream),
	post[ReadSemanticGraphRequest, semanticgraph.SemanticGraph]("ReadSemanticGraph", "/semantic-graph/read", handler.readSemanticGraph),
	post[ReadSemanticNodeDetailRequest, ReadSemanticNodeDetailResponse]("ReadSemanticNodeDetail", "/semantic-graph/nodes/detail", handler.readSemanticNodeDetail),
	post[ListSemanticEvidenceRequest, semanticgraph.SemanticEvidenceList]("ListSemanticEvidence", "/semantic-graph/evidence/list", handler.listSemanticEvidence),
	post[ListSemanticActivityRequest, semanticgraph.SemanticActivityList]("ListSemanticActivity", "/semantic-graph/activity/list", handler.listSemanticActivity),
	post[ListSemanticActivityPageRequest, semanticgraph.SemanticActivityPage]("ListSemanticActivityPage", "/semantic-graph/activity/page", handler.listSemanticActivityPage),
	post[ReadSemanticActivitySummaryRequest, semanticgraph.SemanticActivitySummary]("ReadSemanticActivitySummary", "/semantic-graph/activity/summary", handler.readSemanticActivitySummary),
	post[ReadSemanticRuntimeSnapshotRequest, semanticgraph.SemanticRuntimeSnapshot]("ReadSemanticRuntimeSnapshot", "/semantic-graph/runtime/snapshot", handler.readSemanticRuntimeSnapshot),
	post[ReadSemanticWorkingSetRequest, semanticgraph.SemanticWorkingSet]("ReadSemanticWorkingSet", "/semantic-graph/working-set/read", handler.readSemanticWorkingSet),
	post[ReadSemanticSteeringStateRequest, semanticgraph.SemanticSteeringState]("ReadSemanticSteeringState", "/semantic-graph/steering/read", handler.readSemanticSteeringState),
	post[ReadSemanticEventHistoryRequest, semanticgraph.SemanticEventHistory]("ReadSemanticEventHistory", "/semantic-graph/events/history", handler.readSemanticEventHistory),
	post[ReadSemanticContextPackRequest, semanticgraph.SemanticContextPackReadResponse]("ReadSemanticContextPack", "/semantic-graph/context-packs/read", handler.readSemanticContextPack),
	post[ListSemanticContextPacksRequest, semanticgraph.SemanticContextPackList]("ListSemanticContextPacks", "/semantic-graph/context-packs/list", handler.listSemanticContextPacks),
	post[BuildCartographerWindowRequest, semanticgraph.CartographerWindowBuildResult]("BuildCartographerWindow", "/semantic-graph/cartographer/windows/build", handler.buildCartographerWindow),
	post[ProcessCartographerWindowRequest, semanticgraph.CartographerWindowProcessResult]("ProcessCartographerWindow", "/semantic-graph/cartographer/windows/process", handler.processCartographerWindow),
	post[ReadSemanticCartographerSettingsRequest, semanticgraph.SemanticCartographerSettingsRecord]("ReadSemanticCartographerSettings", "/semantic-graph/cartographer/settings/read", handler.readSemanticCartographerSettings),
	post[ReadSemanticCartographerSettingsMetadataRequest, semanticgraph.SemanticCartographerSettingsMetadata]("ReadSemanticCartographerSettingsMetadata", "/semantic-graph/cartographer/settings/metadata", handler.readSemanticCartographerSettingsMetadata),
	post[UpdateSemanticCartographerSettingsRequest, semanticgraph.SemanticCartographerSettingsRecord]("UpdateSemanticCartographerSettings", "/semantic-graph/cartographer/settings/update", handler.updateSemanticCartographerSettings),
	post[ListSemanticCartographerModelOptionsRequest, []chat.ChatModelOption]("ListSemanticCartographerModelOptions", "/semantic-graph/cartographer/model-options/list", handler.listSemanticCartographerModelOptions),
	post[ReadCartographerProcessingStateRequest, semanticgraph.CartographerProcessingState]("ReadCartographerProcessingState", "/semantic-graph/cartographer/processing/state", handler.readCartographerProcessingState),
	post[ReadCartographerRunRequest, semanticgraph.CartographerRunReadResponse]("ReadCartographerRun", "/semantic-graph/cartographer/runs/read", handler.readCartographerRun),
	post[ListCartographerRunsRequest, semanticgraph.CartographerRunList]("ListCartographerRuns", "/semantic-graph/cartographer/runs/list", handler.listCartographerRuns),
	post[ListCartographerWindowsRequest, semanticgraph.CartographerWindowList]("ListCartographerWindows", "/semantic-graph/cartographer/windows/list", handler.listCartographerWindows),
	post[ListCartographerCursorsRequest, semanticgraph.CartographerCursorList]("ListCartographerCursors", "/semantic-graph/cartographer/cursors/list", handler.listCartographerCursors),
	post[ListCartographerPatchesRequest, semanticgraph.CartographerPatchList]("ListCartographerPatches", "/semantic-graph/cartographer/patches/list", handler.listCartographerPatches),
	post[ReviewCartographerPatchRequest, semanticgraph.CartographerPatchReviewResult]("AcceptCartographerPatch", "/semantic-graph/cartographer/patches/accept", handler.acceptCartographerPatch),
	post[ReviewCartographerPatchRequest, semanticgraph.CartographerPatchReviewResult]("RejectCartographerPatch", "/semantic-graph/cartographer/patches/reject", handler.rejectCartographerPatch),
	post[UpdateSemanticLayoutPositionsRequest, semanticgraph.SemanticLayoutPositionList]("UpdateSemanticLayoutPositions", "/semantic-graph/layout/update", handler.updateSemanticLayoutPositions),
	post[AttachSemanticNodeToWorkflowExecutionRequest, semanticgraph.SemanticAttachmentResult]("AttachSemanticNodeToWorkflowExecution", "/semantic-graph/attachments/workflow-execution", handler.attachSemanticNodeToWorkflowExecution),
	post[AttachSemanticNodeToWorkflowNodeRequest, semanticgraph.SemanticAttachmentResult]("AttachSemanticNodeToWorkflowNode", "/semantic-graph/attachments/workflow-node", handler.attachSemanticNodeToWorkflowNode),
	post[AttachSemanticNodeToChatRunRequest, semanticgraph.SemanticAttachmentResult]("AttachSemanticNodeToChatRun", "/semantic-graph/attachments/chat-run", handler.attachSemanticNodeToChatRun),
	post[AttachSemanticNodeToChatMessageRequest, semanticgraph.SemanticAttachmentResult]("AttachSemanticNodeToChatMessage", "/semantic-graph/attachments/chat-message", handler.attachSemanticNodeToChatMessage),
	post[AttachSemanticNodeToRunItemRequest, semanticgraph.SemanticAttachmentResult]("AttachSemanticNodeToRunItem", "/semantic-graph/attachments/run-item", handler.attachSemanticNodeToRunItem),
	post[AttachSemanticNodeToFileRangeRequest, semanticgraph.SemanticAttachmentResult]("AttachSemanticNodeToFileRange", "/semantic-graph/attachments/file-range", handler.attachSemanticNodeToFileRange),
	post[EndSemanticActivityRequest, semanticgraph.SemanticActivityEndResult]("EndSemanticActivity", "/semantic-graph/activity/end", handler.endSemanticActivity),
	post[RenameSemanticNodeRequest, semanticgraph.SemanticMutationResult]("RenameSemanticNode", "/semantic-graph/nodes/rename", handler.renameSemanticNode),
	post[UpdateSemanticNodeRequest, semanticgraph.SemanticMutationResult]("UpdateSemanticNode", "/semantic-graph/nodes/update", handler.updateSemanticNode),
	post[SemanticNodeOperationRequest, semanticgraph.SemanticMutationResult]("DismissSemanticNode", "/semantic-graph/nodes/dismiss", handler.dismissSemanticNode),
	post[SemanticNodeOperationRequest, semanticgraph.SemanticMutationResult]("PromoteSemanticNode", "/semantic-graph/nodes/promote", handler.promoteSemanticNode),
	post[SplitSemanticNodeRequest, semanticgraph.SemanticMutationResult]("SplitSemanticNode", "/semantic-graph/nodes/split", handler.splitSemanticNode),
	post[MergeSemanticNodesRequest, semanticgraph.SemanticMutationResult]("MergeSemanticNodes", "/semantic-graph/nodes/merge", handler.mergeSemanticNodes),
	post[CreateSemanticNodeRequest, semanticgraph.SemanticMutationResult]("CreateSemanticNode", "/semantic-graph/nodes/create", handler.createSemanticNode),
	post[CreateSemanticEdgeRequest, semanticgraph.SemanticMutationResult]("CreateSemanticEdge", "/semantic-graph/edges/create", handler.createSemanticEdge),
	post[UpdateSemanticEdgeRequest, semanticgraph.SemanticMutationResult]("UpdateSemanticEdge", "/semantic-graph/edges/update", handler.updateSemanticEdge),
	post[SemanticEdgeOperationRequest, semanticgraph.SemanticMutationResult]("RemoveSemanticEdge", "/semantic-graph/edges/remove", handler.removeSemanticEdge),
	post[CreateSemanticSteeringDirectiveRequest, semanticgraph.SemanticMutationResult]("CreateSemanticSteeringDirective", "/semantic-graph/steering/create", handler.createSemanticSteeringDirective),
	post[UpdateSemanticSteeringDirectiveRequest, semanticgraph.SemanticMutationResult]("UpdateSemanticSteeringDirective", "/semantic-graph/steering/update", handler.updateSemanticSteeringDirective),
	streamEvent[semanticgraph.SemanticGraphChangeEvent]("SemanticGraphChangeEventStream", "/semantic-graph/events/changes", handler.semanticGraphChangeEventStream),
	post[CreateTerminalRequest, TerminalSessionResponse]("CreateTerminal", "/terminals/create", handler.createTerminal),
	post[AttachTerminalRequest, TerminalSessionResponse]("AttachTerminal", "/terminals/attach", handler.attachTerminal),
	post[TerminalInputRequest, TerminalInputResponse]("TerminalInput", "/terminals/input", handler.terminalInput),
	post[ResizeTerminalRequest, TerminalSessionResponse]("ResizeTerminal", "/terminals/resize", handler.resizeTerminal),
	post[CloseTerminalRequest, TerminalSessionResponse]("CloseTerminal", "/terminals/close", handler.closeTerminal),
	get[terminal.TerminalProfileList]("ListTerminalProfiles", "/terminals/profiles", handler.listTerminalProfiles),
	post[CreateTerminalProfileRequest, terminal.TerminalProfileList]("CreateTerminalProfile", "/terminals/profiles/create", handler.createTerminalProfile),
	post[UpdateTerminalProfileRequest, terminal.TerminalProfileList]("UpdateTerminalProfile", "/terminals/profiles/update", handler.updateTerminalProfile),
	post[DeleteTerminalProfileRequest, terminal.TerminalProfileList]("DeleteTerminalProfile", "/terminals/profiles/delete", handler.deleteTerminalProfile),
	post[SelectDefaultTerminalProfileRequest, terminal.TerminalProfileList]("SelectDefaultTerminalProfile", "/terminals/profiles/default", handler.selectDefaultTerminalProfile),
	streamEvent[terminal.TerminalEvent]("TerminalEventStream", "/terminals/events", handler.terminalEventStream),
	get[codexaccount.CodexAccountState]("ReadCodexAccount", "/codex/account", handler.readCodexAccount),
	post[codexaccount.RefreshCodexAccountRequest, codexaccount.CodexAccountState]("RefreshCodexAccount", "/codex/account/refresh", handler.refreshCodexAccount),
	post[codexaccount.StartCodexLoginRequest, codexaccount.StartCodexLoginResponse]("StartCodexLogin", "/codex/account/login/start", handler.startCodexLogin),
	post[codexaccount.CancelCodexLoginRequest, codexaccount.CodexAccountState]("CancelCodexLogin", "/codex/account/login/cancel", handler.cancelCodexLogin),
	post[codexaccount.LogoutCodexAccountRequest, codexaccount.CodexAccountState]("LogoutCodexAccount", "/codex/account/logout", handler.logoutCodexAccount),
	stream("EventStream", "/events", handler.eventStream),
}

func Contracts() ContractSchema {
	endpoints := make([]ContractEndpoint, len(apiEndpoints))
	for index, endpoint := range apiEndpoints {
		endpoints[index] = endpoint.ContractEndpoint
	}
	return ContractSchema{
		Endpoints:      endpoints,
		ErrorResponses: []reflect.Type{reflect.TypeFor[ErrorResponse]()},
	}
}

func registerEndpoints(mux *http.ServeMux, apiHandler handler) {
	for _, endpoint := range apiEndpoints {
		route := endpoint
		mux.HandleFunc(route.Method+" "+route.Path, func(response http.ResponseWriter, request *http.Request) {
			route.Handler(apiHandler, response, request)
		})
	}
}

func get[Response any](name string, path string, handler routeHandler) endpoint {
	return endpoint{
		ContractEndpoint: ContractEndpoint{
			Name:     name,
			Method:   http.MethodGet,
			Path:     path,
			Response: reflect.TypeFor[Response](),
		},
		Handler: handler,
	}
}

func stream(name string, path string, handler routeHandler) endpoint {
	return endpoint{
		ContractEndpoint: ContractEndpoint{
			Name:      name,
			Method:    http.MethodGet,
			Path:      path,
			Streaming: true,
		},
		Handler: handler,
	}
}

func streamEvent[StreamEvent any](name string, path string, handler routeHandler) endpoint {
	return endpoint{
		ContractEndpoint: ContractEndpoint{
			Name:        name,
			Method:      http.MethodGet,
			Path:        path,
			StreamEvent: reflect.TypeFor[StreamEvent](),
			Streaming:   true,
		},
		Handler: handler,
	}
}

func post[Request any, Response any](name string, path string, handler routeHandler) endpoint {
	return endpoint{
		ContractEndpoint: ContractEndpoint{
			Name:     name,
			Method:   http.MethodPost,
			Path:     path,
			Request:  reflect.TypeFor[Request](),
			Response: reflect.TypeFor[Response](),
		},
		Handler: handler,
	}
}
