package chat

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
)

const (
	chatOverlayDirName     = "chat-overlay"
	threadOverlayDirName   = "threads"
	threadIndexFileName    = "thread-index.json"
	threadReadFileName     = "read-state.json"
	threadPinsFileName     = "thread-pins.json"
	queueOverlayDirName    = "queue"
	activityOverlayDirName = "activity"
	activityRecordFileName = "activity.json"
	diagnosticsDirName     = "diagnostics"
)

type Store struct {
	appDataDir    string
	conversations map[string]map[string]Conversation
	goals         map[string]map[string]ChatGoalState
	messages      map[string]map[string][]ChatMessage
	runItems      map[string]map[string]map[string]RunItem
	runOutputs    map[string]map[string]map[string][]RunItemOutput
	runs          map[string]map[string]Run
}

type PersistenceError struct {
	Operation string
	Path      string
	Err       error
}

type CorruptStateError struct {
	Path string
	Err  error
}

type ConversationReadState struct {
	SchemaVersion            int    `json:"schemaVersion"`
	ConversationID           string `json:"conversationId"`
	ReadMarker               int    `json:"readMarker"`
	LatestReadRelevantMarker int    `json:"latestReadRelevantMarker"`
	UpdatedAt                string `json:"updatedAt"`
}

type conversationPinState struct {
	SchemaVersion int               `json:"schemaVersion"`
	Pins          []conversationPin `json:"pins"`
}

type conversationPin struct {
	ConversationID string `json:"conversationId"`
	PinnedAt       string `json:"pinnedAt"`
}

func (err *PersistenceError) Error() string {
	return fmt.Sprintf("%s %s: %v", err.Operation, err.Path, err.Err)
}

func (err *PersistenceError) Unwrap() error {
	return err.Err
}

func (err *CorruptStateError) Error() string {
	return fmt.Sprintf("malformed chat state %s: %v", err.Path, err.Err)
}

func (err *CorruptStateError) Unwrap() error {
	return err.Err
}

func IsPersistenceError(err error) bool {
	var persistenceError *PersistenceError
	return errors.As(err, &persistenceError)
}

func IsCorruptStateError(err error) bool {
	var corruptStateError *CorruptStateError
	return errors.As(err, &corruptStateError)
}

func NewStore(appDataDir string) (*Store, error) {
	if appDataDir == "" {
		return nil, errors.New("app data directory is required")
	}
	if !filepath.IsAbs(appDataDir) {
		return nil, fmt.Errorf("app data directory must be absolute: %s", appDataDir)
	}
	store := &Store{
		appDataDir:    filepath.Clean(appDataDir),
		conversations: map[string]map[string]Conversation{},
		goals:         map[string]map[string]ChatGoalState{},
		messages:      map[string]map[string][]ChatMessage{},
		runItems:      map[string]map[string]map[string]RunItem{},
		runOutputs:    map[string]map[string]map[string][]RunItemOutput{},
		runs:          map[string]map[string]Run{},
	}
	if err := store.loadThreadIndexOverlay(); err != nil {
		return nil, err
	}
	if err := store.loadQueueOverlay(); err != nil {
		return nil, err
	}
	return store, nil
}

func (store *Store) WorkspaceIDs() ([]string, error) {
	dir := filepath.Join(store.appDataDir, "workspaces")
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []string{}, nil
		}
		return nil, &PersistenceError{Operation: "list chat workspaces", Path: dir, Err: err}
	}
	ids := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			ids = append(ids, entry.Name())
		}
	}
	sort.Strings(ids)
	return ids, nil
}

func (store *Store) SaveConversation(conversation Conversation) error {
	if err := validateConversation(conversation); err != nil {
		return err
	}
	store.rememberConversation(conversation)
	ref := latestHarnessRef(conversation, HarnessCodex)
	if ref.ThreadID == "" {
		return nil
	}
	record := threadIndexRecordFromConversation(conversation, ref.ThreadID)
	if err := validateThreadIndexRecord(record); err != nil {
		return err
	}
	return writeJSONFile(store.threadIndexPath(conversation.WorkspaceID, ref.ThreadID), record)
}

