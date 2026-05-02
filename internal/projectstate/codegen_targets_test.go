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
	}), nil)
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
	}), nil)
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
	}, nil, nil)
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
	}), nil)
	if err == nil || err.Error() != "plugin target invalid" {
		t.Fatalf("expected validator error, got %v", err)
	}

	loaded, loadErr := store.Load(context.Background())
	if loadErr != nil {
		t.Fatalf("load persisted document: %v", loadErr)
	}
	expected, err := initial.Normalized()
	if err != nil {
		t.Fatalf("normalize initial document: %v", err)
	}
	if !documentsEqualForRuntimeState(expected, loaded) {
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

	snapshot, err := runtime.SetProjectCodegenTargets(context.Background(), "project-alpha", nil, nil, nil)
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

func TestRemoveSectionsKeepsSharedImplsReferencedByRemainingSections(t *testing.T) {
	t.Parallel()

	project := Project{
		ID:               "project-alpha",
		Name:             "Alpha",
		EntryCodeBlockID: "section-a",
		TopLevelSectionIDs: []string{
			"section-a",
			"section-b",
		},
		TopLevelSections: map[string]TopLevelSectionLayout{
			"section-a": {},
			"section-b": {},
		},
		SectionVariantMap: map[string]string{
			"section-a": "variant-a",
			"section-b": "variant-b",
		},
		ActiveIDs: []string{
			"section-a",
			"section-b",
		},
		ViewModes: map[string]ViewMode{
			"focus": {
				ID: "focus",
				VisibilityBySectionID: map[string]bool{
					"section-a": true,
					"section-b": true,
				},
				TopLevelSections: map[string]TopLevelSectionLayout{
					"section-a": {},
					"section-b": {},
				},
			},
		},
		Sections: map[string]Section{
			"section-a": {
				ID:               "section-a",
				Name:             "Section A",
				VariantIDs:       []string{"variant-a"},
				DefaultVariantID: "variant-a",
			},
			"section-b": {
				ID:               "section-b",
				Name:             "Section B",
				VariantIDs:       []string{"variant-b"},
				DefaultVariantID: "variant-b",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"variant-a": {
				ID:     "variant-a",
				ImplID: "shared-impl",
			},
			"variant-b": {
				ID:     "variant-b",
				ImplID: "shared-impl",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"shared-impl": {
				ID:   "shared-impl",
				Kind: SectionKindCode,
				Code: &CodeSectionImpl{
					Language: CodeLanguagePython,
				},
			},
		},
	}

	RemoveSections(&project, []string{" section-a ", "", "section-a"})

	if project.EntryCodeBlockID != "" {
		t.Fatalf("expected entry code block id to clear, got %q", project.EntryCodeBlockID)
	}
	if !reflect.DeepEqual(project.TopLevelSectionIDs, []string{"section-b"}) {
		t.Fatalf("expected only section-b to remain top-level, got %#v", project.TopLevelSectionIDs)
	}
	if !reflect.DeepEqual(project.ActiveIDs, []string{"section-b"}) {
		t.Fatalf("expected only section-b to remain active, got %#v", project.ActiveIDs)
	}
	if _, ok := project.Sections["section-a"]; ok {
		t.Fatal("expected removed section to be deleted")
	}
	if _, ok := project.SectionVariants["variant-a"]; ok {
		t.Fatal("expected removed section variant to be deleted")
	}
	if _, ok := project.SectionImpls["shared-impl"]; !ok {
		t.Fatal("expected shared impl to remain because section-b still references it")
	}
	if got := project.SectionVariantMap["section-b"]; got != "variant-b" {
		t.Fatalf("expected remaining section variant mapping to stay intact, got %q", got)
	}
	viewMode := project.ViewModes["focus"]
	if _, ok := viewMode.VisibilityBySectionID["section-a"]; ok {
		t.Fatal("expected removed section visibility to be cleared from view mode")
	}
	if _, ok := viewMode.TopLevelSections["section-a"]; ok {
		t.Fatal("expected removed section layout to be cleared from view mode")
	}
	if !viewMode.VisibilityBySectionID["section-b"] {
		t.Fatal("expected remaining section visibility to stay intact")
	}
}

// Python target edits now require an explicit generated-section reconciler because the mutation path must update singleton sections and bindings together.
func TestRuntimeSetProjectCodegenTargetsRequiresReconcilerForPythonMutation(t *testing.T) {
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
	}), nil)
	if !errors.Is(err, ErrProjectCodegenPythonReconcilerRequired) {
		t.Fatalf("expected python-reconciler-required error, got %v", err)
	}
	if validatorCalled.Load() {
		t.Fatal("validator should not run for python target mutation")
	}
}

