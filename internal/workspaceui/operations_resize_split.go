package workspaceui

import "fmt"

func (service *Service) applyResizePaneSplitOperation(layout WorkspaceUILayout, operation WorkspaceUIPaneOperation, upperLocation workspaceUIPaneLocation) (WorkspaceUIPaneOperationResult, error) {
	split := *operation.Resize.Split
	lowerLocation, ok := paneLocation(layout, split.LowerPaneID)
	if !ok {
		return WorkspaceUIPaneOperationResult{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodePaneNotFound,
			fmt.Errorf("workspace pane resize split lower pane not found: %s", split.LowerPaneID),
		)
	}
	if upperLocation.ColumnIndex != lowerLocation.ColumnIndex || lowerLocation.PaneIndex != upperLocation.PaneIndex+1 {
		return WorkspaceUIPaneOperationResult{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodeInvalidOperation,
			fmt.Errorf("workspace pane resize split requires lowerPaneId %s to be directly below paneId %s in the same column", split.LowerPaneID, operation.PaneID),
		)
	}

	beforeDimensions, err := paneDimensionSnapshotsForSplit(layout, operation.PaneID, split.LowerPaneID)
	if err != nil {
		return WorkspaceUIPaneOperationResult{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodePaneNotFound,
			err,
		)
	}
	upperPane := layout.Panes[paneIndexByID(layout.Panes, operation.PaneID)]
	lowerPane := layout.Panes[paneIndexByID(layout.Panes, split.LowerPaneID)]
	upperWeight := normalizedPaneWeight(split.UpperWeight)
	lowerWeight := normalizedPaneWeight(split.LowerWeight)
	changed := resizePaneSplitInLayout(&layout, operation.PaneID, split.LowerPaneID, upperWeight, lowerWeight)
	dimensionChanges, err := paneDimensionChanges(layout, beforeDimensions)
	if err != nil {
		return WorkspaceUIPaneOperationResult{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodePaneNotFound,
			err,
		)
	}

	if changed {
		layout.Revision += 1
		saved, err := service.SaveLayout(layout)
		if err != nil {
			return WorkspaceUIPaneOperationResult{}, err
		}
		layout = saved
	}

	return WorkspaceUIPaneOperationResult{
		WorkspaceID: layout.WorkspaceID,
		Revision:    layout.Revision,
		Layout:      layout,
		Changed:     changed,
		OperationResult: WorkspaceUIPaneOperationOutcome{
			Kind: WorkspaceUIPaneOperationKindResizePane,
			Resize: resizeSplitOutcome(
				operation.PaneID,
				split.LowerPaneID,
				upperPane.Weight,
				lowerPane.Weight,
				upperWeight,
				lowerWeight,
				upperLocation,
			),
			PaneID:                operation.PaneID,
			PreviousFocusedPaneID: layout.FocusedPaneID,
			FocusedPaneID:         layout.FocusedPaneID,
		},
		BeforeAfterDimensions: dimensionChanges,
		Warnings:              resizeSplitWarnings(split, upperWeight, lowerWeight),
	}, nil
}

func paneDimensionSnapshotsForSplit(layout WorkspaceUILayout, upperPaneID string, lowerPaneID string) ([]workspaceUIPaneDimensionSnapshot, error) {
	upperDimension, ok := paneDimensions(layout, upperPaneID)
	if !ok {
		return nil, fmt.Errorf("workspace pane dimensions not found: %s", upperPaneID)
	}
	lowerDimension, ok := paneDimensions(layout, lowerPaneID)
	if !ok {
		return nil, fmt.Errorf("workspace pane dimensions not found: %s", lowerPaneID)
	}
	return []workspaceUIPaneDimensionSnapshot{
		{
			PaneID:    upperPaneID,
			Dimension: upperDimension,
		},
		{
			PaneID:    lowerPaneID,
			Dimension: lowerDimension,
		},
	}, nil
}

func resizePaneSplitInLayout(layout *WorkspaceUILayout, upperPaneID string, lowerPaneID string, upperWeight float64, lowerWeight float64) bool {
	changed := false
	if resizePaneWeightInLayout(layout, upperPaneID, upperWeight) {
		changed = true
	}
	if resizePaneWeightInLayout(layout, lowerPaneID, lowerWeight) {
		changed = true
	}
	return changed
}

func resizePaneWeightInLayout(layout *WorkspaceUILayout, paneID string, weight float64) bool {
	paneIndex := paneIndexByID(layout.Panes, paneID)
	if paneIndex < 0 || layout.Panes[paneIndex].Weight == weight {
		return false
	}
	layout.Panes[paneIndex].Weight = weight
	return true
}

func resizeSplitOutcome(upperPaneID string, lowerPaneID string, previousUpperWeight float64, previousLowerWeight float64, upperWeight float64, lowerWeight float64, upperLocation workspaceUIPaneLocation) *WorkspaceUIPaneResizeOutcome {
	return &WorkspaceUIPaneResizeOutcome{
		LowerPaneID:         lowerPaneID,
		LowerWeight:         lowerWeight,
		PlaneIndex:          upperLocation.PlaneIndex,
		PreviousLowerWeight: previousLowerWeight,
		PreviousUpperWeight: previousUpperWeight,
		RowIndex:            upperLocation.PaneIndex,
		TargetPaneIDs:       []string{upperPaneID, lowerPaneID},
		UpperPaneID:         upperPaneID,
		UpperWeight:         upperWeight,
	}
}

func normalizedPaneWeight(weight float64) float64 {
	if weight < minimumPaneWeight {
		return minimumPaneWeight
	}
	return weight
}

func resizeSplitWarnings(requested WorkspaceUIPaneSplitResizeOperation, upperWeight float64, lowerWeight float64) []WorkspaceUIPaneOperationWarning {
	if requested.UpperWeight == upperWeight && requested.LowerWeight == lowerWeight {
		return []WorkspaceUIPaneOperationWarning{}
	}
	return []WorkspaceUIPaneOperationWarning{
		{
			Code:    "pane_weight_normalized",
			Message: "workspace pane resize split weights were normalized",
			Fields: map[string]string{
				"lowerWeight":          formatFloat(lowerWeight),
				"requestedLowerWeight": formatFloat(requested.LowerWeight),
				"requestedUpperWeight": formatFloat(requested.UpperWeight),
				"upperWeight":          formatFloat(upperWeight),
			},
		},
	}
}
