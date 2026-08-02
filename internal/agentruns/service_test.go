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

type visibleExecutorError struct {
	message string
}

func (e visibleExecutorError) Error() string {
	return e.message
}

func (e visibleExecutorError) AssistantFailureMessage() string {
	return e.message
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

func TestEngineStoreListReturnsEmptyWhenFileMissing(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store, err := NewEngineStore(root)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}

	// First-run engine config reads intentionally return an empty list instead
	// of writing seeded example configs into the workspace.
	configs, err := store.List()
	if err != nil {
		t.Fatalf("list engine configs: %v", err)
	}
	if len(configs) != 0 {
		t.Fatalf("expected no engine configs, got %#v", configs)
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

func TestRunStoreSaveLoadAndListRoundTrip(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store, err := NewRunStore(root)
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}

	now := time.Date(2026, 3, 20, 8, 0, 0, 0, time.UTC)
	run := NewRun(nil, map[string]any{
		"prompt": "hello",
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
	if loaded.Status != RunStatusRunning {
		t.Fatalf("expected running status, got %q", loaded.Status)
	}
	if !reflect.DeepEqual(loaded.Inputs, map[string]any{"prompt": "hello"}) {
		t.Fatalf("unexpected loaded inputs %#v", loaded.Inputs)
	}
	if loaded.StartedAt == nil || !loaded.StartedAt.Equal(now) {
		t.Fatalf("expected startedAt %v, got %#v", now, loaded.StartedAt)
	}

	runs, err := store.List()
	if err != nil {
		t.Fatalf("list runs: %v", err)
	}
	if len(runs) != 1 || runs[0].ID != run.ID {
		t.Fatalf("unexpected runs %#v", runs)
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

func TestServiceRunSubAgentPersistsAssistantFailureMessageForVisibleErrors(t *testing.T) {
	t.Parallel()

	service, _, runs, _ := buildServiceFixture(t, visibleExecutorError{
		message: "Completion guard is enabled, but the required `report_completion_status` tool is unavailable for this managed run.",
	})
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
	messages, ok := loaded.Outputs["messages"].([]any)
	if !ok || len(messages) != 1 {
		t.Fatalf("expected persisted assistant failure message, got %#v", loaded.Outputs["messages"])
	}
	message, ok := messages[0].(map[string]any)
	if !ok {
		t.Fatalf("expected persisted assistant failure payload, got %#v", messages[0])
	}
	if message["role"] != "assistant" {
		t.Fatalf("expected assistant failure role, got %#v", message["role"])
	}
	content, ok := message["content"].([]any)
	if !ok || len(content) != 1 {
		t.Fatalf("expected assistant failure content, got %#v", message["content"])
	}
	textBlock, ok := content[0].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant failure text block, got %#v", content[0])
	}
	if textBlock["text"] != "Completion guard is enabled, but the required `report_completion_status` tool is unavailable for this managed run." {
		t.Fatalf("unexpected assistant failure text %#v", textBlock["text"])
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

func TestBuildContextSelectsDefaultProjectAndAllowsOverrides(t *testing.T) {
	t.Parallel()

	service, _, _, _ := buildServiceFixture(t, nil)
	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {ID: "project-alpha", Name: "Alpha"},
			"project-beta":  {ID: "project-beta", Name: "Beta"},
		},
	})
	if err != nil {
		t.Fatalf("open project runtime: %v", err)
	}
	service.projectState = projectRuntime

	profile := agentprofiles.Profile{
		ID:             "profile-alpha",
		Name:           "Alpha",
		EngineConfigID: stringPtr("engine-primary"),
	}

	defaultContext, err := service.buildContext(profile, map[string]any{
		"allowUnscoped": true,
	})
	if err != nil {
		t.Fatalf("build default context: %v", err)
	}
	if defaultContext.projectConfigID != "project-alpha" {
		t.Fatalf("expected default project-alpha, got %#v", defaultContext.projectConfigID)
	}
	if defaultContext.chatID != defaultContext.run.ID {
		t.Fatalf("expected chat id to default to run id, got chat=%q run=%q", defaultContext.chatID, defaultContext.run.ID)
	}
	if defaultContext.sectionID != nil {
		t.Fatalf("expected no section id, got %#v", defaultContext.sectionID)
	}
	if defaultContext.thinking {
		t.Fatalf("expected thinking=false by default, got %#v", defaultContext.thinking)
	}

	overrideContext, err := service.buildContext(profile, map[string]any{
		"projectConfigId": " project-beta ",
		"chatId":          " chat-1 ",
		"thinking":        true,
		"allowUnscoped":   true,
		"engineConfigId":  "engine-primary",
	})
	if err != nil {
		t.Fatalf("build override context: %v", err)
	}
	if overrideContext.projectConfigID != "project-beta" {
		t.Fatalf("expected override project-beta, got %#v", overrideContext.projectConfigID)
	}
	if overrideContext.chatID != "chat-1" {
		t.Fatalf("expected override chat id chat-1, got %#v", overrideContext.chatID)
	}
	if !overrideContext.thinking {
		t.Fatalf("expected thinking override, got %#v", overrideContext.thinking)
	}
	if overrideContext.inputs["engineConfigId"] != "engine-primary" {
		t.Fatalf("expected resolved engineConfigId in payload inputs, got %#v", overrideContext.inputs["engineConfigId"])
	}
}

func TestBuildContextSnapshotsCompletionGuardSetting(t *testing.T) {
	t.Parallel()

	currentValue := false
	service, _, _, _ := buildServiceFixtureWithOptions(t, buildServiceFixtureOptions{
		completionGuardProvider: func() (bool, error) {
			return currentValue, nil
		},
	})
	profile := agentprofiles.Profile{
		ID:             "profile-alpha",
		Name:           "Alpha",
		EngineConfigID: stringPtr("engine-primary"),
	}

	runContext, err := service.buildContext(profile, map[string]any{
		"allowUnscoped": true,
	})
	if err != nil {
		t.Fatalf("build context: %v", err)
	}
	currentValue = true

	if runContext.completionGuardEnabled {
		t.Fatalf("expected completion guard snapshot to stay false, got %#v", runContext.completionGuardEnabled)
	}
}

func TestBuildContextRejectsInvalidInputTypesAndMismatchedEngineConfig(t *testing.T) {
	t.Parallel()

	service, _, _, _ := buildServiceFixture(t, nil)
	profile := agentprofiles.Profile{
		ID:             "profile-alpha",
		Name:           "Alpha",
		EngineConfigID: stringPtr("engine-primary"),
	}

	tests := []struct {
		name        string
		inputs      map[string]any
		wantMessage string
	}{
		{
			name: "project config id type",
			inputs: map[string]any{
				"projectConfigId": 123,
				"allowUnscoped":   true,
			},
			wantMessage: "projectConfigId must be a string",
		},
		{
			name: "chat id type",
			inputs: map[string]any{
				"chatId":        123,
				"allowUnscoped": true,
			},
			wantMessage: "chatId must be a string",
		},
		{
			name: "section id type",
			inputs: map[string]any{
				"sectionId": 123,
			},
			wantMessage: "sectionId must be a string",
		},
		{
			name: "allow unscoped type",
			inputs: map[string]any{
				"allowUnscoped": "yes",
			},
			wantMessage: "allowUnscoped must be a boolean",
		},
		{
			name: "thinking type",
			inputs: map[string]any{
				"thinking":      "yes",
				"allowUnscoped": true,
			},
			wantMessage: "thinking must be a boolean",
		},
		{
			name: "prompt type",
			inputs: map[string]any{
				"prompt":        123,
				"allowUnscoped": true,
			},
			wantMessage: "prompt must be a string",
		},
		{
			name: "messages type",
			inputs: map[string]any{
				"messages":      "not-a-list",
				"allowUnscoped": true,
			},
			wantMessage: "messages must be a list",
		},
		{
			name: "engine config id type",
			inputs: map[string]any{
				"engineConfigId": 123,
				"allowUnscoped":  true,
			},
			wantMessage: "engineConfigId must be a string",
		},
		{
			name: "engine config mismatch",
			inputs: map[string]any{
				"engineConfigId": "engine-mismatch",
				"allowUnscoped":  true,
			},
			wantMessage: "engineConfigId does not match resolved engine config",
		},
	}

	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			_, err := service.buildContext(profile, test.inputs)
			if err == nil || !strings.Contains(err.Error(), test.wantMessage) {
				t.Fatalf("expected error containing %q, got %v", test.wantMessage, err)
			}
		})
	}
}

