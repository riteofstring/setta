package projectstate

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestJSONSourceFileInputsNormalizesRelativeVariantPaths(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	document := jsonSourceSharedLoadTestDocument(t, false)

	inputs, err := JSONSourceFileInputs(document, workspaceRoot)
	if err != nil {
		t.Fatalf("JSONSourceFileInputs returned error: %v", err)
	}
	if len(inputs) != 1 {
		t.Fatalf("expected one json source input, got %#v", inputs)
	}

	input := inputs[0]
	if input.Path != filepath.Join(workspaceRoot, "data", "source.json") {
		t.Fatalf("expected normalized json source path, got %q", input.Path)
	}
	if len(input.Bindings) != 2 {
		t.Fatalf("expected two json source bindings, got %#v", input.Bindings)
	}
	if input.Bindings[0].SectionID != "json-section-a" || input.Bindings[1].SectionID != "json-section-b" {
		t.Fatalf("expected sorted bindings for both shared sections, got %#v", input.Bindings)
	}
}

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

func TestDocumentLoadAllJSONSourceVariantsFromDiskSupportsStructuredDataFormats(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		variant string
		content string
	}{
		{
			name:    "yaml",
			variant: "data/source.yaml",
			content: "alpha:\n  fresh: 2\n",
		},
		{
			name:    "toml",
			variant: "data/source.toml",
			content: "alpha = { fresh = 2 }\n",
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			workspaceRoot := t.TempDir()
			if err := os.MkdirAll(filepath.Join(workspaceRoot, "data"), 0o755); err != nil {
				t.Fatalf("mkdir data: %v", err)
			}
			if err := os.WriteFile(filepath.Join(workspaceRoot, tc.variant), []byte(tc.content), 0o644); err != nil {
				t.Fatalf("write structured data payload: %v", err)
			}

			document := jsonSourceSharedLoadTestDocumentForPath(t, false, tc.variant)
			if err := document.LoadAllJSONSourceVariantsFromDisk(workspaceRoot); err != nil {
				t.Fatalf("LoadAllJSONSourceVariantsFromDisk returned error: %v", err)
			}

			project := document.Projects["project-alpha"]
			targetPayload, err := project.EffectiveSectionPayload("json-section-a", "json-variant-a")
			if err != nil {
				t.Fatalf("effective target payload after structured-data load: %v", err)
			}
			peerPayload, err := project.EffectiveSectionPayload("json-section-b", "json-variant-b")
			if err != nil {
				t.Fatalf("effective peer payload after structured-data load: %v", err)
			}
			if payloadBoolField(targetPayload, "jsonSourceMissing") {
				t.Fatal("expected target variant missing flag cleared")
			}
			if payloadBoolField(peerPayload, "jsonSourceMissing") {
				t.Fatal("expected peer variant missing flag cleared")
			}

			assertJSONSourceTreeHasFreshValue(
				t,
				project,
				payloadStringMapField(targetPayload, "codeObjVariantMap"),
				payloadStringField(targetPayload, "topLevelParamId"),
			)
			assertJSONSourceTreeHasFreshValue(
				t,
				project,
				payloadStringMapField(peerPayload, "codeObjVariantMap"),
				payloadStringField(peerPayload, "topLevelParamId"),
			)
		})
	}
}

func TestDocumentReloadJSONSourceBindingsFromDiskRefreshesRequestedBindingsOnly(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(workspaceRoot, "data"), 0o755); err != nil {
		t.Fatalf("mkdir data: %v", err)
	}
	if err := os.WriteFile(filepath.Join(workspaceRoot, "data", "source.json"), []byte("{\"alpha\":{\"fresh\":2}}\n"), 0o644); err != nil {
		t.Fatalf("write json source payload: %v", err)
	}

	document := jsonSourceSharedLoadTestDocument(t, false)
	if err := document.ReloadJSONSourceBindingsFromDisk(workspaceRoot, []JSONSourceFileBinding{
		{
			ProjectID: "project-alpha",
			SectionID: "json-section-a",
			VariantID: "json-variant-a",
		},
	}); err != nil {
		t.Fatalf("ReloadJSONSourceBindingsFromDisk returned error: %v", err)
	}

	project := document.Projects["project-alpha"]
	targetPayload, err := project.EffectiveSectionPayload("json-section-a", "json-variant-a")
	if err != nil {
		t.Fatalf("effective target payload after targeted reload: %v", err)
	}
	peerPayload, err := project.EffectiveSectionPayload("json-section-b", "json-variant-b")
	if err != nil {
		t.Fatalf("effective peer payload after targeted reload: %v", err)
	}
	assertJSONSourceTreeHasFreshValue(t, project, payloadStringMapField(targetPayload, "codeObjVariantMap"), payloadStringField(targetPayload, "topLevelParamId"))

	peerMap := payloadStringMapField(peerPayload, "codeObjVariantMap")
	rootPayload, _, _, _, err := project.EffectiveCodeObjectPayload(peerMap, payloadStringField(peerPayload, "topLevelParamId"))
	if err != nil {
		t.Fatalf("effective peer root payload after targeted reload: %v", err)
	}
	childIDs := payloadStringArrayField(rootPayload, "children")
	if len(childIDs) != 1 {
		t.Fatalf("expected one untouched peer child, got %#v", childIDs)
	}
	childPayload, childCodeObj, _, _, err := project.EffectiveCodeObjectPayload(peerMap, childIDs[0])
	if err != nil {
		t.Fatalf("effective peer child payload after targeted reload: %v", err)
	}
	if childCodeObj.Name != "peer-leaf" {
		t.Fatalf("expected untouched peer child name peer-leaf, got %q", childCodeObj.Name)
	}
	if got := payloadStringField(childPayload, "value"); got != "2" {
		t.Fatalf("expected untouched peer child value 2, got %q", got)
	}
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

