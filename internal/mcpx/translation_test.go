package mcpx

import (
	"encoding/json"
	"path/filepath"
	"testing"

	"setta/internal/projectstate"
	"setta/internal/projectview"
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

func TestTranslateArgumentsToCanonicalDoesNotPersistCanonicalProjectConfigIDMapping(t *testing.T) {
	t.Parallel()

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	store, err := NewTemporaryIDStore(temporaryIDMapPath)
	if err != nil {
		t.Fatalf("new temporary id store: %v", err)
	}

	translated, err := translateArgumentsToCanonical("set_section_name", tools.Metadata{
		Kind:       tools.KindDiscoverable,
		AccessType: tools.AccessTypeWrite,
		IDPathsByType: map[tools.IDType][]string{
			tools.IDTypeSection: {"sectionId"},
		},
	}, map[string]any{
		"projectConfigId": "project-alpha",
		"sectionId":       "section-a",
	}, store)
	if err != nil {
		t.Fatalf("translate arguments to canonical: %v", err)
	}

	if translated["projectConfigId"] != "project-alpha" {
		t.Fatalf("expected canonical projectConfigId to remain unchanged, got %#v", translated["projectConfigId"])
	}

	snapshot, err := store.Snapshot()
	if err != nil {
		t.Fatalf("snapshot temporary id map: %v", err)
	}
	if len(snapshot) != 0 {
		t.Fatalf("expected canonical projectConfigId translation to avoid allocating temporary ids, got %#v", snapshot)
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

func TestTranslateProjectStateSummaryToTemporaryTranslatesWindowSpaces(t *testing.T) {
	t.Parallel()

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"allowed-chat":    "12",
		"allowed-section": "14",
		"allowed-variant": "17",
		"space-1":         "31",
		"window-a":        "32",
	})

	store, err := NewTemporaryIDStore(temporaryIDMapPath)
	if err != nil {
		t.Fatalf("new temporary id store: %v", err)
	}

	translated, err := translateProjectStateSummaryToTemporary(projectStateSummary{
		ProjectConfig: projectview.ProjectConfig{
			ID:                     "project-alpha",
			HasPythonCodegenTarget: true,
			RunCapabilities: projectview.ProjectRunCapabilities{
				CanRunFromMain:          false,
				MainRunDisabledReason:   summaryTestStringPointer("select an entry section"),
				EffectiveEntrySectionID: summaryTestStringPointer("allowed-section"),
			},
			SectionPathSlugsByID: map[string]string{
				"allowed-section": "allowed",
			},
			SectionIDsByPathSlug: map[string][]string{
				"allowed": {"allowed-section"},
			},
			WindowSpaceSlugsByID: map[string]string{
				"space-1": "scoped-layout",
			},
			WindowSpaceIDsBySlug: map[string][]string{
				"scoped-layout": {"space-1"},
			},
			WindowSpaces: map[string]projectstate.WindowSpaceConfig{
				"space-1": {
					ID:   "space-1",
					Name: "Scoped Layout",
					WindowsByID: map[string]projectstate.WindowSpaceWindow{
						"window-a": {
							SurfaceKind:     projectstate.WindowSpaceSurfaceKindSection,
							SectionIDOrNull: summaryTestStringPointer("allowed-section"),
							ChatID:          summaryTestStringPointer("allowed-chat"),
						},
					},
					Order: []string{"window-a"},
				},
			},
			SectionVariantMap: map[string]string{
				"allowed-section": "allowed-variant",
			},
		},
		Sections: []projectStateSummarySection{{
			SectionID:       "allowed-section",
			CoreName:        "Allowed",
			VariantID:       "allowed-variant",
			VariantName:     "Allowed Variant",
			ChildSectionIDs: []string{},
		}},
		ParentSectionMap: map[string]*string{
			"allowed-section": nil,
		},
		RequiredDecodedImages: []string{"images/a.png"},
	}, store)
	if err != nil {
		t.Fatalf("translate project state summary to temporary: %v", err)
	}

	translatedSpace, ok := translated.ProjectConfig.WindowSpaces["31"]
	if !ok {
		t.Fatalf("expected translated window space key 31, got %#v", translated.ProjectConfig.WindowSpaces)
	}
	if translatedSpace.ID != "31" {
		t.Fatalf("expected translated window space id 31, got %q", translatedSpace.ID)
	}
	if len(translatedSpace.Order) != 1 || translatedSpace.Order[0] != "32" {
		t.Fatalf("expected translated order [32], got %#v", translatedSpace.Order)
	}
	translatedWindow, ok := translatedSpace.WindowsByID["32"]
	if !ok {
		t.Fatalf("expected translated window key 32, got %#v", translatedSpace.WindowsByID)
	}
	if translatedWindow.SectionIDOrNull == nil || *translatedWindow.SectionIDOrNull != "14" {
		t.Fatalf("expected translated section binding 14, got %#v", translatedWindow.SectionIDOrNull)
	}
	if translatedWindow.ChatID == nil || *translatedWindow.ChatID != "12" {
		t.Fatalf("expected translated chat binding 12, got %#v", translatedWindow.ChatID)
	}
	if !translated.ProjectConfig.HasPythonCodegenTarget {
		t.Fatal("expected python codegen target flag to be preserved")
	}
	if !summaryTestRunCapabilitiesMatch(translated.ProjectConfig.RunCapabilities, projectview.ProjectRunCapabilities{
		CanRunFromMain:          false,
		MainRunDisabledReason:   summaryTestStringPointer("select an entry section"),
		EffectiveEntrySectionID: summaryTestStringPointer("14"),
	}) {
		t.Fatalf("expected translated run capabilities to preserve reason and translate entry section id, got %#v", translated.ProjectConfig.RunCapabilities)
	}
	if got := translated.ProjectConfig.SectionPathSlugsByID["14"]; got != "allowed" {
		t.Fatalf("expected translated section path slug for 14, got %#v", translated.ProjectConfig.SectionPathSlugsByID)
	}
	if got := translated.ProjectConfig.SectionIDsByPathSlug["allowed"]; len(got) != 1 || got[0] != "14" {
		t.Fatalf("expected translated section slug index [14], got %#v", translated.ProjectConfig.SectionIDsByPathSlug)
	}
	if got := translated.ProjectConfig.WindowSpaceSlugsByID["31"]; got != "scoped-layout" {
		t.Fatalf("expected translated window space slug for 31, got %#v", translated.ProjectConfig.WindowSpaceSlugsByID)
	}
	if got := translated.ProjectConfig.WindowSpaceIDsBySlug["scoped-layout"]; len(got) != 1 || got[0] != "31" {
		t.Fatalf("expected translated window space slug index [31], got %#v", translated.ProjectConfig.WindowSpaceIDsBySlug)
	}
	if len(translated.RequiredDecodedImages) != 1 || translated.RequiredDecodedImages[0] != "images/a.png" {
		t.Fatalf("expected required decoded images to remain unchanged, got %#v", translated.RequiredDecodedImages)
	}
}

func summaryTestStringPointer(value string) *string {
	return &value
}

func summaryTestRunCapabilitiesMatch(got, expected projectview.ProjectRunCapabilities) bool {
	return got.CanRunFromMain == expected.CanRunFromMain &&
		summaryTestDerefString(got.MainRunDisabledReason) == summaryTestDerefString(expected.MainRunDisabledReason) &&
		summaryTestDerefString(got.EffectiveEntrySectionID) == summaryTestDerefString(expected.EffectiveEntrySectionID)
}

func summaryTestDerefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
