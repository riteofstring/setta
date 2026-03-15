package projectstate

import (
	"context"
	"errors"
	"testing"
)

func TestRuntimeStateMachineMutationsPersistEdgesAndSectionSettings(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": stateMachineMutationTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	// Build the workflow graph through the public runtime mutations.
	if _, err := runtime.CreateStateMachineEdge(context.Background(), "project-alpha", StateMachineEdge{
		ID:              "edge-start-gate",
		MachineGroupID:  "workflow-a",
		SourceSectionID: "start-section",
		SourcePortID:    StateMachineEdgeSourcePortID,
		TargetSectionID: "gate-section",
		TargetPortID:    StateMachineEdgeTargetPortID,
	}, nil); err != nil {
		t.Fatalf("CreateStateMachineEdge start->gate returned error: %v", err)
	}

	promptSectionID := "prompt-section"
	if _, err := runtime.CreateStateMachineEdge(context.Background(), "project-alpha", StateMachineEdge{
		ID:              "edge-gate-chat",
		MachineGroupID:  "workflow-a",
		SourceSectionID: "gate-section",
		SourcePortID:    StateMachineEdgeSourcePortID,
		TargetSectionID: "chat-section",
		TargetPortID:    StateMachineEdgeTargetPortID,
		TargetAction: &StateMachineTargetAction{
			Type:            StateMachineTargetActionTypeSendPrompt,
			PromptSectionID: &promptSectionID,
			PromptInputs:    map[string]string{"name": "Ada"},
			ThreadStrategy:  StateMachineThreadStrategyNewThreadBeforeSend,
			StopIfRunning:   true,
		},
	}, nil); err != nil {
		t.Fatalf("CreateStateMachineEdge gate->chat returned error: %v", err)
	}

	updatedGateToChat := stateMachineTestEdgeByID(t, runtime.Snapshot().Document.Projects["project-alpha"].StateMachineEdges, "edge-gate-chat")
	updatedGateToChat.Hidden = true
	updatedGateToChat.Selected = true
	updatedGateToChat.ZIndex = 11
	updatedGateToChat.SourceActivationCountCondition = &StateMachineSourceActivationCountCondition{
		Operator: StateMachineCountOperatorGTE,
		Value:    2,
	}
	updatedGateToChat.TargetAction.SearchEnabled = stateMachineBoolPointer(true)

	if _, err := runtime.UpdateStateMachineEdge(context.Background(), "project-alpha", updatedGateToChat, nil); err != nil {
		t.Fatalf("UpdateStateMachineEdge returned error: %v", err)
	}

	if _, err := runtime.DeleteStateMachineEdges(context.Background(), "project-alpha", []string{"edge-start-gate"}); err != nil {
		t.Fatalf("DeleteStateMachineEdges returned error: %v", err)
	}

	// Replace the edge set to cover the bulk mutation path and Chat-source filtering.
	if _, err := runtime.SetStateMachineEdges(context.Background(), "project-alpha", []StateMachineEdge{
		updatedGateToChat,
		{
			ID:              "edge-chat-end",
			MachineGroupID:  "workflow-a",
			SourceSectionID: "chat-section",
			SourcePortID:    StateMachineEdgeSourcePortID,
			TargetSectionID: "end-section",
			TargetPortID:    StateMachineEdgeTargetPortID,
			SourceFilter: &StateMachineSourceFilter{
				Type: StateMachineSourceFilterTypeRunCompleted,
			},
		},
	}, nil); err != nil {
		t.Fatalf("SetStateMachineEdges returned error: %v", err)
	}

	// Then update the gate section settings that the frontend pane edits directly.
	gateType := StateMachineGateTypeXOR
	if _, err := runtime.SetStateMachineSectionSettings(context.Background(), "project-alpha", "gate-section", StateMachineSectionSettings{
		MachineGroupID: "workflow-a",
		Label:          "Decision",
		GateType:       &gateType,
	}); err != nil {
		t.Fatalf("SetStateMachineSectionSettings returned error: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	if len(project.StateMachineEdges) != 2 {
		t.Fatalf("expected 2 persisted state machine edges, got %d", len(project.StateMachineEdges))
	}

	gateToChat := stateMachineTestEdgeByID(t, project.StateMachineEdges, "edge-gate-chat")
	if !gateToChat.Hidden {
		t.Fatal("expected gate->chat edge hidden=true")
	}
	if !gateToChat.Selected {
		t.Fatal("expected gate->chat edge selected=true")
	}
	if gateToChat.ZIndex != 11 {
		t.Fatalf("expected gate->chat edge zIndex 11, got %d", gateToChat.ZIndex)
	}
	if gateToChat.SourceActivationCountCondition == nil ||
		gateToChat.SourceActivationCountCondition.Operator != StateMachineCountOperatorGTE ||
		gateToChat.SourceActivationCountCondition.Value != 2 {
		t.Fatalf("expected gate->chat activation condition to persist, got %#v", gateToChat.SourceActivationCountCondition)
	}
	if gateToChat.TargetAction == nil {
		t.Fatal("expected gate->chat target action to persist")
	}
	if gateToChat.TargetAction.SearchEnabled == nil || !*gateToChat.TargetAction.SearchEnabled {
		t.Fatalf("expected gate->chat searchEnabled=true, got %#v", gateToChat.TargetAction.SearchEnabled)
	}
	if gateToChat.TargetAction.PromptSectionID == nil || *gateToChat.TargetAction.PromptSectionID != "prompt-section" {
		t.Fatalf("expected gate->chat promptSectionId prompt-section, got %#v", gateToChat.TargetAction.PromptSectionID)
	}
	if gateToChat.TargetAction.ThreadStrategy != StateMachineThreadStrategyNewThreadBeforeSend {
		t.Fatalf("expected gate->chat thread strategy %q, got %q", StateMachineThreadStrategyNewThreadBeforeSend, gateToChat.TargetAction.ThreadStrategy)
	}

	chatToEnd := stateMachineTestEdgeByID(t, project.StateMachineEdges, "edge-chat-end")
	if chatToEnd.SourceFilter == nil || chatToEnd.SourceFilter.Type != StateMachineSourceFilterTypeRunCompleted {
		t.Fatalf("expected chat->end source filter run_completed, got %#v", chatToEnd.SourceFilter)
	}

	gatePayload, err := effectiveSectionPayload(project, "gate-section", "gate-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload gate-section: %v", err)
	}
	if got := payloadRawStringField(gatePayload, "machineGroupId"); got != "workflow-a" {
		t.Fatalf("expected gate machineGroupId workflow-a, got %q", got)
	}
	if got := payloadRawStringField(gatePayload, "label"); got != "Decision" {
		t.Fatalf("expected gate label Decision, got %q", got)
	}
	if got := payloadRawStringField(gatePayload, "gateType"); got != string(StateMachineGateTypeXOR) {
		t.Fatalf("expected gate type %q, got %q", StateMachineGateTypeXOR, got)
	}
}

