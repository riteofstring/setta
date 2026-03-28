package projectstate

import (
	"context"
	"fmt"
	"strings"
)

type CreateNewSectionVariantInput struct {
	SectionID string `json:"sectionId"`
}

type CreateNewSectionVariantResult struct {
	VariantID string `json:"variantId"`
}

func (d *Document) CreateNewSectionVariant(
	projectID string,
	input CreateNewSectionVariantInput,
) (CreateNewSectionVariantResult, error) {
	if d == nil {
		return CreateNewSectionVariantResult{}, ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return CreateNewSectionVariantResult{}, err
	}
	result, err := project.CreateNewSectionVariant(input)
	if err != nil {
		return CreateNewSectionVariantResult{}, err
	}
	d.Projects[project.ID] = project
	return result, nil
}

func (r *Runtime) CreateNewSectionVariant(
	ctx context.Context,
	projectID string,
	input CreateNewSectionVariantInput,
) (Snapshot, CreateNewSectionVariantResult, error) {
	if r == nil {
		return Snapshot{}, CreateNewSectionVariantResult{}, ErrRuntimeClosed
	}

	var result CreateNewSectionVariantResult
	snapshot, err := r.MutateAndSave(ctx, func(document Document) (Document, error) {
		var mutationErr error
		result, mutationErr = document.CreateNewSectionVariant(projectID, input)
		if mutationErr != nil {
			return document, mutationErr
		}
		return document, nil
	})
	if err != nil {
		return Snapshot{}, CreateNewSectionVariantResult{}, err
	}
	return snapshot, result, nil
}

func (p *Project) CreateNewSectionVariant(input CreateNewSectionVariantInput) (CreateNewSectionVariantResult, error) {
	if p == nil {
		return CreateNewSectionVariantResult{}, ErrProjectNotFound
	}

	normalized, err := normalizeCreateNewSectionVariantInput(input)
	if err != nil {
		return CreateNewSectionVariantResult{}, err
	}
	section, sourceVariant, sourceImpl, err := p.ResolveSection(normalized.SectionID)
	if err != nil {
		return CreateNewSectionVariantResult{}, err
	}
	sectionPayload, err := effectiveSectionPayload(*p, section.ID, sourceVariant.ID)
	if err != nil {
		return CreateNewSectionVariantResult{}, err
	}

	newVariantID, err := newProjectStateID()
	if err != nil {
		return CreateNewSectionVariantResult{}, err
	}

	newVariantModifier, err := rawObjectFromProjectPayload(sourceVariant.Modifier)
	if err != nil {
		return CreateNewSectionVariantResult{}, err
	}
	clonedVariantModifier := cloneProjectObject(newVariantModifier)

	newVariant := SectionVariant{
		ID: newVariantID,
	}
	existingVariantNames := collectSectionVariantNames(section, p.SectionVariants)
	preferredVariantName := sourceVariant.Name
	if strings.TrimSpace(preferredVariantName) == "" {
		preferredVariantName = section.Name
	}
	newVariant.Name, err = nextAvailableSectionVariantName(existingVariantNames, preferredVariantName)
	if err != nil {
		return CreateNewSectionVariantResult{}, err
	}

	sourceImplPreset := sectionImplIsPreset(sourceImpl)
	if sourceImplPreset {
		newVariant.ImplID = sourceImpl.ID
	} else {
		clonedImpl, err := cloneSectionImplForVariant(sourceImpl)
		if err != nil {
			return CreateNewSectionVariantResult{}, err
		}
		newVariant.ImplID = clonedImpl.ID
		newVariant.NonPresetImplIDs = []string{clonedImpl.ID}
		p.SectionImpls[clonedImpl.ID] = clonedImpl
	}

	sourceCodeObjVariantMap := payloadStringMapField(sectionPayload, "codeObjVariantMap")
	if len(sourceCodeObjVariantMap) != 0 {
		clonedCodeObjVariantMap := make(map[string]string, len(sourceCodeObjVariantMap))
		for codeObjID, sourceCodeObjVariantID := range sourceCodeObjVariantMap {
			newCodeObjVariantID, err := p.createNewCodeObjectVariant(codeObjID, sourceCodeObjVariantID)
			if err != nil {
				return CreateNewSectionVariantResult{}, err
			}
			clonedCodeObjVariantMap[codeObjID] = newCodeObjVariantID
		}
		clonedVariantModifier["codeObjVariantMap"] = clonedCodeObjVariantMap
	}

	if len(clonedVariantModifier) != 0 {
		rawModifier, err := marshalProjectObject(clonedVariantModifier)
		if err != nil {
			return CreateNewSectionVariantResult{}, err
		}
		newVariant.Modifier = rawModifier
	}

	section.VariantIDs = append(section.VariantIDs, newVariant.ID)
	p.Sections[section.ID] = section
	p.SectionVariants[newVariant.ID] = newVariant
	p.SectionVariantMap[section.ID] = newVariant.ID

	if err := p.copyEdgesForNewSectionVariant(
		section.ID,
		sourceVariant.ID,
		newVariant.ID,
		payloadEdgeOutputPortIDs(sectionPayload),
		stringSetFromSlice(payloadStringArrayField(sectionPayload, "edgeInputParams")),
	); err != nil {
		return CreateNewSectionVariantResult{}, err
	}

	return CreateNewSectionVariantResult{
		VariantID: newVariant.ID,
	}, nil
}

