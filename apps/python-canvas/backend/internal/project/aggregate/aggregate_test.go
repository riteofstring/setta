package aggregate

import (
	"errors"
	"fmt"
	"reflect"
	"testing"
)

func TestNewBlankAllocatesAnEmptyProjectWithoutDemoState(t *testing.T) {
	t.Parallel()

	state, err := NewBlank(sequenceIDs("project-dynamic"))
	if err != nil {
		t.Fatalf("NewBlank() error = %v", err)
	}
	if state.Project.ID != "project-dynamic" || state.Project.Name != DefaultProjectName || state.Project.Revision != 1 {
		t.Fatalf("blank project = %#v", state.Project)
	}
	if state.PythonTarget.Prefix != "" || state.PythonTarget.Suffix != DefaultPythonSuffix {
		t.Fatalf("blank target = %#v", state.PythonTarget)
	}
	if len(state.Callables) != 0 {
		t.Fatalf("blank callables = %#v, want none", state.Callables)
	}
	if err := state.Validate(); err != nil {
		t.Fatalf("blank Validate() error = %v", err)
	}
}

func TestCandidateCommandsUseDynamicIDsAndExpectedRevisions(t *testing.T) {
	t.Parallel()

	state := mustBlank(t, "project-dynamic")
	candidate, err := state.RenameProject(RenameProjectCommand{
		ProjectID: state.Project.ID, ExpectedRevision: state.Project.Revision, Name: "  My Python Canvas  ",
	})
	state = mustChangedCandidate(t, "RenameProject", candidate, err)
	requireProject(t, state, "project-dynamic", "My Python Canvas", 2)

	candidate, err = state.CreateCallable(CreateCallableCommand{
		ProjectID: state.Project.ID, ExpectedRevision: state.Project.Revision, Name: "First callable",
	}, sequenceIDs("callable-first"))
	state = mustChangedCandidate(t, "CreateCallable(first)", candidate, err)
	candidate, err = state.CreateCallable(CreateCallableCommand{
		ProjectID: state.Project.ID, ExpectedRevision: state.Project.Revision, Name: "Second callable",
	}, sequenceIDs("callable-second"))
	state = mustChangedCandidate(t, "CreateCallable(second)", candidate, err)
	requireCallableIDs(t, state, "callable-first", "callable-second")
	requireEmptyCallable(t, state.Callables[0])

	candidate, err = state.RenameCallable(RenameCallableCommand{
		ProjectID: state.Project.ID, CallableID: "callable-second", ExpectedRevision: state.Project.Revision, Name: "Renamed callable",
	})
	state = mustChangedCandidate(t, "RenameCallable", candidate, err)
	candidate, err = state.DeleteCallable(DeleteCallableCommand{
		ProjectID: state.Project.ID, CallableID: "callable-first", ExpectedRevision: state.Project.Revision,
	})
	state = mustChangedCandidate(t, "DeleteCallable", candidate, err)
	requireRemainingCallable(t, state, "callable-second", "Renamed callable", 6)
	requireStaleTargetUnchanged(t, state)

	candidate, err = state.SetTarget(SetTargetCommand{
		ProjectID: state.Project.ID, ExpectedRevision: state.Project.Revision, Prefix: "import example", Suffix: "state = SettaState()\nprint(state)",
	})
	state = mustChangedCandidate(t, "SetTarget", candidate, err)
	requireTarget(t, state, "import example", "state = SettaState()\nprint(state)", 7)
}

