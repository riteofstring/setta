package workspaceui

import (
	"errors"
	"fmt"
	"sort"
)

type WorkspaceUIOperationError struct {
	Code          WorkspaceUIOperationErrorCode
	WorkspaceID   string
	PaneID        string
	OperationKind WorkspaceUIPaneOperationKind
	Err           error
}

func (err *WorkspaceUIOperationError) Error() string {
	if err == nil {
		return ""
	}
	message := string(err.Code)
	if err.Err != nil {
		message = err.Err.Error()
	}
	if err.PaneID != "" {
		return fmt.Sprintf("workspace UI operation %s failed for workspace %s pane %s: %s", err.OperationKind, err.WorkspaceID, err.PaneID, message)
	}
	return fmt.Sprintf("workspace UI operation %s failed for workspace %s: %s", err.OperationKind, err.WorkspaceID, message)
}

func (err *WorkspaceUIOperationError) Unwrap() error {
	if err == nil {
		return nil
	}
	return err.Err
}

func (service *Service) ApplyPaneOperation(workspaceID string, operation WorkspaceUIPaneOperation) (WorkspaceUIPaneOperationResult, error) {
	if err := validatePaneOperation(operation); err != nil {
		return WorkspaceUIPaneOperationResult{}, operationError(workspaceID, operation, WorkspaceUIOperationErrorCodeInvalidOperation, err)
	}
	switch operation.Kind {
	case WorkspaceUIPaneOperationKindFocusPane, WorkspaceUIPaneOperationKindMovePane:
	default:
		return WorkspaceUIPaneOperationResult{}, operationError(
			workspaceID,
			operation,
			WorkspaceUIOperationErrorCodeUnsupportedOperation,
			fmt.Errorf("unsupported workspace pane operation kind: %s", operation.Kind),
		)
	}

	read, err := service.ReadLayout(workspaceID)
	if err != nil {
		return WorkspaceUIPaneOperationResult{}, err
	}
	if read.Layout == nil {
		return WorkspaceUIPaneOperationResult{}, operationError(
			workspaceID,
			operation,
			WorkspaceUIOperationErrorCodeMissingLayout,
			errors.New("workspace UI layout is required before applying pane operations"),
		)
	}
	switch operation.Kind {
	case WorkspaceUIPaneOperationKindFocusPane:
		return service.applyFocusPaneOperation(*read.Layout, operation)
	case WorkspaceUIPaneOperationKindMovePane:
		return service.applyMovePaneOperation(*read.Layout, operation)
	default:
		return WorkspaceUIPaneOperationResult{}, operationError(
			workspaceID,
			operation,
			WorkspaceUIOperationErrorCodeUnsupportedOperation,
			fmt.Errorf("unsupported workspace pane operation kind: %s", operation.Kind),
		)
	}
}

func validatePaneOperation(operation WorkspaceUIPaneOperation) error {
	if operation.Kind == "" {
		return errors.New("workspace pane operation kind is required")
	}
	if operation.PaneID == "" {
		return errors.New("workspace pane operation paneId is required")
	}
	if operation.Kind == WorkspaceUIPaneOperationKindMovePane && !validPaneMoveDirection(operation.Direction) {
		return fmt.Errorf("workspace pane move direction is unsupported: %s", operation.Direction)
	}
	return nil
}

func (service *Service) applyFocusPaneOperation(layout WorkspaceUILayout, operation WorkspaceUIPaneOperation) (WorkspaceUIPaneOperationResult, error) {
	if !layoutHasPane(layout, operation.PaneID) {
		return WorkspaceUIPaneOperationResult{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodePaneNotFound,
			fmt.Errorf("workspace pane not found: %s", operation.PaneID),
		)
	}

	previousFocusedPaneID := layout.FocusedPaneID
	changed := previousFocusedPaneID != operation.PaneID
	if changed {
		layout.FocusedPaneID = operation.PaneID
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
			Kind:                  WorkspaceUIPaneOperationKindFocusPane,
			PaneID:                operation.PaneID,
			PreviousFocusedPaneID: previousFocusedPaneID,
			FocusedPaneID:         layout.FocusedPaneID,
		},
		BeforeAfterDimensions: []WorkspaceUIPaneDimensionChange{},
		Warnings:              []WorkspaceUIPaneOperationWarning{},
	}, nil
}

