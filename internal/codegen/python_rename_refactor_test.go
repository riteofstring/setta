package codegen

import (
	"reflect"
	"testing"

	"setta/internal/projectstate"
)

// The graph needs exact attr positions, not just dependency edges, so rename
// planning can update every occurrence deterministically.
func TestBuildPythonDependencyGraphRetainsRepeatedPotentialRefPositions(t *testing.T) {
	t.Parallel()

	project := pythonRenameReferenceProject(t, "state.Source_Section + state.Source_Section")
	graph, err := BuildPythonDependencyGraph(mustPythonCodegenExport(t, project), PythonDependencyGraphOptions{})
	if err != nil {
		t.Fatalf("build python dependency graph: %v", err)
	}

	paramKey := PythonCodeObjectDependencyKey("consumer", "consumer-param")
	positions := graph.PotentialRefs[paramKey]["Source_Section"]
	if !reflect.DeepEqual(positions, []int{6, 29}) {
		t.Fatalf("expected repeated ref positions [6 29], got %#v", positions)
	}
}

// Section rename planning should rewrite every parser-backed reference to the
// renamed section path without guessing from plain text.
func TestPlanPythonRenameReferenceChangedValuesUpdatesAllOccurrences(t *testing.T) {
	t.Parallel()

	oldProject := pythonRenameReferenceProject(t, "state.Source_Section + state.Source_Section")
	oldGraph, err := BuildPythonDependencyGraph(mustPythonCodegenExport(t, oldProject), PythonDependencyGraphOptions{})
	if err != nil {
		t.Fatalf("build old python dependency graph: %v", err)
	}

	newProject := oldProject.Clone()
	if err := newProject.SetSectionName("source", "Renamed Section"); err != nil {
		t.Fatalf("rename source section: %v", err)
	}
	newGraph, err := BuildPythonDependencyGraph(mustPythonCodegenExport(t, newProject), PythonDependencyGraphOptions{})
	if err != nil {
		t.Fatalf("build new python dependency graph: %v", err)
	}

	changedValues, err := PlanPythonRenameReferenceChangedValues(oldGraph, newGraph)
	if err != nil {
		t.Fatalf("plan python rename reference changed values: %v", err)
	}
	if len(changedValues) != 1 {
		t.Fatalf("expected one changed value, got %#v", changedValues)
	}
	if changedValues[0].DepKey != PythonCodeObjectDependencyKey("consumer", "consumer-param") {
		t.Fatalf("unexpected changed dep key %#v", changedValues[0].DepKey)
	}
	if changedValues[0].NewValue != "state.Renamed_Section + state.Renamed_Section" {
		t.Fatalf("unexpected renamed value %q", changedValues[0].NewValue)
	}
}

// Shadowed `state` variables should remain out of the rename plan because the
// parser-backed extractor should treat them as local names, not graph refs.
func TestPlanPythonRenameReferenceChangedValuesSkipsShadowedState(t *testing.T) {
	t.Parallel()

	oldProject := pythonRenameReferenceProject(t, "lambda state: state.Source_Section")
	oldGraph, err := BuildPythonDependencyGraph(mustPythonCodegenExport(t, oldProject), PythonDependencyGraphOptions{})
	if err != nil {
		t.Fatalf("build old python dependency graph: %v", err)
	}

	newProject := oldProject.Clone()
	if err := newProject.SetSectionName("source", "Renamed Section"); err != nil {
		t.Fatalf("rename source section: %v", err)
	}
	newGraph, err := BuildPythonDependencyGraph(mustPythonCodegenExport(t, newProject), PythonDependencyGraphOptions{})
	if err != nil {
		t.Fatalf("build new python dependency graph: %v", err)
	}

	changedValues, err := PlanPythonRenameReferenceChangedValues(oldGraph, newGraph)
	if err != nil {
		t.Fatalf("plan python rename reference changed values: %v", err)
	}
	if len(changedValues) != 0 {
		t.Fatalf("expected no changed values for shadowed state reference, got %#v", changedValues)
	}
}

func pythonRenameReferenceProject(t *testing.T, paramValue string) projectstate.Project {
	t.Helper()

	return projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []projectstate.ProjectCodegenTarget{
			{Language: string(projectstate.CodeLanguagePython)},
		},
		TopLevelSectionIDs: []string{"source", "consumer"},
		SectionVariantMap: map[string]string{
			"source":   "source-variant-1",
			"consumer": "consumer-variant-1",
		},
		Sections: map[string]projectstate.Section{
			"source": {
				ID:               "source",
				Name:             "Source Section",
				VariantIDs:       []string{"source-variant-1"},
				DefaultVariantID: "source-variant-1",
			},
			"consumer": {
				ID:               "consumer",
				Name:             "Consumer",
				VariantIDs:       []string{"consumer-variant-1"},
				DefaultVariantID: "consumer-variant-1",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"source-variant-1": {
				ID:     "source-variant-1",
				ImplID: "source-impl-1",
			},
			"consumer-variant-1": {
				ID:     "consumer-variant-1",
				ImplID: "consumer-impl-1",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"source-impl-1": {
				ID: "source-impl-1",
				Payload: mustRawJSON(
					t,
					`{
						"id":"source-impl-1",
						"type":"Callable",
						"callable":"source-callable",
						"codeObjVariantMap":{
							"source-callable":"source-callable-variant-1"
						}
					}`,
				),
			},
			"consumer-impl-1": {
				ID: "consumer-impl-1",
				Payload: mustRawJSON(
					t,
					`{
						"id":"consumer-impl-1",
						"type":"Callable",
						"callable":"consumer-callable",
						"codeObjVariantMap":{
							"consumer-callable":"consumer-callable-variant-1",
							"consumer-param":"consumer-param-variant-1"
						}
					}`,
				),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"source-callable": {
				ID:               "source-callable",
				Name:             "build_source",
				VariantIDs:       []string{"source-callable-variant-1"},
				DefaultVariantID: "source-callable-variant-1",
			},
			"consumer-callable": {
				ID:               "consumer-callable",
				Name:             "consume",
				VariantIDs:       []string{"consumer-callable-variant-1"},
				DefaultVariantID: "consumer-callable-variant-1",
			},
			"consumer-param": {
				ID:               "consumer-param",
				Name:             "script",
				VariantIDs:       []string{"consumer-param-variant-1"},
				DefaultVariantID: "consumer-param-variant-1",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"source-callable-variant-1": {
				ID:     "source-callable-variant-1",
				ImplID: "source-callable-impl-1",
			},
			"consumer-callable-variant-1": {
				ID:     "consumer-callable-variant-1",
				ImplID: "consumer-callable-impl-1",
			},
			"consumer-param-variant-1": {
				ID:     "consumer-param-variant-1",
				ImplID: "consumer-param-impl-1",
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"source-callable-impl-1": {
				ID: "source-callable-impl-1",
				Payload: mustRawJSON(
					t,
					`{"id":"source-callable-impl-1","type":"CodeCallable","children":[]}`,
				),
			},
			"consumer-callable-impl-1": {
				ID: "consumer-callable-impl-1",
				Payload: mustRawJSON(
					t,
					`{"id":"consumer-callable-impl-1","type":"CodeCallable","children":["consumer-param"]}`,
				),
			},
			"consumer-param-impl-1": {
				ID: "consumer-param-impl-1",
				Payload: mustRawJSON(
					t,
					`{"id":"consumer-param-impl-1","type":"CodeParam","value":`+mustJSONString(t, paramValue)+`}`,
				),
			},
		},
	}
}
