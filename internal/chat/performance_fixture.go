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
	PerformanceConversationID      = "conversation_performance_long_transcript"
	PerformanceConversationTitle   = "Performance Long Chat"
	performanceTranscriptTurnCount = 240
)

type PerformanceTranscriptSeedResult struct {
	Conversation Conversation
	MessageCount int
	RunCount     int
	RunItemCount int
}

type performanceSeedCounts struct {
	messages int
	runs     int
	runItems int
}

func SeedPerformanceTranscriptConversation(store *Store, workspaceID string, seededAt time.Time) (PerformanceTranscriptSeedResult, error) {
	if store == nil {
		return PerformanceTranscriptSeedResult{}, fmt.Errorf("chat store is required")
	}
	if workspaceID == "" {
		return PerformanceTranscriptSeedResult{}, fmt.Errorf("workspace id is required")
	}
	seededAt = uiShowcaseSeedTime(seededAt)
	if err := removePerformanceTranscriptArtifacts(store, workspaceID); err != nil {
		return PerformanceTranscriptSeedResult{}, err
	}
	conversation := performanceConversation(workspaceID, seededAt)
	if err := store.SaveConversation(conversation); err != nil {
		return PerformanceTranscriptSeedResult{}, err
	}
	if err := store.SaveGoal(workspaceID, PerformanceConversationID, performanceGoal(seededAt)); err != nil {
		return PerformanceTranscriptSeedResult{}, err
	}
	messageCount, runCount, runItemCount, err := seedPerformanceTranscriptRecords(store, workspaceID, seededAt)
	if err != nil {
		return PerformanceTranscriptSeedResult{}, err
	}
	return PerformanceTranscriptSeedResult{
		Conversation: conversation,
		MessageCount: messageCount,
		RunCount:     runCount,
		RunItemCount: runItemCount,
	}, nil
}

func removePerformanceTranscriptArtifacts(store *Store, workspaceID string) error {
	if err := store.deleteConversationRuns(workspaceID, PerformanceConversationID); err != nil {
		return err
	}
	if err := os.RemoveAll(store.conversationDir(workspaceID, PerformanceConversationID)); err != nil {
		return &PersistenceError{Operation: "remove performance conversation", Path: store.conversationDir(workspaceID, PerformanceConversationID), Err: err}
	}
	return nil
}

func performanceConversation(workspaceID string, seededAt time.Time) Conversation {
	return Conversation{
		SchemaVersion: SchemaVersion,
		ID:            PerformanceConversationID,
		WorkspaceID:   workspaceID,
		Title:         PerformanceConversationTitle,
		CreatedAt:     timestamp(seededAt.Add(-24 * time.Hour)),
		UpdatedAt:     timestamp(seededAt),
		CodexSettings: &ChatCodexSettings{
			Model: "gpt-5-codex",
		},
		HarnessRefs: []HarnessThreadRef{{
			Harness:       HarnessCodex,
			ThreadID:      "thread_performance_long_transcript",
			SessionID:     "session_performance_long_transcript",
			LastTurnID:    "turn_performance_long_transcript",
			Status:        HarnessRefLinked,
			CreatedAt:     timestamp(seededAt.Add(-24 * time.Hour)),
			LastResumedAt: timestamp(seededAt),
		}},
	}
}

func performanceGoal(seededAt time.Time) ChatGoalState {
	budget := 120000
	return ChatGoalState{
		ThreadID:        "thread_performance_long_transcript",
		Objective:       "Keep a long, mixed chat transcript smooth while loading pages and scrolling.",
		Status:          "active",
		TokenBudget:     &budget,
		TokensUsed:      64231,
		TimeUsedSeconds: 4920,
		CreatedAt:       int(seededAt.Add(-24 * time.Hour).Unix()),
		UpdatedAt:       int(seededAt.Unix()),
	}
}

func seedPerformanceTranscriptRecords(store *Store, workspaceID string, seededAt time.Time) (int, int, int, error) {
	ordinal := 1
	standaloneMessageCount, err := seedPerformanceStandaloneMessages(store, workspaceID, seededAt, &ordinal)
	if err != nil {
		return 0, 0, 0, err
	}
	turnCounts, err := seedPerformanceTurns(store, workspaceID, seededAt, &ordinal)
	if err != nil {
		return 0, 0, 0, err
	}
	queuedCounts, err := seedPerformanceQueuedRecord(store, workspaceID, seededAt, &ordinal)
	if err != nil {
		return 0, 0, 0, err
	}
	messageCount := standaloneMessageCount + turnCounts.messages + queuedCounts.messages
	runCount := turnCounts.runs + queuedCounts.runs
	runItemCount := turnCounts.runItems + queuedCounts.runItems
	return messageCount, runCount, runItemCount, nil
}

