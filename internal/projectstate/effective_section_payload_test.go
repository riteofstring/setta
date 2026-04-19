package projectstate

import (
	"strings"
	"testing"
)

func TestProjectSetCurrentSectionFieldStoresPresetDrawLayersOnVariantModifier(t *testing.T) {
	t.Parallel()

	project, err := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"draw-section": "draw-variant",
		},
		Sections: map[string]Section{
			"draw-section": {
				ID:               "draw-section",
				Name:             "Draw Section",
				VariantIDs:       []string{"draw-variant"},
				DefaultVariantID: "draw-variant",
				UnsharedKeys:     []string{"layers"},
			},
		},
		SectionVariants: map[string]SectionVariant{
			"draw-variant": {
				ID:     "draw-variant",
				ImplID: "draw-impl",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"draw-impl": {
				ID:   "draw-impl",
				Kind: SectionKindDraw,
				Draw: &DrawSectionImpl{},
				Payload: mustMarshalProjectObject(map[string]any{
					"id":       "draw-impl",
					"type":     "Draw",
					"isPreset": true,
					"layers":   []any{},
				}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize preset draw project: %v", err)
	}

	layers := []any{
		map[string]any{
			"name":         "Layer 1",
			"visible":      false,
			"layerOpacity": 0.5,
			"elements": []any{
				map[string]any{
					"dataPath":    "foo",
					"transformId": "bar",
				},
			},
		},
	}

	if err := project.setCurrentSectionField("draw-section", "layers", layers); err != nil {
		t.Fatalf("set preset draw layers: %v", err)
	}

	sharedModifier, err := rawObjectFromProjectPayload(project.Sections["draw-section"].SharedModifier)
	if err != nil {
		t.Fatalf("decode draw section sharedModifier: %v", err)
	}
	if _, ok := sharedModifier["layers"]; ok {
		t.Fatalf("expected preset draw layers to avoid sharedModifier, got %#v", sharedModifier["layers"])
	}

	implPayload, err := rawObjectFromProjectPayload(project.SectionImpls["draw-impl"].Payload)
	if err != nil {
		t.Fatalf("decode draw impl payload: %v", err)
	}
	rawImplLayers, ok := implPayload["layers"].([]any)
	if !ok || len(rawImplLayers) != 0 {
		t.Fatalf("expected preset impl payload layers to stay empty, got %#v", implPayload["layers"])
	}

	modifier, err := rawObjectFromProjectPayload(project.SectionVariants["draw-variant"].Modifier)
	if err != nil {
		t.Fatalf("decode draw variant modifier: %v", err)
	}
	storedLayers, ok := modifier["layers"].([]any)
	if !ok || len(storedLayers) != 1 {
		t.Fatalf("expected one stored draw layer in variant modifier, got %#v", modifier["layers"])
	}
	storedLayer, ok := storedLayers[0].(map[string]any)
	if !ok {
		t.Fatalf("expected stored draw layer object, got %#v", storedLayers[0])
	}
	if storedLayer["name"] != "Layer 1" {
		t.Fatalf("expected stored layer name Layer 1, got %#v", storedLayer["name"])
	}
	if storedLayer["visible"] != false {
		t.Fatalf("expected stored layer visible=false, got %#v", storedLayer["visible"])
	}
	if storedLayer["layerOpacity"] != 0.5 {
		t.Fatalf("expected stored layer opacity 0.5, got %#v", storedLayer["layerOpacity"])
	}

	effectivePayload, err := effectiveSectionPayload(project, "draw-section", "draw-variant")
	if err != nil {
		t.Fatalf("build effective draw payload: %v", err)
	}
	effectiveLayers, ok := effectivePayload["layers"].([]any)
	if !ok || len(effectiveLayers) != 1 {
		t.Fatalf("expected one effective draw layer, got %#v", effectivePayload["layers"])
	}
	effectiveLayer, ok := effectiveLayers[0].(map[string]any)
	if !ok {
		t.Fatalf("expected effective draw layer object, got %#v", effectiveLayers[0])
	}
	if effectiveLayer["name"] != "Layer 1" {
		t.Fatalf("expected effective layer name Layer 1, got %#v", effectiveLayer["name"])
	}
	if effectiveLayer["visible"] != false {
		t.Fatalf("expected effective layer visible=false, got %#v", effectiveLayer["visible"])
	}
	if effectiveLayer["layerOpacity"] != 0.5 {
		t.Fatalf("expected effective layer opacity 0.5, got %#v", effectiveLayer["layerOpacity"])
	}
}

func TestEffectiveSectionPayloadNormalizesDrawCollectionsAfterModifierMerge(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name      string
		modifier  map[string]any
		assertion func(t *testing.T, payload map[string]any)
	}{
		{
			name: "nil layers modifier",
			modifier: map[string]any{
				"layers": nil,
			},
			assertion: func(t *testing.T, payload map[string]any) {
				t.Helper()
				layers, ok := payload["layers"].([]any)
				if !ok || layers == nil || len(layers) != 0 {
					t.Fatalf("expected normalized draw layers array, got %#v", payload["layers"])
				}
			},
		},
		{
			name: "nil layer elements modifier",
			modifier: map[string]any{
				"layers": []any{
					map[string]any{
						"name":         "Layer 1",
						"visible":      true,
						"layerOpacity": 1.0,
						"elements":     nil,
					},
				},
			},
			assertion: func(t *testing.T, payload map[string]any) {
				t.Helper()
				layers, ok := payload["layers"].([]any)
				if !ok || len(layers) != 1 {
					t.Fatalf("expected one normalized draw layer, got %#v", payload["layers"])
				}
				layer, ok := layers[0].(map[string]any)
				if !ok {
					t.Fatalf("expected draw layer object, got %#v", layers[0])
				}
				elements, ok := layer["elements"].([]any)
				if !ok || elements == nil || len(elements) != 0 {
					t.Fatalf("expected normalized draw layer elements array, got %#v", layer["elements"])
				}
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			project, err := Project{
				ID:   "project-alpha",
				Name: "Alpha",
				SectionVariantMap: map[string]string{
					"draw-section": "draw-variant",
				},
				Sections: map[string]Section{
					"draw-section": {
						ID:               "draw-section",
						Name:             "Draw Section",
						VariantIDs:       []string{"draw-variant"},
						DefaultVariantID: "draw-variant",
					},
				},
				SectionVariants: map[string]SectionVariant{
					"draw-variant": {
						ID:       "draw-variant",
						ImplID:   "draw-impl",
						Modifier: mustMarshalProjectObject(tc.modifier),
					},
				},
				SectionImpls: map[string]SectionImpl{
					"draw-impl": {
						ID:   "draw-impl",
						Kind: SectionKindDraw,
						Draw: &DrawSectionImpl{},
						Payload: mustMarshalProjectObject(map[string]any{
							"id":     "draw-impl",
							"type":   "Draw",
							"layers": []any{},
						}),
					},
				},
			}.Normalized()
			if err != nil {
				t.Fatalf("normalize draw project: %v", err)
			}

			payload, err := effectiveSectionPayload(project, "draw-section", "draw-variant")
			if err != nil {
				t.Fatalf("build effective draw payload: %v", err)
			}
			tc.assertion(t, payload)
		})
	}
}

func TestEffectiveSectionPayloadIncludesImplBackedDrawAndBindingFields(t *testing.T) {
	t.Parallel()

	project, err := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"code-section": "code-variant",
			"draw-section": "draw-variant",
		},
		Sections: map[string]Section{
			"code-section": {
				ID:               "code-section",
				Name:             "Code",
				VariantIDs:       []string{"code-variant"},
				DefaultVariantID: "code-variant",
			},
			"draw-section": {
				ID:               "draw-section",
				Name:             "Draw",
				VariantIDs:       []string{"draw-variant"},
				DefaultVariantID: "draw-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"code-variant": {
				ID:     "code-variant",
				ImplID: "code-impl",
			},
			"draw-variant": {
				ID:     "draw-variant",
				ImplID: "draw-impl",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"code-impl": {
				ID:   "code-impl",
				Kind: SectionKindCode,
				Code: &CodeSectionImpl{
					Language: CodeLanguagePython,
					Binding: &CodeFileBinding{
						Path:        "code/auto.py",
						AccessMode:  CodeFileAccessModeReadWrite,
						AutoBinding: true,
					},
				},
			},
			"draw-impl": {
				ID:   "draw-impl",
				Kind: SectionKindDraw,
				Draw: &DrawSectionImpl{
					RenderedImagePath: "artifacts/draw.png",
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize project: %v", err)
	}

	codePayload, err := effectiveSectionPayload(project, "code-section", "code-variant")
	if err != nil {
		t.Fatalf("effective code payload: %v", err)
	}
	codeBinding, ok := payloadObjectField(codePayload, "codeFileBinding")
	if !ok {
		t.Fatalf("expected codeFileBinding object, got %#v", codePayload["codeFileBinding"])
	}
	if got := payloadRawStringField(codeBinding, "canonical_path"); got != "code/auto.py" {
		t.Fatalf("expected canonical_path code/auto.py, got %q", got)
	}
	if got, ok := codeBinding["autoBinding"].(bool); !ok || !got {
		t.Fatalf("expected autoBinding=true, got %#v", codeBinding["autoBinding"])
	}

	drawPayload, err := effectiveSectionPayload(project, "draw-section", "draw-variant")
	if err != nil {
		t.Fatalf("effective draw payload: %v", err)
	}
	if got := payloadRawStringField(drawPayload, "renderedImagePath"); got != "artifacts/draw.png" {
		t.Fatalf("expected renderedImagePath artifacts/draw.png, got %q", got)
	}
}

func TestEffectiveSectionPayloadMaterializesLegacySectionImplDefaults(t *testing.T) {
	t.Parallel()

	project, err := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"callable-section":  "callable-variant",
			"dict-section":      "dict-variant",
			"generated-section": "generated-variant",
			"group-section":     "group-variant",
			"iframe-section":    "iframe-variant",
		},
		Sections: map[string]Section{
			"callable-section": {
				ID:               "callable-section",
				Name:             "Callable",
				VariantIDs:       []string{"callable-variant"},
				DefaultVariantID: "callable-variant",
			},
			"dict-section": {
				ID:               "dict-section",
				Name:             "Dict",
				VariantIDs:       []string{"dict-variant"},
				DefaultVariantID: "dict-variant",
			},
			"generated-section": {
				ID:               "generated-section",
				Name:             "Generated",
				VariantIDs:       []string{"generated-variant"},
				DefaultVariantID: "generated-variant",
			},
			"group-section": {
				ID:               "group-section",
				Name:             "Group",
				VariantIDs:       []string{"group-variant"},
				DefaultVariantID: "group-variant",
			},
			"iframe-section": {
				ID:               "iframe-section",
				Name:             "IFrame",
				VariantIDs:       []string{"iframe-variant"},
				DefaultVariantID: "iframe-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"callable-variant": {
				ID:     "callable-variant",
				ImplID: "callable-impl",
			},
			"dict-variant": {
				ID:     "dict-variant",
				ImplID: "dict-impl",
			},
			"generated-variant": {
				ID:     "generated-variant",
				ImplID: "generated-impl",
			},
			"group-variant": {
				ID:     "group-variant",
				ImplID: "group-impl",
			},
			"iframe-variant": {
				ID:     "iframe-variant",
				ImplID: "iframe-impl",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"callable-impl": {
				ID:      "callable-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "callable-impl", "type": "Callable"}),
			},
			"dict-impl": {
				ID:      "dict-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "dict-impl", "type": "Dict"}),
			},
			"generated-impl": {
				ID:        "generated-impl",
				Kind:      SectionKindGenerated,
				Generated: &GeneratedSectionImpl{Kind: GeneratedSectionKindPythonCode},
			},
			"group-impl": {
				ID:      "group-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "group-impl", "type": "Group"}),
			},
			"iframe-impl": {
				ID:      "iframe-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "iframe-impl", "type": "IFrame"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize project: %v", err)
	}

	callablePayload, err := effectiveSectionPayload(project, "callable-section", "callable-variant")
	if err != nil {
		t.Fatalf("effective callable payload: %v", err)
	}
	if got := payloadStringField(callablePayload, "configLanguage"); got != "python" {
		t.Fatalf("expected callable configLanguage python, got %q", got)
	}
	if _, ok := callablePayload["codeObjVariantMap"].(map[string]any); !ok {
		t.Fatalf("expected callable codeObjVariantMap object, got %#v", callablePayload["codeObjVariantMap"])
	}
	if pinned, ok := callablePayload["pinnedParams"].([]any); !ok || len(pinned) != 0 {
		t.Fatalf("expected callable pinnedParams empty array, got %#v", callablePayload["pinnedParams"])
	}
	if selected, ok := callablePayload["selectedParams"].([]any); !ok || len(selected) != 0 {
		t.Fatalf("expected callable selectedParams empty array, got %#v", callablePayload["selectedParams"])
	}
	if edgeInputs, ok := callablePayload["edgeInputParams"].([]any); !ok || len(edgeInputs) != 0 {
		t.Fatalf("expected callable edgeInputParams empty array, got %#v", callablePayload["edgeInputParams"])
	}
	if edgeOutputs, ok := callablePayload["edgeOutputPorts"].([]any); !ok || len(edgeOutputs) != 0 {
		t.Fatalf("expected callable edgeOutputPorts empty array, got %#v", callablePayload["edgeOutputPorts"])
	}
	ignoreState, ok := callablePayload["ignoreTypeErrors"].(map[string]any)
	if !ok {
		t.Fatalf("expected callable ignoreTypeErrors object, got %#v", callablePayload["ignoreTypeErrors"])
	}
	if got := ignoreState["callable"]; got != false {
		t.Fatalf("expected callable ignoreTypeErrors.callable false, got %#v", got)
	}
	if params, ok := ignoreState["params"].(map[string]any); !ok || len(params) != 0 {
		t.Fatalf("expected callable ignoreTypeErrors.params empty object, got %#v", ignoreState["params"])
	}
	if value, ok := callablePayload["columnWidth"]; !ok || value != nil {
		t.Fatalf("expected callable columnWidth explicit null, got %#v", callablePayload["columnWidth"])
	}
	if value, ok := callablePayload["callable"]; !ok || value != nil {
		t.Fatalf("expected callable root explicit null, got %#v", callablePayload["callable"])
	}
	if got := callablePayload["hideParams"]; got != false {
		t.Fatalf("expected callable hideParams false, got %#v", got)
	}
	callableSize, ok := callablePayload["size"].(map[string]any)
	if !ok {
		t.Fatalf("expected callable size object, got %#v", callablePayload["size"])
	}
	if callableSize["width"] != 250.0 || callableSize["height"] != 150.0 {
		t.Fatalf("expected callable default size {250 150}, got %#v", callableSize)
	}

	dictPayload, err := effectiveSectionPayload(project, "dict-section", "dict-variant")
	if err != nil {
		t.Fatalf("effective dict payload: %v", err)
	}
	if value, ok := dictPayload["topLevelParamId"]; !ok || value != nil {
		t.Fatalf("expected dict topLevelParamId explicit null, got %#v", dictPayload["topLevelParamId"])
	}
	if got := dictPayload["isJsonSource"]; got != false {
		t.Fatalf("expected dict isJsonSource false, got %#v", got)
	}
	if keys, ok := dictPayload["jsonSourceKeys"].([]any); !ok || len(keys) != 0 {
		t.Fatalf("expected dict jsonSourceKeys empty array, got %#v", dictPayload["jsonSourceKeys"])
	}
	if got := dictPayload["jsonSourceMissing"]; got != false {
		t.Fatalf("expected dict jsonSourceMissing false, got %#v", got)
	}
	if children, ok := dictPayload["children"].([]any); !ok || len(children) != 0 {
		t.Fatalf("expected dict children empty array, got %#v", dictPayload["children"])
	}

	generatedPayload, err := effectiveSectionPayload(project, "generated-section", "generated-variant")
	if err != nil {
		t.Fatalf("effective generated payload: %v", err)
	}
	size, ok := generatedPayload["size"].(map[string]any)
	if !ok {
		t.Fatalf("expected generated size object, got %#v", generatedPayload["size"])
	}
	if size["width"] != 500.0 || size["height"] != 150.0 {
		t.Fatalf("expected generated default size {500 150}, got %#v", size)
	}
	if children, ok := generatedPayload["children"].([]any); !ok || len(children) != 0 {
		t.Fatalf("expected generated children empty array, got %#v", generatedPayload["children"])
	}

	groupPayload, err := effectiveSectionPayload(project, "group-section", "group-variant")
	if err != nil {
		t.Fatalf("effective group payload: %v", err)
	}
	groupSize, ok := groupPayload["size"].(map[string]any)
	if !ok {
		t.Fatalf("expected group size object, got %#v", groupPayload["size"])
	}
	if groupSize["width"] != 250.0 || groupSize["height"] != 150.0 {
		t.Fatalf("expected group default size {250 150}, got %#v", groupSize)
	}
	if children, ok := groupPayload["children"].([]any); !ok || len(children) != 0 {
		t.Fatalf("expected group children empty array, got %#v", groupPayload["children"])
	}

	iframePayload, err := effectiveSectionPayload(project, "iframe-section", "iframe-variant")
	if err != nil {
		t.Fatalf("effective iframe payload: %v", err)
	}
	if got := payloadStringField(iframePayload, "code"); got != "" {
		t.Fatalf("expected iframe code empty string, got %q", got)
	}
}

func TestSectionImplPayloadNormalizesNullChildrenToEmptyArray(t *testing.T) {
	t.Parallel()

	for _, spec := range []struct {
		name        string
		sectionType string
	}{
		{name: "list root", sectionType: "ListRoot"},
		{name: "dict", sectionType: "Dict"},
	} {
		t.Run(spec.name, func(t *testing.T) {
			payload, err := SectionImplPayload(SectionImpl{
				ID:      strings.ToLower(strings.ReplaceAll(spec.sectionType, " ", "-")) + "-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "test-impl", "type": spec.sectionType, "children": nil}),
			})
			if err != nil {
				t.Fatalf("section impl payload: %v", err)
			}

			object, err := rawObjectFromProjectPayload(payload)
			if err != nil {
				t.Fatalf("decode normalized payload: %v", err)
			}
			children, ok := object["children"].([]any)
			if !ok {
				t.Fatalf("expected normalized children array, got %#v", object["children"])
			}
			if len(children) != 0 {
				t.Fatalf("expected normalized children to be empty, got %#v", children)
			}
		})
	}
}
