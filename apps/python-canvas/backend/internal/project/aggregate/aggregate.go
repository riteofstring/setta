package aggregate

import (
	"errors"
	"fmt"
	"sort"
	"strings"
)

const (
	DefaultProjectName = "Untitled Python Canvas"

	DefaultPythonSuffix = "state = SettaState()"

	maxIDBytes                 = 256
	maxDisplayNameBytes        = 256
	maxParameterNameBytes      = 256
	maxAuthoredExpressionBytes = 16 * 1024
	maxPythonTargetBytes       = 64 * 1024
	maxParametersPerCallable   = 256
	maxParameterDictionaries   = 256
	maxLists                   = 256
	maxDictionaryEntries       = 1024
	maxListChildren            = 256
)

var (
	ErrValidation = errors.New("aggregate: validation failed")

	ErrProviderSignatureInvalid = errors.New("aggregate: provider signature invalid")

	ErrProjectNotFound = errors.New("aggregate: project not found")

	ErrCallableNotFound = errors.New("aggregate: callable not found")

	ErrParameterDictionaryNotFound = errors.New("aggregate: parameter dictionary not found")

	ErrListNotFound = errors.New("aggregate: list not found")

	ErrRevisionConflict = errors.New("aggregate: revision conflict")

	ErrIDGeneratorRequired = errors.New("aggregate: ID generator is required")
)

type PassingStyle string

const (
	PassingStylePositionalOnly      PassingStyle = "positional_only"
	PassingStylePositionalOrKeyword PassingStyle = "positional_or_keyword"
	PassingStyleKeywordOnly         PassingStyle = "keyword_only"
	PassingStyleVariadicPositional  PassingStyle = "variadic_positional"
	PassingStyleVariadicKeyword     PassingStyle = "variadic_keyword"
)

type Project struct {
	ID       string
	Name     string
	Revision int
}

type PythonTarget struct {
	Prefix string
	Suffix string
}

type Parameter struct {
	ID                 string
	Name               string
	NameEditable       bool
	PassingStyle       PassingStyle
	TypeAnnotation     *string
	Default            *string
	ProviderOrdinal    *int
	AuthoredExpression string
}

type Callable struct {
	ID                 string
	Name               string
	AuthoredExpression string
	Parameters         []Parameter
}

type State struct {
	Project               Project
	PythonTarget          PythonTarget
	Callables             []Callable
	ParameterDictionaries []ParameterDictionary
	ParameterUIOverrides  map[string]ParameterUI
	Lists                 []List
	TopLevelSectionIDs    []string
}

type IDGenerator func() (string, error)

type Candidate struct {
	State   State
	Changed bool
}

type RenameProjectCommand struct {
	ProjectID        string
	ExpectedRevision int
	Name             string
}

type CreateCallableCommand struct {
	ProjectID        string
	ExpectedRevision int
	Name             string
}

type CreateConfiguredCallableCommand struct {
	ProjectID          string
	ExpectedRevision   int
	Name               string
	AuthoredExpression string
	ParameterValues    map[string]string
}

type PreparedConfiguredCallable struct {
	state              State
	callableID         string
	authoredExpression string
	parameterValues    map[string]string
}

func (prepared PreparedConfiguredCallable) CallableID() string {
	return prepared.callableID
}

func (prepared PreparedConfiguredCallable) AuthoredExpression() string {
	return prepared.authoredExpression
}

func (prepared PreparedConfiguredCallable) SignatureState() State {
	return prepared.state.Clone()
}

type RenameCallableCommand struct {
	ProjectID        string
	CallableID       string
	ExpectedRevision int
	Name             string
}

type DeleteCallableCommand struct {
	ProjectID        string
	CallableID       string
	ExpectedRevision int
}

type CommitCallableCommand struct {
	ProjectID          string
	CallableID         string
	ExpectedRevision   int
	AuthoredExpression string
}

