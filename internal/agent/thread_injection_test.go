package agent

import (
	"encoding/json"
	"testing"
)

func TestInjectedItemsPreserveAssistantHistory(t *testing.T) {
	items, err := injectedItems([]InjectedTextItem{
		{Role: "user", Text: "Create a parser workstream."},
		{Role: "assistant", Text: "I created and selected it."},
	})
	if err != nil {
		t.Fatalf("injectedItems: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("injected items = %d, want 2", len(items))
	}
	var assistant struct {
		Role    string `json:"role"`
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.Unmarshal(items[1], &assistant); err != nil {
		t.Fatalf("decode assistant history item: %v", err)
	}
	if assistant.Role != "assistant" ||
		len(assistant.Content) != 1 ||
		assistant.Content[0].Type != "output_text" ||
		assistant.Content[0].Text != "I created and selected it." {
		t.Fatalf("assistant history item = %+v", assistant)
	}
}
