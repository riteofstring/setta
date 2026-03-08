package runchains

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/llmconfig"
	"setta/internal/projectstate"
)

type recordingExecutor struct {
	results  []agentruns.ExecutionResult
	requests []agentruns.ExecutionRequest
}

func (e *recordingExecutor) Execute(_ context.Context, request agentruns.ExecutionRequest) (agentruns.ExecutionResult, error) {
	e.requests = append(e.requests, request)
	index := len(e.requests) - 1
	if index < len(e.results) {
		return e.results[index], nil
	}
	return agentruns.ExecutionResult{Outputs: map[string]any{"messages": []any{}}}, nil
}

type blockingExecutor struct {
	started chan string
	release chan struct{}
	runIDs  []string
}

func (e *blockingExecutor) Execute(ctx context.Context, request agentruns.ExecutionRequest) (agentruns.ExecutionResult, error) {
	e.runIDs = append(e.runIDs, request.Run.ID)
	if e.started != nil {
		select {
		case e.started <- request.Run.ID:
		default:
		}
	}
	if e.release == nil {
		return agentruns.ExecutionResult{Outputs: map[string]any{"messages": []any{}}}, nil
	}
	select {
	case <-e.release:
		return agentruns.ExecutionResult{Outputs: map[string]any{"messages": []any{}}}, nil
	case <-ctx.Done():
		return agentruns.ExecutionResult{}, ctx.Err()
	}
}

type testTemporaryIDs struct{}

func (testTemporaryIDs) EnsureTemporaryID(canonicalID string) (string, error) {
	return canonicalID, nil
}

func (testTemporaryIDs) Snapshot() (map[string]string, error) {
	return map[string]string{"project-alpha": "tmp-project-alpha"}, nil
}

func TestRuntimeEmptyChainCompletes(t *testing.T) {
	t.Parallel()

	runtime, _, _, _ := buildRuntimeFixture(t, &recordingExecutor{})
	run, err := runtime.StartRun(SpecInput{
		ID:    "chain-alpha",
		Name:  "Chain Alpha",
		Steps: []StepInput{},
	}, map[string]any{
		"allowUnscoped": true,
	})
	if err != nil {
		t.Fatalf("start run chain: %v", err)
	}

	waitCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	completed, err := runtime.WaitForRun(waitCtx, run.ID)
	if err != nil {
		t.Fatalf("wait for run chain: %v", err)
	}
	if completed.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed chain, got %#v", completed)
	}
	if completed.Outputs["chainId"] != "chain-alpha" {
		t.Fatalf("expected chain-alpha chain id, got %#v", completed.Outputs["chainId"])
	}
	if completed.Outputs["chainName"] != "Chain Alpha" {
		t.Fatalf("expected chain name, got %#v", completed.Outputs["chainName"])
	}
	steps, ok := completed.Outputs["steps"].([]any)
	if !ok || len(steps) != 0 {
		t.Fatalf("expected empty steps output, got %#v", completed.Outputs["steps"])
	}
	eventTypes := make([]string, 0, len(completed.Events))
	for _, event := range completed.Events {
		eventTypes = append(eventTypes, event.Type)
	}
	expected := []string{"chain_started", "snapshot", "chain_completed"}
	if len(eventTypes) != len(expected) {
		t.Fatalf("unexpected event types %#v", eventTypes)
	}
	for index, eventType := range expected {
		if eventTypes[index] != eventType {
			t.Fatalf("unexpected event types %#v", eventTypes)
		}
	}
}

