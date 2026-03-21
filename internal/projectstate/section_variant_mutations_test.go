package projectstate

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestRuntimeSetSectionVariantNameUpdatesVariantMetadata(t *testing.T) {
	t.Parallel()

	runtime := openSectionVariantMutationTestRuntime(t, true)

	if _, err := runtime.SetSectionVariantName(context.Background(), "project-alpha", "dict-variant", "source.json"); err != nil {
		t.Fatalf("SetSectionVariantName returned error: %v", err)
	}

	project, err := runtime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after SetSectionVariantName: %v", err)
	}
	if got := project.SectionVariants["dict-variant"].Name; got != "source.json" {
		t.Fatalf("expected dict-variant name source.json, got %q", got)
	}
}

func TestRuntimeToggleVariantFrozenFlipsFrozenFlag(t *testing.T) {
	t.Parallel()

	runtime := openSectionVariantMutationTestRuntime(t, true)

	if _, err := runtime.ToggleVariantFrozen(context.Background(), "project-alpha", "dict-variant"); err != nil {
		t.Fatalf("ToggleVariantFrozen returned error: %v", err)
	}

	project, err := runtime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after ToggleVariantFrozen: %v", err)
	}
	if !project.SectionVariants["dict-variant"].IsFrozen {
		t.Fatal("expected dict-variant to be frozen after toggle")
	}
}

func TestRuntimeToggleVariantJSONSourceUpdatesDictPayload(t *testing.T) {
	t.Parallel()

	runtime := openSectionVariantMutationTestRuntime(t, true)

	if _, err := runtime.ToggleVariantJSONSource(context.Background(), "project-alpha", "dict-section", "dict-variant"); err != nil {
		t.Fatalf("ToggleVariantJSONSource returned error: %v", err)
	}

	project, err := runtime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after ToggleVariantJSONSource: %v", err)
	}
	payload, err := project.EffectiveSectionPayload("dict-section", "dict-variant")
	if err != nil {
		t.Fatalf("effective section payload after ToggleVariantJSONSource: %v", err)
	}
	if !payloadBoolField(payload, "isJsonSource") {
		t.Fatal("expected dict-section payload to enable json source")
	}
	if got := payloadStringField(payload, "configLanguage"); got != "json" {
		t.Fatalf("expected configLanguage json after toggle, got %q", got)
	}
}

func TestRuntimeSetVariantJSONSourceKeysStoresNormalizedKeys(t *testing.T) {
	t.Parallel()

	runtime := openSectionVariantMutationTestRuntime(t, true)

	if _, err := runtime.SetVariantJSONSourceKeys(
		context.Background(),
		"project-alpha",
		"dict-section",
		"dict-variant",
		[]string{" config ", "", "nested"},
	); err != nil {
		t.Fatalf("SetVariantJSONSourceKeys returned error: %v", err)
	}

	project, err := runtime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after SetVariantJSONSourceKeys: %v", err)
	}
	payload, err := project.EffectiveSectionPayload("dict-section", "dict-variant")
	if err != nil {
		t.Fatalf("effective section payload after SetVariantJSONSourceKeys: %v", err)
	}
	if got := payloadStringArrayField(payload, "jsonSourceKeys"); len(got) != 2 || got[0] != "config" || got[1] != "nested" {
		t.Fatalf("expected normalized jsonSourceKeys [config nested], got %#v", got)
	}
}

func TestRuntimeSetVariantJSONSourceKeysRejectsDisabledEdits(t *testing.T) {
	t.Parallel()

	runtime := openSectionVariantMutationTestRuntime(t, false)

	_, err := runtime.SetVariantJSONSourceKeys(
		context.Background(),
		"project-alpha",
		"dict-section",
		"dict-variant",
		[]string{"config"},
	)
	if !errors.Is(err, ErrJSONSourceKeyEditsDisabled) {
		t.Fatalf("expected ErrJSONSourceKeyEditsDisabled, got %v", err)
	}
}

