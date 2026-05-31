package httpapi

import (
	"net/http"
	"reflect"

	"setta/internal/chat"
	"setta/internal/codexaccount"
	"setta/internal/workspacesession"
)

type ContractSchema struct {
	Endpoints      []ContractEndpoint
	ErrorResponses []reflect.Type
}

type ContractEndpoint struct {
	Name      string
	Method    string
	Path      string
	Request   reflect.Type
	Response  reflect.Type
	Streaming bool
}

type endpoint struct {
	ContractEndpoint
	Handler routeHandler
}

type routeHandler func(handler, http.ResponseWriter, *http.Request)

var apiEndpoints = []endpoint{
	get[BackendHealth]("BackendHealth", "/health", handler.health),
	get[workspacesession.WorkspaceSession]("WorkspaceSession", "/workspace-session", handler.workspaceSession),
	post[OpenWorkspaceRequest, OpenWorkspaceResponse]("OpenWorkspace", "/workspaces/open", handler.openWorkspace),
	post[SelectWorkspaceRequest, workspacesession.WorkspaceSession]("SelectWorkspace", "/workspaces/select", handler.selectWorkspace),
	post[CloseWorkspaceRequest, workspacesession.WorkspaceSession]("CloseWorkspace", "/workspaces/close", handler.closeWorkspace),
	post[ReorderWorkspaceRequest, workspacesession.WorkspaceSession]("ReorderWorkspace", "/workspaces/reorder", handler.reorderWorkspaces),
	post[RemoveRecentWorkspaceRequest, workspacesession.WorkspaceSession]("RemoveRecentWorkspace", "/workspaces/remove-recent", handler.removeRecentWorkspace),
	post[ListConversationsRequest, ListConversationsResponse]("ListConversations", "/chat/conversations/list", handler.listConversations),
	post[CreateConversationRequest, chat.Conversation]("CreateConversation", "/chat/conversations/create", handler.createConversation),
	post[MarkConversationReadRequest, chat.ConversationListItem]("MarkConversationRead", "/chat/conversations/mark-read", handler.markConversationRead),
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
	post[ListApprovalsRequest, ListApprovalsResponse]("ListApprovals", "/chat/approvals/list", handler.listApprovals),
	post[SubmitApprovalRequest, chat.Run]("SubmitApproval", "/chat/approvals/submit", handler.submitApproval),
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
