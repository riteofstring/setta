package managedchat

import (
	"errors"
	"testing"
	"time"

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

func newManagedChatFixture(t *testing.T, live LiveChatStateProvider) managedChatFixture {
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
	service, err := NewService(ServiceOptions{
		Runs:    runs,
		Engines: engines,
		LLM:     llmRuntime,
		Live:    live,
		Stopper: runtime,
	})
	if err != nil {
		t.Fatalf("new managed chat service: %v", err)
	}
	return managedChatFixture{
		service: service,
		runs:    runs,
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
