package externalagents

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/externalagentconfigs"
	"setta/internal/projectstate"
)

type stubPreflightChecker struct {
	status externalagentconfigs.Status
	err    error
}

func (s stubPreflightChecker) Check(config externalagentconfigs.Config) (externalagentconfigs.Status, error) {
	if s.err != nil {
		return externalagentconfigs.Status{}, s.err
	}
	status := s.status
	if status.ConfigID == "" {
		status.ConfigID = config.ID
		status.Name = config.Name
		status.ToolType = config.ToolType
		status.RunMode = config.RunMode
		status.Supported = true
		status.Available = true
		status.Issues = []string{}
	}
	return status, nil
}

type stubExternalAgentExecutor struct {
	last      *StartRequest
	response  StartResponse
	err       error
	startCall int
}

func (s *stubExternalAgentExecutor) Start(_ context.Context, request StartRequest) (StartResponse, error) {
	s.startCall++
	cloned := request
	cloned.Inputs = cloneAnyMap(request.Inputs)
	if request.Profile != nil {
		cloned.Profile = cloneProfilePtr(request.Profile)
	}
	s.last = &cloned
	if s.err != nil {
		return StartResponse{}, s.err
	}
	return s.response, nil
}

func TestSendServiceStartsExternalChatAndPersistsRunningRun(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	result, err := fixture.service.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Create a new section."},
			},
		},
		EngineConfigID:        fixture.engineID,
		Thinking:              false,
		ProjectConfigID:       "project-alpha",
		AllowUnscoped:         true,
		FrontendAffinityToken: stringPtr("  frontend-external  "),
		PermissionMode:        ChatPermissionModeMinimal,
		SearchEnabled:         false,
	})
	if err != nil {
		t.Fatalf("start external chat: %v", err)
	}
	if result.ChatID == "" {
		t.Fatal("expected chat id")
	}
	if result.Run.Status != agentruns.RunStatusRunning {
		t.Fatalf("expected running status, got %#v", result.Run)
	}
	if fixture.executor.last == nil {
		t.Fatal("expected executor request")
	}
	inputs := fixture.executor.last.Inputs
	if got := inputs["permissionMode"]; got != "minimal" {
		t.Fatalf("unexpected permissionMode %#v", got)
	}
	if got := inputs["searchEnabled"]; got != false {
		t.Fatalf("unexpected searchEnabled %#v", got)
	}
	if got := inputs["frontendAffinityToken"]; got != "frontend-external" {
		t.Fatalf("unexpected frontendAffinityToken %#v", got)
	}
	if got := inputs["approvalPolicy"]; got != "on-request" {
		t.Fatalf("unexpected approvalPolicy %#v", got)
	}
	if got := inputs["sandboxPolicy"]; got != "workspace-write" {
		t.Fatalf("unexpected sandboxPolicy %#v", got)
	}
	if got := inputs["effort"]; got != "low" {
		t.Fatalf("unexpected effort %#v", got)
	}
	if got := inputs["summary"]; got != "none" {
		t.Fatalf("unexpected summary %#v", got)
	}
	systemPrompt, _ := inputs["systemPrompt"].(string)
	if systemPrompt == "" {
		t.Fatal("expected system prompt")
	}
	if want := "## Runtime execution settings"; !containsText(systemPrompt, want) {
		t.Fatalf("expected system prompt to contain %q, got %q", want, systemPrompt)
	}
	if want := "- permissionMode: minimal"; !containsText(systemPrompt, want) {
		t.Fatalf("expected system prompt to contain %q, got %q", want, systemPrompt)
	}
	if want := "## Required completion gate for create/scaffold work"; !containsText(systemPrompt, want) {
		t.Fatalf("expected system prompt to contain %q, got %q", want, systemPrompt)
	}

	persisted, err := fixture.runs.Load(result.Run.ID)
	if err != nil {
		t.Fatalf("load persisted run: %v", err)
	}
	if persisted.Status != agentruns.RunStatusRunning {
		t.Fatalf("expected persisted running status, got %#v", persisted)
	}
	if got := resolveRunInputString(persisted, "chatId"); got != result.ChatID {
		t.Fatalf("expected persisted chat id %q, got %q", result.ChatID, got)
	}
	if len(persisted.Events) == 0 || persisted.Events[len(persisted.Events)-1].Type != "run_started" {
		t.Fatalf("expected run_started event, got %#v", persisted.Events)
	}
	liveState, err := fixture.runtime.GetLiveChatState(result.Run.ID)
	if err != nil {
		t.Fatalf("get live chat state: %v", err)
	}
	if liveState == nil || !liveState.WaitingForResponse {
		t.Fatalf("expected live waiting state, got %#v", liveState)
	}
	if len(liveState.Messages) != 1 {
		t.Fatalf("expected one live message, got %#v", liveState.Messages)
	}
}

