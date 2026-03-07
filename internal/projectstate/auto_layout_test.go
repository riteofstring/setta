package projectstate

import (
	"context"
	"errors"
	"strconv"
	"testing"
)

func TestResolveAutoLayoutSectionSizingPolicyDefaultsWhenSettingsProjectMissing(t *testing.T) {
	t.Parallel()

	policy, err := ResolveAutoLayoutSectionSizingPolicy(Document{
		SchemaVersion: CurrentSchemaVersion,
		Projects:      map[string]Project{},
	})
	if err != nil {
		t.Fatalf("ResolveAutoLayoutSectionSizingPolicy returned error: %v", err)
	}

	if got := policy.ByType["TextBlock"]; got.MinWidth != 100 || got.MinHeight != 49 || got.MaxWidth != 100000 || got.MaxHeight != 100000 {
		t.Fatalf("expected default TextBlock min dimensions {100 49}, got %#v", got)
	}
	if got := policy.ByType["MetaControl"]; got.MinWidth != 100 || got.MinHeight != 10 || got.MaxWidth != 100000 || got.MaxHeight != 100000 {
		t.Fatalf("expected default MetaControl min dimensions {100 10}, got %#v", got)
	}
}

func TestResolveAutoLayoutSectionSizingPolicyReadsSettingsProjectOverrides(t *testing.T) {
	t.Parallel()

	policy, err := ResolveAutoLayoutSectionSizingPolicy(autoLayoutSettingsDocument(t, map[string]AutoLayoutSectionMinDimensions{
		"TextBlock": {MinWidth: 321, MinHeight: 123, MaxWidth: 999, MaxHeight: 888},
		"Chart":     {MinWidth: 444, MinHeight: 222, MaxWidth: 777, MaxHeight: 666},
	}))
	if err != nil {
		t.Fatalf("ResolveAutoLayoutSectionSizingPolicy returned error: %v", err)
	}

	if got := policy.ByType["TextBlock"]; got.MinWidth != 321 || got.MinHeight != 123 || got.MaxWidth != 999 || got.MaxHeight != 888 {
		t.Fatalf("expected overridden TextBlock min dimensions {321 123}, got %#v", got)
	}
	if got := policy.ByType["Chart"]; got.MinWidth != 444 || got.MinHeight != 222 || got.MaxWidth != 777 || got.MaxHeight != 666 {
		t.Fatalf("expected overridden Chart min dimensions {444 222}, got %#v", got)
	}
	if got := policy.ByType["Callable"]; got.MinWidth != 200 || got.MinHeight != 104 || got.MaxWidth != 100000 || got.MaxHeight != 100000 {
		t.Fatalf("expected Callable defaults to remain intact, got %#v", got)
	}
}

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
	settingsDocument := autoLayoutSettingsDocument(t, map[string]AutoLayoutSectionMinDimensions{
		"TextBlock": {MinWidth: 150, MinHeight: 80},
	})

	before := runtime.Snapshot().Document.Projects["project-alpha"]
	if _, err := runtime.AutoLayoutTopLevelSections(context.Background(), "project-alpha", settingsDocument, 10); err != nil {
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

	policy, err := ResolveAutoLayoutSectionSizingPolicy(settingsDocument)
	if err != nil {
		t.Fatalf("ResolveAutoLayoutSectionSizingPolicy returned error: %v", err)
	}
	assertProjectLayoutsDoNotOverlap(t, project, policy)
}

func TestRuntimeAutoLayoutTopLevelSectionsRejectsNegativeMargin(t *testing.T) {
	t.Parallel()

	runtime := openAutoLayoutTestRuntime(t)
	_, err := runtime.AutoLayoutTopLevelSections(context.Background(), "project-alpha", Document{
		SchemaVersion: CurrentSchemaVersion,
		Projects:      map[string]Project{},
	}, -1)
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

	_, err = runtime.AutoLayoutTopLevelSections(context.Background(), "project-alpha", Document{
		SchemaVersion: CurrentSchemaVersion,
		Projects:      map[string]Project{},
	}, 10)
	if !IsInvalidAutoLayoutError(err) {
		t.Fatalf("expected InvalidAutoLayoutError, got %v", err)
	}
}

