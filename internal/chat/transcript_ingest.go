package chat

import (
	"fmt"
	"strings"
)

// reasoningHeadlineLimit bounds the one-line reasoning headline. The full public
// summary is kept verbatim in the block body; only the collapsed headline is
// truncated.
const reasoningHeadlineLimit = 120

// transcriptIngest is the run-local authority for ordered transcript blocks while
// a turn streams. Chronology is owned here: every visible block receives the next
// run-local ordinal when it is first created, later run-item updates mutate the
// existing block instead of allocating a new ordinal, and the open assistant text
// segment is closed whenever a new visible block is created so the interleaving of
// text, activity, and reasoning is preserved.
//
// Blocks are persisted through the store as first-class records. The live-only
// working run_status indicator is never tracked here or persisted; it is derived
// on live reads while the run is active.
//
// One transcriptIngest belongs to one active turn and is held by pointer on
// activeTurn, so the value-copied activeTurn shares a single chronology.
type transcriptIngest struct {
	conversationID string
	runID          string
	// runAnchorOrdinal is the conversation ordinal of the run's trigger message,
	// stamped on every block so the renderer can place run-less messages in
	// conversation order without depending on the loaded message window.
	runAnchorOrdinal int
	nextOrdinal      int

	blocks map[string]*TranscriptBlock
	order  []string

	openAssistantBlockID  string
	openAssistantProvider string

	assistantBlockByProvider map[string]string
	activityBlockByProvider  map[string]string
	reasoningBlockByProvider map[string]string
	userMessageBlockByID     map[string]string
}

func newTranscriptIngest(conversationID string, runID string) *transcriptIngest {
	return &transcriptIngest{
		conversationID:           conversationID,
		runID:                    runID,
		nextOrdinal:              1,
		blocks:                   map[string]*TranscriptBlock{},
		assistantBlockByProvider: map[string]string{},
		activityBlockByProvider:  map[string]string{},
		reasoningBlockByProvider: map[string]string{},
		userMessageBlockByID:     map[string]string{},
	}
}

func (ingest *transcriptIngest) allocateOrdinal() int {
	ordinal := ingest.nextOrdinal
	ingest.nextOrdinal++
	return ordinal
}

func (ingest *transcriptIngest) track(block *TranscriptBlock) {
	ingest.blocks[block.ID] = block
	ingest.order = append(ingest.order, block.ID)
}

// isTail reports whether the block is the most recently created block, so a
// later block has not yet been emitted beneath it. Only tail blocks may refine
// their collapsed headline without shifting the blocks below them.
func (ingest *transcriptIngest) isTail(blockID string) bool {
	return len(ingest.order) > 0 && ingest.order[len(ingest.order)-1] == blockID
}

func (ingest *transcriptIngest) closeAssistantSegment() {
	ingest.openAssistantBlockID = ""
	ingest.openAssistantProvider = ""
}

func (ingest *transcriptIngest) openAssistantBlock() *TranscriptBlock {
	if ingest.openAssistantBlockID == "" {
		return nil
	}
	return ingest.blocks[ingest.openAssistantBlockID]
}

// hasPublicOutputBlock reports whether the run has produced any assistant-side
// output block yet. User-side message blocks (trigger, steering) do not count.
func (ingest *transcriptIngest) hasPublicOutputBlock() bool {
	for _, id := range ingest.order {
		switch ingest.blocks[id].Kind {
		case TranscriptBlockKindAssistantText, TranscriptBlockKindActivityItem, TranscriptBlockKindReasoning:
			return true
		}
	}
	return false
}

// terminalRunStatusBlock returns the run's persisted terminal run_status block, or
// nil. The live-only working indicator is never tracked here, so any tracked
// run_status block is terminal.
func (ingest *transcriptIngest) terminalRunStatusBlock() *TranscriptBlock {
	for _, id := range ingest.order {
		if block := ingest.blocks[id]; block.Kind == TranscriptBlockKindRunStatus {
			return block
		}
	}
	return nil
}

// snapshot returns a copy of the ordered blocks for read paths.
func (ingest *transcriptIngest) snapshot() []TranscriptBlock {
	blocks := make([]TranscriptBlock, 0, len(ingest.order))
	for _, id := range ingest.order {
		blocks = append(blocks, *ingest.blocks[id])
	}
	return blocks
}

func (service *Service) saveTranscriptBlockLocked(workspaceID string, block TranscriptBlock) error {
	return service.store.SaveTranscriptBlock(workspaceID, block.RunID, block)
}

