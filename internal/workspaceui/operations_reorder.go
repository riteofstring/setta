package workspaceui

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
)

type workspaceUIPaneReorderApplication struct {
	layout              WorkspaceUILayout
	changed             bool
	createdColumnID     string
	destinationColumnID string
	removedColumn       bool
	resetPaneSizing     bool
	targetColumnID      string
	targetPaneID        string
}

func (service *Service) applyReorderPaneOperation(layout WorkspaceUILayout, operation WorkspaceUIPaneOperation) (WorkspaceUIPaneOperationResult, error) {
	previousLocation, ok := paneLocation(layout, operation.PaneID)
	if !ok {
		return WorkspaceUIPaneOperationResult{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodePaneNotFound,
			fmt.Errorf("workspace pane not found: %s", operation.PaneID),
		)
	}

	previousFocusedPaneID := layout.FocusedPaneID
	application, err := applyReorderPaneOperationToLayout(cloneWorkspaceUILayout(layout), operation, previousLocation)
	if err != nil {
		return WorkspaceUIPaneOperationResult{}, err
	}
	layout = application.layout
	if application.changed {
		if operation.Reorder.Intent.Kind != WorkspaceUIPaneReorderIntentKindSwap {
			layout.FocusedPaneID = operation.PaneID
		}
		layout.Revision += 1
		saved, err := service.SaveLayout(layout)
		if err != nil {
			return WorkspaceUIPaneOperationResult{}, err
		}
		layout = saved
	}

	nextLocation := previousLocation
	if application.changed {
		var ok bool
		nextLocation, ok = paneLocation(layout, operation.PaneID)
		if !ok {
			return WorkspaceUIPaneOperationResult{}, operationError(
				layout.WorkspaceID,
				operation,
				WorkspaceUIOperationErrorCodePaneNotFound,
				fmt.Errorf("workspace pane not found after reorder: %s", operation.PaneID),
			)
		}
	}

	return WorkspaceUIPaneOperationResult{
		WorkspaceID: layout.WorkspaceID,
		Revision:    layout.Revision,
		Layout:      layout,
		Changed:     application.changed,
		OperationResult: WorkspaceUIPaneOperationOutcome{
			Kind: WorkspaceUIPaneOperationKindReorderPane,
			Reorder: reorderOutcome(
				operation.Reorder.Intent,
				previousLocation,
				nextLocation,
				application,
			),
			PaneID:                operation.PaneID,
			PreviousFocusedPaneID: previousFocusedPaneID,
			FocusedPaneID:         layout.FocusedPaneID,
		},
		BeforeAfterDimensions: []WorkspaceUIPaneDimensionChange{},
		Warnings:              []WorkspaceUIPaneOperationWarning{},
	}, nil
}

func applyReorderPaneOperationToLayout(layout WorkspaceUILayout, operation WorkspaceUIPaneOperation, source workspaceUIPaneLocation) (workspaceUIPaneReorderApplication, error) {
	switch operation.Reorder.Intent.Kind {
	case WorkspaceUIPaneReorderIntentKindColumn:
		return applyReorderPaneColumnIntentToLayout(layout, operation, source)
	case WorkspaceUIPaneReorderIntentKindPlaneSlot:
		return applyReorderPanePlaneSlotIntentToLayout(layout, operation, source)
	case WorkspaceUIPaneReorderIntentKindRow:
		return applyReorderPaneRowIntentToLayout(layout, operation, source)
	case WorkspaceUIPaneReorderIntentKindSwap:
		return applyReorderPaneSwapIntentToLayout(layout, operation, source)
	default:
		return workspaceUIPaneReorderApplication{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodeUnsupportedOperation,
			fmt.Errorf("unsupported workspace pane reorder intent kind: %s", operation.Reorder.Intent.Kind),
		)
	}
}

