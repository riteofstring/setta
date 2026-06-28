package chat

import (
	"context"
	"fmt"
	"strings"
)

// Background terminal ingestion for docs/plans/background_terminal_lifecycle_plan.md.
//
// Codex labels unified-exec command starts with source=unifiedExecStartup, but
// that source is not enough to prove the command is a persistent background
// terminal. Short foreground shell commands use the same source. Startup items
// therefore enter the normal run-item/activity-block path first, and are promoted
// to the backend process registry only when they are still running at a turn
// boundary or when late output/completion proves the process outlived its
// physical turn.
//
// Two layers cooperate:
//   - The run-scoped TurnSink path records startup items and their output as
//     ordinary run items until promotion. Promotion converts the startup's
//     activity block in place to the slim chronological marker, creates the
//     registry record, and copies any buffered output into the terminal output
//     store.
//   - The conversation-scoped BackgroundTerminalSink (the *FromProvider methods)
//     handles late output and completion that arrive on the Codex connection
//     after a physical turn has finished. If the logical run is still active, the
//     sink promotes the recorded startup before applying the late lifecycle.

const (
	backgroundTerminalStartLabel       = "Started background terminal"
	backgroundTerminalInteractionLabel = "Interacted with background terminal"
	// backgroundTerminalRecentOutputLimit bounds the recent-output lines kept on
	// the process projection for compact summaries; full output is paginated by
	// process ID for the monitor surface.
	backgroundTerminalRecentOutputLimit = 8
)

func isBackgroundTerminalInteractionSource(source RunItemCommandSource) bool {
	return source == RunItemCommandSourceUnifiedExecInteraction
}

func isBackgroundTerminalStartupSource(source RunItemCommandSource) bool {
	return source == RunItemCommandSourceUnifiedExecStartup
}

func isPromotableBackgroundTerminalStartup(item RunItem) bool {
	return item.Type == RunItemTypeCommandExecution &&
		item.Source != nil &&
		isBackgroundTerminalStartupSource(*item.Source) &&
		item.Status == RunItemStatusRunning
}

type backgroundTerminalTerminator interface {
	TerminateBackgroundTerminal(context.Context, BackgroundTerminalTerminateRequest) (BackgroundTerminalTerminateResult, error)
}

func (service *Service) ListBackgroundTerminals(workspaceID string, conversationID string) (BackgroundTerminalListProjection, error) {
	if _, err := service.validateConversationRequest(workspaceID, conversationID); err != nil {
		return BackgroundTerminalListProjection{}, err
	}
	processes, err := service.store.ListBackgroundTerminalProcesses(workspaceID, conversationID)
	if err != nil {
		return BackgroundTerminalListProjection{}, err
	}
	return BackgroundTerminalListProjection{Terminals: processes}, nil
}

func (service *Service) LoadBackgroundTerminalOutputPage(workspaceID string, conversationID string, processID string, afterOrdinal int, limit int) (BackgroundTerminalOutputPage, error) {
	if _, err := service.validateConversationRequest(workspaceID, conversationID); err != nil {
		return BackgroundTerminalOutputPage{}, err
	}
	return service.store.LoadBackgroundTerminalOutputPage(workspaceID, conversationID, processID, afterOrdinal, limit)
}

