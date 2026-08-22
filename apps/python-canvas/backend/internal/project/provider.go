package project

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/setta/python-canvas/backend/internal/codegen"
	"github.com/setta/python-canvas/backend/internal/contracts"
)

// LSPProvider is the one process-backed provider a store may own. It keeps
// protocol details outside project while keeping semantic commits and their
// generated document revision together.
type LSPProvider interface {
	ResolveCallableSignature(context.Context, SignatureRequest) (CallableSignature, error)
	CompleteCallable(context.Context, CallableCompletionRequest) ([]CompletionItem, error)
	CompletePythonTarget(context.Context, PythonTargetCompletionRequest) ([]CompletionItem, error)
	SynchronizeGeneratedDocument(context.Context, GeneratedDocumentRequest) (GeneratedDocumentResult, error)
	Close() error
}

// GeneratedDocumentRequest describes the exact generated file revision that
// has already been materialized for the language server to inspect.
type GeneratedDocumentRequest struct {
	Path     string
	Revision int
	Code     string
}

// ProviderDiagnostic is a normalized byte-range diagnostic from the provider.
// The project maps it to a semantic target exclusively through renderer-owned
// source ranges and callable-call bounds.
type ProviderDiagnostic struct {
	Start    int
	End      int
	Severity ProviderDiagnosticSeverity
	Message  string
	// Code is the provider's validated string diagnostic code. It is consumed
	// only by this semantic boundary and never becomes a frontend protocol
	// detail.
	Code string
}

type ProviderDiagnosticSeverity string

const (
	ProviderDiagnosticSeverityError       ProviderDiagnosticSeverity = "error"
	ProviderDiagnosticSeverityWarning     ProviderDiagnosticSeverity = "warning"
	ProviderDiagnosticSeverityInformation ProviderDiagnosticSeverity = "information"
)

type mappedProviderDiagnostic struct {
	ProviderDiagnostic
	targetID *string
}

// GeneratedDocumentResult contains diagnostics for one exact document version
// and the provider availability observed while waiting for that publication.
type GeneratedDocumentResult struct {
	Diagnostics    []ProviderDiagnostic
	ProviderStatus contracts.ProviderStatusV1
}

func initialProviderStatus() contracts.ProviderStatusV1 {
	return contracts.ProviderStatusV1{
		Provider: contracts.ProviderBasedpyrightV1,
		Status:   contracts.ProviderAvailabilityUnavailableV1,
		State:    contracts.ProviderLifecycleStateNotStartedV1,
	}
}

func failedProviderStatus() contracts.ProviderStatusV1 {
	return contracts.ProviderStatusV1{
		Provider: contracts.ProviderBasedpyrightV1,
		Status:   contracts.ProviderAvailabilityUnavailableV1,
		State:    contracts.ProviderLifecycleStateFailedV1,
	}
}

func applyProviderSynchronization(
	ctx context.Context,
	provider LSPProvider,
	path string,
	state *canonicalState,
) {
	if state == nil || provider == nil {
		return
	}

	result, err := provider.SynchronizeGeneratedDocument(ctx, GeneratedDocumentRequest{
		Path:     path,
		Revision: state.revision,
		Code:     state.rendered.Code,
	})
	if err != nil || result.ProviderStatus.Validate() != nil {
		state.diagnostics = []contracts.DiagnosticV1{}
		state.providerStatus = failedProviderStatus()
		return
	}

	state.diagnostics = mapProviderDiagnostics(
		state.rendered.Code,
		state.rendered.SourceRanges,
		state.callable.ID,
		state.rendered.CallableCallEnd,
		state.parameters,
		result.Diagnostics,
	)
	state.providerStatus = result.ProviderStatus
}

