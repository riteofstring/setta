package chat

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"sort"
)

type QueueOverlayRecord struct {
	SchemaVersion int       `json:"schemaVersion"`
	WorkspaceID   string    `json:"workspaceId"`
	CodexThreadID string    `json:"codexThreadId"`
	QueueID       string    `json:"queueId"`
	MessageID     string    `json:"messageId"`
	RunID         string    `json:"runId"`
	Ordinal       int       `json:"ordinal"`
	Prompt        string    `json:"prompt"`
	CreatedAt     string    `json:"createdAt"`
	UpdatedAt     string    `json:"updatedAt"`
	Status        RunStatus `json:"status"`
}

func (store *Store) loadQueueOverlay() error {
	workspaceIDs, err := store.WorkspaceIDs()
	if err != nil {
		return err
	}
	for _, workspaceID := range workspaceIDs {
		threadRoot := store.threadOverlayRoot(workspaceID)
		threadEntries, err := os.ReadDir(threadRoot)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				continue
			}
			return &PersistenceError{Operation: "list queue overlay threads", Path: threadRoot, Err: err}
		}
		for _, threadEntry := range threadEntries {
			if !threadEntry.IsDir() || threadEntry.Name()[0] == '.' {
				continue
			}
			if err := store.loadQueueOverlayForThread(workspaceID, threadEntry.Name()); err != nil {
				return err
			}
		}
	}
	return nil
}

