package codegen

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"setta/internal/projectstate"
	"setta/internal/prompttemplates"
)

func TestBuildPythonDependencyGraphPromptSectionUsesLiveLinkedTemplateTextWhenStoreProvided(t *testing.T) {
	t.Parallel()

	store, err := prompttemplates.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new prompt template store: %v", err)
	}
	if err := store.Save(prompttemplates.Template{
		ID:       "template-alpha",
		Name:     "Greeting",
		Template: "Hello from the updated saved template.",
		Format:   prompttemplates.FormatJinja,
	}); err != nil {
		t.Fatalf("save prompt template: %v", err)
	}

	project := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []projectstate.ProjectCodegenTarget{{
			Language: string(projectstate.CodeLanguagePython),
			Payload: mustPythonSectionTypePolicyPayload(
				t,
				"Prompt",
				projectstate.PythonSectionRepresentationExpression,
			),
		}},
		TopLevelSectionIDs: []string{"prompt-section"},
		SectionVariantMap: map[string]string{
			"prompt-section": "prompt-variant",
		},
		Sections: map[string]projectstate.Section{
			"prompt-section": {
				ID:               "prompt-section",
				Name:             "Prompt Section",
				VariantIDs:       []string{"prompt-variant"},
				DefaultVariantID: "prompt-variant",
				SharedModifier: mustRawJSON(
					t,
					`{
						"promptTemplateId":"template-alpha",
						"template":"stale prompt snapshot",
						"format":"Jinja",
						"renderedText":"stale rendered preview"
					}`,
				),
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"prompt-variant": {
				ID:     "prompt-variant",
				ImplID: "prompt-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"prompt-impl": {
				ID: "prompt-impl",
				Payload: mustRawJSON(
					t,
					`{"id":"prompt-impl","type":"Prompt","template":"","format":"Jinja","renderedText":""}`,
				),
			},
		},
	}

	exported := mustPythonCodegenExport(t, project)
	graph, err := BuildPythonDependencyGraph(exported, PythonDependencyGraphOptions{
		PromptTemplates: store,
	})
	if err != nil {
		t.Fatalf("build python dependency graph: %v", err)
	}

	node := mustSectionNode(t, graph, PythonSectionDependencyKey("prompt-section"))
	value, ok := node.Value.(LiteralDependencyValue)
	if !ok {
		t.Fatalf("expected prompt node literal dependency value, got %#v", node.Value)
	}
	if value.Payload != "Hello from the updated saved template." {
		t.Fatalf("expected live linked template text, got %q", value.Payload)
	}
}

func TestBuildPythonDependencyGraphPromptSectionFailsClosedWhenLinkedTemplateMissingWithStore(t *testing.T) {
	t.Parallel()

	store, err := prompttemplates.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new prompt template store: %v", err)
	}

	project := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []projectstate.ProjectCodegenTarget{{
			Language: string(projectstate.CodeLanguagePython),
			Payload: mustPythonSectionTypePolicyPayload(
				t,
				"Prompt",
				projectstate.PythonSectionRepresentationExpression,
			),
		}},
		TopLevelSectionIDs: []string{"prompt-section"},
		SectionVariantMap: map[string]string{
			"prompt-section": "prompt-variant",
		},
		Sections: map[string]projectstate.Section{
			"prompt-section": {
				ID:               "prompt-section",
				Name:             "Prompt Section",
				VariantIDs:       []string{"prompt-variant"},
				DefaultVariantID: "prompt-variant",
				SharedModifier: mustRawJSON(
					t,
					`{
						"promptTemplateId":"template-missing",
						"template":"stale prompt snapshot",
						"format":"Jinja",
						"renderedText":"stale rendered preview"
					}`,
				),
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"prompt-variant": {
				ID:     "prompt-variant",
				ImplID: "prompt-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"prompt-impl": {
				ID: "prompt-impl",
				Payload: mustRawJSON(
					t,
					`{"id":"prompt-impl","type":"Prompt","template":"","format":"Jinja","renderedText":""}`,
				),
			},
		},
	}

	exported := mustPythonCodegenExport(t, project)
	_, err = BuildPythonDependencyGraph(exported, PythonDependencyGraphOptions{
		PromptTemplates: store,
	})
	if !errors.Is(err, prompttemplates.ErrTemplateNotFound) {
		t.Fatalf("expected prompt template not found error, got %v", err)
	}
	if !strings.Contains(err.Error(), "template-missing") {
		t.Fatalf("expected missing template id in error, got %v", err)
	}
}

