package chat

import (
	"context"
	"fmt"
	"strings"
)

// Background terminal ingestion for docs/plans/background_terminal_lifecycle_plan.md.
//
// A Codex unified-exec command is a background terminal: its lifecycle is owned
// by the backend process registry (BackgroundTerminalProcess), not by the run
// that started it. RunItems with a unified-exec source are routed here instead of
// the normal run-item/activity-block path, so they are never finalized with the
// run and never render as ordinary per-run command activity rows.
//
// Two layers cooperate:
//   - The run-scoped TurnSink path (this file's *Locked helpers, reached from
//     upsertRunItemLocked / appendRunItemOutput) handles everything that happens
//     while the starting turn is live: it creates the registry record, the slim
//     chronological transcript marker block, routes output, and records an
//     in-turn completion. This path serves both the scripted harness and the
//     during-turn Codex notifications.
//   - The conversation-scoped BackgroundTerminalSink (the *FromProvider methods)
//     handles late output and completion that arrive on the Codex connection
//     after the turn has finished, when no TurnSink is live.

const (
	backgroundTerminalStartLabel       = "Started background terminal"
	backgroundTerminalInteractionLabel = "Interacted with background terminal"
	// backgroundTerminalRecentOutputLimit bounds the recent-output lines kept on
	// the process projection for compact summaries; full output is paginated by
	// process ID for the monitor surface.
	backgroundTerminalRecentOutputLimit = 8
)

func isBackgroundTerminalSource(source RunItemCommandSource) bool {
	return source == RunItemCommandSourceUnifiedExecStartup ||
		source == RunItemCommandSourceUnifiedExecInteraction
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

func runItemStatusIsTerminal(status RunItemStatus) bool {
	return status == RunItemStatusCompleted ||
		status == RunItemStatusFailed ||
		status == RunItemStatusCancelled
}

// ingestBackgroundTerminalRunItemLocked routes a unified-exec run item into the
// background terminal registry and transcript marker path instead of the normal
// run-item path. The caller has already confirmed item.Source is a background
// terminal source.
func (service *Service) ingestBackgroundTerminalRunItemLocked(item RunItem) error {
	switch *item.Source {
	case RunItemCommandSourceUnifiedExecStartup:
		return service.ingestBackgroundTerminalStartupLocked(item)
	case RunItemCommandSourceUnifiedExecInteraction:
		return service.ingestBackgroundTerminalInteractionLocked(item)
	default:
		return fmt.Errorf("unsupported background terminal run item source %s", *item.Source)
	}
}

// ingestBackgroundTerminalStartupLocked creates the registry record and the slim
// transcript marker block the first time a unified-exec startup is seen, and
// applies an in-turn status change (e.g. a completion that arrives before the
// turn ends) to an already-registered terminal.
func (service *Service) ingestBackgroundTerminalStartupLocked(item RunItem) error {
	existing, exists, err := service.findBackgroundTerminalLocked(item.WorkspaceID, item.ConversationID, item.ProviderItemID, "")
	if err != nil {
		return err
	}
	if exists {
		return service.applyBackgroundTerminalRunItemStatusLocked(existing, item)
	}
	if item.ProcessID == "" {
		return fmt.Errorf("background terminal startup %s is missing a provider processId", item.ProviderItemID)
	}
	return service.createBackgroundTerminalFromRunItemLocked(item)
}

func (service *Service) createBackgroundTerminalFromRunItemLocked(item RunItem) error {
	id, err := service.newID("background_terminal")
	if err != nil {
		return fmt.Errorf("create background terminal id: %w", err)
	}
	now := timestamp(service.now())
	status := BackgroundTerminalRunning
	completedAt := ""
	if runItemStatusIsTerminal(item.Status) {
		status = BackgroundTerminalExited
		completedAt = now
	}
	active, _ := service.activeTurnForRunItem(item)
	process := BackgroundTerminalProcess{
		SchemaVersion:  SchemaVersion,
		ID:             id,
		WorkspaceID:    item.WorkspaceID,
		ConversationID: item.ConversationID,
		ThreadID:       active.threadID,
		StartedRunID:   item.RunID,
		ProviderItemID: item.ProviderItemID,
		ProcessID:      item.ProcessID,
		Source:         *item.Source,
		Status:         status,
		Command:        item.Command,
		Cwd:            item.Cwd,
		ExitCode:       item.ExitCode,
		StartedAt:      now,
		UpdatedAt:      now,
		CompletedAt:    completedAt,
	}
	if err := service.store.SaveBackgroundTerminalProcess(process); err != nil {
		return err
	}
	if err := service.createBackgroundTerminalStartBlockLocked(item, process); err != nil {
		return err
	}
	return service.publishBackgroundTerminalCreatedLocked(process)
}

// applyBackgroundTerminalRunItemStatusLocked applies an in-turn status change to a
// registered terminal: a terminal run-item status moves an active terminal to
// exited. It never creates a second marker block.
func (service *Service) applyBackgroundTerminalRunItemStatusLocked(process BackgroundTerminalProcess, item RunItem) error {
	if !runItemStatusIsTerminal(item.Status) || !backgroundTerminalStatusIsActive(process.Status) {
		return nil
	}
	now := timestamp(service.now())
	process.Status = BackgroundTerminalExited
	process.ExitCode = item.ExitCode
	process.CompletedAt = now
	process.UpdatedAt = now
	if err := service.store.SaveBackgroundTerminalProcess(process); err != nil {
		return err
	}
	return service.publishBackgroundTerminalUpdatedLocked(process)
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
		// The interaction targets a terminal that is not in this backend's registry
		// (e.g. started before a restart). There is nothing to link the marker to,
		// so it is dropped rather than fabricating a process record.
		return nil
	}
	active, ok := service.activeTurnForRunItem(item)
	if !ok || active.transcript == nil {
		return nil
	}
	return service.createBackgroundTerminalBlockLocked(item.WorkspaceID, active.transcript, process.ID, item.Summary, "", backgroundTerminalInteractionLabel)
}

func (service *Service) createBackgroundTerminalStartBlockLocked(item RunItem, process BackgroundTerminalProcess) error {
	active, ok := service.activeTurnForRunItem(item)
	if !ok || active.transcript == nil {
		// The registry record is recorded above; without a live turn chronology
		// there is no ordinal to place the marker, so it is skipped.
		return nil
	}
	return service.createBackgroundTerminalBlockLocked(item.WorkspaceID, active.transcript, process.ID, item.Command, item.Cwd, backgroundTerminalStartLabel)
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
		return nil
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
