package httpapi

import (
	"context"
	"net/http"

	"setta/internal/chat"
	"setta/internal/codexaccount"
	"setta/internal/workspace"
	"setta/internal/workspacesession"
)

type WorkspaceService interface {
	Close(id string) (workspacesession.WorkspaceSession, error)
	OpenLocalFolder(rootPath string) (workspace.WorkspaceSummary, workspacesession.WorkspaceSession, error)
	RemoveRecent(id string) (workspacesession.WorkspaceSession, error)
	Reorder(ids []string) (workspacesession.WorkspaceSession, error)
	Select(id string) (workspacesession.WorkspaceSession, error)
	Session() workspacesession.WorkspaceSession
}

type ChatService interface {
	ActiveRun(workspaceID string, conversationID string) (chat.Run, bool, error)
	CancelActiveRun(workspaceID string, conversationID string) (chat.Run, error)
	CreateConversation(workspaceID string, title string) (chat.Conversation, error)
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

type HandlerConfig struct {
	Metadata            BackendMetadata
	ChatService         ChatService
	CodexAccountService CodexAccountService
	WorkspaceService    WorkspaceService
}

type handler struct {
	metadata            BackendMetadata
	chatService         ChatService
	codexAccountService CodexAccountService
	workspaceService    WorkspaceService
}

func NewHandler(config HandlerConfig) http.Handler {
	apiHandler := handler{
		metadata:            config.Metadata,
		chatService:         config.ChatService,
		codexAccountService: config.CodexAccountService,
		workspaceService:    config.WorkspaceService,
	}
	mux := http.NewServeMux()
	registerEndpoints(mux, apiHandler)
	return mux
}
