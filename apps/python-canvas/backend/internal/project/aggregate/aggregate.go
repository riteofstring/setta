// Package aggregate owns the validated authored Python Canvas project model.
// It deliberately has no filesystem, HTTP, renderer, or provider dependency.
package aggregate

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	// DefaultProjectName is the nonempty name allocated for a blank project.
	DefaultProjectName = "Untitled Python Canvas"
	// DefaultPythonSuffix preserves the documented editable suffix convention.
	DefaultPythonSuffix = "state = SettaState()"

	maxIDBytes                 = 256
	maxDisplayNameBytes        = 256
	maxParameterNameBytes      = 256
	maxAuthoredExpressionBytes = 16 * 1024
	maxPythonTargetBytes       = 64 * 1024
	maxParametersPerCallable   = 256
)

var (
	// ErrValidation marks an invalid authored state or candidate command.
	ErrValidation = errors.New("aggregate: validation failed")
	// ErrProjectNotFound identifies a command for a different project.
	ErrProjectNotFound = errors.New("aggregate: project not found")
	// ErrCallableNotFound identifies a command for a missing callable.
	ErrCallableNotFound = errors.New("aggregate: callable not found")
	// ErrRevisionConflict identifies a command bound to an older revision.
	ErrRevisionConflict = errors.New("aggregate: revision conflict")
	// ErrIDGeneratorRequired marks an operation that needs an opaque ID source.
	ErrIDGeneratorRequired = errors.New("aggregate: ID generator is required")
)

// PassingStyle is the normalized provider call convention retained in authored
// state. It is intentionally independent of any transport representation.
type PassingStyle string

const (
	PassingStylePositionalOnly      PassingStyle = "positional_only"
	PassingStylePositionalOrKeyword PassingStyle = "positional_or_keyword"
	PassingStyleKeywordOnly         PassingStyle = "keyword_only"
	PassingStyleVariadicPositional  PassingStyle = "variadic_positional"
	PassingStyleVariadicKeyword     PassingStyle = "variadic_keyword"
)

// Project is the authored project identity and revision.
type Project struct {
	ID       string
	Name     string
	Revision int
}

// PythonTarget is the authored text outside the renderer-owned generated body.
type PythonTarget struct {
	Prefix string
	Suffix string
}

// Parameter is one ordered callable argument record. Provider-owned metadata
// remains present even when the authored expression is blank.
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

// Callable is one authored callable section and its ordered parameters.
type Callable struct {
	ID                 string
	Name               string
	AuthoredExpression string
	Parameters         []Parameter
}

// State is the complete persisted authored aggregate. Derived Python, source
// ranges, diagnostics, provider state, and materialization paths are absent.
type State struct {
	Project      Project
	PythonTarget PythonTarget
	Callables    []Callable
}

// IDGenerator allocates one opaque stable ID. The aggregate validates every
// generated result and never owns randomness or process state itself.
type IDGenerator func() (string, error)

// Candidate is a wholly validated next authored state. Changed is false for an
// accepted idempotent command, in which case revision is unchanged.
type Candidate struct {
	State   State
	Changed bool
}

// RenameProjectCommand replaces the one project's display name.
type RenameProjectCommand struct {
	ProjectID        string
	ExpectedRevision int
	Name             string
}

// CreateCallableCommand appends one empty callable with an allocated stable ID.
type CreateCallableCommand struct {
	ProjectID        string
	ExpectedRevision int
	Name             string
}

// RenameCallableCommand replaces one callable display name.
type RenameCallableCommand struct {
	ProjectID        string
	CallableID       string
	ExpectedRevision int
	Name             string
}

// DeleteCallableCommand removes one callable and its nested parameter records.
type DeleteCallableCommand struct {
	ProjectID        string
	CallableID       string
	ExpectedRevision int
}

// CommitCallableCommand supplies an authored dotted callable expression.
type CommitCallableCommand struct {
	ProjectID          string
	CallableID         string
	ExpectedRevision   int
	AuthoredExpression string
}

// ProviderParameter is an already normalized provider signature record. The
// aggregate assigns its stable ID and zero-based original signature ordinal.
type ProviderParameter struct {
	Name           string
	PassingStyle   PassingStyle
	TypeAnnotation string
	Default        *string
}

