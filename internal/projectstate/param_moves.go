package projectstate

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrParamMoveUnsupported            = errors.New("section does not support param move")
	ErrParamMoveParamIDBlank           = errors.New("param ids must not contain blank ids")
	ErrParamMoveRootMissing            = errors.New("param move root container is missing from the active section code object map")
	ErrParamMoveFilterActive           = errors.New("section has an active param filter; reordering disabled")
	ErrParamMoveParamNotFound          = errors.New("param is not part of the active section tree")
	ErrParamMoveParamUnsupported       = errors.New("param move target is not a parameter")
	ErrParamMoveParentMissing          = errors.New("param move target has no parent in the active section hierarchy")
	ErrParamMoveParentUnsupported      = errors.New("param move parent code object type is not supported")
	ErrParamMoveSelectionSpansParents  = errors.New("param selection spans multiple parents")
	ErrParamMoveAncestorSelection      = errors.New("param selection includes both ancestor and descendant")
	ErrParamMoveNewParentRequired      = errors.New("new parent id is required")
	ErrParamMoveNewParentNotFound      = errors.New("new parent is not part of the active section tree")
	ErrParamMoveNewParentSelected      = errors.New("cannot reparent into a selected param")
	ErrParamMoveNewParentDescendant    = errors.New("cannot reparent into a descendant of selection")
	ErrParamMoveNewIndexNegative       = errors.New("expected non-negative new index")
	ErrParamMoveNewIndexOutOfRange     = errors.New("new index exceeds available sibling range")
	ErrParamMoveParentMissingFromGrand = errors.New("parent is missing from grandparent children")
)

type MoveParamsInput struct {
	SectionID   string   `json:"sectionId"`
	ParamIDs    []string `json:"paramIds"`
	NewParentID string   `json:"newParentId"`
	NewIndex    int      `json:"newIndex"`
}

type MoveParamGroupInput struct {
	ParamIDs    []string `json:"paramIds"`
	NewParentID string   `json:"newParentId"`
	NewIndex    int      `json:"newIndex"`
}

type MoveParamGroupsInput struct {
	SectionID string                `json:"sectionId"`
	Moves     []MoveParamGroupInput `json:"moves"`
}

type IndentParamsInput struct {
	SectionID string   `json:"sectionId"`
	ParamIDs  []string `json:"paramIds"`
}

type UnindentParamsInput struct {
	SectionID string   `json:"sectionId"`
	ParamIDs  []string `json:"paramIds"`
}

type paramSelectionContext struct {
	SectionID      string
	SectionPayload map[string]any
	RootCodeObjID  string
	ParentByID     map[string]string
	ChildrenByID   map[string][]string
	ParamIDs       []string
}

func (d *Document) MoveParams(projectID string, input MoveParamsInput) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.MoveParams(input); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) MoveParams(ctx context.Context, projectID string, input MoveParamsInput) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.MoveParams(projectID, input); err != nil {
			return document, err
		}
		return document, nil
	})
}

func (p *Project) MoveParams(input MoveParamsInput) error {
	if p == nil {
		return ErrProjectNotFound
	}

	normalized, err := normalizeMoveParamsInput(input)
	if err != nil {
		return err
	}
	if len(normalized.ParamIDs) == 0 {
		return nil
	}
	if normalized.NewIndex < 0 {
		return ErrParamMoveNewIndexNegative
	}

	selection, parentID, err := p.resolveParamMoveContext(normalized.SectionID, normalized.ParamIDs)
	if err != nil {
		return err
	}
	if parentID == "" {
		return fmt.Errorf("%w: section=%q codeObj=%q", ErrParamMoveParentMissing, normalized.SectionID, normalized.ParamIDs[0])
	}

	trimmedNewParentID := strings.TrimSpace(normalized.NewParentID)
	if trimmedNewParentID == "" {
		return ErrParamMoveNewParentRequired
	}
	if parentID == trimmedNewParentID {
		return p.moveParamsWithinParent(normalized.SectionID, parentID, normalized.ParamIDs, normalized.NewIndex)
	}
	if err := ensureValidMoveNewParent(selection.ParentByID, normalized.ParamIDs, trimmedNewParentID); err != nil {
		return err
	}
	return p.moveParamsToParent(normalized.SectionID, parentID, normalized.ParamIDs, trimmedNewParentID, normalized.NewIndex)
}

