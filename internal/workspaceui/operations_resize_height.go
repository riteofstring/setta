package workspaceui

import (
	"fmt"
	"math"
	"strconv"
)

func (service *Service) applyResizePaneHeightOperation(layout WorkspaceUILayout, operation WorkspaceUIPaneOperation, location workspaceUIPaneLocation) (WorkspaceUIPaneOperationResult, error) {
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
	requestedHeightPX, heightPX, err := resizePaneHeightTarget(operation, targetPane)
	if err != nil {
		return WorkspaceUIPaneOperationResult{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodeInvalidOperation,
			err,
		)
	}
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

func resizePaneHeightTarget(operation WorkspaceUIPaneOperation, targetPane WorkspaceUIPane) (*int, *int, error) {
	requestedHeightPX, err := requestedResizePaneHeightPX(operation, targetPane)
	if err != nil {
		return nil, nil, err
	}
	if requestedHeightPX == nil {
		return nil, nil, nil
	}
	normalized := normalizedPaneHeightPX(*requestedHeightPX)
	return requestedHeightPX, &normalized, nil
}

func requestedResizePaneHeightPX(operation WorkspaceUIPaneOperation, targetPane WorkspaceUIPane) (*int, error) {
	if operation.Resize.HeightPX != nil {
		requested := *operation.Resize.HeightPX
		return &requested, nil
	}
	if operation.Resize.ResetHeight {
		return nil, nil
	}
	switch {
	case operation.Resize.HeightDeltaPX != nil:
		if targetPane.HeightPX == nil {
			return nil, fmt.Errorf("workspace pane resize heightDeltaPx requires an existing explicit heightPx")
		}
		return heightFromDelta(*targetPane.HeightPX, *operation.Resize.HeightDeltaPX)
	case operation.Resize.HeightScale != nil:
		if targetPane.HeightPX == nil {
			return nil, fmt.Errorf("workspace pane resize heightScale requires an existing explicit heightPx")
		}
		return heightFromScale(*targetPane.HeightPX, *operation.Resize.HeightScale)
	default:
		return nil, fmt.Errorf("workspace pane resize height target is required")
	}
}

func heightFromDelta(base int, delta int) (*int, error) {
	base64 := int64(base)
	delta64 := int64(delta)
	max := maxIntAsInt64()
	min := -max - 1
	if delta64 > 0 && base64 > max-delta64 {
		return nil, fmt.Errorf("workspace pane resize heightDeltaPx resolves beyond supported heightPx")
	}
	if delta64 < 0 && base64 < min-delta64 {
		return nil, fmt.Errorf("workspace pane resize heightDeltaPx resolves below supported heightPx")
	}
	requested := base64 + delta64
	if requested <= 0 {
		return nil, fmt.Errorf("workspace pane resize heightDeltaPx resolves to non-positive heightPx: %d", requested)
	}
	result := int(requested)
	return &result, nil
}

func heightFromScale(base int, scale float64) (*int, error) {
	requested := float64(base) * scale
	if math.IsInf(requested, 0) || math.IsNaN(requested) {
		return nil, fmt.Errorf("workspace pane resize heightScale resolves to non-finite heightPx")
	}
	if requested > float64(maxIntAsInt64()) {
		return nil, fmt.Errorf("workspace pane resize heightScale resolves beyond supported heightPx: %s", formatFloat(requested))
	}
	rounded := int(math.Round(requested))
	return &rounded, nil
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

func maxIntAsInt64() int64 {
	return int64(^uint(0) >> 1)
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