// Chart codegen policy is still caller-visible on the live mutation surface, but
// the dependency graph intentionally skips Chart sections because no exporter is
// registered yet.
func TestBuildPythonDependencyGraphSkipsChartSectionsEvenWhenPolicyIncludesChartFilePath(t *testing.T) {
	t.Parallel()

	project := singleSectionProject(
		t,
		"Chart Section",
		mustRawJSON(
			t,
			`{
				"id":"section-impl-1",
				"type":"Chart",
				"dataPath":"artifacts/chart.csv",
				"chartSettings":{
					"type":"line",
					"xAxisColumn":null,
					"secondYAxisColumns":["humidity"],
					"xAxisLog":true,
					"y1AxisLog":false,
					"y2AxisLog":false
				}
			}`,
		),
		mustPythonSectionTypePolicyPayload(t, "Chart", projectstate.PythonSectionRepresentationFilePath),
		nil,
	)
	exported := mustPythonCodegenExport(t, project)
	resolvedSection, err := exported.ResolveSection("section-1")
	if err != nil {
		t.Fatalf("resolve chart section export: %v", err)
	}
	if !resolvedSection.Policy.IncludeInCodegen {
		t.Fatal("expected chart section policy to include the section")
	}
	if resolvedSection.Policy.Representation != projectstate.PythonSectionRepresentationFilePath {
		t.Fatalf("expected chart representation file_path, got %q", resolvedSection.Policy.Representation)
	}

	graph, err := BuildPythonDependencyGraph(exported, PythonDependencyGraphOptions{})
	if err != nil {
		t.Fatalf("build chart dependency graph: %v", err)
	}

	if _, ok := graph.Node(PythonSectionDependencyKey("section-1")); ok {
		t.Fatalf("expected chart section to be omitted from dependency graph, got %#v", graph.Nodes)
	}
	if len(graph.NodeOrder) != 0 {
		t.Fatalf("expected chart-only export to produce no graph nodes, got %#v", graph.NodeOrder)
	}
}