func TestResolveAutoLayoutSectionSizingPolicyRejectsInvalidSettingsValue(t *testing.T) {
	t.Parallel()

	_, err := ResolveAutoLayoutSectionSizingPolicy(autoLayoutSettingsDocumentWithRawValue(t, "TextBlock", "maxWidth", "not-a-number"))
	if !errors.Is(err, ErrSettingsValueInvalid) {
		t.Fatalf("expected ErrSettingsValueInvalid, got %v", err)
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

func autoLayoutSettingsDocument(
	t *testing.T,
	overrides map[string]AutoLayoutSectionMinDimensions,
) Document {
	t.Helper()

	return autoLayoutSettingsDocumentWithValues(t, overrides, map[string]string{})
}

func autoLayoutSettingsDocumentWithRawValue(
	t *testing.T,
	sectionType string,
	fieldName string,
	rawValue string,
) Document {
	t.Helper()

	return autoLayoutSettingsDocumentWithValues(
		t,
		map[string]AutoLayoutSectionMinDimensions{
			sectionType: defaultAutoLayoutSectionSizingPolicy().ByType[sectionType],
		},
		map[string]string{
			sectionType + "." + fieldName: rawValue,
		},
	)
}

func autoLayoutSettingsDocumentWithValues(
	t *testing.T,
	overrides map[string]AutoLayoutSectionMinDimensions,
	rawValues map[string]string,
) Document {
	t.Helper()

	codeObjVariantMap := map[string]string{}
	codeObjs := map[string]CodeObject{}
	codeObjVariants := map[string]CodeObjectVariant{}
	codeObjImpls := map[string]CodeObjectImpl{}

	addCodeObj := func(id string, name string, implType string, payload map[string]any) {
		variantID := id + "-variant"
		implID := id + "-impl"
		codeObjs[id] = CodeObject{
			ID:               id,
			Name:             name,
			VariantIDs:       []string{variantID},
			DefaultVariantID: variantID,
		}
		codeObjVariants[variantID] = CodeObjectVariant{
			ID:     variantID,
			ImplID: implID,
		}
		codeObjImpls[implID] = CodeObjectImpl{
			ID:      implID,
			Type:    implType,
			Payload: mustMarshalProjectObject(payload),
		}
		codeObjVariantMap[id] = variantID
	}

	rootID := "section-sizing-root"
	byTypeID := "section-sizing-by-type"
	childTypeIDs := make([]string, 0, len(overrides))
	for sectionType := range overrides {
		childTypeIDs = append(childTypeIDs, sectionType)
	}

	addCodeObj(rootID, "sectionSizingPolicyRoot", "NestedParam", map[string]any{
		"id":       rootID + "-impl",
		"type":     "NestedParam",
		"children": []string{byTypeID},
	})
	addCodeObj(byTypeID, "byType", "NestedParam", map[string]any{
		"id":       byTypeID + "-impl",
		"type":     "NestedParam",
		"children": childTypeIDs,
	})

	for sectionType, dimensions := range overrides {
		typeID := sectionType
		minWidthID := sectionType + "-min-width"
		minHeightID := sectionType + "-min-height"
		maxWidthID := sectionType + "-max-width"
		maxHeightID := sectionType + "-max-height"

		addCodeObj(typeID, sectionType, "NestedParam", map[string]any{
			"id":       typeID + "-impl",
			"type":     "NestedParam",
			"children": []string{minWidthID, minHeightID, maxWidthID, maxHeightID},
		})

		minWidthValue := strconvFormat(dimensions.MinWidth)
		if rawValue, ok := rawValues[sectionType+".minWidth"]; ok {
			minWidthValue = rawValue
		}
		minHeightValue := strconvFormat(dimensions.MinHeight)
		if rawValue, ok := rawValues[sectionType+".minHeight"]; ok {
			minHeightValue = rawValue
		}
		maxWidthValue := strconvFormat(dimensions.MaxWidth)
		if rawValue, ok := rawValues[sectionType+".maxWidth"]; ok {
			maxWidthValue = rawValue
		}
		maxHeightValue := strconvFormat(dimensions.MaxHeight)
		if rawValue, ok := rawValues[sectionType+".maxHeight"]; ok {
			maxHeightValue = rawValue
		}

		addCodeObj(minWidthID, "minWidth", "TextParam", map[string]any{
			"id":    minWidthID + "-impl",
			"type":  "TextParam",
			"value": minWidthValue,
		})
		addCodeObj(minHeightID, "minHeight", "TextParam", map[string]any{
			"id":    minHeightID + "-impl",
			"type":  "TextParam",
			"value": minHeightValue,
		})
		addCodeObj(maxWidthID, "maxWidth", "TextParam", map[string]any{
			"id":    maxWidthID + "-impl",
			"type":  "TextParam",
			"value": maxWidthValue,
		})
		addCodeObj(maxHeightID, "maxHeight", "TextParam", map[string]any{
			"id":    maxHeightID + "-impl",
			"type":  "TextParam",
			"value": maxHeightValue,
		})
	}

	settingsProject, err := Project{
		ID:   "settings-home",
		Name: "settings",
		SectionVariantMap: map[string]string{
			"section-sizing-policy": "section-sizing-policy-variant",
		},
		Sections: map[string]Section{
			"section-sizing-policy": {
				ID:               "section-sizing-policy",
				Name:             "sectionSizingPolicy",
				VariantIDs:       []string{"section-sizing-policy-variant"},
				DefaultVariantID: "section-sizing-policy-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"section-sizing-policy-variant": {
				ID:     "section-sizing-policy-variant",
				ImplID: "section-sizing-policy-impl",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"section-sizing-policy-impl": {
				ID:   "section-sizing-policy-impl",
				Kind: SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":                "section-sizing-policy-impl",
					"type":              "Dict",
					"topLevelParamId":   rootID,
					"codeObjVariantMap": codeObjVariantMap,
				}),
			},
		},
		CodeObjs:        codeObjs,
		CodeObjVariants: codeObjVariants,
		CodeObjImpls:    codeObjImpls,
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize auto layout settings project: %v", err)
	}

	document, err := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "settings-home",
		Projects: map[string]Project{
			"settings-home": settingsProject,
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize auto layout settings document: %v", err)
	}
	return document
}

func strconvFormat(value float64) string {
	return strconv.FormatFloat(value, 'f', -1, 64)
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
