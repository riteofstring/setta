package chat

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

const (
	phase3BackgroundAlphaItemID  = "phase3_bg_alpha_item"
	phase3BackgroundBetaItemID   = "phase3_bg_beta_item"
	phase3BackgroundAlphaProcess = "phase3_proc_alpha"
	phase3BackgroundBetaProcess  = "phase3_proc_beta"
	phase3BackgroundThreadID     = "phase3_thread"
)

type terminatingBackgroundHarness struct {
	*FakeHarness
	result   BackgroundTerminalTerminateResult
	requests []BackgroundTerminalTerminateRequest
}

func newTerminatingBackgroundHarness(result BackgroundTerminalTerminateResult) *terminatingBackgroundHarness {
	return &terminatingBackgroundHarness{
		FakeHarness: NewFakeHarness(phase3BackgroundTerminalEvents()),
		result:      result,
	}
}

func (harness *terminatingBackgroundHarness) TerminateBackgroundTerminal(ctx context.Context, request BackgroundTerminalTerminateRequest) (BackgroundTerminalTerminateResult, error) {
	if err := ctx.Err(); err != nil {
		return BackgroundTerminalTerminateResult{}, err
	}
	harness.requests = append(harness.requests, request)
	return harness.result, nil
}

func TestServiceBackgroundTerminalPhase3ListOutputKillAndEvents(t *testing.T) {
	harness := newTerminatingBackgroundHarness(BackgroundTerminalTerminateResult{Terminated: true})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	subscription, err := service.SubscribeEvents(EventCursor{})
	if err != nil {
		t.Fatalf("subscribe events: %v", err)
	}
	defer subscription.Unsubscribe()

	workspaceID, conversationID, events := runPhase3BackgroundTerminalScenario(t, service, subscription)
	assertPhase3BackgroundTerminalStartupEvents(t, events)
	alpha := assertPhase3BackgroundTerminalProjection(t, service, workspaceID, conversationID)
	assertPhase3BackgroundTerminalLateOutput(t, service, subscription, workspaceID, conversationID, alpha)
	assertPhase3BackgroundTerminalKill(t, service, subscription, harness, workspaceID, conversationID, alpha)
}

func runPhase3BackgroundTerminalScenario(t *testing.T, service *Service, subscription *EventSubscription) (string, string, []Event) {
	t.Helper()

	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserMessage(workspaceID, conversationID, "start background terminals")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	events := receiveEventsUntil(t, subscription, func(event Event) bool {
		return eventIsMessageStatus(t, event, result.AssistantMessage.ID, MessageStatusComplete)
	})
	waitForRunStatus(t, service, workspaceID, conversationID, result.Run.ID, RunStatusCompleted)
	return workspaceID, conversationID, events
}

func assertPhase3BackgroundTerminalStartupEvents(t *testing.T, events []Event) {
	t.Helper()

	created := eventsOfType(events, EventTypeBackgroundTerminalCreated)
	if len(created) != 2 {
		t.Fatalf("created background terminal events = %d, want 2: %v", len(created), eventTypes(events))
	}
	deltas := eventsOfType(events, EventTypeBackgroundTerminalOutputDelta)
	if len(deltas) != 1 {
		t.Fatalf("output delta events = %d, want 1: %v", len(deltas), eventTypes(events))
	}
	if output := decodeBackgroundTerminalOutputDelta(t, deltas[0]); output.Text != "alpha booted\n" || output.Stream != "stdout" {
		t.Fatalf("output delta = %+v, want alpha stdout boot chunk", output)
	}
	if replaced := eventsOfType(events, EventTypeBackgroundTerminalsReplaced); len(replaced) != 0 {
		t.Fatalf("background terminal startup/output republished full list: %v", eventTypes(events))
	}
}

func assertPhase3BackgroundTerminalProjection(t *testing.T, service *Service, workspaceID string, conversationID string) BackgroundTerminalProcess {
	t.Helper()

	projection, err := service.ListBackgroundTerminals(workspaceID, conversationID)
	if err != nil {
		t.Fatalf("list background terminals: %v", err)
	}
	if len(projection.Terminals) != 2 {
		t.Fatalf("terminal projection = %+v, want two terminals", projection)
	}
	alpha := terminalByProviderProcess(t, projection.Terminals, phase3BackgroundAlphaProcess)
	if alpha.ThreadID != phase3BackgroundThreadID {
		t.Fatalf("alpha thread route = %q, want %q", alpha.ThreadID, phase3BackgroundThreadID)
	}
	if len(alpha.RecentOutput) != 1 || alpha.RecentOutput[0] != "alpha booted" {
		t.Fatalf("alpha recent output = %+v, want boot line", alpha.RecentOutput)
	}
	page, err := service.LoadBackgroundTerminalOutputPage(workspaceID, conversationID, alpha.ID, 0, 20)
	if err != nil {
		t.Fatalf("load alpha output: %v", err)
	}
	if page.ProcessID != alpha.ID || len(page.Output) != 1 || page.Output[0].Text != "alpha booted\n" {
		t.Fatalf("alpha output page = %+v, want stored boot chunk", page)
	}
	return alpha
}

