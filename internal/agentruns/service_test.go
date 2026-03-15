package agentruns

import (
	"context"
	"errors"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/llmconfig"
	"setta/internal/projectstate"
)

type stubExecutor struct {
	result       ExecutionResult
	err          error
	last         *ExecutionRequest
	validateErr  error
	lastValidate *ExecutionRequest
}

func (s *stubExecutor) Execute(_ context.Context, request ExecutionRequest) (ExecutionResult, error) {
	cloned := request
	s.last = &cloned
	return s.result, s.err
}

func (s *stubExecutor) Validate(request ExecutionRequest) error {
	cloned := request
	s.lastValidate = &cloned
	return s.validateErr
}

type stubTemporaryIDs struct {
	mapping map[string]string
}

func (s *stubTemporaryIDs) EnsureTemporaryID(canonicalID string) (string, error) {
	if s.mapping == nil {
		s.mapping = map[string]string{}
	}
	if value, ok := s.mapping[canonicalID]; ok {
		return value, nil
	}
	next := "1"
	s.mapping[canonicalID] = next
	return next, nil
}

func (s *stubTemporaryIDs) Snapshot() (map[string]string, error) {
	cloned := map[string]string{}
	for key, value := range s.mapping {
		cloned[key] = value
	}
	return cloned, nil
}

func TestEngineStoreRoundTripAndResolveManagedEngine(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store, err := NewEngineStore(root)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}

	if err := store.Write([]EngineConfig{
		{
			ID:         "engine-primary",
			Name:       "Primary",
			EngineType: EngineTypeSettaLLM,
		},
	}); err != nil {
		t.Fatalf("write engine configs: %v", err)
	}

	configs := llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"b-config": {ID: "b-config", Model: "gpt-4o-mini"},
			"a-config": {ID: "a-config", Model: "claude-sonnet"},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}
	resolved, err := ResolveManagedEngine(store, configs, "engine-primary")
	if err != nil {
		t.Fatalf("resolve managed engine: %v", err)
	}
	if resolved.LLMConfig.ID != "a-config" {
		t.Fatalf("expected deterministic first llm config, got %q", resolved.LLMConfig.ID)
	}
}

func TestRunStorePersistsRunsAndMetadataIndex(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store, err := NewRunStore(root)
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}

	now := time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC)
	run := NewRun(stringPtr("profile-alpha"), map[string]any{
		"runType":         "managed_chat",
		"chatId":          "chat-1",
		"projectConfigId": "project-alpha",
	}, now)
	if err := store.Save(run); err != nil {
		t.Fatalf("save run: %v", err)
	}

	loaded, err := store.Load(run.ID)
	if err != nil {
		t.Fatalf("load run: %v", err)
	}
	if loaded.ID != run.ID {
		t.Fatalf("expected loaded run %q, got %q", run.ID, loaded.ID)
	}

	filtered, err := store.ListByMetadata(RunFilter{
		RunType:         stringPtr("managed_chat"),
		ChatID:          stringPtr("chat-1"),
		ProjectConfigID: stringPtr("project-alpha"),
	})
	if err != nil {
		t.Fatalf("list runs by metadata: %v", err)
	}
	if len(filtered) != 1 || filtered[0].ID != run.ID {
		t.Fatalf("unexpected filtered runs %#v", filtered)
	}
}

func TestRunStoreSaveInvokesAfterSaveListenersWithClonedRun(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store, err := NewRunStore(root)
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}

	var saved []Run
	store.AddAfterSaveListener(func(run Run) {
		saved = append(saved, run)
		run.Inputs["mutated"] = true
	})

	now := time.Date(2026, 3, 14, 9, 0, 0, 0, time.UTC)
	run := NewRun(stringPtr("profile-alpha"), map[string]any{
		"runType": "managed_chat",
	}, now)
	if err := store.Save(run); err != nil {
		t.Fatalf("save run: %v", err)
	}

	if len(saved) != 1 {
		t.Fatalf("expected one saved notification, got %d", len(saved))
	}
	if saved[0].ID != run.ID {
		t.Fatalf("expected notified run %q, got %q", run.ID, saved[0].ID)
	}

	loaded, err := store.Load(run.ID)
	if err != nil {
		t.Fatalf("load run: %v", err)
	}
	if _, ok := loaded.Inputs["mutated"]; ok {
		t.Fatalf("expected persisted run to ignore listener mutation, got %#v", loaded.Inputs)
	}
}

