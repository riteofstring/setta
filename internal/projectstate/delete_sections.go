package projectstate

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrDeleteSectionsSectionIDsRequired = errors.New("delete sections sectionIds must contain at least one section id")
	ErrDeleteSectionsSectionIDBlank     = errors.New("delete sections sectionIds must not contain blank ids")
)

type DeleteSectionsInput struct {
	SectionIDs []string `json:"sectionIds"`
}

type DeleteSectionsResult struct {
	SectionIDs []string `json:"sectionIds"`
}

func (d *Document) DeleteSections(projectID string, input DeleteSectionsInput) (DeleteSectionsResult, error) {
	if d == nil {
		return DeleteSectionsResult{}, ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return DeleteSectionsResult{}, err
	}
	result, err := project.DeleteSections(input)
	if err != nil {
		return DeleteSectionsResult{}, err
	}
	d.Projects[project.ID] = project
	return result, nil
}

func (r *Runtime) DeleteSections(
	ctx context.Context,
	projectID string,
	input DeleteSectionsInput,
) (Snapshot, DeleteSectionsResult, error) {
	if r == nil {
		return Snapshot{}, DeleteSectionsResult{}, ErrRuntimeClosed
	}

	var result DeleteSectionsResult
	snapshot, err := r.MutateAndSave(ctx, func(document Document) (Document, error) {
		var mutationErr error
		result, mutationErr = document.DeleteSections(projectID, input)
		if mutationErr != nil {
			return document, mutationErr
		}
		if mutationErr = r.reconcileProjectPythonGeneratedSectionsAfterStructuralMutation(ctx, &document, projectID); mutationErr != nil {
			return document, mutationErr
		}
		return document, nil
	})
	if err != nil {
		return Snapshot{}, DeleteSectionsResult{}, err
	}
	return snapshot, result, nil
}

func (p *Project) DeleteSections(input DeleteSectionsInput) (DeleteSectionsResult, error) {
	if p == nil {
		return DeleteSectionsResult{}, ErrProjectNotFound
	}

	normalized, err := normalizeDeleteSectionsInput(input)
	if err != nil {
		return DeleteSectionsResult{}, err
	}

	sectionIDs, err := collectSectionIDsForDeletion(*p, normalized.SectionIDs)
	if err != nil {
		return DeleteSectionsResult{}, err
	}
	removed := make(map[string]struct{}, len(sectionIDs))
	for _, sectionID := range sectionIDs {
		removed[sectionID] = struct{}{}
	}

	if err := p.clearEdgeTargetsForDeletedSections(removed); err != nil {
		return DeleteSectionsResult{}, err
	}
	p.StateMachineEdges = filterStateMachineEdgesBySectionIDs(p.StateMachineEdges, removed)
	if err := p.removeDeletedSectionReferences(removed); err != nil {
		return DeleteSectionsResult{}, err
	}

	RemoveSections(p, sectionIDs)
	if err := p.pruneWindowingForDeletedSections(); err != nil {
		return DeleteSectionsResult{}, err
	}
	if err := p.pruneUnusedCodeObjects(); err != nil {
		return DeleteSectionsResult{}, err
	}
	p.pruneTopLevelCreationViewState()

	return DeleteSectionsResult{
		SectionIDs: append([]string(nil), sectionIDs...),
	}, nil
}

func (p *Project) pruneWindowingForDeletedSections() error {
	if p == nil {
		return nil
	}

	normalizedWindowing, err := normalizeProjectChatWindowingState(
		ProjectChatWindowingOrDefault(p.ProjectChatWindowing),
		p.Sections,
	)
	if err != nil {
		return err
	}
	p.ProjectChatWindowing = &normalizedWindowing

	normalizedWindowSpaces, err := normalizeWindowSpaces(p.WindowSpaces, p.Sections)
	if err != nil {
		return err
	}
	p.WindowSpaces = normalizedWindowSpaces
	return nil
}

