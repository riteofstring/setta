package chat

import (
	"context"
	"encoding/json"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"setta/internal/workspace"
)

// scriptedTranscriptHarness drives a turn through the production service paths
// from a per-test provider script, so the focused Phase 2 ingestion tests observe
// real chronology capture rather than a mocked store. SteerTurn forwards to an
// optional callback so tests can release a blocked script when steering arrives.
type scriptedTranscriptHarness struct {
	start func(context.Context, TurnRequest, TurnSink) (TurnCompletion, error)
	steer func(SteerRequest) error
}

func (harness *scriptedTranscriptHarness) StartTurn(ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	return harness.start(ctx, request, sink)
}

func (harness *scriptedTranscriptHarness) SteerTurn(_ context.Context, request SteerRequest) error {
	if harness.steer != nil {
		return harness.steer(request)
	}
	return nil
}

func (harness *scriptedTranscriptHarness) CancelTurn(context.Context, CancelRequest) error {
	return nil
}

func (harness *scriptedTranscriptHarness) SubmitApproval(context.Context, ApprovalResponse) error {
	return nil
}

func (harness *scriptedTranscriptHarness) ResolveCodexEffectiveSettings(context.Context, workspace.WorkspaceSummary, Conversation) (*ChatCodexEffectiveSettings, error) {
	return nil, nil
}

func linkTranscriptThread(sink TurnSink) error {
	return sink.ThreadLinked("thread_test", "session_test", "turn_test", nil)
}

func startTranscriptConversation(t *testing.T, service *Service) (string, string) {
	t.Helper()
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	return "workspace_api", conversation.ID
}

func loadPersistedBlocks(t *testing.T, service *Service, workspaceID string, runID string) []TranscriptBlock {
	t.Helper()
	blocks, err := service.store.LoadTranscriptBlocks(workspaceID, runID)
	if err != nil {
		t.Fatalf("load transcript blocks: %v", err)
	}
	return blocks
}

func liveTranscriptBlocks(t *testing.T, service *Service, workspaceID string, conversationID string, runID string) []TranscriptBlock {
	t.Helper()
	service.mu.Lock()
	defer service.mu.Unlock()
	blocks, err := service.transcriptBlocksForRunLocked(workspaceID, conversationID, runID)
	if err != nil {
		t.Fatalf("transcript blocks for run: %v", err)
	}
	return blocks
}

func blockKinds(blocks []TranscriptBlock) []TranscriptBlockKind {
	kinds := make([]TranscriptBlockKind, 0, len(blocks))
	for _, block := range blocks {
		kinds = append(kinds, block.Kind)
	}
	return kinds
}

func assertBlockKindSequence(t *testing.T, blocks []TranscriptBlock, want []TranscriptBlockKind) {
	t.Helper()
	got := blockKinds(blocks)
	if len(got) != len(want) {
		t.Fatalf("block kinds = %v, want %v", got, want)
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("block[%d] kind = %s, want %s (full: %v)", index, got[index], want[index], got)
		}
	}
}

func assertMonotonicOrdinals(t *testing.T, blocks []TranscriptBlock) {
	t.Helper()
	previous := 0
	for index, block := range blocks {
		if block.Ordinal != previous+1 {
			t.Fatalf("block[%d] ordinal = %d, want %d (contiguous from 1)", index, block.Ordinal, previous+1)
		}
		previous = block.Ordinal
	}
}

func assistantTextBlocks(blocks []TranscriptBlock) []TranscriptBlock {
	matches := []TranscriptBlock{}
	for _, block := range blocks {
		if block.Kind == TranscriptBlockKindAssistantText {
			matches = append(matches, block)
		}
	}
	return matches
}

func activityBlocks(blocks []TranscriptBlock) []TranscriptBlock {
	matches := []TranscriptBlock{}
	for _, block := range blocks {
		if block.Kind == TranscriptBlockKindActivityItem {
			matches = append(matches, block)
		}
	}
	return matches
}

func firstBlockOfKind(blocks []TranscriptBlock, kind TranscriptBlockKind) (TranscriptBlock, bool) {
	for _, block := range blocks {
		if block.Kind == kind {
			return block, true
		}
	}
	return TranscriptBlock{}, false
}

// TestChronologicalTranscriptBlocksCaptureProviderOrder drives the plan's Phase 0
// fixture through the service and asserts that ingestion stored ordered transcript
// blocks matching provider chronology: text wraps the commands, the public
// reasoning summary lands between later text segments, streamed output never
// creates blocks, and private/hidden reasoning never appears.
func TestChronologicalTranscriptBlocksCaptureProviderOrder(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewScriptedWorkflowHarness())
	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserMessage(workspaceID, conversationID, "chronological transcript workflow")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, workspaceID, conversationID, result.Run.ID, RunStatusCompleted)

	blocks := loadPersistedBlocks(t, service, workspaceID, result.Run.ID)
	assertBlockKindSequence(t, blocks, []TranscriptBlockKind{
		TranscriptBlockKindUserMessage,
		TranscriptBlockKindAssistantText,
		TranscriptBlockKindActivityItem,
		TranscriptBlockKindActivityItem,
		TranscriptBlockKindAssistantText,
		TranscriptBlockKindReasoning,
		TranscriptBlockKindAssistantText,
		TranscriptBlockKindAssistantText,
	})
	assertMonotonicOrdinals(t, blocks)

	texts := assistantTextBlocks(blocks)
	wantTexts := []string{
		chronologicalAssistantTextOne,
		chronologicalAssistantTextTwo,
		chronologicalAssistantTextThree,
		chronologicalAssistantTextFour,
	}
	if len(texts) != len(wantTexts) {
		t.Fatalf("assistant text blocks = %d, want %d", len(texts), len(wantTexts))
	}
	for index, want := range wantTexts {
		if texts[index].AssistantText.Text != want {
			t.Fatalf("assistant text block[%d] = %q, want %q", index, texts[index].AssistantText.Text, want)
		}
		if texts[index].Status != TranscriptBlockStatusComplete {
			t.Fatalf("assistant text block[%d] status = %s, want complete", index, texts[index].Status)
		}
	}

	commands := activityBlocks(blocks)
	if len(commands) != 2 {
		t.Fatalf("activity blocks = %d, want 2 (output chunks must not create blocks)", len(commands))
	}
	commandA := commands[0]
	if commandA.Activity.Title != chronologicalCommandATitle || !commandA.Activity.HasOutput {
		t.Fatalf("command A block = %+v, want title %q with output", commandA.Activity, chronologicalCommandATitle)
	}
	if commandA.Activity.SourceRunItemID == "" {
		t.Fatalf("command A block missing source run item link: %+v", commandA.Activity)
	}

	reasoning, ok := firstBlockOfKind(blocks, TranscriptBlockKindReasoning)
	if !ok {
		t.Fatalf("missing reasoning block: %v", blockKinds(blocks))
	}
	if reasoning.Reasoning.Mode != ReasoningBlockModeSummary {
		t.Fatalf("reasoning mode = %s, want summary", reasoning.Reasoning.Mode)
	}
	if reasoning.Reasoning.Headline != chronologicalReasoningTitle {
		t.Fatalf("reasoning headline = %q, want %q", reasoning.Reasoning.Headline, chronologicalReasoningTitle)
	}
	if reasoning.Reasoning.Summary != chronologicalReasoningSummary {
		t.Fatalf("reasoning summary = %q, want %q", reasoning.Reasoning.Summary, chronologicalReasoningSummary)
	}

	assertNoPrivateReasoningLeak(t, blocks)
}