func (service *Service) KillBackgroundTerminal(ctx context.Context, workspaceID string, conversationID string, processID string) (BackgroundTerminalProcess, error) {
	if ctx == nil {
		return BackgroundTerminalProcess{}, fmt.Errorf("background terminal kill context is required")
	}
	if _, err := service.validateConversationRequest(workspaceID, conversationID); err != nil {
		return BackgroundTerminalProcess{}, err
	}
	process, err := service.store.LoadBackgroundTerminalProcess(workspaceID, conversationID, processID)
	if err != nil {
		return BackgroundTerminalProcess{}, err
	}
	if !backgroundTerminalStatusIsActive(process.Status) {
		return BackgroundTerminalProcess{}, fmt.Errorf("background terminal %s is not active: %s", process.ID, process.Status)
	}
	terminator, ok := service.harness.(backgroundTerminalTerminator)
	if !ok {
		return BackgroundTerminalProcess{}, fmt.Errorf("background terminal %s cannot be killed: harness %T does not support provider termination", process.ID, service.harness)
	}
	if process.ThreadID == "" {
		return BackgroundTerminalProcess{}, fmt.Errorf("background terminal %s cannot be killed: provider thread route is missing", process.ID)
	}
	result, err := terminator.TerminateBackgroundTerminal(ctx, BackgroundTerminalTerminateRequest{
		WorkspaceID:       workspaceID,
		ConversationID:    conversationID,
		ProcessID:         process.ID,
		ThreadID:          process.ThreadID,
		ProviderProcessID: process.ProcessID,
	})
	if err != nil {
		return BackgroundTerminalProcess{}, fmt.Errorf("terminate background terminal %s through provider: %w", process.ID, err)
	}
	if !result.Terminated {
		return BackgroundTerminalProcess{}, fmt.Errorf("terminate background terminal %s through provider: provider reported process was not terminated", process.ID)
	}
	return service.markBackgroundTerminalTerminating(workspaceID, conversationID, process.ID)
}

func (service *Service) KillAllBackgroundTerminals(ctx context.Context, workspaceID string, conversationID string) (BackgroundTerminalListProjection, error) {
	if _, err := service.validateConversationRequest(workspaceID, conversationID); err != nil {
		return BackgroundTerminalListProjection{}, err
	}
	processes, err := service.store.ListBackgroundTerminalProcesses(workspaceID, conversationID)
	if err != nil {
		return BackgroundTerminalListProjection{}, err
	}
	for _, process := range processes {
		if !backgroundTerminalStatusIsActive(process.Status) {
			continue
		}
		if _, err := service.KillBackgroundTerminal(ctx, workspaceID, conversationID, process.ID); err != nil {
			return BackgroundTerminalListProjection{}, err
		}
	}
	return service.ListBackgroundTerminals(workspaceID, conversationID)
}

func (service *Service) markBackgroundTerminalTerminating(workspaceID string, conversationID string, processID string) (BackgroundTerminalProcess, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	process, err := service.store.LoadBackgroundTerminalProcess(workspaceID, conversationID, processID)
	if err != nil {
		return BackgroundTerminalProcess{}, err
	}
	if backgroundTerminalStatusIsTerminal(process.Status) {
		return process, nil
	}
	process.Status = BackgroundTerminalTerminating
	process.UpdatedAt = timestamp(service.now())
	if err := service.store.SaveBackgroundTerminalProcess(process); err != nil {
		return BackgroundTerminalProcess{}, err
	}
	return process, service.publishBackgroundTerminalUpdatedLocked(process)
}

// ingestBackgroundTerminalRunItemLocked routes a unified-exec interaction into
// the background terminal marker path instead of the normal run-item path. Startup
// items are intentionally excluded: they are promoted only after they prove they
// outlive a turn boundary.
func (service *Service) ingestBackgroundTerminalRunItemLocked(item RunItem) error {
	switch *item.Source {
	case RunItemCommandSourceUnifiedExecInteraction:
		return service.ingestBackgroundTerminalInteractionLocked(item)
	default:
		return fmt.Errorf("unsupported background terminal run item source %s", *item.Source)
	}
}

func (service *Service) ingestPromotedBackgroundTerminalStartupUpdateLocked(item RunItem) (bool, error) {
	process, ok, err := service.findBackgroundTerminalLocked(item.WorkspaceID, item.ConversationID, item.ProviderItemID, item.ProcessID)
	if err != nil || !ok {
		return false, err
	}
	if item.Status != RunItemStatusCompleted && item.Status != RunItemStatusFailed && item.Status != RunItemStatusCancelled {
		return true, nil
	}
	if backgroundTerminalStatusIsTerminal(process.Status) {
		return true, nil
	}
	now := timestamp(service.now())
	process.Status = BackgroundTerminalExited
	process.ExitCode = item.ExitCode
	process.Error = item.Error
	process.CompletedAt = now
	process.UpdatedAt = now
	if err := service.store.SaveBackgroundTerminalProcess(process); err != nil {
		return true, err
	}
	return true, service.publishBackgroundTerminalUpdatedLocked(process)
}

