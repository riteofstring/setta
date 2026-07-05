package workspaceui

import (
	"fmt"
	"strconv"
)

func (service *Service) applyResizePaneHeightOperation(layout WorkspaceUILayout, operation WorkspaceUIPaneOperation, location workspaceUIPaneLocation) (WorkspaceUIPaneOperationResult, error) {
	var requestedHeightPX *int
	var heightPX *int
	if operation.Resize.HeightPX != nil {
		requested := *operation.Resize.HeightPX
		normalized := normalizedPaneHeightPX(requested)
		requestedHeightPX = &requested
		heightPX = &normalized
	}
	beforeDimensions, err := paneDimensionSnapshotsForRow(layout, location.PlaneIndex, location.PaneIndex)
	if err != nil {
		return WorkspaceUIPaneOperationResult{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodePaneNotFound,
			err,
		)
	}
	targetPane := layout.Panes[paneIndexByID(layout.Panes, operation.PaneID)]
	changed := resizePaneRowInLayout(&layout, location.PlaneIndex, location.PaneIndex, heightPX)
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
			Kind:                  WorkspaceUIPaneOperationKindResizePane,
			Resize:                resizeHeightOutcome(location, targetPane, paneIDsFromDimensionSnapshots(beforeDimensions), heightPX),
			PaneID:                operation.PaneID,
			PreviousFocusedPaneID: layout.FocusedPaneID,
			FocusedPaneID:         layout.FocusedPaneID,
		},
		BeforeAfterDimensions: dimensionChanges,
		Warnings:              resizeHeightWarnings(requestedHeightPX, heightPX),
	}, nil
}

func resizeHeightOutcome(location workspaceUIPaneLocation, targetPane WorkspaceUIPane, targetPaneIDs []string, heightPX *int) *WorkspaceUIPaneResizeOutcome {
	return &WorkspaceUIPaneResizeOutcome{
		HeightPX:         cloneIntPointer(heightPX),
		PlaneIndex:       location.PlaneIndex,
		PreviousHeightPX: cloneIntPointer(targetPane.HeightPX),
		RowIndex:         location.PaneIndex,
		TargetPaneIDs:    targetPaneIDs,
	}
}

func normalizedPaneHeightPX(heightPX int) int {
	if heightPX < minimumPaneHeightPX {
		return minimumPaneHeightPX
	}
	return heightPX
}

func resizePaneRowInLayout(layout *WorkspaceUILayout, planeIndex int, rowIndex int, heightPX *int) bool {
	changed := false
	for _, column := range layout.Columns {
		if column.PlaneIndex != planeIndex || rowIndex >= len(column.PaneIDs) {
			continue
		}
		paneIndex := paneIndexByID(layout.Panes, column.PaneIDs[rowIndex])
		if paneIndex < 0 {
			continue
		}
		if optionalIntPointersEqual(layout.Panes[paneIndex].HeightPX, heightPX) {
			continue
		}
		layout.Panes[paneIndex].HeightPX = cloneIntPointer(heightPX)
		changed = true
	}
	return changed
}

func paneDimensionSnapshotsForRow(layout WorkspaceUILayout, planeIndex int, rowIndex int) ([]workspaceUIPaneDimensionSnapshot, error) {
	dimensions := []workspaceUIPaneDimensionSnapshot{}
	for _, column := range layout.Columns {
		if column.PlaneIndex != planeIndex || rowIndex >= len(column.PaneIDs) {
			continue
		}
		paneID := column.PaneIDs[rowIndex]
		dimension, ok := paneDimensions(layout, paneID)
		if !ok {
			return nil, fmt.Errorf("workspace pane dimensions not found: %s", paneID)
		}
		dimensions = append(dimensions, workspaceUIPaneDimensionSnapshot{
			PaneID:    paneID,
			Dimension: dimension,
		})
	}
	if len(dimensions) == 0 {
		return nil, fmt.Errorf("workspace pane row dimensions not found for plane %d row %d", planeIndex, rowIndex)
	}
	return dimensions, nil
}

func paneIDsFromDimensionSnapshots(snapshots []workspaceUIPaneDimensionSnapshot) []string {
	paneIDs := make([]string, 0, len(snapshots))
	for _, snapshot := range snapshots {
		paneIDs = append(paneIDs, snapshot.PaneID)
	}
	return paneIDs
}

func resizeHeightWarnings(requested *int, normalized *int) []WorkspaceUIPaneOperationWarning {
	if requested == nil || normalized == nil || *requested == *normalized {
		return []WorkspaceUIPaneOperationWarning{}
	}
	return []WorkspaceUIPaneOperationWarning{
		{
			Code:    "pane_height_normalized",
			Message: "workspace pane resize heightPx was normalized",
			Fields: map[string]string{
				"heightPx":          strconv.Itoa(*normalized),
				"requestedHeightPx": strconv.Itoa(*requested),
			},
		},
	}
}

func optionalIntPointersEqual(left *int, right *int) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

func cloneIntPointer(value *int) *int {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}