// newTranscriptIngestLocked seeds run-local chronology for a starting turn and
// records the trigger message as the run's first user_message block.
func (service *Service) newTranscriptIngestLocked(workspaceID string, run Run) (*transcriptIngest, error) {
	ingest := newTranscriptIngest(run.ConversationID, run.ID)
	nextOrdinal, err := service.store.NextTranscriptBlockOrdinal(workspaceID, run.ID)
	if err != nil {
		return nil, err
	}
	ingest.nextOrdinal = nextOrdinal
	trigger, ok, err := service.store.FindMessageByID(workspaceID, run.ConversationID, run.TriggerMessageID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("transcript ingest run %s trigger message %s was not found", run.ID, run.TriggerMessageID)
	}
	ingest.runAnchorOrdinal = trigger.Ordinal
	if err := service.appendUserMessageBlockLocked(workspaceID, ingest, trigger); err != nil {
		return nil, err
	}
	if err := service.publishWorkingRunStatusCreatedLocked(workspaceID, ingest); err != nil {
		return nil, err
	}
	return ingest, nil
}

// appendUserMessageBlockLocked records a user-side message (trigger or steering)
// as a user_message block at the next run-local ordinal. A new visible block
// closes the open assistant text segment so later assistant text starts a fresh
// block beneath the message.
func (service *Service) appendUserMessageBlockLocked(workspaceID string, ingest *transcriptIngest, message ChatMessage) error {
	blockID, err := service.newID("transcript_block")
	if err != nil {
		return fmt.Errorf("create transcript block id: %w", err)
	}
	now := timestamp(service.now())
	block := &TranscriptBlock{
		SchemaVersion:    SchemaVersion,
		ID:               blockID,
		ConversationID:   ingest.conversationID,
		RunID:            ingest.runID,
		Kind:             TranscriptBlockKindUserMessage,
		Ordinal:          ingest.allocateOrdinal(),
		RunAnchorOrdinal: ingest.runAnchorOrdinal,
		Status:           TranscriptBlockStatusComplete,
		CreatedAt:        now,
		UpdatedAt:        now,
		UserMessage:      userMessageProjection(message),
	}
	ingest.closeAssistantSegment()
	ingest.track(block)
	ingest.userMessageBlockByID[message.ID] = block.ID
	if err := service.saveTranscriptBlockLocked(workspaceID, *block); err != nil {
		return err
	}
	return service.publishTranscriptBlockCreatedLocked(workspaceID, *block)
}

// syncUserMessageBlockLocked re-projects a user_message block from the canonical
// message after its status changes (steering committed, errored, or marked at
// turn end). It is a no-op when the message has no block in this run.
func (service *Service) syncUserMessageBlockLocked(workspaceID string, conversationID string, runID string, message ChatMessage) error {
	active, ok := service.active[activeKey(workspaceID, conversationID)]
	if !ok || active.runID != runID || active.transcript == nil {
		return nil
	}
	blockID, ok := active.transcript.userMessageBlockByID[message.ID]
	if !ok {
		return nil
	}
	block := active.transcript.blocks[blockID]
	if block == nil {
		return nil
	}
	block.UserMessage = userMessageProjection(message)
	block.UpdatedAt = timestamp(service.now())
	if err := service.saveTranscriptBlockLocked(workspaceID, *block); err != nil {
		return err
	}
	return service.publishTranscriptBlockUpdatedLocked(workspaceID, *block)
}

func userMessageProjection(message ChatMessage) *TranscriptMessageProjection {
	return &TranscriptMessageProjection{
		MessageID: message.ID,
		Role:      message.Role,
		Delivery:  message.Delivery,
		Status:    message.Status,
		Parts:     append([]MessagePart{}, message.Parts...),
	}
}

// appendAssistantTextBlockLocked appends a verbatim assistant text delta to the
// open assistant_text block, creating a new block when none is open or the open
// block belongs to a different provider text segment. Persistence is throttled by
// the caller; this only mutates in-memory chronology.
func (service *Service) appendAssistantTextBlockLocked(workspaceID string, ingest *transcriptIngest, providerItemID string, text string) error {
	if ingest == nil || text == "" {
		return nil
	}
	block := ingest.openAssistantBlock()
	if block == nil || (providerItemID != "" && ingest.openAssistantProvider != providerItemID) {
		created, err := service.newAssistantTextBlockLocked(ingest, providerItemID)
		if err != nil {
			return err
		}
		block = created
		if err := service.publishPublicBlockCreatedLocked(workspaceID, ingest); err != nil {
			return err
		}
	}
	block.AssistantText.Text += text
	block.UpdatedAt = timestamp(service.now())
	if providerItemID != "" {
		ingest.assistantBlockByProvider[providerItemID] = block.ID
	}
	return service.publishTranscriptTextDeltaLocked(workspaceID, block, text)
}

