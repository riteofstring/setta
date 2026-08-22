// Package project owns the canonical in-memory Python Canvas project and its
// semantic mutations.
package project

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"unicode"

	"github.com/setta/python-canvas/backend/internal/codegen"
	"github.com/setta/python-canvas/backend/internal/contracts"
)

const (
	initialProjectID       = "project:python-canvas"
	initialProjectRevision = 1
	squareRootCallableID   = "callable:square-root"
	squareRootCallableName = "Square Root"
	pythonPrefix           = "import math"
	pythonSuffix           = "state = SettaState()"

	maxAuthoredExpressionBytes = 16 * 1024
)

var (
	ErrProjectNotFound             = errors.New("project: project not found")
	ErrCallableSectionNotFound     = errors.New("project: callable section not found")
	ErrParameterNotFound           = errors.New("project: parameter not found")
	ErrCallableExpressionInvalid   = errors.New("project: callable expression is invalid")
	ErrParameterExpressionInvalid  = errors.New("project: parameter expression is invalid")
	ErrLSPProviderRequired         = errors.New("project: LSP provider is required")
	ErrProviderUnavailable         = errors.New("project: LSP provider is unavailable")
	ErrUnsupportedSignature        = errors.New("project: callable signature is unsupported")
	ErrStoreClosed                 = errors.New("project: store is closed")
	ErrGeneratedFileWriterRequired = errors.New("project: generated file writer is required")
)

// SignatureRequest contains the exact temporary generated snapshot that a
// signature provider should inspect. CallOffset is a byte offset immediately
// inside the candidate call's opening parenthesis.
type SignatureRequest struct {
	ProjectID          string
	SectionID          string
	CallableExpression string
	Code               string
	CallOffset         int
}

// CallableSignature is the normalized provider result before it becomes
// canonical project state.
type CallableSignature struct {
	Parameters []SignatureParameter
}

// SignatureParameter carries the metadata needed by the one CodeParam record
// supported in this slice.
type SignatureParameter struct {
	Name           string
	PassingStyle   codegen.ParameterPassingStyle
	TypeAnnotation string
	Default        *string
}

// UnsupportedSignatureError reports why a provider result lies outside the
// one-positional-parameter boundary of this implementation phase.
type UnsupportedSignatureError struct {
	Reason string
}

func (err UnsupportedSignatureError) Error() string {
	return fmt.Sprintf("%s: %s", ErrUnsupportedSignature, err.Reason)
}

func (err UnsupportedSignatureError) Unwrap() error {
	return ErrUnsupportedSignature
}

// Store serializes project mutations and owns the canonical generated-file
// artifact for its lifetime.
type Store struct {
	mu       sync.Mutex
	state    canonicalState
	writer   GeneratedFileWriter
	provider LSPProvider
	closed   bool
}

type canonicalState struct {
	revision             int
	callable             callableState
	parameter            *parameterState
	nextParameterOrdinal int
	rendered             codegen.Result
	diagnostics          []contracts.DiagnosticV1
	providerStatus       contracts.ProviderStatusV1
}

type callableState struct {
	ID           string
	Name         string
	Expression   string
	ParameterIDs []string
}

type parameterState struct {
	ID             string
	Name           string
	PassingStyle   codegen.ParameterPassingStyle
	TypeAnnotation string
	Default        *string
	Expression     string
}

// NewStoreWithProvider creates a store that owns one real LSP provider for
// the lifetime of its generated document workspace.
func NewStoreWithProvider(writer GeneratedFileWriter, provider LSPProvider) (*Store, error) {
	if provider == nil {
		return nil, ErrLSPProviderRequired
	}
	return newStore(writer, provider)
}

func newStore(writer GeneratedFileWriter, provider LSPProvider) (*Store, error) {
	if writer == nil {
		return nil, ErrGeneratedFileWriterRequired
	}
	state, err := newInitialState()
	if err != nil {
		return nil, fmt.Errorf("build initial project: %w", err)
	}
	if err := writer.Write(state.rendered.Code); err != nil {
		return nil, fmt.Errorf("materialize initial generated Python: %w", err)
	}
	return &Store{state: state, writer: writer, provider: provider}, nil
}

// InitialProjectSnapshot returns the canonical uncommitted V1 project state.
// Its fixed semantic records are validated by the same renderer as mutable
// state, so the GET bootstrap document and mutation responses share one owner.
func InitialProjectSnapshot() contracts.ProjectSnapshotV1 {
	state, err := newInitialState()
	if err != nil {
		panic(fmt.Sprintf("build initial Python Canvas project: %v", err))
	}
	return state.snapshot()
}