func (store *Store) DeleteConversation(workspaceID string, conversationID string) error {
	if err := validateStoreConversationIDs(workspaceID, conversationID); err != nil {
		return err
	}
	conversation, err := store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return err
	}
	if byWorkspace := store.conversations[workspaceID]; byWorkspace != nil {
		delete(byWorkspace, conversationID)
	}
	if byWorkspace := store.messages[workspaceID]; byWorkspace != nil {
		delete(byWorkspace, conversationID)
	}
	if byWorkspace := store.goals[workspaceID]; byWorkspace != nil {
		delete(byWorkspace, conversationID)
	}
	pinID := conversationID
	ref := latestHarnessRef(conversation, HarnessCodex)
	if ref.ThreadID != "" {
		pinID = ref.ThreadID
	}
	for runID, run := range store.runs[workspaceID] {
		if run.ConversationID == conversationID {
			delete(store.runs[workspaceID], runID)
			delete(store.runItems[workspaceID], runID)
			delete(store.runOutputs[workspaceID], runID)
		}
	}
	if ref.ThreadID != "" {
		path := store.threadOverlayDir(workspaceID, ref.ThreadID)
		if err := os.RemoveAll(path); err != nil {
			return &PersistenceError{Operation: "delete thread overlay", Path: path, Err: err}
		}
	}
	return store.setConversationPinKey(workspaceID, pinID, "")
}

func (store *Store) LoadConversation(workspaceID string, conversationID string) (Conversation, error) {
	if err := validateStoreConversationIDs(workspaceID, conversationID); err != nil {
		return Conversation{}, err
	}
	if conversation, ok := store.conversationFromMemory(workspaceID, conversationID); ok {
		return conversation, nil
	}
	path := store.threadIndexPath(workspaceID, conversationID)
	var record ThreadIndexRecord
	if err := readJSONFile(path, &record); err != nil {
		return Conversation{}, err
	}
	if err := validateThreadIndexRecord(record); err != nil {
		return Conversation{}, corruptStateError(path, err)
	}
	conversation := conversationFromThreadIndexRecord(record)
	if err := validateConversation(conversation); err != nil {
		return Conversation{}, corruptStateError(path, err)
	}
	store.rememberConversation(conversation)
	return conversation, nil
}

func (store *Store) LoadConversationPins(workspaceID string) (map[string]string, error) {
	if err := validateStoreWorkspaceID(workspaceID); err != nil {
		return nil, err
	}
	path := store.threadPinsPath(workspaceID)
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return map[string]string{}, nil
		}
		return nil, &PersistenceError{Operation: "stat thread pins", Path: path, Err: err}
	}
	var state conversationPinState
	if err := readJSONFile(path, &state); err != nil {
		return nil, err
	}
	if err := validateConversationPinState(state); err != nil {
		return nil, corruptStateError(path, err)
	}
	pins := make(map[string]string, len(state.Pins))
	for _, pin := range state.Pins {
		pins[pin.ConversationID] = pin.PinnedAt
	}
	return pins, nil
}

func (store *Store) SetConversationPinnedAt(workspaceID string, conversationID string, pinnedAt string) error {
	if err := validateStoreConversationIDs(workspaceID, conversationID); err != nil {
		return err
	}
	return store.setConversationPinKey(workspaceID, overlayThreadIDForConversation(store, workspaceID, conversationID), pinnedAt)
}

func (store *Store) setConversationPinKey(workspaceID string, pinID string, pinnedAt string) error {
	if err := validateStoreConversationIDs(workspaceID, pinID); err != nil {
		return err
	}
	if pinnedAt != "" {
		if err := validateTimestamp(pinnedAt, "conversation "+pinID+" pinnedAt"); err != nil {
			return err
		}
	}
	pins, err := store.LoadConversationPins(workspaceID)
	if err != nil {
		return err
	}
	if pinnedAt == "" {
		delete(pins, pinID)
	} else {
		pins[pinID] = pinnedAt
	}
	return store.saveConversationPins(workspaceID, pins)
}

