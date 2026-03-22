package projectstate

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"
)

type ChatPermissionMode string

const (
	ChatPermissionModeMinimal          ChatPermissionMode = "minimal"
	ChatPermissionModeYOLO             ChatPermissionMode = "yolo"
	ChatPermissionModeConfigTomlCustom ChatPermissionMode = "config_toml_custom"
)

type ChatDictationMode string

const (
	ChatDictationModeAuto     ChatDictationMode = "auto"
	ChatDictationModeBrowser  ChatDictationMode = "browser"
	ChatDictationModeProvider ChatDictationMode = "provider"
)

type ChatSectionSettings struct {
	Managed                bool               `json:"managed"`
	EngineConfigID         *string            `json:"engineConfigId"`
	TranscriptionProfileID *string            `json:"transcriptionProfileId"`
	AgentProfileID         *string            `json:"agentProfileId"`
	Thinking               bool               `json:"thinking"`
	PermissionMode         ChatPermissionMode `json:"permissionMode"`
	SearchEnabled          bool               `json:"searchEnabled"`
	DictationMode          ChatDictationMode  `json:"dictationMode"`
}

type ChatSectionBranch struct {
	Messages            []map[string]any `json:"messages"`
	CreatedAt           int              `json:"createdAt"`
	ParentBranchID      *string          `json:"parentBranchId"`
	BranchFromMessageID *string          `json:"branchFromMessageId"`
}

type ChatSectionState struct {
	Messages           []map[string]any             `json:"messages"`
	InputText          string                       `json:"inputText"`
	WaitingForResponse bool                         `json:"waitingForResponse"`
	ToolCallArguments  map[string]string            `json:"toolCallArguments"`
	ActiveBranchID     *string                      `json:"activeBranchId"`
	Branches           map[string]ChatSectionBranch `json:"branches"`
}

func (p *Project) SetChatSectionSettings(sectionID string, settings ChatSectionSettings) error {
	if _, _, _, err := p.resolveChatSectionMutationState(sectionID); err != nil {
		return err
	}

	permissionMode, err := normalizeChatPermissionMode(settings.PermissionMode)
	if err != nil {
		return err
	}
	dictationMode, err := normalizeChatDictationMode(settings.DictationMode)
	if err != nil {
		return err
	}

	return p.applyChatSectionUpdates(sectionID, map[string]any{
		"managed":                settings.Managed,
		"engineConfigId":         normalizedOptionalChatFieldID(settings.EngineConfigID),
		"transcriptionProfileId": normalizedOptionalChatFieldID(settings.TranscriptionProfileID),
		"agentProfileId":         normalizedOptionalChatFieldID(settings.AgentProfileID),
		"thinking":               settings.Thinking,
		"permissionMode":         permissionMode,
		"searchEnabled":          settings.SearchEnabled,
		"dictationMode":          dictationMode,
	})
}

func (d *Document) SetChatSectionSettings(projectID string, sectionID string, settings ChatSectionSettings) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetChatSectionSettings(sectionID, settings); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetChatSectionSettings(ctx context.Context, projectID string, sectionID string, settings ChatSectionSettings) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetChatSectionSettings(projectID, sectionID, settings); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetChatSectionState(sectionID string, state ChatSectionState) error {
	if _, _, _, err := p.resolveChatSectionMutationState(sectionID); err != nil {
		return err
	}
	normalized, err := normalizeChatSectionStateForPersistence(state)
	if err != nil {
		return err
	}

	return p.applyChatSectionUpdates(sectionID, map[string]any{
		"messages":           cloneChatSectionMessages(normalized.Messages),
		"inputText":          normalized.InputText,
		"waitingForResponse": normalized.WaitingForResponse,
		"toolCallArguments":  cloneChatSectionToolCallArguments(normalized.ToolCallArguments),
		"activeBranchId":     normalizedOptionalChatFieldID(normalized.ActiveBranchID),
		"branches":           cloneChatSectionBranches(normalized.Branches),
	})
}

func (d *Document) SetChatSectionState(projectID string, sectionID string, state ChatSectionState) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetChatSectionState(sectionID, state); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetChatSectionState(ctx context.Context, projectID string, sectionID string, state ChatSectionState) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetChatSectionState(projectID, sectionID, state); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetChatSectionChatID(sectionID string, chatID *string) error {
	if _, _, _, err := p.resolveChatSectionMutationState(sectionID); err != nil {
		return err
	}
	return p.applyChatSectionUpdates(sectionID, map[string]any{
		"chatId": normalizedOptionalChatFieldID(chatID),
	})
}

