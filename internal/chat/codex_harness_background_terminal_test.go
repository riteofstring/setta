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