func assertPhase3BackgroundTerminalLateOutput(t *testing.T, service *Service, subscription *EventSubscription, workspaceID string, conversationID string, alpha BackgroundTerminalProcess) {
	t.Helper()

	if err := service.appendBackgroundTerminalOutputFromProvider(workspaceID, conversationID, alpha.ProviderItemID, alpha.ProcessID, "stderr", "late warning\n"); err != nil {
		t.Fatalf("append late output: %v", err)
	}
	lateEvents := receiveEventsUntil(t, subscription, func(event Event) bool {
		if event.Type != EventTypeBackgroundTerminalUpdated {
			return false
		}
		process := decodeBackgroundTerminalUpdated(t, event)
		return process.ID == alpha.ID && len(process.RecentOutput) == 2 && process.RecentOutput[1] == "late warning"
	})
	if len(eventsOfType(lateEvents, EventTypeBackgroundTerminalOutputDelta)) != 1 {
		t.Fatalf("late events = %v, want one output delta", eventTypes(lateEvents))
	}
	if replaced := eventsOfType(lateEvents, EventTypeBackgroundTerminalsReplaced); len(replaced) != 0 {
		t.Fatalf("late output republished full list: %v", eventTypes(lateEvents))
	}
}

func assertPhase3BackgroundTerminalKill(t *testing.T, service *Service, subscription *EventSubscription, harness *terminatingBackgroundHarness, workspaceID string, conversationID string, alpha BackgroundTerminalProcess) {
	t.Helper()

	killed, err := service.KillBackgroundTerminal(context.Background(), workspaceID, conversationID, alpha.ID)
	if err != nil {
		t.Fatalf("kill alpha: %v", err)
	}
	if killed.Status != BackgroundTerminalTerminating {
		t.Fatalf("killed status = %q, want terminating", killed.Status)
	}
	if len(harness.requests) != 1 {
		t.Fatalf("provider termination requests = %+v, want one request", harness.requests)
	}
	request := harness.requests[0]
	if request.WorkspaceID != workspaceID ||
		request.ConversationID != conversationID ||
		request.ProcessID != alpha.ID ||
		request.ThreadID != phase3BackgroundThreadID ||
		request.ProviderProcessID != phase3BackgroundAlphaProcess {
		t.Fatalf("termination request = %+v, want alpha route", request)
	}
	killEvents := receiveEventsUntil(t, subscription, func(event Event) bool {
		if event.Type != EventTypeBackgroundTerminalUpdated {
			return false
		}
		process := decodeBackgroundTerminalUpdated(t, event)
		return process.ID == alpha.ID && process.Status == BackgroundTerminalTerminating
	})
	if len(eventsOfType(killEvents, EventTypeBackgroundTerminalsReplaced)) != 0 {
		t.Fatalf("kill republished full list: %v", eventTypes(killEvents))
	}
}

func TestServiceKillAllBackgroundTerminalsTerminatesEveryActiveProcess(t *testing.T) {
	harness := newTerminatingBackgroundHarness(BackgroundTerminalTerminateResult{Terminated: true})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	workspaceID, conversationID, _ := startPhase3BackgroundTerminalAlpha(t, service)

	projection, err := service.KillAllBackgroundTerminals(context.Background(), workspaceID, conversationID)
	if err != nil {
		t.Fatalf("kill all background terminals: %v", err)
	}
	if len(harness.requests) != 2 {
		t.Fatalf("provider termination requests = %+v, want alpha and beta", harness.requests)
	}
	for _, process := range projection.Terminals {
		if process.Status != BackgroundTerminalTerminating {
			t.Fatalf("terminal after kill all = %+v, want terminating", process)
		}
	}
}

