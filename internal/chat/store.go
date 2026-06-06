package chat

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const (
	conversationsDirName     = "conversations"
	conversationFileName     = "conversation.json"
	conversationReadFileName = "read-state.json"
	goalFileName             = "goal.json"
	messagesDirName          = "messages"
	runsDirName              = "runs"
	runItemsDirName          = "items"
	runItemFileName          = "item.json"
	runItemOutputsDirName    = "outputs"
	tracesDirName            = "traces"
	diagnosticsDirName       = "diagnostics"
)

type Store struct {
	appDataDir string
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

type messageFile struct {
	ordinal int
	path    string
}

type runItemOutputFile struct {
	ordinal int
	path    string
}

type runOwner struct {
	ID             string `json:"id"`
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
}

type ConversationReadState struct {
	SchemaVersion            int    `json:"schemaVersion"`
	ConversationID           string `json:"conversationId"`
	ReadMarker               int    `json:"readMarker"`
	LatestReadRelevantMarker int    `json:"latestReadRelevantMarker"`
	UpdatedAt                string `json:"updatedAt"`
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
	return &Store{appDataDir: filepath.Clean(appDataDir)}, nil
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
	return writeJSONFile(store.conversationPath(conversation.WorkspaceID, conversation.ID), conversation)
}

func (store *Store) LoadConversation(workspaceID string, conversationID string) (Conversation, error) {
	var conversation Conversation
	path := store.conversationPath(workspaceID, conversationID)
	if err := readJSONFile(path, &conversation); err != nil {
		return Conversation{}, err
	}
	if err := validateConversation(conversation); err != nil {
		return Conversation{}, corruptStateError(path, err)
	}
	if conversation.WorkspaceID != workspaceID {
		return Conversation{}, corruptStateErrorf(path, "conversation %s belongs to workspace %s, not %s", conversationID, conversation.WorkspaceID, workspaceID)
	}
	if conversation.ID != conversationID {
		return Conversation{}, corruptStateErrorf(path, "conversation file id %s does not match requested id %s", conversation.ID, conversationID)
	}
	return conversation, nil
}

func (store *Store) LoadConversationReadState(workspaceID string, conversationID string) (ConversationReadState, error) {
	path := store.conversationReadPath(workspaceID, conversationID)
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return emptyConversationReadState(conversationID), nil
		}
		return ConversationReadState{}, &PersistenceError{Operation: "stat conversation read state", Path: path, Err: err}
	}
	var state ConversationReadState
	if err := readJSONFile(path, &state); err != nil {
		return ConversationReadState{}, err
	}
	if err := validateConversationReadState(state, conversationID); err != nil {
		return ConversationReadState{}, corruptStateError(path, err)
	}
	return state, nil
}

func (store *Store) SaveConversationReadState(workspaceID string, state ConversationReadState) error {
	if err := validateConversationReadState(state, state.ConversationID); err != nil {
		return err
	}
	return writeJSONFile(store.conversationReadPath(workspaceID, state.ConversationID), state)
}

func (store *Store) SaveGoal(workspaceID string, conversationID string, goal ChatGoalState) error {
	if err := validateChatGoalState(goal); err != nil {
		return err
	}
	return writeJSONFile(store.goalPath(workspaceID, conversationID), goal)
}

func (store *Store) LoadGoal(workspaceID string, conversationID string) (*ChatGoalState, error) {
	path := store.goalPath(workspaceID, conversationID)
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, &PersistenceError{Operation: "stat goal", Path: path, Err: err}
	}
	var goal ChatGoalState
	if err := readJSONFile(path, &goal); err != nil {
		return nil, err
	}
	if err := validateChatGoalState(goal); err != nil {
		return nil, corruptStateError(path, err)
	}
	return &goal, nil
}

func (store *Store) ClearGoal(workspaceID string, conversationID string) error {
	path := store.goalPath(workspaceID, conversationID)
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return &PersistenceError{Operation: "remove goal", Path: path, Err: err}
	}
	return nil
}

