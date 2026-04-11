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
		if err := r.reconcileProjectPythonGeneratedSectionsAfterStructuralMutation(ctx, &document, projectID); err != nil {
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
	if strings.TrimSpace(parentID) == "" {
		return p.groupTopLevelSections(orderedSectionIDs, settings)
	}
	return p.groupChildSections(parentID, orderedSectionIDs, settings)
}

func (p *Project) groupTopLevelSections(sectionIDs []string, settings StructuralMutationSettings) error {
	position, err := p.resolveGroupSectionsTopLevelPosition(sectionIDs)
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
	for _, sectionID := range sectionIDs {
		p.removeTopLevelSectionViewState(sectionID)
	}
	return p.attachGroupedSections(result.SectionID, sectionIDs)
}

func (p *Project) groupChildSections(
	parentID string,
	sectionIDs []string,
	settings StructuralMutationSettings,
) error {
	groupID, err := p.createChildGroupSection(parentID, sectionIDs[0], settings)
	if err != nil {
		return err
	}
	if err := p.removeSectionsFromParent(parentID, sectionIDs); err != nil {
		return err
	}
	return p.attachGroupedSections(groupID, sectionIDs)
}

func (p *Project) createChildGroupSection(
	parentID string,
	firstSectionID string,
	settings StructuralMutationSettings,
) (string, error) {
	parentChildren, err := p.sectionChildIDs(parentID)
	if err != nil {
		return "", err
	}
	startIdx := indexOfString(parentChildren, firstSectionID)
	if startIdx < 0 {
		return "", fmt.Errorf("%w: %q", ErrSectionNotFound, firstSectionID)
	}
	createResult, err := p.CreateChildSections(CreateChildSectionsInput{
		ParentID:    parentID,
		ImplType:    "Group",
		NumChildren: 1,
		StartIdx:    &startIdx,
	}, settings)
	if err != nil {
		return "", err
	}
	return createResult.SectionIDs[0], nil
}

func (p *Project) removeSectionsFromParent(parentID string, sectionIDs []string) error {
	parentChildren, err := p.sectionChildIDs(parentID)
	if err != nil {
		return err
	}
	return p.setSectionChildren(parentID, filterStringSlice(parentChildren, stringSetFromSlice(sectionIDs)))
}

func (p *Project) attachGroupedSections(groupID string, sectionIDs []string) error {
	if err := p.setSectionParents(sectionIDs, groupID); err != nil {
		return err
	}
	return p.setSectionChildren(groupID, sectionIDs)
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
		if err := r.reconcileProjectPythonGeneratedSectionsAfterStructuralMutation(ctx, &document, projectID); err != nil {
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

	parentID, err := p.resolveGroupingParentID(sectionIDs)
	if err != nil {
		return "", nil, err
	}
	if parentID == "" {
		return "", p.orderTopLevelGroupingSelection(sectionIDs), nil
	}
	parentChildren, err := p.sectionChildIDs(parentID)
	if err != nil {
		return "", nil, err
	}
	ordered, complete := orderSelectedSectionIDs(parentChildren, sectionIDs)
	if !complete {
		return "", nil, ErrGroupSectionsParentMismatch
	}
	return parentID, ordered, nil
}

func (p *Project) resolveGroupingParentID(sectionIDs []string) (string, error) {
	parentID := ""
	for index, sectionID := range sectionIDs {
		section, ok := p.Sections[sectionID]
		if !ok {
			return "", fmt.Errorf("%w: %q", ErrSectionNotFound, sectionID)
		}
		currentParentID := strings.TrimSpace(section.ParentSectionID)
		if index == 0 {
			parentID = currentParentID
			continue
		}
		if currentParentID != parentID {
			return "", ErrGroupSectionsParentMismatch
		}
	}
	return parentID, nil
}

func (p *Project) orderTopLevelGroupingSelection(sectionIDs []string) []string {
	if len(p.TopLevelSectionIDs) == 0 {
		return append([]string(nil), sectionIDs...)
	}
	ordered, complete := orderSelectedSectionIDs(p.TopLevelSectionIDs, sectionIDs)
	if !complete {
		return append([]string(nil), sectionIDs...)
	}
	return ordered
}

func orderSelectedSectionIDs(siblingIDs []string, sectionIDs []string) ([]string, bool) {
	selectedSet := stringSetFromSlice(sectionIDs)
	ordered := make([]string, 0, len(sectionIDs))
	for _, sectionID := range siblingIDs {
		if _, ok := selectedSet[sectionID]; ok {
			ordered = append(ordered, sectionID)
		}
	}
	return ordered, len(ordered) == len(selectedSet)
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
		if err := p.promoteGroupChildrenToTopLevel(groupID, groupChildren); err != nil {
			return err
		}
	} else if err := p.restoreGroupChildrenToParent(parentID, groupID, groupChildren); err != nil {
		return err
	}

	return p.deleteEmptyGroupSection(groupID)
}

func (p *Project) promoteGroupChildrenToTopLevel(groupID string, childIDs []string) error {
	layout, ok := p.existingTopLevelSectionLayout(groupID)
	if !ok {
		return fmt.Errorf("%w: section=%q", ErrTopLevelSectionLayoutRequired, groupID)
	}
	if err := p.setSectionParents(childIDs, ""); err != nil {
		return err
	}
	nextZIndex := p.nextCreateTopLevelSectionZIndex()
	for _, childID := range childIDs {
		p.addTopLevelSectionViewState(childID, TopLevelSectionLayout{
			X:      layout.X,
			Y:      layout.Y,
			ZIndex: nextZIndex,
		})
		nextZIndex += 1
	}
	return nil
}

func (p *Project) restoreGroupChildrenToParent(parentID string, groupID string, childIDs []string) error {
	parentChildren, err := p.sectionChildIDs(parentID)
	if err != nil {
		return err
	}
	groupIndex := indexOfString(parentChildren, groupID)
	if groupIndex < 0 {
		return fmt.Errorf("%w: %q", ErrSectionNotFound, groupID)
	}
	nextChildren := insertStringSlice(
		filterStringSlice(parentChildren, map[string]struct{}{groupID: {}}),
		groupIndex,
		childIDs,
	)
	if err := p.setSectionChildren(parentID, nextChildren); err != nil {
		return err
	}
	return p.setSectionParents(childIDs, parentID)
}

func (p *Project) deleteEmptyGroupSection(groupID string) error {
	if err := p.setSectionChildren(groupID, []string{}); err != nil {
		return err
	}
	_, err := p.DeleteSections(DeleteSectionsInput{SectionIDs: []string{groupID}})
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

func (p *Project) setSectionParents(sectionIDs []string, parentID string) error {
	for _, sectionID := range sectionIDs {
		if err := p.setSectionParent(sectionID, parentID); err != nil {
			return err
		}
	}
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
