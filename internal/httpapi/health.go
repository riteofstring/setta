package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"setta/internal/appstate"
	"setta/internal/chat"
	"setta/internal/jsonio"
	"setta/internal/provideraccounts"
	"setta/internal/workspace"
	"setta/internal/workspacesession"
)

const BackendName = "setta-backend"

type BackendMetadata struct {
	Name    string
	Version string
}

type BackendHealth struct {
	OK      bool   `json:"ok"`
	Name    string `json:"name"`
	Version string `json:"version"`
}

type OpenWorkspaceRequest struct {
	RootPath string `json:"rootPath"`
}

type OpenWorkspaceResponse struct {
	Workspace workspace.WorkspaceSummary        `json:"workspace"`
	Session   workspacesession.WorkspaceSession `json:"session"`
}

type SelectWorkspaceRequest struct {
	ID string `json:"id"`
}

type CloseWorkspaceRequest struct {
	ID string `json:"id"`
}

type ReorderWorkspaceRequest struct {
	IDs []string `json:"ids"`
}

type RemoveRecentWorkspaceRequest struct {
	ID string `json:"id"`
}

type ListConversationsRequest struct {
	WorkspaceID string `json:"workspaceId"`
}

type ListConversationsResponse struct {
	Conversations []chat.ConversationListItem `json:"conversations"`
	Corruption    chat.CorruptionSummary      `json:"corruption"`
	Diagnostics   []chat.Diagnostic           `json:"diagnostics"`
}

type CreateConversationRequest struct {
	WorkspaceID string `json:"workspaceId"`
	Title       string `json:"title"`
}

type GetMessagePageRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	BeforeOrdinal  int    `json:"beforeOrdinal"`
	Limit          int    `json:"limit"`
}

type SendChatMessageRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	Prompt         string `json:"prompt"`
}

type QueueChatMessageRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	Prompt         string `json:"prompt"`
}

type SteerChatMessageRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	Prompt         string `json:"prompt"`
}

type ListChatCommandsRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
}

type ExecuteChatCommandRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	Raw            string `json:"raw"`
}

type CancelRunRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
}

type GetActiveRunRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
}

type GetActiveRunResponse struct {
	HasActiveRun bool      `json:"hasActiveRun"`
	Run          *chat.Run `json:"run"`
}

type ListRunsRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
}

type ListRunsResponse struct {
	Runs []chat.Run `json:"runs"`
}

type GetRunActivityRequest struct {
	WorkspaceID string `json:"workspaceId"`
	RunID       string `json:"runId"`
	Limit       int    `json:"limit"`
}

type GetRunItemOutputRequest struct {
	WorkspaceID  string `json:"workspaceId"`
	RunID        string `json:"runId"`
	RunItemID    string `json:"runItemId"`
	AfterOrdinal int    `json:"afterOrdinal"`
	Limit        int    `json:"limit"`
}

type ListDiagnosticsRequest struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
	RunID          string `json:"runId"`
}

type ListDiagnosticsResponse struct {
	Diagnostics []chat.Diagnostic `json:"diagnostics"`
}

type QuarantineCorruptChatStateRequest struct {
	WorkspaceID  string `json:"workspaceId"`
	Confirmation string `json:"confirmation"`
}

type ResetWorkspaceChatStateRequest struct {
	WorkspaceID  string `json:"workspaceId"`
	Confirmation string `json:"confirmation"`
}

type ClearChatQuarantineRequest struct {
	WorkspaceID  string `json:"workspaceId"`
	Confirmation string `json:"confirmation"`
}

type SubmitApprovalRequest struct {
	WorkspaceID    string                `json:"workspaceId"`
	ConversationID string                `json:"conversationId"`
	ApprovalID     string                `json:"approvalId"`
	Approved       bool                  `json:"approved"`
	Response       string                `json:"response"`
	Answers        []chat.ApprovalAnswer `json:"answers"`
	Cancelled      bool                  `json:"cancelled"`
}

