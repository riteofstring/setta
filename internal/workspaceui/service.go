package workspaceui

import (
	"errors"
	"fmt"

	"setta/internal/workspace"
)

type WorkspaceResolver interface {
	ResolveWorkspace(id string) (workspace.WorkspaceSummary, error)
}

type Service struct {
	resolver WorkspaceResolver
	store    *Store
}

func NewService(store *Store, resolver WorkspaceResolver) (*Service, error) {
	if store == nil {
		return nil, errors.New("workspace UI store is required")
	}
	if resolver == nil {
		return nil, errors.New("workspace resolver is required")
	}
	return &Service{
		resolver: resolver,
		store:    store,
	}, nil
}

func (service *Service) Schema() WorkspaceUISchema {
	return Schema()
}

func (service *Service) ListPanes(workspaceID string) (WorkspaceUIPaneListResult, error) {
	read, err := service.ReadLayout(workspaceID)
	if err != nil {
		return WorkspaceUIPaneListResult{}, err
	}
	result := WorkspaceUIPaneListResult{
		WorkspaceID:   workspaceID,
		LayoutPresent: read.Layout != nil,
		Panes:         []WorkspaceUIPaneDescriptor{},
		Schema:        service.Schema(),
	}
	if read.Layout == nil {
		return result, nil
	}
	result.Panes, err = paneDescriptors(*read.Layout)
	if err != nil {
		return WorkspaceUIPaneListResult{}, err
	}
	return result, nil
}

func (service *Service) ReadPane(workspaceID string, paneID string) (WorkspaceUIPaneReadResult, error) {
	if paneID == "" {
		return WorkspaceUIPaneReadResult{}, errors.New("pane id is required")
	}
	list, err := service.ListPanes(workspaceID)
	if err != nil {
		return WorkspaceUIPaneReadResult{}, err
	}
	for _, pane := range list.Panes {
		if pane.PaneID == paneID {
			return WorkspaceUIPaneReadResult{
				WorkspaceID: workspaceID,
				Pane:        pane,
				Schema:      service.Schema(),
			}, nil
		}
	}
	return WorkspaceUIPaneReadResult{}, fmt.Errorf("workspace pane not found: %s", paneID)
}

func (service *Service) ReadLayout(workspaceID string) (WorkspaceUILayoutReadResult, error) {
	if _, err := service.resolver.ResolveWorkspace(workspaceID); err != nil {
		return WorkspaceUILayoutReadResult{}, err
	}
	return service.store.LoadLayout(workspaceID)
}

func (service *Service) SaveLayout(layout WorkspaceUILayout) (WorkspaceUILayout, error) {
	if _, err := service.resolver.ResolveWorkspace(layout.WorkspaceID); err != nil {
		return WorkspaceUILayout{}, err
	}
	return service.store.SaveLayout(layout)
}

func paneDescriptors(layout WorkspaceUILayout) ([]WorkspaceUIPaneDescriptor, error) {
	panesByID := map[string]WorkspaceUIPane{}
	for _, pane := range layout.Panes {
		panesByID[pane.PaneID] = pane
	}
	descriptors := make([]WorkspaceUIPaneDescriptor, 0, len(layout.Panes))
	for _, column := range layout.Columns {
		for paneIndex, paneID := range column.PaneIDs {
			pane, ok := panesByID[paneID]
			if !ok {
				return nil, fmt.Errorf("column %s references missing pane %s", column.ColumnID, paneID)
			}
			descriptors = append(descriptors, paneDescriptor(layout, column, pane, paneIndex))
		}
	}
	return descriptors, nil
}

func paneDescriptor(layout WorkspaceUILayout, column WorkspaceUIColumn, pane WorkspaceUIPane, paneIndex int) WorkspaceUIPaneDescriptor {
	return WorkspaceUIPaneDescriptor{
		PaneID:      pane.PaneID,
		SurfaceID:   pane.SurfaceID,
		SurfaceKind: pane.SurfaceKind,
		Title:       pane.Title,
		Subtitle:    pane.Subtitle,
		Focused:     pane.PaneID == layout.FocusedPaneID,
		Location: WorkspaceUIPaneLocation{
			ColumnID:       column.ColumnID,
			ColumnIndex:    column.Index,
			IdealWidthSpec: column.IdealWidthSpec,
			PaneIndex:      paneIndex,
			PaneCount:      len(column.PaneIDs),
			PlaneIndex:     column.PlaneIndex,
			Sequence:       pane.Sequence,
			SlotIndex:      column.SlotIndex,
			Weight:         pane.Weight,
			WidthSpec:      column.WidthSpec,
		},
		RuntimeState: WorkspaceUIPaneRuntimeState{
			Status: WorkspaceUIPaneRuntimeStatusLayoutOnly,
		},
		CanFocus:          false,
		CanMove:           false,
		CanClosePane:      false,
		SurfaceCloseModes: []WorkspaceUISurfaceCloseMode{},
		ReadModes:         []WorkspaceUIPaneReadMode{WorkspaceUIPaneReadModeMetadata},
		WriteModes:        []WorkspaceUIPaneWriteMode{},
		ContentRefs:       contentRefsForPane(pane),
	}
}

func contentRefsForPane(pane WorkspaceUIPane) WorkspaceUIPaneContentRefs {
	return WorkspaceUIPaneContentRefs{
		Chat:                nil,
		SemanticNodeDetails: nil,
		Terminal:            terminalContentRefForPane(pane),
		WorkflowGraph:       nil,
		WorkflowNodeDetails: workflowNodeDetailsContentRefForPane(pane),
	}
}

func terminalContentRefForPane(pane WorkspaceUIPane) *WorkspaceUITerminalPaneContentRef {
	if pane.SurfaceKind != SurfaceKindTerminal || pane.TerminalConfig == nil {
		return nil
	}
	return &WorkspaceUITerminalPaneContentRef{
		CWDOverride:   pane.TerminalConfig.CWDOverride,
		ProfileID:     pane.TerminalConfig.ProfileID,
		SessionID:     "",
		TitleOverride: pane.TerminalConfig.TitleOverride,
	}
}

func workflowNodeDetailsContentRefForPane(pane WorkspaceUIPane) *WorkspaceUIWorkflowNodeDetailsPaneContentRef {
	if pane.SurfaceKind != SurfaceKindWorkflowNodeDetails || pane.WorkflowNodeDetailsConfig == nil {
		return nil
	}
	config := pane.WorkflowNodeDetailsConfig
	return &WorkspaceUIWorkflowNodeDetailsPaneContentRef{
		DefinitionID:            config.DefinitionID,
		DefinitionVersionID:     config.DefinitionVersionID,
		DefinitionVersionNumber: config.DefinitionVersionNumber,
		ExecutionID:             config.ExecutionID,
		NodeID:                  config.NodeID,
		NodeExecutionID:         config.NodeExecutionID,
		NodeKind:                config.NodeKind,
		NodeStatus:              config.NodeStatus,
		ViewMode:                config.ViewMode,
	}
}
