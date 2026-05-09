package projectstate

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"testing"
)

func TestRuntimeCreateProjectRunsPythonCodegenSectionReconcilerWhenConfigured(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	runtime := openTestRuntimeWithOptions(t, store, RuntimeOptions{
		PythonCodegenSectionReconciler: testPythonGeneratedSectionReconciler(),
	})

	snapshot, createdProjectID, _, err := runtime.CreateProject(
		context.Background(),
		"bg-blue-500/60 dark:bg-blue-600/30",
	)
	if err != nil {
		t.Fatalf("create project through runtime: %v", err)
	}

	project, err := snapshot.Document.ProjectByID(createdProjectID)
	if err != nil {
		t.Fatalf("lookup created project: %v", err)
	}
	if len(project.TopLevelSectionIDs) != 1 || project.TopLevelSectionIDs[0] != GeneratedPythonCodeSectionID {
		t.Fatalf("expected reconciled generated python top-level section, got %#v", project.TopLevelSectionIDs)
	}
	impl, ok := project.SectionImpls[GeneratedPythonCodeImplID]
	if !ok {
		t.Fatalf("expected reconciled generated python impl, got %#v", project.SectionImpls)
	}
	if !strings.Contains(string(impl.Payload), `python||meta=false`) {
		t.Fatalf("expected reconciled generated python payload, got %q", string(impl.Payload))
	}
}

func TestRuntimeCreateTopLevelSectionReconcilesGeneratedPythonSectionsWhenConfigured(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": testRuntimeStructuralMutationPythonProject(),
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}
	runtime := openTestRuntimeWithOptions(t, store, RuntimeOptions{
		PythonCodegenSectionReconciler: testRuntimeStructuralMutationPythonGeneratedSectionReconciler(),
	})

	snapshot, result, err := runtime.CreateTopLevelSection(
		context.Background(),
		"project-alpha",
		CreateTopLevelSectionInput{ImplType: "Callable"},
		DefaultStructuralMutationSettings(),
	)
	if err != nil {
		t.Fatalf("create top-level section through runtime: %v", err)
	}
	if strings.TrimSpace(result.SectionID) == "" {
		t.Fatalf("expected created section id, got %#v", result)
	}

	project, err := snapshot.Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("lookup mutated project: %v", err)
	}
	if _, ok := project.Sections[result.SectionID]; !ok {
		t.Fatalf("expected created section %q in project snapshot", result.SectionID)
	}
	impl, ok := project.SectionImpls[GeneratedPythonCodeImplID]
	if !ok {
		t.Fatalf("expected generated python impl after structural mutation, got %#v", project.SectionImpls)
	}
	if !strings.Contains(string(impl.Payload), `section-count=1`) {
		t.Fatalf("expected generated python payload to include structural section count, got %q", string(impl.Payload))
	}
}

func TestRuntimeCreateChildSectionsViaIncrementerReconcilesGeneratedPythonSectionsWhenConfigured(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": testRuntimeStructuralMutationPythonProject(),
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}
	runtime := openTestRuntimeWithOptions(t, store, RuntimeOptions{
		PythonCodegenSectionReconciler: testRuntimeStructuralMutationPythonGeneratedSectionReconciler(),
	})

	_, parentResult, err := runtime.CreateTopLevelSection(
		context.Background(),
		"project-alpha",
		CreateTopLevelSectionInput{ImplType: "ListRoot"},
		DefaultStructuralMutationSettings(),
	)
	if err != nil {
		t.Fatalf("seed list root through runtime: %v", err)
	}

	snapshot, result, err := runtime.CreateChildSectionsViaIncrementer(
		context.Background(),
		"project-alpha",
		CreateChildSectionsViaIncrementerInput{
			CalledBy:    parentResult.SectionID,
			ImplType:    "Callable",
			NumChildren: 1,
		},
		DefaultStructuralMutationSettings(),
	)
	if err != nil {
		t.Fatalf("create child sections via incrementer through runtime: %v", err)
	}
	if len(result.SectionIDs) != 1 {
		t.Fatalf("expected one created child id, got %#v", result.SectionIDs)
	}

	project, err := snapshot.Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("lookup mutated project: %v", err)
	}
	if _, ok := project.Sections[result.SectionIDs[0]]; !ok {
		t.Fatalf("expected created child section %q in project snapshot", result.SectionIDs[0])
	}
	impl, ok := project.SectionImpls[GeneratedPythonCodeImplID]
	if !ok {
		t.Fatalf("expected generated python impl after incrementer mutation, got %#v", project.SectionImpls)
	}
	if !strings.Contains(string(impl.Payload), `section-count=2`) {
		t.Fatalf("expected generated python payload to include updated section count, got %q", string(impl.Payload))
	}
}

