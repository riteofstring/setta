package materializer

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

var (
	ErrProjectPathRequired = errors.New("materializer: project path is required")

	ErrMaterializerClosed = errors.New("materializer: generated document is closed")

	ErrNotInitialized = errors.New("materializer: generated document is not initialized")

	ErrReplacementClosed = errors.New("materializer: replacement is closed")
)

type replaceFunc func(source string, destination string) error

type Replacement interface {
	Install() error
	Rollback() error
	Finalize() error
	Discard() error
}

type Handle interface {
	Path() string
	Initialize(code string) error
	Stage(code string) (Replacement, error)
	Close() error
}

type Document struct {
	mu          sync.Mutex
	path        string
	directory   string
	replace     replaceFunc
	initialized bool
	closed      bool
}

func New(projectPath string) (*Document, error) {
	directory, err := projectDirectory(projectPath)
	if err != nil {
		return nil, err
	}
	file, err := os.CreateTemp(directory, ".setta-python-canvas-generated-*.py")
	if err != nil {
		return nil, fmt.Errorf("create generated materialization: %w", err)
	}
	path := file.Name()
	if err := file.Chmod(0o600); err != nil {
		_ = file.Close()
		_ = os.Remove(path)
		return nil, fmt.Errorf("protect generated materialization: %w", err)
	}
	if err := file.Close(); err != nil {
		_ = os.Remove(path)
		return nil, fmt.Errorf("close generated materialization: %w", err)
	}
	return &Document{path: path, directory: directory, replace: os.Rename}, nil
}

func (document *Document) Path() string {
	if document == nil {
		return ""
	}
	document.mu.Lock()
	defer document.mu.Unlock()
	return document.path
}

func (document *Document) Initialize(code string) error {
	if document == nil {
		return ErrMaterializerClosed
	}
	document.mu.Lock()
	defer document.mu.Unlock()
	if document.closed {
		return ErrMaterializerClosed
	}
	if document.initialized {
		return fmt.Errorf("materializer: generated document is already initialized")
	}
	temporaryPath, err := stageBytes(document.directory, ".setta-python-canvas-stage-*", []byte(code))
	if err != nil {
		return err
	}
	if err := document.replacer()(temporaryPath, document.path); err != nil {
		_ = os.Remove(temporaryPath)
		return fmt.Errorf("install initial generated materialization: %w", err)
	}
	document.initialized = true
	return nil
}

func (document *Document) Stage(code string) (Replacement, error) {
	if document == nil {
		return nil, ErrMaterializerClosed
	}
	document.mu.Lock()
	defer document.mu.Unlock()
	if document.closed {
		return nil, ErrMaterializerClosed
	}
	if !document.initialized {
		return nil, ErrNotInitialized
	}
	temporaryPath, err := stageBytes(document.directory, ".setta-python-canvas-stage-*", []byte(code))
	if err != nil {
		return nil, err
	}
	return &stagedReplacement{
		targetPath:    document.path,
		directory:     document.directory,
		temporaryPath: temporaryPath,
		replace:       document.replacer(),
	}, nil
}

func (document *Document) Close() error {
	if document == nil {
		return nil
	}
	document.mu.Lock()
	defer document.mu.Unlock()
	if document.closed {
		return nil
	}
	document.closed = true
	if err := os.Remove(document.path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove generated materialization: %w", err)
	}
	return nil
}

type stagedReplacement struct {
	targetPath    string
	directory     string
	temporaryPath string
	backupPath    string
	replace       replaceFunc
	installed     bool
	closed        bool
}

func (staged *stagedReplacement) Install() error {
	if staged == nil || staged.closed {
		return ErrReplacementClosed
	}
	if staged.installed {
		return fmt.Errorf("materializer: replacement is already installed")
	}
	backupPath, err := stageFileCopy(staged.directory, staged.targetPath)
	if err != nil {
		return err
	}
	if err := staged.replace(staged.temporaryPath, staged.targetPath); err != nil {
		_ = os.Remove(backupPath)
		return fmt.Errorf("install generated materialization: %w", err)
	}
	staged.temporaryPath = ""
	staged.backupPath = backupPath
	staged.installed = true
	return nil
}