func TestSendServiceSeedsContinuationMessagesFromPriorExternalChat(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	seedChatID := "chat-source"
	fixture.seedExternalRun(t, seedChatID, agentruns.RunStatusCompleted, []map[string]any{
		{
			"id":   "source-user",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Source prompt"},
			},
		},
	}, []map[string]any{
		{
			"id":   "source-user",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Source prompt"},
			},
		},
		{
			"id":   "source-assistant",
			"role": "assistant",
			"content": []any{
				map[string]any{"type": "text", "text": "Source reply"},
			},
		},
	})

	result, err := fixture.service.StartChat(context.Background(), StartChatRequest{
		ContinueFromChatID: stringPtr(seedChatID),
		Message: map[string]any{
			"id":   "new-message",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Continue externally seeded chat"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  ChatPermissionModeMinimal,
		SearchEnabled:   true,
	})
	if err != nil {
		t.Fatalf("start continuation chat: %v", err)
	}
	if result.ChatID == seedChatID {
		t.Fatalf("expected a new chat id, got %q", result.ChatID)
	}
	if fixture.executor.last == nil {
		t.Fatal("expected executor request")
	}
	rawMessages, ok := fixture.executor.last.Inputs["messages"].([]any)
	if !ok {
		t.Fatalf("expected messages list, got %#v", fixture.executor.last.Inputs["messages"])
	}
	if len(rawMessages) != 3 {
		t.Fatalf("expected three messages, got %#v", rawMessages)
	}
	gotIDs := []string{}
	for _, raw := range rawMessages {
		message, ok := raw.(map[string]any)
		if !ok {
			t.Fatalf("expected message object, got %#v", raw)
		}
		messageID, err := messageID(message)
		if err != nil {
			t.Fatalf("message id: %v", err)
		}
		gotIDs = append(gotIDs, messageID)
	}
	expectedIDs := []string{"source-user", "source-assistant", "new-message"}
	for index, expectedID := range expectedIDs {
		if gotIDs[index] != expectedID {
			t.Fatalf("expected message ids %#v, got %#v", expectedIDs, gotIDs)
		}
	}
}

func TestSendServiceSeedsCodexThreadIDFromLatestExternalRun(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	chatID := "chat-codex-thread"
	fixture.seedExternalRun(t, chatID, agentruns.RunStatusCompleted, []map[string]any{
		{
			"id":   "source-user",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Resume this Codex chat"},
			},
		},
	}, []map[string]any{
		{
			"id":   "source-user",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Resume this Codex chat"},
			},
		},
		{
			"id":   "source-assistant",
			"role": "assistant",
			"content": []any{
				map[string]any{"type": "text", "text": "Prior Codex reply"},
			},
		},
	})

	runs, err := fixture.runs.ListByMetadata(agentruns.RunFilter{
		RunType:         stringPtr(RunTypeExternalAgent),
		ChatID:          stringPtr(chatID),
		ProjectConfigID: stringPtr("project-alpha"),
	})
	if err != nil {
		t.Fatalf("list prior external runs: %v", err)
	}
	latestRun, ok := selectLatestRun(runs)
	if !ok {
		t.Fatal("expected prior external run")
	}
	latestRun.Outputs = ensureAnyMap(latestRun.Outputs)
	latestRun.Outputs["threadId"] = "thread-codex-prior"
	if err := fixture.runs.Save(latestRun); err != nil {
		t.Fatalf("save prior thread id: %v", err)
	}

	_, err = fixture.service.StartChat(context.Background(), StartChatRequest{
		ChatID: stringPtr(chatID),
		Message: map[string]any{
			"id":   "new-message",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Continue on the same thread"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  ChatPermissionModeMinimal,
		SearchEnabled:   true,
	})
	if err != nil {
		t.Fatalf("start codex chat with prior thread: %v", err)
	}
	if fixture.executor.last == nil {
		t.Fatal("expected executor request")
	}
	if got := fixture.executor.last.Inputs["threadId"]; got != "thread-codex-prior" {
		t.Fatalf("expected prior thread id to seed executor inputs, got %#v", got)
	}
}

