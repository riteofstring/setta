package workflowaudit

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"time"

	"setta/internal/orchestrator"
	"setta/internal/runtimeauth"
)

const (
	SchemaVersion = 1

	CommandWorkflowDefinitionsSave   CommandName = "setta workflow definitions save"
	CommandWorkflowExecutionsStart   CommandName = "setta workflow executions start"
	OutcomeWorkflowDefinitionSaved   Outcome     = "workflow_definition_saved"
	OutcomeWorkflowDefinitionUnsaved Outcome     = "workflow_definition_unsaved"
	OutcomeWorkflowExecutionStarted  Outcome     = "workflow_execution_started"
	OutcomeFailed                    Outcome     = "failed"

	auditDirName  = "runtime"
	auditFileName = "workflow-command-audit.jsonl"
)

type CommandName string

type Outcome string

type Record struct {
	SchemaVersion              int                                          `json:"schemaVersion"`
	ID                         string                                       `json:"id"`
	RecordedAt                 string                                       `json:"recordedAt"`
	AuthenticatedDeviceSession runtimeauth.DeviceSession                    `json:"authenticatedDeviceSession"`
	CommandName                CommandName                                  `json:"commandName"`
	Outcome                    Outcome                                      `json:"outcome"`
	WorkspaceID                string                                       `json:"workspaceId"`
	DefinitionID               string                                       `json:"definitionId"`
	ExecutionID                string                                       `json:"executionId,omitempty"`
	ActiveExecution            *orchestrator.WorkflowExecutionSummary       `json:"activeExecution,omitempty"`
	SaveOperation              orchestrator.WorkflowDefinitionSaveOperation `json:"saveOperation,omitempty"`
	Saved                      *bool                                        `json:"saved,omitempty"`
	Validation                 *orchestrator.WorkflowValidationResult       `json:"validation,omitempty"`
	ErrorCode                  string                                       `json:"errorCode,omitempty"`
	ErrorMessage               string                                       `json:"errorMessage,omitempty"`
}

type RecordInput struct {
	AuthenticatedDeviceSession runtimeauth.DeviceSession
	CommandName                CommandName
	Outcome                    Outcome
	WorkspaceID                string
	DefinitionID               string
	ExecutionID                string
	ActiveExecution            *orchestrator.WorkflowExecutionSummary
	SaveOperation              orchestrator.WorkflowDefinitionSaveOperation
	Saved                      *bool
	Validation                 *orchestrator.WorkflowValidationResult
	ErrorCode                  string
	ErrorMessage               string
}

type Store struct {
	path  string
	newID func(string) (string, error)
	now   func() time.Time
	mu    sync.Mutex
}

type Option func(*Store)

type PersistenceError struct {
	Operation string
	Path      string
	Err       error
}

type CorruptStateError struct {
	Path string
	Err  error
}

func WithIDGenerator(newID func(string) (string, error)) Option {
	return func(store *Store) {
		store.newID = newID
	}
}

func WithClock(now func() time.Time) Option {
	return func(store *Store) {
		store.now = now
	}
}

func NewStore(appDataDir string, options ...Option) (*Store, error) {
	if appDataDir == "" {
		return nil, errors.New("app data directory is required")
	}
	if !filepath.IsAbs(appDataDir) {
		return nil, fmt.Errorf("app data directory must be absolute: %s", appDataDir)
	}
	appDataDir = filepath.Clean(appDataDir)
	store := &Store{
		path:  filepath.Join(appDataDir, auditDirName, auditFileName),
		newID: randomPrefixedID,
		now:   time.Now,
	}
	for _, option := range options {
		option(store)
	}
	return store, nil
}

func (store *Store) Path() string {
	return store.path
}

