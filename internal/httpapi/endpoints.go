package httpapi

import (
	"net/http"
	"reflect"

	"setta/internal/appearance"
	"setta/internal/applayout"
	"setta/internal/codexaccount"
	"setta/internal/conversation"
	"setta/internal/master"
	"setta/internal/speech"
	"setta/internal/workspacesession"
	"setta/internal/workspaceui"
)

type ContractSchema struct {
	Endpoints      []ContractEndpoint
	ErrorResponses []reflect.Type
}

type ContractEndpoint struct {
	Name                  string
	Method                string
	Path                  string
	Request               reflect.Type
	Response              reflect.Type
	StreamEvent           reflect.Type
	Streaming             bool
	RequestBodyLimitBytes int64
}

type endpoint struct {
	ContractEndpoint
	Handler         routeHandler
	Unauthenticated bool
}

type routeHandler func(handler, http.ResponseWriter, *http.Request)

const (
	defaultRequestBodyLimitBytes int64 = 4 * 1024 * 1024
)

var apiEndpoints = []endpoint{
	unauthenticated(get[BackendHealth]("BackendHealth", "/health", handler.health)),
	unauthenticated(get[RuntimeInfoResponse]("RuntimeInfo", "/runtime/info", handler.runtimeInfo)),
	unauthenticated(post[CompletePairingRequest, CompletePairingResponse]("CompletePairing", "/pairing/complete", handler.completePairing)),
	post[UpdateRuntimeDisplayNameRequest, RuntimeInfoResponse]("UpdateRuntimeDisplayName", "/runtime/display-name/update", handler.updateRuntimeDisplayName),
	post[ListDevicesRequest, ListDevicesResponse]("ListDevices", "/devices/list", handler.listDevices),
	post[RevokeDeviceRequest, RevokeDeviceResponse]("RevokeDevice", "/devices/revoke", handler.revokeDevice),
	get[appearance.AppearanceSettings]("ReadAppearanceSettings", "/appearance/settings", handler.readAppearanceSettings),
	get[appearance.AppearancePresetList]("ReadAppearancePresets", "/appearance/presets", handler.readAppearancePresets),
	post[UpdateAppearanceSettingsRequest, appearance.AppearanceSettings]("UpdateAppearanceSettings", "/appearance/settings", handler.updateAppearanceSettings),
	get[workspacesession.WorkspaceSession]("WorkspaceSession", "/workspace-session", handler.workspaceSession),
	post[OpenWorkspaceRequest, OpenWorkspaceResponse]("OpenWorkspace", "/workspaces/open", handler.openWorkspace),
	post[RelocateWorkspaceRequest, OpenWorkspaceResponse]("RelocateWorkspace", "/workspaces/relocate", handler.relocateWorkspace),
	post[RefreshWorkspaceAvailabilityRequest, workspacesession.WorkspaceSession]("RefreshWorkspaceAvailability", "/workspaces/availability/refresh", handler.refreshWorkspaceAvailability),
	post[SelectWorkspaceRequest, workspacesession.WorkspaceSession]("SelectWorkspace", "/workspaces/select", handler.selectWorkspace),
	post[CloseWorkspaceRequest, workspacesession.WorkspaceSession]("CloseWorkspace", "/workspaces/close", handler.closeWorkspace),
	post[ReorderWorkspaceRequest, workspacesession.WorkspaceSession]("ReorderWorkspace", "/workspaces/reorder", handler.reorderWorkspaces),
	post[RemoveRecentWorkspaceRequest, workspacesession.WorkspaceSession]("RemoveRecentWorkspace", "/workspaces/remove-recent", handler.removeRecentWorkspace),
	post[ReadWorkspaceUILayoutRequest, workspaceui.WorkspaceUILayoutReadResult]("ReadWorkspaceUILayout", "/workspaces/ui/layout/read", handler.readWorkspaceUILayout),
	post[SaveWorkspaceUILayoutRequest, workspaceui.WorkspaceUILayout]("SaveWorkspaceUILayout", "/workspaces/ui/layout/save", handler.saveWorkspaceUILayout),
	get[applayout.AppPaneLayoutReadResult]("ReadAppPaneLayout", "/app/panes/layout", handler.readAppPaneLayout),
	post[SaveAppPaneLayoutRequest, applayout.AppPaneLayout]("SaveAppPaneLayout", "/app/panes/layout/save", handler.saveAppPaneLayout),
	post[CreateTopicConversationRequest, conversation.ConversationSnapshot]("CreateTopicConversation", "/conversations/create", handler.createTopicConversation),
	post[ArchiveTopicConversationRequest, conversation.ConversationSnapshot]("ArchiveTopicConversation", "/conversations/archive", handler.archiveTopicConversation),
	post[BindTopicConversationFolderRequest, conversation.ConversationSnapshot]("BindTopicConversationFolder", "/conversations/resources/folder/bind", handler.bindTopicConversationFolder),
	post[SendSideConversationTurnRequest, conversation.ConversationSnapshot]("SendSideConversationTurn", "/conversations/sides/turns/send", handler.sendSideConversationTurn),
	post[DisposeSideConversationRequest, conversation.ConversationSnapshot]("DisposeSideConversation", "/conversations/sides/dispose", handler.disposeSideConversation),
	post[ReadConversationSnapshotRequest, conversation.ConversationSnapshot]("ReadConversationSnapshot", "/conversations/snapshot/read", handler.readConversationSnapshot),
	post[ReadConversationArtifactRequest, conversation.Artifact]("ReadConversationArtifact", "/conversations/artifacts/read", handler.readConversationArtifact),
	post[ListTopicConversationsRequest, conversation.NavigatorPage]("ListTopicConversations", "/conversations/navigator/list", handler.listTopicConversations),
	post[StopTopicConversationTurnRequest, conversation.ConversationSnapshot]("StopTopicConversationTurn", "/conversations/turns/stop", handler.stopTopicConversationTurn),
	post[SubmitTopicConversationApprovalRequest, conversation.ConversationSnapshot]("SubmitTopicConversationApproval", "/conversations/approvals/submit", handler.submitTopicConversationApproval),
	post[UpdateTopicConversationPresentationRequest, conversation.ConversationPresentationProfile]("UpdateTopicConversationPresentation", "/conversations/presentation/update", handler.updateTopicConversationPresentation),
	streamEventWithQuery[SubscribeConversationEventsRequest, conversation.ConversationEvent]("ConversationEventStream", "/conversations/events", handler.conversationEventStream),
	postWithRequestBodyLimit[SubmitConversationInputRequest, conversation.AcceptedConversationInput]("SubmitConversationInput", "/conversations/inputs/submit", conversationInputRequestBodyLimitBytes, handler.submitConversationInput),
	post[ReadConversationInputRoutingStateRequest, conversation.ConversationInputRoutingState]("ReadConversationInputRoutingState", "/conversations/inputs/state/read", handler.readConversationInputRoutingState),
	post[ReadConversationInputRoutingStateRequest, conversation.ConversationInputRoutingState]("WaitConversationInputRoutingState", "/conversations/inputs/state/wait", handler.waitConversationInputRoutingState),
	post[RetryConversationInputRequest, conversation.ConversationInputRoutingState]("RetryConversationInput", "/conversations/inputs/retry", handler.retryConversationInput),
	post[DiscardConversationInputRequest, conversation.ConversationInputRoutingState]("DiscardConversationInput", "/conversations/inputs/discard", handler.discardConversationInput),
	get[conversation.RoleModelCatalog]("ReadRoleModelCatalog", "/roles/models", handler.readRoleModelCatalog),
	get[conversation.RoleConfiguration]("ReadGlobalRoleConfiguration", "/roles/configuration/global", handler.readGlobalRoleConfiguration),
	post[UpdateGlobalRoleProfilesRequest, conversation.RoleConfiguration]("UpdateGlobalRoleProfiles", "/roles/configuration/global/update", handler.updateGlobalRoleProfiles),
	post[ReadWorkspaceRoleConfigurationRequest, conversation.RoleConfiguration]("ReadWorkspaceRoleConfiguration", "/workspaces/roles/read", handler.readWorkspaceRoleConfiguration),
	post[UpdateWorkspaceRoleProfilesRequest, conversation.RoleConfiguration]("UpdateWorkspaceRoleProfiles", "/workspaces/roles/update", handler.updateWorkspaceRoleProfiles),
	post[ReadConversationRoleConfigurationRequest, conversation.RoleConfiguration]("ReadConversationRoleConfiguration", "/conversations/roles/read", handler.readConversationRoleConfiguration),
	post[UpdateConversationRoleProfilesRequest, conversation.RoleConfiguration]("UpdateConversationRoleProfiles", "/conversations/roles/update", handler.updateConversationRoleProfiles),
	get[master.ActiveShellInteraction]("ReadActiveMasterShellInteraction", "/master/interaction/active", handler.readActiveMasterShellInteraction),
	postWithRequestBodyLimit[SubmitMasterInputRequest, master.AcceptedMasterInput]("SubmitMasterInput", "/master/inputs/submit", masterInputRequestBodyLimitBytes, handler.submitMasterInput),
	post[CancelMasterInputRequest, master.ShellInteractionState]("CancelMasterInput", "/master/inputs/cancel", handler.cancelMasterInput),
	post[ReadMasterInputRoutingStateRequest, master.InputRoutingState]("ReadMasterInputRoutingState", "/master/inputs/state/read", handler.readMasterInputRoutingState),
	post[ReadMasterTranscriptRequest, master.Transcript]("ReadMasterTranscript", "/master/transcript/read", handler.readMasterTranscript),
	post[ReadMasterInputRoutingStateRequest, master.ShellInteractionState]("WaitMasterShellInteraction", "/master/interaction/wait", handler.waitMasterShellInteraction),
	post[ReadMasterInputRoutingStateRequest, master.PresentationIntent]("WaitMasterPresentationIntent", "/master/presentation/wait", handler.waitMasterPresentationIntent),
	post[master.PresentationResolutionRequest, master.PresentationResolution]("ResolveMasterPresentationIntent", "/master/presentation/resolve", handler.resolveMasterPresentationIntent),
	get[speech.SpeechCapabilities]("ReadSpeechCapabilities", "/speech/capabilities", handler.readSpeechCapabilities),
	get[speech.MasterVoiceSelection]("ReadMasterVoiceSelection", "/speech/voices/master", handler.readMasterVoiceSelection),
	post[speech.VoiceSelectionRequest, speech.MasterVoiceSelection]("UpdateMasterVoiceSelection", "/speech/voices/master/update", handler.updateMasterVoiceSelection),
	get[speech.NarratorVoiceDefault]("ReadNarratorVoiceDefault", "/speech/voices/narrator-default", handler.readNarratorVoiceDefault),
	post[speech.VoiceSelectionRequest, speech.NarratorVoiceDefault]("UpdateNarratorVoiceDefault", "/speech/voices/narrator-default/update", handler.updateNarratorVoiceDefault),
	postWithRequestBodyLimit[SpeechCredentialRequest, speech.SpeechCredentialValidationResult]("ValidateDesktopSpeechCredential", "/speech/credentials/desktop/validate", speechRequestBodyLimitBytes, handler.validateDesktopSpeechCredential),
	postWithRequestBodyLimit[SpeechCredentialRequest, speech.SpeechCredentialStatus]("LoadDesktopSpeechCredential", "/speech/credentials/desktop/load", speechRequestBodyLimitBytes, handler.loadDesktopSpeechCredential),
	postWithRequestBodyLimit[ClearDesktopSpeechCredentialRequest, speech.SpeechCredentialStatus]("ClearDesktopSpeechCredential", "/speech/credentials/desktop/clear", speechRequestBodyLimitBytes, handler.clearDesktopSpeechCredential),
	postWithRequestBodyLimit[CreateSpeechTranscriptionSessionRequest, speech.SpeechTranscriptionSession]("CreateSpeechTranscriptionSession", "/speech/transcription/sessions", speechRequestBodyLimitBytes, handler.createSpeechTranscriptionSession),
	postWithRequestBodyLimit[speech.SpeechSynthesisRequest, speech.SpeechSynthesisInput]("ResolveSpeechSynthesisInput", "/speech/synthesis/resolve", speechRequestBodyLimitBytes, handler.resolveSpeechSynthesisInput),
	postWithRequestBodyLimit[speech.SpeechSynthesisRequest, speech.SpeechAudio]("SynthesizeSpeech", "/speech/synthesis", speechRequestBodyLimitBytes, handler.synthesizeSpeech),
	get[codexaccount.CodexAccountState]("ReadCodexAccount", "/codex/account", handler.readCodexAccount),
	post[codexaccount.RefreshCodexAccountRequest, codexaccount.CodexAccountState]("RefreshCodexAccount", "/codex/account/refresh", handler.refreshCodexAccount),
	post[codexaccount.StartCodexLoginRequest, codexaccount.StartCodexLoginResponse]("StartCodexLogin", "/codex/account/login/start", handler.startCodexLogin),
	post[codexaccount.CancelCodexLoginRequest, codexaccount.CodexAccountState]("CancelCodexLogin", "/codex/account/login/cancel", handler.cancelCodexLogin),
	post[codexaccount.LogoutCodexAccountRequest, codexaccount.CodexAccountState]("LogoutCodexAccount", "/codex/account/logout", handler.logoutCodexAccount),
	streamEvent[codexaccount.CodexAccountChangeEvent]("CodexAccountEventStream", "/codex/account/events", handler.codexAccountEventStream),
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
			if route.RequestBodyLimitBytes > 0 && !enforceRequestBodyLimit(response, request, route.RequestBodyLimitBytes) {
				return
			}
			apiHandler.dispatch(route, response, request)
		})
	}
}