type RefreshCallableParametersCommand struct {
	ProjectID        string
	CallableID       string
	ExpectedRevision int
}

type ProviderParameter struct {
	Name           string
	PassingStyle   PassingStyle
	TypeAnnotation *string
	Default        *string
}

type ParameterProposal struct {
	ID                 string
	Name               string
	AuthoredExpression string

	UI *ParameterUI
}

type SetParametersCommand struct {
	ProjectID        string
	CallableID       string
	ExpectedRevision int
	Parameters       []ParameterProposal
}

type SetTargetCommand struct {
	ProjectID        string
	ExpectedRevision int
	Prefix           string
	Suffix           string
}

func NewBlank(nextID IDGenerator) (State, error) {
	projectID, err := newStableID(nextID, nil)
	if err != nil {
		return State{}, err
	}
	state := State{
		Project: Project{
			ID:       projectID,
			Name:     DefaultProjectName,
			Revision: 1,
		},
		PythonTarget:          PythonTarget{Suffix: DefaultPythonSuffix},
		Callables:             []Callable{},
		ParameterDictionaries: []ParameterDictionary{},
		ParameterUIOverrides:  map[string]ParameterUI{},
		Lists:                 []List{},
		TopLevelSectionIDs:    []string{},
	}
	if err := state.Validate(); err != nil {
		return State{}, err
	}
	return state, nil
}

func (state State) Clone() State {
	clone := state
	clone.Callables = make([]Callable, len(state.Callables))
	for callableIndex, callable := range state.Callables {
		callableClone := callable
		callableClone.Parameters = make([]Parameter, len(callable.Parameters))
		for parameterIndex, parameter := range callable.Parameters {
			parameter.TypeAnnotation = cloneString(parameter.TypeAnnotation)
			parameter.Default = cloneString(parameter.Default)
			parameter.ProviderOrdinal = cloneInt(parameter.ProviderOrdinal)
			callableClone.Parameters[parameterIndex] = parameter
		}
		clone.Callables[callableIndex] = callableClone
	}
	clone.ParameterDictionaries = cloneParameterDictionaries(state.ParameterDictionaries)
	clone.ParameterUIOverrides = cloneParameterUIOverrides(state.ParameterUIOverrides)
	clone.Lists = cloneLists(state.Lists)
	clone.TopLevelSectionIDs = cloneStrings(state.TopLevelSectionIDs)
	return clone
}

func (state State) Validate() error {
	if err := validateProjectState(state); err != nil {
		return err
	}
	claimedIDs := map[string]struct{}{state.Project.ID: {}}
	for callableIndex, callable := range state.Callables {
		if err := validateCallable(callableIndex, callable, claimedIDs); err != nil {
			return err
		}
	}
	if err := validateParameterDictionariesAndForest(state, claimedIDs); err != nil {
		return err
	}
	return validateParameterUIOverrides(state)
}

func validateProjectState(state State) error {
	if err := validateID("project", state.Project.ID); err != nil {
		return err
	}
	if _, err := canonicalDisplayName("project", state.Project.Name); err != nil {
		return err
	}
	if state.Project.Name != strings.TrimSpace(state.Project.Name) {
		return validationError("project name must be canonical")
	}
	if state.Project.Revision <= 0 {
		return validationError("project revision must be positive")
	}
	if err := validateTargetRegion("prefix", state.PythonTarget.Prefix); err != nil {
		return err
	}
	return validateTargetRegion("suffix", state.PythonTarget.Suffix)
}

