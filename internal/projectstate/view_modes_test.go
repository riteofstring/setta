package projectstate

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

func TestDocumentNormalizedBootstrapsDefaultViewModeFromProjectStateWhenMissing(t *testing.T) {
	t.Parallel()

	project := viewModesTestProject(t)
	project.ViewModes = map[string]ViewMode{}
	project.ActiveViewModeID = ""

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": project,
		},
	}

	normalized, err := document.Normalized()
	if err != nil {
		t.Fatalf("normalize document: %v", err)
	}

	normalizedProject := normalized.Projects["project-alpha"]
	if len(normalizedProject.ViewModes) != 1 {
		t.Fatalf("expected one bootstrapped view mode, got %d", len(normalizedProject.ViewModes))
	}
	bootstrappedViewMode, ok := normalizedProject.ViewModes[normalizedProject.ActiveViewModeID]
	if !ok {
		t.Fatalf("expected active view mode %q to exist", normalizedProject.ActiveViewModeID)
	}
	if bootstrappedViewMode.Name == "" {
		t.Fatal("expected bootstrapped view mode name")
	}
	if !reflect.DeepEqual(bootstrappedViewMode.TopLevelSections, normalizedProject.TopLevelSections) {
		t.Fatalf("expected bootstrapped top-level sections %#v, got %#v", normalizedProject.TopLevelSections, bootstrappedViewMode.TopLevelSections)
	}
	if !reflect.DeepEqual(bootstrappedViewMode.Viewport, normalizedProject.Viewport) {
		t.Fatalf("expected bootstrapped viewport %#v, got %#v", normalizedProject.Viewport, bootstrappedViewMode.Viewport)
	}
	if bootstrappedViewMode.ViewportInitialized != normalizedProject.ViewportInitialized {
		t.Fatalf("expected viewport initialized %t, got %t", normalizedProject.ViewportInitialized, bootstrappedViewMode.ViewportInitialized)
	}
	for sectionID := range normalizedProject.Sections {
		if visible := bootstrappedViewMode.VisibilityBySectionID[sectionID]; !visible {
			t.Fatalf("expected section %q to be visible in bootstrapped view mode", sectionID)
		}
	}
}

