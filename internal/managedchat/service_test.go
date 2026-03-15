package managedchat

import (
	"errors"
	"strings"
	"testing"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/llmconfig"
	"setta/internal/projectstate"
)

type stubLiveChatStateProvider struct {
	state     *ChatState
	err       error
	lastRunID string
}

func (s *stubLiveChatStateProvider) GetLiveChatState(runID string) (*ChatState, error) {
	s.lastRunID = runID
	if s.err != nil {
		return nil, s.err
	}
	if s.state == nil {
		return nil, nil
	}
	return s.state.Clone(), nil
}

type managedChatFixture struct {
	service *Service
	runs    *agentruns.RunStore
	engines *agentruns.EngineStore
	start   *stubManagedChatStarter
}

type stubManagedChatStarter struct {
	lastProfile *agentprofiles.Profile
	lastInputs  map[string]any
	run         agentruns.Run
	err         error
	disabled    bool
}

func (s *stubManagedChatStarter) Disabled() bool {
	return s == nil || s.disabled
}

func (s *stubManagedChatStarter) StartRun(profile agentprofiles.Profile, inputs map[string]any) (agentruns.Run, error) {
	clonedProfile := profile
	if profile.EngineConfigID != nil {
		engineConfigID := *profile.EngineConfigID
		clonedProfile.EngineConfigID = &engineConfigID
	}
	if profile.ToolAllowlist != nil {
		clonedProfile.ToolAllowlist = append([]string(nil), profile.ToolAllowlist...)
	}
	s.lastProfile = &clonedProfile
	s.lastInputs = cloneAnyMap(inputs)
	if s.err != nil {
		return agentruns.Run{}, s.err
	}
	if s.run.ID != "" {
		cloned := s.run.Clone()
		cloned.Inputs = cloneAnyMap(s.run.Inputs)
		return cloned, nil
	}
	var profileID *string
	if profile.ID != "" {
		profileID = stringPtr(profile.ID)
	}
	return agentruns.NewRun(profileID, inputs, time.Date(2026, 3, 9, 9, 0, 0, 0, time.UTC)), nil
}

// Hydration should prefer the latest persisted run and recover the LLM config
// from the current engine binding when that binding is still valid.
func TestServiceGetChatReturnsLatestRunAndResolvedLLMConfig(t *testing.T) {
	t.Parallel()

	fixture := newManagedChatFixture(t, nil)
	firstRun := newManagedChatRun(
		t,
		managedChatRunOptions{
			chatID:          "chat-latest",
			projectConfigID: "project-alpha",
			engineConfigID:  "engine-managed",
			startedAt:       time.Date(2026, 3, 8, 10, 0, 0, 0, time.UTC),
			status:          agentruns.RunStatusCompleted,
			inputMessages:   []map[string]any{userMessage("user-old", "Older message")},
			outputMessages:  []map[string]any{userMessage("user-old", "Older message")},
		},
	)
	secondRun := newManagedChatRun(
		t,
		managedChatRunOptions{
			chatID:          "chat-latest",
			projectConfigID: "project-alpha",
			engineConfigID:  "engine-managed",
			startedAt:       time.Date(2026, 3, 8, 11, 0, 0, 0, time.UTC),
			status:          agentruns.RunStatusCompleted,
			inputMessages:   []map[string]any{userMessage("user-new", "Newer message")},
			outputMessages: []map[string]any{
				userMessage("user-new", "Newer message"),
				assistantMessage("assistant-new", "Done"),
			},
			usage: map[string]any{
				"promptTokens":     42,
				"completionTokens": 7,
				"totalTokens":      49,
			},
		},
	)
	saveManagedChatRun(t, fixture.runs, firstRun)
	saveManagedChatRun(t, fixture.runs, secondRun)

	hydrated, err := fixture.service.GetChat("chat-latest", stringPtr("project-alpha"))
	if err != nil {
		t.Fatalf("get chat: %v", err)
	}
	if len(hydrated.Messages) != 2 {
		t.Fatalf("expected two messages, got %#v", hydrated.Messages)
	}
	if hydrated.Messages[0]["id"] != "user-new" {
		t.Fatalf("expected latest run input message, got %#v", hydrated.Messages[0])
	}
	if hydrated.Messages[1]["id"] != "assistant-new" {
		t.Fatalf("expected assistant output message, got %#v", hydrated.Messages[1])
	}
	if hydrated.WaitingForResponse {
		t.Fatal("expected completed chat hydration")
	}
	if hydrated.LLMConfig == nil || hydrated.LLMConfig.ID != "primary" {
		t.Fatalf("expected resolved llm config primary, got %#v", hydrated.LLMConfig)
	}
	if hydrated.ContextUsage == nil || hydrated.ContextUsage.ContextUsedTokens == nil || *hydrated.ContextUsage.ContextUsedTokens != 42 {
		t.Fatalf("expected resolved context usage from run outputs, got %#v", hydrated.ContextUsage)
	}
	if !hydrated.ContextUsage.Estimated {
		t.Fatalf("expected estimated context usage when context window is absent, got %#v", hydrated.ContextUsage)
	}
}

