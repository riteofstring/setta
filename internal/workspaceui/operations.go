package workspaceui

import (
	"errors"
	"fmt"
	"math"
	"sort"
	"strconv"
)

const (
	maximumColumnWidthProportion = 1
	minimumColumnWidthProportion = 0.1
	minimumColumnWidthPX         = 96
	minimumPaneHeightPX          = 96
	minimumPaneWeight            = 0.1
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
	case WorkspaceUIPaneOperationKindClosePane,
		WorkspaceUIPaneOperationKindFocusPane,
		WorkspaceUIPaneOperationKindMovePane,
		WorkspaceUIPaneOperationKindRenamePane,
		WorkspaceUIPaneOperationKindReorderPane,
		WorkspaceUIPaneOperationKindResizePane:
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
	case WorkspaceUIPaneOperationKindReorderPane:
		return service.applyReorderPaneOperation(*read.Layout, operation)
	case WorkspaceUIPaneOperationKindResizePane:
		return service.applyResizePaneOperation(*read.Layout, operation)
	default:
		return WorkspaceUIPaneOperationResult{}, operationError(
			workspaceID,
			operation,
			WorkspaceUIOperationErrorCodeUnsupportedOperation,
			fmt.Errorf("unsupported workspace pane operation kind: %s", operation.Kind),
		)
	}
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

func (service *Service) applyResizePaneOperation(layout WorkspaceUILayout, operation WorkspaceUIPaneOperation) (WorkspaceUIPaneOperationResult, error) {
	transaction, err := service.applyPaneResizeOperations(layout.WorkspaceID, layout, []WorkspaceUIPaneOperation{operation})
	if err != nil {
		return WorkspaceUIPaneOperationResult{}, err
	}
	return paneOperationResultFromResizeTransaction(transaction), nil
}

func applyResizePaneOperationToLayout(layout WorkspaceUILayout, operation WorkspaceUIPaneOperation) (workspaceUIPaneOperationApplication, error) {
	location, ok := paneLocation(layout, operation.PaneID)
	if !ok {
		return workspaceUIPaneOperationApplication{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodePaneNotFound,
			fmt.Errorf("workspace pane not found: %s", operation.PaneID),
		)
	}
	if operation.Resize.WidthSpec != nil {
		return applyResizePaneWidthOperationToLayout(layout, operation, location)
	}
	if operation.Resize.Split != nil {
		return applyResizePaneSplitOperationToLayout(layout, operation, location)
	}
	return applyResizePaneHeightOperationToLayout(layout, operation, location)
}

