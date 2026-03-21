package projectstate

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDocumentLoadAllJSONSourceVariantsFromDiskRefreshesSharedPairsIntoDistinctTrees(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(workspaceRoot, "data"), 0o755); err != nil {
		t.Fatalf("mkdir data: %v", err)
	}
	if err := os.WriteFile(filepath.Join(workspaceRoot, "data", "source.json"), []byte("{\"alpha\":{\"fresh\":2}}\n"), 0o644); err != nil {
		t.Fatalf("write json source payload: %v", err)
	}

	document := jsonSourceSharedLoadTestDocument(t, false)
	if err := document.LoadAllJSONSourceVariantsFromDisk(workspaceRoot); err != nil {
		t.Fatalf("LoadAllJSONSourceVariantsFromDisk returned error: %v", err)
	}

	project := document.Projects["project-alpha"]
	targetPayload, err := project.EffectiveSectionPayload("json-section-a", "json-variant-a")
	if err != nil {
		t.Fatalf("effective target payload after startup load: %v", err)
	}
	peerPayload, err := project.EffectiveSectionPayload("json-section-b", "json-variant-b")
	if err != nil {
		t.Fatalf("effective peer payload after startup load: %v", err)
	}
	if payloadBoolField(targetPayload, "jsonSourceMissing") {
		t.Fatal("expected target variant missing flag cleared")
	}
	if payloadBoolField(peerPayload, "jsonSourceMissing") {
		t.Fatal("expected peer variant missing flag cleared")
	}

	targetMap := payloadStringMapField(targetPayload, "codeObjVariantMap")
	peerMap := payloadStringMapField(peerPayload, "codeObjVariantMap")
	if targetMap["old-root-a"] == "" || peerMap["old-root-b"] == "" {
		t.Fatalf("expected shared pair roots to remain distinct, got target=%#v peer=%#v", targetMap, peerMap)
	}
	if targetMap["old-root-a"] == peerMap["old-root-b"] {
		t.Fatalf("expected distinct root variant ids per section, got %#v %#v", targetMap, peerMap)
	}

	assertJSONSourceTreeHasFreshValue(t, project, targetMap, payloadStringField(targetPayload, "topLevelParamId"))
	assertJSONSourceTreeHasFreshValue(t, project, peerMap, payloadStringField(peerPayload, "topLevelParamId"))
}

func TestDocumentLoadAllJSONSourceVariantsFromDiskMarksMatchingSharedPairsMissing(t *testing.T) {
	t.Parallel()

	document := jsonSourceSharedLoadTestDocument(t, false)
	if err := document.LoadAllJSONSourceVariantsFromDisk(t.TempDir()); err != nil {
		t.Fatalf("LoadAllJSONSourceVariantsFromDisk returned error: %v", err)
	}

	project := document.Projects["project-alpha"]
	targetPayload, err := project.EffectiveSectionPayload("json-section-a", "json-variant-a")
	if err != nil {
		t.Fatalf("effective target payload after missing load: %v", err)
	}
	peerPayload, err := project.EffectiveSectionPayload("json-section-b", "json-variant-b")
	if err != nil {
		t.Fatalf("effective peer payload after missing load: %v", err)
	}
	if !payloadBoolField(targetPayload, "jsonSourceMissing") {
		t.Fatal("expected target variant to be marked missing")
	}
	if !payloadBoolField(peerPayload, "jsonSourceMissing") {
		t.Fatal("expected peer variant to be marked missing")
	}
	if payloadStringField(peerPayload, "topLevelParamId") != "old-root-b" {
		t.Fatalf("expected peer topLevelParamId old-root-b, got %q", payloadStringField(peerPayload, "topLevelParamId"))
	}
}

func assertJSONSourceTreeHasFreshValue(t *testing.T, project Project, codeObjVariantMap map[string]string, topLevelParamID string) {
	t.Helper()

	rootPayload, _, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, topLevelParamID)
	if err != nil {
		t.Fatalf("effective root payload after startup load: %v", err)
	}
	childIDs := payloadStringArrayField(rootPayload, "children")
	if len(childIDs) != 1 {
		t.Fatalf("expected one refreshed child, got %#v", childIDs)
	}
	childPayload, childCodeObj, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, childIDs[0])
	if err != nil {
		t.Fatalf("effective child payload after startup load: %v", err)
	}
	if childCodeObj.Name != "fresh" {
		t.Fatalf("expected child name fresh, got %q", childCodeObj.Name)
	}
	if got := payloadStringField(childPayload, "value"); got != "2" {
		t.Fatalf("expected child value 2, got %q", got)
	}
}

