package statemachineruns

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/projectstate"
)

func startOnlyRuntimeTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"start-section": "start-variant",
		},
		Sections: map[string]projectstate.Section{
			"start-section": {ID: "start-section", Name: "Start Section", VariantIDs: []string{"start-variant"}, DefaultVariantID: "start-variant"},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"start-variant": {ID: "start-variant", ImplID: "start-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"start-impl": {ID: "start-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "start-impl",
				"type":           "StateMachineStart",
				"machineGroupId": "workflow-start-only",
				"label":          "Draft Start",
			})},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize start-only workflow project: %v", err)
	}
	return project
}

func stalledRuntimeTestProject(t *testing.T, machineGroupID string) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"start-section": "start-variant",
			"chat-section":  "chat-variant",
			"end-section":   "end-variant",
		},
		Sections: map[string]projectstate.Section{
			"start-section": {ID: "start-section", Name: "Start Section", VariantIDs: []string{"start-variant"}, DefaultVariantID: "start-variant"},
			"chat-section":  {ID: "chat-section", Name: "Review Chat", VariantIDs: []string{"chat-variant"}, DefaultVariantID: "chat-variant"},
			"end-section":   {ID: "end-section", Name: "Done", VariantIDs: []string{"end-variant"}, DefaultVariantID: "end-variant"},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"start-variant": {ID: "start-variant", ImplID: "start-impl"},
			"chat-variant":  {ID: "chat-variant", ImplID: "chat-impl"},
			"end-variant":   {ID: "end-variant", ImplID: "end-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"start-impl": {ID: "start-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "start-impl",
				"type":           "StateMachineStart",
				"machineGroupId": machineGroupID,
				"label":          "Kickoff",
			})},
			"chat-impl": {ID: "chat-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "chat-impl",
				"type":           "Chat",
				"engineConfigId": "engine-managed",
				"permissionMode": "minimal",
				"searchEnabled":  true,
				"chatId":         nil,
			})},
			"end-impl": {ID: "end-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "end-impl",
				"type":           "StateMachineEnd",
				"machineGroupId": machineGroupID,
				"label":          "Done",
			})},
		},
		StateMachineEdges: []projectstate.StateMachineEdge{
			{
				ID:              "edge-start-chat",
				MachineGroupID:  machineGroupID,
				SourceSectionID: "start-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Review the draft."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize stalled workflow project: %v", err)
	}
	return project
}