func TestSendServiceSeedsOpenCodeSessionIDFromLatestExternalRun(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{
		externalToolType: externalagentconfigs.ToolTypeOpenCode,
		externalRunMode:  externalagentconfigs.RunModeSDK,
	})
	chatID := "chat-opencode-session"
	fixture.seedExternalRun(t, chatID, agentruns.RunStatusCompleted, []map[string]any{
		{
			"id":   "source-user",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Resume this OpenCode chat"},
			},
		},
	}, []map[string]any{
		{
			"id":   "source-user",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Resume this OpenCode chat"},
			},
		},
		{
			"id":   "source-assistant",
			"role": "assistant",
			"content": []any{
				map[string]any{"type": "text", "text": "Prior OpenCode reply"},
			},
		},
	})

	runs, err := fixture.runs.ListByMetadata(agentruns.RunFilter{
		RunType:         stringPtr(RunTypeExternalAgent),
		ChatID:          stringPtr(chatID),
		ProjectConfigID: stringPtr("project-alpha"),
	})
	if err != nil {
		t.Fatalf("list prior external runs: %v", err)
	}
	latestRun, ok := selectLatestRun(runs)
	if !ok {
		t.Fatal("expected prior external run")
	}
	latestRun.Outputs = ensureAnyMap(latestRun.Outputs)
	latestRun.Outputs["sessionId"] = "session-opencode-prior"
	if err := fixture.runs.Save(latestRun); err != nil {
		t.Fatalf("save prior session id: %v", err)
	}

	_, err = fixture.service.StartChat(context.Background(), StartChatRequest{
		ChatID: stringPtr(chatID),
		Message: map[string]any{
			"id":   "new-message",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Continue on the same session"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  ChatPermissionModeMinimal,
		SearchEnabled:   true,
	})
	if err != nil {
		t.Fatalf("start opencode chat with prior session: %v", err)
	}
	if fixture.executor.last == nil {
		t.Fatal("expected executor request")
	}
	if got := fixture.executor.last.Inputs["sessionId"]; got != "session-opencode-prior" {
		t.Fatalf("expected prior session id to seed executor inputs, got %#v", got)
	}
}

func TestSendServiceRejectsWhitespaceFrontendAffinityToken(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	_, err := fixture.service.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Create a new project."},
			},
		},
		EngineConfigID:        fixture.engineID,
		ProjectConfigID:       "project-alpha",
		AllowUnscoped:         true,
		FrontendAffinityToken: stringPtr("   "),
		PermissionMode:        ChatPermissionModeYolo,
		SearchEnabled:         false,
	})
	if !errors.Is(err, ErrFrontendAffinityTokenInvalid) {
		t.Fatalf("expected frontend affinity token error, got %v", err)
	}
}

