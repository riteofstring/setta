package chat

import (
	"errors"
	"fmt"
	"os"
)

const transcriptBlocksDirName = "transcript_blocks"

type transcriptBlockFile struct {
	ordinal int
	id      string
	path    string
}

func (store *Store) SaveTranscriptBlock(workspaceID string, runID string, block TranscriptBlock) error {
	if err := validateStoreRunIDs(workspaceID, runID); err != nil {
		return err
	}
	if err := validatePersistedTranscriptBlock(block); err != nil {
		return err
	}
	if block.RunID != runID {
		return fmt.Errorf("transcript block %s belongs to run %s, not %s", block.ID, block.RunID, runID)
	}
	if err := store.validateTranscriptBlockSourceRunItem(workspaceID, runID, block); err != nil {
		return err
	}
	if err := store.validateTranscriptBlockOrdinalStable(workspaceID, runID, block); err != nil {
		return err
	}
	return writeJSONFile(store.transcriptBlockPath(workspaceID, runID, block.Ordinal, block.ID), block)
}

// validateTranscriptBlockSourceRunItem ensures the run item a displayable block
// links to exists in the run and has the type the block claims, so detail/output
// pagination keyed by source run item ID resolves a real, matching record.
func (store *Store) validateTranscriptBlockSourceRunItem(workspaceID string, runID string, block TranscriptBlock) error {
	expectedType, sourceRunItemID, requiresSource := transcriptBlockSourceRunItem(block)
	if !requiresSource {
		return nil
	}
	item, err := store.loadRunItem(workspaceID, runID, sourceRunItemID)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("transcript block %s references run item %s that does not exist in run %s", block.ID, sourceRunItemID, runID)
		}
		return err
	}
	if item.Type != expectedType {
		return fmt.Errorf("transcript block %s (%s) references run item %s of type %s, want %s", block.ID, block.Kind, sourceRunItemID, item.Type, expectedType)
	}
	return nil
}

// transcriptBlockSourceRunItem returns the run item a displayable block links to
// and the run item type that link must have. activity_item rows mirror their
// source item's type; reasoning rows must come from a reasoning run item.
func transcriptBlockSourceRunItem(block TranscriptBlock) (RunItemType, string, bool) {
	switch block.Kind {
	case TranscriptBlockKindActivityItem:
		return block.Activity.Type, block.Activity.SourceRunItemID, true
	case TranscriptBlockKindReasoning:
		return RunItemTypeReasoning, block.Reasoning.SourceRunItemID, true
	default:
		return "", "", false
	}
}

func (store *Store) loadRunItem(workspaceID string, runID string, runItemID string) (RunItem, error) {
	if err := validateStoreRunItemIDs(workspaceID, runID, runItemID); err != nil {
		return RunItem{}, err
	}
	var item RunItem
	path := store.runItemPath(workspaceID, runID, runItemID)
	if err := readJSONFile(path, &item); err != nil {
		return RunItem{}, err
	}
	if err := validateRunItem(item); err != nil {
		return RunItem{}, corruptStateError(path, err)
	}
	if item.ID != runItemID {
		return RunItem{}, corruptStateErrorf(path, "run item file id %s does not match requested id %s", item.ID, runItemID)
	}
	if item.WorkspaceID != workspaceID || item.RunID != runID {
		return RunItem{}, corruptStateErrorf(path, "run item %s belongs to workspace %s run %s, not workspace %s run %s", item.ID, item.WorkspaceID, item.RunID, workspaceID, runID)
	}
	return item, nil
}