func (service *Service) newAssistantTextBlockLocked(ingest *transcriptIngest, providerItemID string) (*TranscriptBlock, error) {
	blockID, err := service.newID("transcript_block")
	if err != nil {
		return nil, fmt.Errorf("create transcript block id: %w", err)
	}
	now := timestamp(service.now())
	block := &TranscriptBlock{
		SchemaVersion:    SchemaVersion,
		ID:               blockID,
		ConversationID:   ingest.conversationID,
		RunID:            ingest.runID,
		Kind:             TranscriptBlockKindAssistantText,
		Ordinal:          ingest.allocateOrdinal(),
		RunAnchorOrdinal: ingest.runAnchorOrdinal,
		Status:           TranscriptBlockStatusStreaming,
		CreatedAt:        now,
		UpdatedAt:        now,
		AssistantText:    &AssistantTextBlockProjection{Text: "", Format: TextFormatMarkdown},
	}
	ingest.track(block)
	ingest.openAssistantBlockID = block.ID
	ingest.openAssistantProvider = providerItemID
	return block, nil
}

// persistOpenAssistantBlockLocked flushes the current open assistant_text block.
// It is called on the streaming persist cadence and before any new block is
// created, so the block's persisted ordinal precedes later blocks on reload.
func (service *Service) persistOpenAssistantBlockLocked(workspaceID string, ingest *transcriptIngest) error {
	if ingest == nil || ingest.openAssistantBlockID == "" {
		return nil
	}
	block := ingest.blocks[ingest.openAssistantBlockID]
	if block == nil {
		return nil
	}
	return service.saveTranscriptBlockLocked(workspaceID, *block)
}

// reconcileAssistantBlockTextLocked mirrors the canonical assistant-message
// reconciliation onto the block that holds a provider item's appended text. The
// provider may replace its streamed suffix with a completed agentMessage summary
// (replacement set) or drop a duplicate of an already-seen completed text
// (replacement empty). Block-aware de-duplication keeps the persisted block text
// consistent with the message text.
//
// This assumes a provider agentMessage item's deltas are contiguous: all of an
// item's text lands in a single assistant_text block (a new visible block only
// opens for a different provider segment, and providers do not resume an item's
// text after an interleaved activity). Under that invariant the item's full
// appended text is a suffix of exactly one block, so the suffix match below
// targets the right block. If a provider ever split one item's text across blocks
// the suffix would not match and reconciliation would no-op rather than corrupt
// an unrelated block.
func (service *Service) reconcileAssistantBlockTextLocked(workspaceID string, ingest *transcriptIngest, providerItemID string, appended string, replacement string) error {
	if ingest == nil || appended == "" {
		return nil
	}
	blockID, ok := ingest.assistantBlockByProvider[providerItemID]
	if !ok {
		return nil
	}
	block := ingest.blocks[blockID]
	if block == nil || block.AssistantText == nil {
		return nil
	}
	current := block.AssistantText.Text
	if !strings.HasSuffix(current, appended) {
		return nil
	}
	block.AssistantText.Text = strings.TrimSuffix(current, appended) + replacement
	block.UpdatedAt = timestamp(service.now())
	if block.AssistantText.Text == "" {
		return service.removeAssistantBlockLocked(workspaceID, ingest, providerItemID, blockID)
	}
	if err := service.saveTranscriptBlockLocked(workspaceID, *block); err != nil {
		return err
	}
	return service.publishTranscriptBlockUpdatedLocked(workspaceID, *block)
}

