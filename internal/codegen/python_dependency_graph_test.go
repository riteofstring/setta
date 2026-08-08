package codegen

import (
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

	assertCallableSectionDependencyNode(t, graph)
	assertCallableParamDependencyNode(
		t,
		graph,
		PythonCodeObjectDependencyKey("section-1", "param-1"),
		"Run_Section__value",
		"1",
		"first",
	)
	assertCallableParamDependencyNode(
		t,
		graph,
		PythonCodeObjectDependencyKey("section-1", "param-2"),
		"Run_Section__value_2",
		"2",
		"second",
	)
	assertCallableGraphIndexesAndOrder(t, graph)
}

func assertCallableSectionDependencyNode(t *testing.T, graph *PythonDependencyGraph) {
	t.Helper()

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
}

func assertCallableParamDependencyNode(
	t *testing.T,
	graph *PythonDependencyGraph,
	key PythonDependencyKey,
	expectedPath string,
	expectedPayload string,
	label string,
) {
	t.Helper()

	paramNode := mustParamNode(t, graph, key)
	if paramNode.FullPathName != expectedPath {
		t.Fatalf("unexpected %s param path %q", label, paramNode.FullPathName)
	}
	if literal, ok := paramNode.Value.(LiteralDependencyValue); !ok || literal.Payload != expectedPayload {
		t.Fatalf("unexpected %s param value %#v", label, paramNode.Value)
	}
}

func assertCallableGraphIndexesAndOrder(t *testing.T, graph *PythonDependencyGraph) {
	t.Helper()

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

// Dict sections should export nested child sections into the dependency graph,
// so moving a section into a Dict updates generated Python immediately.
func TestBuildPythonDependencyGraphDictSectionExportsNestedChildSections(t *testing.T) {
	t.Parallel()

	project := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []projectstate.ProjectCodegenTarget{
			{Language: string(projectstate.CodeLanguagePython)},
		},
		TopLevelSectionIDs: []string{"dict-section"},
		SectionVariantMap: map[string]string{
			"dict-section": "dict-variant",
			"list-section": "list-variant",
		},
		Sections: map[string]projectstate.Section{
			"dict-section": {
				ID:               "dict-section",
				Name:             "Settings",
				VariantIDs:       []string{"dict-variant"},
				DefaultVariantID: "dict-variant",
			},
			"list-section": {
				ID:               "list-section",
				Name:             "Items",
				ParentSectionID:  "dict-section",
				VariantIDs:       []string{"list-variant"},
				DefaultVariantID: "list-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"dict-variant": {
				ID:     "dict-variant",
				ImplID: "dict-impl",
			},
			"list-variant": {
				ID:     "list-variant",
				ImplID: "list-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"dict-impl": {
				ID: "dict-impl",
				Payload: mustRawJSON(
					t,
					`{"id":"dict-impl","type":"Dict","children":["list-section"],"codeObjVariantMap":{}}`,
				),
			},
			"list-impl": {
				ID: "list-impl",
				Payload: mustRawJSON(
					t,
					`{"id":"list-impl","type":"ListRoot","children":[]}`,
				),
			},
		},
	}

	exported := mustPythonCodegenExport(t, project)
	graph, err := BuildPythonDependencyGraph(exported, PythonDependencyGraphOptions{})
	if err != nil {
		t.Fatalf("build python dependency graph: %v", err)
	}

	dictNode := mustSectionNode(t, graph, PythonSectionDependencyKey("dict-section"))
	childKey := PythonSectionDependencyKey("list-section")
	if !dictNode.Deps[childKey] {
		t.Fatalf("expected dict node to depend on nested child section, deps=%#v", dictNode.Deps)
	}
	if len(dictNode.DepOrder) != 1 || dictNode.DepOrder[0] != childKey {
		t.Fatalf("expected dict child order to include nested list section, got %#v", dictNode.DepOrder)
	}

	listNode := mustSectionNode(t, graph, childKey)
	if listNode.FullPathName != "Settings__Items" {
		t.Fatalf("unexpected nested list path %q", listNode.FullPathName)
	}
}

