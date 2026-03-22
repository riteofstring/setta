package projectstate

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrEdgeIDRequired                 = errors.New("edge id is required")
	ErrEdgeNotFound                   = errors.New("edge was not found in project")
	ErrEdgeDuplicateID                = errors.New("edge id already exists in project")
	ErrEdgeEndpointSectionUnsupported = errors.New("edge endpoint section type is unsupported")
	ErrEdgeSourcePortNotFound         = errors.New("edge source port was not found")
	ErrEdgeTargetPortNotFound         = errors.New("edge target port was not found")
	ErrEdgeExpressionBuilderRequired  = errors.New("edge expression builder is required")
	ErrAgenticEdgeNotFound            = errors.New("agentic edge was not found in project")
	ErrAgenticEdgeDuplicateID         = errors.New("agentic edge id already exists in project")
	ErrAgenticEdgeKindInvalid         = errors.New("agentic edge kind is invalid")
	ErrAgenticEdgeContextModeInvalid  = errors.New("agentic edge context mode is invalid")
	ErrAgenticEdgeSourceSectionType   = errors.New("agentic edge source section type is invalid")
	ErrAgenticEdgeTargetSectionType   = errors.New("agentic edge target section type is invalid")
)

type EdgeExpressionBuilder interface {
	Build(project Project, edge Edge) (string, error)
}

type EdgeExpressionBuilderFunc func(project Project, edge Edge) (string, error)

func (f EdgeExpressionBuilderFunc) Build(project Project, edge Edge) (string, error) {
	if f == nil {
		return "", ErrEdgeExpressionBuilderRequired
	}
	return f(project, edge)
}

func (d *Document) CreateEdge(projectID string, edge Edge, builder EdgeExpressionBuilder) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if _, err := project.CreateEdge(edge, builder); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) CreateEdge(
	ctx context.Context,
	projectID string,
	edge Edge,
	builder EdgeExpressionBuilder,
) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}

	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.CreateEdge(projectID, edge, builder); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) CreateEdge(edge Edge, builder EdgeExpressionBuilder) (Edge, error) {
	if p == nil {
		return Edge{}, ErrProjectNotFound
	}

	normalized, err := normalizeEdgeForCreate(edge)
	if err != nil {
		return Edge{}, err
	}
	if err := p.validateEdgeEndpoints(normalized); err != nil {
		return Edge{}, err
	}
	for _, existing := range p.Edges {
		if existing.ID == normalized.ID {
			return Edge{}, fmt.Errorf("%w: %q", ErrEdgeDuplicateID, normalized.ID)
		}
	}

	p.Edges = append(p.Edges, normalized)
	if err := p.applyEdgeExpression(normalized, builder); err != nil {
		return Edge{}, err
	}
	return normalized, nil
}

func (d *Document) UpdateEdge(projectID string, edge Edge) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.UpdateEdge(edge); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) UpdateEdge(ctx context.Context, projectID string, edge Edge) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}

	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.UpdateEdge(projectID, edge); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) UpdateEdge(edge Edge) error {
	if p == nil {
		return ErrProjectNotFound
	}

	normalized, err := normalizeEdgeForUpdate(edge)
	if err != nil {
		return err
	}
	if err := p.validateEdgeEndpoints(normalized); err != nil {
		return err
	}

	for index, existing := range p.Edges {
		if existing.ID != normalized.ID {
			continue
		}
		p.Edges[index] = normalized
		return nil
	}
	return fmt.Errorf("%w: %q", ErrEdgeNotFound, normalized.ID)
}

