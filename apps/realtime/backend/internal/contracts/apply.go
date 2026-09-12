package contracts

import (
	"encoding/json"
	"errors"
	"fmt"
)

func Apply(project Project, request ApplyRequest) (Project, error) {
	if request.ProjectID != project.ID {
		return Project{}, errors.New("contracts: project identity conflict")
	}
	if request.ExpectedRevision != project.Revision {
		return Project{}, errors.New("contracts: project revision conflict")
	}
	if len(request.Operations) == 0 || len(request.Operations) > 128 {
		return Project{}, errors.New("contracts: operations are missing or exceed the limit")
	}
	candidate, err := cloneProject(project)
	if err != nil {
		return Project{}, err
	}
	for index, raw := range request.Operations {
		if err := applyOperation(&candidate, raw); err != nil {
			return Project{}, fmt.Errorf("contracts: operation %d: %w", index, err)
		}
	}
	candidate.Revision++
	if err := candidate.Validate(); err != nil {
		return Project{}, err
	}
	return candidate, nil
}

func cloneProject(project Project) (Project, error) {
	encoded, err := json.Marshal(project)
	if err != nil {
		return Project{}, fmt.Errorf("contracts: clone project: %w", err)
	}
	var cloned Project
	if err := DecodeStrict(encoded, &cloned); err != nil {
		return Project{}, fmt.Errorf("contracts: clone project: %w", err)
	}
	return cloned, nil
}

func applyOperation(project *Project, raw json.RawMessage) error {
	var discriminator struct {
		Operation string `json:"op"`
	}
	if err := json.Unmarshal(raw, &discriminator); err != nil {
		return err
	}
	switch discriminator.Operation {
	case "setName":
		return applySetName(project, raw)
	case "setRuntime":
		return applySetRuntime(project, raw)
	case "upsertSection":
		return applyUpsertSection(project, raw)
	case "deleteSection":
		return applyDeleteSection(project, raw)
	case "setBinding":
		return applySetBinding(project, raw)
	case "deleteBinding":
		return applyDeleteBinding(project, raw)
	case "setConfiguration":
		return applySetConfiguration(project, raw)
	case "setViewport":
		return applySetViewport(project, raw)
	default:
		return fmt.Errorf("unsupported operation %q", discriminator.Operation)
	}
}

func applySetName(project *Project, raw json.RawMessage) error {
	var operation SetNameOperation
	if err := DecodeStrict(raw, &operation); err != nil {
		return err
	}
	project.Name = operation.Name
	return nil
}

func applySetRuntime(project *Project, raw json.RawMessage) error {
	var operation SetRuntimeOperation
	if err := DecodeStrict(raw, &operation); err != nil {
		return err
	}
	project.Runtime = operation.Runtime
	return nil
}

func applyUpsertSection(project *Project, raw json.RawMessage) error {
	var operation UpsertSectionOperation
	if err := DecodeStrict(raw, &operation); err != nil {
		return err
	}
	project.Sections[operation.Section.ID] = operation.Section
	if operation.Layout == nil {
		delete(project.Layout.TopLevelSections, operation.Section.ID)
		return nil
	}
	project.Layout.TopLevelSections[operation.Section.ID] = *operation.Layout
	return nil
}

func applyDeleteSection(project *Project, raw json.RawMessage) error {
	var operation DeleteSectionOperation
	if err := DecodeStrict(raw, &operation); err != nil {
		return err
	}
	deleteSection(project, operation.SectionID)
	return nil
}

func applySetBinding(project *Project, raw json.RawMessage) error {
	var operation SetBindingOperation
	if err := DecodeStrict(raw, &operation); err != nil {
		return err
	}
	setBinding(project, operation.Binding)
	return nil
}

func applyDeleteBinding(project *Project, raw json.RawMessage) error {
	var operation DeleteBindingOperation
	if err := DecodeStrict(raw, &operation); err != nil {
		return err
	}
	deleteBinding(project, operation.BindingID)
	return nil
}

