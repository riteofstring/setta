package projectstate

import (
	"bytes"
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
	windowSpaceOrderByProjectID, err := extractPersistedWindowSpaceOrder(content)
	if err != nil {
		return Document{}, fmt.Errorf("decode persisted window-space order: %w", err)
	}

	var document Document
	if err := json.Unmarshal(content, &document); err != nil {
		return Document{}, fmt.Errorf("decode project document: %w", err)
	}
	if !normalize {
		return document, nil
	}
	normalized, err := document.Normalized()
	if err != nil {
		return Document{}, err
	}
	return repairLoadedWindowSpaceSortIndices(
		normalized,
		windowSpaceOrderByProjectID,
	), nil
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

func extractPersistedWindowSpaceOrder(content []byte) (map[string][]string, error) {
	decoder := json.NewDecoder(bytes.NewReader(content))
	token, err := decoder.Token()
	if err != nil {
		return nil, err
	}
	delimiter, ok := token.(json.Delim)
	if !ok || delimiter != '{' {
		return nil, fmt.Errorf("expected top-level JSON object")
	}

	orders := map[string][]string{}
	for decoder.More() {
		keyToken, err := decoder.Token()
		if err != nil {
			return nil, err
		}
		key, ok := keyToken.(string)
		if !ok {
			return nil, fmt.Errorf("expected object key, got %T", keyToken)
		}
		if key != "projects" {
			if err := skipJSONValue(decoder); err != nil {
				return nil, err
			}
			continue
		}
		projectOrders, err := decodeProjectWindowSpaceOrders(decoder)
		if err != nil {
			return nil, err
		}
		for projectID, order := range projectOrders {
			orders[projectID] = order
		}
	}
	if _, err := decoder.Token(); err != nil {
		return nil, err
	}
	return orders, nil
}

func decodeProjectWindowSpaceOrders(decoder *json.Decoder) (map[string][]string, error) {
	token, err := decoder.Token()
	if err != nil {
		return nil, err
	}
	if token == nil {
		return nil, nil
	}
	delimiter, ok := token.(json.Delim)
	if !ok || delimiter != '{' {
		return nil, fmt.Errorf("expected projects object")
	}

	orders := map[string][]string{}
	for decoder.More() {
		projectKeyToken, err := decoder.Token()
		if err != nil {
			return nil, err
		}
		projectID, ok := projectKeyToken.(string)
		if !ok {
			return nil, fmt.Errorf("expected project id key, got %T", projectKeyToken)
		}
		windowSpaceOrder, err := decodeSingleProjectWindowSpaceOrder(decoder)
		if err != nil {
			return nil, err
		}
		if len(windowSpaceOrder) != 0 {
			orders[projectID] = windowSpaceOrder
		}
	}
	if _, err := decoder.Token(); err != nil {
		return nil, err
	}
	return orders, nil
}

func decodeSingleProjectWindowSpaceOrder(decoder *json.Decoder) ([]string, error) {
	token, err := decoder.Token()
	if err != nil {
		return nil, err
	}
	if token == nil {
		return nil, nil
	}
	delimiter, ok := token.(json.Delim)
	if !ok || delimiter != '{' {
		return nil, fmt.Errorf("expected project object")
	}

	var windowSpaceOrder []string
	for decoder.More() {
		fieldToken, err := decoder.Token()
		if err != nil {
			return nil, err
		}
		fieldName, ok := fieldToken.(string)
		if !ok {
			return nil, fmt.Errorf("expected project field key, got %T", fieldToken)
		}
		if fieldName != "windowSpaces" {
			if err := skipJSONValue(decoder); err != nil {
				return nil, err
			}
			continue
		}
		windowSpaceOrder, err = decodeOrderedObjectKeys(decoder)
		if err != nil {
			return nil, err
		}
	}
	if _, err := decoder.Token(); err != nil {
		return nil, err
	}
	return windowSpaceOrder, nil
}

func decodeOrderedObjectKeys(decoder *json.Decoder) ([]string, error) {
	token, err := decoder.Token()
	if err != nil {
		return nil, err
	}
	if token == nil {
		return nil, nil
	}
	delimiter, ok := token.(json.Delim)
	if !ok || delimiter != '{' {
		return nil, fmt.Errorf("expected object value")
	}

	keys := make([]string, 0)
	for decoder.More() {
		keyToken, err := decoder.Token()
		if err != nil {
			return nil, err
		}
		key, ok := keyToken.(string)
		if !ok {
			return nil, fmt.Errorf("expected object key, got %T", keyToken)
		}
		keys = append(keys, key)
		if err := skipJSONValue(decoder); err != nil {
			return nil, err
		}
	}
	if _, err := decoder.Token(); err != nil {
		return nil, err
	}
	return keys, nil
}

func skipJSONValue(decoder *json.Decoder) error {
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	delimiter, ok := token.(json.Delim)
	if !ok {
		return nil
	}
	switch delimiter {
	case '{':
		for decoder.More() {
			if _, err := decoder.Token(); err != nil {
				return err
			}
			if err := skipJSONValue(decoder); err != nil {
				return err
			}
		}
		_, err := decoder.Token()
		return err
	case '[':
		for decoder.More() {
			if err := skipJSONValue(decoder); err != nil {
				return err
			}
		}
		_, err := decoder.Token()
		return err
	default:
		return nil
	}
}

func repairLoadedWindowSpaceSortIndices(
	document Document,
	windowSpaceOrderByProjectID map[string][]string,
) Document {
	if len(windowSpaceOrderByProjectID) == 0 {
		return document
	}

	repaired := document
	for projectID, persistedOrder := range windowSpaceOrderByProjectID {
		project, ok := repaired.Projects[projectID]
		if !ok || !hasDuplicateWindowSpaceSortIndices(project.WindowSpaces) {
			continue
		}

		orderedWindowSpaceIDs := make([]string, 0, len(project.WindowSpaces))
		seen := map[string]struct{}{}
		for _, windowSpaceID := range persistedOrder {
			if _, ok := project.WindowSpaces[windowSpaceID]; !ok {
				continue
			}
			if _, alreadySeen := seen[windowSpaceID]; alreadySeen {
				continue
			}
			seen[windowSpaceID] = struct{}{}
			orderedWindowSpaceIDs = append(orderedWindowSpaceIDs, windowSpaceID)
		}
		for _, windowSpaceID := range sortedWindowSpaceIDs(project.WindowSpaces) {
			if _, alreadySeen := seen[windowSpaceID]; alreadySeen {
				continue
			}
			seen[windowSpaceID] = struct{}{}
			orderedWindowSpaceIDs = append(orderedWindowSpaceIDs, windowSpaceID)
		}
		for index, windowSpaceID := range orderedWindowSpaceIDs {
			windowSpace := project.WindowSpaces[windowSpaceID]
			windowSpace.SortIndex = index
			project.WindowSpaces[windowSpaceID] = windowSpace
		}
		repaired.Projects[projectID] = project
	}
	return repaired
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
