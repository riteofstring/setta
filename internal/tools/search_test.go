package tools

import (
	"reflect"
	"testing"
)

func TestSearchIndexSearchFindsStructuredMatches(t *testing.T) {
	t.Parallel()

	index := BuildSearchIndex([]SearchEntry{
		{
			Name:        "set_section_sizes",
			Description: "Set width and height for sections.",
			Metadata: Metadata{
				SearchCategory: "sections",
				SearchTags:     []string{"layout", "size"},
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"sectionSizes": map[string]any{
						"type":        "object",
						"description": "Map of section ids to width and height values.",
					},
				},
			},
		},
		{
			Name:        "format_code",
			Description: "Format Python code for a code section.",
			Metadata: Metadata{
				SearchCategory: "code",
				SearchTags:     []string{"python", "ruff"},
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Code section id to format.",
					},
				},
			},
		},
		{
			Name:        "get_app_catalog",
			Description: "Return the JSON render catalog used for app generation.",
			Metadata: Metadata{
				SearchCategory: "project",
				SearchTags:     []string{"app", "catalog"},
			},
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{},
			},
		},
	})

	results, err := index.Search("section size settings", 2)
	if err != nil {
		t.Fatalf("search index: %v", err)
	}

	expected := []SearchResult{
		{Name: "set_section_sizes", Description: "Set width and height for sections.", Category: "sections"},
	}
	if !reflect.DeepEqual(results[:1], expected) {
		t.Fatalf("unexpected search results %#v", results)
	}
}

func TestSearchIndexSearchUsesSchemaTextAndLimitFallback(t *testing.T) {
	t.Parallel()

	index := BuildSearchIndex([]SearchEntry{
		{
			Name:        "create_top_level_section",
			Description: "Create a top-level section.",
			Metadata: Metadata{
				SearchCategory: "sections",
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"implType": map[string]any{
						"type":        "string",
						"description": "Section implementation type to create.",
					},
				},
			},
		},
		{
			Name:        "format_code",
			Description: "Format Python code for a code section.",
			Metadata: Metadata{
				SearchCategory: "code",
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Code section id to format.",
					},
				},
			},
		},
		{
			Name:        "set_section_variant",
			Description: "Select the active variant for a section.",
			Metadata: Metadata{
				SearchCategory: "sections",
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"variantId": map[string]any{
						"type":        "string",
						"description": "Variant to make active.",
					},
				},
			},
		},
	})

	results, err := index.Search("section", 0)
	if err != nil {
		t.Fatalf("search index with limit fallback: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("expected default limit of 2 results, got %#v", results)
	}
	if results[0].Name != "create_top_level_section" {
		t.Fatalf("expected create_top_level_section first, got %#v", results)
	}
	if results[1].Name != "format_code" && results[1].Name != "set_section_variant" {
		t.Fatalf("expected a second section-related result, got %#v", results)
	}
}

func TestSearchIndexSearchRejectsBlankOrUnsearchableQueries(t *testing.T) {
	t.Parallel()

	index := BuildSearchIndex([]SearchEntry{{
		Name:        "format_code",
		Description: "Format Python code.",
	}})

	if _, err := index.Search("   ", 2); err != ErrToolSearchQueryRequired {
		t.Fatalf("expected blank query error, got %v", err)
	}
	if _, err := index.Search("!!!", 2); err != ErrToolSearchQueryUnsearchable {
		t.Fatalf("expected unsearchable query error, got %v", err)
	}
}

func TestSearchIndexSearchReturnsEmptyForNilIndex(t *testing.T) {
	t.Parallel()

	var index *SearchIndex
	results, err := index.Search("anything", 2)
	if err != nil {
		t.Fatalf("nil search index: %v", err)
	}
	if len(results) != 0 {
		t.Fatalf("expected empty nil-index results, got %#v", results)
	}
}
