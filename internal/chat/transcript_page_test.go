package chat

import (
	"context"
	"fmt"
	"testing"
)

// multiBlockHarness drives a turn that emits one assistant text segment followed
// by commandCount command activity blocks, so block-aware pagination has a
// predictable, ordered block stream to window.
func multiBlockHarness(text string, commandCount int) *scriptedTranscriptHarness {
	return &scriptedTranscriptHarness{
		start: func(_ context.Context, _ TurnRequest, sink TurnSink) (TurnCompletion, error) {
			if err := linkTranscriptThread(sink); err != nil {
				return TurnCompletion{}, err
			}
			if err := sink.AssistantTextDelta("answer", text); err != nil {
				return TurnCompletion{}, err
			}
			for index := 0; index < commandCount; index++ {
				id := fmt.Sprintf("cmd_%d", index)
				item := RunItem{ProviderItemID: id, Type: RunItemTypeCommandExecution, Status: RunItemStatusCompleted, Title: id, Command: "run " + id}
				if err := sink.RunItemUpsert(item); err != nil {
					return TurnCompletion{}, err
				}
			}
			return TurnCompletion{Outcome: TurnOutcomeCompleted}, nil
		},
	}
}

func assertBlockIDSequence(t *testing.T, got []TranscriptBlock, want []TranscriptBlock) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("block count = %d, want %d (got %v, want %v)", len(got), len(want), blockKinds(got), blockKinds(want))
	}
	for index := range want {
		if got[index].ID != want[index].ID || got[index].Ordinal != want[index].Ordinal || got[index].Kind != want[index].Kind {
			t.Fatalf("block[%d] = {id:%s ord:%d kind:%s}, want {id:%s ord:%d kind:%s}", index,
				got[index].ID, got[index].Ordinal, got[index].Kind,
				want[index].ID, want[index].Ordinal, want[index].Kind)
		}
	}
}

// collectOlderToNewer pages the conversation transcript backward from the latest
// page, prepending each older page, so the result is the full conversation block
// order reconstructed purely through block-ordinal pagination.
func collectOlderToNewer(t *testing.T, service *Service, workspaceID string, conversationID string, limit int) []TranscriptBlock {
	t.Helper()
	collected := []TranscriptBlock{}
	before := 0
	for guard := 0; guard < 1000; guard++ {
		page, err := service.LoadMessagePage(workspaceID, conversationID, before, limit)
		if err != nil {
			t.Fatalf("load message page: %v", err)
		}
		if len(page.Blocks) > limit {
			t.Fatalf("page returned %d blocks, want at most limit %d (unbounded page)", len(page.Blocks), limit)
		}
		collected = append(append([]TranscriptBlock{}, page.Blocks...), collected...)
		if !page.HasMoreOlder {
			return collected
		}
		if page.OlderBeforeBlockOrdinal <= 1 {
			t.Fatalf("HasMoreOlder is true but OlderBeforeBlockOrdinal = %d cannot advance", page.OlderBeforeBlockOrdinal)
		}
		before = page.OlderBeforeBlockOrdinal
	}
	t.Fatalf("pagination did not terminate")
	return nil
}

// TestTranscriptBlockPagePaginatesByBlockOrdinal verifies the transcript page is
// bounded to the block limit and that following OlderBeforeBlockOrdinal backward
// reconstructs the full conversation block order, including across a page boundary
// that falls inside a single run.
func TestTranscriptBlockPagePaginatesByBlockOrdinal(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), multiBlockHarness("Done.", 6))
	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserInput(workspaceID, conversationID, TextChatInput("go"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, workspaceID, conversationID, result.Run.ID, RunStatusCompleted)

	full := loadPersistedBlocks(t, service, workspaceID, result.Run.ID)
	if len(full) != 8 {
		t.Fatalf("persisted blocks = %d, want 8 (user + text + 6 commands)", len(full))
	}

	latest, err := service.LoadMessagePage(workspaceID, conversationID, 0, 3)
	if err != nil {
		t.Fatalf("load latest page: %v", err)
	}
	assertBlockIDSequence(t, latest.Blocks, full[len(full)-3:])
	if !latest.HasMoreOlder {
		t.Fatalf("latest page HasMoreOlder = false, want true")
	}
	if latest.OlderBeforeBlockOrdinal != len(full)-3+1 {
		t.Fatalf("OlderBeforeBlockOrdinal = %d, want %d", latest.OlderBeforeBlockOrdinal, len(full)-3+1)
	}

	reconstructed := collectOlderToNewer(t, service, workspaceID, conversationID, 3)
	assertBlockIDSequence(t, reconstructed, full)
}

// TestTranscriptBlockPageBoundsGiantRun verifies a single run far larger than the
// page limit never dumps all of its blocks: the latest page returns exactly the
// limit, the newest blocks, and a cursor to page older.
func TestTranscriptBlockPageBoundsGiantRun(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), multiBlockHarness("Done.", 30))
	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserInput(workspaceID, conversationID, TextChatInput("go"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, workspaceID, conversationID, result.Run.ID, RunStatusCompleted)

	full := loadPersistedBlocks(t, service, workspaceID, result.Run.ID)
	if len(full) != 32 {
		t.Fatalf("persisted blocks = %d, want 32", len(full))
	}
	page, err := service.LoadMessagePage(workspaceID, conversationID, 0, 5)
	if err != nil {
		t.Fatalf("load page: %v", err)
	}
	if len(page.Blocks) != 5 {
		t.Fatalf("giant-run page returned %d blocks, want 5", len(page.Blocks))
	}
	assertBlockIDSequence(t, page.Blocks, full[len(full)-5:])
	if page.OlderBeforeBlockOrdinal != len(full)-5+1 {
		t.Fatalf("OlderBeforeBlockOrdinal = %d, want %d", page.OlderBeforeBlockOrdinal, len(full)-5+1)
	}
	// Reconstructing through pagination still yields exactly the persisted order.
	assertBlockIDSequence(t, collectOlderToNewer(t, service, workspaceID, conversationID, 5), full)
}

