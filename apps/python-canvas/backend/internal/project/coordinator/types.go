package coordinator

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/setta/python-canvas/backend/internal/project/aggregate"
	"github.com/setta/python-canvas/backend/internal/project/renderer"
)

var (
	ErrProjectPathRequired = errors.New("coordinator: project path is required")

	ErrMaterializerRequired = errors.New("coordinator: materializer is required")

	ErrCoordinatorClosed = errors.New("coordinator: closed")

	ErrProviderUnavailable = errors.New("coordinator: provider unavailable")

	ErrProviderFailed = errors.New("coordinator: provider failed")

	ErrRenderFailed = errors.New("coordinator: render failed")

	ErrMaterializationFailed = errors.New("coordinator: materialization failed")

	ErrPersistenceFailed = errors.New("coordinator: persistence failed")

	ErrCompletionInvalid = errors.New("coordinator: completion is invalid")
)

type ProviderAvailability string

const (
	ProviderAvailabilityAvailable   ProviderAvailability = "available"
	ProviderAvailabilityUnavailable ProviderAvailability = "unavailable"
)

type ProviderLifecycleState string

const (
	ProviderLifecycleNotStarted ProviderLifecycleState = "not_started"
	ProviderLifecyclePending    ProviderLifecycleState = "pending"
	ProviderLifecycleReady      ProviderLifecycleState = "ready"
	ProviderLifecycleFailed     ProviderLifecycleState = "failed"
)

type ProviderStatus struct {
	Provider     string
	Availability ProviderAvailability
	State        ProviderLifecycleState
}

func (status ProviderStatus) Validate() error {
	if strings.TrimSpace(status.Provider) == "" {
		return fmt.Errorf("provider status has no provider")
	}
	switch status.Availability {
	case ProviderAvailabilityAvailable:
		if status.State != ProviderLifecyclePending && status.State != ProviderLifecycleReady {
			return fmt.Errorf("available provider has invalid state %q", status.State)
		}
	case ProviderAvailabilityUnavailable:
		if status.State != ProviderLifecycleNotStarted && status.State != ProviderLifecycleFailed {
			return fmt.Errorf("unavailable provider has invalid state %q", status.State)
		}
	default:
		return fmt.Errorf("provider has unsupported availability %q", status.Availability)
	}
	return nil
}

func unavailableProviderStatus(state ProviderLifecycleState) ProviderStatus {
	return ProviderStatus{
		Provider:     "basedpyright",
		Availability: ProviderAvailabilityUnavailable,
		State:        state,
	}
}

func pendingProviderStatus() ProviderStatus {
	return ProviderStatus{
		Provider:     "basedpyright",
		Availability: ProviderAvailabilityAvailable,
		State:        ProviderLifecyclePending,
	}
}

type ProviderDiagnosticSeverity string

const (
	ProviderDiagnosticError       ProviderDiagnosticSeverity = "error"
	ProviderDiagnosticWarning     ProviderDiagnosticSeverity = "warning"
	ProviderDiagnosticInformation ProviderDiagnosticSeverity = "information"
)

type ProviderDiagnostic struct {
	Start    int
	End      int
	Severity ProviderDiagnosticSeverity
	Message  string
	Code     string
}

type Diagnostic struct {
	ID       string
	Start    int
	End      int
	Severity ProviderDiagnosticSeverity
	Message  string
	Code     string
	TargetID *string
}

type SignatureRequest struct {
	ProjectID          string
	CallableID         string
	AuthoredExpression string
	Code               string
	CallOffset         int
}

type GeneratedDocumentRequest struct {
	Path     string
	Revision int
	Code     string
}

type GeneratedDocumentResult struct {
	Diagnostics    []ProviderDiagnostic
	ProviderStatus ProviderStatus
}

type Provider interface {
	ResolveCallableSignature(context.Context, SignatureRequest) ([]aggregate.ProviderParameter, error)
	SynchronizeGeneratedDocument(context.Context, GeneratedDocumentRequest) (GeneratedDocumentResult, error)
	Close() error
}

type CompletionItem struct {
	Label      string
	InsertText string
}

type CallableCompletionRequest struct {
	ProjectID          string
	CallableID         string
	CanonicalCode      string
	AuthoredExpression string
	CursorOffsetUTF16  int
}

type UTF16Range struct {
	Start int
	End   int
}

type PythonTargetCompletionRequest struct {
	Code             string
	CursorOffsetByte int
}

type CompletionProvider interface {
	CompleteCallable(context.Context, CallableCompletionRequest) ([]CompletionItem, error)
	CompletePythonTarget(context.Context, PythonTargetCompletionRequest) ([]CompletionItem, error)
}

type RenderFunc func(aggregate.State) (renderer.Result, error)

