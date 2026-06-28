package chat

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Background terminal persistence for
// docs/plans/background_terminal_lifecycle_plan.md.
//
// Process records and their output live under the conversation, separate from a
// run's transcript blocks, so run terminal state never finalizes them:
//
//	workspaces/<ws>/conversations/<conv>/background_terminals/<process-id>.json
//	workspaces/<ws>/conversations/<conv>/background_terminal_output/<process-id>/<ordinal>_<id>.json
//
// <process-id> is the stable Setta-generated BackgroundTerminalProcess.ID, which
// is also BackgroundTerminalOutput.ProcessID (the join key). The provider
// process handle is BackgroundTerminalProcess.ProcessID and is never used as a
// storage path.

type backgroundTerminalOutputFile struct {
	ordinal int
	path    string
}

func (store *Store) SaveBackgroundTerminalProcess(process BackgroundTerminalProcess) error {
	if err := validateStoreBackgroundTerminalIDs(process.WorkspaceID, process.ConversationID, process.ID); err != nil {
		return err
	}
	if err := validateBackgroundTerminalProcess(process); err != nil {
		return err
	}
	return writeJSONFile(store.backgroundTerminalPath(process.WorkspaceID, process.ConversationID, process.ID), process)
}

func (store *Store) LoadBackgroundTerminalProcess(workspaceID string, conversationID string, processID string) (BackgroundTerminalProcess, error) {
	if err := validateStoreBackgroundTerminalIDs(workspaceID, conversationID, processID); err != nil {
		return BackgroundTerminalProcess{}, err
	}
	var process BackgroundTerminalProcess
	path := store.backgroundTerminalPath(workspaceID, conversationID, processID)
	if err := readJSONFile(path, &process); err != nil {
		return BackgroundTerminalProcess{}, err
	}
	if err := validateBackgroundTerminalProcess(process); err != nil {
		return BackgroundTerminalProcess{}, corruptStateError(path, err)
	}
	if process.ID != processID {
		return BackgroundTerminalProcess{}, corruptStateErrorf(path, "background terminal file id %s does not match requested id %s", process.ID, processID)
	}
	if process.WorkspaceID != workspaceID || process.ConversationID != conversationID {
		return BackgroundTerminalProcess{}, corruptStateErrorf(path, "background terminal %s belongs to workspace %s conversation %s, not workspace %s conversation %s",
			process.ID, process.WorkspaceID, process.ConversationID, workspaceID, conversationID)
	}
	return process, nil
}

func (store *Store) ListBackgroundTerminalProcesses(workspaceID string, conversationID string) ([]BackgroundTerminalProcess, error) {
	if err := validateStoreConversationIDs(workspaceID, conversationID); err != nil {
		return nil, err
	}
	dir := store.backgroundTerminalsDir(workspaceID, conversationID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []BackgroundTerminalProcess{}, nil
		}
		return nil, &PersistenceError{Operation: "list background terminals", Path: dir, Err: err}
	}
	processes := make([]BackgroundTerminalProcess, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !isDataJSONFile(entry.Name()) {
			continue
		}
		processID := strings.TrimSuffix(entry.Name(), ".json")
		process, err := store.LoadBackgroundTerminalProcess(workspaceID, conversationID, processID)
		if err != nil {
			return nil, err
		}
		processes = append(processes, process)
	}
	sort.SliceStable(processes, func(left int, right int) bool {
		if processes[left].StartedAt == processes[right].StartedAt {
			return processes[left].ID < processes[right].ID
		}
		return processes[left].StartedAt < processes[right].StartedAt
	})
	return processes, nil
}

func (store *Store) DeleteBackgroundTerminalProcess(workspaceID string, conversationID string, processID string) error {
	if err := validateStoreBackgroundTerminalIDs(workspaceID, conversationID, processID); err != nil {
		return err
	}
	path := store.backgroundTerminalPath(workspaceID, conversationID, processID)
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return &PersistenceError{Operation: "delete background terminal", Path: path, Err: err}
	}
	outputDir := store.backgroundTerminalOutputDir(workspaceID, conversationID, processID)
	if err := os.RemoveAll(outputDir); err != nil {
		return &PersistenceError{Operation: "delete background terminal output", Path: outputDir, Err: err}
	}
	return nil
}