func seedPerformanceStandaloneMessages(store *Store, workspaceID string, seededAt time.Time, ordinal *int) (int, error) {
	messageCount := 0
	for _, message := range performanceStandaloneMessages(seededAt, ordinal) {
		if err := store.SaveMessage(workspaceID, message); err != nil {
			return 0, err
		}
		messageCount++
	}
	return messageCount, nil
}

func seedPerformanceTurns(store *Store, workspaceID string, seededAt time.Time, ordinal *int) (performanceSeedCounts, error) {
	counts := performanceSeedCounts{}
	for turnIndex := 1; turnIndex <= performanceTranscriptTurnCount; turnIndex++ {
		records := performanceTurnRecords(workspaceID, turnIndex, seededAt, ordinal)
		messageCount, err := savePerformanceMessages(store, workspaceID, records.messages)
		if err != nil {
			return performanceSeedCounts{}, err
		}
		if err := store.SaveRun(records.run); err != nil {
			return performanceSeedCounts{}, err
		}
		runItemCount, err := savePerformanceRunItems(store, workspaceID, records.run.ID, records.runItems)
		if err != nil {
			return performanceSeedCounts{}, err
		}
		counts.messages += messageCount
		counts.runs++
		counts.runItems += runItemCount
	}
	return counts, nil
}

func seedPerformanceQueuedRecord(store *Store, workspaceID string, seededAt time.Time, ordinal *int) (performanceSeedCounts, error) {
	queued := performanceQueuedRecords(workspaceID, seededAt, ordinal)
	if err := store.SaveMessage(workspaceID, queued.message); err != nil {
		return performanceSeedCounts{}, err
	}
	if err := store.SaveRun(queued.run); err != nil {
		return performanceSeedCounts{}, err
	}
	return performanceSeedCounts{messages: 1, runs: 1}, nil
}

func savePerformanceMessages(store *Store, workspaceID string, messages []ChatMessage) (int, error) {
	for _, message := range messages {
		if err := store.SaveMessage(workspaceID, message); err != nil {
			return 0, err
		}
	}
	return len(messages), nil
}

func savePerformanceRunItems(store *Store, workspaceID string, runID string, items []RunItem) (int, error) {
	for _, item := range items {
		if err := store.SaveRunItem(item); err != nil {
			return 0, err
		}
		if output := performanceRunItemOutput(item); output.ID != "" {
			if err := store.SaveRunItemOutput(workspaceID, runID, output); err != nil {
				return 0, err
			}
		}
	}
	return len(items), nil
}

func performanceStandaloneMessages(seededAt time.Time, ordinal *int) []ChatMessage {
	specs := []struct {
		id     string
		role   MessageRole
		text   string
		format TextFormat
	}{
		{id: "message_performance_system", role: RoleSystem, text: "System note: long transcript performance fixture with every persisted chat surface.", format: TextFormatMarkdown},
		{id: "message_performance_developer", role: RoleDeveloper, text: "Developer note: keep transcript paging, virtualization, activity rows, and markdown rendering smooth.", format: TextFormatMarkdown},
		{id: "message_performance_command", role: RoleCommand, text: "Model set: gpt-5-codex\nReasoning set: High", format: TextFormatPlain},
		{id: "message_performance_tool", role: RoleTool, text: "{\"tool\":\"perf_seed\",\"ok\":true,\"message\":\"standalone tool result\"}", format: TextFormatPlain},
	}
	messages := make([]ChatMessage, 0, len(specs))
	for index, spec := range specs {
		messages = append(messages, performanceMessage(
			spec.id,
			"",
			spec.role,
			MessageDeliveryNormal,
			nextPerformanceOrdinal(ordinal),
			MessageStatusComplete,
			spec.text,
			spec.format,
			seededAt.Add(time.Duration(-performanceTranscriptTurnCount-index-12)*time.Minute),
		))
	}
	return messages
}

type performanceTurn struct {
	messages []ChatMessage
	run      Run
	runItems []RunItem
}