func (store *Store) LoadConversationReadState(workspaceID string, conversationID string) (ConversationReadState, error) {
	if err := validateStoreConversationIDs(workspaceID, conversationID); err != nil {
		return ConversationReadState{}, err
	}
	codexThreadID := overlayThreadIDForConversation(store, workspaceID, conversationID)
	path := store.threadReadPath(workspaceID, codexThreadID)
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return emptyConversationReadState(codexThreadID), nil
		}
		return ConversationReadState{}, &PersistenceError{Operation: "stat thread read state", Path: path, Err: err}
	}
	var state ConversationReadState
	if err := readJSONFile(path, &state); err != nil {
		return ConversationReadState{}, err
	}
	if err := validateConversationReadState(state, codexThreadID); err != nil {
		return ConversationReadState{}, corruptStateError(path, err)
	}
	return state, nil
}

func (store *Store) SaveConversationReadState(workspaceID string, state ConversationReadState) error {
	if err := validateStoreWorkspaceID(workspaceID); err != nil {
		return err
	}
	codexThreadID := overlayThreadIDForConversation(store, workspaceID, state.ConversationID)
	state.ConversationID = codexThreadID
	if err := validateConversationReadState(state, codexThreadID); err != nil {
		return err
	}
	return writeJSONFile(store.threadReadPath(workspaceID, codexThreadID), state)
}

func (store *Store) SaveGoal(workspaceID string, conversationID string, goal ChatGoalState) error {
	if err := validateStoreConversationIDs(workspaceID, conversationID); err != nil {
		return err
	}
	if err := validateChatGoalState(goal); err != nil {
		return err
	}
	if store.goals[workspaceID] == nil {
		store.goals[workspaceID] = map[string]ChatGoalState{}
	}
	store.goals[workspaceID][conversationID] = goal
	return nil
}

func (store *Store) LoadGoal(workspaceID string, conversationID string) (*ChatGoalState, error) {
	if err := validateStoreConversationIDs(workspaceID, conversationID); err != nil {
		return nil, err
	}
	goal, ok := store.goals[workspaceID][conversationID]
	if !ok {
		return nil, nil
	}
	return &goal, nil
}

func (store *Store) ClearGoal(workspaceID string, conversationID string) error {
	if err := validateStoreConversationIDs(workspaceID, conversationID); err != nil {
		return err
	}
	if store.goals[workspaceID] != nil {
		delete(store.goals[workspaceID], conversationID)
	}
	return nil
}

func (store *Store) ListConversations(workspaceID string) ([]Conversation, error) {
	if err := validateStoreWorkspaceID(workspaceID); err != nil {
		return nil, err
	}
	return store.conversationsFromMemory(workspaceID), nil
}

func (store *Store) scanConversationsAllowingCorrupt(workspaceID string) ([]Conversation, []CorruptStateFinding, error) {
	if err := validateStoreWorkspaceID(workspaceID); err != nil {
		return nil, nil, err
	}
	return store.conversationsFromMemory(workspaceID), nil, nil
}

func (store *Store) deleteConversationRuns(workspaceID string, conversationID string) error {
	for runID, run := range store.runs[workspaceID] {
		if run.ConversationID == conversationID {
			delete(store.runs[workspaceID], runID)
			delete(store.runItems[workspaceID], runID)
			delete(store.runOutputs[workspaceID], runID)
		}
	}
	return nil
}

func (store *Store) deleteRun(workspaceID string, runID string) error {
	delete(store.runs[workspaceID], runID)
	delete(store.runItems[workspaceID], runID)
	delete(store.runOutputs[workspaceID], runID)
	return nil
}