func validateCallable(callableIndex int, callable Callable, claimedIDs map[string]struct{}) error {
	if err := claimID(claimedIDs, fmt.Sprintf("callable %d", callableIndex), callable.ID); err != nil {
		return err
	}
	if _, err := canonicalDisplayName(fmt.Sprintf("callable %d", callableIndex), callable.Name); err != nil {
		return err
	}
	if callable.Name != strings.TrimSpace(callable.Name) {
		return validationError("callable %d name must be canonical", callableIndex)
	}
	if err := validateStoredCallableExpression(callable.AuthoredExpression); err != nil {
		return fmt.Errorf("callable %d: %w", callableIndex, err)
	}
	if len(callable.Parameters) > maxParametersPerCallable {
		return validationError("callable %d has too many parameters", callableIndex)
	}
	return validateCallableParameters(callableIndex, callable.Parameters, claimedIDs)
}

func validateCallableParameters(callableIndex int, parameters []Parameter, claimedIDs map[string]struct{}) error {
	parameterNames := make(map[string]struct{}, len(parameters))
	providerOrdinals := make(map[int]struct{}, len(parameters))
	for parameterIndex, parameter := range parameters {
		if err := claimID(claimedIDs, fmt.Sprintf("callable %d parameter %d", callableIndex, parameterIndex), parameter.ID); err != nil {
			return err
		}
		if err := validatePersistedParameter(parameter); err != nil {
			return fmt.Errorf("callable %d parameter %d: %w", callableIndex, parameterIndex, err)
		}
		if err := claimParameterName(parameterNames, parameter.Name, callableIndex); err != nil {
			return err
		}
		if err := claimProviderOrdinal(providerOrdinals, parameter.ProviderOrdinal, callableIndex); err != nil {
			return err
		}
	}
	if err := validateExpressedPositionalPrefix(parameters); err != nil {
		return fmt.Errorf("callable %d: %w", callableIndex, err)
	}
	return nil
}

func claimID(claimedIDs map[string]struct{}, kind string, id string) error {
	if err := validateID(kind, id); err != nil {
		return err
	}
	if _, exists := claimedIDs[id]; exists {
		return validationError("%s ID %q is not unique", kind, id)
	}
	claimedIDs[id] = struct{}{}
	return nil
}

func claimParameterName(claimedNames map[string]struct{}, name string, callableIndex int) error {
	if name == "" {
		return nil
	}
	if _, exists := claimedNames[name]; exists {
		return validationError("callable %d repeats parameter name %q", callableIndex, name)
	}
	claimedNames[name] = struct{}{}
	return nil
}

func claimProviderOrdinal(claimedOrdinals map[int]struct{}, ordinal *int, callableIndex int) error {
	if ordinal == nil {
		return nil
	}
	if _, exists := claimedOrdinals[*ordinal]; exists {
		return validationError("callable %d repeats provider ordinal %d", callableIndex, *ordinal)
	}
	claimedOrdinals[*ordinal] = struct{}{}
	return nil
}

func (state State) RenameProject(command RenameProjectCommand) (Candidate, error) {
	if err := state.validateProjectMutation(command.ProjectID, command.ExpectedRevision); err != nil {
		return Candidate{}, err
	}
	name, err := canonicalDisplayName("project", command.Name)
	if err != nil {
		return Candidate{}, err
	}
	candidate := state.Clone()
	if candidate.Project.Name == name {
		return Candidate{State: candidate}, nil
	}
	candidate.Project.Name = name
	return changedCandidate(candidate)
}

func (state State) CreateCallable(command CreateCallableCommand, nextID IDGenerator) (Candidate, error) {
	if err := state.validateProjectMutation(command.ProjectID, command.ExpectedRevision); err != nil {
		return Candidate{}, err
	}
	name, err := canonicalDisplayName("callable", command.Name)
	if err != nil {
		return Candidate{}, err
	}
	candidate := state.Clone()
	id, err := newStableID(nextID, candidate.targetIDs())
	if err != nil {
		return Candidate{}, err
	}
	candidate.Callables = append(candidate.Callables, Callable{
		ID:         id,
		Name:       name,
		Parameters: []Parameter{},
	})
	candidate.TopLevelSectionIDs = append(candidate.TopLevelSectionIDs, id)
	return changedCandidate(candidate)
}