// ParameterProposal is the complete client-owned mutable portion of one
// parameter-list row. Metadata is deliberately not accepted here.
type ParameterProposal struct {
	ID                 string
	Name               string
	AuthoredExpression string
}

// SetParametersCommand replaces one callable's complete ordered parameter list.
type SetParametersCommand struct {
	ProjectID        string
	CallableID       string
	ExpectedRevision int
	Parameters       []ParameterProposal
}

// SetTargetCommand replaces both editable outer Python regions as one command.
type SetTargetCommand struct {
	ProjectID        string
	ExpectedRevision int
	Prefix           string
	Suffix           string
}

// NewBlank creates a genuinely empty project with a dynamically allocated ID.
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
		PythonTarget: PythonTarget{Suffix: DefaultPythonSuffix},
		Callables:    []Callable{},
	}
	if err := state.Validate(); err != nil {
		return State{}, err
	}
	return state, nil
}

// Clone returns a defensive deep copy of the authored aggregate.
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
	return clone
}

// Validate confirms all persisted invariants without deriving any presentation
// or provider state.
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
	return nil
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

// RenameProject validates and constructs one expected-revision candidate.
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

// CreateCallable appends an empty callable with no default expression or
// provider-derived records.
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
	return changedCandidate(candidate)
}

// RenameCallable validates and constructs one expected-revision candidate.
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

// DeleteCallable removes exactly the named callable and its nested records.
func (state State) DeleteCallable(command DeleteCallableCommand) (Candidate, error) {
	if err := state.validateProjectMutation(command.ProjectID, command.ExpectedRevision); err != nil {
		return Candidate{}, err
	}
	callableIndex, err := state.callableIndex(command.CallableID)
	if err != nil {
		return Candidate{}, err
	}
	candidate := state.Clone()
	candidate.Callables = append(candidate.Callables[:callableIndex], candidate.Callables[callableIndex+1:]...)
	return changedCandidate(candidate)
}

// PrepareCallableCommit validates a command before a coordinator asks its
// provider for a new signature. Changed is false for a canonical recommit.
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

// CommitCallable applies a changed canonical expression and atomically replaces
// its entire list with provider-derived rows. A canonical recommit preserves all
// existing records and does not consume IDs.
func (state State) CommitCallable(
	command CommitCallableCommand,
	signature []ProviderParameter,
	nextID IDGenerator,
) (Candidate, error) {
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
	parameters, err := newProviderParameters(signature, nextID, candidate.targetIDs())
	if err != nil {
		return Candidate{}, err
	}
	candidate.Callables[callableIndex].AuthoredExpression = expression
	candidate.Callables[callableIndex].Parameters = parameters
	return changedCandidate(candidate)
}

// SetParameters applies one complete parameter-list candidate while preserving
// every retained provider record's immutable metadata.
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
	if sameParameters(current.Parameters, parameters) {
		return Candidate{State: candidate}, nil
	}
	candidate.Callables[callableIndex].Parameters = parameters
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

// SetTarget updates the prefix and suffix together so the generated body never
// becomes a client-controlled mutation target.
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

func newProviderParameters(
	signature []ProviderParameter,
	nextID IDGenerator,
	claimed map[string]struct{},
) ([]Parameter, error) {
	if len(signature) > maxParametersPerCallable {
		return nil, validationError("provider signature has too many parameters")
	}
	if err := validateProviderSignature(signature); err != nil {
		return nil, err
	}
	return allocateProviderParameters(signature, nextID, claimed)
}

func validateProviderSignature(signature []ProviderParameter) error {
	names := make(map[string]struct{}, len(signature))
	for parameterIndex, parameter := range signature {
		if err := validateProviderParameterInput(parameterIndex, parameter, names); err != nil {
			return err
		}
	}
	return nil
}

func validateProviderParameterInput(index int, parameter ProviderParameter, names map[string]struct{}) error {
	name, err := canonicalParameterName(parameter.Name)
	if err != nil || name == "" {
		return fmt.Errorf("provider parameter %d: %w", index, validationError("name is invalid"))
	}
	if err := claimProviderName(names, name, index); err != nil {
		return err
	}
	if !isSupportedPassingStyle(parameter.PassingStyle) {
		return validationError("provider parameter %d has unsupported passing style %q", index, parameter.PassingStyle)
	}
	if err := validateMetadata("type annotation", parameter.TypeAnnotation); err != nil {
		return fmt.Errorf("provider parameter %d: %w", index, err)
	}
	if err := validateProviderDefault(parameter.Default); err != nil {
		return fmt.Errorf("provider parameter %d: %w", index, err)
	}
	return nil
}

