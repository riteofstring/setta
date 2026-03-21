package projectstate

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrSectionEdgeIOUnsupported         = errors.New("section does not support edge inputs or outputs")
	ErrSectionEdgeInputParamUnsupported = errors.New("edge input target is not a parameter")
)

func (d *Document) SetSectionEdgeInputs(projectID string, sectionID string, edgeInputParams []string) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetSectionEdgeInputs(sectionID, edgeInputParams); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetSectionEdgeInputs(
	ctx context.Context,
	projectID string,
	sectionID string,
	edgeInputParams []string,
) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}

	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetSectionEdgeInputs(projectID, sectionID, edgeInputParams); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetSectionEdgeInputs(sectionID string, edgeInputParams []string) error {
	if p == nil {
		return ErrProjectNotFound
	}

	trimmedSectionID := strings.TrimSpace(sectionID)
	_, _, payload, err := p.resolveSectionEdgeMutationState(trimmedSectionID)
	if err != nil {
		return err
	}

	normalized, err := p.normalizeSectionEdgeInputs(trimmedSectionID, edgeInputParams)
	if err != nil {
		return err
	}

	currentEdgeInputs := payloadStringArrayField(payload, "edgeInputParams")
	currentEdgeInputSet := stringSetFromSlice(currentEdgeInputs)
	nextEdgeInputSet := stringSetFromSlice(normalized)

	for _, paramInfoID := range normalized {
		if _, ok := currentEdgeInputSet[paramInfoID]; ok {
			continue
		}

		paramPayload, _, _, paramImpl, err := p.ResolveSectionCodeObject(trimmedSectionID, paramInfoID)
		if err != nil {
			return err
		}
		if effectiveCodeObjType(paramPayload, paramImpl) == codeParamType {
			continue
		}
		if err := p.ChangeParamImpl(trimmedSectionID, paramInfoID, codeParamType); err != nil {
			return err
		}
	}

	removedPorts := map[string]struct{}{}
	for _, paramInfoID := range currentEdgeInputs {
		if _, ok := nextEdgeInputSet[paramInfoID]; ok {
			continue
		}
		removedPorts[paramInfoID] = struct{}{}
	}
	if err := p.removeDeletedParamEdgeTargets(trimmedSectionID, removedPorts); err != nil {
		return err
	}

	if stringSlicesEqual(currentEdgeInputs, normalized) {
		return nil
	}
	return p.setCurrentSectionField(trimmedSectionID, "edgeInputParams", append([]string(nil), normalized...))
}

func (d *Document) SetSectionEdgeOutputs(
	projectID string,
	sectionID string,
	edgeOutputPorts []EdgePort,
	builder EdgeExpressionBuilder,
) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetSectionEdgeOutputs(sectionID, edgeOutputPorts, builder); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetSectionEdgeOutputs(
	ctx context.Context,
	projectID string,
	sectionID string,
	edgeOutputPorts []EdgePort,
	builder EdgeExpressionBuilder,
) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}

	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetSectionEdgeOutputs(projectID, sectionID, edgeOutputPorts, builder); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetSectionEdgeOutputs(sectionID string, edgeOutputPorts []EdgePort, builder EdgeExpressionBuilder) error {
	if p == nil {
		return ErrProjectNotFound
	}

	trimmedSectionID := strings.TrimSpace(sectionID)
	_, variant, payload, err := p.resolveSectionEdgeMutationState(trimmedSectionID)
	if err != nil {
		return err
	}

	normalized := normalizeSectionEdgeOutputs(edgeOutputPorts)
	currentEdgeOutputs := payloadEdgeOutputPorts(payload)
	changedPorts := changedSectionEdgeOutputAccessors(currentEdgeOutputs, normalized)
	currentEdgeOutputIDs := payloadEdgeOutputPortIDs(payload)
	nextEdgeOutputIDs := make(map[string]struct{}, len(normalized))
	for _, port := range normalized {
		nextEdgeOutputIDs[port.ID] = struct{}{}
	}

	removedPorts := map[string]struct{}{}
	for portID := range currentEdgeOutputIDs {
		if _, ok := nextEdgeOutputIDs[portID]; ok {
			continue
		}
		removedPorts[portID] = struct{}{}
	}
	if err := p.removeDeletedEdgeOutputSources(trimmedSectionID, variant.ID, removedPorts); err != nil {
		return err
	}

	if !edgePortsEqual(currentEdgeOutputs, normalized) {
		if err := p.setCurrentSectionField(trimmedSectionID, "edgeOutputPorts", edgeOutputPortsPayloadValue(normalized)); err != nil {
			return err
		}
	}
	return p.reapplyChangedEdgeOutputSources(trimmedSectionID, variant.ID, changedPorts, builder)
}