func (state State) PrepareCreateConfiguredCallable(
	command CreateConfiguredCallableCommand,
	nextID IDGenerator,
) (PreparedConfiguredCallable, error) {
	if err := state.validateProjectMutation(command.ProjectID, command.ExpectedRevision); err != nil {
		return PreparedConfiguredCallable{}, err
	}
	name, err := canonicalDisplayName("callable", command.Name)
	if err != nil {
		return PreparedConfiguredCallable{}, err
	}
	expression, err := canonicalCallableExpression(command.AuthoredExpression)
	if err != nil {
		return PreparedConfiguredCallable{}, err
	}
	parameterValues, err := configuredParameterValues(command.ParameterValues)
	if err != nil {
		return PreparedConfiguredCallable{}, err
	}

	candidate := state.Clone()
	id, err := newStableID(nextID, candidate.targetIDs())
	if err != nil {
		return PreparedConfiguredCallable{}, err
	}
	candidate.Callables = append(candidate.Callables, Callable{
		ID:                 id,
		Name:               name,
		AuthoredExpression: expression,
		Parameters:         []Parameter{},
	})
	candidate.TopLevelSectionIDs = append(candidate.TopLevelSectionIDs, id)
	if err := candidate.Validate(); err != nil {
		return PreparedConfiguredCallable{}, err
	}
	return PreparedConfiguredCallable{
		state:              candidate,
		callableID:         id,
		authoredExpression: expression,
		parameterValues:    parameterValues,
	}, nil
}

func (prepared PreparedConfiguredCallable) Finalize(
	signature []ProviderParameter,
	nextID IDGenerator,
) (Candidate, error) {
	if err := prepared.state.Validate(); err != nil {
		return Candidate{}, err
	}
	callableIndex, err := prepared.state.callableIndex(prepared.callableID)
	if err != nil {
		return Candidate{}, err
	}
	candidate := prepared.state.Clone()
	parameters, err := newProviderParameters(signature, nil, nextID, candidate.targetIDs())
	if err != nil {
		return Candidate{}, err
	}
	if err := applyConfiguredParameterValues(parameters, prepared.parameterValues); err != nil {
		return Candidate{}, err
	}
	candidate.Callables[callableIndex].Parameters = parameters
	return changedCandidate(candidate)
}

func configuredParameterValues(values map[string]string) (map[string]string, error) {
	if len(values) > maxParametersPerCallable {
		return nil, validationError("configured parameter value map is too large")
	}
	result := make(map[string]string, len(values))
	names := make([]string, 0, len(values))
	for name := range values {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		canonicalName, err := canonicalParameterName(name)
		if err != nil || canonicalName == "" || canonicalName != name {
			return nil, validationError("configured parameter name %q is invalid", name)
		}
		expression := values[name]
		if err := validateParameterExpression(expression); err != nil {
			return nil, fmt.Errorf("configured parameter %q: %w", name, err)
		}
		result[name] = expression
	}
	return result, nil
}

func applyConfiguredParameterValues(parameters []Parameter, values map[string]string) error {
	remaining := make(map[string]string, len(values))
	for name, expression := range values {
		remaining[name] = expression
	}
	for index := range parameters {
		expression, found := remaining[parameters[index].Name]
		if !found {
			continue
		}
		parameters[index].AuthoredExpression = expression
		delete(remaining, parameters[index].Name)
	}
	if len(remaining) == 0 {
		return nil
	}
	names := make([]string, 0, len(remaining))
	for name := range remaining {
		names = append(names, name)
	}
	sort.Strings(names)
	return validationError("configured parameter %q is not in the provider signature", names[0])
}

