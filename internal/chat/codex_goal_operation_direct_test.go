package chat

import (
	"context"
	"os"
	"os/exec"
	"testing"
	"time"

	"setta/internal/codexaccount"
	"setta/internal/codexapp"
)

const directGoalOperationTimeout = 30 * time.Second

func TestCodexAppServerGoalSetUpdatesExistingGoalWithoutClear(t *testing.T) {
	manager := newDirectGoalOperationManager(t, "setta-goal-phase0")
	session, thread := startDirectGoalOperationThread(t, manager, t.TempDir())
	threadID := thread.Ref.ThreadID

	paused := codexapp.ThreadGoalStatusPaused
	firstObjective := "phase 0 direct first objective"
	first := directThreadGoalSet(t, session, codexapp.ThreadGoalSetParams{
		Objective: &firstObjective,
		Status:    &paused,
		ThreadID:  threadID,
	})

	secondObjective := "phase 0 direct replacement objective"
	second := directThreadGoalSet(t, session, codexapp.ThreadGoalSetParams{
		Objective: &secondObjective,
		Status:    &paused,
		ThreadID:  threadID,
	})

	if second.Objective != secondObjective {
		t.Fatalf("second raw set objective = %q, want %q", second.Objective, secondObjective)
	}
	if second.CreatedAt != first.CreatedAt {
		t.Fatalf("second raw set createdAt = %d, want preserved existing goal createdAt %d", second.CreatedAt, first.CreatedAt)
	}
	if second.ThreadID != first.ThreadID || second.ThreadID != threadID {
		t.Fatalf("raw set thread IDs = %q then %q, want %q", first.ThreadID, second.ThreadID, threadID)
	}
	t.Logf("direct app-server raw set preserved goal createdAt=%d while changing objective from %q to %q", first.CreatedAt, first.Objective, second.Objective)
}

func TestCodexAppServerGoalSetRejectsUnknownThread(t *testing.T) {
	manager := newDirectGoalOperationManager(t, "setta-goal-phase0")
	session := newDirectGoalOperationSession(t, manager)

	paused := codexapp.ThreadGoalStatusPaused
	objective := "phase 0 unknown thread objective"
	ctx, cancel := context.WithTimeout(context.Background(), directGoalOperationTimeout)
	defer cancel()
	_, err := session.Call(ctx, codexapp.CodexMethodThreadGoalSet, codexapp.ThreadGoalSetParams{
		Objective: &objective,
		Status:    &paused,
		ThreadID:  "thread_does_not_exist_phase0",
	})
	if err == nil {
		t.Fatal("thread/goal/set on an unknown thread succeeded")
	}
}

func TestCodexAppServerGoalStartNotificationOrder(t *testing.T) {
	unsetDirectGoalOperationEnv(t, "OPENAI_API_KEY")
	requireDirectGoalOperationChatGPTAuth(t)

	manager := newDirectGoalOperationManager(t, "setta-goal-phase0-live")
	session, thread := startDirectGoalOperationThread(t, manager, t.TempDir())
	threadID := thread.Ref.ThreadID

	paused := codexapp.ThreadGoalStatusPaused
	existingObjective := "phase 0 direct existing objective"
	directThreadGoalSet(t, session, codexapp.ThreadGoalSetParams{
		Objective: &existingObjective,
		Status:    &paused,
		ThreadID:  threadID,
	})
	directThreadGoalClear(t, session, threadID)

	active := codexapp.ThreadGoalStatusActive
	objective := "Say the word done once, then stop."
	setDone := make(chan error, 1)
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), directGoalOperationTimeout)
		defer cancel()
		_, err := session.Call(ctx, codexapp.CodexMethodThreadGoalSet, codexapp.ThreadGoalSetParams{
			Objective: &objective,
			Status:    &active,
			ThreadID:  threadID,
		})
		setDone <- err
	}()

	events := collectDirectGoalOperationEvents(t, session, func(events []directGoalOperationEvent) bool {
		return directGoalOperationIndex(events, codexapp.CodexNotificationThreadGoalCleared, "") >= 0 &&
			directGoalOperationIndex(events, codexapp.CodexNotificationThreadGoalUpdated, codexapp.ThreadGoalStatusActive) >= 0 &&
			directGoalOperationIndex(events, codexapp.CodexNotificationTurnStarted, "") >= 0
	}, directGoalOperationTimeout)
	if err := <-setDone; err != nil {
		t.Fatalf("thread/goal/set active: %v", err)
	}
	defer interruptDirectGoalOperationBestEffort(t, session, threadID, events)

	clearedIndex := directGoalOperationIndex(events, codexapp.CodexNotificationThreadGoalCleared, "")
	updatedIndex := directGoalOperationIndex(events, codexapp.CodexNotificationThreadGoalUpdated, codexapp.ThreadGoalStatusActive)
	startedIndex := directGoalOperationIndex(events, codexapp.CodexNotificationTurnStarted, "")
	if clearedIndex < 0 || updatedIndex < 0 || startedIndex < 0 {
		t.Fatalf("direct app-server events = %+v, want goal cleared, updated, and turn started", events)
	}
	if clearedIndex > updatedIndex {
		t.Fatalf("direct app-server events = %+v, want clear-before-set notification before active goal update", events)
	}
	if updatedIndex > startedIndex {
		t.Fatalf("direct app-server events = %+v, want active goal update before runtime turn/started", events)
	}
	t.Logf("direct app-server clear/set/start events: %+v", events)
}