// Snapshot returns a defensive canonical response for the current revision.
func (store *Store) Snapshot() contracts.ProjectSnapshotV1 {
	if store == nil {
		return contracts.ProjectSnapshotV1{}
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	return store.state.snapshot()
}

// GeneratedFilePath returns the backend-owned generated source path. It is
// consumed by the future LSP adapter and is not a persisted project file.
func (store *Store) GeneratedFilePath() string {
	if store == nil {
		return ""
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	return store.writer.Path()
}

// CommitCallable resolves one signature through the store-owned provider,
// renders the result, atomically replaces the generated file, and then commits
// the next canonical revision.
func (store *Store) CommitCallable(
	ctx context.Context,
	projectID string,
	sectionID string,
	expression string,
) (contracts.ProjectSnapshotV1, error) {
	if store == nil {
		return contracts.ProjectSnapshotV1{}, ErrStoreClosed
	}
	if ctx == nil {
		ctx = context.Background()
	}

	store.mu.Lock()
	defer store.mu.Unlock()
	if store.closed {
		return contracts.ProjectSnapshotV1{}, ErrStoreClosed
	}
	normalizedExpression, err := validateCallableCommitInput(ctx, projectID, sectionID, expression)
	if err != nil {
		return contracts.ProjectSnapshotV1{}, err
	}
	if normalizedExpression == store.state.callable.Expression {
		return store.state.snapshot(), nil
	}
	if store.provider == nil {
		return contracts.ProjectSnapshotV1{}, ErrLSPProviderRequired
	}

	candidate, err := buildCallableCommitCandidate(ctx, store.state, normalizedExpression, store.provider)
	if err != nil {
		return contracts.ProjectSnapshotV1{}, err
	}
	if err := store.writer.Write(candidate.rendered.Code); err != nil {
		return contracts.ProjectSnapshotV1{}, fmt.Errorf("materialize generated Python: %w", err)
	}
	applyProviderSynchronization(ctx, store.provider, store.writer.Path(), &candidate)
	snapshot, err := candidate.validatedSnapshot()
	if err != nil {
		return contracts.ProjectSnapshotV1{}, err
	}
	store.state = candidate
	return snapshot, nil
}

// SetParameterExpression stores the authored Python expression without
// coercion, renders the complete candidate, and commits it only after its
// generated file is replaced.
func (store *Store) SetParameterExpression(
	ctx context.Context,
	projectID string,
	parameterID string,
	expression string,
) (contracts.ProjectSnapshotV1, error) {
	if store == nil {
		return contracts.ProjectSnapshotV1{}, ErrStoreClosed
	}
	if ctx == nil {
		ctx = context.Background()
	}

	store.mu.Lock()
	defer store.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return contracts.ProjectSnapshotV1{}, err
	}
	if err := store.validateSetParameterExpressionLocked(projectID, parameterID, expression); err != nil {
		return contracts.ProjectSnapshotV1{}, err
	}
	if expression == store.state.parameter.Expression {
		return store.state.snapshot(), nil
	}

	candidate := cloneState(store.state)
	candidate.revision++
	candidate.parameter.Expression = expression
	if err := renderState(&candidate); err != nil {
		return contracts.ProjectSnapshotV1{}, err
	}
	if _, err := candidate.validatedSnapshot(); err != nil {
		return contracts.ProjectSnapshotV1{}, err
	}
	if err := store.writer.Write(candidate.rendered.Code); err != nil {
		return contracts.ProjectSnapshotV1{}, fmt.Errorf("materialize generated Python: %w", err)
	}
	applyProviderSynchronization(ctx, store.provider, store.writer.Path(), &candidate)
	snapshot, err := candidate.validatedSnapshot()
	if err != nil {
		return contracts.ProjectSnapshotV1{}, err
	}
	store.state = candidate
	return snapshot, nil
}

func (store *Store) validateSetParameterExpressionLocked(projectID string, parameterID string, expression string) error {
	if store.closed {
		return ErrStoreClosed
	}
	if projectID != initialProjectID {
		return fmt.Errorf("%w: %q", ErrProjectNotFound, projectID)
	}
	if store.state.parameter == nil || parameterID != store.state.parameter.ID {
		return fmt.Errorf("%w: %q", ErrParameterNotFound, parameterID)
	}
	return validateParameterExpression(expression)
}

// Close removes the temporary generated-file workspace and prevents further
// mutations. It is safe to call once for a successfully created store.
func (store *Store) Close() error {
	if store == nil {
		return nil
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.closed {
		return nil
	}
	store.closed = true
	var problems []error
	if store.provider != nil {
		if err := store.provider.Close(); err != nil {
			problems = append(problems, err)
		}
	}
	if err := store.writer.Close(); err != nil {
		problems = append(problems, err)
	}
	return errors.Join(problems...)
}

func newInitialState() (canonicalState, error) {
	state := canonicalState{
		revision: initialProjectRevision,
		callable: callableState{
			ID:           squareRootCallableID,
			Name:         squareRootCallableName,
			Expression:   "",
			ParameterIDs: []string{},
		},
		nextParameterOrdinal: 1,
		diagnostics:          []contracts.DiagnosticV1{},
		providerStatus:       initialProviderStatus(),
	}
	if err := renderState(&state); err != nil {
		return canonicalState{}, err
	}
	return state, nil
}

func validateCallableCommitInput(ctx context.Context, projectID string, sectionID string, expression string) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if err := validateProjectAndSection(projectID, sectionID); err != nil {
		return "", err
	}
	return normalizeCallableExpression(expression)
}

func buildCallableCommitCandidate(
	ctx context.Context,
	state canonicalState,
	expression string,
	provider LSPProvider,
) (canonicalState, error) {
	request, err := buildSignatureRequest(state, expression)
	if err != nil {
		return canonicalState{}, err
	}
	signature, err := provider.ResolveCallableSignature(ctx, request)
	if err != nil {
		return canonicalState{}, fmt.Errorf(
			"resolve callable signature: %w",
			errors.Join(ErrProviderUnavailable, err),
		)
	}
	resolvedParameter, err := normalizeSignature(signature)
	if err != nil {
		return canonicalState{}, err
	}

	candidate := cloneState(state)
	candidate.revision++
	candidate.callable.Expression = expression
	parameterID := fmt.Sprintf("parameter:square-root:%d", candidate.nextParameterOrdinal)
	candidate.nextParameterOrdinal++
	candidate.callable.ParameterIDs = []string{parameterID}
	candidate.parameter = &parameterState{
		ID:             parameterID,
		Name:           resolvedParameter.Name,
		PassingStyle:   resolvedParameter.PassingStyle,
		TypeAnnotation: resolvedParameter.TypeAnnotation,
		Default:        copyStringPointer(resolvedParameter.Default),
		Expression:     "",
	}
	if err := renderState(&candidate); err != nil {
		return canonicalState{}, err
	}
	if _, err := candidate.validatedSnapshot(); err != nil {
		return canonicalState{}, err
	}
	return candidate, nil
}

func buildSignatureRequest(state canonicalState, expression string) (SignatureRequest, error) {
	candidate := cloneState(state)
	candidate.callable.Expression = expression
	candidate.callable.ParameterIDs = []string{}
	candidate.parameter = nil
	if err := renderState(&candidate); err != nil {
		return SignatureRequest{}, fmt.Errorf("render signature snapshot: %w", err)
	}
	if candidate.rendered.CallableCallOffset < 0 {
		return SignatureRequest{}, fmt.Errorf("render signature snapshot: callable position not found")
	}
	return SignatureRequest{
		ProjectID:          initialProjectID,
		SectionID:          squareRootCallableID,
		CallableExpression: expression,
		Code:               candidate.rendered.Code,
		CallOffset:         candidate.rendered.CallableCallOffset,
	}, nil
}

func normalizeSignature(signature CallableSignature) (SignatureParameter, error) {
	if len(signature.Parameters) != 1 {
		return SignatureParameter{}, UnsupportedSignatureError{
			Reason: fmt.Sprintf("expected exactly one parameter, got %d", len(signature.Parameters)),
		}
	}
	parameter := signature.Parameters[0]
	parameter.Name = strings.TrimSpace(parameter.Name)
	if !isPythonIdentifier(parameter.Name) {
		return SignatureParameter{}, UnsupportedSignatureError{Reason: "parameter name is not a Python identifier"}
	}
	if codegen.IsPythonKeyword(parameter.Name) {
		return SignatureParameter{}, UnsupportedSignatureError{Reason: "parameter name is a Python keyword"}
	}
	if parameter.PassingStyle != codegen.ParameterPassingStylePositionalOnly &&
		parameter.PassingStyle != codegen.ParameterPassingStylePositionalOrKeyword {
		return SignatureParameter{}, UnsupportedSignatureError{Reason: "parameter passing style is not positional"}
	}
	parameter.TypeAnnotation = strings.TrimSpace(parameter.TypeAnnotation)
	parameter.Default = copyStringPointer(parameter.Default)
	return parameter, nil
}

func validateProjectAndSection(projectID string, sectionID string) error {
	if projectID != initialProjectID {
		return fmt.Errorf("%w: %q", ErrProjectNotFound, projectID)
	}
	if sectionID != squareRootCallableID {
		return fmt.Errorf("%w: %q", ErrCallableSectionNotFound, sectionID)
	}
	return nil
}

func normalizeCallableExpression(expression string) (string, error) {
	normalized := strings.TrimSpace(expression)
	if normalized == "" || len(normalized) > maxAuthoredExpressionBytes || strings.ContainsRune(normalized, '\x00') {
		return "", ErrCallableExpressionInvalid
	}
	for _, component := range strings.Split(normalized, ".") {
		if !isPythonIdentifier(component) || codegen.IsPythonKeyword(component) {
			return "", ErrCallableExpressionInvalid
		}
	}
	return normalized, nil
}

func validateParameterExpression(expression string) error {
	// A parameter is rendered as one assignment right-hand side, so a statement
	// separator cannot cross this transport boundary.
	if len(expression) > maxAuthoredExpressionBytes ||
		strings.ContainsRune(expression, '\x00') ||
		strings.ContainsAny(expression, "\r\n;") {
		return ErrParameterExpressionInvalid
	}
	return nil
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

func renderState(state *canonicalState) error {
	if state == nil {
		return errors.New("project: missing canonical state")
	}
	parameters := []codegen.Parameter{}
	if state.parameter != nil {
		parameters = append(parameters, codegen.Parameter{
			ID:           state.parameter.ID,
			Name:         state.parameter.Name,
			PassingStyle: state.parameter.PassingStyle,
			Expression:   state.parameter.Expression,
		})
	}
	rendered, err := codegen.Render(codegen.Input{
		Prefix: pythonPrefix,
		Suffix: pythonSuffix,
		Callable: codegen.Callable{
			ID:           state.callable.ID,
			Name:         state.callable.Name,
			Expression:   state.callable.Expression,
			ParameterIDs: append([]string(nil), state.callable.ParameterIDs...),
		},
		Parameters: parameters,
	})
	if err != nil {
		return fmt.Errorf("render canonical project: %w", err)
	}
	state.rendered = rendered
	return nil
}

func (state canonicalState) validatedSnapshot() (contracts.ProjectSnapshotV1, error) {
	snapshot := state.snapshot()
	if err := snapshot.Validate(); err != nil {
		return contracts.ProjectSnapshotV1{}, fmt.Errorf("validate canonical snapshot: %w", err)
	}
	return snapshot, nil
}

func (state canonicalState) snapshot() contracts.ProjectSnapshotV1 {
	parameterIDs := append([]string{}, state.callable.ParameterIDs...)
	parameters := []contracts.ParameterV1{}
	if state.parameter != nil {
		parameters = append(parameters, contracts.ParameterV1{
			ID:                 state.parameter.ID,
			Name:               state.parameter.Name,
			PassingStyle:       contracts.ParameterPassingStyleV1(state.parameter.PassingStyle),
			TypeAnnotation:     state.parameter.TypeAnnotation,
			Default:            copyStringPointer(state.parameter.Default),
			AuthoredExpression: state.parameter.Expression,
		})
	}
	ranges := make([]contracts.GeneratedSourceRangeV1, 0, len(state.rendered.SourceRanges))
	for _, sourceRange := range state.rendered.SourceRanges {
		ranges = append(ranges, contracts.GeneratedSourceRangeV1{
			TargetID: sourceRange.TargetID,
			Start:    sourceRange.Start,
			End:      sourceRange.End,
		})
	}

	return contracts.ProjectSnapshotV1{
		Version: contracts.ProjectSnapshotVersionV1,
		Project: contracts.ProjectV1{
			ID:       initialProjectID,
			Revision: state.revision,
		},
		PythonTarget: contracts.PythonTargetV1{
			Prefix: pythonPrefix,
			Suffix: pythonSuffix,
		},
		Callables: []contracts.CallableV1{{
			ID:                 state.callable.ID,
			Name:               state.callable.Name,
			AuthoredExpression: state.callable.Expression,
			ParameterIDs:       parameterIDs,
		}},
		Parameters: parameters,
		GeneratedCode: contracts.GeneratedCodeV1{
			Code:         state.rendered.Code,
			Body:         state.rendered.Body,
			SourceRanges: ranges,
		},
		Diagnostics:    append([]contracts.DiagnosticV1{}, state.diagnostics...),
		ProviderStatus: state.providerStatus,
	}
}

func cloneState(state canonicalState) canonicalState {
	clone := state
	clone.callable.ParameterIDs = append([]string(nil), state.callable.ParameterIDs...)
	if state.parameter != nil {
		parameter := *state.parameter
		parameter.Default = copyStringPointer(state.parameter.Default)
		clone.parameter = &parameter
	}
	clone.rendered.SourceRanges = append([]codegen.SourceRange(nil), state.rendered.SourceRanges...)
	clone.diagnostics = append([]contracts.DiagnosticV1{}, state.diagnostics...)
	return clone
}

func copyStringPointer(value *string) *string {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}