func (store *Store) ListConversations(workspaceID string) ([]Conversation, error) {
	conversations, corrupt, err := store.ScanConversationsAllowingCorrupt(workspaceID)
	if err != nil {
		return nil, err
	}
	if len(corrupt) > 0 {
		return nil, corruptFindingError(corrupt[0])
	}
	return conversations, nil
}

func (store *Store) ScanConversationsAllowingCorrupt(workspaceID string) ([]Conversation, []CorruptStateFinding, error) {
	dir := store.conversationsDir(workspaceID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []Conversation{}, nil, nil
		}
		return nil, nil, &PersistenceError{Operation: "list conversations", Path: dir, Err: err}
	}

	conversations := make([]Conversation, 0, len(entries))
	corrupt := []CorruptStateFinding{}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		conversation, err := store.LoadConversation(workspaceID, entry.Name())
		if err != nil {
			if IsCorruptStateError(err) {
				corrupt = append(corrupt, corruptStateFinding(err, workspaceID, entry.Name(), "", corruptConversationKind))
				continue
			}
			return nil, nil, err
		}
		conversations = append(conversations, conversation)
	}
	sort.SliceStable(conversations, func(left int, right int) bool {
		if conversations[left].UpdatedAt == conversations[right].UpdatedAt {
			return conversations[left].ID < conversations[right].ID
		}
		return conversations[left].UpdatedAt > conversations[right].UpdatedAt
	})
	return conversations, corrupt, nil
}

func (store *Store) SaveMessage(workspaceID string, message ChatMessage) error {
	if err := validateMessage(message); err != nil {
		return err
	}
	return writeJSONFile(store.messagePath(workspaceID, message.ConversationID, message.Ordinal, message.ID), message)
}

func (store *Store) LoadMessagePage(workspaceID string, conversationID string, beforeOrdinal int, limit int) (MessagePage, error) {
	if limit <= 0 {
		return MessagePage{}, fmt.Errorf("message page limit must be positive: %d", limit)
	}
	conversation, err := store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return MessagePage{}, err
	}
	files, err := store.messageFiles(workspaceID, conversationID)
	if err != nil {
		return MessagePage{}, err
	}
	selected, start := selectMessageFiles(files, beforeOrdinal, limit)
	messages, err := readMessages(selected, conversationID)
	if err != nil {
		return MessagePage{}, err
	}

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
	files, err := store.messageFiles(workspaceID, conversationID)
	if err != nil {
		return nil, err
	}
	return readMessages(files, conversationID)
}

func selectMessageFiles(files []messageFile, beforeOrdinal int, limit int) ([]messageFile, int) {
	eligible := make([]messageFile, 0, len(files))
	for _, file := range files {
		if beforeOrdinal == 0 || file.ordinal < beforeOrdinal {
			eligible = append(eligible, file)
		}
	}
	start := len(eligible) - limit
	if start < 0 {
		start = 0
	}
	return eligible[start:], start
}

func readMessages(files []messageFile, conversationID string) ([]ChatMessage, error) {
	messages := make([]ChatMessage, 0, len(files))
	for _, file := range files {
		var message ChatMessage
		if err := readJSONFile(file.path, &message); err != nil {
			return nil, err
		}
		if err := validateMessage(message); err != nil {
			return nil, corruptStateError(file.path, err)
		}
		if message.ConversationID != conversationID {
			return nil, corruptStateErrorf(file.path, "message %s belongs to conversation %s, not %s", message.ID, message.ConversationID, conversationID)
		}
		messages = append(messages, message)
	}
	return messages, nil
}

func (store *Store) NextMessageOrdinal(workspaceID string, conversationID string) (int, error) {
	files, err := store.messageFiles(workspaceID, conversationID)
	if err != nil {
		return 0, err
	}
	if len(files) == 0 {
		return 1, nil
	}
	return files[len(files)-1].ordinal + 1, nil
}

func (store *Store) MessageCount(workspaceID string, conversationID string) (int, error) {
	files, err := store.messageFiles(workspaceID, conversationID)
	if err != nil {
		return 0, err
	}
	return len(files), nil
}

