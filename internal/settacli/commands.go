package settacli

import (
	"encoding/json"
	"fmt"
	"strings"
)

type versionOutput struct {
	Version string `json:"version"`
}

type commandsOutput struct {
	Commands []CommandSpec `json:"commands"`
}

type helpOutput struct {
	Command   CommandSpec `json:"command"`
	ExitCodes []exitCode  `json:"exitCodes"`
}

type exitCode struct {
	Code    int    `json:"code"`
	Meaning string `json:"meaning"`
}

type schemaOutput struct {
	Command      string         `json:"command"`
	InputSchema  map[string]any `json:"inputSchema"`
	OutputSchema map[string]any `json:"outputSchema"`
}

type errorsOutput struct {
	ExitCodes []exitCode `json:"exitCodes"`
}

type agentGuideOutput struct {
	Format string `json:"format"`
	Text   string `json:"text"`
}

func commandSpecs() []CommandSpec {
	return []CommandSpec{
		{
			Path:             []string{"version"},
			Summary:          "Print CLI version metadata.",
			Usage:            "setta version [--json]",
			OutputSchemaName: "Version",
			Examples:         []string{"setta version --json"},
			handler:          handleVersion,
		},
		{
			Path:             []string{"health"},
			Summary:          "Read backend health through the configured backend address.",
			Usage:            "setta [--backend-addr URL] health [--json]",
			RequiresBackend:  true,
			OutputSchemaName: "BackendHealth",
			RelatedOperations: []string{
				"BackendHealth",
			},
			Examples: []string{"setta --backend-addr http://127.0.0.1:54321 health --json"},
			handler:  handleHealth,
		},
		{
			Path:             []string{"commands"},
			Summary:          "List CLI commands and machine-readable command metadata.",
			Usage:            "setta commands [--json]",
			OutputSchemaName: "CLICommandList",
			Examples:         []string{"setta commands --json"},
			handler:          handleCommands,
		},
		{
			Path:             []string{"help"},
			Summary:          "Describe a command path.",
			Usage:            "setta help <command-path> [--json]",
			RequiredFlags:    []string{"<command-path>"},
			OutputSchemaName: "CLIHelp",
			Examples:         []string{"setta help workspace open --json"},
			handler:          handleHelp,
		},
		{
			Path:             []string{"schema"},
			Summary:          "Print input and output JSON Schemas for a command path.",
			Usage:            "setta schema <command-path> [--json]",
			RequiredFlags:    []string{"<command-path>"},
			OutputSchemaName: "CLISchema",
			Examples:         []string{"setta schema chat send --json"},
			handler:          handleSchema,
		},
		{
			Path:             []string{"errors"},
			Summary:          "List CLI exit code classes.",
			Usage:            "setta errors [--json]",
			OutputSchemaName: "CLIErrors",
			Examples:         []string{"setta errors --json"},
			handler:          handleErrors,
		},
		backendStartSpec(),
		{
			Path:             []string{"backend", "status"},
			Summary:          "Read backend status from the configured backend address.",
			Usage:            "setta [--backend-addr URL] backend status [--json]",
			RequiresBackend:  true,
			OutputSchemaName: "BackendHealth",
			RelatedOperations: []string{
				"BackendHealth",
			},
			Examples: []string{"SETTA_BACKEND_ADDR=http://127.0.0.1:54321 setta backend status --json"},
			handler:  handleBackendStatus,
		},
		apiEndpointsSpec(),
		apiSchemaSpec(),
		apiCallSpec(),
		apiStreamSpec(),
		workflowSpec([]string{"workspace", "session"}, "Read the current workspace session.", "setta workspace session --json", false, "WorkspaceSession", []string{"WorkspaceSession"}, handleWorkspaceSession),
		workflowSpec([]string{"workspace", "open"}, "Open a local workspace path.", "setta workspace open PATH --json", true, "OpenWorkspaceResponse", []string{"OpenWorkspace"}, handleWorkspaceOpen),
		workflowSpec([]string{"workspace", "select"}, "Select an active workspace.", "setta workspace select WORKSPACE_ID --json", true, "WorkspaceSession", []string{"SelectWorkspace"}, handleWorkspaceSelect),
		workflowSpec([]string{"workspace", "close"}, "Close an active workspace.", "setta workspace close WORKSPACE_ID --json", true, "WorkspaceSession", []string{"CloseWorkspace"}, handleWorkspaceClose),
		dangerousWorkflowSpec([]string{"workspace", "recent", "remove"}, "Remove a recent workspace entry.", "setta workspace recent remove WORKSPACE_ID --confirm --json", "WorkspaceSession", []string{"RemoveRecentWorkspace"}, handleWorkspaceRecentRemove),
		workflowSpec([]string{"workspace", "reorder"}, "Reorder active workspaces from a JSON array of workspace IDs.", "setta workspace reorder --ids-file ids.json --json", true, "WorkspaceSession", []string{"ReorderWorkspace"}, handleWorkspaceReorder),
		workflowSpec([]string{"conversation", "list"}, "List conversations for a workspace.", "setta conversation list --workspace WORKSPACE_ID --json", false, "ListConversationsResponse", []string{"ListConversations"}, handleConversationList),
		workflowSpec([]string{"conversation", "create"}, "Create a conversation in a workspace.", "setta conversation create --workspace WORKSPACE_ID --title TITLE --json", true, "Conversation", []string{"CreateConversation"}, handleConversationCreate),
		workflowSpec([]string{"conversation", "mark-read"}, "Advance a conversation read marker.", "setta conversation mark-read --workspace WORKSPACE_ID --conversation CONVERSATION_ID --json", true, "ConversationListItem", []string{"MarkConversationRead"}, handleConversationMarkRead),
		workflowSpec([]string{"message", "page"}, "Read a bounded page of conversation messages.", "setta message page --workspace WORKSPACE_ID --conversation CONVERSATION_ID --limit 100 --json", false, "MessagePage", []string{"GetMessagePage"}, handleMessagePage),
		chatPromptSpec([]string{"chat", "send"}, "Send a user prompt to a conversation.", "setta chat send --workspace WORKSPACE_ID --conversation CONVERSATION_ID --prompt-file - --json", "SendMessageResult", []string{"SendChatMessage"}, handleChatSend, true),
		chatPromptSpec([]string{"chat", "queue"}, "Queue a user prompt behind an active run.", "setta chat queue --workspace WORKSPACE_ID --conversation CONVERSATION_ID --prompt-file - --json", "QueueMessageResult", []string{"QueueChatMessage"}, handleChatQueue, false),
		chatPromptSpec([]string{"chat", "queue", "edit"}, "Edit a queued prompt.", "setta chat queue edit --workspace WORKSPACE_ID --conversation CONVERSATION_ID --message MESSAGE_ID --prompt-file - --json", "QueueEditResult", []string{"EditQueuedChatMessage"}, handleChatQueueEdit, false),
		workflowSpec([]string{"chat", "queue", "remove"}, "Remove a queued prompt.", "setta chat queue remove --workspace WORKSPACE_ID --conversation CONVERSATION_ID --message MESSAGE_ID --json", true, "QueueRemoveResult", []string{"RemoveQueuedChatMessage"}, handleChatQueueRemove),
		chatPromptSpec([]string{"chat", "steer"}, "Send steering text to an active run.", "setta chat steer --workspace WORKSPACE_ID --conversation CONVERSATION_ID --prompt-file - --json", "SteerMessageResult", []string{"SteerChatMessage"}, handleChatSteer, false),
		chatPromptSpec([]string{"chat", "steer-immediate"}, "Cancel the active run and immediately replay pending steering.", "setta chat steer-immediate --workspace WORKSPACE_ID --conversation CONVERSATION_ID --prompt-file - --json", "ImmediateSteeringResult", []string{"SendSteeringImmediately"}, handleChatSteerImmediate, false),
		workflowSpec([]string{"chat", "command", "list"}, "List chat slash commands available for a conversation.", "setta chat command list --workspace WORKSPACE_ID --conversation CONVERSATION_ID --json", false, "ChatCommandListResult", []string{"ListChatCommands"}, handleChatCommandList),
		workflowSpec([]string{"chat", "command", "execute"}, "Execute a raw chat slash command.", "setta chat command execute --workspace WORKSPACE_ID --conversation CONVERSATION_ID --raw \"/goal ...\" --json", true, "ChatCommandExecuteResult", []string{"ExecuteChatCommand"}, handleChatCommandExecute),
		workflowSpec([]string{"chat", "model", "set"}, "Set a conversation Codex model.", "setta chat model set --workspace WORKSPACE_ID --conversation CONVERSATION_ID --model MODEL_ID --json", true, "ChatCommandExecuteResult", []string{"SetChatCodexModel"}, handleChatModelSet),
		workflowSpec([]string{"chat", "reasoning-effort", "set"}, "Set a conversation Codex reasoning effort.", "setta chat reasoning-effort set --workspace WORKSPACE_ID --conversation CONVERSATION_ID --effort high --json", true, "ChatCommandExecuteResult", []string{"SetChatCodexReasoningEffort"}, handleChatReasoningEffortSet),
		workflowSpec([]string{"run", "active"}, "Read the active run for a conversation.", "setta run active --workspace WORKSPACE_ID --conversation CONVERSATION_ID --json", false, "GetActiveRunResponse", []string{"GetActiveRun"}, handleRunActive),
		workflowSpec([]string{"run", "list"}, "List runs for a conversation.", "setta run list --workspace WORKSPACE_ID --conversation CONVERSATION_ID --json", false, "ListRunsResponse", []string{"ListRuns"}, handleRunList),
		workflowSpec([]string{"run", "activity"}, "Read bounded run activity.", "setta run activity --workspace WORKSPACE_ID --run RUN_ID --limit 200 --json", false, "RunActivityPage", []string{"GetRunActivity"}, handleRunActivity),
		workflowSpec([]string{"run", "item-output"}, "Read bounded output for a run item.", "setta run item-output --workspace WORKSPACE_ID --run RUN_ID --item RUN_ITEM_ID --after 0 --limit 200 --json", false, "RunItemOutputPage", []string{"GetRunItemOutputPage"}, handleRunItemOutput),
		runWatchSpec(),
		dangerousWorkflowSpec([]string{"run", "cancel"}, "Cancel the active run for a conversation.", "setta run cancel --workspace WORKSPACE_ID --conversation CONVERSATION_ID --confirm --json", "Run", []string{"CancelRun"}, handleRunCancel),
		workflowSpec([]string{"approval", "list"}, "List pending approvals for a conversation.", "setta approval list --workspace WORKSPACE_ID --conversation CONVERSATION_ID --json", false, "ListApprovalsResponse", []string{"ListApprovals"}, handleApprovalList),
		workflowSpec([]string{"approval", "submit"}, "Approve or deny a pending approval.", "setta approval submit --workspace WORKSPACE_ID --conversation CONVERSATION_ID --approval APPROVAL_ID --approve --json", true, "Run", []string{"SubmitApproval"}, handleApprovalSubmit),
		workflowSpec([]string{"approval", "answer"}, "Answer a structured or user-input approval.", "setta approval answer --workspace WORKSPACE_ID --conversation CONVERSATION_ID --approval APPROVAL_ID --answers-file answers.json --json", true, "Run", []string{"SubmitApproval"}, handleApprovalAnswer),
		workflowSpec([]string{"approval", "cancel"}, "Cancel a pending approval.", "setta approval cancel --workspace WORKSPACE_ID --conversation CONVERSATION_ID --approval APPROVAL_ID --json", true, "Run", []string{"SubmitApproval"}, handleApprovalCancel),
		workflowSpec([]string{"codex", "account", "get"}, "Read Codex account state.", "setta codex account get --json", false, "CodexAccountState", []string{"ReadCodexAccount"}, handleCodexAccountGet),
		workflowSpec([]string{"codex", "account", "refresh"}, "Refresh Codex account state.", "setta codex account refresh --json", true, "CodexAccountState", []string{"RefreshCodexAccount"}, handleCodexAccountRefresh),
		workflowSpec([]string{"codex", "login", "start"}, "Start Codex login.", "setta codex login start --type chatgpt --json", true, "StartCodexLoginResponse", []string{"StartCodexLogin"}, handleCodexLoginStart),
		workflowSpec([]string{"codex", "login", "cancel"}, "Cancel Codex login.", "setta codex login cancel --login LOGIN_ID --json", true, "CodexAccountState", []string{"CancelCodexLogin"}, handleCodexLoginCancel),
		dangerousWorkflowSpec([]string{"codex", "logout"}, "Log out of Codex.", "setta codex logout --confirm --json", "CodexAccountState", []string{"LogoutCodexAccount"}, handleCodexLogout),
		{
			Path:             []string{"agent", "guide"},
			Summary:          "Print a concise Setta CLI bootstrap guide for agent instruction files.",
			Usage:            "setta agent guide --format markdown",
			OutputSchemaName: "AgentGuide",
			Examples:         []string{"setta agent guide --format markdown"},
			handler:          handleAgentGuide,
		},
		{
			Path:             []string{"agent", "skill", "export"},
			Summary:          "Export the Setta CLI skill package.",
			Usage:            "setta agent skill export --output DIR",
			Mutates:          true,
			OutputSchemaName: "AgentSkillExport",
			RequiredFlags:    []string{"--output"},
			Examples:         []string{"setta agent skill export --output /tmp/skills"},
			handler:          handleAgentSkillExport,
		},
	}
}

