package chat

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/jsonio"
)

func (store *Store) workspaceDir(workspaceID string) string {
	return filepath.Join(store.appDataDir, "workspaces", workspaceID)
}

func (store *Store) projectionMessagePath(workspaceID string, conversationID string, messageID string) string {
	return filepath.Join(store.chatOverlayDir(workspaceID), "projection", "conversations", conversationID, "messages", messageID)
}

func (store *Store) projectionRunPath(workspaceID string, runID string) string {
	return filepath.Join(store.chatOverlayDir(workspaceID), "projection", "runs", runID)
}

func (store *Store) diagnosticsDir() string {
	return filepath.Join(store.appDataDir, diagnosticsDirName)
}

func (store *Store) diagnosticPath(diagnosticID string) string {
	return filepath.Join(store.diagnosticsDir(), diagnosticID+".json")
}

func isDataJSONFile(name string) bool {
	return filepath.Ext(name) == ".json" && !strings.HasPrefix(name, ".")
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
