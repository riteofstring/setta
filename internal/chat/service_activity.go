package chat

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

const embeddedRunOutputLimit = 200

func (service *Service) appendAssistantDelta(workspaceID string, conversationID string, runID string, providerItemID string, delta string) error {
	service.mu.Lock()
	defer service.mu.Unlock()

	run, active, ok, err := service.runningActiveTurnLocked(workspaceID, conversationID, runID)
	if err != nil || !ok {
		return err
	}
	active, err = service.applyAssistantDeltaLocked(workspaceID, conversationID, run, active, providerItemID, delta)
	if err != nil {
		return err
	}
	service.active[activeKey(workspaceID, conversationID)] = active
	return nil
}

func (service *Service) runningActiveTurnLocked(workspaceID string, conversationID string, runID string) (Run, activeTurn, bool, error) {
	run, err := service.store.LoadRun(workspaceID, runID)
	if err != nil {
		return Run{}, activeTurn{}, false, err
	}
	if run.Status != RunStatusRunning {
		return run, activeTurn{}, false, nil
	}
	active, ok := service.active[activeKey(workspaceID, conversationID)]
	if !ok || active.runID != runID {
		return run, activeTurn{}, false, nil
	}
	return run, active, true, nil
}

func (service *Service) applyAssistantDeltaLocked(workspaceID string, conversationID string, run Run, active activeTurn, providerItemID string, delta string) (activeTurn, error) {
	var appendText string
	active, appendText = active.canonicalAssistantDelta(providerItemID, delta)
	if appendText == "" {
		return active, nil
	}
	message := active.assistantMessage
	hadAssistantText := message.Parts[0].Text.Text != ""
	message.Parts[0].Text.Text += appendText
	now := service.now()
	message.UpdatedAt = timestamp(now)
	partID := message.Parts[0].ID
	active.assistantMessage = message
	if err := service.appendAssistantTextBlockLocked(workspaceID, active.transcript, providerItemID, appendText); err != nil {
		return activeTurn{}, err
	}
	if _, err := service.events.Publish(NewAssistantTextDeltaEvent(workspaceID, conversationID, run.ID, message.ID, partID, appendText, message.UpdatedAt)); err != nil {
		return activeTurn{}, err
	}
	if !hadAssistantText {
		if err := service.advanceReadRelevantMarkerLocked(workspaceID, conversationID, message.UpdatedAt); err != nil {
			return activeTurn{}, err
		}
		if err := service.publishConversationUpdatedLocked(workspaceID, conversationID, run.ID); err != nil {
			return activeTurn{}, err
		}
	}
	return service.persistAssistantDeltaLocked(workspaceID, run, message, active, now)
}

// persistAssistantDeltaLocked flushes the canonical assistant message and the open
// assistant_text block on the streaming persist cadence, leaving the block in
// memory between flushes so per-delta writes stay throttled.
func (service *Service) persistAssistantDeltaLocked(workspaceID string, run Run, message ChatMessage, active activeTurn, now time.Time) (activeTurn, error) {
	if !active.lastPersistedAt.IsZero() && now.Sub(active.lastPersistedAt) < deltaPersistInterval {
		return active, nil
	}
	if err := service.store.SaveMessage(workspaceID, message); err != nil {
		return activeTurn{}, err
	}
	if err := service.persistOpenAssistantBlockLocked(workspaceID, active.transcript); err != nil {
		return activeTurn{}, err
	}
	active.lastPersistedAt = now
	if err := service.traceLocked(workspaceID, run.ID, "assistant_text_delta_received", "Assistant text delta received"); err != nil {
		return activeTurn{}, err
	}
	return active, nil
}

func (active activeTurn) canonicalAssistantDelta(providerItemID string, delta string) (activeTurn, string) {
	if providerItemID == "" || delta == "" {
		return active, delta
	}
	active = active.ensureAssistantProviderTextState()
	state := active.assistantTextByProviderItem[providerItemID]
	return active.storeAssistantProviderState(providerItemID, state.appendDelta(delta)), delta
}

func (active activeTurn) ensureAssistantProviderTextState() activeTurn {
	if active.assistantTextByProviderItem == nil {
		active.assistantTextByProviderItem = map[string]assistantProviderTextState{}
	}
	return active
}