func gateRuntimeTestProject(
	t *testing.T,
	machineGroupID string,
	gateType projectstate.StateMachineGateType,
	sourceChatSectionIDs []string,
	gateTargetChatID *string,
) projectstate.Project {
	t.Helper()

	sectionVariantMap := map[string]string{
		"start-section": "start-variant",
		"gate-section":  "gate-variant",
		"end-section":   "end-variant",
	}
	sections := map[string]projectstate.Section{
		"start-section": {ID: "start-section", Name: "Start Section", VariantIDs: []string{"start-variant"}, DefaultVariantID: "start-variant"},
		"gate-section":  {ID: "gate-section", Name: "Gate Section", VariantIDs: []string{"gate-variant"}, DefaultVariantID: "gate-variant"},
		"end-section":   {ID: "end-section", Name: "End Section", VariantIDs: []string{"end-variant"}, DefaultVariantID: "end-variant"},
	}
	sectionVariants := map[string]projectstate.SectionVariant{
		"start-variant": {ID: "start-variant", ImplID: "start-impl"},
		"gate-variant":  {ID: "gate-variant", ImplID: "gate-impl"},
		"end-variant":   {ID: "end-variant", ImplID: "end-impl"},
	}
	sectionImpls := map[string]projectstate.SectionImpl{
		"start-impl": {ID: "start-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
			"id":             "start-impl",
			"type":           "StateMachineStart",
			"machineGroupId": machineGroupID,
			"label":          "Start",
		})},
		"gate-impl": {ID: "gate-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
			"id":             "gate-impl",
			"type":           "StateMachineGate",
			"machineGroupId": machineGroupID,
			"label":          "gate-section",
			"gateType":       string(gateType),
		})},
		"end-impl": {ID: "end-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
			"id":             "end-impl",
			"type":           "StateMachineEnd",
			"machineGroupId": machineGroupID,
			"label":          "Done",
		})},
	}
	edges := make([]projectstate.StateMachineEdge, 0, len(sourceChatSectionIDs)*2+2)
	for index, sectionID := range sourceChatSectionIDs {
		variantID := sectionID + "-variant"
		implID := sectionID + "-impl"
		sectionVariantMap[sectionID] = variantID
		sections[sectionID] = projectstate.Section{
			ID:               sectionID,
			Name:             strings.ToUpper(sectionID),
			VariantIDs:       []string{variantID},
			DefaultVariantID: variantID,
		}
		sectionVariants[variantID] = projectstate.SectionVariant{ID: variantID, ImplID: implID}
		sectionImpls[implID] = projectstate.SectionImpl{
			ID:   implID,
			Kind: projectstate.SectionKind("frontend"),
			Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             implID,
				"type":           "Chat",
				"engineConfigId": "engine-managed",
				"permissionMode": "minimal",
				"searchEnabled":  true,
				"chatId":         nil,
			}),
		}
		edges = append(edges,
			projectstate.StateMachineEdge{
				ID:              fmt.Sprintf("edge-start-%s", sectionID),
				MachineGroupID:  machineGroupID,
				SourceSectionID: "start-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: sectionID,
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer(fmt.Sprintf("Review branch %d.", index+1)),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			projectstate.StateMachineEdge{
				ID:              fmt.Sprintf("edge-%s-gate", sectionID),
				MachineGroupID:  machineGroupID,
				SourceSectionID: sectionID,
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "gate-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type: projectstate.StateMachineSourceFilterTypeRunCompleted,
				},
			},
		)
	}
	if gateTargetChatID != nil {
		sectionID := strings.TrimSpace(*gateTargetChatID)
		variantID := sectionID + "-variant"
		implID := sectionID + "-impl"
		sectionVariantMap[sectionID] = variantID
		sections[sectionID] = projectstate.Section{
			ID:               sectionID,
			Name:             strings.ToUpper(sectionID),
			VariantIDs:       []string{variantID},
			DefaultVariantID: variantID,
		}
		sectionVariants[variantID] = projectstate.SectionVariant{ID: variantID, ImplID: implID}
		sectionImpls[implID] = projectstate.SectionImpl{
			ID:   implID,
			Kind: projectstate.SectionKind("frontend"),
			Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             implID,
				"type":           "Chat",
				"engineConfigId": "engine-managed",
				"permissionMode": "minimal",
				"searchEnabled":  true,
				"chatId":         nil,
			}),
		}
		edges = append(edges,
			projectstate.StateMachineEdge{
				ID:              "edge-gate-chat-target",
				MachineGroupID:  machineGroupID,
				SourceSectionID: "gate-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: sectionID,
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Take the follow-up pass."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			projectstate.StateMachineEdge{
				ID:              "edge-chat-target-end",
				MachineGroupID:  machineGroupID,
				SourceSectionID: sectionID,
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "end-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type: projectstate.StateMachineSourceFilterTypeRunCompleted,
				},
			},
		)
	} else {
		edges = append(edges, projectstate.StateMachineEdge{
			ID:              "edge-gate-end",
			MachineGroupID:  machineGroupID,
			SourceSectionID: "gate-section",
			SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
			TargetSectionID: "end-section",
			TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
		})
	}

	project, err := projectstate.Project{
		ID:                "project-alpha",
		Name:              "Alpha",
		SectionVariantMap: sectionVariantMap,
		Sections:          sections,
		SectionVariants:   sectionVariants,
		SectionImpls:      sectionImpls,
		StateMachineEdges: edges,
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize gate workflow project: %v", err)
	}
	return project
}

func gateSourceCountLoopRuntimeTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"start-section": "start-variant",
			"gate-section":  "gate-variant",
			"end-section":   "end-variant",
			"chat-a":        "chat-a-variant",
			"chat-b":        "chat-b-variant",
			"chat-c":        "chat-c-variant",
		},
		Sections: map[string]projectstate.Section{
			"start-section": {ID: "start-section", Name: "Start Section", VariantIDs: []string{"start-variant"}, DefaultVariantID: "start-variant"},
			"gate-section":  {ID: "gate-section", Name: "Gate Section", VariantIDs: []string{"gate-variant"}, DefaultVariantID: "gate-variant"},
			"end-section":   {ID: "end-section", Name: "End Section", VariantIDs: []string{"end-variant"}, DefaultVariantID: "end-variant"},
			"chat-a":        {ID: "chat-a", Name: "Chat A", VariantIDs: []string{"chat-a-variant"}, DefaultVariantID: "chat-a-variant"},
			"chat-b":        {ID: "chat-b", Name: "Chat B", VariantIDs: []string{"chat-b-variant"}, DefaultVariantID: "chat-b-variant"},
			"chat-c":        {ID: "chat-c", Name: "Chat C", VariantIDs: []string{"chat-c-variant"}, DefaultVariantID: "chat-c-variant"},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"start-variant":  {ID: "start-variant", ImplID: "start-impl"},
			"gate-variant":   {ID: "gate-variant", ImplID: "gate-impl"},
			"end-variant":    {ID: "end-variant", ImplID: "end-impl"},
			"chat-a-variant": {ID: "chat-a-variant", ImplID: "chat-a-impl"},
			"chat-b-variant": {ID: "chat-b-variant", ImplID: "chat-b-impl"},
			"chat-c-variant": {ID: "chat-c-variant", ImplID: "chat-c-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"start-impl": {ID: "start-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "start-impl",
				"type":           "StateMachineStart",
				"machineGroupId": "workflow-source-count",
				"label":          "Start",
			})},
			"gate-impl": {ID: "gate-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "gate-impl",
				"type":           "StateMachineGate",
				"machineGroupId": "workflow-source-count",
				"label":          "gate-section",
				"gateType":       string(projectstate.StateMachineGateTypeAND),
			})},
			"end-impl": {ID: "end-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "end-impl",
				"type":           "StateMachineEnd",
				"machineGroupId": "workflow-source-count",
				"label":          "Done",
			})},
			"chat-a-impl": {ID: "chat-a-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "chat-a-impl",
				"type":           "Chat",
				"engineConfigId": "engine-managed",
				"permissionMode": "minimal",
				"searchEnabled":  true,
			})},
			"chat-b-impl": {ID: "chat-b-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "chat-b-impl",
				"type":           "Chat",
				"engineConfigId": "engine-managed",
				"permissionMode": "minimal",
				"searchEnabled":  true,
			})},
			"chat-c-impl": {ID: "chat-c-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "chat-c-impl",
				"type":           "Chat",
				"engineConfigId": "engine-managed",
				"permissionMode": "minimal",
				"searchEnabled":  true,
			})},
		},
		StateMachineEdges: []projectstate.StateMachineEdge{
			{
				ID:              "edge-start-chat-a",
				MachineGroupID:  "workflow-source-count",
				SourceSectionID: "start-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-a",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Review branch A."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-start-chat-b",
				MachineGroupID:  "workflow-source-count",
				SourceSectionID: "start-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-b",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Review branch B."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-start-chat-c",
				MachineGroupID:  "workflow-source-count",
				SourceSectionID: "start-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-c",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Review branch C."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-chat-a-gate",
				MachineGroupID:  "workflow-source-count",
				SourceSectionID: "chat-a",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "gate-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type: projectstate.StateMachineSourceFilterTypeRunCompleted,
				},
			},
			{
				ID:              "edge-chat-b-gate",
				MachineGroupID:  "workflow-source-count",
				SourceSectionID: "chat-b",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "gate-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type: projectstate.StateMachineSourceFilterTypeRunCompleted,
				},
			},
			{
				ID:              "edge-chat-c-gate",
				MachineGroupID:  "workflow-source-count",
				SourceSectionID: "chat-c",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "gate-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type: projectstate.StateMachineSourceFilterTypeRunCompleted,
				},
			},
			{
				ID:              "edge-gate-loop-a-first",
				MachineGroupID:  "workflow-source-count",
				SourceSectionID: "gate-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-a",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceActivationCountCondition: &projectstate.StateMachineSourceActivationCountCondition{
					Operator: projectstate.StateMachineCountOperatorEQ,
					Value:    0,
				},
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Retry branch A once."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-gate-loop-b-first",
				MachineGroupID:  "workflow-source-count",
				SourceSectionID: "gate-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-b",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceActivationCountCondition: &projectstate.StateMachineSourceActivationCountCondition{
					Operator: projectstate.StateMachineCountOperatorEQ,
					Value:    0,
				},
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Retry branch B once."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-gate-loop-c-first",
				MachineGroupID:  "workflow-source-count",
				SourceSectionID: "gate-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-c",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceActivationCountCondition: &projectstate.StateMachineSourceActivationCountCondition{
					Operator: projectstate.StateMachineCountOperatorEQ,
					Value:    0,
				},
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Retry branch C once."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-gate-loop-a-second",
				MachineGroupID:  "workflow-source-count",
				SourceSectionID: "gate-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-a",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceActivationCountCondition: &projectstate.StateMachineSourceActivationCountCondition{
					Operator: projectstate.StateMachineCountOperatorEQ,
					Value:    1,
				},
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Retry branch A twice."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-gate-loop-b-second",
				MachineGroupID:  "workflow-source-count",
				SourceSectionID: "gate-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-b",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceActivationCountCondition: &projectstate.StateMachineSourceActivationCountCondition{
					Operator: projectstate.StateMachineCountOperatorEQ,
					Value:    1,
				},
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Retry branch B twice."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-gate-loop-c-second",
				MachineGroupID:  "workflow-source-count",
				SourceSectionID: "gate-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-c",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceActivationCountCondition: &projectstate.StateMachineSourceActivationCountCondition{
					Operator: projectstate.StateMachineCountOperatorEQ,
					Value:    1,
				},
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Retry branch C twice."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-gate-end",
				MachineGroupID:  "workflow-source-count",
				SourceSectionID: "gate-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "end-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceActivationCountCondition: &projectstate.StateMachineSourceActivationCountCondition{
					Operator: projectstate.StateMachineCountOperatorEQ,
					Value:    2,
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize source-count workflow project: %v", err)
	}
	return project
}

func failedChildToEndRuntimeTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"start-section": "start-variant",
			"chat-a":        "chat-a-variant",
			"end-section":   "end-variant",
		},
		Sections: map[string]projectstate.Section{
			"start-section": {ID: "start-section", Name: "Start Section", VariantIDs: []string{"start-variant"}, DefaultVariantID: "start-variant"},
			"chat-a":        {ID: "chat-a", Name: "Chat A", VariantIDs: []string{"chat-a-variant"}, DefaultVariantID: "chat-a-variant"},
			"end-section":   {ID: "end-section", Name: "Done", VariantIDs: []string{"end-variant"}, DefaultVariantID: "end-variant"},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"start-variant":  {ID: "start-variant", ImplID: "start-impl"},
			"chat-a-variant": {ID: "chat-a-variant", ImplID: "chat-a-impl"},
			"end-variant":    {ID: "end-variant", ImplID: "end-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"start-impl": {ID: "start-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "start-impl",
				"type":           "StateMachineStart",
				"machineGroupId": "workflow-failed-end",
				"label":          "Kickoff",
			})},
			"chat-a-impl": {ID: "chat-a-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "chat-a-impl",
				"type":           "Chat",
				"engineConfigId": "engine-managed",
				"permissionMode": "minimal",
				"searchEnabled":  true,
				"chatId":         nil,
			})},
			"end-impl": {ID: "end-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "end-impl",
				"type":           "StateMachineEnd",
				"machineGroupId": "workflow-failed-end",
				"label":          "Done",
			})},
		},
		StateMachineEdges: []projectstate.StateMachineEdge{
			{
				ID:              "edge-start-chat-a",
				MachineGroupID:  "workflow-failed-end",
				SourceSectionID: "start-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-a",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Review the draft."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-chat-a-end-on-failure",
				MachineGroupID:  "workflow-failed-end",
				SourceSectionID: "chat-a",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "end-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type: projectstate.StateMachineSourceFilterTypeRunFailed,
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize failed-child end workflow project: %v", err)
	}
	return project
}

