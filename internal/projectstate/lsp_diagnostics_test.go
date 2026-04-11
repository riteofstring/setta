package projectstate

import (
	"bytes"
	"log/slog"
	"strings"
	"testing"
)

// Duplicate code-section diagnostics should not rebroadcast the same payload.
func TestLSPDiagnosticsRegistrySkipsDuplicateCodeSectionBroadcast(t *testing.T) {
	t.Parallel()

	payloads := make([]LSPDiagnosticsPayload, 0, 2)
	registry := NewLSPDiagnosticsRegistry(LSPDiagnosticsRegistryOptions{
		OnChange: func(payload LSPDiagnosticsPayload) {
			payloads = append(payloads, payload)
		},
	})
	diagnostics := []LSPDiagnostic{testLSPDiagnostic("fixture-ts")}

	registry.UpdateCodeSection("project-alpha", "section-1", diagnostics)
	registry.UpdateCodeSection("project-alpha", "section-1", diagnostics)

	if len(payloads) != 1 {
		t.Fatalf("expected one broadcast payload, got %d", len(payloads))
	}
	if len(payloads[0].CodeSections["section-1"]) != 1 {
		t.Fatalf("expected one section diagnostic, got %#v", payloads[0].CodeSections)
	}
}

// Clearing a section should remove it from the filtered snapshot and emit the
// updated project payload.
func TestLSPDiagnosticsRegistryClearsCodeSectionDiagnostics(t *testing.T) {
	t.Parallel()

	payloads := make([]LSPDiagnosticsPayload, 0, 2)
	registry := NewLSPDiagnosticsRegistry(LSPDiagnosticsRegistryOptions{
		OnChange: func(payload LSPDiagnosticsPayload) {
			payloads = append(payloads, payload)
		},
	})

	registry.UpdateCodeSection("project-alpha", "section-1", []LSPDiagnostic{testLSPDiagnostic("fixture-ts")})
	registry.UpdateCodeSection("project-alpha", "section-1", nil)

	if len(payloads) != 2 {
		t.Fatalf("expected two broadcast payloads, got %d", len(payloads))
	}
	if _, ok := payloads[1].CodeSections["section-1"]; ok {
		t.Fatalf("expected cleared section diagnostics, got %#v", payloads[1].CodeSections)
	}
}

// Ignore state should filter the broadcast snapshot while preserving the raw
// diagnostics so later mute/suppression changes can reapply without a new LSP
// publish.
func TestLSPDiagnosticsRegistryAppliesCodeSectionIgnoreState(t *testing.T) {
	t.Parallel()

	payloads := make([]LSPDiagnosticsPayload, 0, 2)
	registry := NewLSPDiagnosticsRegistry(LSPDiagnosticsRegistryOptions{
		OnChange: func(payload LSPDiagnosticsPayload) {
			payloads = append(payloads, payload)
		},
	})

	registry.UpdateCodeSectionWithIgnoreState(
		"project-alpha",
		"section-1",
		[]LSPDiagnostic{testLSPDiagnostic("reportFoo")},
		CodeSectionDiagnosticsIgnoreState{
			SuppressedCodes: []any{"reportFoo"},
		},
	)

	if len(payloads) != 1 {
		t.Fatalf("expected one broadcast payload, got %d", len(payloads))
	}
	if len(payloads[0].CodeSections) != 0 {
		t.Fatalf("expected filtered snapshot to omit suppressed diagnostics, got %#v", payloads[0].CodeSections)
	}

	state := registry.projects["project-alpha"]
	if len(state.rawCodeSections["section-1"]) != 1 {
		t.Fatalf("expected raw diagnostics to stay stored, got %#v", state.rawCodeSections)
	}
	if _, ok := state.codeSections["section-1"]; ok {
		t.Fatalf("expected filtered diagnostics to be removed, got %#v", state.codeSections)
	}
}