func (d *Document) MoveParamGroups(projectID string, input MoveParamGroupsInput) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.MoveParamGroups(input); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) MoveParamGroups(ctx context.Context, projectID string, input MoveParamGroupsInput) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.MoveParamGroups(projectID, input); err != nil {
			return document, err
		}
		return document, nil
	})
}

func (p *Project) MoveParamGroups(input MoveParamGroupsInput) error {
	if p == nil {
		return ErrProjectNotFound
	}

	normalized, err := normalizeMoveParamGroupsInput(input)
	if err != nil {
		return err
	}
	for _, move := range normalized.Moves {
		if err := p.MoveParams(MoveParamsInput{
			SectionID:   normalized.SectionID,
			ParamIDs:    move.ParamIDs,
			NewParentID: move.NewParentID,
			NewIndex:    move.NewIndex,
		}); err != nil {
			return err
		}
	}
	return nil
}

func (d *Document) IndentParams(projectID string, input IndentParamsInput) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.IndentParams(input); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) IndentParams(ctx context.Context, projectID string, input IndentParamsInput) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.IndentParams(projectID, input); err != nil {
			return document, err
		}
		return document, nil
	})
}

func (p *Project) IndentParams(input IndentParamsInput) error {
	if p == nil {
		return ErrProjectNotFound
	}

	normalized, err := normalizeIndentParamsInput(input)
	if err != nil {
		return err
	}
	if len(normalized.ParamIDs) == 0 {
		return nil
	}

	_, parentID, err := p.resolveParamMoveContext(normalized.SectionID, normalized.ParamIDs)
	if err != nil {
		return err
	}
	parentPayload, _, _, parentImpl, err := p.ResolveSectionCodeObject(normalized.SectionID, parentID)
	if err != nil {
		return err
	}
	children := payloadStringArrayField(parentPayload, "children")
	orderedParamIDs, err := orderedParamIDsByChildren(children, normalized.ParamIDs, parentID)
	if err != nil {
		return err
	}
	if !paramPayloadHasChildren(parentPayload, parentImpl) {
		return fmt.Errorf("%w: codeObj=%q type=%q", ErrParamMoveParentUnsupported, parentID, effectiveCodeObjType(parentPayload, parentImpl))
	}

	selectedSet := stringSetFromSlice(orderedParamIDs)
	groups := buildContiguousParamGroups(children, selectedSet)
	for _, group := range groups {
		parentPayload, _, _, parentImpl, err := p.ResolveSectionCodeObject(normalized.SectionID, parentID)
		if err != nil {
			return err
		}
		if !paramPayloadHasChildren(parentPayload, parentImpl) {
			return fmt.Errorf("%w: codeObj=%q type=%q", ErrParamMoveParentUnsupported, parentID, effectiveCodeObjType(parentPayload, parentImpl))
		}
		currentChildren := payloadStringArrayField(parentPayload, "children")
		orderedGroupIDs, err := orderedParamIDsByChildren(currentChildren, group, parentID)
		if err != nil {
			return err
		}
		if len(orderedGroupIDs) == 0 {
			continue
		}

		firstID := orderedGroupIDs[0]
		firstIndex := indexOfString(currentChildren, firstID)
		if firstIndex < 0 {
			return fmt.Errorf("%w: codeObj=%q", ErrParamMoveParamNotFound, firstID)
		}

		previousID := ""
		for idx := firstIndex - 1; idx >= 0; idx-- {
			candidate := currentChildren[idx]
			if _, ok := selectedSet[candidate]; ok {
				continue
			}
			previousID = candidate
			break
		}
		if previousID == "" {
			continue
		}

		if _, err := p.ensureParamParent(normalized.SectionID, previousID); err != nil {
			return err
		}
		previousPayload, _, _, _, err := p.ResolveSectionCodeObject(normalized.SectionID, previousID)
		if err != nil {
			return err
		}
		if err := p.MoveParams(MoveParamsInput{
			SectionID:   normalized.SectionID,
			ParamIDs:    orderedGroupIDs,
			NewParentID: previousID,
			NewIndex:    len(payloadStringArrayField(previousPayload, "children")),
		}); err != nil {
			return err
		}
	}
	return nil
}

func (d *Document) UnindentParams(projectID string, input UnindentParamsInput) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.UnindentParams(input); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) UnindentParams(ctx context.Context, projectID string, input UnindentParamsInput) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.UnindentParams(projectID, input); err != nil {
			return document, err
		}
		return document, nil
	})
}

