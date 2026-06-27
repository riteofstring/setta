package codexapp

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestDecodeNotificationAllowsRequiredEmptyString(t *testing.T) {
	notification, err := DecodeAgentMessageDeltaNotification(json.RawMessage(`{
		"delta": "",
		"itemId": "item_fake",
		"threadId": "thread_fake",
		"turnId": "turn_fake"
	}`))
	if err != nil {
		t.Fatalf("decode agent message delta: %v", err)
	}
	if notification.Delta != "" || notification.ItemId != "item_fake" {
		t.Fatalf("notification = %+v, want empty delta with item id", notification)
	}
}

func TestDecodeNotificationRejectsMissingRequiredField(t *testing.T) {
	_, err := DecodeAgentMessageDeltaNotification(json.RawMessage(`{
		"delta": "",
		"threadId": "thread_fake",
		"turnId": "turn_fake"
	}`))
	if err == nil {
		t.Fatal("decode succeeded, want missing itemId error")
	}
	if !strings.Contains(err.Error(), "AgentMessageDeltaNotification.itemId is required") {
		t.Fatalf("error = %q, want missing required field", err)
	}
}

func TestDecodeNotificationRejectsNullRequiredField(t *testing.T) {
	_, err := DecodeAgentMessageDeltaNotification(json.RawMessage(`{
		"delta": null,
		"itemId": "item_fake",
		"threadId": "thread_fake",
		"turnId": "turn_fake"
	}`))
	if err == nil {
		t.Fatal("decode succeeded, want null delta error")
	}
	if !strings.Contains(err.Error(), "AgentMessageDeltaNotification.delta is required") {
		t.Fatalf("error = %q, want null required field", err)
	}
}

func TestDecodeNotificationRejectsWrongFieldType(t *testing.T) {
	_, err := DecodeAgentMessageDeltaNotification(json.RawMessage(`{
		"delta": 12,
		"itemId": "item_fake",
		"threadId": "thread_fake",
		"turnId": "turn_fake"
	}`))
	if err == nil {
		t.Fatal("decode succeeded, want invalid shape error")
	}
	if !strings.Contains(err.Error(), "AgentMessageDeltaNotification has invalid shape") {
		t.Fatalf("error = %q, want invalid shape", err)
	}
}

func TestDecodeNotificationRejectsMissingNestedRequiredField(t *testing.T) {
	_, err := DecodeThreadTokenUsageUpdatedNotification(json.RawMessage(`{
		"threadId": "thread_fake",
		"tokenUsage": {
			"last": {
				"cachedInputTokens": 0,
				"inputTokens": 1,
				"outputTokens": 2,
				"reasoningOutputTokens": 0,
				"totalTokens": 3
			}
		},
		"turnId": "turn_fake"
	}`))
	if err == nil {
		t.Fatal("decode succeeded, want missing nested total error")
	}
	if !strings.Contains(err.Error(), "ThreadTokenUsageUpdatedNotification.tokenUsage.total is required") {
		t.Fatalf("error = %q, want nested required field", err)
	}
}

func TestDecodeThreadListResponseAcceptsHistoryThreadSummaries(t *testing.T) {
	response, err := DecodeThreadListResponse(json.RawMessage(`{
		"data": [
			` + codexHistoryThreadJSON("thread_history_one", "First prompt", "Planning thread", "[]") + `,
			` + codexHistoryThreadJSON("thread_history_two", "Second prompt", "Review thread", "[]") + `
		],
		"nextCursor": "cursor_next",
		"backwardsCursor": "cursor_back"
	}`))
	if err != nil {
		t.Fatalf("decode thread/list response: %v", err)
	}
	if len(response.Data) != 2 {
		t.Fatalf("thread count = %d, want 2", len(response.Data))
	}
	first := response.Data[0]
	if first.ID != "thread_history_one" || first.Preview != "First prompt" {
		t.Fatalf("first thread = %+v, want decoded summary identity and preview", first)
	}
	if first.Name == nil || *first.Name != "Planning thread" {
		t.Fatalf("first thread name = %v, want Planning thread", first.Name)
	}
	if len(first.Turns) != 0 {
		t.Fatalf("thread/list turns = %+v, want empty summary turns", first.Turns)
	}
	if response.NextCursor == nil || *response.NextCursor != "cursor_next" {
		t.Fatalf("nextCursor = %v, want cursor_next", response.NextCursor)
	}
	if response.BackwardsCursor == nil || *response.BackwardsCursor != "cursor_back" {
		t.Fatalf("backwardsCursor = %v, want cursor_back", response.BackwardsCursor)
	}
}

func TestDecodeThreadReadResponseAcceptsIncludeTurns(t *testing.T) {
	fullTurn := codexHistoryTurnJSON("turn_read_full", "full", `[
		{"id":"item_user_read","type":"userMessage","text":"user text"},
		{"id":"item_assistant_read","type":"assistantMessage","text":"assistant text"}
	]`)
	response, err := DecodeThreadReadResponse(json.RawMessage(`{
		"thread": ` + codexHistoryThreadJSON("thread_read", "User asked for history", "History thread", "["+fullTurn+"]") + `
	}`))
	if err != nil {
		t.Fatalf("decode thread/read response: %v", err)
	}
	if response.Thread.ID != "thread_read" {
		t.Fatalf("thread id = %q, want thread_read", response.Thread.ID)
	}
	if len(response.Thread.Turns) != 1 {
		t.Fatalf("turn count = %d, want 1", len(response.Thread.Turns))
	}
	turn := response.Thread.Turns[0]
	if turn.ID != "turn_read_full" || turn.Status != TurnStatusCompleted {
		t.Fatalf("turn = %+v, want completed turn_read_full", turn)
	}
	if got := strings.TrimSpace(string(turn.ItemsView)); got != `"full"` {
		t.Fatalf("itemsView = %s, want full", got)
	}
	if len(turn.Items) != 2 || !strings.Contains(string(turn.Items[1]), "assistant text") {
		t.Fatalf("items = %+v, want decoded raw assistant item", turn.Items)
	}
}

