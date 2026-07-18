package chat

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"setta/internal/workspace"
)

type ChatCommandErrorCode string

const (
	ChatCommandErrorUnknownCommand     ChatCommandErrorCode = "unknown_command"
	ChatCommandErrorMalformedCommand   ChatCommandErrorCode = "malformed_command"
	ChatCommandErrorUnavailable        ChatCommandErrorCode = "command_unavailable"
	ChatCommandErrorUnsupportedHarness ChatCommandErrorCode = "command_unsupported_by_harness"
	ChatCommandErrorCodexThread        ChatCommandErrorCode = "codex_thread_unavailable"
	ChatCommandErrorCodexRPC           ChatCommandErrorCode = "codex_app_server_rpc_failed"
	ChatCommandErrorCodexProviderDrift ChatCommandErrorCode = "codex_provider_drift"
	ChatCommandErrorGoalNotSet         ChatCommandErrorCode = "goal_not_set"
	ChatCommandErrorGoalReplaceConfirm ChatCommandErrorCode = "goal_replacement_requires_confirmation"
	ChatCommandErrorPermissionConfirm  ChatCommandErrorCode = "permission_change_requires_confirmation"
	ChatCommandErrorWrongEndpoint      ChatCommandErrorCode = "slash_command_wrong_endpoint"
)

const maxGoalObjectiveRunes = 4000

type ChatCommandError struct {
	Code    ChatCommandErrorCode
	Message string
	Err     error
}

func (err *ChatCommandError) Error() string {
	if err.Message != "" {
		return err.Message
	}
	if err.Err != nil {
		return err.Err.Error()
	}
	return string(err.Code)
}

func (err *ChatCommandError) Unwrap() error {
	return err.Err
}

func IsChatCommandError(err error) (*ChatCommandError, bool) {
	var commandErr *ChatCommandError
	if errors.As(err, &commandErr) {
		return commandErr, true
	}
	return nil, false
}

func commandError(code ChatCommandErrorCode, message string, err error) error {
	return &ChatCommandError{Code: code, Message: message, Err: err}
}

func noGoalCommandError(action GoalCommandAction) error {
	switch action {
	case GoalCommandClear:
		return commandError(ChatCommandErrorGoalNotSet, "No goal is set to clear.", nil)
	case GoalCommandPause:
		return commandError(ChatCommandErrorGoalNotSet, "No goal is set to pause.", nil)
	case GoalCommandResume:
		return commandError(ChatCommandErrorGoalNotSet, "No goal is set to resume.", nil)
	default:
		return commandError(ChatCommandErrorGoalNotSet, "No goal is set.", nil)
	}
}

func ParseChatCommand(raw string) (ChatCommand, error) {
	if !strings.HasPrefix(raw, "/") {
		return ChatCommand{}, commandError(ChatCommandErrorMalformedCommand, "slash command must start with /", nil)
	}
	trimmed := strings.TrimRight(raw, " \t\r\n")
	rest := strings.TrimPrefix(trimmed, "/")
	if rest == "" {
		return ChatCommand{}, commandError(ChatCommandErrorMalformedCommand, "slash command name is required", nil)
	}
	name, args := splitCommandNameAndArgs(rest)
	if !isValidCommandName(name) {
		return ChatCommand{}, commandError(ChatCommandErrorMalformedCommand, "slash command name must use lowercase letters and hyphens: "+name, nil)
	}
	definition, ok := chatCommandDefinitionByName(name)
	if !ok {
		return ChatCommand{}, commandError(ChatCommandErrorUnknownCommand, "unknown slash command: /"+name, nil)
	}
	return parseChatCommandDefinition(raw, args, definition)
}

func splitCommandNameAndArgs(rest string) (string, string) {
	for index, char := range rest {
		if char == ' ' || char == '\t' || char == '\r' || char == '\n' {
			return rest[:index], strings.TrimLeft(rest[index:], " \t\r\n")
		}
	}
	return rest, ""
}

func isValidCommandName(name string) bool {
	hasLetter := false
	for _, char := range name {
		switch {
		case char >= 'a' && char <= 'z':
			hasLetter = true
		case char == '-':
		default:
			return false
		}
	}
	return hasLetter
}

func goalChatCommand(raw string, args string, action GoalCommandAction, objective string, status string) ChatCommand {
	return ChatCommand{
		Args: args,
		Goal: &GoalCommand{
			Action:    action,
			Objective: objective,
			Status:    status,
		},
		Kind: ChatCommandGoal,
		Raw:  raw,
	}
}

func modelChatCommand(raw string, args string, action ModelCommandAction, modelID string, effort *ReasoningEffort) ChatCommand {
	return ChatCommand{
		Args: args,
		Kind: ChatCommandModel,
		Model: &ModelCommand{
			Action:          action,
			ModelID:         modelID,
			ReasoningEffort: effort,
		},
		Raw: raw,
	}
}

func modelPickerChatCommand() ChatCommand {
	return modelChatCommand("model_picker", "", ModelCommandShowPicker, "", nil)
}

