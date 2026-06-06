package chat

import (
	"errors"
	"fmt"
)

const embeddedRunOutputLimit = 200

func (service *Service) appendAssistantDelta(workspaceID string, conversationID string, runID string, providerItemID string, delta string) error {
	service.mu.Lock()
	defer service.mu.Unlock()

	run, active, ok, err := service.runningActiveTurnLocked(workspaceID, conversationID, runID)
	if err != nil || !ok {
		return err
	}
	active, err = service.applyAssistantDeltaLocked(workspaceID, conversationID, run, active, delta)
	if err != nil {
		return err
	}
	service.active[activeKey(workspaceID, conversationID)] = active
	if providerItemID == "" {
		return nil
	}
	return service.upsertRunItemLocked(RunItem{
		SchemaVersion:  SchemaVersion,
		WorkspaceID:    workspaceID,
		ConversationID: conversationID,
		RunID:          runID,
		ProviderItemID: providerItemID,
		Type:           RunItemTypeAgentMessage,
		Status:         RunItemStatusRunning,
		Summary:        "Assistant message",
	})
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

func (service *Service) applyAssistantDeltaLocked(workspaceID string, conversationID string, run Run, active activeTurn, delta string) (activeTurn, error) {
	message := active.assistantMessage
	message.Parts[0].Text += delta
	now := service.now()
	message.UpdatedAt = timestamp(now)
	partID := message.Parts[0].ID
	active.assistantMessage = message
	if _, err := service.events.Publish(NewAssistantTextDeltaEvent(workspaceID, conversationID, run.ID, message.ID, partID, delta, message.UpdatedAt)); err != nil {
		return activeTurn{}, err
	}
	if active.lastPersistedAt.IsZero() || now.Sub(active.lastPersistedAt) >= deltaPersistInterval {
		if err := service.store.SaveMessage(workspaceID, message); err != nil {
			return activeTurn{}, err
		}
		active.lastPersistedAt = now
		if err := service.traceLocked(workspaceID, run.ID, "assistant_text_delta_received", "Assistant text delta received"); err != nil {
			return activeTurn{}, err
		}
	}
	return active, nil
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
	return service.publishRunItemUpsertLocked(item, exists)
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
	return err
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
	_, err = service.events.Publish(NewRunItemOutputDeltaEvent(workspaceID, conversationID, runID, output))
	return err
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
	_, err = service.events.Publish(NewRunItemCreatedEvent(item))
	return item, err
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
	if err := service.attachTranscriptToPageLocked(workspaceID, conversationID, page, runs); err != nil {
		return err
	}
	return service.attachRunActivityToPage(workspaceID, page)
}

func (service *Service) attachRunActivityToPage(workspaceID string, page *MessagePage) error {
	for _, runID := range runIDsFromTranscript(page.Transcript) {
		run, err := service.store.LoadRun(workspaceID, runID)
		if err != nil {
			return err
		}
		if err := service.validateRunAssistantMessage(workspaceID, run); err != nil {
			return err
		}
		items, err := service.store.LoadRunItems(workspaceID, runID)
		if err != nil {
			return err
		}
		outputs, err := service.runItemOutputPreviews(workspaceID, runID, items, embeddedRunOutputLimit)
		if err != nil {
			return err
		}
		page.RunItems = append(page.RunItems, items...)
		page.RunItemOutputs = append(page.RunItemOutputs, outputs...)
	}
	return nil
}

func (service *Service) validateRunAssistantMessage(workspaceID string, run Run) error {
	if run.Status == RunStatusQueued {
		return nil
	}
	message, ok, err := service.store.FindMessageByID(workspaceID, run.ConversationID, run.AssistantMessageID)
	if err != nil {
		return err
	}
	if !ok {
		return corruptStateErrorf(service.store.runPath(workspaceID, run.ID), "run %s assistant message %s was not found", run.ID, run.AssistantMessageID)
	}
	if err := validateRunAssistantMessageRecord(run, message); err != nil {
		return corruptStateError(service.store.runPath(workspaceID, run.ID), err)
	}
	return nil
}

func validateRunAssistantMessageRecord(run Run, message ChatMessage) error {
	if message.Role != RoleAssistant {
		return fmt.Errorf("run %s assistantMessageId %s refers to %s message", run.ID, run.AssistantMessageID, message.Role)
	}
	if message.RunID != run.ID {
		return fmt.Errorf("run %s assistant message %s belongs to run %s", run.ID, message.ID, message.RunID)
	}
	return nil
}

func (service *Service) LoadRunActivityPage(workspaceID string, runID string, limit int) (RunActivityPage, error) {
	if _, err := service.workspaceResolver.ResolveWorkspace(workspaceID); err != nil {
		return RunActivityPage{}, err
	}
	if limit < 0 {
		return RunActivityPage{}, fmt.Errorf("run activity page limit must not be negative: %d", limit)
	}
	service.mu.Lock()

	if _, err := service.store.LoadRun(workspaceID, runID); err != nil {
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
	outputs, err := service.runItemOutputPreviews(workspaceID, runID, items, activityOutputPreviewLimit(limit))
	if err != nil {
		service.mu.Unlock()
		service.recordCorruptStateDiagnostic(err, workspaceID, "", runID)
		return RunActivityPage{}, err
	}
	service.mu.Unlock()
	return RunActivityPage{RunID: runID, Items: items, Output: outputs}, nil
}

func (service *Service) LoadRunItemOutputPage(workspaceID string, runID string, runItemID string, afterOrdinal int, limit int) (RunItemOutputPage, error) {
	if _, err := service.workspaceResolver.ResolveWorkspace(workspaceID); err != nil {
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
