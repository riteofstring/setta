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

func TestExtractIDsByTypeReturnsEmptyWhenPathsMissing(t *testing.T) {
	t.Parallel()

	payload := map[string]any{
		"otherKey": "value",
	}

	idsByType := extractIDsByType(payload, map[tools.IDType][]string{
		tools.IDTypeSection: {"targetSectionId"},
	}, true)

	if len(idsByType) != 0 {
		t.Fatalf("expected no extracted ids, got %#v", idsByType)
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

func TestTranslateIDsAtPathsRewritesObjectKeys(t *testing.T) {
	t.Parallel()

	payload := map[string]any{
		"topLevelSections": map[string]any{
			"section-1": map[string]any{"x": 10},
			"section-2": map[string]any{"x": 20},
		},
	}

	err := translateIDsAtPaths(payload, []string{"topLevelSections"}, func(value string) (string, error) {
		return "tmp-" + value, nil
	})
	if err != nil {
		t.Fatalf("translate object-key ids at paths: %v", err)
	}

	topLevelSections, ok := payload["topLevelSections"].(map[string]any)
	if !ok {
		t.Fatalf("expected translated top-level section map, got %#v", payload["topLevelSections"])
	}
	if _, ok := topLevelSections["tmp-section-1"]; !ok {
		t.Fatalf("expected translated key tmp-section-1, got %#v", topLevelSections)
	}
	if _, ok := topLevelSections["tmp-section-2"]; !ok {
		t.Fatalf("expected translated key tmp-section-2, got %#v", topLevelSections)
	}
	if _, ok := topLevelSections["section-1"]; ok {
		t.Fatalf("did not expect canonical key section-1 after translation, got %#v", topLevelSections)
	}
}

func TestExtractIDsByTypeCollectsIDsFromArraysOfObjects(t *testing.T) {
	t.Parallel()

	payload := map[string]any{
		"childCodeObjs": []any{
			map[string]any{"codeObjId": "code-1"},
			map[string]any{"codeObjId": "code-2"},
		},
	}

	idsByType := extractIDsByType(payload, map[tools.IDType][]string{
		tools.IDTypeCodeObject: {"childCodeObjs.codeObjId"},
	}, false)

	expected := map[string]struct{}{
		"code-1": {},
		"code-2": {},
	}
	if !reflect.DeepEqual(idsByType[tools.IDTypeCodeObject], expected) {
		t.Fatalf("unexpected extracted code-object ids %#v", idsByType[tools.IDTypeCodeObject])
	}
}

func TestTranslateIDsAtPathsRewritesNestedArrayObjectFields(t *testing.T) {
	t.Parallel()

	payload := map[string]any{
		"childCodeObjs": []any{
			map[string]any{"codeObjId": "code-1", "name": "first"},
			map[string]any{"codeObjId": "code-2", "name": "second"},
		},
	}

	err := translateIDsAtPaths(payload, []string{"childCodeObjs.codeObjId"}, func(value string) (string, error) {
		return "tmp-" + value, nil
	})
	if err != nil {
		t.Fatalf("translate nested array object ids at paths: %v", err)
	}

	values, ok := payload["childCodeObjs"].([]any)
	if !ok {
		t.Fatalf("expected translated child list, got %#v", payload["childCodeObjs"])
	}
	first := values[0].(map[string]any)
	second := values[1].(map[string]any)
	if first["codeObjId"] != "tmp-code-1" || second["codeObjId"] != "tmp-code-2" {
		t.Fatalf("unexpected translated child code-object ids %#v", values)
	}
}
