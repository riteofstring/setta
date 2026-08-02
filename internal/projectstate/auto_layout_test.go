package projectstate

import (
	"context"
	"testing"
)

func TestProjectResolveAutoLayoutSectionDimensionsPrefersLayoutOverrideAndAutoFallback(t *testing.T) {
	t.Parallel()

	project := autoLayoutTestProject(t)
	policy := defaultAutoLayoutSectionSizingPolicy()

	width, height, err := project.resolveAutoLayoutSectionDimensions(
		"explicit-section",
		project.TopLevelSections["explicit-section"],
		policy,
	)
	if err != nil {
		t.Fatalf("resolveAutoLayoutSectionDimensions explicit-section: %v", err)
	}
	if width != 40 || height != 30 {
		t.Fatalf("expected explicit layout dimensions 40x30, got %vx%v", width, height)
	}

	width, height, err = project.resolveAutoLayoutSectionDimensions(
		"auto-section",
		project.TopLevelSections["auto-section"],
		policy,
	)
	if err != nil {
		t.Fatalf("resolveAutoLayoutSectionDimensions auto-section: %v", err)
	}
	if width != 100 || height != 49 {
		t.Fatalf("expected TextBlock auto fallback 100x49, got %vx%v", width, height)
	}
}

func TestRuntimeAutoLayoutTopLevelSectionsRewritesLayoutsWithoutOverlapAndPreservesOrigin(t *testing.T) {
	t.Parallel()

	runtime := openAutoLayoutTestRuntime(t)
	settings := testStructuralMutationSettings(map[string]AutoLayoutSectionMinDimensions{
		"TextBlock": {MinWidth: 150, MinHeight: 80},
	})

	before := runtime.Snapshot().Document.Projects["project-alpha"]
	if _, err := runtime.AutoLayoutTopLevelSections(context.Background(), "project-alpha", settings, 10); err != nil {
		t.Fatalf("AutoLayoutTopLevelSections returned error: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]

	if minX := minProjectLayoutX(project.TopLevelSections); minX != minProjectLayoutX(before.TopLevelSections) {
		t.Fatalf("expected min x %v after auto layout, got %v", minProjectLayoutX(before.TopLevelSections), minX)
	}
	if minY := minProjectLayoutY(project.TopLevelSections); minY != minProjectLayoutY(before.TopLevelSections) {
		t.Fatalf("expected min y %v after auto layout, got %v", minProjectLayoutY(before.TopLevelSections), minY)
	}
	if project.ViewModes["focus"].TopLevelSections["auto-section"].X != project.TopLevelSections["auto-section"].X {
		t.Fatal("expected active view mode layouts to stay in sync with project layouts")
	}

	assertProjectLayoutsDoNotOverlap(t, project, settings.SectionSizingPolicy)
}

func TestRuntimeAutoLayoutTopLevelSectionsRejectsNegativeMargin(t *testing.T) {
	t.Parallel()

	runtime := openAutoLayoutTestRuntime(t)
	_, err := runtime.AutoLayoutTopLevelSections(
		context.Background(),
		"project-alpha",
		DefaultStructuralMutationSettings(),
		-1,
	)
	if !IsInvalidAutoLayoutError(err) {
		t.Fatalf("expected InvalidAutoLayoutError, got %v", err)
	}
}

func TestRuntimeAutoLayoutTopLevelSectionsRejectsNonPositiveDimensions(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": autoLayoutInvalidDimensionProject(t),
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

	_, err = runtime.AutoLayoutTopLevelSections(
		context.Background(),
		"project-alpha",
		DefaultStructuralMutationSettings(),
		10,
	)
	if !IsInvalidAutoLayoutError(err) {
		t.Fatalf("expected InvalidAutoLayoutError, got %v", err)
	}
}

func openAutoLayoutTestRuntime(t *testing.T) *Runtime {
	t.Helper()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": autoLayoutTestProject(t),
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
	return runtime
}

func autoLayoutTestProject(t *testing.T) Project {
	t.Helper()

	explicitWidth := 40.0
	explicitHeight := 30.0
	project, err := Project{
		ID:               "project-alpha",
		Name:             "Alpha",
		ActiveViewModeID: "focus",
		TopLevelSections: map[string]TopLevelSectionLayout{
			"auto-section": {
				X:      100,
				Y:      200,
				ZIndex: 0,
			},
			"manual-section": {
				X:      330,
				Y:      190,
				ZIndex: 1,
			},
			"explicit-section": {
				X:      220,
				Y:      120,
				ZIndex: 2,
				W:      &explicitWidth,
				H:      &explicitHeight,
			},
		},
		ViewModes: map[string]ViewMode{
			"focus": {
				ID:        "focus",
				Name:      "Focus",
				SortIndex: 0,
				TopLevelSections: map[string]TopLevelSectionLayout{
					"auto-section": {
						X:      100,
						Y:      200,
						ZIndex: 0,
					},
					"manual-section": {
						X:      330,
						Y:      190,
						ZIndex: 1,
					},
					"explicit-section": {
						X:      220,
						Y:      120,
						ZIndex: 2,
						W:      &explicitWidth,
						H:      &explicitHeight,
					},
				},
				VisibilityBySectionID: map[string]bool{
					"auto-section":     true,
					"manual-section":   true,
					"explicit-section": true,
				},
			},
		},
		SectionVariantMap: map[string]string{
			"auto-section":     "auto-variant",
			"manual-section":   "manual-variant",
			"explicit-section": "explicit-variant",
		},
		Sections: map[string]Section{
			"auto-section": {
				ID:               "auto-section",
				Name:             "Auto Section",
				VariantIDs:       []string{"auto-variant"},
				DefaultVariantID: "auto-variant",
			},
			"manual-section": {
				ID:               "manual-section",
				Name:             "Manual Section",
				VariantIDs:       []string{"manual-variant"},
				DefaultVariantID: "manual-variant",
			},
			"explicit-section": {
				ID:               "explicit-section",
				Name:             "Explicit Section",
				VariantIDs:       []string{"explicit-variant"},
				DefaultVariantID: "explicit-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"auto-variant": {
				ID:     "auto-variant",
				ImplID: "auto-impl",
			},
			"manual-variant": {
				ID:     "manual-variant",
				ImplID: "manual-impl",
			},
			"explicit-variant": {
				ID:     "explicit-variant",
				ImplID: "explicit-impl",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"auto-impl": {
				ID:      "auto-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "auto-impl", "type": "TextBlock", "size": map[string]any{"width": "auto", "height": "auto"}}),
			},
			"manual-impl": {
				ID:      "manual-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "manual-impl", "type": "Chart", "size": map[string]any{"width": 350, "height": 180}}),
			},
			"explicit-impl": {
				ID:      "explicit-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "explicit-impl", "type": "TextBlock", "size": map[string]any{"width": 600, "height": 500}}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize auto layout project: %v", err)
	}
	return project
}

func autoLayoutInvalidDimensionProject(t *testing.T) Project {
	t.Helper()

	project, err := Project{
		ID:               "project-alpha",
		Name:             "Alpha",
		ActiveViewModeID: "focus",
		TopLevelSections: map[string]TopLevelSectionLayout{
			"broken-section": {
				X:      10,
				Y:      20,
				ZIndex: 0,
			},
		},
		ViewModes: map[string]ViewMode{
			"focus": {
				ID:        "focus",
				Name:      "Focus",
				SortIndex: 0,
				TopLevelSections: map[string]TopLevelSectionLayout{
					"broken-section": {
						X:      10,
						Y:      20,
						ZIndex: 0,
					},
				},
				VisibilityBySectionID: map[string]bool{
					"broken-section": true,
				},
			},
		},
		SectionVariantMap: map[string]string{
			"broken-section": "broken-variant",
		},
		Sections: map[string]Section{
			"broken-section": {
				ID:               "broken-section",
				Name:             "Broken Section",
				VariantIDs:       []string{"broken-variant"},
				DefaultVariantID: "broken-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"broken-variant": {
				ID:     "broken-variant",
				ImplID: "broken-impl",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"broken-impl": {
				ID:      "broken-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "broken-impl", "type": "TextBlock", "size": map[string]any{"width": 0, "height": 20}}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize invalid auto layout project: %v", err)
	}
	return project
}

func minProjectLayoutX(layouts map[string]TopLevelSectionLayout) float64 {
	first := true
	minX := 0.0
	for _, layout := range layouts {
		if first || layout.X < minX {
			minX = layout.X
		}
		first = false
	}
	return minX
}

func minProjectLayoutY(layouts map[string]TopLevelSectionLayout) float64 {
	first := true
	minY := 0.0
	for _, layout := range layouts {
		if first || layout.Y < minY {
			minY = layout.Y
		}
		first = false
	}
	return minY
}

func assertProjectLayoutsDoNotOverlap(t *testing.T, project Project, policy AutoLayoutSectionSizingPolicy) {
	t.Helper()

	type rect struct {
		sectionID string
		x         float64
		y         float64
		w         float64
		h         float64
	}

	rects := make([]rect, 0, len(project.TopLevelSections))
	for sectionID, layout := range project.TopLevelSections {
		width, height, err := project.resolveAutoLayoutSectionDimensions(sectionID, layout, policy)
		if err != nil {
			t.Fatalf("resolveAutoLayoutSectionDimensions %s: %v", sectionID, err)
		}
		rects = append(rects, rect{
			sectionID: sectionID,
			x:         layout.X,
			y:         layout.Y,
			w:         width,
			h:         height,
		})
	}

	for i := 0; i < len(rects); i++ {
		for j := i + 1; j < len(rects); j++ {
			if rectsIntersect(rects[i], rects[j]) {
				t.Fatalf("expected auto layout rects not to overlap: %#v vs %#v", rects[i], rects[j])
			}
		}
	}
}

func rectsIntersect(left struct {
	sectionID string
	x         float64
	y         float64
	w         float64
	h         float64
}, right struct {
	sectionID string
	x         float64
	y         float64
	w         float64
	h         float64
}) bool {
	return !(left.x+left.w <= right.x ||
		left.x >= right.x+right.w ||
		left.y+left.h <= right.y ||
		left.y >= right.y+right.h)
}