// removeAssistantBlockLocked drops an assistant_text block that de-duplication
// emptied so no blank block is persisted. Removing it never reorders the blocks
// that remain (they keep their ordinals; a gap is permitted); only the tail's
// ordinal can be reclaimed, since a middle ordinal is already taken by the blocks
// emitted above it.
func (service *Service) removeAssistantBlockLocked(workspaceID string, ingest *transcriptIngest, providerItemID string, blockID string) error {
	block := ingest.blocks[blockID]
	wasTail := ingest.isTail(blockID)
	delete(ingest.blocks, blockID)
	ingest.order = removeBlockFromOrder(ingest.order, blockID)
	if wasTail {
		ingest.nextOrdinal--
	}
	if ingest.openAssistantBlockID == blockID {
		ingest.closeAssistantSegment()
	}
	if ingest.assistantBlockByProvider[providerItemID] == blockID {
		delete(ingest.assistantBlockByProvider, providerItemID)
	}
	if err := service.store.DeleteTranscriptBlock(workspaceID, ingest.runID, block.Ordinal, block.ID); err != nil {
		return err
	}
	return service.publishLiveTranscriptBlocksReplacedLocked(workspaceID, ingest)
}

func removeBlockFromOrder(order []string, blockID string) []string {
	for index, id := range order {
		if id == blockID {
			return append(order[:index], order[index+1:]...)
		}
	}
	return order
}

// ingestRunItemTranscriptBlockLocked creates or updates the transcript block for
// a run item. Assistant messages are owned by the assistant text path; reasoning
// items become reasoning blocks; everything else becomes an activity_item block
// when it is displayable. The open assistant segment is flushed first so its
// ordinal precedes any block created here.
func (service *Service) ingestRunItemTranscriptBlockLocked(workspaceID string, ingest *transcriptIngest, item RunItem, hasOutput bool) error {
	if ingest == nil || item.Type == RunItemTypeAgentMessage {
		return nil
	}
	if err := service.persistOpenAssistantBlockLocked(workspaceID, ingest); err != nil {
		return err
	}
	if item.Type == RunItemTypeReasoning {
		return service.ingestReasoningBlockLocked(workspaceID, ingest, item)
	}
	return service.ingestActivityBlockLocked(workspaceID, ingest, item, hasOutput)
}

func (service *Service) ingestActivityBlockLocked(workspaceID string, ingest *transcriptIngest, item RunItem, hasOutput bool) error {
	existingID, exists := ingest.activityBlockByProvider[item.ProviderItemID]
	if !exists {
		projection, ok := activityItemBlockProjection(item, RunStatusRunning, hasOutput)
		if !ok {
			return nil
		}
		return service.createActivityBlockLocked(workspaceID, ingest, item, projection)
	}
	block := ingest.blocks[existingID]
	if block == nil || block.Activity == nil {
		return nil
	}
	// Preserve a previously-recorded output flag: output may have arrived before
	// this metadata update, and the in-place refresh must not clear it.
	*block.Activity = activityItemBlockProjectionFields(item, RunStatusRunning, hasOutput || block.Activity.HasOutput)
	block.Status = transcriptBlockStatusForItem(item.Status)
	block.UpdatedAt = timestamp(service.now())
	if err := service.saveTranscriptBlockLocked(workspaceID, *block); err != nil {
		return err
	}
	return service.publishTranscriptBlockUpdatedLocked(workspaceID, *block)
}

func (service *Service) createActivityBlockLocked(workspaceID string, ingest *transcriptIngest, item RunItem, projection ActivityItemBlockProjection) error {
	blockID, err := service.newID("transcript_block")
	if err != nil {
		return fmt.Errorf("create transcript block id: %w", err)
	}
	now := timestamp(service.now())
	block := &TranscriptBlock{
		SchemaVersion:    SchemaVersion,
		ID:               blockID,
		ConversationID:   ingest.conversationID,
		RunID:            ingest.runID,
		Kind:             TranscriptBlockKindActivityItem,
		Ordinal:          ingest.allocateOrdinal(),
		RunAnchorOrdinal: ingest.runAnchorOrdinal,
		Status:           transcriptBlockStatusForItem(item.Status),
		CreatedAt:        now,
		UpdatedAt:        now,
		Activity:         &projection,
	}
	ingest.closeAssistantSegment()
	ingest.track(block)
	ingest.activityBlockByProvider[item.ProviderItemID] = block.ID
	if err := service.saveTranscriptBlockLocked(workspaceID, *block); err != nil {
		return err
	}
	return service.publishPublicBlockCreatedLocked(workspaceID, ingest)
}