func assertNoPrivateReasoningLeak(t *testing.T, blocks []TranscriptBlock) {
	t.Helper()
	for _, block := range blocks {
		if block.Reasoning != nil {
			if strings.Contains(block.Reasoning.Headline, chronologicalPrivateReasoning) ||
				strings.Contains(block.Reasoning.Summary, chronologicalPrivateReasoning) {
				t.Fatalf("private reasoning leaked into reasoning block: %+v", block.Reasoning)
			}
		}
		if block.AssistantText != nil && strings.Contains(block.AssistantText.Text, chronologicalPrivateReasoning) {
			t.Fatalf("private reasoning leaked into assistant text: %q", block.AssistantText.Text)
		}
	}
}

// TestTranscriptBlocksReloadReconstructsOrder verifies that a fresh service backed
// by the same store reloads the same persisted block order, with no live-only
// working indicator.
func TestTranscriptBlocksReloadReconstructsOrder(t *testing.T) {
	dir := t.TempDir()
	service := newTestService(t, dir, testResolver(t), NewScriptedWorkflowHarness())
	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserMessage(workspaceID, conversationID, "chronological transcript workflow")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, workspaceID, conversationID, result.Run.ID, RunStatusCompleted)
	original := loadPersistedBlocks(t, service, workspaceID, result.Run.ID)

	reloaded := newTestService(t, dir, testResolver(t), NewScriptedWorkflowHarness())
	reloadedBlocks := loadPersistedBlocks(t, reloaded, workspaceID, result.Run.ID)
	if len(reloadedBlocks) != len(original) {
		t.Fatalf("reloaded block count = %d, want %d", len(reloadedBlocks), len(original))
	}
	for index := range original {
		if reloadedBlocks[index].ID != original[index].ID || reloadedBlocks[index].Ordinal != original[index].Ordinal || reloadedBlocks[index].Kind != original[index].Kind {
			t.Fatalf("reloaded block[%d] = (%s,%d,%s), want (%s,%d,%s)",
				index, reloadedBlocks[index].Kind, reloadedBlocks[index].Ordinal, reloadedBlocks[index].ID,
				original[index].Kind, original[index].Ordinal, original[index].ID)
		}
	}
	for _, block := range reloadedBlocks {
		if block.Kind == TranscriptBlockKindRunStatus && block.RunStatus.Mode == RunStatusBlockModeWorking {
			t.Fatalf("working run_status block must not be persisted: %+v", block)
		}
	}
}

// TestTranscriptWorkingIndicatorLiveOnly verifies that an active run projects a
// live-only working run_status block at the tail, even after public output has
// appeared, and that the indicator is never persisted.
func TestTranscriptWorkingIndicatorLiveOnly(t *testing.T) {
	reached := make(chan struct{})
	release := make(chan struct{})
	outputReached := make(chan struct{})
	finish := make(chan struct{})
	harness := &scriptedTranscriptHarness{
		start: func(ctx context.Context, _ TurnRequest, sink TurnSink) (TurnCompletion, error) {
			if err := linkTranscriptThread(sink); err != nil {
				return TurnCompletion{}, err
			}
			// Private/generic reasoning must not create a block, so the run still
			// has no public output and looks live only via the working indicator.
			if err := sink.RunItemUpsert(RunItem{ProviderItemID: "private", Type: RunItemTypeReasoning, Status: RunItemStatusRunning, HiddenText: "secret thinking"}); err != nil {
				return TurnCompletion{}, err
			}
			close(reached)
			<-release
			if err := sink.AssistantTextDelta("answer", "Found the entry point."); err != nil {
				return TurnCompletion{}, err
			}
			close(outputReached)
			<-finish
			return TurnCompletion{Outcome: TurnOutcomeCompleted}, nil
		},
	}
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserMessage(workspaceID, conversationID, "trigger")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}

	<-reached
	live := liveTranscriptBlocks(t, service, workspaceID, conversationID, result.Run.ID)
	assertBlockKindSequence(t, live, []TranscriptBlockKind{
		TranscriptBlockKindUserMessage,
		TranscriptBlockKindRunStatus,
	})
	working := live[len(live)-1]
	if working.RunStatus.Mode != RunStatusBlockModeWorking {
		t.Fatalf("tail block mode = %s, want working", working.RunStatus.Mode)
	}
	if persisted := loadPersistedBlocks(t, service, workspaceID, result.Run.ID); len(persisted) != 1 {
		t.Fatalf("persisted blocks while working = %d, want 1 (trigger only)", len(persisted))
	}

	close(release)
	<-outputReached
	live = liveTranscriptBlocks(t, service, workspaceID, conversationID, result.Run.ID)
	assertBlockKindSequence(t, live, []TranscriptBlockKind{
		TranscriptBlockKindUserMessage,
		TranscriptBlockKindAssistantText,
		TranscriptBlockKindRunStatus,
	})
	working = live[len(live)-1]
	if working.RunStatus.Mode != RunStatusBlockModeWorking {
		t.Fatalf("tail block after output mode = %s, want working", working.RunStatus.Mode)
	}

	close(finish)
	waitForRunStatus(t, service, workspaceID, conversationID, result.Run.ID, RunStatusCompleted)
	final := loadPersistedBlocks(t, service, workspaceID, result.Run.ID)
	assertBlockKindSequence(t, final, []TranscriptBlockKind{
		TranscriptBlockKindUserMessage,
		TranscriptBlockKindAssistantText,
	})
}

