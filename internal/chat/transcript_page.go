package chat

import (
	"fmt"
	"sort"
)

// transcriptBlockRef is one block's place in the conversation-ordered block
// stream. A ref for the live active run carries its already-materialized block;
// a ref for a persisted run carries only its file, so the window reads block
// JSON for the selected blocks alone.
type transcriptBlockRef struct {
	runID string
	file  transcriptBlockFile
	block *TranscriptBlock
}

// loadTranscriptBlockWindowLocked returns one page of the conversation transcript
// ordered by the composite key (run anchor conversation ordinal, run-local block
// ordinal). The page boundary is a transcript block boundary: at most limit
// blocks are returned regardless of run boundaries, so a single giant run never
// dumps all of its blocks. beforeBlockOrdinal is the conversation-sequential
// block ordinal returned as OlderBeforeBlockOrdinal by a newer page; zero selects
// the latest page.
func (service *Service) loadTranscriptBlockWindowLocked(workspaceID string, conversationID string, beforeBlockOrdinal int, limit int) ([]TranscriptBlock, bool, int, error) {
	refs, err := service.conversationBlockRefsLocked(workspaceID, conversationID)
	if err != nil {
		return nil, false, 0, err
	}
	start, end := transcriptBlockWindow(len(refs), beforeBlockOrdinal, limit)
	blocks, err := service.materializeTranscriptBlockRefs(workspaceID, refs[start:end])
	if err != nil {
		return nil, false, 0, err
	}
	olderBeforeBlockOrdinal := 0
	if len(blocks) > 0 {
		// Conversation-sequential ordinal (1-based) of the first windowed block.
		// This cursor is positional and stable for backward paging because blocks
		// only ever append to the latest run's tail. The one exception is a
		// de-duplication removal inside the still-streaming active run, which can
		// shift tail positions; that only affects a client paging backward through a
		// run that is actively streaming, which the transcript UI does not do.
		olderBeforeBlockOrdinal = start + 1
	}
	return blocks, start > 0, olderBeforeBlockOrdinal, nil
}

// transcriptBlockWindow selects the [start, end) ref indices for a page. The
// latest page (beforeBlockOrdinal <= 0) ends at the newest block; an older page
// ends just before the supplied conversation-sequential ordinal. Each page is
// bounded to limit blocks.
func transcriptBlockWindow(total int, beforeBlockOrdinal int, limit int) (int, int) {
	end := total
	if beforeBlockOrdinal > 0 {
		end = beforeBlockOrdinal - 1
	}
	if end > total {
		end = total
	}
	if end < 0 {
		end = 0
	}
	start := end - limit
	if start < 0 {
		start = 0
	}
	return start, end
}

// conversationBlockRefsLocked builds the conversation-ordered list of block refs.
// Runs are ordered by their trigger message's conversation ordinal; the active
// run contributes its live in-memory blocks (including the working indicator and
// not-yet-flushed assistant text) while other runs contribute their persisted
// block files.
func (service *Service) conversationBlockRefsLocked(workspaceID string, conversationID string) ([]transcriptBlockRef, error) {
	runs, err := service.runsForConversationWithDiagnosticsLocked(workspaceID, conversationID)
	if err != nil {
		return nil, err
	}
	anchors, err := service.store.messageOrdinalsByID(workspaceID, conversationID)
	if err != nil {
		return nil, err
	}
	ordered, err := orderRunsByAnchor(runs, anchors)
	if err != nil {
		return nil, err
	}
	activeRunID := service.activeBlockRunIDLocked(workspaceID, conversationID)
	refs := []transcriptBlockRef{}
	for _, run := range ordered {
		runRefs, err := service.runBlockRefsLocked(workspaceID, conversationID, run.ID, run.ID == activeRunID)
		if err != nil {
			return nil, err
		}
		refs = append(refs, runRefs...)
	}
	return refs, nil
}

// orderRunsByAnchor sorts runs by their trigger message conversation ordinal,
// breaking ties by run ID for a stable order. A run whose trigger message has no
// conversation ordinal is corrupt state and fails loudly rather than dropping its
// blocks from the transcript.
func orderRunsByAnchor(runs []Run, anchors map[string]int) ([]Run, error) {
	type anchoredRun struct {
		run    Run
		anchor int
	}
	items := make([]anchoredRun, 0, len(runs))
	for _, run := range runs {
		anchor, ok := anchors[run.TriggerMessageID]
		if !ok {
			return nil, fmt.Errorf("transcript run %s trigger message %s has no conversation ordinal", run.ID, run.TriggerMessageID)
		}
		items = append(items, anchoredRun{run: run, anchor: anchor})
	}
	sort.SliceStable(items, func(left int, right int) bool {
		if items[left].anchor == items[right].anchor {
			return items[left].run.ID < items[right].run.ID
		}
		return items[left].anchor < items[right].anchor
	})
	ordered := make([]Run, len(items))
	for index, item := range items {
		ordered[index] = item.run
	}
	return ordered, nil
}

func (service *Service) activeBlockRunIDLocked(workspaceID string, conversationID string) string {
	active, ok := service.active[activeKey(workspaceID, conversationID)]
	if !ok || active.transcript == nil {
		return ""
	}
	return active.runID
}

// runBlockRefsLocked returns the block refs for one run. The live active run is
// materialized from its in-memory chronology; a persisted run is listed by block
// file so only the windowed blocks are read.
func (service *Service) runBlockRefsLocked(workspaceID string, conversationID string, runID string, live bool) ([]transcriptBlockRef, error) {
	if live {
		blocks, err := service.transcriptBlocksForRunLocked(workspaceID, conversationID, runID)
		if err != nil {
			return nil, err
		}
		refs := make([]transcriptBlockRef, len(blocks))
		for index := range blocks {
			block := blocks[index]
			refs[index] = transcriptBlockRef{runID: runID, block: &block}
		}
		return refs, nil
	}
	files, err := service.store.transcriptBlockFiles(workspaceID, runID)
	if err != nil {
		return nil, err
	}
	// The window reads only its own block files, so enforce the run-level integrity
	// checks (unique IDs, monotonic ordinals) here too; otherwise a corrupt run
	// could page through without failing loudly.
	if err := validateTranscriptBlockFileSequence(files); err != nil {
		return nil, err
	}
	refs := make([]transcriptBlockRef, len(files))
	for index, file := range files {
		refs[index] = transcriptBlockRef{runID: runID, file: file}
	}
	return refs, nil
}

func (service *Service) materializeTranscriptBlockRefs(workspaceID string, refs []transcriptBlockRef) ([]TranscriptBlock, error) {
	blocks := make([]TranscriptBlock, 0, len(refs))
	for _, ref := range refs {
		if ref.block != nil {
			blocks = append(blocks, *ref.block)
			continue
		}
		block, err := service.store.readTranscriptBlockFile(workspaceID, ref.runID, ref.file)
		if err != nil {
			return nil, err
		}
		blocks = append(blocks, block)
	}
	return blocks, nil
}
