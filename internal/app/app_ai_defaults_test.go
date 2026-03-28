package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	toml "github.com/pelletier/go-toml/v2"
	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/config"
	"setta/internal/externalagentconfigs"
	"setta/internal/httpapi"
	"setta/internal/llmconfig"
	"setta/internal/mcpx"
	"setta/internal/observability"
	"setta/internal/transcriptionprofiles"
)

func TestAppSeedsProjectAIDefaultsWhenConfigFilesAreMissing(t *testing.T) {
	// Fresh IDE workspaces should mirror main's seeded Project AI defaults instead
	// of booting with empty engine, profile, and LLM selections.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	seedAppEmptyProject(t, app)

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)

	var llmConfigs llmconfig.AllConfigs
	getAppAuthJSON(t, server.URL, "/api"+httpapi.RouteLLMConfig, authCookie, &llmConfigs)
	if llmConfigs.DefaultConfigID != "claude-sonnet" {
		t.Fatalf("expected seeded default llm config, got %#v", llmConfigs)
	}
	if _, ok := llmConfigs.Configs["claude-sonnet"]; !ok {
		t.Fatalf("expected claude-sonnet llm config, got %#v", llmConfigs.Configs)
	}
	if _, ok := llmConfigs.Configs["openai-whisper-1"]; !ok {
		t.Fatalf("expected openai-whisper-1 llm config, got %#v", llmConfigs.Configs)
	}

	var engineConfigs []agentruns.EngineConfig
	getAppAuthJSON(t, server.URL, "/api"+httpapi.RouteGetEngineConfigs, authCookie, &engineConfigs)
	if got := engineConfigIDs(engineConfigs); !reflect.DeepEqual(got, []string{
		"engine-setta-claude-sonnet",
		"engine-claude-code",
		"engine-codex",
		"engine-opencode",
	}) {
		t.Fatalf("unexpected seeded engine configs %#v", got)
	}

	var externalConfigs []externalagentconfigs.Config
	getAppAuthJSON(t, server.URL, "/api"+httpapi.RouteGetExternalAgentConfigs, authCookie, &externalConfigs)
	if got := externalConfigIDs(externalConfigs); !reflect.DeepEqual(got, []string{
		"external-claude-code",
		"external-codex",
		"external-opencode",
	}) {
		t.Fatalf("unexpected seeded external agent configs %#v", got)
	}

	var agentProfiles []agentprofiles.Profile
	getAppAuthJSON(t, server.URL, "/api"+httpapi.RouteGetAgentProfiles, authCookie, &agentProfiles)
	if got := agentProfileIDs(agentProfiles); !reflect.DeepEqual(got, []string{
		"agent-default",
		"agent-claude-code",
		"agent-codex",
		"agent-opencode",
	}) {
		t.Fatalf("unexpected seeded agent profiles %#v", got)
	}

	var transcriptionProfilesPayload []transcriptionprofiles.Profile
	getAppAuthJSON(t, server.URL, "/api"+httpapi.RouteGetTranscriptionProfiles, authCookie, &transcriptionProfilesPayload)
	if got := transcriptionProfileIDs(transcriptionProfilesPayload); !reflect.DeepEqual(got, []string{
		"transcription-openai-whisper-1",
	}) {
		t.Fatalf("unexpected seeded transcription profiles %#v", got)
	}
	if transcriptionProfilesPayload[0].TranscriptionLLMConfigID != "openai-whisper-1" {
		t.Fatalf("expected seeded transcription profile to point at openai-whisper-1, got %#v", transcriptionProfilesPayload[0])
	}

	for _, relativePath := range []string{
		"engine_configs.json",
		"external_agents.json",
		"agent_profiles.json",
		"transcription_profiles.json",
	} {
		if _, err := os.Stat(filepath.Join(cfg.Paths.SettaFilesRoot, relativePath)); err != nil {
			t.Fatalf("expected seeded file %s: %v", relativePath, err)
		}
	}
}

