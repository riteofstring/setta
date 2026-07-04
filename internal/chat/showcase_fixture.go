package chat

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	UIShowcaseConversationID      = "conversation_ui_showcase"
	uiShowcaseCompletedRunID      = "run_ui_showcase_all_activity"
	uiShowcaseUserInputRunID      = "run_ui_showcase_user_input"
	uiShowcaseFailedRunID         = "run_ui_showcase_failed"
	uiShowcaseCancelledRunID      = "run_ui_showcase_cancelled"
	uiShowcaseConversationTitle   = "UI Showcase Chat"
	uiShowcaseUserInputApprovalID = "approval_ui_showcase_user_input"
)

var uiShowcaseRunIDs = []string{
	uiShowcaseCompletedRunID,
	uiShowcaseUserInputRunID,
	uiShowcaseFailedRunID,
	uiShowcaseCancelledRunID,
}

var uiShowcaseOutputByType = map[RunItemType]string{
	RunItemTypeAgentMessage:        "agent message provider item received\n",
	RunItemTypePlan:                "plan item persisted\n",
	RunItemTypeReasoning:           "reasoning summary stored\n",
	RunItemTypeCommandExecution:    "package chat\n\nfunc Example() {}\n",
	RunItemTypeFileChange:          "updated internal/chat/showcase.go\n",
	RunItemTypeMCPToolCall:         "# README\n\nfixture content\n",
	RunItemTypeDynamicToolCall:     `{"ok":true,"kind":"dynamic_tool"}` + "\n",
	RunItemTypeCollabAgentToolCall: "subagent notes: no visual blockers\n",
	RunItemTypeWebSearch:           "Search result 1\nSearch result 2\nSearch result 3\n",
	RunItemTypeImageView:           "opened screenshots/chat.png\n",
	RunItemTypeImageGeneration:     "generated image id image_showcase\n",
	RunItemTypeTerminalInteraction: "VITE ready in 512 ms\n",
	RunItemTypeDiff:                "--- a/showcase.go\n+++ b/showcase.go\n@@\n+showcase\n",
	RunItemTypeContextCompaction:   "context compaction completed\n",
	RunItemTypeNotice:              "notice emitted\n",
	RunItemTypeApprovalRequest:     "approval requested for command\n",
	RunItemTypeApprovalReview:      "review decision: approved\n",
	RunItemTypeHook:                "hook stderr: style-only warning\n",
	RunItemTypeStructuredInput:     "structured schema presented\n",
}

type UIShowcaseSeedResult struct {
	Conversation Conversation
	RunIDs       []string
}

func SeedUIShowcaseConversation(store *Store, workspaceID string, seededAt time.Time) (UIShowcaseSeedResult, error) {
	if store == nil {
		return UIShowcaseSeedResult{}, fmt.Errorf("chat store is required")
	}
	if workspaceID == "" {
		return UIShowcaseSeedResult{}, fmt.Errorf("workspace id is required")
	}
	seededAt = uiShowcaseSeedTime(seededAt)
	if err := removeUIShowcaseArtifacts(store, workspaceID); err != nil {
		return UIShowcaseSeedResult{}, err
	}
	conversation := uiShowcaseConversation(workspaceID, seededAt)
	if err := seedUIShowcaseRecords(store, workspaceID, conversation, seededAt); err != nil {
		return UIShowcaseSeedResult{}, err
	}
	return UIShowcaseSeedResult{
		Conversation: conversation,
		RunIDs:       append([]string{}, uiShowcaseRunIDs...),
	}, nil
}

func uiShowcaseSeedTime(seededAt time.Time) time.Time {
	if seededAt.IsZero() {
		return time.Now().UTC()
	}
	return seededAt.UTC()
}

func seedUIShowcaseRecords(store *Store, workspaceID string, conversation Conversation, seededAt time.Time) error {
	if err := store.SaveConversation(conversation); err != nil {
		return err
	}
	if err := store.SaveGoal(workspaceID, UIShowcaseConversationID, uiShowcaseGoal(seededAt)); err != nil {
		return err
	}
	if err := seedUIShowcaseMessages(store, workspaceID, seededAt); err != nil {
		return err
	}
	if err := seedUIShowcaseRuns(store, workspaceID, seededAt); err != nil {
		return err
	}
	return seedUIShowcaseRunItems(store, workspaceID, seededAt)
}

