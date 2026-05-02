package statemachineruns

import (
	"encoding/json"
	"fmt"
	"strings"

	"setta/internal/projectstate"
)

func buildGraphSectionInventory(project projectstate.Project, machineGroupID string) graphSectionInventory {
	inventory := graphSectionInventory{
		sections:        map[string]graphSection{},
		startSectionIDs: []string{},
	}
	for sectionID := range project.Sections {
		section, err := buildGraphSection(project, sectionID)
		if err != nil {
			continue
		}
		switch section.Kind {
		case graphSectionKindStart, graphSectionKindGate, graphSectionKindEnd:
			if machineGroupIDForSection(project, sectionID) != machineGroupID {
				continue
			}
			inventory.sections[sectionID] = section
			if section.Kind == graphSectionKindStart {
				inventory.startSectionIDs = append(inventory.startSectionIDs, sectionID)
			}
			if section.Kind == graphSectionKindEnd {
				inventory.endSectionCount++
			}
		}
	}
	return inventory
}

func resolveGraphStartSectionID(
	machineGroupID string,
	startSectionID *string,
	inventory graphSectionInventory,
) (string, error) {
	if len(inventory.startSectionIDs) == 0 {
		return "", fmt.Errorf(
			"%w: state machine group %s does not have a Start section",
			ErrInvalidStateMachineInput,
			machineGroupID,
		)
	}
	if inventory.endSectionCount == 0 {
		return "", fmt.Errorf(
			"%w: state machine group %s must resolve to at least one End section",
			ErrInvalidStateMachineInput,
			machineGroupID,
		)
	}
	if len(inventory.startSectionIDs) != 1 {
		return "", fmt.Errorf(
			"%w: state machine group %s must resolve to exactly one Start section",
			ErrInvalidStateMachineInput,
			machineGroupID,
		)
	}
	resolvedStartSectionID := inventory.startSectionIDs[0]
	requestedStartSectionID := strings.TrimSpace(derefOptionalString(startSectionID))
	if requestedStartSectionID != "" && requestedStartSectionID != resolvedStartSectionID {
		return "", fmt.Errorf(
			"%w: state machine start %s not found in group %s",
			projectstate.ErrSectionNotFound,
			requestedStartSectionID,
			machineGroupID,
		)
	}
	return resolvedStartSectionID, nil
}

func buildGraphEdges(
	project projectstate.Project,
	machineGroupID string,
	sections map[string]graphSection,
) ([]projectstate.StateMachineEdge, error) {
	edges := make([]projectstate.StateMachineEdge, 0)
	for _, edge := range project.StateMachineEdges {
		if edge.MachineGroupID != machineGroupID {
			continue
		}
		edges = append(edges, edge.Clone())
		if err := ensureGraphSection(project, sections, edge.SourceSectionID); err != nil {
			return nil, err
		}
		if err := ensureGraphSection(project, sections, edge.TargetSectionID); err != nil {
			return nil, err
		}
	}
	return edges, nil
}

func ensureGraphSection(
	project projectstate.Project,
	sections map[string]graphSection,
	sectionID string,
) error {
	if _, ok := sections[sectionID]; ok {
		return nil
	}
	section, err := buildGraphSection(project, sectionID)
	if err != nil {
		return err
	}
	sections[sectionID] = section
	return nil
}

func buildGraphSection(project projectstate.Project, sectionID string) (graphSection, error) {
	section, variant, _, err := project.ResolveSection(sectionID)
	if err != nil {
		return graphSection{}, err
	}
	payload, err := project.EffectiveSectionPayload(section.ID, variant.ID)
	if err != nil {
		return graphSection{}, err
	}
	sectionType := strings.TrimSpace(payloadString(payload, "type"))
	switch sectionType {
	case "StateMachineStart":
		return graphSection{
			ID:    section.ID,
			Kind:  graphSectionKindStart,
			Label: payloadString(payload, "label"),
		}, nil
	case "StateMachineGate":
		gateType := projectstate.StateMachineGateType(strings.TrimSpace(payloadString(payload, "gateType")))
		return graphSection{
			ID:       section.ID,
			Kind:     graphSectionKindGate,
			Label:    payloadString(payload, "label"),
			GateType: &gateType,
		}, nil
	case "StateMachineEnd":
		return graphSection{
			ID:    section.ID,
			Kind:  graphSectionKindEnd,
			Label: payloadString(payload, "label"),
		}, nil
	case "Chat":
		engineConfigID := optionalStringPointer(payloadString(payload, "engineConfigId"))
		agentProfileID := optionalStringPointer(payloadString(payload, "agentProfileId"))
		permissionMode := optionalStringPointer(payloadString(payload, "permissionMode"))
		searchEnabled := optionalBoolPointer(payload, "searchEnabled")
		return graphSection{
			ID:             section.ID,
			Kind:           graphSectionKindChat,
			Label:          strings.TrimSpace(section.Name),
			EngineConfigID: engineConfigID,
			AgentProfileID: agentProfileID,
			PermissionMode: permissionMode,
			SearchEnabled:  searchEnabled,
		}, nil
	default:
		return graphSection{}, fmt.Errorf("section %s is not a workflow section", section.ID)
	}
}

func machineGroupIDForSection(project projectstate.Project, sectionID string) string {
	section, variant, _, err := project.ResolveSection(sectionID)
	if err != nil {
		return ""
	}
	payload, err := project.EffectiveSectionPayload(section.ID, variant.ID)
	if err != nil {
		return ""
	}
	return payloadString(payload, "machineGroupId")
}

func (g graph) jsonValue() (map[string]any, error) {
	content, err := json.Marshal(g)
	if err != nil {
		return nil, fmt.Errorf("encode state machine graph snapshot: %w", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		return nil, fmt.Errorf("decode state machine graph snapshot payload: %w", err)
	}
	return payload, nil
}

func decodeGraph(raw any) (graph, error) {
	content, err := json.Marshal(raw)
	if err != nil {
		return graph{}, fmt.Errorf("encode state machine graph snapshot: %w", err)
	}
	var snapshot graph
	if err := json.Unmarshal(content, &snapshot); err != nil {
		return graph{}, fmt.Errorf("decode state machine graph snapshot: %w", err)
	}
	if snapshot.Sections == nil {
		snapshot.Sections = map[string]graphSection{}
	}
	return snapshot, nil
}

func (r *Runtime) outgoingEdges(graph graph, sourceSectionID string) []projectstate.StateMachineEdge {
	edges := make([]projectstate.StateMachineEdge, 0)
	for _, edge := range graph.Edges {
		if edge.SourceSectionID == sourceSectionID {
			edges = append(edges, edge.Clone())
		}
	}
	return edges
}