func signalGateWaitingRuntimeTestProjectWithSourceAgentProfile(t *testing.T, agentProfileID *string) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"start-section": "start-variant",
			"chat-source":   "chat-source-variant",
			"gate-section":  "gate-variant",
			"chat-target":   "chat-target-variant",
			"end-section":   "end-variant",
		},
		Sections: map[string]projectstate.Section{
			"start-section": {ID: "start-section", Name: "Start Section", VariantIDs: []string{"start-variant"}, DefaultVariantID: "start-variant"},
			"chat-source":   {ID: "chat-source", Name: "Review Chat", VariantIDs: []string{"chat-source-variant"}, DefaultVariantID: "chat-source-variant"},
			"gate-section":  {ID: "gate-section", Name: "Decision Gate", VariantIDs: []string{"gate-variant"}, DefaultVariantID: "gate-variant"},
			"chat-target":   {ID: "chat-target", Name: "Follow Up Chat", VariantIDs: []string{"chat-target-variant"}, DefaultVariantID: "chat-target-variant"},
			"end-section":   {ID: "end-section", Name: "Done", VariantIDs: []string{"end-variant"}, DefaultVariantID: "end-variant"},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"start-variant":       {ID: "start-variant", ImplID: "start-impl"},
			"chat-source-variant": {ID: "chat-source-variant", ImplID: "chat-source-impl"},
			"gate-variant":        {ID: "gate-variant", ImplID: "gate-impl"},
			"chat-target-variant": {ID: "chat-target-variant", ImplID: "chat-target-impl"},
			"end-variant":         {ID: "end-variant", ImplID: "end-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"start-impl": {ID: "start-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "start-impl",
				"type":           "StateMachineStart",
				"machineGroupId": "workflow-signal-gate",
				"label":          "Kickoff",
			})},
			"chat-source-impl": {ID: "chat-source-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "chat-source-impl",
				"type":           "Chat",
				"engineConfigId": "engine-managed",
				"agentProfileId": agentProfileID,
				"permissionMode": "minimal",
				"searchEnabled":  true,
				"chatId":         nil,
			})},
			"gate-impl": {ID: "gate-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "gate-impl",
				"type":           "StateMachineGate",
				"machineGroupId": "workflow-signal-gate",
				"label":          "Decision Gate",
				"gateType":       string(projectstate.StateMachineGateTypeAND),
			})},
			"chat-target-impl": {ID: "chat-target-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "chat-target-impl",
				"type":           "Chat",
				"engineConfigId": "engine-managed",
				"permissionMode": "minimal",
				"searchEnabled":  true,
				"chatId":         nil,
			})},
			"end-impl": {ID: "end-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "end-impl",
				"type":           "StateMachineEnd",
				"machineGroupId": "workflow-signal-gate",
				"label":          "Done",
			})},
		},
		StateMachineEdges: []projectstate.StateMachineEdge{
			{
				ID:              "edge-start-source-chat",
				MachineGroupID:  "workflow-signal-gate",
				SourceSectionID: "start-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-source",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Review the draft."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-source-gate-signal",
				MachineGroupID:  "workflow-signal-gate",
				SourceSectionID: "chat-source",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "gate-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type:         projectstate.StateMachineSourceFilterTypeSignal,
					SignalName:   stringPointer("merge_decision"),
					PayloadField: stringPointer("decision"),
					Equals:       stringPointer("retry"),
				},
			},
			{
				ID:              "edge-source-gate-complete",
				MachineGroupID:  "workflow-signal-gate",
				SourceSectionID: "chat-source",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "gate-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type: projectstate.StateMachineSourceFilterTypeRunCompleted,
				},
			},
			{
				ID:              "edge-gate-target-chat",
				MachineGroupID:  "workflow-signal-gate",
				SourceSectionID: "gate-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-target",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Act on the retry decision."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-target-end",
				MachineGroupID:  "workflow-signal-gate",
				SourceSectionID: "chat-target",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "end-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type: projectstate.StateMachineSourceFilterTypeRunCompleted,
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize signal gate workflow project: %v", err)
	}
	return project
}

