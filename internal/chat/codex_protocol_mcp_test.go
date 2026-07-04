package chat

import (
	"encoding/json"
	"strings"
	"testing"

	"setta/internal/codexapp"
)

func TestCodexMCPToolCallProjectsStructuredDetails(t *testing.T) {
	item := decodeCodexThreadItemForTest(t, `{
		"appContext": {"connectorId": "github", "resourceUri": "mcp://resource"},
		"arguments": {"query": "repo"},
		"durationMs": 42,
		"id": "mcp_item",
		"mcpAppResourceUri": "mcp://legacy-resource",
		"pluginId": "plugin_github",
		"result": {
			"_meta": {"requestId": "req_1"},
			"content": [
				{"type": "text", "text": "first line"},
				{"type": "image", "data": "redacted"}
			],
			"structuredContent": {"ok": true}
		},
		"server": "github",
		"status": "completed",
		"tool": "search",
		"type": "mcpToolCall"
	}`)

	runItem, err := runItemFromCodexItem(item, RunItemStatusRunning)
	if err != nil {
		t.Fatalf("project mcp item: %v", err)
	}
	requireCompletedMCPRunItem(t, runItem)
	details := requireMCPToolCallDetails(t, runItem)
	requireMCPToolCallMetadata(t, details)
	requireMCPToolCallArguments(t, details)
	requireMCPToolCallResult(t, details)

	projection := runActivityDetailsProjection(runItem)
	if projection.MCPToolCall == nil || projection.MCPToolCall.ToolName != "search" {
		t.Fatalf("activity projection mcp details = %+v", projection.MCPToolCall)
	}
	activity, ok := activityItemBlockProjection(runItem, RunStatusCompleted, false, true)
	if !ok {
		t.Fatal("activity projection was not displayable")
	}
	if activity.Title != "MCP: github" {
		t.Fatalf("activity title = %q, want MCP: github", activity.Title)
	}
}

func TestCodexFailedMCPToolCallProjectsFailedRow(t *testing.T) {
	item := decodeCodexThreadItemForTest(t, `{
		"arguments": {"query": "repo"},
		"error": {"message": "tool failed"},
		"id": "mcp_failed",
		"server": "github",
		"status": "failed",
		"tool": "search",
		"type": "mcpToolCall"
	}`)

	runItem, err := runItemFromCodexItem(item, RunItemStatusRunning)
	if err != nil {
		t.Fatalf("project failed mcp item: %v", err)
	}
	details, ok := runItem.MCPToolCallDetails()
	if !ok || details.Error != "tool failed" {
		t.Fatalf("failed mcp details = %+v ok %v, want error message", details, ok)
	}
	if runItem.Status != RunItemStatusFailed || runItem.Error != "" {
		t.Fatalf("failed item = %+v, want failed row with error message", runItem)
	}
}

func TestMCPToolCallDetailsRejectsFlatFields(t *testing.T) {
	item := RunItem{
		ID:             "run_item_mcp_flat",
		ProviderItemID: "provider_mcp_flat",
		Type:           RunItemTypeMCPToolCall,
		Status:         RunItemStatusCompleted,
		ServerName:     "legacy_server",
		Details: NewRunItemMCPToolCallDetails(RunItemMCPToolCallDetails{
			ServerName: "github",
			ToolName:   "search",
		}),
	}

	err := validateRunItemDetails(item)
	if err == nil {
		t.Fatal("validation succeeded, want flat serverName rejection")
	}
	if !strings.Contains(err.Error(), "mcpToolCall flat serverName must be empty") {
		t.Fatalf("error = %q, want flat serverName rejection", err)
	}
}

func TestCodexMCPToolCallRejectsMalformedContentBlock(t *testing.T) {
	item := decodeCodexThreadItemForTest(t, `{
		"arguments": {},
		"id": "mcp_item",
		"result": {"content": [{"text": "missing type"}]},
		"server": "github",
		"status": "completed",
		"tool": "search",
		"type": "mcpToolCall"
	}`)

	_, err := runItemFromCodexItem(item, RunItemStatusRunning)
	if err == nil {
		t.Fatal("projection succeeded, want malformed content block error")
	}
	if !strings.Contains(err.Error(), "codex mcpToolCall.result.content[0].type is required") {
		t.Fatalf("error = %q, want content type error", err)
	}
}

func decodeCodexThreadItemForTest(t *testing.T, raw string) codexapp.ThreadItem {
	t.Helper()
	item, err := codexapp.DecodeThreadItem(json.RawMessage(raw))
	if err != nil {
		t.Fatalf("decode codex thread item: %v", err)
	}
	return item
}

func requireCompletedMCPRunItem(t *testing.T, runItem RunItem) {
	t.Helper()
	if runItem.Type != RunItemTypeMCPToolCall || runItem.Status != RunItemStatusCompleted {
		t.Fatalf("run item type/status = %s/%s, want mcp completed", runItem.Type, runItem.Status)
	}
	if runItem.ServerName != "" || runItem.ToolName != "" || runItem.DurationMs != 0 || runItem.Result != "" {
		t.Fatalf("flat mcp fields were populated: %+v", runItem)
	}
}

func requireMCPToolCallDetails(t *testing.T, runItem RunItem) *RunItemMCPToolCallDetails {
	t.Helper()
	details, ok := runItem.MCPToolCallDetails()
	if !ok {
		t.Fatalf("mcp details missing from run item: %+v", runItem.Details)
	}
	return details
}

func requireMCPToolCallMetadata(t *testing.T, details *RunItemMCPToolCallDetails) {
	t.Helper()
	if details.ServerName != "github" || details.ToolName != "search" {
		t.Fatalf("details server/tool = %s/%s, want github/search", details.ServerName, details.ToolName)
	}
	if details.DisplayTitle != "MCP: github" {
		t.Fatalf("details display title = %q, want MCP: github", details.DisplayTitle)
	}
	if details.DurationMs != 42 {
		t.Fatalf("details durationMs = %d, want 42", details.DurationMs)
	}
	if details.ResultSummary != "first line\n1 image content block\nstructured content present" {
		t.Fatalf("result summary = %q", details.ResultSummary)
	}
	if details.PluginID != "plugin_github" || details.MCPAppResourceURI != "mcp://legacy-resource" {
		t.Fatalf("details plugin/resource = %+v", *details)
	}
}

func requireMCPToolCallArguments(t *testing.T, details *RunItemMCPToolCallDetails) {
	t.Helper()
	var arguments map[string]string
	if err := json.Unmarshal(details.Arguments, &arguments); err != nil {
		t.Fatalf("decode arguments: %v", err)
	}
	if arguments["query"] != "repo" {
		t.Fatalf("arguments = %s, want query repo", details.Arguments)
	}
}

func requireMCPToolCallResult(t *testing.T, details *RunItemMCPToolCallDetails) {
	t.Helper()
	if details.Result == nil || len(details.Result.Content) != 2 {
		t.Fatalf("result details = %+v, want two content blocks", details.Result)
	}
}
