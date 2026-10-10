package aggregate

import (
	"reflect"
	"testing"
)

func TestConstructorRefreshRetainsCompatibleArgumentsAndControls(t *testing.T) {
	t.Parallel()
	state := refreshedFirstCallableState(t)
	slider := DefaultParameterUI(ParameterUITypeSlider)
	configured, err := state.SetParameters(SetParametersCommand{
		ProjectID: state.Project.ID, ExpectedRevision: state.Project.Revision, CallableID: "callable-first",
		Parameters: []ParameterProposal{
			{ID: "parameter-value", Name: "value", AuthoredExpression: "state.Shared.width", UI: &slider},
			{ID: "parameter-manual", Name: "manual", AuthoredExpression: "0.01"},
			{ID: "parameter-removed", Name: "removed", AuthoredExpression: "0.9", UI: &slider},
		},
	})
	state = mustChangedCandidate(t, "SetParameters", configured, err)
	committed, err := state.CommitCallable(CommitCallableCommand{
		ProjectID: state.Project.ID, ExpectedRevision: state.Project.Revision,
		CallableID: "callable-first", AuthoredExpression: "fixture.second",
	})
	state = mustChangedCandidate(t, "CommitCallable", committed, err)
	before := state.Clone()
	refreshed, err := state.RefreshCallableParameters(RefreshCallableParametersCommand{
		ProjectID: state.Project.ID, ExpectedRevision: state.Project.Revision, CallableID: "callable-first",
	}, []ProviderParameter{
		{Name: "manual", PassingStyle: PassingStylePositionalOrKeyword, TypeAnnotation: stringPointer("float")},
		{Name: "value", PassingStyle: PassingStyleKeywordOnly, TypeAnnotation: stringPointer("int"), Default: stringPointer("192")},
		{Name: "momentum", PassingStyle: PassingStyleKeywordOnly, Default: stringPointer("0.0")},
	}, sequenceIDs("parameter-new"))
	result := mustChangedCandidate(t, "RefreshCallableParameters", refreshed, err)
	parameters := result.Callables[0].Parameters
	if len(parameters) != 3 || parameters[0].ID != "parameter-manual" || parameters[0].AuthoredExpression != "0.01" || parameters[0].NameEditable {
		t.Fatalf("manual argument was not adopted into the new signature: %#v", parameters)
	}
	value := parameters[1]
	if value.ID != "parameter-value" || value.AuthoredExpression != "state.Shared.width" || value.PassingStyle != PassingStyleKeywordOnly ||
		value.TypeAnnotation == nil || *value.TypeAnnotation != "int" || value.Default == nil || *value.Default != "192" || *value.ProviderOrdinal != 1 {
		t.Fatalf("shared argument lost its value or has stale metadata: %#v", value)
	}
	if parameters[2].ID != "parameter-new" || parameters[2].AuthoredExpression != "" || *parameters[2].Default != "0.0" {
		t.Fatalf("new argument does not defer to its Python default: %#v", parameters[2])
	}
	if len(result.ParameterUIOverrides) != 1 || !SameParameterUI(result.ResolveParameterUI(value.ID), slider) {
		t.Fatalf("controls were lost or removed controls were retained: %#v", result.ParameterUIOverrides)
	}
	if !reflect.DeepEqual(state, before) {
		t.Fatal("refresh modified its input state")
	}
}

func TestRefreshDoesNotShiftPositionalValuesAcrossAGap(t *testing.T) {
	t.Parallel()
	state := refreshedFirstCallableState(t)
	first, second := 0, 1
	state.Callables[0].Parameters = []Parameter{
		{ID: "first", Name: "left", PassingStyle: PassingStylePositionalOnly, ProviderOrdinal: &first, AuthoredExpression: "10"},
		{ID: "second", Name: "right", PassingStyle: PassingStylePositionalOnly, ProviderOrdinal: &second, AuthoredExpression: "20"},
	}
	for _, test := range []struct {
		name   string
		names  []string
		values []string
	}{
		{name: "reordered", names: []string{"right", "left"}, values: []string{"20", "10"}},
		{name: "inserted gap", names: []string{"left", "middle", "right"}, values: []string{"10", "", ""}},
	} {
		t.Run(test.name, func(t *testing.T) {
			signature := make([]ProviderParameter, 0, len(test.names))
			for _, name := range test.names {
				signature = append(signature, ProviderParameter{Name: name, PassingStyle: PassingStylePositionalOnly})
			}
			refreshed, err := state.RefreshCallableParameters(RefreshCallableParametersCommand{
				ProjectID: state.Project.ID, ExpectedRevision: state.Project.Revision, CallableID: "callable-first",
			}, signature, sequenceIDs("middle"))
			result := mustChangedCandidate(t, "RefreshCallableParameters", refreshed, err)
			for index, parameter := range result.Callables[0].Parameters {
				if parameter.AuthoredExpression != test.values[index] {
					t.Fatalf("%s value = %q, want %q", parameter.Name, parameter.AuthoredExpression, test.values[index])
				}
			}
		})
	}
}

func TestRefreshDiscardsIncompatibleArgumentPassingStyles(t *testing.T) {
	t.Parallel()
	state := refreshedFirstCallableState(t)
	state.Callables[0].Parameters[0].AuthoredExpression = "3"
	state.ParameterUIOverrides = map[string]ParameterUI{"parameter-value": DefaultParameterUI(ParameterUITypeSlider)}
	refreshed, err := state.RefreshCallableParameters(RefreshCallableParametersCommand{
		ProjectID: state.Project.ID, ExpectedRevision: state.Project.Revision, CallableID: "callable-first",
	}, []ProviderParameter{{Name: "value", PassingStyle: PassingStyleVariadicKeyword}}, sequenceIDs("new-value"))
	result := mustChangedCandidate(t, "RefreshCallableParameters", refreshed, err)
	value := result.Callables[0].Parameters[0]
	if value.ID != "new-value" || value.AuthoredExpression != "" || len(result.ParameterUIOverrides) != 0 {
		t.Fatalf("scalar expression or slider survived a change to **kwargs: %#v, %#v", value, result.ParameterUIOverrides)
	}
}