func TestRuntimeSetCallableReconcilesGeneratedPythonSectionsWhenConfigured(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": testRuntimeSemanticMutationPythonProject(t),
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}
	runtime := openTestRuntimeWithOptions(t, store, RuntimeOptions{
		PythonCodegenSectionReconciler: testRuntimeSemanticMutationPythonGeneratedSectionReconciler(),
	})

	snapshot, response, err := runtime.SetCallable(
		context.Background(),
		"project-alpha",
		"callable-section",
		"sorted",
		false,
		nil,
	)
	if err != nil {
		t.Fatalf("set callable through runtime: %v", err)
	}
	if response.CallableID == nil || *response.CallableID != "callable-2" {
		t.Fatalf("expected callable-2 response, got %#v", response.CallableID)
	}

	project, err := snapshot.Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("lookup mutated project: %v", err)
	}
	impl, ok := project.SectionImpls[GeneratedPythonCodeImplID]
	if !ok {
		t.Fatalf("expected generated python impl after callable mutation, got %#v", project.SectionImpls)
	}
	if !strings.Contains(string(impl.Payload), `callable=sorted`) {
		t.Fatalf("expected generated python payload to include updated callable, got %q", string(impl.Payload))
	}
	if !strings.Contains(string(impl.Payload), `arg=user_value`) {
		t.Fatalf("expected generated python payload to preserve callable arg value, got %q", string(impl.Payload))
	}
}

func TestRuntimeSetSectionVariantReconcilesGeneratedPythonSectionsWhenConfigured(t *testing.T) {
	t.Parallel()

	project := testRuntimeSemanticMutationPythonProject(t)
	createdVariant, err := project.CreateNewSectionVariant(CreateNewSectionVariantInput{
		SectionID: "callable-section",
	})
	if err != nil {
		t.Fatalf("create new section variant for semantic mutation fixture: %v", err)
	}
	if _, err := project.SetCallable(
		context.Background(),
		"callable-section",
		"sorted",
		false,
		nil,
	); err != nil {
		t.Fatalf("set callable in created section variant: %v", err)
	}
	if err := project.SetSectionVariant("callable-section", "callable-variant-1"); err != nil {
		t.Fatalf("restore original active section variant: %v", err)
	}

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": project,
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}
	runtime := openTestRuntimeWithOptions(t, store, RuntimeOptions{
		PythonCodegenSectionReconciler: testRuntimeSemanticMutationPythonGeneratedSectionReconciler(),
	})

	snapshot, err := runtime.SetSectionVariant(
		context.Background(),
		"project-alpha",
		"callable-section",
		createdVariant.VariantID,
	)
	if err != nil {
		t.Fatalf("set section variant through runtime: %v", err)
	}

	projectSnapshot, err := snapshot.Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("lookup mutated project: %v", err)
	}
	impl, ok := projectSnapshot.SectionImpls[GeneratedPythonCodeImplID]
	if !ok {
		t.Fatalf("expected generated python impl after section variant mutation, got %#v", projectSnapshot.SectionImpls)
	}
	if !strings.Contains(string(impl.Payload), `callable=sorted`) {
		t.Fatalf("expected generated python payload to include switched variant callable, got %q", string(impl.Payload))
	}
	if !strings.Contains(string(impl.Payload), `arg=user_value`) {
		t.Fatalf("expected generated python payload to preserve switched variant param value, got %q", string(impl.Payload))
	}
}

func TestRuntimeSetSectionCodeObjectValueReconcilesGeneratedPythonSectionsWhenConfigured(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": testRuntimeSemanticMutationPythonProjectWithSelectedCallable(t),
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}
	runtime := openTestRuntimeWithOptions(t, store, RuntimeOptions{
		PythonCodegenSectionReconciler: testRuntimeSemanticMutationPythonGeneratedSectionReconciler(),
	})

	snapshot, err := runtime.SetSectionCodeObjectValue(
		context.Background(),
		"project-alpha",
		"callable-section",
		"param-existing",
		"3",
	)
	if err != nil {
		t.Fatalf("set section code object value through runtime: %v", err)
	}

	project, err := snapshot.Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("lookup mutated project: %v", err)
	}
	impl, ok := project.SectionImpls[GeneratedPythonCodeImplID]
	if !ok {
		t.Fatalf("expected generated python impl after param mutation, got %#v", project.SectionImpls)
	}
	if !strings.Contains(string(impl.Payload), `callable=sorted`) {
		t.Fatalf("expected generated python payload to keep selected callable, got %q", string(impl.Payload))
	}
	if !strings.Contains(string(impl.Payload), `arg=3`) {
		t.Fatalf("expected generated python payload to include updated param value, got %q", string(impl.Payload))
	}
}

