package httpapi

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/config"
	"setta/internal/llmconfig"
	"setta/internal/mcpx"
	"setta/internal/modes"
	"setta/internal/projectstate"
)

type routeAgentRunExecutor struct {
	result agentruns.ExecutionResult
	calls  int
}

func (e *routeAgentRunExecutor) Execute(_ context.Context, _ agentruns.ExecutionRequest) (agentruns.ExecutionResult, error) {
	e.calls++
	return e.result, nil
}

func TestMCPToolCallRouteSupportsRunAgentProfile(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	agentProfileStore, agentRunService, executor := newMCPToolRouteRunAgentProfileFixture(t, projectRuntime)
	engineConfigID := "engine-primary"
	if err := agentProfileStore.Write([]agentprofiles.Profile{
		{
			ID:             "profile-alpha",
			Name:           "Alpha",
			Description:    "Planner",
			SystemPrompt:   "Plan the task.",
			EngineConfigID: &engineConfigID,
			ToolAllowlist:  []string{},
		},
	}); err != nil {
		t.Fatalf("seed agent profiles: %v", err)
	}
	executor.result = agentruns.ExecutionResult{
		Outputs: map[string]any{
			"messages": []any{},
		},
	}

	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		SectionNames:   routeSectionNameService{runtime: projectRuntime},
		LSPDiagnostics: diagnostics,
		AgentProfiles:  agentProfileStore,
		AgentRuns:      agentRunService,
	})
	if err != nil {
		t.Fatalf("new mcp server: %v", err)
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		RegisterAuthenticatedRoot: func(r chi.Router) {
			if err := RegisterMCPRootRoutes(r, MCPRootRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeIDE),
				Server:     server,
			}); err != nil {
				panic(err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	response := postMCPToolRoute(t, handler, `{
		"tool":"run_agent_profile",
		"arguments":{
			"profileId":"profile-alpha",
			"inputs":{
				"prompt":"hello",
				"allowUnscoped":true
			}
		}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	payload := decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected run_agent_profile success, got %#v", payload.StructuredContent)
	}
	run := mustStructuredMapForRoute(t, payload.StructuredContent)
	if run["status"] != string(agentruns.RunStatusCompleted) {
		t.Fatalf("expected completed agent run, got %#v", run["status"])
	}
	if run["profileId"] != "profile-alpha" {
		t.Fatalf("expected profile-alpha profile id, got %#v", run["profileId"])
	}
	if executor.calls != 1 {
		t.Fatalf("expected one executor call, got %d", executor.calls)
	}
}

func newMCPToolRouteRunAgentProfileFixture(t *testing.T, projectRuntime *projectstate.Runtime) (*agentprofiles.Store, *agentruns.Service, *routeAgentRunExecutor) {
	t.Helper()

	root := t.TempDir()
	agentProfileStore, err := agentprofiles.NewStore(root)
	if err != nil {
		t.Fatalf("new agent profile store: %v", err)
	}
	engineStore, err := agentruns.NewEngineStore(root)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	if err := engineStore.Write([]agentruns.EngineConfig{
		{
			ID:               "engine-primary",
			Name:             "Primary",
			EngineType:       agentruns.EngineTypeSettaLLM,
			SettaLLMConfigID: routeAgentRunStringPointer("primary"),
		},
	}); err != nil {
		t.Fatalf("write engine configs: %v", err)
	}
	runStore, err := agentruns.NewRunStore(root)
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	llmRuntime, err := llmconfig.NewRuntime(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"primary": {
				ID:        "primary",
				Model:     "gpt-4o-mini",
				Provider:  "openai",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	})
	if err != nil {
		t.Fatalf("new llm runtime: %v", err)
	}
	llmRuntime.UpdateAPIKeys(map[string]string{"OPENAI_API_KEY": "secret"})
	executor := &routeAgentRunExecutor{}
	service, err := agentruns.NewService(agentruns.ServiceOptions{
		ProjectState: projectRuntime,
		Engines:      engineStore,
		Runs:         runStore,
		LLM:          llmRuntime,
		Executor:     executor,
		TimeNow: func() time.Time {
			return time.Date(2026, 3, 8, 15, 0, 0, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatalf("new agent run service: %v", err)
	}
	return agentProfileStore, service, executor
}

func routeAgentRunStringPointer(value string) *string {
	return &value
}
