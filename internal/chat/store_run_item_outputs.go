package chat

import "fmt"

func (store *Store) SaveRunItemOutput(workspaceID string, runID string, output RunItemOutput) error {
	if err := validateStoreRunIDs(workspaceID, runID); err != nil {
		return err
	}
	if err := validateRunItemOutput(output); err != nil {
		return err
	}
	return writeJSONFile(store.runItemOutputPath(workspaceID, runID, output.RunItemID, output.Ordinal, output.ID), output)
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
	files, err := store.runItemOutputFiles(workspaceID, runID, runItemID)
	if err != nil {
		return nil, err
	}
	return readRunItemOutputs(files, runItemID)
}

func readRunItemOutputs(files []runItemOutputFile, runItemID string) ([]RunItemOutput, error) {
	outputs := make([]RunItemOutput, 0, len(files))
	for _, file := range files {
		var output RunItemOutput
		if err := readJSONFile(file.path, &output); err != nil {
			return nil, err
		}
		if err := validateRunItemOutput(output); err != nil {
			return nil, corruptStateError(file.path, err)
		}
		if output.RunItemID != runItemID {
			return nil, corruptStateErrorf(file.path, "run item output %s belongs to run item %s, not %s", output.ID, output.RunItemID, runItemID)
		}
		outputs = append(outputs, output)
	}
	return outputs, nil
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
	files, err := store.runItemOutputFiles(workspaceID, runID, runItemID)
	if err != nil {
		return RunItemOutputPage{}, err
	}
	files = outputFilesAfterOrdinal(files, afterOrdinal)
	hasMore := false
	nextOrdinal := 0
	if limit > 0 && len(files) > limit {
		files = files[:limit]
		hasMore = true
		nextOrdinal = files[len(files)-1].ordinal
	}
	outputs, err := readRunItemOutputs(files, runItemID)
	if err != nil {
		return RunItemOutputPage{}, err
	}
	return RunItemOutputPage{RunID: runID, RunItemID: runItemID, Output: outputs, HasMore: hasMore, NextOrdinal: nextOrdinal}, nil
}

func outputFilesAfterOrdinal(files []runItemOutputFile, afterOrdinal int) []runItemOutputFile {
	if afterOrdinal <= 0 {
		return files
	}
	filtered := files[:0]
	for _, file := range files {
		if file.ordinal > afterOrdinal {
			filtered = append(filtered, file)
		}
	}
	return filtered
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
	files, err := store.runItemOutputFiles(workspaceID, runID, runItemID)
	if err != nil {
		return 0, err
	}
	if len(files) == 0 {
		return 1, nil
	}
	return files[len(files)-1].ordinal + 1, nil
}