func applyReorderPaneRowIntentToLayout(layout WorkspaceUILayout, operation WorkspaceUIPaneOperation, source workspaceUIPaneLocation) (workspaceUIPaneReorderApplication, error) {
	intent := operation.Reorder.Intent
	if operation.PaneID == intent.TargetPaneID {
		return unchangedReorderApplication(layout, intent, source), nil
	}
	target, ok := paneLocation(layout, intent.TargetPaneID)
	if !ok {
		return workspaceUIPaneReorderApplication{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodePaneNotFound,
			fmt.Errorf("workspace pane reorder row target pane not found: %s", intent.TargetPaneID),
		)
	}
	if source.ColumnID == target.ColumnID {
		changed := reorderPaneWithinColumnForDrop(&layout, source, target, intent.Placement)
		return workspaceUIPaneReorderApplication{
			layout:              layout,
			changed:             changed,
			destinationColumnID: source.ColumnID,
			targetPaneID:        intent.TargetPaneID,
		}, nil
	}

	targetColumnID := target.ColumnID
	removedColumn := removePaneFromColumnForReorder(&layout, source.ColumnID, operation.PaneID)
	insertPaneInColumnForReorder(&layout, targetColumnID, operation.PaneID, target.PaneIndex, intent.Placement)
	if removedColumn {
		layout.Columns = reindexedWorkspaceUIColumns(nonEmptyColumns(layout.Columns))
	}
	setPaneColumnForReorder(&layout, operation.PaneID, targetColumnID, true)
	return workspaceUIPaneReorderApplication{
		layout:              layout,
		changed:             true,
		destinationColumnID: targetColumnID,
		removedColumn:       removedColumn,
		resetPaneSizing:     true,
		targetPaneID:        intent.TargetPaneID,
	}, nil
}

func applyReorderPaneSwapIntentToLayout(layout WorkspaceUILayout, operation WorkspaceUIPaneOperation, source workspaceUIPaneLocation) (workspaceUIPaneReorderApplication, error) {
	intent := operation.Reorder.Intent
	if operation.PaneID == intent.TargetPaneID {
		return unchangedReorderApplication(layout, intent, source), nil
	}
	target, ok := paneLocation(layout, intent.TargetPaneID)
	if !ok {
		return workspaceUIPaneReorderApplication{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodePaneNotFound,
			fmt.Errorf("workspace pane reorder swap target pane not found: %s", intent.TargetPaneID),
		)
	}
	for columnIndex := range layout.Columns {
		for paneIndex, paneID := range layout.Columns[columnIndex].PaneIDs {
			switch paneID {
			case operation.PaneID:
				layout.Columns[columnIndex].PaneIDs[paneIndex] = intent.TargetPaneID
			case intent.TargetPaneID:
				layout.Columns[columnIndex].PaneIDs[paneIndex] = operation.PaneID
			}
		}
	}
	setPaneColumnForReorder(&layout, operation.PaneID, target.ColumnID, false)
	setPaneColumnForReorder(&layout, intent.TargetPaneID, source.ColumnID, false)
	return workspaceUIPaneReorderApplication{
		layout:              layout,
		changed:             true,
		destinationColumnID: target.ColumnID,
		targetPaneID:        intent.TargetPaneID,
	}, nil
}