func (active activeTurn) storeAssistantProviderState(providerItemID string, state assistantProviderTextState) activeTurn {
	active = active.ensureAssistantProviderTextState()
	active.assistantTextByProviderItem[providerItemID] = state
	return active
}

func (state assistantProviderTextState) appendDelta(delta string) assistantProviderTextState {
	state.observed += delta
	state.appended += delta
	return state
}

type assistantProviderTextState struct {
	appended string
	observed string
}

func (active activeTurn) completedAssistantTextExists(text string) bool {
	for _, existing := range active.completedAssistantTexts {
		if existing == text {
			return true
		}
	}
	return false
}

func (active activeTurn) recordCompletedAssistantText(text string) activeTurn {
	if text == "" || active.completedAssistantTextExists(text) {
		return active
	}
	active.completedAssistantTexts = append(active.completedAssistantTexts, text)
	return active
}

func (service *Service) upsertRunItem(workspaceID string, conversationID string, runID string, item RunItem) error {
	service.mu.Lock()
	defer service.mu.Unlock()

	item.WorkspaceID = workspaceID
	item.ConversationID = conversationID
	item.RunID = runID
	return service.upsertRunItemLocked(item)
}

func (service *Service) upsertRunItemLocked(item RunItem) error {
	if err := service.prepareRunItemLocked(&item); err != nil {
		return err
	}
	// unifiedExecStartup is only a provider command start. Live Codex uses it for
	// short foreground commands too, so startup items stay on the normal run path
	// until they survive a turn boundary and are promoted to the terminal registry.
	handled, err := service.ingestProviderOwnedRunItemLocked(item)
	if err != nil || handled {
		return err
	}
	existing, exists, err := service.store.FindRunItemByProviderID(item.WorkspaceID, item.RunID, item.ProviderItemID)
	if err != nil {
		return err
	}
	if exists {
		item = mergeRunItem(existing, item)
	} else if item.ID, err = service.newID("run_item"); err != nil {
		return fmt.Errorf("create run item id: %w", err)
	}
	if err := service.store.SaveRunItem(item); err != nil {
		return err
	}
	if err := service.recordAgentMessageCompletionLocked(item); err != nil {
		return err
	}
	if err := service.ingestRunItemBlockForActiveTurnLocked(item); err != nil {
		return err
	}
	return service.publishRunItemUpsertLocked(item, exists)
}

func (service *Service) ingestProviderOwnedRunItemLocked(item RunItem) (bool, error) {
	if item.Source == nil {
		return false, nil
	}
	if isBackgroundTerminalInteractionSource(*item.Source) {
		return true, service.ingestBackgroundTerminalRunItemLocked(item)
	}
	if isBackgroundTerminalStartupSource(*item.Source) {
		return service.ingestPromotedBackgroundTerminalStartupUpdateLocked(item)
	}
	return false, nil
}

// ingestRunItemBlockForActiveTurnLocked records a run item's transcript block on
// the active turn's run-local chronology. It is a no-op when the item does not
// belong to the live active turn.
func (service *Service) ingestRunItemBlockForActiveTurnLocked(item RunItem) error {
	active, ok := service.activeTurnForRunItem(item)
	if !ok || active.transcript == nil {
		return nil
	}
	hasOutput, err := service.runItemHasOutputLocked(item.WorkspaceID, item.RunID, item.ID)
	if err != nil {
		return err
	}
	return service.ingestRunItemTranscriptBlockLocked(item.WorkspaceID, active.transcript, item, hasOutput)
}

func (service *Service) runItemHasOutputLocked(workspaceID string, runID string, runItemID string) (bool, error) {
	page, err := service.store.LoadRunItemOutputPage(workspaceID, runID, runItemID, 0, 1)
	if err != nil {
		return false, err
	}
	return len(page.Output) > 0, nil
}