func signalRetryLoopRuntimeTestProjectWithSourceAgentProfile(t *testing.T, agentProfileID *string) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"start-section": "start-variant",
			"chat-source":   "chat-source-variant",
			"end-section":   "end-variant",
		},
		Sections: map[string]projectstate.Section{
			"start-section": {ID: "start-section", Name: "Start Section", VariantIDs: []string{"start-variant"}, DefaultVariantID: "start-variant"},
			"chat-source":   {ID: "chat-source", Name: "Review Chat", VariantIDs: []string{"chat-source-variant"}, DefaultVariantID: "chat-source-variant"},
			"end-section":   {ID: "end-section", Name: "Done", VariantIDs: []string{"end-variant"}, DefaultVariantID: "end-variant"},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"start-variant":       {ID: "start-variant", ImplID: "start-impl"},
			"chat-source-variant": {ID: "chat-source-variant", ImplID: "chat-source-impl"},
			"end-variant":         {ID: "end-variant", ImplID: "end-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"start-impl": {ID: "start-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "start-impl",
				"type":           "StateMachineStart",
				"machineGroupId": "workflow-signal-retry",
				"label":          "Kickoff",
			})},
			"chat-source-impl": {ID: "chat-source-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "chat-source-impl",
				"type":           "Chat",
				"engineConfigId": "engine-managed",
				"agentProfileId": agentProfileID,
				"permissionMode": "minimal",
				"searchEnabled":  true,
				"chatId":         nil,
			})},
			"end-impl": {ID: "end-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "end-impl",
				"type":           "StateMachineEnd",
				"machineGroupId": "workflow-signal-retry",
				"label":          "Done",
			})},
		},
		StateMachineEdges: []projectstate.StateMachineEdge{
			{
				ID:              "edge-start-source-chat",
				MachineGroupID:  "workflow-signal-retry",
				SourceSectionID: "start-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-source",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Review the draft."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-source-retry-first",
				MachineGroupID:  "workflow-signal-retry",
				SourceSectionID: "chat-source",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-source",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type:         projectstate.StateMachineSourceFilterTypeSignal,
					SignalName:   stringPointer("merge_decision"),
					PayloadField: stringPointer("decision"),
					Equals:       stringPointer("retry"),
				},
				SourceActivationCountCondition: &projectstate.StateMachineSourceActivationCountCondition{
					Operator: projectstate.StateMachineCountOperatorEQ,
					Value:    0,
				},
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Retry once."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-source-retry-second",
				MachineGroupID:  "workflow-signal-retry",
				SourceSectionID: "chat-source",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-source",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type:         projectstate.StateMachineSourceFilterTypeSignal,
					SignalName:   stringPointer("merge_decision"),
					PayloadField: stringPointer("decision"),
					Equals:       stringPointer("retry"),
				},
				SourceActivationCountCondition: &projectstate.StateMachineSourceActivationCountCondition{
					Operator: projectstate.StateMachineCountOperatorEQ,
					Value:    1,
				},
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Retry twice."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-source-end",
				MachineGroupID:  "workflow-signal-retry",
				SourceSectionID: "chat-source",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "end-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type:         projectstate.StateMachineSourceFilterTypeSignal,
					SignalName:   stringPointer("merge_decision"),
					PayloadField: stringPointer("decision"),
					Equals:       stringPointer("done"),
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize signal retry workflow project: %v", err)
	}
	return project
}

func signalStateMachineRuntimeTestProjectWithSourceAgentProfile(t *testing.T, agentProfileID *string) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"start-section": "start-variant",
			"chat-source":   "chat-source-variant",
			"chat-target":   "chat-target-variant",
			"end-section":   "end-variant",
		},
		Sections: map[string]projectstate.Section{
			"start-section": {ID: "start-section", Name: "Start Section", VariantIDs: []string{"start-variant"}, DefaultVariantID: "start-variant"},
			"chat-source":   {ID: "chat-source", Name: "Review Chat", VariantIDs: []string{"chat-source-variant"}, DefaultVariantID: "chat-source-variant"},
			"chat-target":   {ID: "chat-target", Name: "Follow Up Chat", VariantIDs: []string{"chat-target-variant"}, DefaultVariantID: "chat-target-variant"},
			"end-section":   {ID: "end-section", Name: "Done", VariantIDs: []string{"end-variant"}, DefaultVariantID: "end-variant"},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"start-variant":       {ID: "start-variant", ImplID: "start-impl"},
			"chat-source-variant": {ID: "chat-source-variant", ImplID: "chat-source-impl"},
			"chat-target-variant": {ID: "chat-target-variant", ImplID: "chat-target-impl"},
			"end-variant":         {ID: "end-variant", ImplID: "end-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"start-impl": {ID: "start-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "start-impl",
				"type":           "StateMachineStart",
				"machineGroupId": "workflow-signal",
				"label":          "Kickoff",
			})},
			"chat-source-impl": {ID: "chat-source-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "chat-source-impl",
				"type":           "Chat",
				"engineConfigId": "engine-managed",
				"agentProfileId": agentProfileID,
				"permissionMode": "minimal",
				"searchEnabled":  true,
				"chatId":         nil,
			})},
			"chat-target-impl": {ID: "chat-target-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "chat-target-impl",
				"type":           "Chat",
				"engineConfigId": "engine-managed",
				"permissionMode": "minimal",
				"searchEnabled":  true,
				"chatId":         nil,
			})},
			"end-impl": {ID: "end-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "end-impl",
				"type":           "StateMachineEnd",
				"machineGroupId": "workflow-signal",
				"label":          "Done",
			})},
		},
		StateMachineEdges: []projectstate.StateMachineEdge{
			{
				ID:              "edge-start-source-chat",
				MachineGroupID:  "workflow-signal",
				SourceSectionID: "start-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-source",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Review the draft."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-source-chat-retry",
				MachineGroupID:  "workflow-signal",
				SourceSectionID: "chat-source",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-target",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type:         projectstate.StateMachineSourceFilterTypeSignal,
					SignalName:   stringPointer("merge_decision"),
					PayloadField: stringPointer("decision"),
					Equals:       stringPointer("retry"),
				},
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Try another approach."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-source-chat-end",
				MachineGroupID:  "workflow-signal",
				SourceSectionID: "chat-source",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "end-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type:         projectstate.StateMachineSourceFilterTypeSignal,
					SignalName:   stringPointer("merge_decision"),
					PayloadField: stringPointer("decision"),
					Equals:       stringPointer("done"),
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize signal workflow project: %v", err)
	}
	return project
}