func workflowSpec(path []string, summary string, usage string, mutates bool, outputSchema string, operations []string, handler commandHandler) CommandSpec {
	inputSchema := ""
	if len(operations) > 0 {
		inputSchema = endpointRequestSchemaName(operations[0])
	}
	return CommandSpec{
		Path:              path,
		Summary:           summary,
		Usage:             usage,
		Mutates:           mutates,
		RequiresBackend:   true,
		InputSchemaName:   inputSchema,
		OutputSchemaName:  outputSchema,
		RelatedOperations: operations,
		Examples:          []string{usage},
		handler:           handler,
	}
}

func dangerousWorkflowSpec(path []string, summary string, usage string, outputSchema string, operations []string, handler commandHandler) CommandSpec {
	spec := workflowSpec(path, summary, usage, true, outputSchema, operations, handler)
	spec.Dangerous = true
	spec.RequiredFlags = append(spec.RequiredFlags, "--confirm")
	return spec
}

func chatPromptSpec(path []string, summary string, usage string, outputSchema string, operations []string, handler commandHandler, supportsNDJSON bool) CommandSpec {
	spec := workflowSpec(path, summary, usage, true, outputSchema, operations, handler)
	spec.RequiredFlags = append(spec.RequiredFlags, "--workspace", "--conversation", "--prompt-file")
	spec.SupportsNDJSON = supportsNDJSON
	return spec
}

