package main

import (
	"errors"
	"fmt"

	"setta/internal/workspaceui"
)

func validateWorkspaceLayoutOperationResponse(response workspaceui.WorkspaceUILayoutOperationResult, workspaceID string, input workspaceui.WorkspaceUILayoutOperations) error {
	if err := validateWorkspaceLayoutOperationEnvelope(response, workspaceID); err != nil {
		return err
	}
	if response.OperationResults == nil {
		return errors.New("workspace layout operation returned missing operationResults array")
	}
	if len(response.OperationResults) != len(input.Operations) {
		return fmt.Errorf("workspace layout operation returned %d operation results, want %d", len(response.OperationResults), len(input.Operations))
	}
	for index, operation := range input.Operations {
		if err := validateWorkspaceLayoutOperationOutcome(response, index, operation); err != nil {
			return err
		}
	}
	if response.BeforeAfterDimensions == nil {
		return errors.New("workspace layout operation returned missing beforeAfterDimensions array")
	}
	if response.Warnings == nil {
		return errors.New("workspace layout operation returned missing warnings array")
	}
	return nil
}

func validateWorkspaceLayoutOperationEnvelope(response workspaceui.WorkspaceUILayoutOperationResult, workspaceID string) error {
	if response.WorkspaceID != workspaceID {
		return fmt.Errorf("workspace layout operation returned workspaceId %s, want %s", response.WorkspaceID, workspaceID)
	}
	if response.Revision <= 0 {
		return fmt.Errorf("workspace layout operation returned invalid revision %d", response.Revision)
	}
	if response.Layout.WorkspaceID != workspaceID {
		return fmt.Errorf("workspace layout operation returned layout workspaceId %s, want %s", response.Layout.WorkspaceID, workspaceID)
	}
	if response.Layout.SchemaVersion != workspaceui.SchemaVersion {
		return fmt.Errorf("workspace layout operation returned layout schemaVersion %d, want %d", response.Layout.SchemaVersion, workspaceui.SchemaVersion)
	}
	if response.Layout.Revision != response.Revision {
		return fmt.Errorf("workspace layout operation returned layout revision %d, want %d", response.Layout.Revision, response.Revision)
	}
	if response.Layout.Columns == nil {
		return errors.New("workspace layout operation returned missing layout columns array")
	}
	if response.Layout.Panes == nil {
		return errors.New("workspace layout operation returned missing layout panes array")
	}
	return nil
}

func validateWorkspaceLayoutOperationOutcome(response workspaceui.WorkspaceUILayoutOperationResult, index int, operation workspaceui.WorkspaceUIPaneOperation) error {
	outcome := response.OperationResults[index]
	paneResponse := workspaceui.WorkspaceUIPaneOperationResult{
		WorkspaceID:           response.WorkspaceID,
		Revision:              response.Revision,
		Layout:                response.Layout,
		Changed:               response.Changed,
		OperationResult:       outcome,
		BeforeAfterDimensions: response.BeforeAfterDimensions,
		Warnings:              response.Warnings,
	}
	if err := validateWorkspacePaneOperationOutcome(paneResponse, operation); err != nil {
		return fmt.Errorf("workspace layout operation outcome %d is invalid: %w", index, err)
	}
	return nil
}