// TestTranscriptBlockPageOrdersRunsByAnchor verifies blocks from multiple runs are
// ordered by run anchor (trigger message conversation ordinal) then run-local
// block ordinal, and that pagination crosses run boundaries in that order.
func TestTranscriptBlockPageOrdersRunsByAnchor(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), multiBlockHarness("Done.", 2))
	workspaceID, conversationID := startTranscriptConversation(t, service)

	first, err := service.SendUserInput(workspaceID, conversationID, TextChatInput("first"))
	if err != nil {
		t.Fatalf("send first: %v", err)
	}
	waitForRunStatus(t, service, workspaceID, conversationID, first.Run.ID, RunStatusCompleted)
	second, err := service.SendUserInput(workspaceID, conversationID, TextChatInput("second"))
	if err != nil {
		t.Fatalf("send second: %v", err)
	}
	waitForRunStatus(t, service, workspaceID, conversationID, second.Run.ID, RunStatusCompleted)

	firstBlocks := loadPersistedBlocks(t, service, workspaceID, first.Run.ID)
	secondBlocks := loadPersistedBlocks(t, service, workspaceID, second.Run.ID)
	expected := append(append([]TranscriptBlock{}, firstBlocks...), secondBlocks...)

	page, err := service.LoadMessagePage(workspaceID, conversationID, 0, 50)
	if err != nil {
		t.Fatalf("load full page: %v", err)
	}
	assertBlockIDSequence(t, page.Blocks, expected)
	assertBlockIDSequence(t, collectOlderToNewer(t, service, workspaceID, conversationID, 3), expected)
}

// TestTranscriptBlockPageFailsLoudlyOnCorruptRun verifies the windowed page read
// still enforces run-level block integrity: a run with two blocks sharing an
// ordinal must fail loudly rather than page through duplicate/out-of-order blocks.
func TestTranscriptBlockPageFailsLoudlyOnCorruptRun(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), multiBlockHarness("Done.", 2))
	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserInput(workspaceID, conversationID, TextChatInput("go"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, workspaceID, conversationID, result.Run.ID, RunStatusCompleted)

	blocks := loadPersistedBlocks(t, service, workspaceID, result.Run.ID)
	forged := blocks[1]
	forged.ID = "transcript_block_forged"
	forged.AssistantText = &AssistantTextBlockProjection{Text: "duplicate ordinal", Format: TextFormatMarkdown}
	if err := service.store.SaveTranscriptBlock(workspaceID, result.Run.ID, forged); err != nil {
		t.Fatalf("save forged duplicate-ordinal block: %v", err)
	}

	if _, err := service.LoadMessagePage(workspaceID, conversationID, 0, 20); err == nil {
		t.Fatalf("LoadMessagePage succeeded on a corrupt run, want a loud corrupt-state error")
	} else if !IsCorruptStateError(err) {
		t.Fatalf("LoadMessagePage error = %v, want a corrupt-state error", err)
	}
}

// TestTranscriptBlockPageSurfacesLiveActiveRun verifies the page includes the live
// active run's in-memory blocks (including the working indicator before any public
// block), and that after completion the same page reflects the persisted order
// with no working indicator.
func TestTranscriptBlockPageSurfacesLiveActiveRun(t *testing.T) {
	reached := make(chan struct{})
	release := make(chan struct{})
	harness := &scriptedTranscriptHarness{
		start: func(_ context.Context, _ TurnRequest, sink TurnSink) (TurnCompletion, error) {
			if err := linkTranscriptThread(sink); err != nil {
				return TurnCompletion{}, err
			}
			// Private/generic reasoning produces no block, so the run has no public
			// output and the page must surface only the live working indicator.
			if err := sink.RunItemUpsert(RunItem{ProviderItemID: "private", Type: RunItemTypeReasoning, Status: RunItemStatusRunning, HiddenText: "secret"}); err != nil {
				return TurnCompletion{}, err
			}
			close(reached)
			<-release
			if err := sink.AssistantTextDelta("answer", "Found it."); err != nil {
				return TurnCompletion{}, err
			}
			return TurnCompletion{Outcome: TurnOutcomeCompleted}, nil
		},
	}
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	workspaceID, conversationID := startTranscriptConversation(t, service)
	result, err := service.SendUserInput(workspaceID, conversationID, TextChatInput("trigger"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}

	<-reached
	live, err := service.LoadMessagePage(workspaceID, conversationID, 0, 20)
	if err != nil {
		t.Fatalf("load live page: %v", err)
	}
	assertBlockKindSequence(t, live.Blocks, []TranscriptBlockKind{
		TranscriptBlockKindUserMessage,
		TranscriptBlockKindRunStatus,
	})
	if live.Blocks[1].RunStatus.Mode != RunStatusBlockModeWorking {
		t.Fatalf("live tail mode = %s, want working", live.Blocks[1].RunStatus.Mode)
	}

	close(release)
	waitForRunStatus(t, service, workspaceID, conversationID, result.Run.ID, RunStatusCompleted)
	final, err := service.LoadMessagePage(workspaceID, conversationID, 0, 20)
	if err != nil {
		t.Fatalf("load final page: %v", err)
	}
	assertBlockKindSequence(t, final.Blocks, []TranscriptBlockKind{
		TranscriptBlockKindUserMessage,
		TranscriptBlockKindAssistantText,
	})
}
