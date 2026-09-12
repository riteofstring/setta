package coordinator

import (
	"sort"

	"github.com/setta/python-canvas/backend/internal/project/renderer"
)

const compilerDependencyCycleCode = "settaDependencyCycle"

func compilerDiagnostics(rendered renderer.Result) []Diagnostic {
	diagnostics := make([]Diagnostic, 0, len(rendered.DependencyCycleTargetIDs))
	seen := make(map[string]struct{}, len(rendered.DependencyCycleTargetIDs))
	for _, targetID := range rendered.DependencyCycleTargetIDs {
		if _, duplicate := seen[targetID]; duplicate {
			continue
		}
		seen[targetID] = struct{}{}
		sourceRange, exists := rendered.SourceRangesByTargetID[targetID]
		if !exists {
			continue
		}
		target := targetID
		diagnostics = append(diagnostics, Diagnostic{
			ID:       "compiler:dependency-cycle:" + targetID,
			Start:    sourceRange.Start,
			End:      sourceRange.End,
			Severity: ProviderDiagnosticError,
			Message:  "State dependency cycle.",
			Code:     compilerDependencyCycleCode,
			TargetID: &target,
		})
	}
	sort.Slice(diagnostics, func(left int, right int) bool {
		return diagnosticLess(diagnostics[left], diagnostics[right])
	})
	return diagnostics
}

func mergeDiagnostics(compiler []Diagnostic, provider []Diagnostic) []Diagnostic {
	merged := make([]Diagnostic, 0, len(compiler)+len(provider))
	merged = append(merged, compiler...)
	merged = append(merged, provider...)
	sort.Slice(merged, func(left int, right int) bool {
		return diagnosticLess(merged[left], merged[right])
	})
	return merged
}