func modelSetChatCommand(modelID string) (ChatCommand, error) {
	modelID = strings.TrimSpace(modelID)
	if modelID == "" || strings.ContainsAny(modelID, " \t\r\n") {
		return ChatCommand{}, commandError(ChatCommandErrorMalformedCommand, "model id is required and must not contain whitespace", nil)
	}
	return modelChatCommand("model_set", "", ModelCommandSet, modelID, nil), nil
}

func reasoningEffortSetChatCommand(effort ReasoningEffort) (ChatCommand, error) {
	if !validValue(effort, reasoningEffortValues) {
		return ChatCommand{}, commandError(ChatCommandErrorMalformedCommand, "unsupported reasoning level: "+string(effort), nil)
	}
	return modelChatCommand("model_reasoning_effort_set", "", ModelCommandSetEffort, "", reasoningEffortResult(effort)), nil
}

func permissionChatCommand(raw string, args string, action PermissionCommandAction, preset ChatPermissionPresetID, confirmed bool) ChatCommand {
	return ChatCommand{
		Args: args,
		Kind: ChatCommandPermission,
		Permission: &PermissionCommand{
			Action:    action,
			Preset:    preset,
			Confirmed: confirmed,
		},
		Raw: raw,
	}
}

func permissionPickerChatCommand() ChatCommand {
	return permissionChatCommand("permission_picker", "", PermissionCommandShowPicker, "", false)
}

func permissionPresetSetChatCommand(preset ChatPermissionPresetID, confirmed bool) (ChatCommand, error) {
	if _, ok := chatPermissionPresetByID(preset); !ok {
		return ChatCommand{}, commandError(ChatCommandErrorMalformedCommand, "unsupported permission preset: "+string(preset), nil)
	}
	return permissionChatCommand("permission_set", "", PermissionCommandSet, preset, confirmed), nil
}

type HarnessCommandExecutor interface {
	ExecuteCommand(context.Context, HarnessCommandRequest) (HarnessCommandResult, error)
	ListCommandCapabilities(context.Context, HarnessCommandListRequest) (HarnessCommandListResult, error)
}

type HarnessCommandRequest struct {
	Workspace    workspace.WorkspaceSummary
	Conversation Conversation
	ThreadRef    HarnessThreadRef
	ActiveRun    *Run
	Command      ChatCommand
}

type HarnessCommandListRequest struct {
	Workspace    workspace.WorkspaceSummary
	Conversation Conversation
	ThreadRef    HarnessThreadRef
	ActiveRun    *Run
}

type HarnessCommandResult struct {
	Action                   ChatCommandResultAction
	CapabilityDiagnostic     string
	CodexEffectiveSettings   *ChatCodexEffectiveSettings
	CodexSettings            *ChatCodexSettings
	CurrentPermission        *ChatCodexEffectivePermissionSettings
	Goal                     *ChatGoalState
	Models                   []ChatModelOption
	PermissionPresets        []ChatPermissionPreset
	SelectedPermissionPreset *ChatPermissionPresetID
	SelectedModel            string
	ReasoningEfforts         []ChatReasoningEffortOption
	SelectedReasoningEffort  *ReasoningEffort
	ThreadRef                HarnessThreadRef
	HasThreadRef             bool
}

type HarnessCommandListResult struct {
	Commands []ChatCommandDescriptor
}

func ensureCommandAvailable(command ChatCommand, activeRun *Run) error {
	if activeRun == nil {
		return nil
	}
	switch command.Kind {
	case ChatCommandGoal:
		return nil
	case ChatCommandModel:
		return commandError(ChatCommandErrorUnavailable, "model commands are unavailable while a run is active", nil)
	case ChatCommandPermission:
		return commandError(ChatCommandErrorUnavailable, "permission changes apply after the current run finishes", nil)
	default:
		return commandError(ChatCommandErrorUnsupportedHarness, fmt.Sprintf("unsupported chat command kind: %s", command.Kind), nil)
	}
}

func commandNeedsThread(command ChatCommand) bool {
	switch command.Kind {
	case ChatCommandGoal:
		return true
	case ChatCommandModel:
		return command.Model != nil && (command.Model.Action == ModelCommandSet || command.Model.Action == ModelCommandSetEffort)
	case ChatCommandPermission:
		return command.Permission != nil && command.Permission.Action == PermissionCommandSet
	default:
		return false
	}
}

func reasoningEffortDisplayName(effort ReasoningEffort) string {
	switch effort {
	case ReasoningEffortNone:
		return "None"
	case ReasoningEffortMinimal:
		return "Minimal"
	case ReasoningEffortLow:
		return "Low"
	case ReasoningEffortMedium:
		return "Medium"
	case ReasoningEffortHigh:
		return "High"
	case ReasoningEffortXHigh:
		return "Extra high"
	case ReasoningEffortMax:
		return "Max"
	default:
		return string(effort)
	}
}

func reasoningEffortResult(effort ReasoningEffort) *ReasoningEffort {
	if effort == "" {
		return nil
	}
	return &effort
}

func rejectSlashPromptForMessageEndpoint(prompt string) error {
	if !strings.HasPrefix(prompt, "/") {
		return nil
	}
	command, err := ParseChatCommand(prompt)
	if err != nil {
		return err
	}
	return commandError(
		ChatCommandErrorWrongEndpoint,
		fmt.Sprintf("slash command /%s must be executed through the chat command endpoint", command.Kind),
		nil,
	)
}