func normalizeCreateNewSectionVariantInput(input CreateNewSectionVariantInput) (CreateNewSectionVariantInput, error) {
	normalized := CreateNewSectionVariantInput{
		SectionID: strings.TrimSpace(input.SectionID),
	}
	if normalized.SectionID == "" {
		return CreateNewSectionVariantInput{}, ErrSectionIDRequired
	}
	return normalized, nil
}

func cloneSectionImplForVariant(sourceImpl SectionImpl) (SectionImpl, error) {
	newImplID, err := newProjectStateID()
	if err != nil {
		return SectionImpl{}, err
	}
	payload, err := rawObjectFromProjectPayload(sectionImplPayloadUnchecked(sourceImpl))
	if err != nil {
		return SectionImpl{}, err
	}
	payload["id"] = newImplID
	rawPayload, err := marshalProjectObject(payload)
	if err != nil {
		return SectionImpl{}, err
	}

	clonedImpl := sourceImpl.Clone()
	clonedImpl.ID = newImplID
	clonedImpl.Payload = rawPayload
	return clonedImpl, nil
}

func (p *Project) createNewCodeObjectVariant(codeObjID string, sourceVariantID string) (string, error) {
	trimmedCodeObjID := strings.TrimSpace(codeObjID)
	if trimmedCodeObjID == "" {
		return "", ErrCodeObjIDRequired
	}
	trimmedVariantID := strings.TrimSpace(sourceVariantID)
	if trimmedVariantID == "" {
		return "", ErrCodeObjVariantIDRequired
	}

	codeObj, ok := p.CodeObjs[trimmedCodeObjID]
	if !ok {
		return "", fmt.Errorf("%w: %q", ErrCodeObjNotFound, trimmedCodeObjID)
	}
	if !containsString(codeObj.VariantIDs, trimmedVariantID) {
		return "", fmt.Errorf("%w: codeObj=%q variant=%q", ErrCodeObjVariantMembership, trimmedCodeObjID, trimmedVariantID)
	}

	sourceVariant, ok := p.CodeObjVariants[trimmedVariantID]
	if !ok {
		return "", fmt.Errorf("%w: %q", ErrCodeObjVariantNotFound, trimmedVariantID)
	}
	sourceImpl, ok := p.CodeObjImpls[sourceVariant.ImplID]
	if !ok {
		return "", fmt.Errorf("%w: %q", ErrCodeObjImplNotFound, sourceVariant.ImplID)
	}

	newVariantID, err := newProjectStateID()
	if err != nil {
		return "", err
	}

	newVariantModifier, err := rawObjectFromProjectPayload(sourceVariant.Modifier)
	if err != nil {
		return "", err
	}
	clonedVariantModifier := cloneProjectObject(newVariantModifier)

	newVariant := CodeObjectVariant{
		ID: newVariantID,
	}
	if codeObjImplIsPreset(sourceImpl) {
		newVariant.ImplID = sourceImpl.ID
	} else {
		clonedImpl, err := cloneCodeObjectImplForVariant(sourceImpl)
		if err != nil {
			return "", err
		}
		newVariant.ImplID = clonedImpl.ID
		newVariant.NonPresetImplIDs = []string{clonedImpl.ID}
		p.CodeObjImpls[clonedImpl.ID] = clonedImpl
	}
	if len(clonedVariantModifier) != 0 {
		rawModifier, err := marshalProjectObject(clonedVariantModifier)
		if err != nil {
			return "", err
		}
		newVariant.Modifier = rawModifier
	}

	codeObj.VariantIDs = append(codeObj.VariantIDs, newVariant.ID)
	p.CodeObjs[codeObj.ID] = codeObj
	p.CodeObjVariants[newVariant.ID] = newVariant
	return newVariant.ID, nil
}

