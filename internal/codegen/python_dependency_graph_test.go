package codegen

import (
	"encoding/json"
	"testing"

	"setta/internal/projectstate"
)

// The first Slice 3 graph layer should export callable sections and params with deterministic Python path names.
func TestBuildPythonDependencyGraphCallableSectionExportsParamsAndUniquePaths(t *testing.T) {
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
				Name:             "Run Section",
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
							"param-1":"param-variant-1",
							"param-2":"param-variant-2"
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
			"param-1": {
				ID:               "param-1",
				Name:             "value",
				VariantIDs:       []string{"param-variant-1"},
				DefaultVariantID: "param-variant-1",
			},
			"param-2": {
				ID:               "param-2",
				Name:             "value",
				VariantIDs:       []string{"param-variant-2"},
				DefaultVariantID: "param-variant-2",
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
			"param-variant-2": {
				ID:     "param-variant-2",
				ImplID: "param-impl-2",
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"callable-impl-1": {
				ID: "callable-impl-1",
				Payload: mustRawJSON(
					t,
					`{"id":"callable-impl-1","type":"CodeCallable","children":["param-1","param-2"]}`,
				),
			},
			"param-impl-1": {
				ID: "param-impl-1",
				Payload: mustRawJSON(
					t,
					`{"id":"param-impl-1","type":"CodeParam","value":"1","passingStyle":"DEFAULT"}`,
				),
			},
			"param-impl-2": {
				ID: "param-impl-2",
				Payload: mustRawJSON(
					t,
					`{"id":"param-impl-2","type":"CodeParam","value":"2","passingStyle":"DEFAULT"}`,
				),
			},
		},
	}

	exported := mustPythonCodegenExport(t, project)
	graph, err := BuildPythonDependencyGraph(exported, PythonDependencyGraphOptions{})
	if err != nil {
		t.Fatalf("build python dependency graph: %v", err)
	}

	sectionNode := mustSectionNode(t, graph, PythonSectionDependencyKey("section-1"))
	if sectionNode.FullPathName != "Run_Section" {
		t.Fatalf("unexpected section path %q", sectionNode.FullPathName)
	}
	literal, ok := sectionNode.Value.(LiteralDependencyValue)
	if !ok || literal.Payload != "my_callable" {
		t.Fatalf("unexpected callable section value %#v", sectionNode.Value)
	}
	if len(sectionNode.Deps) != 2 {
		t.Fatalf("expected two callable deps, got %#v", sectionNode.Deps)
	}
	if len(sectionNode.DepOrder) != 2 {
		t.Fatalf("expected two ordered callable deps, got %#v", sectionNode.DepOrder)
	}
	if sectionNode.DepOrder[0] != PythonCodeObjectDependencyKey("section-1", "param-1") {
		t.Fatalf("unexpected first callable dep order %#v", sectionNode.DepOrder)
	}
	if sectionNode.DepOrder[1] != PythonCodeObjectDependencyKey("section-1", "param-2") {
		t.Fatalf("unexpected second callable dep order %#v", sectionNode.DepOrder)
	}

	param1 := mustParamNode(t, graph, PythonCodeObjectDependencyKey("section-1", "param-1"))
	if param1.FullPathName != "Run_Section__value" {
		t.Fatalf("unexpected first param path %q", param1.FullPathName)
	}
	if literal, ok := param1.Value.(LiteralDependencyValue); !ok || literal.Payload != "1" {
		t.Fatalf("unexpected first param value %#v", param1.Value)
	}

	param2 := mustParamNode(t, graph, PythonCodeObjectDependencyKey("section-1", "param-2"))
	if param2.FullPathName != "Run_Section__value_2" {
		t.Fatalf("unexpected second param path %q", param2.FullPathName)
	}
	if literal, ok := param2.Value.(LiteralDependencyValue); !ok || literal.Payload != "2" {
		t.Fatalf("unexpected second param value %#v", param2.Value)
	}

	if _, ok := graph.FullPathNameToKey["Run_Section__value"]; !ok {
		t.Fatal("expected first param path to be indexed")
	}
	if _, ok := graph.FullPathNameToKey["Run_Section__value_2"]; !ok {
		t.Fatal("expected second param path to be indexed")
	}
	if len(graph.NodeOrder) != 3 {
		t.Fatalf("expected deterministic node order for section and params, got %#v", graph.NodeOrder)
	}
	if graph.NodeOrder[0] != PythonCodeObjectDependencyKey("section-1", "param-1") {
		t.Fatalf("unexpected first node order %#v", graph.NodeOrder)
	}
	if graph.NodeOrder[1] != PythonCodeObjectDependencyKey("section-1", "param-2") {
		t.Fatalf("unexpected second node order %#v", graph.NodeOrder)
	}
	if graph.NodeOrder[2] != PythonSectionDependencyKey("section-1") {
		t.Fatalf("unexpected third node order %#v", graph.NodeOrder)
	}
}

