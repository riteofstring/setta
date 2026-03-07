package projectstate

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrDeleteSelectedParamsUnsupported       = errors.New("section does not support delete_selected_params")
	ErrDeleteSelectedParamsParamIDBlank      = errors.New("delete selected params paramInfoIds must not contain blank ids")
	ErrDeleteSelectedParamsRootMissing       = errors.New("delete selected params root container is missing from the active section code object map")
	ErrDeleteSelectedParamsParamUnsupported  = errors.New("delete selected params target is not a parameter")
	ErrDeleteSelectedParamsParentMissing     = errors.New("delete selected params target has no parent in the active section hierarchy")
	ErrDeleteSelectedParamsParentUnsupported = errors.New("delete selected params parent code object type is not supported")
)

type DeleteSelectedParamsInput struct {
	SectionID    string   `json:"sectionId"`
	ParamInfoIDs []string `json:"paramInfoIds"`
}

type DeleteSelectedParamsResult struct {
	ParamInfoIDs []string `json:"paramInfoIds"`
}

func (d *Document) DeleteSelectedParams(projectID string, input DeleteSelectedParamsInput) (DeleteSelectedParamsResult, error) {
	if d == nil {
		return DeleteSelectedParamsResult{}, ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return DeleteSelectedParamsResult{}, err
	}
	result, err := project.DeleteSelectedParams(input)
	if err != nil {
		return DeleteSelectedParamsResult{}, err
	}
	d.Projects[project.ID] = project
	return result, nil
}

func (r *Runtime) DeleteSelectedParams(
	ctx context.Context,
	projectID string,
	input DeleteSelectedParamsInput,
) (Snapshot, DeleteSelectedParamsResult, error) {
	if r == nil {
		return Snapshot{}, DeleteSelectedParamsResult{}, ErrRuntimeClosed
	}

	var result DeleteSelectedParamsResult
	snapshot, err := r.MutateAndSave(ctx, func(document Document) (Document, error) {
		var mutationErr error
		result, mutationErr = document.DeleteSelectedParams(projectID, input)
		if mutationErr != nil {
			return document, mutationErr
		}
		return document, nil
	})
	if err != nil {
		return Snapshot{}, DeleteSelectedParamsResult{}, err
	}
	return snapshot, result, nil
}

