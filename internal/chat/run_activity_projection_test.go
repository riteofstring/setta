package chat

import (
	"encoding/json"
	"testing"
)

func TestServiceProjectsNoActivityForGreeting(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventAssistantDelta, ProviderItemID: "agent_message_fake", Text: "Hi. What do you want to work on in this repo?"},
	}))
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "Hi")
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)

	page, err := service.LoadMessagePage("workspace_api", conversation.ID, 0, 20)
	if err != nil {
		t.Fatalf("load page: %v", err)
	}
	turn := requireTranscriptTurn(t, page.Transcript, result.Run.ID)
	if turn.Activity != nil {
		t.Fatalf("activity = %+v, want none", turn.Activity)
	}
	if len(page.RunItems) != 0 {
		t.Fatalf("run items = %+v, want no delta-created agent message item", page.RunItems)
	}
}

func TestServiceProjectsCommandActivityWithOutput(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventRunItem, ProviderItemID: "command_fake", RunItem: RunItem{
			ProviderItemID: "command_fake",
			Type:           RunItemTypeCommandExecution,
			Status:         RunItemStatusRunning,
			Command:        "go test ./...",
			Cwd:            "/tmp/workspace",
		}},
		{Type: FakeEventRunItemOutput, ProviderItemID: "command_fake", Stream: "stdout", Text: "ok\n"},
		{Type: FakeEventAssistantDelta, ProviderItemID: "agent_message_fake", Text: "done"},
	}))
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "activity")
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)

	row := requireOnlyActivityRow(t, service, conversation.ID, result.Run.ID)
	if row.Type != RunItemTypeCommandExecution || row.Title != "command execution" || row.Status != RunItemStatusCompleted {
		t.Fatalf("row = %+v, want completed command execution", row)
	}
	if !row.HasDetails || !row.HasOutput || row.Details.Command != "go test ./..." || row.Details.Cwd != "/tmp/workspace" {
		t.Fatalf("row details = %+v hasOutput=%v, want command/cwd/output", row.Details, row.HasOutput)
	}
	if row.SourceRunItemID == "" || row.ID == row.SourceRunItemID {
		t.Fatalf("row ids = %+v, want display id separate from source item id", row)
	}
}

func TestServiceProjectsToolActivity(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventRunItem, ProviderItemID: "tool_fake", RunItem: RunItem{
			ProviderItemID: "tool_fake",
			Type:           RunItemTypeMCPToolCall,
			Status:         RunItemStatusCompleted,
			ServerName:     "setta",
			ToolName:       "workspace_context",
			RequestID:      "request_tool",
			Result:         "context ready",
		}},
		{Type: FakeEventAssistantDelta, ProviderItemID: "agent_message_fake", Text: "done"},
	}))
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "tool")
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)

	row := requireOnlyActivityRow(t, service, conversation.ID, result.Run.ID)
	if row.Type != RunItemTypeMCPToolCall || row.Title != "workspace_context" || row.Details.ServerName != "setta" ||
		row.Details.ToolName != "workspace_context" || row.Details.RequestID != "request_tool" || row.Details.Result != "context ready" {
		t.Fatalf("row = %+v, want projected tool identity and result", row)
	}
}