func (service *Service) applyMovePaneOperation(layout WorkspaceUILayout, operation WorkspaceUIPaneOperation) (WorkspaceUIPaneOperationResult, error) {
	previousLocation, ok := paneLocation(layout, operation.PaneID)
	if !ok {
		return WorkspaceUIPaneOperationResult{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodePaneNotFound,
			fmt.Errorf("workspace pane not found: %s", operation.PaneID),
		)
	}

	changed := movePaneInLayout(&layout, operation.PaneID, previousLocation, operation.Direction)
	nextLocation := previousLocation
	if changed {
		var ok bool
		nextLocation, ok = paneLocation(layout, operation.PaneID)
		if !ok {
			return WorkspaceUIPaneOperationResult{}, operationError(
				layout.WorkspaceID,
				operation,
				WorkspaceUIOperationErrorCodePaneNotFound,
				fmt.Errorf("workspace pane not found after move: %s", operation.PaneID),
			)
		}
		layout.Revision += 1
		saved, err := service.SaveLayout(layout)
		if err != nil {
			return WorkspaceUIPaneOperationResult{}, err
		}
		layout = saved
		nextLocation, _ = paneLocation(layout, operation.PaneID)
	}

	return WorkspaceUIPaneOperationResult{
		WorkspaceID: layout.WorkspaceID,
		Revision:    layout.Revision,
		Layout:      layout,
		Changed:     changed,
		OperationResult: WorkspaceUIPaneOperationOutcome{
			Kind:                  WorkspaceUIPaneOperationKindMovePane,
			Move:                  moveOutcome(operation.Direction, previousLocation, nextLocation),
			PaneID:                operation.PaneID,
			PreviousFocusedPaneID: layout.FocusedPaneID,
			FocusedPaneID:         layout.FocusedPaneID,
		},
		BeforeAfterDimensions: []WorkspaceUIPaneDimensionChange{},
		Warnings:              []WorkspaceUIPaneOperationWarning{},
	}, nil
}

type workspaceUIPaneLocation struct {
	ColumnID         string
	ColumnIndex      int
	PaneIndex        int
	PlaneColumnIndex int
	PlaneIndex       int
}

func movePaneInLayout(layout *WorkspaceUILayout, paneID string, source workspaceUIPaneLocation, direction WorkspaceUIPaneMoveDirection) bool {
	switch direction {
	case WorkspaceUIPaneMoveDirectionUp, WorkspaceUIPaneMoveDirectionDown:
		return movePaneWithinColumn(layout, source, direction)
	case WorkspaceUIPaneMoveDirectionLeft, WorkspaceUIPaneMoveDirectionRight:
		return movePaneToAdjacentColumn(layout, paneID, source, direction)
	default:
		return false
	}
}

func movePaneWithinColumn(layout *WorkspaceUILayout, source workspaceUIPaneLocation, direction WorkspaceUIPaneMoveDirection) bool {
	if source.ColumnIndex < 0 || source.ColumnIndex >= len(layout.Columns) {
		return false
	}
	paneIDs := layout.Columns[source.ColumnIndex].PaneIDs
	offset := 1
	if direction == WorkspaceUIPaneMoveDirectionUp {
		offset = -1
	}
	targetPaneIndex := clampInt(source.PaneIndex+offset, 0, len(paneIDs)-1)
	if targetPaneIndex == source.PaneIndex {
		return false
	}
	layout.Columns[source.ColumnIndex].PaneIDs = moveString(paneIDs, source.PaneIndex, targetPaneIndex)
	return true
}

func movePaneToAdjacentColumn(layout *WorkspaceUILayout, paneID string, source workspaceUIPaneLocation, direction WorkspaceUIPaneMoveDirection) bool {
	planeColumnIndexes := columnIndexesInPlane(layout.Columns, source.PlaneIndex)
	targetPlaneColumnIndex := source.PlaneColumnIndex + 1
	if direction == WorkspaceUIPaneMoveDirectionLeft {
		targetPlaneColumnIndex = source.PlaneColumnIndex - 1
	}
	targetPlaneColumnIndex = clampInt(targetPlaneColumnIndex, 0, len(planeColumnIndexes)-1)
	if targetPlaneColumnIndex == source.PlaneColumnIndex {
		return false
	}
	targetColumnIndex := planeColumnIndexes[targetPlaneColumnIndex]
	if targetColumnIndex == source.ColumnIndex {
		return false
	}

	layout.Columns[source.ColumnIndex].PaneIDs = removeStringAt(layout.Columns[source.ColumnIndex].PaneIDs, source.PaneIndex)
	layout.Columns[targetColumnIndex].PaneIDs = append(layout.Columns[targetColumnIndex].PaneIDs, paneID)
	setPaneColumnID(layout, paneID, layout.Columns[targetColumnIndex].ColumnID)
	removeEmptyColumnsAndReindex(layout)
	return true
}

