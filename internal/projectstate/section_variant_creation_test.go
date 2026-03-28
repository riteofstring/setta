package projectstate

import (
	"reflect"
	"testing"
)

func TestProjectCreateNewSectionVariantDuplicatesParamVariantStateAndEdges(t *testing.T) {
	t.Parallel()

	project := mustNormalizedVariantProject(t, Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"source-section": "source-variant",
			"target-section": "target-variant",
		},
		Sections: map[string]Section{
			"source-section": {
				ID:               "source-section",
				Name:             "Source",
				VariantIDs:       []string{"source-variant"},
				DefaultVariantID: "source-variant",
			},
			"target-section": {
				ID:               "target-section",
				Name:             "Target",
				VariantIDs:       []string{"target-variant"},
				DefaultVariantID: "target-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"source-variant": {
				ID:     "source-variant",
				ImplID: "source-impl",
				Modifier: mustMarshalProjectObject(map[string]any{
					"title": "variant-title",
				}),
			},
			"target-variant": {
				ID:     "target-variant",
				ImplID: "target-impl",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"source-impl": {
				ID:      "source-impl",
				Kind:    SectionKind("dict"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "source-impl", "type": "Dict", "codeObjVariantMap": map[string]string{"source-param": "source-param-variant"}, "edgeInputParams": []string{"source-param"}, "edgeOutputPorts": []map[string]any{{"id": "source-port", "accessor": ".result"}}, "ignoreTypeErrors": map[string]any{"callable": false, "params": map[string]any{}}}),
			},
			"target-impl": {
				ID:      "target-impl",
				Kind:    SectionKind("dict"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "target-impl", "type": "Dict", "codeObjVariantMap": map[string]string{"target-param": "target-param-variant"}, "edgeInputParams": []string{"target-param"}, "edgeOutputPorts": []map[string]any{{"id": "target-port", "accessor": ""}}, "ignoreTypeErrors": map[string]any{"callable": false, "params": map[string]any{}}}),
			},
		},
		CodeObjs: map[string]CodeObject{
			"source-param": {
				ID:               "source-param",
				Name:             "source_param",
				VariantIDs:       []string{"source-param-variant"},
				DefaultVariantID: "source-param-variant",
			},
			"target-param": {
				ID:               "target-param",
				Name:             "target_param",
				VariantIDs:       []string{"target-param-variant"},
				DefaultVariantID: "target-param-variant",
			},
		},
		CodeObjVariants: map[string]CodeObjectVariant{
			"source-param-variant": {
				ID:     "source-param-variant",
				ImplID: "source-param-impl",
			},
			"target-param-variant": {
				ID:     "target-param-variant",
				ImplID: "target-param-impl",
			},
		},
		CodeObjImpls: map[string]CodeObjectImpl{
			"source-param-impl": {
				ID:      "source-param-impl",
				Type:    "TextParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "source-param-impl", "type": "TextParam", "value": "source"}),
			},
			"target-param-impl": {
				ID:      "target-param-impl",
				Type:    "TextParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "target-param-impl", "type": "TextParam", "value": "target"}),
			},
		},
		Edges: []Edge{
			{
				ID:              "edge-out",
				SourceSectionID: "source-section",
				SourceVariantID: "source-variant",
				SourcePortID:    "source-port",
				TargetSectionID: "target-section",
				TargetVariantID: "target-variant",
				TargetPortID:    "target-param",
			},
			{
				ID:              "edge-in",
				SourceSectionID: "target-section",
				SourceVariantID: "target-variant",
				SourcePortID:    "target-port",
				TargetSectionID: "source-section",
				TargetVariantID: "source-variant",
				TargetPortID:    "source-param",
			},
			{
				ID:              "edge-ignored",
				SourceSectionID: "source-section",
				SourceVariantID: "source-variant",
				SourcePortID:    "ignored-port",
				TargetSectionID: "target-section",
				TargetVariantID: "target-variant",
				TargetPortID:    "target-param",
			},
		},
	})

	result, err := project.CreateNewSectionVariant(CreateNewSectionVariantInput{
		SectionID: "source-section",
	})
	if err != nil {
		t.Fatalf("CreateNewSectionVariant returned error: %v", err)
	}
	if result.VariantID == "" || result.VariantID == "source-variant" {
		t.Fatalf("expected a distinct created section variant id, got %q", result.VariantID)
	}

	section := project.Sections["source-section"]
	if !reflect.DeepEqual(section.VariantIDs, []string{"source-variant", result.VariantID}) {
		t.Fatalf("expected source-section variants [source-variant %s], got %#v", result.VariantID, section.VariantIDs)
	}
	if got := project.SectionVariantMap["source-section"]; got != result.VariantID {
		t.Fatalf("expected active source-section variant %q, got %q", result.VariantID, got)
	}

	newVariant := project.SectionVariants[result.VariantID]
	if newVariant.Name == "" {
		t.Fatal("expected created section variant name")
	}
	if newVariant.ImplID == "source-impl" {
		t.Fatalf("expected a cloned section impl id, got %#v", newVariant)
	}
	if !reflect.DeepEqual(newVariant.NonPresetImplIDs, []string{newVariant.ImplID}) {
		t.Fatalf("expected non-preset impl ids [%s], got %#v", newVariant.ImplID, newVariant.NonPresetImplIDs)
	}
	if sourceVariantName := project.SectionVariants["source-variant"].Name; sourceVariantName == "" {
		t.Fatal("expected normalized source variant name")
	} else if newVariant.Name == sourceVariantName {
		t.Fatalf("expected created variant name to differ from source variant name %q", sourceVariantName)
	}

	originalPayload, err := effectiveSectionPayload(project, "source-section", "source-variant")
	if err != nil {
		t.Fatalf("original effectiveSectionPayload: %v", err)
	}
	newPayload, err := effectiveSectionPayload(project, "source-section", result.VariantID)
	if err != nil {
		t.Fatalf("new effectiveSectionPayload: %v", err)
	}
	if got := payloadStringField(newPayload, "title"); got != "variant-title" {
		t.Fatalf("expected new variant title variant-title, got %q", got)
	}
	if !reflect.DeepEqual(payloadStringArrayField(newPayload, "edgeInputParams"), []string{"source-param"}) {
		t.Fatalf("expected copied edgeInputParams [source-param], got %#v", payloadStringArrayField(newPayload, "edgeInputParams"))
	}
	newPorts := payloadEdgeOutputPorts(newPayload)
	if len(newPorts) != 1 || newPorts[0].ID != "source-port" || newPorts[0].Accessor != ".result" {
		t.Fatalf("expected copied edgeOutputPorts [{source-port .result}], got %#v", newPorts)
	}

	originalCodeObjVariantMap := payloadStringMapField(originalPayload, "codeObjVariantMap")
	newCodeObjVariantMap := payloadStringMapField(newPayload, "codeObjVariantMap")
	if originalCodeObjVariantMap["source-param"] == "" {
		t.Fatalf("expected original codeObjVariantMap to contain source-param, got %#v", originalCodeObjVariantMap)
	}
	if newCodeObjVariantMap["source-param"] == "" || newCodeObjVariantMap["source-param"] == originalCodeObjVariantMap["source-param"] {
		t.Fatalf("expected a distinct code object variant id for source-param, got %#v", newCodeObjVariantMap)
	}

	sourceCodeObj := project.CodeObjs["source-param"]
	if len(sourceCodeObj.VariantIDs) != 2 {
		t.Fatalf("expected source-param to gain one variant, got %#v", sourceCodeObj.VariantIDs)
	}
	newCodeObjVariant := project.CodeObjVariants[newCodeObjVariantMap["source-param"]]
	if newCodeObjVariant.ImplID == "source-param-impl" {
		t.Fatalf("expected a cloned code object impl id, got %#v", newCodeObjVariant)
	}

	newCodeObjPayload, _, _, _, err := effectiveCodeObjectPayload(project, newCodeObjVariantMap, "source-param")
	if err != nil {
		t.Fatalf("new effectiveCodeObjectPayload: %v", err)
	}
	if got := payloadStringField(newCodeObjPayload, "value"); got != "source" {
		t.Fatalf("expected cloned code object value source, got %q", got)
	}

	if len(project.Edges) != 5 {
		t.Fatalf("expected 5 edges after variant copy, got %#v", project.Edges)
	}

	var copiedOutgoing *Edge
	var copiedIncoming *Edge
	for _, edge := range project.Edges {
		switch {
		case edge.ID != "edge-out" &&
			edge.SourceSectionID == "source-section" &&
			edge.SourceVariantID == result.VariantID &&
			edge.SourcePortID == "source-port" &&
			edge.TargetSectionID == "target-section" &&
			edge.TargetVariantID == "target-variant" &&
			edge.TargetPortID == "target-param":
			copiedOutgoing = &edge
		case edge.ID != "edge-in" &&
			edge.SourceSectionID == "target-section" &&
			edge.SourceVariantID == "target-variant" &&
			edge.SourcePortID == "target-port" &&
			edge.TargetSectionID == "source-section" &&
			edge.TargetVariantID == result.VariantID &&
			edge.TargetPortID == "source-param":
			copiedIncoming = &edge
		}
	}
	if copiedOutgoing == nil {
		t.Fatalf("expected an outgoing edge copy for %q, got %#v", result.VariantID, project.Edges)
	}
	if copiedIncoming == nil {
		t.Fatalf("expected an incoming edge copy for %q, got %#v", result.VariantID, project.Edges)
	}
}

