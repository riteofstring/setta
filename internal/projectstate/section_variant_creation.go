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

type sectionVariantCreationSource struct {
	section Section
	variant SectionVariant
	impl    SectionImpl
	payload map[string]any
}

type codeObjectVariantCreationSource struct {
	codeObj CodeObject
	variant CodeObjectVariant
	impl    CodeObjectImpl
}

type sectionVariantEdgeClonePlan struct {
	shouldClone  bool
	updateSource bool
	updateTarget bool
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
	source, err := p.loadSectionVariantCreationSource(normalized.SectionID)
	if err != nil {
		return CreateNewSectionVariantResult{}, err
	}
	newVariant, err := p.buildCreatedSectionVariant(source)
	if err != nil {
		return CreateNewSectionVariantResult{}, err
	}

	p.storeCreatedSectionVariant(source.section, newVariant)

	if err := p.copyEdgesForNewSectionVariant(
		source.section.ID,
		source.variant.ID,
		newVariant.ID,
		payloadEdgeOutputPortIDs(source.payload),
		stringSetFromSlice(payloadStringArrayField(source.payload, "edgeInputParams")),
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

func (p *Project) loadSectionVariantCreationSource(sectionID string) (sectionVariantCreationSource, error) {
	section, variant, impl, err := p.ResolveSection(sectionID)
	if err != nil {
		return sectionVariantCreationSource{}, err
	}
	payload, err := effectiveSectionPayload(*p, section.ID, variant.ID)
	if err != nil {
		return sectionVariantCreationSource{}, err
	}
	return sectionVariantCreationSource{
		section: section,
		variant: variant,
		impl:    impl,
		payload: payload,
	}, nil
}

func (p *Project) buildCreatedSectionVariant(source sectionVariantCreationSource) (SectionVariant, error) {
	newVariantID, err := newProjectStateID()
	if err != nil {
		return SectionVariant{}, err
	}
	newVariant := SectionVariant{ID: newVariantID}
	if err := assignCreatedSectionVariantName(&newVariant, source.section, p.SectionVariants); err != nil {
		return SectionVariant{}, err
	}
	if err := p.assignCreatedSectionVariantImpl(&newVariant, source.impl); err != nil {
		return SectionVariant{}, err
	}
	if err := p.populateCreatedSectionVariantModifier(&newVariant, source.variant, source.payload); err != nil {
		return SectionVariant{}, err
	}
	return newVariant, nil
}

func assignCreatedSectionVariantName(
	newVariant *SectionVariant,
	section Section,
	existingVariants map[string]SectionVariant,
) error {
	existingVariantNames := collectSectionVariantNames(section, existingVariants)
	nextName, err := nextAvailableCreatedSectionVariantName(existingVariantNames)
	if err != nil {
		return err
	}
	newVariant.Name = nextName
	return nil
}

func (p *Project) assignCreatedSectionVariantImpl(newVariant *SectionVariant, sourceImpl SectionImpl) error {
	if sectionImplIsPreset(sourceImpl) {
		newVariant.ImplID = sourceImpl.ID
		return nil
	}

	clonedImpl, err := cloneSectionImplForVariant(sourceImpl)
	if err != nil {
		return err
	}
	newVariant.ImplID = clonedImpl.ID
	newVariant.NonPresetImplIDs = []string{clonedImpl.ID}
	p.SectionImpls[clonedImpl.ID] = clonedImpl
	return nil
}

func (p *Project) populateCreatedSectionVariantModifier(
	newVariant *SectionVariant,
	sourceVariant SectionVariant,
	sectionPayload map[string]any,
) error {
	clonedVariantModifier, err := cloneSectionVariantModifier(sourceVariant)
	if err != nil {
		return err
	}
	if err := p.cloneSectionVariantCodeObjectVariants(clonedVariantModifier, sectionPayload); err != nil {
		return err
	}
	if len(clonedVariantModifier) == 0 {
		return nil
	}

	rawModifier, err := marshalProjectObject(clonedVariantModifier)
	if err != nil {
		return err
	}
	newVariant.Modifier = rawModifier
	return nil
}

func cloneSectionVariantModifier(sourceVariant SectionVariant) (map[string]any, error) {
	newVariantModifier, err := rawObjectFromProjectPayload(sourceVariant.Modifier)
	if err != nil {
		return nil, err
	}
	return cloneProjectObject(newVariantModifier), nil
}

func (p *Project) cloneSectionVariantCodeObjectVariants(
	clonedVariantModifier map[string]any,
	sectionPayload map[string]any,
) error {
	sourceCodeObjVariantMap := payloadStringMapField(sectionPayload, "codeObjVariantMap")
	if len(sourceCodeObjVariantMap) == 0 {
		return nil
	}

	clonedCodeObjVariantMap := make(map[string]string, len(sourceCodeObjVariantMap))
	for codeObjID, sourceCodeObjVariantID := range sourceCodeObjVariantMap {
		newCodeObjVariantID, err := p.createNewCodeObjectVariant(codeObjID, sourceCodeObjVariantID)
		if err != nil {
			return err
		}
		clonedCodeObjVariantMap[codeObjID] = newCodeObjVariantID
	}
	clonedVariantModifier["codeObjVariantMap"] = clonedCodeObjVariantMap
	return nil
}

func (p *Project) storeCreatedSectionVariant(section Section, newVariant SectionVariant) {
	section.VariantIDs = append(section.VariantIDs, newVariant.ID)
	p.Sections[section.ID] = section
	p.SectionVariants[newVariant.ID] = newVariant
	p.SectionVariantMap[section.ID] = newVariant.ID
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
	source, err := p.loadCodeObjectVariantCreationSource(codeObjID, sourceVariantID)
	if err != nil {
		return "", err
	}
	newVariant, err := p.buildCreatedCodeObjectVariant(source)
	if err != nil {
		return "", err
	}
	p.storeCreatedCodeObjectVariant(source.codeObj, newVariant)
	return newVariant.ID, nil
}

func (p *Project) loadCodeObjectVariantCreationSource(
	codeObjID string,
	sourceVariantID string,
) (codeObjectVariantCreationSource, error) {
	trimmedCodeObjID := strings.TrimSpace(codeObjID)
	if trimmedCodeObjID == "" {
		return codeObjectVariantCreationSource{}, ErrCodeObjIDRequired
	}
	trimmedVariantID := strings.TrimSpace(sourceVariantID)
	if trimmedVariantID == "" {
		return codeObjectVariantCreationSource{}, ErrCodeObjVariantIDRequired
	}

	codeObj, ok := p.CodeObjs[trimmedCodeObjID]
	if !ok {
		return codeObjectVariantCreationSource{}, fmt.Errorf("%w: %q", ErrCodeObjNotFound, trimmedCodeObjID)
	}
	if !containsString(codeObj.VariantIDs, trimmedVariantID) {
		return codeObjectVariantCreationSource{}, fmt.Errorf(
			"%w: codeObj=%q variant=%q",
			ErrCodeObjVariantMembership,
			trimmedCodeObjID,
			trimmedVariantID,
		)
	}

	variant, ok := p.CodeObjVariants[trimmedVariantID]
	if !ok {
		return codeObjectVariantCreationSource{}, fmt.Errorf("%w: %q", ErrCodeObjVariantNotFound, trimmedVariantID)
	}
	impl, ok := p.CodeObjImpls[variant.ImplID]
	if !ok {
		return codeObjectVariantCreationSource{}, fmt.Errorf("%w: %q", ErrCodeObjImplNotFound, variant.ImplID)
	}

	return codeObjectVariantCreationSource{
		codeObj: codeObj,
		variant: variant,
		impl:    impl,
	}, nil
}

func (p *Project) buildCreatedCodeObjectVariant(source codeObjectVariantCreationSource) (CodeObjectVariant, error) {
	newVariantID, err := newProjectStateID()
	if err != nil {
		return CodeObjectVariant{}, err
	}
	newVariant := CodeObjectVariant{ID: newVariantID}
	if err := p.assignCreatedCodeObjectVariantImpl(&newVariant, source.impl); err != nil {
		return CodeObjectVariant{}, err
	}
	if err := populateCreatedCodeObjectVariantModifier(&newVariant, source.variant); err != nil {
		return CodeObjectVariant{}, err
	}
	return newVariant, nil
}

func (p *Project) assignCreatedCodeObjectVariantImpl(
	newVariant *CodeObjectVariant,
	sourceImpl CodeObjectImpl,
) error {
	if codeObjImplIsPreset(sourceImpl) {
		newVariant.ImplID = sourceImpl.ID
		return nil
	}

	clonedImpl, err := cloneCodeObjectImplForVariant(sourceImpl)
	if err != nil {
		return err
	}
	newVariant.ImplID = clonedImpl.ID
	newVariant.NonPresetImplIDs = []string{clonedImpl.ID}
	p.CodeObjImpls[clonedImpl.ID] = clonedImpl
	return nil
}

func populateCreatedCodeObjectVariantModifier(
	newVariant *CodeObjectVariant,
	sourceVariant CodeObjectVariant,
) error {
	clonedVariantModifier, err := cloneCodeObjectVariantModifier(sourceVariant)
	if err != nil {
		return err
	}
	if len(clonedVariantModifier) == 0 {
		return nil
	}

	rawModifier, err := marshalProjectObject(clonedVariantModifier)
	if err != nil {
		return err
	}
	newVariant.Modifier = rawModifier
	return nil
}

func cloneCodeObjectVariantModifier(sourceVariant CodeObjectVariant) (map[string]any, error) {
	newVariantModifier, err := rawObjectFromProjectPayload(sourceVariant.Modifier)
	if err != nil {
		return nil, err
	}
	return cloneProjectObject(newVariantModifier), nil
}

func (p *Project) storeCreatedCodeObjectVariant(codeObj CodeObject, newVariant CodeObjectVariant) {
	codeObj.VariantIDs = append(codeObj.VariantIDs, newVariant.ID)
	p.CodeObjs[codeObj.ID] = codeObj
	p.CodeObjVariants[newVariant.ID] = newVariant
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
		plan := newSectionVariantEdgeClonePlan(
			edge,
			sectionID,
			sourceVariantID,
			sourceOutputPortIDs,
			targetInputPortIDs,
		)
		if !plan.shouldClone {
			continue
		}

		clonedEdge, err := cloneEdgeForNewSectionVariant(edge, newVariantID, plan)
		if err != nil {
			return err
		}
		newEdges = append(newEdges, clonedEdge)
	}

	if len(newEdges) != 0 {
		p.Edges = append(p.Edges, newEdges...)
	}
	return nil
}

func newSectionVariantEdgeClonePlan(
	edge Edge,
	sectionID string,
	sourceVariantID string,
	sourceOutputPortIDs map[string]struct{},
	targetInputPortIDs map[string]struct{},
) sectionVariantEdgeClonePlan {
	plan := sectionVariantEdgeClonePlan{
		updateSource: edge.SourceSectionID == sectionID && edge.SourceVariantID == sourceVariantID,
		updateTarget: edge.TargetSectionID == sectionID && edge.TargetVariantID == sourceVariantID,
	}
	if !plan.updateSource && !plan.updateTarget {
		return sectionVariantEdgeClonePlan{}
	}
	if plan.updateSource {
		if _, ok := sourceOutputPortIDs[edge.SourcePortID]; !ok {
			return sectionVariantEdgeClonePlan{}
		}
	}
	if plan.updateTarget {
		if _, ok := targetInputPortIDs[edge.TargetPortID]; !ok {
			return sectionVariantEdgeClonePlan{}
		}
	}
	plan.shouldClone = true
	return plan
}

func cloneEdgeForNewSectionVariant(
	edge Edge,
	newVariantID string,
	plan sectionVariantEdgeClonePlan,
) (Edge, error) {
	newEdgeID, err := newProjectStateID()
	if err != nil {
		return Edge{}, err
	}
	clonedEdge := edge.Clone()
	clonedEdge.ID = newEdgeID
	if plan.updateSource {
		clonedEdge.SourceVariantID = newVariantID
	}
	if plan.updateTarget {
		clonedEdge.TargetVariantID = newVariantID
	}
	return clonedEdge, nil
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