func (d *Document) DeleteEdges(projectID string, edgeIDs []string) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.DeleteEdges(edgeIDs); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) DeleteEdges(ctx context.Context, projectID string, edgeIDs []string) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}

	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.DeleteEdges(projectID, edgeIDs); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) DeleteEdges(edgeIDs []string) error {
	if p == nil {
		return ErrProjectNotFound
	}

	normalized := dedupeTrimmedIDs(edgeIDs)
	known := make(map[string]struct{}, len(p.Edges))
	for _, edge := range p.Edges {
		known[edge.ID] = struct{}{}
	}
	for _, edgeID := range normalized {
		if _, ok := known[edgeID]; ok {
			continue
		}
		return fmt.Errorf("%w: %q", ErrEdgeNotFound, edgeID)
	}

	removed := make(map[string]struct{}, len(normalized))
	for _, edgeID := range normalized {
		removed[edgeID] = struct{}{}
	}

	remaining := make([]Edge, 0, len(p.Edges))
	removedEdges := make([]Edge, 0, len(normalized))
	for _, edge := range p.Edges {
		if _, ok := removed[edge.ID]; ok {
			removedEdges = append(removedEdges, edge)
			continue
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

func (d *Document) ReconnectEdge(
	projectID string,
	edgeID string,
	sourceSectionID string,
	sourceVariantID string,
	sourcePortID string,
	targetSectionID string,
	targetVariantID string,
	targetPortID string,
	builder EdgeExpressionBuilder,
) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.ReconnectEdge(
		edgeID,
		sourceSectionID,
		sourceVariantID,
		sourcePortID,
		targetSectionID,
		targetVariantID,
		targetPortID,
		builder,
	); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) ReconnectEdge(
	ctx context.Context,
	projectID string,
	edgeID string,
	sourceSectionID string,
	sourceVariantID string,
	sourcePortID string,
	targetSectionID string,
	targetVariantID string,
	targetPortID string,
	builder EdgeExpressionBuilder,
) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}

	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.ReconnectEdge(
			projectID,
			edgeID,
			sourceSectionID,
			sourceVariantID,
			sourcePortID,
			targetSectionID,
			targetVariantID,
			targetPortID,
			builder,
		); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) ReconnectEdge(
	edgeID string,
	sourceSectionID string,
	sourceVariantID string,
	sourcePortID string,
	targetSectionID string,
	targetVariantID string,
	targetPortID string,
	builder EdgeExpressionBuilder,
) error {
	if p == nil {
		return ErrProjectNotFound
	}

	trimmedEdgeID := strings.TrimSpace(edgeID)
	if trimmedEdgeID == "" {
		return ErrEdgeIDRequired
	}
	reconnected, err := normalizeEdgeForUpdate(Edge{
		ID:              trimmedEdgeID,
		SourceSectionID: sourceSectionID,
		SourceVariantID: sourceVariantID,
		SourcePortID:    sourcePortID,
		TargetSectionID: targetSectionID,
		TargetVariantID: targetVariantID,
		TargetPortID:    targetPortID,
	})
	if err != nil {
		return err
	}
	if err := p.validateEdgeEndpoints(reconnected); err != nil {
		return err
	}

	for index, existing := range p.Edges {
		if existing.ID != trimmedEdgeID {
			continue
		}

		targetChanged := existing.TargetSectionID != reconnected.TargetSectionID ||
			existing.TargetVariantID != reconnected.TargetVariantID ||
			existing.TargetPortID != reconnected.TargetPortID
		p.Edges[index] = Edge{
			ID:              trimmedEdgeID,
			SourceSectionID: reconnected.SourceSectionID,
			SourceVariantID: reconnected.SourceVariantID,
			SourcePortID:    reconnected.SourcePortID,
			TargetSectionID: reconnected.TargetSectionID,
			TargetVariantID: reconnected.TargetVariantID,
			TargetPortID:    reconnected.TargetPortID,
			Type:            existing.Type,
			Label:           cloneStringPointer(existing.Label),
			Style:           cloneRawJSON(existing.Style),
			Animated:        existing.Animated,
			Hidden:          existing.Hidden,
			ZIndex:          existing.ZIndex,
			Data:            cloneRawJSON(existing.Data),
			Selected:        existing.Selected,
		}

		if targetChanged {
			if err := p.maybeClearEdgeTargetValue(existing); err != nil {
				return err
			}
		}
		return p.applyEdgeExpression(p.Edges[index], builder)
	}
	return fmt.Errorf("%w: %q", ErrEdgeNotFound, trimmedEdgeID)
}

func (d *Document) SetEdges(projectID string, edges []Edge) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetEdges(edges); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetEdges(ctx context.Context, projectID string, edges []Edge) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}

	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetEdges(projectID, edges); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetEdges(edges []Edge) error {
	if p == nil {
		return ErrProjectNotFound
	}

	normalized := make([]Edge, 0, len(edges))
	seen := make(map[string]struct{}, len(edges))
	for _, edge := range edges {
		next, err := normalizeEdgeForUpdate(edge)
		if err != nil {
			return err
		}
		if _, ok := seen[next.ID]; ok {
			return fmt.Errorf("%w: %q", ErrEdgeDuplicateID, next.ID)
		}
		if err := p.validateEdgeEndpoints(next); err != nil {
			return err
		}
		seen[next.ID] = struct{}{}
		normalized = append(normalized, next)
	}

	removedEdges := make([]Edge, 0, len(p.Edges))
	for _, edge := range p.Edges {
		if _, ok := seen[edge.ID]; ok {
			continue
		}
		removedEdges = append(removedEdges, edge)
	}
	p.Edges = normalized

	for _, edge := range removedEdges {
		if err := p.maybeClearEdgeTargetValue(edge); err != nil {
			return err
		}
	}
	return nil
}