func claimProviderName(names map[string]struct{}, name string, index int) error {
	if _, exists := names[name]; exists {
		return validationError("provider parameter %d repeats name %q", index, name)
	}
	names[name] = struct{}{}
	return nil
}

func validateProviderDefault(defaultValue *string) error {
	if defaultValue == nil {
		return nil
	}
	return validateMetadata("default", *defaultValue)
}

func allocateProviderParameters(
	signature []ProviderParameter,
	nextID IDGenerator,
	claimed map[string]struct{},
) ([]Parameter, error) {
	parameters := make([]Parameter, 0, len(signature))
	for parameterIndex, providerParameter := range signature {
		id, err := newStableID(nextID, claimed)
		if err != nil {
			return nil, err
		}
		claimed[id] = struct{}{}
		name, _ := canonicalParameterName(providerParameter.Name)
		ordinal := parameterIndex
		typeAnnotation := providerParameter.TypeAnnotation
		parameters = append(parameters, Parameter{
			ID:              id,
			Name:            name,
			NameEditable:    false,
			PassingStyle:    providerParameter.PassingStyle,
			TypeAnnotation:  &typeAnnotation,
			Default:         cloneString(providerParameter.Default),
			ProviderOrdinal: &ordinal,
		})
	}
	return parameters, nil
}

func validatePersistedParameter(parameter Parameter) error {
	if err := validateParameterExpression(parameter.AuthoredExpression); err != nil {
		return err
	}
	if parameter.NameEditable {
		return validateAppAuthoredParameter(parameter)
	}
	return validateProviderDerivedParameter(parameter)
}

func validateAppAuthoredParameter(parameter Parameter) error {
	if parameter.PassingStyle != PassingStylePositionalOrKeyword {
		return validationError("app-authored parameter has noncanonical passing style")
	}
	if parameter.TypeAnnotation != nil || parameter.Default != nil || parameter.ProviderOrdinal != nil {
		return validationError("app-authored parameter has provider metadata")
	}
	name, err := canonicalParameterName(parameter.Name)
	if err != nil {
		return err
	}
	if name != parameter.Name {
		return validationError("app-authored parameter name must be canonical")
	}
	return nil
}

func validateProviderDerivedParameter(parameter Parameter) error {
	if parameter.ProviderOrdinal == nil || *parameter.ProviderOrdinal < 0 {
		return validationError("provider-derived parameter has invalid provider ordinal")
	}
	if parameter.TypeAnnotation == nil {
		return validationError("provider-derived parameter is missing type annotation metadata")
	}
	if err := validateMetadata("type annotation", *parameter.TypeAnnotation); err != nil {
		return err
	}
	if err := validateProviderDefault(parameter.Default); err != nil {
		return err
	}
	if !isSupportedPassingStyle(parameter.PassingStyle) {
		return validationError("provider-derived parameter has unsupported passing style %q", parameter.PassingStyle)
	}
	return validateCanonicalProviderName(parameter.Name)
}

func validateCanonicalProviderName(value string) error {
	name, err := canonicalParameterName(value)
	if err != nil || name == "" {
		return validationError("provider-derived parameter name is invalid")
	}
	if name != value {
		return validationError("provider-derived parameter name must be canonical")
	}
	return nil
}

func validateExpressedPositionalPrefix(parameters []Parameter) error {
	ordinals := make([]int, 0, len(parameters))
	for _, parameter := range parameters {
		if parameter.NameEditable || parameter.PassingStyle != PassingStylePositionalOnly || parameter.AuthoredExpression == "" {
			continue
		}
		if parameter.ProviderOrdinal == nil {
			return validationError("expressed positional-only parameter has no provider ordinal")
		}
		ordinals = append(ordinals, *parameter.ProviderOrdinal)
	}
	sort.Ints(ordinals)
	for index, ordinal := range ordinals {
		if ordinal != index {
			return validationError("expressed positional-only provider ordinals must be a leading contiguous prefix")
		}
	}
	return nil
}