func (service *Service) recordAgentMessageCompletionLocked(item RunItem) error {
	if !completedAgentMessageItem(item) {
		return nil
	}
	active, ok := service.activeTurnForRunItem(item)
	if !ok {
		return nil
	}
	if active.assistantTextByProviderItem[item.ProviderItemID].observed == "" {
		return nil
	}
	active, err := service.reconcileCompletedAgentMessageTextLocked(active, item)
	if err != nil {
		return err
	}
	active, err = service.removeDuplicateCompletedAgentMessageLocked(active, item)
	if err != nil {
		return err
	}
	service.active[activeKey(item.WorkspaceID, item.ConversationID)] = active.recordCompletedAssistantText(item.Summary)
	return nil
}

func completedAgentMessageItem(item RunItem) bool {
	return item.Type == RunItemTypeAgentMessage &&
		item.Status == RunItemStatusCompleted &&
		item.Summary != ""
}

func (service *Service) activeTurnForRunItem(item RunItem) (activeTurn, bool) {
	active, ok := service.active[activeKey(item.WorkspaceID, item.ConversationID)]
	if !ok || active.runID != item.RunID {
		return activeTurn{}, false
	}
	return active, true
}

func (service *Service) reconcileCompletedAgentMessageTextLocked(active activeTurn, item RunItem) (activeTurn, error) {
	state := active.assistantTextByProviderItem[item.ProviderItemID]
	appended := state.appended
	if appended == "" || appended == item.Summary {
		return active, nil
	}
	updated, changed := replaceAssistantProviderText(active.assistantMessage, appended, item.Summary)
	if !changed {
		return active, nil
	}
	active.assistantMessage = updated
	state.appended = item.Summary
	active = active.storeAssistantProviderState(item.ProviderItemID, state)
	if err := service.store.SaveMessage(item.WorkspaceID, updated); err != nil {
		return activeTurn{}, err
	}
	if err := service.reconcileAssistantBlockTextLocked(item.WorkspaceID, active.transcript, item.ProviderItemID, appended, item.Summary); err != nil {
		return activeTurn{}, err
	}
	if _, err := service.events.Publish(NewMessageUpdatedEvent(item.WorkspaceID, item.ConversationID, item.RunID, updated)); err != nil {
		return activeTurn{}, err
	}
	return active, nil
}

func (service *Service) removeDuplicateCompletedAgentMessageLocked(active activeTurn, item RunItem) (activeTurn, error) {
	state := active.assistantTextByProviderItem[item.ProviderItemID]
	appended := state.appended
	if !active.completedAssistantTextExists(item.Summary) || appended == "" {
		return active, nil
	}
	updated, changed := replaceAssistantProviderText(active.assistantMessage, appended, "")
	if !changed {
		return active, nil
	}
	active.assistantMessage = updated
	state.appended = ""
	active = active.storeAssistantProviderState(item.ProviderItemID, state)
	if err := service.store.SaveMessage(item.WorkspaceID, updated); err != nil {
		return activeTurn{}, err
	}
	if err := service.reconcileAssistantBlockTextLocked(item.WorkspaceID, active.transcript, item.ProviderItemID, appended, ""); err != nil {
		return activeTurn{}, err
	}
	if _, err := service.events.Publish(NewMessageUpdatedEvent(item.WorkspaceID, item.ConversationID, item.RunID, updated)); err != nil {
		return activeTurn{}, err
	}
	return active, nil
}

func replaceAssistantProviderText(message ChatMessage, text string, replacement string) (ChatMessage, bool) {
	if text == "" || len(message.Parts) == 0 {
		return message, false
	}
	current := message.Parts[0].Text.Text
	if !strings.HasSuffix(current, text) {
		return message, false
	}
	message.Parts[0].Text.Text = strings.TrimSuffix(current, text) + replacement
	return message, true
}

func (service *Service) prepareRunItemLocked(item *RunItem) error {
	item.SchemaVersion = SchemaVersion
	if item.CreatedAt == "" {
		item.CreatedAt = timestamp(service.now())
	}
	if item.Status == "" {
		item.Status = RunItemStatusRunning
	}
	if item.ProviderItemID == "" {
		return errors.New("run item provider item id is required")
	}
	return nil
}

func (service *Service) publishRunItemUpsertLocked(item RunItem, exists bool) error {
	var err error
	if exists {
		_, err = service.events.Publish(NewRunItemUpdatedEvent(item))
	} else {
		_, err = service.events.Publish(NewRunItemCreatedEvent(item))
	}
	if err != nil {
		return err
	}
	return nil
}