// Param nodes should preserve the resolved code-object value-policy representation from export.
func TestBuildPythonDependencyGraphParamNodesUseResolvedValuePolicyRepresentation(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name                string
		paramID             string
		pythonTargetPayload projectstate.RawJSON
		expected            projectstate.PythonCodeObjValueRepresentationMode
	}{
		{
			name:                "type policy representation",
			paramID:             "param-1",
			pythonTargetPayload: mustPythonCodeObjValuePolicyPayload(t, projectstate.PythonCodeObjValueRepresentationJSONParsed, "", ""),
			expected:            projectstate.PythonCodeObjValueRepresentationJSONParsed,
		},
		{
			name:                "override precedence",
			paramID:             "param-override",
			pythonTargetPayload: mustPythonCodeObjValuePolicyPayload(t, projectstate.PythonCodeObjValueRepresentationString, "param-override", projectstate.PythonCodeObjValueRepresentationJSONParsed),
			expected:            projectstate.PythonCodeObjValueRepresentationJSONParsed,
		},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			project := callableSectionProjectWithCodeObjValuePolicy(t, testCase.paramID, testCase.pythonTargetPayload)
			exported := mustPythonCodegenExport(t, project)
			graph, err := BuildPythonDependencyGraph(exported, PythonDependencyGraphOptions{})
			if err != nil {
				t.Fatalf("build python dependency graph: %v", err)
			}

			paramNode := mustParamNode(t, graph, PythonCodeObjectDependencyKey("section-1", testCase.paramID))
			if paramNode.ValueRepresentation != testCase.expected {
				t.Fatalf("expected value representation %q, got %q", testCase.expected, paramNode.ValueRepresentation)
			}
		})
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
func TestBuildPythonDependencyGraphPluginSectionValueMode(t *testing.T) {
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
}

func TestBuildPythonDependencyGraphChatSectionValueModeFallback(t *testing.T) {
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
}

func TestBuildPythonDependencyGraphDrawSectionValueModeFileRead(t *testing.T) {
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
}

func TestBuildPythonDependencyGraphImageSectionValueModeFilePathFallback(t *testing.T) {
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
}

func TestBuildPythonDependencyGraphTaskBoardSectionValueModeLiteral(t *testing.T) {
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
}

func TestBuildPythonDependencyGraphSpreadsheetSectionValueModeLiteral(t *testing.T) {
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
}

// MetaControl sections should export the control param literal and resolved value representation for later formatting.
func TestBuildPythonDependencyGraphMetaControlExportsControlValueAndRepresentation(t *testing.T) {
	t.Parallel()

	project := metaControlSectionProject(
		t,
		"text-control",
		"TextParam",
		"notes",
		mustRawJSON(
			t,
			`{
				"language":"python",
				"codeObjValuePolicy":{
					"codeObjOverrides":{
						"control-param-1":{"representation":"string"}
					}
				}
			}`,
		),
	)
	exported := mustPythonCodegenExport(t, project)
	graph, err := BuildPythonDependencyGraph(exported, PythonDependencyGraphOptions{})
	if err != nil {
		t.Fatalf("build meta control graph: %v", err)
	}

	node := mustSectionNode(t, graph, PythonSectionDependencyKey("section-1"))
	literal, ok := node.Value.(LiteralDependencyValue)
	if !ok {
		t.Fatalf("expected literal meta control value, got %#v", node.Value)
	}
	if literal.Payload != "notes" {
		t.Fatalf("expected meta control value %q, got %q", "notes", literal.Payload)
	}
	if node.ControlCodeObjType != "TextParam" {
		t.Fatalf("expected control type TextParam, got %q", node.ControlCodeObjType)
	}
	if node.ControlValueRepresentation != projectstate.PythonCodeObjValueRepresentationString {
		t.Fatalf("expected control value representation string, got %q", node.ControlValueRepresentation)
	}
}