func TestServiceProjectsOnlyPublicReasoningSummary(t *testing.T) {
	t.Run("public summary", func(t *testing.T) {
		service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness([]FakeHarnessEvent{
			{Type: FakeEventRunItem, ProviderItemID: "reasoning_fake", RunItem: RunItem{
				ProviderItemID: "reasoning_fake",
				Type:           RunItemTypeReasoning,
				Status:         RunItemStatusCompleted,
				Title:          "Reasoning summary",
				Summary:        "Checked context.",
			}},
			{Type: FakeEventAssistantDelta, ProviderItemID: "agent_message_fake", Text: "done"},
		}))
		conversation, err := service.CreateConversation("workspace_api", "")
		if err != nil {
			t.Fatalf("create conversation: %v", err)
		}
		result, err := service.SendUserMessage("workspace_api", conversation.ID, "reason")
		if err != nil {
			t.Fatalf("send: %v", err)
		}
		waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)

		row := requireOnlyActivityRow(t, service, conversation.ID, result.Run.ID)
		if row.Type != RunItemTypeReasoning || row.Details.Summary != "Checked context." {
			t.Fatalf("row = %+v, want public reasoning summary", row)
		}
	})

	t.Run("hidden text only", func(t *testing.T) {
		service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness([]FakeHarnessEvent{
			{Type: FakeEventRunItem, ProviderItemID: "reasoning_fake", RunItem: RunItem{
				ProviderItemID: "reasoning_fake",
				Type:           RunItemTypeReasoning,
				Status:         RunItemStatusCompleted,
				Title:          "Reasoning summary",
				HiddenText:     "private reasoning",
			}},
			{Type: FakeEventAssistantDelta, ProviderItemID: "agent_message_fake", Text: "done"},
		}))
		conversation, err := service.CreateConversation("workspace_api", "")
		if err != nil {
			t.Fatalf("create conversation: %v", err)
		}
		result, err := service.SendUserMessage("workspace_api", conversation.ID, "reason")
		if err != nil {
			t.Fatalf("send: %v", err)
		}
		waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)

		turn := requireProjectedTurn(t, service, conversation.ID, result.Run.ID)
		if turn.Activity != nil {
			t.Fatalf("activity = %+v, want hidden reasoning omitted", turn.Activity)
		}
	})
}

func TestServiceFiltersDuplicatedAgentMessageProviderItemsFromActivity(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventAssistantDelta, ProviderItemID: "agent_message_fake", Text: "hello once"},
		{Type: FakeEventRunItem, ProviderItemID: "agent_message_fake", RunItem: RunItem{
			ProviderItemID: "agent_message_fake",
			Type:           RunItemTypeAgentMessage,
			Status:         RunItemStatusCompleted,
			Title:          "Assistant message",
			Summary:        "hello once",
		}},
	}))
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "duplicate")
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)

	turn := requireProjectedTurn(t, service, conversation.ID, result.Run.ID)
	if got := promptFromMessage(*turn.AssistantMessage); got != "hello once" {
		t.Fatalf("assistant text = %q, want provider text exactly once", got)
	}
	if turn.Activity != nil {
		t.Fatalf("activity = %+v, want agent message item omitted", turn.Activity)
	}
}