func TestServiceGetChatReturnsAppGenerationProvenanceFromRunInputs(t *testing.T) {
	t.Parallel()

	fixture := newManagedChatFixture(t, nil)
	run := newManagedChatRun(
		t,
		managedChatRunOptions{
			chatID:          "chat-app-generation",
			projectConfigID: "project-alpha",
			engineConfigID:  "engine-managed",
			startedAt:       time.Date(2026, 3, 8, 11, 30, 0, 0, time.UTC),
			status:          agentruns.RunStatusCompleted,
			inputMessages: []map[string]any{
				userMessage("user-plain", "Plain"),
				userMessage("user-app", "Build app"),
			},
			outputMessages: []map[string]any{
				userMessage("user-plain", "Plain"),
				userMessage("user-app", "Build app"),
				assistantMessage("assistant-1", "Done"),
			},
		},
	)
	run.Inputs["appGenerationByMessageId"] = map[string]any{
		"user-plain": agentruns.ChatAppGenerationMessageModePlainChat,
		"user-app":   agentruns.ChatAppGenerationMessageModeMCPServer,
		"user-bad":   "invalid_mode",
		"":           agentruns.ChatAppGenerationMessageModeJSONRender,
	}
	saveManagedChatRun(t, fixture.runs, run)

	hydrated, err := fixture.service.GetChat("chat-app-generation", stringPtr("project-alpha"))
	if err != nil {
		t.Fatalf("get chat: %v", err)
	}
	if len(hydrated.AppGenerationByMessageID) != 2 {
		t.Fatalf("expected two hydrated app-generation entries, got %#v", hydrated.AppGenerationByMessageID)
	}
	if hydrated.AppGenerationByMessageID["user-plain"] != agentruns.ChatAppGenerationMessageModePlainChat {
		t.Fatalf("expected plain chat provenance, got %#v", hydrated.AppGenerationByMessageID)
	}
	if hydrated.AppGenerationByMessageID["user-app"] != agentruns.ChatAppGenerationMessageModeMCPServer {
		t.Fatalf("expected app-generation provenance, got %#v", hydrated.AppGenerationByMessageID)
	}
}

func TestResolveContextUsageAcceptsCodexAliases(t *testing.T) {
	t.Parallel()

	run := agentruns.NewRun(nil, map[string]any{
		"runType": RunTypeManagedChat,
		"chatId":  "chat-usage-aliases",
	}, time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC))
	run.Outputs = map[string]any{
		"usage": map[string]any{
			"usedTokens":         88,
			"modelContextWindow": 258400,
		},
	}

	usage := resolveContextUsage(run)
	if usage == nil {
		t.Fatal("expected usage from codex aliases")
	}
	if usage.ContextUsedTokens == nil || *usage.ContextUsedTokens != 88 {
		t.Fatalf("unexpected context used tokens %#v", usage.ContextUsedTokens)
	}
	if usage.ContextWindowTokens == nil || *usage.ContextWindowTokens != 258400 {
		t.Fatalf("unexpected context window tokens %#v", usage.ContextWindowTokens)
	}
	if usage.Estimated {
		t.Fatalf("expected explicit context window to disable estimation, got %#v", usage)
	}
}

func TestResolveContextUsageRejectsFractionalUsageValuesAndKeepsValidStringWindow(t *testing.T) {
	t.Parallel()

	run := agentruns.NewRun(nil, map[string]any{
		"runType": RunTypeManagedChat,
		"chatId":  "chat-usage-fractional",
	}, time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC))
	run.Outputs = map[string]any{
		"usage": map[string]any{
			"promptTokens":        -0.5,
			"inputTokens":         "1.9",
			"completionTokens":    1.9,
			"contextWindowTokens": "4096",
		},
	}

	usage := resolveContextUsage(run)
	if usage == nil {
		t.Fatal("expected valid context window usage")
	}
	if usage.ContextUsedTokens != nil {
		t.Fatalf("expected invalid used token values to be ignored, got %#v", usage.ContextUsedTokens)
	}
	if usage.ContextWindowTokens == nil || *usage.ContextWindowTokens != 4096 {
		t.Fatalf("unexpected context window tokens %#v", usage.ContextWindowTokens)
	}
	if usage.Estimated {
		t.Fatalf("expected valid context window to disable estimation, got %#v", usage)
	}
}

