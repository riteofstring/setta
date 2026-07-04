package chat

import (
	"fmt"
	"os"
	"testing"
)

const (
	transcriptBlockTestWorkspace = "workspace_blocks"
	transcriptBlockTestRun       = "run_blocks"
	transcriptBlockTestConv      = "conversation_blocks"
	transcriptBlockTestTime      = "2026-06-27T12:00:00Z"
)

func transcriptBlockBase(ordinal int, id string) TranscriptBlock {
	return TranscriptBlock{
		SchemaVersion:    SchemaVersion,
		ID:               id,
		ConversationID:   transcriptBlockTestConv,
		RunID:            transcriptBlockTestRun,
		Ordinal:          ordinal,
		RunAnchorOrdinal: 1,
		Status:           TranscriptBlockStatusComplete,
		CreatedAt:        transcriptBlockTestTime,
		UpdatedAt:        transcriptBlockTestTime,
	}
}

func validTranscriptBlock(kind TranscriptBlockKind, ordinal int, id string) TranscriptBlock {
	block := transcriptBlockBase(ordinal, id)
	block.Kind = kind
	switch kind {
	case TranscriptBlockKindUserMessage:
		block.UserMessage = &TranscriptMessageProjection{
			MessageID: "message_" + id,
			Role:      RoleUser,
			Delivery:  MessageDeliveryNormal,
			Status:    MessageStatusComplete,
			Parts: []MessagePart{{
				ID:   "part_" + id,
				Type: MessagePartText,
				Text: &MessageTextPart{
					Text:   "hello",
					Format: TextFormatPlain,
				},
			}},
		}
	case TranscriptBlockKindAssistantText:
		block.AssistantText = &AssistantTextBlockProjection{Text: "hello", Format: TextFormatMarkdown}
	case TranscriptBlockKindReasoning:
		block.Reasoning = &ReasoningBlockProjection{
			SourceRunItemID: "item_" + id,
			Mode:            ReasoningBlockModeThinking,
			Headline:        "Mapping modules",
		}
	case TranscriptBlockKindActivityItem:
		block.Activity = &ActivityItemBlockProjection{
			SourceRunItemID: "item_" + id,
			Type:            RunItemTypeCommandExecution,
			Title:           "command execution",
			Status:          RunItemStatusCompleted,
		}
	case TranscriptBlockKindRunStatus:
		block.RunStatus = &RunStatusBlockProjection{
			Mode:  RunStatusBlockModeCompleted,
			Label: "completed",
		}
	}
	return block
}

func TestStoreNextTranscriptBlockOrdinalAllocatesMonotonically(t *testing.T) {
	store := mustStore(t, t.TempDir())
	workspaceID, runID := transcriptBlockTestWorkspace, transcriptBlockTestRun

	next, err := store.NextTranscriptBlockOrdinal(workspaceID, runID)
	if err != nil {
		t.Fatalf("next ordinal (empty): %v", err)
	}
	if next != 1 {
		t.Fatalf("first ordinal = %d, want 1", next)
	}
	for ordinal := 1; ordinal <= 3; ordinal++ {
		block := validTranscriptBlock(TranscriptBlockKindAssistantText, ordinal, fmt.Sprintf("block-%d", ordinal))
		if err := store.SaveTranscriptBlock(workspaceID, runID, block); err != nil {
			t.Fatalf("save block %d: %v", ordinal, err)
		}
		next, err := store.NextTranscriptBlockOrdinal(workspaceID, runID)
		if err != nil {
			t.Fatalf("next ordinal after %d: %v", ordinal, err)
		}
		if next != ordinal+1 {
			t.Fatalf("next ordinal after saving %d = %d, want %d", ordinal, next, ordinal+1)
		}
	}
}