func TestCodexAppServerGoalOperationNotificationOrder(t *testing.T) {
	t.Skip("direct app-server cannot deterministically force an automatic additional physical goal turn in a bounded characterization run; phase 0 covers non-terminal update before/after completion with deterministic protocol fixtures")
}

func TestCodexAppServerGoalTerminalNotificationOrder(t *testing.T) {
	t.Skip("direct app-server cannot deterministically force terminal goal-before/after-completion order; phase 0 covers those finality orders with deterministic protocol fixtures")
}

func TestCodexAppServerGoalRequiresIdlePersistedThread(t *testing.T) {
	t.Skip("direct app-server does not expose test controls to construct busy, ephemeral, or missing-path thread shapes without a live run race; phase 0 covers these shapes with deterministic protocol fixtures")
}

func TestCodexAppServerGoalCancelNotificationOrder(t *testing.T) {
	unsetDirectGoalOperationEnv(t, "OPENAI_API_KEY")
	requireDirectGoalOperationChatGPTAuth(t)

	manager := newDirectGoalOperationManager(t, "setta-goal-phase0-live")
	session, thread := startDirectGoalOperationThread(t, manager, t.TempDir())
	threadID := thread.Ref.ThreadID

	active := codexapp.ThreadGoalStatusActive
	objective := "Begin a short response and wait for interruption."
	setDone := make(chan error, 1)
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), directGoalOperationTimeout)
		defer cancel()
		_, err := session.Call(ctx, codexapp.CodexMethodThreadGoalSet, codexapp.ThreadGoalSetParams{
			Objective: &objective,
			Status:    &active,
			ThreadID:  threadID,
		})
		setDone <- err
	}()

	events := collectDirectGoalOperationEvents(t, session, func(events []directGoalOperationEvent) bool {
		return directGoalOperationIndex(events, codexapp.CodexNotificationTurnStarted, "") >= 0
	}, directGoalOperationTimeout)
	if err := <-setDone; err != nil {
		t.Fatalf("thread/goal/set active: %v", err)
	}
	turnID := directGoalOperationTurnID(events, codexapp.CodexNotificationTurnStarted)
	if turnID == "" {
		t.Fatalf("direct app-server events = %+v, want turn/started turn id", events)
	}

	paused := codexapp.ThreadGoalStatusPaused
	ctx, cancel := context.WithTimeout(context.Background(), directGoalOperationTimeout)
	_, pauseErr := session.Call(ctx, codexapp.CodexMethodThreadGoalSet, codexapp.ThreadGoalSetParams{
		Status:   &paused,
		ThreadID: threadID,
	})
	cancel()
	if pauseErr != nil {
		interruptDirectGoalOperationBestEffort(t, session, threadID, events)
		t.Fatalf("pause goal before interrupt: %v", pauseErr)
	}

	ctx, cancel = context.WithTimeout(context.Background(), directGoalOperationTimeout)
	_, interruptErr := session.Call(ctx, codexapp.CodexMethodTurnInterrupt, codexapp.TurnInterruptParams{
		ThreadID: threadID,
		TurnID:   turnID,
	})
	cancel()
	if interruptErr != nil {
		t.Fatalf("turn/interrupt after goal pause: %v", interruptErr)
	}

	events = append(events, collectDirectGoalOperationEvents(t, session, func(events []directGoalOperationEvent) bool {
		return directGoalOperationIndex(events, codexapp.CodexNotificationThreadGoalUpdated, codexapp.ThreadGoalStatusPaused) >= 0 &&
			directGoalOperationTurnStatusIndex(events, codexapp.TurnStatusInterrupted) >= 0
	}, directGoalOperationTimeout)...)
	pausedIndex := directGoalOperationIndex(events, codexapp.CodexNotificationThreadGoalUpdated, codexapp.ThreadGoalStatusPaused)
	interruptedIndex := directGoalOperationTurnStatusIndex(events, codexapp.TurnStatusInterrupted)
	if pausedIndex < 0 || interruptedIndex < 0 {
		t.Fatalf("direct app-server events = %+v, want paused goal update and interrupted turn completion", events)
	}
	if pausedIndex > interruptedIndex {
		t.Fatalf("direct app-server events = %+v, want paused goal update before interrupted completion", events)
	}
	t.Logf("direct app-server goal cancellation events: %+v", events)
}