type Snapshot struct {
	State               aggregate.State
	Rendered            renderer.Result
	Diagnostics         []Diagnostic
	DiagnosticsRevision int
	ProviderStatus      ProviderStatus
}

func (snapshot Snapshot) Clone() Snapshot {
	clone := snapshot
	clone.State = snapshot.State.Clone()
	clone.Rendered = cloneRendered(snapshot.Rendered)
	clone.Diagnostics = cloneDiagnostics(snapshot.Diagnostics)
	return clone
}

func cloneRendered(result renderer.Result) renderer.Result {
	clone := result
	clone.SourceRangesByTargetID = make(map[string]renderer.ByteRange, len(result.SourceRangesByTargetID))
	for targetID, byteRange := range result.SourceRangesByTargetID {
		clone.SourceRangesByTargetID[targetID] = byteRange
	}
	clone.CompositionRangesByTargetID = make(map[string]renderer.ByteRange, len(result.CompositionRangesByTargetID))
	for targetID, byteRange := range result.CompositionRangesByTargetID {
		clone.CompositionRangesByTargetID[targetID] = byteRange
	}
	clone.CallableCallPositionsByID = make(map[string]renderer.CallPosition, len(result.CallableCallPositionsByID))
	for targetID, position := range result.CallableCallPositionsByID {
		clone.CallableCallPositionsByID[targetID] = position
	}
	clone.TargetPathsByID = make(map[string]string, len(result.TargetPathsByID))
	for targetID, path := range result.TargetPathsByID {
		clone.TargetPathsByID[targetID] = path
	}
	clone.DependencyCycleTargetIDs = append([]string(nil), result.DependencyCycleTargetIDs...)
	return clone
}

func cloneDiagnostics(diagnostics []Diagnostic) []Diagnostic {
	clone := make([]Diagnostic, len(diagnostics))
	for index, diagnostic := range diagnostics {
		diagnostic.TargetID = cloneString(diagnostic.TargetID)
		clone[index] = diagnostic
	}
	return clone
}

func cloneString(value *string) *string {
	if value == nil {
		return nil
	}
	clone := *value
	return &clone
}

func mapDiagnostics(state aggregate.State, rendered renderer.Result, diagnostics []ProviderDiagnostic) ([]Diagnostic, error) {
	targets := sortedRangeTargets(rendered.SourceRangesByTargetID)
	mapped := make([]Diagnostic, 0, len(diagnostics))
	for index, diagnostic := range diagnostics {
		if !validProviderDiagnostic(rendered.Code, diagnostic) {
			return nil, fmt.Errorf("provider diagnostic %d is invalid", index)
		}
		targetID := targetForDiagnostic(diagnostic, targets)
		callable := callableForCallIssue(state, rendered, diagnostic)
		if callable != nil {
			targetID = cloneString(&callable.ID)
		}
		missingParameterIDs := missingRequiredProviderParameterIDsForCallIssue(diagnostic, targetID, callable)
		if len(missingParameterIDs) == 0 {
			mapped = append(mapped, newDiagnostic(diagnostic, targetID))
			continue
		}
		for _, parameterID := range missingParameterIDs {
			mapped = append(mapped, newDiagnostic(diagnostic, cloneString(&parameterID)))
		}
	}
	sort.Slice(mapped, func(left int, right int) bool {
		return diagnosticLess(mapped[left], mapped[right])
	})

	ordinals := make(map[string]int, len(mapped))
	for index := range mapped {
		key := fmt.Sprintf("%s:%d:%d:%s", diagnosticTargetKey(mapped[index].TargetID), mapped[index].Start, mapped[index].End, mapped[index].Severity)
		ordinals[key]++
		mapped[index].ID = fmt.Sprintf("diagnostic:%s:%d:%d:%s:%d", diagnosticTargetKey(mapped[index].TargetID), mapped[index].Start, mapped[index].End, mapped[index].Severity, ordinals[key])
	}
	return mapped, nil
}

func diagnosticLess(left Diagnostic, right Diagnostic) bool {
	if left.Start != right.Start {
		return left.Start < right.Start
	}
	if left.End != right.End {
		return left.End < right.End
	}
	if diagnosticTargetKey(left.TargetID) != diagnosticTargetKey(right.TargetID) {
		return diagnosticTargetKey(left.TargetID) < diagnosticTargetKey(right.TargetID)
	}
	if left.Severity != right.Severity {
		return left.Severity < right.Severity
	}
	if left.Code != right.Code {
		return left.Code < right.Code
	}
	return left.Message < right.Message
}