// Running managed chats should overlay the persisted run with the current live
// state when a runtime provider is available.
func TestServiceGetChatUsesLiveOverlayWhenRunning(t *testing.T) {
	t.Parallel()

	live := &stubLiveChatStateProvider{
		state: &ChatState{
			Messages: []map[string]any{
				userMessage("user-live", "Hello"),
				assistantMessage("assistant-live", "Streaming reply"),
			},
			WaitingForResponse: true,
		},
	}
	fixture := newManagedChatFixture(t, live)
	run := newManagedChatRun(
		t,
		managedChatRunOptions{
			chatID:          "chat-live",
			projectConfigID: "project-alpha",
			engineConfigID:  "engine-managed",
			startedAt:       time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC),
			status:          agentruns.RunStatusRunning,
			inputMessages:   []map[string]any{userMessage("user-live", "Hello")},
			outputMessages:  []map[string]any{userMessage("user-live", "Hello")},
		},
	)
	saveManagedChatRun(t, fixture.runs, run)

	hydrated, err := fixture.service.GetChat("chat-live", stringPtr("project-alpha"))
	if err != nil {
		t.Fatalf("get chat: %v", err)
	}
	if live.lastRunID != run.ID {
		t.Fatalf("expected live overlay lookup for %q, got %q", run.ID, live.lastRunID)
	}
	if len(hydrated.Messages) != 2 || hydrated.Messages[1]["id"] != "assistant-live" {
		t.Fatalf("expected live overlay messages, got %#v", hydrated.Messages)
	}
	if !hydrated.WaitingForResponse {
		t.Fatal("expected live overlay waiting state")
	}
}

// Running chat hydration should still resolve llm config and usage from the
// persisted run while overlaying only live messages/waiting state.
func TestServiceGetChatUsesPersistedRunMetadataWhileLiveOverlayIsActive(t *testing.T) {
	t.Parallel()

	live := &stubLiveChatStateProvider{
		state: &ChatState{
			Messages: []map[string]any{
				userMessage("user-live", "Hello"),
				assistantMessage("assistant-live", "Streaming reply"),
			},
			WaitingForResponse: true,
		},
	}
	fixture := newManagedChatFixture(t, live)
	run := newManagedChatRun(
		t,
		managedChatRunOptions{
			chatID:          "chat-live-metadata",
			projectConfigID: "project-alpha",
			engineConfigID:  "engine-managed",
			startedAt:       time.Date(2026, 3, 8, 12, 30, 0, 0, time.UTC),
			status:          agentruns.RunStatusRunning,
			inputMessages:   []map[string]any{userMessage("user-live", "Hello")},
			outputMessages:  []map[string]any{userMessage("user-live", "Hello")},
			usage: map[string]any{
				"promptTokens":     24,
				"completionTokens": 3,
				"modelContextWindow": 128000,
			},
		},
	)
	saveManagedChatRun(t, fixture.runs, run)

	hydrated, err := fixture.service.GetChat("chat-live-metadata", stringPtr("project-alpha"))
	if err != nil {
		t.Fatalf("get chat: %v", err)
	}
	if len(hydrated.Messages) != 2 || hydrated.Messages[1]["id"] != "assistant-live" {
		t.Fatalf("expected live overlay messages, got %#v", hydrated.Messages)
	}
	if !hydrated.WaitingForResponse {
		t.Fatal("expected live overlay waiting state")
	}
	if hydrated.LLMConfig == nil || hydrated.LLMConfig.ID != "primary" {
		t.Fatalf("expected persisted run engine metadata to resolve primary llm config, got %#v", hydrated.LLMConfig)
	}
	if hydrated.ContextUsage == nil || hydrated.ContextUsage.ContextUsedTokens == nil || *hydrated.ContextUsage.ContextUsedTokens != 24 {
		t.Fatalf("expected persisted run usage metadata, got %#v", hydrated.ContextUsage)
	}
	if hydrated.ContextUsage.ContextWindowTokens == nil || *hydrated.ContextUsage.ContextWindowTokens != 128000 {
		t.Fatalf("expected persisted context window metadata, got %#v", hydrated.ContextUsage)
	}
}

