package mcpx

import (
	"path/filepath"
	"testing"

	"setta/internal/tools"
)

func TestTranslateArgumentsToCanonicalRewritesCodeObjIDsFromMetadataPaths(t *testing.T) {
	t.Parallel()

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"param-1": "21",
	})

	store, err := NewTemporaryIDStore(temporaryIDMapPath)
	if err != nil {
		t.Fatalf("new temporary id store: %v", err)
	}

	translated, err := translateArgumentsToCanonical("set_code_obj_name", tools.Metadata{
		Kind:       tools.KindDiscoverable,
		AccessType: tools.AccessTypeWrite,
		IDPathsByType: map[tools.IDType][]string{
			tools.IDTypeCodeObject: {"codeObjId"},
		},
	}, map[string]any{"codeObjId": "21"}, store)
	if err != nil {
		t.Fatalf("translate arguments to canonical: %v", err)
	}

	if translated["codeObjId"] != "param-1" {
		t.Fatalf("expected canonical code object id param-1, got %#v", translated["codeObjId"])
	}
}

func TestTranslateToolErrorToTemporaryRewritesUnmappedCodeObjIDs(t *testing.T) {
	t.Parallel()

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"param-1": "21",
	})

	store, err := NewTemporaryIDStore(temporaryIDMapPath)
	if err != nil {
		t.Fatalf("new temporary id store: %v", err)
	}

	translated := translateToolErrorToTemporary(newToolErrorWithData("scope_violation", "blocked", map[string]any{
		"reason":             "unmapped_code_obj",
		"unmappedCodeObjIds": []string{"param-1"},
	}, "blocked"), store)
	typed, ok := translated.(*toolError)
	if !ok {
		t.Fatalf("expected *toolError, got %T", translated)
	}
	if values, ok := typed.data["unmappedCodeObjIds"].([]string); !ok || len(values) != 1 || values[0] != "21" {
		t.Fatalf("expected translated unmappedCodeObjIds [21], got %#v", typed.data["unmappedCodeObjIds"])
	}
}
