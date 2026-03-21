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

type jsonSourceSaveLeaf struct {
	Name  string
	Value string
}