func (state State) RenameCallable(command RenameCallableCommand) (Candidate, error) {
	if err := state.validateProjectMutation(command.ProjectID, command.ExpectedRevision); err != nil {
		return Candidate{}, err
	}
	name, err := canonicalDisplayName("callable", command.Name)
	if err != nil {
		return Candidate{}, err
	}
	callableIndex, err := state.callableIndex(command.CallableID)
	if err != nil {
		return Candidate{}, err
	}
	candidate := state.Clone()
	if candidate.Callables[callableIndex].Name == name {
		return Candidate{State: candidate}, nil
	}
	candidate.Callables[callableIndex].Name = name
	return changedCandidate(candidate)
}

func (state State) DeleteCallable(command DeleteCallableCommand) (Candidate, error) {
	if err := state.validateProjectMutation(command.ProjectID, command.ExpectedRevision); err != nil {
		return Candidate{}, err
	}
	if _, err := state.callableIndex(command.CallableID); err != nil {
		return Candidate{}, err
	}
	return state.deleteSectionSubtree(command.CallableID)
}

func (state State) PrepareCallableCommit(command CommitCallableCommand) (expression string, changed bool, err error) {
	if err := state.validateProjectMutation(command.ProjectID, command.ExpectedRevision); err != nil {
		return "", false, err
	}
	callableIndex, err := state.callableIndex(command.CallableID)
	if err != nil {
		return "", false, err
	}
	expression, err = canonicalCallableExpression(command.AuthoredExpression)
	if err != nil {
		return "", false, err
	}
	return expression, expression != state.Callables[callableIndex].AuthoredExpression, nil
}

func (state State) CommitCallable(command CommitCallableCommand) (Candidate, error) {
	expression, changed, err := state.PrepareCallableCommit(command)
	if err != nil {
		return Candidate{}, err
	}
	if !changed {
		return Candidate{State: state.Clone()}, nil
	}
	callableIndex, err := state.callableIndex(command.CallableID)
	if err != nil {
		return Candidate{}, err
	}
	candidate := state.Clone()
	candidate.Callables[callableIndex].AuthoredExpression = expression
	return changedCandidate(candidate)
}

func (state State) PrepareCallableParameterRefresh(command RefreshCallableParametersCommand) (string, error) {
	if err := state.validateProjectMutation(command.ProjectID, command.ExpectedRevision); err != nil {
		return "", err
	}
	callableIndex, err := state.callableIndex(command.CallableID)
	if err != nil {
		return "", err
	}
	expression, err := canonicalCallableExpression(state.Callables[callableIndex].AuthoredExpression)
	if err != nil {
		return "", err
	}
	return expression, nil
}

func (state State) RefreshCallableParameters(
	command RefreshCallableParametersCommand,
	signature []ProviderParameter,
	nextID IDGenerator,
) (Candidate, error) {
	if _, err := state.PrepareCallableParameterRefresh(command); err != nil {
		return Candidate{}, err
	}
	callableIndex, err := state.callableIndex(command.CallableID)
	if err != nil {
		return Candidate{}, err
	}
	candidate := state.Clone()
	currentParameters := candidate.Callables[callableIndex].Parameters
	parameters, err := newProviderParameters(signature, currentParameters, nextID, candidate.targetIDs())
	if err != nil {
		return Candidate{}, err
	}
	candidate.Callables[callableIndex].Parameters = parameters
	preserveRefreshedParameterUIs(&candidate, currentParameters, parameters)
	return changedCandidate(candidate)
}

func (state State) SetParameters(command SetParametersCommand) (Candidate, error) {
	if err := state.validateProjectMutation(command.ProjectID, command.ExpectedRevision); err != nil {
		return Candidate{}, err
	}
	if len(command.Parameters) > maxParametersPerCallable {
		return Candidate{}, validationError("proposed parameter list is too long")
	}
	callableIndex, err := state.callableIndex(command.CallableID)
	if err != nil {
		return Candidate{}, err
	}
	candidate := state.Clone()
	current := candidate.Callables[callableIndex]
	parameters, err := buildProposedParameters(
		current.Parameters,
		command.Parameters,
		candidate.targetIDsExceptParameters(command.CallableID),
	)
	if err != nil {
		return Candidate{}, err
	}
	if sameParameters(current.Parameters, parameters) && sameProposedParameterUIs(candidate, command.Parameters) {
		return Candidate{State: candidate}, nil
	}
	candidate.Callables[callableIndex].Parameters = parameters
	replaceProposedParameterUIs(&candidate, current.Parameters, command.Parameters)
	return changedCandidate(candidate)
}