func mergeRunItem(existing RunItem, next RunItem) RunItem {
	next.ID = existing.ID
	next.CreatedAt = existing.CreatedAt
	next.StartedAt = keepString(next.StartedAt, existing.StartedAt)
	next.CompletedAt = keepString(next.CompletedAt, existing.CompletedAt)
	next.Title = keepString(next.Title, existing.Title)
	next.Summary = keepString(next.Summary, existing.Summary)
	next.Command = keepString(next.Command, existing.Command)
	next.Cwd = keepString(next.Cwd, existing.Cwd)
	next.FilePaths = keepStrings(next.FilePaths, existing.FilePaths)
	next.PatchStatus = keepString(next.PatchStatus, existing.PatchStatus)
	next.ServerName = keepString(next.ServerName, existing.ServerName)
	next.ToolName = keepString(next.ToolName, existing.ToolName)
	next.Progress = mergeProgress(existing, next)
	next.Result = keepString(next.Result, existing.Result)
	next.Error = keepString(next.Error, existing.Error)
	next.NoticeKind = keepString(next.NoticeKind, existing.NoticeKind)
	next.NoticeMessage = keepString(next.NoticeMessage, existing.NoticeMessage)
	next.DiffSummary = keepString(next.DiffSummary, existing.DiffSummary)
	next.Namespace = keepString(next.Namespace, existing.Namespace)
	next.ProcessID = keepString(next.ProcessID, existing.ProcessID)
	next.Source = keepCommandSource(next.Source, existing.Source)
	next.RequestID = keepString(next.RequestID, existing.RequestID)
	next.ReviewID = keepString(next.ReviewID, existing.ReviewID)
	next.Details = keepRawMessage(next.Details, existing.Details)
	next.HiddenText = mergeHiddenText(existing, next)
	return next
}

func keepString(next string, existing string) string {
	if next != "" {
		return next
	}
	return existing
}

// keepCommandSource preserves a previously projected command source when a later
// upsert omits it. The Codex schema makes commandExecution.source optional, so an
// update notification can arrive without it; without this, a background terminal
// startup's unified_exec_startup discriminator would be silently cleared by the
// next upsert for the same provider item.
func keepCommandSource(next *RunItemCommandSource, existing *RunItemCommandSource) *RunItemCommandSource {
	if next != nil {
		return next
	}
	return existing
}

func keepStrings(next []string, existing []string) []string {
	if len(next) > 0 {
		return next
	}
	return existing
}

func keepRawMessage(next []byte, existing []byte) []byte {
	if len(next) > 0 {
		return next
	}
	return existing
}

func mergeProgress(existing RunItem, next RunItem) string {
	if next.Progress == "" {
		return existing.Progress
	}
	if next.Type == RunItemTypePlan || next.Type == RunItemTypeReasoning {
		return existing.Progress + next.Progress
	}
	return next.Progress
}

func mergeHiddenText(existing RunItem, next RunItem) string {
	if next.HiddenText == "" {
		return existing.HiddenText
	}
	if next.Type == RunItemTypeReasoning {
		return existing.HiddenText + next.HiddenText
	}
	return next.HiddenText
}

func (service *Service) appendRunItemOutput(workspaceID string, conversationID string, runID string, providerItemID string, stream string, text string) error {
	service.mu.Lock()
	defer service.mu.Unlock()

	if err := validateRunItemOutputDelta(providerItemID, stream, text); err != nil {
		return err
	}
	// Output for a registered background terminal is owned by the process registry,
	// not by a run item. This covers the scripted harness and during-turn Codex
	// output; late output after the turn arrives through the BackgroundTerminalSink.
	process, isBackground, err := service.findBackgroundTerminalLocked(workspaceID, conversationID, providerItemID, "")
	if err != nil {
		return err
	}
	if isBackground {
		return service.appendBackgroundTerminalOutputLocked(process, stream, text)
	}
	return service.appendRunItemOutputLocked(workspaceID, conversationID, runID, providerItemID, stream, text)
}

