package projectstate

import (
	"context"
	"errors"
	"path/filepath"
	"reflect"
	"sync/atomic"
	"testing"
)

// Plugin-only codegen target mutations should validate, persist, and return the saved runtime snapshot through the central save path.
func TestRuntimeSetProjectCodegenTargetsPersistsPluginOnlyTargets(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	if err := store.Save(context.Background(), codegenTargetsTestDocument()); err != nil {
		t.Fatalf("save initial document: %v", err)
	}

	savedSnapshots := 0
	runtime := openTestRuntimeWithOptions(t, store, RuntimeOptions{
		AfterSave: func(context.Context, Snapshot) error {
			savedSnapshots++
			return nil
		},
	})

	validatedTargets := make([]string, 0, 2)
	snapshot, err := runtime.SetProjectCodegenTargets(context.Background(), "project-alpha", []ProjectCodegenTarget{
		{
			Language: "setta-fixture-backend-codegen:typescript",
			Payload:  RawJSON(`{"language":"setta-fixture-backend-codegen:typescript","options":{"className":"AlphaState"}}`),
		},
		{
			Language: "setta-fixture-backend-codegen:go",
			Payload:  RawJSON(`{"language":"setta-fixture-backend-codegen:go"}`),
		},
	}, CodegenTargetValidatorFunc(func(_ context.Context, target ProjectCodegenTarget) error {
		validatedTargets = append(validatedTargets, target.Language)
		return nil
	}))
	if err != nil {
		t.Fatalf("set project codegen targets: %v", err)
	}

	if snapshot.Revision != 2 {
		t.Fatalf("expected revision 2 after persisted mutation, got %d", snapshot.Revision)
	}
	if savedSnapshots != 1 {
		t.Fatalf("expected one after-save call, got %d", savedSnapshots)
	}
	if !reflect.DeepEqual(validatedTargets, []string{
		"setta-fixture-backend-codegen:typescript",
		"setta-fixture-backend-codegen:go",
	}) {
		t.Fatalf("unexpected validated targets: %#v", validatedTargets)
	}

	loaded, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted document: %v", err)
	}
	project := loaded.Projects["project-alpha"]
	if len(project.CodegenTargets) != 2 {
		t.Fatalf("expected two persisted targets, got %d", len(project.CodegenTargets))
	}
	if project.CodegenTargets[0].Language != "setta-fixture-backend-codegen:typescript" {
		t.Fatalf("unexpected first target: %#v", project.CodegenTargets[0])
	}
}

// Duplicate languages should fail before any save or plugin validation work runs.
func TestRuntimeSetProjectCodegenTargetsRejectsDuplicateLanguages(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	if err := store.Save(context.Background(), codegenTargetsTestDocument()); err != nil {
		t.Fatalf("save initial document: %v", err)
	}
	runtime := openTestRuntime(t, store)
	validatorCalled := &atomic.Bool{}

	_, err := runtime.SetProjectCodegenTargets(context.Background(), "project-alpha", []ProjectCodegenTarget{
		{Language: "setta-fixture-backend-codegen:typescript"},
		{Language: "setta-fixture-backend-codegen:typescript"},
	}, CodegenTargetValidatorFunc(func(context.Context, ProjectCodegenTarget) error {
		validatorCalled.Store(true)
		return nil
	}))
	if !errors.Is(err, ErrProjectCodegenTargetDuplicateLanguage) {
		t.Fatalf("expected duplicate-language error, got %v", err)
	}
	if validatorCalled.Load() {
		t.Fatal("validator should not run for duplicate targets")
	}
}

// Plugin targets require an explicit validator instead of silently accepting unvalidated plugin ids.
func TestRuntimeSetProjectCodegenTargetsRequiresValidatorForPluginTargets(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	if err := store.Save(context.Background(), codegenTargetsTestDocument()); err != nil {
		t.Fatalf("save initial document: %v", err)
	}
	runtime := openTestRuntime(t, store)

	_, err := runtime.SetProjectCodegenTargets(context.Background(), "project-alpha", []ProjectCodegenTarget{
		{Language: "setta-fixture-backend-codegen:typescript"},
	}, nil)
	if !errors.Is(err, ErrProjectCodegenTargetValidatorRequired) {
		t.Fatalf("expected validator-required error, got %v", err)
	}
}

