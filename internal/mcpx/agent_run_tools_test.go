package mcpx

import (
	"context"
	"testing"
	"time"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/llmconfig"
)

type recordingAgentRunExecutor struct {
	result agentruns.ExecutionResult
	err    error
	calls  int
}

func (e *recordingAgentRunExecutor) Execute(_ context.Context, _ agentruns.ExecutionRequest) (agentruns.ExecutionResult, error) {
	e.calls++
	return e.result, e.err
}

func TestServerRunAgentProfile(t *testing.T) {
	t.Parallel()

	t.Run("runs stored profile to completion", func(t *testing.T) {
		profileStore, service, executor := newScopedTestRunAgentProfileFixture(t, true)
		engineConfigID := "engine-primary"
		if err := profileStore.Write([]agentprofiles.Profile{
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

		projectRuntime := openScopedTestProjectRuntime(t)
		_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
			WorkspaceRoot:  t.TempDir(),
			ProjectState:   projectRuntime,
			LSPDiagnostics: openScopedTestLSPDiagnosticsRegistry(),
			AgentProfiles:  profileStore,
			AgentRuns:      service,
		})
		defer clientSession.Close()

		result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
			Name: "run_agent_profile",
			Arguments: map[string]any{
				"profileId": "profile-alpha",
				"inputs": map[string]any{
					"prompt":        "hello",
					"allowUnscoped": true,
				},
			},
		})
		if err != nil {
			t.Fatalf("call run_agent_profile: %v", err)
		}
		if result.IsError {
			t.Fatalf("expected run_agent_profile success, got %#v", result.StructuredContent)
		}
		run := mustStructuredMap(t, result.StructuredContent)
		if run["status"] != string(agentruns.RunStatusCompleted) {
			t.Fatalf("expected completed agent run, got %#v", run["status"])
		}
		if run["profileId"] != "profile-alpha" {
			t.Fatalf("expected profile-alpha profile id, got %#v", run["profileId"])
		}
		events := mustStructuredList(t, run["events"])
		if len(events) != 3 {
			t.Fatalf("expected three persisted lifecycle events, got %#v", events)
		}
		if executor.calls != 1 {
			t.Fatalf("expected one executor call, got %d", executor.calls)
		}
	})

	t.Run("missing profile returns invalid arguments", func(t *testing.T) {
		profileStore, service, _ := newScopedTestRunAgentProfileFixture(t, true)

		projectRuntime := openScopedTestProjectRuntime(t)
		_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
			WorkspaceRoot:  t.TempDir(),
			ProjectState:   projectRuntime,
			LSPDiagnostics: openScopedTestLSPDiagnosticsRegistry(),
			AgentProfiles:  profileStore,
			AgentRuns:      service,
		})
		defer clientSession.Close()

		result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
			Name: "run_agent_profile",
			Arguments: map[string]any{
				"profileId": "missing-profile",
				"inputs": map[string]any{
					"allowUnscoped": true,
				},
			},
		})
		if err != nil {
			t.Fatalf("call missing run_agent_profile: %v", err)
		}
		if !result.IsError {
			t.Fatal("expected missing run_agent_profile to fail")
		}
		payload := mustStructuredMap(t, result.StructuredContent)
		if payload["code"] != "invalid_arguments" {
			t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
		}
	})

	t.Run("disabled service returns runtime unavailable", func(t *testing.T) {
		profileStore, service, _ := newScopedTestRunAgentProfileFixture(t, false)
		engineConfigID := "engine-primary"
		if err := profileStore.Write([]agentprofiles.Profile{
			{
				ID:             "profile-alpha",
				Name:           "Alpha",
				SystemPrompt:   "Plan the task.",
				EngineConfigID: &engineConfigID,
				ToolAllowlist:  []string{},
			},
		}); err != nil {
			t.Fatalf("seed agent profiles: %v", err)
		}

		projectRuntime := openScopedTestProjectRuntime(t)
		_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
			WorkspaceRoot:  t.TempDir(),
			ProjectState:   projectRuntime,
			LSPDiagnostics: openScopedTestLSPDiagnosticsRegistry(),
			AgentProfiles:  profileStore,
			AgentRuns:      service,
		})
		defer clientSession.Close()

		result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
			Name: "run_agent_profile",
			Arguments: map[string]any{
				"profileId": "profile-alpha",
				"inputs": map[string]any{
					"allowUnscoped": true,
				},
			},
		})
		if err != nil {
			t.Fatalf("call disabled run_agent_profile: %v", err)
		}
		if !result.IsError {
			t.Fatal("expected disabled run_agent_profile to fail")
		}
		payload := mustStructuredMap(t, result.StructuredContent)
		if payload["code"] != "internal_error" {
			t.Fatalf("expected internal_error code, got %#v", payload["code"])
		}
		if payload["message"] != "Agent runner is not available" {
			t.Fatalf("expected disabled message, got %#v", payload["message"])
		}
	})
}

func newScopedTestRunAgentProfileFixture(t *testing.T, withExecutor bool) (*agentprofiles.Store, *agentruns.Service, *recordingAgentRunExecutor) {
	t.Helper()

	root := t.TempDir()
	profileStore, err := agentprofiles.NewStore(root)
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
			SettaLLMConfigID: stringPointer("primary"),
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

	projectRuntime := openScopedTestProjectRuntime(t)
	var executor *recordingAgentRunExecutor
	var serviceExecutor agentruns.Executor
	if withExecutor {
		executor = &recordingAgentRunExecutor{}
		serviceExecutor = executor
	}
	service, err := agentruns.NewService(agentruns.ServiceOptions{
		ProjectState: projectRuntime,
		Engines:      engineStore,
		Runs:         runStore,
		LLM:          llmRuntime,
		Executor:     serviceExecutor,
		TimeNow: func() time.Time {
			return time.Date(2026, 3, 8, 14, 0, 0, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatalf("new agent run service: %v", err)
	}
	return profileStore, service, executor
}

func stringPointer(value string) *string {
	return &value
}
