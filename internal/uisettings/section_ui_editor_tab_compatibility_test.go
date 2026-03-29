package uisettings

import (
	"reflect"
	"testing"
)

func TestRequiredUIEditorTabsBySectionTypeIncludesAllKnownSectionTypes(t *testing.T) {
	t.Parallel()

	expected := map[string]struct{}{
		"Browser":           {},
		"Callable":          {},
		"Chart":             {},
		"Chat":              {},
		"Code":              {},
		"Dict":              {},
		"Draw":              {},
		"GenPythonCode":     {},
		"GenPythonMetadata": {},
		"GlobalVariables":   {},
		"Group":             {},
		"IFrame":            {},
		"Image":             {},
		"ListRoot":          {},
		"MetaControl":       {},
		"Plugin":            {},
		"Prompt":            {},
		"Social":            {},
		"Spreadsheet":       {},
		"StateMachineEnd":   {},
		"StateMachineGate":  {},
		"StateMachineStart": {},
		"TaskBoard":         {},
		"Terminal":          {},
		"TextBlock":         {},
	}

	got := RequiredUIEditorTabsBySectionType()
	gotKeys := make(map[string]struct{}, len(got))
	for sectionType := range got {
		gotKeys[sectionType] = struct{}{}
	}

	if !reflect.DeepEqual(gotKeys, expected) {
		t.Fatalf("expected section type coverage %#v, got %#v", expected, gotKeys)
	}
}

func TestRequiredUIEditorTabsBySectionTypeMatchesRepresentativeCompatibility(t *testing.T) {
	t.Parallel()

	compatibility := RequiredUIEditorTabsBySectionType()

	if got := compatibility["Callable"]; !reflect.DeepEqual(got, []string{
		"SectionConfig",
		"UIConfig",
		"QuickInfoConfig",
		"SectionVariantsConfig",
	}) {
		t.Fatalf("expected Callable tabs %#v, got %#v", []string{
			"SectionConfig",
			"UIConfig",
			"QuickInfoConfig",
			"SectionVariantsConfig",
		}, got)
	}

	if got := compatibility["TextBlock"]; !reflect.DeepEqual(got, []string{
		"SectionConfig",
		"InfoConfig",
		"SectionVariantsConfig",
	}) {
		t.Fatalf("expected TextBlock tabs %#v, got %#v", []string{
			"SectionConfig",
			"InfoConfig",
			"SectionVariantsConfig",
		}, got)
	}

	if got := compatibility["IFrame"]; len(got) != 0 {
		t.Fatalf("expected IFrame to expose no tabs, got %#v", got)
	}
}
