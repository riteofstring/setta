package workspaceui

import (
	"errors"
	"fmt"
	"sort"
	"strings"
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
	case WorkspaceUIPaneOperationKindClosePane, WorkspaceUIPaneOperationKindFocusPane, WorkspaceUIPaneOperationKindMovePane, WorkspaceUIPaneOperationKindRenamePane:
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
	case WorkspaceUIPaneOperationKindClosePane:
		return service.applyClosePaneOperation(*read.Layout, operation)
	case WorkspaceUIPaneOperationKindFocusPane:
		return service.applyFocusPaneOperation(*read.Layout, operation)
	case WorkspaceUIPaneOperationKindMovePane:
		return service.applyMovePaneOperation(*read.Layout, operation)
	case WorkspaceUIPaneOperationKindRenamePane:
		return service.applyRenamePaneOperation(*read.Layout, operation)
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
	switch operation.Kind {
	case WorkspaceUIPaneOperationKindClosePane:
		return validateClosePaneOperation(operation)
	case WorkspaceUIPaneOperationKindFocusPane:
		return validateFocusPaneOperation(operation)
	case WorkspaceUIPaneOperationKindMovePane:
		return validateMovePaneOperation(operation)
	case WorkspaceUIPaneOperationKindRenamePane:
		return validateRenamePaneOperation(operation)
	}
	return nil
}

func validateClosePaneOperation(operation WorkspaceUIPaneOperation) error {
	if operation.Close == nil {
		return errors.New("workspace pane close payload is required")
	}
	if operation.Move != nil {
		return errors.New("workspace pane operation move payload is only valid for move_pane")
	}
	if operation.Rename != nil {
		return errors.New("workspace pane operation rename payload is only valid for rename_pane")
	}
	if !validSurfaceCloseMode(operation.Close.SurfaceClose) {
		return fmt.Errorf("workspace pane close surfaceClose is unsupported: %s", operation.Close.SurfaceClose)
	}
	return nil
}

func validateFocusPaneOperation(operation WorkspaceUIPaneOperation) error {
	if operation.Close != nil {
		return errors.New("workspace pane operation close payload is only valid for close_pane")
	}
	if operation.Move != nil {
		return errors.New("workspace pane operation move payload is only valid for move_pane")
	}
	if operation.Rename != nil {
		return errors.New("workspace pane operation rename payload is only valid for rename_pane")
	}
	return nil
}

func validateMovePaneOperation(operation WorkspaceUIPaneOperation) error {
	if operation.Close != nil {
		return errors.New("workspace pane operation close payload is only valid for close_pane")
	}
	if operation.Rename != nil {
		return errors.New("workspace pane operation rename payload is only valid for rename_pane")
	}
	if operation.Move == nil {
		return errors.New("workspace pane move payload is required")
	}
	if !validPaneMoveDirection(operation.Move.Direction) {
		return fmt.Errorf("workspace pane move direction is unsupported: %s", operation.Move.Direction)
	}
	return nil
}

func validateRenamePaneOperation(operation WorkspaceUIPaneOperation) error {
	if operation.Close != nil {
		return errors.New("workspace pane operation close payload is only valid for close_pane")
	}
	if operation.Move != nil {
		return errors.New("workspace pane operation move payload is only valid for move_pane")
	}
	if operation.Rename == nil {
		return errors.New("workspace pane rename payload is required")
	}
	if operation.Rename.Title == "" {
		return errors.New("workspace pane rename title is required")
	}
	if strings.TrimSpace(operation.Rename.Title) != operation.Rename.Title {
		return errors.New("workspace pane rename title must not have surrounding whitespace")
	}
	return nil
}

func (service *Service) applyClosePaneOperation(layout WorkspaceUILayout, operation WorkspaceUIPaneOperation) (WorkspaceUIPaneOperationResult, error) {
	if operation.Close.SurfaceClose != WorkspaceUISurfaceCloseModeNone {
		return WorkspaceUIPaneOperationResult{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodeUnsupportedSurfaceClose,
			fmt.Errorf("workspace pane close currently supports only surfaceClose %s, got %s", WorkspaceUISurfaceCloseModeNone, operation.Close.SurfaceClose),
		)
	}

	previousLocation, ok := paneLocation(layout, operation.PaneID)
	if !ok {
		return WorkspaceUIPaneOperationResult{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodePaneNotFound,
			fmt.Errorf("workspace pane not found: %s", operation.PaneID),
		)
	}
	if len(layout.Panes) <= 1 {
		return WorkspaceUIPaneOperationResult{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodeLastPane,
			errors.New("workspace layout must keep at least one pane"),
		)
	}

	previousFocusedPaneID := layout.FocusedPaneID
	removedColumn := closePaneInLayout(&layout, operation.PaneID)
	if previousFocusedPaneID == operation.PaneID {
		nextFocusedPaneID, ok := focusPaneIDAfterClose(layout, previousLocation)
		if !ok {
			return WorkspaceUIPaneOperationResult{}, operationError(
				layout.WorkspaceID,
				operation,
				WorkspaceUIOperationErrorCodePaneNotFound,
				errors.New("workspace pane focus target not found after close"),
			)
		}
		layout.FocusedPaneID = nextFocusedPaneID
	}
	layout.Revision += 1
	saved, err := service.SaveLayout(layout)
	if err != nil {
		return WorkspaceUIPaneOperationResult{}, err
	}
	layout = saved

	return WorkspaceUIPaneOperationResult{
		WorkspaceID: layout.WorkspaceID,
		Revision:    layout.Revision,
		Layout:      layout,
		Changed:     true,
		OperationResult: WorkspaceUIPaneOperationOutcome{
			Kind: WorkspaceUIPaneOperationKindClosePane,
			Close: closeOutcome(
				operation.Close.SurfaceClose,
				previousLocation,
				removedColumn,
			),
			PaneID:                operation.PaneID,
			PreviousFocusedPaneID: previousFocusedPaneID,
			FocusedPaneID:         layout.FocusedPaneID,
		},
		BeforeAfterDimensions: []WorkspaceUIPaneDimensionChange{},
		Warnings:              []WorkspaceUIPaneOperationWarning{},
	}, nil
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

	changed := movePaneInLayout(&layout, operation.PaneID, previousLocation, operation.Move.Direction)
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
			Move:                  moveOutcome(operation.Move.Direction, previousLocation, nextLocation),
			PaneID:                operation.PaneID,
			PreviousFocusedPaneID: layout.FocusedPaneID,
			FocusedPaneID:         layout.FocusedPaneID,
		},
		BeforeAfterDimensions: []WorkspaceUIPaneDimensionChange{},
		Warnings:              []WorkspaceUIPaneOperationWarning{},
	}, nil
}