// promoteBackgroundTerminalStartupsForTurnLocked promotes every still-running
// unified-exec startup in the active turn before the run reaches a terminal
// state. Foreground commands that completed in-turn are left as normal activity.
func (service *Service) promoteBackgroundTerminalStartupsForTurnLocked(workspaceID string, active activeTurn) error {
	items, err := service.store.LoadRunItems(workspaceID, active.runID)
	if err != nil {
		return err
	}
	for _, item := range items {
		if !isPromotableBackgroundTerminalStartup(item) {
			continue
		}
		if _, _, err := service.promoteBackgroundTerminalStartupLocked(item, active); err != nil {
			return err
		}
	}
	return nil
}

// promoteBackgroundTerminalStartupByProviderLocked promotes the active turn's
// startup item on the first late lifecycle event. This is needed for goal
// operations, where a background terminal can emit during an idle gap or a later
// physical turn while the logical Setta run is still active.
func (service *Service) promoteBackgroundTerminalStartupByProviderLocked(workspaceID string, conversationID string, providerItemID string) (BackgroundTerminalProcess, bool, error) {
	existing, exists, err := service.findBackgroundTerminalLocked(workspaceID, conversationID, providerItemID, "")
	if err != nil {
		return BackgroundTerminalProcess{}, false, err
	}
	if exists {
		return existing, true, nil
	}
	active, ok := service.active[activeKey(workspaceID, conversationID)]
	if !ok {
		return BackgroundTerminalProcess{}, false, nil
	}
	item, exists, err := service.store.FindRunItemByProviderID(workspaceID, active.runID, providerItemID)
	if err != nil || !exists {
		return BackgroundTerminalProcess{}, false, err
	}
	if !isPromotableBackgroundTerminalStartup(item) {
		return BackgroundTerminalProcess{}, false, nil
	}
	process, _, err := service.promoteBackgroundTerminalStartupLocked(item, active)
	return process, err == nil, err
}

func (service *Service) promoteBackgroundTerminalStartupByProcessLocked(item RunItem) (BackgroundTerminalProcess, bool, error) {
	existing, exists, err := service.findBackgroundTerminalLocked(item.WorkspaceID, item.ConversationID, "", item.ProcessID)
	if err != nil || exists {
		return existing, exists, err
	}
	active, ok := service.active[activeKey(item.WorkspaceID, item.ConversationID)]
	if !ok {
		return BackgroundTerminalProcess{}, false, nil
	}
	items, err := service.store.LoadRunItems(item.WorkspaceID, active.runID)
	if err != nil {
		return BackgroundTerminalProcess{}, false, err
	}
	for _, candidate := range items {
		if candidate.ProcessID != item.ProcessID || !isPromotableBackgroundTerminalStartup(candidate) {
			continue
		}
		process, _, err := service.promoteBackgroundTerminalStartupLocked(candidate, active)
		return process, err == nil, err
	}
	return BackgroundTerminalProcess{}, false, nil
}

func (service *Service) promoteBackgroundTerminalStartupLocked(item RunItem, active activeTurn) (BackgroundTerminalProcess, bool, error) {
	existing, exists, err := service.findBackgroundTerminalLocked(item.WorkspaceID, item.ConversationID, item.ProviderItemID, item.ProcessID)
	if err != nil {
		return BackgroundTerminalProcess{}, false, err
	}
	if exists {
		return service.promoteExistingBackgroundTerminalStartupLocked(item, active, existing)
	}
	if item.ProcessID == "" {
		return BackgroundTerminalProcess{}, false, fmt.Errorf("background terminal startup %s is missing a provider processId", item.ProviderItemID)
	}
	process, err := service.newBackgroundTerminalProcessFromStartupLocked(item, active)
	if err != nil {
		return BackgroundTerminalProcess{}, false, err
	}
	if err := service.store.SaveBackgroundTerminalProcess(process); err != nil {
		return BackgroundTerminalProcess{}, false, err
	}
	if err := service.ensureBackgroundTerminalStartBlockLocked(item.WorkspaceID, active.transcript, item, process); err != nil {
		return BackgroundTerminalProcess{}, false, err
	}
	if err := service.publishBackgroundTerminalCreatedLocked(process); err != nil {
		return BackgroundTerminalProcess{}, false, err
	}
	if err := service.copyRunItemOutputToBackgroundTerminalLocked(item.WorkspaceID, item.RunID, item.ID, process); err != nil {
		return BackgroundTerminalProcess{}, false, err
	}
	if err := service.markBackgroundTerminalStartupPromotedLocked(item); err != nil {
		return BackgroundTerminalProcess{}, false, err
	}
	reloaded, err := service.store.LoadBackgroundTerminalProcess(process.WorkspaceID, process.ConversationID, process.ID)
	if err != nil {
		return BackgroundTerminalProcess{}, false, err
	}
	return reloaded, true, nil
}

