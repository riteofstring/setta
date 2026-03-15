package settingsstate

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"setta/internal/statefs"
)

const defaultFileMode = 0o644

type StoreOptions struct {
	Locker statefs.Locker
}

type Store struct {
	path   string
	locker statefs.Locker
}

func NewStore(path string, opts StoreOptions) (*Store, error) {
	resolvedPath, err := statefs.NormalizePath(path, "")
	if err != nil {
		return nil, fmt.Errorf("resolve settings store path: %w", err)
	}

	locker := opts.Locker
	if locker == nil {
		locker = statefs.NoopLocker{}
	}

	return &Store{
		path:   resolvedPath,
		locker: locker,
	}, nil
}

func (s *Store) Path() string {
	if s == nil {
		return ""
	}
	return s.path
}

func (s *Store) Load(ctx context.Context) (Document, error) {
	if s == nil {
		return nil, fmt.Errorf("settings store is required")
	}

	unlock, err := s.locker.Lock(ctx, s.path)
	if err != nil {
		return nil, fmt.Errorf("lock settings store for load: %w", err)
	}
	defer unlock()

	content, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return DefaultDocument()
		}
		return nil, fmt.Errorf("read settings document: %w", err)
	}

	var raw any
	if err := json.Unmarshal(content, &raw); err != nil {
		return nil, fmt.Errorf("decode settings document: %w", err)
	}

	document, err := NormalizeRaw(raw)
	if err != nil {
		return nil, err
	}
	return document, nil
}

func (s *Store) Save(ctx context.Context, document Document) error {
	if s == nil {
		return fmt.Errorf("settings store is required")
	}

	normalized, err := document.Normalized()
	if err != nil {
		return err
	}

	unlock, err := s.locker.Lock(ctx, s.path)
	if err != nil {
		return fmt.Errorf("lock settings store for save: %w", err)
	}
	defer unlock()

	content, err := json.MarshalIndent(normalized, "", "  ")
	if err != nil {
		return fmt.Errorf("encode settings document: %w", err)
	}
	content = append(content, '\n')
	if err := statefs.AtomicWriteFile(s.path, content, defaultFileMode); err != nil {
		return fmt.Errorf("write settings document: %w", err)
	}
	return nil
}
