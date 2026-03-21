package projectstate

import "testing"

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
