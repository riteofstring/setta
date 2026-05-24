package projectstate

import (
	"context"
	"errors"
	"testing"
)

func TestRuntimeSetCodeFileBindingUpdatesEffectivePayloadAndBinding(t *testing.T) {
	t.Parallel()

	for _, accessMode := range []CodeFileAccessMode{
		CodeFileAccessModeReadWrite,
		CodeFileAccessModeReadOnly,
		CodeFileAccessModeWriteOnly,
	} {
		snapshot := setCodeFileBindingForMode(t, accessMode)
		project := snapshot.Document.Projects["project-alpha"]
		assertEffectiveCodeFileBinding(t, project, accessMode)
		impl := assertSectionImplCodeFileBinding(t, project, accessMode)
		assertSerializedCodeFileBinding(t, impl, accessMode)
	}
}

func setCodeFileBindingForMode(t *testing.T, accessMode CodeFileAccessMode) Snapshot {
	t.Helper()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": codeFileBindingMutationTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime for %s: %v", accessMode, err)
	}

	snapshot, err := runtime.SetCodeFileBinding(
		context.Background(),
		"project-alpha",
		"code-section",
		CodeFileBinding{
			Path:       "./pkg/../pkg/" + string(accessMode) + ".py",
			AccessMode: accessMode,
		},
	)
	if closeErr := runtime.Close(); closeErr != nil {
		t.Fatalf("close overlay runtime for %s: %v", accessMode, closeErr)
	}
	if err != nil {
		t.Fatalf("SetCodeFileBinding returned error for %s: %v", accessMode, err)
	}
	return snapshot
}

func assertEffectiveCodeFileBinding(t *testing.T, project Project, accessMode CodeFileAccessMode) {
	t.Helper()

	payload, err := effectiveSectionPayload(project, "code-section", "code-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload code-section for %s: %v", accessMode, err)
	}
	rawBinding, ok := payloadObjectField(payload, "codeFileBinding")
	if !ok {
		t.Fatalf("expected codeFileBinding object for %s, got %#v", accessMode, payload["codeFileBinding"])
	}
	assertCodeFileBindingObject(t, rawBinding, accessMode, "")
}

func assertSectionImplCodeFileBinding(t *testing.T, project Project, accessMode CodeFileAccessMode) SectionImpl {
	t.Helper()

	_, _, impl, err := project.ResolveSection("code-section")
	if err != nil {
		t.Fatalf("resolve code section for %s: %v", accessMode, err)
	}
	if impl.Code == nil || impl.Code.Binding == nil {
		t.Fatalf("expected code binding to persist on section impl for %s, got %#v", accessMode, impl.Code)
	}
	if impl.Code.Binding.Path != "pkg/"+string(accessMode)+".py" {
		t.Fatalf("expected impl binding path pkg/%s.py, got %q", accessMode, impl.Code.Binding.Path)
	}
	if impl.Code.Binding.AccessMode != accessMode {
		t.Fatalf("expected impl binding access mode %s, got %q", accessMode, impl.Code.Binding.AccessMode)
	}
	return impl
}

func assertSerializedCodeFileBinding(t *testing.T, impl SectionImpl, accessMode CodeFileAccessMode) {
	t.Helper()

	serializedImplPayload, err := SectionImplPayload(impl)
	if err != nil {
		t.Fatalf("serialize section impl payload for %s: %v", accessMode, err)
	}
	serializedImplObject, err := rawObjectFromProjectPayload(serializedImplPayload)
	if err != nil {
		t.Fatalf("decode serialized section impl payload for %s: %v", accessMode, err)
	}
	serializedBinding, ok := payloadObjectField(serializedImplObject, "codeFileBinding")
	if !ok {
		t.Fatalf("expected serialized impl payload binding for %s, got %#v", accessMode, serializedImplObject["codeFileBinding"])
	}
	assertCodeFileBindingObject(t, serializedBinding, accessMode, "serialized impl ")
}

func assertCodeFileBindingObject(t *testing.T, binding map[string]any, accessMode CodeFileAccessMode, contextLabel string) {
	t.Helper()

	if binding["canonical_path"] != "pkg/"+string(accessMode)+".py" {
		t.Fatalf("expected %scanonical_path pkg/%s.py, got %#v", contextLabel, accessMode, binding["canonical_path"])
	}
	if binding["access_mode"] != string(accessMode) {
		t.Fatalf("expected %saccess_mode %s, got %#v", contextLabel, accessMode, binding["access_mode"])
	}
	if binding["autoBinding"] != false {
		t.Fatalf("expected %sautoBinding=false for %s, got %#v", contextLabel, accessMode, binding["autoBinding"])
	}
}

func TestRuntimeSetCodeFileBindingRejectsInvalidTargetsAndValues(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": codeFileBindingMutationTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	if _, err := runtime.SetCodeFileBinding(context.Background(), "project-alpha", "plain-section", CodeFileBinding{
		Path:       "pkg/plain.py",
		AccessMode: CodeFileAccessModeReadWrite,
	}); !errors.Is(err, ErrCodeSectionRequired) {
		t.Fatalf("expected ErrCodeSectionRequired, got %v", err)
	}

	if _, err := runtime.SetCodeFileBinding(context.Background(), "project-alpha", "code-section", CodeFileBinding{
		Path:       " ",
		AccessMode: CodeFileAccessModeReadWrite,
	}); !errors.Is(err, ErrCodeFileBindingPathRequired) {
		t.Fatalf("expected ErrCodeFileBindingPathRequired, got %v", err)
	}

	if _, err := runtime.SetCodeFileBinding(context.Background(), "project-alpha", "code-section", CodeFileBinding{
		Path:       "pkg/invalid.py",
		AccessMode: CodeFileAccessMode("execute"),
	}); !errors.Is(err, ErrCodeFileAccessModeInvalid) {
		t.Fatalf("expected ErrCodeFileAccessModeInvalid, got %v", err)
	}
}

func codeFileBindingMutationTestProject(t *testing.T) Project {
	t.Helper()

	project, err := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"code-section":  "code-variant",
			"plain-section": "plain-variant",
		},
		Sections: map[string]Section{
			"code-section": {
				ID:               "code-section",
				Name:             "Code Section",
				VariantIDs:       []string{"code-variant"},
				DefaultVariantID: "code-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain Section",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"code-variant": {
				ID:     "code-variant",
				ImplID: "code-impl",
			},
			"plain-variant": {
				ID:     "plain-variant",
				ImplID: "plain-impl",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"code-impl": {
				ID:   "code-impl",
				Kind: SectionKindCode,
				Payload: mustMarshalProjectObject(map[string]any{
					"id":           "code-impl",
					"type":         "Code",
					"code":         "print('hello')\n",
					"codeLanguage": "python",
					"children":     []any{},
				}),
				Code: &CodeSectionImpl{
					Language: CodeLanguagePython,
					Binding: &CodeFileBinding{
						Path:       "pkg/original.py",
						AccessMode: CodeFileAccessModeReadWrite,
					},
				},
			},
			"plain-impl": {
				ID:      "plain-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "plain-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize code file binding mutation project: %v", err)
	}
	return project
}