func (p *Project) UnindentParams(input UnindentParamsInput) error {
	if p == nil {
		return ErrProjectNotFound
	}

	normalized, err := normalizeUnindentParamsInput(input)
	if err != nil {
		return err
	}
	if len(normalized.ParamIDs) == 0 {
		return nil
	}

	selection, err := p.resolveParamSelection(normalized.SectionID, normalized.ParamIDs)
	if err != nil {
		return err
	}

	paramsByParent := map[string][]string{}
	parentsInOrder := make([]string, 0, len(selection.ParamIDs))
	for _, paramID := range selection.ParamIDs {
		parentID, ok := selection.ParentByID[paramID]
		if !ok || parentID == "" {
			return fmt.Errorf("%w: section=%q codeObj=%q", ErrParamMoveParentMissing, normalized.SectionID, paramID)
		}
		if _, ok := paramsByParent[parentID]; !ok {
			paramsByParent[parentID] = []string{}
			parentsInOrder = append(parentsInOrder, parentID)
		}
		paramsByParent[parentID] = append(paramsByParent[parentID], paramID)
	}

	for _, parentID := range parentsInOrder {
		grandparentID := selection.ParentByID[parentID]
		if grandparentID == "" {
			continue
		}

		grandparentPayload, _, _, grandparentImpl, err := p.ResolveSectionCodeObject(normalized.SectionID, grandparentID)
		if err != nil {
			return err
		}
		if !paramPayloadHasChildren(grandparentPayload, grandparentImpl) {
			return fmt.Errorf("%w: codeObj=%q type=%q", ErrParamMoveParentUnsupported, grandparentID, effectiveCodeObjType(grandparentPayload, grandparentImpl))
		}
		grandparentChildren := payloadStringArrayField(grandparentPayload, "children")
		parentIndex := indexOfString(grandparentChildren, parentID)
		if parentIndex < 0 {
			return fmt.Errorf("%w: codeObj=%q parent=%q", ErrParamMoveParentMissingFromGrand, grandparentID, parentID)
		}

		if err := p.MoveParams(MoveParamsInput{
			SectionID:   normalized.SectionID,
			ParamIDs:    paramsByParent[parentID],
			NewParentID: grandparentID,
			NewIndex:    parentIndex + 1,
		}); err != nil {
			return err
		}

		parentPayload, _, _, parentImpl, err := p.ResolveSectionCodeObject(normalized.SectionID, parentID)
		if err != nil {
			return err
		}
		if payloadStringField(parentPayload, "type") != nestedParamCodeObjType &&
			effectiveCodeObjType(parentPayload, parentImpl) != nestedParamCodeObjType {
			continue
		}
		if len(payloadStringArrayField(parentPayload, "children")) != 0 {
			continue
		}

		if err := p.ChangeParamImpl(normalized.SectionID, parentID, codeParamType); err != nil {
			return err
		}
		if err := p.SetSectionCodeObjectValue(normalized.SectionID, parentID, "{}"); err != nil {
			return err
		}
	}
	return nil
}

