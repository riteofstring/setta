package content

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/setta/realtime/backend/internal/contracts"
)

const (
	MaximumBytes        int64 = 256 << 20
	MaximumSessionBytes int64 = 512 << 20
	MaximumRecords            = 1024
)

var (
	ErrClosed   = errors.New("content: store is closed")
	ErrTooLarge = errors.New("content: value exceeds the byte limit")
	ErrNotFound = errors.New("content: value was not found")
	ErrCapacity = errors.New("content: session capacity is exhausted")
)

type record struct {
	reference contracts.ContentReference
	path      string
}

type Store struct {
	mu      sync.Mutex
	root    string
	records map[string]record
	bytes   int64
	closed  bool
}

func Open(parent string) (*Store, error) {
	if strings.TrimSpace(parent) == "" || parent != strings.TrimSpace(parent) || strings.ContainsRune(parent, '\x00') {
		return nil, errors.New("content: parent directory is invalid")
	}
	resolved, err := filepath.Abs(parent)
	if err != nil {
		return nil, fmt.Errorf("content: resolve parent: %w", err)
	}
	if err := os.MkdirAll(resolved, 0o755); err != nil {
		return nil, fmt.Errorf("content: create parent: %w", err)
	}
	root, err := os.MkdirTemp(resolved, ".runtime-content-")
	if err != nil {
		return nil, fmt.Errorf("content: create session store: %w", err)
	}
	return &Store{root: root, records: make(map[string]record)}, nil
}