func TestConfiguredCallablePreparesAndFinalizesOneCandidate(t *testing.T) {
	t.Parallel()

	state := mustBlank(t, "project-configured")
	before := state.Clone()
	prepared, err := state.PrepareCreateConfiguredCallable(CreateConfiguredCallableCommand{
		ProjectID:          state.Project.ID,
		ExpectedRevision:   state.Project.Revision,
		Name:               "Ceiling",
		AuthoredExpression: " math.ceil ",
		ParameterValues:    map[string]string{"x": "7.25"},
	}, sequenceIDs("callable-ceiling"))
	if err != nil {
		t.Fatalf("PrepareCreateConfiguredCallable() error = %v", err)
	}
	if !reflect.DeepEqual(state, before) {
		t.Fatalf("prepare changed source state:\n got: %#v\nwant: %#v", state, before)
	}
	draft := prepared.SignatureState()
	if draft.Project.Revision != before.Project.Revision || len(draft.Callables) != 1 {
		t.Fatalf("prepared draft = %#v, want one unpublished callable at revision %d", draft, before.Project.Revision)
	}
	if callable := draft.Callables[0]; callable.ID != prepared.CallableID() || callable.Name != "Ceiling" || callable.AuthoredExpression != "math.ceil" || len(callable.Parameters) != 0 {
		t.Fatalf("prepared callable = %#v", callable)
	}

	candidate, err := prepared.Finalize([]ProviderParameter{{
		Name: "x", PassingStyle: PassingStylePositionalOrKeyword,
	}}, sequenceIDs("parameter-x"))
	if err != nil {
		t.Fatalf("Finalize() error = %v", err)
	}
	if !candidate.Changed || candidate.State.Project.Revision != before.Project.Revision+1 {
		t.Fatalf("configured candidate = %#v, want one revision increment", candidate)
	}
	callable := candidate.State.Callables[0]
	if callable.ID != "callable-ceiling" || callable.AuthoredExpression != "math.ceil" || len(callable.Parameters) != 1 {
		t.Fatalf("configured callable = %#v", callable)
	}
	if parameter := callable.Parameters[0]; parameter.ID != "parameter-x" || parameter.Name != "x" || parameter.AuthoredExpression != "7.25" || parameter.NameEditable {
		t.Fatalf("configured parameter = %#v", parameter)
	}
}

func TestConfiguredCallableRejectsUnknownResolvedParameterWithoutCandidate(t *testing.T) {
	t.Parallel()

	state := mustBlank(t, "project-configured-unknown")
	prepared, err := state.PrepareCreateConfiguredCallable(CreateConfiguredCallableCommand{
		ProjectID:          state.Project.ID,
		ExpectedRevision:   state.Project.Revision,
		Name:               "Ceiling",
		AuthoredExpression: "math.ceil",
		ParameterValues:    map[string]string{"unknown": "7.25"},
	}, sequenceIDs("callable-ceiling"))
	if err != nil {
		t.Fatalf("PrepareCreateConfiguredCallable() error = %v", err)
	}
	_, err = prepared.Finalize([]ProviderParameter{{
		Name: "x", PassingStyle: PassingStylePositionalOrKeyword,
	}}, sequenceIDs("parameter-x"))
	if !errors.Is(err, ErrValidation) {
		t.Fatalf("Finalize() error = %v, want validation failure", err)
	}
	if got := prepared.SignatureState(); len(got.Callables) != 1 || got.Callables[0].AuthoredExpression != "math.ceil" || len(got.Callables[0].Parameters) != 0 {
		t.Fatalf("failed finalize changed prepared draft: %#v", got)
	}
}

func TestConfiguredCallableAllowsOmittedResolvedParameter(t *testing.T) {
	t.Parallel()

	state := mustBlank(t, "project-configured-omitted")
	prepared, err := state.PrepareCreateConfiguredCallable(CreateConfiguredCallableCommand{
		ProjectID:          state.Project.ID,
		ExpectedRevision:   state.Project.Revision,
		Name:               "Length",
		AuthoredExpression: "len",
	}, sequenceIDs("callable-length"))
	if err != nil {
		t.Fatalf("PrepareCreateConfiguredCallable() error = %v", err)
	}
	candidate, err := prepared.Finalize([]ProviderParameter{{
		Name: "obj", PassingStyle: PassingStylePositionalOnly,
	}}, sequenceIDs("parameter-obj"))
	if err != nil {
		t.Fatalf("Finalize() error = %v", err)
	}
	parameter := candidate.State.Callables[0].Parameters[0]
	if parameter.Name != "obj" || parameter.AuthoredExpression != "" {
		t.Fatalf("omitted configured parameter = %#v, want an empty resolved obj parameter", parameter)
	}
}