func TestParseRunInputsTrimsValuesAndAppliesDefaults(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name                   string
		inputs                 map[string]any
		defaultProjectConfigID string
		wantProjectConfigID    string
		wantChatID             string
		wantSectionID          *string
		wantAllowUnscoped      bool
		wantThinking           bool
	}{
		{
			name:                   "defaults project config when omitted",
			inputs:                 map[string]any{"allowUnscoped": true},
			defaultProjectConfigID: "project-default",
			wantProjectConfigID:    "project-default",
			wantAllowUnscoped:      true,
		},
		{
			name: "trims explicit overrides",
			inputs: map[string]any{
				"projectConfigId": " project-beta ",
				"chatId":          " chat-1 ",
				"sectionId":       " section-1 ",
				"thinking":        true,
			},
			defaultProjectConfigID: "project-default",
			wantProjectConfigID:    "project-beta",
			wantChatID:             "chat-1",
			wantSectionID:          stringPtr("section-1"),
			wantThinking:           true,
		},
	}

	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			parsed, err := parseRunInputs(test.inputs, test.defaultProjectConfigID)
			if err != nil {
				t.Fatalf("parse run inputs: %v", err)
			}
			if parsed.projectConfigID != test.wantProjectConfigID {
				t.Fatalf("expected project config %q, got %q", test.wantProjectConfigID, parsed.projectConfigID)
			}
			if parsed.chatID != test.wantChatID {
				t.Fatalf("expected chat id %q, got %q", test.wantChatID, parsed.chatID)
			}
			if !reflect.DeepEqual(parsed.sectionID, test.wantSectionID) {
				t.Fatalf("expected section id %#v, got %#v", test.wantSectionID, parsed.sectionID)
			}
			if parsed.allowUnscoped != test.wantAllowUnscoped {
				t.Fatalf("expected allowUnscoped=%v, got %v", test.wantAllowUnscoped, parsed.allowUnscoped)
			}
			if parsed.thinking != test.wantThinking {
				t.Fatalf("expected thinking=%v, got %v", test.wantThinking, parsed.thinking)
			}
		})
	}
}

