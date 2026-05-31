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
	ChatCommandErrorWrongEndpoint      ChatCommandErrorCode = "slash_command_wrong_endpoint"
)

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
	switch name {
	case "goal", "goals":
		return parseGoalCommand(raw, args), nil
	case "mcp":
		return ChatCommand{Args: args, Kind: ChatCommandMCP, Raw: raw}, nil
	case "model":
		return parseModelCommand(raw, args)
	case "new":
		return ChatCommand{Args: args, Kind: ChatCommandNew, Raw: raw}, nil
	case "skills":
		return ChatCommand{Args: args, Kind: ChatCommandSkills, Raw: raw}, nil
	default:
		return ChatCommand{}, commandError(ChatCommandErrorUnknownCommand, "unknown slash command: /"+name, nil)
	}
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

func parseGoalCommand(raw string, args string) ChatCommand {
	switch args {
	case "":
		return goalChatCommand(raw, args, GoalCommandShow, "", "")
	case "clear":
		return goalChatCommand(raw, args, GoalCommandClear, "", "")
	case "pause":
		return goalChatCommand(raw, args, GoalCommandPause, "", "paused")
	case "resume":
		return goalChatCommand(raw, args, GoalCommandResume, "", "active")
	default:
		return goalChatCommand(raw, args, GoalCommandSet, args, "active")
	}
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

func parseModelCommand(raw string, args string) (ChatCommand, error) {
	if args == "" {
		return modelChatCommand(raw, args, ModelCommandShowPicker, ""), nil
	}
	if strings.ContainsAny(args, " \t\r\n") {
		return ChatCommand{}, commandError(ChatCommandErrorMalformedCommand, "/model accepts exactly one model id", nil)
	}
	return modelChatCommand(raw, args, ModelCommandSet, args), nil
}

func modelChatCommand(raw string, args string, action ModelCommandAction, modelID string) ChatCommand {
	return ChatCommand{
		Args: args,
		Kind: ChatCommandModel,
		Model: &ModelCommand{
			Action:  action,
			ModelID: modelID,
		},
		Raw: raw,
	}
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
	Action         ChatCommandResultAction
	DisplayMessage string
	DisplayTitle   string
	Goal           *ChatGoalState
	Models         []ChatModelOption
	SelectedModel  string
	ThreadRef      HarnessThreadRef
	HasThreadRef   bool
}

type HarnessCommandListResult struct {
	Commands []ChatCommandCapability
}

func defaultCommandCapabilities(activeRun *Run) []ChatCommandCapability {
	modelAvailable := activeRun == nil
	modelReason := ""
	if activeRun != nil {
		modelReason = "model commands are unavailable while a run is active"
	}
	return []ChatCommandCapability{
		{
			Available:   true,
			Description: "Show, set, pause, resume, or clear the active goal.",
			Kind:        ChatCommandGoal,
			Name:        "/goal",
			Usage:       "/goal [objective|clear|pause|resume]",
		},
		{
			Available:   true,
			Description: "Alias for /goal.",
			Kind:        ChatCommandGoal,
			Name:        "/goals",
			Usage:       "/goals [objective|clear|pause|resume]",
		},
		{
			Available:   true,
			Description: "Create and switch to a new chat in the current workspace.",
			Kind:        ChatCommandNew,
			Name:        "/new",
			Usage:       "/new [title]",
		},
		{
			Available:         modelAvailable,
			Description:       "Open the model picker or set the model for future turns.",
			Kind:              ChatCommandModel,
			Name:              "/model",
			UnavailableReason: modelReason,
			Usage:             "/model [model-id]",
		},
		{
			Available:   true,
			Description: "List Codex skills available for this workspace.",
			Kind:        ChatCommandSkills,
			Name:        "/skills",
			Usage:       "/skills",
		},
		{
			Available:   true,
			Description: "Show Codex MCP server status and tool inventory.",
			Kind:        ChatCommandMCP,
			Name:        "/mcp",
			Usage:       "/mcp",
		},
	}
}

func ensureCommandAvailable(command ChatCommand, activeRun *Run) error {
	if activeRun == nil {
		return nil
	}
	switch command.Kind {
	case ChatCommandGoal:
		return nil
	case ChatCommandMCP:
		return nil
	case ChatCommandModel:
		return commandError(ChatCommandErrorUnavailable, "model commands are unavailable while a run is active", nil)
	case ChatCommandNew:
		return nil
	case ChatCommandSkills:
		return nil
	default:
		return commandError(ChatCommandErrorUnsupportedHarness, fmt.Sprintf("unsupported chat command kind: %s", command.Kind), nil)
	}
}

func commandNeedsThread(command ChatCommand) bool {
	switch command.Kind {
	case ChatCommandGoal:
		return true
	case ChatCommandModel:
		return command.Model != nil && command.Model.Action == ModelCommandSet
	case ChatCommandMCP, ChatCommandNew, ChatCommandSkills:
		return false
	default:
		return false
	}
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