func TestCommitPersistsExpressionAndExplicitRefreshReplacesProviderRows(t *testing.T) {
	t.Parallel()

	state := mustBlank(t, "project-dynamic")
	created, err := state.CreateCallable(CreateCallableCommand{
		ProjectID: state.Project.ID, ExpectedRevision: state.Project.Revision, Name: "First",
	}, sequenceIDs("callable-first"))
	if err != nil {
		t.Fatalf("CreateCallable() error = %v", err)
	}
	state = created.State

	defaultValue := "None"
	committed, err := state.CommitCallable(CommitCallableCommand{
		ProjectID: state.Project.ID, CallableID: "callable-first", ExpectedRevision: state.Project.Revision, AuthoredExpression: "  fixture.first  ",
	})
	if err != nil {
		t.Fatalf("CommitCallable() error = %v", err)
	}
	if !committed.Changed || committed.State.Project.Revision != state.Project.Revision+1 {
		t.Fatalf("committed candidate = %#v", committed)
	}
	state = committed.State
	callable := state.Callables[0]
	if callable.AuthoredExpression != "fixture.first" || len(callable.Parameters) != 0 {
		t.Fatalf("expression-only committed callable = %#v", callable)
	}

	refreshed, err := state.RefreshCallableParameters(RefreshCallableParametersCommand{
		ProjectID: state.Project.ID, CallableID: callable.ID, ExpectedRevision: state.Project.Revision,
	}, []ProviderParameter{
		{Name: "left", PassingStyle: PassingStylePositionalOnly, TypeAnnotation: stringPointer("int")},
		{Name: "scale", PassingStyle: PassingStylePositionalOrKeyword, TypeAnnotation: stringPointer("float"), Default: &defaultValue},
		{Name: "rest", PassingStyle: PassingStyleVariadicPositional, TypeAnnotation: stringPointer("tuple[int, ...]")},
		{Name: "flag", PassingStyle: PassingStyleKeywordOnly, TypeAnnotation: stringPointer("bool")},
		{Name: "options", PassingStyle: PassingStyleVariadicKeyword, TypeAnnotation: stringPointer("dict[str, object]")},
	}, sequenceIDs("parameter-left", "parameter-scale", "parameter-rest", "parameter-flag", "parameter-options"))
	if err != nil {
		t.Fatalf("RefreshCallableParameters() error = %v", err)
	}
	if !refreshed.Changed || refreshed.State.Project.Revision != state.Project.Revision+1 {
		t.Fatalf("refreshed candidate = %#v", refreshed)
	}
	state = refreshed.State
	callable = state.Callables[0]
	if callable.AuthoredExpression != "fixture.first" || len(callable.Parameters) != 5 {
		t.Fatalf("refreshed callable = %#v", callable)
	}
	for index, parameter := range callable.Parameters {
		if parameter.NameEditable || parameter.ProviderOrdinal == nil || *parameter.ProviderOrdinal != index || parameter.TypeAnnotation == nil {
			t.Fatalf("provider parameter %d = %#v, want immutable provider metadata", index, parameter)
		}
	}
	if callable.Parameters[1].Default == nil || *callable.Parameters[1].Default != defaultValue {
		t.Fatalf("provider default = %#v", callable.Parameters[1].Default)
	}

}

func TestCommitPreservesProviderRowsAndCanonicalRecommit(t *testing.T) {
	t.Parallel()

	state := refreshedFirstCallableState(t)
	callable := state.Callables[0]
	providerRows := append([]Parameter(nil), callable.Parameters...)
	changedExpression, err := state.CommitCallable(CommitCallableCommand{
		ProjectID: state.Project.ID, CallableID: callable.ID, ExpectedRevision: state.Project.Revision, AuthoredExpression: "fixture.second",
	})
	if err != nil {
		t.Fatalf("CommitCallable(changed expression) error = %v", err)
	}
	if !reflect.DeepEqual(changedExpression.State.Callables[0].Parameters, providerRows) {
		t.Fatalf("expression commit replaced parameters: %#v", changedExpression.State.Callables[0].Parameters)
	}
	state = changedExpression.State
	before := state.Clone()
	recommitted, err := state.CommitCallable(CommitCallableCommand{
		ProjectID: state.Project.ID, CallableID: callable.ID, ExpectedRevision: state.Project.Revision, AuthoredExpression: "fixture.second",
	})
	if err != nil {
		t.Fatalf("CommitCallable(recommit) error = %v", err)
	}
	if recommitted.Changed || !reflect.DeepEqual(recommitted.State, before) {
		t.Fatalf("canonical recommit = %#v, want unchanged %#v", recommitted, before)
	}
}