func (service *Service) appendRunItemOutputLocked(workspaceID string, conversationID string, runID string, providerItemID string, stream string, text string) error {
	item, err := service.ensureOutputRunItemLocked(workspaceID, conversationID, runID, providerItemID)
	if err != nil {
		return err
	}
	output, err := service.newRunItemOutputLocked(workspaceID, runID, item.ID, stream, text)
	if err != nil {
		return err
	}
	if err := service.store.SaveRunItemOutput(workspaceID, runID, output); err != nil {
		return err
	}
	if _, err = service.events.Publish(NewRunItemOutputDeltaEvent(workspaceID, conversationID, runID, output)); err != nil {
		return err
	}
	if output.Ordinal == 1 {
		if active, ok := service.active[activeKey(workspaceID, conversationID)]; ok && active.runID == runID {
			if err := service.markActivityBlockOutputLocked(workspaceID, active.transcript, providerItemID); err != nil {
				return err
			}
		}
	}
	return nil
}

func validateRunItemOutputDelta(providerItemID string, stream string, text string) error {
	if providerItemID == "" {
		return errors.New("run item output provider item id is required")
	}
	if stream == "" {
		return errors.New("run item output stream is required")
	}
	if text == "" {
		return errors.New("run item output text is required")
	}
	return nil
}

func (service *Service) ensureOutputRunItemLocked(workspaceID string, conversationID string, runID string, providerItemID string) (RunItem, error) {
	item, exists, err := service.store.FindRunItemByProviderID(workspaceID, runID, providerItemID)
	if err != nil || exists {
		return item, err
	}
	item = RunItem{
		SchemaVersion:  SchemaVersion,
		WorkspaceID:    workspaceID,
		ConversationID: conversationID,
		RunID:          runID,
		ProviderItemID: providerItemID,
		Type:           RunItemTypeCommandExecution,
		Status:         RunItemStatusRunning,
		CreatedAt:      timestamp(service.now()),
		StartedAt:      timestamp(service.now()),
		Summary:        "Command output",
	}
	item.ID, err = service.newID("run_item")
	if err != nil {
		return RunItem{}, fmt.Errorf("create run item id: %w", err)
	}
	if err := service.store.SaveRunItem(item); err != nil {
		return RunItem{}, err
	}
	if err := service.ingestRunItemBlockForActiveTurnLocked(item); err != nil {
		return RunItem{}, err
	}
	if _, err = service.events.Publish(NewRunItemCreatedEvent(item)); err != nil {
		return RunItem{}, err
	}
	return item, nil
}

func (service *Service) newRunItemOutputLocked(workspaceID string, runID string, runItemID string, stream string, text string) (RunItemOutput, error) {
	ordinal, err := service.store.NextRunItemOutputOrdinal(workspaceID, runID, runItemID)
	if err != nil {
		return RunItemOutput{}, err
	}
	outputID, err := service.newID("run_item_output")
	if err != nil {
		return RunItemOutput{}, fmt.Errorf("create run item output id: %w", err)
	}
	return RunItemOutput{
		SchemaVersion: SchemaVersion,
		ID:            outputID,
		RunItemID:     runItemID,
		Stream:        stream,
		Ordinal:       ordinal,
		Text:          text,
		CreatedAt:     timestamp(service.now()),
	}, nil
}

func (service *Service) attachPageState(workspaceID string, conversationID string, page *MessagePage) error {
	runs, err := service.runsForConversationWithDiagnosticsLocked(workspaceID, conversationID)
	if err != nil {
		return err
	}
	queue, err := service.queuedStateFromRunsLocked(workspaceID, conversationID, runs)
	if err != nil {
		return err
	}
	page.Queue = queue
	goal, err := service.store.LoadGoal(workspaceID, conversationID)
	if err != nil {
		return err
	}
	page.Goal = goal
	return nil
}

