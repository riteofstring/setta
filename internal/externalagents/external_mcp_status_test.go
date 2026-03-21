package externalagents

import (
	"testing"
	"time"

	"setta/internal/agentruns"
	"setta/internal/mcpx"
)

func TestBuildClaudeMCPStatusesIgnoresNonMCPPayloads(t *testing.T) {
	t.Parallel()

	now := func() time.Time { return time.Date(2026, 3, 20, 11, 0, 0, 0, time.UTC) }
	cases := []struct {
		name    string
		payload any
	}{
		{
			name: "non_mcp_error_event",
			payload: map[string]any{
				"type": "system_message",
				"message": map[string]any{
					"id":    "evt-123",
					"error": "initialization failed",
				},
			},
		},
		{
			name: "non_mcp_nested_dict_map",
			payload: map[string]any{
				"type": "system_message",
				"message": map[string]any{
					"result": map[string]any{
						"auth": map[string]any{
							"error": "token missing",
						},
					},
				},
			},
		},
		{
			name: "generic_servers_container",
			payload: map[string]any{
				"message": map[string]any{
					"servers": []any{
						map[string]any{"id": "api-east-1", "status": "online"},
					},
				},
			},
		},
		{
			name: "generic_items_container",
			payload: map[string]any{
				"message": map[string]any{
					"items": []any{
						map[string]any{"id": "evt-1", "status": "failed", "error": "tool crashed"},
					},
				},
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			statuses := buildClaudeMCPStatuses(tc.payload, now)
			if len(statuses) != 0 {
				t.Fatalf("expected no MCP statuses, got %#v", statuses)
			}
		})
	}
}

func TestBuildClaudeMCPStatusesUsesIDFallbackForMCPContainers(t *testing.T) {
	t.Parallel()

	now := func() time.Time { return time.Date(2026, 3, 20, 11, 5, 0, 0, time.UTC) }
	cases := []struct {
		name    string
		payload any
	}{
		{
			name: "list_container",
			payload: map[string]any{
				"message": map[string]any{
					"mcp_servers": []any{
						map[string]any{
							"id":     "filesystem",
							"status": "failed",
							"error":  "spawn failed",
						},
					},
				},
			},
		},
		{
			name: "single_object_container",
			payload: map[string]any{
				"message": map[string]any{
					"mcp_servers": map[string]any{
						"id":     "filesystem",
						"status": "failed",
						"error":  "spawn failed",
					},
				},
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			statuses := buildClaudeMCPStatuses(tc.payload, now)
			if len(statuses) != 1 {
				t.Fatalf("expected one MCP status, got %#v", statuses)
			}
			if statuses[0].ServerID != "filesystem" {
				t.Fatalf("unexpected server id %#v", statuses[0])
			}
			if statuses[0].State != mcpx.RuntimeStateError {
				t.Fatalf("expected error status, got %#v", statuses[0])
			}
			if statuses[0].LastError == nil || *statuses[0].LastError != "spawn failed" {
				t.Fatalf("expected last error to persist, got %#v", statuses[0])
			}
		})
	}
}

func TestResolveExternalRuntimeStatePrefersDisabledAndKeepsMessageOnlyUnknown(t *testing.T) {
	t.Parallel()

	if got := resolveExternalRuntimeState(map[string]any{
		"connected": false,
		"status":    "disabled",
	}); got != mcpx.RuntimeStateDisabled {
		t.Fatalf("expected disabled runtime state, got %q", got)
	}

	if got := resolveExternalRuntimeState(map[string]any{
		"connected": false,
		"message":   "waiting for handshake",
	}); got != mcpx.RuntimeStateUnknown {
		t.Fatalf("expected message-only status to remain unknown, got %q", got)
	}
}

func TestBuildClaudeMCPStatusesPreservesMessageOnlyUnknownAndNestedErrorObject(t *testing.T) {
	t.Parallel()

	now := func() time.Time { return time.Date(2026, 3, 20, 11, 10, 0, 0, time.UTC) }

	unknownStatuses := buildClaudeMCPStatuses(map[string]any{
		"message": map[string]any{
			"mcp_servers": []any{
				map[string]any{
					"serverId":  "filesystem",
					"connected": false,
					"message":   "waiting for handshake",
					"transport": "stdio",
					"command":   "npx @modelcontextprotocol/server-filesystem .",
				},
			},
		},
	}, now)
	if len(unknownStatuses) != 1 {
		t.Fatalf("expected one unknown status row, got %#v", unknownStatuses)
	}
	if unknownStatuses[0].State != mcpx.RuntimeStateUnknown || unknownStatuses[0].LastError != nil {
		t.Fatalf("expected message-only row to remain unknown, got %#v", unknownStatuses[0])
	}

	errorStatuses := buildClaudeMCPStatuses(map[string]any{
		"message": map[string]any{
			"mcp_servers": []any{
				map[string]any{
					"serverId":  "filesystem",
					"connected": false,
					"error":     map[string]any{"message": "spawn failed"},
				},
			},
		},
	}, now)
	if len(errorStatuses) != 1 {
		t.Fatalf("expected one error status row, got %#v", errorStatuses)
	}
	if errorStatuses[0].State != mcpx.RuntimeStateError {
		t.Fatalf("expected nested error row to become error, got %#v", errorStatuses[0])
	}
	if errorStatuses[0].LastError == nil || *errorStatuses[0].LastError != "spawn failed" {
		t.Fatalf("expected nested error message to persist, got %#v", errorStatuses[0])
	}
}

