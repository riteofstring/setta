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