func newDiagnostic(diagnostic ProviderDiagnostic, targetID *string) Diagnostic {
	return Diagnostic{
		Start:    diagnostic.Start,
		End:      diagnostic.End,
		Severity: diagnostic.Severity,
		Message:  strings.TrimSpace(diagnostic.Message),
		Code:     diagnostic.Code,
		TargetID: targetID,
	}
}

func callableForCallIssue(
	state aggregate.State,
	rendered renderer.Result,
	diagnostic ProviderDiagnostic,
) *aggregate.Callable {
	if diagnostic.Code != "reportCallIssue" {
		return nil
	}
	for index := range state.Callables {
		callable := &state.Callables[index]
		sourceRange, hasSourceRange := rendered.SourceRangesByTargetID[callable.ID]
		callPosition, hasCallPosition := rendered.CallableCallPositionsByID[callable.ID]
		if !hasSourceRange || !hasCallPosition {
			continue
		}
		if diagnosticWithinRange(diagnostic.Start, diagnostic.End, renderer.ByteRange{
			Start: sourceRange.Start,
			End:   callPosition.End,
		}) {
			return callable
		}
	}
	return nil
}

func diagnosticWithinRange(start int, end int, byteRange renderer.ByteRange) bool {
	if start == end {
		return start >= byteRange.Start && start <= byteRange.End
	}
	return start >= byteRange.Start && end <= byteRange.End
}

func missingRequiredProviderParameterIDsForCallIssue(
	diagnostic ProviderDiagnostic,
	targetID *string,
	callable *aggregate.Callable,
) []string {
	if diagnostic.Code != "reportCallIssue" || targetID == nil || callable == nil || *targetID != callable.ID {
		return nil
	}
	missing := make([]string, 0, len(callable.Parameters))
	for _, parameter := range callable.Parameters {
		if parameter.NameEditable || parameter.AuthoredExpression != "" || parameter.Default != nil ||
			isVariadicPassingStyle(parameter.PassingStyle) {
			continue
		}
		missing = append(missing, parameter.ID)
	}
	return missing
}

func isVariadicPassingStyle(style aggregate.PassingStyle) bool {
	return style == aggregate.PassingStyleVariadicPositional || style == aggregate.PassingStyleVariadicKeyword
}

func providerIsReady(status ProviderStatus) bool {
	return status.Availability == ProviderAvailabilityAvailable && status.State == ProviderLifecycleReady
}

func providerCanSynchronize(status ProviderStatus) bool {
	return status.Availability == ProviderAvailabilityAvailable && (status.State == ProviderLifecyclePending || status.State == ProviderLifecycleReady)
}

type rangeTarget struct {
	id     string
	range_ renderer.ByteRange
}

func sortedRangeTargets(ranges map[string]renderer.ByteRange) []rangeTarget {
	targets := make([]rangeTarget, 0, len(ranges))
	for targetID, byteRange := range ranges {
		targets = append(targets, rangeTarget{id: targetID, range_: byteRange})
	}
	sort.Slice(targets, func(left int, right int) bool {
		if targets[left].range_.Start != targets[right].range_.Start {
			return targets[left].range_.Start < targets[right].range_.Start
		}
		if targets[left].range_.End != targets[right].range_.End {
			return targets[left].range_.End < targets[right].range_.End
		}
		return targets[left].id < targets[right].id
	})
	return targets
}

func validProviderDiagnostic(code string, diagnostic ProviderDiagnostic) bool {
	if diagnostic.Start < 0 || diagnostic.End < diagnostic.Start || diagnostic.End > len(code) ||
		!isUTF8ByteBoundary(code, diagnostic.Start) || !isUTF8ByteBoundary(code, diagnostic.End) ||
		strings.TrimSpace(diagnostic.Message) == "" {
		return false
	}
	switch diagnostic.Severity {
	case ProviderDiagnosticError, ProviderDiagnosticWarning, ProviderDiagnosticInformation:
		return true
	default:
		return false
	}
}

func isUTF8ByteBoundary(value string, offset int) bool {
	if offset < 0 || offset > len(value) {
		return false
	}
	if offset == 0 || offset == len(value) {
		return true
	}
	return value[offset]&0xc0 != 0x80
}

func targetForDiagnostic(diagnostic ProviderDiagnostic, targets []rangeTarget) *string {
	for _, target := range targets {
		if diagnosticIntersectsRange(diagnostic.Start, diagnostic.End, target.range_) {
			return cloneString(&target.id)
		}
	}
	return nil
}

func diagnosticIntersectsRange(start int, end int, byteRange renderer.ByteRange) bool {
	if start == end {
		return start >= byteRange.Start && start <= byteRange.End
	}
	return start < byteRange.End && end > byteRange.Start
}

func diagnosticTargetKey(targetID *string) string {
	if targetID == nil {
		return "document"
	}
	return *targetID
}
