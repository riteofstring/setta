package workspaceui

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
)

const defaultOpenPaneColumnWidthPX = 520

type workspaceUIPaneOpenApplication struct {
	layout   WorkspaceUILayout
	pane     WorkspaceUIPane
	warnings []WorkspaceUIPaneOperationWarning
}

func (service *Service) applyOpenPaneOperation(layout WorkspaceUILayout, operation WorkspaceUIPaneOperation) (WorkspaceUIPaneOperationResult, error) {
	if !validOpenPaneSurfaceKind(operation.Open.SurfaceKind) {
		return WorkspaceUIPaneOperationResult{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodeUnsupportedOperation,
			fmt.Errorf("workspace pane open does not support surfaceKind %s", operation.Open.SurfaceKind),
		)
	}

	previousFocusedPaneID := layout.FocusedPaneID
	application, err := applyOpenPaneOperationToLayout(cloneWorkspaceUILayout(layout), operation)
	if err != nil {
		return WorkspaceUIPaneOperationResult{}, err
	}
	layout = application.layout
	layout.FocusedPaneID = application.pane.PaneID
	layout.Revision += 1
	saved, err := service.SaveLayout(layout)
	if err != nil {
		return WorkspaceUIPaneOperationResult{}, err
	}
	layout = saved

	location, ok := paneLocation(layout, application.pane.PaneID)
	if !ok {
		return WorkspaceUIPaneOperationResult{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodePaneNotFound,
			fmt.Errorf("workspace pane not found after open: %s", application.pane.PaneID),
		)
	}
	createdPane := workspaceUIPaneByID(layout.Panes, application.pane.PaneID)

	return WorkspaceUIPaneOperationResult{
		WorkspaceID: layout.WorkspaceID,
		Revision:    layout.Revision,
		Layout:      layout,
		Changed:     true,
		OperationResult: WorkspaceUIPaneOperationOutcome{
			Kind: WorkspaceUIPaneOperationKindOpenPane,
			Open: openOutcome(
				operation.Open.AdjacentToColumnID,
				layout.Columns[location.ColumnIndex],
				createdPane,
				location,
			),
			PaneID:                application.pane.PaneID,
			PreviousFocusedPaneID: previousFocusedPaneID,
			FocusedPaneID:         layout.FocusedPaneID,
		},
		BeforeAfterDimensions: []WorkspaceUIPaneDimensionChange{},
		Warnings:              application.warnings,
	}, nil
}

func applyOpenPaneOperationToLayout(layout WorkspaceUILayout, operation WorkspaceUIPaneOperation) (workspaceUIPaneOpenApplication, error) {
	widthSpec, warnings := openPaneColumnWidthSpec(operation.Open.WidthSpec)
	column, err := insertOpenPaneColumn(&layout, operation, widthSpec)
	if err != nil {
		return workspaceUIPaneOpenApplication{}, err
	}
	sequence := nextWorkspaceUIPaneSequence(layout)
	pane := WorkspaceUIPane{
		ColumnID:       column.ColumnID,
		Heat:           (sequence * 37) % 100,
		PaneID:         fmt.Sprintf("workspace_pane_%d", sequence),
		Sequence:       sequence,
		Subtitle:       operation.Open.Subtitle,
		SurfaceID:      fmt.Sprintf("workspace_surface_%d", sequence),
		SurfaceKind:    operation.Open.SurfaceKind,
		TerminalConfig: terminalConfigForOpenPane(operation.Open.SurfaceKind, operation.Open.TerminalConfig),
		Title:          operation.Open.Title,
		Tone:           operation.Open.Tone,
		Weight:         1,
	}
	layout.Panes = append(layout.Panes, pane)
	columnIndex := columnIndexByID(layout.Columns, column.ColumnID)
	if columnIndex < 0 {
		return workspaceUIPaneOpenApplication{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodeColumnNotFound,
			fmt.Errorf("workspace pane open target column not found after insert: %s", column.ColumnID),
		)
	}
	layout.Columns[columnIndex].PaneIDs = append(layout.Columns[columnIndex].PaneIDs, pane.PaneID)
	return workspaceUIPaneOpenApplication{
		layout:   layout,
		pane:     pane,
		warnings: warnings,
	}, nil
}

func insertOpenPaneColumn(layout *WorkspaceUILayout, operation WorkspaceUIPaneOperation, widthSpec ColumnWidthSpec) (WorkspaceUIColumn, error) {
	planeIndex := 0
	slotIndex := nextSlotIndexForPlane(layout.Columns, planeIndex)
	if operation.Open.AdjacentToColumnID != "" {
		adjacentColumnIndex := columnIndexByID(layout.Columns, operation.Open.AdjacentToColumnID)
		if adjacentColumnIndex < 0 {
			return WorkspaceUIColumn{}, operationError(
				layout.WorkspaceID,
				operation,
				WorkspaceUIOperationErrorCodeColumnNotFound,
				fmt.Errorf("workspace pane open adjacent column not found: %s", operation.Open.AdjacentToColumnID),
			)
		}
		adjacentColumn := layout.Columns[adjacentColumnIndex]
		planeIndex = adjacentColumn.PlaneIndex
		slotIndex = adjacentColumn.SlotIndex + 1
	}
	layout.Columns = shiftedColumnsForSlotInsert(layout.Columns, planeIndex, slotIndex)
	column := WorkspaceUIColumn{
		ColumnID:       nextWorkspaceUIColumnID(layout.Columns),
		IdealWidthSpec: widthSpec,
		Index:          len(layout.Columns),
		PaneIDs:        []string{},
		PlaneIndex:     planeIndex,
		SlotIndex:      slotIndex,
		WidthSpec:      widthSpec,
	}
	if widthSpec.Unit == ColumnWidthUnitProportion {
		value := widthSpec.Value
		column.PreviousProportionWidth = &value
	}
	layout.Columns = reindexWorkspaceUIColumnsPreservingPlanes(append(layout.Columns, column))
	columnIndex := columnIndexByID(layout.Columns, column.ColumnID)
	if columnIndex < 0 {
		return WorkspaceUIColumn{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodeColumnNotFound,
			fmt.Errorf("workspace pane open inserted column not found: %s", column.ColumnID),
		)
	}
	return layout.Columns[columnIndex], nil
}

