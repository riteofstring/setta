package externalagents

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/externalagentconfigs"
	"setta/internal/projectstate"
)

type asyncRunController struct {
	runtimeReady chan struct{}
	cancelled    chan struct{}
	readyOnce    sync.Once
	cancelOnce   sync.Once
}

func newAsyncRunController() *asyncRunController {
	return &asyncRunController{
		runtimeReady: make(chan struct{}),
		cancelled:    make(chan struct{}),
	}
}

func (c *asyncRunController) Cancel() error {
	c.cancelOnce.Do(func() {
		close(c.cancelled)
	})
	return nil
}

func (*asyncRunController) SendApprovalResponse(string, bool) error {
	return nil
}

func (*asyncRunController) SendToolResponse(string, map[string]any) error {
	return nil
}

func (c *asyncRunController) markRuntimeReady() {
	c.readyOnce.Do(func() {
		close(c.runtimeReady)
	})
}

type asyncExternalRunExecutor struct {
	runs    *agentruns.RunStore
	runtime *Runtime
	timeNow func() time.Time

	last *StartRequest
}

func (e *asyncExternalRunExecutor) Start(_ context.Context, request StartRequest) (StartResponse, error) {
	cloned := request
	cloned.Inputs = cloneAnyMap(request.Inputs)
	if request.Profile != nil {
		cloned.Profile = cloneProfilePtr(request.Profile)
	}
	e.last = &cloned
	controller := newAsyncRunController()
	go func() {
		select {
		case <-controller.runtimeReady:
		case <-controller.cancelled:
			e.runtime.DeactivateRun(request.Run.ID)
			return
		}
		run, err := e.runs.Load(request.Run.ID)
		if err != nil {
			return
		}
		run.Outputs = map[string]any{
			"messages": deepCloneJSONValue(request.Inputs["messages"]),
		}
		finishedAt := e.timeNow().UTC()
		run.Status = agentruns.RunStatusCompleted
		run.FinishedAt = &finishedAt
		run.Events = append(run.Events, agentruns.NewRunEvent("run_completed", map[string]any{}, finishedAt))
		if err := e.runs.Save(run); err != nil {
			return
		}
		e.runtime.DeactivateRun(request.Run.ID)
	}()
	return StartResponse{Controller: controller}, nil
}

func TestRunServiceStartsExternalRunWithSynthesizedMessagesAndProfilePrompt(t *testing.T) {
	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	profile := agentprofiles.Profile{
		ID:             "profile-runner",
		Name:           "Runner",
		Description:    "Executes orchestrated external steps.",
		SystemPrompt:   "Use concise tool calls.",
		EngineConfigID: stringPtr(fixture.engineID),
	}
	if err := fixture.profiles.Write([]agentprofiles.Profile{profile}); err != nil {
		t.Fatalf("write profile: %v", err)
	}
	executor := &asyncExternalRunExecutor{
		runs:    fixture.runs,
		runtime: fixture.runtime,
		timeNow: func() time.Time { return fixture.now },
	}
	service, err := NewRunService(RunServiceOptions{
		ProjectState: fixture.service.projectState,
		Engines:      fixture.service.engines,
		Runs:         fixture.runs,
		Configs:      fixture.service.configs,
		Runtime:      fixture.runtime,
		Preflight:    fixture.service.preflight,
		Attachments:  fixture.service.attachments,
		Executor:     executor,
		TimeNow:      func() time.Time { return fixture.now },
	})
	if err != nil {
		t.Fatalf("new run service: %v", err)
	}

	started, err := service.StartRun(context.Background(), profile, map[string]any{
		"projectConfigId": "project-alpha",
		"allowUnscoped":   true,
		"prompt":          "Inspect the previous output and continue.",
	})
	if err != nil {
		t.Fatalf("start external run: %v", err)
	}
	if started.Status != agentruns.RunStatusRunning {
		t.Fatalf("expected running run, got %#v", started)
	}
	if executor.last == nil {
		t.Fatal("expected executor request")
	}
	if got := strings.TrimSpace(stringValue(executor.last.Inputs["chatId"])); got != started.ID {
		t.Fatalf("expected synthesized chat id %q, got %q", started.ID, got)
	}
	if got := strings.TrimSpace(stringValue(executor.last.Inputs["runType"])); got != RunTypeExternalAgent {
		t.Fatalf("expected synthesized runType %q, got %q", RunTypeExternalAgent, got)
	}
	if _, ok := executor.last.Inputs["prompt"]; ok {
		t.Fatalf("expected synthesized prompt-only run to normalize into messages, got %#v", executor.last.Inputs["prompt"])
	}
	rawMessages, ok := executor.last.Inputs["messages"].([]any)
	if !ok || len(rawMessages) != 1 {
		t.Fatalf("expected one synthesized input message, got %#v", executor.last.Inputs["messages"])
	}
	systemPrompt, _ := executor.last.Inputs["systemPrompt"].(string)
	if !strings.Contains(systemPrompt, "## Agent profile") || !strings.Contains(systemPrompt, "Use concise tool calls.") {
		t.Fatalf("expected merged profile system prompt, got %q", systemPrompt)
	}
	liveState, err := fixture.runtime.GetLiveChatState(started.ID)
	if err != nil {
		t.Fatalf("get live chat state: %v", err)
	}
	if liveState == nil || len(liveState.Messages) != 1 {
		t.Fatalf("expected one live input message, got %#v", liveState)
	}

	waitCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	completed, err := service.WaitForRun(waitCtx, started.ID)
	if err != nil {
		t.Fatalf("wait for external run: %v", err)
	}
	if completed.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed run, got %#v", completed)
	}
}

