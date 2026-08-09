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

func TestRuntimeSetSectionVariantPrunesAgenticEdgesThatLoseChatTarget(t *testing.T) {
	t.Parallel()

	project, err := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		TopLevelSectionIDs: []string{
			"chat-source",
			"chat-target",
		},
		TopLevelSections: map[string]TopLevelSectionLayout{
			"chat-source": {X: 10, Y: 10},
			"chat-target": {X: 20, Y: 20},
		},
		SectionVariantMap: map[string]string{
			"chat-source": "chat-source-variant",
			"chat-target": "chat-target-chat-variant",
		},
		AgenticEdges: []AgenticEdge{
			{
				ID:              "agentic-edge-1",
				SourceSectionID: "chat-source",
				TargetSectionID: "chat-target",
				Kind:            "chat_chat",
				ContextMode:     "reference_only",
			},
		},
		Sections: map[string]Section{
			"chat-source": {
				ID:               "chat-source",
				Name:             "Chat Source",
				VariantIDs:       []string{"chat-source-variant"},
				DefaultVariantID: "chat-source-variant",
			},
			"chat-target": {
				ID:               "chat-target",
				Name:             "Chat Target",
				VariantIDs:       []string{"chat-target-chat-variant", "chat-target-text-variant"},
				DefaultVariantID: "chat-target-chat-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"chat-source-variant":      {ID: "chat-source-variant", ImplID: "chat-source-impl"},
			"chat-target-chat-variant": {ID: "chat-target-chat-variant", ImplID: "chat-target-chat-impl"},
			"chat-target-text-variant": {ID: "chat-target-text-variant", ImplID: "chat-target-text-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"chat-source-impl": {
				ID:      "chat-source-impl",
				Kind:    SectionKind("chat"),
				Payload: mustSectionVariantSelectionRawJSON(t, map[string]any{"id": "chat-source-impl", "type": "Chat"}),
			},
			"chat-target-chat-impl": {
				ID:      "chat-target-chat-impl",
				Kind:    SectionKind("chat"),
				Payload: mustSectionVariantSelectionRawJSON(t, map[string]any{"id": "chat-target-chat-impl", "type": "Chat"}),
			},
			"chat-target-text-impl": {
				ID:      "chat-target-text-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustSectionVariantSelectionRawJSON(t, map[string]any{"id": "chat-target-text-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize agentic edge pruning project: %v", err)
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

	if _, err := runtime.SetSectionVariant(context.Background(), "project-alpha", "chat-target", "chat-target-text-variant"); err != nil {
		t.Fatalf("SetSectionVariant returned error: %v", err)
	}

	project, err = runtime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after SetSectionVariant: %v", err)
	}
	if got := project.SectionVariantMap["chat-target"]; got != "chat-target-text-variant" {
		t.Fatalf("expected chat-target active variant chat-target-text-variant, got %q", got)
	}
	if len(project.AgenticEdges) != 0 {
		t.Fatalf("expected invalid agentic edges to be pruned, got %#v", project.AgenticEdges)
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