func TestSendServiceRejectsMissingContinuationSource(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	_, err := fixture.service.StartChat(context.Background(), StartChatRequest{
		ContinueFromChatID: stringPtr("chat-source-missing"),
		Message: map[string]any{
			"id":   "new-message",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Should fail before run creation"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  ChatPermissionModeMinimal,
		SearchEnabled:   true,
	})
	if !errors.Is(err, ErrContinueFromChatSourceNotFound) {
		t.Fatalf("expected continuation source not found, got %v", err)
	}
	var typedErr *ContinueFromChatSourceNotFoundError
	if !errors.As(err, &typedErr) {
		t.Fatalf("expected typed continuation error, got %v", err)
	}
	if typedErr.Error() != "Continuation source chat chat-source-missing not found." {
		t.Fatalf("unexpected continuation message %q", typedErr.Error())
	}
}

func TestSendServiceRejectsChatEngineMismatch(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	run := agentruns.NewRun(nil, map[string]any{
		"runType":         RunTypeManagedChat,
		"chatId":          "chat-conflict",
		"projectConfigId": "project-alpha",
		"messages":        []any{},
	}, fixture.now)
	if err := fixture.runs.Save(run); err != nil {
		t.Fatalf("save managed run: %v", err)
	}

	_, err := fixture.service.StartChat(context.Background(), StartChatRequest{
		ChatID: stringPtr("chat-conflict"),
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Hello"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  ChatPermissionModeMinimal,
		SearchEnabled:   true,
	})
	if !errors.Is(err, ErrChatEngineMismatch) {
		t.Fatalf("expected chat engine mismatch, got %v", err)
	}
}

type sendFixtureOptions struct {
	executorErr      error
	preflightStatus  *externalagentconfigs.Status
	externalToolType externalagentconfigs.ToolType
	externalRunMode  externalagentconfigs.RunMode
}

type sendServiceFixture struct {
	service  *SendService
	executor *stubExternalAgentExecutor
	runtime  *Runtime
	runs     *agentruns.RunStore
	engineID string
	now      time.Time
}

func newSendServiceFixture(t *testing.T, options sendFixtureOptions) sendServiceFixture {
	t.Helper()

	root := t.TempDir()
	engines, err := agentruns.NewEngineStore(root)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	configs, err := externalagentconfigs.NewStore(root)
	if err != nil {
		t.Fatalf("new external config store: %v", err)
	}
	runs, err := agentruns.NewRunStore(root)
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	profiles, err := agentprofiles.NewStore(root)
	if err != nil {
		t.Fatalf("new agent profile store: %v", err)
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
	now := time.Date(2026, 3, 9, 9, 0, 0, 0, time.UTC)
	runtime, err := NewRuntime(RuntimeOptions{
		Runs: runs,
		TimeNow: func() time.Time {
			return now
		},
	})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}
	toolType := options.externalToolType
	if toolType == "" {
		toolType = externalagentconfigs.ToolTypeCodex
	}
	runMode := options.externalRunMode
	if runMode == "" {
		runMode = externalagentconfigs.RunModeAppServer
	}
	commandPath := "/usr/local/bin/codex"
	if err := configs.Write([]externalagentconfigs.Config{
		{
			ID:                 "external-config",
			Name:               "Codex app-server",
			ToolType:           toolType,
			RunMode:            runMode,
			CommandPath:        &commandPath,
			WorkingDirStrategy: externalagentconfigs.WorkingDirStrategyProjectRoot,
		},
	}); err != nil {
		t.Fatalf("write external configs: %v", err)
	}
	engineID := "engine-external"
	configID := "external-config"
	if err := engines.Write([]agentruns.EngineConfig{
		{
			ID:                    engineID,
			Name:                  "External Engine",
			EngineType:            agentruns.EngineTypeExternalAgent,
			ExternalAgentConfigID: &configID,
		},
	}); err != nil {
		t.Fatalf("write engine configs: %v", err)
	}
	if err := profiles.Write([]agentprofiles.Profile{
		{
			ID:             "profile-alpha",
			Name:           "Alpha",
			EngineConfigID: &engineID,
		},
	}); err != nil {
		t.Fatalf("write profiles: %v", err)
	}

	controller := &stubRunController{}
	executor := &stubExternalAgentExecutor{
		response: StartResponse{Controller: controller},
		err:      options.executorErr,
	}
	preflightStatus := options.preflightStatus
	if preflightStatus == nil {
		preflightStatus = &externalagentconfigs.Status{
			ConfigID:  configID,
			Name:      "Codex app-server",
			ToolType:  toolType,
			RunMode:   runMode,
			Supported: true,
			Available: true,
			Issues:    []string{},
		}
	}
	service, err := NewSendService(SendServiceOptions{
		ProjectState: projectRuntime,
		Engines:      engines,
		Runs:         runs,
		Profiles:     profiles,
		Configs:      configs,
		Runtime:      runtime,
		Preflight:    stubPreflightChecker{status: *preflightStatus},
		Executor:     executor,
		TimeNow: func() time.Time {
			return now
		},
	})
	if err != nil {
		t.Fatalf("new send service: %v", err)
	}
	return sendServiceFixture{
		service:  service,
		executor: executor,
		runtime:  runtime,
		runs:     runs,
		engineID: engineID,
		now:      now,
	}
}

func (f sendServiceFixture) seedExternalRun(t *testing.T, chatID string, status agentruns.RunStatus, inputMessages []map[string]any, outputMessages []map[string]any) {
	t.Helper()

	run := agentruns.NewRun(nil, map[string]any{
		"runType":         RunTypeExternalAgent,
		"chatId":          chatID,
		"projectConfigId": "project-alpha",
		"engineConfigId":  f.engineID,
		"messages":        messageSliceToJSONList(inputMessages),
	}, f.now.Add(-time.Hour))
	run.Status = status
	if status != agentruns.RunStatusRunning {
		finishedAt := f.now.Add(-30 * time.Minute)
		run.FinishedAt = &finishedAt
	}
	if outputMessages != nil {
		run.Outputs = map[string]any{
			"messages": messageSliceToJSONList(outputMessages),
		}
	}
	if err := f.runs.Save(run); err != nil {
		t.Fatalf("save seeded external run: %v", err)
	}
}

func containsText(text string, expected string) bool {
	return text != "" && expected != "" && strings.Contains(text, expected)
}
