package httpapi

import (
	"context"
	"net/http"

	"setta/internal/appearance"
	"setta/internal/chat"
	"setta/internal/codexaccount"
	"setta/internal/orchestrator"
	"setta/internal/semanticgraph"
	"setta/internal/terminal"
	"setta/internal/workspace"
	"setta/internal/workspacesession"
	"setta/internal/workspaceui"
)

type AppearanceService interface {
	Read(context.Context) (appearance.AppearanceSettings, error)
	Update(context.Context, appearance.AppearanceSettings) (appearance.AppearanceSettings, error)
}

type WorkspaceService interface {
	Close(id string) (workspacesession.WorkspaceSession, error)
	OpenLocalFolder(rootPath string) (workspace.WorkspaceSummary, workspacesession.WorkspaceSession, error)
	RemoveRecent(id string) (workspacesession.WorkspaceSession, error)
	Reorder(ids []string) (workspacesession.WorkspaceSession, error)
	Select(id string) (workspacesession.WorkspaceSession, error)
	SelectedConversationIDs() map[string]string
	SetSelectedConversation(workspaceID string, conversationID string) (map[string]string, error)
	Session() workspacesession.WorkspaceSession
}

type WorkspaceUIService interface {
	ReadLayout(workspaceID string) (workspaceui.WorkspaceUILayoutReadResult, error)
	SaveLayout(layout workspaceui.WorkspaceUILayout) (workspaceui.WorkspaceUILayout, error)
}

type ChatService interface {
	ActiveRun(workspaceID string, conversationID string) (chat.Run, bool, error)
	CancelActiveRun(workspaceID string, conversationID string) (chat.Run, error)
	CreateConversation(workspaceID string, title string) (chat.Conversation, error)
	DeleteConversation(workspaceID string, conversationID string) (chat.ConversationListResult, error)
	ListDiagnostics(workspaceID string, conversationID string, runID string) ([]chat.Diagnostic, error)
	ListConversations(workspaceID string) (chat.ConversationListResult, error)
	MarkConversationRead(workspaceID string, conversationID string) (chat.ConversationListItem, error)
	ListRuns(workspaceID string, conversationID string) ([]chat.Run, error)
	LoadMessagePage(workspaceID string, conversationID string, beforeOrdinal int, limit int) (chat.MessagePage, error)
	LoadRunActivityPage(workspaceID string, runID string, limit int) (chat.RunActivityPage, error)
	LoadRunItemOutputPage(workspaceID string, runID string, runItemID string, afterOrdinal int, limit int) (chat.RunItemOutputPage, error)
	ExecuteChatCommand(workspaceID string, conversationID string, raw string) (chat.ChatCommandExecuteResult, error)
	ExecuteChatCommandWithOptions(workspaceID string, conversationID string, raw string, options chat.ChatCommandExecutionOptions) (chat.ChatCommandExecuteResult, error)
	EditQueuedMessage(workspaceID string, conversationID string, messageID string, prompt string) (chat.QueueEditResult, error)
	ListCommands(workspaceID string, conversationID string) (chat.ChatCommandListResult, error)
	QueueUserMessage(workspaceID string, conversationID string, prompt string) (chat.QueueMessageResult, error)
	RemoveQueuedMessage(workspaceID string, conversationID string, messageID string) (chat.QueueRemoveResult, error)
	SendUserMessage(workspaceID string, conversationID string, prompt string) (chat.SendMessageResult, error)
	SendSteeringImmediately(workspaceID string, conversationID string, prompt string) (chat.ImmediateSteeringResult, error)
	SetChatCodexModel(workspaceID string, conversationID string, modelID string) (chat.ChatCommandExecuteResult, error)
	SetChatCodexReasoningEffort(workspaceID string, conversationID string, effort chat.ReasoningEffort) (chat.ChatCommandExecuteResult, error)
	SetConversationPinned(workspaceID string, conversationID string, pinned bool) (chat.ConversationListItem, error)
	SteerActiveRun(workspaceID string, conversationID string, prompt string) (chat.SteerMessageResult, error)
	SubscribeEvents(cursor chat.EventCursor) (*chat.EventSubscription, error)
	SubmitApproval(workspaceID string, conversationID string, approvalID string, approved bool, response string, answers []chat.ApprovalAnswer, cancelled bool) (chat.Run, error)
}