func (store *Store) loadQueueOverlayForThread(workspaceID string, codexThreadID string) error {
	dir := store.queueOverlayDir(workspaceID, codexThreadID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return &PersistenceError{Operation: "list queue overlay", Path: dir, Err: err}
	}
	sort.SliceStable(entries, func(left int, right int) bool {
		return entries[left].Name() < entries[right].Name()
	})
	for _, entry := range entries {
		if entry.IsDir() || !isDataJSONFile(entry.Name()) {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		var record QueueOverlayRecord
		if err := readJSONFile(path, &record); err != nil {
			return err
		}
		if err := validateQueueOverlayRecord(record); err != nil {
			return corruptStateError(path, err)
		}
		if record.WorkspaceID != workspaceID {
			return corruptStateErrorf(path, "queue overlay workspaceId %s does not match directory workspace %s", record.WorkspaceID, workspaceID)
		}
		if record.CodexThreadID != codexThreadID {
			return corruptStateErrorf(path, "queue overlay codexThreadId %s does not match directory thread %s", record.CodexThreadID, codexThreadID)
		}
		if err := store.rememberQueueOverlay(record); err != nil {
			return corruptStateError(path, err)
		}
	}
	return nil
}

func validateQueueOverlayRecord(record QueueOverlayRecord) error {
	if record.SchemaVersion != SchemaVersion {
		return errors.New("queue overlay has unsupported schemaVersion")
	}
	if err := validateWorkspaceID(record.WorkspaceID); err != nil {
		return err
	}
	if err := validateConversationID(record.CodexThreadID); err != nil {
		return err
	}
	if err := validateRunID(record.QueueID); err != nil {
		return err
	}
	if err := validateMessageID(record.MessageID); err != nil {
		return err
	}
	if err := validateRunID(record.RunID); err != nil {
		return err
	}
	if record.QueueID != record.RunID {
		return errors.New("queue overlay queueId must match runId")
	}
	if record.Ordinal <= 0 {
		return errors.New("queue overlay ordinal must be positive")
	}
	if record.Prompt == "" {
		return errors.New("queue overlay prompt is required")
	}
	if err := validateTimestamp(record.CreatedAt, "queue overlay createdAt"); err != nil {
		return err
	}
	if err := validateTimestamp(record.UpdatedAt, "queue overlay updatedAt"); err != nil {
		return err
	}
	if record.Status != RunStatusQueued {
		return errors.New("queue overlay status must be queued")
	}
	return nil
}

func (store *Store) rememberQueueOverlay(record QueueOverlayRecord) error {
	conversationID := store.conversationIDForOverlayThreadID(record.WorkspaceID, record.CodexThreadID)
	message := ChatMessage{
		SchemaVersion:  SchemaVersion,
		ID:             record.MessageID,
		ConversationID: conversationID,
		RunID:          record.RunID,
		Role:           RoleUser,
		Delivery:       MessageDeliveryQueued,
		Ordinal:        record.Ordinal,
		CreatedAt:      record.CreatedAt,
		UpdatedAt:      record.UpdatedAt,
		Status:         MessageStatusPending,
		Parts: []MessagePart{{
			Format: TextFormatPlain,
			ID:     record.MessageID + "_part",
			Text:   record.Prompt,
			Type:   MessagePartText,
		}},
	}
	if err := validateMessage(message); err != nil {
		return err
	}
	if store.messages[record.WorkspaceID] == nil {
		store.messages[record.WorkspaceID] = map[string][]ChatMessage{}
	}
	store.messages[record.WorkspaceID][conversationID] = upsertMessageForProjection(store.messages[record.WorkspaceID][conversationID], message)
	sort.SliceStable(store.messages[record.WorkspaceID][conversationID], func(left int, right int) bool {
		messages := store.messages[record.WorkspaceID][conversationID]
		if messages[left].Ordinal == messages[right].Ordinal {
			return messages[left].ID < messages[right].ID
		}
		return messages[left].Ordinal < messages[right].Ordinal
	})
	run := Run{
		SchemaVersion:    SchemaVersion,
		ID:               record.RunID,
		WorkspaceID:      record.WorkspaceID,
		ConversationID:   conversationID,
		TriggerMessageID: record.MessageID,
		Harness:          HarnessCodex,
		Status:           RunStatusQueued,
		PromptSummary:    summarize(record.Prompt, maxPromptSummary),
	}
	if err := validateRun(run); err != nil {
		return err
	}
	if store.runs[record.WorkspaceID] == nil {
		store.runs[record.WorkspaceID] = map[string]Run{}
	}
	store.runs[record.WorkspaceID][record.RunID] = run
	return nil
}

func (store *Store) maybeSaveQueueOverlayForMessage(workspaceID string, message ChatMessage) error {
	if message.Delivery != MessageDeliveryQueued || message.Role != RoleUser {
		return nil
	}
	run, ok := store.runs[workspaceID][message.RunID]
	if !ok || run.Status != RunStatusQueued {
		return nil
	}
	return store.saveQueueOverlay(workspaceID, message.ConversationID, message, run)
}

func (store *Store) maybeSaveQueueOverlayForRun(run Run) error {
	if run.Status != RunStatusQueued {
		return nil
	}
	message, ok, err := store.FindMessageByID(run.WorkspaceID, run.ConversationID, run.TriggerMessageID)
	if err != nil || !ok {
		return err
	}
	return store.saveQueueOverlay(run.WorkspaceID, run.ConversationID, message, run)
}

func (store *Store) saveQueueOverlay(workspaceID string, conversationID string, message ChatMessage, run Run) error {
	record := QueueOverlayRecord{
		SchemaVersion: SchemaVersion,
		WorkspaceID:   workspaceID,
		CodexThreadID: overlayThreadIDForConversation(store, workspaceID, conversationID),
		QueueID:       run.ID,
		MessageID:     message.ID,
		RunID:         run.ID,
		Ordinal:       message.Ordinal,
		Prompt:        promptFromMessage(message),
		CreatedAt:     message.CreatedAt,
		UpdatedAt:     message.UpdatedAt,
		Status:        run.Status,
	}
	return writeJSONFile(store.queueOverlayPath(workspaceID, record.CodexThreadID, record.QueueID), record)
}

func (store *Store) removeQueueOverlay(workspaceID string, conversationID string, runID string) error {
	codexThreadID := overlayThreadIDForConversation(store, workspaceID, conversationID)
	path := store.queueOverlayPath(workspaceID, codexThreadID, runID)
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return &PersistenceError{Operation: "remove queue overlay", Path: path, Err: err}
	}
	return nil
}

func (store *Store) saveActivityOverlayForRunItem(item RunItem) error {
	kind, ok := activityKindForRunItem(item.Type)
	if !ok {
		return nil
	}
	record := activityOverlayRecordFromRunItem(store, item, kind)
	if err := validateActivityOverlayRecord(record); err != nil {
		return err
	}
	return writeJSONFile(store.activityOverlayPath(item.WorkspaceID, record.CodexThreadID, record.CodexTurnID, storageSafeOverlayKey(record.LiveKey)), record)
}

