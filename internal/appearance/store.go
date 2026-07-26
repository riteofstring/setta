package appearance

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"setta/internal/jsonio"
)

const settingsFileName = "appearance.json"

type Store struct {
	appDataDir string
	path       string
}

type Service struct {
	mu       sync.Mutex
	settings AppearanceSettings
	store    *Store
}

type PersistenceError struct {
	Operation string
	Path      string
	Err       error
}

type CorruptSettingsError struct {
	Path string
	Err  error
}

func NewStore(appDataDir string) (*Store, error) {
	if appDataDir == "" {
		return nil, errors.New("app data directory is required")
	}
	if !filepath.IsAbs(appDataDir) {
		return nil, fmt.Errorf("app data directory must be absolute: %s", appDataDir)
	}
	appDataDir = filepath.Clean(appDataDir)
	return &Store{
		appDataDir: appDataDir,
		path:       filepath.Join(appDataDir, settingsFileName),
	}, nil
}

func NewService(store *Store) (*Service, error) {
	if store == nil {
		return nil, errors.New("appearance store is required")
	}
	settings, err := store.Load()
	if err != nil {
		return nil, err
	}
	return &Service{
		settings: settings,
		store:    store,
	}, nil
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

func (err *CorruptSettingsError) Error() string {
	return fmt.Sprintf("malformed appearance settings %s: %v", err.Path, err.Err)
}

func (err *CorruptSettingsError) Unwrap() error {
	return err.Err
}

func IsCorruptSettingsError(err error) bool {
	var corruptSettingsError *CorruptSettingsError
	return errors.As(err, &corruptSettingsError)
}

func (store *Store) Path() string {
	return store.path
}

func (store *Store) Load() (AppearanceSettings, error) {
	file, err := os.Open(store.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return DefaultSettings(), nil
		}
		return AppearanceSettings{}, &PersistenceError{Operation: "read appearance settings", Path: store.path, Err: err}
	}
	defer file.Close()

	var settings AppearanceSettings
	if err := jsonio.DecodeSingle(file, &settings); err != nil {
		return AppearanceSettings{}, corruptSettingsError(store.path, err)
	}
	if err := Validate(settings); err != nil {
		return AppearanceSettings{}, corruptSettingsError(store.path, err)
	}
	return settings, nil
}

func (store *Store) Save(settings AppearanceSettings) error {
	if err := Validate(settings); err != nil {
		return corruptSettingsError(store.path, err)
	}
	if err := os.MkdirAll(store.appDataDir, 0o755); err != nil {
		return &PersistenceError{Operation: "create appearance settings directory", Path: store.appDataDir, Err: err}
	}
	file, err := os.CreateTemp(store.appDataDir, ".appearance-*.tmp")
	if err != nil {
		return &PersistenceError{Operation: "create appearance settings temp file", Path: store.appDataDir, Err: err}
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
	if err := encoder.Encode(settings); err != nil {
		_ = file.Close()
		return &PersistenceError{Operation: "write appearance settings temp file", Path: tempPath, Err: err}
	}
	if err := file.Close(); err != nil {
		return &PersistenceError{Operation: "close appearance settings temp file", Path: tempPath, Err: err}
	}
	if err := os.Rename(tempPath, store.path); err != nil {
		return &PersistenceError{Operation: "replace appearance settings", Path: store.path, Err: err}
	}
	removeTemp = false
	return nil
}

func (service *Service) Read(context.Context) (AppearanceSettings, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	return service.settings, nil
}

func (service *Service) Update(_ context.Context, settings AppearanceSettings) (AppearanceSettings, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	if err := service.store.Save(settings); err != nil {
		return AppearanceSettings{}, err
	}
	service.settings = settings
	return service.settings, nil
}

func corruptSettingsError(path string, err error) error {
	return &CorruptSettingsError{Path: path, Err: err}
}