func seedUIShowcaseMessages(store *Store, workspaceID string, seededAt time.Time) error {
	for _, message := range uiShowcaseMessages(seededAt) {
		if err := store.SaveMessage(workspaceID, message); err != nil {
			return err
		}
	}
	return nil
}

func seedUIShowcaseRuns(store *Store, workspaceID string, seededAt time.Time) error {
	for _, run := range uiShowcaseRuns(workspaceID, seededAt) {
		if err := store.SaveRun(run); err != nil {
			return err
		}
	}
	return nil
}

func removeUIShowcaseArtifacts(store *Store, workspaceID string) error {
	if err := os.RemoveAll(store.conversationDir(workspaceID, UIShowcaseConversationID)); err != nil {
		return &PersistenceError{Operation: "remove UI showcase conversation", Path: store.conversationDir(workspaceID, UIShowcaseConversationID), Err: err}
	}
	for _, runID := range uiShowcaseRunIDs {
		if err := os.Remove(store.runPath(workspaceID, runID)); err != nil && !os.IsNotExist(err) {
			return &PersistenceError{Operation: "remove UI showcase run", Path: store.runPath(workspaceID, runID), Err: err}
		}
		runDir := filepath.Join(store.runsDir(workspaceID), runID)
		if err := os.RemoveAll(runDir); err != nil {
			return &PersistenceError{Operation: "remove UI showcase run artifacts", Path: runDir, Err: err}
		}
	}
	return nil
}

func uiShowcaseConversation(workspaceID string, seededAt time.Time) Conversation {
	timestampValue := timestamp(seededAt)
	reasoning := ReasoningEffortXHigh
	return Conversation{
		SchemaVersion: SchemaVersion,
		ID:            UIShowcaseConversationID,
		WorkspaceID:   workspaceID,
		Title:         uiShowcaseConversationTitle,
		CreatedAt:     timestamp(seededAt.Add(-10 * time.Minute)),
		UpdatedAt:     timestampValue,
		CodexSettings: &ChatCodexSettings{
			Model:           "gpt-5-codex",
			ReasoningEffort: &reasoning,
		},
		CodexEffectiveSettings: &ChatCodexEffectiveSettings{
			Model:                      "gpt-5-codex",
			ModelDisplayName:           "GPT-5 Codex",
			ReasoningEffort:            &reasoning,
			ReasoningEffortDisplayName: "Extra high",
		},
		HarnessRefs: []HarnessThreadRef{{
			Harness:       HarnessCodex,
			ThreadID:      "thread_ui_showcase",
			SessionID:     "session_ui_showcase",
			LastTurnID:    "turn_ui_showcase",
			Status:        HarnessRefLinked,
			CreatedAt:     timestamp(seededAt.Add(-9 * time.Minute)),
			LastResumedAt: timestampValue,
		}},
	}
}

func uiShowcaseGoal(seededAt time.Time) ChatGoalState {
	budget := 20000
	return ChatGoalState{
		ThreadID:        "thread_ui_showcase",
		Objective:       "Style every chat interface element in one reloadable fixture.",
		Status:          "active",
		TokenBudget:     &budget,
		TokensUsed:      7342,
		TimeUsedSeconds: 186,
		CreatedAt:       int(seededAt.Add(-8 * time.Minute).Unix()),
		UpdatedAt:       int(seededAt.Unix()),
	}
}

