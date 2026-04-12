package mcpx

import (
	"testing"

	"setta/internal/projectstate"
)

func TestFilterLSPDiagnosticsPayloadLimitsSectionsAndUnmapped(t *testing.T) {
	t.Parallel()

	payload := projectstate.LSPDiagnosticsPayload{
		ProjectID: "project-1",
		GenCode: projectstate.ProjectConfigDiagnostics{
			ProjectID: "project-1",
			IsGenCode: true,
			Errors: map[string]projectstate.SectionTypeErrors{
				"allowed": {Callable: []string{"ok"}},
				"blocked": {Callable: []string{"nope"}},
			},
		},
		CodeSections: map[string][]projectstate.LSPDiagnostic{
			"allowed": {testScopedLSPDiagnostic("allowed diag")},
			"blocked": {testScopedLSPDiagnostic("blocked diag")},
		},
		UnmappedGenCode: []projectstate.LSPDiagnostic{testScopedLSPDiagnostic("unmapped")},
	}

	filtered := filterLSPDiagnosticsPayload(payload, map[string]struct{}{"allowed": {}}, false)
	if len(filtered.GenCode.Errors) != 1 {
		t.Fatalf("expected one allowed generated diagnostics entry, got %#v", filtered.GenCode.Errors)
	}
	if _, ok := filtered.GenCode.Errors["allowed"]; !ok {
		t.Fatalf("expected allowed generated diagnostics, got %#v", filtered.GenCode.Errors)
	}
	if len(filtered.CodeSections) != 1 {
		t.Fatalf("expected one allowed code section diagnostics entry, got %#v", filtered.CodeSections)
	}
	if _, ok := filtered.CodeSections["allowed"]; !ok {
		t.Fatalf("expected allowed code section diagnostics, got %#v", filtered.CodeSections)
	}
	if len(filtered.UnmappedGenCode) != 0 {
		t.Fatalf("expected filtered unmapped diagnostics to be empty, got %#v", filtered.UnmappedGenCode)
	}

	filteredWithUnmapped := filterLSPDiagnosticsPayload(payload, map[string]struct{}{"allowed": {}}, true)
	if len(filteredWithUnmapped.UnmappedGenCode) != 1 {
		t.Fatalf("expected unmapped diagnostics to be preserved when requested, got %#v", filteredWithUnmapped.UnmappedGenCode)
	}
}

func testScopedLSPDiagnostic(message string) projectstate.LSPDiagnostic {
	severity := 1
	return projectstate.LSPDiagnostic{
		Message:  message,
		Severity: &severity,
		Range: projectstate.LSPDiagnosticRange{
			Start: projectstate.LSPDiagnosticPosition{Line: 0, Character: 0},
			End:   projectstate.LSPDiagnosticPosition{Line: 0, Character: 1},
		},
	}
}