func (store *Store) saveConversationPins(workspaceID string, pins map[string]string) error {
	if err := validateStoreWorkspaceID(workspaceID); err != nil {
		return err
	}
	path := store.threadPinsPath(workspaceID)
	if len(pins) == 0 {
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			return &PersistenceError{Operation: "remove thread pins", Path: path, Err: err}
		}
		return nil
	}
	state := conversationPinState{
		SchemaVersion: SchemaVersion,
		Pins:          make([]conversationPin, 0, len(pins)),
	}
	for conversationID, pinnedAt := range pins {
		state.Pins = append(state.Pins, conversationPin{
			ConversationID: conversationID,
			PinnedAt:       pinnedAt,
		})
	}
	sort.SliceStable(state.Pins, func(left int, right int) bool {
		if state.Pins[left].PinnedAt == state.Pins[right].PinnedAt {
			return state.Pins[left].ConversationID < state.Pins[right].ConversationID
		}
		return state.Pins[left].PinnedAt > state.Pins[right].PinnedAt
	})
	if err := validateConversationPinState(state); err != nil {
		return err
	}
	return writeJSONFile(path, state)
}

func (store *Store) SaveMessage(workspaceID string, message ChatMessage) error {
	if err := validateStoreWorkspaceID(workspaceID); err != nil {
		return err
	}
	if err := validateMessage(message); err != nil {
		return err
	}
	if store.messages[workspaceID] == nil {
		store.messages[workspaceID] = map[string][]ChatMessage{}
	}
	store.messages[workspaceID][message.ConversationID] = upsertMessageForProjection(store.messages[workspaceID][message.ConversationID], message)
	sort.SliceStable(store.messages[workspaceID][message.ConversationID], func(left int, right int) bool {
		messages := store.messages[workspaceID][message.ConversationID]
		if messages[left].Ordinal == messages[right].Ordinal {
			return messages[left].ID < messages[right].ID
		}
		return messages[left].Ordinal < messages[right].Ordinal
	})
	return store.maybeSaveQueueOverlayForMessage(workspaceID, message)
}

func (store *Store) LoadMessagePage(workspaceID string, conversationID string, beforeOrdinal int, limit int) (MessagePage, error) {
	if err := validateStoreConversationIDs(workspaceID, conversationID); err != nil {
		return MessagePage{}, err
	}
	if limit <= 0 {
		return MessagePage{}, fmt.Errorf("message page limit must be positive: %d", limit)
	}
	conversation, err := store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return MessagePage{}, err
	}
	selected, start := selectMessages(store.messages[workspaceID][conversationID], beforeOrdinal, limit)
	messages := cloneMessages(selected)

	olderBeforeOrdinal := 0
	hasMoreOlder := start > 0
	if len(messages) > 0 {
		olderBeforeOrdinal = messages[0].Ordinal
	}
	return MessagePage{
		Conversation:       conversation,
		Messages:           messages,
		HasMoreOlder:       hasMoreOlder,
		OlderBeforeOrdinal: olderBeforeOrdinal,
	}, nil
}

func (store *Store) LoadMessages(workspaceID string, conversationID string) ([]ChatMessage, error) {
	if err := validateStoreConversationIDs(workspaceID, conversationID); err != nil {
		return nil, err
	}
	return cloneMessages(store.messages[workspaceID][conversationID]), nil
}

func selectMessages(messages []ChatMessage, beforeOrdinal int, limit int) ([]ChatMessage, int) {
	eligible := make([]ChatMessage, 0, len(messages))
	for _, message := range messages {
		if beforeOrdinal == 0 || message.Ordinal < beforeOrdinal {
			eligible = append(eligible, message)
		}
	}
	start := len(eligible) - limit
	if start < 0 {
		start = 0
	}
	return eligible[start:], start
}

func cloneMessages(messages []ChatMessage) []ChatMessage {
	cloned := make([]ChatMessage, len(messages))
	for index, message := range messages {
		cloned[index] = cloneMessage(message)
	}
	return cloned
}

func (store *Store) NextMessageOrdinal(workspaceID string, conversationID string) (int, error) {
	if err := validateStoreConversationIDs(workspaceID, conversationID); err != nil {
		return 0, err
	}
	messages := store.messages[workspaceID][conversationID]
	if len(messages) == 0 {
		return 1, nil
	}
	return messages[len(messages)-1].Ordinal + 1, nil
}

