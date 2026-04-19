package app

import (
	"strings"
	"testing"

	"setta/internal/mcpx"
)

func TestPluginBackendMCPServersConnected(t *testing.T) {
	toolError := "boom"
	serverIDs := map[string]struct{}{
		"alpha": {},
		"beta":  {},
	}

	tests := []struct {
		name     string
		statuses []mcpx.ServerRuntimeStatus
		want     bool
		wantErr  string
	}{
		{
			name: "all connected",
			statuses: []mcpx.ServerRuntimeStatus{
				{ServerID: "alpha", State: mcpx.RuntimeStateConnected},
				{ServerID: "beta", State: mcpx.RuntimeStateConnected},
			},
			want: true,
		},
		{
			name: "missing server stays pending",
			statuses: []mcpx.ServerRuntimeStatus{
				{ServerID: "alpha", State: mcpx.RuntimeStateConnected},
			},
		},
		{
			name: "non-connected state stays pending",
			statuses: []mcpx.ServerRuntimeStatus{
				{ServerID: "alpha", State: mcpx.RuntimeStateConnected},
				{ServerID: "beta", State: mcpx.RuntimeStateConnecting},
			},
		},
		{
			name: "error surfaces runtime message",
			statuses: []mcpx.ServerRuntimeStatus{
				{ServerID: "alpha", State: mcpx.RuntimeStateConnected},
				{ServerID: "beta", State: mcpx.RuntimeStateError, LastError: &toolError},
			},
			wantErr: "plugin backend MCP runtime failed for beta: boom",
		},
		{
			name: "error without runtime message keeps fallback text",
			statuses: []mcpx.ServerRuntimeStatus{
				{ServerID: "alpha", State: mcpx.RuntimeStateConnected},
				{ServerID: "beta", State: mcpx.RuntimeStateError, LastError: testStringPtr("   ")},
			},
			wantErr: "plugin backend MCP runtime failed for beta",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			connected, err := pluginBackendMCPServersConnected(tt.statuses, serverIDs)
			if tt.wantErr != "" {
				if err == nil {
					t.Fatalf("expected error %q, got nil", tt.wantErr)
				}
				if err.Error() != tt.wantErr {
					t.Fatalf("expected error %q, got %q", tt.wantErr, err.Error())
				}
				return
			}
			if err != nil {
				t.Fatalf("pluginBackendMCPServersConnected returned error: %v", err)
			}
			if connected != tt.want {
				t.Fatalf("expected connected=%t, got %t", tt.want, connected)
			}
		})
	}
}

func TestPluginBackendMCPRuntimeErrorTrimsMessage(t *testing.T) {
	err := pluginBackendMCPRuntimeError("alpha", testStringPtr("  failed to launch  "))
	if err == nil {
		t.Fatal("expected runtime error")
	}
	if !strings.Contains(err.Error(), "failed to launch") {
		t.Fatalf("expected trimmed runtime message, got %q", err.Error())
	}
}

func testStringPtr(value string) *string {
	return &value
}
