package workspaceui

import (
	"errors"
	"fmt"

	"setta/internal/workspace"
)

const defaultWorkspaceUIColumnWidthPX = 520

func DefaultLayout(summary workspace.WorkspaceSummary) WorkspaceUILayout {
	panes := []WorkspaceUIPane{
		defaultWorkspaceUIPane(defaultWorkspaceUIPaneInput{
			columnID:    "workspace_column_0",
			sequence:    0,
			subtitle:    summary.DisplayName,
			surfaceKind: SurfaceKindChatDOM,
			title:       "Chat",
			tone:        PaneToneCyan,
			weight:      1.6,
		}),
		defaultWorkspaceUIPane(defaultWorkspaceUIPaneInput{
			columnID:    "workspace_column_1",
			sequence:    1,
			subtitle:    "workspace command surface",
			surfaceKind: SurfaceKindTerminal,
			title:       "Terminal",
			tone:        PaneToneGreen,
			weight:      1,
		}),
		defaultWorkspaceUIPane(defaultWorkspaceUIPaneInput{
			columnID:    "workspace_column_2",
			sequence:    2,
			subtitle:    "workflow graph",
			surfaceKind: SurfaceKindWorkflowGraph,
			title:       "Workflow Graph",
			tone:        PaneToneCyan,
			weight:      1,
		}),
		defaultWorkspaceUIPane(defaultWorkspaceUIPaneInput{
			columnID:    "workspace_column_3",
			sequence:    3,
			subtitle:    "workspace settings",
			surfaceKind: SurfaceKindSettingsDOM,
			title:       "Settings",
			tone:        PaneToneSlate,
			weight:      1,
		}),
	}
	columns := make([]WorkspaceUIColumn, 0, len(panes))
	for index, pane := range panes {
		columns = append(columns, defaultWorkspaceUIColumn(index, pane))
	}
	return WorkspaceUILayout{
		SchemaVersion: SchemaVersion,
		Revision:      1,
		WorkspaceID:   summary.ID,
		FocusedPaneID: "workspace_pane_0",
		Columns:       columns,
		Panes:         panes,
	}
}

func (service *Service) InitializeLayout(workspaceID string) (WorkspaceUILayout, error) {
	summary, err := service.resolver.ResolveWorkspace(workspaceID)
	if err != nil {
		return WorkspaceUILayout{}, err
	}
	read, err := service.store.LoadLayout(workspaceID)
	if err != nil {
		return WorkspaceUILayout{}, err
	}
	if read.Layout != nil {
		return WorkspaceUILayout{}, fmt.Errorf("workspace UI layout already exists for workspace %s", workspaceID)
	}
	layout := DefaultLayout(summary)
	if layout.WorkspaceID != workspaceID {
		return WorkspaceUILayout{}, errors.New("default workspace UI layout workspace id mismatch")
	}
	return service.SaveLayout(layout)
}

type defaultWorkspaceUIPaneInput struct {
	columnID    string
	sequence    int
	subtitle    string
	surfaceKind SurfaceKind
	title       string
	tone        PaneTone
	weight      float64
}

func defaultWorkspaceUIPane(input defaultWorkspaceUIPaneInput) WorkspaceUIPane {
	return WorkspaceUIPane{
		ColumnID:    input.columnID,
		Heat:        (input.sequence * 37) % 100,
		PaneID:      fmt.Sprintf("workspace_pane_%d", input.sequence),
		Sequence:    input.sequence,
		Subtitle:    input.subtitle,
		SurfaceID:   fmt.Sprintf("workspace_surface_%d", input.sequence),
		SurfaceKind: input.surfaceKind,
		Title:       input.title,
		Tone:        input.tone,
		Weight:      input.weight,
	}
}

func defaultWorkspaceUIColumn(index int, pane WorkspaceUIPane) WorkspaceUIColumn {
	width := ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: defaultWorkspaceUIColumnWidthPX}
	return WorkspaceUIColumn{
		ColumnID:                pane.ColumnID,
		IdealWidthSpec:          width,
		Index:                   index,
		PaneIDs:                 []string{pane.PaneID},
		PlaneIndex:              0,
		PreviousProportionWidth: nil,
		SlotIndex:               index,
		WidthSpec:               width,
	}
}
