package projectstate

import (
	"reflect"
	"testing"
)

func TestProjectDeleteSectionVariantPromptPathReturnsJSONSourceFile(t *testing.T) {
	t.Parallel()

	project := sectionVariantDeletionTestProject(t)

	promptPath, requiresPrompt, err := project.DeleteSectionVariantPromptPath("json-section", "json-variant-a")
	if err != nil {
		t.Fatalf("DeleteSectionVariantPromptPath returned error: %v", err)
	}
	if !requiresPrompt {
		t.Fatal("expected json-source variant deletion to require a prompt")
	}
	if promptPath != "data/source.json" {
		t.Fatalf("expected prompt path data/source.json, got %q", promptPath)
	}
}

func TestProjectDeleteSectionVariantRemovesVariantEdgesAndVariantSpecificState(t *testing.T) {
	t.Parallel()

	project := sectionVariantDeletionTestProject(t)

	if err := project.DeleteSectionVariant("source-section", "source-variant-b"); err != nil {
		t.Fatalf("DeleteSectionVariant returned error: %v", err)
	}

	sourceSection := project.Sections["source-section"]
	if !reflect.DeepEqual(sourceSection.VariantIDs, []string{"source-variant-a"}) {
		t.Fatalf("expected source-section variants [source-variant-a], got %#v", sourceSection.VariantIDs)
	}
	if sourceSection.DefaultVariantID != "source-variant-a" {
		t.Fatalf("expected source-section default variant source-variant-a, got %q", sourceSection.DefaultVariantID)
	}
	if got := project.SectionVariantMap["source-section"]; got != "source-variant-a" {
		t.Fatalf("expected active source-section variant source-variant-a, got %q", got)
	}
	if len(project.Edges) != 0 {
		t.Fatalf("expected deleted variant edges to be removed, got %#v", project.Edges)
	}
	if _, ok := project.SectionVariants["source-variant-b"]; ok {
		t.Fatal("did not expect deleted section variant to remain in project state")
	}
	if _, ok := project.SectionImpls["source-impl-b"]; ok {
		t.Fatal("did not expect deleted variant impl to remain in project state")
	}
	if _, ok := project.CodeObjVariants["source-root-variant-b"]; ok {
		t.Fatal("did not expect deleted root code object variant to remain in project state")
	}
	if _, ok := project.CodeObjVariants["source-param-variant-b"]; ok {
		t.Fatal("did not expect deleted param code object variant to remain in project state")
	}
	if _, ok := project.CodeObjImpls["source-root-impl-b"]; ok {
		t.Fatal("did not expect deleted root code object impl to remain in project state")
	}
	if _, ok := project.CodeObjImpls["source-param-impl-b"]; ok {
		t.Fatal("did not expect deleted param code object impl to remain in project state")
	}

	sourceRoot := project.CodeObjs["source-root"]
	if !reflect.DeepEqual(sourceRoot.VariantIDs, []string{"source-root-variant-a"}) {
		t.Fatalf("expected source-root variants [source-root-variant-a], got %#v", sourceRoot.VariantIDs)
	}
	if sourceRoot.DefaultVariantID != "source-root-variant-a" {
		t.Fatalf("expected source-root default variant source-root-variant-a, got %q", sourceRoot.DefaultVariantID)
	}

	sourceParam := project.CodeObjs["source-param"]
	if !reflect.DeepEqual(sourceParam.VariantIDs, []string{"source-param-variant-a"}) {
		t.Fatalf("expected source-param variants [source-param-variant-a], got %#v", sourceParam.VariantIDs)
	}
	if sourceParam.DefaultVariantID != "source-param-variant-a" {
		t.Fatalf("expected source-param default variant source-param-variant-a, got %q", sourceParam.DefaultVariantID)
	}

	targetPayload, err := effectiveCodeObjectPayloadForVariant(project, "target-param", "target-param-variant")
	if err != nil {
		t.Fatalf("effectiveCodeObjectPayloadForVariant returned error: %v", err)
	}
	if got := payloadStringField(targetPayload, "value"); got != "" {
		t.Fatalf("expected target param value to be cleared after deleting the last incoming edge, got %q", got)
	}
}