// markActivityBlockOutputLocked records that a run item's first output chunk is
// available, so the activity row can show output without republishing the whole
// transcript on every chunk.
func (service *Service) markActivityBlockOutputLocked(workspaceID string, ingest *transcriptIngest, providerItemID string) error {
	if ingest == nil {
		return nil
	}
	blockID, ok := ingest.activityBlockByProvider[providerItemID]
	if !ok {
		return nil
	}
	block := ingest.blocks[blockID]
	if block == nil || block.Activity == nil || block.Activity.HasOutput {
		return nil
	}
	block.Activity.HasOutput = true
	block.UpdatedAt = timestamp(service.now())
	if err := service.saveTranscriptBlockLocked(workspaceID, *block); err != nil {
		return err
	}
	return service.publishTranscriptBlockUpdatedLocked(workspaceID, *block)
}

func (service *Service) ingestReasoningBlockLocked(workspaceID string, ingest *transcriptIngest, item RunItem) error {
	headline := reasoningHeadline(item)
	body := reasoningBody(item)
	existingID, exists := ingest.reasoningBlockByProvider[item.ProviderItemID]
	if !exists {
		if headline == "" {
			return nil
		}
		return service.createReasoningBlockLocked(workspaceID, ingest, item, headline, body)
	}
	block := ingest.blocks[existingID]
	if block == nil || block.Reasoning == nil {
		return nil
	}
	// The headline only refines while this block is still the live tail; once a
	// later block exists beneath it the collapsed height must stay stable.
	if headline != "" && ingest.isTail(existingID) {
		block.Reasoning.Headline = headline
	}
	if body != "" {
		block.Reasoning.Mode = ReasoningBlockModeSummary
		block.Reasoning.Summary = body
	}
	block.Status = transcriptBlockStatusForItem(item.Status)
	block.UpdatedAt = timestamp(service.now())
	if err := service.saveTranscriptBlockLocked(workspaceID, *block); err != nil {
		return err
	}
	return service.publishTranscriptBlockUpdatedLocked(workspaceID, *block)
}

func (service *Service) createReasoningBlockLocked(workspaceID string, ingest *transcriptIngest, item RunItem, headline string, body string) error {
	blockID, err := service.newID("transcript_block")
	if err != nil {
		return fmt.Errorf("create transcript block id: %w", err)
	}
	now := timestamp(service.now())
	mode := ReasoningBlockModeThinking
	summary := ""
	if body != "" {
		mode = ReasoningBlockModeSummary
		summary = body
	}
	block := &TranscriptBlock{
		SchemaVersion:    SchemaVersion,
		ID:               blockID,
		ConversationID:   ingest.conversationID,
		RunID:            ingest.runID,
		Kind:             TranscriptBlockKindReasoning,
		Ordinal:          ingest.allocateOrdinal(),
		RunAnchorOrdinal: ingest.runAnchorOrdinal,
		Status:           transcriptBlockStatusForItem(item.Status),
		CreatedAt:        now,
		UpdatedAt:        now,
		Reasoning: &ReasoningBlockProjection{
			SourceRunItemID: item.ID,
			Mode:            mode,
			Headline:        headline,
			Summary:         summary,
		},
	}
	ingest.closeAssistantSegment()
	ingest.track(block)
	ingest.reasoningBlockByProvider[item.ProviderItemID] = block.ID
	if err := service.saveTranscriptBlockLocked(workspaceID, *block); err != nil {
		return err
	}
	return service.publishPublicBlockCreatedLocked(workspaceID, ingest)
}

// finalizeTranscriptBlocksLocked closes out a run's blocks at completion,
// cancellation, or failure. Every still-streaming block adopts the terminal
// status, and cancellation/failure also append a permanent terminal run_status
// row carrying the run error.
func (service *Service) finalizeTranscriptBlocksLocked(workspaceID string, ingest *transcriptIngest, outcome TranscriptBlockStatus, runError string) error {
	if ingest == nil {
		return nil
	}
	now := timestamp(service.now())
	for _, id := range ingest.order {
		block := ingest.blocks[id]
		if block.Status != TranscriptBlockStatusStreaming {
			continue
		}
		block.Status = outcome
		block.UpdatedAt = now
		applyTerminalStatusToActivityBlock(block, outcome)
		if err := service.saveTranscriptBlockLocked(workspaceID, *block); err != nil {
			return err
		}
	}
	if outcome != TranscriptBlockStatusComplete {
		if err := service.ensureTerminalRunStatusBlockLocked(workspaceID, ingest, outcome, runError, now); err != nil {
			return err
		}
	}
	// One authoritative terminal snapshot reflects every block's terminal status,
	// adds any cancelled/failed run_status row, and drops the live-only working
	// indicator in place of per-block events.
	return service.publishTerminalTranscriptBlocksReplacedLocked(workspaceID, ingest)
}

