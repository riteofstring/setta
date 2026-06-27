package chat

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"setta/internal/codexapp"
)

type CodexHistoryAdapter struct{}

type CodexHistoryThreadProjectionOptions struct {
	WorkspaceID string
	Internal    bool
	Workflow    *ConversationWorkflowMetadata
}

type CodexHistoryMessagePage struct {
	Page            MessagePage
	NextCursor      *string
	BackwardsCursor *string
}

func (adapter CodexHistoryAdapter) ThreadTurnsListParams(threadID string, cursor *string, limit int) codexapp.ThreadTurnsListParams {
	itemsView := codexapp.TurnItemsViewFull
	sortDirection := codexapp.SortDirectionDesc
	params := codexapp.ThreadTurnsListParams{
		Cursor:        cursor,
		ItemsView:     &itemsView,
		SortDirection: &sortDirection,
		ThreadID:      threadID,
	}
	if limit > 0 {
		params.Limit = &limit
	}
	return params
}

func (adapter CodexHistoryAdapter) ThreadReadIncludeTurnsParams(threadID string) codexapp.ThreadReadParams {
	includeTurns := true
	return codexapp.ThreadReadParams{IncludeTurns: &includeTurns, ThreadID: threadID}
}

func (adapter CodexHistoryAdapter) ProjectThread(thread codexapp.Thread, options CodexHistoryThreadProjectionOptions) (Conversation, error) {
	if options.WorkspaceID == "" {
		return Conversation{}, fmt.Errorf("codex history projection workspace id is required")
	}
	if thread.ID == "" {
		return Conversation{}, fmt.Errorf("codex history thread.id is required")
	}
	createdAt := codexHistoryTimestamp(thread.CreatedAt)
	updatedAt := codexHistoryTimestamp(thread.UpdatedAt)
	lastTurnID := ""
	if len(thread.Turns) > 0 {
		lastTurnID = thread.Turns[len(thread.Turns)-1].ID
	}
	return Conversation{
		SchemaVersion: SchemaVersion,
		ID:            thread.ID,
		WorkspaceID:   options.WorkspaceID,
		Title:         codexHistoryThreadTitle(thread),
		Internal:      options.Internal,
		CreatedAt:     createdAt,
		UpdatedAt:     updatedAt,
		HarnessRefs: []HarnessThreadRef{{
			Harness:       HarnessCodex,
			ThreadID:      thread.ID,
			SessionID:     thread.SessionId,
			LastTurnID:    lastTurnID,
			Status:        HarnessRefLinked,
			CreatedAt:     createdAt,
			LastResumedAt: updatedAt,
		}},
		Workflow: options.Workflow,
	}, nil
}

func (adapter CodexHistoryAdapter) ProjectThreadRead(response codexapp.ThreadReadResponse, options CodexHistoryThreadProjectionOptions) (CodexHistoryMessagePage, error) {
	conversation, err := adapter.ProjectThread(response.Thread, options)
	if err != nil {
		return CodexHistoryMessagePage{}, err
	}
	page, err := adapter.projectTurns(conversation, response.Thread.Turns)
	if err != nil {
		return CodexHistoryMessagePage{}, err
	}
	return CodexHistoryMessagePage{Page: page}, nil
}

func (adapter CodexHistoryAdapter) ProjectTurnsPage(thread codexapp.Thread, response codexapp.ThreadTurnsListResponse, options CodexHistoryThreadProjectionOptions) (CodexHistoryMessagePage, error) {
	conversation, err := adapter.ProjectThread(thread, options)
	if err != nil {
		return CodexHistoryMessagePage{}, err
	}
	page, err := adapter.projectTurns(conversation, codexHistoryChronologicalTurnsFromDescendingPage(response.Data))
	if err != nil {
		return CodexHistoryMessagePage{}, err
	}
	page.HasMoreOlder = response.NextCursor != nil
	if len(page.Messages) > 0 {
		page.OlderBeforeOrdinal = page.Messages[0].Ordinal
	}
	return CodexHistoryMessagePage{
		Page:            page,
		NextCursor:      response.NextCursor,
		BackwardsCursor: response.BackwardsCursor,
	}, nil
}

func (adapter CodexHistoryAdapter) projectTurns(conversation Conversation, turns []codexapp.Turn) (MessagePage, error) {
	page := MessagePage{Conversation: conversation}
	nextOrdinal := 1
	for turnIndex, turn := range turns {
		projection, err := adapter.projectTurn(conversation, turn, turnIndex, &nextOrdinal)
		if err != nil {
			return MessagePage{}, err
		}
		page.Messages = append(page.Messages, projection.messages...)
		page.RunItems = append(page.RunItems, projection.runItems...)
		page.RunItemOutputs = append(page.RunItemOutputs, projection.outputs...)
		page.Transcript = append(page.Transcript, projection.transcript)
	}
	return page, nil
}