// Reapplying ignore state should rebuild the filtered snapshot from stored raw
// diagnostics rather than waiting for a new publish from the language server.
func TestLSPDiagnosticsRegistryReappliesCodeSectionIgnoreState(t *testing.T) {
	t.Parallel()

	payloads := make([]LSPDiagnosticsPayload, 0, 3)
	registry := NewLSPDiagnosticsRegistry(LSPDiagnosticsRegistryOptions{
		OnChange: func(payload LSPDiagnosticsPayload) {
			payloads = append(payloads, payload)
		},
	})
	registry.UpdateCodeSection("project-alpha", "section-1", []LSPDiagnostic{testLSPDiagnostic("reportFoo")})

	project := ignoreStateTestProject(t, ignoreStateTestProjectOptions{})
	project.ID = "project-alpha"
	project.Name = "Alpha"
	if err := project.SetCodeSectionDiagnosticCodeSuppression("section-1", "reportFoo", true); err != nil {
		t.Fatalf("suppress diagnostic code: %v", err)
	}
	if err := registry.ReapplyCodeSectionIgnoreState(project, "section-1"); err != nil {
		t.Fatalf("reapply ignore state: %v", err)
	}

	filtered := registry.Snapshot("project-alpha")
	if len(filtered.CodeSections) != 0 {
		t.Fatalf("expected suppression to clear filtered diagnostics, got %#v", filtered.CodeSections)
	}

	if err := project.SetCodeSectionDiagnosticCodeSuppression("section-1", "reportFoo", false); err != nil {
		t.Fatalf("unsuppress diagnostic code: %v", err)
	}
	if err := registry.ReapplyCodeSectionIgnoreState(project, "section-1"); err != nil {
		t.Fatalf("reapply cleared ignore state: %v", err)
	}

	restored := registry.Snapshot("project-alpha")
	if len(restored.CodeSections["section-1"]) != 1 {
		t.Fatalf("expected raw diagnostics to restore after unsuppress, got %#v", restored.CodeSections)
	}
}

// Pruning should drop diagnostics for sections that no longer resolve as
// active Python code sections in the project snapshot.
func TestLSPDiagnosticsRegistryPrunesMissingPythonCodeSections(t *testing.T) {
	t.Parallel()

	payloads := make([]LSPDiagnosticsPayload, 0, 2)
	registry := NewLSPDiagnosticsRegistry(LSPDiagnosticsRegistryOptions{
		OnChange: func(payload LSPDiagnosticsPayload) {
			payloads = append(payloads, payload)
		},
	})
	registry.UpdateCodeSection("project-alpha", "runner", []LSPDiagnostic{testLSPDiagnostic("fixture-ts")})

	document, err := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize prune document: %v", err)
	}
	if err := registry.PruneDocument(document); err != nil {
		t.Fatalf("prune diagnostics: %v", err)
	}

	if len(payloads) != 2 {
		t.Fatalf("expected prune broadcast, got %d payloads", len(payloads))
	}
	if len(payloads[1].CodeSections) != 0 {
		t.Fatalf("expected prune to clear section diagnostics, got %#v", payloads[1].CodeSections)
	}
}

// A prune pass that finds the same active sections should not rebroadcast the
// existing snapshot.
func TestLSPDiagnosticsRegistryPruneDocumentSkipsUnchangedProjectState(t *testing.T) {
	t.Parallel()

	payloads := make([]LSPDiagnosticsPayload, 0, 2)
	registry := NewLSPDiagnosticsRegistry(LSPDiagnosticsRegistryOptions{
		OnChange: func(payload LSPDiagnosticsPayload) {
			payloads = append(payloads, payload)
		},
	})
	registry.UpdateCodeSection("project-alpha", "section-1", []LSPDiagnostic{testLSPDiagnostic("fixture-ts")})

	project := ignoreStateTestProject(t, ignoreStateTestProjectOptions{})
	project.ID = "project-alpha"
	project.Name = "Alpha"

	document, err := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": project,
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize unchanged prune document: %v", err)
	}
	if err := registry.PruneDocument(document); err != nil {
		t.Fatalf("prune unchanged diagnostics: %v", err)
	}

	if len(payloads) != 1 {
		t.Fatalf("expected no prune rebroadcast, got %d payloads", len(payloads))
	}
	if len(registry.Snapshot("project-alpha").CodeSections["section-1"]) != 1 {
		t.Fatalf("expected unchanged section diagnostics to remain, got %#v", registry.Snapshot("project-alpha").CodeSections)
	}
}