func TestDecodeThreadTurnsListResponseAcceptsPagedSummaryAndFullViews(t *testing.T) {
	params, err := DecodeThreadTurnsListParams(json.RawMessage(`{
		"threadId": "thread_history",
		"cursor": "cursor_before",
		"limit": 40,
		"sortDirection": "asc",
		"itemsView": "full"
	}`))
	if err != nil {
		t.Fatalf("decode thread/turns/list params: %v", err)
	}
	if params.ItemsView == nil || *params.ItemsView != TurnItemsViewFull {
		t.Fatalf("itemsView param = %v, want full", params.ItemsView)
	}

	summary, err := DecodeThreadTurnsListResponse(json.RawMessage(`{
		"data": [
			` + codexHistoryTurnJSON("turn_summary", "summary", `[
				{"id":"item_summary","type":"turnSummary","text":"summary text"}
			]`) + `
		],
		"nextCursor": "cursor_older",
		"backwardsCursor": "cursor_newer"
	}`))
	if err != nil {
		t.Fatalf("decode summary thread/turns/list response: %v", err)
	}
	if len(summary.Data) != 1 || summary.Data[0].ID != "turn_summary" {
		t.Fatalf("summary page = %+v, want turn_summary", summary.Data)
	}
	if got := strings.TrimSpace(string(summary.Data[0].ItemsView)); got != `"summary"` {
		t.Fatalf("summary itemsView = %s, want summary", got)
	}
	if summary.NextCursor == nil || *summary.NextCursor != "cursor_older" {
		t.Fatalf("summary nextCursor = %v, want cursor_older", summary.NextCursor)
	}

	full, err := DecodeThreadTurnsListResponse(json.RawMessage(`{
		"data": [
			` + codexHistoryTurnJSON("turn_full", "full", `[
				{"id":"item_user_full","type":"userMessage","text":"full user text"},
				{"id":"item_assistant_full","type":"assistantMessage","text":"full assistant text"}
			]`) + `
		]
	}`))
	if err != nil {
		t.Fatalf("decode full thread/turns/list response: %v", err)
	}
	if len(full.Data) != 1 || len(full.Data[0].Items) != 2 {
		t.Fatalf("full page = %+v, want one turn with two items", full.Data)
	}
	if got := strings.TrimSpace(string(full.Data[0].ItemsView)); got != `"full"` {
		t.Fatalf("full itemsView = %s, want full", got)
	}
}

func TestDecodeHistoryResponsesRejectMissingRequiredFields(t *testing.T) {
	tests := []struct {
		name   string
		decode func() error
		want   string
	}{
		{
			name: "thread list data",
			decode: func() error {
				_, err := DecodeThreadListResponse(json.RawMessage(`{"nextCursor":"cursor"}`))
				return err
			},
			want: "ThreadListResponse.data is required",
		},
		{
			name: "thread read thread",
			decode: func() error {
				_, err := DecodeThreadReadResponse(json.RawMessage(`{}`))
				return err
			},
			want: "ThreadReadResponse.thread is required",
		},
		{
			name: "thread read nested thread id",
			decode: func() error {
				_, err := DecodeThreadReadResponse(json.RawMessage(`{
					"thread": ` + codexHistoryThreadJSONWithoutID("Missing id", "Missing id thread", "[]") + `
				}`))
				return err
			},
			want: "ThreadReadResponse.thread.id is required",
		},
		{
			name: "turns list nested turn items",
			decode: func() error {
				_, err := DecodeThreadTurnsListResponse(json.RawMessage(`{
					"data": [{"id":"turn_missing_items","status":"completed"}]
				}`))
				return err
			},
			want: "ThreadTurnsListResponse.data[0].items is required",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := test.decode()
			if err == nil {
				t.Fatal("decode succeeded, want missing required field error")
			}
			if !strings.Contains(err.Error(), test.want) {
				t.Fatalf("error = %q, want %q", err.Error(), test.want)
			}
		})
	}
}

func codexHistoryThreadJSON(id string, preview string, name string, turns string) string {
	return codexHistoryThreadJSONWithIDField(`"id": "`+id+`",`, id, preview, name, turns)
}

func codexHistoryThreadJSONWithoutID(preview string, name string, turns string) string {
	return codexHistoryThreadJSONWithIDField("", "thread_missing_id", preview, name, turns)
}

func codexHistoryThreadJSONWithIDField(idField string, sessionSuffix string, preview string, name string, turns string) string {
	return strings.NewReplacer(
		"$idField", idField,
		"$sessionId", "session_"+sessionSuffix,
		"$preview", preview,
		"$name", name,
		"$turns", turns,
	).Replace(`{
		"cliVersion": "0.0.0-test",
		"createdAt": 1710000000,
		"cwd": "/tmp/setta-history",
		"ephemeral": false,
		$idField
		"modelProvider": "openai",
		"name": "$name",
		"preview": "$preview",
		"sessionId": "$sessionId",
		"source": "appServer",
		"status": "idle",
		"turns": $turns,
		"updatedAt": 1710000060
	}`)
}

func codexHistoryTurnJSON(id string, itemsView string, items string) string {
	return strings.NewReplacer(
		"$id", id,
		"$itemsView", itemsView,
		"$items", items,
	).Replace(`{
		"id": "$id",
		"items": $items,
		"itemsView": "$itemsView",
		"status": "completed",
		"startedAt": 1710000001,
		"completedAt": 1710000003,
		"durationMs": 2000
	}`)
}
