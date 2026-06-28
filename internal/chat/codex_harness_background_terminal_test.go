package chat

import (
	"context"
	"reflect"
	"strings"
	"testing"
	"time"
)

// Phase 0 characterization harness for docs/plans/background_terminal_lifecycle_plan.md.
//
// These constants describe a single Codex unified-exec background terminal stream shared by
// the fake app-server mode emitter and the harness characterization test.
const (
	fakeUnifiedExecAlphaItemID  = "unified_exec_alpha_fake"
	fakeUnifiedExecBetaItemID   = "unified_exec_beta_fake"
	fakeUnifiedExecAlphaProcess = "proc_alpha_fake"
	fakeUnifiedExecBetaProcess  = "proc_beta_fake"
	fakeUnifiedExecAlphaCommand = "npm run dev"
	fakeUnifiedExecBetaCommand  = "vite --host 0.0.0.0"
	fakeUnifiedExecFinalText    = "Both dev servers are running in the background."
)

// writeFakeUnifiedExecBackgroundTurn emits two Codex commandExecution items with
// source=unifiedExecStartup that stay inProgress, the assistant's final response, the
// completed turn, and then a LATE item/completed for the alpha process emitted AFTER
// turn/completed. The harness turn sink stops at turn/completed (waitForTurn returns and
// the session closes), so the late completion never reaches the sink today.
func writeFakeUnifiedExecBackgroundTurn() {
	writeFakeAssistantDelta("Starting the dev servers. ")
	writeFakeUnifiedExecStartup(fakeUnifiedExecAlphaItemID, fakeUnifiedExecAlphaProcess, fakeUnifiedExecAlphaCommand)
	writeFakeNotification("item/commandExecution/outputDelta", map[string]any{
		"delta":    "dev server booting\n",
		"itemId":   fakeUnifiedExecAlphaItemID,
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
	writeFakeUnifiedExecStartup(fakeUnifiedExecBetaItemID, fakeUnifiedExecBetaProcess, fakeUnifiedExecBetaCommand)
	writeFakeAssistantDelta(fakeUnifiedExecFinalText)
	// The turn completes while both unified exec processes are still inProgress.
	writeFakeCompletedTurn("completed")
	// Late background-process completion: arrives after turn/completed and is dropped today.
	writeFakeNotification("item/completed", map[string]any{
		"completedAtMs": 2,
		"threadId":      "thread_fake",
		"turnId":        "turn_fake",
		"item": map[string]any{
			"command":    fakeUnifiedExecAlphaCommand,
			"cwd":        "/tmp/workspace",
			"durationMs": 5,
			"exitCode":   0,
			"id":         fakeUnifiedExecAlphaItemID,
			"processId":  fakeUnifiedExecAlphaProcess,
			"source":     "unifiedExecStartup",
			"status":     "completed",
			"type":       "commandExecution",
		},
	})
}

func writeFakeUnifiedExecStartup(itemID string, processID string, command string) {
	writeFakeNotification("item/started", map[string]any{
		"startedAtMs": 1,
		"threadId":    "thread_fake",
		"turnId":      "turn_fake",
		"item": map[string]any{
			"command":   command,
			"cwd":       "/tmp/workspace",
			"id":        itemID,
			"processId": processID,
			"source":    "unifiedExecStartup",
			"status":    "inProgress",
			"type":      "commandExecution",
		},
	})
}

func fakeCoreUnifiedExecBackgroundTurnStart(string, *fakeCodexState) bool {
	writeFakeUnifiedExecBackgroundTurn()
	return true
}

// fakeUnifiedExecOtherTurnID is a turn id distinct from the active turn (turn_fake),
// used to simulate a background terminal from an earlier turn emitting on the same
// thread while a later turn is active.
const fakeUnifiedExecOtherTurnID = "turn_other_fake"

// writeFakeUnifiedExecCrossTurnTurn starts a background terminal in the active turn,
// then emits that terminal's completion carrying a DIFFERENT turn id (as if it had
// been started in an earlier turn on the same thread). Codex delivers such a
// thread-scoped notification to the active session, where strict turn matching would
// fail the current turn unless the background terminal cross-turn router intercepts it.
func writeFakeUnifiedExecCrossTurnTurn() {
	writeFakeAssistantDelta("Continuing while a prior terminal runs. ")
	writeFakeUnifiedExecStartup(fakeUnifiedExecAlphaItemID, fakeUnifiedExecAlphaProcess, fakeUnifiedExecAlphaCommand)
	writeFakeNotification("item/completed", map[string]any{
		"completedAtMs": 3,
		"threadId":      "thread_fake",
		"turnId":        fakeUnifiedExecOtherTurnID,
		"item": map[string]any{
			"command":    fakeUnifiedExecAlphaCommand,
			"cwd":        "/tmp/workspace",
			"durationMs": 5,
			"exitCode":   0,
			"id":         fakeUnifiedExecAlphaItemID,
			"processId":  fakeUnifiedExecAlphaProcess,
			"source":     "unifiedExecStartup",
			"status":     "completed",
			"type":       "commandExecution",
		},
	})
	writeFakeAssistantDelta(fakeUnifiedExecFinalText)
	writeFakeCompletedTurn("completed")
}

func fakeCoreUnifiedExecCrossTurnStart(string, *fakeCodexState) bool {
	writeFakeUnifiedExecCrossTurnTurn()
	return true
}

// writeFakeUnifiedExecCrossTurnFirstTurn emits an earlier turn's background terminal
// completion (carrying a different turn id) as the FIRST scoped notification of the
// active turn, before any active-turn notification closes the turn-rebind window.
// Unless cross-turn background notifications are intercepted BEFORE rebind, the
// earlier turn id would rebind the active turn and then fail the real active turn's
// later notifications.
func writeFakeUnifiedExecCrossTurnFirstTurn() {
	writeFakeNotification("item/completed", map[string]any{
		"completedAtMs": 4,
		"threadId":      "thread_fake",
		"turnId":        fakeUnifiedExecOtherTurnID,
		"item": map[string]any{
			"command":    fakeUnifiedExecAlphaCommand,
			"cwd":        "/tmp/workspace",
			"durationMs": 5,
			"exitCode":   0,
			"id":         fakeUnifiedExecAlphaItemID,
			"processId":  fakeUnifiedExecAlphaProcess,
			"source":     "unifiedExecStartup",
			"status":     "completed",
			"type":       "commandExecution",
		},
	})
	writeFakeAssistantDelta(fakeUnifiedExecFinalText)
	writeFakeCompletedTurn("completed")
}

func fakeCoreUnifiedExecCrossTurnFirstStart(string, *fakeCodexState) bool {
	writeFakeUnifiedExecCrossTurnFirstTurn()
	return true
}

func fakeCodexUnifiedExecItem(source string) map[string]any {
	return map[string]any{
		"command":   fakeUnifiedExecAlphaCommand,
		"cwd":       "/tmp/workspace",
		"id":        fakeUnifiedExecAlphaItemID,
		"processId": fakeUnifiedExecAlphaProcess,
		"source":    source,
		"status":    "inProgress",
		"type":      "commandExecution",
	}
}

// TestCodexUnifiedExecCommandSourcePreserved proves the Phase 1 fix for bug #1: the Codex
// projection now preserves commandExecution.source and processId, so a unifiedExecStartup
// background terminal is distinguishable from a normal agent command without inspecting command
// text. This flipped the Phase 0 characterization that froze the dropped field.
func TestCodexUnifiedExecCommandSourcePreserved(t *testing.T) {
	startupItem, err := runItemFromCodexItem(fakeCodexUnifiedExecItem("unifiedExecStartup"), RunItemStatusRunning)
	if err != nil {
		t.Fatalf("project unified exec startup: %v", err)
	}
	if startupItem.Source == nil || *startupItem.Source != RunItemCommandSourceUnifiedExecStartup {
		t.Fatalf("startup source = %v, want %s", startupItem.Source, RunItemCommandSourceUnifiedExecStartup)
	}
	if startupItem.ProcessID != fakeUnifiedExecAlphaProcess {
		t.Fatalf("startup processId = %q, want %q", startupItem.ProcessID, fakeUnifiedExecAlphaProcess)
	}
	agentItem, err := runItemFromCodexItem(fakeCodexUnifiedExecItem("agent"), RunItemStatusRunning)
	if err != nil {
		t.Fatalf("project agent command: %v", err)
	}
	if agentItem.Source == nil || *agentItem.Source != RunItemCommandSourceAgent {
		t.Fatalf("agent source = %v, want %s", agentItem.Source, RunItemCommandSourceAgent)
	}
	if reflect.DeepEqual(startupItem, agentItem) {
		t.Fatalf("startup and agent items must differ now that source is preserved: %+v", startupItem)
	}
}

// TestCodexUnifiedExecUnknownCommandSourceFailsLoud proves an unrecognized command execution
// source is treated as provider protocol drift: the projection fails loudly instead of falling
// back to agent or silently dropping the discriminator.
func TestCodexUnifiedExecUnknownCommandSourceFailsLoud(t *testing.T) {
	_, err := runItemFromCodexItem(fakeCodexUnifiedExecItem("unifiedExecMystery"), RunItemStatusRunning)
	if err == nil {
		t.Fatal("expected unknown command source to fail")
	}
	if !strings.Contains(err.Error(), "unsupported codex command execution source") {
		t.Fatalf("error = %v, want unsupported codex command execution source", err)
	}
}

// TestCodexCommandSourcePresentButEmptyFailsLoud proves a present-but-empty or null source is
// provider protocol drift, not an omitted field: CommandExecutionSource is an enum, so the
// projection fails loudly rather than silently dropping the discriminator the way an absent
// source legitimately does.
func TestCodexCommandSourcePresentButEmptyFailsLoud(t *testing.T) {
	emptyItem := fakeCodexUnifiedExecItem("")
	if _, err := runItemFromCodexItem(emptyItem, RunItemStatusRunning); err == nil {
		t.Fatal("expected empty source to fail")
	} else if !strings.Contains(err.Error(), "source") {
		t.Fatalf("error = %v, want source drift", err)
	}

	nullItem := fakeCodexUnifiedExecItem("agent")
	nullItem["source"] = nil
	if _, err := runItemFromCodexItem(nullItem, RunItemStatusRunning); err == nil {
		t.Fatal("expected null source to fail")
	} else if !strings.Contains(err.Error(), "source") {
		t.Fatalf("error = %v, want source drift", err)
	}
}

// TestCodexCommandSourceAbsentIsNil proves an absent source projects to nil (no command source),
// so item types that never carry a source are unaffected by the present-value drift check.
func TestCodexCommandSourceAbsentIsNil(t *testing.T) {
	item := fakeCodexUnifiedExecItem("agent")
	delete(item, "source")
	projected, err := runItemFromCodexItem(item, RunItemStatusRunning)
	if err != nil {
		t.Fatalf("project item without source: %v", err)
	}
	if projected.Source != nil {
		t.Fatalf("absent source projected as %v, want nil", projected.Source)
	}
}

// TestCodexHarnessRoutesLateUnifiedExecCompletion is the Phase 2 flip of bug #3. The turn sink
// is per-turn/session-scoped, so a unified exec completion that arrives after turn/completed
// never reaches it. Phase 2 registers connection-scoped handlers on the shared manager that
// outlive the turn: during the turn the two startups still reach the run-scoped sink as running
// command executions, and the completion that arrives after turn/completed is now routed to the
// conversation-scoped BackgroundTerminalSink instead of being dropped with the closed session.
func TestCodexHarnessRoutesLateUnifiedExecCompletion(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("unified-exec-background"))
	background := newRecordingBackgroundTerminalSink()
	harness.SetBackgroundTerminalSink(background)
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)

	startups := []RunItem{}
	for _, item := range sink.items {
		if item.Type == RunItemTypeCommandExecution {
			startups = append(startups, item)
		}
	}
	if len(startups) != 2 {
		t.Fatalf("commandExecution upserts = %d, want 2 startups: %+v", len(startups), sink.items)
	}
	for _, item := range startups {
		if item.Status != RunItemStatusRunning {
			t.Fatalf("unified exec upsert %q status = %q, want running while the process keeps running: %+v",
				item.ProviderItemID, item.Status, item)
		}
	}
	if !strings.Contains(sink.text, fakeUnifiedExecFinalText) {
		t.Fatalf("assistant text = %q, want final response streamed while processes run", sink.text)
	}

	// The late completion reaches the connection-scoped sink, routed to the conversation that
	// owns the thread, with the provider item ID and process handle preserved.
	event := background.waitForCompletion(t)
	if event.providerItemID != fakeUnifiedExecAlphaItemID {
		t.Fatalf("late completion providerItemID = %q, want %q", event.providerItemID, fakeUnifiedExecAlphaItemID)
	}
	if event.providerProcessID != fakeUnifiedExecAlphaProcess {
		t.Fatalf("late completion processID = %q, want %q", event.providerProcessID, fakeUnifiedExecAlphaProcess)
	}
	if event.workspaceID != "workspace_api" || event.conversationID != "conversation_api" {
		t.Fatalf("late completion routed to %s/%s, want workspace_api/conversation_api", event.workspaceID, event.conversationID)
	}
}