func TestServiceRunSubAgentPersistsLifecycleAndCompletes(t *testing.T) {
	t.Parallel()

	service, executor, runs, runtime := buildServiceFixture(t, nil)
	profile := agentprofiles.Profile{
		ID:             "profile-alpha",
		Name:           "Alpha",
		Description:    "Assistant",
		SystemPrompt:   "Follow the task.",
		EngineConfigID: stringPtr("engine-primary"),
	}
	executor.result = ExecutionResult{
		Outputs: map[string]any{
			"messages": []any{},
		},
	}

	run, err := service.RunSubAgent(context.Background(), profile, map[string]any{
		"prompt":        "hello",
		"allowUnscoped": true,
	})
	if err != nil {
		t.Fatalf("run sub agent: %v", err)
	}
	if run.Status != RunStatusCompleted {
		t.Fatalf("expected completed run, got %q", run.Status)
	}
	loaded, err := runs.Load(run.ID)
	if err != nil {
		t.Fatalf("load completed run: %v", err)
	}
	eventTypes := make([]string, 0, len(loaded.Events))
	for _, event := range loaded.Events {
		eventTypes = append(eventTypes, event.Type)
	}
	if !reflect.DeepEqual(eventTypes, []string{"run_started", "snapshot", "run_completed"}) {
		t.Fatalf("unexpected event types %#v", eventTypes)
	}
	if executor.last == nil {
		t.Fatal("expected executor call")
	}
	if executor.last.ProjectConfigID != runtime.Snapshot().Document.DefaultProjectID {
		t.Fatalf("unexpected executor project config %q", executor.last.ProjectConfigID)
	}
	if executor.last.ChatID != run.ID {
		t.Fatalf("expected executor chat id to default to run id, got %q", executor.last.ChatID)
	}
	if !strings.Contains(executor.last.SystemPrompt, "## Active project config") {
		t.Fatalf("expected system prompt to include project context, got %q", executor.last.SystemPrompt)
	}
}

func TestServiceRunSubAgentMarksRunFailedWhenExecutorFails(t *testing.T) {
	t.Parallel()

	service, _, runs, _ := buildServiceFixture(t, errors.New("provider offline"))
	profile := agentprofiles.Profile{
		ID:             "profile-alpha",
		Name:           "Alpha",
		EngineConfigID: stringPtr("engine-primary"),
	}

	run, err := service.RunSubAgent(context.Background(), profile, map[string]any{
		"allowUnscoped": true,
	})
	if err != nil {
		t.Fatalf("run sub agent: %v", err)
	}
	if run.Status != RunStatusFailed {
		t.Fatalf("expected failed run, got %q", run.Status)
	}
	loaded, err := runs.Load(run.ID)
	if err != nil {
		t.Fatalf("load failed run: %v", err)
	}
	lastEvent := loaded.Events[len(loaded.Events)-1]
	if lastEvent.Type != "run_failed" {
		t.Fatalf("expected run_failed event, got %#v", lastEvent)
	}
}

func TestServiceRunSubAgentRejectsValidatedRequestBeforeSave(t *testing.T) {
	t.Parallel()

	service, executor, runs, _ := buildServiceFixture(t, nil)
	executor.validateErr = errors.New("thinking unsupported")
	profile := agentprofiles.Profile{
		ID:             "profile-alpha",
		Name:           "Alpha",
		EngineConfigID: stringPtr("engine-primary"),
	}

	_, err := service.RunSubAgent(context.Background(), profile, map[string]any{
		"allowUnscoped": true,
		"thinking":      true,
	})
	if err == nil || err.Error() != "thinking unsupported" {
		t.Fatalf("expected validation error, got %v", err)
	}
	if executor.lastValidate == nil {
		t.Fatal("expected validate call")
	}
	if executor.last != nil {
		t.Fatalf("expected execute to be skipped, got %#v", executor.last)
	}
	runsList, err := runs.List()
	if err != nil {
		t.Fatalf("list runs: %v", err)
	}
	if len(runsList) != 0 {
		t.Fatalf("expected no persisted runs, got %#v", runsList)
	}
}

