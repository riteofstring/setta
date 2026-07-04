package chat

import (
	"encoding/json"
	"strings"
	"testing"

	"setta/internal/codexapp"
)

func TestCodexDiffUpdatedUsesTypedDetails(t *testing.T) {
	sink := &recordingSink{}
	_, err := handleCodexDiffUpdated(jsonRPCMessage{
		Method: codexapp.CodexNotificationTurnDiffUpdated,
		Params: json.RawMessage(`{
			"diff": "--- a/main.go\n+++ b/main.go\n@@\n-old\n+new\n",
			"threadId": "thread_fake",
			"turnId": "turn_fake"
		}`),
	}, "thread_fake", "turn_fake", sink)
	if err != nil {
		t.Fatalf("handle diff update: %v", err)
	}
	if len(sink.items) != 1 {
		t.Fatalf("items = %+v, want one diff item", sink.items)
	}
	item := sink.items[0]
	if item.Type != RunItemTypeDiff || item.DiffSummary != "" || len(item.FilePaths) != 0 || item.RawDetails != nil {
		t.Fatalf("diff item flat fields = %+v, want typed details only", item)
	}
	details, ok := item.DiffDetails()
	if !ok {
		t.Fatalf("diff details missing: %+v", item.Details)
	}
	if len(details.Paths) != 1 {
		t.Fatalf("diff paths = %+v, want one path", details.Paths)
	}
	if details.Summary != "1 file, +1 -1" || details.Paths[0].Path != "main.go" || !strings.Contains(details.Patch, "+new") {
		t.Fatalf("diff details = %+v, want parsed patch stats", *details)
	}
}