func codexHistoryChronologicalTurnsFromDescendingPage(turns []codexapp.Turn) []codexapp.Turn {
	if len(turns) < 2 {
		return turns
	}
	chronological := make([]codexapp.Turn, len(turns))
	for index, turn := range turns {
		chronological[len(turns)-1-index] = turn
	}
	return chronological
}

type codexHistoryTurnProjection struct {
	messages   []ChatMessage
	outputs    []RunItemOutput
	runItems   []RunItem
	transcript TranscriptTurn
}

type codexHistoryTurnBuilder struct {
	assistant  *ChatMessage
	projection codexHistoryTurnProjection
	steering   []ChatMessage
	trigger    *ChatMessage
}

func (adapter CodexHistoryAdapter) projectTurn(conversation Conversation, turn codexapp.Turn, turnIndex int, nextOrdinal *int) (codexHistoryTurnProjection, error) {
	if err := requireCodexHistoryFullTurnItems(turn, turnIndex); err != nil {
		return codexHistoryTurnProjection{}, err
	}
	runStatus, assistantStatus, err := codexHistoryRunStatus(turn)
	if err != nil {
		return codexHistoryTurnProjection{}, err
	}
	timing := codexHistoryTurnTiming{
		conversationCreatedAt: conversation.CreatedAt,
		conversationUpdatedAt: conversation.UpdatedAt,
		startedAt:             codexHistoryOptionalTimestamp(turn.StartedAt),
		completedAt:           codexHistoryOptionalTimestamp(turn.CompletedAt),
	}

	builder := codexHistoryTurnBuilder{}

	for itemIndex, rawItem := range turn.Items {
		item, itemType, err := decodeCodexHistoryItem(rawItem, turn.ID, itemIndex)
		if err != nil {
			return codexHistoryTurnProjection{}, err
		}
		if err := adapter.projectTurnItem(conversation.ID, turn, item, itemType, timing, assistantStatus, runStatus, nextOrdinal, &builder); err != nil {
			return codexHistoryTurnProjection{}, err
		}
	}

	if builder.trigger == nil {
		return codexHistoryTurnProjection{}, fmt.Errorf("codex history turn %s has no userMessage item", turn.ID)
	}
	run := Run{
		SchemaVersion:      SchemaVersion,
		ID:                 turn.ID,
		WorkspaceID:        conversation.WorkspaceID,
		ConversationID:     conversation.ID,
		TriggerMessageID:   builder.trigger.ID,
		AssistantMessageID: "",
		Harness:            HarnessCodex,
		Status:             runStatus,
		StartedAt:          timing.runStartedAt(),
		CompletedAt:        timing.runCompletedAt(runStatus),
		PromptSummary:      summarize(promptFromMessage(*builder.trigger), maxPromptSummary),
		Error:              codexHistoryTurnError(turn),
	}
	if builder.assistant != nil {
		run.AssistantMessageID = builder.assistant.ID
	}
	for index := range builder.projection.messages {
		builder.projection.messages[index].RunID = run.ID
	}
	for index := range builder.projection.runItems {
		builder.projection.runItems[index].WorkspaceID = conversation.WorkspaceID
		builder.projection.runItems[index].ConversationID = conversation.ID
		builder.projection.runItems[index].RunID = run.ID
	}
	builder.projection.transcript = TranscriptTurn{
		Run:              run,
		TriggerMessage:   *builder.trigger,
		AssistantMessage: builder.assistant,
		SteeringMessages: builder.steering,
	}
	return builder.projection, nil
}

func (adapter CodexHistoryAdapter) projectTurnItem(conversationID string, turn codexapp.Turn, item map[string]any, itemType codexHistoryItemType, timing codexHistoryTurnTiming, assistantStatus MessageStatus, runStatus RunStatus, nextOrdinal *int, builder *codexHistoryTurnBuilder) error {
	switch itemType {
	case codexHistoryItemUserMessage:
		return adapter.appendProjectedUserMessage(conversationID, turn, item, timing, nextOrdinal, builder)
	case codexHistoryItemAgentMessage:
		if err := adapter.appendProjectedAssistantMessage(conversationID, turn, item, timing, assistantStatus, nextOrdinal, builder); err != nil {
			return err
		}
		return adapter.appendProjectedRunItem(conversationID, turn, item, itemType, timing, runStatus, builder)
	default:
		return adapter.appendProjectedRunItem(conversationID, turn, item, itemType, timing, runStatus, builder)
	}
}