func applySetConfiguration(project *Project, raw json.RawMessage) error {
	var operation SetConfigurationOperation
	if err := DecodeStrict(raw, &operation); err != nil {
		return err
	}
	project.Configuration = operation.Configuration
	return nil
}

func applySetViewport(project *Project, raw json.RawMessage) error {
	var operation SetViewportOperation
	if err := DecodeStrict(raw, &operation); err != nil {
		return err
	}
	project.Layout.Viewport = operation.Viewport
	return nil
}

func deleteSection(project *Project, sectionID string) {
	deleteSectionBinding(project, sectionID)
	deleteSectionRecord(project, sectionID)
	for index := range project.Bindings {
		binding := &project.Bindings[index]
		disconnectSectionTrigger(binding, sectionID)
		clearSectionOutputTargets(binding, sectionID)
		clearSectionArguments(binding, sectionID)
	}
}

func deleteSectionBinding(project *Project, sectionID string) {
	section, exists := project.Sections[sectionID]
	if !exists || section.Kind != "handler" {
		return
	}
	var data HandlerSectionData
	if DecodeStrict(section.Data, &data) == nil {
		deleteBinding(project, data.BindingID)
	}
}

func disconnectSectionTrigger(binding *Binding, sectionID string) {
	if binding.Trigger.Kind == "event" && binding.Trigger.SectionID == sectionID {
		disconnectBinding(binding)
	}
}

func clearSectionOutputTargets(binding *Binding, sectionID string) {
	for name, output := range binding.Outputs {
		if output.Target != nil && output.Target.SectionID == sectionID {
			output.Target = nil
			binding.Outputs[name] = output
		}
	}
}

func clearSectionArguments(binding *Binding, sectionID string) {
	for name, argument := range binding.Arguments {
		if bindingReferencesSection(argument, sectionID) {
			binding.Arguments[name] = json.RawMessage("null")
		}
	}
}

func deleteSectionRecord(project *Project, sectionID string) {
	delete(project.Sections, sectionID)
	delete(project.Layout.TopLevelSections, sectionID)
	for id, section := range project.Sections {
		children := section.Children[:0]
		for _, child := range section.Children {
			if child != sectionID {
				children = append(children, child)
			}
		}
		section.Children = children
		project.Sections[id] = section
	}
}

func setBinding(project *Project, candidate Binding) {
	for index := range project.Bindings {
		if project.Bindings[index].ID == candidate.ID {
			project.Bindings[index] = candidate
			return
		}
	}
	project.Bindings = append(project.Bindings, candidate)
}

func deleteBinding(project *Project, bindingID string) {
	bindings := project.Bindings[:0]
	for _, binding := range project.Bindings {
		if binding.ID != bindingID {
			bindings = append(bindings, binding)
		}
	}
	project.Bindings = bindings
	deleteBindingHandlerSections(project, bindingID)
	removeBindingInputReferences(project, bindingID)
}

func deleteBindingHandlerSections(project *Project, bindingID string) {
	for sectionID, section := range project.Sections {
		if section.Kind != "handler" {
			continue
		}
		var data HandlerSectionData
		if DecodeStrict(section.Data, &data) == nil && data.BindingID == bindingID {
			deleteSectionRecord(project, sectionID)
		}
	}
}

func removeBindingInputReferences(project *Project, bindingID string) {
	for index := range project.Bindings {
		binding := &project.Bindings[index]
		if binding.Trigger.Kind != "join" {
			continue
		}
		for name, input := range binding.Trigger.Inputs {
			if input.BindingID != bindingID {
				continue
			}
			delete(binding.Trigger.Inputs, name)
			if binding.Arguments == nil {
				binding.Arguments = make(map[string]json.RawMessage)
			}
			binding.Arguments[name] = json.RawMessage("null")
		}
		if len(binding.Trigger.Inputs) == 0 {
			disconnectBinding(binding)
		}
	}
}

func disconnectBinding(binding *Binding) {
	binding.Trigger = BindingTrigger{Kind: "disconnected"}
	if binding.Materialization != nil && binding.Materialization.Startup != "manual" {
		policy := *binding.Materialization
		policy.Startup = "manual"
		binding.Materialization = &policy
	}
}
