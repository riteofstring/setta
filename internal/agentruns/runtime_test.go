package agentruns

import (
	"context"
	"errors"
	"testing"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/llmconfig"
	"setta/internal/projectstate"
)

type blockingExecutor struct {
	result  ExecutionResult
	started chan struct{}
	release chan struct{}
}

type captureLiveRunTracker struct {
	activated   chan Run
	deactivated chan string
}

func (c *captureLiveRunTracker) ActivateRun(run Run) {
	if c == nil || c.activated == nil {
		return
	}
	select {
	case c.activated <- run.Clone():
	default:
	}
}

func (c *captureLiveRunTracker) DeactivateRun(runID string) {
	if c == nil || c.deactivated == nil {
		return
	}
	select {
	case c.deactivated <- runID:
	default:
	}
}

func (e *blockingExecutor) Execute(ctx context.Context, _ ExecutionRequest) (ExecutionResult, error) {
	if e.started != nil {
		select {
		case e.started <- struct{}{}:
		default:
		}
	}
	if e.release == nil {
		return e.result, nil
	}
	select {
	case <-e.release:
		return e.result, nil
	case <-ctx.Done():
		return e.result, ctx.Err()
	}
}

func TestRuntimeStartRunReturnsRunningAndCompletes(t *testing.T) {
	t.Parallel()

	service, executor, _, _ := buildServiceFixture(t, nil)
	runtime, err := NewRuntime(RuntimeOptions{Service: service})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}
	executor.result = ExecutionResult{
		Outputs: map[string]any{
			"messages": []any{},
		},
	}
	profile := agentprofiles.Profile{
		ID:             "profile-alpha",
		Name:           "Alpha",
		EngineConfigID: stringPtr("engine-primary"),
	}

	run, err := runtime.StartRun(profile, map[string]any{
		"prompt":        "hello",
		"allowUnscoped": true,
	})
	if err != nil {
		t.Fatalf("start run: %v", err)
	}
	if run.Status != RunStatusRunning {
		t.Fatalf("expected running run, got %q", run.Status)
	}

	waitCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	completed, err := runtime.WaitForRun(waitCtx, run.ID)
	if err != nil {
		t.Fatalf("wait for run: %v", err)
	}
	if completed.Status != RunStatusCompleted {
		t.Fatalf("expected completed run, got %q", completed.Status)
	}
}

func TestRuntimeStartRunActivatesAndClearsLiveTracker(t *testing.T) {
	t.Parallel()

	executor := &blockingExecutor{
		result: ExecutionResult{
			Outputs: map[string]any{"messages": []any{}},
		},
	}
	service, _, _, _ := buildServiceFixture(t, nil)
	service.executor = executor
	tracker := &captureLiveRunTracker{
		activated:   make(chan Run, 1),
		deactivated: make(chan string, 1),
	}
	runtime, err := NewRuntime(RuntimeOptions{
		Service:        service,
		LiveRunTracker: tracker,
	})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}

	run, err := runtime.StartRun(agentprofiles.Profile{
		ID:             "profile-alpha",
		Name:           "Alpha",
		EngineConfigID: stringPtr("engine-primary"),
	}, map[string]any{
		"allowUnscoped": true,
	})
	if err != nil {
		t.Fatalf("start run: %v", err)
	}

	select {
	case activated := <-tracker.activated:
		if activated.ID != run.ID {
			t.Fatalf("expected activated run %q, got %q", run.ID, activated.ID)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for live tracker activation")
	}

	waitCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if _, err := runtime.WaitForRun(waitCtx, run.ID); err != nil {
		t.Fatalf("wait for run: %v", err)
	}

	select {
	case deactivated := <-tracker.deactivated:
		if deactivated != run.ID {
			t.Fatalf("expected deactivated run %q, got %q", run.ID, deactivated)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for live tracker deactivation")
	}
}

func TestRuntimeStopRunCancelsActiveExecution(t *testing.T) {
	t.Parallel()

	executor := &blockingExecutor{
		started: make(chan struct{}, 1),
		release: make(chan struct{}),
	}
	service, runs := buildRuntimeServiceFixture(t, executor)
	runtime, err := NewRuntime(RuntimeOptions{Service: service})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}
	profile := agentprofiles.Profile{
		ID:             "profile-alpha",
		Name:           "Alpha",
		EngineConfigID: stringPtr("engine-primary"),
	}

	run, err := runtime.StartRun(profile, map[string]any{
		"allowUnscoped": true,
	})
	if err != nil {
		t.Fatalf("start run: %v", err)
	}
	select {
	case <-executor.started:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for executor start")
	}

	cancelled, err := runtime.StopRun(run.ID)
	if err != nil {
		t.Fatalf("stop run: %v", err)
	}
	if cancelled.Status != RunStatusCancelled {
		t.Fatalf("expected cancelled run, got %q", cancelled.Status)
	}

	waitCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	waited, err := runtime.WaitForRun(waitCtx, run.ID)
	if err != nil {
		t.Fatalf("wait for cancelled run: %v", err)
	}
	if waited.Status != RunStatusCancelled {
		t.Fatalf("expected cancelled terminal run, got %q", waited.Status)
	}
	loaded, err := runs.Load(run.ID)
	if err != nil {
		t.Fatalf("load cancelled run: %v", err)
	}
	if loaded.Status != RunStatusCancelled {
		t.Fatalf("expected persisted cancelled run, got %q", loaded.Status)
	}
	eventTypes := make([]string, 0, len(loaded.Events))
	for _, event := range loaded.Events {
		eventTypes = append(eventTypes, event.Type)
	}
	expected := []string{"run_started", "snapshot", "run_cancelled"}
	if len(eventTypes) != len(expected) {
		t.Fatalf("unexpected event types %#v", eventTypes)
	}
	for index, eventType := range expected {
		if eventTypes[index] != eventType {
			t.Fatalf("unexpected event types %#v", eventTypes)
		}
	}
}