// Hydration must stay tolerant of legacy or missing engine metadata and return
// a null llmConfig instead of failing the whole chat read.
func TestServiceGetChatAllowsMissingEngineMetadata(t *testing.T) {
	t.Parallel()

	fixture := newManagedChatFixture(t, nil)
	run := newManagedChatRun(
		t,
		managedChatRunOptions{
			chatID:          "chat-missing-engine",
			projectConfigID: "project-alpha",
			engineConfigID:  "engine-managed",
			startedAt:       time.Date(2026, 3, 8, 13, 0, 0, 0, time.UTC),
			status:          agentruns.RunStatusCompleted,
			inputMessages:   []map[string]any{userMessage("user-1", "Hello")},
			outputMessages:  []map[string]any{assistantMessage("assistant-1", "Done")},
		},
	)
	delete(run.Inputs, "engineConfigId")
	saveManagedChatRun(t, fixture.runs, run)

	hydrated, err := fixture.service.GetChat("chat-missing-engine", stringPtr("project-alpha"))
	if err != nil {
		t.Fatalf("get chat: %v", err)
	}
	if hydrated.LLMConfig != nil {
		t.Fatalf("expected nil llmConfig for missing engine metadata, got %#v", hydrated.LLMConfig)
	}
	if len(hydrated.Messages) != 2 {
		t.Fatalf("expected persisted messages to remain readable, got %#v", hydrated.Messages)
	}
}

func TestServiceGetChatAllowsNonSettaLLMEngineMetadata(t *testing.T) {
	t.Parallel()

	fixture := newManagedChatFixture(t, nil)
	run := newManagedChatRun(
		t,
		managedChatRunOptions{
			chatID:          "chat-external-engine",
			projectConfigID: "project-alpha",
			engineConfigID:  "engine-external",
			startedAt:       time.Date(2026, 3, 8, 13, 15, 0, 0, time.UTC),
			status:          agentruns.RunStatusCompleted,
			inputMessages:   []map[string]any{userMessage("user-1", "Hello")},
			outputMessages:  []map[string]any{assistantMessage("assistant-1", "Done")},
		},
	)
	saveManagedChatRun(t, fixture.runs, run)

	hydrated, err := fixture.service.GetChat("chat-external-engine", stringPtr("project-alpha"))
	if err != nil {
		t.Fatalf("get chat: %v", err)
	}
	if hydrated.LLMConfig != nil {
		t.Fatalf("expected nil llmConfig for non-setta engine metadata, got %#v", hydrated.LLMConfig)
	}
}

func TestServiceGetChatAllowsBlankLLMConfigBinding(t *testing.T) {
	t.Parallel()

	fixture := newManagedChatFixture(t, nil)
	if err := fixture.engines.Write([]agentruns.EngineConfig{
		{
			ID:         "engine-managed",
			Name:       "Managed Engine",
			EngineType: agentruns.EngineTypeSettaLLM,
		},
		{
			ID:                    "engine-external",
			Name:                  "External Engine",
			EngineType:            agentruns.EngineTypeExternalAgent,
			ExternalAgentConfigID: stringPtr("external-config"),
		},
	}); err != nil {
		t.Fatalf("rewrite engine configs: %v", err)
	}

	run := newManagedChatRun(
		t,
		managedChatRunOptions{
			chatID:          "chat-blank-config",
			projectConfigID: "project-alpha",
			engineConfigID:  "engine-managed",
			startedAt:       time.Date(2026, 3, 8, 13, 30, 0, 0, time.UTC),
			status:          agentruns.RunStatusCompleted,
			inputMessages:   []map[string]any{userMessage("user-1", "Hello")},
			outputMessages:  []map[string]any{assistantMessage("assistant-1", "Done")},
		},
	)
	saveManagedChatRun(t, fixture.runs, run)

	hydrated, err := fixture.service.GetChat("chat-blank-config", stringPtr("project-alpha"))
	if err != nil {
		t.Fatalf("get chat: %v", err)
	}
	if hydrated.LLMConfig != nil {
		t.Fatalf("expected nil llmConfig for blank llm binding, got %#v", hydrated.LLMConfig)
	}
}

func TestServiceGetChatAllowsUnresolvedLLMConfigBinding(t *testing.T) {
	t.Parallel()

	fixture := newManagedChatFixture(t, nil)
	missingConfigID := "missing-config"
	if err := fixture.engines.Write([]agentruns.EngineConfig{
		{
			ID:               "engine-managed",
			Name:             "Managed Engine",
			EngineType:       agentruns.EngineTypeSettaLLM,
			SettaLLMConfigID: &missingConfigID,
		},
		{
			ID:                    "engine-external",
			Name:                  "External Engine",
			EngineType:            agentruns.EngineTypeExternalAgent,
			ExternalAgentConfigID: stringPtr("external-config"),
		},
	}); err != nil {
		t.Fatalf("rewrite engine configs: %v", err)
	}

	run := newManagedChatRun(
		t,
		managedChatRunOptions{
			chatID:          "chat-unresolved-config",
			projectConfigID: "project-alpha",
			engineConfigID:  "engine-managed",
			startedAt:       time.Date(2026, 3, 8, 13, 45, 0, 0, time.UTC),
			status:          agentruns.RunStatusCompleted,
			inputMessages:   []map[string]any{userMessage("user-1", "Hello")},
			outputMessages:  []map[string]any{assistantMessage("assistant-1", "Done")},
		},
	)
	saveManagedChatRun(t, fixture.runs, run)

	hydrated, err := fixture.service.GetChat("chat-unresolved-config", stringPtr("project-alpha"))
	if err != nil {
		t.Fatalf("get chat: %v", err)
	}
	if hydrated.LLMConfig != nil {
		t.Fatalf("expected nil llmConfig for unresolved llm binding, got %#v", hydrated.LLMConfig)
	}
}