func (p Project) resolveSectionEdgeMutationState(sectionID string) (Section, SectionVariant, map[string]any, error) {
	section, variant, impl, err := p.ResolveSection(sectionID)
	if err != nil {
		return Section{}, SectionVariant{}, nil, err
	}
	payload, err := effectiveSectionPayload(p, section.ID, variant.ID)
	if err != nil {
		return Section{}, SectionVariant{}, nil, err
	}
	sectionType := canonicalSectionType(payloadStringField(payload, "type"), impl)
	if !sectionTypeSupportsParamPresentation(sectionType) {
		return Section{}, SectionVariant{}, nil, fmt.Errorf(
			"%w: section=%q type=%q",
			ErrSectionEdgeIOUnsupported,
			sectionID,
			sectionType,
		)
	}
	return section, variant, payload, nil
}

func (p *Project) normalizeSectionEdgeInputs(sectionID string, edgeInputParams []string) ([]string, error) {
	normalized := make([]string, 0, len(edgeInputParams))
	seen := make(map[string]struct{}, len(edgeInputParams))
	for _, rawParamInfoID := range edgeInputParams {
		paramInfoID := strings.TrimSpace(rawParamInfoID)
		if paramInfoID == "" {
			return nil, ErrCodeObjIDRequired
		}
		if _, ok := seen[paramInfoID]; ok {
			continue
		}
		if _, ok := p.CodeObjs[paramInfoID]; !ok {
			return nil, fmt.Errorf("%w: %q", ErrCodeObjNotFound, paramInfoID)
		}

		paramPayload, _, _, paramImpl, err := p.ResolveSectionCodeObject(sectionID, paramInfoID)
		if err != nil {
			return nil, err
		}
		paramType := effectiveCodeObjType(paramPayload, paramImpl)
		if !isParamCodeObjectType(paramType) {
			return nil, fmt.Errorf(
				"%w: codeObj=%q type=%q",
				ErrSectionEdgeInputParamUnsupported,
				paramInfoID,
				paramType,
			)
		}

		seen[paramInfoID] = struct{}{}
		normalized = append(normalized, paramInfoID)
	}
	return normalized, nil
}

func normalizeSectionEdgeOutputs(edgeOutputPorts []EdgePort) []EdgePort {
	normalized := make([]EdgePort, 0, len(edgeOutputPorts))
	seen := make(map[string]struct{}, len(edgeOutputPorts))
	for _, port := range edgeOutputPorts {
		portID := strings.TrimSpace(port.ID)
		if _, ok := seen[portID]; ok {
			continue
		}
		seen[portID] = struct{}{}
		normalized = append(normalized, EdgePort{
			ID:       portID,
			Accessor: strings.TrimSpace(port.Accessor),
		})
	}
	return normalized
}

func edgePortsEqual(left []EdgePort, right []EdgePort) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func changedSectionEdgeOutputAccessors(current []EdgePort, next []EdgePort) map[string]struct{} {
	if len(current) == 0 || len(next) == 0 {
		return nil
	}

	currentAccessors := make(map[string]string, len(current))
	for _, port := range current {
		currentAccessors[port.ID] = port.Accessor
	}

	changed := make(map[string]struct{})
	for _, port := range next {
		accessor, ok := currentAccessors[port.ID]
		if !ok || accessor == port.Accessor {
			continue
		}
		changed[port.ID] = struct{}{}
	}
	if len(changed) == 0 {
		return nil
	}
	return changed
}

func edgeOutputPortsPayloadValue(edgeOutputPorts []EdgePort) []any {
	if len(edgeOutputPorts) == 0 {
		return []any{}
	}
	output := make([]any, 0, len(edgeOutputPorts))
	for _, port := range edgeOutputPorts {
		output = append(output, map[string]any{
			"id":       port.ID,
			"accessor": port.Accessor,
		})
	}
	return output
}

func (p *Project) removeDeletedEdgeOutputSources(sectionID string, variantID string, removedPorts map[string]struct{}) error {
	if p == nil || len(removedPorts) == 0 || len(p.Edges) == 0 {
		return nil
	}

	remaining := make([]Edge, 0, len(p.Edges))
	removedEdges := make([]Edge, 0, len(p.Edges))
	for _, edge := range p.Edges {
		if edge.SourceSectionID == sectionID && edge.SourceVariantID == variantID {
			if _, ok := removedPorts[edge.SourcePortID]; ok {
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

func (p *Project) reapplyChangedEdgeOutputSources(
	sectionID string,
	variantID string,
	changedPorts map[string]struct{},
	builder EdgeExpressionBuilder,
) error {
	if p == nil || len(changedPorts) == 0 || len(p.Edges) == 0 {
		return nil
	}

	reappliedAny := false
	for _, edge := range p.Edges {
		if edge.SourceSectionID != sectionID || edge.SourceVariantID != variantID {
			continue
		}
		if _, ok := changedPorts[edge.SourcePortID]; !ok {
			continue
		}
		if builder == nil {
			return ErrEdgeExpressionBuilderRequired
		}
		if err := p.applyEdgeExpression(edge, builder); err != nil {
			return err
		}
		reappliedAny = true
	}
	if !reappliedAny {
		return nil
	}
	return nil
}