func TestStoreTranscriptBlocksRoundTripPreservesOrdinalOrder(t *testing.T) {
	store := mustStore(t, t.TempDir())
	workspaceID, runID := transcriptBlockTestWorkspace, transcriptBlockTestRun

	for _, ordinal := range []int{3, 1, 2} {
		block := validTranscriptBlock(TranscriptBlockKindAssistantText, ordinal, fmt.Sprintf("block-%d", ordinal))
		if err := store.SaveTranscriptBlock(workspaceID, runID, block); err != nil {
			t.Fatalf("save block %d: %v", ordinal, err)
		}
	}
	blocks, err := store.LoadTranscriptBlocks(workspaceID, runID)
	if err != nil {
		t.Fatalf("load blocks: %v", err)
	}
	if len(blocks) != 3 {
		t.Fatalf("block count = %d, want 3", len(blocks))
	}
	for index, block := range blocks {
		if block.Ordinal != index+1 {
			t.Fatalf("blocks[%d].Ordinal = %d, want %d", index, block.Ordinal, index+1)
		}
	}
}

func TestStoreTranscriptBlocksReloadReconstructsOrderForEachKind(t *testing.T) {
	dir := t.TempDir()
	workspaceID, runID := transcriptBlockTestWorkspace, transcriptBlockTestRun
	kinds := []TranscriptBlockKind{
		TranscriptBlockKindUserMessage,
		TranscriptBlockKindAssistantText,
		TranscriptBlockKindActivityItem,
		TranscriptBlockKindReasoning,
		TranscriptBlockKindRunStatus,
	}

	writeStore := mustStore(t, dir)
	for index, kind := range kinds {
		id := fmt.Sprintf("block-%d", index+1)
		block := validTranscriptBlock(kind, index+1, id)
		switch kind {
		case TranscriptBlockKindActivityItem:
			saveSourceRunItem(t, writeStore, workspaceID, runID, block.Activity.SourceRunItemID, block.Activity.Type)
		case TranscriptBlockKindReasoning:
			saveSourceRunItem(t, writeStore, workspaceID, runID, block.Reasoning.SourceRunItemID, RunItemTypeReasoning)
		}
		if err := writeStore.SaveTranscriptBlock(workspaceID, runID, block); err != nil {
			t.Fatalf("save %s block: %v", kind, err)
		}
	}

	reloadStore := mustStore(t, dir)
	blocks, err := reloadStore.LoadTranscriptBlocks(workspaceID, runID)
	if err != nil {
		t.Fatalf("reload blocks: %v", err)
	}
	if len(blocks) != len(kinds) {
		t.Fatalf("block count = %d, want %d", len(blocks), len(kinds))
	}
	for index, block := range blocks {
		if block.Ordinal != index+1 {
			t.Fatalf("blocks[%d].Ordinal = %d, want %d", index, block.Ordinal, index+1)
		}
		if block.Kind != kinds[index] {
			t.Fatalf("blocks[%d].Kind = %s, want %s", index, block.Kind, kinds[index])
		}
	}
}

func TestStoreSaveTranscriptBlockRejectsRunMismatch(t *testing.T) {
	store := mustStore(t, t.TempDir())
	block := validTranscriptBlock(TranscriptBlockKindAssistantText, 1, "block-1")
	if err := store.SaveTranscriptBlock(transcriptBlockTestWorkspace, "run_other", block); err == nil {
		t.Fatal("save mismatched run succeeded, want error")
	}
}

func TestStoreLoadTranscriptBlocksRejectsDuplicateOrdinal(t *testing.T) {
	store := mustStore(t, t.TempDir())
	workspaceID, runID := transcriptBlockTestWorkspace, transcriptBlockTestRun
	for _, id := range []string{"block-a", "block-b"} {
		block := validTranscriptBlock(TranscriptBlockKindAssistantText, 1, id)
		if err := store.SaveTranscriptBlock(workspaceID, runID, block); err != nil {
			t.Fatalf("save %s: %v", id, err)
		}
	}
	_, err := store.LoadTranscriptBlocks(workspaceID, runID)
	if err == nil {
		t.Fatal("load duplicate-ordinal blocks succeeded, want corrupt state error")
	}
	if !IsCorruptStateError(err) {
		t.Fatalf("error = %T %v, want corrupt state", err, err)
	}
}