// validateTranscriptBlockOrdinalStable rejects re-saving an existing block ID at
// a different ordinal. A block's ordinal is fixed when it is first created;
// allowing a new ordinal would leave a stale file behind and let two persisted
// records share one ID, which renderer block-by-ID upserts would silently
// collapse or reorder.
func (store *Store) validateTranscriptBlockOrdinalStable(workspaceID string, runID string, block TranscriptBlock) error {
	files, err := store.transcriptBlockFiles(workspaceID, runID)
	if err != nil {
		return err
	}
	for _, file := range files {
		if file.id == block.ID && file.ordinal != block.Ordinal {
			return fmt.Errorf("transcript block %s is already persisted at ordinal %d and cannot move to ordinal %d", block.ID, file.ordinal, block.Ordinal)
		}
	}
	return nil
}

func (store *Store) LoadTranscriptBlocks(workspaceID string, runID string) ([]TranscriptBlock, error) {
	if err := validateStoreRunIDs(workspaceID, runID); err != nil {
		return nil, err
	}
	files, err := store.transcriptBlockFiles(workspaceID, runID)
	if err != nil {
		return nil, err
	}
	return store.readTranscriptBlocks(workspaceID, runID, files)
}

func (store *Store) readTranscriptBlocks(workspaceID string, runID string, files []transcriptBlockFile) ([]TranscriptBlock, error) {
	blocks := make([]TranscriptBlock, 0, len(files))
	previousOrdinal := 0
	seenIDs := map[string]bool{}
	for _, file := range files {
		var block TranscriptBlock
		if err := readJSONFile(file.path, &block); err != nil {
			return nil, err
		}
		if err := validatePersistedTranscriptBlock(block); err != nil {
			return nil, corruptStateError(file.path, err)
		}
		if err := validateTranscriptBlockFileConsistency(block, file, runID); err != nil {
			return nil, err
		}
		if err := store.revalidatePersistedSourceRunItem(workspaceID, runID, block, file.path); err != nil {
			return nil, err
		}
		if block.Ordinal <= previousOrdinal {
			return nil, corruptStateErrorf(file.path, "transcript block %s ordinal %d is not greater than previous ordinal %d", block.ID, block.Ordinal, previousOrdinal)
		}
		if seenIDs[block.ID] {
			return nil, corruptStateErrorf(file.path, "transcript block %s id is duplicated", block.ID)
		}
		seenIDs[block.ID] = true
		previousOrdinal = block.Ordinal
		blocks = append(blocks, block)
	}
	return blocks, nil
}

// revalidatePersistedSourceRunItem re-checks a loaded block's source run item
// link. A block whose source item was deleted, retyped, or corrupted after the
// block was written is corrupt persisted state; a genuine I/O failure is
// propagated as-is rather than mislabeled as corruption.
func (store *Store) revalidatePersistedSourceRunItem(workspaceID string, runID string, block TranscriptBlock, path string) error {
	err := store.validateTranscriptBlockSourceRunItem(workspaceID, runID, block)
	if err == nil {
		return nil
	}
	if IsPersistenceError(err) || IsCorruptStateError(err) {
		return err
	}
	return corruptStateError(path, err)
}

func validateTranscriptBlockFileConsistency(block TranscriptBlock, file transcriptBlockFile, runID string) error {
	if block.RunID != runID {
		return corruptStateErrorf(file.path, "transcript block %s belongs to run %s, not %s", block.ID, block.RunID, runID)
	}
	if block.Ordinal != file.ordinal {
		return corruptStateErrorf(file.path, "transcript block %s ordinal %d does not match filename ordinal %d", block.ID, block.Ordinal, file.ordinal)
	}
	if block.ID != file.id {
		return corruptStateErrorf(file.path, "transcript block %s id does not match filename id %s", block.ID, file.id)
	}
	return nil
}

func (store *Store) NextTranscriptBlockOrdinal(workspaceID string, runID string) (int, error) {
	if err := validateStoreRunIDs(workspaceID, runID); err != nil {
		return 0, err
	}
	files, err := store.transcriptBlockFiles(workspaceID, runID)
	if err != nil {
		return 0, err
	}
	if len(files) == 0 {
		return 1, nil
	}
	return files[len(files)-1].ordinal + 1, nil
}