func mapProviderDiagnostics(
	code string,
	ranges []codegen.SourceRange,
	callableID string,
	callableCallEnd int,
	parameters []parameterState,
	diagnostics []ProviderDiagnostic,
) []contracts.DiagnosticV1 {
	mapped := make([]mappedProviderDiagnostic, 0, len(diagnostics))
	for _, diagnostic := range diagnostics {
		mapped = append(mapped, mapProviderDiagnostic(code, ranges, callableID, callableCallEnd, parameters, diagnostic)...)
	}

	sort.Slice(mapped, func(left, right int) bool {
		if mapped[left].Start != mapped[right].Start {
			return mapped[left].Start < mapped[right].Start
		}
		if mapped[left].End != mapped[right].End {
			return mapped[left].End < mapped[right].End
		}
		if diagnosticTargetKey(mapped[left].targetID) != diagnosticTargetKey(mapped[right].targetID) {
			return diagnosticTargetKey(mapped[left].targetID) < diagnosticTargetKey(mapped[right].targetID)
		}
		if mapped[left].Severity != mapped[right].Severity {
			return mapped[left].Severity < mapped[right].Severity
		}
		if mapped[left].Code != mapped[right].Code {
			return mapped[left].Code < mapped[right].Code
		}
		return mapped[left].Message < mapped[right].Message
	})

	ordinals := make(map[string]int, len(mapped))
	output := make([]contracts.DiagnosticV1, 0, len(mapped))
	for _, diagnostic := range mapped {
		targetKey := diagnosticTargetKey(diagnostic.targetID)
		ordinalKey := fmt.Sprintf("%s:%d:%d:%s", targetKey, diagnostic.Start, diagnostic.End, diagnostic.Severity)
		ordinals[ordinalKey]++
		output = append(output, contracts.DiagnosticV1{
			ID:       fmt.Sprintf("diagnostic:%s:%d:%d:%s:%d", targetKey, diagnostic.Start, diagnostic.End, diagnostic.Severity, ordinals[ordinalKey]),
			Severity: contracts.DiagnosticSeverityV1(diagnostic.Severity),
			Message:  diagnostic.Message,
			Start:    diagnostic.Start,
			End:      diagnostic.End,
			TargetID: diagnostic.targetID,
		})
	}
	return output
}

func mapProviderDiagnostic(
	code string,
	ranges []codegen.SourceRange,
	callableID string,
	callableCallEnd int,
	parameters []parameterState,
	diagnostic ProviderDiagnostic,
) []mappedProviderDiagnostic {
	if !hasValidProviderDiagnosticRange(code, diagnostic) {
		return nil
	}
	severity, ok := contractDiagnosticSeverity(diagnostic.Severity)
	if !ok {
		return nil
	}
	message := strings.TrimSpace(diagnostic.Message)
	if message == "" {
		return nil
	}
	targetID := providerDiagnosticTarget(diagnostic, ranges)
	if isCallableCallIssue(diagnostic, ranges, callableID, callableCallEnd) {
		targetID = stringPointer(callableID)
	}
	if missingRequired := missingRequiredProviderParameterIDsForCallIssue(diagnostic, targetID, callableID, parameters); len(missingRequired) > 0 {
		mapped := make([]mappedProviderDiagnostic, 0, len(missingRequired))
		for _, parameterID := range missingRequired {
			mapped = append(mapped, newMappedProviderDiagnostic(diagnostic, severity, message, stringPointer(parameterID)))
		}
		return mapped
	}
	return []mappedProviderDiagnostic{newMappedProviderDiagnostic(diagnostic, severity, message, targetID)}
}

func isCallableCallIssue(
	diagnostic ProviderDiagnostic,
	ranges []codegen.SourceRange,
	callableID string,
	callableCallEnd int,
) bool {
	if diagnostic.Code != "reportCallIssue" || callableCallEnd < 0 {
		return false
	}
	callableStart, ok := sourceRangeStart(callableID, ranges)
	if !ok {
		return false
	}
	if diagnostic.Start == diagnostic.End {
		return diagnostic.Start >= callableStart && diagnostic.Start <= callableCallEnd
	}
	return diagnostic.Start >= callableStart && diagnostic.End <= callableCallEnd
}

func hasValidProviderDiagnosticRange(code string, diagnostic ProviderDiagnostic) bool {
	return diagnostic.Start >= 0 && diagnostic.End >= diagnostic.Start && diagnostic.End <= len(code) &&
		isUTF8ByteBoundary(code, diagnostic.Start) && isUTF8ByteBoundary(code, diagnostic.End)
}