func refreshedFirstCallableState(t *testing.T) State {
	t.Helper()
	state := mustBlank(t, "project-refreshed")
	created, err := state.CreateCallable(CreateCallableCommand{
		ProjectID: state.Project.ID, ExpectedRevision: state.Project.Revision, Name: "First",
	}, sequenceIDs("callable-first"))
	if err != nil {
		t.Fatalf("CreateCallable() error = %v", err)
	}
	committed, err := created.State.CommitCallable(CommitCallableCommand{
		ProjectID: created.State.Project.ID, CallableID: "callable-first", ExpectedRevision: created.State.Project.Revision, AuthoredExpression: "fixture.first",
	})
	if err != nil {
		t.Fatalf("CommitCallable() error = %v", err)
	}
	refreshed, err := committed.State.RefreshCallableParameters(RefreshCallableParametersCommand{
		ProjectID: committed.State.Project.ID, CallableID: "callable-first", ExpectedRevision: committed.State.Project.Revision,
	}, []ProviderParameter{{Name: "value", PassingStyle: PassingStylePositionalOrKeyword}}, sequenceIDs("parameter-value"))
	if err != nil {
		t.Fatalf("RefreshCallableParameters() error = %v", err)
	}
	return refreshed.State
}

func TestRefreshRejectsMalformedProviderSignatureStyleSequences(t *testing.T) {
	t.Parallel()

	for _, test := range []struct {
		name      string
		signature []ProviderParameter
	}{
		{
			name: "positional-or-keyword after variadic-positional",
			signature: []ProviderParameter{
				{Name: "rest", PassingStyle: PassingStyleVariadicPositional},
				{Name: "value", PassingStyle: PassingStylePositionalOrKeyword},
			},
		},
		{
			name: "duplicate variadic-positional",
			signature: []ProviderParameter{
				{Name: "first", PassingStyle: PassingStyleVariadicPositional},
				{Name: "second", PassingStyle: PassingStyleVariadicPositional},
			},
		},
		{
			name: "keyword-only after variadic-keyword",
			signature: []ProviderParameter{
				{Name: "options", PassingStyle: PassingStyleVariadicKeyword},
				{Name: "flag", PassingStyle: PassingStyleKeywordOnly},
			},
		},
		{
			name: "duplicate variadic-keyword",
			signature: []ProviderParameter{
				{Name: "first", PassingStyle: PassingStyleVariadicKeyword},
				{Name: "second", PassingStyle: PassingStyleVariadicKeyword},
			},
		},
		{
			name: "positional-only after positional-or-keyword",
			signature: []ProviderParameter{
				{Name: "value", PassingStyle: PassingStylePositionalOrKeyword},
				{Name: "left", PassingStyle: PassingStylePositionalOnly},
			},
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			state := mustBlank(t, "project-dynamic")
			created, err := state.CreateCallable(CreateCallableCommand{
				ProjectID: state.Project.ID, ExpectedRevision: state.Project.Revision, Name: "Dynamic callable",
			}, sequenceIDs("callable-dynamic"))
			if err != nil {
				t.Fatalf("CreateCallable() error = %v", err)
			}
			committed, err := created.State.CommitCallable(CommitCallableCommand{
				ProjectID: created.State.Project.ID, CallableID: "callable-dynamic", ExpectedRevision: created.State.Project.Revision, AuthoredExpression: "fixture.dynamic",
			})
			if err != nil {
				t.Fatalf("CommitCallable() error = %v", err)
			}
			before := committed.State.Clone()
			_, err = committed.State.RefreshCallableParameters(RefreshCallableParametersCommand{
				ProjectID: committed.State.Project.ID, CallableID: "callable-dynamic", ExpectedRevision: committed.State.Project.Revision,
			}, test.signature, sequenceIDs("parameter-unexpected"))
			if !errors.Is(err, ErrValidation) {
				t.Fatalf("RefreshCallableParameters() error = %v, want validation failure", err)
			}
			if !errors.Is(err, ErrProviderSignatureInvalid) {
				t.Fatalf("RefreshCallableParameters() error = %v, want provider-signature failure", err)
			}
			if !reflect.DeepEqual(committed.State, before) {
				t.Fatalf("RefreshCallableParameters() changed state after validation failure")
			}
		})
	}
}