func TestParseRunInputsRejectsSectionRequirementConflicts(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		inputs      map[string]any
		wantMessage string
	}{
		{
			name:        "section id required when unscoped is false",
			inputs:      map[string]any{},
			wantMessage: "sectionId is required unless allowUnscoped is true.",
		},
		{
			name: "allow unscoped requires omitted section id",
			inputs: map[string]any{
				"sectionId":     "section-1",
				"allowUnscoped": true,
			},
			wantMessage: "allowUnscoped requires sectionId to be omitted.",
		},
	}

	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			_, err := parseRunInputs(test.inputs, "project-default")
			if err == nil || !strings.Contains(err.Error(), test.wantMessage) {
				t.Fatalf("expected error containing %q, got %v", test.wantMessage, err)
			}
		})
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

func TestBuildOutputsPreservesMessagesUsageMetadataAndCostWithoutFinalText(t *testing.T) {
	t.Parallel()

	cost := 0.0123
	outputs := buildOutputs(
		map[string]any{
			"messages": []any{
				map[string]any{"id": "assistant-1", "role": "assistant"},
			},
			"usage": map[string]any{
				"promptTokens":     2,
				"completionTokens": 3,
				"totalTokens":      5,
			},
		},
		map[string]any{
			"model":          "gpt-4o-mini",
			"engineConfigId": "engine-primary",
		},
		&cost,
	)

	if _, ok := outputs["finalText"]; ok {
		t.Fatalf("expected no helper finalText in outputs, got %#v", outputs["finalText"])
	}
	messages, ok := outputs["messages"].([]any)
	if !ok || len(messages) != 1 {
		t.Fatalf("expected preserved messages, got %#v", outputs["messages"])
	}
	usage, ok := outputs["usage"].(map[string]any)
	if !ok || usage["totalTokens"] != float64(5) {
		t.Fatalf("expected preserved usage, got %#v", outputs["usage"])
	}
	metadata, ok := outputs["metadata"].(map[string]any)
	if !ok || metadata["engineConfigId"] != "engine-primary" || metadata["model"] != "gpt-4o-mini" {
		t.Fatalf("expected metadata payload, got %#v", outputs["metadata"])
	}
	if outputs["cost"] != cost {
		t.Fatalf("expected cost %.4f, got %#v", cost, outputs["cost"])
	}
}

