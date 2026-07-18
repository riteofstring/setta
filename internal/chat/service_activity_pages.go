package chat

func (service *Service) LoadRunActivityPage(workspaceID string, runID string, afterItemID string, limit int) (RunActivityPage, error) {
	if _, err := service.validateRunRequest(workspaceID, runID); err != nil {
		return RunActivityPage{}, err
	}
	if err := validateOptionalStorageID("run activity after item id", afterItemID); err != nil {
		return RunActivityPage{}, err
	}
	pageLimit, err := runActivityPageLimit(limit)
	if err != nil {
		return RunActivityPage{}, err
	}
	service.mu.Lock()

	run, items, nextItemID, hasMoreItems, err := service.loadProjectedRunActivityItemsPageLocked(workspaceID, runID, afterItemID, pageLimit)
	if err != nil {
		service.mu.Unlock()
		service.recordCorruptStateDiagnostic(err, workspaceID, run.ConversationID, runID)
		return RunActivityPage{}, err
	}
	outputState, err := service.runItemOutputPreviews(workspaceID, runID, items, pageLimit)
	if err != nil {
		service.mu.Unlock()
		service.recordCorruptStateDiagnostic(err, workspaceID, "", runID)
		return RunActivityPage{}, err
	}
	service.mu.Unlock()
	return RunActivityPage{
		RunID:        runID,
		Items:        items,
		Output:       outputState.outputs,
		Activity:     runActivityItemProjections(run.Status, items, outputState.hasOutput),
		HasMoreItems: hasMoreItems,
		NextItemID:   nextItemID,
	}, nil
}

func (service *Service) LoadRunActivityItems(workspaceID string, runID string) ([]RunItem, error) {
	if _, err := service.validateRunRequest(workspaceID, runID); err != nil {
		return nil, err
	}
	service.mu.Lock()
	run, items, err := service.loadProjectedRunActivityItemsLocked(workspaceID, runID)
	service.mu.Unlock()
	if err != nil {
		service.recordCorruptStateDiagnostic(err, workspaceID, run.ConversationID, runID)
		return nil, err
	}
	return items, nil
}

// LoadRunActivityItemsBefore returns a tail page of projected run activity items.
// Items are chronological within the returned window; nextBeforeItemID pages to
// the next older window.
func (service *Service) LoadRunActivityItemsBefore(workspaceID string, runID string, beforeItemID string, limit int) ([]RunItem, string, bool, error) {
	if _, err := service.validateRunRequest(workspaceID, runID); err != nil {
		return nil, "", false, err
	}
	if err := validateOptionalStorageID("run activity before item id", beforeItemID); err != nil {
		return nil, "", false, err
	}
	pageLimit, err := runActivityPageLimit(limit)
	if err != nil {
		return nil, "", false, err
	}
	service.mu.Lock()
	run, items, nextBeforeItemID, hasMoreItems, err := service.loadProjectedRunActivityItemsBeforeLocked(workspaceID, runID, beforeItemID, pageLimit)
	service.mu.Unlock()
	if err != nil {
		service.recordCorruptStateDiagnostic(err, workspaceID, run.ConversationID, runID)
		return nil, "", false, err
	}
	return items, nextBeforeItemID, hasMoreItems, nil
}

func (service *Service) loadProjectedRunActivityItemsPageLocked(workspaceID string, runID string, afterItemID string, limit int) (Run, []RunItem, string, bool, error) {
	run, err := service.store.LoadRun(workspaceID, runID)
	if err != nil {
		return Run{}, nil, "", false, err
	}
	backgroundProviderItems, err := service.backgroundTerminalProviderItemIDsForRunLocked(workspaceID, run.ConversationID, runID)
	if err != nil {
		return run, nil, "", false, err
	}
	cursor := afterItemID
	items := make([]RunItem, 0, limit)
	for len(items) < limit {
		rawItems, nextItemID, hasMoreItems, err := service.store.LoadRunItemsPage(workspaceID, runID, cursor, limit-len(items))
		if err != nil {
			return run, nil, "", false, err
		}
		items = append(items, activityProjectionRunItems(rawItems, backgroundProviderItems)...)
		if !hasMoreItems {
			return run, items, "", false, nil
		}
		if nextItemID == "" {
			return run, nil, "", false, corruptStateErrorf(service.store.runItemsIndexPath(workspaceID, runID), "run item page indicated more items without a next item id")
		}
		cursor = nextItemID
		if len(items) >= limit {
			return run, items[:limit], nextItemID, true, nil
		}
	}
	return run, items, "", false, nil
}

func (service *Service) loadProjectedRunActivityItemsBeforeLocked(workspaceID string, runID string, beforeItemID string, limit int) (Run, []RunItem, string, bool, error) {
	run, err := service.store.LoadRun(workspaceID, runID)
	if err != nil {
		return Run{}, nil, "", false, err
	}
	backgroundProviderItems, err := service.backgroundTerminalProviderItemIDsForRunLocked(workspaceID, run.ConversationID, runID)
	if err != nil {
		return run, nil, "", false, err
	}
	cursor := beforeItemID
	items := make([]RunItem, 0, limit)
	for len(items) < limit {
		rawItems, nextBeforeItemID, hasMoreItems, err := service.store.LoadRunItemsBefore(workspaceID, runID, cursor, limit-len(items))
		if err != nil {
			return run, nil, "", false, err
		}
		items = append(items, activityProjectionRunItems(rawItems, backgroundProviderItems)...)
		if !hasMoreItems {
			sortRunItems(items)
			return run, items, "", false, nil
		}
		if nextBeforeItemID == "" {
			return run, nil, "", false, corruptStateErrorf(service.store.runItemsIndexPath(workspaceID, runID), "run item before page indicated more items without a next before item id")
		}
		cursor = nextBeforeItemID
		if len(items) >= limit {
			sortRunItems(items)
			return run, items, nextBeforeItemID, true, nil
		}
	}
	sortRunItems(items)
	return run, items, "", false, nil
}

func (service *Service) loadProjectedRunActivityItemsLocked(workspaceID string, runID string) (Run, []RunItem, error) {
	run, err := service.store.LoadRun(workspaceID, runID)
	if err != nil {
		return Run{}, nil, err
	}
	items, err := service.store.LoadRunItems(workspaceID, runID)
	if err != nil {
		return run, nil, err
	}
	backgroundProviderItems, err := service.backgroundTerminalProviderItemIDsForRunLocked(workspaceID, run.ConversationID, runID)
	if err != nil {
		return run, nil, err
	}
	return run, activityProjectionRunItems(items, backgroundProviderItems), nil
}