// TestCodexHarnessRoutesCrossTurnUnifiedExecCompletion is the regression for the multi-turn
// scope-drift bug: a background terminal started in an earlier turn emits a completion carrying
// that earlier turn's id while a later turn is active on the same thread. Codex delivers the
// thread-scoped notification to the active session, where strict turn matching would fail the
// current turn. The cross-turn router must instead route it to the background terminal sink and
// let the active turn complete normally.
func TestCodexHarnessRoutesCrossTurnUnifiedExecCompletion(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("unified-exec-cross-turn"))
	background := newRecordingBackgroundTerminalSink()
	harness.SetBackgroundTerminalSink(background)
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)

	for _, diagnostic := range sink.diagnostics {
		if diagnostic.code == "codex_notification_scope_drift" {
			t.Fatalf("cross-turn background completion caused turn scope drift: %+v", diagnostic)
		}
	}
	if !strings.Contains(sink.text, fakeUnifiedExecFinalText) {
		t.Fatalf("assistant text = %q, want final response streamed after the cross-turn completion", sink.text)
	}

	event := background.waitForCompletion(t)
	if event.providerItemID != fakeUnifiedExecAlphaItemID {
		t.Fatalf("cross-turn completion providerItemID = %q, want %q", event.providerItemID, fakeUnifiedExecAlphaItemID)
	}
	if event.providerProcessID != fakeUnifiedExecAlphaProcess {
		t.Fatalf("cross-turn completion processID = %q, want %q", event.providerProcessID, fakeUnifiedExecAlphaProcess)
	}
	if event.workspaceID != "workspace_api" || event.conversationID != "conversation_api" {
		t.Fatalf("cross-turn completion routed to %s/%s, want workspace_api/conversation_api", event.workspaceID, event.conversationID)
	}
}