func TestRuntimeStateMachineMutationsMergeConnectedMachineGroups(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": stateMachineMutationTestProjectWithGroups(t, "workflow-a", "workflow-b", "workflow-a"),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	// Connecting sections from two existing machine groups should merge them into the chosen group.
	if _, err := runtime.CreateStateMachineEdge(context.Background(), "project-alpha", StateMachineEdge{
		ID:              "edge-start-gate",
		MachineGroupID:  "workflow-a",
		SourceSectionID: "start-section",
		SourcePortID:    StateMachineEdgeSourcePortID,
		TargetSectionID: "gate-section",
		TargetPortID:    StateMachineEdgeTargetPortID,
	}, nil); err != nil {
		t.Fatalf("CreateStateMachineEdge returned error: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	gatePayload, err := effectiveSectionPayload(project, "gate-section", "gate-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload gate-section: %v", err)
	}
	if got := payloadRawStringField(gatePayload, "machineGroupId"); got != "workflow-a" {
		t.Fatalf("expected gate machineGroupId to merge into workflow-a, got %q", got)
	}

	edge := stateMachineTestEdgeByID(t, project.StateMachineEdges, "edge-start-gate")
	if edge.MachineGroupID != "workflow-a" {
		t.Fatalf("expected merged edge machineGroupId workflow-a, got %q", edge.MachineGroupID)
	}
}

func TestRuntimeStateMachineMutationsRejectInvalidTargetsAndSettings(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": stateMachineMutationTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	if _, err := runtime.SetStateMachineSectionSettings(context.Background(), "project-alpha", "plain-section", StateMachineSectionSettings{
		MachineGroupID: "workflow-a",
		Label:          "Plain",
	}); !errors.Is(err, ErrStateMachineSectionRequired) {
		t.Fatalf("expected ErrStateMachineSectionRequired, got %v", err)
	}

	if _, err := runtime.SetStateMachineSectionSettings(context.Background(), "project-alpha", "gate-section", StateMachineSectionSettings{
		MachineGroupID: "workflow-a",
		Label:          "Gate",
	}); !errors.Is(err, ErrStateMachineGateTypeInvalid) {
		t.Fatalf("expected ErrStateMachineGateTypeInvalid, got %v", err)
	}

	if _, err := runtime.CreateStateMachineEdge(context.Background(), "project-alpha", StateMachineEdge{
		ID:              "edge-start-chat",
		MachineGroupID:  "workflow-a",
		SourceSectionID: "start-section",
		SourcePortID:    StateMachineEdgeSourcePortID,
		TargetSectionID: "chat-section",
		TargetPortID:    StateMachineEdgeTargetPortID,
	}, nil); !errors.Is(err, ErrStateMachineEdgeInvalid) {
		t.Fatalf("expected ErrStateMachineEdgeInvalid for missing Chat target action, got %v", err)
	}

	promptSectionID := "plain-section"
	if _, err := runtime.CreateStateMachineEdge(context.Background(), "project-alpha", StateMachineEdge{
		ID:              "edge-gate-chat",
		MachineGroupID:  "workflow-a",
		SourceSectionID: "gate-section",
		SourcePortID:    StateMachineEdgeSourcePortID,
		TargetSectionID: "chat-section",
		TargetPortID:    StateMachineEdgeTargetPortID,
		TargetAction: &StateMachineTargetAction{
			Type:            StateMachineTargetActionTypeSendPrompt,
			PromptSectionID: &promptSectionID,
		},
	}, nil); !errors.Is(err, ErrPromptSectionRequired) {
		t.Fatalf("expected ErrPromptSectionRequired, got %v", err)
	}

	if _, err := runtime.SetStateMachineEdges(context.Background(), "project-alpha", []StateMachineEdge{
		{
			ID:              "duplicate-edge",
			MachineGroupID:  "workflow-a",
			SourceSectionID: "start-section",
			SourcePortID:    StateMachineEdgeSourcePortID,
			TargetSectionID: "gate-section",
			TargetPortID:    StateMachineEdgeTargetPortID,
		},
		{
			ID:              "duplicate-edge",
			MachineGroupID:  "workflow-a",
			SourceSectionID: "gate-section",
			SourcePortID:    StateMachineEdgeSourcePortID,
			TargetSectionID: "end-section",
			TargetPortID:    StateMachineEdgeTargetPortID,
		},
	}, nil); !errors.Is(err, ErrStateMachineEdgeDuplicateID) {
		t.Fatalf("expected ErrStateMachineEdgeDuplicateID, got %v", err)
	}
}

