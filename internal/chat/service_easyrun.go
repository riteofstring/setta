package chat

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"setta/internal/workspace"
)

type EasyRunTurnRequest struct {
	EasyRunID              string
	Prompt                 string
	CodexSettings          ChatCodexSettings
	CodexEffectiveSettings *ChatCodexEffectiveSettings
	OnConversationPrepared func(Conversation) error
}

type easyRunTurnSender interface {
	SendEasyRunTurn(workspaceID string, request EasyRunTurnRequest) (SendMessageResult, error)
}

var _ easyRunTurnSender = (*Service)(nil)

func (service *Service) SendEasyRunTurn(workspaceID string, request EasyRunTurnRequest) (SendMessageResult, error) {
	prompt, workspaceSummary, err := service.validateEasyRunTurn(workspaceID, request)
	if err != nil {
		return SendMessageResult{}, err
	}
	if request.CodexEffectiveSettings == nil {
		settings, effectiveSettings, err := service.ResolveEasyRunCodexSettings(workspaceID, request.CodexSettings)
		if err != nil {
			return SendMessageResult{}, err
		}
		request.CodexSettings = settings
		request.CodexEffectiveSettings = effectiveSettings
	}

	service.mu.Lock()
	defer service.mu.Unlock()

	return service.sendEasyRunTurnLocked(workspaceID, request, prompt, workspaceSummary)
}

func (service *Service) validateEasyRunTurn(workspaceID string, request EasyRunTurnRequest) (string, workspace.WorkspaceSummary, error) {
	prompt := strings.TrimSpace(request.Prompt)
	if prompt == "" {
		return "", workspace.WorkspaceSummary{}, errors.New("easy-run prompt is required")
	}
	if err := rejectSlashPromptForMessageEndpoint(prompt); err != nil {
		return "", workspace.WorkspaceSummary{}, err
	}
	workspaceSummary, err := service.resolveWorkspaceForRequest(workspaceID)
	if err != nil {
		return "", workspace.WorkspaceSummary{}, err
	}
	if err := validateEasyRunTurnRequest(request); err != nil {
		return "", workspace.WorkspaceSummary{}, err
	}
	return prompt, workspaceSummary, nil
}

func (service *Service) ResolveEasyRunCodexSettings(workspaceID string, overrides ChatCodexSettings) (ChatCodexSettings, *ChatCodexEffectiveSettings, error) {
	workspaceSummary, err := service.resolveWorkspaceForRequest(workspaceID)
	if err != nil {
		return ChatCodexSettings{}, nil, err
	}
	settings, err := easyRunCodexSettingsFromDefaults(service.currentChatCodexDefaultSettings(), overrides)
	if err != nil {
		return ChatCodexSettings{}, nil, err
	}
	if err := validateChatCodexSettings("easy_run", settings); err != nil {
		return ChatCodexSettings{}, nil, err
	}
	conversation := Conversation{
		SchemaVersion: SchemaVersion,
		ID:            "easy_run_settings",
		WorkspaceID:   workspaceID,
		Title:         "Easy-run settings",
		CreatedAt:     timestamp(service.now()),
		UpdatedAt:     timestamp(service.now()),
		CodexSettings: &settings,
		HarnessRefs:   []HarnessThreadRef{},
	}
	conversation, err = service.conversationWithResolvedEffectiveSettings(context.Background(), workspaceSummary, conversation)
	if err != nil {
		return ChatCodexSettings{}, nil, err
	}
	return settings, cloneChatCodexEffectiveSettingsPointer(conversation.CodexEffectiveSettings), nil
}

