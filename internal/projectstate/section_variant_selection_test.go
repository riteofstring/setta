package projectstate

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
)

func TestRuntimeSetSectionVariantUpdatesActiveVariantMap(t *testing.T) {
	t.Parallel()

	runtime := openSectionVariantSelectionTestRuntime(t)

	if _, err := runtime.SetSectionVariant(context.Background(), "project-alpha", "allowed-section", "allowed-variant-alt"); err != nil {
		t.Fatalf("SetSectionVariant returned error: %v", err)
	}

	project, err := runtime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after SetSectionVariant: %v", err)
	}
	if got := project.SectionVariantMap["allowed-section"]; got != "allowed-variant-alt" {
		t.Fatalf("expected allowed-section active variant to be updated, got %q", got)
	}
}

func TestRuntimeSetDefaultSectionVariantUpdatesSectionCore(t *testing.T) {
	t.Parallel()

	runtime := openSectionVariantSelectionTestRuntime(t)

	if _, err := runtime.SetDefaultSectionVariant(context.Background(), "project-alpha", "allowed-section", "allowed-variant-alt"); err != nil {
		t.Fatalf("SetDefaultSectionVariant returned error: %v", err)
	}

	project, err := runtime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after SetDefaultSectionVariant: %v", err)
	}
	if got := project.Sections["allowed-section"].DefaultVariantID; got != "allowed-variant-alt" {
		t.Fatalf("expected allowed-section default variant to be updated, got %q", got)
	}
}

func TestRuntimeSetSectionVariantRejectsVariantOutsideSection(t *testing.T) {
	t.Parallel()

	runtime := openSectionVariantSelectionTestRuntime(t)

	_, err := runtime.SetSectionVariant(context.Background(), "project-alpha", "allowed-section", "missing-variant")
	if !errors.Is(err, ErrSectionVariantMembership) {
		t.Fatalf("expected ErrSectionVariantMembership, got %v", err)
	}
}

func TestRuntimeSetSectionVariantSortOrderUpdatesVariantOrder(t *testing.T) {
	t.Parallel()

	runtime := openSectionVariantSelectionTestRuntime(t)

	if _, err := runtime.SetSectionVariantSortOrder(
		context.Background(),
		"project-alpha",
		"allowed-section",
		[]string{"allowed-variant-alt", "allowed-variant"},
	); err != nil {
		t.Fatalf("SetSectionVariantSortOrder returned error: %v", err)
	}

	project, err := runtime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after SetSectionVariantSortOrder: %v", err)
	}
	section := project.Sections["allowed-section"]
	if len(section.VariantIDs) != 2 {
		t.Fatalf("expected two section variants after reorder, got %#v", section.VariantIDs)
	}
	if section.VariantIDs[0] != "allowed-variant-alt" || section.VariantIDs[1] != "allowed-variant" {
		t.Fatalf("expected reordered variant ids, got %#v", section.VariantIDs)
	}
}

func TestRuntimeSetSectionVariantSortOrderRejectsDuplicateVariantIDs(t *testing.T) {
	t.Parallel()

	runtime := openSectionVariantSelectionTestRuntime(t)

	_, err := runtime.SetSectionVariantSortOrder(
		context.Background(),
		"project-alpha",
		"allowed-section",
		[]string{"allowed-variant", "allowed-variant"},
	)
	if !IsInvalidSectionVariantSortOrderError(err) {
		t.Fatalf("expected InvalidSectionVariantSortOrderError, got %v", err)
	}
}

func TestRuntimeSetSectionVariantSortOrderRejectsMissingSection(t *testing.T) {
	t.Parallel()

	runtime := openSectionVariantSelectionTestRuntime(t)

	_, err := runtime.SetSectionVariantSortOrder(
		context.Background(),
		"project-alpha",
		"missing-section",
		[]string{},
	)
	if !errors.Is(err, ErrSectionNotFound) {
		t.Fatalf("expected ErrSectionNotFound, got %v", err)
	}
}

func openSectionVariantSelectionTestRuntime(t *testing.T) *Runtime {
	t.Helper()

	project, err := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		TopLevelSectionIDs: []string{
			"allowed-section",
		},
		TopLevelSections: map[string]TopLevelSectionLayout{
			"allowed-section": {X: 10, Y: 20},
		},
		SectionVariantMap: map[string]string{
			"allowed-section": "allowed-variant",
		},
		Sections: map[string]Section{
			"allowed-section": {
				ID:               "allowed-section",
				Name:             "Allowed",
				VariantIDs:       []string{"allowed-variant", "allowed-variant-alt"},
				DefaultVariantID: "allowed-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"allowed-variant": {
				ID:     "allowed-variant",
				ImplID: "allowed-impl",
			},
			"allowed-variant-alt": {
				ID:     "allowed-variant-alt",
				ImplID: "allowed-impl-alt",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"allowed-impl": {
				ID:   "allowed-impl",
				Kind: SectionKindCode,
				Code: &CodeSectionImpl{
					Language: CodeLanguagePython,
				},
				Payload: mustSectionVariantSelectionRawJSON(t, map[string]any{
					"id":           "allowed-impl",
					"type":         "Code",
					"codeLanguage": "python",
					"code":         "print('allowed')\n",
					"children":     []any{},
				}),
			},
			"allowed-impl-alt": {
				ID:   "allowed-impl-alt",
				Kind: SectionKindCode,
				Code: &CodeSectionImpl{
					Language: CodeLanguagePython,
				},
				Payload: mustSectionVariantSelectionRawJSON(t, map[string]any{
					"id":           "allowed-impl-alt",
					"type":         "Code",
					"codeLanguage": "python",
					"code":         "print('allowed alt')\n",
					"children":     []any{},
				}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize section variant selection project: %v", err)
	}

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			project.ID: project,
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})
	return runtime
}

func mustSectionVariantSelectionRawJSON(t *testing.T, value any) RawJSON {
	t.Helper()

	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal raw json: %v", err)
	}
	return encoded
}
