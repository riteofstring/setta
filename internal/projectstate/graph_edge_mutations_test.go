package projectstate

import (
	"context"
	"errors"
	"testing"
)

func TestProjectCreateEdgeAppliesExpressionAndGeneratesID(t *testing.T) {
	t.Parallel()

	project := graphEdgeMutationTestProject(t)

	created, err := project.CreateEdge(
		Edge{
			SourceSectionID: "source-section",
			SourceVariantID: "source-variant",
			SourcePortID:    "result",
			TargetSectionID: "target-a",
			TargetVariantID: "target-a-variant",
			TargetPortID:    "input-a",
		},
		graphEdgeExpressionBuilder(),
	)
	if err != nil {
		t.Fatalf("CreateEdge returned error: %v", err)
	}

	if created.ID == "" {
		t.Fatal("expected CreateEdge to generate an edge id")
	}
	if len(project.Edges) != 1 {
		t.Fatalf("expected one persisted edge, got %#v", project.Edges)
	}

	targetPayload, _, _, _, err := project.ResolveSectionCodeObject("target-a", "input-a")
	if err != nil {
		t.Fatalf("ResolveSectionCodeObject target-a/input-a: %v", err)
	}
	if got := payloadRawStringField(targetPayload, "value"); got != "expr::result->input-a" {
		t.Fatalf("expected target-a input value expr::result->input-a, got %q", got)
	}
}

func TestProjectReconnectEdgeClearsOldTargetAndWritesNewExpression(t *testing.T) {
	t.Parallel()

	project := graphEdgeMutationTestProject(t)

	created, err := project.CreateEdge(
		Edge{
			SourceSectionID: "source-section",
			SourceVariantID: "source-variant",
			SourcePortID:    "result",
			TargetSectionID: "target-a",
			TargetVariantID: "target-a-variant",
			TargetPortID:    "input-a",
		},
		graphEdgeExpressionBuilder(),
	)
	if err != nil {
		t.Fatalf("CreateEdge seed edge returned error: %v", err)
	}

	if err := project.ReconnectEdge(
		created.ID,
		"source-section",
		"source-variant",
		"summary",
		"target-b",
		"target-b-variant",
		"input-b",
		graphEdgeExpressionBuilder(),
	); err != nil {
		t.Fatalf("ReconnectEdge returned error: %v", err)
	}

	targetAPayload, _, _, _, err := project.ResolveSectionCodeObject("target-a", "input-a")
	if err != nil {
		t.Fatalf("ResolveSectionCodeObject target-a/input-a: %v", err)
	}
	if got := payloadRawStringField(targetAPayload, "value"); got != "" {
		t.Fatalf("expected reconnect to clear previous target value, got %q", got)
	}

	targetBPayload, _, _, _, err := project.ResolveSectionCodeObject("target-b", "input-b")
	if err != nil {
		t.Fatalf("ResolveSectionCodeObject target-b/input-b: %v", err)
	}
	if got := payloadRawStringField(targetBPayload, "value"); got != "expr::summary->input-b" {
		t.Fatalf("expected target-b input value expr::summary->input-b, got %q", got)
	}
}

func TestProjectDeleteEdgesClearsTargetValue(t *testing.T) {
	t.Parallel()

	project := graphEdgeMutationTestProject(t)

	created, err := project.CreateEdge(
		Edge{
			SourceSectionID: "source-section",
			SourceVariantID: "source-variant",
			SourcePortID:    "result",
			TargetSectionID: "target-a",
			TargetVariantID: "target-a-variant",
			TargetPortID:    "input-a",
		},
		graphEdgeExpressionBuilder(),
	)
	if err != nil {
		t.Fatalf("CreateEdge returned error: %v", err)
	}
	if err := project.SetSectionCodeObjectValue("target-a", "input-a", "connected"); err != nil {
		t.Fatalf("SetSectionCodeObjectValue target-a/input-a: %v", err)
	}

	if err := project.DeleteEdges([]string{created.ID}); err != nil {
		t.Fatalf("DeleteEdges returned error: %v", err)
	}

	targetPayload, _, _, _, err := project.ResolveSectionCodeObject("target-a", "input-a")
	if err != nil {
		t.Fatalf("ResolveSectionCodeObject target-a/input-a: %v", err)
	}
	if got := payloadRawStringField(targetPayload, "value"); got != "" {
		t.Fatalf("expected DeleteEdges to clear target-a input value, got %q", got)
	}
}

