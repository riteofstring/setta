package workspaceui

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
)

type workspaceUIPaneOpenApplication struct {
	layout       WorkspaceUILayout
	pane         WorkspaceUIPane
	placement    WorkspaceUIPaneDropPlacement
	targetKind   WorkspaceUIPaneOpenTargetKind
	targetPaneID string
	warnings     []WorkspaceUIPaneOperationWarning
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
	if operation.Open.SurfaceKind == SurfaceKindWorkflowNodeDetails {
		if err := validateWorkflowNodeDetailsConfigMatchesOperationWorkspace(
			layout.WorkspaceID,
			operation,
			operation.Open.WorkflowNodeDetailsConfig,
		); err != nil {
			return WorkspaceUIPaneOperationResult{}, err
		}
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
				application.targetKind,
				application.targetPaneID,
				application.placement,
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
	insertion, err := insertOpenPaneTarget(&layout, operation)
	if err != nil {
		return workspaceUIPaneOpenApplication{}, err
	}
	sequence := nextWorkspaceUIPaneSequence(layout)
	pane := WorkspaceUIPane{
		ChatConfig:     chatConfigForOpenPane(operation.Open.SurfaceKind, operation.Open.ChatConfig),
		ColumnID:       insertion.column.ColumnID,
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
		WorkflowNodeDetailsConfig: workflowNodeDetailsConfigForOpenPane(
			operation.Open.SurfaceKind,
			operation.Open.WorkflowNodeDetailsConfig,
		),
	}
	layout.Panes = append(layout.Panes, pane)
	columnIndex := columnIndexByID(layout.Columns, insertion.column.ColumnID)
	if columnIndex < 0 {
		return workspaceUIPaneOpenApplication{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodeColumnNotFound,
			fmt.Errorf("workspace pane open target column not found after insert: %s", insertion.column.ColumnID),
		)
	}
	layout.Columns[columnIndex].PaneIDs = insertStringAt(layout.Columns[columnIndex].PaneIDs, insertion.paneIndex, pane.PaneID)
	return workspaceUIPaneOpenApplication{
		layout:       layout,
		pane:         pane,
		placement:    insertion.placement,
		targetKind:   insertion.targetKind,
		targetPaneID: insertion.targetPaneID,
		warnings:     insertion.warnings,
	}, nil
}

type workspaceUIPaneOpenInsertion struct {
	column       WorkspaceUIColumn
	paneIndex    int
	placement    WorkspaceUIPaneDropPlacement
	targetKind   WorkspaceUIPaneOpenTargetKind
	targetPaneID string
	warnings     []WorkspaceUIPaneOperationWarning
}

func insertOpenPaneTarget(layout *WorkspaceUILayout, operation WorkspaceUIPaneOperation) (workspaceUIPaneOpenInsertion, error) {
	if operation.Open.Row != nil {
		return insertOpenPaneRow(layout, operation)
	}
	if operation.Open.Plane != nil {
		return insertOpenPanePlaneSlot(layout, operation)
	}
	return insertOpenPaneColumn(layout, operation)
}

func insertOpenPaneColumn(layout *WorkspaceUILayout, operation WorkspaceUIPaneOperation) (workspaceUIPaneOpenInsertion, error) {
	widthSpec, warnings := openPaneColumnWidthSpec(operation.Open.WidthSpec, defaultOpenPaneColumnWidthSpec())
	column, err := insertOpenPaneColumnAtSlot(layout, operation, widthSpec, openPaneColumnPlacement(layout, operation))
	if err != nil {
		return workspaceUIPaneOpenInsertion{}, err
	}
	targetKind := WorkspaceUIPaneOpenTargetKindColumnEnd
	if operation.Open.AdjacentToColumnID != "" {
		targetKind = WorkspaceUIPaneOpenTargetKindAdjacentColumn
	}
	return workspaceUIPaneOpenInsertion{
		column:     column,
		paneIndex:  0,
		placement:  WorkspaceUIPaneDropPlacementAfter,
		targetKind: targetKind,
		warnings:   warnings,
	}, nil
}

func insertOpenPaneRow(layout *WorkspaceUILayout, operation WorkspaceUIPaneOperation) (workspaceUIPaneOpenInsertion, error) {
	target, ok := paneLocation(*layout, operation.Open.Row.TargetPaneID)
	if !ok {
		return workspaceUIPaneOpenInsertion{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodePaneNotFound,
			fmt.Errorf("workspace pane open row target pane not found: %s", operation.Open.Row.TargetPaneID),
		)
	}
	paneIndex := target.PaneIndex
	if operation.Open.Row.Placement == WorkspaceUIPaneDropPlacementAfter {
		paneIndex += 1
	}
	return workspaceUIPaneOpenInsertion{
		column:       layout.Columns[target.ColumnIndex],
		paneIndex:    paneIndex,
		placement:    operation.Open.Row.Placement,
		targetKind:   WorkspaceUIPaneOpenTargetKindRow,
		targetPaneID: operation.Open.Row.TargetPaneID,
		warnings:     []WorkspaceUIPaneOperationWarning{},
	}, nil
}

func insertOpenPanePlaneSlot(layout *WorkspaceUILayout, operation WorkspaceUIPaneOperation) (workspaceUIPaneOpenInsertion, error) {
	target, ok := paneLocation(*layout, operation.Open.Plane.TargetPaneID)
	if !ok {
		return workspaceUIPaneOpenInsertion{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodePaneNotFound,
			fmt.Errorf("workspace pane open plane target pane not found: %s", operation.Open.Plane.TargetPaneID),
		)
	}
	targetColumn := layout.Columns[target.ColumnIndex]
	targetPlaneIndex := targetColumn.PlaneIndex
	if operation.Open.Plane.Placement == WorkspaceUIPaneDropPlacementBefore {
		targetPlaneIndex -= 1
	} else {
		targetPlaneIndex += 1
	}
	if targetPlaneIndex < 0 {
		planeOffset := -targetPlaneIndex
		for index := range layout.Columns {
			layout.Columns[index].PlaneIndex += planeOffset
		}
		targetPlaneIndex = 0
	}
	widthSpec, warnings := openPaneColumnWidthSpec(operation.Open.WidthSpec, targetColumn.WidthSpec)
	column, err := insertOpenPaneColumnAtSlot(
		layout,
		operation,
		widthSpec,
		workspaceUIPaneOpenColumnPlacement{
			planeIndex: targetPlaneIndex,
			slotIndex:  targetColumn.SlotIndex,
		},
	)
	if err != nil {
		return workspaceUIPaneOpenInsertion{}, err
	}
	return workspaceUIPaneOpenInsertion{
		column:       column,
		paneIndex:    0,
		placement:    operation.Open.Plane.Placement,
		targetKind:   WorkspaceUIPaneOpenTargetKindPlaneSlot,
		targetPaneID: operation.Open.Plane.TargetPaneID,
		warnings:     warnings,
	}, nil
}

type workspaceUIPaneOpenColumnPlacement struct {
	planeIndex int
	slotIndex  int
}

func openPaneColumnPlacement(layout *WorkspaceUILayout, operation WorkspaceUIPaneOperation) workspaceUIPaneOpenColumnPlacement {
	planeIndex := 0
	slotIndex := nextSlotIndexForPlane(layout.Columns, planeIndex)
	if operation.Open.AdjacentToColumnID == "" {
		return workspaceUIPaneOpenColumnPlacement{planeIndex: planeIndex, slotIndex: slotIndex}
	}
	adjacentColumnIndex := columnIndexByID(layout.Columns, operation.Open.AdjacentToColumnID)
	if adjacentColumnIndex < 0 {
		return workspaceUIPaneOpenColumnPlacement{planeIndex: planeIndex, slotIndex: slotIndex}
	}
	adjacentColumn := layout.Columns[adjacentColumnIndex]
	return workspaceUIPaneOpenColumnPlacement{
		planeIndex: adjacentColumn.PlaneIndex,
		slotIndex:  adjacentColumn.SlotIndex + 1,
	}
}

func insertOpenPaneColumnAtSlot(
	layout *WorkspaceUILayout,
	operation WorkspaceUIPaneOperation,
	widthSpec ColumnWidthSpec,
	placement workspaceUIPaneOpenColumnPlacement,
) (WorkspaceUIColumn, error) {
	if operation.Open.AdjacentToColumnID != "" && columnIndexByID(layout.Columns, operation.Open.AdjacentToColumnID) < 0 {
		return WorkspaceUIColumn{}, operationError(
			layout.WorkspaceID,
			operation,
			WorkspaceUIOperationErrorCodeColumnNotFound,
			fmt.Errorf("workspace pane open adjacent column not found: %s", operation.Open.AdjacentToColumnID),
		)
	}
	layout.Columns = shiftedColumnsForSlotInsert(layout.Columns, placement.planeIndex, placement.slotIndex)
	column := WorkspaceUIColumn{
		ColumnID:       nextWorkspaceUIColumnID(layout.Columns),
		IdealWidthSpec: widthSpec,
		Index:          len(layout.Columns),
		PaneIDs:        []string{},
		PlaneIndex:     placement.planeIndex,
		SlotIndex:      placement.slotIndex,
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

func openPaneColumnWidthSpec(requested *ColumnWidthSpec, fallback ColumnWidthSpec) (ColumnWidthSpec, []WorkspaceUIPaneOperationWarning) {
	if requested == nil {
		return fallback, []WorkspaceUIPaneOperationWarning{}
	}
	widthSpec := normalizedResizeColumnWidthSpec(*requested)
	return widthSpec, openPaneWidthWarnings(*requested, widthSpec)
}

func defaultOpenPaneColumnWidthSpec() ColumnWidthSpec {
	return ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: defaultWorkspaceUIColumnWidthPX}
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

func chatConfigForOpenPane(surfaceKind SurfaceKind, config *ChatPaneConfig) *ChatPaneConfig {
	if surfaceKind != SurfaceKindChatDOM || config == nil {
		return nil
	}
	cloned := *config
	return &cloned
}

func validOpenPaneSurfaceKind(surfaceKind SurfaceKind) bool {
	switch surfaceKind {
	case SurfaceKindChatDOM, SurfaceKindEmptyFrame, SurfaceKindSettingsDOM, SurfaceKindTerminal, SurfaceKindWorkflowGraph, SurfaceKindWorkflowNodeDetails:
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

func insertStringAt(values []string, index int, value string) []string {
	index = clampInt(index, 0, len(values))
	result := append([]string{}, values[:index]...)
	result = append(result, value)
	return append(result, values[index:]...)
}

func openOutcome(
	adjacentToColumnID string,
	targetKind WorkspaceUIPaneOpenTargetKind,
	targetPaneID string,
	placement WorkspaceUIPaneDropPlacement,
	column WorkspaceUIColumn,
	pane WorkspaceUIPane,
	location workspaceUIPaneLocation,
) *WorkspaceUIPaneOpenOutcome {
	return &WorkspaceUIPaneOpenOutcome{
		AdjacentToColumnID: adjacentToColumnID,
		ColumnID:           column.ColumnID,
		ColumnIndex:        location.ColumnIndex,
		PaneIndex:          location.PaneIndex,
		PlaneIndex:         location.PlaneIndex,
		Placement:          placement,
		SurfaceID:          pane.SurfaceID,
		SurfaceKind:        pane.SurfaceKind,
		TargetKind:         targetKind,
		TargetPaneID:       targetPaneID,
		Title:              pane.Title,
		WidthSpec:          column.WidthSpec,
	}
}