// ensureTerminalRunStatusBlockLocked records the terminal run_status row
// idempotently. finalize now runs before the terminal store transition, so a
// transient store error leaves the turn attached with the row already created; a
// retry must re-project that row in place rather than append a duplicate
// cancelled/failed row.
func (service *Service) ensureTerminalRunStatusBlockLocked(workspaceID string, ingest *transcriptIngest, outcome TranscriptBlockStatus, runError string, now string) error {
	mode, label := terminalRunStatus(outcome)
	if existing := ingest.terminalRunStatusBlock(); existing != nil {
		existing.RunStatus.Mode = mode
		existing.RunStatus.Label = label
		existing.RunStatus.Error = runError
		existing.Status = outcome
		existing.UpdatedAt = now
		return service.saveTranscriptBlockLocked(workspaceID, *existing)
	}
	blockID, err := service.newID("transcript_block")
	if err != nil {
		return fmt.Errorf("create transcript block id: %w", err)
	}
	block := &TranscriptBlock{
		SchemaVersion:    SchemaVersion,
		ID:               blockID,
		ConversationID:   ingest.conversationID,
		RunID:            ingest.runID,
		Kind:             TranscriptBlockKindRunStatus,
		Ordinal:          ingest.allocateOrdinal(),
		RunAnchorOrdinal: ingest.runAnchorOrdinal,
		Status:           outcome,
		CreatedAt:        now,
		UpdatedAt:        now,
		RunStatus:        &RunStatusBlockProjection{Mode: mode, Label: label, Error: runError},
	}
	ingest.closeAssistantSegment()
	ingest.track(block)
	return service.saveTranscriptBlockLocked(workspaceID, *block)
}

// finalizeInterruptedTranscriptBlocks marks a run's persisted blocks failed after
// a backend restart, where no in-memory chronology survives. It mirrors the live
// failTurn path: still-streaming blocks adopt the failed status and a permanent
// failed run_status row records the interruption. Runs with no blocks are left
// untouched so no orphan row is created.
func (service *Service) finalizeInterruptedTranscriptBlocks(workspaceID string, run Run, now string) error {
	blocks, err := service.store.LoadTranscriptBlocks(workspaceID, run.ID)
	if err != nil {
		return err
	}
	if len(blocks) == 0 {
		return nil
	}
	// recoverInterruptedRun marks the run failed, so reconcile the persisted blocks
	// to that single invariant. This covers both crash windows around the live
	// terminal path: a crash before any finalize (blocks still streaming) and a
	// crash after the live finalize but before the run's terminal store record
	// (blocks already cancelled/complete and a non-failed terminal run_status may
	// exist). Run/message/block terminal state must agree, not merely avoid a
	// duplicate terminal row.
	hasFailedRunStatus := false
	for index := range blocks {
		changed, failedRunStatus := reconcileInterruptedBlockToFailed(&blocks[index], run.Error)
		if failedRunStatus {
			hasFailedRunStatus = true
		}
		if !changed {
			continue
		}
		blocks[index].UpdatedAt = now
		if err := service.saveTranscriptBlockLocked(workspaceID, blocks[index]); err != nil {
			return err
		}
	}
	if hasFailedRunStatus {
		return nil
	}
	return service.appendInterruptedFailedRunStatusLocked(
		workspaceID,
		run,
		blocks[len(blocks)-1].Ordinal+1,
		blocks[0].RunAnchorOrdinal,
		now,
	)
}

// reconcileInterruptedBlockToFailed brings one block into the failed-turn
// invariant on restart recovery. Finished work keeps its complete status, but any
// block left streaming — or finalized to a non-failed terminal status by a live
// finalize that crashed before the run's terminal store record — is reconciled to
// failed. A pre-crash terminal run_status (e.g. cancelled) is rewritten to failed
// so it matches the recovered run rather than leaving a stale, conflicting row.
func reconcileInterruptedBlockToFailed(block *TranscriptBlock, runError string) (changed bool, failedRunStatus bool) {
	if block.Kind == TranscriptBlockKindRunStatus {
		if block.RunStatus.Mode == RunStatusBlockModeFailed {
			// Already failed, but a live failTurn may have recorded the provider
			// error before crashing while recovery overwrote run.Error with the
			// interruption reason. The recovered run is authoritative, so re-project
			// the row's error to keep run and block in agreement.
			if block.RunStatus.Error == runError {
				return false, true
			}
			block.RunStatus.Error = runError
			return true, true
		}
		block.RunStatus.Mode = RunStatusBlockModeFailed
		block.RunStatus.Label = "Failed"
		block.RunStatus.Error = runError
		block.Status = TranscriptBlockStatusFailed
		return true, true
	}
	if block.Status == TranscriptBlockStatusComplete || block.Status == TranscriptBlockStatusFailed {
		return false, false
	}
	block.Status = TranscriptBlockStatusFailed
	applyTerminalStatusToActivityBlock(block, TranscriptBlockStatusFailed)
	return true, false
}

