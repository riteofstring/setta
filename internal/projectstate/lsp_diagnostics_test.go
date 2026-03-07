package projectstate

import "testing"

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
