package settacli

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"

	"setta/internal/chat"
	"setta/internal/codexaccount"
	"setta/internal/httpapi"
)

func handleWorkspaceSession(context *Context, args []string) error {
	if len(args) != 0 {
		return invalidError("workspace session does not accept positional arguments")
	}
	return callAndWrite(context, []string{"workspace", "session"}, "WorkspaceSession", nil)
}

func handleWorkspaceOpen(context *Context, args []string) error {
	if len(args) != 1 {
		return invalidError("workspace open requires PATH")
	}
	return callAndWrite(context, []string{"workspace", "open"}, "OpenWorkspace", httpapi.OpenWorkspaceRequest{RootPath: args[0]})
}

func handleWorkspaceSelect(context *Context, args []string) error {
	if len(args) != 1 {
		return invalidError("workspace select requires WORKSPACE_ID")
	}
	return callAndWrite(context, []string{"workspace", "select"}, "SelectWorkspace", httpapi.SelectWorkspaceRequest{ID: args[0]})
}

func handleWorkspaceClose(context *Context, args []string) error {
	if len(args) != 1 {
		return invalidError("workspace close requires WORKSPACE_ID")
	}
	return callAndWrite(context, []string{"workspace", "close"}, "CloseWorkspace", httpapi.CloseWorkspaceRequest{ID: args[0]})
}

func handleWorkspaceRecentRemove(context *Context, args []string) error {
	flags := newFlagSet("workspace recent remove")
	confirm := flags.Bool("confirm", false, "confirm removal")
	if err := flags.Parse(args); err != nil {
		return invalidError(err.Error())
	}
	if flags.NArg() != 1 {
		return invalidError("workspace recent remove requires WORKSPACE_ID")
	}
	if !*confirm {
		return invalidError("workspace recent remove requires --confirm")
	}
	return callAndWrite(context, []string{"workspace", "recent", "remove"}, "RemoveRecentWorkspace", httpapi.RemoveRecentWorkspaceRequest{ID: flags.Arg(0)})
}

func handleWorkspaceReorder(context *Context, args []string) error {
	flags := newFlagSet("workspace reorder")
	idsFile := flags.String("ids-file", "", "JSON file containing workspace IDs")
	if err := flags.Parse(args); err != nil {
		return invalidError(err.Error())
	}
	if flags.NArg() != 0 {
		return invalidError("workspace reorder does not accept positional arguments")
	}
	if *idsFile == "" {
		return invalidError("workspace reorder requires --ids-file")
	}
	var ids []string
	if err := readJSONFile(context, *idsFile, &ids); err != nil {
		return err
	}
	return callAndWrite(context, []string{"workspace", "reorder"}, "ReorderWorkspace", httpapi.ReorderWorkspaceRequest{IDs: ids})
}

func handleConversationList(context *Context, args []string) error {
	flags := newFlagSet("conversation list")
	workspaceID := flags.String("workspace", "", "workspace ID")
	if err := flags.Parse(args); err != nil {
		return invalidError(err.Error())
	}
	if flags.NArg() != 0 {
		return invalidError("conversation list does not accept positional arguments")
	}
	if *workspaceID == "" {
		return invalidError("conversation list requires --workspace")
	}
	return callAndWrite(context, []string{"conversation", "list"}, "ListConversations", httpapi.ListConversationsRequest{WorkspaceID: *workspaceID})
}

func handleConversationCreate(context *Context, args []string) error {
	flags := newFlagSet("conversation create")
	workspaceID := flags.String("workspace", "", "workspace ID")
	title := flags.String("title", "", "conversation title")
	if err := flags.Parse(args); err != nil {
		return invalidError(err.Error())
	}
	if flags.NArg() != 0 {
		return invalidError("conversation create does not accept positional arguments")
	}
	if *workspaceID == "" {
		return invalidError("conversation create requires --workspace")
	}
	return callAndWrite(context, []string{"conversation", "create"}, "CreateConversation", httpapi.CreateConversationRequest{WorkspaceID: *workspaceID, Title: *title})
}

func handleConversationMarkRead(context *Context, args []string) error {
	flags := workspaceConversationFlags("conversation mark-read")
	if err := flags.parse(args); err != nil {
		return err
	}
	return callAndWrite(context, []string{"conversation", "mark-read"}, "MarkConversationRead", httpapi.MarkConversationReadRequest{
		WorkspaceID:    flags.workspaceID,
		ConversationID: flags.conversationID,
	})
}

