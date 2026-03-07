package mcpx

import (
	"reflect"
	"testing"

	"setta/internal/tools"
)

func TestExtractIDsByTypeCollectsStringsListsAndDictKeys(t *testing.T) {
	t.Parallel()

	payload := map[string]any{
		"sectionId": "section-1",
		"nested": map[string]any{
			"sectionIds": []any{"section-2", "section-3"},
		},
		"dict": map[string]any{
			"section-4": true,
			"section-5": false,
		},
	}

	idsByType := extractIDsByType(payload, map[tools.IDType][]string{
		tools.IDTypeSection: {"sectionId", "nested.sectionIds", "dict"},
	}, true)

	sectionIDs := idsByType[tools.IDTypeSection]
	expected := map[string]struct{}{
		"section-1": {},
		"section-2": {},
		"section-3": {},
		"section-4": {},
		"section-5": {},
	}
	if !reflect.DeepEqual(sectionIDs, expected) {
		t.Fatalf("unexpected extracted section ids %#v", sectionIDs)
	}
}

func TestTranslateIDsAtPathsRewritesNestedStringsAndLists(t *testing.T) {
	t.Parallel()

	payload := map[string]any{
		"sectionId": "section-1",
		"nested": map[string]any{
			"sectionIds": []any{"section-2", "section-3"},
		},
	}

	err := translateIDsAtPaths(payload, []string{"sectionId", "nested.sectionIds"}, func(value string) (string, error) {
		return "tmp-" + value, nil
	})
	if err != nil {
		t.Fatalf("translate ids at paths: %v", err)
	}

	if payload["sectionId"] != "tmp-section-1" {
		t.Fatalf("expected translated sectionId, got %#v", payload["sectionId"])
	}
	nested, ok := payload["nested"].(map[string]any)
	if !ok {
		t.Fatalf("expected nested map, got %#v", payload["nested"])
	}
	values, ok := nested["sectionIds"].([]any)
	if !ok {
		t.Fatalf("expected translated list, got %#v", nested["sectionIds"])
	}
	if len(values) != 2 || values[0] != "tmp-section-2" || values[1] != "tmp-section-3" {
		t.Fatalf("unexpected translated section id list %#v", values)
	}
}