// Python target enablement should update bindings and generated singleton sections from the active target state.
func TestRuntimeSetProjectCodegenTargetsEnablesPythonTargetWithReconciledGeneratedSections(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	document := codegenTargetsTestDocument()
	document.Projects["project-alpha"] = projectWithPythonMutationFixtures()
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}
	runtime := openTestRuntime(t, store)

	snapshot, err := runtime.SetProjectCodegenTargets(context.Background(), "project-alpha", []ProjectCodegenTarget{
		{
			Language: string(CodeLanguagePython),
			Payload: RawJSON(`{
				"language":"python",
				"genCodePrefix":"import math",
				"generateMetadata":true
			}`),
		},
	}, nil, testPythonGeneratedSectionReconciler())
	if err != nil {
		t.Fatalf("enable python codegen target: %v", err)
	}

	project := snapshot.Document.Projects["project-alpha"]
	if project.GeneratedCodeBinding == nil {
		t.Fatal("expected generated code binding")
	}
	if project.GeneratedCodeBinding.Path != GeneratedPythonCodeRelativePath(project.Name) {
		t.Fatalf("unexpected generated code binding path %q", project.GeneratedCodeBinding.Path)
	}
	if project.GeneratedMetadataBinding == nil {
		t.Fatal("expected generated metadata binding")
	}
	if got := project.SectionVariantMap[GeneratedPythonCodeSectionID]; got != GeneratedPythonCodeVariantID {
		t.Fatalf("expected generated python section variant %q, got %q", GeneratedPythonCodeVariantID, got)
	}
	if got := project.SectionVariantMap[GeneratedPythonMetadataSectionID]; got != GeneratedPythonMetadataVariantID {
		t.Fatalf("expected generated python metadata variant %q, got %q", GeneratedPythonMetadataVariantID, got)
	}
	if !reflect.DeepEqual(project.Sections[GeneratedPythonCodeSectionID].VariantIDs, []string{GeneratedPythonCodeVariantID}) {
		t.Fatalf("expected generated python section variants to be canonical, got %#v", project.Sections[GeneratedPythonCodeSectionID].VariantIDs)
	}
	if !containsTopLevelSectionID(project.TopLevelSectionIDs, GeneratedPythonCodeSectionID) {
		t.Fatalf("expected generated python section to be top-level, got %#v", project.TopLevelSectionIDs)
	}
	if !project.ViewModes["focus"].VisibilityBySectionID[GeneratedPythonCodeSectionID] {
		t.Fatal("expected generated python section to be visible in view mode")
	}
	if _, ok := project.ViewModes["focus"].TopLevelSections[GeneratedPythonMetadataSectionID]; !ok {
		t.Fatal("expected generated python metadata layout in view mode")
	}

	codeImpl := project.SectionImpls[GeneratedPythonCodeImplID]
	if codeImpl.Generated == nil || codeImpl.Generated.Kind != GeneratedSectionKindPythonCode {
		t.Fatalf("expected generated python code impl, got %#v", codeImpl.Generated)
	}
	if string(codeImpl.Payload) != `{"code":"python|import math|meta=true","codeFileBinding":{"access_mode":"write_only","autoBinding":false,"canonical_path":"code/sections/alpha/setta_gen.py"},"id":"gen-python-impl","type":"GenPythonCode"}` {
		t.Fatalf("unexpected generated python payload %q", string(codeImpl.Payload))
	}
}

