package projectview

import (
	"reflect"
	"testing"
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
