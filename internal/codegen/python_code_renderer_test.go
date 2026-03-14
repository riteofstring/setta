package codegen

import "testing"

func TestPythonCodeRendererDictSectionRendersMultilineValues(t *testing.T) {
	t.Parallel()

	paramKeys := []PythonDependencyKey{
		PythonCodeObjectDependencyKey("section-1", "param-1"),
		PythonCodeObjectDependencyKey("section-1", "param-2"),
		PythonCodeObjectDependencyKey("section-1", "param-3"),
		PythonCodeObjectDependencyKey("section-1", "param-4"),
	}
	nodes := map[PythonDependencyKey]PythonDependencyNode{}
	for index, key := range paramKeys {
		nodes[key] = &PythonParamNode{
			PythonDependencyNodeBase: PythonDependencyNodeBase{
				ID:               key.CodeObjectID,
				Name:             "param_" + string(rune('0'+index)),
				FullPathName:     "config__param_" + string(rune('0'+index)),
				Deps:             map[PythonDependencyKey]bool{},
				IncludeInCodegen: true,
				Value:            LiteralDependencyValue{Payload: string(rune('0' + index))},
			},
			CodeObjectType: "CodeParam",
		}
	}
	sectionKey := PythonSectionDependencyKey("section-1")
	nodes[sectionKey] = &PythonSectionNode{
		PythonDependencyNodeBase: PythonDependencyNodeBase{
			ID:               "section-1",
			Name:             "config",
			FullPathName:     "config",
			IsTopLevel:       true,
			Deps:             map[PythonDependencyKey]bool{},
			DepOrder:         append([]PythonDependencyKey(nil), paramKeys...),
			IncludeInCodegen: true,
		},
		SectionType: "Dict",
	}
	for _, key := range paramKeys {
		nodes[sectionKey].Base().Deps[key] = true
	}
	graph := &PythonDependencyGraph{
		Nodes:     nodes,
		NodeOrder: append(append([]PythonDependencyKey(nil), paramKeys...), sectionKey),
	}

	renderer := NewPythonCodeRenderer(graph, "", "", PythonCodeRendererOptions{})
	renderer.GenerateCode()
	generatedLines := splitLines(renderer.GeneratedCode)

	targetIndex := -1
	for index, line := range generatedLines {
		if line == "        state.config = {" {
			targetIndex = index
			break
		}
	}
	if targetIndex == -1 {
		t.Fatalf("expected config assignment in generated code:\n%s", renderer.GeneratedCode)
	}
	expected := []string{
		"            'param_0': state.config__param_0,",
		"            'param_1': state.config__param_1,",
		"            'param_2': state.config__param_2,",
		"            'param_3': state.config__param_3,",
	}
	for offset, line := range expected {
		if generatedLines[targetIndex+1+offset] != line {
			t.Fatalf("unexpected dict item line %d: %q", offset, generatedLines[targetIndex+1+offset])
		}
	}
	if generatedLines[targetIndex+1+len(expected)] != "        }" {
		t.Fatalf("unexpected dict closing line %q", generatedLines[targetIndex+1+len(expected)])
	}
}

