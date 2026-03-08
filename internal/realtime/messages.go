package realtime

import (
	"strings"

	"setta/internal/projectstate"
	"setta/internal/projectview"
)

const (
	MessageTypeNotification                = "Notification"
	MessageTypeAllConnections              = "AllConnections"
	MessageTypeFrontendIdentity            = "FrontendIdentity"
	MessageTypeAIFollowToolArgumentsUpdate = "AIFollowToolArgumentsUpdate"
	MessageTypeUISettingReveal             = "UISettingReveal"
	MessageTypeUISettingRevealResult       = "UISettingRevealResult"
	MessageTypeLSPDiagnostics              = "LSPDiagnostics"
	MessageTypeUpdateFrontendProjectState  = "UpdateFrontendProjectState"
	MessageTypeReturnRenameRefactorResults = "ReturnRenameRefactorResults"
	MessageTypeRealtimeUIChange            = "RealtimeUIChange"
	MessageTypeRealtimeDependencyEvent     = "RealtimeDependencyEvent"
)

type NotificationType string

const (
	NotificationTypeError   NotificationType = "error"
	NotificationTypeWarning NotificationType = "warning"
	NotificationTypeInfo    NotificationType = "info"
	NotificationTypeSave    NotificationType = "save"
)

type FrontendIdentityContent struct {
	FrontendAffinityToken string `json:"frontendAffinityToken"`
}

type AIFollowToolArgumentsUpdateContent struct {
	ProjectConfigID string              `json:"projectConfigId"`
	ChatID          string              `json:"chatId"`
	IDsByType       map[string][]string `json:"idsByType"`
}

type UISettingRevealActivationStep struct {
	Type      string `json:"type"`
	ItemValue string `json:"itemValue"`
}

type UISettingRevealTarget struct {
	SettingID             string                          `json:"settingId"`
	Side                  string                          `json:"side"`
	OverviewTabKey        *string                         `json:"overviewTabKey,omitempty"`
	UIEditorTabName       *string                         `json:"uiEditorTabName,omitempty"`
	PluginID              *string                         `json:"pluginId,omitempty"`
	PaneID                *string                         `json:"paneId,omitempty"`
	Strategy              string                          `json:"strategy"`
	AnchorID              *string                         `json:"anchorId,omitempty"`
	PluginRevealKey       *string                         `json:"pluginRevealKey,omitempty"`
	RevealActivationSteps []UISettingRevealActivationStep `json:"revealActivationSteps,omitempty"`
}

type UISettingRevealContent struct {
	ProjectConfigID string                  `json:"projectConfigId"`
	ChatID          *string                 `json:"chatId,omitempty"`
	ActiveSectionID *string                 `json:"activeSectionId,omitempty"`
	Reveals         []UISettingRevealTarget `json:"reveals"`
	DurationMS      int                     `json:"durationMs"`
	RequestID       string                  `json:"requestId"`
}

type UISettingRevealMessage struct {
	ID          *string                `json:"id"`
	MessageType string                 `json:"messageType"`
	Content     UISettingRevealContent `json:"content"`
}

type UISettingRevealResultStatus struct {
	SettingID    string  `json:"settingId"`
	Status       string  `json:"status"`
	ErrorCode    *string `json:"errorCode"`
	ErrorMessage *string `json:"errorMessage"`
}

type UISettingRevealResultContent struct {
	ProjectConfigID string                        `json:"projectConfigId"`
	RequestID       string                        `json:"requestId"`
	Statuses        []UISettingRevealResultStatus `json:"statuses"`
}

type NotificationContent struct {
	ID              string           `json:"id"`
	ProjectConfigID string           `json:"projectConfigId"`
	Type            NotificationType `json:"type"`
	Message         string           `json:"message"`
	Temporary       bool             `json:"temporary"`
	Timestamp       string           `json:"timestamp"`
	Metadata        map[string]any   `json:"metadata"`
	ReadStatus      bool             `json:"read_status"`
}

type NotificationMessage struct {
	ID          *string             `json:"id"`
	MessageType string              `json:"messageType"`
	Content     NotificationContent `json:"content"`
}

type FrontendIdentityMessage struct {
	MessageType string                  `json:"messageType"`
	Content     FrontendIdentityContent `json:"content"`
}

type AIFollowToolArgumentsUpdateMessage struct {
	MessageType string                             `json:"messageType"`
	Content     AIFollowToolArgumentsUpdateContent `json:"content"`
}

type UISettingRevealResultMessage struct {
	ID          *string                      `json:"id"`
	MessageType string                       `json:"messageType"`
	Content     UISettingRevealResultContent `json:"content"`
}