func (p *Project) resolveParamSelection(sectionID string, paramIDs []string) (paramSelectionContext, error) {
	normalizedSectionID := strings.TrimSpace(sectionID)
	if normalizedSectionID == "" {
		return paramSelectionContext{}, ErrSectionIDRequired
	}

	_, sectionPayload, rootCodeObjID, err := p.resolveDeleteSelectedParamsContext(normalizedSectionID)
	if err != nil {
		if errors.Is(err, ErrDeleteSelectedParamsUnsupported) {
			return paramSelectionContext{}, fmt.Errorf("%w: section=%q", ErrParamMoveUnsupported, normalizedSectionID)
		}
		return paramSelectionContext{}, err
	}
	if strings.TrimSpace(payloadStringField(sectionPayload, "paramFilter")) != "" {
		return paramSelectionContext{}, fmt.Errorf("%w: section=%q", ErrParamMoveFilterActive, normalizedSectionID)
	}

	normalizedParamIDs, err := normalizeParamMoveIDs(paramIDs)
	if err != nil {
		return paramSelectionContext{}, err
	}
	if len(normalizedParamIDs) == 0 {
		return paramSelectionContext{
			SectionID:      normalizedSectionID,
			SectionPayload: sectionPayload,
			RootCodeObjID:  rootCodeObjID,
			ParamIDs:       []string{},
		}, nil
	}
	if rootCodeObjID == "" {
		return paramSelectionContext{}, fmt.Errorf("%w: section=%q", ErrParamMoveRootMissing, normalizedSectionID)
	}

	codeObjVariantMap := payloadStringMapField(sectionPayload, "codeObjVariantMap")
	if _, ok := codeObjVariantMap[rootCodeObjID]; !ok {
		return paramSelectionContext{}, fmt.Errorf("%w: section=%q root=%q", ErrParamMoveRootMissing, normalizedSectionID, rootCodeObjID)
	}
	parentByID, childrenByID, err := collectCodeObjectHierarchy(*p, codeObjVariantMap, rootCodeObjID)
	if err != nil {
		return paramSelectionContext{}, err
	}

	selectedSet := stringSetFromSlice(normalizedParamIDs)
	for _, paramID := range normalizedParamIDs {
		if _, ok := p.CodeObjs[paramID]; !ok {
			return paramSelectionContext{}, fmt.Errorf("%w: %q", ErrCodeObjNotFound, paramID)
		}
		if _, ok := parentByID[paramID]; !ok {
			return paramSelectionContext{}, fmt.Errorf("%w: section=%q codeObj=%q", ErrParamMoveParamNotFound, normalizedSectionID, paramID)
		}
		paramPayload, _, _, paramImpl, err := p.ResolveSectionCodeObject(normalizedSectionID, paramID)
		if err != nil {
			return paramSelectionContext{}, err
		}
		paramType := effectiveCodeObjType(paramPayload, paramImpl)
		if !isParamCodeObjectType(paramType) {
			return paramSelectionContext{}, fmt.Errorf("%w: codeObj=%q type=%q", ErrParamMoveParamUnsupported, paramID, paramType)
		}

		ancestor := parentByID[paramID]
		for strings.TrimSpace(ancestor) != "" {
			if _, ok := selectedSet[ancestor]; ok {
				return paramSelectionContext{}, fmt.Errorf("%w: section=%q codeObj=%q ancestor=%q", ErrParamMoveAncestorSelection, normalizedSectionID, paramID, ancestor)
			}
			ancestor = parentByID[ancestor]
		}
	}

	return paramSelectionContext{
		SectionID:      normalizedSectionID,
		SectionPayload: sectionPayload,
		RootCodeObjID:  rootCodeObjID,
		ParentByID:     parentByID,
		ChildrenByID:   childrenByID,
		ParamIDs:       normalizedParamIDs,
	}, nil
}

func (p *Project) resolveParamMoveContext(sectionID string, paramIDs []string) (paramSelectionContext, string, error) {
	selection, err := p.resolveParamSelection(sectionID, paramIDs)
	if err != nil {
		return paramSelectionContext{}, "", err
	}
	if len(selection.ParamIDs) == 0 {
		return selection, "", nil
	}

	parentID := selection.ParentByID[selection.ParamIDs[0]]
	if parentID == "" {
		return paramSelectionContext{}, "", fmt.Errorf("%w: section=%q codeObj=%q", ErrParamMoveParentMissing, selection.SectionID, selection.ParamIDs[0])
	}
	for _, paramID := range selection.ParamIDs[1:] {
		if selection.ParentByID[paramID] != parentID {
			return paramSelectionContext{}, "", fmt.Errorf("%w: section=%q", ErrParamMoveSelectionSpansParents, selection.SectionID)
		}
	}
	return selection, parentID, nil
}

func (p *Project) moveParamsWithinParent(sectionID string, parentID string, paramIDs []string, newIndex int) error {
	parentPayload, _, _, parentImpl, err := p.ResolveSectionCodeObject(sectionID, parentID)
	if err != nil {
		return err
	}
	if !paramPayloadHasChildren(parentPayload, parentImpl) {
		return fmt.Errorf("%w: codeObj=%q type=%q", ErrParamMoveParentUnsupported, parentID, effectiveCodeObjType(parentPayload, parentImpl))
	}

	children := payloadStringArrayField(parentPayload, "children")
	orderedParamIDs, err := orderedParamIDsByChildren(children, paramIDs, parentID)
	if err != nil {
		return err
	}
	remaining := filterStringSlice(children, stringSetFromSlice(orderedParamIDs))
	if newIndex > len(remaining) {
		return ErrParamMoveNewIndexOutOfRange
	}

	return p.setCurrentCodeObjectField(sectionID, parentID, "children", insertStringSlice(remaining, newIndex, orderedParamIDs))
}