// TestTranscriptSteeringInterleavesWithOrdinal verifies that a steering message
// sent into an active run receives a run-local transcript ordinal at ingestion
// time, so it interleaves between the activity block already emitted and the
// assistant text that follows.
func TestTranscriptSteeringInterleavesWithOrdinal(t *testing.T) {
	steered := make(chan string, 1)
	commandEmitted := make(chan struct{})
	harness := &scriptedTranscriptHarness{
		start: func(ctx context.Context, req TurnRequest, sink TurnSink) (TurnCompletion, error) {
			if err := linkTranscriptThread(sink); err != nil {
				return TurnCompletion{}, err
			}
			if err := sink.AssistantTextDelta("pre", "Inspecting the scripts."); err != nil {
				return TurnCompletion{}, err
			}
			if err := sink.RunItemUpsert(RunItem{ProviderItemID: "cmd", Type: RunItemTypeCommandExecution, Status: RunItemStatusRunning, Title: "list", Command: "ls"}); err != nil {
				return TurnCompletion{}, err
			}
			// Signal before blocking so the test only steers once the command block
			// exists, pinning the steering ordinal after it (no scheduling race).
			close(commandEmitted)
			text := <-steered
			if err := sink.AssistantTextDelta("post", "Including "+text+"."); err != nil {
				return TurnCompletion{}, err
			}
			return TurnCompletion{Outcome: TurnOutcomeCompleted}, nil
		},
		steer: func(request SteerRequest) error {
			steered <- request.Text
			return nil
		},
	}
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserMessage(workspaceID, conversationID, "trigger")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	<-commandEmitted
	steerWhenReady(t, service, workspaceID, conversationID, "setup.sh")
	waitForRunStatus(t, service, workspaceID, conversationID, result.Run.ID, RunStatusCompleted)

	blocks := loadPersistedBlocks(t, service, workspaceID, result.Run.ID)
	assertBlockKindSequence(t, blocks, []TranscriptBlockKind{
		TranscriptBlockKindUserMessage,
		TranscriptBlockKindAssistantText,
		TranscriptBlockKindActivityItem,
		TranscriptBlockKindUserMessage,
		TranscriptBlockKindAssistantText,
	})
	assertMonotonicOrdinals(t, blocks)
	steering := blocks[3]
	if steering.UserMessage.Delivery != MessageDeliverySteering {
		t.Fatalf("interleaved block delivery = %s, want steering", steering.UserMessage.Delivery)
	}
	if got := steering.UserMessage.Parts[0].Text.Text; got != "setup.sh" {
		t.Fatalf("steering block text = %q, want %q", got, "setup.sh")
	}
}

// TestTranscriptCancellationMarksActiveBlocks verifies that cancelling a run marks
// every still-streaming block cancelled and appends a permanent cancelled
// run_status block.
func TestTranscriptCancellationMarksActiveBlocks(t *testing.T) {
	reached := make(chan struct{})
	harness := &scriptedTranscriptHarness{
		start: func(ctx context.Context, _ TurnRequest, sink TurnSink) (TurnCompletion, error) {
			if err := linkTranscriptThread(sink); err != nil {
				return TurnCompletion{}, err
			}
			if err := sink.AssistantTextDelta("pre", "Working on it."); err != nil {
				return TurnCompletion{}, err
			}
			if err := sink.RunItemUpsert(RunItem{ProviderItemID: "cmd", Type: RunItemTypeCommandExecution, Status: RunItemStatusRunning, Title: "long", Command: "sleep"}); err != nil {
				return TurnCompletion{}, err
			}
			close(reached)
			<-ctx.Done()
			return TurnCompletion{}, ctx.Err()
		},
	}
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserMessage(workspaceID, conversationID, "trigger")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	<-reached
	if _, err := service.CancelActiveRun(workspaceID, conversationID); err != nil {
		t.Fatalf("cancel active run: %v", err)
	}
	waitForRunStatus(t, service, workspaceID, conversationID, result.Run.ID, RunStatusCancelled)

	blocks := loadPersistedBlocks(t, service, workspaceID, result.Run.ID)
	assertBlockKindSequence(t, blocks, []TranscriptBlockKind{
		TranscriptBlockKindUserMessage,
		TranscriptBlockKindAssistantText,
		TranscriptBlockKindActivityItem,
		TranscriptBlockKindRunStatus,
	})
	if text := blocks[1]; text.Status != TranscriptBlockStatusCancelled {
		t.Fatalf("assistant block status = %s, want cancelled", text.Status)
	}
	if command := blocks[2]; command.Status != TranscriptBlockStatusCancelled || command.Activity.Status != RunItemStatusCancelled {
		t.Fatalf("command block = (%s,%s), want cancelled/cancelled", command.Status, command.Activity.Status)
	}
	terminal := blocks[3]
	if terminal.RunStatus.Mode != RunStatusBlockModeCancelled {
		t.Fatalf("terminal run_status mode = %s, want cancelled", terminal.RunStatus.Mode)
	}
}

// TestTranscriptFailureMarksActiveBlocks verifies that a failed run marks active
// blocks failed and records the run error on a failed run_status block.
func TestTranscriptFailureMarksActiveBlocks(t *testing.T) {
	harness := &scriptedTranscriptHarness{
		start: func(ctx context.Context, _ TurnRequest, sink TurnSink) (TurnCompletion, error) {
			if err := linkTranscriptThread(sink); err != nil {
				return TurnCompletion{}, err
			}
			if err := sink.AssistantTextDelta("pre", "Trying."); err != nil {
				return TurnCompletion{}, err
			}
			if err := sink.RunItemUpsert(RunItem{ProviderItemID: "cmd", Type: RunItemTypeCommandExecution, Status: RunItemStatusRunning, Title: "build", Command: "make"}); err != nil {
				return TurnCompletion{}, err
			}
			return TurnCompletion{Outcome: TurnOutcomeFailed, ErrorMessage: "provider exploded"}, nil
		},
	}
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserMessage(workspaceID, conversationID, "trigger")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, workspaceID, conversationID, result.Run.ID, RunStatusFailed)

	blocks := loadPersistedBlocks(t, service, workspaceID, result.Run.ID)
	terminal, ok := firstBlockOfKind(blocks, TranscriptBlockKindRunStatus)
	if !ok {
		t.Fatalf("missing terminal run_status block: %v", blockKinds(blocks))
	}
	if terminal.RunStatus.Mode != RunStatusBlockModeFailed {
		t.Fatalf("terminal mode = %s, want failed", terminal.RunStatus.Mode)
	}
	if terminal.RunStatus.Error != "provider exploded" {
		t.Fatalf("terminal error = %q, want %q", terminal.RunStatus.Error, "provider exploded")
	}
	for _, block := range blocks {
		if block.Kind == TranscriptBlockKindActivityItem && block.Status != TranscriptBlockStatusFailed {
			t.Fatalf("activity block status = %s, want failed", block.Status)
		}
	}
}

