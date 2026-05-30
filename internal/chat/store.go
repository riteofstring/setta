package chat

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"setta/internal/jsonio"
)

const (
	conversationsDirName  = "conversations"
	conversationFileName  = "conversation.json"
	messagesDirName       = "messages"
	runsDirName           = "runs"
	runItemsDirName       = "items"
	runItemFileName       = "item.json"
	runItemOutputsDirName = "outputs"
	tracesDirName         = "traces"
	diagnosticsDirName    = "diagnostics"
)

type Store struct {
	appDataDir string
}

type PersistenceError struct {
	Operation string
	Path      string
	Err       error
}

type messageFile struct {
	ordinal int
	path    string
}

type runItemOutputFile struct {
	ordinal int
	path    string
}

func (err *PersistenceError) Error() string {
	return fmt.Sprintf("%s %s: %v", err.Operation, err.Path, err.Err)
}

func (err *PersistenceError) Unwrap() error {
	return err.Err
}

func IsPersistenceError(err error) bool {
	var persistenceError *PersistenceError
	return errors.As(err, &persistenceError)
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
	if err := readJSONFile(store.conversationPath(workspaceID, conversationID), &conversation); err != nil {
		return Conversation{}, err
	}
	if err := validateConversation(conversation); err != nil {
		return Conversation{}, err
	}
	if conversation.WorkspaceID != workspaceID {
		return Conversation{}, fmt.Errorf("conversation %s belongs to workspace %s, not %s", conversationID, conversation.WorkspaceID, workspaceID)
	}
	if conversation.ID != conversationID {
		return Conversation{}, fmt.Errorf("conversation file id %s does not match requested id %s", conversation.ID, conversationID)
	}
	return conversation, nil
}

func (store *Store) ListConversations(workspaceID string) ([]Conversation, error) {
	dir := store.conversationsDir(workspaceID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []Conversation{}, nil
		}
		return nil, &PersistenceError{Operation: "list conversations", Path: dir, Err: err}
	}

	conversations := make([]Conversation, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		conversation, err := store.LoadConversation(workspaceID, entry.Name())
		if err != nil {
			return nil, err
		}
		conversations = append(conversations, conversation)
	}
	sort.SliceStable(conversations, func(left int, right int) bool {
		if conversations[left].UpdatedAt == conversations[right].UpdatedAt {
			return conversations[left].ID < conversations[right].ID
		}
		return conversations[left].UpdatedAt > conversations[right].UpdatedAt
	})
	return conversations, nil
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
			return nil, err
		}
		if message.ConversationID != conversationID {
			return nil, fmt.Errorf("message %s belongs to conversation %s, not %s", message.ID, message.ConversationID, conversationID)
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
			return ChatMessage{}, false, err
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
	if err := readJSONFile(store.runPath(workspaceID, runID), &run); err != nil {
		return Run{}, err
	}
	if err := validateRun(run); err != nil {
		return Run{}, err
	}
	if run.WorkspaceID != workspaceID {
		return Run{}, fmt.Errorf("run %s belongs to workspace %s, not %s", runID, run.WorkspaceID, workspaceID)
	}
	if run.ID != runID {
		return Run{}, fmt.Errorf("run file id %s does not match requested id %s", run.ID, runID)
	}
	return run, nil
}