func (adapter CodexHistoryAdapter) appendProjectedUserMessage(conversationID string, turn codexapp.Turn, item map[string]any, timing codexHistoryTurnTiming, nextOrdinal *int, builder *codexHistoryTurnBuilder) error {
	message, err := adapter.projectUserMessage(conversationID, turn, item, timing, nextOrdinal)
	if err != nil {
		return err
	}
	if builder.trigger == nil {
		triggerMessage := message
		builder.trigger = &triggerMessage
	} else {
		message.Delivery = MessageDeliverySteering
		builder.steering = append(builder.steering, message)
	}
	builder.projection.messages = append(builder.projection.messages, message)
	return nil
}

func (adapter CodexHistoryAdapter) appendProjectedAssistantMessage(conversationID string, turn codexapp.Turn, item map[string]any, timing codexHistoryTurnTiming, status MessageStatus, nextOrdinal *int, builder *codexHistoryTurnBuilder) error {
	if builder.assistant != nil {
		return fmt.Errorf("codex history turn %s has multiple agentMessage items; Setta transcript projection supports one assistant message per turn", turn.ID)
	}
	message, err := adapter.projectAssistantMessage(conversationID, turn, item, timing, status, nextOrdinal)
	if err != nil {
		return err
	}
	assistantMessage := message
	builder.assistant = &assistantMessage
	builder.projection.messages = append(builder.projection.messages, message)
	return nil
}

func (adapter CodexHistoryAdapter) appendProjectedRunItem(conversationID string, turn codexapp.Turn, item map[string]any, itemType codexHistoryItemType, timing codexHistoryTurnTiming, runStatus RunStatus, builder *codexHistoryTurnBuilder) error {
	runItem, outputs, err := adapter.projectRunItem(conversationID, turn, item, itemType, timing, runStatus)
	if err != nil {
		return err
	}
	builder.projection.runItems = append(builder.projection.runItems, runItem)
	builder.projection.outputs = append(builder.projection.outputs, outputs...)
	return nil
}

func (adapter CodexHistoryAdapter) projectUserMessage(conversationID string, turn codexapp.Turn, item map[string]any, timing codexHistoryTurnTiming, nextOrdinal *int) (ChatMessage, error) {
	itemID, err := codexHistoryRequiredItemID(item)
	if err != nil {
		return ChatMessage{}, err
	}
	text, err := codexHistoryUserMessageText(item)
	if err != nil {
		return ChatMessage{}, err
	}
	rowKey := codexHistoryPersistedItemRowKey(conversationID, turn.ID, itemID)
	message := ChatMessage{
		SchemaVersion:  SchemaVersion,
		ID:             rowKey,
		ConversationID: conversationID,
		RunID:          turn.ID,
		Role:           RoleUser,
		Delivery:       MessageDeliveryNormal,
		Ordinal:        codexHistoryNextOrdinal(nextOrdinal),
		CreatedAt:      timing.messageCreatedAt(),
		UpdatedAt:      timing.messageCreatedAt(),
		Status:         MessageStatusComplete,
		Parts: []MessagePart{{
			ID:     rowKey + ":part:0",
			Type:   MessagePartText,
			Text:   text,
			Format: TextFormatPlain,
		}},
	}
	return message, nil
}

func (adapter CodexHistoryAdapter) projectAssistantMessage(conversationID string, turn codexapp.Turn, item map[string]any, timing codexHistoryTurnTiming, status MessageStatus, nextOrdinal *int) (ChatMessage, error) {
	itemID, err := codexHistoryRequiredItemID(item)
	if err != nil {
		return ChatMessage{}, err
	}
	text, err := requireStringAllowEmpty(item, "text", "codex history agentMessage item")
	if err != nil {
		return ChatMessage{}, err
	}
	rowKey := codexHistoryPersistedItemRowKey(conversationID, turn.ID, itemID)
	message := ChatMessage{
		SchemaVersion:  SchemaVersion,
		ID:             rowKey,
		ConversationID: conversationID,
		RunID:          turn.ID,
		Role:           RoleAssistant,
		Delivery:       MessageDeliveryNormal,
		Ordinal:        codexHistoryNextOrdinal(nextOrdinal),
		CreatedAt:      timing.messageCreatedAt(),
		UpdatedAt:      timing.messageUpdatedAt(),
		Status:         status,
		Parts: []MessagePart{{
			ID:     rowKey + ":part:0",
			Type:   MessagePartText,
			Text:   text,
			Format: TextFormatMarkdown,
		}},
	}
	return message, nil
}

