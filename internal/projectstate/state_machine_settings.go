package projectstate

import (
	"context"
	"fmt"
	"strings"
)

func (d *Document) SetStateMachineSectionSettings(
	projectID string,
	sectionID string,
	settings StateMachineSectionSettings,
) error {
	if d == nil {
		return ErrProjectNotFound
	}
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetStateMachineSectionSettings(sectionID, settings); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetStateMachineSectionSettings(
	ctx context.Context,
	projectID string,
	sectionID string,
	settings StateMachineSectionSettings,
) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetStateMachineSectionSettings(projectID, sectionID, settings); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetStateMachineSectionSettings(
	sectionID string,
	settings StateMachineSectionSettings,
) error {
	if p == nil {
		return ErrProjectNotFound
	}
	section, _, _, sectionType, err := p.resolveStateMachineSectionMutationState(sectionID)
	if err != nil {
		return err
	}
	if err := validateStateMachineMachineGroupID(settings.MachineGroupID, "State machine section "+section.ID); err != nil {
		return err
	}
	if err := p.validateStateMachineSectionSettingsMachineGroup(section.ID, settings.MachineGroupID); err != nil {
		return err
	}
	if err := p.applyStateMachineSectionSharedSettings(section.ID, settings); err != nil {
		return err
	}
	return p.applyStateMachineSectionGateSettings(section.ID, sectionType, settings.GateType)
}

func (p *Project) validateStateMachineSectionSettingsMachineGroup(
	sectionID string,
	machineGroupID string,
) error {
	return p.validateStateMachineEdges(
		p.StateMachineEdges,
		map[string]string{sectionID: machineGroupID},
		nil,
	)
}

func (p *Project) applyStateMachineSectionSharedSettings(
	sectionID string,
	settings StateMachineSectionSettings,
) error {
	if err := p.setCurrentSectionField(sectionID, "machineGroupId", settings.MachineGroupID); err != nil {
		return err
	}
	return p.setCurrentSectionField(sectionID, "label", settings.Label)
}

func (p *Project) applyStateMachineSectionGateSettings(
	sectionID string,
	sectionType string,
	gateType *StateMachineGateType,
) error {
	if !strings.EqualFold(sectionType, "StateMachineGate") {
		if gateType != nil {
			return fmt.Errorf("%w: only gate sections accept a gate type", ErrStateMachineGateTypeInvalid)
		}
		return nil
	}
	if gateType == nil {
		return fmt.Errorf("%w: gate sections require a gate type", ErrStateMachineGateTypeInvalid)
	}
	normalized, err := normalizeStateMachineGateType(*gateType)
	if err != nil {
		return err
	}
	return p.setCurrentSectionField(sectionID, "gateType", string(normalized))
}