type directGoalOperationEvent struct {
	Method     string
	GoalStatus codexapp.ThreadGoalStatus
	ThreadID   string
	TurnID     string
	TurnStatus codexapp.TurnStatus
}

func newDirectGoalOperationManager(t *testing.T, clientName string) *codexapp.Manager {
	t.Helper()

	requireDirectGoalOperationCodexBinary(t)
	manager := codexapp.NewManager(codexapp.ManagerConfig{
		Process: codexapp.ProcessConfig{
			Command: "codex",
			Args:    []string{"app-server", "--listen", "stdio://"},
		},
		InitializeParams: CodexInitializeParams(CodexHarnessConfig{}),
	})
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := manager.Shutdown(ctx); err != nil {
			t.Fatalf("shutdown direct Codex app-server %s: %v", clientName, err)
		}
	})
	return manager
}

func startDirectGoalOperationThread(t *testing.T, manager *codexapp.Manager, workspaceRoot string) (*codexapp.Session, codexCommandThread) {
	t.Helper()

	session := newDirectGoalOperationSession(t, manager)
	paramHarness := NewCodexHarness(CodexHarnessConfig{})
	params, err := paramHarness.codexThreadStartParams(workspaceRoot)
	if err != nil {
		t.Fatalf("build direct thread/start params: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), directGoalOperationTimeout)
	defer cancel()
	raw, err := session.Call(ctx, codexapp.CodexMethodThreadStart, params)
	if err != nil {
		t.Fatalf("direct thread/start: %v", err)
	}
	thread, err := commandThreadFromStartResponse(raw)
	if err != nil {
		t.Fatalf("decode direct thread/start response: %v", err)
	}
	if err := session.OwnThread(thread.Ref.ThreadID); err != nil {
		t.Fatalf("own direct thread: %v", err)
	}
	return session, thread
}

func newDirectGoalOperationSession(t *testing.T, manager *codexapp.Manager) *codexapp.Session {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), directGoalOperationTimeout)
	defer cancel()
	session, err := manager.NewSession(ctx)
	if err != nil {
		t.Fatalf("start direct Codex app-server session: %v", err)
	}
	session.AcceptUnscopedNotifications()
	session.AcceptUnscopedRequests()
	t.Cleanup(session.Close)
	return session
}