func (service *Service) LoadRunActivityPage(workspaceID string, runID string, limit int) (RunActivityPage, error) {
	if _, err := service.validateRunRequest(workspaceID, runID); err != nil {
		return RunActivityPage{}, err
	}
	if limit < 0 {
		return RunActivityPage{}, fmt.Errorf("run activity page limit must not be negative: %d", limit)
	}
	service.mu.Lock()

	run, err := service.store.LoadRun(workspaceID, runID)
	if err != nil {
		service.mu.Unlock()
		service.recordCorruptStateDiagnostic(err, workspaceID, "", runID)
		return RunActivityPage{}, err
	}
	items, err := service.store.LoadRunItems(workspaceID, runID)
	if err != nil {
		service.mu.Unlock()
		service.recordCorruptStateDiagnostic(err, workspaceID, "", runID)
		return RunActivityPage{}, err
	}
	backgroundProviderItems, err := service.backgroundTerminalProviderItemIDsForRunLocked(workspaceID, run.ConversationID, runID)
	if err != nil {
		service.mu.Unlock()
		service.recordCorruptStateDiagnostic(err, workspaceID, run.ConversationID, runID)
		return RunActivityPage{}, err
	}
	items = activityProjectionRunItems(items, backgroundProviderItems)
	outputs, err := service.runItemOutputPreviews(workspaceID, runID, items, activityOutputPreviewLimit(limit))
	if err != nil {
		service.mu.Unlock()
		service.recordCorruptStateDiagnostic(err, workspaceID, "", runID)
		return RunActivityPage{}, err
	}
	service.mu.Unlock()
	return RunActivityPage{
		RunID:    runID,
		Items:    items,
		Output:   outputs,
		Activity: runActivityItemProjections(run.Status, items, outputs),
	}, nil
}

// runActivityItemProjections projects a run's items into displayable activity_item
// rows for non-transcript activity surfaces (the workflow node-details feed). It
// reuses the shared projection so displayability and row fields match the
// chronological transcript's activity_item blocks: reasoning items are owned by
// the reasoning block kind, not activity, so they are excluded here just as the
// ingestion routes them away from the activity path. hasOutput is derived from
// the loaded output previews.
func runActivityItemProjections(runStatus RunStatus, items []RunItem, outputs []RunItemOutput) []ActivityItemBlockProjection {
	hasOutput := make(map[string]bool, len(outputs))
	for _, output := range outputs {
		hasOutput[output.RunItemID] = true
	}
	projections := make([]ActivityItemBlockProjection, 0, len(items))
	for _, item := range items {
		if item.Type == RunItemTypeReasoning {
			continue
		}
		projection, ok := activityItemBlockProjection(item, runStatus, hasOutput[item.ID])
		if ok {
			projections = append(projections, projection)
		}
	}
	return projections
}

func activityProjectionRunItems(items []RunItem, backgroundProviderItems map[string]struct{}) []RunItem {
	if len(backgroundProviderItems) == 0 {
		return items
	}
	filtered := make([]RunItem, 0, len(items))
	for _, item := range items {
		if _, promoted := backgroundProviderItems[item.ProviderItemID]; promoted {
			continue
		}
		filtered = append(filtered, item)
	}
	return filtered
}

func (service *Service) LoadRunItemOutputPage(workspaceID string, runID string, runItemID string, afterOrdinal int, limit int) (RunItemOutputPage, error) {
	if _, err := service.validateRunItemOutputRequest(workspaceID, runID, runItemID); err != nil {
		return RunItemOutputPage{}, err
	}
	service.mu.Lock()
	page, err := service.store.LoadRunItemOutputPage(workspaceID, runID, runItemID, afterOrdinal, limit)
	service.mu.Unlock()
	if err != nil {
		service.recordCorruptStateDiagnostic(err, workspaceID, "", runID)
		return RunItemOutputPage{}, err
	}
	return page, nil
}

func (service *Service) runItemOutputPreviews(workspaceID string, runID string, items []RunItem, limit int) ([]RunItemOutput, error) {
	outputs := []RunItemOutput{}
	for _, item := range items {
		page, err := service.store.LoadRunItemOutputPage(workspaceID, runID, item.ID, 0, limit)
		if err != nil {
			return nil, err
		}
		outputs = append(outputs, page.Output...)
	}
	return outputs, nil
}

func activityOutputPreviewLimit(limit int) int {
	if limit <= 0 {
		return embeddedRunOutputLimit
	}
	return limit
}