func TestPythonCodeRendererCallableSectionRendersMultilineArgs(t *testing.T) {
	t.Parallel()

	paramKeys := []PythonDependencyKey{
		PythonCodeObjectDependencyKey("section-1", "param-1"),
		PythonCodeObjectDependencyKey("section-1", "param-2"),
		PythonCodeObjectDependencyKey("section-1", "param-3"),
		PythonCodeObjectDependencyKey("section-1", "param-4"),
	}
	nodes := map[PythonDependencyKey]PythonDependencyNode{}
	for index, key := range paramKeys {
		nodes[key] = &PythonParamNode{
			PythonDependencyNodeBase: PythonDependencyNodeBase{
				ID:               key.CodeObjectID,
				Name:             "param_" + string(rune('0'+index)),
				FullPathName:     "call__param_" + string(rune('0'+index)),
				Deps:             map[PythonDependencyKey]bool{},
				IncludeInCodegen: true,
				Value:            LiteralDependencyValue{Payload: string(rune('0' + index))},
			},
			CodeObjectType: "CodeParam",
		}
	}
	sectionKey := PythonSectionDependencyKey("section-1")
	nodes[sectionKey] = &PythonSectionNode{
		PythonDependencyNodeBase: PythonDependencyNodeBase{
			ID:               "section-1",
			Name:             "call",
			FullPathName:     "call",
			IsTopLevel:       true,
			Deps:             map[PythonDependencyKey]bool{},
			DepOrder:         append([]PythonDependencyKey(nil), paramKeys...),
			IncludeInCodegen: true,
			Value:            LiteralDependencyValue{Payload: "my_callable"},
		},
		SectionType: "Callable",
	}
	for _, key := range paramKeys {
		nodes[sectionKey].Base().Deps[key] = true
		nodes[key].(*PythonParamNode).PassingStyle = "KEYWORD_ONLY"
	}
	graph := &PythonDependencyGraph{
		Nodes:     nodes,
		NodeOrder: append(append([]PythonDependencyKey(nil), paramKeys...), sectionKey),
	}

	renderer := NewPythonCodeRenderer(graph, "", "", PythonCodeRendererOptions{})
	renderer.GenerateCode()
	generatedLines := splitLines(renderer.GeneratedCode)

	targetIndex := -1
	for index, line := range generatedLines {
		if line == "        state.call = my_callable(" {
			targetIndex = index
			break
		}
	}
	if targetIndex == -1 {
		t.Fatalf("expected callable assignment in generated code:\n%s", renderer.GeneratedCode)
	}
	expected := []string{
		"            param_0=state.call__param_0,",
		"            param_1=state.call__param_1,",
		"            param_2=state.call__param_2,",
		"            param_3=state.call__param_3,",
	}
	for offset, line := range expected {
		if generatedLines[targetIndex+1+offset] != line {
			t.Fatalf("unexpected callable item line %d: %q", offset, generatedLines[targetIndex+1+offset])
		}
	}
	if generatedLines[targetIndex+1+len(expected)] != "        )" {
		t.Fatalf("unexpected callable closing line %q", generatedLines[targetIndex+1+len(expected)])
	}
}

func TestPythonCodeRendererIncludesHelperImportBlock(t *testing.T) {
	t.Parallel()

	sectionKey := PythonSectionDependencyKey("draw")
	graph := &PythonDependencyGraph{
		Nodes: map[PythonDependencyKey]PythonDependencyNode{
			sectionKey: &PythonSectionNode{
				PythonDependencyNodeBase: PythonDependencyNodeBase{
					ID:               "draw",
					Name:             "draw",
					FullPathName:     "draw",
					IsTopLevel:       true,
					Deps:             map[PythonDependencyKey]bool{},
					IncludeInCodegen: true,
					Value:            FileReadDependencyValue{Path: "/tmp/draw.png"},
				},
				SectionType:    "Draw",
				Representation: "file_read",
			},
		},
		NodeOrder: []PythonDependencyKey{sectionKey},
	}

	renderer := NewPythonCodeRenderer(graph, "", "", PythonCodeRendererOptions{
		ValueMode: PythonValueModePackagedRuntime,
	})
	renderer.GenerateCode()

	expectedPrefix := "from setta.code_gen.python import value_helpers as _setta_value_helpers\nclass SettaState:\n    def __init__(state):\n"
	if renderer.GeneratedCode[:len(expectedPrefix)] != expectedPrefix {
		t.Fatalf("unexpected helper import block:\n%s", renderer.GeneratedCode)
	}
}

func TestPythonCodeRendererTracksVarNamesAndPluginAssignments(t *testing.T) {
	t.Parallel()

	sectionKey := PythonSectionDependencyKey("plugin")
	graph := &PythonDependencyGraph{
		Nodes: map[PythonDependencyKey]PythonDependencyNode{
			sectionKey: &PythonSectionNode{
				PythonDependencyNodeBase: PythonDependencyNodeBase{
					ID:               "plugin",
					Name:             "plugin_data",
					FullPathName:     "plugin_data",
					IsTopLevel:       true,
					Deps:             map[PythonDependencyKey]bool{},
					IncludeInCodegen: true,
					Value:            LiteralDependencyValue{Payload: "{'alpha': 1, 'beta': 'ok'}"},
				},
				SectionType: "Plugin",
			},
		},
		NodeOrder: []PythonDependencyKey{sectionKey},
	}

	renderer := NewPythonCodeRenderer(graph, "", "", PythonCodeRendererOptions{})
	renderer.GenerateCode()

	if renderer.VarNameMapping[sectionKey] != "state.plugin_data" {
		t.Fatalf("unexpected var name mapping %#v", renderer.VarNameMapping)
	}
	if !containsSubstring(renderer.GeneratedCode, "state.plugin_data = {'alpha': 1, 'beta': 'ok'}") {
		t.Fatalf("expected plugin assignment in generated code:\n%s", renderer.GeneratedCode)
	}
}

func containsSubstring(value string, fragment string) bool {
	if len(fragment) == 0 {
		return true
	}
	for start := 0; start+len(fragment) <= len(value); start++ {
		if value[start:start+len(fragment)] == fragment {
			return true
		}
	}
	return false
}
