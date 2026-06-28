package chat

import (
	"context"
	"testing"

	"setta/internal/workspace"
)

// backgroundTerminalFixtureEvents runs the Phase 0 background terminal fixture against an
// ordered recording sink and returns the emitted provider events so each focused test can
// freeze one chronology property. It reuses orderedChronoSink and the chronoSinkEvent
// helpers from the chronological transcript characterization harness.
func backgroundTerminalFixtureEvents(t *testing.T) []chronoSinkEvent {
	t.Helper()
	sink := &orderedChronoSink{}
	request := TurnRequest{
		Run:       Run{ID: "run_bg"},
		Workspace: workspace.WorkspaceSummary{RootPath: "/tmp/workspace"},
	}
	completion, err := scriptedBackgroundTerminalTurn(NewScriptedWorkflowHarness(), context.Background(), request, sink)
	if err != nil {
		t.Fatalf("background terminal fixture: %v", err)
	}
	if completion.Outcome != TurnOutcomeCompleted {
		t.Fatalf("completion outcome = %q, want %q", completion.Outcome, TurnOutcomeCompleted)
	}
	return sink.events
}

// TestBackgroundTerminalFixtureLeavesProcessesRunning freezes that the fixture starts two
// distinct background terminals and never emits a completed upsert for either: the processes
// keep running past the turn. This provider-level property is stable across phases; only the
// backend's handling of the still-running processes changes.
func TestBackgroundTerminalFixtureLeavesProcessesRunning(t *testing.T) {
	events := backgroundTerminalFixtureEvents(t)
	terminalIDs := distinctRunItemIDs(events, isCommandItem)
	if len(terminalIDs) != 2 {
		t.Fatalf("distinct background terminals = %d, want 2: %+v", len(terminalIDs), terminalIDs)
	}
	for _, event := range events {
		if event.kind != "run_item_upsert" || !isCommandItem(event.item) {
			continue
		}
		if event.item.Status != RunItemStatusRunning {
			t.Fatalf("background terminal %q upsert status = %q, want running (never completes in-turn): %+v",
				event.itemID, event.item.Status, event.item)
		}
	}
	if chunks := countOutputChunks(events, "bg-alpha-run_bg"); chunks != backgroundTerminalAlphaOutputChunks {
		t.Fatalf("alpha output chunks = %d, want %d", chunks, backgroundTerminalAlphaOutputChunks)
	}
}

// TestBackgroundTerminalFixtureTextWrapsStartups freezes that assistant text is emitted both
// before the terminals start and after they are running (text -> startups -> text), so the
// final response streams while the terminals are still live.
func TestBackgroundTerminalFixtureTextWrapsStartups(t *testing.T) {
	events := backgroundTerminalFixtureEvents(t)
	firstStartup := indexOfRunItem(events, 0, isCommandItem)
	if firstStartup < 0 {
		t.Fatalf("fixture emitted no background terminal startup: %+v", events)
	}
	if !hasAssistantText(events[:firstStartup], backgroundTerminalAssistantTextOne) {
		t.Fatalf("missing assistant text before first startup: %+v", events)
	}
	if !hasAssistantText(events[firstStartup:], backgroundTerminalAssistantTextTwo) {
		t.Fatalf("missing final assistant text after startups: %+v", events)
	}
}

// TestServiceFinalizesBackgroundTerminalWithRun characterizes the CURRENT buggy behavior: the
// provider leaves two background terminals running, but run finalization coerces their activity
// blocks to complete because the backend has no background terminal lifecycle yet. Once
// RunItemCommandSource lands (Phase 1) and finalization is updated (Phase 4) so background
// terminals are not finalized by run outcome, these assertions flip to assert the terminals
// survive the completed run.
func TestServiceFinalizesBackgroundTerminalWithRun(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewScriptedWorkflowHarness())
	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserMessage(workspaceID, conversationID, "background terminal workflow")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, workspaceID, conversationID, result.Run.ID, RunStatusCompleted)

	blocks := loadPersistedBlocks(t, service, workspaceID, result.Run.ID)
	// The activity label is the command, derived by the Go projection since the fixture
	// supplies no friendly title.
	for _, label := range []string{backgroundTerminalAlphaCommand, backgroundTerminalBetaCommand} {
		block := backgroundTerminalActivityBlock(t, blocks, label)
		if block.Status != TranscriptBlockStatusComplete {
			t.Fatalf("background terminal block %q status = %q, want %q (finalized with run)",
				label, block.Status, TranscriptBlockStatusComplete)
		}
		if block.Activity.Status != RunItemStatusCompleted {
			t.Fatalf("background terminal block %q activity status = %q, want %q (finalized with run)",
				label, block.Activity.Status, RunItemStatusCompleted)
		}
	}
}

func backgroundTerminalActivityBlock(t *testing.T, blocks []TranscriptBlock, title string) TranscriptBlock {
	t.Helper()
	for _, block := range blocks {
		if block.Kind == TranscriptBlockKindActivityItem && block.Activity != nil && block.Activity.Title == title {
			return block
		}
	}
	t.Fatalf("no activity block titled %q: %v", title, blockKinds(blocks))
	return TranscriptBlock{}
}