func (service *Service) appendInterruptedFailedRunStatusLocked(workspaceID string, run Run, ordinal int, anchorOrdinal int, now string) error {
	blockID, err := service.newID("transcript_block")
	if err != nil {
		return fmt.Errorf("create transcript block id: %w", err)
	}
	return service.saveTranscriptBlockLocked(workspaceID, TranscriptBlock{
		SchemaVersion:    SchemaVersion,
		ID:               blockID,
		ConversationID:   run.ConversationID,
		RunID:            run.ID,
		Kind:             TranscriptBlockKindRunStatus,
		Ordinal:          ordinal,
		RunAnchorOrdinal: anchorOrdinal,
		Status:           TranscriptBlockStatusFailed,
		CreatedAt:        now,
		UpdatedAt:        now,
		RunStatus:        &RunStatusBlockProjection{Mode: RunStatusBlockModeFailed, Label: "Failed", Error: run.Error},
	})
}

// syncPersistedUserMessageBlocksLocked re-projects persisted user_message blocks
// from their canonical messages. Recovery uses it because syncUserMessageBlockLocked
// is a no-op after restart (no active ingest), which would otherwise leave a
// steering block reading "pending" while its message has been marked errored.
func (service *Service) syncPersistedUserMessageBlocksLocked(workspaceID string, runID string, messages []ChatMessage) error {
	if len(messages) == 0 {
		return nil
	}
	blocks, err := service.store.LoadTranscriptBlocks(workspaceID, runID)
	if err != nil {
		return err
	}
	now := timestamp(service.now())
	for _, message := range messages {
		for _, block := range blocks {
			if block.Kind != TranscriptBlockKindUserMessage || block.UserMessage.MessageID != message.ID {
				continue
			}
			block.UserMessage = userMessageProjection(message)
			block.UpdatedAt = now
			if err := service.saveTranscriptBlockLocked(workspaceID, block); err != nil {
				return err
			}
		}
	}
	return nil
}

// removeSteeringTranscriptBlocksLocked deletes the persisted user_message blocks
// for steering messages that were removed when their pending text was replayed as
// a fresh turn. Without this, the cancelled source run keeps a steering block
// pointing at a deleted message while the replay run shows the same text as its
// trigger — a stale duplicate once blocks drive the transcript.
func (service *Service) removeSteeringTranscriptBlocksLocked(workspaceID string, removed []ChatMessage) error {
	affected := map[string]string{}
	for _, message := range removed {
		if message.RunID == "" {
			continue
		}
		removedFromRun, err := service.deleteSteeringMessageBlocksLocked(workspaceID, message)
		if err != nil {
			return err
		}
		if removedFromRun {
			affected[message.RunID] = message.ConversationID
		}
	}
	for runID, conversationID := range affected {
		if err := service.publishPersistedTranscriptBlocksReplacedLocked(workspaceID, conversationID, runID); err != nil {
			return err
		}
	}
	return nil
}

func (service *Service) deleteSteeringMessageBlocksLocked(workspaceID string, message ChatMessage) (bool, error) {
	blocks, err := service.store.LoadTranscriptBlocks(workspaceID, message.RunID)
	if err != nil {
		return false, err
	}
	removed := false
	for _, block := range blocks {
		if block.Kind == TranscriptBlockKindUserMessage && block.UserMessage.MessageID == message.ID {
			if err := service.store.DeleteTranscriptBlock(workspaceID, message.RunID, block.Ordinal, block.ID); err != nil {
				return false, err
			}
			removed = true
		}
	}
	return removed, nil
}

func applyTerminalStatusToActivityBlock(block *TranscriptBlock, outcome TranscriptBlockStatus) {
	if block.Kind != TranscriptBlockKindActivityItem {
		return
	}
	switch outcome {
	case TranscriptBlockStatusCancelled:
		block.Activity.Status = RunItemStatusCancelled
	case TranscriptBlockStatusFailed:
		block.Activity.Status = RunItemStatusFailed
	case TranscriptBlockStatusComplete:
		block.Activity.Status = RunItemStatusCompleted
	}
}