// TestCodexHarnessBackgroundTurnEndClearsFlagKeepsContext pins the safety-net invariant the
// StartTurn defer relies on: ending a thread's turn clears its active flag (so a turn that errors
// before any turn/completed cannot leave the thread permanently suppressing later
// background-terminal events) while preserving the thread's conversation context (so late events
// after the turn still route to the right conversation).
func TestCodexHarnessBackgroundTurnEndClearsFlagKeepsContext(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("stream"))
	harness.beginBackgroundTerminalTurn("thread_x", "workspace_api", "conversation_api")
	if !harness.turnActiveByThread["thread_x"] {
		t.Fatal("turn flag was not set on begin")
	}

	harness.endBackgroundTerminalTurn("thread_x")
	if harness.turnActiveByThread["thread_x"] {
		t.Fatal("turn flag was not cleared on end")
	}
	context, ok := harness.threadContexts["thread_x"]
	if !ok {
		t.Fatal("thread context was dropped on end; late events would lose their conversation")
	}
	if context.workspaceID != "workspace_api" || context.conversationID != "conversation_api" {
		t.Fatalf("thread context = %+v, want workspace_api/conversation_api", context)
	}
}

// TestCodexHarnessInterceptsCrossTurnCompletionBeforeRebind covers the ordering case the first
// cross-turn regression missed: the earlier turn's background completion is the FIRST scoped
// notification the active session receives, so the turn-rebind window is still open. The
// cross-turn router must run before rebind, so the earlier turn id cannot rebind (and then
// fail) the active turn.
func TestCodexHarnessInterceptsCrossTurnCompletionBeforeRebind(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("unified-exec-cross-turn-first"))
	background := newRecordingBackgroundTerminalSink()
	harness.SetBackgroundTerminalSink(background)
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)

	for _, diagnostic := range sink.diagnostics {
		if diagnostic.code == "codex_notification_scope_drift" {
			t.Fatalf("first-scoped cross-turn completion caused turn scope drift: %+v", diagnostic)
		}
	}
	// The cross-turn completion must NOT rebind the active turn (which a recordingSink observes
	// as a later ThreadLinked turn id); the active turn stays turn_fake.
	if sink.turnID != "turn_fake" {
		t.Fatalf("active turn = %q, want turn_fake (cross-turn completion must not rebind the active turn)", sink.turnID)
	}
	if !strings.Contains(sink.text, fakeUnifiedExecFinalText) {
		t.Fatalf("assistant text = %q, want active-turn final response after the cross-turn completion", sink.text)
	}

	event := background.waitForCompletion(t)
	if event.providerItemID != fakeUnifiedExecAlphaItemID {
		t.Fatalf("cross-turn completion providerItemID = %q, want %q", event.providerItemID, fakeUnifiedExecAlphaItemID)
	}
}