func applyReorderPaneColumnIntentToLayout(layout WorkspaceUILayout, operation WorkspaceUIPaneOperation, source workspaceUIPaneLocation) (workspaceUIPaneReorderApplication, error) {
	intent := operation.Reorder.Intent
	targetColumnIndex := columnIndexByIDAndPlane(layout.Columns, intent.TargetColumnID, *intent.PlaneIndex)
	if targetColumnIndex < 0 {
		return workspaceUIPaneReorderApplication{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodeColumnNotFound,
			fmt.Errorf("workspace pane reorder target column not found: %s plane %d", intent.TargetColumnID, *intent.PlaneIndex),
		)
	}
	sourceColumn := layout.Columns[source.ColumnIndex]
	targetColumn := layout.Columns[targetColumnIndex]
	if len(sourceColumn.PaneIDs) == 1 && columnDropKeepsSinglePaneColumnInPlace(layout.Columns, sourceColumn, targetColumn, intent.SlotPlacement) {
		return unchangedReorderApplication(layout, intent, source), nil
	}

	newColumnID := nextWorkspaceUIColumnID(layout.Columns)
	columnsWithoutSourcePane := columnsWithoutPaneForReorder(layout.Columns, sourceColumn, operation.PaneID)
	extractedTargetColumn, ok := columnByIDAndPlane(columnsWithoutSourcePane, intent.TargetColumnID, *intent.PlaneIndex)
	if !ok {
		return workspaceUIPaneReorderApplication{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodeColumnNotFound,
			fmt.Errorf("workspace pane reorder target column not found after source extraction: %s plane %d", intent.TargetColumnID, *intent.PlaneIndex),
		)
	}
	targetSlotIndex := extractedTargetColumn.SlotIndex
	if intent.SlotPlacement == WorkspaceUIPaneDropPlacementAfter {
		targetSlotIndex += 1
	}
	shiftedColumns := shiftedColumnsForSlotInsert(columnsWithoutSourcePane, *intent.PlaneIndex, targetSlotIndex)
	insertedColumn := insertedReorderPaneColumn(
		newColumnID,
		operation.PaneID,
		extractedTargetColumn,
		*intent.PlaneIndex,
		targetSlotIndex,
		len(shiftedColumns),
	)
	layout.Columns = reindexedWorkspaceUIColumns(append(shiftedColumns, insertedColumn))
	setPaneColumnForReorder(&layout, operation.PaneID, insertedColumn.ColumnID, true)
	return workspaceUIPaneReorderApplication{
		layout:              layout,
		changed:             true,
		createdColumnID:     insertedColumn.ColumnID,
		destinationColumnID: insertedColumn.ColumnID,
		removedColumn:       len(sourceColumn.PaneIDs) == 1,
		resetPaneSizing:     true,
		targetColumnID:      intent.TargetColumnID,
	}, nil
}

func applyReorderPanePlaneSlotIntentToLayout(layout WorkspaceUILayout, operation WorkspaceUIPaneOperation, source workspaceUIPaneLocation) (workspaceUIPaneReorderApplication, error) {
	intent := operation.Reorder.Intent
	newColumnID := nextWorkspaceUIColumnID(layout.Columns)
	targetPlaneIndex := *intent.PlaneIndex
	if targetPlaneIndex < 0 {
		planeOffset := -targetPlaneIndex
		for index := range layout.Columns {
			layout.Columns[index].PlaneIndex += planeOffset
		}
		targetPlaneIndex = 0
		var ok bool
		source, ok = paneLocation(layout, operation.PaneID)
		if !ok {
			return workspaceUIPaneReorderApplication{}, operationError(
				layout.WorkspaceID,
				operation,
				WorkspaceUIOperationErrorCodePaneNotFound,
				fmt.Errorf("workspace pane not found after plane offset: %s", operation.PaneID),
			)
		}
	}
	targetSlotIndex := *intent.SlotIndex
	sourceColumn := layout.Columns[source.ColumnIndex]
	if sourceColumn.PlaneIndex == targetPlaneIndex && sourceColumn.SlotIndex == targetSlotIndex {
		return unchangedReorderApplication(layout, intent, source), nil
	}
	referenceColumnIndex := columnIndexByID(layout.Columns, intent.ReferenceColumnID)
	if referenceColumnIndex < 0 {
		return workspaceUIPaneReorderApplication{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodeColumnNotFound,
			fmt.Errorf("workspace pane reorder reference column not found: %s", intent.ReferenceColumnID),
		)
	}

	columnsWithoutSourcePane := columnsWithoutPaneForReorder(layout.Columns, sourceColumn, operation.PaneID)
	if targetSlotIsOccupied(columnsWithoutSourcePane, targetPlaneIndex, targetSlotIndex) {
		return workspaceUIPaneReorderApplication{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodeInvalidOperation,
			fmt.Errorf("workspace pane reorder target plane slot is occupied: plane %d slot %d", targetPlaneIndex, targetSlotIndex),
		)
	}
	referenceColumn := layout.Columns[referenceColumnIndex]
	insertedColumn := insertedReorderPaneColumn(
		newColumnID,
		operation.PaneID,
		referenceColumn,
		targetPlaneIndex,
		targetSlotIndex,
		len(columnsWithoutSourcePane),
	)
	layout.Columns = reindexedWorkspaceUIColumns(append(columnsWithoutSourcePane, insertedColumn))
	setPaneColumnForReorder(&layout, operation.PaneID, insertedColumn.ColumnID, true)
	return workspaceUIPaneReorderApplication{
		layout:              layout,
		changed:             true,
		createdColumnID:     insertedColumn.ColumnID,
		destinationColumnID: insertedColumn.ColumnID,
		removedColumn:       len(sourceColumn.PaneIDs) == 1,
		resetPaneSizing:     true,
		targetColumnID:      intent.ReferenceColumnID,
	}, nil
}