func (store *Store) MessageCountAllowingCorrupt(workspaceID string, conversationID string) (int, []CorruptStateFinding, error) {
	files, corrupt, err := store.messageFilesAllowingCorrupt(workspaceID, conversationID)
	if err != nil {
		return 0, nil, err
	}
	return len(files), corrupt, nil
}

func (store *Store) FindMessageByID(workspaceID string, conversationID string, messageID string) (ChatMessage, bool, error) {
	files, err := store.messageFiles(workspaceID, conversationID)
	if err != nil {
		return ChatMessage{}, false, err
	}
	for _, file := range files {
		var message ChatMessage
		if err := readJSONFile(file.path, &message); err != nil {
			return ChatMessage{}, false, err
		}
		if err := validateMessage(message); err != nil {
			return ChatMessage{}, false, corruptStateError(file.path, err)
		}
		if message.ID == messageID {
			return message, true, nil
		}
	}
	return ChatMessage{}, false, nil
}

func (store *Store) LoadMessageByID(workspaceID string, conversationID string, messageID string) (ChatMessage, error) {
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
	return writeJSONFile(store.runPath(run.WorkspaceID, run.ID), run)
}

func (store *Store) LoadRun(workspaceID string, runID string) (Run, error) {
	var run Run
	path := store.runPath(workspaceID, runID)
	if err := readJSONFile(path, &run); err != nil {
		return Run{}, err
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
	dir := store.runsDir(workspaceID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []Run{}, nil, nil
		}
		return nil, nil, &PersistenceError{Operation: "list runs", Path: dir, Err: err}
	}

	runs := make([]Run, 0, len(entries))
	corrupt := []CorruptStateFinding{}
	for _, entry := range entries {
		if entry.IsDir() || !isDataJSONFile(entry.Name()) {
			continue
		}
		runID := strings.TrimSuffix(entry.Name(), ".json")
		owner, err := store.loadRunOwner(workspaceID, runID)
		if err != nil {
			if IsCorruptStateError(err) {
				corrupt = append(corrupt, corruptStateFinding(err, workspaceID, "", runID, corruptRunKind))
				continue
			}
			return nil, nil, err
		}
		run, err := store.LoadRun(workspaceID, runID)
		if err != nil {
			if IsCorruptStateError(err) {
				corrupt = append(corrupt, corruptStateFinding(err, workspaceID, owner.ConversationID, runID, corruptRunKind))
				continue
			}
			return nil, nil, err
		}
		runs = append(runs, run)
	}
	sort.SliceStable(runs, func(left int, right int) bool {
		if runs[left].StartedAt == runs[right].StartedAt {
			return runs[left].ID < runs[right].ID
		}
		return runs[left].StartedAt > runs[right].StartedAt
	})
	return runs, corrupt, nil
}

func (store *Store) ScanRunsForConversationAllowingCorrupt(workspaceID string, conversationID string) ([]Run, []CorruptStateFinding, error) {
	dir := store.runsDir(workspaceID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []Run{}, nil, nil
		}
		return nil, nil, &PersistenceError{Operation: "list runs", Path: dir, Err: err}
	}

	runs := make([]Run, 0, len(entries))
	corrupt := []CorruptStateFinding{}
	for _, entry := range entries {
		run, finding, belongs, err := store.scanRunForConversation(workspaceID, conversationID, entry)
		if err != nil {
			return nil, nil, err
		}
		if finding != nil {
			corrupt = append(corrupt, *finding)
			continue
		}
		if belongs {
			runs = append(runs, run)
		}
	}
	sort.SliceStable(runs, func(left int, right int) bool {
		if runs[left].StartedAt == runs[right].StartedAt {
			return runs[left].ID < runs[right].ID
		}
		return runs[left].StartedAt > runs[right].StartedAt
	})
	return runs, corrupt, nil
}