func jsonSourceSharedLoadTestDocument(t *testing.T, jsonSourceMissing bool) Document {
	t.Helper()

	project, err := Project{
		ID:   "project-alpha",
		Name: "Project Alpha",
		ProjectChatWindowing: &ProjectChatWindowingState{
			InstancesByID: map[string]ProjectChatWindowInstance{},
			Order:         []string{},
		},
		SectionVariantMap: map[string]string{
			"json-section-a": "json-variant-a",
			"json-section-b": "json-variant-b",
		},
		Sections: map[string]Section{
			"json-section-a": {
				ID:               "json-section-a",
				Name:             "JSON Source A",
				VariantIDs:       []string{"json-variant-a"},
				DefaultVariantID: "json-variant-a",
			},
			"json-section-b": {
				ID:               "json-section-b",
				Name:             "JSON Source B",
				VariantIDs:       []string{"json-variant-b"},
				DefaultVariantID: "json-variant-b",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"json-variant-a": {
				ID:     "json-variant-a",
				Name:   "data/source.json",
				ImplID: "json-impl-a",
			},
			"json-variant-b": {
				ID:     "json-variant-b",
				Name:   "data/source.json",
				ImplID: "json-impl-b",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"json-impl-a": {
				ID:   "json-impl-a",
				Kind: SectionKind("dict"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":                "json-impl-a",
					"type":              "Dict",
					"isJsonSource":      true,
					"jsonSourceKeys":    []string{"alpha"},
					"jsonSourceMissing": jsonSourceMissing,
					"topLevelParamId":   "old-root-a",
					"codeObjVariantMap": map[string]any{
						"old-root-a": "old-root-variant-a",
						"old-leaf-a": "old-leaf-variant-a",
					},
				}),
			},
			"json-impl-b": {
				ID:   "json-impl-b",
				Kind: SectionKind("dict"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":                "json-impl-b",
					"type":              "Dict",
					"isJsonSource":      true,
					"jsonSourceKeys":    []string{"alpha"},
					"jsonSourceMissing": jsonSourceMissing,
					"topLevelParamId":   "old-root-b",
					"codeObjVariantMap": map[string]any{
						"old-root-b": "old-root-variant-b",
						"old-leaf-b": "old-leaf-variant-b",
					},
				}),
			},
		},
		CodeObjs: map[string]CodeObject{
			"old-root-a": {
				ID:               "old-root-a",
				Name:             "alpha",
				VariantIDs:       []string{"old-root-variant-a"},
				DefaultVariantID: "old-root-variant-a",
			},
			"old-leaf-a": {
				ID:               "old-leaf-a",
				Name:             "target-leaf",
				VariantIDs:       []string{"old-leaf-variant-a"},
				DefaultVariantID: "old-leaf-variant-a",
			},
			"old-root-b": {
				ID:               "old-root-b",
				Name:             "alpha",
				VariantIDs:       []string{"old-root-variant-b"},
				DefaultVariantID: "old-root-variant-b",
			},
			"old-leaf-b": {
				ID:               "old-leaf-b",
				Name:             "peer-leaf",
				VariantIDs:       []string{"old-leaf-variant-b"},
				DefaultVariantID: "old-leaf-variant-b",
			},
		},
		CodeObjVariants: map[string]CodeObjectVariant{
			"old-root-variant-a": {
				ID:               "old-root-variant-a",
				ImplID:           "old-root-impl-a",
				NonPresetImplIDs: []string{"old-root-impl-a"},
			},
			"old-leaf-variant-a": {
				ID:               "old-leaf-variant-a",
				ImplID:           "old-leaf-impl-a",
				NonPresetImplIDs: []string{"old-leaf-impl-a"},
			},
			"old-root-variant-b": {
				ID:               "old-root-variant-b",
				ImplID:           "old-root-impl-b",
				NonPresetImplIDs: []string{"old-root-impl-b"},
			},
			"old-leaf-variant-b": {
				ID:               "old-leaf-variant-b",
				ImplID:           "old-leaf-impl-b",
				NonPresetImplIDs: []string{"old-leaf-impl-b"},
			},
		},
		CodeObjImpls: map[string]CodeObjectImpl{
			"old-root-impl-a": {
				ID:   "old-root-impl-a",
				Type: "NestedParam",
				Payload: mustMarshalProjectObject(map[string]any{
					"id":       "old-root-impl-a",
					"type":     "NestedParam",
					"children": []string{"old-leaf-a"},
				}),
			},
			"old-leaf-impl-a": {
				ID:   "old-leaf-impl-a",
				Type: "CodeParam",
				Payload: mustMarshalProjectObject(map[string]any{
					"id":    "old-leaf-impl-a",
					"type":  "CodeParam",
					"value": "1",
				}),
			},
			"old-root-impl-b": {
				ID:   "old-root-impl-b",
				Type: "NestedParam",
				Payload: mustMarshalProjectObject(map[string]any{
					"id":       "old-root-impl-b",
					"type":     "NestedParam",
					"children": []string{"old-leaf-b"},
				}),
			},
			"old-leaf-impl-b": {
				ID:   "old-leaf-impl-b",
				Type: "CodeParam",
				Payload: mustMarshalProjectObject(map[string]any{
					"id":    "old-leaf-impl-b",
					"type":  "CodeParam",
					"value": "2",
				}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize shared json source load project: %v", err)
	}

	return Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			project.ID: project,
		},
	}
}