func (store *Store) appendActivityOverlayOutput(workspaceID string, runID string, output RunItemOutput) error {
	item, ok, err := store.runItemByID(workspaceID, runID, output.RunItemID)
	if err != nil || !ok {
		return err
	}
	kind, ok := activityKindForRunItem(item.Type)
	if !ok {
		return nil
	}
	record := activityOverlayRecordFromRunItem(store, item, kind)
	path := store.activityOverlayPath(workspaceID, record.CodexThreadID, record.CodexTurnID, storageSafeOverlayKey(record.LiveKey))
	var existing ActivityOverlayRecord
	if err := readJSONFile(path, &existing); err == nil {
		record = existing
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	switch output.Stream {
	case "stderr":
		record.Stderr += output.Text
	default:
		record.Stdout += output.Text
	}
	record.CompletedAt = item.CompletedAt
	if err := validateActivityOverlayRecord(record); err != nil {
		return err
	}
	return writeJSONFile(path, record)
}

func (store *Store) runItemByID(workspaceID string, runID string, runItemID string) (RunItem, bool, error) {
	if err := validateStoreRunItemIDs(workspaceID, runID, runItemID); err != nil {
		return RunItem{}, false, err
	}
	item, ok := store.runItems[workspaceID][runID][runItemID]
	return item, ok, nil
}

func activityOverlayRecordFromRunItem(store *Store, item RunItem, kind ActivityOverlayKind) ActivityOverlayRecord {
	liveKey := item.ProviderItemID
	if liveKey == "" {
		liveKey = item.RequestID
	}
	if liveKey == "" {
		liveKey = item.ID
	}
	record := ActivityOverlayRecord{
		SchemaVersion: SchemaVersion,
		WorkspaceID:   item.WorkspaceID,
		CodexThreadID: overlayThreadIDForConversation(store, item.WorkspaceID, item.ConversationID),
		CodexTurnID:   item.RunID,
		LiveKey:       liveKey,
		Kind:          kind,
		Status:        item.Status,
		CreatedAt:     item.CreatedAt,
		StartedAt:     item.StartedAt,
		CompletedAt:   item.CompletedAt,
		Command:       item.Command,
		Cwd:           item.Cwd,
		ExitCode:      item.ExitCode,
		DurationMs:    item.DurationMs,
		FilePaths:     stringSliceOrEmpty(item.FilePaths),
		PatchStatus:   item.PatchStatus,
		ServerName:    item.ServerName,
		ToolName:      item.ToolName,
		Namespace:     item.Namespace,
		RequestID:     item.RequestID,
		ReviewID:      item.ReviewID,
		Details:       item.Details,
		Error:         item.Error,
		Progress:      item.Progress,
	}
	if kind == ActivityOverlayKindMCPToolCall || kind == ActivityOverlayKindDynamicToolCall {
		record.ToolResult = item.Result
	}
	return record
}

func activityKindForRunItem(itemType RunItemType) (ActivityOverlayKind, bool) {
	switch itemType {
	case RunItemTypeCommandExecution:
		return ActivityOverlayKindCommandExecution, true
	case RunItemTypeFileChange, RunItemTypeDiff:
		return ActivityOverlayKindFileChange, true
	case RunItemTypeMCPToolCall:
		return ActivityOverlayKindMCPToolCall, true
	case RunItemTypeDynamicToolCall, RunItemTypeCollabAgentToolCall:
		return ActivityOverlayKindDynamicToolCall, true
	case RunItemTypeTerminalInteraction:
		return ActivityOverlayKindTerminalInteraction, true
	case RunItemTypeApprovalReview:
		return ActivityOverlayKindApproval, true
	case RunItemTypeStructuredInput:
		return ActivityOverlayKindStructuredInput, true
	default:
		return "", false
	}
}

func overlayThreadIDForConversation(store *Store, workspaceID string, conversationID string) string {
	if conversation, ok := store.conversationFromMemory(workspaceID, conversationID); ok {
		if ref := latestHarnessRef(conversation, HarnessCodex); ref.ThreadID != "" {
			return ref.ThreadID
		}
	}
	return conversationID
}

func (store *Store) conversationIDForOverlayThreadID(workspaceID string, codexThreadID string) string {
	for _, conversation := range store.conversations[workspaceID] {
		if ref := latestHarnessRef(conversation, HarnessCodex); ref.ThreadID == codexThreadID {
			return conversation.ID
		}
	}
	return codexThreadID
}

func storageSafeOverlayKey(value string) string {
	if value == "" {
		return "empty"
	}
	valid := true
	for _, r := range value {
		if !isStorageIDRune(r) {
			valid = false
			break
		}
	}
	if valid {
		return value
	}
	sum := sha256.Sum256([]byte(value))
	return "key_" + hex.EncodeToString(sum[:])
}