type parameterProposalBuilder struct {
	retained    map[string]Parameter
	claimedIDs  map[string]struct{}
	proposedIDs map[string]struct{}
	names       map[string]struct{}
}

func buildProposedParameters(
	current []Parameter,
	proposals []ParameterProposal,
	claimedIDs map[string]struct{},
) ([]Parameter, error) {
	builder := newParameterProposalBuilder(current, claimedIDs, len(proposals))
	parameters := make([]Parameter, 0, len(proposals))
	for parameterIndex, proposal := range proposals {
		parameter, err := builder.build(parameterIndex, proposal)
		if err != nil {
			return nil, err
		}
		parameters = append(parameters, parameter)
	}
	if err := validateExpressedPositionalPrefix(parameters); err != nil {
		return nil, err
	}
	return parameters, nil
}

func newParameterProposalBuilder(
	current []Parameter,
	claimedIDs map[string]struct{},
	capacity int,
) parameterProposalBuilder {
	retained := make(map[string]Parameter, len(current))
	for _, parameter := range current {
		retained[parameter.ID] = parameter
	}
	return parameterProposalBuilder{
		retained:    retained,
		claimedIDs:  claimedIDs,
		proposedIDs: make(map[string]struct{}, capacity),
		names:       make(map[string]struct{}, capacity),
	}
}

func (builder *parameterProposalBuilder) build(index int, proposal ParameterProposal) (Parameter, error) {
	if err := builder.claimProposalID(index, proposal.ID); err != nil {
		return Parameter{}, err
	}
	parameter, err := builder.parameterFor(index, proposal.ID)
	if err != nil {
		return Parameter{}, err
	}
	return builder.apply(index, parameter, proposal)
}

func (builder *parameterProposalBuilder) claimProposalID(index int, id string) error {
	if err := validateID(fmt.Sprintf("proposed parameter %d", index), id); err != nil {
		return err
	}
	if _, exists := builder.proposedIDs[id]; exists {
		return validationError("proposed parameter %d repeats ID %q", index, id)
	}
	builder.proposedIDs[id] = struct{}{}
	return nil
}

func (builder *parameterProposalBuilder) parameterFor(index int, id string) (Parameter, error) {
	if parameter, retained := builder.retained[id]; retained {
		return parameter, nil
	}
	if _, collides := builder.claimedIDs[id]; collides {
		return Parameter{}, validationError("proposed parameter %d ID %q collides with another target", index, id)
	}
	return Parameter{ID: id, NameEditable: true, PassingStyle: PassingStylePositionalOrKeyword}, nil
}

func (builder *parameterProposalBuilder) apply(index int, parameter Parameter, proposal ParameterProposal) (Parameter, error) {
	name, err := canonicalParameterName(proposal.Name)
	if err != nil {
		return Parameter{}, fmt.Errorf("proposed parameter %d: %w", index, err)
	}
	if !parameter.NameEditable && name != parameter.Name {
		return Parameter{}, validationError("proposed parameter %d changes provider-owned name", index)
	}
	if err := validateParameterExpression(proposal.AuthoredExpression); err != nil {
		return Parameter{}, fmt.Errorf("proposed parameter %d: %w", index, err)
	}
	if err := builder.claimName(index, name); err != nil {
		return Parameter{}, err
	}
	parameter.Name = name
	parameter.AuthoredExpression = proposal.AuthoredExpression
	return parameter, nil
}