// Validator failures should fail the mutation before any state is persisted.
func TestRuntimeSetProjectCodegenTargetsPropagatesValidatorFailure(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	initial := codegenTargetsTestDocument()
	if err := store.Save(context.Background(), initial); err != nil {
		t.Fatalf("save initial document: %v", err)
	}
	runtime := openTestRuntime(t, store)

	_, err := runtime.SetProjectCodegenTargets(context.Background(), "project-alpha", []ProjectCodegenTarget{
		{Language: "setta-fixture-backend-codegen:typescript"},
	}, CodegenTargetValidatorFunc(func(context.Context, ProjectCodegenTarget) error {
		return errors.New("plugin target invalid")
	}))
	if err == nil || err.Error() != "plugin target invalid" {
		t.Fatalf("expected validator error, got %v", err)
	}

	loaded, loadErr := store.Load(context.Background())
	if loadErr != nil {
		t.Fatalf("load persisted document: %v", loadErr)
	}
	if !reflect.DeepEqual(initial, loaded) {
		t.Fatalf("expected persisted document to stay unchanged, got %#v", loaded)
	}
}

// Removing the Python target should clear generated bindings and delete generated sections instead of leaving stale runtime state behind.
func TestRuntimeSetProjectCodegenTargetsDisablesPythonTargetAndCleansUpGeneratedState(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	document := codegenTargetsTestDocument()
	document.Projects["project-alpha"] = projectWithGeneratedPythonCodegenState()
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}
	runtime := openTestRuntime(t, store)

	snapshot, err := runtime.SetProjectCodegenTargets(context.Background(), "project-alpha", nil, nil)
	if err != nil {
		t.Fatalf("disable python codegen target: %v", err)
	}
	if snapshot.Revision != 2 {
		t.Fatalf("expected revision 2, got %d", snapshot.Revision)
	}

	project := snapshot.Document.Projects["project-alpha"]
	if len(project.CodegenTargets) != 0 {
		t.Fatalf("expected python codegen target to be removed, got %#v", project.CodegenTargets)
	}
	if project.GeneratedCodeBinding != nil {
		t.Fatalf("expected generated code binding to be cleared, got %#v", project.GeneratedCodeBinding)
	}
	if project.GeneratedMetadataBinding != nil {
		t.Fatalf("expected generated metadata binding to be cleared, got %#v", project.GeneratedMetadataBinding)
	}
	if project.EntryCodeBlockID != "" {
		t.Fatalf("expected entry code block id to be cleared, got %q", project.EntryCodeBlockID)
	}
	if _, ok := project.Sections["gen-python-section"]; ok {
		t.Fatal("expected generated python section to be removed")
	}
	if _, ok := project.Sections["gen-python-metadata-section"]; ok {
		t.Fatal("expected generated python metadata section to be removed")
	}
	if !reflect.DeepEqual(project.TopLevelSectionIDs, []string{"manual-section"}) {
		t.Fatalf("expected only manual section to remain top-level, got %#v", project.TopLevelSectionIDs)
	}
	if !reflect.DeepEqual(project.ActiveIDs, []string{"manual-section"}) {
		t.Fatalf("expected only manual section to remain active, got %#v", project.ActiveIDs)
	}
	if _, ok := project.ViewModes["focus"].VisibilityBySectionID["gen-python-section"]; ok {
		t.Fatal("expected generated python section visibility to be removed from view mode")
	}
	if _, ok := project.ViewModes["focus"].TopLevelSections["gen-python-section"]; ok {
		t.Fatal("expected generated python section layout to be removed from view mode")
	}
}

// Python target enablement and in-place edits should still fail explicitly until Go owns the missing generator/runtime work behind them.
func TestRuntimeSetProjectCodegenTargetsRejectsPythonTargetMutation(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	document := codegenTargetsTestDocument()
	document.Projects["project-alpha"] = projectWithPythonCodegenTarget()
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}
	runtime := openTestRuntime(t, store)
	validatorCalled := &atomic.Bool{}

	_, err := runtime.SetProjectCodegenTargets(context.Background(), "project-alpha", []ProjectCodegenTarget{
		{
			Language: string(CodeLanguagePython),
			Payload:  RawJSON(`{"language":"python","generateMetadata":false}`),
		},
	}, CodegenTargetValidatorFunc(func(context.Context, ProjectCodegenTarget) error {
		validatorCalled.Store(true)
		return nil
	}))
	if !errors.Is(err, ErrProjectCodegenPythonMutationUnsupported) {
		t.Fatalf("expected python-mutation-unsupported error, got %v", err)
	}
	if validatorCalled.Load() {
		t.Fatal("validator should not run for python target mutation")
	}
}