func TestServiceAssistantTextCanonicalizesProviderAgentMessageDeltas(t *testing.T) {
	t.Run("completed item repairs same provider replay", func(t *testing.T) {
		requireAssistantTextForFakeEvents(t, []FakeHarnessEvent{
			{Type: FakeEventAssistantDelta, ProviderItemID: "agent_message_fake", Text: "hello once"},
			{Type: FakeEventAssistantDelta, ProviderItemID: "agent_message_fake", Text: "hello once"},
			{Type: FakeEventRunItem, ProviderItemID: "agent_message_fake", RunItem: RunItem{
				ProviderItemID: "agent_message_fake",
				Type:           RunItemTypeAgentMessage,
				Status:         RunItemStatusCompleted,
				Title:          "Assistant message",
				Summary:        "hello once",
			}},
		}, "duplicate delta", "hello once")
	})

	t.Run("same completed text from distinct provider agent items", func(t *testing.T) {
		requireAssistantTextForFakeEvents(t, []FakeHarnessEvent{
			{Type: FakeEventAssistantDelta, ProviderItemID: "agent_message_a", Text: "echo"},
			{Type: FakeEventRunItem, ProviderItemID: "agent_message_a", RunItem: RunItem{
				ProviderItemID: "agent_message_a",
				Type:           RunItemTypeAgentMessage,
				Status:         RunItemStatusCompleted,
				Title:          "Assistant message",
				Summary:        "echo",
			}},
			{Type: FakeEventAssistantDelta, ProviderItemID: "agent_message_b", Text: "echo"},
			{Type: FakeEventRunItem, ProviderItemID: "agent_message_b", RunItem: RunItem{
				ProviderItemID: "agent_message_b",
				Type:           RunItemTypeAgentMessage,
				Status:         RunItemStatusCompleted,
				Title:          "Assistant message",
				Summary:        "echo",
			}},
		}, "two items", "echo")
	})

	t.Run("repeated leading chunk is preserved", func(t *testing.T) {
		requireAssistantTextForFakeEvents(t, []FakeHarnessEvent{
			{Type: FakeEventAssistantDelta, ProviderItemID: "agent_message_fake", Text: "ha "},
			{Type: FakeEventAssistantDelta, ProviderItemID: "agent_message_fake", Text: "ha "},
		}, "repeat", "ha ha ")
	})

	t.Run("recurring leading chunk is preserved", func(t *testing.T) {
		requireAssistantTextForFakeEvents(t, []FakeHarnessEvent{
			{Type: FakeEventAssistantDelta, ProviderItemID: "agent_message_fake", Text: "- "},
			{Type: FakeEventAssistantDelta, ProviderItemID: "agent_message_fake", Text: "one\n"},
			{Type: FakeEventAssistantDelta, ProviderItemID: "agent_message_fake", Text: "- "},
			{Type: FakeEventAssistantDelta, ProviderItemID: "agent_message_fake", Text: "two"},
		}, "bullets", "- one\n- two")
	})

	t.Run("prefix delta is preserved as typed delta", func(t *testing.T) {
		requireAssistantTextForFakeEvents(t, []FakeHarnessEvent{
			{Type: FakeEventAssistantDelta, ProviderItemID: "agent_message_fake", Text: "hello"},
			{Type: FakeEventAssistantDelta, ProviderItemID: "agent_message_fake", Text: "hello world"},
		}, "prefix delta", "hellohello world")
	})

	t.Run("completed item repairs chunked same provider replay", func(t *testing.T) {
		requireAssistantTextForFakeEvents(t, []FakeHarnessEvent{
			{Type: FakeEventAssistantDelta, ProviderItemID: "agent_message_fake", Text: "Hi. "},
			{Type: FakeEventAssistantDelta, ProviderItemID: "agent_message_fake", Text: "What now?"},
			{Type: FakeEventAssistantDelta, ProviderItemID: "agent_message_fake", Text: "Hi. "},
			{Type: FakeEventAssistantDelta, ProviderItemID: "agent_message_fake", Text: "What now?"},
			{Type: FakeEventRunItem, ProviderItemID: "agent_message_fake", RunItem: RunItem{
				ProviderItemID: "agent_message_fake",
				Type:           RunItemTypeAgentMessage,
				Status:         RunItemStatusCompleted,
				Title:          "Assistant message",
				Summary:        "Hi. What now?",
			}},
		}, "chunk replay", "Hi. What now?")
	})

	t.Run("raw completed agent item does not suppress later canonical delta", func(t *testing.T) {
		requireAssistantTextForFakeEvents(t, []FakeHarnessEvent{
			{Type: FakeEventRunItem, ProviderItemID: "agent_message_raw", RunItem: RunItem{
				ProviderItemID: "agent_message_raw",
				Type:           RunItemTypeAgentMessage,
				Status:         RunItemStatusCompleted,
				Title:          "Assistant message",
				Summary:        "visible reply",
			}},
			{Type: FakeEventAssistantDelta, ProviderItemID: "agent_message_delta", Text: "visible reply"},
		}, "raw before delta", "visible reply")
	})
}

func requireAssistantTextForFakeEvents(t *testing.T, events []FakeHarnessEvent, prompt string, want string) {
	t.Helper()

	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness(events))
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, prompt)
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)

	turn := requireProjectedTurn(t, service, conversation.ID, result.Run.ID)
	if got := promptFromMessage(*turn.AssistantMessage); got != want {
		t.Fatalf("assistant text = %q, want %q", got, want)
	}
}

func TestServiceCanonicalizesCodexAgentMessageDeltaReplay(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewCodexHarness(testCodexConfig("duplicate-agent-delta")))
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "codex duplicate delta")
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)

	turn := requireProjectedTurn(t, service, conversation.ID, result.Run.ID)
	if got := promptFromMessage(*turn.AssistantMessage); got != "hello once" {
		t.Fatalf("assistant text = %q, want replayed Codex provider delta once", got)
	}
}

