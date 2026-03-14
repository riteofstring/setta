package plugins

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"

	"setta/internal/tools"
)

type BackendMCPToolRegistrar interface {
	RegisterMCPTool(context.Context, RegisteredMCPTool) error
}

type RegisteredMCPTool struct {
	PluginID     string
	Name         string
	Description  string
	InputSchema  map[string]any
	OutputSchema map[string]any
	Metadata     tools.Metadata
}

type MCPToolRegistry struct {
	mu            sync.Mutex
	registrations []RegisteredMCPTool
	byName        map[string]RegisteredMCPTool
}

var ErrMCPToolRegistrationConflict = errors.New("plugins: duplicate backend mcp tool registration")

func NewMCPToolRegistry() *MCPToolRegistry {
	return &MCPToolRegistry{
		byName: map[string]RegisteredMCPTool{},
	}
}

func (r *MCPToolRegistry) RegisterMCPTool(_ context.Context, registration RegisteredMCPTool) error {
	if r == nil {
		return ErrWorkerHostMCPToolRegistrarRequired
	}

	name := strings.TrimSpace(registration.Name)
	if name == "" {
		return ErrWorkerHostMCPToolNameRequired
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.byName[name]; exists {
		return fmt.Errorf("%w: %s", ErrMCPToolRegistrationConflict, name)
	}

	cloned := cloneRegisteredMCPTool(registration)
	r.byName[name] = cloned
	r.registrations = append(r.registrations, cloned)
	return nil
}

func (r *MCPToolRegistry) Registrations() []RegisteredMCPTool {
	if r == nil {
		return nil
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	registrations := make([]RegisteredMCPTool, len(r.registrations))
	for index, registration := range r.registrations {
		registrations[index] = cloneRegisteredMCPTool(registration)
	}
	return registrations
}

func cloneRegisteredMCPTool(registration RegisteredMCPTool) RegisteredMCPTool {
	return RegisteredMCPTool{
		PluginID:     strings.TrimSpace(registration.PluginID),
		Name:         strings.TrimSpace(registration.Name),
		Description:  strings.TrimSpace(registration.Description),
		InputSchema:  cloneStringAnyMap(registration.InputSchema),
		OutputSchema: cloneStringAnyMap(registration.OutputSchema),
		Metadata:     cloneRegisteredMCPToolMetadata(registration.Metadata),
	}
}

func cloneRegisteredMCPToolMetadata(metadata tools.Metadata) tools.Metadata {
	cloned := tools.Metadata{
		Kind:                          metadata.Kind,
		AccessType:                    metadata.AccessType,
		DefaultTargetSingletonSection: metadata.DefaultTargetSingletonSection,
		ResultFilter:                  metadata.ResultFilter,
		SearchTags:                    append([]string(nil), metadata.SearchTags...),
		SearchCategory:                metadata.SearchCategory,
	}
	if len(metadata.IDPathsByType) != 0 {
		cloned.IDPathsByType = make(map[tools.IDType][]string, len(metadata.IDPathsByType))
		for idType, paths := range metadata.IDPathsByType {
			cloned.IDPathsByType[idType] = append([]string(nil), paths...)
		}
	}
	if len(metadata.ResultIDPathsByType) != 0 {
		cloned.ResultIDPathsByType = make(map[tools.IDType][]string, len(metadata.ResultIDPathsByType))
		for idType, paths := range metadata.ResultIDPathsByType {
			cloned.ResultIDPathsByType[idType] = append([]string(nil), paths...)
		}
	}
	return cloned
}