type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type ErrorResponse struct {
	Error APIError `json:"error"`
}

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
	ClearChatQuarantine(workspaceID string, confirmation string) (chat.ChatMaintenanceResult, error)
	CreateConversation(workspaceID string, title string) (chat.Conversation, error)
	ListDiagnostics(workspaceID string, conversationID string, runID string) ([]chat.Diagnostic, error)
	ListConversations(workspaceID string) (chat.ConversationListResult, error)
	ListRuns(workspaceID string, conversationID string) ([]chat.Run, error)
	LoadMessagePage(workspaceID string, conversationID string, beforeOrdinal int, limit int) (chat.MessagePage, error)
	LoadRunActivityPage(workspaceID string, runID string, limit int) (chat.RunActivityPage, error)
	LoadRunItemOutputPage(workspaceID string, runID string, runItemID string, afterOrdinal int, limit int) (chat.RunItemOutputPage, error)
	ExecuteChatCommand(workspaceID string, conversationID string, raw string) (chat.ChatCommandExecuteResult, error)
	ListCommands(workspaceID string, conversationID string) (chat.ChatCommandListResult, error)
	QueueUserMessage(workspaceID string, conversationID string, prompt string) (chat.QueueMessageResult, error)
	QuarantineCorruptChatState(workspaceID string, confirmation string) (chat.ChatMaintenanceResult, error)
	ResetWorkspaceChatState(workspaceID string, confirmation string) (chat.ChatMaintenanceResult, error)
	SendUserMessage(workspaceID string, conversationID string, prompt string) (chat.SendMessageResult, error)
	SteerActiveRun(workspaceID string, conversationID string, prompt string) (chat.SteerMessageResult, error)
	SubscribeEvents(cursor chat.EventCursor) (*chat.EventSubscription, error)
	SubmitApproval(workspaceID string, conversationID string, approvalID string, approved bool, response string, answers []chat.ApprovalAnswer, cancelled bool) (chat.Run, error)
}

type ProviderAccountService interface {
	ClearChatGPTAuth() (provideraccounts.ProviderAccounts, error)
	ListProviderAccounts() (provideraccounts.ProviderAccounts, error)
	SaveChatGPTAuth(provideraccounts.SaveChatGPTAuthRequest) (provideraccounts.ProviderAccounts, error)
}

type HandlerConfig struct {
	Metadata               BackendMetadata
	ChatService            ChatService
	ProviderAccountService ProviderAccountService
	WorkspaceService       WorkspaceService
}

type handler struct {
	metadata               BackendMetadata
	chatService            ChatService
	providerAccountService ProviderAccountService
	workspaceService       WorkspaceService
}

func NewHandler(config HandlerConfig) http.Handler {
	apiHandler := handler{
		metadata:               config.Metadata,
		chatService:            config.ChatService,
		providerAccountService: config.ProviderAccountService,
		workspaceService:       config.WorkspaceService,
	}
	mux := http.NewServeMux()
	registerEndpoints(mux, apiHandler)
	return mux
}

func (handler handler) health(response http.ResponseWriter, request *http.Request) {
	writeJSON(response, http.StatusOK, BackendHealth{
		OK:      true,
		Name:    handler.metadata.Name,
		Version: handler.metadata.Version,
	})
}

func (handler handler) workspaceSession(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceService(response, handler.workspaceService)
	if service == nil {
		return
	}
	writeJSON(response, http.StatusOK, service.Session())
}