func unchangedReorderApplication(layout WorkspaceUILayout, intent WorkspaceUIPaneReorderIntent, source workspaceUIPaneLocation) workspaceUIPaneReorderApplication {
	return workspaceUIPaneReorderApplication{
		layout:              layout,
		destinationColumnID: source.ColumnID,
		targetColumnID:      intent.TargetColumnID,
		targetPaneID:        intent.TargetPaneID,
	}
}

func reorderPaneWithinColumnForDrop(layout *WorkspaceUILayout, source workspaceUIPaneLocation, target workspaceUIPaneLocation, placement WorkspaceUIPaneDropPlacement) bool {
	if source.PaneIndex < 0 || target.PaneIndex < 0 || source.ColumnIndex < 0 || source.ColumnIndex >= len(layout.Columns) {
		return false
	}
	insertIndex := target.PaneIndex
	if placement == WorkspaceUIPaneDropPlacementAfter {
		insertIndex += 1
	}
	if insertIndex > source.PaneIndex {
		insertIndex -= 1
	}
	if insertIndex == source.PaneIndex {
		return false
	}
	layout.Columns[source.ColumnIndex].PaneIDs = moveString(layout.Columns[source.ColumnIndex].PaneIDs, source.PaneIndex, insertIndex)
	return true
}

func removePaneFromColumnForReorder(layout *WorkspaceUILayout, columnID string, paneID string) bool {
	removedColumn := false
	for index := range layout.Columns {
		if layout.Columns[index].ColumnID != columnID {
			continue
		}
		filteredPaneIDs := make([]string, 0, len(layout.Columns[index].PaneIDs))
		for _, candidateID := range layout.Columns[index].PaneIDs {
			if candidateID != paneID {
				filteredPaneIDs = append(filteredPaneIDs, candidateID)
			}
		}
		layout.Columns[index].PaneIDs = filteredPaneIDs
		removedColumn = len(filteredPaneIDs) == 0
		return removedColumn
	}
	return false
}

func insertPaneInColumnForReorder(layout *WorkspaceUILayout, columnID string, paneID string, targetPaneIndex int, placement WorkspaceUIPaneDropPlacement) {
	for index := range layout.Columns {
		if layout.Columns[index].ColumnID != columnID {
			continue
		}
		insertIndex := targetPaneIndex
		if placement == WorkspaceUIPaneDropPlacementAfter {
			insertIndex += 1
		}
		insertIndex = clampInt(insertIndex, 0, len(layout.Columns[index].PaneIDs))
		paneIDs := append([]string{}, layout.Columns[index].PaneIDs[:insertIndex]...)
		paneIDs = append(paneIDs, paneID)
		paneIDs = append(paneIDs, layout.Columns[index].PaneIDs[insertIndex:]...)
		layout.Columns[index].PaneIDs = paneIDs
		return
	}
}