func (adapter CodexHistoryAdapter) projectRunItem(conversationID string, turn codexapp.Turn, item map[string]any, itemType codexHistoryItemType, timing codexHistoryTurnTiming, runStatus RunStatus) (RunItem, []RunItemOutput, error) {
	itemID, err := codexHistoryRequiredItemID(item)
	if err != nil {
		return RunItem{}, nil, err
	}
	rowKey := codexHistoryPersistedItemRowKey(conversationID, turn.ID, itemID)
	fallbackStatus := runItemStatusFromRunStatus(runStatus)
	runItem := RunItem{
		SchemaVersion:  SchemaVersion,
		ID:             rowKey,
		ConversationID: conversationID,
		RunID:          turn.ID,
		ProviderItemID: itemID,
		Status:         fallbackStatus,
		CreatedAt:      timing.messageCreatedAt(),
		StartedAt:      timing.runStartedAt(),
		CompletedAt:    timing.runCompletedAt(runStatus),
	}

	projector, ok := codexHistoryRunItemProjectors[itemType]
	if !ok {
		return RunItem{}, nil, codexHistoryUnsupportedRunItemError(itemType)
	}
	runItem, outputs, err := projector(runItem, item, timing)
	if err != nil {
		return RunItem{}, nil, err
	}

	details, err := rawJSON(item, "codex history item")
	if err != nil {
		return RunItem{}, nil, err
	}
	runItem.Details = details
	return runItem, outputs, nil
}

type codexHistoryRunItemProjector func(RunItem, map[string]any, codexHistoryTurnTiming) (RunItem, []RunItemOutput, error)

var codexHistoryRunItemProjectors = map[codexHistoryItemType]codexHistoryRunItemProjector{
	codexHistoryItemAgentMessage:        projectCodexHistoryAgentMessageRunItem,
	codexHistoryItemPlan:                projectCodexHistoryPlanRunItem,
	codexHistoryItemReasoning:           projectCodexHistoryReasoningRunItem,
	codexHistoryItemCommandExecution:    projectCodexHistoryCommandExecutionRunItem,
	codexHistoryItemFileChange:          projectCodexHistoryFileChangeRunItem,
	codexHistoryItemMCPToolCall:         projectCodexHistoryMCPToolCallRunItem,
	codexHistoryItemDynamicToolCall:     projectCodexHistoryDynamicToolCallRunItem,
	codexHistoryItemCollabAgentToolCall: projectCodexHistoryCollabAgentToolCallRunItem,
	codexHistoryItemWebSearch:           projectCodexHistoryWebSearchRunItem,
	codexHistoryItemImageView:           projectCodexHistoryImageViewRunItem,
	codexHistoryItemImageGeneration:     projectCodexHistoryImageGenerationRunItem,
	codexHistoryItemContextCompaction:   projectCodexHistoryContextCompactionRunItem,
}

func projectCodexHistoryAgentMessageRunItem(runItem RunItem, item map[string]any, _ codexHistoryTurnTiming) (RunItem, []RunItemOutput, error) {
	text, err := requireStringAllowEmpty(item, "text", "codex history agentMessage item")
	if err != nil {
		return RunItem{}, nil, err
	}
	runItem.Type = RunItemTypeAgentMessage
	runItem.Title = "Assistant message"
	runItem.Summary = text
	return runItem, nil, nil
}

func projectCodexHistoryPlanRunItem(runItem RunItem, item map[string]any, _ codexHistoryTurnTiming) (RunItem, []RunItemOutput, error) {
	text, err := requireStringAllowEmpty(item, "text", "codex history plan item")
	if err != nil {
		return RunItem{}, nil, err
	}
	runItem.Type = RunItemTypePlan
	runItem.Title = "Plan update"
	runItem.Summary = text
	return runItem, nil, nil
}

func projectCodexHistoryReasoningRunItem(runItem RunItem, item map[string]any, _ codexHistoryTurnTiming) (RunItem, []RunItemOutput, error) {
	summary, err := optionalJoinedStringArray(item, "summary", "codex history reasoning item")
	if err != nil {
		return RunItem{}, nil, err
	}
	runItem.Type = RunItemTypeReasoning
	runItem.Title = "Reasoning summary"
	runItem.Summary = summary
	return runItem, nil, nil
}

func projectCodexHistoryCommandExecutionRunItem(runItem RunItem, item map[string]any, timing codexHistoryTurnTiming) (RunItem, []RunItemOutput, error) {
	command, err := requireString(item, "command", "codex history commandExecution item")
	if err != nil {
		return RunItem{}, nil, err
	}
	cwd, err := requireString(item, "cwd", "codex history commandExecution item")
	if err != nil {
		return RunItem{}, nil, err
	}
	if err := applyCodexHistoryRequiredStatus(&runItem, item, "codex history commandExecution item"); err != nil {
		return RunItem{}, nil, err
	}
	runItem.Type = RunItemTypeCommandExecution
	runItem.Title = "Command execution"
	runItem.Summary = command
	runItem.Command = command
	runItem.Cwd = cwd
	if err := applyCodexHistoryCommandExecutionOptionals(&runItem, item); err != nil {
		return RunItem{}, nil, err
	}
	outputs, err := codexHistoryCommandExecutionOutputs(runItem.ID, item, timing)
	if err != nil {
		return RunItem{}, nil, err
	}
	return runItem, outputs, nil
}