func handleVersion(context *Context, args []string) error {
	if len(args) != 0 {
		return invalidError("version does not accept positional arguments")
	}
	return context.writeCommandData([]string{"version"}, versionOutput{Version: defaultString(context.Getenv("SETTA_CLI_VERSION"), "dev")})
}

func handleCommands(context *Context, args []string) error {
	if len(args) != 0 {
		return invalidError("commands does not accept positional arguments")
	}
	return context.writeCommandData([]string{"commands"}, commandsOutput{Commands: context.Registry.Commands()})
}

func handleHelp(context *Context, args []string) error {
	if len(args) == 0 {
		return invalidError("help requires a command path")
	}
	command, ok := context.Registry.Find(args)
	if !ok {
		return invalidError("unknown help command path: " + strings.Join(args, " "))
	}
	return context.writeCommandData([]string{"help"}, helpOutput{Command: publicCommand(*command), ExitCodes: exitCodes()})
}

func handleSchema(context *Context, args []string) error {
	if len(args) == 0 {
		return invalidError("schema requires a command path")
	}
	command, ok := context.Registry.Find(args)
	if !ok {
		return invalidError("unknown schema command path: " + strings.Join(args, " "))
	}
	inputSchema, err := schemaForName(command.InputSchemaName)
	if err != nil {
		return err
	}
	outputSchema, err := schemaForName(command.OutputSchemaName)
	if err != nil {
		return err
	}
	return context.writeCommandData([]string{"schema"}, schemaOutput{
		Command:      commandPath(command.Path),
		InputSchema:  inputSchema,
		OutputSchema: outputSchema,
	})
}