func cloneCodeObjectImplForVariant(sourceImpl CodeObjectImpl) (CodeObjectImpl, error) {
	newImplID, err := newProjectStateID()
	if err != nil {
		return CodeObjectImpl{}, err
	}
	payload, err := rawObjectFromProjectPayload(codeObjImplPayloadUnchecked(sourceImpl))
	if err != nil {
		return CodeObjectImpl{}, err
	}
	payload["id"] = newImplID
	rawPayload, err := marshalProjectObject(payload)
	if err != nil {
		return CodeObjectImpl{}, err
	}

	clonedImpl := sourceImpl.Clone()
	clonedImpl.ID = newImplID
	clonedImpl.Payload = rawPayload
	return clonedImpl, nil
}

func (p *Project) copyEdgesForNewSectionVariant(
	sectionID string,
	sourceVariantID string,
	newVariantID string,
	sourceOutputPortIDs map[string]struct{},
	targetInputPortIDs map[string]struct{},
) error {
	if p == nil || len(p.Edges) == 0 {
		return nil
	}

	newEdges := make([]Edge, 0, len(p.Edges))
	for _, edge := range p.Edges {
		updateSource := edge.SourceSectionID == sectionID && edge.SourceVariantID == sourceVariantID
		updateTarget := edge.TargetSectionID == sectionID && edge.TargetVariantID == sourceVariantID
		if !updateSource && !updateTarget {
			continue
		}
		if updateSource {
			if _, ok := sourceOutputPortIDs[edge.SourcePortID]; !ok {
				continue
			}
		}
		if updateTarget {
			if _, ok := targetInputPortIDs[edge.TargetPortID]; !ok {
				continue
			}
		}

		newEdgeID, err := newProjectStateID()
		if err != nil {
			return err
		}
		clonedEdge := edge.Clone()
		clonedEdge.ID = newEdgeID
		if updateSource {
			clonedEdge.SourceVariantID = newVariantID
		}
		if updateTarget {
			clonedEdge.TargetVariantID = newVariantID
		}
		newEdges = append(newEdges, clonedEdge)
	}

	if len(newEdges) != 0 {
		p.Edges = append(p.Edges, newEdges...)
	}
	return nil
}

func payloadEdgeOutputPorts(object map[string]any) []EdgePort {
	value, ok := object["edgeOutputPorts"]
	if !ok {
		return nil
	}
	entries, ok := value.([]any)
	if !ok {
		return nil
	}

	output := make([]EdgePort, 0, len(entries))
	for _, entry := range entries {
		portObject, ok := entry.(map[string]any)
		if !ok {
			continue
		}
		portID := payloadStringField(portObject, "id")
		if portID == "" {
			continue
		}
		output = append(output, EdgePort{
			ID:       portID,
			Accessor: payloadRawStringField(portObject, "accessor"),
		})
	}
	return output
}

func payloadEdgeOutputPortIDs(object map[string]any) map[string]struct{} {
	ports := payloadEdgeOutputPorts(object)
	output := make(map[string]struct{}, len(ports))
	for _, port := range ports {
		output[port.ID] = struct{}{}
	}
	return output
}

func stringSetFromSlice(values []string) map[string]struct{} {
	if len(values) == 0 {
		return map[string]struct{}{}
	}
	output := make(map[string]struct{}, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		output[trimmed] = struct{}{}
	}
	return output
}