func (store *Store) scanRunForConversation(workspaceID string, conversationID string, entry os.DirEntry) (Run, *CorruptStateFinding, bool, error) {
	if entry.IsDir() || !isDataJSONFile(entry.Name()) {
		return Run{}, nil, false, nil
	}
	runID := strings.TrimSuffix(entry.Name(), ".json")
	owner, err := store.loadRunOwner(workspaceID, runID)
	if err != nil {
		if IsCorruptStateError(err) {
			finding := corruptStateFinding(err, workspaceID, "", runID, corruptRunKind)
			return Run{}, &finding, false, nil
		}
		return Run{}, nil, false, err
	}
	if owner.ConversationID != conversationID {
		return Run{}, nil, false, nil
	}
	run, err := store.LoadRun(workspaceID, runID)
	if err != nil {
		if IsCorruptStateError(err) {
			finding := corruptStateFinding(err, workspaceID, conversationID, runID, corruptRunKind)
			return Run{}, &finding, true, nil
		}
		return Run{}, nil, true, err
	}
	return run, nil, true, nil
}

func (store *Store) ActiveRun(workspaceID string, conversationID string) (Run, bool, error) {
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

func (store *Store) loadRunOwner(workspaceID string, runID string) (runOwner, error) {
	var owner runOwner
	path := store.runPath(workspaceID, runID)
	if err := readJSONMetadataFile(path, &owner); err != nil {
		return runOwner{}, err
	}
	if owner.ID == "" {
		return runOwner{}, corruptStateErrorf(path, "run id is required")
	}
	if owner.ID != runID {
		return runOwner{}, corruptStateErrorf(path, "run file id %s does not match requested id %s", owner.ID, runID)
	}
	if owner.WorkspaceID == "" {
		return runOwner{}, corruptStateErrorf(path, "run %s workspaceId is required", runID)
	}
	if owner.WorkspaceID != workspaceID {
		return runOwner{}, corruptStateErrorf(path, "run %s belongs to workspace %s, not %s", runID, owner.WorkspaceID, workspaceID)
	}
	if owner.ConversationID == "" {
		return runOwner{}, corruptStateErrorf(path, "run %s conversationId is required", runID)
	}
	return owner, nil
}

func (store *Store) QueuedState(workspaceID string, conversationID string) (QueueState, error) {
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
			return QueueState{}, corruptStateErrorf(store.runPath(workspaceID, run.ID), "queued run %s trigger message %s was not found", run.ID, run.TriggerMessageID)
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
	return writeJSONFile(store.runItemPath(item.WorkspaceID, item.RunID, item.ID), item)
}

func (store *Store) LoadRunItems(workspaceID string, runID string) ([]RunItem, error) {
	dir := store.runItemsDir(workspaceID, runID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []RunItem{}, nil
		}
		return nil, &PersistenceError{Operation: "list run items", Path: dir, Err: err}
	}
	items := make([]RunItem, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		var item RunItem
		path := store.runItemPath(workspaceID, runID, entry.Name())
		if err := readJSONFile(path, &item); err != nil {
			return nil, err
		}
		if err := validateRunItem(item); err != nil {
			return nil, corruptStateError(path, err)
		}
		if item.WorkspaceID != workspaceID || item.RunID != runID {
			return nil, corruptStateErrorf(path, "run item %s belongs to workspace %s run %s, not workspace %s run %s", item.ID, item.WorkspaceID, item.RunID, workspaceID, runID)
		}
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

func (store *Store) SaveRunItemOutput(workspaceID string, runID string, output RunItemOutput) error {
	if err := validateRunItemOutput(output); err != nil {
		return err
	}
	return writeJSONFile(store.runItemOutputPath(workspaceID, runID, output.RunItemID, output.Ordinal, output.ID), output)
}

func (store *Store) LoadRunItemOutputs(workspaceID string, runID string) ([]RunItemOutput, error) {
	items, err := store.LoadRunItems(workspaceID, runID)
	if err != nil {
		return nil, err
	}
	outputs := []RunItemOutput{}
	for _, item := range items {
		itemOutputs, err := store.LoadRunItemOutputsForItem(workspaceID, runID, item.ID)
		if err != nil {
			return nil, err
		}
		outputs = append(outputs, itemOutputs...)
	}
	return outputs, nil
}

func (store *Store) LoadRunItemOutputsForItem(workspaceID string, runID string, runItemID string) ([]RunItemOutput, error) {
	files, err := store.runItemOutputFiles(workspaceID, runID, runItemID)
	if err != nil {
		return nil, err
	}
	return readRunItemOutputs(files, runItemID)
}

func readRunItemOutputs(files []runItemOutputFile, runItemID string) ([]RunItemOutput, error) {
	outputs := make([]RunItemOutput, 0, len(files))
	for _, file := range files {
		var output RunItemOutput
		if err := readJSONFile(file.path, &output); err != nil {
			return nil, err
		}
		if err := validateRunItemOutput(output); err != nil {
			return nil, corruptStateError(file.path, err)
		}
		if output.RunItemID != runItemID {
			return nil, corruptStateErrorf(file.path, "run item output %s belongs to run item %s, not %s", output.ID, output.RunItemID, runItemID)
		}
		outputs = append(outputs, output)
	}
	return outputs, nil
}

func (store *Store) LoadRunItemOutputPage(workspaceID string, runID string, runItemID string, afterOrdinal int, limit int) (RunItemOutputPage, error) {
	if afterOrdinal < 0 {
		return RunItemOutputPage{}, fmt.Errorf("run item output afterOrdinal must not be negative: %d", afterOrdinal)
	}
	if limit < 0 {
		return RunItemOutputPage{}, fmt.Errorf("run item output page limit must not be negative: %d", limit)
	}
	if _, err := store.LoadRun(workspaceID, runID); err != nil {
		return RunItemOutputPage{}, err
	}
	if err := store.validateRunItemBelongsToRun(workspaceID, runID, runItemID); err != nil {
		return RunItemOutputPage{}, err
	}
	files, err := store.runItemOutputFiles(workspaceID, runID, runItemID)
	if err != nil {
		return RunItemOutputPage{}, err
	}
	files = outputFilesAfterOrdinal(files, afterOrdinal)
	hasMore := false
	nextOrdinal := 0
	if limit > 0 && len(files) > limit {
		files = files[:limit]
		hasMore = true
		nextOrdinal = files[len(files)-1].ordinal
	}
	outputs, err := readRunItemOutputs(files, runItemID)
	if err != nil {
		return RunItemOutputPage{}, err
	}
	return RunItemOutputPage{RunID: runID, RunItemID: runItemID, Output: outputs, HasMore: hasMore, NextOrdinal: nextOrdinal}, nil
}

func outputFilesAfterOrdinal(files []runItemOutputFile, afterOrdinal int) []runItemOutputFile {
	if afterOrdinal <= 0 {
		return files
	}
	filtered := files[:0]
	for _, file := range files {
		if file.ordinal > afterOrdinal {
			filtered = append(filtered, file)
		}
	}
	return filtered
}

func (store *Store) validateRunItemBelongsToRun(workspaceID string, runID string, runItemID string) error {
	items, err := store.LoadRunItems(workspaceID, runID)
	if err != nil {
		return err
	}
	for _, item := range items {
		if item.ID == runItemID {
			return nil
		}
	}
	return fmt.Errorf("run item %s was not found in run %s", runItemID, runID)
}

func (store *Store) NextRunItemOutputOrdinal(workspaceID string, runID string, runItemID string) (int, error) {
	files, err := store.runItemOutputFiles(workspaceID, runID, runItemID)
	if err != nil {
		return 0, err
	}
	if len(files) == 0 {
		return 1, nil
	}
	return files[len(files)-1].ordinal + 1, nil
}

func (store *Store) SaveTraceEvent(workspaceID string, trace TraceEvent) error {
	if err := validateTraceEvent(trace); err != nil {
		return err
	}
	return writeJSONFile(store.tracePath(workspaceID, trace.RunID, trace.ID), trace)
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