func (store *Store) MessageCount(workspaceID string, conversationID string) (int, error) {
	if err := validateStoreConversationIDs(workspaceID, conversationID); err != nil {
		return 0, err
	}
	return len(store.messages[workspaceID][conversationID]), nil
}

func (store *Store) MessageCountAllowingCorrupt(workspaceID string, conversationID string) (int, []CorruptStateFinding, error) {
	if err := validateStoreConversationIDs(workspaceID, conversationID); err != nil {
		return 0, nil, err
	}
	return len(store.messages[workspaceID][conversationID]), nil, nil
}

func (store *Store) FindMessageByID(workspaceID string, conversationID string, messageID string) (ChatMessage, bool, error) {
	if err := validateStoreMessageIDs(workspaceID, conversationID, messageID); err != nil {
		return ChatMessage{}, false, err
	}
	for _, message := range store.messages[workspaceID][conversationID] {
		if message.ID == messageID {
			return cloneMessage(message), true, nil
		}
	}
	return ChatMessage{}, false, nil
}

func (store *Store) LoadMessageByID(workspaceID string, conversationID string, messageID string) (ChatMessage, error) {
	if err := validateStoreMessageIDs(workspaceID, conversationID, messageID); err != nil {
		return ChatMessage{}, err
	}
	message, ok, err := store.FindMessageByID(workspaceID, conversationID, messageID)
	if err != nil {
		return ChatMessage{}, err
	}
	if !ok {
		return ChatMessage{}, fmt.Errorf("message %s was not found in conversation %s", messageID, conversationID)
	}
	return message, nil
}

func (store *Store) SaveRun(run Run) error {
	if err := validateRun(run); err != nil {
		return err
	}
	if store.runs[run.WorkspaceID] == nil {
		store.runs[run.WorkspaceID] = map[string]Run{}
	}
	store.runs[run.WorkspaceID][run.ID] = run
	if run.Status != RunStatusQueued {
		return store.removeQueueOverlay(run.WorkspaceID, run.ConversationID, run.ID)
	}
	return store.maybeSaveQueueOverlayForRun(run)
}

func (store *Store) LoadRun(workspaceID string, runID string) (Run, error) {
	if err := validateStoreRunIDs(workspaceID, runID); err != nil {
		return Run{}, err
	}
	path := store.projectionRunPath(workspaceID, runID)
	run, ok := store.runs[workspaceID][runID]
	if !ok {
		return Run{}, &PersistenceError{Operation: "read run", Path: path, Err: os.ErrNotExist}
	}
	if err := validateRun(run); err != nil {
		return Run{}, corruptStateError(path, err)
	}
	if run.WorkspaceID != workspaceID {
		return Run{}, corruptStateErrorf(path, "run %s belongs to workspace %s, not %s", runID, run.WorkspaceID, workspaceID)
	}
	if run.ID != runID {
		return Run{}, corruptStateErrorf(path, "run file id %s does not match requested id %s", run.ID, runID)
	}
	return run, nil
}

func (store *Store) ListRuns(workspaceID string) ([]Run, error) {
	if err := validateStoreWorkspaceID(workspaceID); err != nil {
		return nil, err
	}
	runs, corrupt, err := store.ScanRunsAllowingCorrupt(workspaceID)
	if err != nil {
		return nil, err
	}
	if len(corrupt) > 0 {
		return nil, corruptFindingError(corrupt[0])
	}
	return runs, nil
}

func (store *Store) ScanRunsAllowingCorrupt(workspaceID string) ([]Run, []CorruptStateFinding, error) {
	if err := validateStoreWorkspaceID(workspaceID); err != nil {
		return nil, nil, err
	}
	runs := make([]Run, 0, len(store.runs[workspaceID]))
	for _, run := range store.runs[workspaceID] {
		runs = append(runs, run)
	}
	sort.SliceStable(runs, func(left int, right int) bool {
		if runs[left].StartedAt == runs[right].StartedAt {
			return runs[left].ID < runs[right].ID
		}
		return runs[left].StartedAt > runs[right].StartedAt
	})
	return runs, nil, nil
}