// Live python-target mutations should preserve Chart section-policy selections
// even though the dependency graph still has no Chart exporter.
func TestRuntimeSetProjectCodegenTargetsPersistsChartSectionPolicy(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	document := codegenTargetsTestDocument()
	document.Projects["project-alpha"] = projectWithPythonMutationFixtures()
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}
	runtime := openTestRuntime(t, store)

	snapshot, err := runtime.SetProjectCodegenTargets(context.Background(), "project-alpha", []ProjectCodegenTarget{
		{
			Language: string(CodeLanguagePython),
			Payload: RawJSON(`{
				"language":"python",
				"sectionPolicy":{
					"typePolicies":{
						"Chart":{"mode":"include","representation":"file_path"}
					}
				}
			}`),
		},
	}, nil, testPythonGeneratedSectionReconciler())
	if err != nil {
		t.Fatalf("set python codegen target with chart policy: %v", err)
	}

	project := snapshot.Document.Projects["project-alpha"]
	target, ok, err := project.PythonCodegenTarget()
	if err != nil {
		t.Fatalf("decode persisted python codegen target: %v", err)
	}
	if !ok {
		t.Fatal("expected persisted python codegen target")
	}
	policy, err := target.DecodedSectionPolicy()
	if err != nil {
		t.Fatalf("decode persisted section policy: %v", err)
	}
	chartPolicy, ok := policy.TypePolicies["Chart"]
	if !ok {
		t.Fatalf("expected persisted Chart section policy, got %#v", policy.TypePolicies)
	}
	if chartPolicy.Mode != PythonSectionCodegenModeInclude {
		t.Fatalf("expected Chart policy mode include, got %q", chartPolicy.Mode)
	}
	if chartPolicy.Representation != PythonSectionRepresentationFilePath {
		t.Fatalf("expected Chart policy representation file_path, got %q", chartPolicy.Representation)
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
	}), nil)
	if err != nil {
		t.Fatalf("set mixed codegen targets: %v", err)
	}
	if snapshot.Revision != 2 {
		t.Fatalf("expected revision 2, got %d", snapshot.Revision)
	}
	project := snapshot.Document.Projects["project-alpha"]
	if project.GeneratedCodeBinding == nil {
		t.Fatal("expected canonical generated code binding to be reconciled")
	}
	if project.GeneratedCodeBinding.Path != "code/sections/alpha/setta_gen.py" {
		t.Fatalf("unexpected generated code binding path %q", project.GeneratedCodeBinding.Path)
	}
	if project.GeneratedCodeBinding.AccessMode != CodeFileAccessModeWriteOnly {
		t.Fatalf("expected generated code binding to be write_only, got %q", project.GeneratedCodeBinding.AccessMode)
	}
	if project.GeneratedMetadataBinding == nil {
		t.Fatal("expected canonical generated metadata binding to be reconciled")
	}
	if project.GeneratedMetadataBinding.Path != "code/sections/alpha/setta_gen_meta.py" {
		t.Fatalf("unexpected generated metadata binding path %q", project.GeneratedMetadataBinding.Path)
	}
	if project.GeneratedMetadataBinding.AccessMode != CodeFileAccessModeWriteOnly {
		t.Fatalf("expected generated metadata binding to be write_only, got %q", project.GeneratedMetadataBinding.AccessMode)
	}
}