type CodexAccountService interface {
	CancelLogin(context.Context, codexaccount.CancelCodexLoginRequest) (codexaccount.CodexAccountState, error)
	Logout(context.Context, codexaccount.LogoutCodexAccountRequest) (codexaccount.CodexAccountState, error)
	Read(context.Context) (codexaccount.CodexAccountState, error)
	Refresh(context.Context, codexaccount.RefreshCodexAccountRequest) (codexaccount.CodexAccountState, error)
	StartLogin(context.Context, codexaccount.StartCodexLoginRequest) (codexaccount.StartCodexLoginResponse, error)
}

type WorkflowService interface {
	AddDefinitionEdge(workspaceID string, definitionID string, expectedRevision string, connection orchestrator.WorkflowDraftEdgeConnection) (orchestrator.WorkflowGraphProjection, error)
	AddDefinitionNode(workspaceID string, definitionID string, expectedRevision string, nodeType orchestrator.WorkflowDraftNodeType, position orchestrator.WorkflowDraftNodePosition) (orchestrator.WorkflowGraphProjection, error)
	CancelExecution(workspaceID string, executionID string) (orchestrator.WorkflowExecution, error)
	CreateDefinition(workspaceID string, name string, description string, graph orchestrator.WorkflowGraph) (orchestrator.WorkflowDefinition, error)
	DeleteDefinition(workspaceID string, definitionID string) error
	DeleteDefinitionNodes(workspaceID string, definitionID string, expectedRevision string, nodeIDs []string) (orchestrator.WorkflowGraphProjection, error)
	ListDefinitions(workspaceID string) ([]orchestrator.WorkflowDefinition, error)
	ReadDefinition(workspaceID string, definitionID string) (orchestrator.WorkflowDefinition, error)
	ReadExecution(workspaceID string, executionID string) (orchestrator.WorkflowExecution, error)
	ReadExecutionEventPage(workspaceID string, executionID string, beforeOrdinal int, limit int) (orchestrator.WorkflowExecutionEventPage, error)
	ReadGraphProjection(workspaceID string, definitionID string, versionID string, executionID string) (orchestrator.WorkflowGraphProjection, bool, error)
	StartExecution(workspaceID string, definitionID string, versionID string) (orchestrator.WorkflowExecution, error)
	SubscribeEvents(cursor orchestrator.WorkflowEventCursor) (*orchestrator.EventSubscription, error)
	SubmitApproval(workspaceID string, executionID string, nodeExecutionID string, approvalID string, approved bool, response string, answers []chat.ApprovalAnswer, cancelled bool) (orchestrator.WorkflowExecution, error)
	UpdateDefinition(workspaceID string, definitionID string, expectedRevision string, name string, description string, graph orchestrator.WorkflowGraph) (orchestrator.WorkflowDefinition, error)
	UpdateDefinitionEdge(workspaceID string, definitionID string, expectedRevision string, edge orchestrator.WorkflowEdge) (orchestrator.WorkflowGraphProjection, error)
	ValidateDefinition(workspaceID string, graph orchestrator.WorkflowGraph) (orchestrator.WorkflowValidationResult, error)
	ValidateDefinitionDraft(workspaceID string, definitionID string, expectedRevision string) (orchestrator.WorkflowGraphProjection, error)
	UpdateDefinitionLayout(workspaceID string, definitionID string, expectedRevision string, positions []orchestrator.WorkflowGraphNodeLayout) (orchestrator.WorkflowGraphProjection, error)
	UpdateDefinitionNode(workspaceID string, definitionID string, expectedRevision string, node orchestrator.WorkflowNode) (orchestrator.WorkflowGraphProjection, error)
	UpdateDefinitionSettings(workspaceID string, definitionID string, expectedRevision string, name string, description string) (orchestrator.WorkflowDefinition, error)
}

