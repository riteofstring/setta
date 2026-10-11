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

	"github.com/riteofstring/setta/apps/realtime/backend/internal/contracts"
	"github.com/riteofstring/setta/packages/local-backend/projectfs"
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
	root *projectfs.Root
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
	root, err := projectfs.Open(projectRoot)
	if err != nil {
		return nil, fmt.Errorf("%w: resolve project root", ErrUnavailable)
	}
	return &Store{root: root}, nil
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

func (store *Store) Close() error {
	if store == nil {
		return nil
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	return store.root.Close()
}

func (store *Store) readCurrent(declaration contracts.RuntimeDeclaration) (currentFile, error) {
	if err := declaration.Validate(); err != nil {
		return currentFile{}, err
	}
	file, information, err := store.root.OpenRegular(declaration.Entrypoint)
	if err != nil {
		return currentFile{}, ErrUnavailable
	}
	defer file.Close()
	content, err := io.ReadAll(io.LimitReader(file, MaximumBytes+1))
	if err != nil {
		return currentFile{}, fmt.Errorf("%w: read entrypoint", ErrUnavailable)
	}
	if err := validateSource(content); err != nil {
		return currentFile{}, err
	}
	return currentFile{path: declaration.Entrypoint, mode: information.Mode().Perm(), content: content}, nil
}

func (store *Store) replace(current currentFile, expectedVersion string, content []byte) error {
	replacement, err := store.root.StageReplacement(current.path, content, MaximumBytes, current.mode)
	if err != nil {
		return fmt.Errorf("source: stage replacement: %w", err)
	}
	defer replacement.Discard()
	latest, err := store.readPath(current.path)
	if err != nil {
		return err
	}
	if sourceVersion(latest) != expectedVersion {
		return ErrConflict
	}
	if err := replacement.Commit(); err != nil {
		return fmt.Errorf("source: install replacement: %w", err)
	}
	return nil
}

func (store *Store) readPath(path string) ([]byte, error) {
	content, err := store.root.ReadRegular(path, MaximumBytes)
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
