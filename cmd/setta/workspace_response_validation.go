package main

import (
	"errors"
	"fmt"

	"setta/internal/workspaceui"
)

func validateWorkspaceSchemaResponse(schema workspaceui.WorkspaceUISchema) error {
	if schema.SchemaVersion <= 0 {
		return fmt.Errorf("workspace schema returned invalid schemaVersion %d", schema.SchemaVersion)
	}
	if schema.LayoutSchemaVersion != workspaceui.SchemaVersion {
		return fmt.Errorf("workspace schema returned layoutSchemaVersion %d, want %d", schema.LayoutSchemaVersion, workspaceui.SchemaVersion)
	}
	if len(schema.ColumnWidthUnits) == 0 {
		return errors.New("workspace schema returned no column width units")
	}
	if len(schema.PaneReadModes) == 0 {
		return errors.New("workspace schema returned no pane read modes")
	}
	if len(schema.PaneRuntimeStatuses) == 0 {
		return errors.New("workspace schema returned no pane runtime statuses")
	}
	if len(schema.PaneTones) == 0 {
		return errors.New("workspace schema returned no pane tones")
	}
	if len(schema.SurfaceCloseModes) == 0 {
		return errors.New("workspace schema returned no surface close modes")
	}
	if len(schema.SurfaceKinds) == 0 {
		return errors.New("workspace schema returned no surface kinds")
	}
	return nil
}

func validateWorkspacePaneListResponse(response workspaceui.WorkspaceUIPaneListResult, workspaceID string) error {
	if response.WorkspaceID != workspaceID {
		return fmt.Errorf("workspace panes list returned workspaceId %s, want %s", response.WorkspaceID, workspaceID)
	}
	if response.Panes == nil {
		return errors.New("workspace panes list returned missing panes array")
	}
	if err := validateWorkspaceSchemaResponse(response.Schema); err != nil {
		return fmt.Errorf("workspace panes list schema is invalid: %w", err)
	}
	seenPaneIDs := map[string]bool{}
	seenSurfaceIDs := map[string]bool{}
	for index, pane := range response.Panes {
		if err := validateWorkspacePaneDescriptor(pane); err != nil {
			return fmt.Errorf("workspace panes list descriptor %d is invalid: %w", index, err)
		}
		if seenPaneIDs[pane.PaneID] {
			return fmt.Errorf("workspace panes list returned duplicate paneId %s", pane.PaneID)
		}
		seenPaneIDs[pane.PaneID] = true
		if seenSurfaceIDs[pane.SurfaceID] {
			return fmt.Errorf("workspace panes list returned duplicate surfaceId %s", pane.SurfaceID)
		}
		seenSurfaceIDs[pane.SurfaceID] = true
	}
	return nil
}

func validateWorkspacePaneReadResponse(response workspaceui.WorkspaceUIPaneReadResult, workspaceID string, paneID string) error {
	if response.WorkspaceID != workspaceID {
		return fmt.Errorf("workspace pane read returned workspaceId %s, want %s", response.WorkspaceID, workspaceID)
	}
	if err := validateWorkspaceSchemaResponse(response.Schema); err != nil {
		return fmt.Errorf("workspace pane read schema is invalid: %w", err)
	}
	if response.Pane.PaneID != paneID {
		return fmt.Errorf("workspace pane read returned paneId %s, want %s", response.Pane.PaneID, paneID)
	}
	return validateWorkspacePaneDescriptor(response.Pane)
}

func validateWorkspacePaneOperationResponse(response workspaceui.WorkspaceUIPaneOperationResult, workspaceID string, operation workspaceui.WorkspaceUIPaneOperation) error {
	if err := validateWorkspacePaneOperationEnvelope(response, workspaceID); err != nil {
		return err
	}
	if err := validateWorkspacePaneOperationOutcome(response, operation); err != nil {
		return err
	}
	if response.BeforeAfterDimensions == nil {
		return errors.New("workspace pane operation returned missing beforeAfterDimensions array")
	}
	if response.Warnings == nil {
		return errors.New("workspace pane operation returned missing warnings array")
	}
	return nil
}

func validateWorkspacePaneOperationEnvelope(response workspaceui.WorkspaceUIPaneOperationResult, workspaceID string) error {
	if response.WorkspaceID != workspaceID {
		return fmt.Errorf("workspace pane operation returned workspaceId %s, want %s", response.WorkspaceID, workspaceID)
	}
	if response.Revision <= 0 {
		return fmt.Errorf("workspace pane operation returned invalid revision %d", response.Revision)
	}
	if response.Layout.WorkspaceID != workspaceID {
		return fmt.Errorf("workspace pane operation returned layout workspaceId %s, want %s", response.Layout.WorkspaceID, workspaceID)
	}
	if response.Layout.SchemaVersion != workspaceui.SchemaVersion {
		return fmt.Errorf("workspace pane operation returned layout schemaVersion %d, want %d", response.Layout.SchemaVersion, workspaceui.SchemaVersion)
	}
	if response.Layout.Revision != response.Revision {
		return fmt.Errorf("workspace pane operation returned layout revision %d, want %d", response.Layout.Revision, response.Revision)
	}
	if response.Layout.Columns == nil {
		return errors.New("workspace pane operation returned missing layout columns array")
	}
	if response.Layout.Panes == nil {
		return errors.New("workspace pane operation returned missing layout panes array")
	}
	return nil
}

