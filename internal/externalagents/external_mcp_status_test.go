package externalagents

import (
	"os"
	"path/filepath"
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
			name: "non_mcp_system_message",
			payload: map[string]any{
				"type": "system_message",
				"message": map[string]any{
					"type": "init",
					"id":   "bootstrap-event",
				},
			},
		},
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

func TestBuildUnknownCodexMCPStatusesReadsRuntimeConfigTransport(t *testing.T) {
	t.Parallel()

	configPath := filepath.Join(t.TempDir(), "config.toml")
	content := `
[mcp_servers.setta]
transport = "streamable_http"
url = "http://127.0.0.1:8019/mcp"
enabled_tools = ["list_mcp_tools", "search_mcp_tools"]
`
	if err := os.WriteFile(configPath, []byte(content), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	statuses := buildUnknownCodexMCPStatuses(configPath)
	if len(statuses) != 1 {
		t.Fatalf("expected one codex MCP status, got %#v", statuses)
	}
	if statuses[0].ServerID != "setta" {
		t.Fatalf("unexpected codex server id %#v", statuses[0])
	}
	if statuses[0].State != mcpx.RuntimeStateUnknown {
		t.Fatalf("expected codex runtime state unknown, got %#v", statuses[0])
	}
	if statuses[0].Transport != mcpx.TransportStreamableHTTP {
		t.Fatalf("expected codex transport streamable_http, got %#v", statuses[0])
	}
	if statuses[0].Endpoint != "http://127.0.0.1:8019/mcp" {
		t.Fatalf("expected codex endpoint to persist, got %#v", statuses[0])
	}
	if statuses[0].ToolCount != 2 {
		t.Fatalf("expected codex tool count 2 from enabled_tools, got %#v", statuses[0])
	}
}

func TestBuildClaudeMCPStatusesCapturesRawPayloadStatusBranches(t *testing.T) {
	t.Parallel()

	now := func() time.Time { return time.Date(2026, 3, 20, 11, 7, 0, 0, time.UTC) }

	failedStatuses := buildClaudeMCPStatuses(map[string]any{
		"type": "system_message",
		"message": map[string]any{
			"mcp_servers": []any{
				map[string]any{
					"serverId":  "filesystem",
					"status":    "failed",
					"transport": "stdio",
					"command":   "npx @modelcontextprotocol/server-filesystem .",
					"error":     "spawn failed",
				},
			},
		},
	}, now)
	if len(failedStatuses) != 1 {
		t.Fatalf("expected one failed status row, got %#v", failedStatuses)
	}
	if failedStatuses[0].ServerID != "filesystem" {
		t.Fatalf("unexpected failed status row %#v", failedStatuses[0])
	}
	if failedStatuses[0].State != mcpx.RuntimeStateError {
		t.Fatalf("expected failed status row to become error, got %#v", failedStatuses[0])
	}
	if failedStatuses[0].Endpoint != "npx @modelcontextprotocol/server-filesystem ." {
		t.Fatalf("expected failed status endpoint to preserve command, got %#v", failedStatuses[0])
	}
	if failedStatuses[0].LastError == nil || *failedStatuses[0].LastError != "spawn failed" {
		t.Fatalf("expected failed status last error to persist, got %#v", failedStatuses[0])
	}

	disabledStatuses := buildClaudeMCPStatuses(map[string]any{
		"type": "system_message",
		"message": map[string]any{
			"mcp_servers": []any{
				map[string]any{
					"serverId":  "filesystem",
					"connected": false,
					"status":    "disabled",
					"transport": "stdio",
					"command":   "npx @modelcontextprotocol/server-filesystem .",
				},
			},
		},
	}, now)
	if len(disabledStatuses) != 1 {
		t.Fatalf("expected one disabled status row, got %#v", disabledStatuses)
	}
	if disabledStatuses[0].ServerID != "filesystem" {
		t.Fatalf("unexpected disabled status row %#v", disabledStatuses[0])
	}
	if disabledStatuses[0].State != mcpx.RuntimeStateDisabled {
		t.Fatalf("expected disabled status row to stay disabled, got %#v", disabledStatuses[0])
	}
	if disabledStatuses[0].Endpoint != "npx @modelcontextprotocol/server-filesystem ." {
		t.Fatalf("expected disabled status endpoint to preserve command, got %#v", disabledStatuses[0])
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

func TestBuildCodexMCPStatusesCapturesGenericServersContainer(t *testing.T) {
	t.Parallel()

	statuses := buildCodexMCPStatuses(map[string]any{
		"id": 42,
		"result": map[string]any{
			"servers": []any{
				map[string]any{
					"id":        "setta",
					"connected": true,
					"transport": "streamable_http",
					"endpoint":  "http://127.0.0.1:8000/mcp",
					"toolCount": 8,
				},
			},
		},
	}, func() time.Time { return time.Date(2026, 3, 20, 11, 20, 0, 0, time.UTC) })
	if len(statuses) != 1 {
		t.Fatalf("expected one codex status row, got %#v", statuses)
	}
	if statuses[0].ServerID != "setta" {
		t.Fatalf("unexpected codex server id %#v", statuses[0])
	}
	if statuses[0].State != mcpx.RuntimeStateConnected {
		t.Fatalf("expected codex runtime state connected, got %#v", statuses[0])
	}
	if statuses[0].Transport != mcpx.TransportStreamableHTTP {
		t.Fatalf("expected codex transport streamable_http, got %#v", statuses[0])
	}
	if statuses[0].Endpoint != "http://127.0.0.1:8000/mcp" {
		t.Fatalf("expected codex endpoint to persist, got %#v", statuses[0])
	}
	if statuses[0].ToolCount != 8 {
		t.Fatalf("expected codex tool count to persist, got %#v", statuses[0])
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

func TestRuntimeExternalRuntimeStatusesFallsBackToLatestEngineRunWithoutChatID(t *testing.T) {
	t.Parallel()

	store, runtime := buildRuntimeFixture(t)
	olderRun := agentruns.NewRun(nil, map[string]any{
		"runType":         RunTypeExternalAgent,
		"chatId":          "chat-older",
		"projectConfigId": "project-alpha",
		"engineConfigId":  "engine-codex",
		"messages":        []any{},
	}, time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC))
	olderRun.ID = "run-codex-older"
	if err := store.Save(olderRun); err != nil {
		t.Fatalf("save older run: %v", err)
	}
	if err := runtime.ActivateRun(olderRun.ID, &stubRunController{}); err != nil {
		t.Fatalf("activate older run: %v", err)
	}
	if err := runtime.UpsertMCPStatuses(olderRun.ID, []mcpx.ServerRuntimeStatus{
		{
			ServerID:  "setta",
			Source:    externalMCPStatusSource,
			Transport: mcpx.TransportSSE,
			Endpoint:  "http://127.0.0.1:8019/mcp",
			State:     mcpx.RuntimeStateConnected,
			ToolCount: 3,
		},
	}); err != nil {
		t.Fatalf("upsert older run statuses: %v", err)
	}

	newerRun := agentruns.NewRun(nil, map[string]any{
		"runType":         RunTypeExternalAgent,
		"chatId":          "chat-newer",
		"projectConfigId": "project-alpha",
		"engineConfigId":  "engine-codex",
		"messages":        []any{},
	}, time.Date(2026, 3, 8, 12, 5, 0, 0, time.UTC))
	newerRun.ID = "run-codex-newer"
	if err := store.Save(newerRun); err != nil {
		t.Fatalf("save newer run: %v", err)
	}
	if err := runtime.ActivateRun(newerRun.ID, &stubRunController{}); err != nil {
		t.Fatalf("activate newer run: %v", err)
	}
	updatedAt := time.Date(2026, 3, 8, 12, 6, 0, 0, time.UTC)
	if err := runtime.UpsertMCPStatuses(newerRun.ID, []mcpx.ServerRuntimeStatus{
		{
			ServerID:        "setta",
			Source:          externalMCPStatusSource,
			Transport:       mcpx.TransportStreamableHTTP,
			Endpoint:        "http://127.0.0.1:8019/mcp",
			State:           mcpx.RuntimeStateConnected,
			LastAttemptAt:   &updatedAt,
			LastConnectedAt: &updatedAt,
			ToolCount:       8,
		},
	}); err != nil {
		t.Fatalf("upsert newer run statuses: %v", err)
	}

	statuses, err := runtime.ExternalRuntimeStatuses(nil, stringPtr("engine-codex"))
	if err != nil {
		t.Fatalf("read statuses without chat id: %v", err)
	}
	if len(statuses) != 1 {
		t.Fatalf("expected one status from latest engine run, got %#v", statuses)
	}
	if statuses[0].Transport != mcpx.TransportStreamableHTTP {
		t.Fatalf("expected latest engine transport streamable_http, got %#v", statuses[0])
	}
	if statuses[0].ToolCount != 8 {
		t.Fatalf("expected latest engine tool count 8, got %#v", statuses[0])
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