func TestStoreLoadTranscriptBlocksRejectsOrdinalFilenameMismatch(t *testing.T) {
	store := mustStore(t, t.TempDir())
	workspaceID, runID := transcriptBlockTestWorkspace, transcriptBlockTestRun
	block := validTranscriptBlock(TranscriptBlockKindAssistantText, 2, "block-2")
	// Persist a block whose internal ordinal (2) disagrees with its filename ordinal (5).
	if err := writeJSONFile(store.transcriptBlockPath(workspaceID, runID, 5, block.ID), block); err != nil {
		t.Fatalf("write mismatched block: %v", err)
	}
	_, err := store.LoadTranscriptBlocks(workspaceID, runID)
	if err == nil {
		t.Fatal("load ordinal/filename mismatch succeeded, want corrupt state error")
	}
	if !IsCorruptStateError(err) {
		t.Fatalf("error = %T %v, want corrupt state", err, err)
	}
}

func TestValidateTranscriptBlockAcceptsEachKind(t *testing.T) {
	kinds := []TranscriptBlockKind{
		TranscriptBlockKindUserMessage,
		TranscriptBlockKindAssistantText,
		TranscriptBlockKindReasoning,
		TranscriptBlockKindActivityItem,
		TranscriptBlockKindRunStatus,
	}
	for index, kind := range kinds {
		block := validTranscriptBlock(kind, index+1, fmt.Sprintf("block-%d", index+1))
		if err := validateTranscriptBlock(block); err != nil {
			t.Fatalf("validate %s block: %v", kind, err)
		}
	}
}

func TestValidateTranscriptBlockRejectsBranchProblems(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(*TranscriptBlock)
	}{
		{
			name:   "no branch populated",
			mutate: func(block *TranscriptBlock) { block.AssistantText = nil },
		},
		{
			name: "two branches populated",
			mutate: func(block *TranscriptBlock) {
				block.Reasoning = &ReasoningBlockProjection{SourceRunItemID: "item_x", Mode: ReasoningBlockModeThinking, Headline: "x"}
			},
		},
		{
			name: "kind and branch mismatch",
			mutate: func(block *TranscriptBlock) {
				block.AssistantText = nil
				block.Reasoning = &ReasoningBlockProjection{SourceRunItemID: "item_x", Mode: ReasoningBlockModeThinking, Headline: "x"}
			},
		},
		{
			name:   "unsupported kind",
			mutate: func(block *TranscriptBlock) { block.Kind = "mystery" },
		},
		{
			name:   "non-positive ordinal",
			mutate: func(block *TranscriptBlock) { block.Ordinal = 0 },
		},
		{
			name:   "unsupported status",
			mutate: func(block *TranscriptBlock) { block.Status = "bogus" },
		},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			block := validTranscriptBlock(TranscriptBlockKindAssistantText, 1, "block-1")
			testCase.mutate(&block)
			if err := validateTranscriptBlock(block); err == nil {
				t.Fatalf("validate %q succeeded, want error", testCase.name)
			}
		})
	}
}

func TestValidateTranscriptBlockRejectsInvalidSourceRunItemID(t *testing.T) {
	block := validTranscriptBlock(TranscriptBlockKindActivityItem, 1, "block-1")
	block.Activity.SourceRunItemID = "bad id!"
	if err := validateTranscriptBlock(block); err == nil {
		t.Fatal("validate activity with malformed source run item id succeeded, want error")
	}
	block.Activity.SourceRunItemID = ""
	if err := validateTranscriptBlock(block); err == nil {
		t.Fatal("validate activity with empty source run item id succeeded, want error")
	}
}

func TestValidateTranscriptBlockRejectsSummaryWithoutBody(t *testing.T) {
	block := validTranscriptBlock(TranscriptBlockKindReasoning, 1, "block-r")
	block.Reasoning.Mode = ReasoningBlockModeSummary
	block.Reasoning.Summary = ""
	if err := validateTranscriptBlock(block); err == nil {
		t.Fatal("reasoning summary mode with empty summary validated, want error")
	}
	block.Reasoning.Summary = "full public summary text"
	if err := validateTranscriptBlock(block); err != nil {
		t.Fatalf("reasoning summary mode with body: %v", err)
	}
}