// Duplicate generated-document payloads should not rebroadcast.
func TestLSPDiagnosticsRegistrySkipsDuplicateGeneratedDocumentBroadcast(t *testing.T) {
	t.Parallel()

	payloads := make([]LSPDiagnosticsPayload, 0, 2)
	registry := NewLSPDiagnosticsRegistry(LSPDiagnosticsRegistryOptions{
		OnChange: func(payload LSPDiagnosticsPayload) {
			payloads = append(payloads, payload)
		},
	})

	registry.UpdateGeneratedDocument(
		"project-alpha",
		GeneratedDiagnosticsDocumentCode,
		ProjectConfigDiagnostics{
			ProjectID: "project-alpha",
			Errors: map[string]SectionTypeErrors{
				"section-1": {Params: map[string][]string{"param-1": {"bad type"}}},
			},
			IsGenCode: true,
		},
		[]LSPDiagnostic{testLSPDiagnostic("unmapped")},
	)
	registry.UpdateGeneratedDocument(
		"project-alpha",
		GeneratedDiagnosticsDocumentCode,
		ProjectConfigDiagnostics{
			ProjectID: "project-alpha",
			Errors: map[string]SectionTypeErrors{
				"section-1": {Params: map[string][]string{"param-1": {"bad type"}}},
			},
			IsGenCode: true,
		},
		[]LSPDiagnostic{testLSPDiagnostic("unmapped")},
	)

	if len(payloads) != 1 {
		t.Fatalf("expected one generated-doc broadcast, got %d", len(payloads))
	}
}

// Updating generated diagnostics with an empty mapped payload should clear the
// stored generated errors and emit the new empty snapshot.
func TestLSPDiagnosticsRegistryClearsGeneratedDocumentErrorsWhenEmpty(t *testing.T) {
	t.Parallel()

	payloads := make([]LSPDiagnosticsPayload, 0, 2)
	registry := NewLSPDiagnosticsRegistry(LSPDiagnosticsRegistryOptions{
		OnChange: func(payload LSPDiagnosticsPayload) {
			payloads = append(payloads, payload)
		},
	})

	registry.UpdateGeneratedDocument(
		"project-alpha",
		GeneratedDiagnosticsDocumentCode,
		ProjectConfigDiagnostics{
			ProjectID: "project-alpha",
			Errors: map[string]SectionTypeErrors{
				"section-1": {Callable: []string{"callable missing"}},
			},
			IsGenCode: true,
		},
		nil,
	)
	registry.UpdateGeneratedDocument(
		"project-alpha",
		GeneratedDiagnosticsDocumentCode,
		ProjectConfigDiagnostics{
			ProjectID: "project-alpha",
			Errors:    map[string]SectionTypeErrors{},
			IsGenCode: true,
		},
		nil,
	)

	if len(payloads) != 2 {
		t.Fatalf("expected two generated-doc broadcasts, got %d", len(payloads))
	}
	if len(payloads[1].GenCode.Errors) != 0 {
		t.Fatalf("expected generated errors to clear, got %#v", payloads[1].GenCode.Errors)
	}
}

func TestLSPDiagnosticsRegistryLogsGeneratedDocumentDebugSummary(t *testing.T) {
	t.Parallel()

	var buffer bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buffer, &slog.HandlerOptions{Level: slog.LevelDebug}))
	registry := NewLSPDiagnosticsRegistry(LSPDiagnosticsRegistryOptions{
		Logger: logger,
	})

	registry.UpdateGeneratedDocument(
		"project-alpha",
		GeneratedDiagnosticsDocumentCode,
		ProjectConfigDiagnostics{
			ProjectID: "project-alpha",
			Errors: map[string]SectionTypeErrors{
				"section-1": {
					Callable: []string{"callable missing"},
					Params:   map[string][]string{"param-1": {"bad type", "missing value"}},
				},
			},
			IsGenCode: true,
		},
		[]LSPDiagnostic{testLSPDiagnostic("unmapped")},
	)

	output := buffer.String()
	if !strings.Contains(output, `"trace_event":"lsp_generated_document_updated"`) {
		t.Fatalf("expected generated-document trace event in log output, got %q", output)
	}
	if !strings.Contains(output, `"project_id":"project-alpha"`) {
		t.Fatalf("expected project id in log output, got %q", output)
	}
	if !strings.Contains(output, `"generated_param_error_count":2`) {
		t.Fatalf("expected param error summary in log output, got %q", output)
	}
	if !strings.Contains(output, `"unmapped_generated_diagnostic_count":1`) {
		t.Fatalf("expected unmapped summary in log output, got %q", output)
	}
}