func TestRefreshPreservesAnUnannotatedProviderParameter(t *testing.T) {
	t.Parallel()

	state := mustBlank(t, "project-unannotated")
	created, err := state.CreateCallable(CreateCallableCommand{
		ProjectID: state.Project.ID, ExpectedRevision: state.Project.Revision, Name: "Unannotated",
	}, sequenceIDs("callable-unannotated"))
	if err != nil {
		t.Fatalf("CreateCallable() error = %v", err)
	}
	committed, err := created.State.CommitCallable(CommitCallableCommand{
		ProjectID: created.State.Project.ID, CallableID: "callable-unannotated", ExpectedRevision: created.State.Project.Revision, AuthoredExpression: "fixture.unannotated",
	})
	if err != nil {
		t.Fatalf("CommitCallable() error = %v", err)
	}
	refreshed, err := committed.State.RefreshCallableParameters(RefreshCallableParametersCommand{
		ProjectID: committed.State.Project.ID, CallableID: "callable-unannotated", ExpectedRevision: committed.State.Project.Revision,
	}, []ProviderParameter{{
		Name: "value", PassingStyle: PassingStylePositionalOrKeyword,
	}}, sequenceIDs("parameter-unannotated"))
	if err != nil {
		t.Fatalf("RefreshCallableParameters() error = %v", err)
	}
	parameter := refreshed.State.Callables[0].Parameters[0]
	if parameter.TypeAnnotation != nil || parameter.ProviderOrdinal == nil || parameter.NameEditable {
		t.Fatalf("unannotated provider parameter = %#v, want immutable metadata with nil type", parameter)
	}
	if err := refreshed.State.Validate(); err != nil {
		t.Fatalf("State.Validate() error = %v", err)
	}
}

func TestSetParametersPreservesProviderMetadataAndSupportsDynamicAuthoring(t *testing.T) {
	t.Parallel()

	state := committedPositionalState(t)
	callable := state.Callables[0]
	left, right, scale := callable.Parameters[0], callable.Parameters[1], callable.Parameters[2]

	state = mustSetParameters(t, "author", state, callable.ID, []ParameterProposal{
		{ID: right.ID, Name: right.Name, AuthoredExpression: "2"},
		{ID: left.ID, Name: left.Name, AuthoredExpression: "1"},
		{ID: "parameter-app", Name: "factor", AuthoredExpression: "3"},
		{ID: scale.ID, Name: scale.Name, AuthoredExpression: "4"},
	})
	parameters := state.Callables[0].Parameters
	requireParameterIDs(t, parameters, right.ID, left.ID, "parameter-app", scale.ID)
	requireProviderMetadata(t, parameters, left, right, scale)
	requireAppParameter(t, findParameter(t, parameters, "parameter-app"), "factor", "3")

	state = mustSetParameters(t, "rename app", state, callable.ID, []ParameterProposal{
		{ID: "parameter-app", Name: "multiplier", AuthoredExpression: "5"},
		{ID: left.ID, Name: left.Name, AuthoredExpression: "1"},
		{ID: right.ID, Name: right.Name, AuthoredExpression: "2"},
		{ID: scale.ID, Name: scale.Name, AuthoredExpression: "6"},
	})
	requireAppParameter(t, findParameter(t, state.Callables[0].Parameters, "parameter-app"), "multiplier", "5")

	requireInvalidParameters(t, state, callable.ID, "blank leading positional-only", []ParameterProposal{
		{ID: left.ID, Name: left.Name, AuthoredExpression: ""},
		{ID: right.ID, Name: right.Name, AuthoredExpression: "2"},
		{ID: scale.ID, Name: scale.Name, AuthoredExpression: "6"},
	})
	requireInvalidParameters(t, state, callable.ID, "delete leading positional-only", []ParameterProposal{
		{ID: right.ID, Name: right.Name, AuthoredExpression: "2"},
		{ID: scale.ID, Name: scale.Name, AuthoredExpression: "6"},
	})

	state = mustSetParameters(t, "delete provider/app rows", state, callable.ID, []ParameterProposal{
		{ID: left.ID, Name: left.Name, AuthoredExpression: "1"},
		{ID: scale.ID, Name: scale.Name, AuthoredExpression: "6"},
	})
	requireParameterIDs(t, state.Callables[0].Parameters, left.ID, scale.ID)
	requireInvalidParameters(t, state, callable.ID, "rename provider", []ParameterProposal{
		{ID: left.ID, Name: "renamed", AuthoredExpression: "1"},
	})
}