type AllConnectionsMessage struct {
	MessageType string       `json:"messageType"`
	Content     []Connection `json:"content"`
}

type LSPDiagnosticsMessage struct {
	MessageType string                             `json:"messageType"`
	Content     projectstate.LSPDiagnosticsPayload `json:"content"`
}

type ProjectStateUpdateContent struct {
	ProjectState   projectview.SingleConfig `json:"projectState"`
	CompletedOpIDs []string                 `json:"completedOpIds"`
	PendingOpIDs   []string                 `json:"pendingOpIds"`
}

type ProjectStateUpdateMessage struct {
	ID          *string                   `json:"id"`
	MessageType string                    `json:"messageType"`
	Content     ProjectStateUpdateContent `json:"content"`
}

type RenameReferenceDependencyKey struct {
	Type      string `json:"type"`
	SectionID string `json:"sectionId"`
	CodeObjID string `json:"codeObjId,omitempty"`
}

type RenameReferenceChangedValue struct {
	DepKey   RenameReferenceDependencyKey `json:"depKey"`
	NewValue string                       `json:"newValue"`
}

type RenameRefactorBroadcastContent struct {
	ProjectConfigID   string                          `json:"projectConfigId"`
	FrontendOpID      string                          `json:"frontendOpId"`
	RenameMode        projectstate.RenameRefactorMode `json:"renameMode"`
	ChangedNodeValues []RenameReferenceChangedValue   `json:"changedNodeValues"`
}

type RenameRefactorResultsMessage struct {
	ID          *string                        `json:"id"`
	MessageType string                         `json:"messageType"`
	Content     RenameRefactorBroadcastContent `json:"content"`
}

func NewFrontendIdentityMessage(frontendAffinityToken string) FrontendIdentityMessage {
	return FrontendIdentityMessage{
		MessageType: MessageTypeFrontendIdentity,
		Content: FrontendIdentityContent{
			FrontendAffinityToken: frontendAffinityToken,
		},
	}
}

func NewAIFollowToolArgumentsUpdateMessage(content AIFollowToolArgumentsUpdateContent) AIFollowToolArgumentsUpdateMessage {
	return AIFollowToolArgumentsUpdateMessage{
		MessageType: MessageTypeAIFollowToolArgumentsUpdate,
		Content:     content,
	}
}

func NewUISettingRevealMessage(content UISettingRevealContent) UISettingRevealMessage {
	return UISettingRevealMessage{
		MessageType: MessageTypeUISettingReveal,
		Content:     content,
	}
}

func NewUISettingRevealResultMessage(content UISettingRevealResultContent) UISettingRevealResultMessage {
	return UISettingRevealResultMessage{
		MessageType: MessageTypeUISettingRevealResult,
		Content:     content,
	}
}

func NewNotificationMessage(content NotificationContent) NotificationMessage {
	return NotificationMessage{
		MessageType: MessageTypeNotification,
		Content:     content,
	}
}

func NewAllConnectionsMessage(connections []Connection) AllConnectionsMessage {
	return AllConnectionsMessage{
		MessageType: MessageTypeAllConnections,
		Content:     connections,
	}
}

func NewLSPDiagnosticsMessage(content projectstate.LSPDiagnosticsPayload) LSPDiagnosticsMessage {
	return LSPDiagnosticsMessage{
		MessageType: MessageTypeLSPDiagnostics,
		Content:     content,
	}
}

func NewProjectStateUpdateMessage(content ProjectStateUpdateContent) ProjectStateUpdateMessage {
	return ProjectStateUpdateMessage{
		MessageType: MessageTypeUpdateFrontendProjectState,
		Content:     content,
	}
}

func NewRenameRefactorResultsMessage(content RenameRefactorBroadcastContent) RenameRefactorResultsMessage {
	return RenameRefactorResultsMessage{
		MessageType: MessageTypeReturnRenameRefactorResults,
		Content:     content,
	}
}

func NewRenameReferenceDependencyKey(sectionID string, codeObjID string) RenameReferenceDependencyKey {
	trimmedCodeObjID := strings.TrimSpace(codeObjID)
	if trimmedCodeObjID == "" {
		return RenameReferenceDependencyKey{
			Type:      "Section",
			SectionID: strings.TrimSpace(sectionID),
		}
	}
	return RenameReferenceDependencyKey{
		Type:      "SectionParam",
		SectionID: strings.TrimSpace(sectionID),
		CodeObjID: trimmedCodeObjID,
	}
}