// GlobalVariables should export params directly at the top level instead of creating a section node wrapper.
func TestBuildPythonDependencyGraphGlobalVariablesExportsTopLevelParams(t *testing.T) {
	t.Parallel()

	project := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []projectstate.ProjectCodegenTarget{
			{Language: string(projectstate.CodeLanguagePython)},
		},
		TopLevelSectionIDs: []string{"globals"},
		SectionVariantMap: map[string]string{
			"globals": "globals-variant-1",
		},
		Sections: map[string]projectstate.Section{
			"globals": {
				ID:               "globals",
				Name:             "Global Variables",
				VariantIDs:       []string{"globals-variant-1"},
				DefaultVariantID: "globals-variant-1",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"globals-variant-1": {
				ID:     "globals-variant-1",
				ImplID: "globals-impl-1",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"globals-impl-1": {
				ID: "globals-impl-1",
				Payload: mustRawJSON(
					t,
					`{
						"id":"globals-impl-1",
						"type":"GlobalVariables",
						"topLevelParamId":"root-param",
						"codeObjVariantMap":{
							"root-param":"root-param-variant-1",
							"alpha":"alpha-variant-1"
						}
					}`,
				),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"root-param": {
				ID:               "root-param",
				Name:             "root",
				VariantIDs:       []string{"root-param-variant-1"},
				DefaultVariantID: "root-param-variant-1",
			},
			"alpha": {
				ID:               "alpha",
				Name:             "alpha",
				VariantIDs:       []string{"alpha-variant-1"},
				DefaultVariantID: "alpha-variant-1",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"root-param-variant-1": {
				ID:     "root-param-variant-1",
				ImplID: "root-param-impl-1",
			},
			"alpha-variant-1": {
				ID:     "alpha-variant-1",
				ImplID: "alpha-impl-1",
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"root-param-impl-1": {
				ID: "root-param-impl-1",
				Payload: mustRawJSON(
					t,
					`{"id":"root-param-impl-1","type":"NestedParam","children":["alpha"]}`,
				),
			},
			"alpha-impl-1": {
				ID: "alpha-impl-1",
				Payload: mustRawJSON(
					t,
					`{"id":"alpha-impl-1","type":"CodeParam","value":"42"}`,
				),
			},
		},
	}

	exported := mustPythonCodegenExport(t, project)
	graph, err := BuildPythonDependencyGraph(exported, PythonDependencyGraphOptions{})
	if err != nil {
		t.Fatalf("build python dependency graph: %v", err)
	}

	if _, ok := graph.Node(PythonSectionDependencyKey("globals")); ok {
		t.Fatal("did not expect a GlobalVariables section node")
	}
	paramNode := mustParamNode(t, graph, PythonCodeObjectDependencyKey("globals", "alpha"))
	if !paramNode.IsTopLevel {
		t.Fatal("expected global variable param to be top-level")
	}
	if paramNode.FullPathName != "alpha" {
		t.Fatalf("unexpected global variable path %q", paramNode.FullPathName)
	}
}

// Section payload conversion should preserve the current value-mode semantics that the future renderer will consume.
func TestBuildPythonDependencyGraphSectionValueModes(t *testing.T) {
	t.Parallel()

	t.Run("plugin", func(t *testing.T) {
		t.Parallel()

		project := singleSectionProject(
			t,
			"Plugin Section",
			mustRawJSON(t, `{"id":"section-impl-1","type":"Plugin","data":{"zeta":1,"alpha":"ok"}}`),
			nil,
			nil,
		)
		exported := mustPythonCodegenExport(t, project)
		graph, err := BuildPythonDependencyGraph(exported, PythonDependencyGraphOptions{})
		if err != nil {
			t.Fatalf("build plugin graph: %v", err)
		}
		node := mustSectionNode(t, graph, PythonSectionDependencyKey("section-1"))
		literal, ok := node.Value.(LiteralDependencyValue)
		if !ok {
			t.Fatalf("expected literal plugin value, got %#v", node.Value)
		}
		if literal.Payload != "{'alpha': 'ok', 'zeta': 1}" {
			t.Fatalf("unexpected plugin literal %q", literal.Payload)
		}
	})

	t.Run("chat fallback", func(t *testing.T) {
		t.Parallel()

		project := singleSectionProject(
			t,
			"Chat Section",
			mustRawJSON(
				t,
				`{
					"id":"section-impl-1",
					"type":"Chat",
					"messages":[],
					"inputText":"",
					"waitingForResponse":false,
					"toolCallArguments":{},
					"branches":{}
				}`,
			),
			mustRawJSON(
				t,
				`{
					"language":"python",
					"sectionPolicy":{
						"typePolicies":{
							"Chat":{"mode":"include","representation":"file_path"}
						}
					}
				}`,
			),
			nil,
		)
		exported := mustPythonCodegenExport(t, project)
		graph, err := BuildPythonDependencyGraph(exported, PythonDependencyGraphOptions{})
		if err != nil {
			t.Fatalf("build chat graph: %v", err)
		}
		node := mustSectionNode(t, graph, PythonSectionDependencyKey("section-1"))
		if node.Representation != projectstate.PythonSectionRepresentationExpression {
			t.Fatalf("expected expression fallback, got %q", node.Representation)
		}
		literal, ok := node.Value.(LiteralDependencyValue)
		if !ok {
			t.Fatalf("expected literal chat fallback, got %#v", node.Value)
		}
		expected := renderPythonLiteral(map[string]any{
			"messages":           []any{},
			"inputText":          "",
			"waitingForResponse": false,
			"toolCallArguments":  map[string]any{},
			"activeBranchId":     nil,
			"branches":           map[string]any{},
		})
		if literal.Payload != expected {
			t.Fatalf("unexpected chat fallback payload %q", literal.Payload)
		}
	})

	t.Run("draw file read", func(t *testing.T) {
		t.Parallel()

		project := singleSectionProject(
			t,
			"Draw Section",
			mustRawJSON(
				t,
				`{"id":"section-impl-1","type":"Draw","renderedImagePath":"artifacts/draw.png"}`,
			),
			mustRawJSON(
				t,
				`{
					"language":"python",
					"sectionPolicy":{
						"typePolicies":{
							"Draw":{"mode":"include","representation":"file_read"}
						}
					}
				}`,
			),
			nil,
		)
		exported := mustPythonCodegenExport(t, project)
		graph, err := BuildPythonDependencyGraph(exported, PythonDependencyGraphOptions{})
		if err != nil {
			t.Fatalf("build draw graph: %v", err)
		}
		node := mustSectionNode(t, graph, PythonSectionDependencyKey("section-1"))
		fileRead, ok := node.Value.(FileReadDependencyValue)
		if !ok {
			t.Fatalf("expected file_read draw value, got %#v", node.Value)
		}
		if fileRead.Path != "artifacts/draw.png" {
			t.Fatalf("unexpected draw path %q", fileRead.Path)
		}
	})

	t.Run("image file path fallback", func(t *testing.T) {
		t.Parallel()

		project := singleSectionProject(
			t,
			"Image Section",
			mustRawJSON(
				t,
				`{"id":"section-impl-1","type":"Image"}`,
			),
			mustRawJSON(
				t,
				`{
					"language":"python",
					"sectionPolicy":{
						"typePolicies":{
							"Image":{"mode":"include","representation":"file_path"}
						}
					}
				}`,
			),
			nil,
		)
		exported := mustPythonCodegenExport(t, project)
		graph, err := BuildPythonDependencyGraph(exported, PythonDependencyGraphOptions{})
		if err != nil {
			t.Fatalf("build image graph: %v", err)
		}
		node := mustSectionNode(t, graph, PythonSectionDependencyKey("section-1"))
		if node.Representation != projectstate.PythonSectionRepresentationExpression {
			t.Fatalf("expected expression fallback, got %q", node.Representation)
		}
		literal, ok := node.Value.(LiteralDependencyValue)
		if !ok {
			t.Fatalf("expected literal image fallback, got %#v", node.Value)
		}
		if literal.Payload != "None" {
			t.Fatalf("unexpected image fallback payload %q", literal.Payload)
		}
	})

	t.Run("task board literal", func(t *testing.T) {
		t.Parallel()

		project := singleSectionProject(
			t,
			"Task Board",
			mustRawJSON(
				t,
				`{
					"id":"section-impl-1",
					"type":"TaskBoard",
					"viewMode":"kanban",
					"columns":[{"id":"col-1","title":"Todo"}],
					"tasks":[{"id":"task-1","title":"Ship docs","columnId":"col-1"}]
				}`,
			),
			nil,
			nil,
		)
		exported := mustPythonCodegenExport(t, project)
		graph, err := BuildPythonDependencyGraph(exported, PythonDependencyGraphOptions{})
		if err != nil {
			t.Fatalf("build task board graph: %v", err)
		}
		node := mustSectionNode(t, graph, PythonSectionDependencyKey("section-1"))
		literal, ok := node.Value.(LiteralDependencyValue)
		if !ok {
			t.Fatalf("expected literal task board value, got %#v", node.Value)
		}
		expected := renderPythonLiteral(map[string]any{
			"viewMode": "kanban",
			"columns":  []any{map[string]any{"id": "col-1", "title": "Todo"}},
			"tasks":    []any{map[string]any{"id": "task-1", "title": "Ship docs", "columnId": "col-1"}},
		})
		if literal.Payload != expected {
			t.Fatalf("unexpected task board payload %q", literal.Payload)
		}
	})

	t.Run("spreadsheet literal", func(t *testing.T) {
		t.Parallel()

		project := singleSectionProject(
			t,
			"Sheet",
			mustRawJSON(
				t,
				`{
					"id":"section-impl-1",
					"type":"Spreadsheet",
					"filePath":"data/report.csv",
					"activeSheet":"Sheet 2",
					"readOnly":true,
					"showRowNumbers":false,
					"density":"compact",
					"autoReloadOnExternalChange":true
				}`,
			),
			nil,
			nil,
		)
		exported := mustPythonCodegenExport(t, project)
		graph, err := BuildPythonDependencyGraph(exported, PythonDependencyGraphOptions{})
		if err != nil {
			t.Fatalf("build spreadsheet graph: %v", err)
		}
		node := mustSectionNode(t, graph, PythonSectionDependencyKey("section-1"))
		literal, ok := node.Value.(LiteralDependencyValue)
		if !ok {
			t.Fatalf("expected literal spreadsheet value, got %#v", node.Value)
		}
		expected := renderPythonLiteral(map[string]any{
			"filePath":                   "data/report.csv",
			"activeSheet":                "Sheet 2",
			"readOnly":                   true,
			"showRowNumbers":             false,
			"density":                    "compact",
			"autoReloadOnExternalChange": true,
		})
		if literal.Payload != expected {
			t.Fatalf("unexpected spreadsheet payload %q", literal.Payload)
		}
	})
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