func TestDocumentLoadAllJSONSourceVariantsFromDiskMarksMissingForAbsentSelectedPath(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(workspaceRoot, "data"), 0o755); err != nil {
		t.Fatalf("mkdir data: %v", err)
	}
	if err := os.WriteFile(filepath.Join(workspaceRoot, "data", "source.json"), []byte("{\"alpha\":{\"one\":1}}\n"), 0o644); err != nil {
		t.Fatalf("write json source payload: %v", err)
	}

	document := jsonSourceSharedLoadTestDocument(t, false)
	setJSONSourceKeysForSharedLoadTestDocument(t, &document, "project-alpha", "json-impl-a", []string{"missing"})
	if err := document.LoadAllJSONSourceVariantsFromDisk(workspaceRoot); err != nil {
		t.Fatalf("LoadAllJSONSourceVariantsFromDisk returned error: %v", err)
	}

	project := document.Projects["project-alpha"]
	targetPayload, err := project.EffectiveSectionPayload("json-section-a", "json-variant-a")
	if err != nil {
		t.Fatalf("effective target payload after missing-path load: %v", err)
	}
	peerPayload, err := project.EffectiveSectionPayload("json-section-b", "json-variant-b")
	if err != nil {
		t.Fatalf("effective peer payload after missing-path load: %v", err)
	}
	if !payloadBoolField(targetPayload, "jsonSourceMissing") {
		t.Fatal("expected target variant to be marked missing for absent selected path")
	}
	if payloadBoolField(peerPayload, "jsonSourceMissing") {
		t.Fatal("expected peer variant to remain loaded for its valid selected path")
	}
}

func TestDocumentLoadAllJSONSourceVariantsFromDiskMarksMissingForLeafSelectedPath(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(workspaceRoot, "data"), 0o755); err != nil {
		t.Fatalf("mkdir data: %v", err)
	}
	if err := os.WriteFile(filepath.Join(workspaceRoot, "data", "source.json"), []byte("{\"alpha\":{\"one\":1}}\n"), 0o644); err != nil {
		t.Fatalf("write json source payload: %v", err)
	}

	document := jsonSourceSharedLoadTestDocument(t, false)
	setJSONSourceKeysForSharedLoadTestDocument(t, &document, "project-alpha", "json-impl-a", []string{"alpha", "one"})
	if err := document.LoadAllJSONSourceVariantsFromDisk(workspaceRoot); err != nil {
		t.Fatalf("LoadAllJSONSourceVariantsFromDisk returned error: %v", err)
	}

	project := document.Projects["project-alpha"]
	targetPayload, err := project.EffectiveSectionPayload("json-section-a", "json-variant-a")
	if err != nil {
		t.Fatalf("effective target payload after leaf-path load: %v", err)
	}
	peerPayload, err := project.EffectiveSectionPayload("json-section-b", "json-variant-b")
	if err != nil {
		t.Fatalf("effective peer payload after leaf-path load: %v", err)
	}
	if !payloadBoolField(targetPayload, "jsonSourceMissing") {
		t.Fatal("expected target variant to be marked missing for leaf selected path")
	}
	if payloadBoolField(peerPayload, "jsonSourceMissing") {
		t.Fatal("expected peer variant to remain loaded for its valid selected path")
	}
}

func TestDocumentReloadJSONSourceBindingsFromDiskMarksRequestedBindingsMissingOnly(t *testing.T) {
	t.Parallel()

	document := jsonSourceSharedLoadTestDocument(t, false)
	if err := document.ReloadJSONSourceBindingsFromDisk(t.TempDir(), []JSONSourceFileBinding{
		{
			ProjectID: "project-alpha",
			SectionID: "json-section-a",
			VariantID: "json-variant-a",
		},
	}); err != nil {
		t.Fatalf("ReloadJSONSourceBindingsFromDisk returned error: %v", err)
	}

	project := document.Projects["project-alpha"]
	targetPayload, err := project.EffectiveSectionPayload("json-section-a", "json-variant-a")
	if err != nil {
		t.Fatalf("effective target payload after targeted missing reload: %v", err)
	}
	peerPayload, err := project.EffectiveSectionPayload("json-section-b", "json-variant-b")
	if err != nil {
		t.Fatalf("effective peer payload after targeted missing reload: %v", err)
	}
	if !payloadBoolField(targetPayload, "jsonSourceMissing") {
		t.Fatal("expected requested target binding to be marked missing")
	}
	if payloadBoolField(peerPayload, "jsonSourceMissing") {
		t.Fatal("expected untouched peer binding to remain loaded")
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

	return jsonSourceSharedLoadTestDocumentForPath(t, jsonSourceMissing, "data/source.json")
}

func jsonSourceSharedLoadTestDocumentForPath(t *testing.T, jsonSourceMissing bool, variantPath string) Document {
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
				Name:   variantPath,
				ImplID: "json-impl-a",
			},
			"json-variant-b": {
				ID:     "json-variant-b",
				Name:   variantPath,
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

func setJSONSourceKeysForSharedLoadTestDocument(t *testing.T, document *Document, projectID string, implID string, jsonSourceKeys []string) {
	t.Helper()

	project := document.Projects[projectID]
	impl := project.SectionImpls[implID]

	var payload map[string]any
	if err := json.Unmarshal(impl.Payload, &payload); err != nil {
		t.Fatalf("unmarshal shared-load section impl payload: %v", err)
	}
	payload["jsonSourceKeys"] = jsonSourceKeys
	impl.Payload = mustMarshalProjectObject(payload)
	project.SectionImpls[implID] = impl
	document.Projects[projectID] = project
}