func applyResizePaneWidthOperationToLayout(layout WorkspaceUILayout, operation WorkspaceUIPaneOperation, location workspaceUIPaneLocation) (workspaceUIPaneOperationApplication, error) {
	targetColumn := layout.Columns[location.ColumnIndex]
	requestedWidthSpec := *operation.Resize.WidthSpec
	widthSpec := normalizedResizeColumnWidthSpec(requestedWidthSpec)
	beforeDimensions, err := paneDimensionSnapshotsForSlot(layout, targetColumn.SlotIndex)
	if err != nil {
		return workspaceUIPaneOperationApplication{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodePaneNotFound,
			err,
		)
	}
	changed := resizeColumnsInSlot(&layout, targetColumn.SlotIndex, widthSpec)
	dimensionChanges, err := paneDimensionChanges(layout, beforeDimensions)
	if err != nil {
		return workspaceUIPaneOperationApplication{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodePaneNotFound,
			err,
		)
	}

	return workspaceUIPaneOperationApplication{
		layout:  layout,
		changed: changed,
		operationResult: WorkspaceUIPaneOperationOutcome{
			Kind:                  WorkspaceUIPaneOperationKindResizePane,
			Resize:                resizeOutcome(targetColumn, widthSpec),
			PaneID:                operation.PaneID,
			PreviousFocusedPaneID: layout.FocusedPaneID,
			FocusedPaneID:         layout.FocusedPaneID,
		},
		beforeAfterDimensions: dimensionChanges,
		warnings:              resizeWidthWarnings(requestedWidthSpec, widthSpec),
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

func resizeOutcome(targetColumn WorkspaceUIColumn, widthSpec ColumnWidthSpec) *WorkspaceUIPaneResizeOutcome {
	return &WorkspaceUIPaneResizeOutcome{
		PreviousWidthSpec: targetColumn.WidthSpec,
		SlotIndex:         targetColumn.SlotIndex,
		TargetColumnID:    targetColumn.ColumnID,
		WidthSpec:         widthSpec,
	}
}

func normalizedResizeColumnWidthSpec(widthSpec ColumnWidthSpec) ColumnWidthSpec {
	switch widthSpec.Unit {
	case ColumnWidthUnitPX:
		return ColumnWidthSpec{
			Unit:  ColumnWidthUnitPX,
			Value: math.Max(minimumColumnWidthPX, widthSpec.Value),
		}
	case ColumnWidthUnitProportion:
		return ColumnWidthSpec{
			Unit:  ColumnWidthUnitProportion,
			Value: math.Min(maximumColumnWidthProportion, math.Max(minimumColumnWidthProportion, widthSpec.Value)),
		}
	default:
		return widthSpec
	}
}

func resizeColumnsInSlot(layout *WorkspaceUILayout, slotIndex int, widthSpec ColumnWidthSpec) bool {
	changed := false
	for index := range layout.Columns {
		if layout.Columns[index].SlotIndex != slotIndex {
			continue
		}
		if !columnWidthSpecsEqual(layout.Columns[index].WidthSpec, widthSpec) {
			layout.Columns[index].WidthSpec = widthSpec
			changed = true
		}
		if widthSpec.Unit == ColumnWidthUnitProportion && !optionalFloatEquals(layout.Columns[index].PreviousProportionWidth, widthSpec.Value) {
			value := widthSpec.Value
			layout.Columns[index].PreviousProportionWidth = &value
			changed = true
		}
	}
	return changed
}

type workspaceUIPaneDimensionSnapshot struct {
	PaneID    string
	Dimension WorkspaceUIPaneDimensions
}

func paneDimensionSnapshotsForSlot(layout WorkspaceUILayout, slotIndex int) ([]workspaceUIPaneDimensionSnapshot, error) {
	dimensions := []workspaceUIPaneDimensionSnapshot{}
	for _, column := range layout.Columns {
		if column.SlotIndex != slotIndex {
			continue
		}
		for _, paneID := range column.PaneIDs {
			dimension, ok := paneDimensions(layout, paneID)
			if !ok {
				return nil, fmt.Errorf("workspace pane dimensions not found: %s", paneID)
			}
			dimensions = append(dimensions, workspaceUIPaneDimensionSnapshot{
				PaneID:    paneID,
				Dimension: dimension,
			})
		}
	}
	return dimensions, nil
}

func paneDimensionChanges(layout WorkspaceUILayout, before []workspaceUIPaneDimensionSnapshot) ([]WorkspaceUIPaneDimensionChange, error) {
	changes := make([]WorkspaceUIPaneDimensionChange, 0, len(before))
	for _, snapshot := range before {
		after, ok := paneDimensions(layout, snapshot.PaneID)
		if !ok {
			return nil, fmt.Errorf("workspace pane dimensions not found after resize: %s", snapshot.PaneID)
		}
		changes = append(changes, WorkspaceUIPaneDimensionChange{
			PaneID: snapshot.PaneID,
			Before: snapshot.Dimension,
			After:  after,
		})
	}
	return changes, nil
}

func paneDimensions(layout WorkspaceUILayout, paneID string) (WorkspaceUIPaneDimensions, bool) {
	location, ok := paneLocation(layout, paneID)
	if !ok {
		return WorkspaceUIPaneDimensions{}, false
	}
	paneIndex := paneIndexByID(layout.Panes, paneID)
	if paneIndex < 0 {
		return WorkspaceUIPaneDimensions{}, false
	}
	column := layout.Columns[location.ColumnIndex]
	return WorkspaceUIPaneDimensions{
		HeightPX:  cloneIntPointer(layout.Panes[paneIndex].HeightPX),
		ColumnID:  column.ColumnID,
		Weight:    layout.Panes[paneIndex].Weight,
		WidthSpec: column.WidthSpec,
	}, true
}

func resizeWidthWarnings(requested ColumnWidthSpec, normalized ColumnWidthSpec) []WorkspaceUIPaneOperationWarning {
	if columnWidthSpecsEqual(requested, normalized) {
		return []WorkspaceUIPaneOperationWarning{}
	}
	return []WorkspaceUIPaneOperationWarning{
		{
			Code:    "column_width_normalized",
			Message: "workspace pane resize widthSpec was normalized",
			Fields: map[string]string{
				"requestedUnit":  string(requested.Unit),
				"requestedValue": formatFloat(requested.Value),
				"widthSpecUnit":  string(normalized.Unit),
				"widthSpecValue": formatFloat(normalized.Value),
			},
		},
	}
}

func columnWidthSpecsEqual(left ColumnWidthSpec, right ColumnWidthSpec) bool {
	return left.Unit == right.Unit && left.Value == right.Value
}

func optionalFloatEquals(value *float64, expected float64) bool {
	return value != nil && *value == expected
}

func formatFloat(value float64) string {
	return strconv.FormatFloat(value, 'f', -1, 64)
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