func performanceTurnRecords(workspaceID string, turnIndex int, seededAt time.Time, ordinal *int) performanceTurn {
	runID := performanceRunID(turnIndex)
	userID := fmt.Sprintf("message_performance_user_%03d", turnIndex)
	assistantID := fmt.Sprintf("message_performance_assistant_%03d", turnIndex)
	startedAt := seededAt.Add(time.Duration(-performanceTranscriptTurnCount+turnIndex) * time.Minute)
	completedAt := startedAt.Add(18 * time.Second)
	status := performanceRunStatus(turnIndex)
	assistantStatus := performanceAssistantStatus(status, turnIndex)
	messages := []ChatMessage{
		performanceMessage(
			userID,
			runID,
			RoleUser,
			MessageDeliveryNormal,
			nextPerformanceOrdinal(ordinal),
			MessageStatusComplete,
			performanceUserText(turnIndex),
			TextFormatPlain,
			startedAt.Add(-2*time.Second),
		),
	}
	if turnIndex%3 == 0 {
		messages = append(messages, performanceMessage(
			fmt.Sprintf("message_performance_steering_%03d", turnIndex),
			runID,
			RoleUser,
			MessageDeliverySteering,
			nextPerformanceOrdinal(ordinal),
			MessageStatusComplete,
			fmt.Sprintf("Steering %03d: keep the long transcript pinned state stable while output and tool previews update.", turnIndex),
			TextFormatPlain,
			startedAt.Add(4*time.Second),
		))
	}
	messages = append(messages, performanceMessage(
		assistantID,
		runID,
		RoleAssistant,
		MessageDeliveryNormal,
		nextPerformanceOrdinal(ordinal),
		assistantStatus,
		performanceAssistantText(turnIndex, assistantStatus),
		TextFormatMarkdown,
		completedAt,
	))
	run := performanceRun(workspaceID, runID, userID, assistantID, status, turnIndex, startedAt, completedAt)
	return performanceTurn{
		messages: messages,
		run:      run,
		runItems: performanceRunItems(workspaceID, runID, turnIndex, startedAt),
	}
}

func performanceQueuedRecords(workspaceID string, seededAt time.Time, ordinal *int) struct {
	message ChatMessage
	run     Run
} {
	runID := "run_performance_queued"
	messageID := "message_performance_queued"
	createdAt := seededAt.Add(2 * time.Minute)
	return struct {
		message ChatMessage
		run     Run
	}{
		message: performanceMessage(
			messageID,
			runID,
			RoleUser,
			MessageDeliveryQueued,
			nextPerformanceOrdinal(ordinal),
			MessageStatusPending,
			"Queued follow-up that keeps the pending message and queue state in the long performance fixture.",
			TextFormatPlain,
			createdAt,
		),
		run: Run{
			SchemaVersion:    SchemaVersion,
			ID:               runID,
			WorkspaceID:      workspaceID,
			ConversationID:   PerformanceConversationID,
			TriggerMessageID: messageID,
			Harness:          HarnessCodex,
			Status:           RunStatusQueued,
			PromptSummary:    "Queued follow-up performance fixture",
		},
	}
}

func performanceRun(workspaceID string, runID string, userID string, assistantID string, status RunStatus, turnIndex int, startedAt time.Time, completedAt time.Time) Run {
	run := Run{
		SchemaVersion:      SchemaVersion,
		ID:                 runID,
		WorkspaceID:        workspaceID,
		ConversationID:     PerformanceConversationID,
		TriggerMessageID:   userID,
		AssistantMessageID: assistantID,
		Harness:            HarnessCodex,
		Status:             status,
		StartedAt:          timestamp(startedAt),
		PromptSummary:      fmt.Sprintf("Long performance turn %03d", turnIndex),
	}
	if status != RunStatusRunning {
		run.CompletedAt = timestamp(completedAt)
	}
	switch status {
	case RunStatusFailed:
		run.Error = "scripted performance fixture failure"
	case RunStatusCancelled:
		run.Error = "scripted performance fixture cancellation"
	}
	return run
}

func performanceRunStatus(turnIndex int) RunStatus {
	switch {
	case turnIndex%37 == 0:
		return RunStatusFailed
	case turnIndex%41 == 0:
		return RunStatusCancelled
	default:
		return RunStatusCompleted
	}
}

func performanceAssistantStatus(runStatus RunStatus, turnIndex int) MessageStatus {
	switch runStatus {
	case RunStatusFailed:
		return MessageStatusError
	case RunStatusCancelled:
		return MessageStatusCancelled
	default:
		if turnIndex%29 == 0 {
			return MessageStatusStreaming
		}
		return MessageStatusComplete
	}
}

func performanceMessage(id string, runID string, role MessageRole, delivery MessageDelivery, ordinal int, status MessageStatus, text string, format TextFormat, createdAt time.Time) ChatMessage {
	return ChatMessage{
		SchemaVersion:  SchemaVersion,
		ID:             id,
		ConversationID: PerformanceConversationID,
		RunID:          runID,
		Role:           role,
		Delivery:       delivery,
		Ordinal:        ordinal,
		CreatedAt:      timestamp(createdAt),
		UpdatedAt:      timestamp(createdAt),
		Status:         status,
		Parts: []MessagePart{{
			ID:     id + "_part",
			Type:   MessagePartText,
			Text:   text,
			Format: format,
		}},
	}
}

func performanceUserText(turnIndex int) string {
	return fmt.Sprintf("Turn %03d asks for a realistic mixed transcript row with enough body text to create measurable scroll height and wrapping pressure.", turnIndex)
}

