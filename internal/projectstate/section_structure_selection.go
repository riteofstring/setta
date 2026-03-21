package projectstate

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrGroupSectionsSectionIDsRequired = errors.New("group sections sectionIds must contain at least one section id")
	ErrGroupSectionsSectionIDBlank     = errors.New("group sections sectionIds must not contain blank ids")
	ErrGroupSectionsParentMismatch     = errors.New("group sections requires sections to share the same parent")
	ErrTopLevelSectionLayoutRequired   = errors.New("top-level section layout is required for this mutation")
	ErrUngroupGroupsGroupIDsRequired   = errors.New("ungroup groups groupIds must contain at least one group id")
	ErrUngroupGroupsGroupIDBlank       = errors.New("ungroup groups groupIds must not contain blank ids")
	ErrParamSelectionUnsupported       = errors.New("section does not support param selection")
	ErrParamSelectionTargetUnsupported = errors.New("param selection target is not a parameter")
)

type GroupSectionsInput struct {
	SectionIDs []string `json:"sectionIds"`
}

type UngroupGroupsInput struct {
	GroupIDs []string `json:"groupIds"`
}

type ToggleParamSelectedInput struct {
	SectionID   string `json:"sectionId"`
	ParamInfoID string `json:"paramInfoId"`
}

func (d *Document) GroupSections(projectID string, input GroupSectionsInput, settings StructuralMutationSettings) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.GroupSections(input, settings); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) GroupSections(
	ctx context.Context,
	projectID string,
	input GroupSectionsInput,
	settings StructuralMutationSettings,
) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.GroupSections(projectID, input, settings); err != nil {
			return document, err
		}
		return document, nil
	})
}

func (p *Project) GroupSections(
	input GroupSectionsInput,
	settings StructuralMutationSettings,
) error {
	if p == nil {
		return ErrProjectNotFound
	}

	normalized, err := normalizeGroupSectionsInput(input)
	if err != nil {
		return err
	}
	parentID, orderedSectionIDs, err := p.resolveGroupingSelection(normalized.SectionIDs)
	if err != nil {
		return err
	}
	selectedSet := make(map[string]struct{}, len(orderedSectionIDs))
	for _, sectionID := range orderedSectionIDs {
		selectedSet[sectionID] = struct{}{}
	}

	groupID := ""
	if strings.TrimSpace(parentID) == "" {
		position, err := p.resolveGroupSectionsTopLevelPosition(orderedSectionIDs)
		if err != nil {
			return err
		}
		result, err := p.CreateTopLevelSection(CreateTopLevelSectionInput{
			ImplType: "Group",
			Position: &position,
		}, settings)
		if err != nil {
			return err
		}
		groupID = result.SectionID
		for _, sectionID := range orderedSectionIDs {
			p.removeTopLevelSectionViewState(sectionID)
			if err := p.setSectionParent(sectionID, groupID); err != nil {
				return err
			}
		}
		return p.setSectionChildren(groupID, orderedSectionIDs)
	}

	parentChildren, err := p.sectionChildIDs(parentID)
	if err != nil {
		return err
	}
	startIdx := indexOfString(parentChildren, orderedSectionIDs[0])
	if startIdx < 0 {
		return fmt.Errorf("%w: %q", ErrSectionNotFound, orderedSectionIDs[0])
	}
	createResult, err := p.CreateChildSections(CreateChildSectionsInput{
		ParentID:    parentID,
		ImplType:    "Group",
		NumChildren: 1,
		StartIdx:    &startIdx,
	}, settings)
	if err != nil {
		return err
	}
	groupID = createResult.SectionIDs[0]

	parentChildren, err = p.sectionChildIDs(parentID)
	if err != nil {
		return err
	}
	if err := p.setSectionChildren(parentID, filterStringSlice(parentChildren, selectedSet)); err != nil {
		return err
	}
	for _, sectionID := range orderedSectionIDs {
		if err := p.setSectionParent(sectionID, groupID); err != nil {
			return err
		}
	}
	return p.setSectionChildren(groupID, orderedSectionIDs)
}

func (d *Document) UngroupGroups(projectID string, input UngroupGroupsInput) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.UngroupGroups(input); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) UngroupGroups(
	ctx context.Context,
	projectID string,
	input UngroupGroupsInput,
) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.UngroupGroups(projectID, input); err != nil {
			return document, err
		}
		return document, nil
	})
}