func (service *Service) promoteExistingBackgroundTerminalStartupLocked(item RunItem, active activeTurn, process BackgroundTerminalProcess) (BackgroundTerminalProcess, bool, error) {
	if err := service.ensureBackgroundTerminalStartBlockLocked(item.WorkspaceID, active.transcript, item, process); err != nil {
		return BackgroundTerminalProcess{}, false, err
	}
	if err := service.markBackgroundTerminalStartupPromotedLocked(item); err != nil {
		return BackgroundTerminalProcess{}, false, err
	}
	return process, false, nil
}

func (service *Service) newBackgroundTerminalProcessFromStartupLocked(item RunItem, active activeTurn) (BackgroundTerminalProcess, error) {
	id, err := service.newID("background_terminal")
	if err != nil {
		return BackgroundTerminalProcess{}, fmt.Errorf("create background terminal id: %w", err)
	}
	now := timestamp(service.now())
	return BackgroundTerminalProcess{
		SchemaVersion:  SchemaVersion,
		ID:             id,
		WorkspaceID:    item.WorkspaceID,
		ConversationID: item.ConversationID,
		ThreadID:       active.threadID,
		StartedRunID:   item.RunID,
		ProviderItemID: item.ProviderItemID,
		ProcessID:      item.ProcessID,
		Source:         *item.Source,
		Status:         BackgroundTerminalRunning,
		Command:        item.Command,
		Cwd:            item.Cwd,
		ExitCode:       item.ExitCode,
		StartedAt:      backgroundTerminalStartedAt(item, now),
		UpdatedAt:      now,
	}, nil
}

func (service *Service) promoteInterruptedBackgroundTerminalStartups(workspaceID string, run Run, now string) error {
	items, err := service.store.LoadRunItems(workspaceID, run.ID)
	if err != nil {
		return err
	}
	for _, item := range items {
		if !isPromotableBackgroundTerminalStartup(item) {
			continue
		}
		if err := service.promoteInterruptedBackgroundTerminalStartup(workspaceID, run, item, now); err != nil {
			return err
		}
	}
	return nil
}

func (service *Service) promoteInterruptedBackgroundTerminalStartup(workspaceID string, run Run, item RunItem, now string) error {
	process, exists, err := service.findBackgroundTerminalLocked(workspaceID, run.ConversationID, item.ProviderItemID, item.ProcessID)
	if err != nil {
		return err
	}
	if !exists {
		if item.ProcessID == "" {
			return fmt.Errorf("background terminal startup %s is missing a provider processId", item.ProviderItemID)
		}
		id, err := service.newID("background_terminal")
		if err != nil {
			return fmt.Errorf("create background terminal id: %w", err)
		}
		process = BackgroundTerminalProcess{
			SchemaVersion:  SchemaVersion,
			ID:             id,
			WorkspaceID:    item.WorkspaceID,
			ConversationID: item.ConversationID,
			ThreadID:       "",
			StartedRunID:   item.RunID,
			ProviderItemID: item.ProviderItemID,
			ProcessID:      item.ProcessID,
			Source:         *item.Source,
			Status:         BackgroundTerminalRunning,
			Command:        item.Command,
			Cwd:            item.Cwd,
			ExitCode:       item.ExitCode,
			StartedAt:      backgroundTerminalStartedAt(item, now),
			UpdatedAt:      now,
		}
		if err := service.store.SaveBackgroundTerminalProcess(process); err != nil {
			return err
		}
		if err := service.copyRunItemOutputToBackgroundTerminalLocked(item.WorkspaceID, item.RunID, item.ID, process); err != nil {
			return err
		}
		process, err = service.store.LoadBackgroundTerminalProcess(process.WorkspaceID, process.ConversationID, process.ID)
		if err != nil {
			return err
		}
	}
	if err := service.ensurePersistedBackgroundTerminalStartBlockLocked(workspaceID, run, item, process, now); err != nil {
		return err
	}
	return service.markBackgroundTerminalStartupPromotedLocked(item)
}