func TestValidateVariantJSONSourceKeysRejectsMissingExistingPath(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(workspaceRoot, "data"), 0o755); err != nil {
		t.Fatalf("mkdir data: %v", err)
	}
	if err := os.WriteFile(filepath.Join(workspaceRoot, "data", "source.json"), []byte("{\"config\":{\"nested\":{}},\"leaf\":1}\n"), 0o644); err != nil {
		t.Fatalf("write json source payload: %v", err)
	}

	document := sectionVariantMutationTestDocument(t, true, "data/source.json")
	_, err := ValidateVariantJSONSourceKeys(
		document,
		workspaceRoot,
		"project-alpha",
		"dict-section",
		"dict-variant",
		[]string{"missing"},
	)
	if !errors.Is(err, ErrJSONSourceKeysPathNotFound) {
		t.Fatalf("expected ErrJSONSourceKeysPathNotFound, got %v", err)
	}
	if got := err.Error(); got != "jsonSourceKeys path not found: missing" {
		t.Fatalf("expected missing-path detail, got %q", got)
	}
}

func TestValidateVariantJSONSourceKeysAcceptsMissingFileAndMarksMissing(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	document := sectionVariantMutationTestDocument(t, true, "data/source.json")

	validation, err := ValidateVariantJSONSourceKeys(
		document,
		workspaceRoot,
		"project-alpha",
		"dict-section",
		"dict-variant",
		[]string{" config ", "", "nested"},
	)
	if err != nil {
		t.Fatalf("ValidateVariantJSONSourceKeys returned error: %v", err)
	}
	if !validation.JSONSourceMissing {
		t.Fatal("expected missing json source file to mark jsonSourceMissing")
	}
	if len(validation.JSONSourceKeys) != 2 || validation.JSONSourceKeys[0] != "config" || validation.JSONSourceKeys[1] != "nested" {
		t.Fatalf("expected normalized jsonSourceKeys [config nested], got %#v", validation.JSONSourceKeys)
	}
}

func TestRuntimeToggleVariantJSONSourceRejectsNonDictSection(t *testing.T) {
	t.Parallel()

	runtime := openSectionVariantMutationTestRuntime(t, true)

	_, err := runtime.ToggleVariantJSONSource(context.Background(), "project-alpha", "code-section", "code-variant")
	if !errors.Is(err, ErrSectionVariantDictSectionRequired) {
		t.Fatalf("expected ErrSectionVariantDictSectionRequired, got %v", err)
	}
}

func openSectionVariantMutationTestRuntime(t *testing.T, allowJSONSourceKeyEdits bool) *Runtime {
	t.Helper()

	document := sectionVariantMutationTestDocument(t, allowJSONSourceKeyEdits, "")
	runtime, err := OpenOverlayRuntime(document)
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

func sectionVariantMutationTestDocument(t *testing.T, allowJSONSourceKeyEdits bool, dictVariantName string) Document {
	t.Helper()

	project, err := Project{
		ID:                      "project-alpha",
		Name:                    "Alpha",
		AllowJSONSourceKeyEdits: allowJSONSourceKeyEdits,
		SectionVariantMap: map[string]string{
			"dict-section": "dict-variant",
			"code-section": "code-variant",
		},
		Sections: map[string]Section{
			"dict-section": {
				ID:               "dict-section",
				Name:             "Dict Section",
				VariantIDs:       []string{"dict-variant"},
				DefaultVariantID: "dict-variant",
			},
			"code-section": {
				ID:               "code-section",
				Name:             "Code Section",
				VariantIDs:       []string{"code-variant"},
				DefaultVariantID: "code-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"dict-variant": {
				ID:     "dict-variant",
				ImplID: "dict-impl",
				Name:   dictVariantName,
			},
			"code-variant": {
				ID:     "code-variant",
				ImplID: "code-impl",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"dict-impl": {
				ID:   "dict-impl",
				Kind: SectionKind("frontend"),
				Payload: mustSectionVariantMutationRawJSON(t, map[string]any{
					"id":             "dict-impl",
					"type":           "Dict",
					"isJsonSource":   false,
					"configLanguage": "python",
					"jsonSourceKeys": []string{},
				}),
			},
			"code-impl": {
				ID:   "code-impl",
				Kind: SectionKindCode,
				Code: &CodeSectionImpl{
					Language: CodeLanguagePython,
				},
				Payload: mustSectionVariantMutationRawJSON(t, map[string]any{
					"id":           "code-impl",
					"type":         "Code",
					"codeLanguage": "python",
					"children":     []string{},
				}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize section variant mutation project: %v", err)
	}

	return Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			project.ID: project,
		},
	}
}

func mustSectionVariantMutationRawJSON(t *testing.T, value any) RawJSON {
	t.Helper()
	return mustMarshalProjectObject(value.(map[string]any))
}