func (p *Project) DeleteSelectedParams(input DeleteSelectedParamsInput) (DeleteSelectedParamsResult, error) {
	if p == nil {
		return DeleteSelectedParamsResult{}, ErrProjectNotFound
	}

	normalized, err := normalizeDeleteSelectedParamsInput(input)
	if err != nil {
		return DeleteSelectedParamsResult{}, err
	}
	if len(normalized.ParamInfoIDs) == 0 {
		return DeleteSelectedParamsResult{ParamInfoIDs: []string{}}, nil
	}

	sectionType, sectionPayload, rootCodeObjID, err := p.resolveDeleteSelectedParamsContext(normalized.SectionID)
	if err != nil {
		return DeleteSelectedParamsResult{}, err
	}
	if rootCodeObjID == "" {
		return DeleteSelectedParamsResult{ParamInfoIDs: []string{}}, nil
	}

	codeObjVariantMap := payloadStringMapField(sectionPayload, "codeObjVariantMap")
	if _, ok := codeObjVariantMap[rootCodeObjID]; !ok {
		return DeleteSelectedParamsResult{}, fmt.Errorf(
			"%w: section=%q root=%q",
			ErrDeleteSelectedParamsRootMissing,
			normalized.SectionID,
			rootCodeObjID,
		)
	}

	parentByID, _, err := collectCodeObjectHierarchy(*p, codeObjVariantMap, rootCodeObjID)
	if err != nil {
		return DeleteSelectedParamsResult{}, err
	}

	removedByParent := map[string]map[string]struct{}{}
	removedIDs := make([]string, 0, len(normalized.ParamInfoIDs))
	removedSet := map[string]struct{}{}
	for _, paramInfoID := range normalized.ParamInfoIDs {
		if _, ok := p.CodeObjs[paramInfoID]; !ok {
			return DeleteSelectedParamsResult{}, fmt.Errorf("%w: %q", ErrCodeObjNotFound, paramInfoID)
		}

		paramPayload, _, _, paramImpl, err := p.ResolveSectionCodeObject(normalized.SectionID, paramInfoID)
		if err != nil {
			return DeleteSelectedParamsResult{}, err
		}
		paramType := effectiveCodeObjType(paramPayload, paramImpl)
		if !isParamCodeObjectType(paramType) {
			return DeleteSelectedParamsResult{}, fmt.Errorf(
				"%w: codeObj=%q type=%q",
				ErrDeleteSelectedParamsParamUnsupported,
				paramInfoID,
				paramType,
			)
		}
		if !payloadBoolField(paramPayload, "coreNameEditable") {
			continue
		}

		parentID, ok := parentByID[paramInfoID]
		if !ok || strings.TrimSpace(parentID) == "" {
			return DeleteSelectedParamsResult{}, fmt.Errorf(
				"%w: section=%q codeObj=%q",
				ErrDeleteSelectedParamsParentMissing,
				normalized.SectionID,
				paramInfoID,
			)
		}

		removedIDs = append(removedIDs, paramInfoID)
		removedSet[paramInfoID] = struct{}{}
		if _, ok := removedByParent[parentID]; !ok {
			removedByParent[parentID] = map[string]struct{}{}
		}
		removedByParent[parentID][paramInfoID] = struct{}{}
	}

	if len(removedIDs) == 0 {
		return DeleteSelectedParamsResult{ParamInfoIDs: []string{}}, nil
	}

	for parentID, removedChildren := range removedByParent {
		parentPayload, _, _, parentImpl, err := p.ResolveSectionCodeObject(normalized.SectionID, parentID)
		if err != nil {
			return DeleteSelectedParamsResult{}, err
		}
		if _, ok := parentPayload["children"]; !ok {
			return DeleteSelectedParamsResult{}, fmt.Errorf(
				"%w: codeObj=%q type=%q",
				ErrDeleteSelectedParamsParentUnsupported,
				parentID,
				effectiveCodeObjType(parentPayload, parentImpl),
			)
		}

		currentChildren := payloadStringArrayField(parentPayload, "children")
		nextChildren := filterStringSlice(currentChildren, removedChildren)
		if stringSlicesEqual(currentChildren, nextChildren) {
			continue
		}
		if err := p.setCurrentCodeObjectField(normalized.SectionID, parentID, "children", append([]string(nil), nextChildren...)); err != nil {
			return DeleteSelectedParamsResult{}, err
		}
	}

	if err := p.cleanupDeletedParamSectionState(normalized.SectionID, removedSet); err != nil {
		return DeleteSelectedParamsResult{}, err
	}
	if err := p.removeDeletedParamsFromSectionVariantMaps(sectionType, normalized.SectionID, rootCodeObjID, removedSet); err != nil {
		return DeleteSelectedParamsResult{}, err
	}
	if err := p.pruneUnusedCodeObjects(); err != nil {
		return DeleteSelectedParamsResult{}, err
	}

	return DeleteSelectedParamsResult{
		ParamInfoIDs: append([]string(nil), removedIDs...),
	}, nil
}

func normalizeDeleteSelectedParamsInput(input DeleteSelectedParamsInput) (DeleteSelectedParamsInput, error) {
	normalized := DeleteSelectedParamsInput{
		SectionID:    strings.TrimSpace(input.SectionID),
		ParamInfoIDs: make([]string, 0, len(input.ParamInfoIDs)),
	}
	if normalized.SectionID == "" {
		return DeleteSelectedParamsInput{}, ErrSectionIDRequired
	}
	if len(input.ParamInfoIDs) == 0 {
		return normalized, nil
	}

	seen := make(map[string]struct{}, len(input.ParamInfoIDs))
	for _, rawParamInfoID := range input.ParamInfoIDs {
		paramInfoID := strings.TrimSpace(rawParamInfoID)
		if paramInfoID == "" {
			return DeleteSelectedParamsInput{}, ErrDeleteSelectedParamsParamIDBlank
		}
		if _, ok := seen[paramInfoID]; ok {
			continue
		}
		seen[paramInfoID] = struct{}{}
		normalized.ParamInfoIDs = append(normalized.ParamInfoIDs, paramInfoID)
	}
	return normalized, nil
}

func (p Project) resolveDeleteSelectedParamsContext(sectionID string) (string, map[string]any, string, error) {
	section, variant, impl, err := p.ResolveSection(sectionID)
	if err != nil {
		return "", nil, "", err
	}
	payload, err := effectiveSectionPayload(p, section.ID, variant.ID)
	if err != nil {
		return "", nil, "", err
	}

	switch sectionType := canonicalSectionType(payloadStringField(payload, "type"), impl); sectionType {
	case "Callable":
		return sectionType, payload, payloadStringField(payload, "callable"), nil
	case "Dict":
		return sectionType, payload, payloadStringField(payload, "topLevelParamId"), nil
	default:
		return "", nil, "", fmt.Errorf("%w: section=%q type=%q", ErrDeleteSelectedParamsUnsupported, sectionID, sectionType)
	}
}

