package easyrun

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"

	"setta/internal/jsonio"
)

const (
	easyRunsDirName = "easy-runs"
	easyRunFileName = "run.json"
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

type storedRunRecord struct {
	SchemaVersion int     `json:"schemaVersion"`
	Run           EasyRun `json:"run"`
	BackingRunID  string  `json:"backingRunId"`
}

func (err *PersistenceError) Error() string {
	return fmt.Sprintf("%s %s: %v", err.Operation, err.Path, err.Err)
}

func (err *PersistenceError) Unwrap() error {
	return err.Err
}

func (err *CorruptStateError) Error() string {
	return fmt.Sprintf("malformed easy-run state %s: %v", err.Path, err.Err)
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

func (store *Store) workspaceIDs() ([]string, error) {
	dir := filepath.Join(store.appDataDir, "workspaces")
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []string{}, nil
		}
		return nil, &PersistenceError{Operation: "list easy-run workspaces", Path: dir, Err: err}
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

func (store *Store) LoadLatestSnapshot(workspaceID string, cursor EasyRunEventCursor) (EasyRunSnapshot, error) {
	if err := validateWorkspaceID(workspaceID); err != nil {
		return EasyRunSnapshot{}, err
	}
	if err := validateEventCursor(cursor); err != nil {
		return EasyRunSnapshot{}, err
	}
	latest, ok, err := store.latestRunRecord(workspaceID)
	if err != nil {
		return EasyRunSnapshot{}, err
	}
	var run *EasyRun
	if ok {
		next := latest.Run
		run = &next
	}
	return EasyRunSnapshot{
		Artifacts:         []EasyArtifact{},
		EventStreamCursor: cursor,
		Highlights:        []EasyHighlight{},
		LatestRun:         run,
	}, nil
}

func (store *Store) saveNewRun(record storedRunRecord) error {
	if err := validateStoredRunRecord(record); err != nil {
		return err
	}
	path := store.easyRunPath(record.Run.WorkspaceID, record.Run.ID)
	if _, err := os.Stat(path); err == nil {
		return &PersistenceError{Operation: "create easy-run", Path: path, Err: os.ErrExist}
	} else if !errors.Is(err, os.ErrNotExist) {
		return &PersistenceError{Operation: "stat easy-run", Path: path, Err: err}
	}
	return writeJSONFile(path, record)
}

func (store *Store) saveRun(record storedRunRecord) error {
	if err := validateStoredRunRecord(record); err != nil {
		return err
	}
	return writeJSONFile(store.easyRunPath(record.Run.WorkspaceID, record.Run.ID), record)
}

func (store *Store) loadRun(workspaceID string, easyRunID string) (storedRunRecord, error) {
	if err := validateWorkspaceID(workspaceID); err != nil {
		return storedRunRecord{}, err
	}
	if err := validateEasyRunID(easyRunID); err != nil {
		return storedRunRecord{}, err
	}
	path := store.easyRunPath(workspaceID, easyRunID)
	var record storedRunRecord
	if err := readJSONFile(path, &record); err != nil {
		return storedRunRecord{}, err
	}
	if err := validateStoredRunRecord(record); err != nil {
		return storedRunRecord{}, corruptStateError(path, err)
	}
	if record.Run.WorkspaceID != workspaceID {
		return storedRunRecord{}, corruptStateErrorf(path, "easy run %s belongs to workspace %s, not %s", easyRunID, record.Run.WorkspaceID, workspaceID)
	}
	if record.Run.ID != easyRunID {
		return storedRunRecord{}, corruptStateErrorf(path, "easy-run file id %s does not match requested id %s", record.Run.ID, easyRunID)
	}
	return record, nil
}

func (store *Store) findWorkingRun(workspaceID string) (storedRunRecord, bool, error) {
	records, err := store.loadRunRecords(workspaceID)
	if err != nil {
		return storedRunRecord{}, false, err
	}
	var selected *storedRunRecord
	for _, record := range records {
		if record.Run.Status != EasyRunStatusWorking {
			continue
		}
		next := record
		if selected == nil || runSortLess(*selected, next) {
			selected = &next
		}
	}
	if selected == nil {
		return storedRunRecord{}, false, nil
	}
	return *selected, true, nil
}

func (store *Store) findRunByConversationID(workspaceID string, conversationID string) (storedRunRecord, bool, error) {
	if err := validateWorkspaceID(workspaceID); err != nil {
		return storedRunRecord{}, false, err
	}
	if err := validateStorageID("conversation id", conversationID); err != nil {
		return storedRunRecord{}, false, err
	}
	records, err := store.loadRunRecords(workspaceID)
	if err != nil {
		return storedRunRecord{}, false, err
	}
	for _, record := range records {
		if record.Run.ConversationID == conversationID {
			return record, true, nil
		}
	}
	return storedRunRecord{}, false, nil
}

func (store *Store) latestRunRecord(workspaceID string) (storedRunRecord, bool, error) {
	records, err := store.loadRunRecords(workspaceID)
	if err != nil {
		return storedRunRecord{}, false, err
	}
	if len(records) == 0 {
		return storedRunRecord{}, false, nil
	}
	sort.SliceStable(records, func(left int, right int) bool {
		return runSortLess(records[right], records[left])
	})
	return records[0], true, nil
}

func runSortLess(left storedRunRecord, right storedRunRecord) bool {
	if left.Run.StartedAt != right.Run.StartedAt {
		return left.Run.StartedAt < right.Run.StartedAt
	}
	return left.Run.ID < right.Run.ID
}

func (store *Store) loadRunRecords(workspaceID string) ([]storedRunRecord, error) {
	if err := validateWorkspaceID(workspaceID); err != nil {
		return nil, err
	}
	dir := store.easyRunsDir(workspaceID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []storedRunRecord{}, nil
		}
		return nil, &PersistenceError{Operation: "list easy-runs", Path: dir, Err: err}
	}
	records := []storedRunRecord{}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		record, err := store.loadRun(workspaceID, entry.Name())
		if err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	return records, nil
}

func (store *Store) workspaceDir(workspaceID string) string {
	return filepath.Join(store.appDataDir, "workspaces", workspaceID)
}

func (store *Store) easyRunsDir(workspaceID string) string {
	return filepath.Join(store.workspaceDir(workspaceID), easyRunsDirName)
}

func (store *Store) easyRunDir(workspaceID string, easyRunID string) string {
	return filepath.Join(store.easyRunsDir(workspaceID), easyRunID)
}

func (store *Store) easyRunPath(workspaceID string, easyRunID string) string {
	return filepath.Join(store.easyRunDir(workspaceID, easyRunID), easyRunFileName)
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

func readJSONFile(path string, target any) error {
	file, err := os.Open(path)
	if err != nil {
		return &PersistenceError{Operation: "read file", Path: path, Err: err}
	}
	defer file.Close()
	if err := jsonio.DecodeSingle(file, target); err != nil {
		if errors.Is(err, io.EOF) {
			return corruptStateError(path, err)
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
