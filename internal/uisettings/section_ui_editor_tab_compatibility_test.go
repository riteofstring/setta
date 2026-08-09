package uisettings

import (
	"slices"
	"testing"

	"setta/internal/projectstate"
)

func TestFrontendValueRequiredUIEditorTabsPreservesEmptySlices(t *testing.T) {
	ordered := RequiredUIEditorTabsBySectionType()
	got := FrontendValueRequiredUIEditorTabs()

	for sectionType, want := range ordered {
		resolvedSectionType := projectstate.FrontendSectionType(sectionType)
		gotTabs, ok := got[resolvedSectionType]
		if !ok {
			t.Fatalf("missing section type %q", sectionType)
		}
		if gotTabs == nil {
			t.Fatalf("section type %q returned nil tabs slice", sectionType)
		}
		if !slices.Equal(gotTabs, want) {
			t.Fatalf("section type %q mismatch: got %v want %v", sectionType, gotTabs, want)
		}
	}
}
