package projectstate

import (
	"context"
	"fmt"
)

func (d *Document) CreateStateMachineEdge(
	projectID string,
	edge StateMachineEdge,
	templates StateMachinePromptTemplateLookup,
) error {
	if d == nil {
		return ErrProjectNotFound
	}
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if _, err := project.CreateStateMachineEdge(edge, templates); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) CreateStateMachineEdge(
	ctx context.Context,
	projectID string,
	edge StateMachineEdge,
	templates StateMachinePromptTemplateLookup,
) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.CreateStateMachineEdge(projectID, edge, templates); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) CreateStateMachineEdge(
	edge StateMachineEdge,
	templates StateMachinePromptTemplateLookup,
) (StateMachineEdge, error) {
	if p == nil {
		return StateMachineEdge{}, ErrProjectNotFound
	}
	normalized, err := normalizeStateMachineEdgeForCreate(edge)
	if err != nil {
		return StateMachineEdge{}, err
	}
	for _, existing := range p.StateMachineEdges {
		if existing.ID == normalized.ID {
			return StateMachineEdge{}, fmt.Errorf("%w: %q", ErrStateMachineEdgeDuplicateID, normalized.ID)
		}
	}
	mergeReplacements, err := p.stateMachineGroupMergeReplacements(normalized)
	if err != nil {
		return StateMachineEdge{}, err
	}
	nextEdges := make([]StateMachineEdge, 0, len(p.StateMachineEdges)+1)
	for _, existing := range p.StateMachineEdges {
		if replacement, ok := mergeReplacements[existing.MachineGroupID]; ok {
			existing = existing.Clone()
			existing.MachineGroupID = replacement
		}
		nextEdges = append(nextEdges, existing)
	}
	nextEdges = append(nextEdges, normalized)
	if err := p.validateStateMachineEdges(
		nextEdges,
		p.stateMachineGroupMergeOverrides(mergeReplacements),
		templates,
	); err != nil {
		return StateMachineEdge{}, err
	}
	if err := p.applyStateMachineGroupMerge(mergeReplacements); err != nil {
		return StateMachineEdge{}, err
	}
	p.StateMachineEdges = append(p.StateMachineEdges, normalized)
	return normalized, nil
}

func (d *Document) UpdateStateMachineEdge(
	projectID string,
	edge StateMachineEdge,
	templates StateMachinePromptTemplateLookup,
) error {
	if d == nil {
		return ErrProjectNotFound
	}
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.UpdateStateMachineEdge(edge, templates); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) UpdateStateMachineEdge(
	ctx context.Context,
	projectID string,
	edge StateMachineEdge,
	templates StateMachinePromptTemplateLookup,
) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.UpdateStateMachineEdge(projectID, edge, templates); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) UpdateStateMachineEdge(
	edge StateMachineEdge,
	templates StateMachinePromptTemplateLookup,
) error {
	if p == nil {
		return ErrProjectNotFound
	}
	normalized, err := normalizeStateMachineEdgeForUpdate(edge)
	if err != nil {
		return err
	}
	for index, existing := range p.StateMachineEdges {
		if existing.ID != normalized.ID {
			continue
		}
		nextEdges := append([]StateMachineEdge(nil), p.StateMachineEdges...)
		nextEdges[index] = normalized
		if err := p.validateStateMachineEdges(nextEdges, nil, templates); err != nil {
			return err
		}
		p.StateMachineEdges[index] = normalized
		return nil
	}
	return fmt.Errorf("%w: %q", ErrStateMachineEdgeNotFound, normalized.ID)
}

func (d *Document) DeleteStateMachineEdges(projectID string, edgeIDs []string) error {
	if d == nil {
		return ErrProjectNotFound
	}
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.DeleteStateMachineEdges(edgeIDs); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) DeleteStateMachineEdges(
	ctx context.Context,
	projectID string,
	edgeIDs []string,
) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.DeleteStateMachineEdges(projectID, edgeIDs); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) DeleteStateMachineEdges(edgeIDs []string) error {
	if p == nil {
		return ErrProjectNotFound
	}
	normalizedIDs := dedupeTrimmedIDs(edgeIDs)
	known := make(map[string]struct{}, len(p.StateMachineEdges))
	for _, edge := range p.StateMachineEdges {
		known[edge.ID] = struct{}{}
	}
	for _, edgeID := range normalizedIDs {
		if _, ok := known[edgeID]; ok {
			continue
		}
		return fmt.Errorf("%w: %q", ErrStateMachineEdgeNotFound, edgeID)
	}
	removed := make(map[string]struct{}, len(normalizedIDs))
	for _, edgeID := range normalizedIDs {
		removed[edgeID] = struct{}{}
	}
	remaining := make([]StateMachineEdge, 0, len(p.StateMachineEdges))
	for _, edge := range p.StateMachineEdges {
		if _, ok := removed[edge.ID]; ok {
			continue
		}
		remaining = append(remaining, edge)
	}
	p.StateMachineEdges = remaining
	return nil
}

func (d *Document) SetStateMachineEdges(
	projectID string,
	edges []StateMachineEdge,
	templates StateMachinePromptTemplateLookup,
) error {
	if d == nil {
		return ErrProjectNotFound
	}
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetStateMachineEdges(edges, templates); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetStateMachineEdges(
	ctx context.Context,
	projectID string,
	edges []StateMachineEdge,
	templates StateMachinePromptTemplateLookup,
) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetStateMachineEdges(projectID, edges, templates); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetStateMachineEdges(
	edges []StateMachineEdge,
	templates StateMachinePromptTemplateLookup,
) error {
	if p == nil {
		return ErrProjectNotFound
	}
	normalized := make([]StateMachineEdge, 0, len(edges))
	seen := make(map[string]struct{}, len(edges))
	for _, edge := range edges {
		next, err := normalizeStateMachineEdgeForUpdate(edge)
		if err != nil {
			return err
		}
		if _, ok := seen[next.ID]; ok {
			return fmt.Errorf("%w: %q", ErrStateMachineEdgeDuplicateID, next.ID)
		}
		seen[next.ID] = struct{}{}
		normalized = append(normalized, next)
	}
	if err := p.validateStateMachineEdges(normalized, nil, templates); err != nil {
		return err
	}
	p.StateMachineEdges = normalized
	return nil
}