// TestTranscriptReasoningThinkingBecomesSummary verifies that meaningful active
// reasoning first renders as a thinking block, and that the same provider item
// later gaining a public summary updates that block in place to summary mode
// without changing its block ID or kind.
func TestTranscriptReasoningThinkingBecomesSummary(t *testing.T) {
	reachedThinking := make(chan struct{})
	releaseSummary := make(chan struct{})
	harness := &scriptedTranscriptHarness{
		start: func(ctx context.Context, _ TurnRequest, sink TurnSink) (TurnCompletion, error) {
			if err := linkTranscriptThread(sink); err != nil {
				return TurnCompletion{}, err
			}
			if err := sink.RunItemUpsert(RunItem{ProviderItemID: "r1", Type: RunItemTypeReasoning, Status: RunItemStatusRunning, Title: "Mapping parser modules"}); err != nil {
				return TurnCompletion{}, err
			}
			close(reachedThinking)
			<-releaseSummary
			if err := sink.RunItemUpsert(RunItem{ProviderItemID: "r1", Type: RunItemTypeReasoning, Status: RunItemStatusCompleted, Title: "Mapping parser modules", Summary: "Checked request flow and the retry path."}); err != nil {
				return TurnCompletion{}, err
			}
			return TurnCompletion{Outcome: TurnOutcomeCompleted}, nil
		},
	}
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserMessage(workspaceID, conversationID, "trigger")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}

	<-reachedThinking
	thinkingBlocks := liveTranscriptBlocks(t, service, workspaceID, conversationID, result.Run.ID)
	thinking, ok := firstBlockOfKind(thinkingBlocks, TranscriptBlockKindReasoning)
	if !ok {
		t.Fatalf("missing thinking reasoning block: %v", blockKinds(thinkingBlocks))
	}
	if thinking.Reasoning.Mode != ReasoningBlockModeThinking {
		t.Fatalf("reasoning mode = %s, want thinking", thinking.Reasoning.Mode)
	}
	if thinking.Reasoning.Headline != "Mapping parser modules" {
		t.Fatalf("thinking headline = %q", thinking.Reasoning.Headline)
	}

	close(releaseSummary)
	waitForRunStatus(t, service, workspaceID, conversationID, result.Run.ID, RunStatusCompleted)
	summaryBlocks := loadPersistedBlocks(t, service, workspaceID, result.Run.ID)
	summary, ok := firstBlockOfKind(summaryBlocks, TranscriptBlockKindReasoning)
	if !ok {
		t.Fatalf("missing summary reasoning block: %v", blockKinds(summaryBlocks))
	}
	if summary.ID != thinking.ID || summary.Kind != thinking.Kind {
		t.Fatalf("reasoning block identity changed across mode: (%s,%s) -> (%s,%s)", thinking.Kind, thinking.ID, summary.Kind, summary.ID)
	}
	if summary.Reasoning.Mode != ReasoningBlockModeSummary {
		t.Fatalf("reasoning mode = %s, want summary", summary.Reasoning.Mode)
	}
	if summary.Reasoning.Headline != "Mapping parser modules" {
		t.Fatalf("headline changed across mode transition: %q", summary.Reasoning.Headline)
	}
	if summary.Reasoning.Summary != "Checked request flow and the retry path." {
		t.Fatalf("summary body = %q", summary.Reasoning.Summary)
	}
}

// TestTranscriptAssistantBlockReconcilesProviderText verifies that a completed
// agentMessage item reconciles the streamed suffix inside the assistant_text block
// it belongs to, keeping block text consistent with the canonical message text.
func TestTranscriptAssistantBlockReconcilesProviderText(t *testing.T) {
	harness := &scriptedTranscriptHarness{
		start: func(ctx context.Context, _ TurnRequest, sink TurnSink) (TurnCompletion, error) {
			if err := linkTranscriptThread(sink); err != nil {
				return TurnCompletion{}, err
			}
			if err := sink.AssistantTextDelta("p1", "Hello wrld"); err != nil {
				return TurnCompletion{}, err
			}
			if err := sink.RunItemUpsert(RunItem{ProviderItemID: "p1", Type: RunItemTypeAgentMessage, Status: RunItemStatusCompleted, Summary: "Hello world"}); err != nil {
				return TurnCompletion{}, err
			}
			return TurnCompletion{Outcome: TurnOutcomeCompleted}, nil
		},
	}
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserMessage(workspaceID, conversationID, "trigger")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, workspaceID, conversationID, result.Run.ID, RunStatusCompleted)

	blocks := loadPersistedBlocks(t, service, workspaceID, result.Run.ID)
	text := assistantTextBlocks(blocks)
	if len(text) != 1 {
		t.Fatalf("assistant text blocks = %d, want 1", len(text))
	}
	if text[0].AssistantText.Text != "Hello world" {
		t.Fatalf("reconciled assistant block text = %q, want %q", text[0].AssistantText.Text, "Hello world")
	}
	// An agent_message item never produces an activity block.
	if len(activityBlocks(blocks)) != 0 {
		t.Fatalf("agent_message must not create an activity block: %v", blockKinds(blocks))
	}
}

// TestTranscriptIngestsProtocolActivityTypes drives the diverse run-item types
// the protocol-coverage workflow emits (hook, auto-approval review, file change,
// dynamic tool call, notice) through the service ingestion path and verifies that
// none of them error and each produces an activity block linked to its run item.
// This guards the additive ingestion against dropping run items from the UI.
func TestTranscriptIngestsProtocolActivityTypes(t *testing.T) {
	harness := &scriptedTranscriptHarness{
		start: func(ctx context.Context, _ TurnRequest, sink TurnSink) (TurnCompletion, error) {
			if err := linkTranscriptThread(sink); err != nil {
				return TurnCompletion{}, err
			}
			items := []RunItem{
				{ProviderItemID: "hook1", Type: RunItemTypeHook, Status: RunItemStatusRunning, Title: "Hook: pre-command"},
				{ProviderItemID: "hook1", Type: RunItemTypeHook, Status: RunItemStatusCompleted, Title: "Hook: pre-command"},
				{ProviderItemID: "approval_review_x", Type: RunItemTypeApprovalReview, Status: RunItemStatusCompleted, Title: "Auto-approval review", Summary: "Auto-review approved for command", ReviewID: "x", Details: json.RawMessage(`{"riskLevel":"low"}`)},
				{ProviderItemID: "patch1", Type: RunItemTypeFileChange, Status: RunItemStatusRunning, FilePaths: []string{"a.go"}, PatchStatus: "updated"},
				{ProviderItemID: "patch1", Type: RunItemTypeFileChange, Status: RunItemStatusCompleted, FilePaths: []string{"a.go"}, PatchStatus: "completed"},
				{ProviderItemID: "tool1", Type: RunItemTypeDynamicToolCall, Status: RunItemStatusCompleted, ToolName: "do_thing"},
				{ProviderItemID: "notice1", Type: RunItemTypeNotice, Status: RunItemStatusCompleted, NoticeKind: "deprecationNotice", NoticeMessage: "old api"},
			}
			for _, item := range items {
				if err := sink.RunItemUpsert(item); err != nil {
					return TurnCompletion{}, err
				}
			}
			if err := sink.AssistantTextDelta("final", "coverage complete"); err != nil {
				return TurnCompletion{}, err
			}
			return TurnCompletion{Outcome: TurnOutcomeCompleted}, nil
		},
	}
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserMessage(workspaceID, conversationID, "trigger")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	run := waitForRunStatus(t, service, workspaceID, conversationID, result.Run.ID, RunStatusCompleted)
	if run.Error != "" {
		t.Fatalf("run error = %q, want none", run.Error)
	}

	blocks := loadPersistedBlocks(t, service, workspaceID, result.Run.ID)
	wantTypes := map[RunItemType]bool{
		RunItemTypeHook:            false,
		RunItemTypeApprovalReview:  false,
		RunItemTypeFileChange:      false,
		RunItemTypeDynamicToolCall: false,
		RunItemTypeNotice:          false,
	}
	for _, block := range activityBlocks(blocks) {
		if _, expected := wantTypes[block.Activity.Type]; expected {
			wantTypes[block.Activity.Type] = true
		}
	}
	for itemType, seen := range wantTypes {
		if !seen {
			t.Fatalf("missing activity block for run item type %s: %v", itemType, blockKinds(blocks))
		}
	}
}