// Variant deletion should clear password secrets for impls that disappear with
// the removed code object variant instead of leaving stale runtime secrets.
func TestProjectDeleteSectionVariantClearsRemovedPasswordSecret(t *testing.T) {
	t.Parallel()

	project := sectionVariantDeletionTestProject(t)
	project.passwordSecrets = NewMemoryPasswordSecretStore()
	project.CodeObjImpls["source-param-impl-b"] = CodeObjectImpl{
		ID:      "source-param-impl-b",
		Type:    "PasswordParam",
		Payload: mustMarshalProjectObject(map[string]any{"id": "source-param-impl-b", "type": "PasswordParam", "value": "", "hasSecret": true}),
	}
	if err := project.passwordSecrets.Set("source-param-impl-b", "cleanup"); err != nil {
		t.Fatalf("seed password secret before DeleteSectionVariant: %v", err)
	}

	if err := project.DeleteSectionVariant("source-section", "source-variant-b"); err != nil {
		t.Fatalf("DeleteSectionVariant returned error: %v", err)
	}

	secret, err := project.passwordSecrets.Get("source-param-impl-b")
	if err != nil {
		t.Fatalf("read password secret after DeleteSectionVariant: %v", err)
	}
	if secret != "" {
		t.Fatalf("expected deleted variant password secret to clear, got %q", secret)
	}
	if _, ok := project.CodeObjImpls["source-param-impl-b"]; ok {
		t.Fatal("did not expect deleted password impl to remain in project state")
	}
}