func TestStoreSaveTranscriptBlockRejectsOrdinalMove(t *testing.T) {
	store := mustStore(t, t.TempDir())
	workspaceID, runID := transcriptBlockTestWorkspace, transcriptBlockTestRun
	block := validTranscriptBlock(TranscriptBlockKindAssistantText, 1, "block-x")
	if err := store.SaveTranscriptBlock(workspaceID, runID, block); err != nil {
		t.Fatalf("save block: %v", err)
	}
	// Re-saving the same block ID at the same ordinal (an in-place update) is allowed.
	block.AssistantText.Text = "updated"
	if err := store.SaveTranscriptBlock(workspaceID, runID, block); err != nil {
		t.Fatalf("re-save same id at same ordinal: %v", err)
	}
	// Moving the same block ID to a new ordinal is rejected.
	block.Ordinal = 2
	if err := store.SaveTranscriptBlock(workspaceID, runID, block); err == nil {
		t.Fatal("save same id at new ordinal succeeded, want error")
	}
}

func TestStoreLoadTranscriptBlocksRejectsDuplicateID(t *testing.T) {
	store := mustStore(t, t.TempDir())
	workspaceID, runID := transcriptBlockTestWorkspace, transcriptBlockTestRun
	// Write two files sharing one block ID at different ordinals, bypassing the
	// save-time stability guard, to exercise the load-time duplicate-id check.
	for _, ordinal := range []int{1, 2} {
		block := validTranscriptBlock(TranscriptBlockKindAssistantText, ordinal, "dup-id")
		if err := writeJSONFile(store.transcriptBlockPath(workspaceID, runID, ordinal, "dup-id"), block); err != nil {
			t.Fatalf("write block at ordinal %d: %v", ordinal, err)
		}
	}
	_, err := store.LoadTranscriptBlocks(workspaceID, runID)
	if err == nil {
		t.Fatal("load duplicate-id blocks succeeded, want corrupt state error")
	}
	if !IsCorruptStateError(err) {
		t.Fatalf("error = %T %v, want corrupt state", err, err)
	}
}

func TestStoreSaveTranscriptBlockRejectsWorkingRunStatus(t *testing.T) {
	store := mustStore(t, t.TempDir())
	block := validTranscriptBlock(TranscriptBlockKindRunStatus, 1, "block-working")
	block.RunStatus.Mode = RunStatusBlockModeWorking
	block.RunStatus.Label = "Working"
	// The working indicator is a structurally valid live-only projection...
	if err := validateTranscriptBlock(block); err != nil {
		t.Fatalf("validate working run_status: %v", err)
	}
	// ...but it must never be persisted.
	if err := store.SaveTranscriptBlock(transcriptBlockTestWorkspace, transcriptBlockTestRun, block); err == nil {
		t.Fatal("persisting working run_status succeeded, want error")
	}
}

func TestStoreSaveTranscriptBlockRequiresExistingSourceRunItem(t *testing.T) {
	store := mustStore(t, t.TempDir())
	workspaceID, runID := transcriptBlockTestWorkspace, transcriptBlockTestRun
	block := validTranscriptBlock(TranscriptBlockKindActivityItem, 1, "block-act")
	if err := store.SaveTranscriptBlock(workspaceID, runID, block); err == nil {
		t.Fatal("save activity block with missing source run item succeeded, want error")
	}
	saveSourceRunItem(t, store, workspaceID, runID, block.Activity.SourceRunItemID, block.Activity.Type)
	if err := store.SaveTranscriptBlock(workspaceID, runID, block); err != nil {
		t.Fatalf("save activity block after creating source run item: %v", err)
	}
}

