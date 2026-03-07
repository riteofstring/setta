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

// Python target changes should fail explicitly until Go owns the generated-section side effects that accompany them.
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