func projectCodexHistoryFileChangeRunItem(runItem RunItem, item map[string]any, _ codexHistoryTurnTiming) (RunItem, []RunItemOutput, error) {
	paths, err := codexHistoryFileChangePaths(item)
	if err != nil {
		return RunItem{}, nil, err
	}
	statusText, err := requireString(item, "status", "codex history fileChange item")
	if err != nil {
		return RunItem{}, nil, err
	}
	if err := applyCodexHistoryRequiredStatus(&runItem, item, "codex history fileChange item"); err != nil {
		return RunItem{}, nil, err
	}
	runItem.Type = RunItemTypeFileChange
	runItem.Title = "File change"
	runItem.FilePaths = paths
	runItem.PatchStatus = statusText
	return runItem, nil, nil
}

func projectCodexHistoryMCPToolCallRunItem(runItem RunItem, item map[string]any, _ codexHistoryTurnTiming) (RunItem, []RunItemOutput, error) {
	server, err := requireString(item, "server", "codex history mcpToolCall item")
	if err != nil {
		return RunItem{}, nil, err
	}
	tool, err := requireString(item, "tool", "codex history mcpToolCall item")
	if err != nil {
		return RunItem{}, nil, err
	}
	if err := applyCodexHistoryRequiredStatus(&runItem, item, "codex history mcpToolCall item"); err != nil {
		return RunItem{}, nil, err
	}
	runItem.Type = RunItemTypeMCPToolCall
	runItem.Title = "MCP tool call"
	runItem.ServerName = server
	runItem.ToolName = tool
	runItem.Summary = server + "." + tool
	if err := applyCodexHistoryJSONSummaryFields(&runItem, item, "codex history mcpToolCall item"); err != nil {
		return RunItem{}, nil, err
	}
	return runItem, nil, nil
}

func projectCodexHistoryDynamicToolCallRunItem(runItem RunItem, item map[string]any, _ codexHistoryTurnTiming) (RunItem, []RunItemOutput, error) {
	tool, err := requireString(item, "tool", "codex history dynamicToolCall item")
	if err != nil {
		return RunItem{}, nil, err
	}
	if err := applyCodexHistoryRequiredStatus(&runItem, item, "codex history dynamicToolCall item"); err != nil {
		return RunItem{}, nil, err
	}
	runItem.Type = RunItemTypeDynamicToolCall
	runItem.Title = "Dynamic tool call"
	runItem.ToolName = tool
	runItem.Namespace, err = optionalString(item, "namespace", "codex history dynamicToolCall item")
	if err != nil {
		return RunItem{}, nil, err
	}
	runItem.Summary = codexHistoryQualifiedName(runItem.Namespace, tool)
	runItem.Result, err = codexHistoryJSONSummaryField(item, "contentItems", "codex history dynamicToolCall item")
	if err != nil {
		return RunItem{}, nil, err
	}
	return runItem, nil, nil
}

func projectCodexHistoryCollabAgentToolCallRunItem(runItem RunItem, item map[string]any, _ codexHistoryTurnTiming) (RunItem, []RunItemOutput, error) {
	tool, err := requireString(item, "tool", "codex history collabAgentToolCall item")
	if err != nil {
		return RunItem{}, nil, err
	}
	if err := applyCodexHistoryRequiredStatus(&runItem, item, "codex history collabAgentToolCall item"); err != nil {
		return RunItem{}, nil, err
	}
	runItem.Type = RunItemTypeCollabAgentToolCall
	runItem.Title = "Collaboration agent tool call"
	runItem.ToolName = tool
	runItem.Summary = tool
	return runItem, nil, nil
}

func projectCodexHistoryWebSearchRunItem(runItem RunItem, item map[string]any, _ codexHistoryTurnTiming) (RunItem, []RunItemOutput, error) {
	query, err := requireString(item, "query", "codex history webSearch item")
	if err != nil {
		return RunItem{}, nil, err
	}
	runItem.Type = RunItemTypeWebSearch
	runItem.Title = "Web search"
	runItem.Summary = query
	return runItem, nil, nil
}

func projectCodexHistoryImageViewRunItem(runItem RunItem, item map[string]any, _ codexHistoryTurnTiming) (RunItem, []RunItemOutput, error) {
	path, err := requireString(item, "path", "codex history imageView item")
	if err != nil {
		return RunItem{}, nil, err
	}
	runItem.Type = RunItemTypeImageView
	runItem.Title = "Image viewed"
	runItem.Summary = path
	return runItem, nil, nil
}

