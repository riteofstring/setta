package projectstate

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSaveJSONSourceFilesRecreatesMissingKeyPathBeforeWrite(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	document := jsonSourceSaveTestDocument(t, []string{"config", "nested"}, []jsonSourceSaveLeaf{{Name: "value", Value: "1"}})

	if err := SaveJSONSourceFiles(document, workspaceRoot); err != nil {
		t.Fatalf("SaveJSONSourceFiles returned error: %v", err)
	}

	content, err := os.ReadFile(filepath.Join(workspaceRoot, "data", "source.json"))
	if err != nil {
		t.Fatalf("read saved json source file: %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode saved json source file: %v", err)
	}
	if got := payload["config"].(map[string]any)["nested"].(map[string]any)["value"]; got != float64(1) {
		t.Fatalf("expected recreated key path to hold numeric value 1, got %#v", got)
	}
}

func TestSaveJSONSourceFilesAppliesSharedFileUpdatesByShortestPath(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	document := jsonSourceSaveSharedFileTestDocument(t)

	if err := SaveJSONSourceFiles(document, workspaceRoot); err != nil {
		t.Fatalf("SaveJSONSourceFiles returned error: %v", err)
	}

	content, err := os.ReadFile(filepath.Join(workspaceRoot, "data", "shared.json"))
	if err != nil {
		t.Fatalf("read shared json source file: %v", err)
	}
	if !strings.Contains(string(content), "\"alpha\": {") || !strings.Contains(string(content), "\"beta\": 2") {
		t.Fatalf("expected saved shared file to include nested alpha.beta payload, got %q", string(content))
	}
	if !strings.Contains(string(content), "\"rootOnly\": 1") {
		t.Fatalf("expected saved shared file to preserve the root-level subtree, got %q", string(content))
	}
}

func TestSaveJSONSourceFilesSameKeyPathLastWriteWins(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	document := jsonSourceSaveSameKeyPathTestDocument(t)

	if err := SaveJSONSourceFiles(document, workspaceRoot); err != nil {
		t.Fatalf("SaveJSONSourceFiles returned error: %v", err)
	}

	content, err := os.ReadFile(filepath.Join(workspaceRoot, "data", "same-path.json"))
	if err != nil {
		t.Fatalf("read same-path json source file: %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode same-path json source file: %v", err)
	}
	if got := payload["config"].(map[string]any)["value"]; got != float64(2) {
		t.Fatalf("expected later same-key-path update to win with value 2, got %#v", got)
	}
}

func TestApplyJSONSourceFileUpdatesRejectsNonDictConflicts(t *testing.T) {
	t.Parallel()

	_, err := applyJSONSourceFileUpdates(
		map[string]any{"alpha": float64(1)},
		[]jsonSourceFileUpdate{
			{
				KeyPath: []string{"alpha", "beta"},
				Subtree: map[string]any{"gamma": float64(2)},
			},
		},
	)
	if err == nil {
		t.Fatal("expected applyJSONSourceFileUpdates conflict error")
	}
	if got := err.Error(); got != "JSON source path conflicts with a non-dict value." {
		t.Fatalf("expected non-dict conflict error, got %q", got)
	}
}