type SemanticGraphService interface {
	ReadGraph(context.Context, string) (semanticgraph.SemanticGraph, error)
	ReadNodeDetail(context.Context, string, string) (semanticgraph.SemanticNodeDetail, bool, error)
	ListEvidence(context.Context, string, string) (semanticgraph.SemanticEvidenceList, error)
	ListActivity(context.Context, string, string, int) (semanticgraph.SemanticActivityList, error)
	ListActivityPage(context.Context, semanticgraph.SemanticActivityFilter) (semanticgraph.SemanticActivityPage, error)
	ReadActivitySummary(context.Context, string, int) (semanticgraph.SemanticActivitySummary, error)
	ReadSteeringState(context.Context, string, string) (semanticgraph.SemanticSteeringState, error)
	ReadEventHistory(context.Context, string, string, int, int) (semanticgraph.SemanticEventHistory, error)
	ReadContextPack(context.Context, string, string) (semanticgraph.SemanticContextPackRecord, bool, error)
	ListContextPacks(context.Context, semanticgraph.SemanticContextPackFilter) (semanticgraph.SemanticContextPackList, error)
	BuildCartographerWindow(context.Context, semanticgraph.CartographerManualWindowRequest) (semanticgraph.CartographerWindowBuildResult, error)
	ProcessCartographerWindow(context.Context, string, string) (semanticgraph.CartographerWindowProcessResult, error)
	ReadCartographerProcessingState(context.Context) (semanticgraph.CartographerProcessingState, error)
	ReadCartographerRun(context.Context, string, string) (semanticgraph.CartographerRun, bool, error)
	ListCartographerRuns(context.Context, semanticgraph.CartographerRunFilter) (semanticgraph.CartographerRunList, error)
	ListCartographerWindows(context.Context, semanticgraph.CartographerWindowFilter) (semanticgraph.CartographerWindowList, error)
	ListCartographerCursors(context.Context, semanticgraph.CartographerCursorFilter) (semanticgraph.CartographerCursorList, error)
	ListCartographerPatches(context.Context, semanticgraph.CartographerPatchFilter) (semanticgraph.CartographerPatchList, error)
	AcceptCartographerPatch(context.Context, string, string) (semanticgraph.CartographerPatchReviewResult, error)
	RejectCartographerPatch(context.Context, string, string) (semanticgraph.CartographerPatchReviewResult, error)
	UpdateLayoutPositions(context.Context, string, []semanticgraph.SemanticLayoutPositionInput) (semanticgraph.SemanticLayoutPositionList, error)
	AttachWorkflowExecution(context.Context, semanticgraph.AttachWorkflowExecutionInput) (semanticgraph.SemanticAttachmentResult, error)
	AttachWorkflowNode(context.Context, semanticgraph.AttachWorkflowNodeInput) (semanticgraph.SemanticAttachmentResult, error)
	AttachChatRun(context.Context, semanticgraph.AttachChatRunInput) (semanticgraph.SemanticAttachmentResult, error)
	AttachChatMessage(context.Context, semanticgraph.AttachChatMessageInput) (semanticgraph.SemanticAttachmentResult, error)
	AttachRunItem(context.Context, semanticgraph.AttachRunItemInput) (semanticgraph.SemanticAttachmentResult, error)
	AttachFileRange(context.Context, semanticgraph.AttachFileRangeInput) (semanticgraph.SemanticAttachmentResult, error)
	EndActivity(context.Context, semanticgraph.EndSemanticActivityInput) (semanticgraph.SemanticActivityEndResult, error)
	RenameNode(context.Context, semanticgraph.RenameSemanticNodeInput) (semanticgraph.SemanticMutationResult, error)
	UpdateNode(context.Context, semanticgraph.UpdateSemanticNodeInput) (semanticgraph.SemanticMutationResult, error)
	DismissNode(context.Context, semanticgraph.SemanticNodeOperationInput) (semanticgraph.SemanticMutationResult, error)
	PromoteNode(context.Context, semanticgraph.SemanticNodeOperationInput) (semanticgraph.SemanticMutationResult, error)
	SplitNode(context.Context, semanticgraph.SplitSemanticNodeInput) (semanticgraph.SemanticMutationResult, error)
	MergeNodes(context.Context, semanticgraph.MergeSemanticNodesInput) (semanticgraph.SemanticMutationResult, error)
	CreateUserNode(context.Context, semanticgraph.CreateSemanticNodeInput) (semanticgraph.SemanticMutationResult, error)
	CreateUserEdge(context.Context, semanticgraph.CreateSemanticEdgeInput) (semanticgraph.SemanticMutationResult, error)
	UpdateEdge(context.Context, semanticgraph.UpdateSemanticEdgeInput) (semanticgraph.SemanticMutationResult, error)
	RemoveEdge(context.Context, semanticgraph.SemanticEdgeOperationInput) (semanticgraph.SemanticMutationResult, error)
	CreateSteeringDirective(context.Context, semanticgraph.CreateSteeringDirectiveInput) (semanticgraph.SemanticMutationResult, error)
	SubscribeSemanticGraphChanges(semanticgraph.SemanticGraphChangeCursor) (*semanticgraph.SemanticGraphChangeSubscription, error)
	UpdateSteeringDirective(context.Context, semanticgraph.UpdateSteeringDirectiveInput) (semanticgraph.SemanticMutationResult, error)
}

