package semanticgraph

import "context"

func (service *Service) attachSemanticRuntimeChangeLocked(draft semanticGraphChangeDraft) semanticGraphChangeDraft {
	if !semanticGraphChangeNeedsRuntime(draft) {
		draft.SemanticRuntimeRevision = service.semanticRuntimeRevision
		return draft
	}
	fromRevision := service.semanticRuntimeRevision
	toRevision := fromRevision + 1
	service.semanticRuntimeRevision = toRevision
	draft.SemanticRuntimeRevision = toRevision
	delta, err := service.semanticRuntimeDeltaForChange(context.Background(), draft, fromRevision, toRevision)
	if err != nil {
		draft.SemanticRuntimeSnapshotRequired = true
		return draft
	}
	draft.SemanticRuntimeDelta = &delta
	return draft
}

func (service *Service) semanticRuntimeDeltaForChange(ctx context.Context, draft semanticGraphChangeDraft, fromRevision int, toRevision int) (SemanticRuntimeDelta, error) {
	delta := SemanticRuntimeDelta{
		WorkspaceID:                 draft.WorkspaceID,
		FromRevision:                fromRevision,
		ToRevision:                  toRevision,
		GeneratedAt:                 timestamp(service.now()),
		ChangedAreas:                semanticRuntimeChangeAreasForDraft(draft),
		WorkflowNodeUpdates:         []SemanticRuntimeWorkflowNode{},
		RunItemUpdates:              []SemanticRuntimeRunItem{},
		CartographerRunUpdates:      []SemanticRuntimeCartographerRun{},
		CartographerWindowUpdates:   []SemanticRuntimeCartographerWindow{},
		PatchPreviewUpdates:         []SemanticRuntimePatchPreview{},
		SemanticNodeActivityUpdates: []SemanticRuntimeNodeActivity{},
		AggregateSourceUpdates:      []SemanticRuntimeSourceAggregate{},
		SemanticChangeUpdates:       []SemanticRuntimeSemanticChange{},
		Removals:                    emptySemanticRuntimeRemovals(),
	}
	builder := newSemanticRuntimeDeltaBuilder(&delta)
	runByID := map[string]CartographerRun{}
	if err := service.addSemanticRuntimeRunDeltas(ctx, draft, &delta, builder, runByID); err != nil {
		return SemanticRuntimeDelta{}, err
	}
	if err := service.addSemanticRuntimeWindowDeltas(ctx, draft, &delta, builder, runByID); err != nil {
		return SemanticRuntimeDelta{}, err
	}
	if err := service.addSemanticRuntimePatchDeltas(ctx, draft, &delta, builder, runByID); err != nil {
		return SemanticRuntimeDelta{}, err
	}
	if len(draft.CreatedSemanticEventIDs) > 0 || len(draft.SemanticNodeIDs) > 0 || len(draft.SemanticEdgeIDs) > 0 {
		builder.addSemanticNodeActivity(draft)
	}
	builder.finish()
	return delta, nil
}

func (service *Service) addSemanticRuntimeRunDeltas(ctx context.Context, draft semanticGraphChangeDraft, delta *SemanticRuntimeDelta, builder *semanticRuntimeDeltaBuilder, runByID map[string]CartographerRun) error {
	for _, runID := range uniqueStrings(draft.CartographerRunIDs) {
		run, ok, err := service.store.ReadCartographerRun(ctx, draft.WorkspaceID, runID)
		if err != nil {
			return err
		}
		if !ok {
			delta.Removals.CartographerRunIDs = append(delta.Removals.CartographerRunIDs, runID)
			continue
		}
		runByID[run.ID] = run
		patches, err := service.semanticRuntimePatches(ctx, SemanticRuntimeFilter{WorkspaceID: draft.WorkspaceID, Limit: defaultSemanticRuntimeLimit}, []CartographerRun{run})
		if err != nil {
			return err
		}
		if err := builder.addRun(run, patches); err != nil {
			return err
		}
	}
	return nil
}

func (service *Service) addSemanticRuntimeWindowDeltas(ctx context.Context, draft semanticGraphChangeDraft, delta *SemanticRuntimeDelta, builder *semanticRuntimeDeltaBuilder, runByID map[string]CartographerRun) error {
	for _, windowID := range uniqueStrings(draft.CartographerWindowIDs) {
		window, ok, err := service.store.ReadCartographerWindow(ctx, draft.WorkspaceID, windowID)
		if err != nil {
			return err
		}
		if !ok {
			delta.Removals.CartographerWindowIDs = append(delta.Removals.CartographerWindowIDs, windowID)
			continue
		}
		run, err := service.semanticRuntimeRunForID(ctx, draft.WorkspaceID, window.RunID, runByID)
		if err != nil {
			return err
		}
		if err := builder.addWindow(window, run); err != nil {
			return err
		}
	}
	return nil
}

func (service *Service) addSemanticRuntimePatchDeltas(ctx context.Context, draft semanticGraphChangeDraft, delta *SemanticRuntimeDelta, builder *semanticRuntimeDeltaBuilder, runByID map[string]CartographerRun) error {
	for _, patchID := range uniqueStrings(draft.CartographerPatchIDs) {
		patch, ok, err := service.store.ReadCartographerPatch(ctx, draft.WorkspaceID, patchID)
		if err != nil {
			return err
		}
		if !ok {
			delta.Removals.PatchPreviewIDs = append(delta.Removals.PatchPreviewIDs, semanticRuntimePatchPreviewID(patchID))
			continue
		}
		run, err := service.semanticRuntimeRunForID(ctx, draft.WorkspaceID, patch.RunID, runByID)
		if err != nil {
			return err
		}
		if err := builder.addPatch(patch, run); err != nil {
			return err
		}
	}
	return nil
}

func (service *Service) semanticRuntimeRunForID(ctx context.Context, workspaceID string, runID string, runByID map[string]CartographerRun) (CartographerRun, error) {
	if runID == "" {
		return CartographerRun{}, nil
	}
	run := runByID[runID]
	if run.ID != "" {
		return run, nil
	}
	run, ok, err := service.store.ReadCartographerRun(ctx, workspaceID, runID)
	if err != nil {
		return CartographerRun{}, err
	}
	if ok {
		runByID[run.ID] = run
	}
	return run, nil
}