func (d *Document) CreateAgenticEdge(projectID string, edge AgenticEdge) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if _, err := project.CreateAgenticEdge(edge); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) CreateAgenticEdge(ctx context.Context, projectID string, edge AgenticEdge) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}

	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.CreateAgenticEdge(projectID, edge); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) CreateAgenticEdge(edge AgenticEdge) (AgenticEdge, error) {
	if p == nil {
		return AgenticEdge{}, ErrProjectNotFound
	}

	normalized, err := normalizeAgenticEdgeForCreate(edge)
	if err != nil {
		return AgenticEdge{}, err
	}
	if err := p.validateAgenticEdgeEndpoints(normalized); err != nil {
		return AgenticEdge{}, err
	}
	for _, existing := range p.AgenticEdges {
		if existing.ID == normalized.ID {
			return AgenticEdge{}, fmt.Errorf("%w: %q", ErrAgenticEdgeDuplicateID, normalized.ID)
		}
	}
	p.AgenticEdges = append(p.AgenticEdges, normalized)
	return normalized, nil
}

func (d *Document) UpdateAgenticEdge(projectID string, edge AgenticEdge) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.UpdateAgenticEdge(edge); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) UpdateAgenticEdge(ctx context.Context, projectID string, edge AgenticEdge) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}

	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.UpdateAgenticEdge(projectID, edge); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) UpdateAgenticEdge(edge AgenticEdge) error {
	if p == nil {
		return ErrProjectNotFound
	}

	normalized, err := normalizeAgenticEdgeForUpdate(edge)
	if err != nil {
		return err
	}
	if err := p.validateAgenticEdgeEndpoints(normalized); err != nil {
		return err
	}
	for index, existing := range p.AgenticEdges {
		if existing.ID != normalized.ID {
			continue
		}
		p.AgenticEdges[index] = normalized
		return nil
	}
	return fmt.Errorf("%w: %q", ErrAgenticEdgeNotFound, normalized.ID)
}

func (d *Document) DeleteAgenticEdges(projectID string, edgeIDs []string) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.DeleteAgenticEdges(edgeIDs); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) DeleteAgenticEdges(ctx context.Context, projectID string, edgeIDs []string) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}

	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.DeleteAgenticEdges(projectID, edgeIDs); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) DeleteAgenticEdges(edgeIDs []string) error {
	if p == nil {
		return ErrProjectNotFound
	}

	normalized := dedupeTrimmedIDs(edgeIDs)
	known := make(map[string]struct{}, len(p.AgenticEdges))
	for _, edge := range p.AgenticEdges {
		known[edge.ID] = struct{}{}
	}
	for _, edgeID := range normalized {
		if _, ok := known[edgeID]; ok {
			continue
		}
		return fmt.Errorf("%w: %q", ErrAgenticEdgeNotFound, edgeID)
	}

	removed := make(map[string]struct{}, len(normalized))
	for _, edgeID := range normalized {
		removed[edgeID] = struct{}{}
	}

	remaining := make([]AgenticEdge, 0, len(p.AgenticEdges))
	for _, edge := range p.AgenticEdges {
		if _, ok := removed[edge.ID]; ok {
			continue
		}
		remaining = append(remaining, edge)
	}
	p.AgenticEdges = remaining
	return nil
}

func (d *Document) SetAgenticEdges(projectID string, edges []AgenticEdge) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetAgenticEdges(edges); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetAgenticEdges(ctx context.Context, projectID string, edges []AgenticEdge) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}

	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetAgenticEdges(projectID, edges); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetAgenticEdges(edges []AgenticEdge) error {
	if p == nil {
		return ErrProjectNotFound
	}

	normalized := make([]AgenticEdge, 0, len(edges))
	seen := make(map[string]struct{}, len(edges))
	for _, edge := range edges {
		next, err := normalizeAgenticEdgeForUpdate(edge)
		if err != nil {
			return err
		}
		if _, ok := seen[next.ID]; ok {
			return fmt.Errorf("%w: %q", ErrAgenticEdgeDuplicateID, next.ID)
		}
		if err := p.validateAgenticEdgeEndpoints(next); err != nil {
			return err
		}
		seen[next.ID] = struct{}{}
		normalized = append(normalized, next)
	}
	p.AgenticEdges = normalized
	return nil
}