func uiShowcaseMessages(seededAt time.Time) []ChatMessage {
	return []ChatMessage{
		uiShowcaseMessage("message_ui_showcase_system", "", RoleSystem, MessageDeliveryNormal, 1, MessageStatusComplete, "System note: this fixture intentionally includes stable examples of every chat surface.", TextFormatMarkdown, seededAt.Add(-7*time.Minute)),
		uiShowcaseMessage("message_ui_showcase_developer", "", RoleDeveloper, MessageDeliveryNormal, 2, MessageStatusComplete, "Developer note: keep cards dense, aligned, and readable across narrow panes.", TextFormatMarkdown, seededAt.Add(-6*time.Minute)),
		uiShowcaseMessage("message_ui_showcase_user", uiShowcaseCompletedRunID, RoleUser, MessageDeliveryNormal, 3, MessageStatusComplete, "Create a durable UI showcase with reasoning, tool calls, outputs, approvals, notices, and diffs.", TextFormatPlain, seededAt.Add(-5*time.Minute)),
		uiShowcaseMessage("message_ui_showcase_steering", uiShowcaseCompletedRunID, RoleUser, MessageDeliverySteering, 4, MessageStatusComplete, "Also include steering state and long output previews.", TextFormatPlain, seededAt.Add(-4*time.Minute-30*time.Second)),
		uiShowcaseMessage("message_ui_showcase_assistant", uiShowcaseCompletedRunID, RoleAssistant, MessageDeliveryNormal, 5, MessageStatusComplete, "UI showcase started.\n\nThe activity stack below covers reasoning, plans, command execution, file changes, MCP tools, dynamic tools, web search, images, terminal sessions, diffs, notices, approval reviews, hooks, and structured input.\n\nUI showcase complete.", TextFormatMarkdown, seededAt.Add(-4*time.Minute)),
		uiShowcaseMessage("message_ui_showcase_command", "", RoleCommand, MessageDeliveryNormal, 6, MessageStatusComplete, uiShowcaseCommandMessageText(), TextFormatPlain, seededAt.Add(-3*time.Minute-30*time.Second)),
		uiShowcaseMessage("message_ui_showcase_tool", "", RoleTool, MessageDeliveryNormal, 7, MessageStatusComplete, "{\"tool\":\"style_probe\",\"ok\":true,\"rows\":17}", TextFormatPlain, seededAt.Add(-3*time.Minute)),
		uiShowcaseMessage("message_ui_showcase_waiting", "", RoleAssistant, MessageDeliveryNormal, 8, MessageStatusStreaming, "", TextFormatMarkdown, seededAt.Add(-2*time.Minute-45*time.Second)),
		uiShowcaseMessage("message_ui_showcase_queued", "", RoleUser, MessageDeliveryQueued, 9, MessageStatusPending, "Queued follow-up preview that is not attached to a live queue.", TextFormatPlain, seededAt.Add(-2*time.Minute-30*time.Second)),
		uiShowcaseMessage("message_ui_showcase_standalone_steering", "", RoleUser, MessageDeliverySteering, 10, MessageStatusComplete, "Standalone steering message preview.", TextFormatPlain, seededAt.Add(-2*time.Minute)),
		uiShowcaseMessage("message_ui_showcase_user_input_user", uiShowcaseUserInputRunID, RoleUser, MessageDeliveryNormal, 11, MessageStatusComplete, "Show the user-input approval card.", TextFormatPlain, seededAt.Add(-100*time.Second)),
		uiShowcaseMessage("message_ui_showcase_user_input_assistant", uiShowcaseUserInputRunID, RoleAssistant, MessageDeliveryNormal, 12, MessageStatusStreaming, "Waiting for a user-input approval answer.", TextFormatMarkdown, seededAt.Add(-95*time.Second)),
		uiShowcaseMessage("message_ui_showcase_failed_user", uiShowcaseFailedRunID, RoleUser, MessageDeliveryNormal, 13, MessageStatusComplete, "Show failed assistant state.", TextFormatPlain, seededAt.Add(-90*time.Second)),
		uiShowcaseMessage("message_ui_showcase_failed_assistant", uiShowcaseFailedRunID, RoleAssistant, MessageDeliveryNormal, 14, MessageStatusError, "The scripted fixture failed this turn on purpose so error styling is visible.", TextFormatMarkdown, seededAt.Add(-80*time.Second)),
		uiShowcaseMessage("message_ui_showcase_cancelled_user", uiShowcaseCancelledRunID, RoleUser, MessageDeliveryNormal, 15, MessageStatusComplete, "Show cancelled assistant state.", TextFormatPlain, seededAt.Add(-70*time.Second)),
		uiShowcaseMessage("message_ui_showcase_cancelled_assistant", uiShowcaseCancelledRunID, RoleAssistant, MessageDeliveryNormal, 16, MessageStatusCancelled, "The scripted fixture cancelled this turn on purpose so cancelled styling is visible.", TextFormatMarkdown, seededAt.Add(-60*time.Second)),
	}
}