func TestProjectDeleteEdgesKeepsTargetValueWhenAnotherEdgeRemains(t *testing.T) {
	t.Parallel()

	project := graphEdgeMutationTestProject(t)

	edgeA, err := project.CreateEdge(
		Edge{
			SourceSectionID: "source-section",
			SourceVariantID: "source-variant",
			SourcePortID:    "result",
			TargetSectionID: "target-a",
			TargetVariantID: "target-a-variant",
			TargetPortID:    "input-a",
		},
		graphEdgeExpressionBuilder(),
	)
	if err != nil {
		t.Fatalf("CreateEdge result->input-a returned error: %v", err)
	}
	if _, err := project.CreateEdge(
		Edge{
			SourceSectionID: "source-section",
			SourceVariantID: "source-variant",
			SourcePortID:    "summary",
			TargetSectionID: "target-a",
			TargetVariantID: "target-a-variant",
			TargetPortID:    "input-a",
		},
		graphEdgeExpressionBuilder(),
	); err != nil {
		t.Fatalf("CreateEdge summary->input-a returned error: %v", err)
	}
	if err := project.SetSectionCodeObjectValue("target-a", "input-a", "connected"); err != nil {
		t.Fatalf("SetSectionCodeObjectValue target-a/input-a: %v", err)
	}

	if err := project.DeleteEdges([]string{edgeA.ID}); err != nil {
		t.Fatalf("DeleteEdges returned error: %v", err)
	}

	targetPayload, _, _, _, err := project.ResolveSectionCodeObject("target-a", "input-a")
	if err != nil {
		t.Fatalf("ResolveSectionCodeObject target-a/input-a: %v", err)
	}
	if got := payloadRawStringField(targetPayload, "value"); got != "connected" {
		t.Fatalf("expected DeleteEdges to keep target-a input value while another edge remains, got %q", got)
	}
	if len(project.Edges) != 1 {
		t.Fatalf("expected one remaining edge after delete, got %#v", project.Edges)
	}
}

func TestProjectSetEdgesClearsRemovedTargetValues(t *testing.T) {
	t.Parallel()

	project := graphEdgeMutationTestProject(t)

	edgeA, err := project.CreateEdge(
		Edge{
			SourceSectionID: "source-section",
			SourceVariantID: "source-variant",
			SourcePortID:    "result",
			TargetSectionID: "target-a",
			TargetVariantID: "target-a-variant",
			TargetPortID:    "input-a",
		},
		graphEdgeExpressionBuilder(),
	)
	if err != nil {
		t.Fatalf("CreateEdge target-a returned error: %v", err)
	}
	edgeB, err := project.CreateEdge(
		Edge{
			SourceSectionID: "source-section",
			SourceVariantID: "source-variant",
			SourcePortID:    "summary",
			TargetSectionID: "target-b",
			TargetVariantID: "target-b-variant",
			TargetPortID:    "input-b",
		},
		graphEdgeExpressionBuilder(),
	)
	if err != nil {
		t.Fatalf("CreateEdge target-b returned error: %v", err)
	}

	edgeB.Selected = true
	if err := project.SetEdges([]Edge{edgeB}); err != nil {
		t.Fatalf("SetEdges returned error: %v", err)
	}

	if len(project.Edges) != 1 || project.Edges[0].ID != edgeB.ID {
		t.Fatalf("expected SetEdges to retain only edgeB, got %#v", project.Edges)
	}
	if project.Edges[0].Selected != true {
		t.Fatalf("expected SetEdges to persist updated edge metadata, got %#v", project.Edges[0])
	}
	if edgeA.ID == edgeB.ID {
		t.Fatal("expected distinct created edges")
	}

	targetAPayload, _, _, _, err := project.ResolveSectionCodeObject("target-a", "input-a")
	if err != nil {
		t.Fatalf("ResolveSectionCodeObject target-a/input-a: %v", err)
	}
	if got := payloadRawStringField(targetAPayload, "value"); got != "" {
		t.Fatalf("expected removed target-a value to clear, got %q", got)
	}

	targetBPayload, _, _, _, err := project.ResolveSectionCodeObject("target-b", "input-b")
	if err != nil {
		t.Fatalf("ResolveSectionCodeObject target-b/input-b: %v", err)
	}
	if got := payloadRawStringField(targetBPayload, "value"); got != "expr::summary->input-b" {
		t.Fatalf("expected retained target-b value expr::summary->input-b, got %q", got)
	}
}

