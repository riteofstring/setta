package coordinator

import (
	"testing"

	"github.com/setta/python-canvas/backend/internal/project/aggregate"
	"github.com/setta/python-canvas/backend/internal/project/renderer"
)

func TestMapDiagnosticsTargetsDictionaryLeavesButNotGeneratedCompositions(t *testing.T) {
	state := aggregate.State{
		Project:      aggregate.Project{ID: "project-diagnostics", Name: "Diagnostics", Revision: 1},
		PythonTarget: aggregate.PythonTarget{Suffix: aggregate.DefaultPythonSuffix},
		Callables:    []aggregate.Callable{},
		ParameterDictionaries: []aggregate.ParameterDictionary{
			{
				ID: "dictionary-options", Name: "Options", Entries: []aggregate.DictionaryEntry{
					{ID: "entry-radius", Name: "radius", Leaf: &aggregate.DictionaryLeaf{AuthoredExpression: "missing_radius"}},
				},
			},
		},
		Lists:              []aggregate.List{},
		TopLevelSectionIDs: []string{"dictionary-options"},
	}
	rendered, err := renderer.Render(state)
	if err != nil {
		t.Fatalf("Render() error = %v", err)
	}
	leafRange := rendered.SourceRangesByTargetID["entry-radius"]
	compositionRange := rendered.CompositionRangesByTargetID["dictionary-options"]
	mapped, err := mapDiagnostics(state, rendered, []ProviderDiagnostic{
		{Start: leafRange.Start, End: leafRange.End, Severity: ProviderDiagnosticError, Message: "unknown name"},
		{Start: compositionRange.Start, End: compositionRange.End, Severity: ProviderDiagnosticError, Message: "generated composition"},
	})
	if err != nil {
		t.Fatalf("mapDiagnostics() error = %v", err)
	}
	if len(mapped) != 2 || mapped[0].TargetID == nil || *mapped[0].TargetID != "entry-radius" || mapped[1].TargetID != nil {
		t.Fatalf("mapped diagnostics = %#v", mapped)
	}
}
