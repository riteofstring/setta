package project

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/setta/python-canvas/backend/internal/codegen"
	"github.com/setta/python-canvas/backend/internal/contracts"
)

// LSPProvider is the one process-backed provider a store may own. It keeps
// protocol details outside project while keeping semantic commits and their
// generated document revision together.
type LSPProvider interface {
	ResolveCallableSignature(context.Context, SignatureRequest) (CallableSignature, error)
	CompleteCallable(context.Context, CallableCompletionRequest) ([]CallableCompletionItem, error)
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
// generated ranges.
type ProviderDiagnostic struct {
	Start    int
	End      int
	Severity ProviderDiagnosticSeverity
	Message  string
}

type ProviderDiagnosticSeverity string

const (
	ProviderDiagnosticSeverityError       ProviderDiagnosticSeverity = "error"
	ProviderDiagnosticSeverityWarning     ProviderDiagnosticSeverity = "warning"
	ProviderDiagnosticSeverityInformation ProviderDiagnosticSeverity = "information"
)

type mappedProviderDiagnostic struct {
	ProviderDiagnostic
	targetID string
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
		result.Diagnostics,
	)
	state.providerStatus = result.ProviderStatus
}

func mapProviderDiagnostics(
	code string,
	ranges []codegen.SourceRange,
	diagnostics []ProviderDiagnostic,
) []contracts.DiagnosticV1 {
	mapped := make([]mappedProviderDiagnostic, 0, len(diagnostics))
	for _, diagnostic := range diagnostics {
		mappedDiagnostic, ok := mapProviderDiagnostic(code, ranges, diagnostic)
		if !ok {
			continue
		}
		mapped = append(mapped, mappedDiagnostic)
	}

	sort.Slice(mapped, func(left, right int) bool {
		if mapped[left].Start != mapped[right].Start {
			return mapped[left].Start < mapped[right].Start
		}
		if mapped[left].End != mapped[right].End {
			return mapped[left].End < mapped[right].End
		}
		if mapped[left].targetID != mapped[right].targetID {
			return mapped[left].targetID < mapped[right].targetID
		}
		if mapped[left].Severity != mapped[right].Severity {
			return mapped[left].Severity < mapped[right].Severity
		}
		return mapped[left].Message < mapped[right].Message
	})

	ordinals := make(map[string]int, len(mapped))
	output := make([]contracts.DiagnosticV1, 0, len(mapped))
	for _, diagnostic := range mapped {
		ordinalKey := fmt.Sprintf("%s:%d:%d:%s", diagnostic.targetID, diagnostic.Start, diagnostic.End, diagnostic.Severity)
		ordinals[ordinalKey]++
		output = append(output, contracts.DiagnosticV1{
			ID:       fmt.Sprintf("diagnostic:%s:%d:%d:%s:%d", diagnostic.targetID, diagnostic.Start, diagnostic.End, diagnostic.Severity, ordinals[ordinalKey]),
			Severity: contracts.DiagnosticSeverityV1(diagnostic.Severity),
			Message:  diagnostic.Message,
			TargetID: diagnostic.targetID,
		})
	}
	return output
}

func mapProviderDiagnostic(
	code string,
	ranges []codegen.SourceRange,
	diagnostic ProviderDiagnostic,
) (mappedProviderDiagnostic, bool) {
	if diagnostic.Start < 0 || diagnostic.End < diagnostic.Start || diagnostic.End > len(code) {
		return mappedProviderDiagnostic{}, false
	}
	severity, ok := contractDiagnosticSeverity(diagnostic.Severity)
	if !ok {
		return mappedProviderDiagnostic{}, false
	}
	message := strings.TrimSpace(diagnostic.Message)
	if message == "" {
		return mappedProviderDiagnostic{}, false
	}
	targetID, ok := sourceRangeTarget(diagnostic.Start, diagnostic.End, ranges)
	if !ok {
		return mappedProviderDiagnostic{}, false
	}
	return mappedProviderDiagnostic{
		ProviderDiagnostic: ProviderDiagnostic{
			Start:    diagnostic.Start,
			End:      diagnostic.End,
			Severity: severity,
			Message:  message,
		},
		targetID: targetID,
	}, true
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

func diagnosticOverlapsSourceRange(start int, end int, sourceRange codegen.SourceRange) bool {
	if start == end {
		return start >= sourceRange.Start && start <= sourceRange.End
	}
	return start < sourceRange.End && end > sourceRange.Start
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
