package settadocs

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"setta/internal/statefs"
)

var (
	ErrDocsRootRequired = errors.New("settadocs: docs root is required")
	ErrDocsRootNotFound = errors.New("settadocs: docs root was not found")
	ErrDocIDInvalid     = errors.New("settadocs: doc id is invalid")
	ErrDocNotFound      = errors.New("settadocs: doc was not found")
)

var docAliases = map[string]string{
	"examples":                   "reference/setta-listener-examples.md",
	"emit_to_frontend":           "reference/emit_to_frontend.md",
	"hot_reload":                 "reference/setta-listener-hot-reload.md",
	"realtime_behavior":          "reference/setta-realtime-behavior.md",
	"listener_flows":             "reference/listener-flows.md",
	"logging_and_error_handling": "reference/logging-and-error-handling.md",
	"meta_controls":              "reference/meta-controls.md",
}

var defaultDocIDs = []string{
	"examples",
	"emit_to_frontend",
	"hot_reload",
	"realtime_behavior",
}

type Loader struct {
	root string
}

type Entry struct {
	DocID   string `json:"doc_id"`
	Path    string `json:"path"`
	Content string `json:"content"`
}

type Bundle struct {
	Docs          []Entry  `json:"docs"`
	AvailableDocs []string `json:"available_docs"`
}

func NewLoader(root string) (*Loader, error) {
	resolvedRoot, err := statefs.NormalizePath(root, "")
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(resolvedRoot) == "" {
		return nil, ErrDocsRootRequired
	}
	return &Loader{root: resolvedRoot}, nil
}

func (l *Loader) Load(docIDs []string) (Bundle, error) {
	if l == nil || strings.TrimSpace(l.root) == "" {
		return Bundle{}, ErrDocsRootRequired
	}
	if err := l.ensureRoot(); err != nil {
		return Bundle{}, err
	}

	resolvedDocIDs := docIDs
	if len(resolvedDocIDs) == 0 {
		resolvedDocIDs = defaultDocIDs
	}

	docs := make([]Entry, 0, len(resolvedDocIDs))
	for _, docID := range resolvedDocIDs {
		entry, err := l.loadDoc(docID)
		if err != nil {
			return Bundle{}, err
		}
		docs = append(docs, entry)
	}

	availableDocs, err := l.listAvailableDocs()
	if err != nil {
		return Bundle{}, err
	}
	return Bundle{
		Docs:          docs,
		AvailableDocs: availableDocs,
	}, nil
}

func (l *Loader) ensureRoot() error {
	info, err := os.Stat(l.root)
	switch {
	case errors.Is(err, os.ErrNotExist):
		return fmt.Errorf("%w: %s", ErrDocsRootNotFound, l.root)
	case err != nil:
		return fmt.Errorf("stat docs root: %w", err)
	case !info.IsDir():
		return fmt.Errorf("%w: %s", ErrDocsRootNotFound, l.root)
	default:
		return nil
	}
}

func (l *Loader) loadDoc(docID string) (Entry, error) {
	relativePath, err := l.resolveDocRelativePath(docID)
	if err != nil {
		return Entry{}, err
	}

	fullPath := filepath.Join(l.root, filepath.FromSlash(relativePath))
	content, err := os.ReadFile(fullPath)
	switch {
	case errors.Is(err, os.ErrNotExist):
		return Entry{}, fmt.Errorf("%w: %s", ErrDocNotFound, fullPath)
	case err != nil:
		return Entry{}, fmt.Errorf("read docs entry: %w", err)
	}

	return Entry{
		DocID:   docID,
		Path:    filepath.ToSlash(filepath.Join("docs", relativePath)),
		Content: string(content),
	}, nil
}

func (l *Loader) listAvailableDocs() ([]string, error) {
	docIDs := map[string]struct{}{}
	for alias := range docAliases {
		docIDs[alias] = struct{}{}
	}

	if err := filepath.WalkDir(l.root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		if filepath.Ext(path) != ".md" {
			return nil
		}

		relativePath, err := filepath.Rel(l.root, path)
		if err != nil {
			return err
		}
		docIDs[filepath.ToSlash(strings.TrimSuffix(relativePath, filepath.Ext(relativePath)))] = struct{}{}
		return nil
	}); err != nil {
		return nil, fmt.Errorf("walk docs root: %w", err)
	}

	availableDocs := make([]string, 0, len(docIDs))
	for docID := range docIDs {
		availableDocs = append(availableDocs, docID)
	}
	sort.Strings(availableDocs)
	return availableDocs, nil
}

func (l *Loader) resolveDocRelativePath(docID string) (string, error) {
	trimmedDocID := strings.TrimSpace(docID)
	if trimmedDocID == "" {
		return "", fmt.Errorf("%w: doc id must not be empty", ErrDocIDInvalid)
	}
	if aliasPath, ok := docAliases[trimmedDocID]; ok {
		return aliasPath, nil
	}

	candidate := trimmedDocID
	if filepath.Ext(candidate) == "" {
		candidate += ".md"
	}

	if filepath.IsAbs(candidate) {
		return "", fmt.Errorf("%w: doc id must be a relative path: %s", ErrDocIDInvalid, docID)
	}

	resolved, err := statefs.NormalizePath(candidate, l.root)
	if err != nil {
		return "", fmt.Errorf("%w: %s", ErrDocIDInvalid, err.Error())
	}
	resolved, err = statefs.EnsureWithinRoot(l.root, resolved, "docs path")
	if err != nil {
		return "", fmt.Errorf("%w: doc id must resolve under docs/: %s", ErrDocIDInvalid, docID)
	}

	relativePath, err := filepath.Rel(l.root, resolved)
	if err != nil {
		return "", fmt.Errorf("resolve docs relative path: %w", err)
	}
	return filepath.ToSlash(relativePath), nil
}