func handleMessagePage(context *Context, args []string) error {
	flags := newFlagSet("message page")
	workspaceID := flags.String("workspace", "", "workspace ID")
	conversationID := flags.String("conversation", "", "conversation ID")
	before := flags.Int("before", 0, "before ordinal")
	limit := flags.Int("limit", 100, "page limit")
	if err := flags.Parse(args); err != nil {
		return invalidError(err.Error())
	}
	if flags.NArg() != 0 {
		return invalidError("message page does not accept positional arguments")
	}
	if *workspaceID == "" || *conversationID == "" {
		return invalidError("message page requires --workspace and --conversation")
	}
	return callAndWrite(context, []string{"message", "page"}, "GetMessagePage", httpapi.GetMessagePageRequest{
		BeforeOrdinal:  *before,
		ConversationID: *conversationID,
		Limit:          *limit,
		WorkspaceID:    *workspaceID,
	})
}

func handleChatSend(context *Context, args []string) error {
	flags, err := parsePromptFlags(context, "chat send", args, true)
	if err != nil {
		return err
	}
	request := httpapi.SendChatMessageRequest{WorkspaceID: flags.workspaceID, ConversationID: flags.conversationID, Prompt: flags.prompt}
	if !flags.wait {
		return callAndWrite(context, []string{"chat", "send"}, "SendChatMessage", request)
	}
	if !flags.ndjson {
		return invalidError("chat send --wait requires --ndjson")
	}
	result, err := callTyped[chat.SendMessageResult](context, "SendChatMessage", request)
	if err != nil {
		return err
	}
	return watchRun(context, flags.workspaceID, flags.conversationID, result.Run.ID)
}

func handleChatQueue(context *Context, args []string) error {
	flags, err := parsePromptFlags(context, "chat queue", args, false)
	if err != nil {
		return err
	}
	return callAndWrite(context, []string{"chat", "queue"}, "QueueChatMessage", httpapi.QueueChatMessageRequest{WorkspaceID: flags.workspaceID, ConversationID: flags.conversationID, Prompt: flags.prompt})
}

func handleChatQueueEdit(context *Context, args []string) error {
	flags, err := parsePromptFlags(context, "chat queue edit", args, false)
	if err != nil {
		return err
	}
	if flags.messageID == "" {
		return invalidError("chat queue edit requires --message")
	}
	return callAndWrite(context, []string{"chat", "queue", "edit"}, "EditQueuedChatMessage", httpapi.EditQueuedChatMessageRequest{
		ConversationID: flags.conversationID,
		MessageID:      flags.messageID,
		Prompt:         flags.prompt,
		WorkspaceID:    flags.workspaceID,
	})
}

func handleChatQueueRemove(context *Context, args []string) error {
	flags := newFlagSet("chat queue remove")
	workspaceID := flags.String("workspace", "", "workspace ID")
	conversationID := flags.String("conversation", "", "conversation ID")
	messageID := flags.String("message", "", "message ID")
	if err := flags.Parse(args); err != nil {
		return invalidError(err.Error())
	}
	if flags.NArg() != 0 {
		return invalidError("chat queue remove does not accept positional arguments")
	}
	if *workspaceID == "" || *conversationID == "" || *messageID == "" {
		return invalidError("chat queue remove requires --workspace, --conversation, and --message")
	}
	return callAndWrite(context, []string{"chat", "queue", "remove"}, "RemoveQueuedChatMessage", httpapi.RemoveQueuedChatMessageRequest{
		ConversationID: *conversationID,
		MessageID:      *messageID,
		WorkspaceID:    *workspaceID,
	})
}

func handleChatSteer(context *Context, args []string) error {
	flags, err := parsePromptFlags(context, "chat steer", args, false)
	if err != nil {
		return err
	}
	return callAndWrite(context, []string{"chat", "steer"}, "SteerChatMessage", httpapi.SteerChatMessageRequest{WorkspaceID: flags.workspaceID, ConversationID: flags.conversationID, Prompt: flags.prompt})
}

func handleChatSteerImmediate(context *Context, args []string) error {
	flags, err := parsePromptFlags(context, "chat steer-immediate", args, false)
	if err != nil {
		return err
	}
	return callAndWrite(context, []string{"chat", "steer-immediate"}, "SendSteeringImmediately", httpapi.SendSteeringImmediatelyRequest{WorkspaceID: flags.workspaceID, ConversationID: flags.conversationID, Prompt: flags.prompt})
}

func handleChatCommandList(context *Context, args []string) error {
	flags := workspaceConversationFlags("chat command list")
	if err := flags.parse(args); err != nil {
		return err
	}
	return callAndWrite(context, []string{"chat", "command", "list"}, "ListChatCommands", httpapi.ListChatCommandsRequest{WorkspaceID: flags.workspaceID, ConversationID: flags.conversationID})
}