func TestRuntimeManagedStepCompletionInjectsPreviousOutputs(t *testing.T) {
	t.Parallel()

	executor := &recordingExecutor{
		results: []agentruns.ExecutionResult{
			{Outputs: map[string]any{"messages": []any{}, "result": "first"}},
			{Outputs: map[string]any{"messages": []any{}, "result": "second"}},
		},
	}
	runtime, _, _, _ := buildRuntimeFixture(t, executor)

	run, err := runtime.StartRun(SpecInput{
		ID:   "chain-alpha",
		Name: "Chain Alpha",
		Steps: []StepInput{
			{
				ID:             "step-first",
				Name:           "First",
				EngineConfigID: "engine-primary",
				Prompt:         stringPtr("first"),
			},
			{
				ID:             "step-second",
				Name:           "Second",
				EngineConfigID: "engine-primary",
				Prompt:         stringPtr("second"),
				Messages: []map[string]any{
					{
						"role": "user",
						"content": []any{
							map[string]any{"type": "text", "text": "Second prompt"},
						},
					},
				},
			},
		},
	}, map[string]any{})
	if err != nil {
		t.Fatalf("start run chain: %v", err)
	}

	waitCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	completed, err := runtime.WaitForRun(waitCtx, run.ID)
	if err != nil {
		t.Fatalf("wait for run chain: %v", err)
	}
	if completed.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed chain, got %#v", completed)
	}
	if len(executor.requests) != 2 {
		t.Fatalf("expected two executor requests, got %d", len(executor.requests))
	}
	secondInputs := executor.requests[1].Inputs
	if secondInputs["allowUnscoped"] != true {
		t.Fatalf("expected allowUnscoped=true in second step inputs, got %#v", secondInputs["allowUnscoped"])
	}
	if _, ok := secondInputs["previousOutputs"].([]any); !ok {
		t.Fatalf("expected previousOutputs list, got %#v", secondInputs["previousOutputs"])
	}
	rawMessages, ok := secondInputs["messages"].([]any)
	if !ok || len(rawMessages) < 2 {
		t.Fatalf("expected prepended context message plus explicit message, got %#v", secondInputs["messages"])
	}
	firstMessage, ok := rawMessages[0].(map[string]any)
	if !ok {
		t.Fatalf("expected first message object, got %#v", rawMessages[0])
	}
	if firstMessage["role"] != "user" {
		t.Fatalf("expected prepended user message, got %#v", firstMessage)
	}
	content, ok := firstMessage["content"].([]any)
	if !ok || len(content) != 1 {
		t.Fatalf("expected prepended text content, got %#v", firstMessage["content"])
	}
	textPart, ok := content[0].(map[string]any)
	if !ok {
		t.Fatalf("expected prepended text part, got %#v", content[0])
	}
	text, _ := textPart["text"].(string)
	if !strings.HasPrefix(text, "Previous step outputs:\n") {
		t.Fatalf("expected previous outputs prefix, got %#v", text)
	}
	steps, ok := completed.Outputs["steps"].([]any)
	if !ok || len(steps) != 2 {
		t.Fatalf("expected two step summaries, got %#v", completed.Outputs["steps"])
	}
}

func TestRuntimeStopRunCancelsActiveManagedStep(t *testing.T) {
	t.Parallel()

	executor := &blockingExecutor{
		started: make(chan string, 1),
		release: make(chan struct{}),
	}
	runtime, runs, _, _ := buildRuntimeFixture(t, executor)

	run, err := runtime.StartRun(SpecInput{
		ID:   "chain-alpha",
		Name: "Chain Alpha",
		Steps: []StepInput{
			{
				ID:             "step-alpha",
				Name:           "Step Alpha",
				EngineConfigID: "engine-primary",
				Prompt:         stringPtr("hello"),
			},
		},
	}, map[string]any{})
	if err != nil {
		t.Fatalf("start run chain: %v", err)
	}
	var childRunID string
	select {
	case childRunID = <-executor.started:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for child run start")
	}

	cancelled, err := runtime.StopRun(run.ID)
	if err != nil {
		t.Fatalf("stop run chain: %v", err)
	}
	if cancelled.Status != agentruns.RunStatusCancelled {
		t.Fatalf("expected cancelled chain, got %#v", cancelled)
	}

	waitCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	waited, err := runtime.WaitForRun(waitCtx, run.ID)
	if err != nil {
		t.Fatalf("wait for cancelled run chain: %v", err)
	}
	if waited.Status != agentruns.RunStatusCancelled {
		t.Fatalf("expected cancelled terminal chain, got %#v", waited)
	}
	childRun, err := runs.Load(childRunID)
	if err != nil {
		t.Fatalf("load child run: %v", err)
	}
	if childRun.Status != agentruns.RunStatusCancelled {
		t.Fatalf("expected cancelled child run, got %#v", childRun)
	}
}

