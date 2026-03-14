package projectstate

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

func TestRuntimeSetTopLevelSectionLayoutFiltersInvalidSectionsAndRestoresMissingValidSection(t *testing.T) {
	t.Parallel()

	runtime := openViewModesTestRuntime(t)

	// Simulate stale layout state: one section was reparented and another valid
	// top-level section temporarily disappeared from the stored layout maps.
	if _, err := runtime.Mutate(func(document Document) (Document, error) {
		project := document.Projects["project-alpha"]

		movingSection := project.Sections["moving-section"]
		movingSection.ParentSectionID = "parent-section"
		project.Sections["moving-section"] = movingSection

		delete(project.TopLevelSections, "standalone-section")
		focus := project.ViewModes["focus"]
		delete(focus.TopLevelSections, "standalone-section")
		project.ViewModes["focus"] = focus

		document.Projects["project-alpha"] = project
		return document, nil
	}); err != nil {
		t.Fatalf("seed stale layout state: %v", err)
	}

	recoveredLayout := TopLevelSectionLayout{X: 240, Y: 120, ZIndex: 7}
	if _, err := runtime.SetTopLevelSectionLayout(context.Background(), "project-alpha", map[string]TopLevelSectionLayout{
		"standalone-section": recoveredLayout,
		"moving-section":     {X: 999, Y: 999, ZIndex: 99},
		"missing-section":    {X: 1, Y: 2, ZIndex: 3},
	}); err != nil {
		t.Fatalf("SetTopLevelSectionLayout returned error: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]

	// Valid sections survive, stale deleted/reparented ids do not.
	if _, ok := project.TopLevelSections["parent-section"]; !ok {
		t.Fatal("expected parent-section layout to remain present")
	}
	if _, ok := project.TopLevelSections["standalone-section"]; !ok {
		t.Fatal("expected standalone-section layout to be restored")
	}
	if _, ok := project.TopLevelSections["moving-section"]; ok {
		t.Fatal("expected reparented moving-section layout to be pruned")
	}
	if _, ok := project.TopLevelSections["missing-section"]; ok {
		t.Fatal("expected missing-section layout to be ignored")
	}

	if got := project.TopLevelSections["standalone-section"]; !reflect.DeepEqual(got, recoveredLayout) {
		t.Fatalf("expected recovered standalone layout %#v, got %#v", recoveredLayout, got)
	}
	if got := project.ViewModes["focus"].TopLevelSections["standalone-section"]; !reflect.DeepEqual(got, recoveredLayout) {
		t.Fatalf("expected active view mode layout %#v, got %#v", recoveredLayout, got)
	}
}

func TestRuntimeCreateAndSwitchViewModesSwapLayoutAndViewportState(t *testing.T) {
	t.Parallel()

	runtime := openViewModesTestRuntime(t)

	_, secondViewModeID, err := runtime.CreateViewMode(context.Background(), "project-alpha")
	if err != nil {
		t.Fatalf("CreateViewMode returned error: %v", err)
	}

	projectAfterCreate := runtime.Snapshot().Document.Projects["project-alpha"]
	if projectAfterCreate.ActiveViewModeID != secondViewModeID {
		t.Fatalf("expected active view mode %q, got %q", secondViewModeID, projectAfterCreate.ActiveViewModeID)
	}
	if !projectAfterCreate.IsEditingViewMode {
		t.Fatal("expected create view mode to enable editing mode")
	}

	createdViewMode := projectAfterCreate.ViewModes[secondViewModeID]
	if !reflect.DeepEqual(createdViewMode.TopLevelSections, projectAfterCreate.TopLevelSections) {
		t.Fatalf("expected created view mode layouts to clone current layouts, got %#v vs %#v", createdViewMode.TopLevelSections, projectAfterCreate.TopLevelSections)
	}
	if !reflect.DeepEqual(createdViewMode.Viewport, projectAfterCreate.Viewport) {
		t.Fatalf("expected created view mode viewport %#v, got %#v", projectAfterCreate.Viewport, createdViewMode.Viewport)
	}

	layoutB := projectAfterCreate.TopLevelSections["standalone-section"]
	layoutB.X += 400
	layoutB.Y += 300
	layoutB.ZIndex = 9
	if _, err := runtime.SetTopLevelSectionLayout(context.Background(), "project-alpha", map[string]TopLevelSectionLayout{
		"parent-section":     projectAfterCreate.TopLevelSections["parent-section"],
		"standalone-section": layoutB,
		"moving-section":     projectAfterCreate.TopLevelSections["moving-section"],
	}); err != nil {
		t.Fatalf("SetTopLevelSectionLayout for second view mode returned error: %v", err)
	}

	viewportB := &Viewport{X: -20, Y: 30, Zoom: 1.6}
	if _, err := runtime.SetViewport(context.Background(), "project-alpha", viewportB); err != nil {
		t.Fatalf("SetViewport for second view mode returned error: %v", err)
	}

	if _, err := runtime.SetActiveViewMode(context.Background(), "project-alpha", "focus"); err != nil {
		t.Fatalf("SetActiveViewMode focus returned error: %v", err)
	}

	projectBackToFocus := runtime.Snapshot().Document.Projects["project-alpha"]
	layoutA := viewModesTestProject(t).TopLevelSections["standalone-section"]
	if got := projectBackToFocus.TopLevelSections["standalone-section"]; !reflect.DeepEqual(got, layoutA) {
		t.Fatalf("expected focus layout %#v, got %#v", layoutA, got)
	}
	if !reflect.DeepEqual(projectBackToFocus.Viewport, viewModesTestProject(t).Viewport) {
		t.Fatalf("expected focus viewport %#v, got %#v", viewModesTestProject(t).Viewport, projectBackToFocus.Viewport)
	}

	if _, err := runtime.SetActiveViewMode(context.Background(), "project-alpha", secondViewModeID); err != nil {
		t.Fatalf("SetActiveViewMode second returned error: %v", err)
	}

	projectBackToSecond := runtime.Snapshot().Document.Projects["project-alpha"]
	if got := projectBackToSecond.TopLevelSections["standalone-section"]; !reflect.DeepEqual(got, layoutB) {
		t.Fatalf("expected second view mode layout %#v, got %#v", layoutB, got)
	}
	if !reflect.DeepEqual(projectBackToSecond.Viewport, viewportB) {
		t.Fatalf("expected second view mode viewport %#v, got %#v", viewportB, projectBackToSecond.Viewport)
	}
}

func TestRuntimeViewModeNameValidationAndSortOrderErrors(t *testing.T) {
	t.Parallel()

	runtime := openViewModesTestRuntime(t)

	_, secondViewModeID, err := runtime.CreateViewMode(context.Background(), "project-alpha")
	if err != nil {
		t.Fatalf("CreateViewMode returned error: %v", err)
	}

	// Names are trimmed and must remain slug-unique across view modes.
	if _, err := runtime.SetViewModeName(context.Background(), "project-alpha", secondViewModeID, "  Details  "); err != nil {
		t.Fatalf("SetViewModeName returned error: %v", err)
	}
	project := runtime.Snapshot().Document.Projects["project-alpha"]
	if got := project.ViewModes[secondViewModeID].Name; got != "Details" {
		t.Fatalf("expected trimmed view mode name Details, got %q", got)
	}

	_, err = runtime.SetViewModeName(context.Background(), "project-alpha", "focus", "details")
	if !IsInvalidViewModeNameError(err) {
		t.Fatalf("expected InvalidViewModeNameError, got %v", err)
	}

	// Duplicate ids are validation failures; missing ids remain not-found errors.
	_, err = runtime.SetViewModeSortOrder(context.Background(), "project-alpha", []string{"focus", "focus"})
	if !IsInvalidViewModeSortOrderError(err) {
		t.Fatalf("expected InvalidViewModeSortOrderError, got %v", err)
	}

	_, err = runtime.SetViewModeSortOrder(context.Background(), "project-alpha", []string{"focus", "missing-view-mode"})
	if !errors.Is(err, ErrViewModeNotFound) {
		t.Fatalf("expected ErrViewModeNotFound, got %v", err)
	}
}

func TestRuntimeDeleteActiveViewModeUsesSortedOrderFallback(t *testing.T) {
	t.Parallel()

	runtime := openViewModesTestRuntime(t)

	_, secondViewModeID, err := runtime.CreateViewMode(context.Background(), "project-alpha")
	if err != nil {
		t.Fatalf("CreateViewMode second returned error: %v", err)
	}

	secondLayout := runtime.Snapshot().Document.Projects["project-alpha"].TopLevelSections["standalone-section"]
	secondLayout.X += 200
	secondLayout.Y += 100
	secondLayout.ZIndex = 5
	if _, err := runtime.SetTopLevelSectionLayout(context.Background(), "project-alpha", map[string]TopLevelSectionLayout{
		"parent-section":     runtime.Snapshot().Document.Projects["project-alpha"].TopLevelSections["parent-section"],
		"standalone-section": secondLayout,
		"moving-section":     runtime.Snapshot().Document.Projects["project-alpha"].TopLevelSections["moving-section"],
	}); err != nil {
		t.Fatalf("SetTopLevelSectionLayout second returned error: %v", err)
	}
	secondViewport := &Viewport{X: 40, Y: -10, Zoom: 0.75}
	if _, err := runtime.SetViewport(context.Background(), "project-alpha", secondViewport); err != nil {
		t.Fatalf("SetViewport second returned error: %v", err)
	}

	_, thirdViewModeID, err := runtime.CreateViewMode(context.Background(), "project-alpha")
	if err != nil {
		t.Fatalf("CreateViewMode third returned error: %v", err)
	}

	thirdProject := runtime.Snapshot().Document.Projects["project-alpha"]
	thirdLayout := thirdProject.TopLevelSections["standalone-section"]
	thirdLayout.X += 300
	thirdLayout.Y += 150
	thirdLayout.ZIndex = 8
	if _, err := runtime.SetTopLevelSectionLayout(context.Background(), "project-alpha", map[string]TopLevelSectionLayout{
		"parent-section":     thirdProject.TopLevelSections["parent-section"],
		"standalone-section": thirdLayout,
		"moving-section":     thirdProject.TopLevelSections["moving-section"],
	}); err != nil {
		t.Fatalf("SetTopLevelSectionLayout third returned error: %v", err)
	}
	thirdViewport := &Viewport{X: -80, Y: 60, Zoom: 1.4}
	if _, err := runtime.SetViewport(context.Background(), "project-alpha", thirdViewport); err != nil {
		t.Fatalf("SetViewport third returned error: %v", err)
	}

	if _, err := runtime.SetViewModeSortOrder(context.Background(), "project-alpha", []string{secondViewModeID, thirdViewModeID, "focus"}); err != nil {
		t.Fatalf("SetViewModeSortOrder returned error: %v", err)
	}
	if _, err := runtime.DeleteViewMode(context.Background(), "project-alpha", thirdViewModeID); err != nil {
		t.Fatalf("DeleteViewMode returned error: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]

	// Deleting the active mode should choose the first remaining sorted mode,
	// not whichever entry happened to come first in map iteration.
	if project.ActiveViewModeID != secondViewModeID {
		t.Fatalf("expected active view mode %q after delete fallback, got %q", secondViewModeID, project.ActiveViewModeID)
	}
	if got := project.TopLevelSections["standalone-section"]; !reflect.DeepEqual(got, secondLayout) {
		t.Fatalf("expected fallback layout %#v, got %#v", secondLayout, got)
	}
	if !reflect.DeepEqual(project.Viewport, secondViewport) {
		t.Fatalf("expected fallback viewport %#v, got %#v", secondViewport, project.Viewport)
	}
	if got := project.ViewModes[secondViewModeID].SortIndex; got != 0 {
		t.Fatalf("expected second view mode sort index 0, got %d", got)
	}
	if got := project.ViewModes["focus"].SortIndex; got != 1 {
		t.Fatalf("expected focus sort index 1, got %d", got)
	}
}

func openViewModesTestRuntime(t *testing.T) *Runtime {
	t.Helper()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": viewModesTestProject(t),
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

func viewModesTestProject(t *testing.T) Project {
	t.Helper()

	project, err := Project{
		ID:                  "project-alpha",
		Name:                "Alpha",
		ActiveViewModeID:    "focus",
		IsEditingViewMode:   false,
		Viewport:            &Viewport{X: 5, Y: 10, Zoom: 0.8},
		ViewportInitialized: true,
		TopLevelSections: map[string]TopLevelSectionLayout{
			"parent-section":     {X: 0, Y: 0, ZIndex: 0},
			"standalone-section": {X: 100, Y: 50, ZIndex: 1},
			"moving-section":     {X: 220, Y: 120, ZIndex: 2},
		},
		ViewModes: map[string]ViewMode{
			"focus": {
				ID:        "focus",
				Name:      "Focus",
				SortIndex: 0,
				Viewport:  &Viewport{X: 5, Y: 10, Zoom: 0.8},
				TopLevelSections: map[string]TopLevelSectionLayout{
					"parent-section":     {X: 0, Y: 0, ZIndex: 0},
					"standalone-section": {X: 100, Y: 50, ZIndex: 1},
					"moving-section":     {X: 220, Y: 120, ZIndex: 2},
				},
				ViewportInitialized: true,
				VisibilityBySectionID: map[string]bool{
					"parent-section":     true,
					"standalone-section": true,
					"moving-section":     true,
				},
			},
		},
		SectionVariantMap: map[string]string{
			"parent-section":     "parent-variant",
			"standalone-section": "standalone-variant",
			"moving-section":     "moving-variant",
		},
		Sections: map[string]Section{
			"parent-section": {
				ID:               "parent-section",
				Name:             "Parent Section",
				VariantIDs:       []string{"parent-variant"},
				DefaultVariantID: "parent-variant",
			},
			"standalone-section": {
				ID:               "standalone-section",
				Name:             "Standalone Section",
				VariantIDs:       []string{"standalone-variant"},
				DefaultVariantID: "standalone-variant",
			},
			"moving-section": {
				ID:               "moving-section",
				Name:             "Moving Section",
				VariantIDs:       []string{"moving-variant"},
				DefaultVariantID: "moving-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"parent-variant": {
				ID:     "parent-variant",
				ImplID: "parent-impl",
			},
			"standalone-variant": {
				ID:     "standalone-variant",
				ImplID: "standalone-impl",
			},
			"moving-variant": {
				ID:     "moving-variant",
				ImplID: "moving-impl",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"parent-impl": {
				ID:      "parent-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "parent-impl", "type": "Group"}),
			},
			"standalone-impl": {
				ID:      "standalone-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "standalone-impl", "type": "TextBlock"}),
			},
			"moving-impl": {
				ID:      "moving-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "moving-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize view modes test project: %v", err)
	}
	return project
}