func TestDocumentNormalizedRepairsViewModesAndProjectsActiveState(t *testing.T) {
	t.Parallel()

	project := viewModesTestProject(t)
	project.ActiveViewModeID = "missing-view-mode"
	project.TopLevelSections = map[string]TopLevelSectionLayout{
		"parent-section":     {X: 10, Y: 20, ZIndex: 1},
		"standalone-section": {X: 30, Y: 40, ZIndex: 2},
		"stale-section":      {X: 50, Y: 60, ZIndex: 3},
	}
	project.Viewport = &Viewport{X: 90, Y: 80, Zoom: 1.5}
	project.ViewportInitialized = true
	project.ViewModes = map[string]ViewMode{
		"alpha": {
			ID:                  "alpha",
			Name:                "Alpha",
			SortIndex:           7,
			Viewport:            nil,
			TopLevelSections:    map[string]TopLevelSectionLayout{},
			ViewportInitialized: true,
			VisibilityBySectionID: map[string]bool{
				"parent-section": true,
				"stale-section":  false,
			},
		},
		"beta": {
			ID:        "beta",
			Name:      "Beta",
			SortIndex: 7,
			Viewport:  &Viewport{X: 5, Y: 6, Zoom: 0.7},
			TopLevelSections: map[string]TopLevelSectionLayout{
				"parent-section": {X: 1, Y: 2, ZIndex: 9},
				"stale-section":  {X: 3, Y: 4, ZIndex: 10},
			},
			VisibilityBySectionID: map[string]bool{
				"standalone-section": false,
				"stale-section":      true,
			},
		},
	}

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": project,
		},
	}

	normalized, err := document.Normalized()
	if err != nil {
		t.Fatalf("normalize document: %v", err)
	}

	normalizedProject := normalized.Projects["project-alpha"]
	if normalizedProject.ActiveViewModeID != "alpha" {
		t.Fatalf("expected invalid active view mode to fall back to alpha, got %q", normalizedProject.ActiveViewModeID)
	}
	if _, ok := normalizedProject.TopLevelSections["stale-section"]; ok {
		t.Fatal("expected stale project top-level layout to be pruned")
	}

	alpha := normalizedProject.ViewModes["alpha"]
	if _, ok := alpha.VisibilityBySectionID["stale-section"]; ok {
		t.Fatal("expected stale visibility id to be pruned from alpha")
	}
	if !alpha.VisibilityBySectionID["standalone-section"] {
		t.Fatal("expected missing section visibility to backfill to true on alpha")
	}
	if !reflect.DeepEqual(alpha.TopLevelSections, normalizedProject.TopLevelSections) {
		t.Fatalf("expected alpha layouts %#v, got %#v", normalizedProject.TopLevelSections, alpha.TopLevelSections)
	}
	if alpha.Viewport != nil {
		t.Fatalf("expected alpha viewport to remain nil, got %#v", alpha.Viewport)
	}
	if alpha.ViewportInitialized {
		t.Fatal("expected nil alpha viewport to clear viewportInitialized")
	}

	beta := normalizedProject.ViewModes["beta"]
	if _, ok := beta.TopLevelSections["stale-section"]; ok {
		t.Fatal("expected stale beta layout to be pruned")
	}
	if _, ok := beta.TopLevelSections["standalone-section"]; !ok {
		t.Fatal("expected beta layout to backfill missing standalone section")
	}
	if _, ok := beta.VisibilityBySectionID["stale-section"]; ok {
		t.Fatal("expected stale visibility id to be pruned from beta")
	}
	if !beta.VisibilityBySectionID["parent-section"] {
		t.Fatal("expected missing parent-section visibility to backfill to true on beta")
	}
	if alpha.SortIndex != 0 || beta.SortIndex != 1 {
		t.Fatalf("expected duplicate sort indices to compact to alpha=0 beta=1, got alpha=%d beta=%d", alpha.SortIndex, beta.SortIndex)
	}
	if normalizedProject.Viewport != nil {
		t.Fatalf("expected projected active viewport to be nil, got %#v", normalizedProject.Viewport)
	}
	if normalizedProject.ViewportInitialized {
		t.Fatal("expected projected active viewportInitialized to be false")
	}
}

func TestDocumentNormalizedPrunesStaleActiveIDs(t *testing.T) {
	t.Parallel()

	project := viewModesTestProject(t)
	project.ActiveIDs = []string{
		"standalone-section",
		"stale-section",
		"parent-section",
	}

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": project,
		},
	}

	normalized, err := document.Normalized()
	if err != nil {
		t.Fatalf("normalize document: %v", err)
	}

	normalizedProject := normalized.Projects["project-alpha"]
	if !reflect.DeepEqual(normalizedProject.ActiveIDs, []string{"standalone-section", "parent-section"}) {
		t.Fatalf("expected stale active ids to be pruned, got %#v", normalizedProject.ActiveIDs)
	}
}

func TestDocumentNormalizedViewportInitializedDefaultsFalseAndPreservesExplicitTrue(t *testing.T) {
	t.Parallel()

	document := Document{
		SchemaVersion: CurrentSchemaVersion,
		Projects: map[string]Project{
			"project-false": {
				ID:               "project-false",
				Name:             "False",
				ActiveViewModeID: "focus",
				Viewport:         &Viewport{X: 1, Y: 2, Zoom: 1},
				ViewModes: map[string]ViewMode{
					"focus": {
						ID:       "focus",
						Name:     "Focus",
						Viewport: &Viewport{X: 1, Y: 2, Zoom: 1},
					},
				},
			},
			"project-true": {
				ID:                  "project-true",
				Name:                "True",
				ActiveViewModeID:    "focus",
				Viewport:            &Viewport{X: 3, Y: 4, Zoom: 2},
				ViewportInitialized: true,
				ViewModes: map[string]ViewMode{
					"focus": {
						ID:                  "focus",
						Name:                "Focus",
						Viewport:            &Viewport{X: 3, Y: 4, Zoom: 2},
						ViewportInitialized: true,
					},
				},
			},
		},
	}

	normalized, err := document.Normalized()
	if err != nil {
		t.Fatalf("normalize document: %v", err)
	}

	if normalized.Projects["project-false"].ViewportInitialized {
		t.Fatal("expected omitted project viewportInitialized to default false")
	}
	if normalized.Projects["project-false"].ViewModes["focus"].ViewportInitialized {
		t.Fatal("expected omitted view mode viewportInitialized to default false")
	}
	if !normalized.Projects["project-true"].ViewportInitialized {
		t.Fatal("expected explicit project viewportInitialized true to be preserved")
	}
	if !normalized.Projects["project-true"].ViewModes["focus"].ViewportInitialized {
		t.Fatal("expected explicit view mode viewportInitialized true to be preserved")
	}
}

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