// TestTranscriptDuplicateAgentMessageDropsNonTailBlock verifies that when a
// duplicate completed agentMessage empties an assistant_text block that is no
// longer the tail (a later block already exists beneath it), the emptied block is
// removed rather than persisted blank.
func TestTranscriptDuplicateAgentMessageDropsNonTailBlock(t *testing.T) {
	harness := &scriptedTranscriptHarness{
		start: func(ctx context.Context, _ TurnRequest, sink TurnSink) (TurnCompletion, error) {
			if err := linkTranscriptThread(sink); err != nil {
				return TurnCompletion{}, err
			}
			emit := func(item RunItem) error { return sink.RunItemUpsert(item) }
			if err := sink.AssistantTextDelta("p1", "Final answer."); err != nil {
				return TurnCompletion{}, err
			}
			if err := emit(RunItem{ProviderItemID: "p1", Type: RunItemTypeAgentMessage, Status: RunItemStatusCompleted, Summary: "Final answer."}); err != nil {
				return TurnCompletion{}, err
			}
			if err := emit(RunItem{ProviderItemID: "cmd1", Type: RunItemTypeCommandExecution, Status: RunItemStatusCompleted, Title: "a", Command: "a"}); err != nil {
				return TurnCompletion{}, err
			}
			// Duplicate final text under a new provider item, then another visible
			// block, so the duplicate block is no longer the tail when it is emptied.
			if err := sink.AssistantTextDelta("p2", "Final answer."); err != nil {
				return TurnCompletion{}, err
			}
			if err := emit(RunItem{ProviderItemID: "cmd2", Type: RunItemTypeCommandExecution, Status: RunItemStatusCompleted, Title: "b", Command: "b"}); err != nil {
				return TurnCompletion{}, err
			}
			if err := emit(RunItem{ProviderItemID: "p2", Type: RunItemTypeAgentMessage, Status: RunItemStatusCompleted, Summary: "Final answer."}); err != nil {
				return TurnCompletion{}, err
			}
			return TurnCompletion{Outcome: TurnOutcomeCompleted}, nil
		},
	}
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserMessage(workspaceID, conversationID, "trigger")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, workspaceID, conversationID, result.Run.ID, RunStatusCompleted)

	blocks := loadPersistedBlocks(t, service, workspaceID, result.Run.ID)
	texts := assistantTextBlocks(blocks)
	if len(texts) != 1 {
		t.Fatalf("assistant text blocks = %d, want 1 (emptied duplicate removed): %v", len(texts), blockKinds(blocks))
	}
	for _, block := range blocks {
		if block.AssistantText != nil && block.AssistantText.Text == "" {
			t.Fatalf("blank assistant_text block persisted: %+v", block)
		}
	}
	// Ordinals remain strictly increasing even though the removed middle block
	// leaves a gap.
	previous := 0
	for _, block := range blocks {
		if block.Ordinal <= previous {
			t.Fatalf("ordinals not strictly increasing at %+v (previous %d)", block, previous)
		}
		previous = block.Ordinal
	}
}

// TestTranscriptImmediateSteeringReplayRemovesSourceSteeringBlock verifies that
// when pending steering is replayed as a fresh turn, the steering user_message
// block in the cancelled source run is removed (its message is deleted), so the
// text is not duplicated between the source run and the replay run's trigger.
func TestTranscriptImmediateSteeringReplayRemovesSourceSteeringBlock(t *testing.T) {
	var calls int32
	sourceReached := make(chan struct{})
	harness := &scriptedTranscriptHarness{
		start: func(ctx context.Context, _ TurnRequest, sink TurnSink) (TurnCompletion, error) {
			if err := linkTranscriptThread(sink); err != nil {
				return TurnCompletion{}, err
			}
			if atomic.AddInt32(&calls, 1) == 1 {
				if err := sink.AssistantTextDelta("src", "source work"); err != nil {
					return TurnCompletion{}, err
				}
				close(sourceReached)
				<-ctx.Done()
				return TurnCompletion{}, ctx.Err()
			}
			if err := sink.AssistantTextDelta("replay", "replay work"); err != nil {
				return TurnCompletion{}, err
			}
			return TurnCompletion{Outcome: TurnOutcomeCompleted}, nil
		},
	}
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	workspaceID, conversationID := startTranscriptConversation(t, service)
	source, err := service.SendUserMessage(workspaceID, conversationID, "original")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	<-sourceReached
	result, err := service.SendSteeringImmediately(workspaceID, conversationID, "steer text")
	if err != nil {
		t.Fatalf("send steering immediately: %v", err)
	}
	replayRunID := result.ActiveRun.ID
	waitForRunStatus(t, service, workspaceID, conversationID, replayRunID, RunStatusCompleted)

	for _, block := range loadPersistedBlocks(t, service, workspaceID, source.Run.ID) {
		if block.Kind == TranscriptBlockKindUserMessage && block.UserMessage.Delivery == MessageDeliverySteering {
			t.Fatalf("cancelled source run kept a steering block after replay: %+v", block.UserMessage)
		}
	}
	replayTrigger, ok := firstBlockOfKind(loadPersistedBlocks(t, service, workspaceID, replayRunID), TranscriptBlockKindUserMessage)
	if !ok || replayTrigger.UserMessage.Parts[0].Text.Text != "steer text" {
		t.Fatalf("replay trigger = %+v, want steer text", replayTrigger.UserMessage)
	}
}

