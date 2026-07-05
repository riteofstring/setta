package workspaceui

import "fmt"

func (service *Service) applyResizeColumnOperation(layout WorkspaceUILayout, operation WorkspaceUIPaneOperation) (WorkspaceUIPaneOperationResult, error) {
	application, err := applyResizeColumnOperationToLayout(cloneWorkspaceUILayout(layout), operation)
	if err != nil {
		return WorkspaceUIPaneOperationResult{}, err
	}
	layout = application.layout
	if application.changed {
		layout.Revision += 1
		saved, err := service.SaveLayout(layout)
		if err != nil {
			return WorkspaceUIPaneOperationResult{}, err
		}
		layout = saved
	}
	return WorkspaceUIPaneOperationResult{
		WorkspaceID:           layout.WorkspaceID,
		Revision:              layout.Revision,
		Layout:                layout,
		Changed:               application.changed,
		OperationResult:       application.operationResult,
		BeforeAfterDimensions: application.beforeAfterDimensions,
		Warnings:              application.warnings,
	}, nil
}

func applyResizePaneWidthOperationToLayout(layout WorkspaceUILayout, operation WorkspaceUIPaneOperation, location workspaceUIPaneLocation) (workspaceUIPaneOperationApplication, error) {
	targetColumn := layout.Columns[location.ColumnIndex]
	return applyResizeColumnWidthOperationToLayout(layout, operation, targetColumn)
}

func applyResizeColumnOperationToLayout(layout WorkspaceUILayout, operation WorkspaceUIPaneOperation) (workspaceUIPaneOperationApplication, error) {
	columnIndex := columnIndexByID(layout.Columns, operation.ResizeColumn.ColumnID)
	if columnIndex < 0 {
		return workspaceUIPaneOperationApplication{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodeColumnNotFound,
			fmt.Errorf("workspace column not found: %s", operation.ResizeColumn.ColumnID),
		)
	}
	return applyResizeColumnWidthOperationToLayout(layout, operation, layout.Columns[columnIndex])
}

func applyResizeColumnWidthOperationToLayout(layout WorkspaceUILayout, operation WorkspaceUIPaneOperation, targetColumn WorkspaceUIColumn) (workspaceUIPaneOperationApplication, error) {
	var requestedWidthSpec ColumnWidthSpec
	if operation.Kind == WorkspaceUIPaneOperationKindResizeColumn {
		requestedWidthSpec = operation.ResizeColumn.WidthSpec
	} else {
		requestedWidthSpec = *operation.Resize.WidthSpec
	}
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
			Kind:                  operation.Kind,
			Resize:                resizeOutcome(targetColumn, widthSpec),
			PaneID:                operation.PaneID,
			PreviousFocusedPaneID: layout.FocusedPaneID,
			FocusedPaneID:         layout.FocusedPaneID,
		},
		beforeAfterDimensions: dimensionChanges,
		warnings:              resizeWidthWarnings(requestedWidthSpec, widthSpec),
	}, nil
}