func (builder *parameterProposalBuilder) claimName(index int, name string) error {
	if name == "" {
		return nil
	}
	if _, exists := builder.names[name]; exists {
		return validationError("proposed parameter %d repeats name %q", index, name)
	}
	builder.names[name] = struct{}{}
	return nil
}

func (state State) SetTarget(command SetTargetCommand) (Candidate, error) {
	if err := state.validateProjectMutation(command.ProjectID, command.ExpectedRevision); err != nil {
		return Candidate{}, err
	}
	if err := validateTargetRegion("prefix", command.Prefix); err != nil {
		return Candidate{}, err
	}
	if err := validateTargetRegion("suffix", command.Suffix); err != nil {
		return Candidate{}, err
	}
	candidate := state.Clone()
	if candidate.PythonTarget.Prefix == command.Prefix && candidate.PythonTarget.Suffix == command.Suffix {
		return Candidate{State: candidate}, nil
	}
	candidate.PythonTarget = PythonTarget{Prefix: command.Prefix, Suffix: command.Suffix}
	return changedCandidate(candidate)
}

func changedCandidate(state State) (Candidate, error) {
	state.Project.Revision++
	if err := state.Validate(); err != nil {
		return Candidate{}, err
	}
	return Candidate{State: state, Changed: true}, nil
}

func (state State) validateProjectMutation(projectID string, expectedRevision int) error {
	if err := state.Validate(); err != nil {
		return err
	}
	if projectID != state.Project.ID {
		return fmt.Errorf("%w: %q", ErrProjectNotFound, projectID)
	}
	if expectedRevision != state.Project.Revision {
		return fmt.Errorf(
			"%w: expected %d, current %d",
			ErrRevisionConflict,
			expectedRevision,
			state.Project.Revision,
		)
	}
	return nil
}

func (state State) callableIndex(callableID string) (int, error) {
	for index, callable := range state.Callables {
		if callable.ID == callableID {
			return index, nil
		}
	}
	return 0, fmt.Errorf("%w: %q", ErrCallableNotFound, callableID)
}

func (state State) targetIDs() map[string]struct{} {
	claimed := map[string]struct{}{state.Project.ID: {}}
	for _, callable := range state.Callables {
		claimed[callable.ID] = struct{}{}
		for _, parameter := range callable.Parameters {
			claimed[parameter.ID] = struct{}{}
		}
	}
	for _, dictionary := range state.ParameterDictionaries {
		claimed[dictionary.ID] = struct{}{}
		claimDictionaryEntryIDs(claimed, dictionary.Entries)
	}
	for _, list := range state.Lists {
		claimed[list.ID] = struct{}{}
	}
	return claimed
}

func (state State) targetIDsExceptParameters(callableID string) map[string]struct{} {
	claimed := map[string]struct{}{state.Project.ID: {}}
	for _, callable := range state.Callables {
		claimed[callable.ID] = struct{}{}
		if callable.ID == callableID {
			continue
		}
		for _, parameter := range callable.Parameters {
			claimed[parameter.ID] = struct{}{}
		}
	}
	for _, dictionary := range state.ParameterDictionaries {
		claimed[dictionary.ID] = struct{}{}
		claimDictionaryEntryIDs(claimed, dictionary.Entries)
	}
	for _, list := range state.Lists {
		claimed[list.ID] = struct{}{}
	}
	return claimed
}

func newStableID(nextID IDGenerator, claimed map[string]struct{}) (string, error) {
	if nextID == nil {
		return "", ErrIDGeneratorRequired
	}
	id, err := nextID()
	if err != nil {
		return "", fmt.Errorf("allocate stable ID: %w", err)
	}
	if err := validateID("generated", id); err != nil {
		return "", err
	}
	if claimed != nil {
		if _, exists := claimed[id]; exists {
			return "", validationError("generated ID %q collides with an existing target", id)
		}
	}
	return id, nil
}
