package tools

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
)

var (
	ErrToolNameRequired = fmt.Errorf("tools: tool name is required")
	ErrToolDuplicate    = fmt.Errorf("tools: tool already registered")
	ErrToolHandlerNil   = fmt.Errorf("tools: tool handler is required")
)

type Handler func(context.Context, map[string]any) (any, error)

type Spec struct {
	Name        string
	Description string
	Metadata    Metadata
	Handler     Handler
}

type Registered struct {
	Name        string
	Description string
	Metadata    Metadata
	Handler     Handler
}

type Registry struct {
	mu     sync.RWMutex
	byName map[string]Registered
}

func NewRegistry() *Registry {
	return &Registry{
		byName: map[string]Registered{},
	}
}

func (r *Registry) Register(spec Spec) (Registered, error) {
	if r == nil {
		r = NewRegistry()
	}

	name := strings.TrimSpace(spec.Name)
	if name == "" {
		return Registered{}, ErrToolNameRequired
	}
	if spec.Handler == nil {
		return Registered{}, ErrToolHandlerNil
	}
	metadata, err := spec.Metadata.Normalize(name)
	if err != nil {
		return Registered{}, err
	}

	registered := Registered{
		Name:        name,
		Description: strings.TrimSpace(spec.Description),
		Metadata:    metadata,
		Handler:     spec.Handler,
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	if _, exists := r.byName[name]; exists {
		return Registered{}, fmt.Errorf("%w: %s", ErrToolDuplicate, name)
	}
	r.byName[name] = registered
	return registered.clone(), nil
}

func (r *Registry) Lookup(name string) (Registered, bool) {
	if r == nil {
		return Registered{}, false
	}

	r.mu.RLock()
	defer r.mu.RUnlock()
	registered, ok := r.byName[strings.TrimSpace(name)]
	if !ok {
		return Registered{}, false
	}
	return registered.clone(), true
}

func (r *Registry) List() []Registered {
	if r == nil {
		return nil
	}

	r.mu.RLock()
	defer r.mu.RUnlock()

	registered := make([]Registered, 0, len(r.byName))
	for _, tool := range r.byName {
		registered = append(registered, tool.clone())
	}
	sort.Slice(registered, func(left int, right int) bool {
		return registered[left].Name < registered[right].Name
	})
	return registered
}

func (r *Registry) ListByKind(kind Kind) []Registered {
	normalizedKind, err := normalizeKind(kind)
	if err != nil {
		return nil
	}
	registered := r.List()
	filtered := make([]Registered, 0, len(registered))
	for _, tool := range registered {
		if tool.Metadata.Kind != normalizedKind {
			continue
		}
		filtered = append(filtered, tool)
	}
	return filtered
}

func (r *Registry) Remove(names ...string) bool {
	if r == nil || len(names) == 0 {
		return false
	}

	changed := false
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, rawName := range names {
		name := strings.TrimSpace(rawName)
		if name == "" {
			continue
		}
		if _, exists := r.byName[name]; !exists {
			continue
		}
		delete(r.byName, name)
		changed = true
	}
	return changed
}

func (r Registered) clone() Registered {
	return Registered{
		Name:        r.Name,
		Description: r.Description,
		Metadata:    cloneMetadata(r.Metadata),
		Handler:     r.Handler,
	}
}

func cloneMetadata(metadata Metadata) Metadata {
	clonedPaths := make(map[IDType][]string, len(metadata.IDPathsByType))
	for idType, paths := range metadata.IDPathsByType {
		clonedPaths[idType] = append([]string(nil), paths...)
	}
	clonedResultPaths := make(map[IDType][]string, len(metadata.ResultIDPathsByType))
	for idType, paths := range metadata.ResultIDPathsByType {
		clonedResultPaths[idType] = append([]string(nil), paths...)
	}
	var clonedPreview *ToolArgumentPreviewMetadata
	if metadata.ToolArgumentPreview != nil {
		clonedTargetPaths := make(map[IDType][]string, len(metadata.ToolArgumentPreview.TargetIDPathsByType))
		for idType, paths := range metadata.ToolArgumentPreview.TargetIDPathsByType {
			clonedTargetPaths[idType] = append([]string(nil), paths...)
		}
		clonedPreview = &ToolArgumentPreviewMetadata{
			TargetIDPathsByType: clonedTargetPaths,
			PreviewValuePath:    metadata.ToolArgumentPreview.PreviewValuePath,
			PreviewKind:         metadata.ToolArgumentPreview.PreviewKind,
		}
	}
	return Metadata{
		Kind:                          metadata.Kind,
		AccessType:                    metadata.AccessType,
		IDPathsByType:                 clonedPaths,
		ResultIDPathsByType:           clonedResultPaths,
		ToolArgumentPreview:           clonedPreview,
		DefaultTargetSingletonSection: metadata.DefaultTargetSingletonSection,
		ResultFilter:                  metadata.ResultFilter,
		SearchTags:                    append([]string(nil), metadata.SearchTags...),
		SearchCategory:                metadata.SearchCategory,
	}
}