func TestServiceUsesCodexAgentDeltaAsCanonicalAssistantText(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewCodexHarness(testCodexConfig("agent-delta-completed-item")))
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "codex completed item")
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)

	turn := requireProjectedTurn(t, service, conversation.ID, result.Run.ID)
	if got := promptFromMessage(*turn.AssistantMessage); got != "hello once" {
		t.Fatalf("assistant text = %q, want completed agentMessage item ignored as text source", got)
	}
	if turn.Activity != nil {
		t.Fatalf("activity = %+v, want completed agentMessage item omitted from projection", turn.Activity)
	}
}

func TestServiceProjectsEmptyRunningReasoningAsStatusTitle(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventRunItem, ProviderItemID: "reasoning_fake", RunItem: RunItem{
			ProviderItemID: "reasoning_fake",
			Type:           RunItemTypeReasoning,
			Status:         RunItemStatusRunning,
			Title:          "Reasoning summary",
		}},
		{Type: FakeEventAssistantDelta, ProviderItemID: "agent_message_fake", Text: "done"},
	}))
	subscription, err := service.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe events: %v", err)
	}
	defer subscription.Unsubscribe()
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "stream")
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	events := receiveEventsUntil(t, subscription, func(event Event) bool {
		if event.Type != EventTypeRunUpdated || event.RunID != result.Run.ID {
			return false
		}
		return decodeRunUpdatedPayload(t, event).Run.Status == RunStatusCompleted
	})
	sawStatusTitle := false
	for _, payload := range activityProjectionPayloads(t, events, result.Run.ID) {
		if payload.Activity == nil {
			continue
		}
		if len(payload.Activity.Rows) != 0 {
			t.Fatalf("activity payload rows = %+v, want empty/private reasoning to stay out of rows", payload.Activity.Rows)
		}
		if payload.Activity.StatusTitle == "Reasoning summary" && payload.Activity.Status == RunStatusRunning {
			sawStatusTitle = true
		}
	}
	if !sawStatusTitle {
		t.Fatalf("activity payloads = %+v, want running reasoning status title", activityProjectionPayloads(t, events, result.Run.ID))
	}
	turn := requireProjectedTurn(t, service, conversation.ID, result.Run.ID)
	if turn.Activity != nil {
		t.Fatalf("activity = %+v, want no transcript activity for empty/private reasoning", turn.Activity)
	}
}

func TestServiceProjectsReasoningStatusTitleWithDisplayableRows(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventRunItem, ProviderItemID: "command_fake", RunItem: RunItem{
			ProviderItemID: "command_fake",
			Type:           RunItemTypeCommandExecution,
			Status:         RunItemStatusRunning,
			Command:        "printf output",
		}},
		{Type: FakeEventRunItem, ProviderItemID: "reasoning_fake", RunItem: RunItem{
			ProviderItemID: "reasoning_fake",
			Type:           RunItemTypeReasoning,
			Status:         RunItemStatusRunning,
			Title:          "Checking repo state",
		}},
		{Type: FakeEventAssistantDelta, ProviderItemID: "agent_message_fake", Text: "done"},
	}))
	subscription, err := service.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe events: %v", err)
	}
	defer subscription.Unsubscribe()
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "stream")
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	events := receiveEventsUntil(t, subscription, func(event Event) bool {
		if event.Type != EventTypeRunActivityUpdated || event.RunID != result.Run.ID {
			return false
		}
		payload := decodeRunActivityUpdatedPayload(t, event)
		return payload.Activity != nil && payload.Activity.StatusTitle == "Checking repo state"
	})
	payloads := activityProjectionPayloads(t, events, result.Run.ID)
	latest := payloads[len(payloads)-1].Activity
	if latest == nil {
		t.Fatalf("activity = nil, want command row with status title")
	}
	if latest.StatusTitle != "Checking repo state" {
		t.Fatalf("status title = %q, want Checking repo state", latest.StatusTitle)
	}
	if len(latest.Rows) != 1 || latest.Rows[0].Type != RunItemTypeCommandExecution {
		t.Fatalf("rows = %+v, want only command row", latest.Rows)
	}
	if latest.Status != RunStatusRunning {
		t.Fatalf("status = %s, want running while reasoning title is active", latest.Status)
	}
}