func (p *Project) UngroupGroups(input UngroupGroupsInput) error {
	if p == nil {
		return ErrProjectNotFound
	}

	normalized, err := normalizeUngroupGroupsInput(input)
	if err != nil {
		return err
	}
	for _, groupID := range normalized.GroupIDs {
		if err := p.ungroupGroup(groupID); err != nil {
			return err
		}
	}
	return nil
}

func (d *Document) ToggleParamSelected(projectID string, input ToggleParamSelectedInput) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.ToggleParamSelected(input); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) ToggleParamSelected(
	ctx context.Context,
	projectID string,
	input ToggleParamSelectedInput,
) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.ToggleParamSelected(projectID, input); err != nil {
			return document, err
		}
		return document, nil
	})
}

func (p *Project) ToggleParamSelected(input ToggleParamSelectedInput) error {
	if p == nil {
		return ErrProjectNotFound
	}

	normalized, err := normalizeToggleParamSelectedInput(input)
	if err != nil {
		return err
	}
	sectionPayload, err := p.resolveParamSelectionSectionPayload(normalized.SectionID)
	if err != nil {
		return err
	}
	paramPayload, _, _, paramImpl, err := p.ResolveSectionCodeObject(normalized.SectionID, normalized.ParamInfoID)
	if err != nil {
		return err
	}
	paramType := effectiveCodeObjType(paramPayload, paramImpl)
	if !isParamCodeObjectType(paramType) {
		return fmt.Errorf("%w: codeObj=%q type=%q", ErrParamSelectionTargetUnsupported, normalized.ParamInfoID, paramType)
	}

	currentSelected := payloadStringArrayField(sectionPayload, "selectedParams")
	nextSelected := append([]string(nil), currentSelected...)
	if containsString(currentSelected, normalized.ParamInfoID) {
		nextSelected = filterStringSlice(currentSelected, map[string]struct{}{normalized.ParamInfoID: struct{}{}})
	} else {
		nextSelected = append(nextSelected, normalized.ParamInfoID)
	}
	return p.setCurrentSectionField(normalized.SectionID, "selectedParams", nextSelected)
}

func (d *Document) UnselectAllParams(projectID string) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.UnselectAllParams(); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) UnselectAllParams(ctx context.Context, projectID string) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.UnselectAllParams(projectID); err != nil {
			return document, err
		}
		return document, nil
	})
}

func (p *Project) UnselectAllParams() error {
	if p == nil {
		return ErrProjectNotFound
	}

	for sectionID := range p.Sections {
		section, variant, _, err := p.ResolveSection(sectionID)
		if err != nil {
			return err
		}
		payload, err := effectiveSectionPayload(*p, section.ID, variant.ID)
		if err != nil {
			return err
		}
		if len(payloadStringArrayField(payload, "selectedParams")) == 0 {
			continue
		}
		if err := p.setCurrentSectionField(sectionID, "selectedParams", []string{}); err != nil {
			return err
		}
	}
	return nil
}

func normalizeGroupSectionsInput(input GroupSectionsInput) (GroupSectionsInput, error) {
	if len(input.SectionIDs) == 0 {
		return GroupSectionsInput{}, ErrGroupSectionsSectionIDsRequired
	}

	normalized := GroupSectionsInput{
		SectionIDs: make([]string, 0, len(input.SectionIDs)),
	}
	seen := make(map[string]struct{}, len(input.SectionIDs))
	for _, rawSectionID := range input.SectionIDs {
		sectionID := strings.TrimSpace(rawSectionID)
		if sectionID == "" {
			return GroupSectionsInput{}, ErrGroupSectionsSectionIDBlank
		}
		if _, ok := seen[sectionID]; ok {
			continue
		}
		seen[sectionID] = struct{}{}
		normalized.SectionIDs = append(normalized.SectionIDs, sectionID)
	}
	if len(normalized.SectionIDs) == 0 {
		return GroupSectionsInput{}, ErrGroupSectionsSectionIDsRequired
	}
	return normalized, nil
}

func normalizeUngroupGroupsInput(input UngroupGroupsInput) (UngroupGroupsInput, error) {
	if len(input.GroupIDs) == 0 {
		return UngroupGroupsInput{}, ErrUngroupGroupsGroupIDsRequired
	}

	normalized := UngroupGroupsInput{
		GroupIDs: make([]string, 0, len(input.GroupIDs)),
	}
	seen := make(map[string]struct{}, len(input.GroupIDs))
	for _, rawGroupID := range input.GroupIDs {
		groupID := strings.TrimSpace(rawGroupID)
		if groupID == "" {
			return UngroupGroupsInput{}, ErrUngroupGroupsGroupIDBlank
		}
		if _, ok := seen[groupID]; ok {
			continue
		}
		seen[groupID] = struct{}{}
		normalized.GroupIDs = append(normalized.GroupIDs, groupID)
	}
	if len(normalized.GroupIDs) == 0 {
		return UngroupGroupsInput{}, ErrUngroupGroupsGroupIDsRequired
	}
	return normalized, nil
}