func handleChatCommandExecute(context *Context, args []string) error {
	flags := newFlagSet("chat command execute")
	workspaceID := flags.String("workspace", "", "workspace ID")
	conversationID := flags.String("conversation", "", "conversation ID")
	raw := flags.String("raw", "", "raw slash command")
	confirmGoalReplacement := flags.Bool("confirm-goal-replacement", false, "confirm goal replacement")
	if err := flags.Parse(args); err != nil {
		return invalidError(err.Error())
	}
	if flags.NArg() != 0 {
		return invalidError("chat command execute does not accept positional arguments")
	}
	if *workspaceID == "" || *conversationID == "" || *raw == "" {
		return invalidError("chat command execute requires --workspace, --conversation, and --raw")
	}
	return callAndWrite(context, []string{"chat", "command", "execute"}, "ExecuteChatCommand", httpapi.ExecuteChatCommandRequest{
		ConfirmGoalReplacement: *confirmGoalReplacement,
		ConversationID:         *conversationID,
		Raw:                    *raw,
		WorkspaceID:            *workspaceID,
	})
}

func handleChatModelSet(context *Context, args []string) error {
	flags := newFlagSet("chat model set")
	workspaceID := flags.String("workspace", "", "workspace ID")
	conversationID := flags.String("conversation", "", "conversation ID")
	modelID := flags.String("model", "", "model ID")
	if err := flags.Parse(args); err != nil {
		return invalidError(err.Error())
	}
	if flags.NArg() != 0 {
		return invalidError("chat model set does not accept positional arguments")
	}
	if *workspaceID == "" || *conversationID == "" || *modelID == "" {
		return invalidError("chat model set requires --workspace, --conversation, and --model")
	}
	return callAndWrite(context, []string{"chat", "model", "set"}, "SetChatCodexModel", httpapi.SetChatCodexModelRequest{WorkspaceID: *workspaceID, ConversationID: *conversationID, ModelID: *modelID})
}

func handleChatReasoningEffortSet(context *Context, args []string) error {
	flags := newFlagSet("chat reasoning-effort set")
	workspaceID := flags.String("workspace", "", "workspace ID")
	conversationID := flags.String("conversation", "", "conversation ID")
	effort := flags.String("effort", "", "reasoning effort")
	if err := flags.Parse(args); err != nil {
		return invalidError(err.Error())
	}
	if flags.NArg() != 0 {
		return invalidError("chat reasoning-effort set does not accept positional arguments")
	}
	if *workspaceID == "" || *conversationID == "" || *effort == "" {
		return invalidError("chat reasoning-effort set requires --workspace, --conversation, and --effort")
	}
	return callAndWrite(context, []string{"chat", "reasoning-effort", "set"}, "SetChatCodexReasoningEffort", httpapi.SetChatCodexReasoningEffortRequest{
		ConversationID:  *conversationID,
		ReasoningEffort: chat.ReasoningEffort(*effort),
		WorkspaceID:     *workspaceID,
	})
}

func handleCodexAccountGet(context *Context, args []string) error {
	if len(args) != 0 {
		return invalidError("codex account get does not accept positional arguments")
	}
	return callAndWrite(context, []string{"codex", "account", "get"}, "ReadCodexAccount", nil)
}

func handleCodexAccountRefresh(context *Context, args []string) error {
	flags := newFlagSet("codex account refresh")
	refreshToken := flags.Bool("refresh-token", false, "refresh token")
	if err := flags.Parse(args); err != nil {
		return invalidError(err.Error())
	}
	if flags.NArg() != 0 {
		return invalidError("codex account refresh does not accept positional arguments")
	}
	return callAndWrite(context, []string{"codex", "account", "refresh"}, "RefreshCodexAccount", codexaccount.RefreshCodexAccountRequest{RefreshToken: *refreshToken})
}

func handleCodexLoginStart(context *Context, args []string) error {
	flags := newFlagSet("codex login start")
	loginType := flags.String("type", string(codexaccount.LoginTypeChatGPT), "login type")
	apiKey := flags.String("api-key", "", "API key for apiKey login")
	if err := flags.Parse(args); err != nil {
		return invalidError(err.Error())
	}
	if flags.NArg() != 0 {
		return invalidError("codex login start does not accept positional arguments")
	}
	return callAndWrite(context, []string{"codex", "login", "start"}, "StartCodexLogin", codexaccount.StartCodexLoginRequest{Type: codexaccount.CodexLoginType(*loginType), APIKey: *apiKey})
}