func (store *Store) ScanRunsForConversationAllowingCorrupt(workspaceID string, conversationID string) ([]Run, []CorruptStateFinding, error) {
	if err := validateStoreConversationIDs(workspaceID, conversationID); err != nil {
		return nil, nil, err
	}
	runs := []Run{}
	for _, run := range store.runs[workspaceID] {
		if run.ConversationID == conversationID {
			runs = append(runs, run)
		}
	}
	sort.SliceStable(runs, func(left int, right int) bool {
		if runs[left].StartedAt == runs[right].StartedAt {
			return runs[left].ID < runs[right].ID
		}
		return runs[left].StartedAt > runs[right].StartedAt
	})
	return runs, nil, nil
}

func (store *Store) ActiveRun(workspaceID string, conversationID string) (Run, bool, error) {
	if err := validateStoreConversationIDs(workspaceID, conversationID); err != nil {
		return Run{}, false, err
	}
	runs, err := store.ListRuns(workspaceID)
	if err != nil {
		return Run{}, false, err
	}
	for _, run := range runs {
		if run.ConversationID == conversationID && run.Status == RunStatusRunning {
			return run, true, nil
		}
	}
	return Run{}, false, nil
}

func (store *Store) QueuedState(workspaceID string, conversationID string) (QueueState, error) {
	if err := validateStoreConversationIDs(workspaceID, conversationID); err != nil {
		return QueueState{}, err
	}
	runs, err := store.ListRuns(workspaceID)
	if err != nil {
		return QueueState{}, err
	}
	messages := []ChatMessage{}
	queuedRuns := []Run{}
	for _, run := range runs {
		if run.ConversationID != conversationID || run.Status != RunStatusQueued {
			continue
		}
		message, ok, err := store.FindMessageByID(workspaceID, conversationID, run.TriggerMessageID)
		if err != nil {
			return QueueState{}, err
		}
		if !ok {
			return QueueState{}, corruptStateErrorf(store.projectionRunPath(workspaceID, run.ID), "queued run %s trigger message %s was not found", run.ID, run.TriggerMessageID)
		}
		messages = append(messages, message)
		queuedRuns = append(queuedRuns, run)
	}
	sort.SliceStable(queuedRuns, func(left int, right int) bool {
		leftOrdinal := queuedMessageOrdinal(messages, queuedRuns[left].TriggerMessageID)
		rightOrdinal := queuedMessageOrdinal(messages, queuedRuns[right].TriggerMessageID)
		if leftOrdinal == rightOrdinal {
			return queuedRuns[left].ID < queuedRuns[right].ID
		}
		return leftOrdinal < rightOrdinal
	})
	sort.SliceStable(messages, func(left int, right int) bool {
		if messages[left].Ordinal == messages[right].Ordinal {
			return messages[left].ID < messages[right].ID
		}
		return messages[left].Ordinal < messages[right].Ordinal
	})
	return QueueState{Messages: messages, Runs: queuedRuns}, nil
}

func queuedMessageOrdinal(messages []ChatMessage, messageID string) int {
	for _, message := range messages {
		if message.ID == messageID {
			return message.Ordinal
		}
	}
	return 0
}

func (store *Store) NextQueuedRun(workspaceID string, conversationID string) (Run, ChatMessage, bool, error) {
	if err := validateStoreConversationIDs(workspaceID, conversationID); err != nil {
		return Run{}, ChatMessage{}, false, err
	}
	state, err := store.QueuedState(workspaceID, conversationID)
	if err != nil {
		return Run{}, ChatMessage{}, false, err
	}
	if len(state.Runs) == 0 {
		return Run{}, ChatMessage{}, false, nil
	}
	run := state.Runs[0]
	for _, message := range state.Messages {
		if message.ID == run.TriggerMessageID {
			return run, message, true, nil
		}
	}
	return Run{}, ChatMessage{}, false, fmt.Errorf("queued run %s trigger message %s was not found", run.ID, run.TriggerMessageID)
}