func TestValidateRejectsIncoherentPersistedMetadata(t *testing.T) {
	t.Parallel()

	state := committedPositionalState(t)
	appState := state.Clone()
	annotation := "invented"
	appState.Callables[0].Parameters = append(appState.Callables[0].Parameters, Parameter{
		ID:             "parameter-app",
		Name:           "app",
		NameEditable:   true,
		PassingStyle:   PassingStylePositionalOrKeyword,
		TypeAnnotation: &annotation,
	})
	if err := appState.Validate(); !errors.Is(err, ErrValidation) {
		t.Fatalf("Validate(app metadata) error = %v, want validation failure", err)
	}

	providerState := state.Clone()
	providerState.Callables[0].Parameters[0].ProviderOrdinal = nil
	if err := providerState.Validate(); !errors.Is(err, ErrValidation) {
		t.Fatalf("Validate(provider ordinal) error = %v, want validation failure", err)
	}
}

func committedPositionalState(t *testing.T) State {
	t.Helper()
	state := mustBlank(t, "project-dynamic")
	created, err := state.CreateCallable(CreateCallableCommand{
		ProjectID: state.Project.ID, ExpectedRevision: state.Project.Revision, Name: "Dynamic callable",
	}, sequenceIDs("callable-dynamic"))
	if err != nil {
		t.Fatalf("CreateCallable() error = %v", err)
	}
	state = created.State
	committed, err := state.CommitCallable(CommitCallableCommand{
		ProjectID: state.Project.ID, CallableID: "callable-dynamic", ExpectedRevision: state.Project.Revision, AuthoredExpression: "fixture.dynamic",
	})
	if err != nil {
		t.Fatalf("CommitCallable() error = %v", err)
	}
	refreshed, err := committed.State.RefreshCallableParameters(RefreshCallableParametersCommand{
		ProjectID: committed.State.Project.ID, CallableID: "callable-dynamic", ExpectedRevision: committed.State.Project.Revision,
	}, []ProviderParameter{
		{Name: "left", PassingStyle: PassingStylePositionalOnly, TypeAnnotation: stringPointer("int")},
		{Name: "right", PassingStyle: PassingStylePositionalOnly, TypeAnnotation: stringPointer("int")},
		{Name: "scale", PassingStyle: PassingStylePositionalOrKeyword, TypeAnnotation: stringPointer("int")},
	}, sequenceIDs("parameter-left", "parameter-right", "parameter-scale"))
	if err != nil {
		t.Fatalf("RefreshCallableParameters() error = %v", err)
	}
	return refreshed.State
}

func mustBlank(t *testing.T, projectID string) State {
	t.Helper()
	state, err := NewBlank(sequenceIDs(projectID))
	if err != nil {
		t.Fatalf("NewBlank() error = %v", err)
	}
	return state
}

func sequenceIDs(ids ...string) IDGenerator {
	index := 0
	return func() (string, error) {
		if index >= len(ids) {
			return "", fmt.Errorf("unexpected ID allocation %d", index)
		}
		id := ids[index]
		index++
		return id, nil
	}
}

func parameterIDs(parameters []Parameter) []string {
	ids := make([]string, 0, len(parameters))
	for _, parameter := range parameters {
		ids = append(ids, parameter.ID)
	}
	return ids
}

func findParameter(t *testing.T, parameters []Parameter, id string) Parameter {
	t.Helper()
	for _, parameter := range parameters {
		if parameter.ID == id {
			return parameter
		}
	}
	t.Fatalf("parameter %q not found in %#v", id, parameters)
	return Parameter{}
}

func mustChangedCandidate(t *testing.T, label string, candidate Candidate, err error) State {
	t.Helper()
	if err != nil {
		t.Fatalf("%s error = %v", label, err)
	}
	if !candidate.Changed {
		t.Fatalf("%s candidate = %#v, want a semantic change", label, candidate)
	}
	return candidate.State
}

func requireProject(t *testing.T, state State, id string, name string, revision int) {
	t.Helper()
	if state.Project.ID != id || state.Project.Name != name || state.Project.Revision != revision {
		t.Fatalf("project = %#v, want ID %q, name %q, revision %d", state.Project, id, name, revision)
	}
}

func requireCallableIDs(t *testing.T, state State, want ...string) {
	t.Helper()
	if got := parameterIDsForCallables(state.Callables); !reflect.DeepEqual(got, want) {
		t.Fatalf("callable IDs = %#v, want %#v", got, want)
	}
}