func normalizeDeleteSectionsInput(input DeleteSectionsInput) (DeleteSectionsInput, error) {
	if len(input.SectionIDs) == 0 {
		return DeleteSectionsInput{}, ErrDeleteSectionsSectionIDsRequired
	}

	normalized := DeleteSectionsInput{
		SectionIDs: make([]string, 0, len(input.SectionIDs)),
	}
	seen := make(map[string]struct{}, len(input.SectionIDs))
	for _, rawSectionID := range input.SectionIDs {
		sectionID := strings.TrimSpace(rawSectionID)
		if sectionID == "" {
			return DeleteSectionsInput{}, ErrDeleteSectionsSectionIDBlank
		}
		if _, ok := seen[sectionID]; ok {
			continue
		}
		seen[sectionID] = struct{}{}
		normalized.SectionIDs = append(normalized.SectionIDs, sectionID)
	}
	if len(normalized.SectionIDs) == 0 {
		return DeleteSectionsInput{}, ErrDeleteSectionsSectionIDsRequired
	}
	return normalized, nil
}

func collectSectionIDsForDeletion(project Project, rootSectionIDs []string) ([]string, error) {
	queue := append([]string(nil), rootSectionIDs...)
	seen := make(map[string]struct{}, len(rootSectionIDs))
	ordered := make([]string, 0, len(rootSectionIDs))

	for index := 0; index < len(queue); index++ {
		sectionID := strings.TrimSpace(queue[index])
		if sectionID == "" {
			continue
		}
		if _, ok := seen[sectionID]; ok {
			continue
		}
		if _, ok := project.Sections[sectionID]; !ok {
			return nil, fmt.Errorf("%w: %q", ErrSectionNotFound, sectionID)
		}

		seen[sectionID] = struct{}{}
		ordered = append(ordered, sectionID)

		childIDs, err := allReferencedChildSectionIDs(project, sectionID)
		if err != nil {
			return nil, err
		}
		queue = append(queue, childIDs...)
	}

	return ordered, nil
}

func allReferencedChildSectionIDs(project Project, sectionID string) ([]string, error) {
	section, ok := project.Sections[sectionID]
	if !ok {
		return nil, fmt.Errorf("%w: %q", ErrSectionNotFound, sectionID)
	}

	childIDs := []string{}
	seen := map[string]struct{}{}
	appendChildID := func(raw string) {
		childID := strings.TrimSpace(raw)
		if childID == "" {
			return
		}
		if _, ok := seen[childID]; ok {
			return
		}
		seen[childID] = struct{}{}
		childIDs = append(childIDs, childID)
	}

	for _, variantID := range collectSectionVariantIDs(project, section) {
		payload, err := effectiveSectionPayload(project, sectionID, variantID)
		if err != nil {
			return nil, err
		}
		for _, childID := range payloadStringArrayField(payload, "children") {
			appendChildID(childID)
		}
		appendChildID(payloadStringField(payload, "attachedTerminalSectionId"))
	}

	for childSectionID, childSection := range project.Sections {
		if strings.TrimSpace(childSection.ParentSectionID) == sectionID {
			appendChildID(childSectionID)
		}
	}

	return childIDs, nil
}

func (p *Project) clearEdgeTargetsForDeletedSections(removed map[string]struct{}) error {
	if p == nil || len(removed) == 0 || len(p.Edges) == 0 {
		return nil
	}

	remaining := make([]Edge, 0, len(p.Edges))
	removedEdges := make([]Edge, 0, len(p.Edges))
	for _, edge := range p.Edges {
		if _, ok := removed[edge.SourceSectionID]; ok {
			removedEdges = append(removedEdges, edge)
			continue
		}
		if _, ok := removed[edge.TargetSectionID]; ok {
			removedEdges = append(removedEdges, edge)
			continue
		}
		remaining = append(remaining, edge)
	}
	p.Edges = remaining

	for _, edge := range removedEdges {
		if _, ok := removed[edge.TargetSectionID]; ok {
			continue
		}
		if err := p.maybeClearEdgeTargetValue(edge); err != nil {
			return err
		}
	}

	return nil
}

