package mcpx

import (
	"encoding/json"
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

func TestTranslateToolErrorToTemporaryAddsTranslatedMissingEdges(t *testing.T) {
	t.Parallel()

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"chat-section":    "13",
		"blocked-section": "16",
	})

	store, err := NewTemporaryIDStore(temporaryIDMapPath)
	if err != nil {
		t.Fatalf("new temporary id store: %v", err)
	}

	translated := translateToolErrorToTemporary(newToolErrorWithData("scope_violation", "blocked", map[string]any{
		"reason": "out_of_scope",
		"missingEdgesCanonical": []scopeViolationMissingEdge{{
			SourceSectionID: "chat-section",
			TargetSectionID: "blocked-section",
			Kind:            agenticEdgeKindChatSection,
		}},
	}, "blocked"), store)
	typed, ok := translated.(*toolError)
	if !ok {
		t.Fatalf("expected *toolError, got %T", translated)
	}

	var canonical []scopeViolationMissingEdge
	canonicalJSON, err := json.Marshal(typed.data["missingEdgesCanonical"])
	if err != nil {
		t.Fatalf("marshal missingEdgesCanonical: %v", err)
	}
	if err := json.Unmarshal(canonicalJSON, &canonical); err != nil {
		t.Fatalf("decode missingEdgesCanonical: %v", err)
	}
	if len(canonical) != 1 || canonical[0] != (scopeViolationMissingEdge{
		SourceSectionID: "chat-section",
		TargetSectionID: "blocked-section",
		Kind:            agenticEdgeKindChatSection,
	}) {
		t.Fatalf("expected canonical missing edge to be preserved, got %#v", canonical)
	}

	var temporary []scopeViolationMissingEdge
	temporaryJSON, err := json.Marshal(typed.data["missingEdges"])
	if err != nil {
		t.Fatalf("marshal missingEdges: %v", err)
	}
	if err := json.Unmarshal(temporaryJSON, &temporary); err != nil {
		t.Fatalf("decode missingEdges: %v", err)
	}
	if len(temporary) != 1 || temporary[0] != (scopeViolationMissingEdge{
		SourceSectionID: "13",
		TargetSectionID: "16",
		Kind:            agenticEdgeKindChatSection,
	}) {
		t.Fatalf("expected translated missing edge ids, got %#v", temporary)
	}
}
