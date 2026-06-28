package chat

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"setta/internal/jsonio"
)

func (store *Store) conversationPath(workspaceID string, conversationID string) string {
	return filepath.Join(store.conversationDir(workspaceID, conversationID), conversationFileName)
}

func (store *Store) conversationReadPath(workspaceID string, conversationID string) string {
	return filepath.Join(store.conversationDir(workspaceID, conversationID), conversationReadFileName)
}

func (store *Store) goalPath(workspaceID string, conversationID string) string {
	return filepath.Join(store.conversationDir(workspaceID, conversationID), goalFileName)
}

func (store *Store) workspaceDir(workspaceID string) string {
	return filepath.Join(store.appDataDir, "workspaces", workspaceID)
}

func (store *Store) conversationPinsPath(workspaceID string) string {
	return filepath.Join(store.workspaceDir(workspaceID), conversationPinsFileName)
}

func (store *Store) conversationsDir(workspaceID string) string {
	return filepath.Join(store.workspaceDir(workspaceID), conversationsDirName)
}

func (store *Store) conversationDir(workspaceID string, conversationID string) string {
	return filepath.Join(store.conversationsDir(workspaceID), conversationID)
}

func (store *Store) writeInitialConversation(conversation Conversation) error {
	parentDir := store.conversationsDir(conversation.WorkspaceID)
	if err := os.MkdirAll(parentDir, 0o755); err != nil {
		return &PersistenceError{Operation: "create directory", Path: parentDir, Err: err}
	}
	finalDir := store.conversationDir(conversation.WorkspaceID, conversation.ID)
	if _, err := os.Stat(finalDir); err == nil {
		return &PersistenceError{Operation: "create conversation directory", Path: finalDir, Err: os.ErrExist}
	} else if !errors.Is(err, os.ErrNotExist) {
		return &PersistenceError{Operation: "stat conversation", Path: finalDir, Err: err}
	}
	tempDir, err := os.MkdirTemp(parentDir, ".tmp-conversation-*")
	if err != nil {
		return &PersistenceError{Operation: "create temp conversation directory", Path: parentDir, Err: err}
	}
	removeTemp := true
	defer func() {
		if removeTemp {
			_ = os.RemoveAll(tempDir)
		}
	}()
	if err := writeJSONFile(filepath.Join(tempDir, conversationFileName), conversation); err != nil {
		return err
	}
	if err := os.Rename(tempDir, finalDir); err != nil {
		return &PersistenceError{Operation: "publish conversation directory", Path: finalDir, Err: err}
	}
	removeTemp = false
	return nil
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

func (store *Store) runDataDir(workspaceID string, runID string) string {
	return filepath.Join(store.runsDir(workspaceID), runID)
}

func (store *Store) tracePath(workspaceID string, runID string, traceID string) string {
	return filepath.Join(store.runDataDir(workspaceID, runID), tracesDirName, traceID+".json")
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

func (store *Store) backgroundTerminalsDir(workspaceID string, conversationID string) string {
	return filepath.Join(store.conversationDir(workspaceID, conversationID), backgroundTerminalsDirName)
}

func (store *Store) backgroundTerminalPath(workspaceID string, conversationID string, processID string) string {
	return filepath.Join(store.backgroundTerminalsDir(workspaceID, conversationID), processID+".json")
}

func (store *Store) backgroundTerminalOutputRootDir(workspaceID string, conversationID string) string {
	return filepath.Join(store.conversationDir(workspaceID, conversationID), backgroundTerminalOutputDirName)
}

func (store *Store) backgroundTerminalOutputDir(workspaceID string, conversationID string, processID string) string {
	return filepath.Join(store.backgroundTerminalOutputRootDir(workspaceID, conversationID), processID)
}

func (store *Store) backgroundTerminalOutputPath(workspaceID string, conversationID string, processID string, ordinal int, outputID string) string {
	return filepath.Join(store.backgroundTerminalOutputDir(workspaceID, conversationID, processID), messageFileName(ordinal, outputID))
}

func (store *Store) transcriptBlocksDir(workspaceID string, runID string) string {
	return filepath.Join(store.runDataDir(workspaceID, runID), transcriptBlocksDirName)
}

func (store *Store) transcriptBlockPath(workspaceID string, runID string, ordinal int, blockID string) string {
	return filepath.Join(store.transcriptBlocksDir(workspaceID, runID), messageFileName(ordinal, blockID))
}

func (store *Store) messageFiles(workspaceID string, conversationID string) ([]messageFile, error) {
	if err := validateStoreConversationIDs(workspaceID, conversationID); err != nil {
		return nil, err
	}
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
			return nil, corruptStateErrorf(filepath.Join(dir, entry.Name()), "malformed message filename")
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

func (store *Store) messageFilesAllowingCorrupt(workspaceID string, conversationID string) ([]messageFile, []CorruptStateFinding, error) {
	if err := validateStoreConversationIDs(workspaceID, conversationID); err != nil {
		return nil, nil, err
	}
	dir := store.messagesDir(workspaceID, conversationID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []messageFile{}, nil, nil
		}
		return nil, nil, &PersistenceError{Operation: "list messages", Path: dir, Err: err}
	}
	files := make([]messageFile, 0, len(entries))
	corrupt := []CorruptStateFinding{}
	for _, entry := range entries {
		if entry.IsDir() || !isDataJSONFile(entry.Name()) {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		ordinal, ok := ordinalFromMessageFileName(entry.Name())
		if !ok {
			corrupt = append(corrupt, corruptStateFinding(corruptStateErrorf(path, "malformed message filename"), workspaceID, conversationID, "", corruptMessageKind))
			continue
		}
		files = append(files, messageFile{
			ordinal: ordinal,
			path:    path,
		})
	}
	sort.SliceStable(files, func(left int, right int) bool {
		return files[left].ordinal < files[right].ordinal
	})
	return files, corrupt, nil
}

func messageFileName(ordinal int, messageID string) string {
	return fmt.Sprintf("%012d_%s.json", ordinal, messageID)
}

// messageOrdinalsByID maps each message ID to its conversation ordinal from the
// message file listing without reading file contents. It anchors each run in
// conversation order (a run's trigger message ordinal) for block-aware transcript
// paging, cheaply enough to call on every page load.
func (store *Store) messageOrdinalsByID(workspaceID string, conversationID string) (map[string]int, error) {
	files, err := store.messageFiles(workspaceID, conversationID)
	if err != nil {
		return nil, err
	}
	ordinals := make(map[string]int, len(files))
	for _, file := range files {
		id, ok := idFromMessageFileName(filepath.Base(file.path))
		if !ok {
			return nil, corruptStateErrorf(file.path, "malformed message filename")
		}
		ordinals[id] = file.ordinal
	}
	return ordinals, nil
}

func (store *Store) runItemOutputFiles(workspaceID string, runID string, runItemID string) ([]runItemOutputFile, error) {
	if err := validateStoreRunItemIDs(workspaceID, runID, runItemID); err != nil {
		return nil, err
	}
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
			return nil, corruptStateErrorf(filepath.Join(dir, entry.Name()), "malformed run item output filename")
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

func (store *Store) transcriptBlockFiles(workspaceID string, runID string) ([]transcriptBlockFile, error) {
	if err := validateStoreRunIDs(workspaceID, runID); err != nil {
		return nil, err
	}
	dir := store.transcriptBlocksDir(workspaceID, runID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []transcriptBlockFile{}, nil
		}
		return nil, &PersistenceError{Operation: "list transcript blocks", Path: dir, Err: err}
	}
	files := make([]transcriptBlockFile, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !isDataJSONFile(entry.Name()) {
			continue
		}
		ordinal, ordinalOK := ordinalFromMessageFileName(entry.Name())
		blockID, idOK := idFromMessageFileName(entry.Name())
		if !ordinalOK || !idOK {
			return nil, corruptStateErrorf(filepath.Join(dir, entry.Name()), "malformed transcript block filename")
		}
		files = append(files, transcriptBlockFile{
			ordinal: ordinal,
			id:      blockID,
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

func idFromMessageFileName(name string) (string, bool) {
	base := strings.TrimSuffix(name, ".json")
	_, id, ok := strings.Cut(base, "_")
	if !ok || id == "" {
		return "", false
	}
	return id, true
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

	file, err := os.CreateTemp(dir, ".tmp-*.json")
	if err != nil {
		return &PersistenceError{Operation: "create temp file", Path: dir, Err: err}
	}
	tempPath := file.Name()
	defer func() {
		_ = os.Remove(tempPath)
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
	if err := os.Link(tempPath, path); err != nil {
		return &PersistenceError{Operation: "create file", Path: path, Err: err}
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
		return corruptStateError(path, err)
	}
	return nil
}

func readJSONMetadataFile(path string, target any) error {
	file, err := os.Open(path)
	if err != nil {
		return &PersistenceError{Operation: "read file", Path: path, Err: err}
	}
	defer file.Close()

	decoder := json.NewDecoder(file)
	if err := decoder.Decode(target); err != nil {
		return corruptStateError(path, err)
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		if err == nil {
			return corruptStateError(path, jsonio.ErrMultipleValues)
		}
		return corruptStateError(path, err)
	}
	return nil
}

func corruptStateError(path string, err error) error {
	return &CorruptStateError{Path: path, Err: err}
}

func corruptStateErrorf(path string, format string, args ...any) error {
	return corruptStateError(path, fmt.Errorf(format, args...))
}