func TestRuntimeRejectsExternalAgentStep(t *testing.T) {
	t.Parallel()

	runtime, _, engines, _ := buildRuntimeFixture(t, &recordingExecutor{})
	if err := engines.Write([]agentruns.EngineConfig{
		{
			ID:               "engine-primary",
			Name:             "Primary",
			EngineType:       agentruns.EngineTypeSettaLLM,
			SettaLLMConfigID: stringPtr("primary"),
		},
		{
			ID:                    "engine-external",
			Name:                  "External",
			EngineType:            agentruns.EngineTypeExternalAgent,
			ExternalAgentConfigID: stringPtr("external-primary"),
		},
	}); err != nil {
		t.Fatalf("write engine configs: %v", err)
	}

	_, err := runtime.StartRun(SpecInput{
		ID:   "chain-alpha",
		Name: "Chain Alpha",
		Steps: []StepInput{
			{
				ID:             "step-alpha",
				Name:           "Step Alpha",
				EngineConfigID: "engine-external",
			},
		},
	}, map[string]any{})
	if !errors.Is(err, ErrManagedStepEngineRequired) {
		t.Fatalf("expected managed step engine required, got %v", err)
	}
}

func TestRuntimeRejectsMismatchedStepEngineConfigInput(t *testing.T) {
	t.Parallel()

	runtime, _, _, _ := buildRuntimeFixture(t, &recordingExecutor{})
	_, err := runtime.StartRun(SpecInput{
		ID:   "chain-alpha",
		Name: "Chain Alpha",
		Steps: []StepInput{
			{
				ID:             "step-alpha",
				Name:           "Step Alpha",
				EngineConfigID: "engine-primary",
				Inputs: map[string]any{
					"engineConfigId": "engine-other",
				},
			},
		},
	}, map[string]any{})
	if !errors.Is(err, ErrInvalidRunChainInput) {
		t.Fatalf("expected invalid run chain input, got %v", err)
	}
}

func buildRuntimeFixture(t *testing.T, executor agentruns.Executor) (*Runtime, *agentruns.RunStore, *agentruns.EngineStore, *agentprofiles.Store) {
	t.Helper()

	root := t.TempDir()
	profiles, err := agentprofiles.NewStore(root)
	if err != nil {
		t.Fatalf("new profile store: %v", err)
	}
	engines, err := agentruns.NewEngineStore(root)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	if err := engines.Write([]agentruns.EngineConfig{
		{
			ID:               "engine-primary",
			Name:             "Primary",
			EngineType:       agentruns.EngineTypeSettaLLM,
			SettaLLMConfigID: stringPtr("primary"),
		},
	}); err != nil {
		t.Fatalf("write engine configs: %v", err)
	}
	runs, err := agentruns.NewRunStore(root)
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
	service, err := agentruns.NewService(agentruns.ServiceOptions{
		ProjectState:           projectRuntime,
		Engines:                engines,
		Runs:                   runs,
		LLM:                    llmRuntime,
		Executor:               executor,
		TemporaryIDs:           testTemporaryIDs{},
		CompletionGuardEnabled: true,
		TimeNow: func() time.Time {
			return time.Date(2026, 3, 9, 20, 0, 0, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatalf("new agent run service: %v", err)
	}
	managed, err := agentruns.NewRuntime(agentruns.RuntimeOptions{Service: service})
	if err != nil {
		t.Fatalf("new managed runtime: %v", err)
	}
	runtime, err := NewRuntime(RuntimeOptions{
		Runs:         runs,
		Engines:      engines,
		Profiles:     profiles,
		ProjectState: projectRuntime,
		Managed:      managed,
		TemporaryIDs: testTemporaryIDs{},
		TimeNow: func() time.Time {
			return time.Date(2026, 3, 9, 20, 0, 0, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatalf("new run-chain runtime: %v", err)
	}
	return runtime, runs, engines, profiles
}

func stringPtr(value string) *string {
	return &value
}