// Semantically unchanged Python targets should remain accepted even when one side relies on defaults instead of an explicit raw payload shape.
func TestRuntimeSetProjectCodegenTargetsTreatsDefaultedPythonPayloadAsUnchanged(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	document := codegenTargetsTestDocument()
	document.Projects["project-alpha"] = Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []ProjectCodegenTarget{
			{
				Language: string(CodeLanguagePython),
			},
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}
	runtime := openTestRuntime(t, store)

	_, err := runtime.SetProjectCodegenTargets(context.Background(), "project-alpha", []ProjectCodegenTarget{
		{
			Language: string(CodeLanguagePython),
			Payload: RawJSON(`{
				"language":"python",
				"sectionPolicy":{},
				"codeObjValuePolicy":{}
			}`),
		},
		{
			Language: "setta-fixture-backend-codegen:typescript",
			Payload:  RawJSON(`{"language":"setta-fixture-backend-codegen:typescript"}`),
		},
	}, CodegenTargetValidatorFunc(func(context.Context, ProjectCodegenTarget) error {
		return nil
	}), nil)
	if err != nil {
		t.Fatalf("set mixed codegen targets with defaulted python payload: %v", err)
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

func projectWithPythonMutationFixtures() Project {
	return Project{
		ID:   "project-alpha",
		Name: "Alpha",
		ViewModes: map[string]ViewMode{
			"focus": {
				ID: "focus",
			},
		},
	}
}

func testPythonGeneratedSectionReconciler() PythonCodegenSectionReconciler {
	return PythonCodegenSectionReconcilerFunc(func(_ context.Context, project *Project) error {
		if err := project.ReconcilePythonGeneratedBindings(); err != nil {
			return err
		}
		target, ok, err := project.PythonCodegenTarget()
		if err != nil {
			return err
		}
		if !ok {
			return nil
		}
		project.SectionVariantMap = map[string]string{
			GeneratedPythonCodeSectionID: GeneratedPythonCodeVariantID,
		}
		project.Sections = map[string]Section{
			GeneratedPythonCodeSectionID: {
				ID:               GeneratedPythonCodeSectionID,
				Name:             GeneratedPythonCodeSectionName,
				VariantIDs:       []string{GeneratedPythonCodeVariantID},
				DefaultVariantID: GeneratedPythonCodeVariantID,
			},
		}
		project.SectionVariants = map[string]SectionVariant{
			GeneratedPythonCodeVariantID: {
				ID:     GeneratedPythonCodeVariantID,
				ImplID: GeneratedPythonCodeImplID,
			},
		}
		project.SectionImpls = map[string]SectionImpl{
			GeneratedPythonCodeImplID: {
				ID:      GeneratedPythonCodeImplID,
				Kind:    SectionKindGenerated,
				Payload: RawJSON(`{"code":"python|` + target.GenCodePrefix + `|meta=` + boolString(target.GenerateMetadata) + `","codeFileBinding":{"access_mode":"write_only","autoBinding":false,"canonical_path":"` + GeneratedPythonCodeRelativePath(project.Name) + `"},"id":"gen-python-impl","type":"GenPythonCode"}`),
				Generated: &GeneratedSectionImpl{
					Kind: GeneratedSectionKindPythonCode,
				},
			},
		}
		project.TopLevelSectionIDs = []string{GeneratedPythonCodeSectionID}
		project.TopLevelSections = map[string]TopLevelSectionLayout{
			GeneratedPythonCodeSectionID: {},
		}
		if project.ViewModes == nil {
			project.ViewModes = map[string]ViewMode{}
		}
		viewMode := project.ViewModes["focus"]
		viewMode.ID = "focus"
		viewMode.VisibilityBySectionID = map[string]bool{
			GeneratedPythonCodeSectionID: true,
		}
		viewMode.TopLevelSections = map[string]TopLevelSectionLayout{
			GeneratedPythonCodeSectionID: {},
		}
		if target.GenerateMetadata {
			project.SectionVariantMap[GeneratedPythonMetadataSectionID] = GeneratedPythonMetadataVariantID
			project.Sections[GeneratedPythonMetadataSectionID] = Section{
				ID:               GeneratedPythonMetadataSectionID,
				Name:             GeneratedPythonMetadataSectionName,
				VariantIDs:       []string{GeneratedPythonMetadataVariantID},
				DefaultVariantID: GeneratedPythonMetadataVariantID,
			}
			project.SectionVariants[GeneratedPythonMetadataVariantID] = SectionVariant{
				ID:     GeneratedPythonMetadataVariantID,
				ImplID: GeneratedPythonMetadataImplID,
			}
			project.SectionImpls[GeneratedPythonMetadataImplID] = SectionImpl{
				ID:      GeneratedPythonMetadataImplID,
				Kind:    SectionKindGenerated,
				Payload: RawJSON(`{"code":"meta","codeFileBinding":{"access_mode":"write_only","autoBinding":false,"canonical_path":"` + GeneratedPythonMetadataRelativePath(project.Name) + `"},"id":"gen-python-metadata-impl","type":"GenPythonMetadata"}`),
				Generated: &GeneratedSectionImpl{
					Kind: GeneratedSectionKindPythonMetadata,
				},
			}
			project.TopLevelSectionIDs = append(project.TopLevelSectionIDs, GeneratedPythonMetadataSectionID)
			project.TopLevelSections[GeneratedPythonMetadataSectionID] = TopLevelSectionLayout{}
			viewMode.VisibilityBySectionID[GeneratedPythonMetadataSectionID] = true
			viewMode.TopLevelSections[GeneratedPythonMetadataSectionID] = TopLevelSectionLayout{}
		}
		project.ViewModes["focus"] = viewMode
		return nil
	})
}

func containsTopLevelSectionID(sectionIDs []string, target string) bool {
	for _, sectionID := range sectionIDs {
		if sectionID == target {
			return true
		}
	}
	return false
}

func boolString(value bool) string {
	if value {
		return "true"
	}
	return "false"
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
