package httpapi

import (
	"context"
	"net/http"

	"setta/internal/appearance"
	"setta/internal/chat"
	"setta/internal/codexaccount"
	"setta/internal/orchestrator"
	"setta/internal/terminal"
	"setta/internal/workspace"
	"setta/internal/workspacesession"
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
	CancelExecution(workspaceID string, executionID string) (orchestrator.WorkflowExecution, error)
	CreateDefinition(workspaceID string, name string, description string, graph orchestrator.WorkflowGraph) (orchestrator.WorkflowDefinition, error)
	DeleteDefinition(workspaceID string, definitionID string) error
	ListDefinitions(workspaceID string) ([]orchestrator.WorkflowDefinition, error)
	ReadDefinition(workspaceID string, definitionID string) (orchestrator.WorkflowDefinition, error)
	ReadExecution(workspaceID string, executionID string) (orchestrator.WorkflowExecution, error)
	ReadExecutionEventPage(workspaceID string, executionID string, beforeOrdinal int, limit int) (orchestrator.WorkflowExecutionEventPage, error)
	ReadGraphProjection(workspaceID string, definitionID string, versionID string, executionID string) (orchestrator.WorkflowGraphProjection, bool, error)
	StartExecution(workspaceID string, definitionID string, versionID string) (orchestrator.WorkflowExecution, error)
	SubscribeEvents(cursor orchestrator.WorkflowEventCursor) (*orchestrator.EventSubscription, error)
	SubmitApproval(workspaceID string, executionID string, nodeExecutionID string, approvalID string, approved bool, response string, answers []chat.ApprovalAnswer, cancelled bool) (orchestrator.WorkflowExecution, error)
	UpdateDefinition(workspaceID string, definitionID string, name string, description string, graph orchestrator.WorkflowGraph) (orchestrator.WorkflowDefinition, error)
	ValidateDefinition(workspaceID string, graph orchestrator.WorkflowGraph) (orchestrator.WorkflowValidationResult, error)
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
	AppearanceService   AppearanceService
	Metadata            BackendMetadata
	ChatService         ChatService
	CodexAccountService CodexAccountService
	TerminalService     TerminalService
	WorkspaceService    WorkspaceService
	WorkflowService     WorkflowService
}

type handler struct {
	appearanceService   AppearanceService
	metadata            BackendMetadata
	chatService         ChatService
	codexAccountService CodexAccountService
	terminalService     TerminalService
	workspaceService    WorkspaceService
	workflowService     WorkflowService
}

func NewHandler(config HandlerConfig) http.Handler {
	apiHandler := handler{
		appearanceService:   config.AppearanceService,
		metadata:            config.Metadata,
		chatService:         config.ChatService,
		codexAccountService: config.CodexAccountService,
		terminalService:     config.TerminalService,
		workspaceService:    config.WorkspaceService,
		workflowService:     config.WorkflowService,
	}
	mux := http.NewServeMux()
	registerEndpoints(mux, apiHandler)
	return mux
}
