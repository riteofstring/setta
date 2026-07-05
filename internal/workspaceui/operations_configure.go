package workspaceui

import "fmt"

func (service *Service) applyConfigurePaneOperation(
	layout WorkspaceUILayout,
	operation WorkspaceUIPaneOperation,
) (WorkspaceUIPaneOperationResult, error) {
	paneIndex := paneIndexByID(layout.Panes, operation.PaneID)
	if paneIndex < 0 {
		return WorkspaceUIPaneOperationResult{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodePaneNotFound,
			fmt.Errorf("workspace pane not found: %s", operation.PaneID),
		)
	}
	if !layoutHasPane(layout, operation.PaneID) {
		return WorkspaceUIPaneOperationResult{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodePaneNotFound,
			fmt.Errorf("workspace pane is not referenced by any column: %s", operation.PaneID),
		)
	}

	previousFocusedPaneID := layout.FocusedPaneID
	previousPane := cloneWorkspaceUIPane(layout.Panes[paneIndex])
	configuredPane, err := configureWorkspaceUIPane(layout, previousPane, operation)
	if err != nil {
		return WorkspaceUIPaneOperationResult{}, err
	}
	layout.Panes[paneIndex] = configuredPane
	layout.FocusedPaneID = operation.PaneID
	layout.Revision += 1

	saved, err := service.SaveLayout(layout)
	if err != nil {
		return WorkspaceUIPaneOperationResult{}, err
	}
	layout = saved
	configuredPane = workspaceUIPaneByID(layout.Panes, operation.PaneID)

	return WorkspaceUIPaneOperationResult{
		WorkspaceID: layout.WorkspaceID,
		Revision:    layout.Revision,
		Layout:      layout,
		Changed:     true,
		OperationResult: WorkspaceUIPaneOperationOutcome{
			Kind:                  WorkspaceUIPaneOperationKindConfigurePane,
			Configure:             configureOutcome(previousPane, configuredPane),
			PaneID:                operation.PaneID,
			PreviousFocusedPaneID: previousFocusedPaneID,
			FocusedPaneID:         layout.FocusedPaneID,
		},
		BeforeAfterDimensions: []WorkspaceUIPaneDimensionChange{},
		Warnings:              []WorkspaceUIPaneOperationWarning{},
	}, nil
}

func configureWorkspaceUIPane(
	layout WorkspaceUILayout,
	pane WorkspaceUIPane,
	operation WorkspaceUIPaneOperation,
) (WorkspaceUIPane, error) {
	configure := operation.Configure
	surfaceKind := configuredSurfaceKind(configure.SurfaceKind, pane.SurfaceKind)
	if !validConfigurePaneSurfaceKind(surfaceKind) {
		return WorkspaceUIPane{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodeUnsupportedOperation,
			fmt.Errorf("workspace pane configure does not support surfaceKind %s", surfaceKind),
		)
	}
	if configure.TerminalConfig != nil && surfaceKind != SurfaceKindTerminal {
		return WorkspaceUIPane{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodeInvalidOperation,
			fmt.Errorf("workspace pane configure terminalConfig is only valid for terminal panes"),
		)
	}
	if configure.WorkflowNodeDetailsConfig != nil && surfaceKind != SurfaceKindWorkflowNodeDetails {
		return WorkspaceUIPane{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodeInvalidOperation,
			fmt.Errorf("workspace pane configure workflowNodeDetailsConfig is only valid for workflow-node-details panes"),
		)
	}
	workflowNodeDetailsConfig := workflowNodeDetailsConfigForConfigurePane(
		surfaceKind,
		configure.WorkflowNodeDetailsConfig,
		pane,
	)
	if surfaceKind == SurfaceKindWorkflowNodeDetails {
		if err := validateWorkflowNodeDetailsConfigMatchesOperationWorkspace(
			layout.WorkspaceID,
			operation,
			workflowNodeDetailsConfig,
		); err != nil {
			return WorkspaceUIPane{}, err
		}
	}

	sequence := nextWorkspaceUIPaneSequence(layout)
	pane.Heat = (sequence * 37) % 100
	pane.Subtitle = configuredString(configure.Subtitle, pane.Subtitle)
	pane.SurfaceID = fmt.Sprintf("workspace_surface_%d", sequence)
	pane.SurfaceKind = surfaceKind
	pane.TerminalConfig = terminalConfigForConfigurePane(surfaceKind, configure.TerminalConfig, pane)
	pane.Title = configuredString(configure.Title, pane.Title)
	pane.Tone = configuredTone(configure.Tone, pane.Tone)
	pane.WorkflowNodeDetailsConfig = workflowNodeDetailsConfig
	return pane, nil
}

func terminalConfigForConfigurePane(
	surfaceKind SurfaceKind,
	requested *TerminalPaneConfig,
	existing WorkspaceUIPane,
) *TerminalPaneConfig {
	if surfaceKind != SurfaceKindTerminal {
		return nil
	}
	if requested != nil {
		cloned := *requested
		return &cloned
	}
	if existing.SurfaceKind == SurfaceKindTerminal && existing.TerminalConfig != nil {
		cloned := *existing.TerminalConfig
		return &cloned
	}
	return &TerminalPaneConfig{}
}

func configureOutcome(previous WorkspaceUIPane, configured WorkspaceUIPane) *WorkspaceUIPaneConfigureOutcome {
	return &WorkspaceUIPaneConfigureOutcome{
		PreviousSubtitle:    previous.Subtitle,
		PreviousSurfaceID:   previous.SurfaceID,
		PreviousSurfaceKind: previous.SurfaceKind,
		PreviousTitle:       previous.Title,
		PreviousTone:        previous.Tone,
		Subtitle:            configured.Subtitle,
		SurfaceID:           configured.SurfaceID,
		SurfaceKind:         configured.SurfaceKind,
		Title:               configured.Title,
		Tone:                configured.Tone,
	}
}

func configuredString(value *string, current string) string {
	if value == nil {
		return current
	}
	return *value
}

func configuredSurfaceKind(value *SurfaceKind, current SurfaceKind) SurfaceKind {
	if value == nil {
		return current
	}
	return *value
}

func configuredTone(value *PaneTone, current PaneTone) PaneTone {
	if value == nil {
		return current
	}
	return *value
}

func validConfigurePaneSurfaceKind(surfaceKind SurfaceKind) bool {
	switch surfaceKind {
	case SurfaceKindChatDOM, SurfaceKindEmptyFrame, SurfaceKindTerminal, SurfaceKindWorkflowGraph, SurfaceKindWorkflowNodeDetails:
		return true
	default:
		return false
	}
}