func projectCodexHistoryImageGenerationRunItem(runItem RunItem, item map[string]any, _ codexHistoryTurnTiming) (RunItem, []RunItemOutput, error) {
	result, err := requireStringAllowEmpty(item, "result", "codex history imageGeneration item")
	if err != nil {
		return RunItem{}, nil, err
	}
	if err := applyCodexHistoryRequiredStatus(&runItem, item, "codex history imageGeneration item"); err != nil {
		return RunItem{}, nil, err
	}
	runItem.Type = RunItemTypeImageGeneration
	runItem.Title = "Image generation"
	runItem.Result = result
	runItem.Summary = result
	return runItem, nil, nil
}

func projectCodexHistoryContextCompactionRunItem(runItem RunItem, _ map[string]any, _ codexHistoryTurnTiming) (RunItem, []RunItemOutput, error) {
	runItem.Type = RunItemTypeContextCompaction
	runItem.Title = "Context compaction"
	return runItem, nil, nil
}

func applyCodexHistoryRequiredStatus(runItem *RunItem, item map[string]any, label string) error {
	status, err := codexHistoryRequiredRunItemStatus(item, label)
	if err != nil {
		return err
	}
	runItem.Status = status
	return nil
}

func applyCodexHistoryCommandExecutionOptionals(runItem *RunItem, item map[string]any) error {
	var err error
	runItem.ProcessID, err = optionalString(item, "processId", "codex history commandExecution item")
	if err != nil {
		return err
	}
	runItem.ExitCode, err = optionalInt(item, "exitCode", "codex history commandExecution item")
	if err != nil {
		return err
	}
	runItem.DurationMs, err = optionalInt(item, "durationMs", "codex history commandExecution item")
	return err
}

func codexHistoryCommandExecutionOutputs(runItemID string, item map[string]any, timing codexHistoryTurnTiming) ([]RunItemOutput, error) {
	output, err := optionalString(item, "aggregatedOutput", "codex history commandExecution item")
	if err != nil || output == "" {
		return nil, err
	}
	return []RunItemOutput{codexHistoryRunItemOutput(runItemID, codexCommandExecutionOutputStream, output, timing.messageUpdatedAt())}, nil
}

func applyCodexHistoryJSONSummaryFields(runItem *RunItem, item map[string]any, label string) error {
	var err error
	runItem.Result, err = codexHistoryJSONSummaryField(item, "result", label)
	if err != nil {
		return err
	}
	runItem.Error, err = codexHistoryJSONSummaryField(item, "error", label)
	return err
}

func codexHistoryUnsupportedRunItemError(itemType codexHistoryItemType) error {
	if itemType == codexHistoryItemUserMessage {
		return fmt.Errorf("codex history userMessage item is a transcript message, not a run item")
	}
	return fmt.Errorf("unsupported codex history item type: %s", itemType)
}

type codexHistoryTurnTiming struct {
	conversationCreatedAt string
	conversationUpdatedAt string
	startedAt             string
	completedAt           string
}

func (timing codexHistoryTurnTiming) messageCreatedAt() string {
	if timing.startedAt != "" {
		return timing.startedAt
	}
	return timing.conversationCreatedAt
}

func (timing codexHistoryTurnTiming) messageUpdatedAt() string {
	if timing.completedAt != "" {
		return timing.completedAt
	}
	if timing.startedAt != "" {
		return timing.startedAt
	}
	return timing.conversationUpdatedAt
}

func (timing codexHistoryTurnTiming) runStartedAt() string {
	return timing.messageCreatedAt()
}

func (timing codexHistoryTurnTiming) runCompletedAt(status RunStatus) string {
	if status == RunStatusRunning || status == RunStatusQueued {
		return ""
	}
	return timing.messageUpdatedAt()
}

type codexHistoryItemType string