type recordedBackgroundTerminalCompletion struct {
	workspaceID       string
	conversationID    string
	providerItemID    string
	providerProcessID string
	exitCode          int
	errorMessage      string
}

type recordedBackgroundTerminalOutput struct {
	workspaceID       string
	conversationID    string
	providerItemID    string
	providerProcessID string
	stream            string
	text              string
}

// recordingBackgroundTerminalSink captures the conversation-scoped late lifecycle
// events the Codex connection handlers route after the turn has finished. Channels
// let a test block until an asynchronous late event arrives on the manager dispatch
// goroutine.
type recordingBackgroundTerminalSink struct {
	completions chan recordedBackgroundTerminalCompletion
	outputs     chan recordedBackgroundTerminalOutput
}

func newRecordingBackgroundTerminalSink() *recordingBackgroundTerminalSink {
	return &recordingBackgroundTerminalSink{
		completions: make(chan recordedBackgroundTerminalCompletion, 8),
		outputs:     make(chan recordedBackgroundTerminalOutput, 32),
	}
}

func (sink *recordingBackgroundTerminalSink) BackgroundTerminalOutputDelta(workspaceID string, conversationID string, providerItemID string, providerProcessID string, stream string, text string) error {
	sink.outputs <- recordedBackgroundTerminalOutput{
		workspaceID:       workspaceID,
		conversationID:    conversationID,
		providerItemID:    providerItemID,
		providerProcessID: providerProcessID,
		stream:            stream,
		text:              text,
	}
	return nil
}

func (sink *recordingBackgroundTerminalSink) BackgroundTerminalCompleted(workspaceID string, conversationID string, providerItemID string, providerProcessID string, exitCode int, errorMessage string) error {
	sink.completions <- recordedBackgroundTerminalCompletion{
		workspaceID:       workspaceID,
		conversationID:    conversationID,
		providerItemID:    providerItemID,
		providerProcessID: providerProcessID,
		exitCode:          exitCode,
		errorMessage:      errorMessage,
	}
	return nil
}

func (sink *recordingBackgroundTerminalSink) waitForCompletion(t *testing.T) recordedBackgroundTerminalCompletion {
	t.Helper()
	select {
	case event := <-sink.completions:
		return event
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for late background terminal completion")
		return recordedBackgroundTerminalCompletion{}
	}
}