func (store *Store) ListRuns(workspaceID string) ([]Run, error) {
	dir := store.runsDir(workspaceID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []Run{}, nil
		}
		return nil, &PersistenceError{Operation: "list runs", Path: dir, Err: err}
	}

	runs := make([]Run, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !isDataJSONFile(entry.Name()) {
			continue
		}
		runID := strings.TrimSuffix(entry.Name(), ".json")
		run, err := store.LoadRun(workspaceID, runID)
		if err != nil {
			return nil, err
		}
		runs = append(runs, run)
	}
	sort.SliceStable(runs, func(left int, right int) bool {
		if runs[left].StartedAt == runs[right].StartedAt {
			return runs[left].ID < runs[right].ID
		}
		return runs[left].StartedAt > runs[right].StartedAt
	})
	return runs, nil
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
			return QueueState{}, fmt.Errorf("queued run %s trigger message %s was not found", run.ID, run.TriggerMessageID)
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
			return nil, err
		}
		if item.WorkspaceID != workspaceID || item.RunID != runID {
			return nil, fmt.Errorf("run item %s belongs to workspace %s run %s, not workspace %s run %s", item.ID, item.WorkspaceID, item.RunID, workspaceID, runID)
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
	outputs := make([]RunItemOutput, 0, len(files))
	for _, file := range files {
		var output RunItemOutput
		if err := readJSONFile(file.path, &output); err != nil {
			return nil, err
		}
		if err := validateRunItemOutput(output); err != nil {
			return nil, err
		}
		if output.RunItemID != runItemID {
			return nil, fmt.Errorf("run item output %s belongs to run item %s, not %s", output.ID, output.RunItemID, runItemID)
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
	outputs, err := store.LoadRunItemOutputsForItem(workspaceID, runID, runItemID)
	if err != nil {
		return RunItemOutputPage{}, err
	}
	outputs = outputsAfterOrdinal(outputs, afterOrdinal)
	if limit > 0 && len(outputs) > limit {
		page := outputs[:limit]
		return RunItemOutputPage{RunID: runID, RunItemID: runItemID, Output: page, HasMore: true, NextOrdinal: page[len(page)-1].Ordinal}, nil
	}
	return RunItemOutputPage{RunID: runID, RunItemID: runItemID, Output: outputs}, nil
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
	dir := store.diagnosticsDir()
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []Diagnostic{}, nil
		}
		return nil, &PersistenceError{Operation: "list diagnostics", Path: dir, Err: err}
	}
	diagnostics := make([]Diagnostic, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !isDataJSONFile(entry.Name()) {
			continue
		}
		var diagnostic Diagnostic
		path := filepath.Join(dir, entry.Name())
		if err := readJSONFile(path, &diagnostic); err != nil {
			return nil, err
		}
		if err := validateDiagnostic(diagnostic); err != nil {
			return nil, err
		}
		diagnostics = append(diagnostics, diagnostic)
	}
	sort.SliceStable(diagnostics, func(left int, right int) bool {
		if diagnostics[left].OccurredAt == diagnostics[right].OccurredAt {
			return diagnostics[left].ID < diagnostics[right].ID
		}
		return diagnostics[left].OccurredAt < diagnostics[right].OccurredAt
	})
	return diagnostics, nil
}

func (store *Store) conversationPath(workspaceID string, conversationID string) string {
	return filepath.Join(store.conversationDir(workspaceID, conversationID), conversationFileName)
}

func (store *Store) conversationsDir(workspaceID string) string {
	return filepath.Join(store.appDataDir, "workspaces", workspaceID, conversationsDirName)
}

func (store *Store) conversationDir(workspaceID string, conversationID string) string {
	return filepath.Join(store.conversationsDir(workspaceID), conversationID)
}

func (store *Store) messagesDir(workspaceID string, conversationID string) string {
	return filepath.Join(store.conversationDir(workspaceID, conversationID), messagesDirName)
}

func (store *Store) messagePath(workspaceID string, conversationID string, ordinal int, messageID string) string {
	return filepath.Join(store.messagesDir(workspaceID, conversationID), messageFileName(ordinal, messageID))
}

func (store *Store) runsDir(workspaceID string) string {
	return filepath.Join(store.appDataDir, "workspaces", workspaceID, runsDirName)
}

func (store *Store) runPath(workspaceID string, runID string) string {
	return filepath.Join(store.runsDir(workspaceID), runID+".json")
}

func (store *Store) tracePath(workspaceID string, runID string, traceID string) string {
	return filepath.Join(store.runsDir(workspaceID), runID, tracesDirName, traceID+".json")
}

func (store *Store) diagnosticsDir() string {
	return filepath.Join(store.appDataDir, diagnosticsDirName)
}

func (store *Store) diagnosticPath(diagnosticID string) string {
	return filepath.Join(store.diagnosticsDir(), diagnosticID+".json")
}

func (store *Store) runItemsDir(workspaceID string, runID string) string {
	return filepath.Join(store.runsDir(workspaceID), runID, runItemsDirName)
}

func (store *Store) runItemDir(workspaceID string, runID string, runItemID string) string {
	return filepath.Join(store.runItemsDir(workspaceID, runID), runItemID)
}

func (store *Store) runItemPath(workspaceID string, runID string, runItemID string) string {
	return filepath.Join(store.runItemDir(workspaceID, runID, runItemID), runItemFileName)
}

func (store *Store) runItemOutputsDir(workspaceID string, runID string, runItemID string) string {
	return filepath.Join(store.runItemDir(workspaceID, runID, runItemID), runItemOutputsDirName)
}