func directThreadGoalSet(t *testing.T, session *codexapp.Session, params codexapp.ThreadGoalSetParams) codexapp.ThreadGoal {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), directGoalOperationTimeout)
	defer cancel()
	raw, err := session.Call(ctx, codexapp.CodexMethodThreadGoalSet, params)
	if err != nil {
		t.Fatalf("thread/goal/set: %v", err)
	}
	response, err := codexapp.DecodeThreadGoalSetResponse(raw)
	if err != nil {
		t.Fatalf("decode thread/goal/set response: %v", err)
	}
	return response.Goal
}

func directThreadGoalClear(t *testing.T, session *codexapp.Session, threadID string) {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), directGoalOperationTimeout)
	defer cancel()
	raw, err := session.Call(ctx, codexapp.CodexMethodThreadGoalClear, codexapp.ThreadGoalClearParams{ThreadID: threadID})
	if err != nil {
		t.Fatalf("thread/goal/clear: %v", err)
	}
	response, err := codexapp.DecodeThreadGoalClearResponse(raw)
	if err != nil {
		t.Fatalf("decode thread/goal/clear response: %v", err)
	}
	if !response.Cleared {
		t.Fatalf("thread/goal/clear response cleared = false")
	}
}

func collectDirectGoalOperationEvents(t *testing.T, session *codexapp.Session, done func([]directGoalOperationEvent) bool, timeout time.Duration) []directGoalOperationEvent {
	t.Helper()

	deadline := time.NewTimer(timeout)
	defer deadline.Stop()
	events := []directGoalOperationEvent{}
	for {
		if done(events) {
			return events
		}
		select {
		case event, ok := <-session.Events():
			if !ok {
				t.Fatalf("direct app-server event stream closed before condition; events=%+v", events)
			}
			switch event.Kind {
			case codexapp.EventNotification:
				events = append(events, directGoalOperationEventFromNotification(t, event.Message))
				if latest := events[len(events)-1]; latest.Method == codexapp.CodexNotificationTurnStarted && latest.ThreadID != "" && latest.TurnID != "" {
					if err := session.OwnTurn(latest.ThreadID, latest.TurnID); err != nil {
						t.Fatalf("own direct turn: %v", err)
					}
				}
			case codexapp.EventRequest:
				if err := event.Message.RespondError(-32601, "direct goal operation characterization does not service provider requests"); err != nil {
					t.Fatalf("respond to direct app-server request %s: %v", event.Message.Method, err)
				}
			case codexapp.EventLifecycle:
				t.Fatalf("direct app-server lifecycle error: %v", event.Err)
			}
		case <-deadline.C:
			t.Fatalf("timed out waiting for direct app-server goal operation events; events=%+v", events)
		}
	}
}

func directGoalOperationEventFromNotification(t *testing.T, message codexapp.Message) directGoalOperationEvent {
	t.Helper()

	event := directGoalOperationEvent{Method: message.Method}
	switch message.Method {
	case codexapp.CodexNotificationThreadGoalUpdated:
		notification, err := codexapp.DecodeThreadGoalUpdatedNotification(message.Params)
		if err != nil {
			t.Fatalf("decode direct thread/goal/updated: %v", err)
		}
		event.ThreadID = notification.Goal.ThreadID
		event.GoalStatus = notification.Goal.Status
	case codexapp.CodexNotificationThreadGoalCleared:
		notification, err := codexapp.DecodeThreadGoalClearedNotification(message.Params)
		if err != nil {
			t.Fatalf("decode direct thread/goal/cleared: %v", err)
		}
		event.ThreadID = notification.ThreadID
	case codexapp.CodexNotificationTurnStarted:
		notification, err := codexapp.DecodeTurnStartedNotification(message.Params)
		if err != nil {
			t.Fatalf("decode direct turn/started: %v", err)
		}
		event.ThreadID = notification.ThreadID
		event.TurnID = notification.Turn.ID
		event.TurnStatus = notification.Turn.Status
	case codexapp.CodexNotificationTurnCompleted:
		notification, err := codexapp.DecodeTurnCompletedNotification(message.Params)
		if err != nil {
			t.Fatalf("decode direct turn/completed: %v", err)
		}
		event.ThreadID = notification.ThreadID
		event.TurnID = notification.Turn.ID
		event.TurnStatus = notification.Turn.Status
	}
	return event
}

