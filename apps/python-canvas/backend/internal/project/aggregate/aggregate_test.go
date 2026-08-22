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

func TestCommitReplacesProviderRowsAndCanonicalRecommitPreservesThem(t *testing.T) {
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
	}, []ProviderParameter{
		{Name: "left", PassingStyle: PassingStylePositionalOnly, TypeAnnotation: "int"},
		{Name: "rest", PassingStyle: PassingStyleVariadicPositional, TypeAnnotation: "tuple[int, ...]"},
		{Name: "scale", PassingStyle: PassingStylePositionalOrKeyword, TypeAnnotation: "float", Default: &defaultValue},
		{Name: "flag", PassingStyle: PassingStyleKeywordOnly, TypeAnnotation: "bool"},
		{Name: "options", PassingStyle: PassingStyleVariadicKeyword, TypeAnnotation: "dict[str, object]"},
	}, sequenceIDs("parameter-left", "parameter-rest", "parameter-scale", "parameter-flag", "parameter-options"))
	if err != nil {
		t.Fatalf("CommitCallable() error = %v", err)
	}
	if !committed.Changed || committed.State.Project.Revision != state.Project.Revision+1 {
		t.Fatalf("committed candidate = %#v", committed)
	}
	state = committed.State
	callable := state.Callables[0]
	if callable.AuthoredExpression != "fixture.first" || len(callable.Parameters) != 5 {
		t.Fatalf("committed callable = %#v", callable)
	}
	for index, parameter := range callable.Parameters {
		if parameter.NameEditable || parameter.ProviderOrdinal == nil || *parameter.ProviderOrdinal != index || parameter.TypeAnnotation == nil {
			t.Fatalf("provider parameter %d = %#v, want immutable provider metadata", index, parameter)
		}
	}
	if callable.Parameters[2].Default == nil || *callable.Parameters[2].Default != defaultValue {
		t.Fatalf("provider default = %#v", callable.Parameters[2].Default)
	}

	before := state.Clone()
	recommitted, err := state.CommitCallable(CommitCallableCommand{
		ProjectID: state.Project.ID, CallableID: callable.ID, ExpectedRevision: state.Project.Revision, AuthoredExpression: "fixture.first",
	}, nil, func() (string, error) {
		return "", errors.New("a canonical recommit must not allocate IDs")
	})
	if err != nil {
		t.Fatalf("CommitCallable(recommit) error = %v", err)
	}
	if recommitted.Changed || !reflect.DeepEqual(recommitted.State, before) {
		t.Fatalf("canonical recommit = %#v, want unchanged %#v", recommitted, before)
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
	}, []ProviderParameter{
		{Name: "left", PassingStyle: PassingStylePositionalOnly, TypeAnnotation: "int"},
		{Name: "right", PassingStyle: PassingStylePositionalOnly, TypeAnnotation: "int"},
		{Name: "scale", PassingStyle: PassingStylePositionalOrKeyword, TypeAnnotation: "int"},
	}, sequenceIDs("parameter-left", "parameter-right", "parameter-scale"))
	if err != nil {
		t.Fatalf("CommitCallable() error = %v", err)
	}
	return committed.State
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
