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
	if request.Operations == nil || len(request.Operations) == 0 || len(request.Operations) > 128 {
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
		var operation SetNameOperation
		if err := DecodeStrict(raw, &operation); err != nil {
			return err
		}
		project.Name = operation.Name
	case "setRuntime":
		var operation SetRuntimeOperation
		if err := DecodeStrict(raw, &operation); err != nil {
			return err
		}
		project.Runtime = operation.Runtime
	case "upsertSection":
		var operation UpsertSectionOperation
		if err := DecodeStrict(raw, &operation); err != nil {
			return err
		}
		project.Sections[operation.Section.ID] = operation.Section
		if operation.Layout == nil {
			delete(project.Layout.TopLevelSections, operation.Section.ID)
		} else {
			project.Layout.TopLevelSections[operation.Section.ID] = *operation.Layout
		}
	case "deleteSection":
		var operation DeleteSectionOperation
		if err := DecodeStrict(raw, &operation); err != nil {
			return err
		}
		deleteSection(project, operation.SectionID)
	case "setBinding":
		var operation SetBindingOperation
		if err := DecodeStrict(raw, &operation); err != nil {
			return err
		}
		setBinding(project, operation.Binding)
	case "deleteBinding":
		var operation DeleteBindingOperation
		if err := DecodeStrict(raw, &operation); err != nil {
			return err
		}
		deleteBinding(project, operation.BindingID)
	case "setConfiguration":
		var operation SetConfigurationOperation
		if err := DecodeStrict(raw, &operation); err != nil {
			return err
		}
		project.Configuration = operation.Configuration
	case "setViewport":
		var operation SetViewportOperation
		if err := DecodeStrict(raw, &operation); err != nil {
			return err
		}
		project.Layout.Viewport = operation.Viewport
	default:
		return fmt.Errorf("unsupported operation %q", discriminator.Operation)
	}
	return nil
}

func deleteSection(project *Project, sectionID string) {
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
	bindings := project.Bindings[:0]
	for _, binding := range project.Bindings {
		if binding.Trigger.SectionID == sectionID || bindingTargetsSection(binding, sectionID) {
			continue
		}
		bindings = append(bindings, binding)
	}
	project.Bindings = bindings
}

func bindingTargetsSection(binding Binding, sectionID string) bool {
	for _, output := range binding.Outputs {
		if output.SectionID == sectionID {
			return true
		}
	}
	return false
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
}