func stateMachineMutationTestProject(t *testing.T) Project {
	t.Helper()
	return stateMachineMutationTestProjectWithGroups(t, "workflow-a", "workflow-a", "workflow-a")
}

func stateMachineMutationTestProjectWithGroups(
	t *testing.T,
	startGroupID string,
	gateGroupID string,
	endGroupID string,
) Project {
	t.Helper()

	project, err := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"start-section":  "start-variant",
			"gate-section":   "gate-variant",
			"end-section":    "end-variant",
			"chat-section":   "chat-variant",
			"prompt-section": "prompt-variant",
			"plain-section":  "plain-variant",
		},
		Sections: map[string]Section{
			"start-section": {
				ID:               "start-section",
				Name:             "Start Section",
				VariantIDs:       []string{"start-variant"},
				DefaultVariantID: "start-variant",
			},
			"gate-section": {
				ID:               "gate-section",
				Name:             "Gate Section",
				VariantIDs:       []string{"gate-variant"},
				DefaultVariantID: "gate-variant",
			},
			"end-section": {
				ID:               "end-section",
				Name:             "End Section",
				VariantIDs:       []string{"end-variant"},
				DefaultVariantID: "end-variant",
			},
			"chat-section": {
				ID:               "chat-section",
				Name:             "Chat Section",
				VariantIDs:       []string{"chat-variant"},
				DefaultVariantID: "chat-variant",
			},
			"prompt-section": {
				ID:               "prompt-section",
				Name:             "Prompt Section",
				VariantIDs:       []string{"prompt-variant"},
				DefaultVariantID: "prompt-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain Section",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"start-variant": {
				ID:     "start-variant",
				ImplID: "start-impl",
			},
			"gate-variant": {
				ID:     "gate-variant",
				ImplID: "gate-impl",
			},
			"end-variant": {
				ID:     "end-variant",
				ImplID: "end-impl",
			},
			"chat-variant": {
				ID:     "chat-variant",
				ImplID: "chat-impl",
			},
			"prompt-variant": {
				ID:     "prompt-variant",
				ImplID: "prompt-impl",
			},
			"plain-variant": {
				ID:     "plain-variant",
				ImplID: "plain-impl",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"start-impl": {
				ID:   "start-impl",
				Kind: SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":             "start-impl",
					"type":           "StateMachineStart",
					"machineGroupId": startGroupID,
					"label":          "Start",
					"maxIterations":  nil,
				}),
			},
			"gate-impl": {
				ID:   "gate-impl",
				Kind: SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":             "gate-impl",
					"type":           "StateMachineGate",
					"machineGroupId": gateGroupID,
					"label":          "Gate",
					"gateType":       string(StateMachineGateTypeAND),
					"ui": map[string]any{
						"showDetails": false,
					},
				}),
			},
			"end-impl": {
				ID:   "end-impl",
				Kind: SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":             "end-impl",
					"type":           "StateMachineEnd",
					"machineGroupId": endGroupID,
					"label":          "End",
				}),
			},
			"chat-impl": {
				ID:   "chat-impl",
				Kind: SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":   "chat-impl",
					"type": "Chat",
				}),
			},
			"prompt-impl": {
				ID:   "prompt-impl",
				Kind: SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":               "prompt-impl",
					"type":             "Prompt",
					"template":         "Hello {{ name }}",
					"inputs":           map[string]string{},
					"format":           string(PromptFormatJinja),
					"renderedText":     "",
					"missingVariables": []string{},
					"renderError":      nil,
				}),
			},
			"plain-impl": {
				ID:   "plain-impl",
				Kind: SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":   "plain-impl",
					"type": "TextBlock",
				}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize state machine mutation project: %v", err)
	}
	return project
}

func stateMachineTestEdgeByID(t *testing.T, edges []StateMachineEdge, edgeID string) StateMachineEdge {
	t.Helper()

	for _, edge := range edges {
		if edge.ID == edgeID {
			return edge
		}
	}
	t.Fatalf("state machine edge %q not found in %#v", edgeID, edges)
	return StateMachineEdge{}
}

func stateMachineBoolPointer(value bool) *bool {
	return &value
}