func (p *Project) pruneInvalidAgenticEdges() error {
	if p == nil || len(p.AgenticEdges) == 0 {
		return nil
	}

	remaining := make([]AgenticEdge, 0, len(p.AgenticEdges))
	for _, edge := range p.AgenticEdges {
		if err := p.validateAgenticEdgeEndpoints(edge); err != nil {
			if errors.Is(err, ErrSectionNotFound) ||
				errors.Is(err, ErrAgenticEdgeSourceSectionType) ||
				errors.Is(err, ErrAgenticEdgeTargetSectionType) {
				continue
			}
			return err
		}
		remaining = append(remaining, edge)
	}
	p.AgenticEdges = remaining
	return nil
}

func (p *Project) applyEdgeExpression(edge Edge, builder EdgeExpressionBuilder) error {
	if builder == nil {
		return ErrEdgeExpressionBuilderRequired
	}
	expression, err := builder.Build(*p, edge)
	if err != nil {
		return err
	}
	return p.SetSectionCodeObjectValue(edge.TargetSectionID, edge.TargetPortID, expression)
}

func (p *Project) validateEdgeEndpoints(edge Edge) error {
	sourceSection, _, sourcePayload, err := p.resolveEdgeEndpointSection(edge.SourceSectionID, edge.SourceVariantID)
	if err != nil {
		return err
	}
	targetSection, _, targetPayload, err := p.resolveEdgeEndpointSection(edge.TargetSectionID, edge.TargetVariantID)
	if err != nil {
		return err
	}

	if _, ok := payloadEdgeOutputPortIDs(sourcePayload)[edge.SourcePortID]; !ok {
		return fmt.Errorf(
			"%w: section=%q port=%q",
			ErrEdgeSourcePortNotFound,
			sourceSection.ID,
			edge.SourcePortID,
		)
	}
	if _, ok := stringSetFromSlice(payloadStringArrayField(targetPayload, "edgeInputParams"))[edge.TargetPortID]; !ok {
		return fmt.Errorf(
			"%w: section=%q port=%q",
			ErrEdgeTargetPortNotFound,
			targetSection.ID,
			edge.TargetPortID,
		)
	}
	return nil
}

func (p *Project) resolveEdgeEndpointSection(sectionID string, variantID string) (Section, SectionVariant, map[string]any, error) {
	section, variant, impl, err := p.ResolveSectionWithVariant(sectionID, variantID)
	if err != nil {
		return Section{}, SectionVariant{}, nil, err
	}
	payload, err := effectiveSectionPayload(*p, section.ID, variant.ID)
	if err != nil {
		return Section{}, SectionVariant{}, nil, err
	}
	sectionType := canonicalSectionType(payloadStringField(payload, "type"), impl)
	if !sectionTypeSupportsParamPresentation(sectionType) {
		return Section{}, SectionVariant{}, nil, fmt.Errorf(
			"%w: section=%q type=%q",
			ErrEdgeEndpointSectionUnsupported,
			section.ID,
			sectionType,
		)
	}
	return section, variant, payload, nil
}

func (p *Project) validateAgenticEdgeEndpoints(edge AgenticEdge) error {
	if _, ok := p.Sections[edge.SourceSectionID]; !ok {
		return fmt.Errorf("%w: %q", ErrSectionNotFound, edge.SourceSectionID)
	}
	if _, ok := p.Sections[edge.TargetSectionID]; !ok {
		return fmt.Errorf("%w: %q", ErrSectionNotFound, edge.TargetSectionID)
	}

	kind, err := normalizeAgenticEdgeKind(edge.Kind)
	if err != nil {
		return err
	}
	sourceType, err := p.resolveCurrentSectionPresentationType(edge.SourceSectionID)
	if err != nil {
		return err
	}
	targetType, err := p.resolveCurrentSectionPresentationType(edge.TargetSectionID)
	if err != nil {
		return err
	}

	if kind == "chat_chat" || kind == "chat_section" {
		if sourceType != "Chat" {
			return fmt.Errorf("%w: section=%q type=%q", ErrAgenticEdgeSourceSectionType, edge.SourceSectionID, sourceType)
		}
	}
	if kind == "chat_chat" || kind == "section_chat" {
		if targetType != "Chat" {
			return fmt.Errorf("%w: section=%q type=%q", ErrAgenticEdgeTargetSectionType, edge.TargetSectionID, targetType)
		}
	}
	return nil
}

func normalizeEdgeForCreate(edge Edge) (Edge, error) {
	normalized := edge.Clone()
	if strings.TrimSpace(normalized.ID) == "" {
		generatedID, err := newProjectGraphEdgeID()
		if err != nil {
			return Edge{}, err
		}
		normalized.ID = generatedID
	}
	return normalizeEdgeForUpdate(normalized)
}

