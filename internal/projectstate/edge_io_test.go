package projectstate

import (
	"context"
	"fmt"
	"reflect"
	"testing"
)

// Edge-input writes should convert newly selected params into CodeParam ports
// and remove any incoming edges that target ports no longer exposed.
func TestRuntimeSetSectionEdgeInputsConvertsAddedParamAndRemovesDeletedEdges(t *testing.T) {
	t.Parallel()

	runtime := openEdgeIOTestRuntime(t)

	if _, err := runtime.SetSectionEdgeInputs(
		context.Background(),
		"project-alpha",
		"dict-section",
		[]string{" added-param ", "added-param"},
	); err != nil {
		t.Fatalf("SetSectionEdgeInputs returned error: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	payload, err := effectiveSectionPayload(project, "dict-section", "dict-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload dict-section: %v", err)
	}
	if got := payloadStringArrayField(payload, "edgeInputParams"); !reflect.DeepEqual(got, []string{"added-param"}) {
		t.Fatalf("expected edgeInputParams [added-param], got %#v", got)
	}

	addedPayload, _, _, addedImpl, err := project.ResolveSectionCodeObject("dict-section", "added-param")
	if err != nil {
		t.Fatalf("resolve added-param after edge-input write: %v", err)
	}
	if got := effectiveCodeObjType(addedPayload, addedImpl); got != codeParamType {
		t.Fatalf("expected added-param to convert to CodeParam, got %q", got)
	}
	if got := payloadRawStringField(addedPayload, "value"); got != "typed" {
		t.Fatalf("expected added-param value typed after conversion, got %q", got)
	}

	targetPayload, _, _, targetImpl, err := project.ResolveSectionCodeObject("dict-section", "target-param")
	if err != nil {
		t.Fatalf("resolve target-param after edge-input write: %v", err)
	}
	if got := effectiveCodeObjType(targetPayload, targetImpl); got != codeParamType {
		t.Fatalf("expected target-param to remain CodeParam, got %q", got)
	}
	if got := payloadRawStringField(targetPayload, "value"); got != "" {
		t.Fatalf("expected removed target port value to clear, got %q", got)
	}

	if len(project.Edges) != 1 {
		t.Fatalf("expected one remaining edge after removing the deleted input target, got %#v", project.Edges)
	}
	if got := project.Edges[0].SourcePortID; got != "result" {
		t.Fatalf("expected outgoing result edge to remain, got %#v", project.Edges)
	}
}

// GlobalVariables shares the same caller-backed kwargs and edge-input surface,
// so it must support the same param-impl conversion path as Dict and Callable.
func TestRuntimeSetSectionEdgeInputsSupportsGlobalVariables(t *testing.T) {
	t.Parallel()

	runtime := openEdgeIOTestRuntime(t)

	if _, err := runtime.SetSectionEdgeInputs(
		context.Background(),
		"project-alpha",
		"global-section",
		[]string{"global-param"},
	); err != nil {
		t.Fatalf("SetSectionEdgeInputs global-section returned error: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	payload, err := effectiveSectionPayload(project, "global-section", "global-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload global-section: %v", err)
	}
	if got := payloadStringArrayField(payload, "edgeInputParams"); !reflect.DeepEqual(got, []string{"global-param"}) {
		t.Fatalf("expected global edgeInputParams [global-param], got %#v", got)
	}

	globalPayload, _, _, globalImpl, err := project.ResolveSectionCodeObject("global-section", "global-param")
	if err != nil {
		t.Fatalf("resolve global-param after edge-input write: %v", err)
	}
	if got := effectiveCodeObjType(globalPayload, globalImpl); got != codeParamType {
		t.Fatalf("expected global-param to convert to CodeParam, got %q", got)
	}
	if got := payloadRawStringField(globalPayload, "value"); got != "global" {
		t.Fatalf("expected global-param value global after conversion, got %q", got)
	}
}

// Edge-output writes should trim accessors, dedupe duplicate port ids, and
// remove outgoing edges that point at ports no longer exposed.
func TestRuntimeSetSectionEdgeOutputsTrimsPortsAndRemovesDeletedEdges(t *testing.T) {
	t.Parallel()

	runtime := openEdgeIOTestRuntime(t)

	if _, err := runtime.SetSectionEdgeOutputs(
		context.Background(),
		"project-alpha",
		"dict-section",
		[]EdgePort{
			{ID: "new-port", Accessor: "  .result  "},
			{ID: "new-port", Accessor: ".ignored"},
		},
		nil,
	); err != nil {
		t.Fatalf("SetSectionEdgeOutputs returned error: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	payload, err := effectiveSectionPayload(project, "dict-section", "dict-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload dict-section after outputs: %v", err)
	}
	if got := payloadEdgeOutputPorts(payload); !reflect.DeepEqual(got, []EdgePort{{ID: "new-port", Accessor: ".result"}}) {
		t.Fatalf("expected normalized edgeOutputPorts [{new-port .result}], got %#v", got)
	}

	sinkPayload, _, _, sinkImpl, err := project.ResolveSectionCodeObject("sink-section", "sink-param")
	if err != nil {
		t.Fatalf("resolve sink-param after edge-output write: %v", err)
	}
	if got := effectiveCodeObjType(sinkPayload, sinkImpl); got != codeParamType {
		t.Fatalf("expected sink-param to remain CodeParam, got %q", got)
	}
	if got := payloadRawStringField(sinkPayload, "value"); got != "" {
		t.Fatalf("expected sink-param value to clear after removing the outgoing edge, got %q", got)
	}

	if len(project.Edges) != 1 {
		t.Fatalf("expected one remaining edge after removing the deleted output source, got %#v", project.Edges)
	}
	if got := project.Edges[0].TargetPortID; got != "target-param" {
		t.Fatalf("expected incoming target edge to remain, got %#v", project.Edges)
	}
}

// Changing an accessor on a still-exposed output port should rebuild the
// downstream target value for every surviving edge that uses that port.
func TestRuntimeSetSectionEdgeOutputsReappliesChangedAccessorValues(t *testing.T) {
	t.Parallel()

	runtime := openEdgeIOTestRuntime(t)

	initialExpression := edgeIOExpressionForPortAccessor("result", ".old")
	if _, err := runtime.SetSectionCodeObjectValue(
		context.Background(),
		"project-alpha",
		"sink-section",
		"sink-param",
		initialExpression,
	); err != nil {
		t.Fatalf("seed sink-param with initial expression: %v", err)
	}

	if _, err := runtime.SetSectionEdgeOutputs(
		context.Background(),
		"project-alpha",
		"dict-section",
		[]EdgePort{{ID: "result", Accessor: ".new"}},
		edgeIOExpressionBuilder(),
	); err != nil {
		t.Fatalf("SetSectionEdgeOutputs returned error: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	payload, err := effectiveSectionPayload(project, "dict-section", "dict-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload dict-section after accessor change: %v", err)
	}
	if got := payloadEdgeOutputPorts(payload); !reflect.DeepEqual(got, []EdgePort{{ID: "result", Accessor: ".new"}}) {
		t.Fatalf("expected updated edgeOutputPorts [{result .new}], got %#v", got)
	}

	sinkPayload, _, _, sinkImpl, err := project.ResolveSectionCodeObject("sink-section", "sink-param")
	if err != nil {
		t.Fatalf("resolve sink-param after accessor change: %v", err)
	}
	if got := effectiveCodeObjType(sinkPayload, sinkImpl); got != codeParamType {
		t.Fatalf("expected sink-param to remain CodeParam, got %q", got)
	}
	updatedExpression := edgeIOExpressionForPortAccessor("result", ".new")
	if initialExpression == updatedExpression {
		t.Fatal("expected accessor change to produce a new edge expression")
	}
	if got := payloadRawStringField(sinkPayload, "value"); got != updatedExpression {
		t.Fatalf("expected sink-param value %q after accessor change, got %q", updatedExpression, got)
	}

	if len(project.Edges) != 2 {
		t.Fatalf("expected both edges to remain after accessor change, got %#v", project.Edges)
	}
}

func openEdgeIOTestRuntime(t *testing.T) *Runtime {
	t.Helper()

	project, err := edgeIOTestProject().Normalized()
	if err != nil {
		t.Fatalf("normalize edge-io project: %v", err)
	}

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			project.ID: project,
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})
	return runtime
}

func edgeIOTestProject() Project {
	return Project{
		ID:                 "project-alpha",
		Name:               "Alpha",
		TopLevelSectionIDs: []string{"dict-section", "global-section", "source-section", "sink-section"},
		TopLevelSections: map[string]TopLevelSectionLayout{
			"dict-section":   {X: 10, Y: 10},
			"global-section": {X: 20, Y: 20},
			"source-section": {X: 30, Y: 30},
			"sink-section":   {X: 40, Y: 40},
		},
		SectionVariantMap: map[string]string{
			"dict-section":   "dict-variant",
			"global-section": "global-variant",
			"source-section": "source-variant",
			"sink-section":   "sink-variant",
		},
		Sections: map[string]Section{
			"dict-section": {
				ID:               "dict-section",
				Name:             "Dict",
				VariantIDs:       []string{"dict-variant"},
				DefaultVariantID: "dict-variant",
			},
			"global-section": {
				ID:               "global-section",
				Name:             "Globals",
				VariantIDs:       []string{"global-variant"},
				DefaultVariantID: "global-variant",
			},
			"source-section": {
				ID:               "source-section",
				Name:             "Source",
				VariantIDs:       []string{"source-variant"},
				DefaultVariantID: "source-variant",
			},
			"sink-section": {
				ID:               "sink-section",
				Name:             "Sink",
				VariantIDs:       []string{"sink-variant"},
				DefaultVariantID: "sink-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"dict-variant":   {ID: "dict-variant", ImplID: "dict-impl"},
			"global-variant": {ID: "global-variant", ImplID: "global-impl"},
			"source-variant": {ID: "source-variant", ImplID: "source-impl"},
			"sink-variant":   {ID: "sink-variant", ImplID: "sink-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"dict-impl": {
				ID:   "dict-impl",
				Kind: SectionKind("dict"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":              "dict-impl",
					"type":            "Dict",
					"topLevelParamId": "dict-root",
					"codeObjVariantMap": map[string]string{
						"dict-root":    "dict-root-variant",
						"target-param": "target-param-variant",
						"added-param":  "added-param-variant",
					},
					"edgeInputParams": []string{"target-param"},
					"edgeOutputPorts": []map[string]any{{"id": "result", "accessor": ".old"}},
				}),
			},
			"global-impl": {
				ID:   "global-impl",
				Kind: SectionKind("dict"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":              "global-impl",
					"type":            "GlobalVariables",
					"topLevelParamId": "global-root",
					"codeObjVariantMap": map[string]string{
						"global-root":  "global-root-variant",
						"global-param": "global-param-variant",
					},
					"edgeInputParams": []string{},
					"edgeOutputPorts": []map[string]any{},
				}),
			},
			"source-impl": {
				ID:      "source-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "source-impl", "type": "TextBlock"}),
			},
			"sink-impl": {
				ID:   "sink-impl",
				Kind: SectionKind("dict"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":              "sink-impl",
					"type":            "Dict",
					"topLevelParamId": "sink-root",
					"codeObjVariantMap": map[string]string{
						"sink-root":  "sink-root-variant",
						"sink-param": "sink-param-variant",
					},
					"edgeInputParams": []string{"sink-param"},
				}),
			},
		},
		CodeObjs: map[string]CodeObject{
			"dict-root": {
				ID:               "dict-root",
				Name:             "root",
				VariantIDs:       []string{"dict-root-variant"},
				DefaultVariantID: "dict-root-variant",
			},
			"target-param": {
				ID:               "target-param",
				Name:             "target",
				VariantIDs:       []string{"target-param-variant"},
				DefaultVariantID: "target-param-variant",
			},
			"added-param": {
				ID:               "added-param",
				Name:             "added",
				VariantIDs:       []string{"added-param-variant"},
				DefaultVariantID: "added-param-variant",
			},
			"global-root": {
				ID:               "global-root",
				Name:             "global_root",
				VariantIDs:       []string{"global-root-variant"},
				DefaultVariantID: "global-root-variant",
			},
			"global-param": {
				ID:               "global-param",
				Name:             "global_param",
				VariantIDs:       []string{"global-param-variant"},
				DefaultVariantID: "global-param-variant",
			},
			"sink-root": {
				ID:               "sink-root",
				Name:             "sink_root",
				VariantIDs:       []string{"sink-root-variant"},
				DefaultVariantID: "sink-root-variant",
			},
			"sink-param": {
				ID:               "sink-param",
				Name:             "sink_param",
				VariantIDs:       []string{"sink-param-variant"},
				DefaultVariantID: "sink-param-variant",
			},
		},
		CodeObjVariants: map[string]CodeObjectVariant{
			"dict-root-variant":    {ID: "dict-root-variant", ImplID: "dict-root-impl"},
			"target-param-variant": {ID: "target-param-variant", ImplID: "target-param-impl"},
			"added-param-variant":  {ID: "added-param-variant", ImplID: "added-param-impl"},
			"global-root-variant":  {ID: "global-root-variant", ImplID: "global-root-impl"},
			"global-param-variant": {ID: "global-param-variant", ImplID: "global-param-impl"},
			"sink-root-variant":    {ID: "sink-root-variant", ImplID: "sink-root-impl"},
			"sink-param-variant":   {ID: "sink-param-variant", ImplID: "sink-param-impl"},
		},
		CodeObjImpls: map[string]CodeObjectImpl{
			"dict-root-impl": {
				ID:      "dict-root-impl",
				Type:    "NestedParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "dict-root-impl", "type": "NestedParam", "children": []string{"target-param", "added-param"}}),
			},
			"target-param-impl": {
				ID:      "target-param-impl",
				Type:    "CodeParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "target-param-impl", "type": "CodeParam", "coreNameEditable": true, "passingStyle": "DEFAULT", "value": "connected"}),
			},
			"added-param-impl": {
				ID:      "added-param-impl",
				Type:    "TextParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "added-param-impl", "type": "TextParam", "coreNameEditable": true, "passingStyle": "DEFAULT", "value": "typed"}),
			},
			"global-root-impl": {
				ID:      "global-root-impl",
				Type:    "NestedParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "global-root-impl", "type": "NestedParam", "children": []string{"global-param"}}),
			},
			"global-param-impl": {
				ID:      "global-param-impl",
				Type:    "TextParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "global-param-impl", "type": "TextParam", "coreNameEditable": true, "passingStyle": "DEFAULT", "value": "global"}),
			},
			"sink-root-impl": {
				ID:      "sink-root-impl",
				Type:    "NestedParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "sink-root-impl", "type": "NestedParam", "children": []string{"sink-param"}}),
			},
			"sink-param-impl": {
				ID:      "sink-param-impl",
				Type:    "CodeParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "sink-param-impl", "type": "CodeParam", "coreNameEditable": true, "passingStyle": "DEFAULT", "value": "connected"}),
			},
		},
		Edges: []Edge{
			{
				ID:              "incoming-edge",
				SourceSectionID: "source-section",
				SourceVariantID: "source-variant",
				SourcePortID:    "source-port",
				TargetSectionID: "dict-section",
				TargetVariantID: "dict-variant",
				TargetPortID:    "target-param",
			},
			{
				ID:              "outgoing-edge",
				SourceSectionID: "dict-section",
				SourceVariantID: "dict-variant",
				SourcePortID:    "result",
				TargetSectionID: "sink-section",
				TargetVariantID: "sink-variant",
				TargetPortID:    "sink-param",
			},
		},
	}
}

func edgeIOExpressionBuilder() EdgeExpressionBuilder {
	return EdgeExpressionBuilderFunc(func(project Project, edge Edge) (string, error) {
		_, variant, _, err := project.ResolveSectionWithVariant(edge.SourceSectionID, edge.SourceVariantID)
		if err != nil {
			return "", err
		}
		payload, err := effectiveSectionPayload(project, edge.SourceSectionID, variant.ID)
		if err != nil {
			return "", err
		}
		for _, port := range payloadEdgeOutputPorts(payload) {
			if port.ID == edge.SourcePortID {
				return edgeIOExpressionForPortAccessor(port.ID, port.Accessor), nil
			}
		}
		return "", fmt.Errorf("%w: section=%q port=%q", ErrEdgeSourcePortNotFound, edge.SourceSectionID, edge.SourcePortID)
	})
}

func edgeIOExpressionForPortAccessor(portID string, accessor string) string {
	return fmt.Sprintf("edge:%s%s", portID, accessor)
}