func TestRuntimeStopRunPersistsPartialExecutionResultOnCancellation(t *testing.T) {
	t.Parallel()

	executor := &blockingExecutor{
		started: make(chan struct{}, 1),
		release: make(chan struct{}),
		result: ExecutionResult{
			Outputs: map[string]any{
				"messages": []any{
					map[string]any{
						"id":   "assistant-partial",
						"role": "assistant",
						"content": []any{
							map[string]any{"type": "text", "text": "Partial reply"},
						},
						"attachments": []any{},
					},
				},
				"usage": map[string]any{
					"prompt_tokens":     12,
					"completion_tokens": 1,
					"total_tokens":      13,
				},
			},
		},
	}
	service, _ := buildRuntimeServiceFixture(t, executor)
	runtime, err := NewRuntime(RuntimeOptions{Service: service})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}
	profile := agentprofiles.Profile{
		ID:             "profile-alpha",
		Name:           "Alpha",
		EngineConfigID: stringPtr("engine-primary"),
	}

	run, err := runtime.StartRun(profile, map[string]any{
		"allowUnscoped": true,
		"prompt":        "hello",
	})
	if err != nil {
		t.Fatalf("start run: %v", err)
	}
	select {
	case <-executor.started:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for executor start")
	}

	if _, err := runtime.StopRun(run.ID); err != nil {
		t.Fatalf("stop run: %v", err)
	}

	waitCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	waited, err := runtime.WaitForRun(waitCtx, run.ID)
	if err != nil {
		t.Fatalf("wait for cancelled run: %v", err)
	}
	if waited.Status != RunStatusCancelled {
		t.Fatalf("expected cancelled run, got %#v", waited)
	}
	messages, ok := waited.Outputs["messages"].([]any)
	if !ok || len(messages) != 1 {
		t.Fatalf("expected partial output messages, got %#v", waited.Outputs["messages"])
	}
	usage, ok := waited.Outputs["usage"].(map[string]any)
	if !ok || usage["total_tokens"] != float64(13) {
		t.Fatalf("expected persisted usage, got %#v", waited.Outputs["usage"])
	}
}

func TestRuntimeStartRunRejectsExternalAgentEngine(t *testing.T) {
	t.Parallel()

	service, executor, _, _ := buildServiceFixture(t, nil)
	executor.result = ExecutionResult{Outputs: map[string]any{"messages": []any{}}}
	if err := service.engines.Write([]EngineConfig{
		{
			ID:                    "engine-primary",
			Name:                  "External",
			EngineType:            EngineTypeExternalAgent,
			ExternalAgentConfigID: stringPtr("external-primary"),
		},
	}); err != nil {
		t.Fatalf("write external engine config: %v", err)
	}
	runtime, err := NewRuntime(RuntimeOptions{Service: service})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}

	_, err = runtime.StartRun(agentprofiles.Profile{
		ID:             "profile-alpha",
		Name:           "Alpha",
		EngineConfigID: stringPtr("engine-primary"),
	}, map[string]any{
		"allowUnscoped": true,
	})
	if !errors.Is(err, ErrManagedLLMEngineRequired) {
		t.Fatalf("expected managed llm engine required, got %v", err)
	}
}

func buildRuntimeServiceFixture(t *testing.T, executor Executor) (*Service, *RunStore) {
	t.Helper()

	root := t.TempDir()
	engines, err := NewEngineStore(root)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	if err := engines.Write([]EngineConfig{
		{
			ID:               "engine-primary",
			Name:             "Primary",
			EngineType:       EngineTypeSettaLLM,
			SettaLLMConfigID: stringPtr("primary"),
		},
	}); err != nil {
		t.Fatalf("write engine configs: %v", err)
	}
	runs, err := NewRunStore(root)
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
	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {ID: "project-alpha", Name: "Alpha"},
		},
	})
	if err != nil {
		t.Fatalf("open project runtime: %v", err)
	}
	service, err := NewService(ServiceOptions{
		ProjectState:           projectRuntime,
		Engines:                engines,
		Runs:                   runs,
		LLM:                    llmRuntime,
		Executor:               executor,
		TemporaryIDs:           &stubTemporaryIDs{},
		BasePrompt:             "Base prompt",
		CompletionGuardEnabled: true,
		TimeNow: func() time.Time {
			return time.Date(2026, 3, 9, 12, 0, 0, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatalf("new agent run service: %v", err)
	}
	return service, runs
}