func TestAppRepairsLegacyCodexManagedConfigTransportOnStartup(t *testing.T) {
	// Existing workspaces may already have a legacy Codex canonical config that
	// omits the transport field, which makes Codex infer streamable_http. App
	// startup should rewrite managed canonical configs back to the Setta SSE
	// transport so sends do not pay the remote auth-discovery penalty.
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	store, err := externalagentconfigs.NewStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("new external agent config store: %v", err)
	}
	service, err := externalagentconfigs.NewService(externalagentconfigs.ServiceOptions{
		Configs:        store,
		SettaFilesRoot: cfg.Paths.SettaFilesRoot,
		WorkspaceRoot:  cfg.Paths.WorkspaceRoot,
		SettaServerURL: "http://127.0.0.1:8000/mcp",
	})
	if err != nil {
		t.Fatalf("new external agent config service: %v", err)
	}
	created, err := service.Create(externalagentconfigs.Config{
		ID:                 "external-codex",
		Name:               "Codex (app-server)",
		ToolType:           externalagentconfigs.ToolTypeCodex,
		RunMode:            externalagentconfigs.RunModeAppServer,
		WorkingDirStrategy: externalagentconfigs.WorkingDirStrategyProjectRoot,
		EnvVarWhitelist:    []string{"OPENAI_API_KEY"},
	})
	if err != nil {
		t.Fatalf("create codex config: %v", err)
	}

	configPath := filepath.Join(
		cfg.Paths.SettaFilesRoot,
		"external_agent_settings",
		"codex",
		created.ID,
		"config.toml",
	)
	if err := os.WriteFile(configPath, []byte("[mcp_servers.setta]\nurl = \"http://127.0.0.1:8000/mcp\"\n"), 0o644); err != nil {
		t.Fatalf("write legacy codex canonical config: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	content, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read reconciled codex config: %v", err)
	}
	payload := map[string]any{}
	if err := toml.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode reconciled codex config: %v", err)
	}
	expectedURL := mcpx.BuildSettaServerURL(cfg.Server.Host, cfg.Server.Port)
	mcpServers, ok := payload["mcp_servers"].(map[string]any)
	if !ok {
		t.Fatalf("expected mcp_servers map, got %#v", payload["mcp_servers"])
	}
	settaServer, ok := mcpServers["setta"].(map[string]any)
	if !ok || settaServer["transport"] != "sse" || settaServer["url"] != expectedURL {
		t.Fatalf("expected reconciled setta codex server entry, got %#v", mcpServers["setta"])
	}
}

func getAppAuthJSON(t *testing.T, serverURL string, path string, authCookie *http.Cookie, target any) {
	t.Helper()

	request, err := http.NewRequest(http.MethodGet, serverURL+path, nil)
	if err != nil {
		t.Fatalf("new request %s: %v", path, err)
	}
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("get %s: %v", path, err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("expected %s 200, got %d with body %q", path, response.StatusCode, string(payload))
	}
	if err := json.NewDecoder(response.Body).Decode(target); err != nil {
		t.Fatalf("decode %s response: %v", path, err)
	}
}

func engineConfigIDs(configs []agentruns.EngineConfig) []string {
	ids := make([]string, 0, len(configs))
	for _, config := range configs {
		ids = append(ids, config.ID)
	}
	return ids
}

func externalConfigIDs(configs []externalagentconfigs.Config) []string {
	ids := make([]string, 0, len(configs))
	for _, config := range configs {
		ids = append(ids, config.ID)
	}
	return ids
}

func agentProfileIDs(profiles []agentprofiles.Profile) []string {
	ids := make([]string, 0, len(profiles))
	for _, profile := range profiles {
		ids = append(ids, profile.ID)
	}
	return ids
}

func transcriptionProfileIDs(profiles []transcriptionprofiles.Profile) []string {
	ids := make([]string, 0, len(profiles))
	for _, profile := range profiles {
		ids = append(ids, profile.ID)
	}
	return ids
}
