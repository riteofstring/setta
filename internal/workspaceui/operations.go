package workspaceui

import (
	"errors"
	"fmt"
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
	if operation.Kind != WorkspaceUIPaneOperationKindFocusPane {
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
	return service.applyFocusPaneOperation(*read.Layout, operation)
}

func validatePaneOperation(operation WorkspaceUIPaneOperation) error {
	if operation.Kind == "" {
		return errors.New("workspace pane operation kind is required")
	}
	if operation.PaneID == "" {
		return errors.New("workspace pane operation paneId is required")
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

func layoutHasPane(layout WorkspaceUILayout, paneID string) bool {
	for _, pane := range layout.Panes {
		if pane.PaneID == paneID {
			return true
		}
	}
	return false
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