const (
	codexHistoryItemAgentMessage        codexHistoryItemType = "agentMessage"
	codexHistoryItemCollabAgentToolCall codexHistoryItemType = "collabAgentToolCall"
	codexHistoryItemCommandExecution    codexHistoryItemType = "commandExecution"
	codexHistoryItemContextCompaction   codexHistoryItemType = "contextCompaction"
	codexHistoryItemDynamicToolCall     codexHistoryItemType = "dynamicToolCall"
	codexHistoryItemEnteredReviewMode   codexHistoryItemType = "enteredReviewMode"
	codexHistoryItemExitedReviewMode    codexHistoryItemType = "exitedReviewMode"
	codexHistoryItemFileChange          codexHistoryItemType = "fileChange"
	codexHistoryItemHookPrompt          codexHistoryItemType = "hookPrompt"
	codexHistoryItemImageGeneration     codexHistoryItemType = "imageGeneration"
	codexHistoryItemImageView           codexHistoryItemType = "imageView"
	codexHistoryItemMCPToolCall         codexHistoryItemType = "mcpToolCall"
	codexHistoryItemPlan                codexHistoryItemType = "plan"
	codexHistoryItemReasoning           codexHistoryItemType = "reasoning"
	codexHistoryItemSleep               codexHistoryItemType = "sleep"
	codexHistoryItemSubAgentActivity    codexHistoryItemType = "subAgentActivity"
	codexHistoryItemUserMessage         codexHistoryItemType = "userMessage"
	codexHistoryItemWebSearch           codexHistoryItemType = "webSearch"
)

func decodeCodexHistoryItem(rawItem codexapp.ThreadItem, turnID string, itemIndex int) (map[string]any, codexHistoryItemType, error) {
	label := fmt.Sprintf("codex history turn %s item[%d]", turnID, itemIndex)
	item, err := objectValue(rawItem, label)
	if err != nil {
		return nil, "", err
	}
	if _, err := requireString(item, "id", "codex history item"); err != nil {
		return nil, "", err
	}
	rawType, err := requireString(item, "type", "codex history item")
	if err != nil {
		return nil, "", err
	}
	itemType := codexHistoryItemType(rawType)
	switch itemType {
	case codexHistoryItemUserMessage,
		codexHistoryItemHookPrompt,
		codexHistoryItemAgentMessage,
		codexHistoryItemPlan,
		codexHistoryItemReasoning,
		codexHistoryItemCommandExecution,
		codexHistoryItemFileChange,
		codexHistoryItemMCPToolCall,
		codexHistoryItemDynamicToolCall,
		codexHistoryItemCollabAgentToolCall,
		codexHistoryItemSubAgentActivity,
		codexHistoryItemWebSearch,
		codexHistoryItemImageView,
		codexHistoryItemSleep,
		codexHistoryItemImageGeneration,
		codexHistoryItemEnteredReviewMode,
		codexHistoryItemExitedReviewMode,
		codexHistoryItemContextCompaction:
		return item, itemType, nil
	default:
		return nil, "", fmt.Errorf("unsupported codex history item type: %s", rawType)
	}
}

func requireCodexHistoryFullTurnItems(turn codexapp.Turn, turnIndex int) error {
	if turn.ID == "" {
		return fmt.Errorf("codex history turn[%d].id is required", turnIndex)
	}
	itemsView, err := codexHistoryTurnItemsView(turn.ItemsView)
	if err != nil {
		return fmt.Errorf("codex history turn %s itemsView is invalid: %w", turn.ID, err)
	}
	if itemsView != "" && itemsView != codexapp.TurnItemsViewFull {
		return fmt.Errorf("codex history turn %s itemsView = %s; full items are required for Setta transcript projection", turn.ID, itemsView)
	}
	return nil
}

func codexHistoryTurnItemsView(raw json.RawMessage) (codexapp.TurnItemsView, error) {
	if len(raw) == 0 {
		return "", nil
	}
	var view codexapp.TurnItemsView
	if err := json.Unmarshal(raw, &view); err != nil {
		return "", err
	}
	return view, nil
}

func codexHistoryRunStatus(turn codexapp.Turn) (RunStatus, MessageStatus, error) {
	switch turn.Status {
	case codexapp.TurnStatusCompleted:
		return RunStatusCompleted, MessageStatusComplete, nil
	case codexapp.TurnStatusFailed:
		return RunStatusFailed, MessageStatusError, nil
	case codexapp.TurnStatusInterrupted:
		return RunStatusCancelled, MessageStatusCancelled, nil
	case codexapp.TurnStatusInProgress:
		return RunStatusRunning, MessageStatusStreaming, nil
	default:
		return "", "", fmt.Errorf("unsupported codex history turn status: %s", turn.Status)
	}
}

func runItemStatusFromRunStatus(status RunStatus) RunItemStatus {
	switch status {
	case RunStatusCompleted:
		return RunItemStatusCompleted
	case RunStatusFailed:
		return RunItemStatusFailed
	case RunStatusCancelled:
		return RunItemStatusCancelled
	case RunStatusRunning:
		return RunItemStatusRunning
	case RunStatusQueued:
		return RunItemStatusPending
	default:
		return RunItemStatusFailed
	}
}

func codexHistoryRequiredRunItemStatus(item map[string]any, label string) (RunItemStatus, error) {
	statusText, err := requireString(item, "status", label)
	if err != nil {
		return "", err
	}
	return mapCodexItemStatus(statusText)
}

