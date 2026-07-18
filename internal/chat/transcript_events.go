package chat

// Transcript block streaming is push-based and block-oriented. Incremental
// updated/text-delta events carry one block change each so assistant streaming
// and output chunks never republish the whole transcript. Per-run replaced
// snapshots express changes incremental events cannot: a removed block and the
// live-only working indicator moving to the tail or being superseded.

func (service *Service) publishTranscriptBlockCreatedLocked(workspaceID string, block TranscriptBlock) error {
	_, err := service.events.Publish(NewTranscriptBlockCreatedEvent(workspaceID, block))
	return err
}

func (service *Service) publishTranscriptBlockUpdatedLocked(workspaceID string, block TranscriptBlock) error {
	_, err := service.events.Publish(NewTranscriptBlockUpdatedEvent(workspaceID, block))
	return err
}

// publishTranscriptTextDeltaLocked streams one assistant text append keyed by the
// block ID. The renderer appends the delta to the block by ID without a full
// projection republish.
func (service *Service) publishTranscriptTextDeltaLocked(workspaceID string, block *TranscriptBlock, delta string) error {
	_, err := service.events.Publish(NewTranscriptTextDeltaEvent(workspaceID, block.ConversationID, block.RunID, block.ID, delta, block.UpdatedAt))
	return err
}

// publishWorkingRunStatusCreatedLocked emits the live-only working run_status
// block at turn genesis so an already-open transcript shows the run is working
// before its first public block exists. The block is never persisted; later
// replaced snapshots move it to the tail as public blocks appear, and terminal
// snapshots drop it.
func (service *Service) publishWorkingRunStatusCreatedLocked(workspaceID string, ingest *transcriptIngest) error {
	if ingest == nil || ingest.hasPublicOutputBlock() {
		return nil
	}
	return service.publishTranscriptBlockCreatedLocked(workspaceID, service.workingRunStatusBlock(ingest))
}

// publishPublicBlockCreatedLocked publishes the authoritative live snapshot after
// a public block is created. The snapshot keeps the live-only working indicator at
// the tail, so a user can still see that the run is active after assistant text,
// activity, or public reasoning has already appeared.
func (service *Service) publishPublicBlockCreatedLocked(workspaceID string, ingest *transcriptIngest) error {
	return service.publishLiveTranscriptBlocksReplacedLocked(workspaceID, ingest)
}

// publishLiveTranscriptBlocksReplacedLocked replaces the active run's block list
// from its in-memory chronology. The snapshot carries the live-only working
// indicator at the tail, so dropping or creating a block leaves the transcript in
// the correct live state.
func (service *Service) publishLiveTranscriptBlocksReplacedLocked(workspaceID string, ingest *transcriptIngest) error {
	if ingest == nil {
		return nil
	}
	blocks := service.liveTranscriptBlocksLocked(ingest)
	_, err := service.events.Publish(NewTranscriptBlocksReplacedEvent(workspaceID, ingest.conversationID, ingest.runID, blocks))
	return err
}

// publishPersistedTranscriptBlocksReplacedLocked replaces a run's block list from
// the store. It is used for a run that is no longer the live active turn, such as
// the cancelled source run whose steering blocks were removed when their pending
// text replayed as a fresh turn.
func (service *Service) publishPersistedTranscriptBlocksReplacedLocked(workspaceID string, conversationID string, runID string) error {
	blocks, err := service.transcriptBlocksForRunLocked(workspaceID, conversationID, runID)
	if err != nil {
		return err
	}
	_, err = service.events.Publish(NewTranscriptBlocksReplacedEvent(workspaceID, conversationID, runID, blocks))
	return err
}