func terminalRunStatus(outcome TranscriptBlockStatus) (RunStatusBlockMode, string) {
	switch outcome {
	case TranscriptBlockStatusCancelled:
		return RunStatusBlockModeCancelled, "Cancelled"
	case TranscriptBlockStatusFailed:
		return RunStatusBlockModeFailed, "Failed"
	default:
		return RunStatusBlockModeCompleted, "Completed"
	}
}

func transcriptBlockStatusForItem(status RunItemStatus) TranscriptBlockStatus {
	switch status {
	case RunItemStatusCompleted:
		return TranscriptBlockStatusComplete
	case RunItemStatusFailed:
		return TranscriptBlockStatusFailed
	case RunItemStatusCancelled:
		return TranscriptBlockStatusCancelled
	default:
		return TranscriptBlockStatusStreaming
	}
}

// transcriptBlocksForRunLocked returns the ordered transcript blocks for a run.
// While the run is the live active turn the in-memory chronology is authoritative
// (it includes not-yet-flushed assistant text) and a live-only working
// run_status block is appended at the tail while the run is active. Otherwise the
// persisted blocks are returned; the working indicator is never persisted, so it
// is absent after reload.
func (service *Service) transcriptBlocksForRunLocked(workspaceID string, conversationID string, runID string) ([]TranscriptBlock, error) {
	active, ok := service.active[activeKey(workspaceID, conversationID)]
	if ok && active.runID == runID && active.transcript != nil {
		return service.liveTranscriptBlocksLocked(active.transcript), nil
	}
	return service.store.LoadTranscriptBlocks(workspaceID, runID)
}

func (service *Service) liveTranscriptBlocksLocked(ingest *transcriptIngest) []TranscriptBlock {
	blocks := ingest.snapshot()
	return append(blocks, service.workingRunStatusBlock(ingest))
}

func (service *Service) workingRunStatusBlock(ingest *transcriptIngest) TranscriptBlock {
	now := timestamp(service.now())
	return TranscriptBlock{
		SchemaVersion:    SchemaVersion,
		ID:               "transcript_working_" + ingest.runID,
		ConversationID:   ingest.conversationID,
		RunID:            ingest.runID,
		Kind:             TranscriptBlockKindRunStatus,
		Ordinal:          ingest.nextOrdinal,
		RunAnchorOrdinal: ingest.runAnchorOrdinal,
		Status:           TranscriptBlockStatusStreaming,
		CreatedAt:        now,
		UpdatedAt:        now,
		RunStatus:        &RunStatusBlockProjection{Mode: RunStatusBlockModeWorking, Label: "Working"},
	}
}

// reasoningHeadline derives the stable one-line public headline for a reasoning
// item. A non-generic title is preferred so the headline persists unchanged
// across the thinking-to-summary transition; otherwise the first line of the
// public progress or summary body is used. Hidden/private reasoning text is never
// consulted, and the generic provider title is treated as a label, not a
// headline.
func reasoningHeadline(item RunItem) string {
	if headline := nonGenericReasoningTitle(item.Title); headline != "" {
		return boundedTextPreview(headline, reasoningHeadlineLimit, "…")
	}
	if headline := firstLine(item.Progress); headline != "" {
		return boundedTextPreview(headline, reasoningHeadlineLimit, "…")
	}
	if headline := firstLine(item.Summary); headline != "" {
		return boundedTextPreview(headline, reasoningHeadlineLimit, "…")
	}
	return ""
}

// reasoningBody returns the full public summary body revealed when a reasoning
// block is expanded, or "" when the item is still active thinking with no public
// body. Codex carries the public summary in Progress; scripted/other producers
// may carry it in Summary. Hidden text is never exposed.
func reasoningBody(item RunItem) string {
	if strings.TrimSpace(item.Summary) != "" {
		return item.Summary
	}
	if strings.TrimSpace(item.Progress) != "" {
		return item.Progress
	}
	return ""
}

func nonGenericReasoningTitle(title string) string {
	trimmed := strings.TrimSpace(title)
	if trimmed == "" || trimmed == runActivityDefaultTitles[RunItemTypeReasoning] {
		return ""
	}
	return trimmed
}

func firstLine(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	if index := strings.IndexByte(trimmed, '\n'); index >= 0 {
		trimmed = trimmed[:index]
	}
	return strings.TrimSpace(trimmed)
}
