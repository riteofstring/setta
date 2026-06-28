package chat

import (
	"context"
	"reflect"
	"strings"
	"testing"
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

// TestCodexUnifiedExecCommandSourceIsDropped characterizes bug #1: the Codex projection drops
// commandExecution.source (and processId), so a unifiedExecStartup background terminal projects
// identically to a normal agent command. Phase 1 adds RunItemCommandSource + processId parsing;
// once that lands the two projections differ and these assertions flip.
func TestCodexUnifiedExecCommandSourceIsDropped(t *testing.T) {
	startupItem, err := runItemFromCodexItem(fakeCodexUnifiedExecItem("unifiedExecStartup"), RunItemStatusRunning)
	if err != nil {
		t.Fatalf("project unified exec startup: %v", err)
	}
	agentItem, err := runItemFromCodexItem(fakeCodexUnifiedExecItem("agent"), RunItemStatusRunning)
	if err != nil {
		t.Fatalf("project agent command: %v", err)
	}
	if !reflect.DeepEqual(startupItem, agentItem) {
		t.Fatalf("projected items differ; source/processId now preserved?\nstartup=%+v\nagent=%+v", startupItem, agentItem)
	}
	if startupItem.ProcessID != "" {
		t.Fatalf("processId unexpectedly preserved: %q", startupItem.ProcessID)
	}
}

// TestCodexHarnessDropsLateUnifiedExecCompletion characterizes bug #3: the turn sink is
// per-turn/session-scoped. A unified exec process completion that arrives after turn/completed
// never reaches the sink, so the UI can never learn the background terminal finished. The two
// startups are delivered while the turn is active and stay Running. Phase 2 routes late unified
// exec lifecycle events through a sink that outlives the turn; once that lands this flips.
func TestCodexHarnessDropsLateUnifiedExecCompletion(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("unified-exec-background"))
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
			t.Fatalf("unified exec upsert %q status = %q, want running (late completion dropped): %+v",
				item.ProviderItemID, item.Status, item)
		}
	}
	if !strings.Contains(sink.text, fakeUnifiedExecFinalText) {
		t.Fatalf("assistant text = %q, want final response streamed while processes run", sink.text)
	}
}