// TestServiceStartupReconcilesTerminalRunStatusOnRecovery verifies that when a run
// already has a non-failed terminal run_status block (the live terminal path
// persisted a cancelled row before the run reached its terminal store record, then
// crashed), recovery marks the run failed and reconciles that row to failed in
// place — one terminal row that agrees with the recovered run, not a stale
// cancelled row beside a failed run.
func TestServiceStartupReconcilesTerminalRunStatusOnRecovery(t *testing.T) {
	appDataDir := t.TempDir()
	store := mustStore(t, appDataDir)
	const (
		workspaceID    = "workspace_api"
		conversationID = "conversation_api"
		runID          = "run_api"
		stamp          = "2026-05-29T20:00:00Z"
	)
	if err := store.SaveConversation(Conversation{
		SchemaVersion: SchemaVersion,
		ID:            conversationID,
		WorkspaceID:   workspaceID,
		Title:         "API",
		CreatedAt:     stamp,
		UpdatedAt:     stamp,
		HarnessRefs:   []HarnessThreadRef{},
	}); err != nil {
		t.Fatalf("save conversation: %v", err)
	}
	saveInterruptedMessage(t, store, workspaceID, conversationID, runID, "message_user", RoleUser, MessageStatusComplete, 1)
	saveInterruptedMessage(t, store, workspaceID, conversationID, runID, "message_assistant", RoleAssistant, MessageStatusStreaming, 2)
	if err := store.SaveRun(Run{
		SchemaVersion:      SchemaVersion,
		ID:                 runID,
		WorkspaceID:        workspaceID,
		ConversationID:     conversationID,
		TriggerMessageID:   "message_user",
		AssistantMessageID: "message_assistant",
		Harness:            HarnessCodex,
		Status:             RunStatusRunning,
		StartedAt:          stamp,
		PromptSummary:      "prompt",
	}); err != nil {
		t.Fatalf("save run: %v", err)
	}
	saveInterruptedBlock(t, store, workspaceID, runID, interruptedUserBlock(conversationID, runID, stamp))
	saveInterruptedBlock(t, store, workspaceID, runID, interruptedAssistantBlock(conversationID, runID, stamp))
	cancelledStatus := interruptedBlockBase(TranscriptBlockKindRunStatus, 3, "block_status", conversationID, runID, stamp)
	cancelledStatus.Status = TranscriptBlockStatusCancelled
	cancelledStatus.RunStatus = &RunStatusBlockProjection{Mode: RunStatusBlockModeCancelled, Label: "Cancelled"}
	saveInterruptedBlock(t, store, workspaceID, runID, cancelledStatus)

	service, err := NewService(
		store,
		testResolver(t),
		NewFakeHarness(nil),
		WithClock(func() time.Time { return mustTime(t, stamp) }),
		WithIDGenerator(func(prefix string) (string, error) { return prefix + "_recovery", nil }),
	)
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	blocks := loadPersistedBlocks(t, service, workspaceID, runID)
	runStatus := []TranscriptBlock{}
	for _, block := range blocks {
		if block.Kind == TranscriptBlockKindRunStatus {
			runStatus = append(runStatus, block)
		}
	}
	if len(runStatus) != 1 {
		t.Fatalf("run_status block count = %d, want 1 (reconciled in place, not duplicated): %v", len(runStatus), blockKinds(blocks))
	}
	if runStatus[0].RunStatus.Mode != RunStatusBlockModeFailed || runStatus[0].Status != TranscriptBlockStatusFailed {
		t.Fatalf("terminal run_status = (%s,%s), want failed/failed after reconcile", runStatus[0].RunStatus.Mode, runStatus[0].Status)
	}
	if blocks[1].Status != TranscriptBlockStatusFailed {
		t.Fatalf("streaming assistant block status = %s, want failed", blocks[1].Status)
	}
}

// TestTranscriptTerminalFinalizeIsIdempotent verifies that finalizing a turn twice
// (as happens when the terminal store transition fails after finalize and is
// retried) re-projects the single terminal run_status row in place instead of
// appending a duplicate.
func TestTranscriptTerminalFinalizeIsIdempotent(t *testing.T) {
	reached := make(chan struct{})
	release := make(chan struct{})
	harness := &scriptedTranscriptHarness{
		start: func(ctx context.Context, _ TurnRequest, sink TurnSink) (TurnCompletion, error) {
			if err := linkTranscriptThread(sink); err != nil {
				return TurnCompletion{}, err
			}
			if err := sink.AssistantTextDelta("p", "working"); err != nil {
				return TurnCompletion{}, err
			}
			close(reached)
			<-release
			return TurnCompletion{Outcome: TurnOutcomeCompleted}, nil
		},
	}
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserMessage(workspaceID, conversationID, "trigger")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	<-reached

	service.mu.Lock()
	ingest := service.active[activeKey(workspaceID, conversationID)].transcript
	firstErr := service.finalizeTranscriptBlocksLocked(workspaceID, ingest, TranscriptBlockStatusCancelled, "boom")
	retryErr := service.finalizeTranscriptBlocksLocked(workspaceID, ingest, TranscriptBlockStatusCancelled, "boom")
	blocks := ingest.snapshot()
	service.mu.Unlock()
	close(release)
	waitForRunStatus(t, service, workspaceID, conversationID, result.Run.ID, RunStatusCompleted)

	if firstErr != nil || retryErr != nil {
		t.Fatalf("finalize errors: first=%v retry=%v", firstErr, retryErr)
	}
	runStatusCount := 0
	for _, block := range blocks {
		if block.Kind == TranscriptBlockKindRunStatus {
			runStatusCount++
		}
	}
	if runStatusCount != 1 {
		t.Fatalf("terminal run_status count after retry = %d, want 1: %v", runStatusCount, blockKinds(blocks))
	}
}

// TestServiceStartupReprojectsFailedRunStatusError verifies the recovery invariant
// for the live-fail crash window: when a failed run_status block already carries
// the provider error (failTurn wrote it, then crashed before the run-save),
// recovery re-projects that row's error to the recovered run error so run and
// block agree on one failure reason.
func TestServiceStartupReprojectsFailedRunStatusError(t *testing.T) {
	appDataDir := t.TempDir()
	store := mustStore(t, appDataDir)
	const (
		workspaceID    = "workspace_api"
		conversationID = "conversation_api"
		runID          = "run_api"
		stamp          = "2026-05-29T20:00:00Z"
	)
	if err := store.SaveConversation(Conversation{
		SchemaVersion: SchemaVersion,
		ID:            conversationID,
		WorkspaceID:   workspaceID,
		Title:         "API",
		CreatedAt:     stamp,
		UpdatedAt:     stamp,
		HarnessRefs:   []HarnessThreadRef{},
	}); err != nil {
		t.Fatalf("save conversation: %v", err)
	}
	saveInterruptedMessage(t, store, workspaceID, conversationID, runID, "message_user", RoleUser, MessageStatusComplete, 1)
	saveInterruptedMessage(t, store, workspaceID, conversationID, runID, "message_assistant", RoleAssistant, MessageStatusStreaming, 2)
	if err := store.SaveRun(Run{
		SchemaVersion:      SchemaVersion,
		ID:                 runID,
		WorkspaceID:        workspaceID,
		ConversationID:     conversationID,
		TriggerMessageID:   "message_user",
		AssistantMessageID: "message_assistant",
		Harness:            HarnessCodex,
		Status:             RunStatusRunning,
		StartedAt:          stamp,
		PromptSummary:      "prompt",
	}); err != nil {
		t.Fatalf("save run: %v", err)
	}
	saveInterruptedBlock(t, store, workspaceID, runID, interruptedUserBlock(conversationID, runID, stamp))
	failedStatus := interruptedBlockBase(TranscriptBlockKindRunStatus, 2, "block_status", conversationID, runID, stamp)
	failedStatus.Status = TranscriptBlockStatusFailed
	failedStatus.RunStatus = &RunStatusBlockProjection{Mode: RunStatusBlockModeFailed, Label: "Failed", Error: "provider exploded"}
	saveInterruptedBlock(t, store, workspaceID, runID, failedStatus)

	service, err := NewService(
		store,
		testResolver(t),
		NewFakeHarness(nil),
		WithClock(func() time.Time { return mustTime(t, stamp) }),
		WithIDGenerator(func(prefix string) (string, error) { return prefix + "_recovery", nil }),
	)
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	run, err := service.store.LoadRun(workspaceID, runID)
	if err != nil {
		t.Fatalf("load run: %v", err)
	}
	if run.Error == "" || run.Error == "provider exploded" {
		t.Fatalf("recovered run error = %q, want interruption reason", run.Error)
	}
	status, ok := firstBlockOfKind(loadPersistedBlocks(t, service, workspaceID, runID), TranscriptBlockKindRunStatus)
	if !ok {
		t.Fatalf("missing run_status block after recovery")
	}
	if status.RunStatus.Error != run.Error {
		t.Fatalf("run_status error = %q, want %q (must match recovered run)", status.RunStatus.Error, run.Error)
	}
}

