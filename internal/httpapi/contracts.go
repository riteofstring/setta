package httpapi

import (
	"setta/internal/appearance"
	"setta/internal/conversation"
	"setta/internal/runtimeauth"
	"setta/internal/speech"
	"setta/internal/workspace"
	"setta/internal/workspacesession"
)

type RuntimeInfoResponse struct {
	RuntimeID              string                        `json:"runtimeId"`
	DisplayName            string                        `json:"displayName"`
	InfrastructureProvider RuntimeInfrastructureProvider `json:"infrastructureProvider"`
	BackendName            string                        `json:"backendName"`
	BackendVersion         string                        `json:"backendVersion"`
	ProtocolVersion        int                           `json:"protocolVersion"`
}

type RuntimeInfrastructureProvider struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
	IconURL     string `json:"iconUrl"`
}

type UpdateRuntimeDisplayNameRequest struct {
	DisplayName string `json:"displayName"`
}

type CompletePairingRequest struct {
	PairingToken      string `json:"pairingToken"`
	ClientDisplayName string `json:"clientDisplayName"`
}

type CompletePairingResponse struct {
	DeviceID        string `json:"deviceId"`
	DeviceToken     string `json:"deviceToken"`
	RuntimeID       string `json:"runtimeId"`
	ProtocolVersion int    `json:"protocolVersion"`
}

type ListDevicesRequest struct{}

type ListDevicesResponse struct {
	Devices []runtimeauth.DeviceSession `json:"devices"`
}

type RevokeDeviceRequest struct {
	DeviceID string `json:"deviceId"`
}

type RevokeDeviceResponse struct {
	Device runtimeauth.DeviceSession `json:"device"`
}

type UpdateAppearanceSettingsRequest struct {
	Settings appearance.AppearanceSettings `json:"settings"`
}

type OpenWorkspaceRequest struct {
	RootPath string `json:"rootPath"`
}

type OpenWorkspaceResponse struct {
	Workspace workspace.WorkspaceSummary        `json:"workspace"`
	Session   workspacesession.WorkspaceSession `json:"session"`
}

type RelocateWorkspaceRequest struct {
	ID       string `json:"id"`
	RootPath string `json:"rootPath"`
}

type RefreshWorkspaceAvailabilityRequest struct {
	ID string `json:"id"`
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

type ReadConversationSnapshotRequest struct {
	WorkspaceID    *string `json:"workspaceId"`
	ConversationID string  `json:"conversationId"`
}

type ReadConversationArtifactRequest struct {
	WorkspaceID    *string `json:"workspaceId"`
	ConversationID string  `json:"conversationId"`
	ArtifactID     string  `json:"artifactId"`
}

type ListTopicConversationsRequest struct {
	WorkspaceID string                        `json:"workspaceId"`
	Query       string                        `json:"query"`
	Cursor      *conversation.NavigatorCursor `json:"cursor"`
	Limit       int                           `json:"limit"`
}

type SubscribeConversationEventsRequest struct {
	WorkspaceID    *string `json:"workspaceId"`
	ConversationID string  `json:"conversationId"`
}

type SpeechCredentialRequest struct {
	Provider speech.SpeechProvider `json:"provider"`
	APIKey   string                `json:"apiKey"`
}

type ClearDesktopSpeechCredentialRequest struct {
	Provider speech.SpeechProvider `json:"provider"`
}

type CreateSpeechTranscriptionSessionRequest struct {
	Provider speech.SpeechProvider `json:"provider"`
}

type APIError struct {
	Code             string `json:"code"`
	Message          string `json:"message"`
	OperationApplied bool   `json:"operationApplied"`
}

type ErrorResponse struct {
	Error APIError `json:"error"`
}