func handleCodexLoginCancel(context *Context, args []string) error {
	flags := newFlagSet("codex login cancel")
	loginID := flags.String("login", "", "login ID")
	if err := flags.Parse(args); err != nil {
		return invalidError(err.Error())
	}
	if flags.NArg() != 0 {
		return invalidError("codex login cancel does not accept positional arguments")
	}
	if *loginID == "" {
		return invalidError("codex login cancel requires --login")
	}
	return callAndWrite(context, []string{"codex", "login", "cancel"}, "CancelCodexLogin", codexaccount.CancelCodexLoginRequest{LoginID: *loginID})
}

func handleCodexLogout(context *Context, args []string) error {
	flags := newFlagSet("codex logout")
	confirm := flags.Bool("confirm", false, "confirm logout")
	if err := flags.Parse(args); err != nil {
		return invalidError(err.Error())
	}
	if flags.NArg() != 0 {
		return invalidError("codex logout does not accept positional arguments")
	}
	if !*confirm {
		return invalidError("codex logout requires --confirm")
	}
	return callAndWrite(context, []string{"codex", "logout"}, "LogoutCodexAccount", codexaccount.LogoutCodexAccountRequest{})
}

type workspaceConversationFlagValues struct {
	flagSet        *flag.FlagSet
	workspaceID    string
	conversationID string
}

type promptFlagValues struct {
	conversationID string
	messageID      string
	ndjson         bool
	prompt         string
	wait           bool
	workspaceID    string
}

func workspaceConversationFlags(name string) workspaceConversationFlagValues {
	flags := newFlagSet(name)
	values := workspaceConversationFlagValues{flagSet: flags}
	flags.StringVar(&values.workspaceID, "workspace", "", "workspace ID")
	flags.StringVar(&values.conversationID, "conversation", "", "conversation ID")
	return values
}

func (values *workspaceConversationFlagValues) parse(args []string) error {
	if err := values.flagSet.Parse(args); err != nil {
		return invalidError(err.Error())
	}
	if values.flagSet.NArg() != 0 {
		return invalidError(values.flagSet.Name() + " does not accept positional arguments")
	}
	if values.workspaceID == "" || values.conversationID == "" {
		return invalidError(values.flagSet.Name() + " requires --workspace and --conversation")
	}
	return nil
}

func parsePromptFlags(context *Context, name string, args []string, allowWait bool) (promptFlagValues, error) {
	flags := newFlagSet(name)
	values := promptFlagValues{}
	promptFile := flags.String("prompt-file", "", "prompt file path or - for stdin")
	flags.StringVar(&values.workspaceID, "workspace", "", "workspace ID")
	flags.StringVar(&values.conversationID, "conversation", "", "conversation ID")
	flags.StringVar(&values.messageID, "message", "", "message ID")
	flags.BoolVar(&values.wait, "wait", false, "wait for run events")
	flags.BoolVar(&values.ndjson, "ndjson", false, "write newline-delimited JSON")
	if err := flags.Parse(args); err != nil {
		return values, invalidError(err.Error())
	}
	if flags.NArg() != 0 {
		return values, invalidError(name + " does not accept positional arguments")
	}
	if values.workspaceID == "" || values.conversationID == "" || *promptFile == "" {
		return values, invalidError(name + " requires --workspace, --conversation, and --prompt-file")
	}
	if values.wait && !allowWait {
		return values, invalidError(name + " does not support --wait")
	}
	prompt, err := readTextFile(context, *promptFile)
	if err != nil {
		return values, err
	}
	values.prompt = prompt
	return values, nil
}

func newFlagSet(name string) *flag.FlagSet {
	flags := flag.NewFlagSet(name, flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	return flags
}

func readTextFile(context *Context, path string) (string, error) {
	var data []byte
	var err error
	if path == "-" {
		data, err = io.ReadAll(context.Stdin)
	} else {
		data, err = os.ReadFile(path)
	}
	if err != nil {
		return "", fmt.Errorf("read %s: %w", path, err)
	}
	return string(data), nil
}

func readJSONFile(context *Context, path string, target any) error {
	var data []byte
	var err error
	if path == "-" {
		data, err = io.ReadAll(context.Stdin)
	} else {
		data, err = os.ReadFile(path)
	}
	if err != nil {
		return fmt.Errorf("read %s: %w", path, err)
	}
	if err := json.Unmarshal(data, target); err != nil {
		return validationError(fmt.Sprintf("decode %s: %v", path, err))
	}
	return nil
}

func callTyped[T any](context *Context, operation string, request any) (T, error) {
	var zero T
	client, err := context.client()
	if err != nil {
		return zero, err
	}
	ctx, cancel := context.commandContext()
	defer cancel()
	raw, err := client.Call(ctx, operation, request)
	if err != nil {
		return zero, err
	}
	var decoded T
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return zero, fmt.Errorf("decode %s response: %w", operation, err)
	}
	return decoded, nil
}