// Missing managed chats should surface the typed not-found error so transport
// can map it to the frontend's terminal hydration failure path.
func TestServiceGetChatReturnsChatNotFound(t *testing.T) {
	t.Parallel()

	fixture := newManagedChatFixture(t, nil)

	_, err := fixture.service.GetChat("missing-chat", stringPtr("project-alpha"))
	if !errors.Is(err, ErrChatNotFound) {
		t.Fatalf("expected managed chat not found, got %v", err)
	}
}

// Stop should target the latest running managed run, persist cancellation, and
// surface the newest assistant output message id for UI interruption marking.
func TestServiceStopChatCancelsLatestRunningRun(t *testing.T) {
	t.Parallel()

	fixture := newManagedChatFixture(t, nil)
	run := newManagedChatRun(
		t,
		managedChatRunOptions{
			chatID:          "chat-stop",
			projectConfigID: "project-alpha",
			engineConfigID:  "engine-managed",
			startedAt:       time.Date(2026, 3, 8, 14, 0, 0, 0, time.UTC),
			status:          agentruns.RunStatusRunning,
			inputMessages:   []map[string]any{userMessage("user-1", "Hello")},
			outputMessages: []map[string]any{
				userMessage("user-1", "Hello"),
				assistantMessage("assistant-stop", "Partial reply"),
			},
		},
	)
	saveManagedChatRun(t, fixture.runs, run)

	result, err := fixture.service.StopChat("chat-stop")
	if err != nil {
		t.Fatalf("stop chat: %v", err)
	}
	if result.AlreadyStopped {
		t.Fatalf("expected active stop result, got %#v", result)
	}
	if result.StoppedRunID == nil || *result.StoppedRunID != run.ID {
		t.Fatalf("expected stopped run id %q, got %#v", run.ID, result.StoppedRunID)
	}
	if result.StoppedMessageID == nil || *result.StoppedMessageID != "assistant-stop" {
		t.Fatalf("expected latest assistant output id, got %#v", result.StoppedMessageID)
	}
	persisted, err := fixture.runs.Load(run.ID)
	if err != nil {
		t.Fatalf("load stopped run: %v", err)
	}
	if persisted.Status != agentruns.RunStatusCancelled {
		t.Fatalf("expected cancelled run status, got %#v", persisted.Status)
	}
}

// Historical assistant messages copied into run inputs must not be reported as
// the newly interrupted assistant message when a running chat is cancelled.
func TestServiceStopChatIgnoresHistoricalAssistantInputs(t *testing.T) {
	t.Parallel()

	fixture := newManagedChatFixture(t, nil)
	run := newManagedChatRun(
		t,
		managedChatRunOptions{
			chatID:          "chat-stop-historical",
			projectConfigID: "project-alpha",
			engineConfigID:  "engine-managed",
			startedAt:       time.Date(2026, 3, 8, 15, 0, 0, 0, time.UTC),
			status:          agentruns.RunStatusRunning,
			inputMessages:   []map[string]any{assistantMessage("assistant-old", "Completed reply")},
		},
	)
	saveManagedChatRun(t, fixture.runs, run)

	result, err := fixture.service.StopChat("chat-stop-historical")
	if err != nil {
		t.Fatalf("stop chat: %v", err)
	}
	if result.AlreadyStopped {
		t.Fatalf("expected active stop result, got %#v", result)
	}
	if result.StoppedMessageID != nil {
		t.Fatalf("expected no newly stopped assistant message id, got %#v", result.StoppedMessageID)
	}
}