func normalizeToggleParamSelectedInput(input ToggleParamSelectedInput) (ToggleParamSelectedInput, error) {
	normalized := ToggleParamSelectedInput{
		SectionID:   strings.TrimSpace(input.SectionID),
		ParamInfoID: strings.TrimSpace(input.ParamInfoID),
	}
	if normalized.SectionID == "" {
		return ToggleParamSelectedInput{}, ErrSectionIDRequired
	}
	if normalized.ParamInfoID == "" {
		return ToggleParamSelectedInput{}, ErrCodeObjIDRequired
	}
	return normalized, nil
}

func (p *Project) resolveGroupingSelection(sectionIDs []string) (string, []string, error) {
	if p == nil {
		return "", nil, ErrProjectNotFound
	}

	parentID := ""
	for index, sectionID := range sectionIDs {
		section, ok := p.Sections[sectionID]
		if !ok {
			return "", nil, fmt.Errorf("%w: %q", ErrSectionNotFound, sectionID)
		}
		currentParentID := strings.TrimSpace(section.ParentSectionID)
		if index == 0 {
			parentID = currentParentID
			continue
		}
		if currentParentID != parentID {
			return "", nil, ErrGroupSectionsParentMismatch
		}
	}

	if parentID == "" {
		ordered := append([]string(nil), sectionIDs...)
		if len(p.TopLevelSectionIDs) == 0 {
			return parentID, ordered, nil
		}
		selectedSet := make(map[string]struct{}, len(sectionIDs))
		for _, sectionID := range sectionIDs {
			selectedSet[sectionID] = struct{}{}
		}
		ordered = make([]string, 0, len(sectionIDs))
		for _, sectionID := range p.TopLevelSectionIDs {
			if _, ok := selectedSet[sectionID]; ok {
				ordered = append(ordered, sectionID)
			}
		}
		if len(ordered) == len(selectedSet) {
			return parentID, ordered, nil
		}
		return parentID, append([]string(nil), sectionIDs...), nil
	}

	parentChildren, err := p.sectionChildIDs(parentID)
	if err != nil {
		return "", nil, err
	}
	selectedSet := make(map[string]struct{}, len(sectionIDs))
	for _, sectionID := range sectionIDs {
		selectedSet[sectionID] = struct{}{}
	}
	ordered := make([]string, 0, len(sectionIDs))
	for _, sectionID := range parentChildren {
		if _, ok := selectedSet[sectionID]; ok {
			ordered = append(ordered, sectionID)
		}
	}
	if len(ordered) != len(selectedSet) {
		return "", nil, ErrGroupSectionsParentMismatch
	}
	return parentID, ordered, nil
}

func (p *Project) resolveGroupSectionsTopLevelPosition(sectionIDs []string) (Position, error) {
	if p == nil {
		return Position{}, ErrProjectNotFound
	}

	minX := 0.0
	minY := 0.0
	for index, sectionID := range sectionIDs {
		layout, ok := p.existingTopLevelSectionLayout(sectionID)
		if !ok {
			return Position{}, fmt.Errorf("%w: section=%q", ErrTopLevelSectionLayoutRequired, sectionID)
		}
		if index == 0 || layout.X < minX {
			minX = layout.X
		}
		if index == 0 || layout.Y < minY {
			minY = layout.Y
		}
	}
	return Position{X: minX, Y: minY}, nil
}

