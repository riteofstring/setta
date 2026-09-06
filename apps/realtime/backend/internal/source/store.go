package source

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"unicode/utf8"

	"github.com/setta/realtime/backend/internal/contracts"
)

const MaximumBytes = 1 << 20

var (
	ErrConflict    = errors.New("source: version conflict")
	ErrInvalidText = errors.New("source: text is invalid")
	ErrTooLarge    = errors.New("source: text exceeds the byte limit")
	ErrUnavailable = errors.New("source: entrypoint is unavailable")
)

type Store struct {
	mu   sync.Mutex
	root string
}

type currentFile struct {
	path    string
	mode    os.FileMode
	content []byte
}

func Open(projectRoot string) (*Store, error) {
	if strings.TrimSpace(projectRoot) == "" || projectRoot != strings.TrimSpace(projectRoot) || !filepath.IsAbs(projectRoot) || strings.ContainsRune(projectRoot, '\x00') {
		return nil, ErrUnavailable
	}
	resolved, err := filepath.EvalSymlinks(filepath.Clean(projectRoot))
	if err != nil {
		return nil, fmt.Errorf("%w: resolve project root", ErrUnavailable)
	}
	information, err := os.Stat(resolved)
	if err != nil || !information.IsDir() {
		return nil, ErrUnavailable
	}
	return &Store{root: resolved}, nil
}

func (store *Store) Read(project contracts.Project) (contracts.RuntimeSourceDocument, error) {
	if store == nil {
		return contracts.RuntimeSourceDocument{}, ErrUnavailable
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	current, err := store.readCurrent(project.Runtime)
	if err != nil {
		return contracts.RuntimeSourceDocument{}, err
	}
	return sourceDocument(project, current.content), nil
}

func (store *Store) Apply(project contracts.Project, request contracts.ApplyRuntimeSourceRequest) (contracts.RuntimeSourceDocument, error) {
	if store == nil {
		return contracts.RuntimeSourceDocument{}, ErrUnavailable
	}
	if err := validateSource([]byte(request.Source)); err != nil {
		return contracts.RuntimeSourceDocument{}, err
	}
	if err := request.Validate(); err != nil {
		return contracts.RuntimeSourceDocument{}, err
	}
	if request.ProjectID != project.ID || request.Entrypoint != project.Runtime.Entrypoint {
		return contracts.RuntimeSourceDocument{}, ErrConflict
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	current, err := store.readCurrent(project.Runtime)
	if err != nil {
		return contracts.RuntimeSourceDocument{}, err
	}
	if sourceVersion(current.content) != request.ExpectedVersion {
		return contracts.RuntimeSourceDocument{}, ErrConflict
	}
	if err := store.replace(current, request.ExpectedVersion, []byte(request.Source)); err != nil {
		return contracts.RuntimeSourceDocument{}, err
	}
	return sourceDocument(project, []byte(request.Source)), nil
}

func (store *Store) readCurrent(declaration contracts.RuntimeDeclaration) (currentFile, error) {
	path, information, err := store.resolve(declaration)
	if err != nil {
		return currentFile{}, err
	}
	file, err := os.Open(path)
	if err != nil {
		return currentFile{}, ErrUnavailable
	}
	defer file.Close()
	opened, err := file.Stat()
	if err != nil || !opened.Mode().IsRegular() || !os.SameFile(information, opened) {
		return currentFile{}, ErrUnavailable
	}
	content, err := io.ReadAll(io.LimitReader(file, MaximumBytes+1))
	if err != nil {
		return currentFile{}, fmt.Errorf("%w: read entrypoint", ErrUnavailable)
	}
	if err := validateSource(content); err != nil {
		return currentFile{}, err
	}
	return currentFile{path: path, mode: opened.Mode().Perm(), content: content}, nil
}

func (store *Store) resolve(declaration contracts.RuntimeDeclaration) (string, os.FileInfo, error) {
	if err := declaration.Validate(); err != nil {
		return "", nil, err
	}
	path := filepath.Join(store.root, declaration.Entrypoint)
	if !withinRoot(store.root, path) {
		return "", nil, ErrUnavailable
	}
	current := store.root
	parts := strings.Split(declaration.Entrypoint, string(filepath.Separator))
	for index, part := range parts {
		current = filepath.Join(current, part)
		information, err := os.Lstat(current)
		if err != nil || information.Mode()&os.ModeSymlink != 0 {
			return "", nil, ErrUnavailable
		}
		if index < len(parts)-1 && !information.IsDir() {
			return "", nil, ErrUnavailable
		}
		if index == len(parts)-1 {
			if !information.Mode().IsRegular() {
				return "", nil, ErrUnavailable
			}
			return current, information, nil
		}
	}
	return "", nil, ErrUnavailable
}

func (store *Store) replace(current currentFile, expectedVersion string, content []byte) error {
	file, err := os.CreateTemp(filepath.Dir(current.path), ".setta-runtime-source-*")
	if err != nil {
		return fmt.Errorf("source: stage replacement: %w", err)
	}
	temporary := file.Name()
	defer os.Remove(temporary)
	if err := file.Chmod(current.mode); err != nil {
		_ = file.Close()
		return fmt.Errorf("source: set replacement mode: %w", err)
	}
	if _, err := file.Write(content); err != nil {
		_ = file.Close()
		return fmt.Errorf("source: write replacement: %w", err)
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return fmt.Errorf("source: sync replacement: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("source: close replacement: %w", err)
	}
	latest, err := store.readPath(current.path)
	if err != nil {
		return err
	}
	if sourceVersion(latest) != expectedVersion {
		return ErrConflict
	}
	if err := os.Rename(temporary, current.path); err != nil {
		return fmt.Errorf("source: install replacement: %w", err)
	}
	return syncDirectory(filepath.Dir(current.path))
}

func (store *Store) readPath(path string) ([]byte, error) {
	information, err := os.Lstat(path)
	if err != nil || information.Mode()&os.ModeSymlink != 0 || !information.Mode().IsRegular() {
		return nil, ErrUnavailable
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, ErrUnavailable
	}
	defer file.Close()
	opened, err := file.Stat()
	if err != nil || !opened.Mode().IsRegular() || !os.SameFile(information, opened) {
		return nil, ErrUnavailable
	}
	content, err := io.ReadAll(io.LimitReader(file, MaximumBytes+1))
	if err != nil {
		return nil, fmt.Errorf("%w: read entrypoint", ErrUnavailable)
	}
	if err := validateSource(content); err != nil {
		return nil, err
	}
	return content, nil
}

func sourceDocument(project contracts.Project, content []byte) contracts.RuntimeSourceDocument {
	return contracts.RuntimeSourceDocument{ProjectID: project.ID, Entrypoint: project.Runtime.Entrypoint, Version: sourceVersion(content), Source: string(content)}
}

func sourceVersion(content []byte) string {
	digest := sha256.Sum256(content)
	return hex.EncodeToString(digest[:])
}

func validateSource(content []byte) error {
	if len(content) > MaximumBytes {
		return ErrTooLarge
	}
	if !utf8.Valid(content) || strings.ContainsRune(string(content), '\x00') {
		return ErrInvalidText
	}
	return nil
}

func withinRoot(root string, candidate string) bool {
	relative, err := filepath.Rel(root, candidate)
	return err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))
}

func syncDirectory(path string) error {
	directory, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("source: open directory: %w", err)
	}
	defer directory.Close()
	if err := directory.Sync(); err != nil {
		return fmt.Errorf("source: sync directory: %w", err)
	}
	return nil
}