func (service *Service) applyRenamePaneOperation(layout WorkspaceUILayout, operation WorkspaceUIPaneOperation) (WorkspaceUIPaneOperationResult, error) {
	paneIndex := paneIndexByID(layout.Panes, operation.PaneID)
	if paneIndex < 0 {
		return WorkspaceUIPaneOperationResult{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodePaneNotFound,
			fmt.Errorf("workspace pane not found: %s", operation.PaneID),
		)
	}

	previousTitle := layout.Panes[paneIndex].Title
	changed := previousTitle != operation.Rename.Title
	if changed {
		layout.Panes[paneIndex].Title = operation.Rename.Title
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
			Kind:                  WorkspaceUIPaneOperationKindRenamePane,
			Rename:                renameOutcome(previousTitle, operation.Rename.Title),
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

func closePaneInLayout(layout *WorkspaceUILayout, paneID string) bool {
	panes := make([]WorkspaceUIPane, 0, len(layout.Panes)-1)
	for _, pane := range layout.Panes {
		if pane.PaneID != paneID {
			panes = append(panes, pane)
		}
	}
	layout.Panes = panes

	removedColumn := false
	for columnIndex := range layout.Columns {
		paneIDs := layout.Columns[columnIndex].PaneIDs
		filteredPaneIDs := make([]string, 0, len(paneIDs))
		for _, candidateID := range paneIDs {
			if candidateID != paneID {
				filteredPaneIDs = append(filteredPaneIDs, candidateID)
			}
		}
		layout.Columns[columnIndex].PaneIDs = filteredPaneIDs
		if len(filteredPaneIDs) == 0 {
			removedColumn = true
		}
	}
	if removedColumn {
		removeEmptyColumnsAndReindex(layout)
	}
	return removedColumn
}

func focusPaneIDAfterClose(layout WorkspaceUILayout, previous workspaceUIPaneLocation) (string, bool) {
	if len(layout.Columns) == 0 {
		return "", false
	}
	columnIndex := clampInt(previous.ColumnIndex, 0, len(layout.Columns)-1)
	column := layout.Columns[columnIndex]
	if len(column.PaneIDs) == 0 {
		return "", false
	}
	paneIndex := clampInt(previous.PaneIndex, 0, len(column.PaneIDs)-1)
	return column.PaneIDs[paneIndex], true
}

func closeOutcome(surfaceClose WorkspaceUISurfaceCloseMode, location workspaceUIPaneLocation, removedColumn bool) *WorkspaceUIPaneCloseOutcome {
	return &WorkspaceUIPaneCloseOutcome{
		ColumnID:      location.ColumnID,
		ColumnIndex:   location.ColumnIndex,
		PaneIndex:     location.PaneIndex,
		PlaneIndex:    location.PlaneIndex,
		RemovedColumn: removedColumn,
		SurfaceClose:  surfaceClose,
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

func renameOutcome(previousTitle string, title string) *WorkspaceUIPaneRenameOutcome {
	return &WorkspaceUIPaneRenameOutcome{
		PreviousTitle: previousTitle,
		Title:         title,
	}
}

func layoutHasPane(layout WorkspaceUILayout, paneID string) bool {
	_, ok := paneLocation(layout, paneID)
	return ok
}

func paneIndexByID(panes []WorkspaceUIPane, paneID string) int {
	for index, pane := range panes {
		if pane.PaneID == paneID {
			return index
		}
	}
	return -1
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

func validSurfaceCloseMode(mode WorkspaceUISurfaceCloseMode) bool {
	switch mode {
	case WorkspaceUISurfaceCloseModeForce,
		WorkspaceUISurfaceCloseModeNone,
		WorkspaceUISurfaceCloseModeSafe:
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
