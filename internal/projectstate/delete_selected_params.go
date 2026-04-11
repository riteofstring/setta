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

type deleteSelectedParamsContext struct {
	sectionType string
	rootCodeObj string
	parentByID  map[string]string
}

type deleteSelectedParamsPlan struct {
	removedByParent map[string]map[string]struct{}
	removedIDs      []string
	removedSet      map[string]struct{}
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

	ctx, err := p.buildDeleteSelectedParamsContext(normalized.SectionID)
	if err != nil {
		return DeleteSelectedParamsResult{}, err
	}
	if ctx.rootCodeObj == "" {
		return DeleteSelectedParamsResult{ParamInfoIDs: []string{}}, nil
	}

	plan, err := p.collectDeleteSelectedParamsPlan(normalized.SectionID, normalized.ParamInfoIDs, ctx.parentByID)
	if err != nil {
		return DeleteSelectedParamsResult{}, err
	}
	if len(plan.removedIDs) == 0 {
		return DeleteSelectedParamsResult{ParamInfoIDs: []string{}}, nil
	}

	if err := p.removeDeletedParamsFromParents(normalized.SectionID, plan.removedByParent); err != nil {
		return DeleteSelectedParamsResult{}, err
	}
	if err := p.applyDeleteSelectedParamsCleanup(ctx.sectionType, normalized.SectionID, ctx.rootCodeObj, plan.removedSet); err != nil {
		return DeleteSelectedParamsResult{}, err
	}
	return DeleteSelectedParamsResult{ParamInfoIDs: append([]string(nil), plan.removedIDs...)}, nil
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

func (p *Project) buildDeleteSelectedParamsContext(sectionID string) (deleteSelectedParamsContext, error) {
	sectionType, sectionPayload, rootCodeObjID, err := p.resolveDeleteSelectedParamsContext(sectionID)
	if err != nil {
		return deleteSelectedParamsContext{}, err
	}
	if rootCodeObjID == "" {
		return deleteSelectedParamsContext{sectionType: sectionType}, nil
	}

	codeObjVariantMap := payloadStringMapField(sectionPayload, "codeObjVariantMap")
	if _, ok := codeObjVariantMap[rootCodeObjID]; !ok {
		return deleteSelectedParamsContext{}, fmt.Errorf(
			"%w: section=%q root=%q",
			ErrDeleteSelectedParamsRootMissing,
			sectionID,
			rootCodeObjID,
		)
	}

	parentByID, _, err := collectCodeObjectHierarchy(*p, codeObjVariantMap, rootCodeObjID)
	if err != nil {
		return deleteSelectedParamsContext{}, err
	}
	return deleteSelectedParamsContext{
		sectionType: sectionType,
		rootCodeObj: rootCodeObjID,
		parentByID:  parentByID,
	}, nil
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
	case "Dict", "GlobalVariables":
		return sectionType, payload, payloadStringField(payload, "topLevelParamId"), nil
	default:
		return "", nil, "", fmt.Errorf("%w: section=%q type=%q", ErrDeleteSelectedParamsUnsupported, sectionID, sectionType)
	}
}

func (p *Project) collectDeleteSelectedParamsPlan(
	sectionID string,
	paramInfoIDs []string,
	parentByID map[string]string,
) (deleteSelectedParamsPlan, error) {
	plan := deleteSelectedParamsPlan{
		removedByParent: map[string]map[string]struct{}{},
		removedIDs:      make([]string, 0, len(paramInfoIDs)),
		removedSet:      map[string]struct{}{},
	}
	for _, paramInfoID := range paramInfoIDs {
		parentID, shouldDelete, err := p.resolveDeleteSelectedParamTarget(sectionID, paramInfoID, parentByID)
		if err != nil {
			return deleteSelectedParamsPlan{}, err
		}
		if !shouldDelete {
			continue
		}
		plan.removedIDs = append(plan.removedIDs, paramInfoID)
		plan.removedSet[paramInfoID] = struct{}{}
		if _, ok := plan.removedByParent[parentID]; !ok {
			plan.removedByParent[parentID] = map[string]struct{}{}
		}
		plan.removedByParent[parentID][paramInfoID] = struct{}{}
	}
	return plan, nil
}

func (p *Project) resolveDeleteSelectedParamTarget(
	sectionID string,
	paramInfoID string,
	parentByID map[string]string,
) (string, bool, error) {
	if _, ok := p.CodeObjs[paramInfoID]; !ok {
		return "", false, fmt.Errorf("%w: %q", ErrCodeObjNotFound, paramInfoID)
	}

	paramPayload, _, _, paramImpl, err := p.ResolveSectionCodeObject(sectionID, paramInfoID)
	if err != nil {
		return "", false, err
	}
	paramType := effectiveCodeObjType(paramPayload, paramImpl)
	if !isParamCodeObjectType(paramType) {
		return "", false, fmt.Errorf(
			"%w: codeObj=%q type=%q",
			ErrDeleteSelectedParamsParamUnsupported,
			paramInfoID,
			paramType,
		)
	}
	if !payloadBoolField(paramPayload, "coreNameEditable") {
		return "", false, nil
	}

	parentID, ok := parentByID[paramInfoID]
	if !ok || strings.TrimSpace(parentID) == "" {
		return "", false, fmt.Errorf(
			"%w: section=%q codeObj=%q",
			ErrDeleteSelectedParamsParentMissing,
			sectionID,
			paramInfoID,
		)
	}
	return parentID, true, nil
}

func (p *Project) removeDeletedParamsFromParents(sectionID string, removedByParent map[string]map[string]struct{}) error {
	for parentID, removedChildren := range removedByParent {
		if err := p.removeDeletedChildrenFromParent(sectionID, parentID, removedChildren); err != nil {
			return err
		}
	}
	return nil
}

