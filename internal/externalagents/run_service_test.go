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