func (d *Document) SetChatSectionChatID(projectID string, sectionID string, chatID *string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetChatSectionChatID(sectionID, chatID); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetChatSectionChatID(ctx context.Context, projectID string, sectionID string, chatID *string) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetChatSectionChatID(projectID, sectionID, chatID); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) ChatSectionChatID(sectionID string) (*string, error) {
	_, _, payload, err := p.resolveChatSectionMutationState(sectionID)
	if err != nil {
		return nil, err
	}
	rawValue, ok := payload["chatId"]
	if !ok || rawValue == nil {
		return nil, nil
	}
	chatID, ok := rawValue.(string)
	if !ok {
		return nil, fmt.Errorf("chat section chatId must be a string or null")
	}
	trimmedChatID := strings.TrimSpace(chatID)
	if trimmedChatID == "" {
		return nil, nil
	}
	return &trimmedChatID, nil
}

func (d *Document) ChatSectionChatID(projectID string, sectionID string) (*string, error) {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return nil, err
	}
	return project.ChatSectionChatID(sectionID)
}

func (r *Runtime) ChatSectionChatID(projectID string, sectionID string) (*string, error) {
	snapshot := r.Snapshot()
	return snapshot.Document.ChatSectionChatID(projectID, sectionID)
}

func (p *Project) applyChatSectionUpdates(sectionID string, updates map[string]any) error {
	trimmedSectionID := strings.TrimSpace(sectionID)
	for fieldName, fieldValue := range updates {
		if err := p.setCurrentSectionField(trimmedSectionID, fieldName, fieldValue); err != nil {
			return err
		}
	}
	return nil
}

func (p *Project) resolveChatSectionMutationState(sectionID string) (Section, SectionVariant, map[string]any, error) {
	section, variant, impl, err := p.ResolveSection(strings.TrimSpace(sectionID))
	if err != nil {
		return Section{}, SectionVariant{}, nil, err
	}
	payload, err := effectiveSectionPayload(*p, section.ID, variant.ID)
	if err != nil {
		return Section{}, SectionVariant{}, nil, err
	}

	sectionType := payloadStringField(payload, "type")
	if sectionType == "" {
		sectionType = fallbackSectionType(impl)
	}
	if !strings.EqualFold(sectionType, "Chat") {
		return Section{}, SectionVariant{}, nil, fmt.Errorf("%w: %q", ErrChatSectionRequired, section.ID)
	}
	return section, variant, payload, nil
}

func normalizeChatPermissionMode(mode ChatPermissionMode) (string, error) {
	trimmed := strings.TrimSpace(string(mode))
	switch ChatPermissionMode(trimmed) {
	case ChatPermissionModeMinimal, ChatPermissionModeYOLO, ChatPermissionModeConfigTomlCustom:
		return trimmed, nil
	default:
		return "", fmt.Errorf("%w: %q", ErrChatPermissionModeInvalid, trimmed)
	}
}

func normalizeChatDictationMode(mode ChatDictationMode) (string, error) {
	trimmed := strings.TrimSpace(string(mode))
	switch ChatDictationMode(trimmed) {
	case ChatDictationModeAuto, ChatDictationModeBrowser, ChatDictationModeProvider:
		return trimmed, nil
	default:
		return "", fmt.Errorf("%w: %q", ErrChatDictationModeInvalid, trimmed)
	}
}

func normalizedOptionalChatFieldID(value *string) any {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return trimmed
}

func cloneChatSectionMessages(messages []map[string]any) []map[string]any {
	if len(messages) == 0 {
		return []map[string]any{}
	}
	cloned := make([]map[string]any, len(messages))
	for index, message := range messages {
		if len(message) == 0 {
			cloned[index] = map[string]any{}
			continue
		}
		cloned[index] = cloneProjectObject(message)
	}
	return cloned
}

func cloneChatSectionToolCallArguments(arguments map[string]string) map[string]string {
	if len(arguments) == 0 {
		return map[string]string{}
	}
	cloned := make(map[string]string, len(arguments))
	for key, value := range arguments {
		cloned[key] = value
	}
	return cloned
}