func sectionVariantDeletionTestProject(t *testing.T) Project {
	t.Helper()

	return mustNormalizedVariantProject(t, Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"source-section": "source-variant-b",
			"target-section": "target-variant",
			"json-section":   "json-variant-a",
		},
		Sections: map[string]Section{
			"source-section": {
				ID:               "source-section",
				Name:             "Source",
				VariantIDs:       []string{"source-variant-a", "source-variant-b"},
				DefaultVariantID: "source-variant-b",
			},
			"target-section": {
				ID:               "target-section",
				Name:             "Target",
				VariantIDs:       []string{"target-variant"},
				DefaultVariantID: "target-variant",
			},
			"json-section": {
				ID:               "json-section",
				Name:             "JSON Source",
				VariantIDs:       []string{"json-variant-a", "json-variant-b"},
				DefaultVariantID: "json-variant-a",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"source-variant-a": {
				ID:     "source-variant-a",
				ImplID: "source-impl-a",
			},
			"source-variant-b": {
				ID:               "source-variant-b",
				ImplID:           "source-impl-b",
				NonPresetImplIDs: []string{"source-impl-b"},
			},
			"target-variant": {
				ID:     "target-variant",
				ImplID: "target-impl",
			},
			"json-variant-a": {
				ID:     "json-variant-a",
				ImplID: "json-impl-a",
				Name:   "data/source.json",
			},
			"json-variant-b": {
				ID:     "json-variant-b",
				ImplID: "json-impl-b",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"source-impl-a": {
				ID:   "source-impl-a",
				Kind: SectionKind("dict"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":              "source-impl-a",
					"type":            "Dict",
					"topLevelParamId": "source-root",
					"codeObjVariantMap": map[string]string{
						"source-root":  "source-root-variant-a",
						"source-param": "source-param-variant-a",
					},
					"edgeOutputPorts": []map[string]any{{"id": "source-port", "accessor": ".result"}},
				}),
			},
			"source-impl-b": {
				ID:   "source-impl-b",
				Kind: SectionKind("dict"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":              "source-impl-b",
					"type":            "Dict",
					"topLevelParamId": "source-root",
					"codeObjVariantMap": map[string]string{
						"source-root":  "source-root-variant-b",
						"source-param": "source-param-variant-b",
					},
					"edgeOutputPorts": []map[string]any{{"id": "source-port", "accessor": ".result"}},
				}),
			},
			"target-impl": {
				ID:   "target-impl",
				Kind: SectionKind("dict"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":              "target-impl",
					"type":            "Dict",
					"topLevelParamId": "target-root",
					"codeObjVariantMap": map[string]string{
						"target-root":  "target-root-variant",
						"target-param": "target-param-variant",
					},
					"edgeInputParams": []string{"target-param"},
				}),
			},
			"json-impl-a": {
				ID:   "json-impl-a",
				Kind: SectionKind("dict"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":             "json-impl-a",
					"type":           "Dict",
					"isJsonSource":   true,
					"jsonSourceKeys": []string{"config"},
				}),
			},
			"json-impl-b": {
				ID:   "json-impl-b",
				Kind: SectionKind("dict"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":   "json-impl-b",
					"type": "Dict",
				}),
			},
		},
		CodeObjs: map[string]CodeObject{
			"source-root": {
				ID:               "source-root",
				Name:             "root",
				VariantIDs:       []string{"source-root-variant-a", "source-root-variant-b"},
				DefaultVariantID: "source-root-variant-b",
			},
			"source-param": {
				ID:               "source-param",
				Name:             "value",
				VariantIDs:       []string{"source-param-variant-a", "source-param-variant-b"},
				DefaultVariantID: "source-param-variant-b",
			},
			"target-root": {
				ID:               "target-root",
				Name:             "root",
				VariantIDs:       []string{"target-root-variant"},
				DefaultVariantID: "target-root-variant",
			},
			"target-param": {
				ID:               "target-param",
				Name:             "result",
				VariantIDs:       []string{"target-param-variant"},
				DefaultVariantID: "target-param-variant",
			},
		},
		CodeObjVariants: map[string]CodeObjectVariant{
			"source-root-variant-a": {
				ID:     "source-root-variant-a",
				ImplID: "source-root-impl-a",
			},
			"source-root-variant-b": {
				ID:     "source-root-variant-b",
				ImplID: "source-root-impl-b",
			},
			"source-param-variant-a": {
				ID:     "source-param-variant-a",
				ImplID: "source-param-impl-a",
			},
			"source-param-variant-b": {
				ID:     "source-param-variant-b",
				ImplID: "source-param-impl-b",
			},
			"target-root-variant": {
				ID:     "target-root-variant",
				ImplID: "target-root-impl",
			},
			"target-param-variant": {
				ID:     "target-param-variant",
				ImplID: "target-param-impl",
			},
		},
		CodeObjImpls: map[string]CodeObjectImpl{
			"source-root-impl-a": {
				ID:      "source-root-impl-a",
				Type:    "NestedParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "source-root-impl-a", "type": "NestedParam", "children": []string{"source-param"}}),
			},
			"source-root-impl-b": {
				ID:      "source-root-impl-b",
				Type:    "NestedParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "source-root-impl-b", "type": "NestedParam", "children": []string{"source-param"}}),
			},
			"source-param-impl-a": {
				ID:      "source-param-impl-a",
				Type:    "TextParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "source-param-impl-a", "type": "TextParam", "value": "source-a"}),
			},
			"source-param-impl-b": {
				ID:      "source-param-impl-b",
				Type:    "TextParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "source-param-impl-b", "type": "TextParam", "value": "source-b"}),
			},
			"target-root-impl": {
				ID:      "target-root-impl",
				Type:    "NestedParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "target-root-impl", "type": "NestedParam", "children": []string{"target-param"}}),
			},
			"target-param-impl": {
				ID:      "target-param-impl",
				Type:    "TextParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "target-param-impl", "type": "TextParam", "value": "seed"}),
			},
		},
		Edges: []Edge{
			{
				ID:              "source-edge",
				SourceSectionID: "source-section",
				SourceVariantID: "source-variant-b",
				SourcePortID:    "source-port",
				TargetSectionID: "target-section",
				TargetVariantID: "target-variant",
				TargetPortID:    "target-param",
			},
		},
	})
}