func (service *Service) markBackgroundTerminalStartupPromotedLocked(item RunItem) error {
	if item.Status == RunItemStatusCompleted && item.CompletedAt != "" {
		return nil
	}
	item.Status = RunItemStatusCompleted
	if item.CompletedAt == "" {
		item.CompletedAt = timestamp(service.now())
	}
	return service.store.SaveRunItem(item)
}

func (service *Service) ensurePersistedBackgroundTerminalStartBlockLocked(workspaceID string, run Run, item RunItem, process BackgroundTerminalProcess, now string) error {
	blocks, err := service.store.LoadTranscriptBlocks(workspaceID, run.ID)
	if err != nil {
		return err
	}
	for _, block := range blocks {
		if block.Kind == TranscriptBlockKindBackgroundTerminal &&
			block.BackgroundTerminal != nil &&
			block.BackgroundTerminal.ProcessID == process.ID &&
			block.BackgroundTerminal.Label == backgroundTerminalStartLabel {
			return nil
		}
	}
	for _, block := range blocks {
		if block.Kind != TranscriptBlockKindActivityItem ||
			block.Activity == nil ||
			block.Activity.SourceRunItemID != item.ID {
			continue
		}
		block.Kind = TranscriptBlockKindBackgroundTerminal
		block.Status = TranscriptBlockStatusComplete
		block.UpdatedAt = now
		block.UserMessage = nil
		block.AssistantText = nil
		block.Reasoning = nil
		block.Activity = nil
		block.RunStatus = nil
		block.BackgroundTerminal = &BackgroundTerminalBlockProjection{
			ProcessID: process.ID,
			Command:   item.Command,
			Cwd:       item.Cwd,
			Label:     backgroundTerminalStartLabel,
		}
		return service.saveTranscriptBlockLocked(workspaceID, block)
	}
	return service.appendPersistedBackgroundTerminalStartBlockLocked(workspaceID, run, item, process, blocks, now)
}

func (service *Service) appendPersistedBackgroundTerminalStartBlockLocked(workspaceID string, run Run, item RunItem, process BackgroundTerminalProcess, blocks []TranscriptBlock, now string) error {
	blockID, err := service.newID("transcript_block")
	if err != nil {
		return fmt.Errorf("create transcript block id: %w", err)
	}
	ordinal, anchorOrdinal, err := service.nextRecoveredBackgroundTerminalBlockOrdinals(workspaceID, run, blocks)
	if err != nil {
		return err
	}
	return service.saveTranscriptBlockLocked(workspaceID, TranscriptBlock{
		SchemaVersion:    SchemaVersion,
		ID:               blockID,
		ConversationID:   run.ConversationID,
		RunID:            run.ID,
		Kind:             TranscriptBlockKindBackgroundTerminal,
		Ordinal:          ordinal,
		RunAnchorOrdinal: anchorOrdinal,
		Status:           TranscriptBlockStatusComplete,
		CreatedAt:        now,
		UpdatedAt:        now,
		BackgroundTerminal: &BackgroundTerminalBlockProjection{
			ProcessID: process.ID,
			Command:   item.Command,
			Cwd:       item.Cwd,
			Label:     backgroundTerminalStartLabel,
		},
	})
}

func (service *Service) nextRecoveredBackgroundTerminalBlockOrdinals(workspaceID string, run Run, blocks []TranscriptBlock) (int, int, error) {
	if len(blocks) > 0 {
		last := blocks[len(blocks)-1]
		return last.Ordinal + 1, blocks[0].RunAnchorOrdinal, nil
	}
	trigger, ok, err := service.store.FindMessageByID(workspaceID, run.ConversationID, run.TriggerMessageID)
	if err != nil {
		return 0, 0, err
	}
	if !ok {
		return 0, 0, fmt.Errorf("background terminal recovery run %s trigger message %s was not found", run.ID, run.TriggerMessageID)
	}
	return 1, trigger.Ordinal, nil
}