func jsonSourceSaveTestDocument(t *testing.T, keyPath []string, leaves []jsonSourceSaveLeaf) Document {
	t.Helper()

	rootChildren := make([]string, 0, len(leaves))
	codeObjs := map[string]CodeObject{
		"root": {
			ID:               "root",
			Name:             "root",
			VariantIDs:       []string{"root-variant"},
			DefaultVariantID: "root-variant",
		},
	}
	codeObjVariants := map[string]CodeObjectVariant{
		"root-variant": {
			ID:               "root-variant",
			ImplID:           "root-impl",
			NonPresetImplIDs: []string{"root-impl"},
		},
	}
	codeObjImpls := map[string]CodeObjectImpl{
		"root-impl": {
			ID:   "root-impl",
			Type: "NestedParam",
			Payload: mustSectionVariantMutationRawJSON(t, map[string]any{
				"id":       "root-impl",
				"type":     "NestedParam",
				"children": rootChildren,
			}),
		},
	}

	for _, leaf := range leaves {
		codeObjID := "leaf-" + leaf.Name
		variantID := codeObjID + "-variant"
		implID := codeObjID + "-impl"
		rootChildren = append(rootChildren, codeObjID)
		codeObjs[codeObjID] = CodeObject{
			ID:               codeObjID,
			Name:             leaf.Name,
			VariantIDs:       []string{variantID},
			DefaultVariantID: variantID,
		}
		codeObjVariants[variantID] = CodeObjectVariant{
			ID:               variantID,
			ImplID:           implID,
			NonPresetImplIDs: []string{implID},
		}
		codeObjImpls[implID] = CodeObjectImpl{
			ID:   implID,
			Type: "CodeParam",
			Payload: mustSectionVariantMutationRawJSON(t, map[string]any{
				"id":    implID,
				"type":  "CodeParam",
				"value": leaf.Value,
			}),
		}
	}
	codeObjImpls["root-impl"] = CodeObjectImpl{
		ID:   "root-impl",
		Type: "NestedParam",
		Payload: mustSectionVariantMutationRawJSON(t, map[string]any{
			"id":       "root-impl",
			"type":     "NestedParam",
			"children": rootChildren,
		}),
	}

	project, err := Project{
		ID:                      "project-alpha",
		Name:                    "Project Alpha",
		AllowJSONSourceKeyEdits: true,
		ProjectChatWindowing:    &ProjectChatWindowingState{InstancesByID: map[string]ProjectChatWindowInstance{}, Order: []string{}},
		SectionVariantMap: map[string]string{
			"json-section": "json-variant",
		},
		Sections: map[string]Section{
			"json-section": {
				ID:               "json-section",
				Name:             "JSON Section",
				VariantIDs:       []string{"json-variant"},
				DefaultVariantID: "json-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"json-variant": {
				ID:     "json-variant",
				Name:   "data/source.json",
				ImplID: "json-impl",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"json-impl": {
				ID:   "json-impl",
				Kind: SectionKind("dict"),
				Payload: mustSectionVariantMutationRawJSON(t, map[string]any{
					"id":              "json-impl",
					"type":            "Dict",
					"isJsonSource":    true,
					"configLanguage":  "json",
					"jsonSourceKeys":  keyPath,
					"topLevelParamId": "root",
					"codeObjVariantMap": map[string]any{
						"root": "root-variant",
					},
				}),
			},
		},
		CodeObjs:        codeObjs,
		CodeObjVariants: codeObjVariants,
		CodeObjImpls:    codeObjImpls,
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize json source save project: %v", err)
	}

	sectionImpl := project.SectionImpls["json-impl"]
	payload := mustSectionVariantMutationRawJSON(t, map[string]any{
		"id":              "json-impl",
		"type":            "Dict",
		"isJsonSource":    true,
		"configLanguage":  "json",
		"jsonSourceKeys":  keyPath,
		"topLevelParamId": "root",
		"codeObjVariantMap": map[string]any{
			"root": "root-variant",
		},
	})
	codeObjVariantMap := map[string]any{"root": "root-variant"}
	for _, leaf := range leaves {
		codeObjVariantMap["leaf-"+leaf.Name] = "leaf-" + leaf.Name + "-variant"
	}
	sectionImpl.Payload = mustSectionVariantMutationRawJSON(t, map[string]any{
		"id":                "json-impl",
		"type":              "Dict",
		"isJsonSource":      true,
		"configLanguage":    "json",
		"jsonSourceKeys":    keyPath,
		"topLevelParamId":   "root",
		"codeObjVariantMap": codeObjVariantMap,
	})
	if len(payload) == 0 {
		t.Fatal("unexpected empty payload")
	}
	project.SectionImpls["json-impl"] = sectionImpl

	return Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			project.ID: project,
		},
	}
}