func openPaneColumnWidthSpec(requested *ColumnWidthSpec) (ColumnWidthSpec, []WorkspaceUIPaneOperationWarning) {
	if requested == nil {
		return defaultOpenPaneColumnWidthSpec(), []WorkspaceUIPaneOperationWarning{}
	}
	widthSpec := normalizedResizeColumnWidthSpec(*requested)
	return widthSpec, openPaneWidthWarnings(*requested, widthSpec)
}

func defaultOpenPaneColumnWidthSpec() ColumnWidthSpec {
	return ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: defaultOpenPaneColumnWidthPX}
}

func openPaneWidthWarnings(requested ColumnWidthSpec, normalized ColumnWidthSpec) []WorkspaceUIPaneOperationWarning {
	if columnWidthSpecsEqual(requested, normalized) {
		return []WorkspaceUIPaneOperationWarning{}
	}
	return []WorkspaceUIPaneOperationWarning{
		{
			Code:    "column_width_normalized",
			Message: "workspace pane open widthSpec was normalized",
			Fields: map[string]string{
				"requestedUnit":  string(requested.Unit),
				"requestedValue": formatFloat(requested.Value),
				"widthSpecUnit":  string(normalized.Unit),
				"widthSpecValue": formatFloat(normalized.Value),
			},
		},
	}
}

func terminalConfigForOpenPane(surfaceKind SurfaceKind, config *TerminalPaneConfig) *TerminalPaneConfig {
	if surfaceKind != SurfaceKindTerminal {
		return nil
	}
	if config == nil {
		return &TerminalPaneConfig{}
	}
	cloned := *config
	return &cloned
}

func validOpenPaneSurfaceKind(surfaceKind SurfaceKind) bool {
	switch surfaceKind {
	case SurfaceKindChatDOM, SurfaceKindTerminal, SurfaceKindWorkflowGraph:
		return true
	default:
		return false
	}
}

func nextWorkspaceUIPaneSequence(layout WorkspaceUILayout) int {
	next := len(layout.Panes)
	for _, pane := range layout.Panes {
		next = maxNumericSuffix(next, pane.PaneID, "workspace_pane_")
		next = maxNumericSuffix(next, pane.SurfaceID, "workspace_surface_")
	}
	return next
}

func maxNumericSuffix(current int, value string, prefix string) int {
	if !strings.HasPrefix(value, prefix) {
		return current
	}
	parsed, err := strconv.Atoi(strings.TrimPrefix(value, prefix))
	if err != nil {
		return current
	}
	if parsed >= current {
		return parsed + 1
	}
	return current
}

func nextSlotIndexForPlane(columns []WorkspaceUIColumn, planeIndex int) int {
	next := 0
	for _, column := range columns {
		if column.PlaneIndex != planeIndex {
			continue
		}
		if column.SlotIndex >= next {
			next = column.SlotIndex + 1
		}
	}
	return next
}

func reindexWorkspaceUIColumnsPreservingPlanes(columns []WorkspaceUIColumn) []WorkspaceUIColumn {
	result := append([]WorkspaceUIColumn{}, columns...)
	sortWorkspaceUIColumns(result)
	for index := range result {
		result[index].Index = index
	}
	return result
}

func sortWorkspaceUIColumns(columns []WorkspaceUIColumn) {
	sort.SliceStable(columns, func(left int, right int) bool {
		if columns[left].PlaneIndex != columns[right].PlaneIndex {
			return columns[left].PlaneIndex < columns[right].PlaneIndex
		}
		if columns[left].SlotIndex != columns[right].SlotIndex {
			return columns[left].SlotIndex < columns[right].SlotIndex
		}
		return columns[left].Index < columns[right].Index
	})
}

func workspaceUIPaneByID(panes []WorkspaceUIPane, paneID string) WorkspaceUIPane {
	for _, pane := range panes {
		if pane.PaneID == paneID {
			return pane
		}
	}
	return WorkspaceUIPane{}
}

func openOutcome(adjacentToColumnID string, column WorkspaceUIColumn, pane WorkspaceUIPane, location workspaceUIPaneLocation) *WorkspaceUIPaneOpenOutcome {
	return &WorkspaceUIPaneOpenOutcome{
		AdjacentToColumnID: adjacentToColumnID,
		ColumnID:           column.ColumnID,
		ColumnIndex:        location.ColumnIndex,
		PaneIndex:          location.PaneIndex,
		PlaneIndex:         location.PlaneIndex,
		SurfaceID:          pane.SurfaceID,
		SurfaceKind:        pane.SurfaceKind,
		Title:              pane.Title,
		WidthSpec:          column.WidthSpec,
	}
}