func (handler handler) openWorkspace(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceService(response, handler.workspaceService)
	if service == nil {
		return
	}
	var payload OpenWorkspaceRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	workspaceSummary, session, err := service.OpenLocalFolder(payload.RootPath)
	if err != nil {
		writeWorkspaceError(response, "open_workspace_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, OpenWorkspaceResponse{Workspace: workspaceSummary, Session: session})
}

func (handler handler) selectWorkspace(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceService(response, handler.workspaceService)
	if service == nil {
		return
	}
	var payload SelectWorkspaceRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	session, err := service.Select(payload.ID)
	if err != nil {
		writeWorkspaceError(response, "select_workspace_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, session)
}

func (handler handler) closeWorkspace(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceService(response, handler.workspaceService)
	if service == nil {
		return
	}
	var payload CloseWorkspaceRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	session, err := service.Close(payload.ID)
	if err != nil {
		writeWorkspaceError(response, "close_workspace_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, session)
}

func (handler handler) reorderWorkspaces(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceService(response, handler.workspaceService)
	if service == nil {
		return
	}
	var payload ReorderWorkspaceRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	session, err := service.Reorder(payload.IDs)
	if err != nil {
		writeWorkspaceError(response, "reorder_workspaces_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, session)
}

func (handler handler) removeRecentWorkspace(response http.ResponseWriter, request *http.Request) {
	service := requireWorkspaceService(response, handler.workspaceService)
	if service == nil {
		return
	}
	var payload RemoveRecentWorkspaceRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	session, err := service.RemoveRecent(payload.ID)
	if err != nil {
		writeWorkspaceError(response, "remove_recent_workspace_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, session)
}

func (handler handler) listConversations(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload ListConversationsRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.ListConversations(payload.WorkspaceID)
	if err != nil {
		writeChatError(response, "list_conversations_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, ListConversationsResponse{
		Conversations: result.Conversations,
		Corruption:    result.Corruption,
		Diagnostics:   result.Diagnostics,
	})
}

func (handler handler) createConversation(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload CreateConversationRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	conversation, err := service.CreateConversation(payload.WorkspaceID, payload.Title)
	if err != nil {
		writeChatError(response, "create_conversation_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, conversation)
}

func (handler handler) getMessagePage(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload GetMessagePageRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	page, err := service.LoadMessagePage(payload.WorkspaceID, payload.ConversationID, payload.BeforeOrdinal, payload.Limit)
	if err != nil {
		writeChatError(response, "get_message_page_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, page)
}

func (handler handler) sendChatMessage(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload SendChatMessageRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.SendUserMessage(payload.WorkspaceID, payload.ConversationID, payload.Prompt)
	if err != nil {
		writeChatError(response, "send_chat_message_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) queueChatMessage(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload QueueChatMessageRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.QueueUserMessage(payload.WorkspaceID, payload.ConversationID, payload.Prompt)
	if err != nil {
		writeChatError(response, "queue_chat_message_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) steerChatMessage(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload SteerChatMessageRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.SteerActiveRun(payload.WorkspaceID, payload.ConversationID, payload.Prompt)
	if err != nil {
		writeChatError(response, "steer_chat_message_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) listChatCommands(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload ListChatCommandsRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.ListCommands(payload.WorkspaceID, payload.ConversationID)
	if err != nil {
		writeChatError(response, "list_chat_commands_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) executeChatCommand(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload ExecuteChatCommandRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.ExecuteChatCommand(payload.WorkspaceID, payload.ConversationID, payload.Raw)
	if err != nil {
		writeChatError(response, "execute_chat_command_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) cancelRun(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload CancelRunRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	run, err := service.CancelActiveRun(payload.WorkspaceID, payload.ConversationID)
	if err != nil {
		writeChatError(response, "cancel_run_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, run)
}

func (handler handler) getActiveRun(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload GetActiveRunRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	run, ok, err := service.ActiveRun(payload.WorkspaceID, payload.ConversationID)
	if err != nil {
		writeChatError(response, "get_active_run_failed", err)
		return
	}
	var activeRun *chat.Run
	if ok {
		activeRun = &run
	}
	writeJSON(response, http.StatusOK, GetActiveRunResponse{HasActiveRun: ok, Run: activeRun})
}

func (handler handler) listRuns(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload ListRunsRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	runs, err := service.ListRuns(payload.WorkspaceID, payload.ConversationID)
	if err != nil {
		writeChatError(response, "list_runs_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, ListRunsResponse{Runs: runs})
}

func (handler handler) getRunActivity(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload GetRunActivityRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	page, err := service.LoadRunActivityPage(payload.WorkspaceID, payload.RunID, payload.Limit)
	if err != nil {
		writeChatError(response, "get_run_activity_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, page)
}

func (handler handler) getRunItemOutput(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload GetRunItemOutputRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	page, err := service.LoadRunItemOutputPage(payload.WorkspaceID, payload.RunID, payload.RunItemID, payload.AfterOrdinal, payload.Limit)
	if err != nil {
		writeChatError(response, "get_run_item_output_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, page)
}

func (handler handler) listDiagnostics(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload ListDiagnosticsRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	diagnostics, err := service.ListDiagnostics(payload.WorkspaceID, payload.ConversationID, payload.RunID)
	if err != nil {
		writeChatError(response, "list_diagnostics_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, ListDiagnosticsResponse{Diagnostics: diagnostics})
}

func (handler handler) quarantineCorruptChatState(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload QuarantineCorruptChatStateRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.QuarantineCorruptChatState(payload.WorkspaceID, payload.Confirmation)
	if err != nil {
		writeChatError(response, "quarantine_corrupt_chat_state_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) resetWorkspaceChatState(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload ResetWorkspaceChatStateRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.ResetWorkspaceChatState(payload.WorkspaceID, payload.Confirmation)
	if err != nil {
		writeChatError(response, "reset_workspace_chat_state_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) clearChatQuarantine(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload ClearChatQuarantineRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.ClearChatQuarantine(payload.WorkspaceID, payload.Confirmation)
	if err != nil {
		writeChatError(response, "clear_chat_quarantine_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) submitApproval(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload SubmitApprovalRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	run, err := service.SubmitApproval(payload.WorkspaceID, payload.ConversationID, payload.ApprovalID, payload.Approved, payload.Response, payload.Answers, payload.Cancelled)
	if err != nil {
		writeChatError(response, "submit_approval_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, run)
}

func (handler handler) listProviderAccounts(response http.ResponseWriter, request *http.Request) {
	service := requireProviderAccountService(response, handler.providerAccountService)
	if service == nil {
		return
	}
	accounts, err := service.ListProviderAccounts()
	if err != nil {
		writeProviderAccountError(response, "list_provider_accounts_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, accounts)
}

func (handler handler) saveChatGPTAuth(response http.ResponseWriter, request *http.Request) {
	service := requireProviderAccountService(response, handler.providerAccountService)
	if service == nil {
		return
	}
	var payload provideraccounts.SaveChatGPTAuthRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	accounts, err := service.SaveChatGPTAuth(payload)
	if err != nil {
		writeProviderAccountError(response, "save_chatgpt_auth_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, accounts)
}

func (handler handler) clearChatGPTAuth(response http.ResponseWriter, request *http.Request) {
	service := requireProviderAccountService(response, handler.providerAccountService)
	if service == nil {
		return
	}
	var payload provideraccounts.ClearChatGPTAuthRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	accounts, err := service.ClearChatGPTAuth()
	if err != nil {
		writeProviderAccountError(response, "clear_chatgpt_auth_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, accounts)
}

func (handler handler) eventStream(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	cursor, err := eventStreamCursor(request)
	if err != nil {
		writeError(response, http.StatusBadRequest, "invalid_event_cursor", err.Error())
		return
	}
	flusher, ok := response.(http.Flusher)
	if !ok {
		writeError(response, http.StatusInternalServerError, "event_stream_unavailable", "response writer does not support streaming")
		return
	}
	subscription, err := service.SubscribeEvents(cursor)
	if err != nil {
		writeChatError(response, "subscribe_events_failed", err)
		return
	}
	defer subscription.Unsubscribe()

	response.Header().Set("Cache-Control", "no-cache")
	response.Header().Set("Content-Type", "text/event-stream")
	response.Header().Set("X-Accel-Buffering", "no")
	response.WriteHeader(http.StatusOK)
	flusher.Flush()

	for {
		select {
		case event, ok := <-subscription.Events:
			if !ok {
				return
			}
			if err := writeServerSentEvent(response, event); err != nil {
				return
			}
			flusher.Flush()
		case <-request.Context().Done():
			return
		}
	}
}

func eventStreamCursor(request *http.Request) (chat.EventCursor, error) {
	value := request.Header.Get("Last-Event-ID")
	if value == "" {
		value = request.URL.Query().Get("lastEventId")
	}
	if value == "" {
		return chat.EventCursor{}, nil
	}
	streamID, sequenceText, ok := strings.Cut(value, ":")
	if !ok || streamID == "" || sequenceText == "" {
		return chat.EventCursor{}, fmt.Errorf("event cursor must be <stream-id>:<sequence>: %s", value)
	}
	sequence, err := strconv.Atoi(sequenceText)
	if err != nil || sequence < 0 {
		return chat.EventCursor{}, fmt.Errorf("event cursor sequence must be a non-negative integer: %s", value)
	}
	return chat.EventCursor{StreamID: streamID, Sequence: sequence}, nil
}

func writeServerSentEvent(response http.ResponseWriter, event chat.Event) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal event %d: %w", event.Sequence, err)
	}
	if _, err := fmt.Fprintf(response, "id: %s\nevent: %s\ndata: %s\n\n", event.EventID, event.Type, payload); err != nil {
		return fmt.Errorf("write event %d: %w", event.Sequence, err)
	}
	return nil
}

func requireWorkspaceService(response http.ResponseWriter, service WorkspaceService) WorkspaceService {
	if service == nil {
		writeError(response, http.StatusServiceUnavailable, "workspace_service_unavailable", "workspace service is not available")
		return nil
	}
	return service
}

func requireChatService(response http.ResponseWriter, service ChatService) ChatService {
	if service == nil {
		writeError(response, http.StatusServiceUnavailable, "chat_service_unavailable", "chat service is not available")
		return nil
	}
	return service
}

func requireProviderAccountService(response http.ResponseWriter, service ProviderAccountService) ProviderAccountService {
	if service == nil {
		writeError(response, http.StatusServiceUnavailable, "provider_account_service_unavailable", "provider account service is not available")
		return nil
	}
	return service
}

func decodeRequest(response http.ResponseWriter, request *http.Request, target any) bool {
	if err := jsonio.DecodeSingle(request.Body, target); err != nil {
		if errors.Is(err, jsonio.ErrMultipleValues) {
			writeError(response, http.StatusBadRequest, "invalid_json", "request body must contain exactly one JSON value")
			return false
		}
		writeError(response, http.StatusBadRequest, "invalid_json", fmt.Sprintf("request body must be valid JSON: %v", err))
		return false
	}
	return true
}

func writeWorkspaceError(response http.ResponseWriter, code string, err error) {
	status := http.StatusBadRequest
	if appstate.IsCorruptStateError(err) {
		writeError(response, http.StatusInternalServerError, "corrupt_app_state", err.Error())
		return
	}
	if workspace.IsCorruptStateError(err) {
		writeError(response, http.StatusInternalServerError, "corrupt_workspace_state", err.Error())
		return
	}
	if appstate.IsPersistenceError(err) || workspace.IsPersistenceError(err) {
		status = http.StatusInternalServerError
	}
	writeError(response, status, code, err.Error())
}

func writeChatError(response http.ResponseWriter, code string, err error) {
	status := http.StatusBadRequest
	if commandErr, ok := chat.IsChatCommandError(err); ok {
		writeError(response, status, string(commandErr.Code), commandErr.Error())
		return
	}
	if chat.IsCorruptStateError(err) {
		writeError(response, http.StatusInternalServerError, "corrupt_chat_state", err.Error())
		return
	}
	if chat.IsPersistenceError(err) {
		status = http.StatusInternalServerError
	}
	writeError(response, status, code, err.Error())
}

func writeProviderAccountError(response http.ResponseWriter, code string, err error) {
	status := http.StatusBadRequest
	if provideraccounts.IsCorruptStateError(err) {
		writeError(response, http.StatusInternalServerError, "corrupt_provider_account_state", err.Error())
		return
	}
	if provideraccounts.IsPersistenceError(err) {
		status = http.StatusInternalServerError
	}
	writeError(response, status, code, err.Error())
}

func writeError(response http.ResponseWriter, status int, code string, message string) {
	writeJSON(response, status, ErrorResponse{
		Error: APIError{
			Code:    code,
			Message: message,
		},
	})
}

func writeJSON(response http.ResponseWriter, status int, payload any) {
	response.Header().Set("Content-Type", "application/json")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(payload)
}