func uiShowcaseCommandMessageText() string {
	lines := []string{
		"Model set: gpt-5-codex",
		"Reasoning set: Extra high",
		"Showcase output matrix:",
	}
	for _, label := range []string{
		"system notice",
		"developer instruction",
		"command output",
		"tool payload",
		"streaming assistant",
		"queued user turn",
		"steering update",
		"user-input approval",
		"failed run copy",
		"cancelled run copy",
		"long monospace preview",
		"wrapped plain text",
		"status badge alignment",
		"timestamp grouping",
		"footer approval spacing",
		"overview pane spacing",
	} {
		lines = append(lines, "- "+label)
	}
	return strings.Join(lines, "\n")
}

func uiShowcaseMessage(id string, runID string, role MessageRole, delivery MessageDelivery, ordinal int, status MessageStatus, text string, format TextFormat, createdAt time.Time) ChatMessage {
	return ChatMessage{
		SchemaVersion:  SchemaVersion,
		ID:             id,
		ConversationID: UIShowcaseConversationID,
		RunID:          runID,
		Role:           role,
		Delivery:       delivery,
		Ordinal:        ordinal,
		CreatedAt:      timestamp(createdAt),
		UpdatedAt:      timestamp(createdAt),
		Status:         status,
		Parts: []MessagePart{{
			ID:   id + "_part",
			Type: MessagePartText,
			Text: &MessageTextPart{
				Text:   text,
				Format: format,
			},
		}},
	}
}

func uiShowcaseRuns(workspaceID string, seededAt time.Time) []Run {
	return []Run{
		uiShowcaseRun(workspaceID, uiShowcaseCompletedRunID, "message_ui_showcase_user", "message_ui_showcase_assistant", RunStatusCompleted, "Create a durable UI showcase", "", seededAt.Add(-5*time.Minute), seededAt.Add(-4*time.Minute)),
		uiShowcaseUserInputRun(workspaceID, seededAt),
		uiShowcaseRun(workspaceID, uiShowcaseFailedRunID, "message_ui_showcase_failed_user", "message_ui_showcase_failed_assistant", RunStatusFailed, "Show failed assistant state", "scripted fixture failure", seededAt.Add(-90*time.Second), seededAt.Add(-80*time.Second)),
		uiShowcaseRun(workspaceID, uiShowcaseCancelledRunID, "message_ui_showcase_cancelled_user", "message_ui_showcase_cancelled_assistant", RunStatusCancelled, "Show cancelled assistant state", "scripted fixture cancellation", seededAt.Add(-70*time.Second), seededAt.Add(-60*time.Second)),
	}
}

func uiShowcaseRun(workspaceID string, runID string, triggerMessageID string, assistantMessageID string, status RunStatus, promptSummary string, runError string, startedAt time.Time, completedAt time.Time) Run {
	completedAtValue := ""
	if !completedAt.IsZero() {
		completedAtValue = timestamp(completedAt)
	}
	return Run{
		SchemaVersion:      SchemaVersion,
		ID:                 runID,
		WorkspaceID:        workspaceID,
		ConversationID:     UIShowcaseConversationID,
		TriggerMessageID:   triggerMessageID,
		AssistantMessageID: assistantMessageID,
		Harness:            HarnessCodex,
		Status:             status,
		StartedAt:          timestamp(startedAt),
		CompletedAt:        completedAtValue,
		PromptSummary:      promptSummary,
		Error:              runError,
	}
}

