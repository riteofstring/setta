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

// TestServiceBackgroundTerminalsSurviveRunCompletion is the Phase 2 flip of the Phase 0
// characterization (formerly TestServiceFinalizesBackgroundTerminalWithRun). The provider leaves
// two background terminals running; the backend now records them in the process registry and
// renders them as slim chronological marker blocks rather than per-run command activity rows.
// Run finalization only coerces still-streaming run-scoped blocks, so the marker blocks and the
// registry processes survive the completed run instead of being finalized with it.
func TestServiceBackgroundTerminalsSurviveRunCompletion(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewScriptedWorkflowHarness())
	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserMessage(workspaceID, conversationID, "background terminal workflow")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, workspaceID, conversationID, result.Run.ID, RunStatusCompleted)

	// The terminals are slim background_terminal marker blocks, never per-run activity rows.
	blocks := loadPersistedBlocks(t, service, workspaceID, result.Run.ID)
	for _, block := range blocks {
		if block.Kind == TranscriptBlockKindActivityItem {
			t.Fatalf("background terminal must not create an activity block: %+v", block)
		}
	}
	for _, command := range []string{backgroundTerminalAlphaCommand, backgroundTerminalBetaCommand} {
		block := backgroundTerminalMarkerBlock(t, blocks, command)
		if block.Status != TranscriptBlockStatusComplete {
			t.Fatalf("background terminal marker %q status = %q, want %q (lifecycle marker, not finalized)",
				command, block.Status, TranscriptBlockStatusComplete)
		}
		if block.BackgroundTerminal.Label != backgroundTerminalStartLabel {
			t.Fatalf("background terminal marker %q label = %q, want %q",
				command, block.BackgroundTerminal.Label, backgroundTerminalStartLabel)
		}
	}

	// The process registry is the source of truth and is independent of the run: both terminals
	// are still running after the run has completed.
	processes, err := service.store.ListBackgroundTerminalProcesses(workspaceID, conversationID)
	if err != nil {
		t.Fatalf("list background terminals: %v", err)
	}
	if len(processes) != 2 {
		t.Fatalf("background terminal processes = %d, want 2: %+v", len(processes), processes)
	}
	byCommand := map[string]BackgroundTerminalProcess{}
	for _, process := range processes {
		byCommand[process.Command] = process
	}
	for _, command := range []string{backgroundTerminalAlphaCommand, backgroundTerminalBetaCommand} {
		process, ok := byCommand[command]
		if !ok {
			t.Fatalf("no background terminal process for %q: %+v", command, processes)
		}
		if process.Status != BackgroundTerminalRunning {
			t.Fatalf("background terminal %q status = %q, want running (survives run completion)", command, process.Status)
		}
		if process.CompletedAt != "" {
			t.Fatalf("background terminal %q completedAt = %q, want empty (still running)", command, process.CompletedAt)
		}
	}

	// The alpha terminal's output was routed to the background terminal output store and the
	// recent-output summary, never to run-item output.
	alpha := byCommand[backgroundTerminalAlphaCommand]
	if len(alpha.RecentOutput) != backgroundTerminalAlphaOutputChunks {
		t.Fatalf("alpha recent output = %d lines, want %d: %+v", len(alpha.RecentOutput), backgroundTerminalAlphaOutputChunks, alpha.RecentOutput)
	}
	page, err := service.store.LoadBackgroundTerminalOutputPage(workspaceID, conversationID, alpha.ID, 0, 0)
	if err != nil {
		t.Fatalf("load alpha output: %v", err)
	}
	if len(page.Output) != backgroundTerminalAlphaOutputChunks {
		t.Fatalf("alpha output chunks = %d, want %d", len(page.Output), backgroundTerminalAlphaOutputChunks)
	}
}