// Stop should still succeed idempotently when the chat no longer has a running
// managed run behind it.
func TestServiceStopChatReturnsAlreadyStoppedWhenNoRunningRun(t *testing.T) {
	t.Parallel()

	fixture := newManagedChatFixture(t, nil)

	result, err := fixture.service.StopChat("missing-chat")
	if err != nil {
		t.Fatalf("stop chat: %v", err)
	}
	if !result.AlreadyStopped {
		t.Fatalf("expected already stopped result, got %#v", result)
	}
	if result.StoppedRunID != nil || result.StoppedMessageID != nil {
		t.Fatalf("expected nil stop metadata, got %#v", result)
	}
}

// Managed send should own request validation, prompt shaping, and run inputs
// before handing execution off to the injected runtime boundary.
func TestServiceStartChatBuildsManagedInputsAndCombinedPrompt(t *testing.T) {
	t.Parallel()

	starter := &stubManagedChatStarter{}
	fixture := newManagedChatFixture(t, nil, starter)

	result, err := fixture.service.StartChat(StartChatRequest{
		Message:                 userMessage("user-managed", "Create a new project."),
		EngineConfigID:          "engine-managed",
		AgentProfileID:          stringPtr("profile-alpha"),
		Thinking:                false,
		ProjectConfigID:         "project-alpha",
		AllowUnscoped:           true,
		FrontendAffinityToken:   stringPtr("  frontend-managed  "),
		PermissionMode:          ChatPermissionModeYolo,
		SearchEnabled:           false,
		AppGenerationMode:       stringPtr(AppGenerationModeJSONRender),
		AppSpecStreamingEnabled: true,
		AdditionalInputs: map[string]any{
			"stateMachineRunId": "workflow-run-1",
		},
	})
	if err != nil {
		t.Fatalf("start chat: %v", err)
	}
	if result.ChatID == "" {
		t.Fatal("expected generated chat id")
	}
	if starter.lastProfile == nil {
		t.Fatal("expected starter to capture profile")
	}
	systemPrompt := starter.lastProfile.SystemPrompt
	if !strings.Contains(systemPrompt, "Follow the active profile rules.") {
		t.Fatalf("expected profile system prompt in managed prompt, got %q", systemPrompt)
	}
	if !strings.Contains(systemPrompt, "## Runtime execution settings") {
		t.Fatalf("expected execution settings in managed prompt, got %q", systemPrompt)
	}
	if !strings.Contains(systemPrompt, "- permissionMode: yolo") {
		t.Fatalf("expected permission mode in managed prompt, got %q", systemPrompt)
	}
	if !strings.Contains(systemPrompt, "- searchEnabled: false") {
		t.Fatalf("expected search flag in managed prompt, got %q", systemPrompt)
	}
	if !strings.Contains(systemPrompt, "## Required completion gate for create/scaffold work") {
		t.Fatalf("expected completion gate in managed prompt, got %q", systemPrompt)
	}
	if !strings.Contains(systemPrompt, "streamingPreview: enabled") {
		t.Fatalf("expected app generation prompt in managed prompt, got %q", systemPrompt)
	}
	if starter.lastInputs["permissionMode"] != "yolo" {
		t.Fatalf("expected permissionMode input, got %#v", starter.lastInputs["permissionMode"])
	}
	if starter.lastInputs["searchEnabled"] != false {
		t.Fatalf("expected searchEnabled=false, got %#v", starter.lastInputs["searchEnabled"])
	}
	if starter.lastInputs["frontendAffinityToken"] != "frontend-managed" {
		t.Fatalf("expected normalized frontend affinity token, got %#v", starter.lastInputs["frontendAffinityToken"])
	}
	if starter.lastInputs["runType"] != RunTypeManagedChat {
		t.Fatalf("expected managed run type, got %#v", starter.lastInputs["runType"])
	}
	if starter.lastInputs["stateMachineRunId"] != "workflow-run-1" {
		t.Fatalf("expected additional managed run input, got %#v", starter.lastInputs["stateMachineRunId"])
	}
}