func uiShowcaseUserInputRun(workspaceID string, seededAt time.Time) Run {
	run := uiShowcaseRun(
		workspaceID,
		uiShowcaseUserInputRunID,
		"message_ui_showcase_user_input_user",
		"message_ui_showcase_user_input_assistant",
		RunStatusRunning,
		"Show the user-input approval card",
		"",
		seededAt.Add(-100*time.Second),
		time.Time{},
	)
	run.PendingApproval = &ApprovalRequest{
		ID:        uiShowcaseUserInputApprovalID,
		RunID:     uiShowcaseUserInputRunID,
		Kind:      ApprovalKindUserInput,
		Title:     "User input approval",
		Body:      "Answer the scripted free-form question before this run can continue.",
		Status:    ApprovalStatusPending,
		CreatedAt: timestamp(seededAt.Add(-94 * time.Second)),
		Questions: []ApprovalQuestion{{
			ID:       "showcase_answer",
			Header:   "Answer",
			Question: "What should the UI showcase continue with?",
			Options:  []string{},
		}},
	}
	return run
}

func seedUIShowcaseRunItems(store *Store, workspaceID string, seededAt time.Time) error {
	for index, item := range uiShowcaseRunItems(uiShowcaseCompletedRunID) {
		item.SchemaVersion = SchemaVersion
		item.ID = fmt.Sprintf("run_item_ui_showcase_%02d", index+1)
		item.WorkspaceID = workspaceID
		item.ConversationID = UIShowcaseConversationID
		item.RunID = uiShowcaseCompletedRunID
		item.CreatedAt = timestamp(seededAt.Add(-4*time.Minute + time.Duration(index)*time.Second))
		if item.Status != RunItemStatusPending {
			item.StartedAt = item.CreatedAt
		}
		if item.Status == RunItemStatusCompleted || item.Status == RunItemStatusFailed || item.Status == RunItemStatusCancelled {
			item.CompletedAt = timestamp(seededAt.Add(-4*time.Minute + time.Duration(index)*time.Second + 500*time.Millisecond))
		}
		if err := store.SaveRunItem(item); err != nil {
			return err
		}
		if output := uiShowcaseOutput(item.Type); output != "" {
			if err := store.SaveRunItemOutput(workspaceID, uiShowcaseCompletedRunID, RunItemOutput{
				SchemaVersion: SchemaVersion,
				ID:            fmt.Sprintf("run_item_output_ui_showcase_%02d", index+1),
				RunItemID:     item.ID,
				Stream:        uiShowcaseOutputStream(item),
				Ordinal:       1,
				Text:          output,
				CreatedAt:     item.CreatedAt,
			}); err != nil {
				return err
			}
		}
	}
	return nil
}