// TestServiceStartupSyncsInterruptedSteeringBlock verifies that recovery reconciles
// a pending steering message's persisted user_message block to the errored message
// status, since the in-memory sync path is gone after restart.
func TestServiceStartupSyncsInterruptedSteeringBlock(t *testing.T) {
	appDataDir := t.TempDir()
	store := mustStore(t, appDataDir)
	const (
		workspaceID    = "workspace_api"
		conversationID = "conversation_api"
		runID          = "run_api"
		stamp          = "2026-05-29T20:00:00Z"
	)
	if err := store.SaveConversation(Conversation{
		SchemaVersion: SchemaVersion,
		ID:            conversationID,
		WorkspaceID:   workspaceID,
		Title:         "API",
		CreatedAt:     stamp,
		UpdatedAt:     stamp,
		HarnessRefs:   []HarnessThreadRef{},
	}); err != nil {
		t.Fatalf("save conversation: %v", err)
	}
	saveInterruptedMessage(t, store, workspaceID, conversationID, runID, "message_user", RoleUser, MessageStatusComplete, 1)
	saveInterruptedMessage(t, store, workspaceID, conversationID, runID, "message_assistant", RoleAssistant, MessageStatusStreaming, 2)
	// A steering message left pending when the backend restarted.
	steering := ChatMessage{
		SchemaVersion:  SchemaVersion,
		ID:             "message_steer",
		ConversationID: conversationID,
		RunID:          runID,
		Role:           RoleUser,
		Delivery:       MessageDeliverySteering,
		Ordinal:        3,
		CreatedAt:      stamp,
		UpdatedAt:      stamp,
		Status:         MessageStatusPending,
		Parts: []MessagePart{{
			ID:   "part_steer",
			Type: MessagePartText,
			Text: &MessageTextPart{
				Text:   "steer",
				Format: TextFormatPlain,
			},
		}},
	}
	if err := store.SaveMessage(workspaceID, steering); err != nil {
		t.Fatalf("save steering message: %v", err)
	}
	if err := store.SaveRun(Run{
		SchemaVersion:      SchemaVersion,
		ID:                 runID,
		WorkspaceID:        workspaceID,
		ConversationID:     conversationID,
		TriggerMessageID:   "message_user",
		AssistantMessageID: "message_assistant",
		Harness:            HarnessCodex,
		Status:             RunStatusRunning,
		StartedAt:          stamp,
		PromptSummary:      "prompt",
	}); err != nil {
		t.Fatalf("save run: %v", err)
	}
	saveInterruptedBlock(t, store, workspaceID, runID, interruptedUserBlock(conversationID, runID, stamp))
	steerBlock := interruptedBlockBase(TranscriptBlockKindUserMessage, 2, "block_steer", conversationID, runID, stamp)
	steerBlock.Status = TranscriptBlockStatusComplete
	steerBlock.UserMessage = &TranscriptMessageProjection{
		MessageID: "message_steer",
		Role:      RoleUser,
		Delivery:  MessageDeliverySteering,
		Status:    MessageStatusPending,
		Parts: []MessagePart{{
			ID:   "part_steer",
			Type: MessagePartText,
			Text: &MessageTextPart{
				Text:   "steer",
				Format: TextFormatPlain,
			},
		}},
	}
	saveInterruptedBlock(t, store, workspaceID, runID, steerBlock)

	service, err := NewService(
		store,
		testResolver(t),
		NewFakeHarness(nil),
		WithClock(func() time.Time { return mustTime(t, stamp) }),
		WithIDGenerator(func(prefix string) (string, error) { return prefix + "_recovery", nil }),
	)
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	for _, block := range loadPersistedBlocks(t, service, workspaceID, runID) {
		if block.Kind == TranscriptBlockKindUserMessage && block.UserMessage.MessageID == "message_steer" {
			if block.UserMessage.Status != MessageStatusError {
				t.Fatalf("steering block status = %s, want error after recovery", block.UserMessage.Status)
			}
			return
		}
	}
	t.Fatal("steering user_message block was not found after recovery")
}

// TestServiceStartupFailsInterruptedTranscriptBlocks verifies that recovering a
// run interrupted by a backend restart marks its still-streaming persisted blocks
// failed and appends a permanent failed run_status row, since no in-memory
// chronology survives the restart.
func TestServiceStartupFailsInterruptedTranscriptBlocks(t *testing.T) {
	appDataDir := t.TempDir()
	store := mustStore(t, appDataDir)
	const (
		workspaceID    = "workspace_api"
		conversationID = "conversation_api"
		runID          = "run_api"
		stamp          = "2026-05-29T20:00:00Z"
	)
	if err := store.SaveConversation(Conversation{
		SchemaVersion: SchemaVersion,
		ID:            conversationID,
		WorkspaceID:   workspaceID,
		Title:         "API",
		CreatedAt:     stamp,
		UpdatedAt:     stamp,
		HarnessRefs:   []HarnessThreadRef{},
	}); err != nil {
		t.Fatalf("save conversation: %v", err)
	}
	saveInterruptedMessage(t, store, workspaceID, conversationID, runID, "message_user", RoleUser, MessageStatusComplete, 1)
	saveInterruptedMessage(t, store, workspaceID, conversationID, runID, "message_assistant", RoleAssistant, MessageStatusStreaming, 2)
	if err := store.SaveRun(Run{
		SchemaVersion:      SchemaVersion,
		ID:                 runID,
		WorkspaceID:        workspaceID,
		ConversationID:     conversationID,
		TriggerMessageID:   "message_user",
		AssistantMessageID: "message_assistant",
		Harness:            HarnessCodex,
		Status:             RunStatusRunning,
		StartedAt:          stamp,
		PromptSummary:      "prompt",
	}); err != nil {
		t.Fatalf("save run: %v", err)
	}
	if err := store.SaveRunItem(RunItem{
		SchemaVersion:  SchemaVersion,
		ID:             "item_cmd",
		WorkspaceID:    workspaceID,
		ConversationID: conversationID,
		RunID:          runID,
		ProviderItemID: "p",
		Type:           RunItemTypeCommandExecution,
		Status:         RunItemStatusRunning,
		CreatedAt:      stamp,
	}); err != nil {
		t.Fatalf("save run item: %v", err)
	}
	saveInterruptedBlock(t, store, workspaceID, runID, interruptedUserBlock(conversationID, runID, stamp))
	saveInterruptedBlock(t, store, workspaceID, runID, interruptedAssistantBlock(conversationID, runID, stamp))
	saveInterruptedBlock(t, store, workspaceID, runID, interruptedActivityBlock(conversationID, runID, stamp))

	service, err := NewService(
		store,
		testResolver(t),
		NewFakeHarness(nil),
		WithClock(func() time.Time { return mustTime(t, stamp) }),
		WithIDGenerator(func(prefix string) (string, error) { return prefix + "_recovery", nil }),
	)
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	blocks := loadPersistedBlocks(t, service, workspaceID, runID)
	assertBlockKindSequence(t, blocks, []TranscriptBlockKind{
		TranscriptBlockKindUserMessage,
		TranscriptBlockKindAssistantText,
		TranscriptBlockKindActivityItem,
		TranscriptBlockKindRunStatus,
	})
	if blocks[0].Status != TranscriptBlockStatusComplete {
		t.Fatalf("user_message block status = %s, want complete", blocks[0].Status)
	}
	if blocks[1].Status != TranscriptBlockStatusFailed {
		t.Fatalf("assistant_text block status = %s, want failed", blocks[1].Status)
	}
	if blocks[2].Status != TranscriptBlockStatusFailed || blocks[2].Activity.Status != RunItemStatusFailed {
		t.Fatalf("activity block = (%s,%s), want failed/failed", blocks[2].Status, blocks[2].Activity.Status)
	}
	terminal := blocks[3]
	if terminal.RunStatus.Mode != RunStatusBlockModeFailed || !strings.Contains(terminal.RunStatus.Error, "interrupted") {
		t.Fatalf("terminal run_status = %+v, want failed with interruption error", terminal.RunStatus)
	}
}