func validateWorkspacePaneOperationOutcome(response workspaceui.WorkspaceUIPaneOperationResult, operation workspaceui.WorkspaceUIPaneOperation) error {
	if response.OperationResult.Kind != operation.Kind {
		return fmt.Errorf("workspace pane operation outcome kind = %s, want %s", response.OperationResult.Kind, operation.Kind)
	}
	if operation.Kind != workspaceui.WorkspaceUIPaneOperationKindOpenPane &&
		operation.Kind != workspaceui.WorkspaceUIPaneOperationKindResizeColumn &&
		response.OperationResult.PaneID != operation.PaneID {
		return fmt.Errorf("workspace pane operation outcome paneId = %s, want %s", response.OperationResult.PaneID, operation.PaneID)
	}
	if response.OperationResult.FocusedPaneID == "" {
		return errors.New("workspace pane operation outcome focusedPaneId is required")
	}
	if !workspaceUILayoutHasPane(response.Layout, response.OperationResult.FocusedPaneID) {
		return fmt.Errorf("workspace pane operation outcome focusedPaneId %s is not present in the returned layout", response.OperationResult.FocusedPaneID)
	}
	return nil
}

func validateWorkspacePaneDescriptor(pane workspaceui.WorkspaceUIPaneDescriptor) error {
	if err := validateWorkspacePaneDescriptorIdentity(pane); err != nil {
		return err
	}
	if err := validateWorkspacePaneDescriptorLocation(pane); err != nil {
		return err
	}
	return validateWorkspacePaneDescriptorArrays(pane)
}

func validateWorkspacePaneDescriptorIdentity(pane workspaceui.WorkspaceUIPaneDescriptor) error {
	if pane.PaneID == "" {
		return errors.New("paneId is required")
	}
	if pane.SurfaceID == "" {
		return fmt.Errorf("surfaceId is required for %s", pane.PaneID)
	}
	if !validWorkspaceSurfaceKind(pane.SurfaceKind) {
		return fmt.Errorf("surfaceKind is unsupported for %s: %s", pane.PaneID, pane.SurfaceKind)
	}
	if pane.Title == "" {
		return fmt.Errorf("title is required for %s", pane.PaneID)
	}
	if pane.RuntimeState.Status == "" {
		return fmt.Errorf("runtimeState.status is required for %s", pane.PaneID)
	}
	return nil
}

func validateWorkspacePaneDescriptorLocation(pane workspaceui.WorkspaceUIPaneDescriptor) error {
	if pane.Location.ColumnID == "" {
		return fmt.Errorf("location.columnId is required for %s", pane.PaneID)
	}
	if pane.Location.PaneIndex < 0 || pane.Location.PaneCount <= pane.Location.PaneIndex {
		return fmt.Errorf("location pane index/count is invalid for %s: %d/%d", pane.PaneID, pane.Location.PaneIndex, pane.Location.PaneCount)
	}
	if pane.Location.Weight <= 0 {
		return fmt.Errorf("location.weight must be positive for %s", pane.PaneID)
	}
	return nil
}

func validateWorkspacePaneDescriptorArrays(pane workspaceui.WorkspaceUIPaneDescriptor) error {
	if pane.SurfaceCloseModes == nil {
		return fmt.Errorf("surfaceCloseModes array is required for %s", pane.PaneID)
	}
	if pane.ReadModes == nil {
		return fmt.Errorf("readModes array is required for %s", pane.PaneID)
	}
	if pane.WriteModes == nil {
		return fmt.Errorf("writeModes array is required for %s", pane.PaneID)
	}
	return nil
}

func validWorkspaceSurfaceKind(kind workspaceui.SurfaceKind) bool {
	switch kind {
	case workspaceui.SurfaceKindChatDOM,
		workspaceui.SurfaceKindEmptyFrame,
		workspaceui.SurfaceKindWorkflowGraph,
		workspaceui.SurfaceKindSettingsDOM,
		workspaceui.SurfaceKindTerminal,
		workspaceui.SurfaceKindSemanticNodeDetails,
		workspaceui.SurfaceKindWorkflowNodeDetails,
		workspaceui.SurfaceKindWorkflowSettings:
		return true
	default:
		return false
	}
}

func workspaceUILayoutHasPane(layout workspaceui.WorkspaceUILayout, paneID string) bool {
	for _, pane := range layout.Panes {
		if pane.PaneID == paneID {
			return true
		}
	}
	return false
}