func (p *Project) maybeClearEdgeTargetValue(edge Edge) error {
	if p == nil {
		return ErrProjectNotFound
	}

	targetSectionID := strings.TrimSpace(edge.TargetSectionID)
	if targetSectionID == "" {
		return nil
	}
	if _, ok := p.Sections[targetSectionID]; !ok {
		return nil
	}

	activeVariantID, ok := p.SectionVariantMap[targetSectionID]
	if !ok {
		return fmt.Errorf("%w: %q", ErrSectionActiveVariantNotFound, targetSectionID)
	}

	for _, existing := range p.Edges {
		if existing.TargetSectionID == edge.TargetSectionID &&
			existing.TargetVariantID == edge.TargetVariantID &&
			existing.TargetPortID == edge.TargetPortID {
			return nil
		}
	}
	if activeVariantID != edge.TargetVariantID {
		return nil
	}

	targetPortID := strings.TrimSpace(edge.TargetPortID)
	if targetPortID == "" {
		return nil
	}
	if _, ok := p.CodeObjs[targetPortID]; !ok {
		return fmt.Errorf("%w: %q", ErrCodeObjNotFound, targetPortID)
	}
	return p.SetSectionCodeObjectValue(targetSectionID, targetPortID, "")
}

func (p *Project) removeDeletedSectionReferences(removed map[string]struct{}) error {
	if p == nil || len(removed) == 0 {
		return nil
	}

	for sectionID, section := range p.Sections {
		if _, ok := removed[sectionID]; ok {
			continue
		}
		changed, err := filterDeletedSectionIDsFromRawJSON(&section.SharedModifier, removed)
		if err != nil {
			return err
		}
		if changed {
			p.Sections[sectionID] = section
		}
	}

	for variantID, variant := range p.SectionVariants {
		changed, err := filterDeletedSectionIDsFromRawJSON(&variant.Modifier, removed)
		if err != nil {
			return err
		}
		if changed {
			p.SectionVariants[variantID] = variant
		}
	}

	for implID, impl := range p.SectionImpls {
		changed := false
		if impl.IsCode() && impl.Code != nil {
			nextChildren := filterStringSlice(impl.Code.Children, removed)
			if !stringSlicesEqual(impl.Code.Children, nextChildren) {
				impl.Code.Children = nextChildren
				changed = true
			}
			if _, ok := removed[strings.TrimSpace(impl.Code.AttachedTerminalSectionID)]; ok {
				impl.Code.AttachedTerminalSectionID = ""
				changed = true
			}
		}
		payloadChanged, err := filterDeletedSectionIDsFromRawJSON(&impl.Payload, removed)
		if err != nil {
			return err
		}
		if changed || payloadChanged {
			p.SectionImpls[implID] = impl
		}
	}

	return nil
}

func filterDeletedSectionIDsFromRawJSON(raw *RawJSON, removed map[string]struct{}) (bool, error) {
	if raw == nil || len(*raw) == 0 || len(removed) == 0 {
		return false, nil
	}

	object, err := rawObjectFromProjectPayload(*raw)
	if err != nil {
		return false, err
	}
	if !filterDeletedSectionIDsFromObject(object, removed) {
		return false, nil
	}
	encoded, err := marshalProjectObject(object)
	if err != nil {
		return false, err
	}
	*raw = encoded
	return true, nil
}

func filterDeletedSectionIDsFromObject(object map[string]any, removed map[string]struct{}) bool {
	if len(object) == 0 || len(removed) == 0 {
		return false
	}

	changed := false
	if _, ok := object["children"]; ok {
		currentChildren := payloadStringArrayField(object, "children")
		nextChildren := filterStringSlice(currentChildren, removed)
		if !stringSlicesEqual(currentChildren, nextChildren) {
			object["children"] = append([]string(nil), nextChildren...)
			changed = true
		}
	}

	if attachedTerminalID := payloadStringField(object, "attachedTerminalSectionId"); attachedTerminalID != "" {
		if _, ok := removed[attachedTerminalID]; ok {
			delete(object, "attachedTerminalSectionId")
			changed = true
		}
	}

	return changed
}