func TestProjectNormalizedAssignsNamesToBlankSectionVariants(t *testing.T) {
	t.Parallel()

	project, err := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"source-section": "source-variant-a",
		},
		Sections: map[string]Section{
			"source-section": {
				ID:               "source-section",
				Name:             "Source",
				VariantIDs:       []string{"source-variant-a", "source-variant-b"},
				DefaultVariantID: "source-variant-a",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"source-variant-a": {
				ID:     "source-variant-a",
				ImplID: "source-impl-a",
			},
			"source-variant-b": {
				ID:     "source-variant-b",
				ImplID: "source-impl-b",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"source-impl-a": {
				ID:      "source-impl-a",
				Kind:    SectionKind("dict"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "source-impl-a", "type": "Dict"}),
			},
			"source-impl-b": {
				ID:      "source-impl-b",
				Kind:    SectionKind("dict"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "source-impl-b", "type": "Dict"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("Normalized returned error: %v", err)
	}

	firstVariant := project.SectionVariants["source-variant-a"]
	secondVariant := project.SectionVariants["source-variant-b"]
	if firstVariant.Name != "Source" {
		t.Fatalf("expected first repaired variant name Source, got %q", firstVariant.Name)
	}
	if secondVariant.Name != "Source_2" {
		t.Fatalf("expected second repaired variant name Source_2, got %q", secondVariant.Name)
	}
}

func TestProjectCreateNewSectionVariantKeepsEdgePortEditsVariantScoped(t *testing.T) {
	t.Parallel()

	project := mustNormalizedVariantProject(t, Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"source-section": "source-variant",
		},
		Sections: map[string]Section{
			"source-section": {
				ID:               "source-section",
				Name:             "Source",
				VariantIDs:       []string{"source-variant"},
				DefaultVariantID: "source-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"source-variant": {
				ID:     "source-variant",
				ImplID: "source-impl",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"source-impl": {
				ID:      "source-impl",
				Kind:    SectionKind("dict"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "source-impl", "type": "Dict", "codeObjVariantMap": map[string]string{"source-param": "source-param-variant"}, "edgeInputParams": []string{"source-param"}, "edgeOutputPorts": []map[string]any{{"id": "source-port", "accessor": ""}}, "ignoreTypeErrors": map[string]any{"callable": false, "params": map[string]any{}}}),
			},
		},
		CodeObjs: map[string]CodeObject{
			"source-param": {
				ID:               "source-param",
				Name:             "source_param",
				VariantIDs:       []string{"source-param-variant"},
				DefaultVariantID: "source-param-variant",
			},
		},
		CodeObjVariants: map[string]CodeObjectVariant{
			"source-param-variant": {
				ID:     "source-param-variant",
				ImplID: "source-param-impl",
			},
		},
		CodeObjImpls: map[string]CodeObjectImpl{
			"source-param-impl": {
				ID:      "source-param-impl",
				Type:    "TextParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "source-param-impl", "type": "TextParam", "value": "source"}),
			},
		},
	})

	result, err := project.CreateNewSectionVariant(CreateNewSectionVariantInput{
		SectionID: "source-section",
	})
	if err != nil {
		t.Fatalf("CreateNewSectionVariant returned error: %v", err)
	}
	if result.VariantID == "" || result.VariantID == "source-variant" {
		t.Fatalf("expected a distinct created section variant id, got %q", result.VariantID)
	}

	if err := project.SetSectionEdgeInputs("source-section", []string{}); err != nil {
		t.Fatalf("SetSectionEdgeInputs returned error: %v", err)
	}
	if err := project.SetSectionEdgeOutputs("source-section", []EdgePort{{ID: "source-port", Accessor: ".bar"}}, nil); err != nil {
		t.Fatalf("SetSectionEdgeOutputs returned error: %v", err)
	}

	originalPayload, err := effectiveSectionPayload(project, "source-section", "source-variant")
	if err != nil {
		t.Fatalf("original effectiveSectionPayload: %v", err)
	}
	newPayload, err := effectiveSectionPayload(project, "source-section", result.VariantID)
	if err != nil {
		t.Fatalf("new effectiveSectionPayload: %v", err)
	}

	if got := payloadStringArrayField(originalPayload, "edgeInputParams"); !reflect.DeepEqual(got, []string{"source-param"}) {
		t.Fatalf("expected original edgeInputParams [source-param], got %#v", got)
	}
	if got := payloadEdgeOutputPorts(originalPayload); !reflect.DeepEqual(got, []EdgePort{{ID: "source-port", Accessor: ""}}) {
		t.Fatalf("expected original edgeOutputPorts [{source-port }], got %#v", got)
	}
	if got := payloadStringArrayField(newPayload, "edgeInputParams"); len(got) != 0 {
		t.Fatalf("expected new variant edgeInputParams [], got %#v", got)
	}
	if got := payloadEdgeOutputPorts(newPayload); !reflect.DeepEqual(got, []EdgePort{{ID: "source-port", Accessor: ".bar"}}) {
		t.Fatalf("expected new variant edgeOutputPorts [{source-port .bar}], got %#v", got)
	}
}

