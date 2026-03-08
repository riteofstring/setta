package binary

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/statefs"
)

const (
	FolderName             = "binary"
	DefaultMaxUploadBytes  = 32 * 1024 * 1024
	defaultMetadataMode    = 0o644
	defaultPayloadFileMode = 0o644
)

var (
	ErrContentIDRequired = errors.New("binary: content id is required")
	ErrInvalidContentID  = errors.New("binary: invalid content id")
	ErrPayloadNotFound   = errors.New("binary: payload not found")
)

type PayloadTooLargeError struct {
	MaxBytes      int64
	ObservedBytes int64
}

func (e *PayloadTooLargeError) Error() string {
	return fmt.Sprintf("Binary payload is too large. Maximum size is %d bytes.", e.MaxBytes)
}

type ContentRef struct {
	ContentID  string `json:"contentId"`
	ByteLength int64  `json:"byteLength"`
	MimeType   string `json:"mimeType,omitempty"`
	SHA256     string `json:"sha256,omitempty"`
}

type Store struct {
	root string
}

type metadataPayload struct {
	ByteLength int64  `json:"byteLength"`
	MimeType   string `json:"mimeType,omitempty"`
	SHA256     string `json:"sha256,omitempty"`
	Durable    bool   `json:"durable"`
}

func NewStore(root string) (*Store, error) {
	resolvedRoot, err := statefs.NormalizePath(root, "")
	if err != nil {
		return nil, fmt.Errorf("resolve binary root: %w", err)
	}
	if err := os.MkdirAll(resolvedRoot, 0o755); err != nil {
		return nil, fmt.Errorf("create binary root: %w", err)
	}
	return &Store{root: resolvedRoot}, nil
}

func NewStoreForRuntimeRoot(runtimeRoot string) (*Store, error) {
	resolvedRuntimeRoot, err := statefs.NormalizePath(runtimeRoot, "")
	if err != nil {
		return nil, fmt.Errorf("resolve runtime root: %w", err)
	}
	return NewStore(filepath.Join(resolvedRuntimeRoot, FolderName))
}

func (s *Store) Root() string {
	if s == nil {
		return ""
	}
	return s.root
}

func (s *Store) StoreBytes(payload []byte, mimeType string, durable bool) (ContentRef, error) {
	return s.StoreStream(bytes.NewReader(payload), mimeType, durable, int64(len(payload)))
}

func (s *Store) StoreStream(reader io.Reader, mimeType string, durable bool, maxBytes int64) (ContentRef, error) {
	if s == nil {
		return ContentRef{}, fmt.Errorf("binary store is required")
	}
	if reader == nil {
		return ContentRef{}, fmt.Errorf("binary reader is required")
	}
	if maxBytes <= 0 {
		maxBytes = DefaultMaxUploadBytes
	}

	contentID, err := newContentID()
	if err != nil {
		return ContentRef{}, err
	}
	targetPath := s.contentPath(contentID)

	if err := os.MkdirAll(s.root, 0o755); err != nil {
		return ContentRef{}, fmt.Errorf("create binary root: %w", err)
	}

	tmpFile, err := os.CreateTemp(s.root, ".setta-binary-*")
	if err != nil {
		return ContentRef{}, fmt.Errorf("create temp binary file: %w", err)
	}
	tmpPath := tmpFile.Name()
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.Remove(tmpPath)
		}
	}()

	hasher := sha256.New()
	writer := io.MultiWriter(tmpFile, hasher)

	buffer := make([]byte, 64*1024)
	var total int64
	for {
		n, readErr := reader.Read(buffer)
		if n > 0 {
			total += int64(n)
			if total > maxBytes {
				_ = tmpFile.Close()
				return ContentRef{}, &PayloadTooLargeError{
					MaxBytes:      maxBytes,
					ObservedBytes: total,
				}
			}
			if _, err := writer.Write(buffer[:n]); err != nil {
				_ = tmpFile.Close()
				return ContentRef{}, fmt.Errorf("write binary payload: %w", err)
			}
		}
		if errors.Is(readErr, io.EOF) {
			break
		}
		if readErr != nil {
			_ = tmpFile.Close()
			return ContentRef{}, fmt.Errorf("read binary payload: %w", readErr)
		}
	}

	if err := tmpFile.Close(); err != nil {
		return ContentRef{}, fmt.Errorf("close temp binary file: %w", err)
	}
	if err := os.Chmod(tmpPath, defaultPayloadFileMode); err != nil {
		return ContentRef{}, fmt.Errorf("chmod temp binary file: %w", err)
	}
	if err := os.Rename(tmpPath, targetPath); err != nil {
		return ContentRef{}, fmt.Errorf("store binary payload: %w", err)
	}
	cleanup = false

	ref := ContentRef{
		ContentID:  contentID,
		ByteLength: total,
		MimeType:   strings.TrimSpace(mimeType),
		SHA256:     hex.EncodeToString(hasher.Sum(nil)),
	}
	if err := s.writeMetadata(ref, durable); err != nil {
		return ContentRef{}, err
	}
	return ref, nil
}