// Continuation should seed history from the latest available run even when the
// source chat was last written by an external-agent runtime.
func TestServiceStartChatContinueFromChatSeedsExternalSourceHistory(t *testing.T) {
	t.Parallel()

	starter := &stubManagedChatStarter{}
	fixture := newManagedChatFixture(t, nil, starter)
	sourceRun := agentruns.NewRun(nil, map[string]any{
		"runType":         "external_agent",
		"chatId":          "chat-source",
		"projectConfigId": "project-alpha",
		"messages": []any{
			userMessage("source-user", "Seed prompt"),
		},
	}, time.Date(2026, 3, 8, 17, 0, 0, 0, time.UTC))
	sourceRun.Status = agentruns.RunStatusCompleted
	finishedAt := time.Date(2026, 3, 8, 17, 0, 5, 0, time.UTC)
	sourceRun.FinishedAt = &finishedAt
	sourceRun.Outputs = map[string]any{
		"messages": []any{
			userMessage("source-user", "Seed prompt"),
			assistantMessage("source-assistant", "Seed reply"),
		},
	}
	saveManagedChatRun(t, fixture.runs, sourceRun)

	_, err := fixture.service.StartChat(StartChatRequest{
		ContinueFromChatID: stringPtr("chat-source"),
		Message:            userMessage("new-user", "Continue this chat."),
		EngineConfigID:     "engine-managed",
		ProjectConfigID:    "project-alpha",
		AllowUnscoped:      true,
		PermissionMode:     ChatPermissionModeMinimal,
		SearchEnabled:      true,
	})
	if err != nil {
		t.Fatalf("start chat: %v", err)
	}
	rawMessages, ok := starter.lastInputs["messages"].([]any)
	if !ok {
		t.Fatalf("expected managed messages payload, got %#v", starter.lastInputs["messages"])
	}
	if len(rawMessages) != 3 {
		t.Fatalf("expected seeded history plus new message, got %#v", rawMessages)
	}
	if message, ok := rawMessages[0].(map[string]any); !ok || message["id"] != "source-user" {
		t.Fatalf("expected first seeded message, got %#v", rawMessages[0])
	}
	if message, ok := rawMessages[1].(map[string]any); !ok || message["id"] != "source-assistant" {
		t.Fatalf("expected second seeded message, got %#v", rawMessages[1])
	}
	if message, ok := rawMessages[2].(map[string]any); !ok || message["id"] != "new-user" {
		t.Fatalf("expected final new message, got %#v", rawMessages[2])
	}
}

// Branch-edit validation should fail before runtime start if the branch source
// message cannot be found in the parent managed chat history.
func TestServiceStartChatBranchEditMissingMessageReturnsNotFound(t *testing.T) {
	t.Parallel()

	starter := &stubManagedChatStarter{}
	fixture := newManagedChatFixture(t, nil, starter)
	run := newManagedChatRun(
		t,
		managedChatRunOptions{
			chatID:          "chat-parent",
			projectConfigID: "project-alpha",
			engineConfigID:  "engine-managed",
			startedAt:       time.Date(2026, 3, 8, 18, 0, 0, 0, time.UTC),
			status:          agentruns.RunStatusCompleted,
			inputMessages:   []map[string]any{userMessage("msg-1", "Original prompt")},
			outputMessages:  []map[string]any{userMessage("msg-1", "Original prompt")},
		},
	)
	saveManagedChatRun(t, fixture.runs, run)

	_, err := fixture.service.StartChat(StartChatRequest{
		Message:             userMessage("edited", "Edited prompt"),
		EngineConfigID:      "engine-managed",
		ProjectConfigID:     "project-alpha",
		AllowUnscoped:       true,
		BranchParentChatID:  stringPtr("chat-parent"),
		BranchFromMessageID: stringPtr("missing"),
		PermissionMode:      ChatPermissionModeMinimal,
		SearchEnabled:       true,
	})
	var branchErr *BranchMessageNotFoundError
	if !errors.As(err, &branchErr) {
		t.Fatalf("expected branch message not found error, got %v", err)
	}
	if starter.lastInputs != nil {
		t.Fatalf("expected branch validation failure before start, got %#v", starter.lastInputs)
	}
}

// Managed sends should fail explicitly when the runtime boundary exists but the
// underlying executor is still unavailable in the real app wiring.
func TestServiceStartChatReturnsExecutorUnavailableWhenStarterDisabled(t *testing.T) {
	t.Parallel()

	fixture := newManagedChatFixture(t, nil, &stubManagedChatStarter{disabled: true})

	_, err := fixture.service.StartChat(StartChatRequest{
		Message:         userMessage("user-1", "Hello"),
		EngineConfigID:  "engine-managed",
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  ChatPermissionModeMinimal,
		SearchEnabled:   true,
	})
	if !errors.Is(err, agentruns.ErrManagedExecutorUnavailable) {
		t.Fatalf("expected managed executor unavailable, got %v", err)
	}
}

