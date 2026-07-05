package workspaceui

import (
	"errors"
	"fmt"
	"reflect"
)

type workspaceUIPaneOperationApplication struct {
	layout                WorkspaceUILayout
	changed               bool
	operationResult       WorkspaceUIPaneOperationOutcome
	beforeAfterDimensions []WorkspaceUIPaneDimensionChange
	warnings              []WorkspaceUIPaneOperationWarning
}

func (service *Service) applyPaneResizeOperations(workspaceID string, layout WorkspaceUILayout, operations []WorkspaceUIPaneOperation) (WorkspaceUIPaneResizeTransactionResult, error) {
	if len(operations) == 0 {
		return WorkspaceUIPaneResizeTransactionResult{}, resizeTransactionError(
			workspaceID,
			WorkspaceUIOperationErrorCodeInvalidOperation,
			errors.New("workspace pane resize transaction requires at least one operation"),
		)
	}
	for _, operation := range operations {
		if operation.Kind != WorkspaceUIPaneOperationKindResizePane {
			return WorkspaceUIPaneResizeTransactionResult{}, operationError(
				workspaceID,
				operation,
				WorkspaceUIOperationErrorCodeInvalidOperation,
				fmt.Errorf("workspace pane resize transaction supports only resize_pane operations, got %s", operation.Kind),
			)
		}
		if err := validatePaneOperation(operation); err != nil {
			return WorkspaceUIPaneResizeTransactionResult{}, operationError(
				workspaceID,
				operation,
				WorkspaceUIOperationErrorCodeInvalidOperation,
				err,
			)
		}
	}
	originalLayout := cloneWorkspaceUILayout(layout)
	layout = cloneWorkspaceUILayout(layout)
	operationResults := make([]WorkspaceUIPaneOperationOutcome, 0, len(operations))
	warnings := []WorkspaceUIPaneOperationWarning{}
	dimensions := workspaceUIPaneDimensionAccumulator{
		beforeByPaneID: map[string]WorkspaceUIPaneDimensions{},
	}
	for _, operation := range operations {
		application, err := applyResizePaneOperationToLayout(layout, operation)
		if err != nil {
			return WorkspaceUIPaneResizeTransactionResult{}, err
		}
		layout = application.layout
		operationResults = append(operationResults, application.operationResult)
		warnings = append(warnings, application.warnings...)
		dimensions.add(application.beforeAfterDimensions)
	}

	changed := !reflect.DeepEqual(originalLayout, layout)
	beforeAfterDimensions, err := dimensions.changes(layout)
	if err != nil {
		return WorkspaceUIPaneResizeTransactionResult{}, resizeTransactionError(
			workspaceID,
			WorkspaceUIOperationErrorCodePaneNotFound,
			err,
		)
	}
	if changed {
		layout.Revision += 1
		saved, err := service.SaveLayout(layout)
		if err != nil {
			return WorkspaceUIPaneResizeTransactionResult{}, err
		}
		layout = saved
	}

	return WorkspaceUIPaneResizeTransactionResult{
		WorkspaceID:           layout.WorkspaceID,
		Revision:              layout.Revision,
		Layout:                layout,
		Changed:               changed,
		OperationResults:      operationResults,
		BeforeAfterDimensions: beforeAfterDimensions,
		Warnings:              warnings,
	}, nil
}

func paneOperationResultFromResizeTransaction(transaction WorkspaceUIPaneResizeTransactionResult) WorkspaceUIPaneOperationResult {
	return WorkspaceUIPaneOperationResult{
		WorkspaceID:           transaction.WorkspaceID,
		Revision:              transaction.Revision,
		Layout:                transaction.Layout,
		Changed:               transaction.Changed,
		OperationResult:       transaction.OperationResults[0],
		BeforeAfterDimensions: transaction.BeforeAfterDimensions,
		Warnings:              transaction.Warnings,
	}
}

type workspaceUIPaneDimensionAccumulator struct {
	paneIDs        []string
	beforeByPaneID map[string]WorkspaceUIPaneDimensions
}

func (accumulator *workspaceUIPaneDimensionAccumulator) add(changes []WorkspaceUIPaneDimensionChange) {
	for _, change := range changes {
		if _, ok := accumulator.beforeByPaneID[change.PaneID]; ok {
			continue
		}
		accumulator.beforeByPaneID[change.PaneID] = change.Before
		accumulator.paneIDs = append(accumulator.paneIDs, change.PaneID)
	}
}

func (accumulator workspaceUIPaneDimensionAccumulator) changes(layout WorkspaceUILayout) ([]WorkspaceUIPaneDimensionChange, error) {
	changes := make([]WorkspaceUIPaneDimensionChange, 0, len(accumulator.paneIDs))
	for _, paneID := range accumulator.paneIDs {
		after, ok := paneDimensions(layout, paneID)
		if !ok {
			return nil, fmt.Errorf("workspace pane dimensions not found after resize transaction: %s", paneID)
		}
		changes = append(changes, WorkspaceUIPaneDimensionChange{
			PaneID: paneID,
			Before: accumulator.beforeByPaneID[paneID],
			After:  after,
		})
	}
	return changes, nil
}

func resizeTransactionError(workspaceID string, code WorkspaceUIOperationErrorCode, err error) *WorkspaceUIOperationError {
	return &WorkspaceUIOperationError{
		Code:          code,
		WorkspaceID:   workspaceID,
		OperationKind: WorkspaceUIPaneOperationKindResizePane,
		Err:           err,
	}
}

func cloneWorkspaceUILayout(layout WorkspaceUILayout) WorkspaceUILayout {
	cloned := layout
	cloned.Columns = make([]WorkspaceUIColumn, len(layout.Columns))
	for index, column := range layout.Columns {
		cloned.Columns[index] = column
		cloned.Columns[index].PaneIDs = append([]string(nil), column.PaneIDs...)
		if column.PreviousProportionWidth != nil {
			value := *column.PreviousProportionWidth
			cloned.Columns[index].PreviousProportionWidth = &value
		}
	}
	cloned.Panes = make([]WorkspaceUIPane, len(layout.Panes))
	for index, pane := range layout.Panes {
		cloned.Panes[index] = cloneWorkspaceUIPane(pane)
	}
	return cloned
}

func cloneWorkspaceUIPane(pane WorkspaceUIPane) WorkspaceUIPane {
	cloned := pane
	if pane.HeightPX != nil {
		heightPX := *pane.HeightPX
		cloned.HeightPX = &heightPX
	}
	if pane.TerminalConfig != nil {
		terminalConfig := *pane.TerminalConfig
		cloned.TerminalConfig = &terminalConfig
	}
	if pane.WorkflowNodeDetailsConfig != nil {
		cloned.WorkflowNodeDetailsConfig = cloneWorkflowNodeDetailsPaneConfig(pane.WorkflowNodeDetailsConfig)
	}
	return cloned
}