func (store *Store) Put(invocationID string, mediaType string, source io.Reader) (contracts.ContentReference, error) {
	if err := validatePut(invocationID, mediaType, source); err != nil {
		return contracts.ContentReference{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	return store.putLocked(invocationID, mediaType, source)
}

func validatePut(invocationID string, mediaType string, source io.Reader) error {
	if source == nil {
		return errors.New("content: source is required")
	}
	if !validScope(invocationID) {
		return errors.New("content: invocation id is invalid")
	}
	if strings.TrimSpace(mediaType) == "" || mediaType != strings.TrimSpace(mediaType) || strings.ContainsAny(mediaType, "\r\n") {
		return errors.New("content: media type is invalid")
	}
	return nil
}

func (store *Store) putLocked(invocationID string, mediaType string, source io.Reader) (contracts.ContentReference, error) {
	if store.closed {
		return contracts.ContentReference{}, ErrClosed
	}
	id, err := randomID()
	if err != nil {
		return contracts.ContentReference{}, err
	}
	file, err := os.CreateTemp(store.root, ".upload-")
	if err != nil {
		return contracts.ContentReference{}, fmt.Errorf("content: stage value: %w", err)
	}
	temporary := file.Name()
	defer os.Remove(temporary)
	reference, err := store.writeContent(file, id, invocationID, mediaType, source)
	if err != nil {
		return contracts.ContentReference{}, err
	}
	finalPath := filepath.Join(store.root, id+".content")
	if err := os.Rename(temporary, finalPath); err != nil {
		return contracts.ContentReference{}, fmt.Errorf("content: install value: %w", err)
	}
	if err := reference.Validate(); err != nil {
		_ = os.Remove(finalPath)
		return contracts.ContentReference{}, err
	}
	store.records[id] = record{reference: reference, path: finalPath}
	store.bytes += reference.ByteLength
	return reference, nil
}

func (store *Store) writeContent(file *os.File, id string, invocationID string, mediaType string, source io.Reader) (contracts.ContentReference, error) {
	hash := sha256.New()
	written, copyErr := io.Copy(io.MultiWriter(file, hash), io.LimitReader(source, MaximumBytes+1))
	if copyErr != nil {
		_ = file.Close()
		return contracts.ContentReference{}, fmt.Errorf("content: write value: %w", copyErr)
	}
	if written > MaximumBytes {
		_ = file.Close()
		return contracts.ContentReference{}, ErrTooLarge
	}
	if len(store.records) >= MaximumRecords || store.bytes+written > MaximumSessionBytes {
		_ = file.Close()
		return contracts.ContentReference{}, ErrCapacity
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return contracts.ContentReference{}, fmt.Errorf("content: sync value: %w", err)
	}
	if err := file.Close(); err != nil {
		return contracts.ContentReference{}, fmt.Errorf("content: close value: %w", err)
	}
	return contracts.ContentReference{
		ID: id, MediaType: mediaType, ByteLength: written, SHA256: hex.EncodeToString(hash.Sum(nil)), InvocationID: invocationID,
	}, nil
}

func (store *Store) Open(reference contracts.ContentReference) (io.ReadCloser, error) {
	if err := reference.Validate(); err != nil {
		return nil, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.closed {
		return nil, ErrClosed
	}
	record, exists := store.records[reference.ID]
	if !exists || record.reference != reference {
		return nil, ErrNotFound
	}
	file, err := os.Open(record.path)
	if err != nil {
		return nil, ErrNotFound
	}
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() != reference.ByteLength {
		_ = file.Close()
		return nil, ErrNotFound
	}
	return file, nil
}

func (store *Store) OpenID(id string) (contracts.ContentReference, io.ReadCloser, error) {
	if !validScope(id) {
		return contracts.ContentReference{}, nil, ErrNotFound
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.closed {
		return contracts.ContentReference{}, nil, ErrClosed
	}
	record, exists := store.records[id]
	if !exists {
		return contracts.ContentReference{}, nil, ErrNotFound
	}
	file, err := os.Open(record.path)
	if err != nil {
		return contracts.ContentReference{}, nil, ErrNotFound
	}
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() != record.reference.ByteLength {
		_ = file.Close()
		return contracts.ContentReference{}, nil, ErrNotFound
	}
	return record.reference, file, nil
}

func (store *Store) CloneForInvocation(reference contracts.ContentReference, invocationID string) (contracts.ContentReference, error) {
	reader, err := store.Open(reference)
	if err != nil {
		return contracts.ContentReference{}, err
	}
	defer reader.Close()
	return store.Put(invocationID, reference.MediaType, reader)
}

func (store *Store) DeleteInvocation(invocationID string) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.closed {
		return ErrClosed
	}
	for id, record := range store.records {
		if record.reference.InvocationID == invocationID {
			if err := os.Remove(record.path); err != nil && !errors.Is(err, os.ErrNotExist) {
				return fmt.Errorf("content: remove value: %w", err)
			}
			store.bytes -= record.reference.ByteLength
			delete(store.records, id)
		}
	}
	return nil
}

func (store *Store) DeleteReferences(references []contracts.ContentReference) error {
	for _, reference := range references {
		if err := reference.Validate(); err != nil {
			return err
		}
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.closed {
		return ErrClosed
	}
	for _, reference := range references {
		record, exists := store.records[reference.ID]
		if !exists || record.reference != reference {
			continue
		}
		if err := os.Remove(record.path); err != nil && !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("content: remove value: %w", err)
		}
		store.bytes -= record.reference.ByteLength
		delete(store.records, reference.ID)
	}
	return nil
}

func (store *Store) Close() error {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.closed {
		return nil
	}
	store.closed = true
	store.records = nil
	store.bytes = 0
	if err := os.RemoveAll(store.root); err != nil {
		return fmt.Errorf("content: remove session store: %w", err)
	}
	return nil
}

func randomID() (string, error) {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return "", fmt.Errorf("content: generate identity: %w", err)
	}
	return "content-" + hex.EncodeToString(value), nil
}

func validScope(value string) bool {
	if len(value) < 1 || len(value) > 128 {
		return false
	}
	for index, character := range value {
		if index == 0 && !letterOrDigit(character) {
			return false
		}
		if !letterOrDigit(character) && character != '.' && character != '_' && character != ':' && character != '-' {
			return false
		}
	}
	return true
}

func letterOrDigit(value rune) bool {
	return value >= 'a' && value <= 'z' || value >= 'A' && value <= 'Z' || value >= '0' && value <= '9'
}
