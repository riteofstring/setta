package projectstate

import (
	"context"
	"errors"
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

func mustSectionVariantMutationRawJSON(t *testing.T, value any) RawJSON {
	t.Helper()
	return mustMarshalProjectObject(value.(map[string]any))
}