func moveOutcome(direction WorkspaceUIPaneMoveDirection, previous workspaceUIPaneLocation, next workspaceUIPaneLocation) *WorkspaceUIPaneMoveOutcome {
	return &WorkspaceUIPaneMoveOutcome{
		ColumnID:            next.ColumnID,
		ColumnIndex:         next.ColumnIndex,
		Direction:           direction,
		PaneIndex:           next.PaneIndex,
		PlaneIndex:          next.PlaneIndex,
		PreviousColumnID:    previous.ColumnID,
		PreviousColumnIndex: previous.ColumnIndex,
		PreviousPaneIndex:   previous.PaneIndex,
		PreviousPlaneIndex:  previous.PlaneIndex,
	}
}

func layoutHasPane(layout WorkspaceUILayout, paneID string) bool {
	_, ok := paneLocation(layout, paneID)
	return ok
}

func paneLocation(layout WorkspaceUILayout, paneID string) (workspaceUIPaneLocation, bool) {
	for columnIndex, column := range layout.Columns {
		for paneIndex, candidateID := range column.PaneIDs {
			if candidateID != paneID {
				continue
			}
			return workspaceUIPaneLocation{
				ColumnID:         column.ColumnID,
				ColumnIndex:      columnIndex,
				PaneIndex:        paneIndex,
				PlaneColumnIndex: planeColumnIndex(layout.Columns, column),
				PlaneIndex:       column.PlaneIndex,
			}, true
		}
	}
	return workspaceUIPaneLocation{}, false
}

func planeColumnIndex(columns []WorkspaceUIColumn, column WorkspaceUIColumn) int {
	index := 0
	for _, candidate := range columns {
		if candidate.PlaneIndex != column.PlaneIndex {
			continue
		}
		if candidate.ColumnID == column.ColumnID {
			return index
		}
		index += 1
	}
	return 0
}

func columnIndexesInPlane(columns []WorkspaceUIColumn, planeIndex int) []int {
	indexes := make([]int, 0, len(columns))
	for index, column := range columns {
		if column.PlaneIndex == planeIndex {
			indexes = append(indexes, index)
		}
	}
	return indexes
}

func setPaneColumnID(layout *WorkspaceUILayout, paneID string, columnID string) {
	for index := range layout.Panes {
		if layout.Panes[index].PaneID == paneID {
			layout.Panes[index].ColumnID = columnID
			return
		}
	}
}

func removeEmptyColumnsAndReindex(layout *WorkspaceUILayout) {
	columns := make([]WorkspaceUIColumn, 0, len(layout.Columns))
	for _, column := range layout.Columns {
		if len(column.PaneIDs) > 0 {
			columns = append(columns, column)
		}
	}
	sort.SliceStable(columns, func(left, right int) bool {
		if columns[left].PlaneIndex != columns[right].PlaneIndex {
			return columns[left].PlaneIndex < columns[right].PlaneIndex
		}
		if columns[left].SlotIndex != columns[right].SlotIndex {
			return columns[left].SlotIndex < columns[right].SlotIndex
		}
		return columns[left].Index < columns[right].Index
	})
	for index := range columns {
		columns[index].Index = index
	}
	layout.Columns = columns
}

func moveString(values []string, from int, to int) []string {
	if from == to {
		return values
	}
	value := values[from]
	values = removeStringAt(values, from)
	prefix := append([]string{}, values[:to]...)
	prefix = append(prefix, value)
	return append(prefix, values[to:]...)
}

func removeStringAt(values []string, index int) []string {
	result := append([]string{}, values[:index]...)
	return append(result, values[index+1:]...)
}

func clampInt(value int, minValue int, maxValue int) int {
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}

func validPaneMoveDirection(direction WorkspaceUIPaneMoveDirection) bool {
	switch direction {
	case WorkspaceUIPaneMoveDirectionDown,
		WorkspaceUIPaneMoveDirectionLeft,
		WorkspaceUIPaneMoveDirectionRight,
		WorkspaceUIPaneMoveDirectionUp:
		return true
	default:
		return false
	}
}

func operationError(workspaceID string, operation WorkspaceUIPaneOperation, code WorkspaceUIOperationErrorCode, err error) *WorkspaceUIOperationError {
	return &WorkspaceUIOperationError{
		Code:          code,
		WorkspaceID:   workspaceID,
		PaneID:        operation.PaneID,
		OperationKind: operation.Kind,
		Err:           err,
	}
}
