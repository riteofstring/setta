package projectview

import (
	"reflect"
	"testing"

	"setta/internal/projectstate"
)

func TestSortedSummarySectionIDsLimitsToRequestedSections(t *testing.T) {
	t.Parallel()

	view, err := DefaultSingleConfig(testProjectViewDocument(t))
	if err != nil {
		t.Fatalf("DefaultSingleConfig returned error: %v", err)
	}

	sectionIDs := sortedSummarySectionIDs(map[string]struct{}{
		"draw-section":       {},
		"missing-section-id": {},
	}, view.Sections)
	if !reflect.DeepEqual(sectionIDs, []string{"draw-section"}) {
		t.Fatalf("expected filtered summary section ids [draw-section], got %#v", sectionIDs)
	}
}

func TestBuildProjectStateSummaryReturnsEmptySectionsForEmptyInput(t *testing.T) {
	t.Parallel()

	view, err := DefaultSingleConfig(testProjectViewDocument(t))
	if err != nil {
		t.Fatalf("DefaultSingleConfig returned error: %v", err)
	}

	summary := BuildProjectStateSummary(view, map[string]struct{}{})
	if len(summary.Sections) != 0 {
		t.Fatalf("expected no summary sections, got %#v", summary.Sections)
	}
	if len(summary.ProjectConfig.SectionVariantMap) != 0 {
		t.Fatalf("expected empty summary sectionVariantMap, got %#v", summary.ProjectConfig.SectionVariantMap)
	}
	if len(summary.ParentSectionMap) != 0 {
		t.Fatalf("expected empty summary parent map, got %#v", summary.ParentSectionMap)
	}
}

func TestBuildProjectStateSummaryFiltersRequiredDecodedImagesToAllowedSections(t *testing.T) {
	t.Parallel()

	document := testProjectViewDocument(t)
	project := document.Projects["project-alpha"]
	project.Sections["blocked-draw-section"] = projectstate.Section{
		ID:               "blocked-draw-section",
		Name:             "Blocked Draw Section",
		VariantIDs:       []string{"blocked-draw-variant"},
		DefaultVariantID: "blocked-draw-variant",
		SharedModifier: mustRawJSON(t, map[string]any{
			"layers": []any{
				map[string]any{
					"elements": []any{
						map[string]any{"type": "Image", "dataPath": "images/c.png"},
					},
				},
			},
		}),
	}
	project.SectionVariants["blocked-draw-variant"] = projectstate.SectionVariant{
		ID:     "blocked-draw-variant",
		Name:   "Blocked Draw Variant",
		ImplID: "blocked-draw-impl",
	}
	project.SectionImpls["blocked-draw-impl"] = projectstate.SectionImpl{
		ID:      "blocked-draw-impl",
		Kind:    projectstate.SectionKindDraw,
		Draw:    &projectstate.DrawSectionImpl{},
		Payload: mustRawJSON(t, map[string]any{"id": "blocked-draw-impl", "type": "Draw"}),
	}
	project.SectionVariantMap["blocked-draw-section"] = "blocked-draw-variant"
	document.Projects["project-alpha"] = project

	view, err := DefaultSingleConfig(document)
	if err != nil {
		t.Fatalf("DefaultSingleConfig returned error: %v", err)
	}

	if !reflect.DeepEqual(view.RequiredDecodedImages, []string{"images/a.png", "images/b.png", "images/c.png"}) {
		t.Fatalf("expected full required decoded images to include blocked draw path, got %#v", view.RequiredDecodedImages)
	}

	summary := BuildProjectStateSummary(view, map[string]struct{}{
		"draw-section": {},
	})
	if !reflect.DeepEqual(summary.RequiredDecodedImages, []string{"images/a.png", "images/b.png"}) {
		t.Fatalf("expected filtered required decoded images [images/a.png images/b.png], got %#v", summary.RequiredDecodedImages)
	}
}

func TestBuildProjectStateSummaryTrimsWindowSpacesToAllowedSections(t *testing.T) {
	t.Parallel()

	document := testProjectViewDocument(t)
	project := document.Projects["project-alpha"]
	project.WindowSpaces = map[string]projectstate.WindowSpaceConfig{
		"space-1": {
			ID:   "space-1",
			Name: "Scoped Layout",
			WindowsByID: map[string]projectstate.WindowSpaceWindow{
				"project-window": {
					SurfaceKind: projectstate.WindowSpaceSurfaceKindProjectChat,
				},
				"allowed-window": {
					SurfaceKind:     projectstate.WindowSpaceSurfaceKindSection,
					SectionIDOrNull: pointerToString("callable-section"),
				},
				"blocked-window": {
					SurfaceKind:     projectstate.WindowSpaceSurfaceKindSection,
					SectionIDOrNull: pointerToString("global-section"),
				},
			},
			Order: []string{"blocked-window", "project-window", "allowed-window"},
		},
		"space-2": {
			ID:   "space-2",
			Name: "Blocked Only",
			WindowsByID: map[string]projectstate.WindowSpaceWindow{
				"blocked-only-window": {
					SurfaceKind:     projectstate.WindowSpaceSurfaceKindSection,
					SectionIDOrNull: pointerToString("global-section"),
				},
			},
			Order: []string{"blocked-only-window"},
		},
	}
	document.Projects["project-alpha"] = project

	view, err := DefaultSingleConfig(document)
	if err != nil {
		t.Fatalf("DefaultSingleConfig returned error: %v", err)
	}

	summary := BuildProjectStateSummary(view, map[string]struct{}{
		"callable-section": {},
	})
	if _, ok := summary.ProjectConfig.WindowSpaces["space-2"]; ok {
		t.Fatalf("expected blocked-only window space to be dropped, got %#v", summary.ProjectConfig.WindowSpaces)
	}
	filteredSpace, ok := summary.ProjectConfig.WindowSpaces["space-1"]
	if !ok {
		t.Fatalf("expected scoped window space to remain, got %#v", summary.ProjectConfig.WindowSpaces)
	}
	if _, ok := filteredSpace.WindowsByID["blocked-window"]; ok {
		t.Fatalf("expected blocked section window to be removed, got %#v", filteredSpace.WindowsByID)
	}
	if _, ok := filteredSpace.WindowsByID["project-window"]; !ok {
		t.Fatalf("expected project chat window to remain, got %#v", filteredSpace.WindowsByID)
	}
	if _, ok := filteredSpace.WindowsByID["allowed-window"]; !ok {
		t.Fatalf("expected allowed section window to remain, got %#v", filteredSpace.WindowsByID)
	}
	if !reflect.DeepEqual(filteredSpace.Order, []string{"project-window", "allowed-window"}) {
		t.Fatalf("expected filtered order [project-window allowed-window], got %#v", filteredSpace.Order)
	}
	if _, ok := view.ProjectConfig.WindowSpaces["space-1"].WindowsByID["blocked-window"]; !ok {
		t.Fatalf("expected source window space to remain unchanged after summary filtering, got %#v", view.ProjectConfig.WindowSpaces["space-1"].WindowsByID)
	}
}

func pointerToString(value string) *string {
	return &value
}
