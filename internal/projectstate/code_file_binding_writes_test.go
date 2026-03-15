package projectstate

import (
	"context"
	"errors"
	"testing"
)

func TestRuntimeSetCodeFileBindingUpdatesEffectivePayloadAndBinding(t *testing.T) {
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

	snapshot, err := runtime.SetCodeFileBinding(
		context.Background(),
		"project-alpha",
		"code-section",
		CodeFileBinding{
			Path:       "./pkg/../pkg/updated.py",
			AccessMode: CodeFileAccessModeReadOnly,
		},
	)
	if err != nil {
		t.Fatalf("SetCodeFileBinding returned error: %v", err)
	}

	project := snapshot.Document.Projects["project-alpha"]
	payload, err := effectiveSectionPayload(project, "code-section", "code-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload code-section: %v", err)
	}

	rawBinding, ok := payloadObjectField(payload, "codeFileBinding")
	if !ok {
		t.Fatalf("expected codeFileBinding object, got %#v", payload["codeFileBinding"])
	}
	if rawBinding["canonical_path"] != "pkg/updated.py" {
		t.Fatalf("expected canonical_path pkg/updated.py, got %#v", rawBinding["canonical_path"])
	}
	if rawBinding["access_mode"] != string(CodeFileAccessModeReadOnly) {
		t.Fatalf("expected access_mode read_only, got %#v", rawBinding["access_mode"])
	}
	if rawBinding["autoBinding"] != false {
		t.Fatalf("expected autoBinding=false, got %#v", rawBinding["autoBinding"])
	}

	_, _, impl, err := project.ResolveSection("code-section")
	if err != nil {
		t.Fatalf("resolve code section: %v", err)
	}
	if impl.Code == nil || impl.Code.Binding == nil {
		t.Fatalf("expected code binding to persist on section impl, got %#v", impl.Code)
	}
	if impl.Code.Binding.Path != "pkg/updated.py" {
		t.Fatalf("expected impl binding path pkg/updated.py, got %q", impl.Code.Binding.Path)
	}
	if impl.Code.Binding.AccessMode != CodeFileAccessModeReadOnly {
		t.Fatalf("expected impl binding access mode read_only, got %q", impl.Code.Binding.AccessMode)
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