func TestServicePublishesRunActivityProjectionOnlyWhenOutputBecomesAvailable(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventRunItem, ProviderItemID: "command_fake", RunItem: RunItem{
			ProviderItemID: "command_fake",
			Type:           RunItemTypeCommandExecution,
			Status:         RunItemStatusRunning,
			Command:        "printf output",
		}},
		{Type: FakeEventRunItemOutput, ProviderItemID: "command_fake", Stream: "stdout", Text: "one\n"},
		{Type: FakeEventRunItemOutput, ProviderItemID: "command_fake", Stream: "stdout", Text: "two\n"},
		{Type: FakeEventAssistantDelta, ProviderItemID: "agent_message_fake", Text: "done"},
	}))
	subscription, err := service.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe events: %v", err)
	}
	defer subscription.Unsubscribe()
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "output projection")
	if err != nil {
		t.Fatalf("send: %v", err)
	}

	events := receiveEventsUntil(t, subscription, func(event Event) bool {
		if event.Type != EventTypeRunActivityUpdated || event.RunID != result.Run.ID {
			return false
		}
		payload := decodeRunActivityUpdatedPayload(t, event)
		return payload.Activity != nil && payload.Activity.Status == RunStatusCompleted
	})
	payloads := activityProjectionPayloads(t, events, result.Run.ID)
	if len(payloads) != 3 {
		t.Fatalf("activity projection updates = %d, want run item, first output, completion; events=%v", len(payloads), eventTypes(events))
	}
	if payloads[0].Activity == nil || payloads[0].Activity.Rows[0].HasOutput {
		t.Fatalf("first activity payload = %+v, want row before output availability", payloads[0].Activity)
	}
	if payloads[1].Activity == nil || !payloads[1].Activity.Rows[0].HasOutput {
		t.Fatalf("second activity payload = %+v, want first output availability", payloads[1].Activity)
	}
}

func requireProjectedTurn(t *testing.T, service *Service, conversationID string, runID string) TranscriptTurn {
	t.Helper()

	page, err := service.LoadMessagePage("workspace_api", conversationID, 0, 20)
	if err != nil {
		t.Fatalf("load page: %v", err)
	}
	return *requireTranscriptTurn(t, page.Transcript, runID)
}

func requireOnlyActivityRow(t *testing.T, service *Service, conversationID string, runID string) RunActivityRowProjection {
	t.Helper()

	turn := requireProjectedTurn(t, service, conversationID, runID)
	if turn.Activity == nil {
		t.Fatal("activity = nil, want one row")
	}
	if len(turn.Activity.Rows) != 1 {
		t.Fatalf("rows = %+v, want one row", turn.Activity.Rows)
	}
	return turn.Activity.Rows[0]
}

func requireTranscriptTurn(t *testing.T, transcript []TranscriptTurn, runID string) *TranscriptTurn {
	t.Helper()

	for index := range transcript {
		if transcript[index].Run.ID == runID {
			return &transcript[index]
		}
	}
	t.Fatalf("transcript = %+v, want run %s", transcript, runID)
	return nil
}

func decodeRunActivityUpdatedPayload(t *testing.T, event Event) RunActivityUpdatedPayload {
	t.Helper()

	var payload RunActivityUpdatedPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		t.Fatalf("decode run activity payload: %v", err)
	}
	return payload
}

func decodeRunUpdatedPayload(t *testing.T, event Event) RunUpdatedPayload {
	t.Helper()

	var payload RunUpdatedPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		t.Fatalf("decode run updated payload: %v", err)
	}
	return payload
}

func activityProjectionPayloads(t *testing.T, events []Event, runID string) []RunActivityUpdatedPayload {
	t.Helper()

	payloads := []RunActivityUpdatedPayload{}
	for _, event := range events {
		if event.Type != EventTypeRunActivityUpdated || event.RunID != runID {
			continue
		}
		payloads = append(payloads, decodeRunActivityUpdatedPayload(t, event))
	}
	return payloads
}