func newManagedChatFixture(t *testing.T, live LiveChatStateProvider, starters ...ChatStarter) managedChatFixture {
	t.Helper()

	root := t.TempDir()
	runs, err := agentruns.NewRunStore(root)
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	engines, err := agentruns.NewEngineStore(root)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	profiles, err := agentprofiles.NewStore(root)
	if err != nil {
		t.Fatalf("new profile store: %v", err)
	}
	managedConfigID := "primary"
	externalConfigID := "external-config"
	if err := engines.Write([]agentruns.EngineConfig{
		{
			ID:               "engine-managed",
			Name:             "Managed Engine",
			EngineType:       agentruns.EngineTypeSettaLLM,
			SettaLLMConfigID: &managedConfigID,
		},
		{
			ID:                    "engine-external",
			Name:                  "External Engine",
			EngineType:            agentruns.EngineTypeExternalAgent,
			ExternalAgentConfigID: &externalConfigID,
		},
	}); err != nil {
		t.Fatalf("write engine configs: %v", err)
	}
	llmRuntime, err := llmconfig.NewRuntime(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			managedConfigID: {
				ID:        managedConfigID,
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
	runService, err := agentruns.NewService(agentruns.ServiceOptions{
		ProjectState: projectRuntime,
		Engines:      engines,
		Runs:         runs,
		LLM:          llmRuntime,
		TimeNow: func() time.Time {
			return time.Date(2026, 3, 9, 9, 0, 0, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatalf("new managed run service: %v", err)
	}
	runtime, err := agentruns.NewRuntime(agentruns.RuntimeOptions{
		Service: runService,
	})
	if err != nil {
		t.Fatalf("new managed run runtime: %v", err)
	}
	var starter ChatStarter = runtime
	var starterStub *stubManagedChatStarter
	if len(starters) != 0 && starters[0] != nil {
		starter = starters[0]
		if resolved, ok := starters[0].(*stubManagedChatStarter); ok {
			starterStub = resolved
		}
	}
	service, err := NewService(ServiceOptions{
		ProjectState: projectRuntime,
		Runs:         runs,
		Engines:      engines,
		LLM:          llmRuntime,
		Profiles:     profiles,
		Starter:      starter,
		Live:         live,
		Stopper:      runtime,
	})
	if err != nil {
		t.Fatalf("new managed chat service: %v", err)
	}
	if err := profiles.Write([]agentprofiles.Profile{
		{
			ID:             "profile-alpha",
			Name:           "Alpha",
			Description:    "Helpful profile",
			SystemPrompt:   "Follow the active profile rules.",
			EngineConfigID: stringPtr("engine-managed"),
		},
	}); err != nil {
		t.Fatalf("write profiles: %v", err)
	}
	return managedChatFixture{
		service: service,
		runs:    runs,
		engines: engines,
		start:   starterStub,
	}
}

type managedChatRunOptions struct {
	chatID          string
	projectConfigID string
	engineConfigID  string
	startedAt       time.Time
	status          agentruns.RunStatus
	inputMessages   []map[string]any
	outputMessages  []map[string]any
	usage           map[string]any
}

func newManagedChatRun(t *testing.T, options managedChatRunOptions) agentruns.Run {
	t.Helper()

	run := agentruns.NewRun(nil, map[string]any{
		"runType":         RunTypeManagedChat,
		"chatId":          options.chatID,
		"projectConfigId": options.projectConfigID,
		"engineConfigId":  options.engineConfigID,
		"messages":        messageList(options.inputMessages),
	}, options.startedAt)
	run.Status = options.status
	run.Events = []agentruns.RunEvent{
		agentruns.NewRunEvent("run_started", map[string]any{
			"chatId":          options.chatID,
			"projectConfigId": options.projectConfigID,
			"engineConfigId":  options.engineConfigID,
		}, options.startedAt),
	}
	if options.status != agentruns.RunStatusRunning {
		finishedAt := options.startedAt.Add(5 * time.Second)
		run.FinishedAt = &finishedAt
	}
	if options.outputMessages != nil || options.usage != nil {
		outputs := map[string]any{}
		if options.outputMessages != nil {
			outputs["messages"] = messageList(options.outputMessages)
		}
		if options.usage != nil {
			outputs["usage"] = cloneAnyMap(options.usage)
		}
		run.Outputs = outputs
	}
	return run
}

func saveManagedChatRun(t *testing.T, store *agentruns.RunStore, run agentruns.Run) {
	t.Helper()

	if err := store.Save(run); err != nil {
		t.Fatalf("save managed chat run: %v", err)
	}
}

func userMessage(id string, text string) map[string]any {
	return map[string]any{
		"id":          id,
		"role":        "user",
		"content":     []any{map[string]any{"type": "text", "text": text}},
		"attachments": []any{},
	}
}

func assistantMessage(id string, text string) map[string]any {
	return map[string]any{
		"id":          id,
		"role":        "assistant",
		"content":     []any{map[string]any{"type": "text", "text": text}},
		"attachments": []any{},
		"tool_calls":  nil,
	}
}

func messageList(messages []map[string]any) []any {
	result := make([]any, 0, len(messages))
	for _, message := range messages {
		result = append(result, cloneAnyMap(message))
	}
	return result
}