func handleErrors(context *Context, args []string) error {
	if len(args) != 0 {
		return invalidError("errors does not accept positional arguments")
	}
	return context.writeCommandData([]string{"errors"}, errorsOutput{ExitCodes: exitCodes()})
}

func handleHealth(context *Context, args []string) error {
	if len(args) != 0 {
		return invalidError("health does not accept positional arguments")
	}
	return callAndWrite(context, []string{"health"}, "BackendHealth", nil)
}

func handleBackendStatus(context *Context, args []string) error {
	if len(args) != 0 {
		return invalidError("backend status does not accept positional arguments")
	}
	return callAndWrite(context, []string{"backend", "status"}, "BackendHealth", nil)
}

func schemaForName(name string) (map[string]any, error) {
	if name == "" {
		return map[string]any{"type": "null"}, nil
	}
	schema, ok, err := schemaByName(name)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("schema not found: %s", name)
	}
	return schema, nil
}

func publicCommand(command CommandSpec) CommandSpec {
	command.handler = nil
	return command
}

func exitCodes() []exitCode {
	return []exitCode{
		{Code: exitSuccess, Meaning: "success"},
		{Code: exitInvalid, Meaning: "invalid command or invalid arguments"},
		{Code: exitBackendUnavailable, Meaning: "backend unavailable"},
		{Code: exitAuth, Meaning: "authentication or account state failure"},
		{Code: exitPermission, Meaning: "permission or approval denied"},
		{Code: exitNotFound, Meaning: "not found"},
		{Code: exitConflict, Meaning: "conflict or active-run state mismatch"},
		{Code: exitRuntime, Meaning: "backend/runtime failure"},
		{Code: exitValidation, Meaning: "validation failure from backend contract"},
		{Code: exitCancelled, Meaning: "interrupted or cancelled"},
	}
}

func callAndWrite(context *Context, command []string, operation string, request any) error {
	client, err := context.client()
	if err != nil {
		return err
	}
	ctx, cancel := context.commandContext()
	defer cancel()
	response, err := client.Call(ctx, operation, request)
	if err != nil {
		return err
	}
	var data any
	if err := json.Unmarshal(response, &data); err != nil {
		return fmt.Errorf("decode %s response: %w", operation, err)
	}
	return context.writeCommandData(command, data)
}