func backgroundTerminalStartedAt(item RunItem, fallback string) string {
	if item.StartedAt != "" {
		return item.StartedAt
	}
	if item.CreatedAt != "" {
		return item.CreatedAt
	}
	return fallback
}

// ingestBackgroundTerminalInteractionLocked records a slim chronological marker
// that the assistant wrote to an existing background terminal. The interaction
// run item carries the provider process handle, so the marker is linked to the
// registered terminal by that handle.
func (service *Service) ingestBackgroundTerminalInteractionLocked(item RunItem) error {
	process, ok, err := service.findBackgroundTerminalLocked(item.WorkspaceID, item.ConversationID, "", item.ProcessID)
	if err != nil {
		return err
	}
	if !ok {
		process, ok, err = service.promoteBackgroundTerminalStartupByProcessLocked(item)
		if err != nil || !ok {
			// The interaction targets a terminal that is not in this backend's registry
			// (e.g. started before a restart). There is nothing to link the marker to,
			// so it is dropped rather than fabricating a process record.
			return err
		}
	}
	active, ok := service.activeTurnForRunItem(item)
	if !ok || active.transcript == nil {
		return nil
	}
	return service.createBackgroundTerminalBlockLocked(item.WorkspaceID, active.transcript, process.ID, item.Summary, "", backgroundTerminalInteractionLabel)
}

func (service *Service) ensureBackgroundTerminalStartBlockLocked(workspaceID string, ingest *transcriptIngest, item RunItem, process BackgroundTerminalProcess) error {
	if ingest == nil {
		return nil
	}
	blockID, exists := ingest.activityBlockByProvider[item.ProviderItemID]
	if !exists {
		if ingest.hasBackgroundTerminalBlock(process.ID, backgroundTerminalStartLabel) {
			return nil
		}
		return service.createBackgroundTerminalBlockLocked(workspaceID, ingest, process.ID, item.Command, item.Cwd, backgroundTerminalStartLabel)
	}
	block := ingest.blocks[blockID]
	if block == nil {
		return nil
	}
	now := timestamp(service.now())
	block.Kind = TranscriptBlockKindBackgroundTerminal
	block.Status = TranscriptBlockStatusComplete
	block.UpdatedAt = now
	block.UserMessage = nil
	block.AssistantText = nil
	block.Reasoning = nil
	block.Activity = nil
	block.RunStatus = nil
	block.BackgroundTerminal = &BackgroundTerminalBlockProjection{
		ProcessID: process.ID,
		Command:   item.Command,
		Cwd:       item.Cwd,
		Label:     backgroundTerminalStartLabel,
	}
	delete(ingest.activityBlockByProvider, item.ProviderItemID)
	if err := service.saveTranscriptBlockLocked(workspaceID, *block); err != nil {
		return err
	}
	return service.publishTranscriptBlockUpdatedLocked(workspaceID, *block)
}

func (service *Service) copyRunItemOutputToBackgroundTerminalLocked(workspaceID string, runID string, runItemID string, process BackgroundTerminalProcess) error {
	outputs, err := service.store.LoadRunItemOutputsForItem(workspaceID, runID, runItemID)
	if err != nil {
		return err
	}
	for _, output := range outputs {
		if err := service.appendBackgroundTerminalOutputLocked(process, output.Stream, output.Text); err != nil {
			return err
		}
		reloaded, err := service.store.LoadBackgroundTerminalProcess(process.WorkspaceID, process.ConversationID, process.ID)
		if err != nil {
			return err
		}
		process = reloaded
	}
	return nil
}