func TestServiceRunSubAgentUsesCompletionGuardProvider(t *testing.T) {
	t.Parallel()

	providerCalls := 0
	service, executor, _, _ := buildServiceFixtureWithOptions(t, buildServiceFixtureOptions{
		completionGuardProvider: func() (bool, error) {
			providerCalls++
			return false, nil
		},
	})
	profile := agentprofiles.Profile{
		ID:             "profile-alpha",
		Name:           "Alpha",
		EngineConfigID: stringPtr("engine-primary"),
	}
	executor.result = ExecutionResult{
		Outputs: map[string]any{
			"messages": []any{},
		},
	}

	_, err := service.RunSubAgent(context.Background(), profile, map[string]any{
		"allowUnscoped": true,
	})
	if err != nil {
		t.Fatalf("run sub agent: %v", err)
	}
	if providerCalls != 1 {
		t.Fatalf("expected completion guard provider to be called once, got %d", providerCalls)
	}
	if executor.last == nil {
		t.Fatal("expected executor call")
	}
	if executor.last.CompletionGuardEnabled {
		t.Fatalf("expected completion guard to be disabled, got %#v", executor.last)
	}
	if strings.Contains(executor.last.SystemPrompt, "Completion Reporting Contract") {
		t.Fatalf("expected completion contract to be removed from prompt, got %q", executor.last.SystemPrompt)
	}
}

type buildServiceFixtureOptions struct {
	execErr                 error
	completionGuardEnabled  bool
	completionGuardProvider CompletionGuardProvider
}

func buildServiceFixture(t *testing.T, execErr error) (*Service, *stubExecutor, *RunStore, *projectstate.Runtime) {
	return buildServiceFixtureWithOptions(t, buildServiceFixtureOptions{
		execErr:                execErr,
		completionGuardEnabled: true,
	})
}

func buildServiceFixtureWithOptions(t *testing.T, options buildServiceFixtureOptions) (*Service, *stubExecutor, *RunStore, *projectstate.Runtime) {
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
	executor := &stubExecutor{err: options.execErr}
	service, err := NewService(ServiceOptions{
		ProjectState:            projectRuntime,
		Engines:                 engines,
		Runs:                    runs,
		LLM:                     llmRuntime,
		Executor:                executor,
		TemporaryIDs:            &stubTemporaryIDs{},
		BasePrompt:              "Base prompt",
		CompletionGuardEnabled:  options.completionGuardEnabled,
		CompletionGuardProvider: options.completionGuardProvider,
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

func TestEngineStoreCreateAndUpdateAllowBlankNames(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store, err := NewEngineStore(root)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}

	created, err := store.Create(EngineConfig{
		ID:         "engine-created",
		Name:       "  ",
		EngineType: EngineTypeSettaLLM,
	})
	if err != nil {
		t.Fatalf("create engine config: %v", err)
	}
	if created.Name != "  " {
		t.Fatalf("expected created blank name to roundtrip exactly, got %#v", created)
	}

	updated, err := store.Update(EngineConfig{
		ID:         "engine-created",
		Name:       "",
		EngineType: EngineTypeSettaLLM,
	})
	if err != nil {
		t.Fatalf("update engine config: %v", err)
	}
	if updated.Name != "" {
		t.Fatalf("expected updated blank name to roundtrip exactly, got %#v", updated)
	}

	loaded, err := store.Get("engine-created")
	if err != nil {
		t.Fatalf("load blank-name engine config: %v", err)
	}
	if loaded.Name != "" {
		t.Fatalf("expected persisted blank name, got %#v", loaded)
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