func (service *Service) sendEasyRunTurnLocked(workspaceID string, request EasyRunTurnRequest, prompt string, workspaceSummary workspace.WorkspaceSummary) (SendMessageResult, error) {
	conversation, err := service.newEasyRunConversation(workspaceID, request)
	if err != nil {
		return SendMessageResult{}, err
	}
	key := activeKey(workspaceID, conversation.ID)
	if err := service.ensureCanStartTurnLocked(workspaceID, conversation.ID, key); err != nil {
		return SendMessageResult{}, err
	}

	now := timestamp(service.now())
	conversation = service.prepareEasyRunConversation(conversation, request, now)
	if err := service.store.SaveConversation(conversation); err != nil {
		return SendMessageResult{}, err
	}
	if request.OnConversationPrepared != nil {
		if err := request.OnConversationPrepared(conversation); err != nil {
			return SendMessageResult{}, err
		}
	}
	input := TextChatInput(prompt)
	conversation, userMessage, assistantMessage, run, err := service.persistTurnStartForConversationLocked(conversation, input, MessageDeliveryNormal, now)
	if err != nil {
		return SendMessageResult{}, err
	}
	if err := service.startPostCommitHarnessTurnLocked(postCommitHarnessTurnStart{
		Workspace:        workspaceSummary,
		Conversation:     conversation,
		Run:              run,
		AssistantMessage: assistantMessage,
		Publish: func() error {
			if err := service.traceLocked(workspaceID, run.ID, "turn_started", "Codex turn started"); err != nil {
				return err
			}
			if err := service.publishTurnStartEventsLocked(workspaceID, conversation.ID, userMessage, assistantMessage, run); err != nil {
				return err
			}
			return service.publishActiveRunLivenessAndConversationLocked(workspaceID, conversation.ID, run.ID)
		},
		DeliveryInput: func() (ChatInput, error) {
			return service.deliveryInputFromMessage(workspaceID, conversation.ID, userMessage)
		},
	}); err != nil {
		return SendMessageResult{}, err
	}

	return service.workflowAgentTurnResultLocked(workspaceID, conversation, userMessage, assistantMessage, run)
}

func validateEasyRunTurnRequest(request EasyRunTurnRequest) error {
	if err := validateStorageID("easy run id", request.EasyRunID); err != nil {
		return err
	}
	if err := validateChatCodexSettings("easy_run", request.CodexSettings); err != nil {
		return err
	}
	if request.CodexEffectiveSettings != nil {
		if err := validateChatCodexEffectiveSettings("easy_run", *request.CodexEffectiveSettings); err != nil {
			return err
		}
	}
	return nil
}

func (service *Service) newEasyRunConversation(workspaceID string, request EasyRunTurnRequest) (Conversation, error) {
	id, err := service.newID("conversation")
	if err != nil {
		return Conversation{}, fmt.Errorf("create easy-run conversation id: %w", err)
	}
	now := timestamp(service.now())
	return Conversation{
		SchemaVersion: SchemaVersion,
		ID:            id,
		WorkspaceID:   workspaceID,
		Title:         "Easy run",
		Internal:      true,
		CreatedAt:     now,
		UpdatedAt:     now,
		ArchivedAt:    "",
		EasyRun:       easyRunMetadataFromTurnRequest(request),
		HarnessRefs:   []HarnessThreadRef{},
	}, nil
}

func (service *Service) prepareEasyRunConversation(conversation Conversation, request EasyRunTurnRequest, now string) Conversation {
	conversation.Internal = true
	conversation.Workflow = nil
	conversation.EasyRun = easyRunMetadataFromTurnRequest(request)
	conversation.UpdatedAt = now
	settings := cloneChatCodexSettings(request.CodexSettings)
	conversation.CodexSettings = &settings
	conversation.CodexEffectiveSettings = cloneChatCodexEffectiveSettingsPointer(request.CodexEffectiveSettings)
	if conversation.HarnessRefs == nil {
		conversation.HarnessRefs = []HarnessThreadRef{}
	}
	return conversation
}

func easyRunMetadataFromTurnRequest(request EasyRunTurnRequest) *ConversationEasyRunMetadata {
	return &ConversationEasyRunMetadata{
		EasyRunID: request.EasyRunID,
	}
}

func easyRunCodexSettingsFromDefaults(defaults ChatCodexSettings, overrides ChatCodexSettings) (ChatCodexSettings, error) {
	settings := cloneChatCodexSettings(defaults)
	if overrides.Model != "" {
		settings.Model = overrides.Model
	}
	if overrides.ReasoningEffort != nil {
		value := *overrides.ReasoningEffort
		settings.ReasoningEffort = &value
	}
	fullAccess, ok := chatPermissionSettingsForPreset(ChatPermissionPresetFullAccess)
	if !ok {
		return ChatCodexSettings{}, errors.New("full-access permission preset is missing")
	}
	settings.Permission = &fullAccess
	return settings, nil
}