func normalizeChatSectionStateForPersistence(state ChatSectionState) (ChatSectionState, error) {
	normalized := ChatSectionState{
		Messages:           cloneChatSectionMessages(state.Messages),
		InputText:          state.InputText,
		WaitingForResponse: state.WaitingForResponse,
		ToolCallArguments:  cloneChatSectionToolCallArguments(state.ToolCallArguments),
		ActiveBranchID:     cloneOptionalChatFieldID(state.ActiveBranchID),
		Branches:           cloneTypedChatSectionBranches(state.Branches),
	}
	if len(normalized.Branches) == 0 {
		branchID, err := resolvedChatBranchID(normalized.ActiveBranchID)
		if err != nil {
			return ChatSectionState{}, err
		}
		normalized.ActiveBranchID = cloneOptionalChatFieldID(&branchID)
		normalized.Branches = map[string]ChatSectionBranch{
			branchID: {
				Messages:            cloneChatSectionMessages(normalized.Messages),
				CreatedAt:           int(time.Now().UnixMilli()),
				ParentBranchID:      nil,
				BranchFromMessageID: nil,
			},
		}
		return normalized, nil
	}

	activeBranchID := ""
	if normalized.ActiveBranchID != nil {
		candidateID := strings.TrimSpace(*normalized.ActiveBranchID)
		if _, ok := normalized.Branches[candidateID]; ok {
			activeBranchID = candidateID
		}
	}
	if activeBranchID == "" {
		activeBranchID = selectCanonicalChatBranchID(normalized.Branches)
	}
	if activeBranchID == "" {
		branchID, err := resolvedChatBranchID(nil)
		if err != nil {
			return ChatSectionState{}, err
		}
		activeBranchID = branchID
		normalized.Branches[branchID] = ChatSectionBranch{
			Messages:            cloneChatSectionMessages(normalized.Messages),
			CreatedAt:           int(time.Now().UnixMilli()),
			ParentBranchID:      nil,
			BranchFromMessageID: nil,
		}
	}
	activeBranch := normalized.Branches[activeBranchID]
	if len(activeBranch.Messages) == 0 && len(normalized.Messages) != 0 {
		activeBranch.Messages = cloneChatSectionMessages(normalized.Messages)
		normalized.Branches[activeBranchID] = activeBranch
	}
	normalized.ActiveBranchID = cloneOptionalChatFieldID(&activeBranchID)
	normalized.Messages = cloneChatSectionMessages(activeBranch.Messages)
	return normalized, nil
}

func cloneOptionalChatFieldID(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func cloneTypedChatSectionBranches(
	branches map[string]ChatSectionBranch,
) map[string]ChatSectionBranch {
	if len(branches) == 0 {
		return map[string]ChatSectionBranch{}
	}
	cloned := make(map[string]ChatSectionBranch, len(branches))
	for branchID, branch := range branches {
		trimmedBranchID := strings.TrimSpace(branchID)
		if trimmedBranchID == "" {
			continue
		}
		cloned[trimmedBranchID] = ChatSectionBranch{
			Messages:            cloneChatSectionMessages(branch.Messages),
			CreatedAt:           branch.CreatedAt,
			ParentBranchID:      cloneOptionalChatFieldID(branch.ParentBranchID),
			BranchFromMessageID: cloneOptionalChatFieldID(branch.BranchFromMessageID),
		}
	}
	return cloned
}

func resolvedChatBranchID(value *string) (string, error) {
	if value != nil {
		trimmed := strings.TrimSpace(*value)
		if trimmed != "" {
			return trimmed, nil
		}
	}
	return newProjectStateID()
}

func selectCanonicalChatBranchID(branches map[string]ChatSectionBranch) string {
	if len(branches) == 0 {
		return ""
	}
	branchIDs := make([]string, 0, len(branches))
	for branchID := range branches {
		branchIDs = append(branchIDs, branchID)
	}
	sort.Slice(branchIDs, func(i int, j int) bool {
		left := branches[branchIDs[i]]
		right := branches[branchIDs[j]]
		if left.CreatedAt == right.CreatedAt {
			return branchIDs[i] < branchIDs[j]
		}
		return left.CreatedAt < right.CreatedAt
	})
	return branchIDs[0]
}

func cloneChatSectionBranches(branches map[string]ChatSectionBranch) map[string]any {
	if len(branches) == 0 {
		return map[string]any{}
	}
	cloned := make(map[string]any, len(branches))
	for branchID, branch := range branches {
		cloned[branchID] = map[string]any{
			"messages":            cloneChatSectionMessages(branch.Messages),
			"createdAt":           branch.CreatedAt,
			"parentBranchId":      normalizedOptionalChatFieldID(branch.ParentBranchID),
			"branchFromMessageId": normalizedOptionalChatFieldID(branch.BranchFromMessageID),
		}
	}
	return cloned
}
