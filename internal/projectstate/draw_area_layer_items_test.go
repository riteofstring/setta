package projectstate

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

func TestRuntimeAppendDrawAreaLayerItemUpdatesEffectivePayload(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": drawAreaLayerItemTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	newBrush := DrawAreaLayerItem{
		Type:        DrawAreaLayerItemTypeBrushStroke,
		DataPath:    "artifacts/new-stroke.json",
		TransformID: "artifacts/new-transform.json",
	}
	if _, err := runtime.AppendDrawAreaLayerItem(
		context.Background(),
		"project-alpha",
		"draw-section",
		0,
		newBrush,
	); err != nil {
		t.Fatalf("AppendDrawAreaLayerItem brush returned error: %v", err)
	}
	if _, err := runtime.AppendDrawAreaLayerItem(
		context.Background(),
		"project-alpha",
		"draw-section",
		0,
		newBrush,
	); err != nil {
		t.Fatalf("AppendDrawAreaLayerItem duplicate returned error: %v", err)
	}
	if _, err := runtime.AppendDrawAreaLayerItem(
		context.Background(),
		"project-alpha",
		"draw-section",
		1,
		DrawAreaLayerItem{
			Type:        DrawAreaLayerItemTypeImage,
			DataPath:    "artifacts/image.png",
			TransformID: "artifacts/image-transform.json",
		},
	); err != nil {
		t.Fatalf("AppendDrawAreaLayerItem image returned error: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	payload, err := effectiveSectionPayload(project, "draw-section", "draw-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload draw-section: %v", err)
	}

	rawLayers, ok := payload["layers"].([]any)
	if !ok || len(rawLayers) != 2 {
		t.Fatalf("expected two draw layers, got %#v", payload["layers"])
	}

	firstLayer, ok := rawLayers[0].(map[string]any)
	if !ok {
		t.Fatalf("expected first draw layer object, got %#v", rawLayers[0])
	}
	firstElements, ok := firstLayer["elements"].([]any)
	if !ok {
		t.Fatalf("expected first draw layer elements, got %#v", firstLayer["elements"])
	}
	if len(firstElements) != 2 {
		t.Fatalf("expected duplicate append to no-op and keep two items, got %#v", firstElements)
	}
	lastFirstElement, ok := firstElements[1].(map[string]any)
	if !ok {
		t.Fatalf("expected appended draw layer item object, got %#v", firstElements[1])
	}
	if got := payloadRawStringField(lastFirstElement, "dataPath"); got != "artifacts/new-stroke.json" {
		t.Fatalf("expected appended draw item dataPath, got %q", got)
	}

	secondLayer, ok := rawLayers[1].(map[string]any)
	if !ok {
		t.Fatalf("expected second draw layer object, got %#v", rawLayers[1])
	}
	secondElements, ok := secondLayer["elements"].([]any)
	if !ok || len(secondElements) != 1 {
		t.Fatalf("expected second draw layer one item, got %#v", secondLayer["elements"])
	}
	secondItem, ok := secondElements[0].(map[string]any)
	if !ok {
		t.Fatalf("expected second draw layer item object, got %#v", secondElements[0])
	}
	if got := payloadStringField(secondItem, "type"); got != string(DrawAreaLayerItemTypeImage) {
		t.Fatalf("expected image draw layer item type, got %q", got)
	}
}

func TestRuntimeAppendDrawAreaLayerItemRejectsInvalidTargetsAndValues(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": drawAreaLayerItemTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	if _, err := runtime.AppendDrawAreaLayerItem(
		context.Background(),
		"project-alpha",
		"plain-section",
		0,
		DrawAreaLayerItem{
			Type:        DrawAreaLayerItemTypeBrushStroke,
			DataPath:    "artifacts/stroke.json",
			TransformID: "artifacts/transform.json",
		},
	); !errors.Is(err, ErrDrawSectionRequired) {
		t.Fatalf("expected ErrDrawSectionRequired, got %v", err)
	}
	if _, err := runtime.AppendDrawAreaLayerItem(
		context.Background(),
		"project-alpha",
		"draw-section",
		2,
		DrawAreaLayerItem{
			Type:        DrawAreaLayerItemTypeBrushStroke,
			DataPath:    "artifacts/stroke.json",
			TransformID: "artifacts/transform.json",
		},
	); !errors.Is(err, ErrDrawAreaLayerIndexInvalid) {
		t.Fatalf("expected ErrDrawAreaLayerIndexInvalid, got %v", err)
	}
	if _, err := runtime.AppendDrawAreaLayerItem(
		context.Background(),
		"project-alpha",
		"draw-section",
		0,
		DrawAreaLayerItem{
			Type:        DrawAreaLayerItemType("File"),
			DataPath:    "artifacts/file.bin",
			TransformID: "artifacts/file-transform.json",
		},
	); !errors.Is(err, ErrDrawAreaLayerItemTypeInvalid) {
		t.Fatalf("expected ErrDrawAreaLayerItemTypeInvalid, got %v", err)
	}
}

func drawAreaLayerItemTestProject(t *testing.T) Project {
	t.Helper()

	project, err := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"draw-section":  "draw-variant",
			"plain-section": "plain-variant",
		},
		Sections: map[string]Section{
			"draw-section": {
				ID:               "draw-section",
				Name:             "Draw Section",
				VariantIDs:       []string{"draw-variant"},
				DefaultVariantID: "draw-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain Section",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"draw-variant":  {ID: "draw-variant", ImplID: "draw-impl"},
			"plain-variant": {ID: "plain-variant", ImplID: "plain-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"draw-impl": {
				ID:   "draw-impl",
				Kind: SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":   "draw-impl",
					"type": "Draw",
					"layers": []any{
						map[string]any{
							"name":         "Layer 1",
							"visible":      true,
							"layerOpacity": 1.0,
							"elements": []any{
								map[string]any{
									"type":        "BrushStroke",
									"dataPath":    "artifacts/existing-stroke.json",
									"transformId": "artifacts/existing-transform.json",
								},
							},
						},
						map[string]any{
							"name":         "Layer 2",
							"visible":      false,
							"layerOpacity": 0.5,
							"elements":     []any{},
						},
					},
				}),
			},
			"plain-impl": {
				ID:      "plain-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "plain-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize draw area layer item test project: %v", err)
	}
	return project
}

func TestDrawAreaLayerItemObject(t *testing.T) {
	t.Parallel()

	item := DrawAreaLayerItem{
		Type:        DrawAreaLayerItemTypeBrushStroke,
		DataPath:    "artifacts/stroke.json",
		TransformID: "artifacts/transform.json",
	}
	got := drawAreaLayerItemObject(item)
	want := map[string]any{
		"type":        "BrushStroke",
		"dataPath":    "artifacts/stroke.json",
		"transformId": "artifacts/transform.json",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("drawAreaLayerItemObject() = %#v, want %#v", got, want)
	}
}
