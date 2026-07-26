package agent

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"setta/internal/codexapp"
)

func TestReadStructuredCallThreadConfigDisablesEffectiveExternalCapabilities(t *testing.T) {
	workspaceRoot := t.TempDir()
	caller := structuredCallConfigCallerFunc(func(_ context.Context, method string, params any) (json.RawMessage, error) {
		if method != "config/read" {
			t.Fatalf("config method = %q", method)
		}
		request, ok := params.(codexapp.ConfigReadParams)
		if !ok || request.CWD == nil || *request.CWD != workspaceRoot {
			t.Fatalf("config request = %#v", params)
		}
		return json.RawMessage(`{"config":{"mcp_servers":{"z-server":{"url":"https://example.invalid"},"a-server":{"command":"must-not-run"}}},"origins":{}}`), nil
	})
	config, err := readStructuredCallThreadConfig(context.Background(), caller, workspaceRoot, Invocation{
		Model:           "gpt-director-test",
		ReasoningEffort: "medium",
		PermissionMode:  PermissionModeReadOnly,
		ApprovalMode:    ApprovalModeNever,
	})
	if err != nil {
		t.Fatalf("readStructuredCallThreadConfig: %v", err)
	}
	var servers map[string]struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.Unmarshal(config["mcp_servers"], &servers); err != nil {
		t.Fatalf("decode MCP overrides: %v", err)
	}
	if len(servers) != 2 || servers["a-server"].Enabled || servers["z-server"].Enabled {
		t.Fatalf("structured-call MCP overrides = %+v", servers)
	}
	var features map[string]bool
	if err := json.Unmarshal(config["features"], &features); err != nil {
		t.Fatalf("decode feature overrides: %v", err)
	}
	for _, feature := range []string{
		"apps",
		"auth_elicitation",
		"browser_use",
		"default_mode_request_user_input",
		"hooks",
		"multi_agent",
		"personality",
		"plugins",
		"prevent_idle_sleep",
		"realtime_conversation",
		"secret_auth_storage",
		"shell_snapshot",
		"shell_tool",
		"terminal_visualization_instructions",
		"tool_call_mcp_elicitation",
		"unified_exec",
	} {
		if enabled, found := features[feature]; !found || enabled {
			t.Fatalf("structured-call feature %s = %t found=%t", feature, enabled, found)
		}
	}
}

func TestReadConfiguredMCPServerNamesRejectsMalformedEffectiveConfig(t *testing.T) {
	caller := structuredCallConfigCallerFunc(func(context.Context, string, any) (json.RawMessage, error) {
		return json.RawMessage(`{"config":{"mcp_servers":null},"origins":{}}`), nil
	})
	_, err := readConfiguredMCPServerNames(context.Background(), caller, t.TempDir())
	if err == nil || !strings.Contains(err.Error(), "mcp_servers must be an object") {
		t.Fatalf("malformed MCP config error = %v", err)
	}
}

type structuredCallConfigCallerFunc func(context.Context, string, any) (json.RawMessage, error)

func (call structuredCallConfigCallerFunc) Call(
	ctx context.Context,
	method string,
	params any,
) (json.RawMessage, error) {
	return call(ctx, method, params)
}
