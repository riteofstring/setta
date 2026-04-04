package realtime

import (
	"encoding/json"
	"testing"

	"setta/internal/codegen"
	"setta/internal/projectstate"
)

func TestBuildListenerRealtimeDependencyValuesFromGraphIncludesCompositeDependents(t *testing.T) {
	t.Parallel()

	countKey := codegen.PythonCodeObjectDependencyKey("controls", "count")
	sectionKey := codegen.PythonSectionDependencyKey("controls")
	graph := &codegen.PythonDependencyGraph{
		Nodes: map[codegen.PythonDependencyKey]codegen.PythonDependencyNode{
			countKey: &codegen.PythonParamNode{
				PythonDependencyNodeBase: codegen.PythonDependencyNodeBase{
					Name:             "count",
					FullPathName:     "section__count",
					Value:            codegen.LiteralDependencyValue{Payload: "1"},
					Deps:             map[codegen.PythonDependencyKey]bool{},
					IncludeInCodegen: true,
				},
				CodeObjectType:      "SliderParam",
				ValueRepresentation: projectstate.PythonCodeObjValueRepresentationExpression,
			},
			sectionKey: &codegen.PythonSectionNode{
				PythonDependencyNodeBase: codegen.PythonDependencyNodeBase{
					Name:             "controls",
					FullPathName:     "Controls",
					Deps:             map[codegen.PythonDependencyKey]bool{countKey: true},
					DepOrder:         []codegen.PythonDependencyKey{countKey},
					IncludeInCodegen: true,
				},
				SectionType: "Dict",
			},
		},
		NodeOrder: []codegen.PythonDependencyKey{countKey, sectionKey},
	}

	values, err := buildListenerRealtimeDependencyValuesFromGraph(graph, []ListenerRealtimeDelta{
		{
			Dependency: "controls.count",
			Value:      json.RawMessage(`{"type":"Literal","payload":"5"}`),
		},
	})
	if err != nil {
		t.Fatalf("build realtime dependency values: %v", err)
	}
	if values == nil {
		t.Fatal("expected realtime dependency values")
	}

	byKey := map[string]string{}
	for _, entry := range values.Entries {
		byKey[entry.DependencyKey] = entry.RenderedValue
	}

	if got := byKey["controls.count"]; got != "5" {
		t.Fatalf("expected child rendered value %q, got %q", "5", got)
	}
	if got := byKey["controls"]; got != "{'count': 5}" {
		t.Fatalf("expected parent rendered value %q, got %q", "{'count': 5}", got)
	}
}

func TestBuildListenerRealtimeDependencyValuesFromGraphUsesBinaryPayloadForDependents(t *testing.T) {
	t.Parallel()

	drawKey := codegen.PythonSectionDependencyKey("draw-section")
	parentKey := codegen.PythonSectionDependencyKey("assets")
	graph := &codegen.PythonDependencyGraph{
		Nodes: map[codegen.PythonDependencyKey]codegen.PythonDependencyNode{
			drawKey: &codegen.PythonSectionNode{
				PythonDependencyNodeBase: codegen.PythonDependencyNodeBase{
					Name:             "draw",
					FullPathName:     "input_image",
					Value:            codegen.FileReadDependencyValue{Path: "artifacts/draw.png"},
					Deps:             map[codegen.PythonDependencyKey]bool{},
					IncludeInCodegen: true,
				},
				SectionType:    "Draw",
				Representation: projectstate.PythonSectionRepresentationFileRead,
			},
			parentKey: &codegen.PythonSectionNode{
				PythonDependencyNodeBase: codegen.PythonDependencyNodeBase{
					Name:             "assets",
					FullPathName:     "Assets",
					Deps:             map[codegen.PythonDependencyKey]bool{drawKey: true},
					DepOrder:         []codegen.PythonDependencyKey{drawKey},
					IncludeInCodegen: true,
				},
				SectionType: "Dict",
			},
		},
		NodeOrder: []codegen.PythonDependencyKey{drawKey, parentKey},
	}

	values, err := buildListenerRealtimeDependencyValuesFromGraph(graph, []ListenerRealtimeDelta{
		{
			Dependency:    "draw-section",
			Value:         json.RawMessage(`{"type":"Binary","payload":{"contentId":"bin-1"}}`),
			BinaryPayload: []byte{0x00, 'A', 0xff},
		},
	})
	if err != nil {
		t.Fatalf("build realtime dependency values: %v", err)
	}
	if values == nil {
		t.Fatal("expected realtime dependency values")
	}

	byKey := map[string]string{}
	for _, entry := range values.Entries {
		byKey[entry.DependencyKey] = entry.RenderedValue
	}

	if got := byKey["draw-section"]; got != `b'\x00A\xff'` {
		t.Fatalf("expected draw rendered value %q, got %q", `b'\x00A\xff'`, got)
	}
	if got := byKey["assets"]; got != `{'draw': b'\x00A\xff'}` {
		t.Fatalf("expected parent rendered value %q, got %q", `{'draw': b'\x00A\xff'}`, got)
	}
}