// TestServiceBackgroundTerminalLateLifecycle exercises the conversation-scoped sink the Codex
// connection handlers drive after a turn finishes: late output is appended to the registry's
// output store and recent-output summary, and a late completion moves a running terminal to
// exited. Both are idempotent and safely no-op for an unknown process.
func TestServiceBackgroundTerminalLateLifecycle(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewScriptedWorkflowHarness())
	workspaceID, conversationID, alpha := startScriptedBackgroundTerminalAlpha(t, service)

	// Late output arrives on the connection after the turn; it is appended to the output store
	// and the recent-output summary, keyed by the provider item ID.
	if err := service.appendBackgroundTerminalOutputFromProvider(workspaceID, conversationID, alpha.ProviderItemID, alpha.ProcessID, "stdout", "late dev server line\n"); err != nil {
		t.Fatalf("append late output: %v", err)
	}
	reloaded, err := service.store.LoadBackgroundTerminalProcess(workspaceID, conversationID, alpha.ID)
	if err != nil {
		t.Fatalf("reload alpha: %v", err)
	}
	if len(reloaded.RecentOutput) != backgroundTerminalAlphaOutputChunks+1 {
		t.Fatalf("recent output after late line = %d, want %d: %+v", len(reloaded.RecentOutput), backgroundTerminalAlphaOutputChunks+1, reloaded.RecentOutput)
	}
	page, err := service.store.LoadBackgroundTerminalOutputPage(workspaceID, conversationID, alpha.ID, 0, 0)
	if err != nil {
		t.Fatalf("load output: %v", err)
	}
	if len(page.Output) != backgroundTerminalAlphaOutputChunks+1 {
		t.Fatalf("output chunks after late line = %d, want %d", len(page.Output), backgroundTerminalAlphaOutputChunks+1)
	}

	// A late completion moves the still-running terminal to exited; a second completion is a
	// no-op because the terminal is already terminal.
	if err := service.completeBackgroundTerminalFromProvider(workspaceID, conversationID, alpha.ProviderItemID, "", 0, ""); err != nil {
		t.Fatalf("complete late: %v", err)
	}
	exited, err := service.store.LoadBackgroundTerminalProcess(workspaceID, conversationID, alpha.ID)
	if err != nil {
		t.Fatalf("reload exited alpha: %v", err)
	}
	if exited.Status != BackgroundTerminalExited {
		t.Fatalf("alpha status after completion = %q, want exited", exited.Status)
	}
	if exited.CompletedAt == "" {
		t.Fatalf("alpha completedAt is empty after completion")
	}
	if err := service.completeBackgroundTerminalFromProvider(workspaceID, conversationID, alpha.ProviderItemID, "", 1, "second"); err != nil {
		t.Fatalf("idempotent completion: %v", err)
	}
	stable, err := service.store.LoadBackgroundTerminalProcess(workspaceID, conversationID, alpha.ID)
	if err != nil {
		t.Fatalf("reload stable alpha: %v", err)
	}
	if stable.ExitCode != exited.ExitCode || stable.CompletedAt != exited.CompletedAt {
		t.Fatalf("repeat completion mutated terminal state: %+v vs %+v", stable, exited)
	}

	// An unknown process is ignored, never fabricated.
	if err := service.completeBackgroundTerminalFromProvider(workspaceID, conversationID, "missing_provider_item", "", 0, ""); err != nil {
		t.Fatalf("unknown completion should be a no-op: %v", err)
	}
}

// startScriptedBackgroundTerminalAlpha runs the scripted background terminal turn to completion
// and returns the workspace, conversation, and the still-running alpha terminal process.
func startScriptedBackgroundTerminalAlpha(t *testing.T, service *Service) (string, string, BackgroundTerminalProcess) {
	t.Helper()
	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserMessage(workspaceID, conversationID, "background terminal workflow")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, workspaceID, conversationID, result.Run.ID, RunStatusCompleted)
	processes, err := service.store.ListBackgroundTerminalProcesses(workspaceID, conversationID)
	if err != nil {
		t.Fatalf("list background terminals: %v", err)
	}
	for _, process := range processes {
		if process.Command == backgroundTerminalAlphaCommand {
			return workspaceID, conversationID, process
		}
	}
	t.Fatalf("no alpha background terminal: %+v", processes)
	return "", "", BackgroundTerminalProcess{}
}

func backgroundTerminalMarkerBlock(t *testing.T, blocks []TranscriptBlock, command string) TranscriptBlock {
	t.Helper()
	for _, block := range blocks {
		if block.Kind == TranscriptBlockKindBackgroundTerminal && block.BackgroundTerminal != nil && block.BackgroundTerminal.Command == command {
			return block
		}
	}
	t.Fatalf("no background terminal marker for command %q: %v", command, blockKinds(blocks))
	return TranscriptBlock{}
}