func codexHistoryTurnError(turn codexapp.Turn) string {
	if turn.Error == nil {
		return ""
	}
	if turn.Error.AdditionalDetails != nil && *turn.Error.AdditionalDetails != "" {
		return turn.Error.Message + ": " + *turn.Error.AdditionalDetails
	}
	return turn.Error.Message
}

func codexHistoryUserMessageText(item map[string]any) (string, error) {
	content, err := requireArray(item, "content", "codex history userMessage item")
	if err != nil {
		return "", err
	}
	parts := make([]string, 0, len(content))
	for index, rawPart := range content {
		part, ok := rawPart.(map[string]any)
		if !ok {
			return "", fmt.Errorf("codex history userMessage item.content[%d] must be an object", index)
		}
		partType, err := requireString(part, "type", fmt.Sprintf("codex history userMessage item.content[%d]", index))
		if err != nil {
			return "", err
		}
		switch partType {
		case "text":
			text, err := requireStringAllowEmpty(part, "text", fmt.Sprintf("codex history userMessage item.content[%d]", index))
			if err != nil {
				return "", err
			}
			parts = append(parts, text)
		case "image", "localImage", "skill", "mention":
			return "", fmt.Errorf("unsupported codex history user input type: %s", partType)
		default:
			return "", fmt.Errorf("unsupported codex history user input type: %s", partType)
		}
	}
	return strings.Join(parts, ""), nil
}

func codexHistoryFileChangePaths(item map[string]any) ([]string, error) {
	changes, err := requireArray(item, "changes", "codex history fileChange item")
	if err != nil {
		return nil, err
	}
	paths := make([]string, 0, len(changes))
	for index, rawChange := range changes {
		change, ok := rawChange.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("codex history fileChange item.changes[%d] must be an object", index)
		}
		path, err := requireString(change, "path", fmt.Sprintf("codex history fileChange item.changes[%d]", index))
		if err != nil {
			return nil, err
		}
		paths = append(paths, path)
	}
	return paths, nil
}

func optionalJoinedStringArray(value map[string]any, name string, label string) (string, error) {
	raw, ok := value[name]
	if !ok || raw == nil {
		return "", nil
	}
	values, ok := raw.([]any)
	if !ok {
		return "", fmt.Errorf("%s.%s must be an array", label, name)
	}
	parts := make([]string, 0, len(values))
	for index, rawValue := range values {
		part, ok := rawValue.(string)
		if !ok {
			return "", fmt.Errorf("%s.%s[%d] must be a string", label, name, index)
		}
		if part != "" {
			parts = append(parts, part)
		}
	}
	return strings.Join(parts, "\n"), nil
}

func codexHistoryJSONSummaryField(value map[string]any, name string, label string) (string, error) {
	raw, ok := value[name]
	if !ok || raw == nil {
		return "", nil
	}
	return jsonSummaryAny(raw)
}

func codexHistoryQualifiedName(namespace string, name string) string {
	if namespace == "" {
		return name
	}
	return namespace + "." + name
}

func codexHistoryRunItemOutput(runItemID string, stream string, text string, createdAt string) RunItemOutput {
	return RunItemOutput{
		SchemaVersion: SchemaVersion,
		ID:            runItemID + ":output:0",
		RunItemID:     runItemID,
		Stream:        stream,
		Ordinal:       1,
		Text:          text,
		CreatedAt:     createdAt,
	}
}

func codexHistoryPersistedItemRowKey(threadID string, turnID string, itemID string) string {
	return threadID + ":" + turnID + ":" + itemID
}

func codexHistoryActivityOverlayRowKey(threadID string, turnID string, activityKind string, liveProviderOrRequestID string) string {
	return threadID + ":" + turnID + ":" + activityKind + ":" + liveProviderOrRequestID
}

func codexHistoryRequiredItemID(item map[string]any) (string, error) {
	return requireString(item, "id", "codex history item")
}

func codexHistoryNextOrdinal(nextOrdinal *int) int {
	ordinal := *nextOrdinal
	*nextOrdinal = ordinal + 1
	return ordinal
}

func codexHistoryThreadTitle(thread codexapp.Thread) string {
	if thread.Name != nil && strings.TrimSpace(*thread.Name) != "" {
		return *thread.Name
	}
	if strings.TrimSpace(thread.Preview) != "" {
		return thread.Preview
	}
	return thread.ID
}

func codexHistoryTimestamp(seconds int) string {
	return time.Unix(int64(seconds), 0).UTC().Format(time.RFC3339Nano)
}

func codexHistoryOptionalTimestamp(seconds *int) string {
	if seconds == nil {
		return ""
	}
	return codexHistoryTimestamp(*seconds)
}