// createBackgroundTerminalBlockLocked appends a slim background_terminal marker at
// the next run-local ordinal. The marker is created complete: it is a point-in-time
// chronology record, so run finalization (which only coerces still-streaming
// blocks) never rewrites it, and the terminal's live status is owned by the
// registry and joined in the renderer by ProcessID.
func (service *Service) createBackgroundTerminalBlockLocked(workspaceID string, ingest *transcriptIngest, processStableID string, command string, cwd string, label string) error {
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
		Kind:             TranscriptBlockKindBackgroundTerminal,
		Ordinal:          ingest.allocateOrdinal(),
		RunAnchorOrdinal: ingest.runAnchorOrdinal,
		Status:           TranscriptBlockStatusComplete,
		CreatedAt:        now,
		UpdatedAt:        now,
		BackgroundTerminal: &BackgroundTerminalBlockProjection{
			ProcessID: processStableID,
			Command:   command,
			Cwd:       cwd,
			Label:     label,
		},
	}
	ingest.closeAssistantSegment()
	ingest.track(block)
	if err := service.saveTranscriptBlockLocked(workspaceID, *block); err != nil {
		return err
	}
	return service.publishPublicBlockCreatedLocked(workspaceID, ingest)
}

// appendBackgroundTerminalOutputFromProvider appends a late output chunk that
// arrived on the Codex connection after the starting turn finished. It is a no-op
// when the process is not in the registry (already removed, or never a background
// terminal), so a stray late notification never fabricates state.
func (service *Service) appendBackgroundTerminalOutputFromProvider(workspaceID string, conversationID string, providerItemID string, providerProcessID string, stream string, text string) error {
	service.mu.Lock()
	defer service.mu.Unlock()

	if text == "" {
		return nil
	}
	process, ok, err := service.findBackgroundTerminalLocked(workspaceID, conversationID, providerItemID, providerProcessID)
	if err != nil {
		return err
	}
	if !ok {
		process, ok, err = service.promoteBackgroundTerminalStartupByProviderLocked(workspaceID, conversationID, providerItemID)
		if err != nil || !ok {
			return err
		}
	}
	return service.appendBackgroundTerminalOutputLocked(process, stream, text)
}

// completeBackgroundTerminalFromProvider records a process exit that arrived on
// the Codex connection after the starting turn finished. It is idempotent: a
// process already in a terminal state is left untouched, and a missing process is
// ignored rather than recreated.
func (service *Service) completeBackgroundTerminalFromProvider(workspaceID string, conversationID string, providerItemID string, providerProcessID string, exitCode int, errorMessage string) error {
	service.mu.Lock()
	defer service.mu.Unlock()

	process, ok, err := service.findBackgroundTerminalLocked(workspaceID, conversationID, providerItemID, providerProcessID)
	if err != nil {
		return err
	}
	if !ok {
		process, ok, err = service.promoteBackgroundTerminalStartupByProviderLocked(workspaceID, conversationID, providerItemID)
		if err != nil || !ok {
			return err
		}
	}
	if !ok || backgroundTerminalStatusIsTerminal(process.Status) {
		return nil
	}
	now := timestamp(service.now())
	process.Status = BackgroundTerminalExited
	process.ExitCode = exitCode
	process.Error = errorMessage
	process.CompletedAt = now
	process.UpdatedAt = now
	if err := service.store.SaveBackgroundTerminalProcess(process); err != nil {
		return err
	}
	return service.publishBackgroundTerminalUpdatedLocked(process)
}

func (service *Service) appendBackgroundTerminalOutputLocked(process BackgroundTerminalProcess, stream string, text string) error {
	ordinal, err := service.store.NextBackgroundTerminalOutputOrdinal(process.WorkspaceID, process.ConversationID, process.ID)
	if err != nil {
		return err
	}
	outputID, err := service.newID("background_terminal_output")
	if err != nil {
		return fmt.Errorf("create background terminal output id: %w", err)
	}
	now := timestamp(service.now())
	output := BackgroundTerminalOutput{
		SchemaVersion: SchemaVersion,
		ID:            outputID,
		ProcessID:     process.ID,
		Stream:        stream,
		Ordinal:       ordinal,
		Text:          text,
		CreatedAt:     now,
	}
	if err := service.store.SaveBackgroundTerminalOutput(process.WorkspaceID, process.ConversationID, output); err != nil {
		return err
	}
	process.RecentOutput = appendRecentBackgroundTerminalOutput(process.RecentOutput, text)
	process.UpdatedAt = now
	if err := service.store.SaveBackgroundTerminalProcess(process); err != nil {
		return err
	}
	if err := service.publishBackgroundTerminalOutputDeltaLocked(process, output); err != nil {
		return err
	}
	return service.publishBackgroundTerminalUpdatedLocked(process)
}