func performanceAssistantText(turnIndex int, status MessageStatus) string {
	statusLine := ""
	if status != MessageStatusComplete {
		statusLine = fmt.Sprintf("\n\nStatus fixture: `%s`.", status)
	}
	return fmt.Sprintf(
		"### Performance turn %03d\n\nThis assistant response includes markdown, inline code like `frameBudgetMs`, a short list, and repeated prose so the virtualized transcript has realistic row height variation.\n\n- Loaded older chat pages through production state.\n- Kept activity previews attached to the run.\n- Preserved scroll anchoring during pagination.\n\n```ts\nconst frameBudgetMs = 8.33;\nconst turn = %d;\n```\n\n%s%s",
		turnIndex,
		turnIndex,
		strings.Repeat("Long transcript content keeps this row tall enough to stress measurement without using synthetic DOM-only nodes. ", 2+(turnIndex%4)),
		statusLine,
	)
}

func performanceRunItems(workspaceID string, runID string, turnIndex int, startedAt time.Time) []RunItem {
	source := uiShowcaseRunItems(runID)
	items := make([]RunItem, 0, len(source))
	for index, item := range source {
		createdAt := startedAt.Add(time.Duration(index) * 150 * time.Millisecond)
		item.SchemaVersion = SchemaVersion
		item.ID = fmt.Sprintf("run_item_performance_%03d_%02d", turnIndex, index+1)
		item.WorkspaceID = workspaceID
		item.ConversationID = PerformanceConversationID
		item.RunID = runID
		item.ProviderItemID = fmt.Sprintf("%s_%03d", item.ProviderItemID, turnIndex)
		item.CreatedAt = timestamp(createdAt)
		if item.Status != RunItemStatusPending {
			item.StartedAt = item.CreatedAt
		}
		if item.Status == RunItemStatusCompleted || item.Status == RunItemStatusFailed || item.Status == RunItemStatusCancelled {
			item.CompletedAt = timestamp(createdAt.Add(100 * time.Millisecond))
		}
		item.Title = fmt.Sprintf("%s %03d", item.Title, turnIndex)
		item.Summary = performanceStringWithTurn(item.Summary, turnIndex)
		item.Progress = performanceStringWithTurn(item.Progress, turnIndex)
		item.Result = performanceStringWithTurn(item.Result, turnIndex)
		item.Command = performanceCommandWithTurn(item.Command, turnIndex)
		item.Cwd = filepath.Join("/tmp/setta-performance-workspace", fmt.Sprintf("turn-%03d", turnIndex))
		item.FilePaths = performanceFilePaths(item.FilePaths, turnIndex)
		item.Details = performanceDetails(item.Details, turnIndex)
		items = append(items, item)
	}
	return items
}

func performanceRunItemOutput(item RunItem) RunItemOutput {
	output := uiShowcaseOutput(item.Type)
	if output == "" {
		return RunItemOutput{}
	}
	return RunItemOutput{
		SchemaVersion: SchemaVersion,
		ID:            "run_item_output_" + item.ID,
		RunItemID:     item.ID,
		Stream:        uiShowcaseOutputStream(item),
		Ordinal:       1,
		Text:          performanceStringWithTurn(output, performanceTurnIndexFromRunItemID(item.ID)),
		CreatedAt:     item.CreatedAt,
	}
}

func performanceTurnIndexFromRunItemID(id string) int {
	var turnIndex int
	if _, err := fmt.Sscanf(id, "run_item_performance_%03d_", &turnIndex); err != nil {
		return 0
	}
	return turnIndex
}

func performanceStringWithTurn(value string, turnIndex int) string {
	if value == "" {
		return ""
	}
	return fmt.Sprintf("Turn %03d: %s", turnIndex, value)
}

func performanceCommandWithTurn(value string, turnIndex int) string {
	if value == "" {
		return ""
	}
	return fmt.Sprintf("%s --turn=%03d", value, turnIndex)
}

func performanceFilePaths(paths []string, turnIndex int) []string {
	if len(paths) == 0 {
		return nil
	}
	result := make([]string, 0, len(paths))
	for _, path := range paths {
		result = append(result, filepath.Join("/tmp/setta-performance-workspace", fmt.Sprintf("turn-%03d", turnIndex), filepath.Base(path)))
	}
	return result
}

func performanceDetails(raw json.RawMessage, turnIndex int) json.RawMessage {
	if len(raw) == 0 {
		return nil
	}
	var details map[string]any
	if err := json.Unmarshal(raw, &details); err != nil {
		return raw
	}
	details["turn"] = turnIndex
	data, err := json.Marshal(details)
	if err != nil {
		return raw
	}
	return data
}

func performanceRunID(turnIndex int) string {
	return fmt.Sprintf("run_performance_%03d", turnIndex)
}

func nextPerformanceOrdinal(ordinal *int) int {
	value := *ordinal
	*ordinal = value + 1
	return value
}