func TestServiceKillBackgroundTerminalFailsWithoutProviderTermination(t *testing.T) {
	t.Run("unsupported harness", func(t *testing.T) {
		service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness(phase3BackgroundTerminalEvents()))
		workspaceID, conversationID, alpha := startPhase3BackgroundTerminalAlpha(t, service)

		_, err := service.KillBackgroundTerminal(context.Background(), workspaceID, conversationID, alpha.ID)
		if err == nil || !strings.Contains(err.Error(), "does not support provider termination") {
			t.Fatalf("kill error = %v, want unsupported provider termination", err)
		}
		assertBackgroundTerminalStatus(t, service, workspaceID, conversationID, alpha.ID, BackgroundTerminalRunning)
	})

	t.Run("provider rejected", func(t *testing.T) {
		harness := newTerminatingBackgroundHarness(BackgroundTerminalTerminateResult{Terminated: false})
		service := newTestService(t, t.TempDir(), testResolver(t), harness)
		workspaceID, conversationID, alpha := startPhase3BackgroundTerminalAlpha(t, service)

		_, err := service.KillBackgroundTerminal(context.Background(), workspaceID, conversationID, alpha.ID)
		if err == nil || !strings.Contains(err.Error(), "provider reported process was not terminated") {
			t.Fatalf("kill error = %v, want provider rejection", err)
		}
		if len(harness.requests) != 1 {
			t.Fatalf("provider requests = %+v, want one attempted termination", harness.requests)
		}
		assertBackgroundTerminalStatus(t, service, workspaceID, conversationID, alpha.ID, BackgroundTerminalRunning)
	})
}

func phase3BackgroundTerminalEvents() []FakeHarnessEvent {
	source := RunItemCommandSourceUnifiedExecStartup
	return []FakeHarnessEvent{
		{Type: FakeEventThreadLinked, ThreadID: phase3BackgroundThreadID, SessionID: "phase3_session", TurnID: "phase3_turn"},
		{Type: FakeEventRunItem, ProviderItemID: phase3BackgroundAlphaItemID, RunItem: RunItem{
			ProviderItemID: phase3BackgroundAlphaItemID,
			Type:           RunItemTypeCommandExecution,
			Status:         RunItemStatusRunning,
			Command:        "npm run dev",
			Cwd:            "/tmp/workspace",
			ProcessID:      phase3BackgroundAlphaProcess,
			Source:         &source,
		}},
		{Type: FakeEventRunItemOutput, ProviderItemID: phase3BackgroundAlphaItemID, Stream: "stdout", Text: "alpha booted\n"},
		{Type: FakeEventRunItem, ProviderItemID: phase3BackgroundBetaItemID, RunItem: RunItem{
			ProviderItemID: phase3BackgroundBetaItemID,
			Type:           RunItemTypeCommandExecution,
			Status:         RunItemStatusRunning,
			Command:        "vite --host 0.0.0.0",
			Cwd:            "/tmp/workspace",
			ProcessID:      phase3BackgroundBetaProcess,
			Source:         &source,
		}},
	}
}

func startPhase3BackgroundTerminalAlpha(t *testing.T, service *Service) (string, string, BackgroundTerminalProcess) {
	t.Helper()

	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserMessage(workspaceID, conversationID, "start background terminals")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, workspaceID, conversationID, result.Run.ID, RunStatusCompleted)
	projection, err := service.ListBackgroundTerminals(workspaceID, conversationID)
	if err != nil {
		t.Fatalf("list background terminals: %v", err)
	}
	return workspaceID, conversationID, terminalByProviderProcess(t, projection.Terminals, phase3BackgroundAlphaProcess)
}

func terminalByProviderProcess(t *testing.T, terminals []BackgroundTerminalProcess, providerProcessID string) BackgroundTerminalProcess {
	t.Helper()
	for _, process := range terminals {
		if process.ProcessID == providerProcessID {
			return process
		}
	}
	t.Fatalf("no terminal for provider process %q: %+v", providerProcessID, terminals)
	return BackgroundTerminalProcess{}
}

func assertBackgroundTerminalStatus(t *testing.T, service *Service, workspaceID string, conversationID string, processID string, status BackgroundTerminalStatus) {
	t.Helper()
	process, err := service.store.LoadBackgroundTerminalProcess(workspaceID, conversationID, processID)
	if err != nil {
		t.Fatalf("load background terminal %s: %v", processID, err)
	}
	if process.Status != status {
		t.Fatalf("background terminal %s status = %q, want %q", processID, process.Status, status)
	}
}

func eventIsMessageStatus(t *testing.T, event Event, messageID string, status MessageStatus) bool {
	t.Helper()
	if event.Type != EventTypeMessageUpdated {
		return false
	}
	var payload MessageUpdatedPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		t.Fatalf("decode message updated payload: %v", err)
	}
	return payload.Message.ID == messageID && payload.Message.Status == status
}

func decodeBackgroundTerminalUpdated(t *testing.T, event Event) BackgroundTerminalProcess {
	t.Helper()
	var payload BackgroundTerminalUpdatedPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		t.Fatalf("decode background terminal updated payload: %v", err)
	}
	return payload.Process
}

func decodeBackgroundTerminalOutputDelta(t *testing.T, event Event) BackgroundTerminalOutput {
	t.Helper()
	var payload BackgroundTerminalOutputDeltaPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		t.Fatalf("decode background terminal output delta payload: %v", err)
	}
	return payload.Output
}