func providerDiagnosticTarget(diagnostic ProviderDiagnostic, ranges []codegen.SourceRange) *string {
	targetID, ok := sourceRangeTarget(diagnostic.Start, diagnostic.End, ranges)
	if !ok {
		return nil
	}
	return stringPointer(targetID)
}

func newMappedProviderDiagnostic(
	diagnostic ProviderDiagnostic,
	severity ProviderDiagnosticSeverity,
	message string,
	targetID *string,
) mappedProviderDiagnostic {
	return mappedProviderDiagnostic{
		ProviderDiagnostic: ProviderDiagnostic{
			Start:    diagnostic.Start,
			End:      diagnostic.End,
			Severity: severity,
			Message:  message,
			Code:     diagnostic.Code,
		},
		targetID: targetID,
	}
}

func missingRequiredProviderParameterIDs(parameters []parameterState) []string {
	missing := make([]string, 0, len(parameters))
	for _, parameter := range parameters {
		if parameter.NameEditable || parameter.Expression != "" || parameter.Default != nil ||
			isVariadicParameterPassingStyle(parameter.PassingStyle) {
			continue
		}
		if strings.TrimSpace(parameter.ID) != "" {
			missing = append(missing, parameter.ID)
		}
	}
	return missing
}

func missingRequiredProviderParameterIDsForCallIssue(
	diagnostic ProviderDiagnostic,
	targetID *string,
	callableID string,
	parameters []parameterState,
) []string {
	if diagnostic.Code != "reportCallIssue" || targetID == nil || *targetID != callableID {
		return nil
	}
	return missingRequiredProviderParameterIDs(parameters)
}

func isVariadicParameterPassingStyle(style codegen.ParameterPassingStyle) bool {
	switch contracts.ParameterPassingStyleV1(style) {
	case contracts.ParameterPassingStyleVariadicPositionalV1,
		contracts.ParameterPassingStyleVariadicKeywordV1:
		return true
	default:
		return false
	}
}

func diagnosticTargetKey(targetID *string) string {
	if targetID == nil {
		return "document"
	}
	return "target:" + *targetID
}

func stringPointer(value string) *string {
	return &value
}

func contractDiagnosticSeverity(severity ProviderDiagnosticSeverity) (ProviderDiagnosticSeverity, bool) {
	switch severity {
	case ProviderDiagnosticSeverityError,
		ProviderDiagnosticSeverityWarning,
		ProviderDiagnosticSeverityInformation:
		return severity, true
	default:
		return "", false
	}
}

func sourceRangeTarget(start int, end int, ranges []codegen.SourceRange) (string, bool) {
	bestIndex := -1
	for index, sourceRange := range ranges {
		if !diagnosticOverlapsSourceRange(start, end, sourceRange) {
			continue
		}
		if bestIndex == -1 || narrowerSourceRange(sourceRange, ranges[bestIndex]) {
			bestIndex = index
		}
	}
	if bestIndex == -1 {
		return "", false
	}
	return ranges[bestIndex].TargetID, true
}

func sourceRangeStart(targetID string, ranges []codegen.SourceRange) (int, bool) {
	for _, sourceRange := range ranges {
		if sourceRange.TargetID == targetID {
			return sourceRange.Start, true
		}
	}
	return 0, false
}

func diagnosticOverlapsSourceRange(start int, end int, sourceRange codegen.SourceRange) bool {
	if start == end {
		return start >= sourceRange.Start && start <= sourceRange.End
	}
	return start < sourceRange.End && end > sourceRange.Start
}

func isUTF8ByteBoundary(value string, offset int) bool {
	return offset == 0 || offset == len(value) || utf8.RuneStart(value[offset])
}

func narrowerSourceRange(candidate codegen.SourceRange, current codegen.SourceRange) bool {
	candidateLength := candidate.End - candidate.Start
	currentLength := current.End - current.Start
	if candidateLength != currentLength {
		return candidateLength < currentLength
	}
	if candidate.Start != current.Start {
		return candidate.Start < current.Start
	}
	return candidate.TargetID < current.TargetID
}