func TestRunServiceValidateRunRejectsMismatchedEngineConfigInput(t *testing.T) {
	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	profile, err := fixture.profiles.Get("profile-alpha")
	if err != nil {
		t.Fatalf("get profile: %v", err)
	}
	service, err := NewRunService(RunServiceOptions{
		ProjectState: fixture.service.projectState,
		Engines:      fixture.service.engines,
		Runs:         fixture.runs,
		Configs:      fixture.service.configs,
		Runtime:      fixture.runtime,
		Preflight:    fixture.service.preflight,
		Attachments:  fixture.service.attachments,
		Executor: &asyncExternalRunExecutor{
			runs:    fixture.runs,
			runtime: fixture.runtime,
			timeNow: func() time.Time { return fixture.now },
		},
		TimeNow: func() time.Time { return fixture.now },
	})
	if err != nil {
		t.Fatalf("new run service: %v", err)
	}

	err = service.ValidateRun(profile, map[string]any{
		"projectConfigId": "project-alpha",
		"allowUnscoped":   true,
		"engineConfigId":  "engine-other",
	})
	if !errors.Is(err, ErrInvalidRunInput) {
		t.Fatalf("expected invalid run input error, got %v", err)
	}
	if err == nil || !strings.Contains(err.Error(), "engineConfigId does not match resolved engine config") {
		t.Fatalf("expected engineConfigId mismatch detail, got %v", err)
	}
}

func TestRunServiceValidateRunRejectsInvalidMessageContentShape(t *testing.T) {
	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	profile, err := fixture.profiles.Get("profile-alpha")
	if err != nil {
		t.Fatalf("get profile: %v", err)
	}
	service, err := NewRunService(RunServiceOptions{
		ProjectState: fixture.service.projectState,
		Engines:      fixture.service.engines,
		Runs:         fixture.runs,
		Configs:      fixture.service.configs,
		Runtime:      fixture.runtime,
		Preflight:    fixture.service.preflight,
		Attachments:  fixture.service.attachments,
		Executor: &asyncExternalRunExecutor{
			runs:    fixture.runs,
			runtime: fixture.runtime,
			timeNow: func() time.Time { return fixture.now },
		},
		TimeNow: func() time.Time { return fixture.now },
	})
	if err != nil {
		t.Fatalf("new run service: %v", err)
	}

	err = service.ValidateRun(profile, map[string]any{
		"projectConfigId": "project-alpha",
		"allowUnscoped":   true,
		"messages": []any{
			map[string]any{
				"role":    "user",
				"content": "bad",
			},
		},
	})
	if !errors.Is(err, ErrInvalidRunInput) {
		t.Fatalf("expected invalid run input error, got %v", err)
	}
	if err == nil || !strings.Contains(err.Error(), "messages[0]: message content must be a list") {
		t.Fatalf("expected invalid message content detail, got %v", err)
	}
}