func columnDropKeepsSinglePaneColumnInPlace(columns []WorkspaceUIColumn, sourceColumn WorkspaceUIColumn, targetColumn WorkspaceUIColumn, placement WorkspaceUIPaneDropPlacement) bool {
	if sourceColumn.ColumnID == targetColumn.ColumnID {
		return true
	}
	if sourceColumn.PlaneIndex != targetColumn.PlaneIndex {
		return false
	}
	planeColumns := columnsInPlaneSortedBySlot(columns, sourceColumn.PlaneIndex)
	sourceIndex := columnIndexByID(planeColumns, sourceColumn.ColumnID)
	targetIndex := columnIndexByID(planeColumns, targetColumn.ColumnID)
	if sourceIndex < 0 || targetIndex < 0 {
		return false
	}
	insertIndex := targetIndex
	if placement == WorkspaceUIPaneDropPlacementAfter {
		insertIndex += 1
	}
	if insertIndex > sourceIndex {
		insertIndex -= 1
	}
	return insertIndex == sourceIndex
}

func columnsWithoutPaneForReorder(columns []WorkspaceUIColumn, sourceColumn WorkspaceUIColumn, paneID string) []WorkspaceUIColumn {
	result := make([]WorkspaceUIColumn, 0, len(columns))
	for _, column := range columns {
		if column.ColumnID != sourceColumn.ColumnID {
			result = append(result, column)
			continue
		}
		nextColumn := column
		nextColumn.PaneIDs = make([]string, 0, len(column.PaneIDs))
		for _, candidateID := range column.PaneIDs {
			if candidateID != paneID {
				nextColumn.PaneIDs = append(nextColumn.PaneIDs, candidateID)
			}
		}
		if len(nextColumn.PaneIDs) > 0 {
			result = append(result, nextColumn)
		}
	}
	return result
}

func shiftedColumnsForSlotInsert(columns []WorkspaceUIColumn, planeIndex int, targetSlotIndex int) []WorkspaceUIColumn {
	result := make([]WorkspaceUIColumn, len(columns))
	for index, column := range columns {
		result[index] = column
		if column.PlaneIndex == planeIndex && column.SlotIndex >= targetSlotIndex {
			result[index].SlotIndex = column.SlotIndex + 1
		}
	}
	return result
}

func insertedReorderPaneColumn(columnID string, paneID string, referenceColumn WorkspaceUIColumn, planeIndex int, slotIndex int, index int) WorkspaceUIColumn {
	insertedColumn := WorkspaceUIColumn{
		ColumnID:       columnID,
		IdealWidthSpec: referenceColumn.IdealWidthSpec,
		Index:          index,
		PaneIDs:        []string{paneID},
		PlaneIndex:     planeIndex,
		SlotIndex:      slotIndex,
		WidthSpec:      referenceColumn.WidthSpec,
	}
	if referenceColumn.WidthSpec.Unit == ColumnWidthUnitProportion {
		value := referenceColumn.WidthSpec.Value
		if referenceColumn.PreviousProportionWidth != nil {
			value = *referenceColumn.PreviousProportionWidth
		}
		insertedColumn.PreviousProportionWidth = &value
	}
	return insertedColumn
}

func setPaneColumnForReorder(layout *WorkspaceUILayout, paneID string, columnID string, resetSizing bool) {
	for index := range layout.Panes {
		if layout.Panes[index].PaneID != paneID {
			continue
		}
		layout.Panes[index].ColumnID = columnID
		if resetSizing {
			layout.Panes[index].HeightPX = nil
			layout.Panes[index].Weight = 1
		}
		return
	}
}

func nonEmptyColumns(columns []WorkspaceUIColumn) []WorkspaceUIColumn {
	result := make([]WorkspaceUIColumn, 0, len(columns))
	for _, column := range columns {
		if len(column.PaneIDs) > 0 {
			result = append(result, column)
		}
	}
	return result
}

func reindexedWorkspaceUIColumns(columns []WorkspaceUIColumn) []WorkspaceUIColumn {
	planeIndexByOldIndex := densePlaneIndexMap(columns)
	result := append([]WorkspaceUIColumn{}, columns...)
	sort.SliceStable(result, func(left int, right int) bool {
		if result[left].PlaneIndex != result[right].PlaneIndex {
			return result[left].PlaneIndex < result[right].PlaneIndex
		}
		if result[left].SlotIndex != result[right].SlotIndex {
			return result[left].SlotIndex < result[right].SlotIndex
		}
		return result[left].Index < result[right].Index
	})
	for index := range result {
		result[index].Index = index
		if denseIndex, ok := planeIndexByOldIndex[result[index].PlaneIndex]; ok {
			result[index].PlaneIndex = denseIndex
		}
	}
	return result
}