func TestRuntimeSetTextBlockTextReconcilesGeneratedPythonSectionsWhenConfigured(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	project := textBlockMutationTestProject(t)
	defaultWindowing := DefaultProjectChatWindowingState()
	project.ID = "project-alpha"
	project.Name = "Alpha"
	project.CodegenTargets = []ProjectCodegenTarget{
		{Language: string(CodeLanguagePython)},
	}
	project.ProjectChatWindowing = &defaultWindowing
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": project,
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}
	structuralReconciler := testRuntimeStructuralMutationPythonGeneratedSectionReconciler()
	runtime := openTestRuntimeWithOptions(t, store, RuntimeOptions{
		PythonCodegenSectionReconciler: PythonCodegenSectionReconcilerFunc(func(ctx context.Context, project *Project) error {
			if err := structuralReconciler.ReconcileProjectPythonGeneratedSections(ctx, project); err != nil {
				return err
			}
			if project == nil {
				return ErrProjectNotFound
			}

			textPayload, err := effectiveSectionPayload(*project, "text-section", "text-variant")
			if err != nil {
				return err
			}
			payload, err := marshalProjectObject(map[string]any{
				"id":   GeneratedPythonCodeImplID,
				"type": "GenPythonCode",
				"code": fmt.Sprintf("text=%s", payloadRawStringField(textPayload, "text")),
			})
			if err != nil {
				return err
			}

			impl := project.SectionImpls[GeneratedPythonCodeImplID]
			impl.Payload = payload
			project.SectionImpls[GeneratedPythonCodeImplID] = impl
			return nil
		}),
	})

	snapshot, err := runtime.SetTextBlockText(
		context.Background(),
		"project-alpha",
		"text-section",
		"hello from text block",
	)
	if err != nil {
		t.Fatalf("set text block text through runtime: %v", err)
	}

	project, err = snapshot.Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("lookup mutated project: %v", err)
	}
	impl, ok := project.SectionImpls[GeneratedPythonCodeImplID]
	if !ok {
		t.Fatalf("expected generated python impl after text mutation, got %#v", project.SectionImpls)
	}
	if !strings.Contains(string(impl.Payload), `text=hello from text block`) {
		t.Fatalf("expected generated python payload to include updated text, got %q", string(impl.Payload))
	}
}

func testRuntimeStructuralMutationPythonProject() Project {
	defaultWindowing := DefaultProjectChatWindowingState()
	return Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []ProjectCodegenTarget{
			{Language: string(CodeLanguagePython)},
		},
		ProjectChatWindowing: &defaultWindowing,
	}
}

func testRuntimeStructuralMutationPythonGeneratedSectionReconciler() PythonCodegenSectionReconciler {
	return PythonCodegenSectionReconcilerFunc(func(_ context.Context, project *Project) error {
		if project == nil {
			return ErrProjectNotFound
		}
		if err := project.ReconcilePythonGeneratedBindings(); err != nil {
			return err
		}

		sectionCount := 0
		for sectionID := range project.Sections {
			if sectionID == GeneratedPythonCodeSectionID || sectionID == GeneratedPythonMetadataSectionID {
				continue
			}
			sectionCount++
		}

		var bindingPayload any
		if project.GeneratedCodeBinding != nil {
			bindingPayload = map[string]any{
				"canonical_path": project.GeneratedCodeBinding.Path,
				"access_mode":    string(project.GeneratedCodeBinding.AccessMode),
				"autoBinding":    false,
			}
		}
		payload, err := marshalProjectObject(map[string]any{
			"id":              GeneratedPythonCodeImplID,
			"type":            "GenPythonCode",
			"code":            fmt.Sprintf("section-count=%d", sectionCount),
			"codeFileBinding": bindingPayload,
		})
		if err != nil {
			return err
		}

		if project.SectionVariantMap == nil {
			project.SectionVariantMap = map[string]string{}
		}
		project.SectionVariantMap[GeneratedPythonCodeSectionID] = GeneratedPythonCodeVariantID

		if project.Sections == nil {
			project.Sections = map[string]Section{}
		}
		project.Sections[GeneratedPythonCodeSectionID] = Section{
			ID:               GeneratedPythonCodeSectionID,
			Name:             GeneratedPythonCodeSectionName,
			VariantIDs:       []string{GeneratedPythonCodeVariantID},
			DefaultVariantID: GeneratedPythonCodeVariantID,
		}

		if project.SectionVariants == nil {
			project.SectionVariants = map[string]SectionVariant{}
		}
		project.SectionVariants[GeneratedPythonCodeVariantID] = SectionVariant{
			ID:     GeneratedPythonCodeVariantID,
			ImplID: GeneratedPythonCodeImplID,
		}

		if project.SectionImpls == nil {
			project.SectionImpls = map[string]SectionImpl{}
		}
		project.SectionImpls[GeneratedPythonCodeImplID] = SectionImpl{
			ID:      GeneratedPythonCodeImplID,
			Kind:    SectionKindGenerated,
			Payload: payload,
			Generated: &GeneratedSectionImpl{
				Kind: GeneratedSectionKindPythonCode,
			},
		}

		if project.TopLevelSections == nil {
			project.TopLevelSections = map[string]TopLevelSectionLayout{}
		}
		project.TopLevelSections[GeneratedPythonCodeSectionID] = TopLevelSectionLayout{}
		if !containsTopLevelSectionID(project.TopLevelSectionIDs, GeneratedPythonCodeSectionID) {
			project.TopLevelSectionIDs = append(project.TopLevelSectionIDs, GeneratedPythonCodeSectionID)
		}

		return nil
	})
}