func (service *Service) publishBackgroundTerminalCreatedLocked(process BackgroundTerminalProcess) error {
	_, err := service.events.Publish(NewBackgroundTerminalCreatedEvent(process))
	return err
}

func (service *Service) publishBackgroundTerminalUpdatedLocked(process BackgroundTerminalProcess) error {
	_, err := service.events.Publish(NewBackgroundTerminalUpdatedEvent(process))
	return err
}

func (service *Service) publishBackgroundTerminalOutputDeltaLocked(process BackgroundTerminalProcess, output BackgroundTerminalOutput) error {
	_, err := service.events.Publish(NewBackgroundTerminalOutputDeltaEvent(process.WorkspaceID, process.ConversationID, process.StartedRunID, output))
	return err
}

// findBackgroundTerminalLocked resolves a registered terminal by its provider
// item ID or its provider process handle. Output and completion notifications key
// off the command-execution item ID; terminal interactions key off the process
// handle, so both lookups are supported.
func (service *Service) findBackgroundTerminalLocked(workspaceID string, conversationID string, providerItemID string, providerProcessID string) (BackgroundTerminalProcess, bool, error) {
	processes, err := service.store.ListBackgroundTerminalProcesses(workspaceID, conversationID)
	if err != nil {
		return BackgroundTerminalProcess{}, false, err
	}
	for _, process := range processes {
		if providerItemID != "" && process.ProviderItemID == providerItemID {
			return process, true, nil
		}
		if providerProcessID != "" && process.ProcessID == providerProcessID {
			return process, true, nil
		}
	}
	return BackgroundTerminalProcess{}, false, nil
}

func (service *Service) backgroundTerminalProviderItemIDsForRunLocked(workspaceID string, conversationID string, runID string) (map[string]struct{}, error) {
	processes, err := service.store.ListBackgroundTerminalProcesses(workspaceID, conversationID)
	if err != nil {
		return nil, err
	}
	ids := map[string]struct{}{}
	for _, process := range processes {
		if process.StartedRunID == runID {
			ids[process.ProviderItemID] = struct{}{}
		}
	}
	return ids, nil
}

// appendRecentBackgroundTerminalOutput keeps the most recent non-empty output
// lines for compact summaries, bounded to backgroundTerminalRecentOutputLimit.
func appendRecentBackgroundTerminalOutput(recent []string, text string) []string {
	for _, line := range strings.Split(text, "\n") {
		trimmed := strings.TrimRight(line, "\r")
		if strings.TrimSpace(trimmed) == "" {
			continue
		}
		recent = append(recent, trimmed)
	}
	if len(recent) > backgroundTerminalRecentOutputLimit {
		recent = append([]string(nil), recent[len(recent)-backgroundTerminalRecentOutputLimit:]...)
	}
	return recent
}

// backgroundTerminalSinkAttacher is implemented by harnesses whose provider
// connection delivers background terminal lifecycle events outside an active
// turn. The scripted and fake harnesses do not implement it.
type backgroundTerminalSinkAttacher interface {
	SetBackgroundTerminalSink(BackgroundTerminalSink)
}

type serviceBackgroundTerminalSink struct {
	service *Service
}

func (service *Service) backgroundTerminalSink() BackgroundTerminalSink {
	return serviceBackgroundTerminalSink{service: service}
}

func (sink serviceBackgroundTerminalSink) BackgroundTerminalOutputDelta(workspaceID string, conversationID string, providerItemID string, providerProcessID string, stream string, text string) error {
	return sink.service.appendBackgroundTerminalOutputFromProvider(workspaceID, conversationID, providerItemID, providerProcessID, stream, text)
}

func (sink serviceBackgroundTerminalSink) BackgroundTerminalCompleted(workspaceID string, conversationID string, providerItemID string, providerProcessID string, exitCode int, errorMessage string) error {
	return sink.service.completeBackgroundTerminalFromProvider(workspaceID, conversationID, providerItemID, providerProcessID, exitCode, errorMessage)
}
