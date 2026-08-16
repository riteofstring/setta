package project

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

var ErrGeneratedFileClosed = errors.New("project: generated file is closed")

// GeneratedFileWriter is the transaction boundary between canonical state and
// the backend-owned generated Python file.
type GeneratedFileWriter interface {
	Write(code string) error
	Path() string
	Close() error
}

// GeneratedFile owns one temporary workspace and atomically replaces only its
// canonical setta_gen.py artifact.
type GeneratedFile struct {
	mu        sync.Mutex
	workspace string
	path      string
	closed    bool
}

// NewTemporaryGeneratedFile creates the private workspace used by the future
// language-server adapter. The caller must Close it.
func NewTemporaryGeneratedFile() (*GeneratedFile, error) {
	workspace, err := os.MkdirTemp("", "setta-python-canvas-")
	if err != nil {
		return nil, fmt.Errorf("create generated Python workspace: %w", err)
	}
	return &GeneratedFile{
		workspace: workspace,
		path:      filepath.Join(workspace, "setta_gen.py"),
	}, nil
}

// NewTemporaryStore creates a store that owns the provided LSP provider and
// one temporary generated file.
func NewTemporaryStore(provider LSPProvider) (*Store, error) {
	if provider == nil {
		return nil, ErrLSPProviderRequired
	}
	generatedFile, err := NewTemporaryGeneratedFile()
	if err != nil {
		return nil, err
	}
	store, err := NewStoreWithProvider(generatedFile, provider)
	if err != nil {
		_ = generatedFile.Close()
		return nil, err
	}
	return store, nil
}

// Write atomically replaces the complete generated file with code.
func (file *GeneratedFile) Write(code string) error {
	if file == nil {
		return ErrGeneratedFileClosed
	}
	file.mu.Lock()
	defer file.mu.Unlock()
	if file.closed {
		return ErrGeneratedFileClosed
	}
	if err := atomicWriteFile(file.path, []byte(code)); err != nil {
		return fmt.Errorf("replace generated Python file: %w", err)
	}
	return nil
}

// Path returns the canonical temporary file path.
func (file *GeneratedFile) Path() string {
	if file == nil {
		return ""
	}
	file.mu.Lock()
	defer file.mu.Unlock()
	return file.path
}

// Close removes the complete private workspace after the LSP session stops.
func (file *GeneratedFile) Close() error {
	if file == nil {
		return nil
	}
	file.mu.Lock()
	defer file.mu.Unlock()
	if file.closed {
		return nil
	}
	file.closed = true
	if err := os.RemoveAll(file.workspace); err != nil {
		return fmt.Errorf("remove generated Python workspace: %w", err)
	}
	return nil
}

func atomicWriteFile(path string, content []byte) (err error) {
	directory := filepath.Dir(path)
	temporary, err := os.CreateTemp(directory, ".setta-gen-")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	closed := false
	defer func() {
		if !closed {
			closeErr := temporary.Close()
			if err == nil && closeErr != nil {
				err = closeErr
			}
		}
		if err != nil {
			_ = os.Remove(temporaryPath)
		}
	}()
	if err := temporary.Chmod(0o600); err != nil {
		return err
	}
	if _, err := temporary.Write(content); err != nil {
		return err
	}
	if err := temporary.Sync(); err != nil {
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	closed = true
	return os.Rename(temporaryPath, path)
}