func uiShowcaseRunItems(runID string) []RunItem {
	return []RunItem{
		{
			ProviderItemID: "provider_ui_agent_message_" + runID,
			Type:           RunItemTypeAgentMessage,
			Status:         RunItemStatusCompleted,
			Title:          "Agent message item",
			Summary:        "Assistant message activity generated from provider item updates.",
		},
		{
			ProviderItemID: "provider_ui_plan_" + runID,
			Type:           RunItemTypePlan,
			Status:         RunItemStatusCompleted,
			Title:          "Plan update",
			Progress:       "1. Inspect chat surfaces\n2. Add showcase activity\n3. Verify styling hooks\n",
			Summary:        "A multi-step plan activity.",
		},
		{
			ProviderItemID: "provider_ui_reasoning_" + runID,
			Type:           RunItemTypeReasoning,
			Status:         RunItemStatusCompleted,
			Title:          "Reasoning summary",
			Progress:       "Checked the render matrix and selected representative fields for each activity type.\n",
			HiddenText:     "private reasoning placeholder",
			Summary:        "Visible reasoning summary.",
		},
		{
			ProviderItemID: "provider_ui_command_" + runID,
			Type:           RunItemTypeCommandExecution,
			Status:         RunItemStatusCompleted,
			Title:          "Command execution",
			Summary:        "Read a source file through a command.",
			Details: NewRunItemCommandExecutionDetails(RunItemCommandExecutionDetails{
				Command:    "sed -n '1,120p' internal/chat/scripted_workflow_harness.go",
				Cwd:        "/tmp/setta-workspace",
				ExitCode:   0,
				DurationMs: 128,
				ProcessID:  "proc-showcase",
			}),
		},
		{
			ProviderItemID: "provider_ui_file_change_" + runID,
			Type:           RunItemTypeFileChange,
			Status:         RunItemStatusCompleted,
			Title:          "File change",
			Summary:        "Updated a fake file to exercise file path chips.",
			Details: newRunItemFileChangeDetails("updated", []RunItemFileChangePath{
				newRunItemFileChangePath("/tmp/setta-workspace/internal/chat/showcase.go", runItemFileChangeOperationPtr(RunItemFileChangeOperationUpdate), "", "+showcase\n"),
			}),
		},
		{
			ProviderItemID: "provider_ui_mcp_" + runID,
			Type:           RunItemTypeMCPToolCall,
			Status:         RunItemStatusRunning,
			Details: NewRunItemMCPToolCallDetails(RunItemMCPToolCallDetails{
				ServerName:   "filesystem",
				ToolName:     "read_text_file",
				DisplayTitle: "MCP: filesystem",
				Progress:     "Reading fixture content",
				Arguments:    json.RawMessage(`{"path":"/tmp/setta-workspace/README.md"}`),
			}),
		},
		{
			ProviderItemID: "provider_ui_dynamic_tool_" + runID,
			Type:           RunItemTypeDynamicToolCall,
			Status:         RunItemStatusCompleted,
			Title:          "Dynamic tool call",
			Details: NewRunItemDynamicToolCallDetails(RunItemDynamicToolCallDetails{
				Namespace:     "setta",
				ToolName:      "styleProbe",
				DisplayTitle:  "Style probe",
				Description:   "Inspect chat transcript styling hooks.",
				Category:      "ui",
				Arguments:     json.RawMessage(`{"selectors":["[data-testid=chat-transcript-region]"],"ok":true}`),
				ResultSummary: "tool returned structured data",
				Result: &RunItemDynamicToolResult{
					ContentItems: []RunItemDynamicToolContentItem{{Type: "inputText", Text: "tool returned structured data"}},
					Success:      runItemDynamicToolSuccess(true),
				},
			}),
		},
		{
			ProviderItemID: "provider_ui_collab_agent_" + runID,
			Type:           RunItemTypeCollabAgentToolCall,
			Status:         RunItemStatusCompleted,
			Title:          "Collab agent tool call",
			Namespace:      "multi_agent",
			ToolName:       "review_ui",
			Result:         "subagent completed review",
			RawDetails:     json.RawMessage(`{"agent":"ui-reviewer","findingCount":0}`),
		},
		{
			ProviderItemID: "provider_ui_web_search_" + runID,
			Type:           RunItemTypeWebSearch,
			Status:         RunItemStatusCompleted,
			Title:          "Web search",
			ToolName:       "web_search",
			Result:         "Found three relevant sources",
			RawDetails:     json.RawMessage(`{"query":"codex chat activity styling","results":3}`),
		},
		{
			ProviderItemID: "provider_ui_image_view_" + runID,
			Type:           RunItemTypeImageView,
			Status:         RunItemStatusCompleted,
			Title:          "Image view",
			FilePaths:      []string{"/tmp/setta-workspace/screenshots/chat.png"},
			Summary:        "Viewed a screenshot artifact.",
			RawDetails:     json.RawMessage(`{"width":1440,"height":900}`),
		},
		{
			ProviderItemID: "provider_ui_image_generation_" + runID,
			Type:           RunItemTypeImageGeneration,
			Status:         RunItemStatusCompleted,
			Title:          "Image generation",
			Summary:        "Generated a mock visual asset.",
			Result:         "image asset ready",
			RawDetails:     json.RawMessage(`{"prompt":"chat UI texture","mimeType":"image/png"}`),
		},
		{
			ProviderItemID: "provider_ui_terminal_" + runID,
			Type:           RunItemTypeTerminalInteraction,
			Status:         RunItemStatusRunning,
			Title:          "Terminal interaction",
			Command:        "npm run dev",
			Cwd:            "/tmp/setta-workspace",
			ProcessID:      "pty-showcase",
			Progress:       "Interactive process is waiting for input",
		},
		{
			ProviderItemID: "provider_ui_diff_" + runID,
			Type:           RunItemTypeDiff,
			Status:         RunItemStatusCompleted,
			Title:          "Diff",
			Details: newRunItemDiffDetails(`--- a/internal/chat/showcase.go
+++ b/internal/chat/showcase.go
@@
-old showcase
+new showcase
--- a/desktop/src/styles.css
+++ b/desktop/src/styles.css
@@
+body { color: var(--foreground); }
`),
		},
		{
			ProviderItemID: "provider_ui_context_compaction_" + runID,
			Type:           RunItemTypeContextCompaction,
			Status:         RunItemStatusCompleted,
			Title:          "Context compaction",
			Summary:        "Conversation context was compacted and the run continued.",
			Progress:       "Compacted 18 transcript items into a handoff summary.",
		},
		{
			ProviderItemID: "provider_ui_notice_" + runID,
			Type:           RunItemTypeNotice,
			Status:         RunItemStatusCompleted,
			Title:          "Notice",
			NoticeKind:     "warning",
			NoticeMessage:  "This is a scripted warning notice for styling.",
		},
		{
			ProviderItemID: "provider_ui_approval_request_" + runID,
			Type:           RunItemTypeApprovalRequest,
			Status:         RunItemStatusPending,
			Title:          "Command approval",
			Summary:        "Approve the showcase command.",
			Details: NewRunItemApprovalDetails(RunItemApprovalDetails{
				ApprovalID:        "approval-showcase-command",
				ApprovalKind:      approvalKindPtr(ApprovalKindCommand),
				ApprovalStatus:    approvalStatusPtr(ApprovalStatusPending),
				ProviderRequestID: "approval-request-showcase",
				Title:             "Command approval",
				Body:              "Approve the showcase command.",
				Command:           "printf showcase",
				Cwd:               "/tmp/setta-workspace",
			}),
		},
		{
			ProviderItemID: "provider_ui_approval_review_" + runID,
			Type:           RunItemTypeApprovalReview,
			Status:         RunItemStatusCompleted,
			Title:          "Approval review",
			Summary:        "Auto-review approved the requested action.",
			Details: NewRunItemApprovalDetails(RunItemApprovalDetails{
				ReviewID:     "review-showcase",
				ReviewStatus: "approved",
				ActionType:   "command",
				Title:        "Approval review",
				Body:         "Auto-review approved the requested action.",
				Review:       json.RawMessage(`{"status":"approved","risk":"low"}`),
				Action:       json.RawMessage(`{"type":"command","command":"printf showcase"}`),
			}),
		},
		{
			ProviderItemID: "provider_ui_hook_" + runID,
			Type:           RunItemTypeHook,
			Status:         RunItemStatusFailed,
			Title:          "Hook",
			Error:          "pre-command hook returned a style-only warning",
			Summary:        "Hook output with failed status styling.",
			RawDetails:     json.RawMessage(`{"hook":"pre-command","durationMs":42}`),
		},
		{
			ProviderItemID: "provider_ui_structured_input_" + runID,
			Type:           RunItemTypeStructuredInput,
			Status:         RunItemStatusPending,
			Title:          "Structured input",
			ServerName:     "deploy",
			RequestID:      "structured-request-showcase",
			Summary:        "MCP elicitation form schema.",
			RawDetails: json.RawMessage(`{
				"type": "object",
				"properties": {
					"environment": {"type": "string", "enum": ["staging", "production"]},
					"confirm": {"type": "boolean"}
				},
				"required": ["environment", "confirm"]
			}`),
		},
	}
}

func uiShowcaseOutput(itemType RunItemType) string {
	return uiShowcaseOutputByType[itemType]
}

func uiShowcaseOutputStream(item RunItem) string {
	if item.Status == RunItemStatusFailed {
		return "stderr"
	}
	return "stdout"
}