func unauthenticated(route endpoint) endpoint {
	route.Unauthenticated = true
	return route
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

func streamEvent[StreamEvent any](name string, path string, handler routeHandler) endpoint {
	return endpoint{
		ContractEndpoint: ContractEndpoint{
			Name:        name,
			Method:      http.MethodGet,
			StreamEvent: reflect.TypeFor[StreamEvent](),
			Path:        path,
			Streaming:   true,
		},
		Handler: handler,
	}
}

func streamEventWithQuery[Request any, StreamEvent any](name string, path string, handler routeHandler) endpoint {
	return endpoint{
		ContractEndpoint: ContractEndpoint{
			Name:        name,
			Method:      http.MethodGet,
			Path:        path,
			Request:     reflect.TypeFor[Request](),
			StreamEvent: reflect.TypeFor[StreamEvent](),
			Streaming:   true,
		},
		Handler: handler,
	}
}

func post[Request any, Response any](name string, path string, handler routeHandler) endpoint {
	return postWithRequestBodyLimit[Request, Response](name, path, defaultRequestBodyLimitBytes, handler)
}

func postWithRequestBodyLimit[Request any, Response any](name string, path string, requestBodyLimitBytes int64, handler routeHandler) endpoint {
	return endpoint{
		ContractEndpoint: ContractEndpoint{
			Name:                  name,
			Method:                http.MethodPost,
			Path:                  path,
			Request:               reflect.TypeFor[Request](),
			Response:              reflect.TypeFor[Response](),
			RequestBodyLimitBytes: requestBodyLimitBytes,
		},
		Handler: handler,
	}
}