func (p *Project) cleanupDeletedParamSectionState(sectionID string, removed map[string]struct{}) error {
	if p == nil || len(removed) == 0 {
		return nil
	}

	_, _, _, payload, err := p.resolveTypeErrorIgnoreContext(sectionID)
	if err != nil {
		return err
	}

	currentPinned := payloadStringArrayField(payload, "pinnedParams")
	nextPinned := filterStringSlice(currentPinned, removed)
	if !stringSlicesEqual(currentPinned, nextPinned) {
		if err := p.setCurrentSectionField(sectionID, "pinnedParams", append([]string(nil), nextPinned...)); err != nil {
			return err
		}
	}

	currentSelected := payloadStringArrayField(payload, "selectedParams")
	nextSelected := filterStringSlice(currentSelected, removed)
	if !stringSlicesEqual(currentSelected, nextSelected) {
		if err := p.setCurrentSectionField(sectionID, "selectedParams", append([]string(nil), nextSelected...)); err != nil {
			return err
		}
	}

	ignoreState, err := p.TypeErrorIgnoreStateForSection(sectionID)
	if err != nil {
		return err
	}
	nextIgnoreParams := cloneBoolMap(ignoreState.Params)
	ignoreChanged := false
	for paramInfoID := range removed {
		if _, ok := nextIgnoreParams[paramInfoID]; !ok {
			continue
		}
		delete(nextIgnoreParams, paramInfoID)
		ignoreChanged = true
	}
	if ignoreChanged {
		ignoreState.Params = nextIgnoreParams
		if err := p.setCurrentTypeErrorIgnoreState(sectionID, ignoreState); err != nil {
			return err
		}
	}

	currentEdgeInputs := payloadStringArrayField(payload, "edgeInputParams")
	nextEdgeInputs := filterStringSlice(currentEdgeInputs, removed)
	if !stringSlicesEqual(currentEdgeInputs, nextEdgeInputs) {
		removedEdgeInputs := map[string]struct{}{}
		for _, paramInfoID := range currentEdgeInputs {
			if _, ok := removed[paramInfoID]; ok {
				removedEdgeInputs[paramInfoID] = struct{}{}
			}
		}
		if err := p.removeDeletedParamEdgeTargets(sectionID, removedEdgeInputs); err != nil {
			return err
		}
		if err := p.setCurrentSectionField(sectionID, "edgeInputParams", append([]string(nil), nextEdgeInputs...)); err != nil {
			return err
		}
	}

	return nil
}

func (p *Project) removeDeletedParamEdgeTargets(sectionID string, removedPorts map[string]struct{}) error {
	if p == nil || len(removedPorts) == 0 || len(p.Edges) == 0 {
		return nil
	}

	activeVariantID, ok := p.SectionVariantMap[sectionID]
	if !ok {
		return fmt.Errorf("%w: %q", ErrSectionActiveVariantNotFound, sectionID)
	}

	remaining := make([]Edge, 0, len(p.Edges))
	removedEdges := make([]Edge, 0, len(p.Edges))
	for _, edge := range p.Edges {
		if edge.TargetSectionID == sectionID && edge.TargetVariantID == activeVariantID {
			if _, ok := removedPorts[edge.TargetPortID]; ok {
				removedEdges = append(removedEdges, edge)
				continue
			}
		}
		remaining = append(remaining, edge)
	}
	p.Edges = remaining

	for _, edge := range removedEdges {
		if err := p.maybeClearEdgeTargetValue(edge); err != nil {
			return err
		}
	}
	return nil
}

func (p *Project) removeDeletedParamsFromSectionVariantMaps(
	sectionType string,
	sectionID string,
	rootCodeObjID string,
	removed map[string]struct{},
) error {
	if p == nil || len(removed) == 0 {
		return nil
	}

	affectedSectionIDs := []string{sectionID}
	if sectionType == "Dict" {
		sharedSectionIDs, err := p.dictSectionIDsForTopLevelParam(rootCodeObjID)
		if err != nil {
			return err
		}
		affectedSectionIDs = sharedSectionIDs
	}

	for _, affectedSectionID := range affectedSectionIDs {
		section, variant, _, err := p.ResolveSection(affectedSectionID)
		if err != nil {
			return err
		}
		payload, err := effectiveSectionPayload(*p, section.ID, variant.ID)
		if err != nil {
			return err
		}
		currentMap := payloadStringMapField(payload, "codeObjVariantMap")
		if len(currentMap) == 0 {
			continue
		}

		nextMap := make(map[string]string, len(currentMap))
		changed := false
		for codeObjID, variantID := range currentMap {
			if _, ok := removed[codeObjID]; ok {
				changed = true
				continue
			}
			nextMap[codeObjID] = variantID
		}
		if !changed {
			continue
		}
		if err := p.setCurrentSectionField(affectedSectionID, "codeObjVariantMap", nextMap); err != nil {
			return err
		}
	}

	return nil
}