func TestServiceRejectsDisabledExecutorAndMissingProfileEngine(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	engines, err := NewEngineStore(root)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	runs, err := NewRunStore(root)
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	llmRuntime, err := llmconfig.NewRuntime(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"primary": {ID: "primary", Model: "gpt-4o-mini"},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	})
	if err != nil {
		t.Fatalf("new llm runtime: %v", err)
	}
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
		ProjectState: projectRuntime,
		Engines:      engines,
		Runs:         runs,
		LLM:          llmRuntime,
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	if !service.Disabled() {
		t.Fatal("expected disabled service without executor")
	}
	_, err = service.RunSubAgent(context.Background(), agentprofiles.Profile{
		ID:             "profile-alpha",
		Name:           "Alpha",
		EngineConfigID: stringPtr("engine-primary"),
	}, map[string]any{"allowUnscoped": true})
	if !errors.Is(err, ErrManagedExecutorUnavailable) {
		t.Fatalf("expected managed executor unavailable, got %v", err)
	}
}

func TestBuildSystemPromptUsesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	temporaryIDs := &stubTemporaryIDs{mapping: map[string]string{"project-alpha": "7"}}
	prompt, err := buildSystemPrompt(
		"Base prompt",
		agentprofiles.Profile{Name: "Alpha", Description: "Helper"},
		"project-alpha",
		temporaryIDs,
		true,
	)
	if err != nil {
		t.Fatalf("build system prompt: %v", err)
	}
	if !strings.Contains(prompt, "- id: 7") {
		t.Fatalf("expected temporary project id in prompt, got %q", prompt)
	}
}

func TestBuildSystemPromptRemovesCompletionContractWhenDisabledAndKeepsProfileContext(t *testing.T) {
	t.Parallel()

	prompt, err := buildSystemPrompt(
		"Base prompt\n\n## Completion Reporting Contract\n- report status\n\n## Next Section\n- keep this",
		agentprofiles.Profile{
			Name:         "Alpha",
			Description:  "Helper",
			SystemPrompt: "Profile prompt",
		},
		"project-alpha",
		nil,
		false,
	)
	if err != nil {
		t.Fatalf("build system prompt: %v", err)
	}
	if strings.Contains(prompt, "Completion Reporting Contract") {
		t.Fatalf("expected completion contract to be removed when disabled, got %q", prompt)
	}
	if !strings.Contains(prompt, "## Next Section\n- keep this") {
		t.Fatalf("expected other prompt sections to remain, got %q", prompt)
	}
	if !strings.Contains(prompt, "## Active project config\n- id: project-alpha") {
		t.Fatalf("expected active project config in prompt, got %q", prompt)
	}
	if !strings.Contains(prompt, "## Agent profile") {
		t.Fatalf("expected agent profile section, got %q", prompt)
	}
	if !strings.Contains(prompt, "- name: Alpha") {
		t.Fatalf("expected profile name in prompt, got %q", prompt)
	}
	if !strings.Contains(prompt, "- description: Helper") {
		t.Fatalf("expected profile description in prompt, got %q", prompt)
	}
	if !strings.Contains(prompt, "Profile prompt") {
		t.Fatalf("expected profile system prompt in prompt, got %q", prompt)
	}
}

func buildServiceFixture(t *testing.T, execErr error) (*Service, *stubExecutor, *RunStore, *projectstate.Runtime) {
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
	llmRuntime.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "secret",
		"UNUSED":         "drop",
	})
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
	now := time.Date(2026, 3, 8, 13, 0, 0, 0, time.UTC)
	executor := &stubExecutor{err: execErr}
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
			return now
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	return service, executor, runs, projectRuntime
}

func TestEngineStoreRejectsInvalidPayload(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store, err := NewEngineStore(root)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	if err := os.WriteFile(store.Path(), []byte(`{"id":"bad"}`), 0o644); err != nil {
		t.Fatalf("write invalid engine payload: %v", err)
	}
	_, err = store.List()
	if err == nil {
		t.Fatal("expected engine store error")
	}
}