func (store *Store) SaveRunItem(item RunItem) error {
	if err := validateRunItem(item); err != nil {
		return err
	}
	if store.runItems[item.WorkspaceID] == nil {
		store.runItems[item.WorkspaceID] = map[string]map[string]RunItem{}
	}
	if store.runItems[item.WorkspaceID][item.RunID] == nil {
		store.runItems[item.WorkspaceID][item.RunID] = map[string]RunItem{}
	}
	store.runItems[item.WorkspaceID][item.RunID][item.ID] = item
	return store.saveActivityOverlayForRunItem(item)
}

func (store *Store) LoadRunItems(workspaceID string, runID string) ([]RunItem, error) {
	if err := validateStoreRunIDs(workspaceID, runID); err != nil {
		return nil, err
	}
	items := make([]RunItem, 0, len(store.runItems[workspaceID][runID]))
	for _, item := range store.runItems[workspaceID][runID] {
		items = append(items, item)
	}
	sort.SliceStable(items, func(left int, right int) bool {
		if items[left].CreatedAt == items[right].CreatedAt {
			return items[left].ID < items[right].ID
		}
		return items[left].CreatedAt < items[right].CreatedAt
	})
	return items, nil
}

func (store *Store) FindRunItemByProviderID(workspaceID string, runID string, providerItemID string) (RunItem, bool, error) {
	if err := validateStoreRunIDs(workspaceID, runID); err != nil {
		return RunItem{}, false, err
	}
	items, err := store.LoadRunItems(workspaceID, runID)
	if err != nil {
		return RunItem{}, false, err
	}
	for _, item := range items {
		if item.ProviderItemID == providerItemID {
			return item, true, nil
		}
	}
	return RunItem{}, false, nil
}

func (store *Store) SaveTraceEvent(workspaceID string, trace TraceEvent) error {
	if err := validateStoreWorkspaceID(workspaceID); err != nil {
		return err
	}
	if err := validateTraceEvent(trace); err != nil {
		return err
	}
	return nil
}

func (store *Store) SaveDiagnostic(diagnostic Diagnostic) error {
	if err := validateDiagnostic(diagnostic); err != nil {
		return err
	}
	return writeNewJSONFile(store.diagnosticPath(diagnostic.ID), diagnostic)
}

func (store *Store) ListDiagnostics() ([]Diagnostic, error) {
	diagnostics, corrupt, err := store.ListDiagnosticsAllowingCorrupt()
	if err != nil {
		return nil, err
	}
	if len(corrupt) > 0 {
		return nil, corruptFindingError(corrupt[0])
	}
	return diagnostics, nil
}

func (store *Store) ListDiagnosticsAllowingCorrupt() ([]Diagnostic, []CorruptStateFinding, error) {
	dir := store.diagnosticsDir()
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []Diagnostic{}, nil, nil
		}
		return nil, nil, &PersistenceError{Operation: "list diagnostics", Path: dir, Err: err}
	}
	diagnostics := make([]Diagnostic, 0, len(entries))
	corrupt := []CorruptStateFinding{}
	for _, entry := range entries {
		if entry.IsDir() || !isDataJSONFile(entry.Name()) {
			continue
		}
		var diagnostic Diagnostic
		path := filepath.Join(dir, entry.Name())
		if err := readJSONFile(path, &diagnostic); err != nil {
			if IsCorruptStateError(err) {
				corrupt = append(corrupt, corruptStateFinding(err, "", "", "", corruptDiagnosticKind))
				continue
			}
			return nil, nil, err
		}
		if err := validateDiagnostic(diagnostic); err != nil {
			corrupt = append(corrupt, corruptStateFinding(corruptStateError(path, err), diagnostic.WorkspaceID, diagnostic.ConversationID, diagnostic.RunID, corruptDiagnosticKind))
			continue
		}
		diagnostics = append(diagnostics, diagnostic)
	}
	sort.SliceStable(diagnostics, func(left int, right int) bool {
		if diagnostics[left].OccurredAt == diagnostics[right].OccurredAt {
			return diagnostics[left].ID < diagnostics[right].ID
		}
		return diagnostics[left].OccurredAt < diagnostics[right].OccurredAt
	})
	return diagnostics, corrupt, nil
}