func mustMarshalStateMachineRuntimeObject(t *testing.T, value map[string]any) projectstate.RawJSON {
	t.Helper()

	content, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal section payload: %v", err)
	}
	return content
}

func hasEventType(run agentruns.Run, eventType string) bool {
	for _, event := range run.Events {
		if event.Type == eventType {
			return true
		}
	}
	return false
}

func eventTypes(run agentruns.Run) []string {
	result := make([]string, 0, len(run.Events))
	for _, event := range run.Events {
		result = append(result, event.Type)
	}
	return result
}

func sameStringMembers(got []string, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	gotCounts := make(map[string]int, len(got))
	for _, value := range got {
		gotCounts[value]++
	}
	for _, value := range want {
		if gotCounts[value] == 0 {
			return false
		}
		gotCounts[value]--
		if gotCounts[value] == 0 {
			delete(gotCounts, value)
		}
	}
	return len(gotCounts) == 0
}

func setChildRunStatus(t *testing.T, fixture runtimeFixture, childRunID string, status agentruns.RunStatus) agentruns.Run {
	t.Helper()

	childRun, err := fixture.runs.Load(childRunID)
	if err != nil {
		t.Fatalf("load child run %q: %v", childRunID, err)
	}
	childRun.Status = status
	if status != agentruns.RunStatusRunning {
		finishedAt := testNow()
		childRun.FinishedAt = &finishedAt
	}
	if err := fixture.runs.Save(childRun); err != nil {
		t.Fatalf("save child run %q with status %q: %v", childRunID, status, err)
	}
	return childRun
}

func anySliceToStrings(values []any) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		entry, ok := value.(string)
		if !ok {
			continue
		}
		result = append(result, entry)
	}
	return result
}

func numericInputValue(t *testing.T, run agentruns.Run, key string) int {
	t.Helper()

	value, ok := run.Inputs[key]
	if !ok {
		t.Fatalf("expected input %q on run %#v", key, run.Inputs)
	}
	switch typed := value.(type) {
	case int:
		return typed
	case float64:
		return int(typed)
	default:
		t.Fatalf("expected numeric input %q, got %#v", key, value)
		return 0
	}
}

func testNow() time.Time {
	return time.Date(2026, 3, 14, 18, 0, 0, 0, time.UTC)
}

func newTestAgentProfileStore(t *testing.T, profiles []agentprofiles.Profile) *agentprofiles.Store {
	t.Helper()

	store, err := agentprofiles.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new agent profile store: %v", err)
	}
	if err := store.Write(profiles); err != nil {
		t.Fatalf("write agent profiles: %v", err)
	}
	return store
}

func containsAll(value string, substrings ...string) bool {
	for _, substring := range substrings {
		if !strings.Contains(value, substring) {
			return false
		}
	}
	return true
}
