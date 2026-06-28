package chat

import (
	"context"
	"testing"
	"time"

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
	result, err := service.SendUserInput(workspaceID, conversationID, TextChatInput("background terminal workflow"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, workspaceID, conversationID, result.Run.ID, RunStatusCompleted)

	// The terminals are slim background_terminal marker blocks, never per-run activity rows.
	blocks := loadPersistedBlocks(t, service, workspaceID, result.Run.ID)
	assertBackgroundTerminalStartMarkers(t, blocks, backgroundTerminalAlphaCommand, backgroundTerminalBetaCommand)

	// The process registry is the source of truth and is independent of the run: both terminals
	// are still running after the run has completed.
	processes, err := service.store.ListBackgroundTerminalProcesses(workspaceID, conversationID)
	if err != nil {
		t.Fatalf("list background terminals: %v", err)
	}
	byCommand := assertRunningBackgroundTerminals(t, processes, backgroundTerminalAlphaCommand, backgroundTerminalBetaCommand)

	// The alpha terminal's output was routed to the background terminal output store and the
	// recent-output summary, never to run-item output.
	alpha := byCommand[backgroundTerminalAlphaCommand]
	assertBackgroundTerminalOutputChunks(t, service, workspaceID, conversationID, alpha)
	assertRunActivityPageEmpty(t, service, workspaceID, result.Run.ID)
}

func assertBackgroundTerminalStartMarkers(t *testing.T, blocks []TranscriptBlock, commands ...string) {
	t.Helper()
	for _, block := range blocks {
		if block.Kind == TranscriptBlockKindActivityItem {
			t.Fatalf("background terminal must not create an activity block: %+v", block)
		}
	}
	for _, command := range commands {
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
}

func assertRunningBackgroundTerminals(t *testing.T, processes []BackgroundTerminalProcess, commands ...string) map[string]BackgroundTerminalProcess {
	t.Helper()
	if len(processes) != len(commands) {
		t.Fatalf("background terminal processes = %d, want %d: %+v", len(processes), len(commands), processes)
	}
	byCommand := map[string]BackgroundTerminalProcess{}
	for _, process := range processes {
		byCommand[process.Command] = process
	}
	for _, command := range commands {
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
	return byCommand
}

func assertBackgroundTerminalOutputChunks(t *testing.T, service *Service, workspaceID string, conversationID string, process BackgroundTerminalProcess) {
	t.Helper()
	if len(process.RecentOutput) != backgroundTerminalAlphaOutputChunks {
		t.Fatalf("%q recent output = %d lines, want %d: %+v", process.Command, len(process.RecentOutput), backgroundTerminalAlphaOutputChunks, process.RecentOutput)
	}
	page, err := service.store.LoadBackgroundTerminalOutputPage(workspaceID, conversationID, process.ID, 0, 0)
	if err != nil {
		t.Fatalf("load %q output: %v", process.Command, err)
	}
	if len(page.Output) != backgroundTerminalAlphaOutputChunks {
		t.Fatalf("%q output chunks = %d, want %d", process.Command, len(page.Output), backgroundTerminalAlphaOutputChunks)
	}
}

func assertRunActivityPageEmpty(t *testing.T, service *Service, workspaceID string, runID string) {
	t.Helper()
	activityPage, err := service.LoadRunActivityPage(workspaceID, runID, 20)
	if err != nil {
		t.Fatalf("load run activity page: %v", err)
	}
	if len(activityPage.Activity) != 0 {
		t.Fatalf("promoted background terminals leaked into run activity projection: %+v", activityPage.Activity)
	}
	if len(activityPage.Items) != 0 || len(activityPage.Output) != 0 {
		t.Fatalf("promoted background terminals leaked into raw activity page: items=%+v output=%+v", activityPage.Items, activityPage.Output)
	}
}

func TestServiceUnifiedExecStartupCompletedInTurnStaysActivity(t *testing.T) {
	source := RunItemCommandSourceUnifiedExecStartup
	const (
		providerItemID = "foreground_unified_exec"
		providerProcID = "foreground_proc"
		command        = "command -v tokei"
	)
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventThreadLinked, ThreadID: "thread_foreground", SessionID: "session_foreground", TurnID: "turn_foreground"},
		{Type: FakeEventAssistantDelta, ProviderItemID: "text_foreground", Text: "Checking available tools. "},
		{Type: FakeEventRunItem, ProviderItemID: providerItemID, RunItem: RunItem{
			ProviderItemID: providerItemID,
			Type:           RunItemTypeCommandExecution,
			Status:         RunItemStatusRunning,
			Command:        command,
			Cwd:            "/tmp/workspace",
			ProcessID:      providerProcID,
			Source:         &source,
		}},
		{Type: FakeEventRunItemOutput, ProviderItemID: providerItemID, Stream: "stdout", Text: "/opt/homebrew/bin/tokei\n"},
		{Type: FakeEventRunItem, ProviderItemID: providerItemID, RunItem: RunItem{
			ProviderItemID: providerItemID,
			Type:           RunItemTypeCommandExecution,
			Status:         RunItemStatusCompleted,
			Command:        command,
			Cwd:            "/tmp/workspace",
			ProcessID:      providerProcID,
			Source:         &source,
			ExitCode:       0,
		}},
		{Type: FakeEventAssistantDelta, ProviderItemID: "text_done", Text: "Done."},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserInput(workspaceID, conversationID, TextChatInput("check tokei"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, workspaceID, conversationID, result.Run.ID, RunStatusCompleted)

	processes, err := service.store.ListBackgroundTerminalProcesses(workspaceID, conversationID)
	if err != nil {
		t.Fatalf("list background terminals: %v", err)
	}
	if len(processes) != 0 {
		t.Fatalf("completed foreground unified exec created background terminals: %+v", processes)
	}
	blocks := loadPersistedBlocks(t, service, workspaceID, result.Run.ID)
	for _, block := range blocks {
		if block.Kind == TranscriptBlockKindBackgroundTerminal {
			t.Fatalf("completed foreground unified exec created background marker: %+v", block)
		}
	}
	activities := activityBlocks(blocks)
	if len(activities) != 1 {
		t.Fatalf("activity blocks = %d, want one foreground command row: %v", len(activities), blockKinds(blocks))
	}
	activity := activities[0].Activity
	if activity.Status != RunItemStatusCompleted || activity.Details.Command != command || !activity.HasOutput {
		t.Fatalf("foreground command activity = %+v, want completed command with output", activity)
	}
	activityPage, err := service.LoadRunActivityPage(workspaceID, result.Run.ID, 20)
	if err != nil {
		t.Fatalf("load run activity page: %v", err)
	}
	if len(activityPage.Activity) != 1 || activityPage.Activity[0].Details.Command != command {
		t.Fatalf("foreground command activity page = %+v, want one command activity", activityPage.Activity)
	}
}

func TestServiceUnifiedExecInteractionPromotesUnregisteredStartup(t *testing.T) {
	startupSource := RunItemCommandSourceUnifiedExecStartup
	interactionSource := RunItemCommandSourceUnifiedExecInteraction
	const (
		providerItemID = "interactive_unified_exec"
		providerProcID = "interactive_proc"
		command        = "npm run dev"
	)
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventThreadLinked, ThreadID: "thread_interaction", SessionID: "session_interaction", TurnID: "turn_interaction"},
		{Type: FakeEventRunItem, ProviderItemID: providerItemID, RunItem: RunItem{
			ProviderItemID: providerItemID,
			Type:           RunItemTypeCommandExecution,
			Status:         RunItemStatusRunning,
			Command:        command,
			Cwd:            "/tmp/workspace",
			ProcessID:      providerProcID,
			Source:         &startupSource,
		}},
		{Type: FakeEventRunItem, ProviderItemID: providerItemID + "_terminal", RunItem: RunItem{
			ProviderItemID: providerItemID + "_terminal",
			Type:           RunItemTypeTerminalInteraction,
			Status:         RunItemStatusCompleted,
			Summary:        "rs\n",
			ProcessID:      providerProcID,
			Source:         &interactionSource,
		}},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserInput(workspaceID, conversationID, TextChatInput("interact with background terminal"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, workspaceID, conversationID, result.Run.ID, RunStatusCompleted)

	process := waitForBackgroundTerminalProcess(t, service, workspaceID, conversationID, providerItemID, BackgroundTerminalRunning)
	if process.ProcessID != providerProcID {
		t.Fatalf("promoted process id = %q, want %q", process.ProcessID, providerProcID)
	}
	blocks := loadPersistedBlocks(t, service, workspaceID, result.Run.ID)
	if markers := countBackgroundTerminalMarkerBlocks(blocks, command); markers != 1 {
		t.Fatalf("startup markers = %d, want 1: %v", markers, blockKinds(blocks))
	}
	interaction := backgroundTerminalMarkerBlock(t, blocks, "rs\n")
	if interaction.BackgroundTerminal.ProcessID != process.ID || interaction.BackgroundTerminal.Label != backgroundTerminalInteractionLabel {
		t.Fatalf("interaction marker = %+v, want linked interaction marker", interaction.BackgroundTerminal)
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

func TestServiceBackgroundTerminalsSurviveRunInterrupt(t *testing.T) {
	source := RunItemCommandSourceUnifiedExecStartup
	const (
		providerItemID = "bg_interrupt_item"
		providerProcID = "bg_interrupt_proc"
		command        = "npm run dev"
	)
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventThreadLinked, ThreadID: "thread_interrupt", SessionID: "session_interrupt", TurnID: "turn_interrupt"},
		{Type: FakeEventAssistantDelta, ProviderItemID: "text_interrupt", Text: "Starting the dev server. "},
		{Type: FakeEventRunItem, ProviderItemID: providerItemID, RunItem: RunItem{
			ProviderItemID: providerItemID,
			Type:           RunItemTypeCommandExecution,
			Status:         RunItemStatusRunning,
			Command:        command,
			Cwd:            "/tmp/workspace",
			ProcessID:      providerProcID,
			Source:         &source,
		}},
		{Type: FakeEventRunItemOutput, ProviderItemID: providerItemID, Stream: "stdout", Text: "dev server booted\n"},
		{Type: FakeEventWaitForCancel},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserInput(workspaceID, conversationID, TextChatInput("interrupt background terminal"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunItemByProvider(t, service, workspaceID, result.Run.ID, providerItemID)
	cancelled, err := service.CancelActiveRun(workspaceID, conversationID)
	if err != nil {
		t.Fatalf("cancel active run: %v", err)
	}
	if cancelled.Status != RunStatusCancelled || cancelled.ID != result.Run.ID {
		t.Fatalf("cancelled run = %+v, want %s cancelled", cancelled, result.Run.ID)
	}
	waitForRunStatus(t, service, workspaceID, conversationID, result.Run.ID, RunStatusCancelled)

	process := waitForBackgroundTerminalProcess(t, service, workspaceID, conversationID, providerItemID, BackgroundTerminalRunning)
	process, err = service.store.LoadBackgroundTerminalProcess(workspaceID, conversationID, process.ID)
	if err != nil {
		t.Fatalf("reload background terminal: %v", err)
	}
	if process.Status != BackgroundTerminalRunning || process.CompletedAt != "" {
		t.Fatalf("background terminal after interrupt = %+v, want still-running registry process", process)
	}
	page, err := service.store.LoadBackgroundTerminalOutputPage(workspaceID, conversationID, process.ID, 0, 10)
	if err != nil {
		t.Fatalf("load background terminal output: %v", err)
	}
	if len(page.Output) != 1 || page.Output[0].Text != "dev server booted\n" {
		t.Fatalf("background terminal output after interrupt = %+v", page)
	}

	blocks := loadPersistedBlocks(t, service, workspaceID, result.Run.ID)
	block := backgroundTerminalMarkerBlock(t, blocks, command)
	if block.Status != TranscriptBlockStatusComplete {
		t.Fatalf("background terminal marker status = %s, want complete chronology marker", block.Status)
	}
	for _, block := range blocks {
		if block.Kind == TranscriptBlockKindActivityItem {
			t.Fatalf("background terminal interrupt path created activity block: %+v", block)
		}
	}
}

// startScriptedBackgroundTerminalAlpha runs the scripted background terminal turn to completion
// and returns the workspace, conversation, and the still-running alpha terminal process.
func startScriptedBackgroundTerminalAlpha(t *testing.T, service *Service) (string, string, BackgroundTerminalProcess) {
	t.Helper()
	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserInput(workspaceID, conversationID, TextChatInput("background terminal workflow"))
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

func waitForRunItemByProvider(t *testing.T, service *Service, workspaceID string, runID string, providerItemID string) RunItem {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		item, exists, err := service.store.FindRunItemByProviderID(workspaceID, runID, providerItemID)
		if err != nil {
			t.Fatalf("find run item %s: %v", providerItemID, err)
		}
		if exists {
			return item
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for run item %s in run %s", providerItemID, runID)
	return RunItem{}
}
