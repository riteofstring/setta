package chat

import "fmt"

func (store *Store) SaveRunItemOutput(workspaceID string, runID string, output RunItemOutput) error {
	if err := validateStoreRunIDs(workspaceID, runID); err != nil {
		return err
	}
	if err := validateRunItemOutput(output); err != nil {
		return err
	}
	if store.runOutputs[workspaceID] == nil {
		store.runOutputs[workspaceID] = map[string]map[string][]RunItemOutput{}
	}
	if store.runOutputs[workspaceID][runID] == nil {
		store.runOutputs[workspaceID][runID] = map[string][]RunItemOutput{}
	}
	outputs := store.runOutputs[workspaceID][runID][output.RunItemID]
	replaced := false
	for index, existing := range outputs {
		if existing.ID == output.ID {
			outputs[index] = output
			replaced = true
			break
		}
	}
	if !replaced {
		outputs = append(outputs, output)
	}
	store.runOutputs[workspaceID][runID][output.RunItemID] = outputs
	return store.appendActivityOverlayOutput(workspaceID, runID, output)
}

func (store *Store) LoadRunItemOutputs(workspaceID string, runID string) ([]RunItemOutput, error) {
	if err := validateStoreRunIDs(workspaceID, runID); err != nil {
		return nil, err
	}
	items, err := store.LoadRunItems(workspaceID, runID)
	if err != nil {
		return nil, err
	}
	outputs := []RunItemOutput{}
	for _, item := range items {
		itemOutputs, err := store.LoadRunItemOutputsForItem(workspaceID, runID, item.ID)
		if err != nil {
			return nil, err
		}
		outputs = append(outputs, itemOutputs...)
	}
	return outputs, nil
}

func (store *Store) LoadRunItemOutputsForItem(workspaceID string, runID string, runItemID string) ([]RunItemOutput, error) {
	if err := validateStoreRunItemIDs(workspaceID, runID, runItemID); err != nil {
		return nil, err
	}
	return cloneRunItemOutputs(store.runOutputs[workspaceID][runID][runItemID]), nil
}

func (store *Store) LoadRunItemOutputPage(workspaceID string, runID string, runItemID string, afterOrdinal int, limit int) (RunItemOutputPage, error) {
	if err := validateStoreRunItemIDs(workspaceID, runID, runItemID); err != nil {
		return RunItemOutputPage{}, err
	}
	if afterOrdinal < 0 {
		return RunItemOutputPage{}, fmt.Errorf("run item output afterOrdinal must not be negative: %d", afterOrdinal)
	}
	if limit < 0 {
		return RunItemOutputPage{}, fmt.Errorf("run item output page limit must not be negative: %d", limit)
	}
	if _, err := store.LoadRun(workspaceID, runID); err != nil {
		return RunItemOutputPage{}, err
	}
	if err := store.validateRunItemBelongsToRun(workspaceID, runID, runItemID); err != nil {
		return RunItemOutputPage{}, err
	}
	outputs := outputsAfterOrdinal(cloneRunItemOutputs(store.runOutputs[workspaceID][runID][runItemID]), afterOrdinal)
	hasMore := false
	nextOrdinal := 0
	if limit > 0 && len(outputs) > limit {
		outputs = outputs[:limit]
		hasMore = true
		nextOrdinal = outputs[len(outputs)-1].Ordinal
	}
	return RunItemOutputPage{RunID: runID, RunItemID: runItemID, Output: outputs, HasMore: hasMore, NextOrdinal: nextOrdinal}, nil
}

func (store *Store) validateRunItemBelongsToRun(workspaceID string, runID string, runItemID string) error {
	if err := validateStoreRunItemIDs(workspaceID, runID, runItemID); err != nil {
		return err
	}
	items, err := store.LoadRunItems(workspaceID, runID)
	if err != nil {
		return err
	}
	for _, item := range items {
		if item.ID == runItemID {
			return nil
		}
	}
	return fmt.Errorf("run item %s was not found in run %s", runItemID, runID)
}

func (store *Store) NextRunItemOutputOrdinal(workspaceID string, runID string, runItemID string) (int, error) {
	if err := validateStoreRunItemIDs(workspaceID, runID, runItemID); err != nil {
		return 0, err
	}
	outputs := store.runOutputs[workspaceID][runID][runItemID]
	if len(outputs) == 0 {
		return 1, nil
	}
	return outputs[len(outputs)-1].Ordinal + 1, nil
}

func outputsAfterOrdinal(outputs []RunItemOutput, afterOrdinal int) []RunItemOutput {
	if afterOrdinal <= 0 {
		return outputs
	}
	filtered := outputs[:0]
	for _, output := range outputs {
		if output.Ordinal > afterOrdinal {
			filtered = append(filtered, output)
		}
	}
	return filtered
}

func cloneRunItemOutputs(outputs []RunItemOutput) []RunItemOutput {
	cloned := make([]RunItemOutput, len(outputs))
	copy(cloned, outputs)
	return cloned
}