func (store *Store) runItemOutputPath(workspaceID string, runID string, runItemID string, ordinal int, outputID string) string {
	return filepath.Join(store.runItemOutputsDir(workspaceID, runID, runItemID), messageFileName(ordinal, outputID))
}

func (store *Store) messageFiles(workspaceID string, conversationID string) ([]messageFile, error) {
	dir := store.messagesDir(workspaceID, conversationID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []messageFile{}, nil
		}
		return nil, &PersistenceError{Operation: "list messages", Path: dir, Err: err}
	}
	files := make([]messageFile, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !isDataJSONFile(entry.Name()) {
			continue
		}
		ordinal, ok := ordinalFromMessageFileName(entry.Name())
		if !ok {
			return nil, fmt.Errorf("malformed message filename %s", filepath.Join(dir, entry.Name()))
		}
		files = append(files, messageFile{
			ordinal: ordinal,
			path:    filepath.Join(dir, entry.Name()),
		})
	}
	sort.SliceStable(files, func(left int, right int) bool {
		return files[left].ordinal < files[right].ordinal
	})
	return files, nil
}

func messageFileName(ordinal int, messageID string) string {
	return fmt.Sprintf("%012d_%s.json", ordinal, messageID)
}

func (store *Store) runItemOutputFiles(workspaceID string, runID string, runItemID string) ([]runItemOutputFile, error) {
	dir := store.runItemOutputsDir(workspaceID, runID, runItemID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []runItemOutputFile{}, nil
		}
		return nil, &PersistenceError{Operation: "list run item outputs", Path: dir, Err: err}
	}
	files := make([]runItemOutputFile, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !isDataJSONFile(entry.Name()) {
			continue
		}
		ordinal, ok := ordinalFromMessageFileName(entry.Name())
		if !ok {
			return nil, fmt.Errorf("malformed run item output filename %s", filepath.Join(dir, entry.Name()))
		}
		files = append(files, runItemOutputFile{
			ordinal: ordinal,
			path:    filepath.Join(dir, entry.Name()),
		})
	}
	sort.SliceStable(files, func(left int, right int) bool {
		return files[left].ordinal < files[right].ordinal
	})
	return files, nil
}

func isDataJSONFile(name string) bool {
	return filepath.Ext(name) == ".json" && !strings.HasPrefix(name, ".")
}

func ordinalFromMessageFileName(name string) (int, bool) {
	prefix, _, ok := strings.Cut(name, "_")
	if !ok {
		return 0, false
	}
	ordinal, err := strconv.Atoi(prefix)
	if err != nil || ordinal <= 0 {
		return 0, false
	}
	return ordinal, true
}

func writeJSONFile(path string, payload any) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return &PersistenceError{Operation: "create directory", Path: dir, Err: err}
	}

	file, err := os.CreateTemp(dir, ".tmp-*.json")
	if err != nil {
		return &PersistenceError{Operation: "create temp file", Path: dir, Err: err}
	}
	tempPath := file.Name()
	removeTemp := true
	defer func() {
		if removeTemp {
			_ = os.Remove(tempPath)
		}
	}()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(payload); err != nil {
		_ = file.Close()
		return &PersistenceError{Operation: "write temp file", Path: tempPath, Err: err}
	}
	if err := file.Close(); err != nil {
		return &PersistenceError{Operation: "close temp file", Path: tempPath, Err: err}
	}
	if err := os.Rename(tempPath, path); err != nil {
		return &PersistenceError{Operation: "replace file", Path: path, Err: err}
	}
	removeTemp = false
	return nil
}

func writeNewJSONFile(path string, payload any) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return &PersistenceError{Operation: "create directory", Path: dir, Err: err}
	}

	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return &PersistenceError{Operation: "create file", Path: path, Err: err}
	}
	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(payload); err != nil {
		_ = file.Close()
		return &PersistenceError{Operation: "write file", Path: path, Err: err}
	}
	if err := file.Close(); err != nil {
		return &PersistenceError{Operation: "close file", Path: path, Err: err}
	}
	return nil
}

func readJSONFile(path string, target any) error {
	file, err := os.Open(path)
	if err != nil {
		return &PersistenceError{Operation: "read file", Path: path, Err: err}
	}
	defer file.Close()

	if err := jsonio.DecodeSingle(file, target); err != nil {
		return fmt.Errorf("malformed chat state %s: %w", path, err)
	}
	return nil
}
