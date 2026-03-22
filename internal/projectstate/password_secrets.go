package projectstate

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"setta/internal/statefs"
)

const passwordStoreFileName = "passwords.json"

type PasswordSecretStore interface {
	Get(implID string) (string, error)
	Set(implID string, value string) error
}

type FilePasswordSecretStore struct {
	path string
	mu   sync.Mutex
}

type MemoryPasswordSecretStore struct {
	mu     sync.RWMutex
	values map[string]string
}

func (p *Project) clearPasswordSecretForImpl(implID string) error {
	if p == nil || p.passwordSecrets == nil {
		return nil
	}
	trimmedImplID := strings.TrimSpace(implID)
	if trimmedImplID == "" {
		return nil
	}
	return p.passwordSecrets.Set(trimmedImplID, "")
}

func NewFilePasswordSecretStore(runtimeRoot string) (*FilePasswordSecretStore, error) {
	resolvedRuntimeRoot, err := statefs.NormalizePath(runtimeRoot, "")
	if err != nil {
		return nil, fmt.Errorf("resolve runtime root: %w", err)
	}
	return &FilePasswordSecretStore{
		path: filepath.Join(resolvedRuntimeRoot, "secrets", passwordStoreFileName),
	}, nil
}

func NewMemoryPasswordSecretStore() *MemoryPasswordSecretStore {
	return &MemoryPasswordSecretStore{
		values: map[string]string{},
	}
}

func (s *FilePasswordSecretStore) Path() string {
	if s == nil {
		return ""
	}
	return s.path
}

func (s *FilePasswordSecretStore) Get(implID string) (string, error) {
	if s == nil {
		return "", nil
	}
	trimmedImplID := strings.TrimSpace(implID)
	if trimmedImplID == "" {
		return "", ErrCodeObjImplIDRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	values, err := readPasswordSecretsFile(s.path)
	if err != nil {
		return "", err
	}
	return values[trimmedImplID], nil
}

func (s *FilePasswordSecretStore) Set(implID string, value string) error {
	if s == nil {
		return nil
	}
	trimmedImplID := strings.TrimSpace(implID)
	if trimmedImplID == "" {
		return ErrCodeObjImplIDRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	values, err := readPasswordSecretsFile(s.path)
	if err != nil {
		return err
	}
	if value == "" {
		delete(values, trimmedImplID)
	} else {
		values[trimmedImplID] = value
	}
	return writePasswordSecretsFile(s.path, values)
}

func (s *MemoryPasswordSecretStore) Get(implID string) (string, error) {
	if s == nil {
		return "", nil
	}
	trimmedImplID := strings.TrimSpace(implID)
	if trimmedImplID == "" {
		return "", ErrCodeObjImplIDRequired
	}

	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.values[trimmedImplID], nil
}

func (s *MemoryPasswordSecretStore) Set(implID string, value string) error {
	if s == nil {
		return nil
	}
	trimmedImplID := strings.TrimSpace(implID)
	if trimmedImplID == "" {
		return ErrCodeObjImplIDRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if value == "" {
		delete(s.values, trimmedImplID)
		return nil
	}
	s.values[trimmedImplID] = value
	return nil
}

func readPasswordSecretsFile(path string) (map[string]string, error) {
	resolvedPath, err := statefs.NormalizePath(path, "")
	if err != nil {
		return nil, err
	}
	content, err := os.ReadFile(resolvedPath)
	if err != nil {
		if os.IsNotExist(err) {
			return map[string]string{}, nil
		}
		return nil, fmt.Errorf("read password store: %w", err)
	}
	if len(strings.TrimSpace(string(content))) == 0 {
		return map[string]string{}, nil
	}
	var values map[string]string
	if err := json.Unmarshal(content, &values); err != nil {
		return nil, fmt.Errorf("decode password store: %w", err)
	}
	if values == nil {
		return map[string]string{}, nil
	}
	return values, nil
}

func writePasswordSecretsFile(path string, values map[string]string) error {
	if values == nil {
		values = map[string]string{}
	}
	content, err := json.MarshalIndent(values, "", "  ")
	if err != nil {
		return fmt.Errorf("encode password store: %w", err)
	}
	content = append(content, '\n')
	if err := statefs.AtomicWriteFile(path, content, defaultFileMode); err != nil {
		return fmt.Errorf("write password store: %w", err)
	}
	return nil
}