func (p *Project) moveParamsToParent(sectionID string, oldParentID string, paramIDs []string, newParentID string, newIndex int) error {
	oldParentPayload, _, _, oldParentImpl, err := p.ResolveSectionCodeObject(sectionID, oldParentID)
	if err != nil {
		return err
	}
	if !paramPayloadHasChildren(oldParentPayload, oldParentImpl) {
		return fmt.Errorf("%w: codeObj=%q type=%q", ErrParamMoveParentUnsupported, oldParentID, effectiveCodeObjType(oldParentPayload, oldParentImpl))
	}

	oldChildren := payloadStringArrayField(oldParentPayload, "children")
	orderedParamIDs, err := orderedParamIDsByChildren(oldChildren, paramIDs, oldParentID)
	if err != nil {
		return err
	}
	nextOldChildren := filterStringSlice(oldChildren, stringSetFromSlice(orderedParamIDs))

	newParentPayload, err := p.ensureParamParent(sectionID, newParentID)
	if err != nil {
		return err
	}
	newChildren := filterStringSlice(payloadStringArrayField(newParentPayload, "children"), stringSetFromSlice(orderedParamIDs))
	if newIndex > len(newChildren) {
		return ErrParamMoveNewIndexOutOfRange
	}

	if err := p.setCurrentCodeObjectField(sectionID, oldParentID, "children", append([]string(nil), nextOldChildren...)); err != nil {
		return err
	}
	return p.setCurrentCodeObjectField(
		sectionID,
		newParentID,
		"children",
		insertStringSlice(newChildren, newIndex, orderedParamIDs),
	)
}

func (p *Project) ensureParamParent(sectionID string, codeObjID string) (map[string]any, error) {
	payload, _, _, impl, err := p.ResolveSectionCodeObject(sectionID, codeObjID)
	if err != nil {
		return nil, err
	}
	if paramPayloadHasChildren(payload, impl) {
		return payload, nil
	}
	if err := p.ChangeParamImpl(sectionID, codeObjID, nestedParamCodeObjType); err != nil {
		return nil, err
	}

	payload, _, _, impl, err = p.ResolveSectionCodeObject(sectionID, codeObjID)
	if err != nil {
		return nil, err
	}
	if !paramPayloadHasChildren(payload, impl) {
		return nil, fmt.Errorf("%w: codeObj=%q type=%q", ErrParamMoveParentUnsupported, codeObjID, effectiveCodeObjType(payload, impl))
	}
	return payload, nil
}

func ensureValidMoveNewParent(parentByID map[string]string, paramIDs []string, newParentID string) error {
	trimmedNewParentID := strings.TrimSpace(newParentID)
	if trimmedNewParentID == "" {
		return ErrParamMoveNewParentRequired
	}
	if _, ok := parentByID[trimmedNewParentID]; !ok {
		return fmt.Errorf("%w: codeObj=%q", ErrParamMoveNewParentNotFound, trimmedNewParentID)
	}

	selectedSet := stringSetFromSlice(paramIDs)
	if _, ok := selectedSet[trimmedNewParentID]; ok {
		return fmt.Errorf("%w: codeObj=%q", ErrParamMoveNewParentSelected, trimmedNewParentID)
	}
	ancestor := trimmedNewParentID
	for strings.TrimSpace(ancestor) != "" {
		if _, ok := selectedSet[ancestor]; ok {
			return fmt.Errorf("%w: codeObj=%q ancestor=%q", ErrParamMoveNewParentDescendant, trimmedNewParentID, ancestor)
		}
		ancestor = parentByID[ancestor]
	}
	return nil
}

func normalizeMoveParamsInput(input MoveParamsInput) (MoveParamsInput, error) {
	normalized := MoveParamsInput{
		SectionID:   strings.TrimSpace(input.SectionID),
		NewParentID: strings.TrimSpace(input.NewParentID),
		NewIndex:    input.NewIndex,
	}
	if normalized.SectionID == "" {
		return MoveParamsInput{}, ErrSectionIDRequired
	}
	paramIDs, err := normalizeParamMoveIDs(input.ParamIDs)
	if err != nil {
		return MoveParamsInput{}, err
	}
	normalized.ParamIDs = paramIDs
	return normalized, nil
}