func TestEngineStoreUpdateReplacesPersistedConfig(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store, err := NewEngineStore(root)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	settaConfigID := "claude-sonnet"
	if err := store.Write([]EngineConfig{
		{
			ID:               "engine-primary",
			Name:             "Primary",
			EngineType:       EngineTypeSettaLLM,
			SettaLLMConfigID: &settaConfigID,
		},
	}); err != nil {
		t.Fatalf("write engine configs: %v", err)
	}

	externalConfigID := "external-codex"
	updated, err := store.Update(EngineConfig{
		ID:                    "engine-primary",
		Name:                  "Primary updated",
		EngineType:            EngineTypeExternalAgent,
		ExternalAgentConfigID: &externalConfigID,
	})
	if err != nil {
		t.Fatalf("update engine config: %v", err)
	}
	if updated.Name != "Primary updated" {
		t.Fatalf("expected updated name, got %#v", updated)
	}
	if updated.ExternalAgentConfigID == nil || *updated.ExternalAgentConfigID != externalConfigID {
		t.Fatalf("expected updated external config id, got %#v", updated)
	}

	loaded, err := store.Get("engine-primary")
	if err != nil {
		t.Fatalf("load updated engine config: %v", err)
	}
	if loaded.Name != "Primary updated" {
		t.Fatalf("expected persisted updated config, got %#v", loaded)
	}
	if loaded.EngineType != EngineTypeExternalAgent {
		t.Fatalf("expected persisted external-agent engine type, got %#v", loaded)
	}
}

func TestEngineStoreCreatePersistsConfig(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store, err := NewEngineStore(root)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}

	externalConfigID := "external-codex"
	created, err := store.Create(EngineConfig{
		ID:                    "engine-created",
		Name:                  "Created",
		EngineType:            EngineTypeExternalAgent,
		ExternalAgentConfigID: &externalConfigID,
	})
	if err != nil {
		t.Fatalf("create engine config: %v", err)
	}
	if created.ID != "engine-created" || created.Name != "Created" {
		t.Fatalf("unexpected created config %#v", created)
	}

	loaded, err := store.Get("engine-created")
	if err != nil {
		t.Fatalf("load created engine config: %v", err)
	}
	if loaded.EngineType != EngineTypeExternalAgent {
		t.Fatalf("expected persisted external-agent config, got %#v", loaded)
	}
	if loaded.ExternalAgentConfigID == nil || *loaded.ExternalAgentConfigID != externalConfigID {
		t.Fatalf("expected persisted external agent id, got %#v", loaded)
	}
}

func TestEngineStoreDeleteRemovesPersistedConfig(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store, err := NewEngineStore(root)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	if err := store.Write([]EngineConfig{
		{
			ID:         "engine-primary",
			Name:       "Primary",
			EngineType: EngineTypeSettaLLM,
		},
		{
			ID:         "engine-secondary",
			Name:       "Secondary",
			EngineType: EngineTypeSettaLLM,
		},
	}); err != nil {
		t.Fatalf("write engine configs: %v", err)
	}

	if err := store.Delete("engine-primary"); err != nil {
		t.Fatalf("delete engine config: %v", err)
	}

	configs, err := store.List()
	if err != nil {
		t.Fatalf("list engine configs: %v", err)
	}
	if len(configs) != 1 || configs[0].ID != "engine-secondary" {
		t.Fatalf("unexpected engine configs after delete %#v", configs)
	}
}

func TestEngineStoreUpdateRejectsMissingAndInvalidConfig(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store, err := NewEngineStore(root)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	if err := store.Write([]EngineConfig{
		{
			ID:         "engine-primary",
			Name:       "Primary",
			EngineType: EngineTypeSettaLLM,
		},
	}); err != nil {
		t.Fatalf("write engine configs: %v", err)
	}

	_, err = store.Update(EngineConfig{
		ID:         "engine-missing",
		Name:       "Missing",
		EngineType: EngineTypeSettaLLM,
	})
	if !errors.Is(err, ErrEngineConfigNotFound) {
		t.Fatalf("expected missing engine config error, got %v", err)
	}

	_, err = store.Update(EngineConfig{
		ID:   "engine-primary",
		Name: "Primary",
	})
	if !errors.Is(err, ErrInvalidEngineConfig) {
		t.Fatalf("expected invalid engine config error, got %v", err)
	}

	_, err = store.Create(EngineConfig{
		ID:   "engine-invalid",
		Name: "Missing type",
	})
	if !errors.Is(err, ErrInvalidEngineConfig) {
		t.Fatalf("expected invalid create engine config error, got %v", err)
	}

	if err := store.Delete("engine-missing"); !errors.Is(err, ErrEngineConfigNotFound) {
		t.Fatalf("expected missing engine config delete error, got %v", err)
	}
}

func stringPtr(value string) *string {
	return &value
}