func TestProjectCreateAgenticEdgeDefaultsContextMode(t *testing.T) {
	t.Parallel()

	project := graphEdgeMutationTestProject(t)

	created, err := project.CreateAgenticEdge(AgenticEdge{
		SourceSectionID: "source-section",
		TargetSectionID: "chat-target",
		Kind:            " section_chat ",
		ContextMode:     " ",
	})
	if err != nil {
		t.Fatalf("CreateAgenticEdge returned error: %v", err)
	}

	if created.ID == "" {
		t.Fatal("expected CreateAgenticEdge to generate an id")
	}
	if created.Kind != "section_chat" {
		t.Fatalf("expected normalized kind section_chat, got %q", created.Kind)
	}
	if created.ContextMode != "reference_only" {
		t.Fatalf("expected default context mode reference_only, got %q", created.ContextMode)
	}
	if len(project.AgenticEdges) != 1 {
		t.Fatalf("expected one persisted agentic edge, got %#v", project.AgenticEdges)
	}
}

func TestProjectCreateAgenticEdgeSupportsDocumentedKindsAndExplicitContextModes(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name        string
		sourceID    string
		targetID    string
		kind        AgenticEdgeKind
		contextMode AgenticEdgeContextMode
	}{
		{
			name:        "chat chat reference only",
			sourceID:    "chat-source",
			targetID:    "chat-target",
			kind:        AgenticEdgeKindChatChat,
			contextMode: AgenticEdgeContextModeReferenceOnly,
		},
		{
			name:        "section chat summary",
			sourceID:    "source-section",
			targetID:    "chat-target",
			kind:        AgenticEdgeKindSectionChat,
			contextMode: AgenticEdgeContextModeSummary,
		},
		{
			name:        "chat section inline text",
			sourceID:    "chat-source",
			targetID:    "source-section",
			kind:        AgenticEdgeKindChatSection,
			contextMode: AgenticEdgeContextModeInlineText,
		},
	}

	for _, tc := range testCases {
		project := graphEdgeMutationTestProject(t)

		created, err := project.CreateAgenticEdge(AgenticEdge{
			SourceSectionID: tc.sourceID,
			TargetSectionID: tc.targetID,
			Kind:            tc.kind,
			ContextMode:     tc.contextMode,
		})
		if err != nil {
			t.Fatalf("CreateAgenticEdge %s returned error: %v", tc.name, err)
		}
		if created.Kind != tc.kind {
			t.Fatalf("expected %s kind %q, got %q", tc.name, tc.kind, created.Kind)
		}
		if created.ContextMode != tc.contextMode {
			t.Fatalf("expected %s context mode %q, got %q", tc.name, tc.contextMode, created.ContextMode)
		}
		if len(project.AgenticEdges) != 1 {
			t.Fatalf("expected one persisted %s agentic edge, got %#v", tc.name, project.AgenticEdges)
		}
		persisted := project.AgenticEdges[0]
		if persisted.Kind != tc.kind || persisted.ContextMode != tc.contextMode {
			t.Fatalf("expected persisted %s edge %#v to match kind/context", tc.name, persisted)
		}
	}
}

func TestProjectCreateAgenticEdgeRejectsInvalidSectionTypes(t *testing.T) {
	t.Parallel()

	project := graphEdgeMutationTestProject(t)

	_, err := project.CreateAgenticEdge(AgenticEdge{
		SourceSectionID: "plain-section",
		TargetSectionID: "chat-target",
		Kind:            "chat_section",
	})
	if !errors.Is(err, ErrAgenticEdgeSourceSectionType) {
		t.Fatalf("expected ErrAgenticEdgeSourceSectionType, got %v", err)
	}
}

func TestProjectCreateAgenticEdgeRejectsInvalidTargetAndMissingEndpoints(t *testing.T) {
	t.Parallel()

	project := graphEdgeMutationTestProject(t)

	for _, testCase := range []struct {
		name string
		edge AgenticEdge
		want error
	}{
		{
			name: "chat chat requires chat target",
			edge: AgenticEdge{
				SourceSectionID: "chat-source",
				TargetSectionID: "plain-section",
				Kind:            "chat_chat",
			},
			want: ErrAgenticEdgeTargetSectionType,
		},
		{
			name: "section chat requires chat target",
			edge: AgenticEdge{
				SourceSectionID: "source-section",
				TargetSectionID: "plain-section",
				Kind:            "section_chat",
			},
			want: ErrAgenticEdgeTargetSectionType,
		},
		{
			name: "missing source section",
			edge: AgenticEdge{
				SourceSectionID: "missing-section",
				TargetSectionID: "chat-target",
				Kind:            "section_chat",
			},
			want: ErrSectionNotFound,
		},
		{
			name: "missing target section",
			edge: AgenticEdge{
				SourceSectionID: "source-section",
				TargetSectionID: "missing-section",
				Kind:            "section_chat",
			},
			want: ErrSectionNotFound,
		},
	} {
		_, err := project.CreateAgenticEdge(testCase.edge)
		if !errors.Is(err, testCase.want) {
			t.Fatalf("%s: expected %v, got %v", testCase.name, testCase.want, err)
		}
	}
}

