package easyrun

import (
	"errors"
	"fmt"
	"path/filepath"
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

func (store *Store) LoadLatestSnapshot(workspaceID string, cursor EasyRunEventCursor) (EasyRunSnapshot, error) {
	if err := validateWorkspaceID(workspaceID); err != nil {
		return EasyRunSnapshot{}, err
	}
	if err := validateEventCursor(cursor); err != nil {
		return EasyRunSnapshot{}, err
	}
	return EasyRunSnapshot{
		Artifacts:         []EasyArtifact{},
		EventStreamCursor: cursor,
		Highlights:        []EasyHighlight{},
		LatestRun:         nil,
	}, nil
}
