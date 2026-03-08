package tools

import (
	"context"
	"errors"
	"testing"
)

// Registry registration should normalize metadata, derive search hints from the
// tool name, and keep list output sorted for deterministic later adapters.
func TestRegistryRegisterNormalizesMetadataAndListsSorted(t *testing.T) {
	t.Parallel()

	registry := NewRegistry()
	if _, err := registry.Register(Spec{
		Name:        "setSectionSizes",
		Description: " update section sizes ",
		Metadata: Metadata{
			Kind:       KindDiscoverable,
			AccessType: AccessTypeWrite,
			IDPathsByType: map[IDType][]string{
				IDTypeSection: {" args.sectionId ", "args.otherId", "args.sectionId"},
			},
			ResultIDPathsByType: map[IDType][]string{
				IDTypeSection: {" result.sectionId ", "result.sectionId"},
			},
			SearchTags: []string{"Layout", "layout"},
		},
		Handler: func(context.Context, map[string]any) (any, error) {
			return nil, nil
		},
	}); err != nil {
		t.Fatalf("register setSectionSizes: %v", err)
	}
	if _, err := registry.Register(Spec{
		Name: "listProjects",
		Metadata: Metadata{
			Kind: KindInit,
		},
		Handler: func(context.Context, map[string]any) (any, error) {
			return nil, nil
		},
	}); err != nil {
		t.Fatalf("register listProjects: %v", err)
	}

	registered := registry.List()
	if len(registered) != 2 {
		t.Fatalf("expected two registered tools, got %d", len(registered))
	}
	if registered[0].Name != "listProjects" || registered[1].Name != "setSectionSizes" {
		t.Fatalf("expected sorted list, got %#v", registered)
	}

	tool := registered[1]
	if tool.Metadata.Kind != KindDiscoverable {
		t.Fatalf("expected discoverable kind, got %q", tool.Metadata.Kind)
	}
	if tool.Metadata.AccessType != AccessTypeWrite {
		t.Fatalf("expected write access, got %q", tool.Metadata.AccessType)
	}
	if tool.Metadata.SearchCategory != "sections" {
		t.Fatalf("expected sections category, got %q", tool.Metadata.SearchCategory)
	}
	expectedTags := []string{"layout", "update", "change", "panel", "node"}
	if len(tool.Metadata.SearchTags) != len(expectedTags) {
		t.Fatalf("expected %d search tags, got %#v", len(expectedTags), tool.Metadata.SearchTags)
	}
	for index, tag := range expectedTags {
		if tool.Metadata.SearchTags[index] != tag {
			t.Fatalf("unexpected search tags %#v", tool.Metadata.SearchTags)
		}
	}
	if len(tool.Metadata.IDPathsByType[IDTypeSection]) != 2 {
		t.Fatalf("expected deduped id paths, got %#v", tool.Metadata.IDPathsByType)
	}
	if len(tool.Metadata.ResultIDPathsByType[IDTypeSection]) != 1 || tool.Metadata.ResultIDPathsByType[IDTypeSection][0] != "result.sectionId" {
		t.Fatalf("expected deduped result id paths, got %#v", tool.Metadata.ResultIDPathsByType)
	}
	if tool.Description != "update section sizes" {
		t.Fatalf("expected trimmed description, got %q", tool.Description)
	}
}

// Duplicate names should fail loudly so later MCP adapters do not depend on
// last-write-wins behavior.
func TestRegistryRegisterRejectsDuplicateNames(t *testing.T) {
	t.Parallel()

	registry := NewRegistry()
	handler := func(context.Context, map[string]any) (any, error) {
		return nil, nil
	}
	if _, err := registry.Register(Spec{
		Name: "listProjects",
		Metadata: Metadata{
			Kind: KindInit,
		},
		Handler: handler,
	}); err != nil {
		t.Fatalf("initial register: %v", err)
	}
	if _, err := registry.Register(Spec{
		Name: "listProjects",
		Metadata: Metadata{
			Kind: KindInit,
		},
		Handler: handler,
	}); !errors.Is(err, ErrToolDuplicate) {
		t.Fatalf("expected duplicate registration error, got %v", err)
	}
}

// Lookup results should be defensive copies of metadata so callers cannot
// mutate the registry in place while later adapters are using it.
func TestRegistryLookupReturnsClonedMetadata(t *testing.T) {
	t.Parallel()

	registry := NewRegistry()
	if _, err := registry.Register(Spec{
		Name: "getProjectStateSummary",
		Metadata: Metadata{
			Kind:       KindDiscoverable,
			AccessType: AccessTypeRead,
			ResultIDPathsByType: map[IDType][]string{
				IDTypeSection: {"result.sectionId"},
			},
			ResultFilter: ResultFilterProjectStateSummary,
			SearchTags:   []string{"project"},
		},
		Handler: func(context.Context, map[string]any) (any, error) {
			return nil, nil
		},
	}); err != nil {
		t.Fatalf("register getProjectStateSummary: %v", err)
	}

	first, ok := registry.Lookup("getProjectStateSummary")
	if !ok {
		t.Fatal("expected lookup result")
	}
	first.Metadata.SearchTags[0] = "mutated"
	first.Metadata.ResultIDPathsByType[IDTypeSection][0] = "mutated.resultId"

	second, ok := registry.Lookup("getProjectStateSummary")
	if !ok {
		t.Fatal("expected lookup result")
	}
	if second.Metadata.SearchTags[0] != "project" {
		t.Fatalf("expected cloned search tags, got %#v", second.Metadata.SearchTags)
	}
	if second.Metadata.ResultFilter != ResultFilterProjectStateSummary {
		t.Fatalf("expected cloned result filter, got %q", second.Metadata.ResultFilter)
	}
	if second.Metadata.ResultIDPathsByType[IDTypeSection][0] != "result.sectionId" {
		t.Fatalf("expected cloned result id paths, got %#v", second.Metadata.ResultIDPathsByType)
	}
}

// Removing tools should update later lookup/list calls without treating missing
// names as fatal.
func TestRegistryRemoveDeletesRegisteredTools(t *testing.T) {
	t.Parallel()

	registry := NewRegistry()
	handler := func(context.Context, map[string]any) (any, error) {
		return nil, nil
	}
	for _, name := range []string{"listProjects", "setSectionSizes"} {
		if _, err := registry.Register(Spec{
			Name: name,
			Metadata: Metadata{
				Kind: KindDiscoverable,
			},
			Handler: handler,
		}); err != nil {
			t.Fatalf("register %s: %v", name, err)
		}
	}

	if !registry.Remove("setSectionSizes", "missing-tool") {
		t.Fatal("expected remove to report a change")
	}
	if _, ok := registry.Lookup("setSectionSizes"); ok {
		t.Fatal("expected removed tool lookup to fail")
	}
	remaining := registry.List()
	if len(remaining) != 1 || remaining[0].Name != "listProjects" {
		t.Fatalf("expected only listProjects to remain, got %#v", remaining)
	}
	if registry.Remove("setSectionSizes") {
		t.Fatal("expected removing an already-missing tool to report no change")
	}
}
