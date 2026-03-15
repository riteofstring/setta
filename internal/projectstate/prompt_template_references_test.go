package projectstate

import "testing"

func TestDocumentWorkflowPromptTemplateReferencesListsWorkflowEdgesOnly(t *testing.T) {
	t.Parallel()

	projectAlpha := stateMachineMutationTestProject(t)
	projectAlpha.StateMachineEdges = []StateMachineEdge{
		{
			ID:              "edge-alpha",
			MachineGroupID:  "workflow-a",
			SourceSectionID: "gate-section",
			SourcePortID:    StateMachineEdgeSourcePortID,
			TargetSectionID: "chat-section",
			TargetPortID:    StateMachineEdgeTargetPortID,
			TargetAction: &StateMachineTargetAction{
				Type:             StateMachineTargetActionTypeSendPrompt,
				PromptTemplateID: stringPointer("template-alpha"),
				ThreadStrategy:   StateMachineThreadStrategyContinueCurrentThread,
			},
		},
	}
	if err := projectAlpha.SetPromptTemplateLink("prompt-section", stringPointer("template-alpha"), "Linked {{ name }}", PromptFormatJinja); err != nil {
		t.Fatalf("SetPromptTemplateLink returned error: %v", err)
	}

	projectBeta := stateMachineMutationTestProject(t)
	projectBeta.ID = "project-beta"
	projectBeta.Name = "Beta"
	projectBeta.StateMachineEdges = []StateMachineEdge{
		{
			ID:              "edge-beta",
			MachineGroupID:  "workflow-b",
			SourceSectionID: "gate-section",
			SourcePortID:    StateMachineEdgeSourcePortID,
			TargetSectionID: "chat-section",
			TargetPortID:    StateMachineEdgeTargetPortID,
			TargetAction: &StateMachineTargetAction{
				Type:             StateMachineTargetActionTypeSendPrompt,
				PromptTemplateID: stringPointer("template-alpha"),
				ThreadStrategy:   StateMachineThreadStrategyContinueCurrentThread,
			},
		},
		{
			ID:              "edge-other-template",
			MachineGroupID:  "workflow-b",
			SourceSectionID: "gate-section",
			SourcePortID:    StateMachineEdgeSourcePortID,
			TargetSectionID: "chat-section",
			TargetPortID:    StateMachineEdgeTargetPortID,
			TargetAction: &StateMachineTargetAction{
				Type:             StateMachineTargetActionTypeSendPrompt,
				PromptTemplateID: stringPointer("template-other"),
				ThreadStrategy:   StateMachineThreadStrategyContinueCurrentThread,
			},
		},
	}

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-beta":  projectBeta,
			"project-alpha": projectAlpha,
		},
	}

	references := document.WorkflowPromptTemplateReferences("template-alpha")
	expected := []string{
		"project project-alpha, edge edge-alpha",
		"project project-beta, edge edge-beta",
	}
	if len(references) != len(expected) {
		t.Fatalf("expected %d references, got %#v", len(expected), references)
	}
	for index, reference := range references {
		if reference != expected[index] {
			t.Fatalf("expected reference %q at index %d, got %#v", expected[index], index, references)
		}
	}
}
