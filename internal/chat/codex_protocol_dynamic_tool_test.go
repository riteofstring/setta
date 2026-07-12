package chat

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestCodexDynamicToolCallProjectsStructuredDetails(t *testing.T) {
	item := decodeCodexThreadItemForTest(t, `{
		"arguments": {"scope": "workspace"},
		"contentItems": [{"type": "inputText", "text": "{\"rootPath\":\"/tmp/workspace\"}"}],
		"durationMs": 37,
		"id": "dynamic_item",
		"namespace": "setta",
		"status": "completed",
		"success": true,
		"tool": "workspace_context",
		"type": "dynamicToolCall"
	}`)

	runItem, err := runItemFromCodexItem(item, RunItemStatusRunning)
	if err != nil {
		t.Fatalf("project dynamic tool item: %v", err)
	}
	assertDynamicToolRunItemFromCodex(t, runItem)
	details := assertDynamicToolDetailsFromCodex(t, runItem)
	assertDynamicToolActivityProjection(t, runItem, details)
}

func assertDynamicToolRunItemFromCodex(t *testing.T, runItem RunItem) {
	t.Helper()
	if runItem.Type != RunItemTypeDynamicToolCall || runItem.Status != RunItemStatusCompleted {
		t.Fatalf("run item type/status = %s/%s, want dynamic completed", runItem.Type, runItem.Status)
	}
	if runItem.Namespace != "" || runItem.ToolName != "" || runItem.DurationMs != 0 || runItem.Result != "" || runItem.RawDetails != nil {
		t.Fatalf("flat dynamic fields were populated: %+v", runItem)
	}
}

func assertDynamicToolDetailsFromCodex(t *testing.T, runItem RunItem) *RunItemDynamicToolCallDetails {
	t.Helper()
	details, ok := runItem.DynamicToolCallDetails()
	if !ok {
		t.Fatalf("dynamic details missing from run item: %+v", runItem.Details)
	}
	if details.Namespace != "setta" || details.ToolName != "workspace_context" || details.DurationMs != 37 {
		t.Fatalf("dynamic details identity = %+v", *details)
	}
	var arguments map[string]string
	if err := json.Unmarshal(details.Arguments, &arguments); err != nil {
		t.Fatalf("decode dynamic arguments: %v", err)
	}
	if arguments["scope"] != "workspace" {
		t.Fatalf("dynamic arguments = %+v", arguments)
	}
	if details.ResultSummary != `{"rootPath":"/tmp/workspace"}` {
		t.Fatalf("dynamic result summary = %q", details.ResultSummary)
	}
	if details.Result == nil || details.Result.Success == nil || !*details.Result.Success || len(details.Result.ContentItems) != 1 {
		t.Fatalf("dynamic result = %+v", details.Result)
	}
	return details
}

func assertDynamicToolActivityProjection(t *testing.T, runItem RunItem, details *RunItemDynamicToolCallDetails) {
	t.Helper()
	projection := runActivityDetailsProjection(runItem)
	if projection.DynamicToolCall == nil || projection.DynamicToolCall.ToolName != details.ToolName {
		t.Fatalf("activity projection dynamic details = %+v", projection.DynamicToolCall)
	}
	activity, ok := activityItemBlockProjection(runItem, RunStatusCompleted, false, true)
	if !ok {
		t.Fatal("activity projection was not displayable")
	}
	if activity.Title != "Setta: workspace_context" {
		t.Fatalf("activity title = %q, want Setta: workspace_context", activity.Title)
	}
}

func TestCodexDynamicToolCallRejectsMalformedContentItem(t *testing.T) {
	item := decodeCodexThreadItemForTest(t, `{
		"arguments": {},
		"contentItems": [{"type": "inputText"}],
		"id": "dynamic_item",
		"namespace": "setta",
		"status": "completed",
		"tool": "workspace_context",
		"type": "dynamicToolCall"
	}`)

	_, err := runItemFromCodexItem(item, RunItemStatusRunning)
	if err == nil {
		t.Fatal("projection succeeded, want malformed content item error")
	}
	if !strings.Contains(err.Error(), "codex dynamicToolCall contentItems[0].text is required for inputText") {
		t.Fatalf("error = %q, want inputText content error", err)
	}
}

func TestDynamicToolCallDetailsRejectsFlatFields(t *testing.T) {
	item := RunItem{
		ID:             "run_item_dynamic_flat",
		ProviderItemID: "provider_dynamic_flat",
		Type:           RunItemTypeDynamicToolCall,
		Status:         RunItemStatusCompleted,
		ToolName:       "legacy_tool",
		Details: NewRunItemDynamicToolCallDetails(RunItemDynamicToolCallDetails{
			Namespace: "setta",
			ToolName:  "workspace_context",
		}),
	}

	err := validateRunItemDetails(item)
	if err == nil {
		t.Fatal("validation succeeded, want flat toolName rejection")
	}
	if !strings.Contains(err.Error(), "flat toolName must be empty") {
		t.Fatalf("error = %q, want flat toolName rejection", err)
	}
}

func TestDynamicToolCallDetailsRejectsUnsupportedResultContent(t *testing.T) {
	item := RunItem{
		ID:             "run_item_dynamic_bad_content",
		ProviderItemID: "provider_dynamic_bad_content",
		Type:           RunItemTypeDynamicToolCall,
		Status:         RunItemStatusCompleted,
		Details: NewRunItemDynamicToolCallDetails(RunItemDynamicToolCallDetails{
			ToolName: "workspace_context",
			Result: &RunItemDynamicToolResult{
				ContentItems: []RunItemDynamicToolContentItem{{Type: "unknown"}},
			},
		}),
	}

	err := validateRunItemDetails(item)
	if err == nil {
		t.Fatal("validation succeeded, want unsupported content rejection")
	}
	if !strings.Contains(err.Error(), "contentItems[0].type is unsupported") {
		t.Fatalf("error = %q, want unsupported content rejection", err)
	}
}

func TestDynamicToolCallResultMarshalPreservesEmptyContentItems(t *testing.T) {
	data, err := json.Marshal(RunItemDynamicToolResult{})
	if err != nil {
		t.Fatalf("marshal dynamic tool result: %v", err)
	}
	if string(data) != `{"contentItems":[],"success":null}` {
		t.Fatalf("dynamic result json = %s", data)
	}
}