func normalizeEdgeForUpdate(edge Edge) (Edge, error) {
	normalized := edge.Clone()
	normalized.ID = strings.TrimSpace(normalized.ID)
	if normalized.ID == "" {
		return Edge{}, ErrEdgeIDRequired
	}
	normalized.SourceSectionID = strings.TrimSpace(normalized.SourceSectionID)
	normalized.SourceVariantID = strings.TrimSpace(normalized.SourceVariantID)
	normalized.SourcePortID = strings.TrimSpace(normalized.SourcePortID)
	normalized.TargetSectionID = strings.TrimSpace(normalized.TargetSectionID)
	normalized.TargetVariantID = strings.TrimSpace(normalized.TargetVariantID)
	normalized.TargetPortID = strings.TrimSpace(normalized.TargetPortID)
	if normalized.SourceSectionID == "" || normalized.TargetSectionID == "" {
		return Edge{}, ErrSectionIDRequired
	}
	if normalized.SourceVariantID == "" || normalized.TargetVariantID == "" {
		return Edge{}, ErrSectionVariantIDRequired
	}
	if normalized.SourcePortID == "" || normalized.TargetPortID == "" {
		return Edge{}, ErrCodeObjIDRequired
	}
	normalized.Type = strings.TrimSpace(normalized.Type)
	if normalized.Type == "" {
		normalized.Type = "default"
	}
	normalized.Label = normalizeOptionalStringPointer(normalized.Label)
	var err error
	normalized.Style, err = normalizeRawJSON(normalized.Style, fmt.Sprintf("edge %q style", normalized.ID))
	if err != nil {
		return Edge{}, err
	}
	normalized.Data, err = normalizeRawJSON(normalized.Data, fmt.Sprintf("edge %q data", normalized.ID))
	if err != nil {
		return Edge{}, err
	}
	return normalized, nil
}

func normalizeAgenticEdgeForCreate(edge AgenticEdge) (AgenticEdge, error) {
	normalized := edge.Clone()
	if strings.TrimSpace(normalized.ID) == "" {
		generatedID, err := newProjectGraphEdgeID()
		if err != nil {
			return AgenticEdge{}, err
		}
		normalized.ID = generatedID
	}
	return normalizeAgenticEdgeForUpdate(normalized)
}

func normalizeAgenticEdgeForUpdate(edge AgenticEdge) (AgenticEdge, error) {
	normalized := edge.Clone()
	normalized.ID = strings.TrimSpace(normalized.ID)
	if normalized.ID == "" {
		return AgenticEdge{}, ErrEdgeIDRequired
	}
	normalized.SourceSectionID = strings.TrimSpace(normalized.SourceSectionID)
	normalized.TargetSectionID = strings.TrimSpace(normalized.TargetSectionID)
	if normalized.SourceSectionID == "" || normalized.TargetSectionID == "" {
		return AgenticEdge{}, ErrSectionIDRequired
	}
	kind, err := normalizeAgenticEdgeKind(normalized.Kind)
	if err != nil {
		return AgenticEdge{}, err
	}
	contextMode, err := normalizeAgenticEdgeContextMode(normalized.ContextMode)
	if err != nil {
		return AgenticEdge{}, err
	}
	normalized.Kind = kind
	normalized.ContextMode = contextMode
	normalized.Style, err = normalizeRawJSON(normalized.Style, fmt.Sprintf("agentic edge %q style", normalized.ID))
	if err != nil {
		return AgenticEdge{}, err
	}
	return normalized, nil
}

func normalizeAgenticEdgeKind(value string) (string, error) {
	switch trimmed := strings.TrimSpace(value); trimmed {
	case "chat_chat", "section_chat", "chat_section":
		return trimmed, nil
	default:
		return "", fmt.Errorf("%w: %q", ErrAgenticEdgeKindInvalid, trimmed)
	}
}

func normalizeAgenticEdgeContextMode(value string) (string, error) {
	switch trimmed := strings.TrimSpace(value); trimmed {
	case "", "reference_only":
		return "reference_only", nil
	case "inline_text", "summary":
		return trimmed, nil
	default:
		return "", fmt.Errorf("%w: %q", ErrAgenticEdgeContextModeInvalid, trimmed)
	}
}

func normalizeOptionalStringPointer(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	output := trimmed
	return &output
}

func dedupeTrimmedIDs(values []string) []string {
	normalized := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		normalized = append(normalized, trimmed)
	}
	return normalized
}

func newProjectGraphEdgeID() (string, error) {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return hex.EncodeToString(buffer), nil
}