type TerminalService interface {
	Attach(context.Context, string, string) (terminal.SessionSummary, error)
	Close(context.Context, string, terminal.CloseMode) (terminal.SessionSummary, error)
	Create(context.Context, string, string, string, string, int, int) (terminal.SessionSummary, error)
	CreateProfile(terminal.TerminalProfileInput) (terminal.TerminalProfileList, error)
	DeleteProfile(string) (terminal.TerminalProfileList, error)
	ListProfiles() (terminal.TerminalProfileList, error)
	Resize(context.Context, string, int, int) (terminal.SessionSummary, error)
	SetDefaultProfile(string) (terminal.TerminalProfileList, error)
	SubscribeEvents(terminal.EventCursor) (*terminal.EventSubscription, error)
	UpdateProfile(string, terminal.TerminalProfileInput) (terminal.TerminalProfileList, error)
	WriteInput(context.Context, string, []byte) (int, error)
}

type HandlerConfig struct {
	AppearanceService    AppearanceService
	Metadata             BackendMetadata
	ChatService          ChatService
	CodexAccountService  CodexAccountService
	SemanticGraphService SemanticGraphService
	TerminalService      TerminalService
	WorkspaceUIService   WorkspaceUIService
	WorkspaceService     WorkspaceService
	WorkflowService      WorkflowService
}

type handler struct {
	appearanceService    AppearanceService
	metadata             BackendMetadata
	chatService          ChatService
	codexAccountService  CodexAccountService
	semanticGraphService SemanticGraphService
	terminalService      TerminalService
	workspaceUIService   WorkspaceUIService
	workspaceService     WorkspaceService
	workflowService      WorkflowService
}

func NewHandler(config HandlerConfig) http.Handler {
	apiHandler := handler{
		appearanceService:    config.AppearanceService,
		metadata:             config.Metadata,
		chatService:          config.ChatService,
		codexAccountService:  config.CodexAccountService,
		semanticGraphService: config.SemanticGraphService,
		terminalService:      config.TerminalService,
		workspaceUIService:   config.WorkspaceUIService,
		workspaceService:     config.WorkspaceService,
		workflowService:      config.WorkflowService,
	}
	mux := http.NewServeMux()
	registerEndpoints(mux, apiHandler)
	return mux
}
