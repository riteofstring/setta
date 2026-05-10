package httpapi

import (
	"testing"
	"time"

	"setta/internal/mcpx"
)

func TestResolveMCPRuntimeDisplayServersMergesSharedServerMetadata(t *testing.T) {
	t.Parallel()

	lastConnectedAt := time.Date(2026, 4, 10, 14, 30, 0, 0, time.UTC)
	lastFailureAt := time.Date(2026, 4, 10, 14, 45, 0, 0, time.UTC)
	lastError := " upstream timeout "

	resolved := resolveMCPRuntimeDisplayServers(
		[]mcpx.ServerRuntimeStatus{
			{
				ServerID:        "setta",
				Transport:       mcpx.TransportStreamableHTTP,
				Endpoint:        " http://127.0.0.1:8000/mcp ",
				State:           mcpx.RuntimeStateConnected,
				LastConnectedAt: &lastConnectedAt,
				ToolCount:       74,
			},
		},
		[]mcpx.ServerRuntimeStatus{
			{
				ServerID:            "setta",
				State:               mcpx.RuntimeStateError,
				LastFailureAt:       &lastFailureAt,
				ConsecutiveFailures: 2,
				LastError:           &lastError,
			},
		},
	)

	if len(resolved) != 1 {
		t.Fatalf("expected one resolved status, got %#v", resolved)
	}
	if resolved[0].Transport != mcpx.TransportStreamableHTTP {
		t.Fatalf("expected setta transport fallback, got %#v", resolved[0].Transport)
	}
	if resolved[0].Endpoint != "http://127.0.0.1:8000/mcp" {
		t.Fatalf("expected trimmed setta endpoint fallback, got %#v", resolved[0].Endpoint)
	}
	if resolved[0].State != mcpx.RuntimeStateError {
		t.Fatalf("expected external state precedence, got %#v", resolved[0].State)
	}
	if resolved[0].ToolCount != 74 {
		t.Fatalf("expected setta tool count fallback, got %#v", resolved[0].ToolCount)
	}
	if resolved[0].ConsecutiveFailures != 2 {
		t.Fatalf("expected external failure count, got %#v", resolved[0].ConsecutiveFailures)
	}
	if resolved[0].LastConnectedAt != nil {
		t.Fatalf("expected display-state timestamps to come from external status, got %#v", resolved[0].LastConnectedAt)
	}
	if resolved[0].LastFailureAt == nil || !resolved[0].LastFailureAt.Equal(lastFailureAt) {
		t.Fatalf("expected external failure timestamp, got %#v", resolved[0].LastFailureAt)
	}
	if resolved[0].LastError == nil || *resolved[0].LastError != "upstream timeout" {
		t.Fatalf("expected trimmed external error, got %#v", resolved[0].LastError)
	}
	if resolved[0].QuickInfo != "Error: upstream timeout | 74 tools" {
		t.Fatalf("unexpected quick info %#v", resolved[0].QuickInfo)
	}
}

func TestResolveMCPRuntimeDisplayServersSortsAndSkipsBlankIDs(t *testing.T) {
	t.Parallel()

	resolved := resolveMCPRuntimeDisplayServers(
		[]mcpx.ServerRuntimeStatus{
			{ServerID: " beta ", State: mcpx.RuntimeStateConnected},
			{ServerID: "   ", State: mcpx.RuntimeStateConnected},
		},
		[]mcpx.ServerRuntimeStatus{
			{ServerID: "alpha", State: mcpx.RuntimeStateConnected},
			{ServerID: "", State: mcpx.RuntimeStateConnected},
		},
	)

	if len(resolved) != 2 {
		t.Fatalf("expected two resolved statuses, got %#v", resolved)
	}
	if resolved[0].ServerID != "alpha" || resolved[1].ServerID != "beta" {
		t.Fatalf("expected sorted non-empty server ids, got %#v", resolved)
	}
}