func directGoalOperationIndex(events []directGoalOperationEvent, method string, status codexapp.ThreadGoalStatus) int {
	for index, event := range events {
		if event.Method != method {
			continue
		}
		if status != "" && event.GoalStatus != status {
			continue
		}
		return index
	}
	return -1
}

func directGoalOperationTurnStatusIndex(events []directGoalOperationEvent, status codexapp.TurnStatus) int {
	for index, event := range events {
		if event.Method == codexapp.CodexNotificationTurnCompleted && event.TurnStatus == status {
			return index
		}
	}
	return -1
}

func directGoalOperationTurnID(events []directGoalOperationEvent, method string) string {
	for _, event := range events {
		if event.Method == method && event.TurnID != "" {
			return event.TurnID
		}
	}
	return ""
}

func interruptDirectGoalOperationBestEffort(t *testing.T, session *codexapp.Session, threadID string, events []directGoalOperationEvent) {
	t.Helper()

	turnID := directGoalOperationTurnID(events, codexapp.CodexNotificationTurnStarted)
	if turnID == "" {
		return
	}
	paused := codexapp.ThreadGoalStatusPaused
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	_, _ = session.Call(ctx, codexapp.CodexMethodThreadGoalSet, codexapp.ThreadGoalSetParams{
		Status:   &paused,
		ThreadID: threadID,
	})
	cancel()
	ctx, cancel = context.WithTimeout(context.Background(), 5*time.Second)
	_, _ = session.Call(ctx, codexapp.CodexMethodTurnInterrupt, codexapp.TurnInterruptParams{
		ThreadID: threadID,
		TurnID:   turnID,
	})
	cancel()
}

func requireDirectGoalOperationChatGPTAuth(t *testing.T) {
	t.Helper()

	requireDirectGoalOperationCodexBinary(t)
	manager := codexapp.NewManager(codexapp.ManagerConfig{
		Process: codexapp.ProcessConfig{
			Command: "codex",
			Args:    []string{"app-server", "--listen", "stdio://"},
		},
		InitializeParams: map[string]any{
			"clientInfo": map[string]any{
				"name":    "setta-goal-phase0-live",
				"title":   "Setta Goal Phase 0 Live",
				"version": "dev",
			},
		},
	})
	defer func() {
		if err := manager.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown direct Codex account manager: %v", err)
		}
	}()
	service, err := codexaccount.NewService(manager, nil)
	if err != nil {
		t.Fatalf("create direct Codex account service: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	state, err := service.Read(ctx)
	if err != nil {
		t.Fatalf("read direct Codex account: %v", err)
	}
	if state.Status == codexaccount.AccountStatusUnavailable {
		t.Skipf("Codex ChatGPT auth is unavailable: %s", state.Diagnostic)
	}
	if state.Account == nil {
		t.Skip("Codex ChatGPT auth is not signed in")
	}
	switch state.Account.Type {
	case codexaccount.AccountTypeChatGPT, codexaccount.AccountTypeChatGPTAuthTokens:
		return
	case codexaccount.AccountTypeAPIKey:
		t.Skip("Codex is signed in with API-key auth; ChatGPT auth is required")
	default:
		t.Skipf("Codex account type %s is not supported for direct live tests", state.Account.Type)
	}
}

func requireDirectGoalOperationCodexBinary(t *testing.T) {
	t.Helper()

	if _, err := exec.LookPath("codex"); err != nil {
		t.Skipf("codex binary is unavailable: %v", err)
	}
}

func unsetDirectGoalOperationEnv(t *testing.T, names ...string) {
	t.Helper()

	for _, name := range names {
		value, ok := os.LookupEnv(name)
		if err := os.Unsetenv(name); err != nil {
			t.Fatalf("unset %s: %v", name, err)
		}
		t.Cleanup(func() {
			if ok {
				if err := os.Setenv(name, value); err != nil {
					t.Fatalf("restore %s: %v", name, err)
				}
				return
			}
			if err := os.Unsetenv(name); err != nil {
				t.Fatalf("restore unset %s: %v", name, err)
			}
		})
	}
}
