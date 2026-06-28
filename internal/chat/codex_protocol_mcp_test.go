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
	if runItem.Type != RunItemTypeMCPToolCall || runItem.Status != RunItemStatusCompleted {
		t.Fatalf("run item type/status = %s/%s, want mcp completed", runItem.Type, runItem.Status)
	}
	if runItem.ServerName != "github" || runItem.ToolName != "search" {
		t.Fatalf("server/tool = %s/%s, want github/search", runItem.ServerName, runItem.ToolName)
	}
	if runItem.DurationMs != 42 {
		t.Fatalf("durationMs = %d, want 42", runItem.DurationMs)
	}
	if runItem.Result != "first line\n1 image content block\nstructured content present" {
		t.Fatalf("result summary = %q", runItem.Result)
	}

	var details RunItemMCPToolCallDetails
	if err := json.Unmarshal(runItem.Details, &details); err != nil {
		t.Fatalf("decode details: %v", err)
	}
	if details.PluginID != "plugin_github" || details.MCPAppResourceURI != "mcp://legacy-resource" {
		t.Fatalf("details plugin/resource = %+v", details)
	}
	var arguments map[string]string
	if err := json.Unmarshal(details.Arguments, &arguments); err != nil {
		t.Fatalf("decode arguments: %v", err)
	}
	if arguments["query"] != "repo" {
		t.Fatalf("arguments = %s, want query repo", details.Arguments)
	}
	if details.Result == nil || len(details.Result.Content) != 2 {
		t.Fatalf("result details = %+v, want two content blocks", details.Result)
	}

	projection := runActivityDetailsProjection(runItem)
	if projection.MCPToolCall == nil || projection.MCPToolCall.ToolName != "search" {
		t.Fatalf("activity projection mcp details = %+v", projection.MCPToolCall)
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
	if runItem.Status != RunItemStatusFailed || runItem.Error != "tool failed" {
		t.Fatalf("failed item = %+v, want failed row with error message", runItem)
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