// Password params should only count as present when the graph builder is given a non-empty secret for that impl id.
func TestBuildPythonDependencyGraphPasswordParamHonorsProvidedSecrets(t *testing.T) {
	t.Parallel()

	project := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []projectstate.ProjectCodegenTarget{
			{Language: string(projectstate.CodeLanguagePython)},
		},
		TopLevelSectionIDs: []string{"section-1"},
		SectionVariantMap: map[string]string{
			"section-1": "section-variant-1",
		},
		Sections: map[string]projectstate.Section{
			"section-1": {
				ID:               "section-1",
				Name:             "Passwords",
				VariantIDs:       []string{"section-variant-1"},
				DefaultVariantID: "section-variant-1",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"section-variant-1": {
				ID:     "section-variant-1",
				ImplID: "section-impl-1",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"section-impl-1": {
				ID: "section-impl-1",
				Payload: mustRawJSON(
					t,
					`{
						"id":"section-impl-1",
						"type":"Callable",
						"callable":"callable-root",
						"codeObjVariantMap":{
							"callable-root":"callable-variant-1",
							"param-secret":"param-secret-variant-1"
						}
					}`,
				),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"callable-root": {
				ID:               "callable-root",
				Name:             "my_callable",
				VariantIDs:       []string{"callable-variant-1"},
				DefaultVariantID: "callable-variant-1",
			},
			"param-secret": {
				ID:               "param-secret",
				Name:             "api_key",
				VariantIDs:       []string{"param-secret-variant-1"},
				DefaultVariantID: "param-secret-variant-1",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"callable-variant-1": {
				ID:     "callable-variant-1",
				ImplID: "callable-impl-1",
			},
			"param-secret-variant-1": {
				ID:     "param-secret-variant-1",
				ImplID: "param-secret-impl-1",
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"callable-impl-1": {
				ID: "callable-impl-1",
				Payload: mustRawJSON(
					t,
					`{"id":"callable-impl-1","type":"CodeCallable","children":["param-secret"]}`,
				),
			},
			"param-secret-impl-1": {
				ID: "param-secret-impl-1",
				Payload: mustRawJSON(
					t,
					`{"id":"param-secret-impl-1","type":"PasswordParam","value":"ignored"}`,
				),
			},
		},
	}

	exported := mustPythonCodegenExport(t, project)
	graphWithoutSecret, err := BuildPythonDependencyGraph(exported, PythonDependencyGraphOptions{})
	if err != nil {
		t.Fatalf("build graph without secret: %v", err)
	}
	paramWithoutSecret := mustParamNode(t, graphWithoutSecret, PythonCodeObjectDependencyKey("section-1", "param-secret"))
	if paramWithoutSecret.HasNameAndValue() {
		t.Fatal("expected password param without secret to be absent")
	}

	graphWithSecret, err := BuildPythonDependencyGraph(exported, PythonDependencyGraphOptions{
		PasswordSecrets: map[string]string{
			"param-secret-impl-1": "top-secret",
		},
	})
	if err != nil {
		t.Fatalf("build graph with secret: %v", err)
	}
	paramWithSecret := mustParamNode(t, graphWithSecret, PythonCodeObjectDependencyKey("section-1", "param-secret"))
	if !paramWithSecret.HasNameAndValue() {
		t.Fatal("expected password param with secret to be present")
	}
}

// Callable names and childless param values should resolve real Python `state.<name>` references
// against the graph's final full-path index, even when the target node is exported later.
func TestBuildPythonDependencyGraphResolvesForwardStateReferences(t *testing.T) {
	t.Parallel()

	project := pythonStateReferenceProject(
		t,
		"state.Shared_Config",
		"state.Shared_Config",
	)

	exported := mustPythonCodegenExport(t, project)
	graph, err := BuildPythonDependencyGraph(exported, PythonDependencyGraphOptions{})
	if err != nil {
		t.Fatalf("build graph with forward refs: %v", err)
	}

	targetKey := PythonCodeObjectDependencyKey("globals", "global-shared")
	runnerNode := mustSectionNode(t, graph, PythonSectionDependencyKey("runner"))
	if !runnerNode.Deps[targetKey] {
		t.Fatalf("expected callable section to depend on %v, deps=%#v", targetKey, runnerNode.Deps)
	}

	paramNode := mustParamNode(t, graph, PythonCodeObjectDependencyKey("runner", "runner-param"))
	if !paramNode.Deps[targetKey] {
		t.Fatalf("expected param node to depend on %v, deps=%#v", targetKey, paramNode.Deps)
	}
}

// The parser-backed extractor should ignore references when `state` is shadowed in supported scopes
// and should drop invalid Python snippets instead of creating heuristic edges.
func TestBuildPythonDependencyGraphSkipsShadowedAndInvalidStateReferences(t *testing.T) {
	t.Parallel()

	t.Run("function scope shadowing", func(t *testing.T) {
		t.Parallel()

		project := pythonStateReferenceProject(
			t,
			"runner",
			"def inner(state):\n    return state.Shared_Config",
		)
		exported := mustPythonCodegenExport(t, project)
		graph, err := BuildPythonDependencyGraph(exported, PythonDependencyGraphOptions{})
		if err != nil {
			t.Fatalf("build graph with function shadowing: %v", err)
		}

		paramNode := mustParamNode(t, graph, PythonCodeObjectDependencyKey("runner", "runner-param"))
		if len(paramNode.Deps) != 0 {
			t.Fatalf("expected no deps for shadowed function reference, got %#v", paramNode.Deps)
		}
	})

	t.Run("comprehension shadowing", func(t *testing.T) {
		t.Parallel()

		project := pythonStateReferenceProject(
			t,
			"runner",
			"[state.Shared_Config for state in items if state.Shared_Config]",
		)
		exported := mustPythonCodegenExport(t, project)
		graph, err := BuildPythonDependencyGraph(exported, PythonDependencyGraphOptions{})
		if err != nil {
			t.Fatalf("build graph with comprehension shadowing: %v", err)
		}

		paramNode := mustParamNode(t, graph, PythonCodeObjectDependencyKey("runner", "runner-param"))
		if len(paramNode.Deps) != 0 {
			t.Fatalf("expected no deps for shadowed comprehension reference, got %#v", paramNode.Deps)
		}
	})

	t.Run("syntax error", func(t *testing.T) {
		t.Parallel()

		project := pythonStateReferenceProject(
			t,
			"runner",
			"state.Shared_Config(",
		)
		exported := mustPythonCodegenExport(t, project)
		graph, err := BuildPythonDependencyGraph(exported, PythonDependencyGraphOptions{})
		if err != nil {
			t.Fatalf("build graph with syntax error: %v", err)
		}

		paramNode := mustParamNode(t, graph, PythonCodeObjectDependencyKey("runner", "runner-param"))
		if len(paramNode.Deps) != 0 {
			t.Fatalf("expected no deps for invalid python, got %#v", paramNode.Deps)
		}
	})
}

func singleSectionProject(
	t *testing.T,
	sectionName string,
	sectionPayload projectstate.RawJSON,
	pythonTargetPayload projectstate.RawJSON,
	sectionSharedModifier projectstate.RawJSON,
) projectstate.Project {
	t.Helper()

	codegenTargets := []projectstate.ProjectCodegenTarget{
		{Language: string(projectstate.CodeLanguagePython)},
	}
	if len(pythonTargetPayload) > 0 {
		codegenTargets[0].Payload = pythonTargetPayload
	}
	return projectstate.Project{
		ID:                 "project-alpha",
		Name:               "Alpha",
		CodegenTargets:     codegenTargets,
		TopLevelSectionIDs: []string{"section-1"},
		SectionVariantMap: map[string]string{
			"section-1": "section-variant-1",
		},
		Sections: map[string]projectstate.Section{
			"section-1": {
				ID:               "section-1",
				Name:             sectionName,
				VariantIDs:       []string{"section-variant-1"},
				DefaultVariantID: "section-variant-1",
				SharedModifier:   sectionSharedModifier,
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"section-variant-1": {
				ID:     "section-variant-1",
				ImplID: "section-impl-1",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"section-impl-1": {
				ID:      "section-impl-1",
				Payload: sectionPayload,
			},
		},
	}
}

func pythonStateReferenceProject(
	t *testing.T,
	callableName string,
	paramValue string,
) projectstate.Project {
	t.Helper()

	return projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []projectstate.ProjectCodegenTarget{
			{Language: string(projectstate.CodeLanguagePython)},
		},
		TopLevelSectionIDs: []string{"runner", "globals"},
		SectionVariantMap: map[string]string{
			"runner":  "runner-variant-1",
			"globals": "globals-variant-1",
		},
		Sections: map[string]projectstate.Section{
			"runner": {
				ID:               "runner",
				Name:             "Runner",
				VariantIDs:       []string{"runner-variant-1"},
				DefaultVariantID: "runner-variant-1",
			},
			"globals": {
				ID:               "globals",
				Name:             "Globals",
				VariantIDs:       []string{"globals-variant-1"},
				DefaultVariantID: "globals-variant-1",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"runner-variant-1": {
				ID:     "runner-variant-1",
				ImplID: "runner-impl-1",
			},
			"globals-variant-1": {
				ID:     "globals-variant-1",
				ImplID: "globals-impl-1",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"runner-impl-1": {
				ID: "runner-impl-1",
				Payload: mustRawJSON(
					t,
					`{
						"id":"runner-impl-1",
						"type":"Callable",
						"callable":"runner-callable",
						"codeObjVariantMap":{
							"runner-callable":"runner-callable-variant-1",
							"runner-param":"runner-param-variant-1"
						}
					}`,
				),
			},
			"globals-impl-1": {
				ID: "globals-impl-1",
				Payload: mustRawJSON(
					t,
					`{
						"id":"globals-impl-1",
						"type":"GlobalVariables",
						"topLevelParamId":"globals-root",
						"codeObjVariantMap":{
							"globals-root":"globals-root-variant-1",
							"global-shared":"global-shared-variant-1"
						}
					}`,
				),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"runner-callable": {
				ID:               "runner-callable",
				Name:             callableName,
				VariantIDs:       []string{"runner-callable-variant-1"},
				DefaultVariantID: "runner-callable-variant-1",
			},
			"runner-param": {
				ID:               "runner-param",
				Name:             "script",
				VariantIDs:       []string{"runner-param-variant-1"},
				DefaultVariantID: "runner-param-variant-1",
			},
			"globals-root": {
				ID:               "globals-root",
				Name:             "root",
				VariantIDs:       []string{"globals-root-variant-1"},
				DefaultVariantID: "globals-root-variant-1",
			},
			"global-shared": {
				ID:               "global-shared",
				Name:             "Shared Config",
				VariantIDs:       []string{"global-shared-variant-1"},
				DefaultVariantID: "global-shared-variant-1",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"runner-callable-variant-1": {
				ID:     "runner-callable-variant-1",
				ImplID: "runner-callable-impl-1",
			},
			"runner-param-variant-1": {
				ID:     "runner-param-variant-1",
				ImplID: "runner-param-impl-1",
			},
			"globals-root-variant-1": {
				ID:     "globals-root-variant-1",
				ImplID: "globals-root-impl-1",
			},
			"global-shared-variant-1": {
				ID:     "global-shared-variant-1",
				ImplID: "global-shared-impl-1",
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"runner-callable-impl-1": {
				ID: "runner-callable-impl-1",
				Payload: mustRawJSON(
					t,
					`{"id":"runner-callable-impl-1","type":"CodeCallable","children":["runner-param"]}`,
				),
			},
			"runner-param-impl-1": {
				ID: "runner-param-impl-1",
				Payload: mustRawJSON(
					t,
					`{"id":"runner-param-impl-1","type":"CodeParam","value":`+mustJSONString(t, paramValue)+`}`,
				),
			},
			"globals-root-impl-1": {
				ID: "globals-root-impl-1",
				Payload: mustRawJSON(
					t,
					`{"id":"globals-root-impl-1","type":"NestedParam","children":["global-shared"]}`,
				),
			},
			"global-shared-impl-1": {
				ID: "global-shared-impl-1",
				Payload: mustRawJSON(
					t,
					`{"id":"global-shared-impl-1","type":"CodeParam","value":"42"}`,
				),
			},
		},
	}
}

func metaControlSectionProject(
	t *testing.T,
	sectionName string,
	controlType string,
	controlValue string,
	pythonTargetPayload projectstate.RawJSON,
) projectstate.Project {
	t.Helper()

	codegenTargets := []projectstate.ProjectCodegenTarget{
		{Language: string(projectstate.CodeLanguagePython)},
	}
	if len(pythonTargetPayload) > 0 {
		codegenTargets[0].Payload = pythonTargetPayload
	}

	return projectstate.Project{
		ID:             "project-alpha",
		Name:           "Alpha",
		CodegenTargets: codegenTargets,
		TopLevelSectionIDs: []string{
			"section-1",
		},
		SectionVariantMap: map[string]string{
			"section-1": "section-variant-1",
		},
		Sections: map[string]projectstate.Section{
			"section-1": {
				ID:               "section-1",
				Name:             sectionName,
				VariantIDs:       []string{"section-variant-1"},
				DefaultVariantID: "section-variant-1",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"section-variant-1": {
				ID:     "section-variant-1",
				ImplID: "section-impl-1",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"section-impl-1": {
				ID: "section-impl-1",
				Payload: mustRawJSON(
					t,
					`{
						"id":"section-impl-1",
						"type":"MetaControl",
						"metaControlParamId":"control-param-1",
						"codeObjVariantMap":{"control-param-1":"control-param-variant-1"}
					}`,
				),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"control-param-1": {
				ID:               "control-param-1",
				Name:             "control_param",
				VariantIDs:       []string{"control-param-variant-1"},
				DefaultVariantID: "control-param-variant-1",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"control-param-variant-1": {
				ID:     "control-param-variant-1",
				ImplID: "control-param-impl-1",
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"control-param-impl-1": {
				ID: "control-param-impl-1",
				Payload: mustRawJSON(
					t,
					`{"id":"control-param-impl-1","type":"`+controlType+`","value":`+mustJSONString(t, controlValue)+`}`,
				),
			},
		},
	}
}

func callableSectionProjectWithCodeObjValuePolicy(
	t *testing.T,
	paramID string,
	pythonTargetPayload projectstate.RawJSON,
) projectstate.Project {
	t.Helper()

	return projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []projectstate.ProjectCodegenTarget{
			{
				Language: string(projectstate.CodeLanguagePython),
				Payload:  pythonTargetPayload,
			},
		},
		TopLevelSectionIDs: []string{"section-1"},
		SectionVariantMap: map[string]string{
			"section-1": "section-variant-1",
		},
		Sections: map[string]projectstate.Section{
			"section-1": {
				ID:               "section-1",
				Name:             "Section",
				VariantIDs:       []string{"section-variant-1"},
				DefaultVariantID: "section-variant-1",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"section-variant-1": {
				ID:     "section-variant-1",
				ImplID: "section-impl-1",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"section-impl-1": {
				ID: "section-impl-1",
				Payload: mustRawJSON(
					t,
					`{
						"id":"section-impl-1",
						"type":"Callable",
						"callable":"callable-1",
						"codeObjVariantMap":{
							"callable-1":"callable-variant-1",
							"`+paramID+`":"param-variant-1"
						}
					}`,
				),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"callable-1": {
				ID:               "callable-1",
				Name:             "Callable",
				VariantIDs:       []string{"callable-variant-1"},
				DefaultVariantID: "callable-variant-1",
			},
			paramID: {
				ID:               paramID,
				Name:             "param",
				VariantIDs:       []string{"param-variant-1"},
				DefaultVariantID: "param-variant-1",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"callable-variant-1": {
				ID:     "callable-variant-1",
				ImplID: "callable-impl-1",
			},
			"param-variant-1": {
				ID:     "param-variant-1",
				ImplID: "param-impl-1",
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"callable-impl-1": {
				ID: "callable-impl-1",
				Payload: mustRawJSON(
					t,
					`{"id":"callable-impl-1","type":"CodeCallable","children":[`+mustJSONString(t, paramID)+`]}`,
				),
			},
			"param-impl-1": {
				ID: "param-impl-1",
				Payload: mustRawJSON(
					t,
					`{"id":"param-impl-1","type":"SliderParam","value":"42"}`,
				),
			},
		},
	}
}

func mustPythonCodegenExport(t *testing.T, project projectstate.Project) projectstate.PythonCodegenExport {
	t.Helper()

	exported, ok, err := project.PythonCodegenExport()
	if err != nil {
		t.Fatalf("build python codegen export: %v", err)
	}
	if !ok {
		t.Fatal("expected python codegen export to exist")
	}
	return exported
}

func mustSectionNode(t *testing.T, graph *PythonDependencyGraph, key PythonDependencyKey) *PythonSectionNode {
	t.Helper()

	node, ok := graph.Node(key)
	if !ok {
		t.Fatalf("expected section node %v", key)
	}
	sectionNode, ok := node.(*PythonSectionNode)
	if !ok {
		t.Fatalf("expected section node type, got %#v", node)
	}
	return sectionNode
}

func mustParamNode(t *testing.T, graph *PythonDependencyGraph, key PythonDependencyKey) *PythonParamNode {
	t.Helper()

	node, ok := graph.Node(key)
	if !ok {
		t.Fatalf("expected param node %v", key)
	}
	paramNode, ok := node.(*PythonParamNode)
	if !ok {
		t.Fatalf("expected param node type, got %#v", node)
	}
	return paramNode
}

func mustRawJSON(t *testing.T, raw string) projectstate.RawJSON {
	t.Helper()

	if !json.Valid([]byte(raw)) {
		t.Fatalf("invalid raw JSON test fixture: %s", raw)
	}
	return projectstate.RawJSON(raw)
}

func mustJSONString(t *testing.T, value string) string {
	t.Helper()

	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal json string: %v", err)
	}
	return string(encoded)
}

func TestRenderPythonLiteralCollectionsAndFallback(t *testing.T) {
	t.Parallel()

	t.Run("renders supported collections deterministically", func(t *testing.T) {
		t.Parallel()

		rendered := renderPythonLiteral(map[string]any{
			"names": []string{"alpha", "beta"},
			"nums":  []int{1, 2},
			"meta":  map[string]string{"b": "two", "a": "one"},
			"flag":  true,
		})
		expected := "{'flag': True, 'meta': {'a': 'one', 'b': 'two'}, 'names': ['alpha', 'beta'], 'nums': [1, 2]}"
		if rendered != expected {
			t.Fatalf("unexpected rendered literal %q", rendered)
		}
	})

	t.Run("falls back to string literal for unsupported collection types", func(t *testing.T) {
		t.Parallel()

		rendered := renderPythonLiteral([]bool{true, false})
		if rendered != "'[true false]'" {
			t.Fatalf("unexpected fallback literal %q", rendered)
		}
	})
}

func mustPythonSectionTypePolicyPayload(
	t *testing.T,
	sectionType string,
	representation projectstate.PythonSectionRepresentationMode,
) projectstate.RawJSON {
	t.Helper()

	return mustRawJSON(
		t,
		`{
			"language":"python",
			"sectionPolicy":{
				"typePolicies":{
					"`+sectionType+`":{"mode":"include","representation":"`+string(representation)+`"}
				}
			}
		}`,
	)
}

func mustPythonCodeObjValuePolicyPayload(
	t *testing.T,
	typeRepresentation projectstate.PythonCodeObjValueRepresentationMode,
	overrideCodeObjID string,
	overrideRepresentation projectstate.PythonCodeObjValueRepresentationMode,
) projectstate.RawJSON {
	t.Helper()

	payload := `{
		"language":"python",
		"codeObjValuePolicy":{
			"typePolicies":{
				"SliderParam":{"representation":"` + string(typeRepresentation) + `"}
			}`
	if overrideCodeObjID != "" {
		payload += `,
			"codeObjOverrides":{
				"` + overrideCodeObjID + `":{"representation":"` + string(overrideRepresentation) + `"}
			}`
	}
	payload += `
		}
	}`
	return mustRawJSON(t, payload)
}