func (p *Project) removeDeletedChildrenFromParent(
	sectionID string,
	parentID string,
	removedChildren map[string]struct{},
) error {
	parentPayload, _, _, parentImpl, err := p.ResolveSectionCodeObject(sectionID, parentID)
	if err != nil {
		return err
	}
	if _, ok := parentPayload["children"]; !ok {
		return fmt.Errorf(
			"%w: codeObj=%q type=%q",
			ErrDeleteSelectedParamsParentUnsupported,
			parentID,
			effectiveCodeObjType(parentPayload, parentImpl),
		)
	}

	currentChildren := payloadStringArrayField(parentPayload, "children")
	nextChildren := filterStringSlice(currentChildren, removedChildren)
	if stringSlicesEqual(currentChildren, nextChildren) {
		return nil
	}
	return p.setCurrentCodeObjectField(sectionID, parentID, "children", append([]string(nil), nextChildren...))
}

func (p *Project) cleanupDeletedParamSectionState(sectionID string, removed map[string]struct{}) error {
	if p == nil || len(removed) == 0 {
		return nil
	}

	_, _, _, payload, err := p.resolveTypeErrorIgnoreContext(sectionID)
	if err != nil {
		return err
	}

	if err := p.removeDeletedSectionParamList(sectionID, payload, "pinnedParams", removed); err != nil {
		return err
	}
	if err := p.removeDeletedSectionParamList(sectionID, payload, "selectedParams", removed); err != nil {
		return err
	}
	if err := p.removeDeletedIgnoreParams(sectionID, removed); err != nil {
		return err
	}
	return p.removeDeletedEdgeInputParams(sectionID, payload, removed)
}

func (p *Project) removeDeletedSectionParamList(
	sectionID string,
	payload map[string]any,
	field string,
	removed map[string]struct{},
) error {
	current := payloadStringArrayField(payload, field)
	next := filterStringSlice(current, removed)
	if stringSlicesEqual(current, next) {
		return nil
	}
	return p.setCurrentSectionField(sectionID, field, append([]string(nil), next...))
}

func (p *Project) removeDeletedIgnoreParams(sectionID string, removed map[string]struct{}) error {
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
	if !ignoreChanged {
		return nil
	}
	ignoreState.Params = nextIgnoreParams
	return p.setCurrentTypeErrorIgnoreState(sectionID, ignoreState)
}

func (p *Project) removeDeletedEdgeInputParams(
	sectionID string,
	payload map[string]any,
	removed map[string]struct{},
) error {
	currentEdgeInputs := payloadStringArrayField(payload, "edgeInputParams")
	nextEdgeInputs := filterStringSlice(currentEdgeInputs, removed)
	if stringSlicesEqual(currentEdgeInputs, nextEdgeInputs) {
		return nil
	}

	removedEdgeInputs := sliceIntersectionSet(currentEdgeInputs, removed)
	if err := p.removeDeletedParamEdgeTargets(sectionID, removedEdgeInputs); err != nil {
		return err
	}
	return p.setCurrentSectionField(sectionID, "edgeInputParams", append([]string(nil), nextEdgeInputs...))
}

func sliceIntersectionSet(values []string, allowed map[string]struct{}) map[string]struct{} {
	result := map[string]struct{}{}
	for _, value := range values {
		if _, ok := allowed[value]; ok {
			result[value] = struct{}{}
		}
	}
	return result
}

func (p *Project) applyDeleteSelectedParamsCleanup(
	sectionType string,
	sectionID string,
	rootCodeObjID string,
	removed map[string]struct{},
) error {
	if err := p.cleanupDeletedParamSectionState(sectionID, removed); err != nil {
		return err
	}
	if err := p.removeDeletedParamsFromSectionVariantMaps(sectionType, sectionID, rootCodeObjID, removed); err != nil {
		return err
	}
	return p.pruneUnusedCodeObjects()
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

	affectedSectionIDs, err := p.deleteSelectedParamsAffectedSectionIDs(sectionType, sectionID, rootCodeObjID)
	if err != nil {
		return err
	}
	for _, affectedSectionID := range affectedSectionIDs {
		if err := p.removeDeletedParamsFromSectionVariantMap(affectedSectionID, removed); err != nil {
			return err
		}
	}

	return nil
}

func (p *Project) deleteSelectedParamsAffectedSectionIDs(
	sectionType string,
	sectionID string,
	rootCodeObjID string,
) ([]string, error) {
	if !isKwargDictLikeSectionType(sectionType) {
		return []string{sectionID}, nil
	}
	return p.dictSectionIDsForTopLevelParam(rootCodeObjID)
}

func (p *Project) removeDeletedParamsFromSectionVariantMap(sectionID string, removed map[string]struct{}) error {
	section, variant, _, err := p.ResolveSection(sectionID)
	if err != nil {
		return err
	}
	payload, err := effectiveSectionPayload(*p, section.ID, variant.ID)
	if err != nil {
		return err
	}
	currentMap := payloadStringMapField(payload, "codeObjVariantMap")
	if len(currentMap) == 0 {
		return nil
	}

	nextMap, changed := withoutRemovedCodeObjectVariants(currentMap, removed)
	if !changed {
		return nil
	}
	return p.setCurrentSectionCodeObjVariantMap(sectionID, nextMap)
}

func withoutRemovedCodeObjectVariants(
	current map[string]string,
	removed map[string]struct{},
) (map[string]string, bool) {
	next := make(map[string]string, len(current))
	changed := false
	for codeObjID, variantID := range current {
		if _, ok := removed[codeObjID]; ok {
			changed = true
			continue
		}
		next[codeObjID] = variantID
	}
	return next, changed
}