func TestRunServiceStartsExternalRunWithExplicitChatAndSectionIDs(t *testing.T) {
	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	profile, err := fixture.profiles.Get("profile-alpha")
	if err != nil {
		t.Fatalf("get profile: %v", err)
	}

	service, executor := newAsyncRunServiceForTest(t, fixture, newRunServiceProjectRuntimeWithSection(t))

	started, err := service.StartRun(context.Background(), profile, map[string]any{
		"projectConfigId": "project-alpha",
		"sectionId":       "section-1",
		"chatId":          "chat-explicit",
		"messages": []any{
			map[string]any{
				"id":   "user-explicit",
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "Continue in this explicit chat and section."},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("start run with explicit chat and section ids: %v", err)
	}
	if executor.last == nil {
		t.Fatal("expected executor request")
	}
	if got := strings.TrimSpace(stringValue(executor.last.Inputs["projectConfigId"])); got != "project-alpha" {
		t.Fatalf("expected explicit projectConfigId to survive, got %q", got)
	}
	if got := strings.TrimSpace(stringValue(executor.last.Inputs["chatId"])); got != "chat-explicit" {
		t.Fatalf("expected explicit chatId to survive, got %q", got)
	}
	if got := strings.TrimSpace(stringValue(executor.last.Inputs["sectionId"])); got != "section-1" {
		t.Fatalf("expected explicit sectionId to survive, got %q", got)
	}

	waitCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	completed, err := service.WaitForRun(waitCtx, started.ID)
	if err != nil {
		t.Fatalf("wait for explicit-id run: %v", err)
	}
	if completed.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed run, got %#v", completed)
	}
}

func TestRunServiceValidateRunRejectsNonStringProjectConfigID(t *testing.T) {
	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	profile, err := fixture.profiles.Get("profile-alpha")
	if err != nil {
		t.Fatalf("get profile: %v", err)
	}

	service, _ := newAsyncRunServiceForTest(t, fixture, nil)

	err = service.ValidateRun(profile, map[string]any{
		"projectConfigId": 123,
		"allowUnscoped":   true,
	})
	if !errors.Is(err, ErrInvalidRunInput) {
		t.Fatalf("expected invalid run input error, got %v", err)
	}
	if err == nil || !strings.Contains(err.Error(), "projectConfigId must be a string") {
		t.Fatalf("expected non-string projectConfigId detail, got %v", err)
	}
}

func TestRunServiceValidateRunRejectsInvalidScopeInputs(t *testing.T) {
	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	profile, err := fixture.profiles.Get("profile-alpha")
	if err != nil {
		t.Fatalf("get profile: %v", err)
	}

	service, _ := newAsyncRunServiceForTest(t, fixture, newRunServiceProjectRuntimeWithSection(t))

	tests := []struct {
		name   string
		inputs map[string]any
		want   string
	}{
		{
			name: "non-string section id",
			inputs: map[string]any{
				"projectConfigId": "project-alpha",
				"sectionId":       123,
			},
			want: "sectionId must be a string",
		},
		{
			name: "non-bool allow unscoped",
			inputs: map[string]any{
				"projectConfigId": "project-alpha",
				"allowUnscoped":   "yes",
			},
			want: "allowUnscoped must be a boolean",
		},
		{
			name: "section required when not unscoped",
			inputs: map[string]any{
				"projectConfigId": "project-alpha",
			},
			want: "sectionId is required unless allowUnscoped is true.",
		},
		{
			name: "allow unscoped conflicts with section",
			inputs: map[string]any{
				"projectConfigId": "project-alpha",
				"sectionId":       "section-1",
				"allowUnscoped":   true,
			},
			want: "allowUnscoped requires sectionId to be omitted.",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := service.ValidateRun(profile, cloneAnyMap(tt.inputs))
			if !errors.Is(err, ErrInvalidRunInput) {
				t.Fatalf("expected invalid run input error, got %v", err)
			}
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("expected error containing %q, got %v", tt.want, err)
			}
		})
	}
}

func TestRunServiceCreatesDistinctRunIDsWhenChatIDIsReused(t *testing.T) {
	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	profile, err := fixture.profiles.Get("profile-alpha")
	if err != nil {
		t.Fatalf("get profile: %v", err)
	}

	service, _ := newAsyncRunServiceForTest(t, fixture, nil)

	first, err := service.StartRun(context.Background(), profile, map[string]any{
		"projectConfigId": "project-alpha",
		"allowUnscoped":   true,
		"chatId":          "chat-reused",
		"prompt":          "First direct run on this chat.",
	})
	if err != nil {
		t.Fatalf("start first run: %v", err)
	}
	waitCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := service.WaitForRun(waitCtx, first.ID); err != nil {
		t.Fatalf("wait for first run: %v", err)
	}

	second, err := service.StartRun(context.Background(), profile, map[string]any{
		"projectConfigId": "project-alpha",
		"allowUnscoped":   true,
		"chatId":          "chat-reused",
		"prompt":          "Second direct run on the same chat.",
	})
	if err != nil {
		t.Fatalf("start second run: %v", err)
	}
	if _, err := service.WaitForRun(waitCtx, second.ID); err != nil {
		t.Fatalf("wait for second run: %v", err)
	}

	if first.ID == second.ID {
		t.Fatalf("expected repeated chat id to create a new run id, got %q", first.ID)
	}
	if got := resolveRunInputString(first, "chatId"); got != "chat-reused" {
		t.Fatalf("expected first run chat id to persist, got %q", got)
	}
	if got := resolveRunInputString(second, "chatId"); got != "chat-reused" {
		t.Fatalf("expected second run chat id to persist, got %q", got)
	}
}