func TestStoreSaveTranscriptBlockRejectsSourceRunItemTypeMismatch(t *testing.T) {
	store := mustStore(t, t.TempDir())
	workspaceID, runID := transcriptBlockTestWorkspace, transcriptBlockTestRun

	// A reasoning block must link to a reasoning run item, not a command.
	reasoning := validTranscriptBlock(TranscriptBlockKindReasoning, 1, "block-r")
	saveSourceRunItem(t, store, workspaceID, runID, reasoning.Reasoning.SourceRunItemID, RunItemTypeCommandExecution)
	if err := store.SaveTranscriptBlock(workspaceID, runID, reasoning); err == nil {
		t.Fatal("save reasoning block linked to a command run item succeeded, want error")
	}

	// An activity block's type must match its source run item's type.
	activity := validTranscriptBlock(TranscriptBlockKindActivityItem, 2, "block-a")
	activity.Activity.Type = RunItemTypeFileChange
	saveSourceRunItem(t, store, workspaceID, runID, activity.Activity.SourceRunItemID, RunItemTypeCommandExecution)
	if err := store.SaveTranscriptBlock(workspaceID, runID, activity); err == nil {
		t.Fatal("save activity block whose type differs from its source run item succeeded, want error")
	}
}

func TestStoreLoadTranscriptBlocksRevalidatesSourceRunItem(t *testing.T) {
	store := mustStore(t, t.TempDir())
	workspaceID, runID := transcriptBlockTestWorkspace, transcriptBlockTestRun
	block := validTranscriptBlock(TranscriptBlockKindActivityItem, 1, "block-act")
	saveSourceRunItem(t, store, workspaceID, runID, block.Activity.SourceRunItemID, block.Activity.Type)
	if err := store.SaveTranscriptBlock(workspaceID, runID, block); err != nil {
		t.Fatalf("save activity block: %v", err)
	}
	// Loads cleanly while the source run item is present and matching.
	if _, err := store.LoadTranscriptBlocks(workspaceID, runID); err != nil {
		t.Fatalf("load with valid source item: %v", err)
	}
	// Deleting the source run item leaves stale persisted block state.
	if err := os.RemoveAll(store.runItemDir(workspaceID, runID, block.Activity.SourceRunItemID)); err != nil {
		t.Fatalf("remove source run item: %v", err)
	}
	_, err := store.LoadTranscriptBlocks(workspaceID, runID)
	if err == nil {
		t.Fatal("load activity block with deleted source run item succeeded, want corrupt state error")
	}
	if !IsCorruptStateError(err) {
		t.Fatalf("error = %T %v, want corrupt state", err, err)
	}
}

func TestStoreLoadTranscriptBlocksRejectsPersistedWorkingRunStatus(t *testing.T) {
	store := mustStore(t, t.TempDir())
	workspaceID, runID := transcriptBlockTestWorkspace, transcriptBlockTestRun
	block := validTranscriptBlock(TranscriptBlockKindRunStatus, 1, "block-working")
	block.RunStatus.Mode = RunStatusBlockModeWorking
	// Write directly, bypassing the save-time guard, to simulate stale/dev data.
	if err := writeJSONFile(store.transcriptBlockPath(workspaceID, runID, 1, block.ID), block); err != nil {
		t.Fatalf("write working block: %v", err)
	}
	_, err := store.LoadTranscriptBlocks(workspaceID, runID)
	if err == nil {
		t.Fatal("load persisted working run_status succeeded, want corrupt state error")
	}
	if !IsCorruptStateError(err) {
		t.Fatalf("error = %T %v, want corrupt state", err, err)
	}
}

func saveSourceRunItem(t *testing.T, store *Store, workspaceID string, runID string, itemID string, itemType RunItemType) {
	t.Helper()
	item := RunItem{
		SchemaVersion:  SchemaVersion,
		ID:             itemID,
		WorkspaceID:    workspaceID,
		ConversationID: transcriptBlockTestConv,
		RunID:          runID,
		ProviderItemID: "provider_" + itemID,
		Type:           itemType,
		Status:         RunItemStatusCompleted,
		CreatedAt:      transcriptBlockTestTime,
	}
	if itemType == RunItemTypeCommandExecution {
		item.Details = NewRunItemCommandExecutionDetails(RunItemCommandExecutionDetails{})
	}
	if itemType == RunItemTypeFileChange {
		item.Details = newRunItemFileChangeDetails("completed", []RunItemFileChangePath{{Path: "file.go"}})
	}
	if err := store.SaveRunItem(item); err != nil {
		t.Fatalf("save source run item %s: %v", itemID, err)
	}
}