func densePlaneIndexMap(columns []WorkspaceUIColumn) map[int]int {
	planeIndexes := make([]int, 0, len(columns))
	seen := map[int]bool{}
	for _, column := range columns {
		if seen[column.PlaneIndex] {
			continue
		}
		seen[column.PlaneIndex] = true
		planeIndexes = append(planeIndexes, column.PlaneIndex)
	}
	sort.Ints(planeIndexes)
	planeIndexByOldIndex := make(map[int]int, len(planeIndexes))
	for denseIndex, planeIndex := range planeIndexes {
		planeIndexByOldIndex[planeIndex] = denseIndex
	}
	return planeIndexByOldIndex
}

func columnsInPlaneSortedBySlot(columns []WorkspaceUIColumn, planeIndex int) []WorkspaceUIColumn {
	result := make([]WorkspaceUIColumn, 0, len(columns))
	for _, column := range columns {
		if column.PlaneIndex == planeIndex {
			result = append(result, column)
		}
	}
	sort.SliceStable(result, func(left int, right int) bool {
		if result[left].SlotIndex != result[right].SlotIndex {
			return result[left].SlotIndex < result[right].SlotIndex
		}
		return result[left].Index < result[right].Index
	})
	return result
}

func columnByIDAndPlane(columns []WorkspaceUIColumn, columnID string, planeIndex int) (WorkspaceUIColumn, bool) {
	index := columnIndexByIDAndPlane(columns, columnID, planeIndex)
	if index < 0 {
		return WorkspaceUIColumn{}, false
	}
	return columns[index], true
}

func columnIndexByIDAndPlane(columns []WorkspaceUIColumn, columnID string, planeIndex int) int {
	for index, column := range columns {
		if column.ColumnID == columnID && column.PlaneIndex == planeIndex {
			return index
		}
	}
	return -1
}

func columnIndexByID(columns []WorkspaceUIColumn, columnID string) int {
	for index, column := range columns {
		if column.ColumnID == columnID {
			return index
		}
	}
	return -1
}

func targetSlotIsOccupied(columns []WorkspaceUIColumn, planeIndex int, slotIndex int) bool {
	for _, column := range columns {
		if column.PlaneIndex == planeIndex && column.SlotIndex == slotIndex {
			return true
		}
	}
	return false
}

func nextWorkspaceUIColumnID(columns []WorkspaceUIColumn) string {
	next := 0
	for _, column := range columns {
		if !strings.HasPrefix(column.ColumnID, "workspace_column_") {
			continue
		}
		parsed, err := strconv.Atoi(strings.TrimPrefix(column.ColumnID, "workspace_column_"))
		if err != nil {
			continue
		}
		if parsed >= next {
			next = parsed + 1
		}
	}
	return fmt.Sprintf("workspace_column_%d", next)
}

func reorderOutcome(intent WorkspaceUIPaneReorderIntent, previous workspaceUIPaneLocation, next workspaceUIPaneLocation, application workspaceUIPaneReorderApplication) *WorkspaceUIPaneReorderOutcome {
	return &WorkspaceUIPaneReorderOutcome{
		ColumnID:            next.ColumnID,
		ColumnIndex:         next.ColumnIndex,
		CreatedColumnID:     application.createdColumnID,
		DestinationColumnID: application.destinationColumnID,
		IntentKind:          intent.Kind,
		PaneIndex:           next.PaneIndex,
		PlaneIndex:          next.PlaneIndex,
		PreviousColumnID:    previous.ColumnID,
		PreviousColumnIndex: previous.ColumnIndex,
		PreviousPaneIndex:   previous.PaneIndex,
		PreviousPlaneIndex:  previous.PlaneIndex,
		RemovedColumn:       application.removedColumn,
		ResetPaneSizing:     application.resetPaneSizing,
		TargetColumnID:      application.targetColumnID,
		TargetPaneID:        application.targetPaneID,
	}
}
