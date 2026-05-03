package projectstate

import (
	"fmt"
)

func FrontendStateMachineConnectionSourceTypes() []FrontendSectionType {
	return append([]FrontendSectionType(nil), stateMachineConnectionSourceTypes...)
}

func FrontendStateMachineConnectionTargetTypes() []FrontendSectionType {
	return append([]FrontendSectionType(nil), stateMachineConnectionTargetTypes...)
}

func FrontendStateMachineSelfLoopSectionTypes() []FrontendSectionType {
	return append([]FrontendSectionType(nil), stateMachineSelfLoopSectionTypes...)
}

func (p *Project) uniqueConnectedStateMachineGroupID(sectionID string) *string {
	groupIDs := make(map[string]struct{})
	for _, edge := range p.StateMachineEdges {
		if edge.SourceSectionID == sectionID || edge.TargetSectionID == sectionID {
			groupIDs[edge.MachineGroupID] = struct{}{}
		}
	}
	if len(groupIDs) != 1 {
		return nil
	}
	for groupID := range groupIDs {
		return &groupID
	}
	return nil
}

func (p *Project) resolveExistingMachineGroupIDForStateMachineEndpoint(
	sectionID string,
	sectionType string,
	payload map[string]any,
) *string {
	switch sectionType {
	case "StateMachineStart", "StateMachineGate", "StateMachineEnd":
		groupID := payloadStringField(payload, "machineGroupId")
		return &groupID
	default:
		return p.uniqueConnectedStateMachineGroupID(sectionID)
	}
}

func (p *Project) stateMachineGroupMergeReplacements(edge StateMachineEdge) (map[string]string, error) {
	sourceEndpoint, err := p.resolveStateMachineEdgeEndpoint(edge.SourceSectionID)
	if err != nil {
		return nil, err
	}
	targetEndpoint, err := p.resolveStateMachineEdgeEndpoint(edge.TargetSectionID)
	if err != nil {
		return nil, err
	}
	sourceMachineGroupID := p.resolveExistingMachineGroupIDForStateMachineEndpoint(
		sourceEndpoint.sectionID,
		sourceEndpoint.sectionType,
		sourceEndpoint.payload,
	)
	targetMachineGroupID := p.resolveExistingMachineGroupIDForStateMachineEndpoint(
		targetEndpoint.sectionID,
		targetEndpoint.sectionType,
		targetEndpoint.payload,
	)

	existingMachineGroupIDs := make(map[string]struct{}, 2)
	if sourceMachineGroupID != nil {
		existingMachineGroupIDs[*sourceMachineGroupID] = struct{}{}
	}
	if targetMachineGroupID != nil {
		existingMachineGroupIDs[*targetMachineGroupID] = struct{}{}
	}
	if len(existingMachineGroupIDs) <= 1 {
		return map[string]string{}, nil
	}
	if _, ok := existingMachineGroupIDs[edge.MachineGroupID]; !ok {
		return nil, stateMachineEdgeInvalidf(
			"State machine edge %s machine group must match one of the connected machine groups.",
			edge.ID,
		)
	}
	replacements := make(map[string]string, len(existingMachineGroupIDs)-1)
	for machineGroupID := range existingMachineGroupIDs {
		if machineGroupID == edge.MachineGroupID {
			continue
		}
		replacements[machineGroupID] = edge.MachineGroupID
	}
	return replacements, nil
}

func (p *Project) stateMachineGroupMergeOverrides(
	mergeReplacements map[string]string,
) map[string]string {
	if len(mergeReplacements) == 0 {
		return map[string]string{}
	}
	overrides := map[string]string{}
	for sectionID := range p.Sections {
		section, variant, impl, err := p.ResolveSection(sectionID)
		if err != nil {
			continue
		}
		payload, err := effectiveSectionPayload(*p, section.ID, variant.ID)
		if err != nil {
			continue
		}
		sectionType := payloadStringField(payload, "type")
		if sectionType == "" {
			sectionType = fallbackSectionType(impl)
		}
		switch sectionType {
		case "StateMachineStart", "StateMachineGate", "StateMachineEnd":
			if replacement, ok := mergeReplacements[payloadStringField(payload, "machineGroupId")]; ok {
				overrides[sectionID] = replacement
			}
		}
	}
	return overrides
}

func (p *Project) applyStateMachineGroupMerge(mergeReplacements map[string]string) error {
	if len(mergeReplacements) == 0 {
		return nil
	}
	for sectionID, machineGroupID := range p.stateMachineGroupMergeOverrides(mergeReplacements) {
		if err := p.setCurrentSectionField(sectionID, "machineGroupId", machineGroupID); err != nil {
			return err
		}
	}
	for index, edge := range p.StateMachineEdges {
		if replacement, ok := mergeReplacements[edge.MachineGroupID]; ok {
			edge.MachineGroupID = replacement
			p.StateMachineEdges[index] = edge
		}
	}
	return nil
}

func stateMachineEdgeInvalidf(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrStateMachineEdgeInvalid, fmt.Sprintf(format, args...))
}