// Plugin target changes should remain allowed when the existing Python target is carried through unchanged.
func TestRuntimeSetProjectCodegenTargetsAllowsPluginMutationWithUnchangedPythonTarget(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	document := codegenTargetsTestDocument()
	document.Projects["project-alpha"] = projectWithPythonCodegenTarget()
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}
	runtime := openTestRuntime(t, store)

	pythonTarget := document.Projects["project-alpha"].CodegenTargets[0].Clone()
	snapshot, err := runtime.SetProjectCodegenTargets(context.Background(), "project-alpha", []ProjectCodegenTarget{
		pythonTarget,
		{
			Language: "setta-fixture-backend-codegen:typescript",
			Payload:  RawJSON(`{"language":"setta-fixture-backend-codegen:typescript"}`),
		},
	}, CodegenTargetValidatorFunc(func(context.Context, ProjectCodegenTarget) error {
		return nil
	}))
	if err != nil {
		t.Fatalf("set mixed codegen targets: %v", err)
	}
	if snapshot.Revision != 2 {
		t.Fatalf("expected revision 2, got %d", snapshot.Revision)
	}
}

func codegenTargetsTestDocument() Document {
	return Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}
}

func projectWithPythonCodegenTarget() Project {
	return Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []ProjectCodegenTarget{
			{
				Language: string(CodeLanguagePython),
				Payload:  RawJSON(`{"language":"python","generateMetadata":true}`),
			},
		},
	}
}

func projectWithGeneratedPythonCodegenState() Project {
	return Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []ProjectCodegenTarget{
			{
				Language: string(CodeLanguagePython),
				Payload:  RawJSON(`{"language":"python","generateMetadata":true}`),
			},
		},
		GeneratedCodeBinding: &CodeFileBinding{
			Path:       "code/sections/alpha/setta_gen.py",
			AccessMode: CodeFileAccessModeReadOnly,
		},
		GeneratedMetadataBinding: &CodeFileBinding{
			Path:       "code/sections/alpha/setta_gen_meta.py",
			AccessMode: CodeFileAccessModeReadOnly,
		},
		EntryCodeBlockID:   "gen-python-section",
		TopLevelSectionIDs: []string{"manual-section", "gen-python-section", "gen-python-metadata-section"},
		TopLevelSections: map[string]TopLevelSectionLayout{
			"manual-section":              {X: 10, Y: 20},
			"gen-python-section":          {X: 30, Y: 40},
			"gen-python-metadata-section": {X: 50, Y: 60},
		},
		SectionVariantMap: map[string]string{
			"manual-section":              "manual-variant",
			"gen-python-section":          "gen-python-variant",
			"gen-python-metadata-section": "gen-python-metadata-variant",
		},
		ActiveIDs: []string{"manual-section", "gen-python-section"},
		ViewModes: map[string]ViewMode{
			"focus": {
				ID: "focus",
				VisibilityBySectionID: map[string]bool{
					"manual-section":              true,
					"gen-python-section":          true,
					"gen-python-metadata-section": true,
				},
				TopLevelSections: map[string]TopLevelSectionLayout{
					"manual-section":              {X: 10, Y: 20},
					"gen-python-section":          {X: 30, Y: 40},
					"gen-python-metadata-section": {X: 50, Y: 60},
				},
			},
		},
		Sections: map[string]Section{
			"manual-section": {
				ID:               "manual-section",
				Name:             "Manual",
				VariantIDs:       []string{"manual-variant"},
				DefaultVariantID: "manual-variant",
			},
			"gen-python-section": {
				ID:               "gen-python-section",
				Name:             "Generated Python",
				VariantIDs:       []string{"gen-python-variant"},
				DefaultVariantID: "gen-python-variant",
			},
			"gen-python-metadata-section": {
				ID:               "gen-python-metadata-section",
				Name:             "Generated Python Metadata",
				VariantIDs:       []string{"gen-python-metadata-variant"},
				DefaultVariantID: "gen-python-metadata-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"manual-variant": {
				ID:     "manual-variant",
				ImplID: "manual-impl",
			},
			"gen-python-variant": {
				ID:     "gen-python-variant",
				ImplID: "gen-python-impl",
			},
			"gen-python-metadata-variant": {
				ID:     "gen-python-metadata-variant",
				ImplID: "gen-python-metadata-impl",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"manual-impl": {
				ID:   "manual-impl",
				Kind: SectionKindCode,
				Code: &CodeSectionImpl{
					Language: CodeLanguagePython,
				},
			},
			"gen-python-impl": {
				ID:   "gen-python-impl",
				Kind: SectionKindGenerated,
				Generated: &GeneratedSectionImpl{
					Kind: GeneratedSectionKindPythonCode,
				},
			},
			"gen-python-metadata-impl": {
				ID:   "gen-python-metadata-impl",
				Kind: SectionKindGenerated,
				Generated: &GeneratedSectionImpl{
					Kind: GeneratedSectionKindPythonMetadata,
				},
			},
		},
	}
}