func (store *Store) SaveBackgroundTerminalOutput(workspaceID string, conversationID string, output BackgroundTerminalOutput) error {
	if err := validateStoreConversationIDs(workspaceID, conversationID); err != nil {
		return err
	}
	if err := validateBackgroundTerminalOutput(output); err != nil {
		return err
	}
	return writeJSONFile(store.backgroundTerminalOutputPath(workspaceID, conversationID, output.ProcessID, output.Ordinal, output.ID), output)
}

func (store *Store) NextBackgroundTerminalOutputOrdinal(workspaceID string, conversationID string, processID string) (int, error) {
	if err := validateStoreBackgroundTerminalIDs(workspaceID, conversationID, processID); err != nil {
		return 0, err
	}
	files, err := store.backgroundTerminalOutputFiles(workspaceID, conversationID, processID)
	if err != nil {
		return 0, err
	}
	if len(files) == 0 {
		return 1, nil
	}
	return files[len(files)-1].ordinal + 1, nil
}

func (store *Store) LoadBackgroundTerminalOutputPage(workspaceID string, conversationID string, processID string, afterOrdinal int, limit int) (BackgroundTerminalOutputPage, error) {
	if err := validateStoreBackgroundTerminalIDs(workspaceID, conversationID, processID); err != nil {
		return BackgroundTerminalOutputPage{}, err
	}
	if afterOrdinal < 0 {
		return BackgroundTerminalOutputPage{}, fmt.Errorf("background terminal output afterOrdinal must not be negative: %d", afterOrdinal)
	}
	if limit < 0 {
		return BackgroundTerminalOutputPage{}, fmt.Errorf("background terminal output page limit must not be negative: %d", limit)
	}
	if _, err := store.LoadBackgroundTerminalProcess(workspaceID, conversationID, processID); err != nil {
		return BackgroundTerminalOutputPage{}, err
	}
	files, err := store.backgroundTerminalOutputFiles(workspaceID, conversationID, processID)
	if err != nil {
		return BackgroundTerminalOutputPage{}, err
	}
	files = backgroundTerminalOutputFilesAfterOrdinal(files, afterOrdinal)
	hasMore := false
	nextOrdinal := 0
	if limit > 0 && len(files) > limit {
		files = files[:limit]
		hasMore = true
		nextOrdinal = files[len(files)-1].ordinal
	}
	outputs, err := readBackgroundTerminalOutputs(files, processID)
	if err != nil {
		return BackgroundTerminalOutputPage{}, err
	}
	return BackgroundTerminalOutputPage{ProcessID: processID, Output: outputs, HasMore: hasMore, NextOrdinal: nextOrdinal}, nil
}

func (store *Store) backgroundTerminalOutputFiles(workspaceID string, conversationID string, processID string) ([]backgroundTerminalOutputFile, error) {
	if err := validateStoreBackgroundTerminalIDs(workspaceID, conversationID, processID); err != nil {
		return nil, err
	}
	dir := store.backgroundTerminalOutputDir(workspaceID, conversationID, processID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []backgroundTerminalOutputFile{}, nil
		}
		return nil, &PersistenceError{Operation: "list background terminal output", Path: dir, Err: err}
	}
	files := make([]backgroundTerminalOutputFile, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !isDataJSONFile(entry.Name()) {
			continue
		}
		ordinal, ok := ordinalFromMessageFileName(entry.Name())
		if !ok {
			return nil, corruptStateErrorf(filepath.Join(dir, entry.Name()), "malformed background terminal output filename")
		}
		files = append(files, backgroundTerminalOutputFile{
			ordinal: ordinal,
			path:    filepath.Join(dir, entry.Name()),
		})
	}
	sort.SliceStable(files, func(left int, right int) bool {
		return files[left].ordinal < files[right].ordinal
	})
	return files, nil
}

func backgroundTerminalOutputFilesAfterOrdinal(files []backgroundTerminalOutputFile, afterOrdinal int) []backgroundTerminalOutputFile {
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

func readBackgroundTerminalOutputs(files []backgroundTerminalOutputFile, processID string) ([]BackgroundTerminalOutput, error) {
	outputs := make([]BackgroundTerminalOutput, 0, len(files))
	for _, file := range files {
		var output BackgroundTerminalOutput
		if err := readJSONFile(file.path, &output); err != nil {
			return nil, err
		}
		if err := validateBackgroundTerminalOutput(output); err != nil {
			return nil, corruptStateError(file.path, err)
		}
		if output.ProcessID != processID {
			return nil, corruptStateErrorf(file.path, "background terminal output %s belongs to process %s, not %s", output.ID, output.ProcessID, processID)
		}
		outputs = append(outputs, output)
	}
	return outputs, nil
}