func saveInterruptedMessage(t *testing.T, store *Store, workspaceID string, conversationID string, runID string, id string, role MessageRole, status MessageStatus, ordinal int) {
	t.Helper()
	if err := store.SaveMessage(workspaceID, ChatMessage{
		SchemaVersion:  SchemaVersion,
		ID:             id,
		ConversationID: conversationID,
		RunID:          runID,
		Role:           role,
		Delivery:       MessageDeliveryNormal,
		Ordinal:        ordinal,
		CreatedAt:      "2026-05-29T20:00:00Z",
		UpdatedAt:      "2026-05-29T20:00:00Z",
		Status:         status,
		Parts: []MessagePart{{
			ID:   "part_" + id,
			Type: MessagePartText,
			Text: &MessageTextPart{
				Text:   "text",
				Format: TextFormatPlain,
			},
		}},
	}); err != nil {
		t.Fatalf("save message %s: %v", id, err)
	}
}

func interruptedBlockBase(kind TranscriptBlockKind, ordinal int, id string, conversationID string, runID string, stamp string) TranscriptBlock {
	return TranscriptBlock{
		SchemaVersion:    SchemaVersion,
		ID:               id,
		ConversationID:   conversationID,
		RunID:            runID,
		Kind:             kind,
		Ordinal:          ordinal,
		RunAnchorOrdinal: 1,
		Status:           TranscriptBlockStatusStreaming,
		CreatedAt:        stamp,
		UpdatedAt:        stamp,
	}
}

func interruptedUserBlock(conversationID string, runID string, stamp string) TranscriptBlock {
	block := interruptedBlockBase(TranscriptBlockKindUserMessage, 1, "block_user", conversationID, runID, stamp)
	block.Status = TranscriptBlockStatusComplete
	block.UserMessage = &TranscriptMessageProjection{
		MessageID: "message_user",
		Role:      RoleUser,
		Delivery:  MessageDeliveryNormal,
		Status:    MessageStatusComplete,
		Parts: []MessagePart{{
			ID:   "part_user",
			Type: MessagePartText,
			Text: &MessageTextPart{
				Text:   "prompt",
				Format: TextFormatPlain,
			},
		}},
	}
	return block
}

func interruptedAssistantBlock(conversationID string, runID string, stamp string) TranscriptBlock {
	block := interruptedBlockBase(TranscriptBlockKindAssistantText, 2, "block_text", conversationID, runID, stamp)
	block.AssistantText = &AssistantTextBlockProjection{Text: "partial answer", Format: TextFormatMarkdown}
	return block
}

func interruptedActivityBlock(conversationID string, runID string, stamp string) TranscriptBlock {
	block := interruptedBlockBase(TranscriptBlockKindActivityItem, 3, "block_cmd", conversationID, runID, stamp)
	block.Activity = &ActivityItemBlockProjection{
		SourceRunItemID: "item_cmd",
		Type:            RunItemTypeCommandExecution,
		Title:           "command",
		Status:          RunItemStatusRunning,
	}
	return block
}

func saveInterruptedBlock(t *testing.T, store *Store, workspaceID string, runID string, block TranscriptBlock) {
	t.Helper()
	if err := store.SaveTranscriptBlock(workspaceID, runID, block); err != nil {
		t.Fatalf("save transcript block %s: %v", block.ID, err)
	}
}

// TestTranscriptDuplicateCompletedAgentMessageDropsBlock verifies that an
// identical completed agentMessage from a distinct provider item does not
// duplicate final assistant text: the duplicate's tail block is removed.
func TestTranscriptDuplicateCompletedAgentMessageDropsBlock(t *testing.T) {
	harness := &scriptedTranscriptHarness{
		start: func(ctx context.Context, _ TurnRequest, sink TurnSink) (TurnCompletion, error) {
			if err := linkTranscriptThread(sink); err != nil {
				return TurnCompletion{}, err
			}
			if err := sink.AssistantTextDelta("p1", "Final answer."); err != nil {
				return TurnCompletion{}, err
			}
			if err := sink.RunItemUpsert(RunItem{ProviderItemID: "p1", Type: RunItemTypeAgentMessage, Status: RunItemStatusCompleted, Summary: "Final answer."}); err != nil {
				return TurnCompletion{}, err
			}
			// Replay of the same final text under a new provider item id.
			if err := sink.AssistantTextDelta("p2", "Final answer."); err != nil {
				return TurnCompletion{}, err
			}
			if err := sink.RunItemUpsert(RunItem{ProviderItemID: "p2", Type: RunItemTypeAgentMessage, Status: RunItemStatusCompleted, Summary: "Final answer."}); err != nil {
				return TurnCompletion{}, err
			}
			return TurnCompletion{Outcome: TurnOutcomeCompleted}, nil
		},
	}
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserMessage(workspaceID, conversationID, "trigger")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, workspaceID, conversationID, result.Run.ID, RunStatusCompleted)

	blocks := loadPersistedBlocks(t, service, workspaceID, result.Run.ID)
	text := assistantTextBlocks(blocks)
	if len(text) != 1 {
		t.Fatalf("assistant text blocks = %d, want 1 (duplicate must be dropped): %v", len(text), blockKinds(blocks))
	}
	if text[0].AssistantText.Text != "Final answer." {
		t.Fatalf("assistant block text = %q, want %q", text[0].AssistantText.Text, "Final answer.")
	}
	assertMonotonicOrdinals(t, blocks)
}