// Updating generated diagnostics with an empty unmapped list should clear the
// stored unmapped payload and emit the updated snapshot.
func TestLSPDiagnosticsRegistryClearsGeneratedDocumentUnmappedWhenEmpty(t *testing.T) {
	t.Parallel()

	payloads := make([]LSPDiagnosticsPayload, 0, 2)
	registry := NewLSPDiagnosticsRegistry(LSPDiagnosticsRegistryOptions{
		OnChange: func(payload LSPDiagnosticsPayload) {
			payloads = append(payloads, payload)
		},
	})

	registry.UpdateGeneratedDocument(
		"project-alpha",
		GeneratedDiagnosticsDocumentCode,
		ProjectConfigDiagnostics{
			ProjectID: "project-alpha",
			Errors:    map[string]SectionTypeErrors{},
			IsGenCode: true,
		},
		[]LSPDiagnostic{testLSPDiagnostic("reportFoo")},
	)
	registry.UpdateGeneratedDocument(
		"project-alpha",
		GeneratedDiagnosticsDocumentCode,
		ProjectConfigDiagnostics{
			ProjectID: "project-alpha",
			Errors:    map[string]SectionTypeErrors{},
			IsGenCode: true,
		},
		nil,
	)

	if len(payloads) != 2 {
		t.Fatalf("expected two generated-doc broadcasts, got %d", len(payloads))
	}
	if len(payloads[1].UnmappedGenCode) != 0 {
		t.Fatalf("expected unmapped generated diagnostics to clear, got %#v", payloads[1].UnmappedGenCode)
	}
}

// Generated diagnostics should merge deterministically across code and metadata
// documents and clear when the Python target disappears.
func TestLSPDiagnosticsRegistryMergesAndPrunesGeneratedDocumentDiagnostics(t *testing.T) {
	t.Parallel()

	payloads := make([]LSPDiagnosticsPayload, 0, 4)
	registry := NewLSPDiagnosticsRegistry(LSPDiagnosticsRegistryOptions{
		OnChange: func(payload LSPDiagnosticsPayload) {
			payloads = append(payloads, payload)
		},
	})

	registry.UpdateGeneratedDocument(
		"project-alpha",
		GeneratedDiagnosticsDocumentCode,
		ProjectConfigDiagnostics{
			ProjectID: "project-alpha",
			Errors: map[string]SectionTypeErrors{
				"section-1": {
					Callable: []string{"callable missing"},
					Params:   map[string][]string{"param-1": {"bad type"}},
				},
			},
			IsGenCode: true,
		},
		nil,
	)
	registry.UpdateGeneratedDocument(
		"project-alpha",
		GeneratedDiagnosticsDocumentMetadata,
		ProjectConfigDiagnostics{
			ProjectID: "project-alpha",
			Errors:    map[string]SectionTypeErrors{},
			IsGenCode: true,
		},
		[]LSPDiagnostic{testLSPDiagnostic("meta-diag")},
	)

	merged := registry.Snapshot("project-alpha")
	if merged.GenCode.Errors["section-1"].Callable[0] != "callable missing" {
		t.Fatalf("unexpected merged callable errors %#v", merged.GenCode.Errors)
	}
	if merged.GenCode.Errors["section-1"].Params["param-1"][0] != "bad type" {
		t.Fatalf("unexpected merged param errors %#v", merged.GenCode.Errors)
	}
	if len(merged.UnmappedGenCode) != 1 {
		t.Fatalf("expected one merged unmapped diagnostic, got %#v", merged.UnmappedGenCode)
	}

	document, err := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize generated prune document: %v", err)
	}
	if err := registry.PruneDocument(document); err != nil {
		t.Fatalf("prune generated diagnostics: %v", err)
	}

	pruned := registry.Snapshot("project-alpha")
	if len(pruned.GenCode.Errors) != 0 {
		t.Fatalf("expected generated errors to clear, got %#v", pruned.GenCode.Errors)
	}
	if len(pruned.UnmappedGenCode) != 0 {
		t.Fatalf("expected unmapped generated diagnostics to clear, got %#v", pruned.UnmappedGenCode)
	}
}

func testLSPDiagnostic(code string) LSPDiagnostic {
	severity := 1
	source := "fixture-ts-lsp"
	uri := "file:///tmp/example.py"
	return LSPDiagnostic{
		Message:  "Fixture TypeScript diagnostic",
		Severity: &severity,
		Code:     code,
		Source:   &source,
		Range: LSPDiagnosticRange{
			Start: LSPDiagnosticPosition{Line: 0, Character: 0},
			End:   LSPDiagnosticPosition{Line: 0, Character: 1},
		},
		URI: &uri,
	}
}