func (p *Project) ungroupGroup(groupID string) error {
	if p == nil {
		return ErrProjectNotFound
	}

	section, _, payload, err := p.resolveGroupSectionMutationState(groupID)
	if err != nil {
		return err
	}
	groupChildren := payloadStringArrayField(payload, "children")
	parentID := strings.TrimSpace(section.ParentSectionID)

	if parentID == "" {
		layout, ok := p.existingTopLevelSectionLayout(groupID)
		if !ok {
			return fmt.Errorf("%w: section=%q", ErrTopLevelSectionLayoutRequired, groupID)
		}
		for _, childID := range groupChildren {
			if err := p.setSectionParent(childID, ""); err != nil {
				return err
			}
			nextLayout := TopLevelSectionLayout{
				X:      layout.X,
				Y:      layout.Y,
				ZIndex: p.nextCreateTopLevelSectionZIndex(),
			}
			p.addTopLevelSectionViewState(childID, nextLayout)
		}
	} else {
		parentChildren, err := p.sectionChildIDs(parentID)
		if err != nil {
			return err
		}
		groupIndex := indexOfString(parentChildren, groupID)
		if groupIndex < 0 {
			return fmt.Errorf("%w: %q", ErrSectionNotFound, groupID)
		}
		if err := p.setSectionChildren(
			parentID,
			insertStringSlice(
				filterStringSlice(parentChildren, map[string]struct{}{groupID: struct{}{}}),
				groupIndex,
				groupChildren,
			),
		); err != nil {
			return err
		}
		for _, childID := range groupChildren {
			if err := p.setSectionParent(childID, parentID); err != nil {
				return err
			}
		}
	}

	if err := p.setSectionChildren(groupID, []string{}); err != nil {
		return err
	}
	_, err = p.DeleteSections(DeleteSectionsInput{SectionIDs: []string{groupID}})
	return err
}

func (p *Project) sectionChildIDs(sectionID string) ([]string, error) {
	if p == nil {
		return nil, ErrProjectNotFound
	}

	section, variant, impl, err := p.ResolveSection(strings.TrimSpace(sectionID))
	if err != nil {
		return nil, err
	}
	payload, err := effectiveSectionPayload(*p, section.ID, variant.ID)
	if err != nil {
		return nil, err
	}
	children, hasChildren := payloadChildren(payload)
	if !hasChildren && !supportsBaseCodeSectionSemantics(impl, payload) {
		return nil, fmt.Errorf("%w: parent=%q", ErrChildSectionParentUnsupported, section.ID)
	}
	return append([]string(nil), children...), nil
}

func (p *Project) setSectionParent(sectionID string, parentID string) error {
	if p == nil {
		return ErrProjectNotFound
	}

	trimmedSectionID := strings.TrimSpace(sectionID)
	if trimmedSectionID == "" {
		return ErrSectionIDRequired
	}
	section, ok := p.Sections[trimmedSectionID]
	if !ok {
		return fmt.Errorf("%w: %q", ErrSectionNotFound, trimmedSectionID)
	}
	section.ParentSectionID = strings.TrimSpace(parentID)
	p.Sections[section.ID] = section
	return nil
}

func (p *Project) setSectionChildren(sectionID string, childIDs []string) error {
	if p == nil {
		return ErrProjectNotFound
	}

	section, variant, impl, err := p.ResolveSection(strings.TrimSpace(sectionID))
	if err != nil {
		return err
	}
	payload, err := effectiveSectionPayload(*p, section.ID, variant.ID)
	if err != nil {
		return err
	}
	parentIsBaseCodeSection := supportsBaseCodeSectionSemantics(impl, payload)
	if _, hasChildren := payloadChildren(payload); !hasChildren && !parentIsBaseCodeSection {
		return fmt.Errorf("%w: parent=%q", ErrChildSectionParentUnsupported, section.ID)
	}

	updatedImpl := impl.Clone()
	if parentIsBaseCodeSection {
		if len(childIDs) > 1 {
			return fmt.Errorf("%w: parent=%q childCount=%d", ErrCodeSectionChildCountInvalid, section.ID, len(childIDs))
		}
		setBaseCodeSectionAttachmentState(payload, &updatedImpl, childIDs)
	} else {
		payload["children"] = append([]string(nil), childIDs...)
	}
	rawPayload, err := marshalProjectObject(payload)
	if err != nil {
		return err
	}
	updatedImpl.Payload = rawPayload
	p.SectionImpls[variant.ImplID] = updatedImpl
	return nil
}

func (p *Project) resolveParamSelectionSectionPayload(sectionID string) (map[string]any, error) {
	if p == nil {
		return nil, ErrProjectNotFound
	}

	section, variant, _, err := p.ResolveSection(strings.TrimSpace(sectionID))
	if err != nil {
		return nil, err
	}
	payload, err := effectiveSectionPayload(*p, section.ID, variant.ID)
	if err != nil {
		return nil, err
	}
	if _, ok := payload["codeObjVariantMap"]; !ok {
		return nil, fmt.Errorf("%w: section=%q", ErrParamSelectionUnsupported, sectionID)
	}
	return payload, nil
}
