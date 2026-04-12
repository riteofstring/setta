package projectstate

import (
	"fmt"
	"sort"
)

type JSONSourceFileBinding struct {
	ProjectID string
	SectionID string
	VariantID string
}

type JSONSourceFileInput struct {
	Path     string
	Bindings []JSONSourceFileBinding
}

func JSONSourceFileInputs(document Document, workspaceRoot string) ([]JSONSourceFileInput, error) {
	targets, err := collectJSONSourceLoadTargets(document, workspaceRoot)
	if err != nil {
		return nil, err
	}

	bindingsByPath := map[string][]JSONSourceFileBinding{}
	for _, target := range targets {
		bindingsByPath[target.ResolvedPath] = append(
			bindingsByPath[target.ResolvedPath],
			JSONSourceFileBinding{
				ProjectID: target.ProjectID,
				SectionID: target.SectionID,
				VariantID: target.VariantID,
			},
		)
	}

	paths := make([]string, 0, len(bindingsByPath))
	for path := range bindingsByPath {
		paths = append(paths, path)
	}
	sort.Strings(paths)

	inputs := make([]JSONSourceFileInput, 0, len(paths))
	for _, path := range paths {
		bindings := append([]JSONSourceFileBinding(nil), bindingsByPath[path]...)
		sort.Slice(bindings, func(left int, right int) bool {
			if bindings[left].ProjectID != bindings[right].ProjectID {
				return bindings[left].ProjectID < bindings[right].ProjectID
			}
			if bindings[left].SectionID != bindings[right].SectionID {
				return bindings[left].SectionID < bindings[right].SectionID
			}
			return bindings[left].VariantID < bindings[right].VariantID
		})
		inputs = append(inputs, JSONSourceFileInput{
			Path:     path,
			Bindings: bindings,
		})
	}

	return inputs, nil
}

func (d *Document) ReloadJSONSourceBindingsFromDisk(workspaceRoot string, bindings []JSONSourceFileBinding) error {
	if d == nil {
		return ErrProjectNotFound
	}

	targets := make([]jsonSourceLoadTarget, 0, len(bindings))
	for _, binding := range bindings {
		target, err := resolveJSONSourceLoadTargetForBinding(*d, workspaceRoot, binding)
		if err != nil {
			return err
		}
		targets = append(targets, target)
	}

	return d.reloadJSONSourceTargetsFromDisk(targets)
}

func (d *Document) reloadJSONSourceTargetsFromDisk(targets []jsonSourceLoadTarget) error {
	if d == nil {
		return ErrProjectNotFound
	}

	groupKeys, targetsByGroup := groupJSONSourceTargets(targets)
	for _, groupKey := range groupKeys {
		if err := d.reloadJSONSourceTargetGroup(targetsByGroup[groupKey]); err != nil {
			return err
		}
	}

	return nil
}

func groupJSONSourceTargets(targets []jsonSourceLoadTarget) ([]string, map[string][]jsonSourceLoadTarget) {
	targetsByGroup := map[string][]jsonSourceLoadTarget{}
	groupKeys := make([]string, 0)
	for _, target := range targets {
		groupKey := jsonSourceLoadGroupKey(target.ResolvedPath, target.JSONSourceKeys)
		if _, ok := targetsByGroup[groupKey]; !ok {
			groupKeys = append(groupKeys, groupKey)
		}
		targetsByGroup[groupKey] = append(targetsByGroup[groupKey], target)
	}
	sort.Strings(groupKeys)
	return groupKeys, targetsByGroup
}

func (d *Document) reloadJSONSourceTargetGroup(groupTargets []jsonSourceLoadTarget) error {
	if len(groupTargets) == 0 {
		return nil
	}
	sourceObject, missing := loadJSONSourceObjectFromDisk(
		groupTargets[0].ResolvedPath,
		groupTargets[0].JSONSourceKeys,
	)
	if missing {
		return d.markJSONSourceTargetsMissing(groupTargets)
	}
	return d.refreshJSONSourceTargets(groupTargets, sourceObject)
}

func (d *Document) markJSONSourceTargetsMissing(targets []jsonSourceLoadTarget) error {
	for _, target := range targets {
		project, err := d.ProjectByID(target.ProjectID)
		if err != nil {
			return err
		}
		if err := project.SetSectionFieldForVariant(target.SectionID, target.VariantID, "jsonSourceMissing", true); err != nil {
			return err
		}
		d.Projects[project.ID] = project
	}
	return nil
}

func (d *Document) refreshJSONSourceTargets(targets []jsonSourceLoadTarget, sourceObject *JSONSourceObject) error {
	for _, target := range targets {
		if err := d.RefreshVariantJSONSourceLiveTree(
			target.ProjectID,
			target.SectionID,
			target.VariantID,
			target.JSONSourceKeys,
			*sourceObject.Clone(),
		); err != nil {
			return err
		}
	}
	return nil
}

func resolveJSONSourceLoadTargetForBinding(document Document, workspaceRoot string, binding JSONSourceFileBinding) (jsonSourceLoadTarget, error) {
	project, err := document.ProjectByID(binding.ProjectID)
	if err != nil {
		return jsonSourceLoadTarget{}, err
	}
	section, ok := project.Sections[binding.SectionID]
	if !ok {
		return jsonSourceLoadTarget{}, fmt.Errorf("%w: %q", ErrSectionNotFound, binding.SectionID)
	}
	variant, ok := project.SectionVariants[binding.VariantID]
	if !ok {
		return jsonSourceLoadTarget{}, fmt.Errorf("%w: %q", ErrSectionVariantNotFound, binding.VariantID)
	}
	impl, ok := project.SectionImpls[variant.ImplID]
	if !ok {
		return jsonSourceLoadTarget{}, fmt.Errorf("%w: %q", ErrSectionImplNotFound, variant.ImplID)
	}
	payload, err := effectiveSectionPayload(project, section.ID, variant.ID)
	if err != nil {
		return jsonSourceLoadTarget{}, err
	}
	if canonicalSectionType(payloadStringField(payload, "type"), impl) != "Dict" || !payloadBoolField(payload, "isJsonSource") {
		return jsonSourceLoadTarget{}, fmt.Errorf("section variant %q is not a JSON source dict", binding.VariantID)
	}
	resolvedPath, err := resolveJSONSourceLoadPath(workspaceRoot, variant.Name)
	if err != nil {
		return jsonSourceLoadTarget{}, err
	}
	return jsonSourceLoadTarget{
		ProjectID:      binding.ProjectID,
		SectionID:      binding.SectionID,
		VariantID:      binding.VariantID,
		ResolvedPath:   resolvedPath,
		JSONSourceKeys: append([]string(nil), payloadStringArrayField(payload, "jsonSourceKeys")...),
	}, nil
}