func TestRuntimeDeleteAgenticEdgesRemovesSelectedEdges(t *testing.T) {
	t.Parallel()

	project := graphEdgeMutationTestProject(t)
	project.AgenticEdges = []AgenticEdge{
		{
			ID:              "agentic-a",
			SourceSectionID: "chat-source",
			TargetSectionID: "chat-target",
			Kind:            "chat_chat",
			ContextMode:     "reference_only",
		},
		{
			ID:              "agentic-b",
			SourceSectionID: "source-section",
			TargetSectionID: "chat-target",
			Kind:            "section_chat",
			ContextMode:     "inline_text",
		},
	}

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			project.ID: project,
		},
	})
	if err != nil {
		t.Fatalf("OpenOverlayRuntime returned error: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	if _, err := runtime.DeleteAgenticEdges(
		context.Background(),
		"project-alpha",
		[]string{"agentic-a"},
	); err != nil {
		t.Fatalf("DeleteAgenticEdges returned error: %v", err)
	}

	edges := runtime.Snapshot().Document.Projects["project-alpha"].AgenticEdges
	if len(edges) != 1 || edges[0].ID != "agentic-b" {
		t.Fatalf("expected only agentic-b to remain, got %#v", edges)
	}
}

func graphEdgeExpressionBuilder() EdgeExpressionBuilder {
	return EdgeExpressionBuilderFunc(func(_ Project, edge Edge) (string, error) {
		return "expr::" + edge.SourcePortID + "->" + edge.TargetPortID, nil
	})
}