func TestRunServiceValidateRunReturnsPreflightUnavailable(t *testing.T) {
	fixture := newSendServiceFixture(t, sendFixtureOptions{
		preflightStatus: &externalagentconfigs.Status{
			ConfigID:  "external-config",
			Name:      "Codex app-server",
			ToolType:  externalagentconfigs.ToolTypeCodex,
			RunMode:   externalagentconfigs.RunModeAppServer,
			Supported: true,
			Available: false,
			Issues:    []string{"codex CLI not found"},
		},
	})
	profile, err := fixture.profiles.Get("profile-alpha")
	if err != nil {
		t.Fatalf("get profile: %v", err)
	}
	service, err := NewRunService(RunServiceOptions{
		ProjectState: fixture.service.projectState,
		Engines:      fixture.service.engines,
		Runs:         fixture.runs,
		Configs:      fixture.service.configs,
		Runtime:      fixture.runtime,
		Preflight:    fixture.service.preflight,
		Attachments:  fixture.service.attachments,
		Executor: &asyncExternalRunExecutor{
			runs:    fixture.runs,
			runtime: fixture.runtime,
			timeNow: func() time.Time { return fixture.now },
		},
		TimeNow: func() time.Time { return fixture.now },
	})
	if err != nil {
		t.Fatalf("new run service: %v", err)
	}

	err = service.ValidateRun(profile, map[string]any{
		"projectConfigId": "project-alpha",
		"allowUnscoped":   true,
	})
	var preflightErr *PreflightUnavailableError
	if !errors.As(err, &preflightErr) {
		t.Fatalf("expected preflight unavailable error, got %v", err)
	}
}

func TestRunServiceValidateRunRejectsNonExternalAgentEngine(t *testing.T) {
	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	profile, err := fixture.profiles.Get("profile-alpha")
	if err != nil {
		t.Fatalf("get profile: %v", err)
	}
	engineConfig, err := fixture.service.engines.Get(fixture.engineID)
	if err != nil {
		t.Fatalf("get engine config: %v", err)
	}
	engineConfig.EngineType = agentruns.EngineTypeSettaLLM
	engineConfig.ExternalAgentConfigID = nil
	if _, err := fixture.service.engines.Update(engineConfig); err != nil {
		t.Fatalf("update engine config: %v", err)
	}
	service, _ := newAsyncRunServiceForTest(t, fixture, nil)

	err = service.ValidateRun(profile, map[string]any{
		"projectConfigId": "project-alpha",
		"allowUnscoped":   true,
	})
	if !errors.Is(err, ErrExternalAgentEngineRequired) {
		t.Fatalf("expected external-agent engine error, got %v", err)
	}
}

func newAsyncRunServiceForTest(
	t *testing.T,
	fixture sendServiceFixture,
	projectRuntime *projectstate.Runtime,
) (*RunService, *asyncExternalRunExecutor) {
	t.Helper()

	if projectRuntime == nil {
		projectRuntime = fixture.service.projectState
	}
	executor := &asyncExternalRunExecutor{
		runs:    fixture.runs,
		runtime: fixture.runtime,
		timeNow: func() time.Time { return fixture.now },
	}
	service, err := NewRunService(RunServiceOptions{
		ProjectState: projectRuntime,
		Engines:      fixture.service.engines,
		Runs:         fixture.runs,
		Configs:      fixture.service.configs,
		Runtime:      fixture.runtime,
		Preflight:    fixture.service.preflight,
		Attachments:  fixture.service.attachments,
		Executor:     executor,
		TimeNow:      func() time.Time { return fixture.now },
	})
	if err != nil {
		t.Fatalf("new run service: %v", err)
	}
	return service, executor
}

func newRunServiceProjectRuntimeWithSection(t *testing.T) *projectstate.Runtime {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"section-1": "variant-1",
		},
		Sections: map[string]projectstate.Section{
			"section-1": {
				ID:               "section-1",
				Name:             "Section One",
				VariantIDs:       []string{"variant-1"},
				DefaultVariantID: "variant-1",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"variant-1": {
				ID:     "variant-1",
				ImplID: "impl-1",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"impl-1": {
				ID:      "impl-1",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: projectstate.RawJSON([]byte(`{"id":"impl-1","type":"TextBlock"}`)),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize project with explicit section: %v", err)
	}

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": project,
		},
	})
	if err != nil {
		t.Fatalf("open project runtime with explicit section: %v", err)
	}
	return projectRuntime
}