func testRuntimeSemanticMutationPythonProject(t *testing.T) Project {
	t.Helper()

	project := callableTestProject(t)
	defaultWindowing := DefaultProjectChatWindowingState()
	project.ID = "project-alpha"
	project.Name = "Alpha"
	project.CodegenTargets = []ProjectCodegenTarget{
		{Language: string(CodeLanguagePython)},
	}
	project.ProjectChatWindowing = &defaultWindowing
	return project
}

func testRuntimeSemanticMutationPythonProjectWithSelectedCallable(t *testing.T) Project {
	t.Helper()

	project := testRuntimeSemanticMutationPythonProject(t)
	if err := project.setCurrentSectionField("callable-section", "callable", "callable-2"); err != nil {
		t.Fatalf("set selected callable in semantic mutation fixture: %v", err)
	}
	return project
}

func testRuntimeSemanticMutationPythonGeneratedSectionReconciler() PythonCodegenSectionReconciler {
	structuralReconciler := testRuntimeStructuralMutationPythonGeneratedSectionReconciler()
	return PythonCodegenSectionReconcilerFunc(func(ctx context.Context, project *Project) error {
		if err := structuralReconciler.ReconcileProjectPythonGeneratedSections(ctx, project); err != nil {
			return err
		}
		if project == nil {
			return ErrProjectNotFound
		}

		renderedCode, err := testRuntimeSemanticMutationGeneratedCode(project)
		if err != nil {
			return err
		}

		var bindingPayload any
		if project.GeneratedCodeBinding != nil {
			bindingPayload = map[string]any{
				"canonical_path": project.GeneratedCodeBinding.Path,
				"access_mode":    string(project.GeneratedCodeBinding.AccessMode),
				"autoBinding":    false,
			}
		}
		payload, err := marshalProjectObject(map[string]any{
			"id":              GeneratedPythonCodeImplID,
			"type":            "GenPythonCode",
			"code":            renderedCode,
			"codeFileBinding": bindingPayload,
		})
		if err != nil {
			return err
		}

		impl := project.SectionImpls[GeneratedPythonCodeImplID]
		impl.Payload = payload
		project.SectionImpls[GeneratedPythonCodeImplID] = impl
		return nil
	})
}

func testRuntimeSemanticMutationGeneratedCode(project *Project) (string, error) {
	if project == nil {
		return "", ErrProjectNotFound
	}

	sectionPayload, err := project.currentCallableSectionPayload("callable-section")
	if err != nil {
		return "", err
	}
	callableID := payloadStringField(sectionPayload, "callable")
	if callableID == "" {
		return "callable=<none>|arg=<none>", nil
	}

	callablePayload, callableCodeObj, _, _, err := project.ResolveSectionCodeObject("callable-section", callableID)
	if err != nil {
		return "", err
	}
	childIDs := payloadStringArrayField(callablePayload, "children")
	if len(childIDs) == 0 {
		return fmt.Sprintf("callable=%s|arg=<none>", callableCodeObj.Name), nil
	}

	paramPayload, _, _, _, err := project.ResolveSectionCodeObject("callable-section", childIDs[0])
	if err != nil {
		return "", err
	}
	return fmt.Sprintf(
		"callable=%s|arg=%s",
		callableCodeObj.Name,
		payloadRawStringField(paramPayload, "value"),
	), nil
}