func TestProjectCreateNewSectionVariantReusesPresetImplsAndVariantOverrides(t *testing.T) {
	t.Parallel()

	project := mustNormalizedVariantProject(t, Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"preset-section": "preset-variant",
		},
		Sections: map[string]Section{
			"preset-section": {
				ID:               "preset-section",
				Name:             "Preset",
				VariantIDs:       []string{"preset-variant"},
				DefaultVariantID: "preset-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"preset-variant": {
				ID:     "preset-variant",
				ImplID: "preset-impl",
				Modifier: mustMarshalProjectObject(map[string]any{
					"title":             "preset-title",
					"codeObjVariantMap": map[string]string{"preset-param": "preset-param-variant"},
					"edgeInputParams":   []string{"preset-param"},
					"edgeOutputPorts":   []map[string]any{{"id": "preset-port", "accessor": ".bar"}},
				}),
			},
		},
		SectionImpls: map[string]SectionImpl{
			"preset-impl": {
				ID:      "preset-impl",
				Kind:    SectionKind("dict"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "preset-impl", "type": "Dict", "isPreset": true, "ignoreTypeErrors": map[string]any{"callable": false, "params": map[string]any{}}}),
			},
		},
		CodeObjs: map[string]CodeObject{
			"preset-param": {
				ID:               "preset-param",
				Name:             "preset_param",
				VariantIDs:       []string{"preset-param-variant"},
				DefaultVariantID: "preset-param-variant",
			},
		},
		CodeObjVariants: map[string]CodeObjectVariant{
			"preset-param-variant": {
				ID:     "preset-param-variant",
				ImplID: "preset-param-impl",
				Modifier: mustMarshalProjectObject(map[string]any{
					"value": "variant-value",
				}),
			},
		},
		CodeObjImpls: map[string]CodeObjectImpl{
			"preset-param-impl": {
				ID:      "preset-param-impl",
				Type:    "TextParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "preset-param-impl", "type": "TextParam", "isPreset": true, "value": "base-value"}),
			},
		},
	})

	result, err := project.CreateNewSectionVariant(CreateNewSectionVariantInput{
		SectionID: "preset-section",
	})
	if err != nil {
		t.Fatalf("CreateNewSectionVariant returned error: %v", err)
	}
	if result.VariantID == "" || result.VariantID == "preset-variant" {
		t.Fatalf("expected a distinct created section variant id, got %q", result.VariantID)
	}

	newVariant := project.SectionVariants[result.VariantID]
	if newVariant.ImplID != "preset-impl" {
		t.Fatalf("expected preset impl reuse for new section variant, got %#v", newVariant)
	}

	newPayload, err := effectiveSectionPayload(project, "preset-section", result.VariantID)
	if err != nil {
		t.Fatalf("new effectiveSectionPayload: %v", err)
	}
	if got := payloadStringField(newPayload, "title"); got != "preset-title" {
		t.Fatalf("expected copied preset title preset-title, got %q", got)
	}
	if !reflect.DeepEqual(payloadStringArrayField(newPayload, "edgeInputParams"), []string{"preset-param"}) {
		t.Fatalf("expected copied preset edgeInputParams [preset-param], got %#v", payloadStringArrayField(newPayload, "edgeInputParams"))
	}
	newPorts := payloadEdgeOutputPorts(newPayload)
	if len(newPorts) != 1 || newPorts[0].ID != "preset-port" || newPorts[0].Accessor != ".bar" {
		t.Fatalf("expected copied preset edgeOutputPorts [{preset-port .bar}], got %#v", newPorts)
	}

	newCodeObjVariantMap := payloadStringMapField(newPayload, "codeObjVariantMap")
	if newCodeObjVariantMap["preset-param"] == "" || newCodeObjVariantMap["preset-param"] == "preset-param-variant" {
		t.Fatalf("expected a distinct code object variant id for preset-param, got %#v", newCodeObjVariantMap)
	}
	newCodeObjVariant := project.CodeObjVariants[newCodeObjVariantMap["preset-param"]]
	if newCodeObjVariant.ImplID != "preset-param-impl" {
		t.Fatalf("expected preset code object impl reuse, got %#v", newCodeObjVariant)
	}

	newCodeObjPayload, _, _, _, err := effectiveCodeObjectPayload(project, newCodeObjVariantMap, "preset-param")
	if err != nil {
		t.Fatalf("new effectiveCodeObjectPayload: %v", err)
	}
	if got := payloadStringField(newCodeObjPayload, "value"); got != "variant-value" {
		t.Fatalf("expected copied preset code object variant value variant-value, got %q", got)
	}
}

func mustNormalizedVariantProject(t *testing.T, project Project) Project {
	t.Helper()

	normalized, err := project.Normalized()
	if err != nil {
		t.Fatalf("normalize project: %v", err)
	}
	return normalized
}