func jsonSourceSaveSharedFileTestDocument(t *testing.T) Document {
	t.Helper()

	project, err := Project{
		ID:                      "project-alpha",
		Name:                    "Project Alpha",
		AllowJSONSourceKeyEdits: true,
		ProjectChatWindowing:    &ProjectChatWindowingState{InstancesByID: map[string]ProjectChatWindowInstance{}, Order: []string{}},
		SectionVariantMap: map[string]string{
			"root-section":   "root-variant",
			"nested-section": "nested-variant",
		},
		Sections: map[string]Section{
			"root-section": {
				ID:               "root-section",
				Name:             "Root JSON Section",
				VariantIDs:       []string{"root-variant"},
				DefaultVariantID: "root-variant",
			},
			"nested-section": {
				ID:               "nested-section",
				Name:             "Nested JSON Section",
				VariantIDs:       []string{"nested-variant"},
				DefaultVariantID: "nested-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"root-variant": {
				ID:     "root-variant",
				Name:   "data/shared.json",
				ImplID: "root-json-impl",
			},
			"nested-variant": {
				ID:     "nested-variant",
				Name:   "data/shared.json",
				ImplID: "nested-json-impl",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"root-json-impl": {
				ID:   "root-json-impl",
				Kind: SectionKind("dict"),
				Payload: mustSectionVariantMutationRawJSON(t, map[string]any{
					"id":              "root-json-impl",
					"type":            "Dict",
					"isJsonSource":    true,
					"configLanguage":  "json",
					"jsonSourceKeys":  []string{},
					"topLevelParamId": "root-param",
					"codeObjVariantMap": map[string]any{
						"root-param":   "root-param-variant",
						"root-child":   "root-child-variant",
						"nested-param": "nested-param-variant",
					},
				}),
			},
			"nested-json-impl": {
				ID:   "nested-json-impl",
				Kind: SectionKind("dict"),
				Payload: mustSectionVariantMutationRawJSON(t, map[string]any{
					"id":              "nested-json-impl",
					"type":            "Dict",
					"isJsonSource":    true,
					"configLanguage":  "json",
					"jsonSourceKeys":  []string{"alpha"},
					"topLevelParamId": "nested-param",
					"codeObjVariantMap": map[string]any{
						"nested-param": "nested-param-variant",
						"nested-child": "nested-child-variant",
					},
				}),
			},
		},
		CodeObjs: map[string]CodeObject{
			"root-param": {
				ID:               "root-param",
				Name:             "root",
				VariantIDs:       []string{"root-param-variant"},
				DefaultVariantID: "root-param-variant",
			},
			"root-child": {
				ID:               "root-child",
				Name:             "rootOnly",
				VariantIDs:       []string{"root-child-variant"},
				DefaultVariantID: "root-child-variant",
			},
			"nested-param": {
				ID:               "nested-param",
				Name:             "alpha",
				VariantIDs:       []string{"nested-param-variant"},
				DefaultVariantID: "nested-param-variant",
			},
			"nested-child": {
				ID:               "nested-child",
				Name:             "beta",
				VariantIDs:       []string{"nested-child-variant"},
				DefaultVariantID: "nested-child-variant",
			},
		},
		CodeObjVariants: map[string]CodeObjectVariant{
			"root-param-variant": {
				ID:               "root-param-variant",
				ImplID:           "root-param-impl",
				NonPresetImplIDs: []string{"root-param-impl"},
			},
			"root-child-variant": {
				ID:               "root-child-variant",
				ImplID:           "root-child-impl",
				NonPresetImplIDs: []string{"root-child-impl"},
			},
			"nested-param-variant": {
				ID:               "nested-param-variant",
				ImplID:           "nested-param-impl",
				NonPresetImplIDs: []string{"nested-param-impl"},
			},
			"nested-child-variant": {
				ID:               "nested-child-variant",
				ImplID:           "nested-child-impl",
				NonPresetImplIDs: []string{"nested-child-impl"},
			},
		},
		CodeObjImpls: map[string]CodeObjectImpl{
			"root-param-impl": {
				ID:   "root-param-impl",
				Type: "NestedParam",
				Payload: mustSectionVariantMutationRawJSON(t, map[string]any{
					"id":       "root-param-impl",
					"type":     "NestedParam",
					"children": []string{"root-child"},
				}),
			},
			"root-child-impl": {
				ID:   "root-child-impl",
				Type: "CodeParam",
				Payload: mustSectionVariantMutationRawJSON(t, map[string]any{
					"id":    "root-child-impl",
					"type":  "CodeParam",
					"value": "1",
				}),
			},
			"nested-param-impl": {
				ID:   "nested-param-impl",
				Type: "NestedParam",
				Payload: mustSectionVariantMutationRawJSON(t, map[string]any{
					"id":       "nested-param-impl",
					"type":     "NestedParam",
					"children": []string{"nested-child"},
				}),
			},
			"nested-child-impl": {
				ID:   "nested-child-impl",
				Type: "CodeParam",
				Payload: mustSectionVariantMutationRawJSON(t, map[string]any{
					"id":    "nested-child-impl",
					"type":  "CodeParam",
					"value": "2",
				}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize shared json source save project: %v", err)
	}

	return Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			project.ID: project,
		},
	}
}

func jsonSourceSaveSameKeyPathTestDocument(t *testing.T) Document {
	t.Helper()

	project, err := Project{
		ID:                      "project-alpha",
		Name:                    "Project Alpha",
		AllowJSONSourceKeyEdits: true,
		ProjectChatWindowing:    &ProjectChatWindowingState{InstancesByID: map[string]ProjectChatWindowInstance{}, Order: []string{}},
		SectionVariantMap: map[string]string{
			"json-section-a": "json-variant-a",
			"json-section-b": "json-variant-b",
		},
		Sections: map[string]Section{
			"json-section-a": {
				ID:               "json-section-a",
				Name:             "JSON Section A",
				VariantIDs:       []string{"json-variant-a"},
				DefaultVariantID: "json-variant-a",
			},
			"json-section-b": {
				ID:               "json-section-b",
				Name:             "JSON Section B",
				VariantIDs:       []string{"json-variant-b"},
				DefaultVariantID: "json-variant-b",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"json-variant-a": {
				ID:     "json-variant-a",
				Name:   "data/same-path.json",
				ImplID: "json-impl-a",
			},
			"json-variant-b": {
				ID:     "json-variant-b",
				Name:   "data/same-path.json",
				ImplID: "json-impl-b",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"json-impl-a": {
				ID:   "json-impl-a",
				Kind: SectionKind("dict"),
				Payload: mustSectionVariantMutationRawJSON(t, map[string]any{
					"id":              "json-impl-a",
					"type":            "Dict",
					"isJsonSource":    true,
					"configLanguage":  "json",
					"jsonSourceKeys":  []string{"config"},
					"topLevelParamId": "root-a",
					"codeObjVariantMap": map[string]any{
						"root-a":       "root-a-variant",
						"value-leaf-a": "value-leaf-a-variant",
					},
				}),
			},
			"json-impl-b": {
				ID:   "json-impl-b",
				Kind: SectionKind("dict"),
				Payload: mustSectionVariantMutationRawJSON(t, map[string]any{
					"id":              "json-impl-b",
					"type":            "Dict",
					"isJsonSource":    true,
					"configLanguage":  "json",
					"jsonSourceKeys":  []string{"config"},
					"topLevelParamId": "root-b",
					"codeObjVariantMap": map[string]any{
						"root-b":       "root-b-variant",
						"value-leaf-b": "value-leaf-b-variant",
					},
				}),
			},
		},
		CodeObjs: map[string]CodeObject{
			"root-a": {
				ID:               "root-a",
				Name:             "root",
				VariantIDs:       []string{"root-a-variant"},
				DefaultVariantID: "root-a-variant",
			},
			"value-leaf-a": {
				ID:               "value-leaf-a",
				Name:             "value",
				VariantIDs:       []string{"value-leaf-a-variant"},
				DefaultVariantID: "value-leaf-a-variant",
			},
			"root-b": {
				ID:               "root-b",
				Name:             "root",
				VariantIDs:       []string{"root-b-variant"},
				DefaultVariantID: "root-b-variant",
			},
			"value-leaf-b": {
				ID:               "value-leaf-b",
				Name:             "value",
				VariantIDs:       []string{"value-leaf-b-variant"},
				DefaultVariantID: "value-leaf-b-variant",
			},
		},
		CodeObjVariants: map[string]CodeObjectVariant{
			"root-a-variant": {
				ID:               "root-a-variant",
				ImplID:           "root-a-impl",
				NonPresetImplIDs: []string{"root-a-impl"},
			},
			"value-leaf-a-variant": {
				ID:               "value-leaf-a-variant",
				ImplID:           "value-leaf-a-impl",
				NonPresetImplIDs: []string{"value-leaf-a-impl"},
			},
			"root-b-variant": {
				ID:               "root-b-variant",
				ImplID:           "root-b-impl",
				NonPresetImplIDs: []string{"root-b-impl"},
			},
			"value-leaf-b-variant": {
				ID:               "value-leaf-b-variant",
				ImplID:           "value-leaf-b-impl",
				NonPresetImplIDs: []string{"value-leaf-b-impl"},
			},
		},
		CodeObjImpls: map[string]CodeObjectImpl{
			"root-a-impl": {
				ID:   "root-a-impl",
				Type: "NestedParam",
				Payload: mustSectionVariantMutationRawJSON(t, map[string]any{
					"id":       "root-a-impl",
					"type":     "NestedParam",
					"children": []string{"value-leaf-a"},
				}),
			},
			"value-leaf-a-impl": {
				ID:   "value-leaf-a-impl",
				Type: "CodeParam",
				Payload: mustSectionVariantMutationRawJSON(t, map[string]any{
					"id":    "value-leaf-a-impl",
					"type":  "CodeParam",
					"value": "1",
				}),
			},
			"root-b-impl": {
				ID:   "root-b-impl",
				Type: "NestedParam",
				Payload: mustSectionVariantMutationRawJSON(t, map[string]any{
					"id":       "root-b-impl",
					"type":     "NestedParam",
					"children": []string{"value-leaf-b"},
				}),
			},
			"value-leaf-b-impl": {
				ID:   "value-leaf-b-impl",
				Type: "CodeParam",
				Payload: mustSectionVariantMutationRawJSON(t, map[string]any{
					"id":    "value-leaf-b-impl",
					"type":  "CodeParam",
					"value": "2",
				}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize same-key-path json source save project: %v", err)
	}

	return Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			project.ID: project,
		},
	}
}

type jsonSourceSaveLeaf struct {
	Name  string
	Value string
}