func sameParameters(left []Parameter, right []Parameter) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if !sameParameter(left[index], right[index]) {
			return false
		}
	}
	return true
}

func sameParameter(left Parameter, right Parameter) bool {
	return left.ID == right.ID &&
		left.Name == right.Name &&
		left.NameEditable == right.NameEditable &&
		left.PassingStyle == right.PassingStyle &&
		sameString(left.TypeAnnotation, right.TypeAnnotation) &&
		sameString(left.Default, right.Default) &&
		sameInt(left.ProviderOrdinal, right.ProviderOrdinal) &&
		left.AuthoredExpression == right.AuthoredExpression
}

func validateStoredCallableExpression(expression string) error {
	if expression == "" {
		return nil
	}
	canonical, err := canonicalCallableExpression(expression)
	if err != nil {
		return err
	}
	if canonical != expression {
		return validationError("callable expression must be canonical")
	}
	return nil
}

func canonicalCallableExpression(expression string) (string, error) {
	canonical := strings.TrimSpace(expression)
	if canonical == "" || len(canonical) > maxAuthoredExpressionBytes ||
		!utf8.ValidString(canonical) || strings.ContainsRune(canonical, '\x00') {
		return "", validationError("callable expression is invalid")
	}
	for _, component := range strings.Split(canonical, ".") {
		if !isPythonIdentifier(component) || isPythonKeyword(component) {
			return "", validationError("callable expression is invalid")
		}
	}
	return canonical, nil
}

func canonicalDisplayName(kind string, name string) (string, error) {
	canonical := strings.TrimSpace(name)
	if canonical == "" || len(canonical) > maxDisplayNameBytes || !utf8.ValidString(canonical) || strings.ContainsRune(canonical, '\x00') {
		return "", validationError("%s name is invalid", kind)
	}
	return canonical, nil
}

func canonicalParameterName(name string) (string, error) {
	canonical := strings.TrimSpace(name)
	if canonical == "" {
		return "", nil
	}
	if len(canonical) > maxParameterNameBytes || !utf8.ValidString(canonical) ||
		strings.ContainsRune(canonical, '\x00') || !isPythonIdentifier(canonical) || isPythonKeyword(canonical) {
		return "", validationError("parameter name is invalid")
	}
	return canonical, nil
}

func validateParameterExpression(expression string) error {
	if len(expression) > maxAuthoredExpressionBytes || !utf8.ValidString(expression) ||
		strings.ContainsRune(expression, '\x00') || strings.ContainsAny(expression, "\r\n;") {
		return validationError("parameter expression is invalid")
	}
	return nil
}

func validateTargetRegion(region string, value string) error {
	if len(value) > maxPythonTargetBytes || !utf8.ValidString(value) || strings.ContainsRune(value, '\x00') {
		return validationError("Python target %s is invalid", region)
	}
	return nil
}

func validateMetadata(kind string, value string) error {
	if len(value) > maxAuthoredExpressionBytes || !utf8.ValidString(value) || strings.ContainsRune(value, '\x00') {
		return validationError("provider %s is invalid", kind)
	}
	return nil
}

func validateID(kind string, id string) error {
	if id == "" || id != strings.TrimSpace(id) || len(id) > maxIDBytes || !utf8.ValidString(id) || strings.ContainsRune(id, '\x00') {
		return validationError("%s ID is invalid", kind)
	}
	return nil
}

func isSupportedPassingStyle(style PassingStyle) bool {
	switch style {
	case PassingStylePositionalOnly,
		PassingStylePositionalOrKeyword,
		PassingStyleKeywordOnly,
		PassingStyleVariadicPositional,
		PassingStyleVariadicKeyword:
		return true
	default:
		return false
	}
}

func isPythonIdentifier(value string) bool {
	if value == "" {
		return false
	}
	for index, character := range value {
		if character == '_' || unicode.IsLetter(character) || (index > 0 && unicode.IsDigit(character)) {
			continue
		}
		return false
	}
	return true
}

func isPythonKeyword(value string) bool {
	_, isKeyword := pythonKeywords[value]
	return isKeyword
}

func validationError(format string, arguments ...any) error {
	return fmt.Errorf("%w: %s", ErrValidation, fmt.Sprintf(format, arguments...))
}