func (staged *stagedReplacement) Rollback() error {
	if staged == nil || staged.closed || !staged.installed || staged.backupPath == "" {
		return ErrReplacementClosed
	}
	if err := staged.replace(staged.backupPath, staged.targetPath); err != nil {
		return fmt.Errorf("rollback generated materialization: %w", err)
	}
	staged.backupPath = ""
	staged.closed = true
	return nil
}

func (staged *stagedReplacement) Finalize() error {
	if staged == nil || staged.closed || !staged.installed {
		return ErrReplacementClosed
	}
	if err := os.Remove(staged.backupPath); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("discard generated materialization backup: %w", err)
	}
	staged.backupPath = ""
	staged.closed = true
	return nil
}

func (staged *stagedReplacement) Discard() error {
	if staged == nil || staged.closed {
		return nil
	}
	staged.closed = true
	var cleanup error
	if staged.temporaryPath != "" {
		if err := removeIfPresent(staged.temporaryPath); err != nil {
			cleanup = err
		}
	}
	if staged.backupPath != "" {
		if err := removeIfPresent(staged.backupPath); err != nil && cleanup == nil {
			cleanup = err
		}
	}
	return cleanup
}

func (document *Document) replacer() replaceFunc {
	if document.replace == nil {
		return os.Rename
	}
	return document.replace
}

func projectDirectory(projectPath string) (string, error) {
	if strings.TrimSpace(projectPath) == "" {
		return "", ErrProjectPathRequired
	}
	resolvedPath, err := filepath.Abs(projectPath)
	if err != nil {
		return "", fmt.Errorf("resolve project path: %w", err)
	}
	directory := filepath.Dir(resolvedPath)
	info, err := os.Stat(directory)
	if err != nil {
		return "", fmt.Errorf("stat project directory: %w", err)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("project directory %q is not a directory", directory)
	}
	return directory, nil
}

func stageFileCopy(directory string, sourcePath string) (string, error) {
	source, err := os.Open(sourcePath)
	if err != nil {
		return "", fmt.Errorf("open generated materialization backup source: %w", err)
	}
	defer source.Close()
	temporary, err := os.CreateTemp(directory, ".setta-python-canvas-backup-*")
	if err != nil {
		return "", fmt.Errorf("stage generated materialization backup: %w", err)
	}
	temporaryPath := temporary.Name()
	committed := false
	defer func() {
		if !committed {
			_ = temporary.Close()
			_ = os.Remove(temporaryPath)
		}
	}()
	if err := temporary.Chmod(0o600); err != nil {
		return "", fmt.Errorf("protect generated materialization backup: %w", err)
	}
	if _, err := io.Copy(temporary, source); err != nil {
		return "", fmt.Errorf("copy generated materialization backup: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		return "", fmt.Errorf("sync generated materialization backup: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return "", fmt.Errorf("close generated materialization backup: %w", err)
	}
	committed = true
	return temporaryPath, nil
}

func stageBytes(directory string, pattern string, content []byte) (string, error) {
	temporary, err := os.CreateTemp(directory, pattern)
	if err != nil {
		return "", fmt.Errorf("stage generated materialization: %w", err)
	}
	temporaryPath := temporary.Name()
	committed := false
	defer func() {
		if !committed {
			_ = temporary.Close()
			_ = os.Remove(temporaryPath)
		}
	}()
	if err := temporary.Chmod(0o600); err != nil {
		return "", fmt.Errorf("protect staged generated materialization: %w", err)
	}
	if _, err := temporary.Write(content); err != nil {
		return "", fmt.Errorf("write staged generated materialization: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		return "", fmt.Errorf("sync staged generated materialization: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return "", fmt.Errorf("close staged generated materialization: %w", err)
	}
	committed = true
	return temporaryPath, nil
}

func removeIfPresent(path string) error {
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}