// MetaControl export should honor the allowlist-derived include state and preserve expanded supported control types.
func TestBuildPythonDependencyGraphMetaControlAllowlistAndExpandedTypes(t *testing.T) {
	t.Parallel()

	t.Run("allowlist filter", func(t *testing.T) {
		t.Parallel()

		project := projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
			CodegenTargets: []projectstate.ProjectCodegenTarget{
				{
					Language: string(projectstate.CodeLanguagePython),
					Payload: mustRawJSON(
						t,
						`{
							"language":"python",
							"sectionPolicy":{
								"metaControlAllowlist":["TextParam"]
							}
						}`,
					),
				},
			},
			TopLevelSectionIDs: []string{"meta-text", "meta-slider"},
			SectionVariantMap: map[string]string{
				"meta-text":   "meta-text-variant-1",
				"meta-slider": "meta-slider-variant-1",
			},
			Sections: map[string]projectstate.Section{
				"meta-text": {
					ID:               "meta-text",
					Name:             "Meta Text",
					VariantIDs:       []string{"meta-text-variant-1"},
					DefaultVariantID: "meta-text-variant-1",
				},
				"meta-slider": {
					ID:               "meta-slider",
					Name:             "Meta Slider",
					VariantIDs:       []string{"meta-slider-variant-1"},
					DefaultVariantID: "meta-slider-variant-1",
				},
			},
			SectionVariants: map[string]projectstate.SectionVariant{
				"meta-text-variant-1": {
					ID:     "meta-text-variant-1",
					ImplID: "meta-text-impl-1",
				},
				"meta-slider-variant-1": {
					ID:     "meta-slider-variant-1",
					ImplID: "meta-slider-impl-1",
				},
			},
			SectionImpls: map[string]projectstate.SectionImpl{
				"meta-text-impl-1": {
					ID: "meta-text-impl-1",
					Payload: mustRawJSON(
						t,
						`{
							"id":"meta-text-impl-1",
							"type":"MetaControl",
							"metaControlParamId":"control-param-text",
							"codeObjVariantMap":{"control-param-text":"control-param-text-variant-1"}
						}`,
					),
				},
				"meta-slider-impl-1": {
					ID: "meta-slider-impl-1",
					Payload: mustRawJSON(
						t,
						`{
							"id":"meta-slider-impl-1",
							"type":"MetaControl",
							"metaControlParamId":"control-param-slider",
							"codeObjVariantMap":{"control-param-slider":"control-param-slider-variant-1"}
						}`,
					),
				},
			},
			CodeObjs: map[string]projectstate.CodeObject{
				"control-param-text": {
					ID:               "control-param-text",
					Name:             "text_control",
					VariantIDs:       []string{"control-param-text-variant-1"},
					DefaultVariantID: "control-param-text-variant-1",
				},
				"control-param-slider": {
					ID:               "control-param-slider",
					Name:             "slider_control",
					VariantIDs:       []string{"control-param-slider-variant-1"},
					DefaultVariantID: "control-param-slider-variant-1",
				},
			},
			CodeObjVariants: map[string]projectstate.CodeObjectVariant{
				"control-param-text-variant-1": {
					ID:     "control-param-text-variant-1",
					ImplID: "control-param-text-impl-1",
				},
				"control-param-slider-variant-1": {
					ID:     "control-param-slider-variant-1",
					ImplID: "control-param-slider-impl-1",
				},
			},
			CodeObjImpls: map[string]projectstate.CodeObjectImpl{
				"control-param-text-impl-1": {
					ID: "control-param-text-impl-1",
					Payload: mustRawJSON(
						t,
						`{"id":"control-param-text-impl-1","type":"TextParam","value":"notes"}`,
					),
				},
				"control-param-slider-impl-1": {
					ID: "control-param-slider-impl-1",
					Payload: mustRawJSON(
						t,
						`{"id":"control-param-slider-impl-1","type":"SliderParam","value":"42"}`,
					),
				},
			},
		}
		exported := mustPythonCodegenExport(t, project)
		graph, err := BuildPythonDependencyGraph(exported, PythonDependencyGraphOptions{})
		if err != nil {
			t.Fatalf("build allowlist graph: %v", err)
		}

		allowedNode := mustSectionNode(t, graph, PythonSectionDependencyKey("meta-text"))
		if !allowedNode.IncludeInCodegen {
			t.Fatal("expected allowlisted meta control section to stay included")
		}
		blockedNode := mustSectionNode(t, graph, PythonSectionDependencyKey("meta-slider"))
		if blockedNode.IncludeInCodegen {
			t.Fatal("expected blocked meta control section to be excluded")
		}
	})

	t.Run("expanded types", func(t *testing.T) {
		t.Parallel()

		testCases := []struct {
			name        string
			controlType string
			value       string
		}{
			{name: "rotary", controlType: "RotaryParam", value: "3"},
			{name: "text area", controlType: "TextAreaParam", value: "notes"},
		}

		for _, testCase := range testCases {
			testCase := testCase
			t.Run(testCase.name, func(t *testing.T) {
				t.Parallel()

				project := metaControlSectionProject(t, "meta-"+testCase.name, testCase.controlType, testCase.value, nil)
				exported := mustPythonCodegenExport(t, project)
				graph, err := BuildPythonDependencyGraph(exported, PythonDependencyGraphOptions{})
				if err != nil {
					t.Fatalf("build expanded meta control graph: %v", err)
				}

				node := mustSectionNode(t, graph, PythonSectionDependencyKey("section-1"))
				if node.ControlCodeObjType != testCase.controlType {
					t.Fatalf("expected control type %q, got %q", testCase.controlType, node.ControlCodeObjType)
				}
				if !node.IncludeInCodegen {
					t.Fatal("expected supported meta control type to stay included")
				}
			})
		}
	})
}

