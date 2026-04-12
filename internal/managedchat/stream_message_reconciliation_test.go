package managedchat

import "testing"

func TestFindAssistantMessageForFinalizedUpdatePrefersExactAssistantID(t *testing.T) {
	t.Parallel()

	messages := []map[string]any{
		userMessage("user-1", "Hello"),
		assistantMessage("rs_placeholder_1", ""),
		assistantMessage("assistant-1", "Existing finalized reply"),
	}

	found := findAssistantMessageForFinalizedUpdate(messages, assistantMessage("assistant-1", "Updated reply"))
	if found == nil {
		t.Fatal("expected assistant match")
	}
	if got, _ := messageID(found); got != "assistant-1" {
		t.Fatalf("expected assistant-1 match, got %#v", found)
	}
}

func TestFindAssistantMessageForFinalizedUpdateFallsBackToLatestPlaceholder(t *testing.T) {
	t.Parallel()

	messages := []map[string]any{
		assistantMessage("rs_placeholder_1", ""),
		assistantMessage("resp_placeholder_2", ""),
	}

	found := findAssistantMessageForFinalizedUpdate(messages, assistantMessage("assistant-final", "Completed reply"))
	if found == nil {
		t.Fatal("expected placeholder fallback")
	}
	if got, _ := messageID(found); got != "resp_placeholder_2" {
		t.Fatalf("expected latest placeholder fallback, got %#v", found)
	}
}
