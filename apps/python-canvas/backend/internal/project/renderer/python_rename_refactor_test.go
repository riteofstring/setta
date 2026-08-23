package renderer

import (
	"testing"

	"github.com/setta/python-canvas/backend/internal/project/aggregate"
)

func TestRewriteStateReferencesRewritesOnlyParserConfirmedSurvivingPaths(t *testing.T) {
	t.Parallel()

	state := aggregate.State{
		Project:      aggregate.Project{ID: "project-rewrite", Name: "Rewrite", Revision: 1},
		PythonTarget: aggregate.PythonTarget{Suffix: aggregate.DefaultPythonSuffix},
		Callables: []aggregate.Callable{
			{
				ID: "callable-consumer", Name: "Consumer", AuthoredExpression: "state.Producer.build",
				Parameters: []aggregate.Parameter{{
					ID:                 "parameter-value",
					Name:               "value",
					NameEditable:       true,
					PassingStyle:       aggregate.PassingStylePositionalOrKeyword,
					AuthoredExpression: "state.Producer + (lambda state: state.Producer)(state.Producer) + state.Deleted",
				}},
			},
			{ID: "callable-producer", Name: "Producer", AuthoredExpression: "produce", Parameters: []aggregate.Parameter{}},
		},
		ParameterDictionaries: []aggregate.ParameterDictionary{{
			ID: "dictionary-options", Name: "Options", Entries: []aggregate.DictionaryEntry{{
				ID: "entry-value", Name: "value", Leaf: &aggregate.DictionaryLeaf{AuthoredExpression: "('state.Producer', state.Producer) # state.Producer"},
			}}},
		},
		TopLevelSectionIDs: []string{"callable-consumer", "callable-producer", "dictionary-options"},
	}
	oldPaths := map[string]string{
		"callable-producer": "Producer",
		"deleted-target":    "Deleted",
	}
	newPaths := map[string]string{
		"callable-producer": "Renamed_Producer",
	}

	rewritten, err := RewriteStateReferences(state, oldPaths, newPaths)
	if err != nil {
		t.Fatalf("RewriteStateReferences() error = %v", err)
	}
	if got := rewritten.Callables[0].AuthoredExpression; got != "state.Renamed_Producer.build" {
		t.Fatalf("callable expression = %q", got)
	}
	if got := rewritten.Callables[0].Parameters[0].AuthoredExpression; got != "state.Renamed_Producer + (lambda state: state.Producer)(state.Renamed_Producer) + state.Deleted" {
		t.Fatalf("parameter expression = %q", got)
	}
	if got := rewritten.ParameterDictionaries[0].Entries[0].Leaf.AuthoredExpression; got != "('state.Producer', state.Renamed_Producer) # state.Producer" {
		t.Fatalf("dictionary expression = %q", got)
	}
	if state.Callables[0].Parameters[0].AuthoredExpression == rewritten.Callables[0].Parameters[0].AuthoredExpression {
		t.Fatalf("rewrite mutated input state")
	}
}

func TestRewriteStateReferencesHandlesPathSwapAtomically(t *testing.T) {
	t.Parallel()

	state := aggregate.State{
		Project:      aggregate.Project{ID: "project-swap", Name: "Swap", Revision: 1},
		PythonTarget: aggregate.PythonTarget{Suffix: aggregate.DefaultPythonSuffix},
		Callables: []aggregate.Callable{{
			ID: "callable-consumer", Name: "Consumer", AuthoredExpression: "consume",
			Parameters: []aggregate.Parameter{{
				ID:                 "parameter-value",
				Name:               "value",
				NameEditable:       true,
				PassingStyle:       aggregate.PassingStylePositionalOrKeyword,
				AuthoredExpression: "state.A + state.B",
			}},
		}},
		TopLevelSectionIDs: []string{"callable-consumer"},
	}
	rewritten, err := RewriteStateReferences(state,
		map[string]string{"target-a": "A", "target-b": "B"},
		map[string]string{"target-a": "B", "target-b": "A"},
	)
	if err != nil {
		t.Fatalf("RewriteStateReferences() error = %v", err)
	}
	if got := rewritten.Callables[0].Parameters[0].AuthoredExpression; got != "state.B + state.A" {
		t.Fatalf("swapped expression = %q", got)
	}
}
