package codexapp

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestDecodeThreadItemAcceptsStructuredMCPToolCall(t *testing.T) {
	item, err := DecodeThreadItem(json.RawMessage(`{
		"appContext": {"connectorId": "github", "resourceUri": "mcp://resource"},
		"arguments": {"query": "repo"},
		"durationMs": 42,
		"id": "mcp_item",
		"mcpAppResourceUri": "mcp://legacy-resource",
		"pluginId": "plugin_github",
		"result": {
			"_meta": {"requestId": "req_1"},
			"content": [{"type": "text", "text": "tool result"}],
			"structuredContent": {"ok": true}
		},
		"server": "github",
		"status": "completed",
		"tool": "search",
		"type": "mcpToolCall"
	}`))
	if err != nil {
		t.Fatalf("decode mcp tool call: %v", err)
	}
	if item.Type != ThreadItemTypeMcpToolCall || item.McpToolCall == nil {
		t.Fatalf("item = %+v, want mcpToolCall variant", item)
	}
	if item.McpToolCall.Server != "github" || item.McpToolCall.Tool != "search" {
		t.Fatalf("mcp item = %+v, want github.search", item.McpToolCall)
	}
	if item.McpToolCall.Result == nil || len(item.McpToolCall.Result.Content) != 1 {
		t.Fatalf("result = %+v, want one structured content item", item.McpToolCall.Result)
	}
}

func TestDecodeThreadItemRejectsMCPStringResult(t *testing.T) {
	_, err := DecodeThreadItem(json.RawMessage(`{
		"arguments": {},
		"id": "mcp_item",
		"result": "flattened result",
		"server": "github",
		"status": "completed",
		"tool": "search",
		"type": "mcpToolCall"
	}`))
	if err == nil {
		t.Fatal("decode succeeded, want structured result error")
	}
	if !strings.Contains(err.Error(), "McpToolCallThreadItem.result must be an object") {
		t.Fatalf("error = %q, want result object error", err)
	}
}

func TestDecodeThreadItemRejectsUnknownDiscriminator(t *testing.T) {
	_, err := DecodeThreadItem(json.RawMessage(`{"id":"item_unknown","type":"futureItem"}`))
	if err == nil {
		t.Fatal("decode succeeded, want unsupported discriminator error")
	}
	if !strings.Contains(err.Error(), "ThreadItem.type is unsupported: futureItem") {
		t.Fatalf("error = %q, want unsupported ThreadItem.type", err)
	}
}

func TestDecodeThreadItemRejectsMissingMCPRequiredField(t *testing.T) {
	_, err := DecodeThreadItem(json.RawMessage(`{
		"arguments": {},
		"id": "mcp_item",
		"status": "completed",
		"tool": "search",
		"type": "mcpToolCall"
	}`))
	if err == nil {
		t.Fatal("decode succeeded, want missing server error")
	}
	if !strings.Contains(err.Error(), "McpToolCallThreadItem.server is required") {
		t.Fatalf("error = %q, want missing server", err)
	}
}