func (s *Store) ReadBytes(contentID string) ([]byte, error) {
	if s == nil {
		return nil, fmt.Errorf("binary store is required")
	}
	normalizedID, err := normalizeContentID(contentID)
	if err != nil {
		return nil, err
	}
	payload, err := os.ReadFile(s.contentPath(normalizedID))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("%w: %q", ErrPayloadNotFound, normalizedID)
		}
		return nil, fmt.Errorf("read binary payload: %w", err)
	}
	return payload, nil
}

func (s *Store) Delete(contentID string) error {
	if s == nil {
		return fmt.Errorf("binary store is required")
	}
	normalizedID, err := normalizeContentID(contentID)
	if err != nil {
		return err
	}
	_ = os.Remove(s.contentPath(normalizedID))
	_ = os.Remove(s.metadataPath(normalizedID))
	return nil
}

func (s *Store) ResolveRef(contentID string) (ContentRef, error) {
	if s == nil {
		return ContentRef{}, fmt.Errorf("binary store is required")
	}
	normalizedID, err := normalizeContentID(contentID)
	if err != nil {
		return ContentRef{}, err
	}
	content, err := os.ReadFile(s.metadataPath(normalizedID))
	if err != nil {
		if os.IsNotExist(err) {
			return ContentRef{}, fmt.Errorf("%w: %q", ErrPayloadNotFound, normalizedID)
		}
		return ContentRef{}, fmt.Errorf("read binary metadata: %w", err)
	}

	var metadata metadataPayload
	if err := json.Unmarshal(content, &metadata); err != nil {
		return ContentRef{}, fmt.Errorf("decode binary metadata: %w", err)
	}
	return ContentRef{
		ContentID:  normalizedID,
		ByteLength: metadata.ByteLength,
		MimeType:   metadata.MimeType,
		SHA256:     metadata.SHA256,
	}, nil
}

func (s *Store) ResolvePath(contentID string) (string, error) {
	if s == nil {
		return "", fmt.Errorf("binary store is required")
	}
	normalizedID, err := normalizeContentID(contentID)
	if err != nil {
		return "", err
	}
	path := s.contentPath(normalizedID)
	if _, err := os.Stat(path); err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("%w: %q", ErrPayloadNotFound, normalizedID)
		}
		return "", fmt.Errorf("stat binary payload: %w", err)
	}
	return path, nil
}

func (s *Store) writeMetadata(ref ContentRef, durable bool) error {
	payload := metadataPayload{
		ByteLength: ref.ByteLength,
		MimeType:   ref.MimeType,
		SHA256:     ref.SHA256,
		Durable:    durable,
	}
	content, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encode binary metadata: %w", err)
	}
	if err := statefs.AtomicWriteFile(s.metadataPath(ref.ContentID), content, defaultMetadataMode); err != nil {
		return fmt.Errorf("write binary metadata: %w", err)
	}
	return nil
}

func (s *Store) contentPath(contentID string) string {
	return filepath.Join(s.root, contentID)
}

func (s *Store) metadataPath(contentID string) string {
	return filepath.Join(s.root, contentID+".json")
}

func normalizeContentID(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", ErrContentIDRequired
	}
	if trimmed == "." || trimmed == ".." || strings.Contains(trimmed, "/") || strings.Contains(trimmed, `\`) {
		return "", fmt.Errorf("%w: %q", ErrInvalidContentID, raw)
	}
	return trimmed, nil
}

func newContentID() (string, error) {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return "", fmt.Errorf("generate content id: %w", err)
	}
	return hex.EncodeToString(buffer), nil
}