func TestBuildOpenCodeMCPStatusesIgnoresEmptyNonMCPPayload(t *testing.T) {
	t.Parallel()

	statuses := buildOpenCodeMCPStatuses(map[string]any{
		"type": "system_message",
		"message": map[string]any{
			"status": "ok",
		},
	}, func() time.Time { return time.Date(2026, 3, 20, 11, 15, 0, 0, time.UTC) })
	if len(statuses) != 0 {
		t.Fatalf("expected empty payload to stay empty, got %#v", statuses)
	}
}

func TestRuntimeExternalRuntimeStatusesReturnsEmptyWithoutChatOrEngine(t *testing.T) {
	t.Parallel()

	_, runtime := buildRuntimeFixture(t)
	statuses, err := runtime.ExternalRuntimeStatuses(nil, stringPtr("engine-alpha"))
	if err != nil {
		t.Fatalf("read statuses with nil chat: %v", err)
	}
	if len(statuses) != 0 {
		t.Fatalf("expected empty statuses without chat id, got %#v", statuses)
	}

	statuses, err = runtime.ExternalRuntimeStatuses(stringPtr("chat-alpha"), nil)
	if err != nil {
		t.Fatalf("read statuses with nil engine: %v", err)
	}
	if len(statuses) != 0 {
		t.Fatalf("expected empty statuses without engine id, got %#v", statuses)
	}
}

func TestRuntimeAttachMCPStatusSnapshotMutatesRunUntilExplicitSave(t *testing.T) {
	t.Parallel()

	store, runtime := buildRuntimeFixture(t)
	run := newPersistedRuntimeRun(t, store, "run-status-attach", agentruns.RunStatusRunning)
	if err := runtime.ActivateRun(run.ID, &stubRunController{}); err != nil {
		t.Fatalf("activate run: %v", err)
	}
	if err := runtime.UpsertMCPStatuses(run.ID, []mcpx.ServerRuntimeStatus{
		{
			ServerID:  "filesystem",
			Source:    externalMCPStatusSource,
			Transport: mcpx.TransportStdio,
			Endpoint:  "npx @modelcontextprotocol/server-filesystem .",
			State:     mcpx.RuntimeStateConnected,
			ToolCount: 3,
		},
	}); err != nil {
		t.Fatalf("upsert statuses: %v", err)
	}

	mutated, err := store.Load(run.ID)
	if err != nil {
		t.Fatalf("load run for mutation: %v", err)
	}
	runtime.attachMCPStatusSnapshot(&mutated)
	if _, ok := mutated.Outputs[externalMCPStatusSnapshotKey].([]any); !ok {
		t.Fatalf("expected snapshot on mutated run, got %#v", mutated.Outputs)
	}

	persistedBeforeSave, err := store.Load(run.ID)
	if err != nil {
		t.Fatalf("load persisted run before explicit save: %v", err)
	}
	if _, ok := persistedBeforeSave.Outputs[externalMCPStatusSnapshotKey]; ok {
		t.Fatalf("expected no persisted snapshot before explicit save, got %#v", persistedBeforeSave.Outputs)
	}

	if err := store.Save(mutated); err != nil {
		t.Fatalf("save mutated run: %v", err)
	}
	persistedAfterSave, err := store.Load(run.ID)
	if err != nil {
		t.Fatalf("load persisted run after save: %v", err)
	}
	if _, ok := persistedAfterSave.Outputs[externalMCPStatusSnapshotKey].([]any); !ok {
		t.Fatalf("expected snapshot after explicit save, got %#v", persistedAfterSave.Outputs)
	}
}

func TestLoadExternalMCPStatusSnapshotIgnoresInvalidRows(t *testing.T) {
	t.Parallel()

	statuses := loadExternalMCPStatusSnapshot(map[string]any{
		externalMCPStatusSnapshotKey: []any{
			map[string]any{
				"serverId":  "filesystem",
				"source":    externalMCPStatusSource,
				"transport": "stdio",
				"endpoint":  "npx @modelcontextprotocol/server-filesystem .",
				"state":     "connected",
				"toolCount": 3,
			},
			map[string]any{"serverId": 123},
			map[string]any{"state": "connected"},
		},
	})
	if len(statuses) != 1 {
		t.Fatalf("expected one valid persisted status row, got %#v", statuses)
	}
	if statuses[0].ServerID != "filesystem" || statuses[0].State != mcpx.RuntimeStateConnected || statuses[0].ToolCount != 3 {
		t.Fatalf("unexpected filtered persisted status %#v", statuses[0])
	}
}