func (store *Store) Record(ctx context.Context, input RecordInput) (Record, error) {
	if err := ctx.Err(); err != nil {
		return Record{}, err
	}
	if err := validateRecordInput(input); err != nil {
		return Record{}, err
	}
	id, err := store.newID("workflow_audit")
	if err != nil {
		return Record{}, fmt.Errorf("generate workflow audit id: %w", err)
	}
	record := Record{
		SchemaVersion:              SchemaVersion,
		ID:                         id,
		RecordedAt:                 timestamp(store.now()),
		AuthenticatedDeviceSession: input.AuthenticatedDeviceSession,
		CommandName:                input.CommandName,
		Outcome:                    input.Outcome,
		WorkspaceID:                input.WorkspaceID,
		DefinitionID:               input.DefinitionID,
		ExecutionID:                input.ExecutionID,
		ActiveExecution:            input.ActiveExecution,
		SaveOperation:              input.SaveOperation,
		Saved:                      input.Saved,
		Validation:                 input.Validation,
		ErrorCode:                  input.ErrorCode,
		ErrorMessage:               input.ErrorMessage,
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	if err := store.appendRecordLocked(ctx, record); err != nil {
		return Record{}, err
	}
	return record, nil
}

func (store *Store) List(ctx context.Context) ([]Record, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()

	file, err := os.Open(store.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []Record{}, nil
		}
		return nil, store.persistenceError("read workflow audit records", err)
	}
	defer file.Close()

	decoder := json.NewDecoder(file)
	records := []Record{}
	for {
		var record Record
		if err := decoder.Decode(&record); err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			return nil, store.corruptError(fmt.Errorf("decode workflow audit record: %w", err))
		}
		if err := validateRecord(record); err != nil {
			return nil, store.corruptError(err)
		}
		records = append(records, record)
	}
	return records, nil
}

func validateRecordInput(input RecordInput) error {
	if input.AuthenticatedDeviceSession.ID == "" {
		return errors.New("workflow audit authenticated device session id is required")
	}
	if input.AuthenticatedDeviceSession.DisplayName == "" {
		return fmt.Errorf("workflow audit authenticated device session %s display name is required", input.AuthenticatedDeviceSession.ID)
	}
	if input.CommandName == "" {
		return errors.New("workflow audit command name is required")
	}
	if input.Outcome == "" {
		return errors.New("workflow audit outcome is required")
	}
	return nil
}

func validateRecord(record Record) error {
	if record.SchemaVersion != SchemaVersion {
		return fmt.Errorf("workflow audit record %s schemaVersion = %d, want %d", record.ID, record.SchemaVersion, SchemaVersion)
	}
	if record.ID == "" {
		return errors.New("workflow audit record id is required")
	}
	if record.RecordedAt == "" {
		return fmt.Errorf("workflow audit record %s recordedAt is required", record.ID)
	}
	if _, err := time.Parse(time.RFC3339Nano, record.RecordedAt); err != nil {
		return fmt.Errorf("workflow audit record %s recordedAt must be RFC3339: %w", record.ID, err)
	}
	return validateRecordInput(RecordInput{
		AuthenticatedDeviceSession: record.AuthenticatedDeviceSession,
		CommandName:                record.CommandName,
		Outcome:                    record.Outcome,
	})
}

func (store *Store) appendRecordLocked(ctx context.Context, record Record) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(store.path), 0o755); err != nil {
		return store.persistenceError("create workflow audit directory", err)
	}
	file, err := os.OpenFile(store.path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return store.persistenceError("open workflow audit records", err)
	}
	if err := json.NewEncoder(file).Encode(record); err != nil {
		_ = file.Close()
		return store.persistenceError("write workflow audit record", err)
	}
	if err := file.Close(); err != nil {
		return store.persistenceError("close workflow audit records", err)
	}
	return nil
}

func (err *PersistenceError) Error() string {
	return fmt.Sprintf("%s %s: %v", err.Operation, err.Path, err.Err)
}

func (err *PersistenceError) Unwrap() error {
	return err.Err
}

func (err *CorruptStateError) Error() string {
	return fmt.Sprintf("malformed workflow audit state %s: %v", err.Path, err.Err)
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

func (store *Store) persistenceError(operation string, err error) error {
	return &PersistenceError{Operation: operation, Path: store.path, Err: err}
}

func (store *Store) corruptError(err error) error {
	return &CorruptStateError{Path: store.path, Err: err}
}

func randomPrefixedID(prefix string) (string, error) {
	var data [16]byte
	if _, err := rand.Read(data[:]); err != nil {
		return "", fmt.Errorf("generate %s id: %w", prefix, err)
	}
	return prefix + "_" + hex.EncodeToString(data[:]), nil
}

func timestamp(value time.Time) string {
	return value.UTC().Format(time.RFC3339Nano)
}