func graphEdgeMutationTestProject(t *testing.T) Project {
	t.Helper()

	project, err := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		TopLevelSectionIDs: []string{
			"source-section",
			"target-a",
			"target-b",
			"chat-source",
			"chat-target",
			"plain-section",
		},
		TopLevelSections: map[string]TopLevelSectionLayout{
			"source-section": {X: 10, Y: 10},
			"target-a":       {X: 20, Y: 20},
			"target-b":       {X: 30, Y: 30},
			"chat-source":    {X: 40, Y: 40},
			"chat-target":    {X: 50, Y: 50},
			"plain-section":  {X: 60, Y: 60},
		},
		SectionVariantMap: map[string]string{
			"source-section": "source-variant",
			"target-a":       "target-a-variant",
			"target-b":       "target-b-variant",
			"chat-source":    "chat-source-variant",
			"chat-target":    "chat-target-variant",
			"plain-section":  "plain-variant",
		},
		Sections: map[string]Section{
			"source-section": {
				ID:               "source-section",
				Name:             "Source Call",
				VariantIDs:       []string{"source-variant"},
				DefaultVariantID: "source-variant",
			},
			"target-a": {
				ID:               "target-a",
				Name:             "Target A",
				VariantIDs:       []string{"target-a-variant"},
				DefaultVariantID: "target-a-variant",
			},
			"target-b": {
				ID:               "target-b",
				Name:             "Target B",
				VariantIDs:       []string{"target-b-variant"},
				DefaultVariantID: "target-b-variant",
			},
			"chat-source": {
				ID:               "chat-source",
				Name:             "Chat Source",
				VariantIDs:       []string{"chat-source-variant"},
				DefaultVariantID: "chat-source-variant",
			},
			"chat-target": {
				ID:               "chat-target",
				Name:             "Chat Target",
				VariantIDs:       []string{"chat-target-variant"},
				DefaultVariantID: "chat-target-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"source-variant":      {ID: "source-variant", ImplID: "source-impl"},
			"target-a-variant":    {ID: "target-a-variant", ImplID: "target-a-impl"},
			"target-b-variant":    {ID: "target-b-variant", ImplID: "target-b-impl"},
			"chat-source-variant": {ID: "chat-source-variant", ImplID: "chat-source-impl"},
			"chat-target-variant": {ID: "chat-target-variant", ImplID: "chat-target-impl"},
			"plain-variant":       {ID: "plain-variant", ImplID: "plain-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"source-impl": {
				ID:   "source-impl",
				Kind: SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":       "source-impl",
					"type":     "Callable",
					"callable": "source-callable",
					"codeObjVariantMap": map[string]string{
						"source-callable": "source-callable-variant",
					},
					"edgeOutputPorts": []map[string]any{
						{"id": "result", "accessor": ".result"},
						{"id": "summary", "accessor": ""},
					},
				}),
			},
			"target-a-impl": {
				ID:   "target-a-impl",
				Kind: SectionKind("dict"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":              "target-a-impl",
					"type":            "Dict",
					"topLevelParamId": "target-a-root",
					"codeObjVariantMap": map[string]string{
						"target-a-root": "target-a-root-variant",
						"input-a":       "input-a-variant",
					},
					"edgeInputParams": []string{"input-a"},
				}),
			},
			"target-b-impl": {
				ID:   "target-b-impl",
				Kind: SectionKind("dict"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":              "target-b-impl",
					"type":            "Dict",
					"topLevelParamId": "target-b-root",
					"codeObjVariantMap": map[string]string{
						"target-b-root": "target-b-root-variant",
						"input-b":       "input-b-variant",
					},
					"edgeInputParams": []string{"input-b"},
				}),
			},
			"chat-source-impl": {
				ID:      "chat-source-impl",
				Kind:    SectionKind("chat"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "chat-source-impl", "type": "Chat"}),
			},
			"chat-target-impl": {
				ID:      "chat-target-impl",
				Kind:    SectionKind("chat"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "chat-target-impl", "type": "Chat"}),
			},
			"plain-impl": {
				ID:      "plain-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "plain-impl", "type": "TextBlock"}),
			},
		},
		CodeObjs: map[string]CodeObject{
			"source-callable": {
				ID:               "source-callable",
				Name:             "source_callable",
				VariantIDs:       []string{"source-callable-variant"},
				DefaultVariantID: "source-callable-variant",
			},
			"target-a-root": {
				ID:               "target-a-root",
				Name:             "target_a_root",
				VariantIDs:       []string{"target-a-root-variant"},
				DefaultVariantID: "target-a-root-variant",
			},
			"input-a": {
				ID:               "input-a",
				Name:             "input_a",
				VariantIDs:       []string{"input-a-variant"},
				DefaultVariantID: "input-a-variant",
			},
			"target-b-root": {
				ID:               "target-b-root",
				Name:             "target_b_root",
				VariantIDs:       []string{"target-b-root-variant"},
				DefaultVariantID: "target-b-root-variant",
			},
			"input-b": {
				ID:               "input-b",
				Name:             "input_b",
				VariantIDs:       []string{"input-b-variant"},
				DefaultVariantID: "input-b-variant",
			},
		},
		CodeObjVariants: map[string]CodeObjectVariant{
			"source-callable-variant": {ID: "source-callable-variant", ImplID: "source-callable-impl"},
			"target-a-root-variant":   {ID: "target-a-root-variant", ImplID: "target-a-root-impl"},
			"input-a-variant":         {ID: "input-a-variant", ImplID: "input-a-impl"},
			"target-b-root-variant":   {ID: "target-b-root-variant", ImplID: "target-b-root-impl"},
			"input-b-variant":         {ID: "input-b-variant", ImplID: "input-b-impl"},
		},
		CodeObjImpls: map[string]CodeObjectImpl{
			"source-callable-impl": {
				ID:      "source-callable-impl",
				Type:    "CodeCallable",
				Payload: mustMarshalProjectObject(map[string]any{"id": "source-callable-impl", "type": "CodeCallable", "children": []string{}}),
			},
			"target-a-root-impl": {
				ID:      "target-a-root-impl",
				Type:    "NestedParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "target-a-root-impl", "type": "NestedParam", "children": []string{"input-a"}}),
			},
			"input-a-impl": {
				ID:      "input-a-impl",
				Type:    "CodeParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "input-a-impl", "type": "CodeParam", "value": "seed-a"}),
			},
			"target-b-root-impl": {
				ID:      "target-b-root-impl",
				Type:    "NestedParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "target-b-root-impl", "type": "NestedParam", "children": []string{"input-b"}}),
			},
			"input-b-impl": {
				ID:      "input-b-impl",
				Type:    "CodeParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "input-b-impl", "type": "CodeParam", "value": "seed-b"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize graph edge mutation project: %v", err)
	}
	return project
}
