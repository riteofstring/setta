package projectstate

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"

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
		return nil, fmt.Errorf("resolve project store path: %w", err)
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
	return s.loadDocument(ctx, true)
}

func (s *Store) LoadRaw(ctx context.Context) (Document, error) {
	return s.loadDocument(ctx, false)
}

func (s *Store) loadDocument(ctx context.Context, normalize bool) (Document, error) {
	if s == nil {
		return Document{}, fmt.Errorf("project store is required")
	}

	unlock, err := s.locker.Lock(ctx, s.path)
	if err != nil {
		return Document{}, fmt.Errorf("lock project store for load: %w", err)
	}
	defer unlock()

	content, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return NewDocument(), nil
		}
		return Document{}, fmt.Errorf("read project document: %w", err)
	}

	var rawPayload any
	if err := json.Unmarshal(content, &rawPayload); err != nil {
		return Document{}, fmt.Errorf("decode project document: %w", err)
	}
	if _, ok := rawPayload.(map[string]any); !ok {
		return Document{}, ErrProjectPayloadNotObject
	}
	if normalize {
		payloadObject := rawPayload.(map[string]any)
		if err := validatePersistedProjectChatWindowingPresence(payloadObject); err != nil {
			return Document{}, err
		}
	}
	var document Document
	if err := json.Unmarshal(content, &document); err != nil {
		return Document{}, fmt.Errorf("decode project document: %w", err)
	}
	if !normalize {
		return document, nil
	}
	if err := validateLoadedDocumentRequiresNoRepair(document); err != nil {
		return Document{}, err
	}
	normalized, err := document.Normalized()
	if err != nil {
		return Document{}, err
	}
	return normalized, nil
}

func (s *Store) Save(ctx context.Context, document Document) error {
	if s == nil {
		return fmt.Errorf("project store is required")
	}

	normalized, err := document.Normalized()
	if err != nil {
		return err
	}

	unlock, err := s.locker.Lock(ctx, s.path)
	if err != nil {
		return fmt.Errorf("lock project store for save: %w", err)
	}
	defer unlock()

	content, err := json.MarshalIndent(normalized, "", "  ")
	if err != nil {
		return fmt.Errorf("encode project document: %w", err)
	}
	content = append(content, '\n')
	if err := statefs.AtomicWriteFile(s.path, content, defaultFileMode); err != nil {
		return fmt.Errorf("write project document: %w", err)
	}
	return nil
}

func validatePersistedProjectChatWindowingPresence(rawPayload map[string]any) error {
	rawProjects, ok := rawPayload["projects"]
	if !ok {
		return nil
	}
	projects, ok := rawProjects.(map[string]any)
	if !ok {
		return nil
	}

	missingProjectIDs := make([]string, 0)
	for projectID, rawProject := range projects {
		project, ok := rawProject.(map[string]any)
		if !ok {
			continue
		}
		rawWindowing, ok := project["projectChatWindowing"]
		if !ok || rawWindowing == nil {
			missingProjectIDs = append(missingProjectIDs, projectID)
		}
	}
	if len(missingProjectIDs) == 0 {
		return nil
	}

	sort.Strings(missingProjectIDs)
	return fmt.Errorf(
		"%w: %s",
		ErrProjectChatWindowingRequired,
		strings.Join(missingProjectIDs, ", "),
	)
}

func validateLoadedDocumentRequiresNoRepair(document Document) error {
	for projectID, project := range document.Projects {
		if err := project.validateViewModesOnLoad(); err != nil {
			return fmt.Errorf("persisted project %q: %w", projectID, err)
		}
		if err := validateActiveIDsOnLoad(project.ActiveIDs, project.Sections); err != nil {
			return fmt.Errorf("persisted project %q: %w", projectID, err)
		}
		if err := validateWindowSpacesOnLoad(project.WindowSpaces, project.Sections); err != nil {
			return fmt.Errorf("persisted project %q: %w", projectID, err)
		}
		if err := validateProjectChatWindowingStateOnLoad(project.ProjectChatWindowing, project.Sections); err != nil {
			return fmt.Errorf("persisted project %q: %w", projectID, err)
		}
	}
	return nil
}

func hasDuplicateWindowSpaceSortIndices(windowSpaces map[string]WindowSpaceConfig) bool {
	if len(windowSpaces) < 2 {
		return false
	}

	seen := make(map[int]struct{}, len(windowSpaces))
	for _, windowSpace := range windowSpaces {
		if _, ok := seen[windowSpace.SortIndex]; ok {
			return true
		}
		seen[windowSpace.SortIndex] = struct{}{}
	}
	return false
}