func requireEmptyCallable(t *testing.T, callable Callable) {
	t.Helper()
	if callable.AuthoredExpression != "" || len(callable.Parameters) != 0 {
		t.Fatalf("new callable = %#v, want empty authored section", callable)
	}
}

func requireRemainingCallable(t *testing.T, state State, id string, name string, revision int) {
	t.Helper()
	if len(state.Callables) != 1 {
		t.Fatalf("remaining callables = %#v, want one", state.Callables)
	}
	requireProject(t, state, state.Project.ID, state.Project.Name, revision)
	if state.Callables[0].ID != id || state.Callables[0].Name != name {
		t.Fatalf("remaining callable = %#v, want ID %q and name %q", state.Callables[0], id, name)
	}
}

func requireStaleTargetUnchanged(t *testing.T, state State) {
	t.Helper()
	before := state.Clone()
	_, err := state.SetTarget(SetTargetCommand{
		ProjectID: state.Project.ID, ExpectedRevision: state.Project.Revision - 1, Prefix: "import example", Suffix: DefaultPythonSuffix,
	})
	if !errors.Is(err, ErrRevisionConflict) {
		t.Fatalf("SetTarget(stale) error = %v, want revision conflict", err)
	}
	if !reflect.DeepEqual(state, before) {
		t.Fatalf("stale command mutated source state:\n got: %#v\nwant: %#v", state, before)
	}
}

func requireTarget(t *testing.T, state State, prefix string, suffix string, revision int) {
	t.Helper()
	if state.Project.Revision != revision || state.PythonTarget.Prefix != prefix || state.PythonTarget.Suffix != suffix {
		t.Fatalf("target state = %#v, want prefix %q, suffix %q, revision %d", state, prefix, suffix, revision)
	}
}

func mustSetParameters(t *testing.T, label string, state State, callableID string, parameters []ParameterProposal) State {
	t.Helper()
	candidate, err := state.SetParameters(SetParametersCommand{
		ProjectID: state.Project.ID, CallableID: callableID, ExpectedRevision: state.Project.Revision, Parameters: parameters,
	})
	return mustChangedCandidate(t, "SetParameters("+label+")", candidate, err)
}

func requireParameterIDs(t *testing.T, parameters []Parameter, want ...string) {
	t.Helper()
	if got := parameterIDs(parameters); !reflect.DeepEqual(got, want) {
		t.Fatalf("parameter IDs = %#v, want %#v", got, want)
	}
}

func requireProviderMetadata(t *testing.T, parameters []Parameter, originals ...Parameter) {
	t.Helper()
	for _, original := range originals {
		retained := findParameter(t, parameters, original.ID)
		if retained.Name != original.Name || retained.NameEditable != original.NameEditable || retained.PassingStyle != original.PassingStyle ||
			!sameString(retained.TypeAnnotation, original.TypeAnnotation) || !sameString(retained.Default, original.Default) || !sameInt(retained.ProviderOrdinal, original.ProviderOrdinal) {
			t.Fatalf("provider metadata changed: got %#v, want metadata %#v", retained, original)
		}
	}
}

func stringPointer(value string) *string {
	return &value
}

func requireAppParameter(t *testing.T, parameter Parameter, name string, expression string) {
	t.Helper()
	if !parameter.NameEditable || parameter.PassingStyle != PassingStylePositionalOrKeyword || parameter.TypeAnnotation != nil ||
		parameter.Default != nil || parameter.ProviderOrdinal != nil || parameter.Name != name || parameter.AuthoredExpression != expression {
		t.Fatalf("app-authored parameter = %#v, want %q = %q with canonical app metadata", parameter, name, expression)
	}
}

func requireInvalidParameters(t *testing.T, state State, callableID string, label string, parameters []ParameterProposal) {
	t.Helper()
	before := state.Clone()
	_, err := state.SetParameters(SetParametersCommand{
		ProjectID: state.Project.ID, CallableID: callableID, ExpectedRevision: state.Project.Revision, Parameters: parameters,
	})
	if !errors.Is(err, ErrValidation) {
		t.Fatalf("SetParameters(%s) error = %v, want validation failure", label, err)
	}
	if !reflect.DeepEqual(state, before) {
		t.Fatalf("SetParameters(%s) changed state after validation failure", label)
	}
}

func parameterIDsForCallables(callables []Callable) []string {
	ids := make([]string, 0, len(callables))
	for _, callable := range callables {
		ids = append(ids, callable.ID)
	}
	return ids
}