func normalizeMoveParamGroupsInput(input MoveParamGroupsInput) (MoveParamGroupsInput, error) {
	normalized := MoveParamGroupsInput{
		SectionID: strings.TrimSpace(input.SectionID),
		Moves:     make([]MoveParamGroupInput, 0, len(input.Moves)),
	}
	if normalized.SectionID == "" {
		return MoveParamGroupsInput{}, ErrSectionIDRequired
	}
	for _, move := range input.Moves {
		paramIDs, err := normalizeParamMoveIDs(move.ParamIDs)
		if err != nil {
			return MoveParamGroupsInput{}, err
		}
		normalized.Moves = append(normalized.Moves, MoveParamGroupInput{
			ParamIDs:    paramIDs,
			NewParentID: strings.TrimSpace(move.NewParentID),
			NewIndex:    move.NewIndex,
		})
	}
	return normalized, nil
}

func normalizeIndentParamsInput(input IndentParamsInput) (IndentParamsInput, error) {
	normalized := IndentParamsInput{SectionID: strings.TrimSpace(input.SectionID)}
	if normalized.SectionID == "" {
		return IndentParamsInput{}, ErrSectionIDRequired
	}
	paramIDs, err := normalizeParamMoveIDs(input.ParamIDs)
	if err != nil {
		return IndentParamsInput{}, err
	}
	normalized.ParamIDs = paramIDs
	return normalized, nil
}

func normalizeUnindentParamsInput(input UnindentParamsInput) (UnindentParamsInput, error) {
	normalized := UnindentParamsInput{SectionID: strings.TrimSpace(input.SectionID)}
	if normalized.SectionID == "" {
		return UnindentParamsInput{}, ErrSectionIDRequired
	}
	paramIDs, err := normalizeParamMoveIDs(input.ParamIDs)
	if err != nil {
		return UnindentParamsInput{}, err
	}
	normalized.ParamIDs = paramIDs
	return normalized, nil
}

func normalizeParamMoveIDs(paramIDs []string) ([]string, error) {
	normalized := make([]string, 0, len(paramIDs))
	seen := make(map[string]struct{}, len(paramIDs))
	for _, rawParamID := range paramIDs {
		paramID := strings.TrimSpace(rawParamID)
		if paramID == "" {
			return nil, ErrParamMoveParamIDBlank
		}
		if _, ok := seen[paramID]; ok {
			continue
		}
		seen[paramID] = struct{}{}
		normalized = append(normalized, paramID)
	}
	return normalized, nil
}

func buildContiguousParamGroups(children []string, selected map[string]struct{}) [][]string {
	groups := [][]string{}
	current := []string{}
	for _, childID := range children {
		if _, ok := selected[childID]; ok {
			current = append(current, childID)
			continue
		}
		if len(current) > 0 {
			groups = append(groups, append([]string(nil), current...))
			current = []string{}
		}
	}
	if len(current) > 0 {
		groups = append(groups, append([]string(nil), current...))
	}
	return groups
}

func orderedParamIDsByChildren(children []string, paramIDs []string, parentID string) ([]string, error) {
	selectedSet := stringSetFromSlice(paramIDs)
	ordered := make([]string, 0, len(paramIDs))
	for _, childID := range children {
		if _, ok := selectedSet[childID]; ok {
			ordered = append(ordered, childID)
		}
	}
	if len(ordered) == len(selectedSet) {
		return ordered, nil
	}

	missing := make([]string, 0, len(selectedSet)-len(ordered))
	orderedSet := stringSetFromSlice(ordered)
	for _, paramID := range paramIDs {
		if _, ok := orderedSet[paramID]; !ok {
			missing = append(missing, paramID)
		}
	}
	if len(missing) != 0 {
		return nil, fmt.Errorf("%w: parent=%q missing=%v", ErrParamMoveParamNotFound, parentID, missing)
	}
	return ordered, nil
}

func paramPayloadHasChildren(payload map[string]any, impl CodeObjectImpl) bool {
	if _, ok := payload["children"]; ok {
		return true
	}
	switch effectiveCodeObjType(payload, impl) {
	case nestedParamCodeObjType, codeCallableType:
		return true
	default:
		return false
	}
}