// Plugin sections should register their sanitized full-path name in the lookup map used by dependency references.
func TestBuildPythonDependencyGraphPluginSectionRegistersFullPathLookup(t *testing.T) {
	t.Parallel()

	project := singleSectionProject(
		t,
		"Plugin Section",
		mustRawJSON(t, `{"id":"section-impl-1","type":"Plugin","data":{}}`),
		nil,
		nil,
	)
	exported := mustPythonCodegenExport(t, project)
	graph, err := BuildPythonDependencyGraph(exported, PythonDependencyGraphOptions{})
	if err != nil {
		t.Fatalf("build plugin graph: %v", err)
	}

	key, ok := graph.FullPathNameToKey["Plugin_Section"]
	if !ok {
		t.Fatal("expected plugin section full path to be indexed")
	}
	if key != PythonSectionDependencyKey("section-1") {
		t.Fatalf("unexpected plugin section key %#v", key)
	}
}

// Prompt exports plus Chat/Draw/Image file-mode branches should preserve the documented payloads and fallbacks end to end.
func TestBuildPythonDependencyGraphSectionValueModesCoverPromptAndFileModeMatrix(t *testing.T) {
	t.Parallel()

	chatFallbackLiteral := renderPythonLiteral(map[string]any{
		"messages":           []any{map[string]any{"role": "user", "content": "Hello"}},
		"inputText":          "Draft",
		"waitingForResponse": true,
		"toolCallArguments":  map[string]any{"tool.alpha": map[string]any{"count": 2}},
		"activeBranchId":     "branch-main",
		"branches":           map[string]any{"branch-main": map[string]any{"title": "Main"}},
	})

	testCases := []struct {
		name                   string
		sectionName            string
		sectionPayload         projectstate.RawJSON
		pythonTargetPayload    projectstate.RawJSON
		expectedRepresentation projectstate.PythonSectionRepresentationMode
		expectedValueKind      string
		expectedPayload        string
	}{
		{
			name:                   "prompt rendered text literal",
			sectionName:            "Prompt Section",
			sectionPayload:         mustRawJSON(t, `{"id":"section-impl-1","type":"Prompt","renderedText":"Hello \"Ada\"\nSecond line"}`),
			pythonTargetPayload:    mustPythonSectionTypePolicyPayload(t, "Prompt", projectstate.PythonSectionRepresentationExpression),
			expectedRepresentation: projectstate.PythonSectionRepresentationExpression,
			expectedValueKind:      "literal",
			expectedPayload:        "Hello \"Ada\"\nSecond line",
		},
		{
			name:                   "chat file path happy path",
			sectionName:            "Chat Section",
			sectionPayload:         mustRawJSON(t, `{"id":"section-impl-1","type":"Chat","chatId":"chat-123","messages":[],"inputText":"","waitingForResponse":false,"toolCallArguments":{},"branches":{}}`),
			pythonTargetPayload:    mustPythonSectionTypePolicyPayload(t, "Chat", projectstate.PythonSectionRepresentationFilePath),
			expectedRepresentation: projectstate.PythonSectionRepresentationFilePath,
			expectedValueKind:      "literal",
			expectedPayload:        "setta_files/chats/chat-123.json",
		},
		{
			name:        "chat file path fallback",
			sectionName: "Chat Section",
			sectionPayload: mustRawJSON(
				t,
				`{
					"id":"section-impl-1",
					"type":"Chat",
					"messages":[{"role":"user","content":"Hello"}],
					"inputText":"Draft",
					"waitingForResponse":true,
					"toolCallArguments":{"tool.alpha":{"count":2}},
					"activeBranchId":"branch-main",
					"branches":{"branch-main":{"title":"Main"}}
				}`,
			),
			pythonTargetPayload:    mustPythonSectionTypePolicyPayload(t, "Chat", projectstate.PythonSectionRepresentationFilePath),
			expectedRepresentation: projectstate.PythonSectionRepresentationExpression,
			expectedValueKind:      "literal",
			expectedPayload:        chatFallbackLiteral,
		},
		{
			name:                   "chat file read happy path",
			sectionName:            "Chat Section",
			sectionPayload:         mustRawJSON(t, `{"id":"section-impl-1","type":"Chat","chatId":"chat-456","messages":[],"inputText":"","waitingForResponse":false,"toolCallArguments":{},"branches":{}}`),
			pythonTargetPayload:    mustPythonSectionTypePolicyPayload(t, "Chat", projectstate.PythonSectionRepresentationFileRead),
			expectedRepresentation: projectstate.PythonSectionRepresentationFileRead,
			expectedValueKind:      "file_read",
			expectedPayload:        "setta_files/chats/chat-456.json",
		},
		{
			name:        "chat file read fallback",
			sectionName: "Chat Section",
			sectionPayload: mustRawJSON(
				t,
				`{
					"id":"section-impl-1",
					"type":"Chat",
					"messages":[{"role":"user","content":"Hello"}],
					"inputText":"Draft",
					"waitingForResponse":true,
					"toolCallArguments":{"tool.alpha":{"count":2}},
					"activeBranchId":"branch-main",
					"branches":{"branch-main":{"title":"Main"}}
				}`,
			),
			pythonTargetPayload:    mustPythonSectionTypePolicyPayload(t, "Chat", projectstate.PythonSectionRepresentationFileRead),
			expectedRepresentation: projectstate.PythonSectionRepresentationExpression,
			expectedValueKind:      "literal",
			expectedPayload:        chatFallbackLiteral,
		},
		{
			name:                   "draw file path happy path",
			sectionName:            "Draw Section",
			sectionPayload:         mustRawJSON(t, `{"id":"section-impl-1","type":"Draw","renderedImagePath":"artifacts/draw-path.png"}`),
			pythonTargetPayload:    mustPythonSectionTypePolicyPayload(t, "Draw", projectstate.PythonSectionRepresentationFilePath),
			expectedRepresentation: projectstate.PythonSectionRepresentationFilePath,
			expectedValueKind:      "literal",
			expectedPayload:        "artifacts/draw-path.png",
		},
		{
			name:                   "draw file path fallback",
			sectionName:            "Draw Section",
			sectionPayload:         mustRawJSON(t, `{"id":"section-impl-1","type":"Draw"}`),
			pythonTargetPayload:    mustPythonSectionTypePolicyPayload(t, "Draw", projectstate.PythonSectionRepresentationFilePath),
			expectedRepresentation: projectstate.PythonSectionRepresentationExpression,
			expectedValueKind:      "literal",
			expectedPayload:        "None",
		},
		{
			name:                   "draw file read happy path",
			sectionName:            "Draw Section",
			sectionPayload:         mustRawJSON(t, `{"id":"section-impl-1","type":"Draw","renderedImagePath":"artifacts/draw-read.png"}`),
			pythonTargetPayload:    mustPythonSectionTypePolicyPayload(t, "Draw", projectstate.PythonSectionRepresentationFileRead),
			expectedRepresentation: projectstate.PythonSectionRepresentationFileRead,
			expectedValueKind:      "file_read",
			expectedPayload:        "artifacts/draw-read.png",
		},
		{
			name:                   "draw file read fallback",
			sectionName:            "Draw Section",
			sectionPayload:         mustRawJSON(t, `{"id":"section-impl-1","type":"Draw"}`),
			pythonTargetPayload:    mustPythonSectionTypePolicyPayload(t, "Draw", projectstate.PythonSectionRepresentationFileRead),
			expectedRepresentation: projectstate.PythonSectionRepresentationExpression,
			expectedValueKind:      "literal",
			expectedPayload:        "None",
		},
		{
			name:                   "image file path happy path",
			sectionName:            "Image Section",
			sectionPayload:         mustRawJSON(t, `{"id":"section-impl-1","type":"Image","imagePath":"artifacts/image-path.png"}`),
			pythonTargetPayload:    mustPythonSectionTypePolicyPayload(t, "Image", projectstate.PythonSectionRepresentationFilePath),
			expectedRepresentation: projectstate.PythonSectionRepresentationFilePath,
			expectedValueKind:      "literal",
			expectedPayload:        "artifacts/image-path.png",
		},
		{
			name:                   "image file path fallback",
			sectionName:            "Image Section",
			sectionPayload:         mustRawJSON(t, `{"id":"section-impl-1","type":"Image"}`),
			pythonTargetPayload:    mustPythonSectionTypePolicyPayload(t, "Image", projectstate.PythonSectionRepresentationFilePath),
			expectedRepresentation: projectstate.PythonSectionRepresentationExpression,
			expectedValueKind:      "literal",
			expectedPayload:        "None",
		},
		{
			name:                   "image file read happy path",
			sectionName:            "Image Section",
			sectionPayload:         mustRawJSON(t, `{"id":"section-impl-1","type":"Image","imagePath":"artifacts/image-read.png"}`),
			pythonTargetPayload:    mustPythonSectionTypePolicyPayload(t, "Image", projectstate.PythonSectionRepresentationFileRead),
			expectedRepresentation: projectstate.PythonSectionRepresentationFileRead,
			expectedValueKind:      "file_read",
			expectedPayload:        "artifacts/image-read.png",
		},
		{
			name:                   "image file read fallback",
			sectionName:            "Image Section",
			sectionPayload:         mustRawJSON(t, `{"id":"section-impl-1","type":"Image"}`),
			pythonTargetPayload:    mustPythonSectionTypePolicyPayload(t, "Image", projectstate.PythonSectionRepresentationFileRead),
			expectedRepresentation: projectstate.PythonSectionRepresentationExpression,
			expectedValueKind:      "literal",
			expectedPayload:        "None",
		},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			project := singleSectionProject(
				t,
				testCase.sectionName,
				testCase.sectionPayload,
				testCase.pythonTargetPayload,
				nil,
			)
			exported := mustPythonCodegenExport(t, project)
			graph, err := BuildPythonDependencyGraph(exported, PythonDependencyGraphOptions{})
			if err != nil {
				t.Fatalf("build dependency graph: %v", err)
			}

			node := mustSectionNode(t, graph, PythonSectionDependencyKey("section-1"))
			if node.Representation != testCase.expectedRepresentation {
				t.Fatalf("expected representation %q, got %q", testCase.expectedRepresentation, node.Representation)
			}
			switch testCase.expectedValueKind {
			case "literal":
				literal, ok := node.Value.(LiteralDependencyValue)
				if !ok {
					t.Fatalf("expected literal value, got %#v", node.Value)
				}
				if literal.Payload != testCase.expectedPayload {
					t.Fatalf("expected literal payload %q, got %q", testCase.expectedPayload, literal.Payload)
				}
			case "file_read":
				fileRead, ok := node.Value.(FileReadDependencyValue)
				if !ok {
					t.Fatalf("expected file_read value, got %#v", node.Value)
				}
				if fileRead.Path != testCase.expectedPayload {
					t.Fatalf("expected file_read path %q, got %q", testCase.expectedPayload, fileRead.Path)
				}
			default:
				t.Fatalf("unsupported expected value kind %q", testCase.expectedValueKind)
			}
		})
	}
}