func TestRuntimeSetTopLevelSectionLayoutAndViewportPersistIntoActiveViewMode(t *testing.T) {
	t.Parallel()

	runtime := openViewModesTestRuntime(t)

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	layout := project.TopLevelSections["standalone-section"]
	layout.X += 120
	layout.Y += 80
	layout.ZIndex = 6

	if _, err := runtime.SetTopLevelSectionLayout(context.Background(), "project-alpha", map[string]TopLevelSectionLayout{
		"parent-section":     project.TopLevelSections["parent-section"],
		"standalone-section": layout,
		"moving-section":     project.TopLevelSections["moving-section"],
	}); err != nil {
		t.Fatalf("SetTopLevelSectionLayout returned error: %v", err)
	}

	viewport := &Viewport{X: 12.5, Y: -3.25, Zoom: 1.4}
	if _, err := runtime.SetViewport(context.Background(), "project-alpha", viewport); err != nil {
		t.Fatalf("SetViewport returned error: %v", err)
	}

	project = runtime.Snapshot().Document.Projects["project-alpha"]
	if got := project.TopLevelSections["standalone-section"]; !reflect.DeepEqual(got, layout) {
		t.Fatalf("expected project layout %#v, got %#v", layout, got)
	}
	if !reflect.DeepEqual(project.Viewport, viewport) {
		t.Fatalf("expected project viewport %#v, got %#v", viewport, project.Viewport)
	}
	if !project.ViewportInitialized {
		t.Fatal("expected project viewport to be initialized")
	}

	viewMode := project.ViewModes["focus"]
	if got := viewMode.TopLevelSections["standalone-section"]; !reflect.DeepEqual(got, layout) {
		t.Fatalf("expected active view mode layout %#v, got %#v", layout, got)
	}
	if !reflect.DeepEqual(viewMode.Viewport, viewport) {
		t.Fatalf("expected active view mode viewport %#v, got %#v", viewport, viewMode.Viewport)
	}
	if !viewMode.ViewportInitialized {
		t.Fatal("expected active view mode viewport to be initialized")
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
	if createdViewMode.Name == "" {
		t.Fatal("expected created view mode name")
	}
	if _, err := validateViewModeName(projectAfterCreate, createdViewMode.ID, createdViewMode.Name); err != nil {
		t.Fatalf("expected created view mode name to remain valid, got %q with error %v", createdViewMode.Name, err)
	}
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

func TestRuntimeSetViewModeNameRejectsDocumentedInvalidNames(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name  string
		input string
	}{
		{
			name:  "reserved_home",
			input: "home",
		},
		{
			name:  "reserved_settings",
			input: "Settings",
		},
		{
			name:  "path_separator",
			input: "bad/name",
		},
		{
			name:  "dotdot_segment",
			input: "bad..name",
		},
		{
			name:  "control_character",
			input: "bad\nname",
		},
		{
			name:  "invalid_character",
			input: "bad@name",
		},
		{
			name:  "invalid_after_sanitization",
			input: "__",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			runtime := openViewModesTestRuntime(t)

			_, err := runtime.SetViewModeName(context.Background(), "project-alpha", "focus", testCase.input)
			if !IsInvalidViewModeNameError(err) {
				t.Fatalf("expected InvalidViewModeNameError, got %v", err)
			}

			project := runtime.Snapshot().Document.Projects["project-alpha"]
			if got := project.ViewModes["focus"].Name; got != "Focus" {
				t.Fatalf("expected rejected rename to keep Focus, got %q", got)
			}
		})
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
