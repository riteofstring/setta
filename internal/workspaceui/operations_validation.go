package workspaceui

import (
	"errors"
	"fmt"
	"math"
	"strings"
)

var paneOperationValidators = map[WorkspaceUIPaneOperationKind]func(WorkspaceUIPaneOperation) error{
	WorkspaceUIPaneOperationKindClosePane:     validateClosePaneOperation,
	WorkspaceUIPaneOperationKindConfigurePane: validateConfigurePaneOperation,
	WorkspaceUIPaneOperationKindFocusPane:     validateFocusPaneOperation,
	WorkspaceUIPaneOperationKindMovePane:      validateMovePaneOperation,
	WorkspaceUIPaneOperationKindOpenPane:      validateOpenPaneOperation,
	WorkspaceUIPaneOperationKindRenamePane:    validateRenamePaneOperation,
	WorkspaceUIPaneOperationKindReorderPane:   validateReorderPaneOperation,
	WorkspaceUIPaneOperationKindResizePane:    validateResizePaneOperation,
}

func validatePaneOperation(operation WorkspaceUIPaneOperation) error {
	if operation.Kind == "" {
		return errors.New("workspace pane operation kind is required")
	}
	if operation.Kind == WorkspaceUIPaneOperationKindOpenPane && operation.PaneID != "" {
		return errors.New("workspace pane open operation must not include paneId")
	}
	if operation.Kind != WorkspaceUIPaneOperationKindOpenPane && operation.PaneID == "" {
		return errors.New("workspace pane operation paneId is required")
	}
	validator := paneOperationValidators[operation.Kind]
	if validator == nil {
		return nil
	}
	return validator(operation)
}

func validateClosePaneOperation(operation WorkspaceUIPaneOperation) error {
	if operation.Close == nil {
		return errors.New("workspace pane close payload is required")
	}
	if operation.Configure != nil {
		return errors.New("workspace pane operation configure payload is only valid for configure_pane")
	}
	if operation.Move != nil {
		return errors.New("workspace pane operation move payload is only valid for move_pane")
	}
	if operation.Open != nil {
		return errors.New("workspace pane operation open payload is only valid for open_pane")
	}
	if operation.Rename != nil {
		return errors.New("workspace pane operation rename payload is only valid for rename_pane")
	}
	if operation.Reorder != nil {
		return errors.New("workspace pane operation reorder payload is only valid for reorder_pane")
	}
	if operation.Resize != nil {
		return errors.New("workspace pane operation resize payload is only valid for resize_pane")
	}
	if !validSurfaceCloseMode(operation.Close.SurfaceClose) {
		return fmt.Errorf("workspace pane close surfaceClose is unsupported: %s", operation.Close.SurfaceClose)
	}
	return nil
}

func validateFocusPaneOperation(operation WorkspaceUIPaneOperation) error {
	if operation.Close != nil {
		return errors.New("workspace pane operation close payload is only valid for close_pane")
	}
	if operation.Configure != nil {
		return errors.New("workspace pane operation configure payload is only valid for configure_pane")
	}
	if operation.Move != nil {
		return errors.New("workspace pane operation move payload is only valid for move_pane")
	}
	if operation.Open != nil {
		return errors.New("workspace pane operation open payload is only valid for open_pane")
	}
	if operation.Rename != nil {
		return errors.New("workspace pane operation rename payload is only valid for rename_pane")
	}
	if operation.Reorder != nil {
		return errors.New("workspace pane operation reorder payload is only valid for reorder_pane")
	}
	if operation.Resize != nil {
		return errors.New("workspace pane operation resize payload is only valid for resize_pane")
	}
	return nil
}

func validateMovePaneOperation(operation WorkspaceUIPaneOperation) error {
	if operation.Close != nil {
		return errors.New("workspace pane operation close payload is only valid for close_pane")
	}
	if operation.Configure != nil {
		return errors.New("workspace pane operation configure payload is only valid for configure_pane")
	}
	if operation.Open != nil {
		return errors.New("workspace pane operation open payload is only valid for open_pane")
	}
	if operation.Rename != nil {
		return errors.New("workspace pane operation rename payload is only valid for rename_pane")
	}
	if operation.Reorder != nil {
		return errors.New("workspace pane operation reorder payload is only valid for reorder_pane")
	}
	if operation.Resize != nil {
		return errors.New("workspace pane operation resize payload is only valid for resize_pane")
	}
	if operation.Move == nil {
		return errors.New("workspace pane move payload is required")
	}
	if !validPaneMoveDirection(operation.Move.Direction) {
		return fmt.Errorf("workspace pane move direction is unsupported: %s", operation.Move.Direction)
	}
	return nil
}

func validateRenamePaneOperation(operation WorkspaceUIPaneOperation) error {
	if operation.Close != nil {
		return errors.New("workspace pane operation close payload is only valid for close_pane")
	}
	if operation.Configure != nil {
		return errors.New("workspace pane operation configure payload is only valid for configure_pane")
	}
	if operation.Move != nil {
		return errors.New("workspace pane operation move payload is only valid for move_pane")
	}
	if operation.Open != nil {
		return errors.New("workspace pane operation open payload is only valid for open_pane")
	}
	if operation.Reorder != nil {
		return errors.New("workspace pane operation reorder payload is only valid for reorder_pane")
	}
	if operation.Resize != nil {
		return errors.New("workspace pane operation resize payload is only valid for resize_pane")
	}
	if operation.Rename == nil {
		return errors.New("workspace pane rename payload is required")
	}
	if operation.Rename.Title == "" {
		return errors.New("workspace pane rename title is required")
	}
	if strings.TrimSpace(operation.Rename.Title) != operation.Rename.Title {
		return errors.New("workspace pane rename title must not have surrounding whitespace")
	}
	return nil
}

func validateReorderPaneOperation(operation WorkspaceUIPaneOperation) error {
	if operation.Close != nil {
		return errors.New("workspace pane operation close payload is only valid for close_pane")
	}
	if operation.Configure != nil {
		return errors.New("workspace pane operation configure payload is only valid for configure_pane")
	}
	if operation.Move != nil {
		return errors.New("workspace pane operation move payload is only valid for move_pane")
	}
	if operation.Open != nil {
		return errors.New("workspace pane operation open payload is only valid for open_pane")
	}
	if operation.Rename != nil {
		return errors.New("workspace pane operation rename payload is only valid for rename_pane")
	}
	if operation.Resize != nil {
		return errors.New("workspace pane operation resize payload is only valid for resize_pane")
	}
	if operation.Reorder == nil {
		return errors.New("workspace pane reorder payload is required")
	}
	return validateReorderPaneIntent(operation.Reorder.Intent)
}

func validateOpenPaneOperation(operation WorkspaceUIPaneOperation) error {
	if err := validateOpenPanePayloadExclusivity(operation); err != nil {
		return err
	}
	if operation.Open == nil {
		return errors.New("workspace pane open payload is required")
	}
	open := *operation.Open
	if err := validateOpenPaneMetadata(open); err != nil {
		return err
	}
	if open.WidthSpec != nil {
		if err := validateResizeColumnWidthSpec(*open.WidthSpec); err != nil {
			return err
		}
	}
	if err := validateOpenPaneTarget(open); err != nil {
		return err
	}
	if err := validateOpenPaneTerminalConfig(open.SurfaceKind, open.TerminalConfig); err != nil {
		return err
	}
	return validateOpenPaneWorkflowNodeDetailsConfig(open.SurfaceKind, open.WorkflowNodeDetailsConfig)
}

func validateOpenPanePayloadExclusivity(operation WorkspaceUIPaneOperation) error {
	if operation.Close != nil {
		return errors.New("workspace pane operation close payload is only valid for close_pane")
	}
	if operation.Configure != nil {
		return errors.New("workspace pane operation configure payload is only valid for configure_pane")
	}
	if operation.Move != nil {
		return errors.New("workspace pane operation move payload is only valid for move_pane")
	}
	if operation.Rename != nil {
		return errors.New("workspace pane operation rename payload is only valid for rename_pane")
	}
	if operation.Reorder != nil {
		return errors.New("workspace pane operation reorder payload is only valid for reorder_pane")
	}
	if operation.Resize != nil {
		return errors.New("workspace pane operation resize payload is only valid for resize_pane")
	}
	return nil
}

func validateConfigurePaneOperation(operation WorkspaceUIPaneOperation) error {
	if operation.Close != nil {
		return errors.New("workspace pane operation close payload is only valid for close_pane")
	}
	if operation.Move != nil {
		return errors.New("workspace pane operation move payload is only valid for move_pane")
	}
	if operation.Open != nil {
		return errors.New("workspace pane operation open payload is only valid for open_pane")
	}
	if operation.Rename != nil {
		return errors.New("workspace pane operation rename payload is only valid for rename_pane")
	}
	if operation.Reorder != nil {
		return errors.New("workspace pane operation reorder payload is only valid for reorder_pane")
	}
	if operation.Resize != nil {
		return errors.New("workspace pane operation resize payload is only valid for resize_pane")
	}
	if operation.Configure == nil {
		return errors.New("workspace pane configure payload is required")
	}
	return validateConfigurePanePayload(*operation.Configure)
}

func validateConfigurePanePayload(configure WorkspaceUIPaneConfigureOperation) error {
	if !configurePanePayloadHasField(configure) {
		return errors.New("workspace pane configure requires at least one configurable field")
	}
	if err := validateConfigurePaneSurfaceKind(configure.SurfaceKind); err != nil {
		return err
	}
	if err := validateConfigurePaneTitle(configure.Title); err != nil {
		return err
	}
	if err := validateConfigurePaneSubtitle(configure.Subtitle); err != nil {
		return err
	}
	if err := validateConfigurePaneTone(configure.Tone); err != nil {
		return err
	}
	if err := validateConfigurePaneTerminalConfigForSurface(configure.SurfaceKind, configure.TerminalConfig); err != nil {
		return err
	}
	return validateConfigurePaneWorkflowNodeDetailsConfigForSurface(configure.SurfaceKind, configure.WorkflowNodeDetailsConfig)
}

func configurePanePayloadHasField(configure WorkspaceUIPaneConfigureOperation) bool {
	return configure.SurfaceKind != nil ||
		configure.Title != nil ||
		configure.Subtitle != nil ||
		configure.Tone != nil ||
		configure.TerminalConfig != nil ||
		configure.WorkflowNodeDetailsConfig != nil
}

func validateConfigurePaneSurfaceKind(surfaceKind *SurfaceKind) error {
	if surfaceKind == nil {
		return nil
	}
	if !validSurfaceKind(*surfaceKind) {
		return fmt.Errorf("workspace pane configure surfaceKind is unsupported: %s", *surfaceKind)
	}
	return nil
}

func validateConfigurePaneTitle(title *string) error {
	if title == nil {
		return nil
	}
	if *title == "" {
		return errors.New("workspace pane configure title is required when provided")
	}
	if strings.TrimSpace(*title) != *title {
		return errors.New("workspace pane configure title must not have surrounding whitespace")
	}
	return nil
}

func validateConfigurePaneSubtitle(subtitle *string) error {
	if subtitle == nil || strings.TrimSpace(*subtitle) == *subtitle {
		return nil
	}
	return errors.New("workspace pane configure subtitle must not have surrounding whitespace")
}

func validateConfigurePaneTone(tone *PaneTone) error {
	if tone == nil {
		return nil
	}
	if !validPaneTone(*tone) {
		return fmt.Errorf("workspace pane configure tone is unsupported: %s", *tone)
	}
	return nil
}

func validateConfigurePaneTerminalConfigForSurface(surfaceKind *SurfaceKind, config *TerminalPaneConfig) error {
	if config == nil {
		return nil
	}
	if surfaceKind != nil && *surfaceKind != SurfaceKindTerminal {
		return errors.New("workspace pane configure terminalConfig is only valid for terminal panes")
	}
	return validateConfigurePaneTerminalConfig(*config)
}

func validateConfigurePaneTerminalConfig(config TerminalPaneConfig) error {
	if strings.TrimSpace(config.ProfileID) != config.ProfileID {
		return errors.New("workspace pane configure terminalConfig.profileId must not have surrounding whitespace")
	}
	if strings.TrimSpace(config.CWDOverride) != config.CWDOverride {
		return errors.New("workspace pane configure terminalConfig.cwdOverride must not have surrounding whitespace")
	}
	if strings.TrimSpace(config.TitleOverride) != config.TitleOverride {
		return errors.New("workspace pane configure terminalConfig.titleOverride must not have surrounding whitespace")
	}
	return nil
}

func validateOpenPaneMetadata(open WorkspaceUIPaneOpenOperation) error {
	if open.SurfaceKind == "" {
		return errors.New("workspace pane open surfaceKind is required")
	}
	if !validSurfaceKind(open.SurfaceKind) {
		return fmt.Errorf("workspace pane open surfaceKind is unsupported: %s", open.SurfaceKind)
	}
	if open.Title == "" {
		return errors.New("workspace pane open title is required")
	}
	if strings.TrimSpace(open.Title) != open.Title {
		return errors.New("workspace pane open title must not have surrounding whitespace")
	}
	if strings.TrimSpace(open.Subtitle) != open.Subtitle {
		return errors.New("workspace pane open subtitle must not have surrounding whitespace")
	}
	if !validPaneTone(open.Tone) {
		return fmt.Errorf("workspace pane open tone is unsupported: %s", open.Tone)
	}
	return nil
}

func validateOpenPaneTarget(open WorkspaceUIPaneOpenOperation) error {
	targetCount := 0
	if open.AdjacentToColumnID != "" {
		targetCount += 1
	}
	if open.Row != nil {
		targetCount += 1
	}
	if open.Plane != nil {
		targetCount += 1
	}
	if targetCount > 1 {
		return errors.New("workspace pane open must include at most one target")
	}
	if open.Row != nil {
		if open.WidthSpec != nil {
			return errors.New("workspace pane open row target must not include widthSpec")
		}
		return validateOpenPaneTargetPane("row", open.Row.TargetPaneID, open.Row.Placement)
	}
	if open.Plane != nil {
		return validateOpenPaneTargetPane("plane", open.Plane.TargetPaneID, open.Plane.Placement)
	}
	return nil
}

func validateOpenPaneTargetPane(name string, targetPaneID string, placement WorkspaceUIPaneDropPlacement) error {
	if targetPaneID == "" {
		return fmt.Errorf("workspace pane open %s targetPaneId is required", name)
	}
	if !validPaneDropPlacement(placement) {
		return fmt.Errorf("workspace pane open %s placement is unsupported: %s", name, placement)
	}
	return nil
}

func validateOpenPaneTerminalConfig(surfaceKind SurfaceKind, config *TerminalPaneConfig) error {
	if config == nil {
		return nil
	}
	if surfaceKind != SurfaceKindTerminal {
		return errors.New("workspace pane open terminalConfig is only valid for terminal panes")
	}
	if strings.TrimSpace(config.ProfileID) != config.ProfileID {
		return errors.New("workspace pane open terminalConfig.profileId must not have surrounding whitespace")
	}
	if strings.TrimSpace(config.CWDOverride) != config.CWDOverride {
		return errors.New("workspace pane open terminalConfig.cwdOverride must not have surrounding whitespace")
	}
	if strings.TrimSpace(config.TitleOverride) != config.TitleOverride {
		return errors.New("workspace pane open terminalConfig.titleOverride must not have surrounding whitespace")
	}
	return nil
}

func validateReorderPaneIntent(intent WorkspaceUIPaneReorderIntent) error {
	switch intent.Kind {
	case WorkspaceUIPaneReorderIntentKindColumn:
		return validateReorderPaneColumnIntent(intent)
	case WorkspaceUIPaneReorderIntentKindPlaneSlot:
		return validateReorderPanePlaneSlotIntent(intent)
	case WorkspaceUIPaneReorderIntentKindRow:
		return validateReorderPaneRowIntent(intent)
	case WorkspaceUIPaneReorderIntentKindSwap:
		return validateReorderPaneSwapIntent(intent)
	case "":
		return errors.New("workspace pane reorder intent kind is required")
	default:
		return fmt.Errorf("workspace pane reorder intent kind is unsupported: %s", intent.Kind)
	}
}

func validateReorderPaneRowIntent(intent WorkspaceUIPaneReorderIntent) error {
	if intent.TargetPaneID == "" {
		return errors.New("workspace pane reorder row targetPaneId is required")
	}
	if !validPaneDropPlacement(intent.Placement) {
		return fmt.Errorf("workspace pane reorder row placement is unsupported: %s", intent.Placement)
	}
	if intent.TargetColumnID != "" || intent.PlaneIndex != nil || intent.ReferenceColumnID != "" || intent.SlotIndex != nil || intent.SlotPlacement != "" {
		return errors.New("workspace pane reorder row intent includes fields for another intent kind")
	}
	return nil
}

func validateReorderPaneSwapIntent(intent WorkspaceUIPaneReorderIntent) error {
	if intent.TargetPaneID == "" {
		return errors.New("workspace pane reorder swap targetPaneId is required")
	}
	if intent.Placement != "" || intent.TargetColumnID != "" || intent.PlaneIndex != nil || intent.ReferenceColumnID != "" || intent.SlotIndex != nil || intent.SlotPlacement != "" {
		return errors.New("workspace pane reorder swap intent includes fields for another intent kind")
	}
	return nil
}

func validateReorderPaneColumnIntent(intent WorkspaceUIPaneReorderIntent) error {
	if intent.TargetColumnID == "" {
		return errors.New("workspace pane reorder column targetColumnId is required")
	}
	if intent.PlaneIndex == nil {
		return errors.New("workspace pane reorder column planeIndex is required")
	}
	if *intent.PlaneIndex < 0 {
		return errors.New("workspace pane reorder column planeIndex must be non-negative")
	}
	if !validPaneDropPlacement(intent.SlotPlacement) {
		return fmt.Errorf("workspace pane reorder column slotPlacement is unsupported: %s", intent.SlotPlacement)
	}
	if intent.TargetPaneID != "" || intent.Placement != "" || intent.ReferenceColumnID != "" || intent.SlotIndex != nil {
		return errors.New("workspace pane reorder column intent includes fields for another intent kind")
	}
	return nil
}

func validateReorderPanePlaneSlotIntent(intent WorkspaceUIPaneReorderIntent) error {
	if intent.PlaneIndex == nil {
		return errors.New("workspace pane reorder plane-slot planeIndex is required")
	}
	if intent.ReferenceColumnID == "" {
		return errors.New("workspace pane reorder plane-slot referenceColumnId is required")
	}
	if intent.SlotIndex == nil {
		return errors.New("workspace pane reorder plane-slot slotIndex is required")
	}
	if *intent.SlotIndex < 0 {
		return errors.New("workspace pane reorder plane-slot slotIndex must be non-negative")
	}
	if intent.TargetPaneID != "" || intent.Placement != "" || intent.TargetColumnID != "" || intent.SlotPlacement != "" {
		return errors.New("workspace pane reorder plane-slot intent includes fields for another intent kind")
	}
	return nil
}

func validPaneDropPlacement(placement WorkspaceUIPaneDropPlacement) bool {
	switch placement {
	case WorkspaceUIPaneDropPlacementAfter,
		WorkspaceUIPaneDropPlacementBefore:
		return true
	default:
		return false
	}
}

func validateResizePaneOperation(operation WorkspaceUIPaneOperation) error {
	if operation.Close != nil {
		return errors.New("workspace pane operation close payload is only valid for close_pane")
	}
	if operation.Configure != nil {
		return errors.New("workspace pane operation configure payload is only valid for configure_pane")
	}
	if operation.Move != nil {
		return errors.New("workspace pane operation move payload is only valid for move_pane")
	}
	if operation.Rename != nil {
		return errors.New("workspace pane operation rename payload is only valid for rename_pane")
	}
	if operation.Open != nil {
		return errors.New("workspace pane operation open payload is only valid for open_pane")
	}
	if operation.Reorder != nil {
		return errors.New("workspace pane operation reorder payload is only valid for reorder_pane")
	}
	if operation.Resize == nil {
		return errors.New("workspace pane resize payload is required")
	}
	return validateResizePaneTarget(operation)
}

func validateResizePaneTarget(operation WorkspaceUIPaneOperation) error {
	resize := *operation.Resize
	if resizeTargetCount(resize) != 1 {
		return errors.New("workspace pane resize requires exactly one of widthSpec, heightPx, heightDeltaPx, heightScale, resetHeight, or split")
	}
	switch {
	case resize.WidthSpec != nil:
		return validateResizeColumnWidthSpec(*resize.WidthSpec)
	case resize.HeightPX != nil:
		return validateResizePaneHeightPX(*resize.HeightPX)
	case resize.HeightScale != nil:
		return validateResizePaneHeightScale(*resize.HeightScale)
	case resize.Split != nil:
		return validateResizePaneSplit(operation.PaneID, *resize.Split)
	default:
		return nil
	}
}

func resizeTargetCount(resize WorkspaceUIPaneResizeOperation) int {
	targetCount := 0
	if resize.WidthSpec != nil {
		targetCount += 1
	}
	if resize.HeightPX != nil {
		targetCount += 1
	}
	if resize.HeightDeltaPX != nil {
		targetCount += 1
	}
	if resize.HeightScale != nil {
		targetCount += 1
	}
	if resize.ResetHeight {
		targetCount += 1
	}
	if resize.Split != nil {
		targetCount += 1
	}
	return targetCount
}

func validateResizeColumnWidthSpec(widthSpec ColumnWidthSpec) error {
	if !validColumnWidthUnit(widthSpec.Unit) {
		return fmt.Errorf("workspace pane resize widthSpec unit is unsupported: %s", widthSpec.Unit)
	}
	if math.IsNaN(widthSpec.Value) || math.IsInf(widthSpec.Value, 0) {
		return errors.New("workspace pane resize widthSpec value must be finite")
	}
	if widthSpec.Value <= 0 {
		return errors.New("workspace pane resize widthSpec value must be positive")
	}
	return nil
}

func validateResizePaneHeightPX(heightPX int) error {
	if heightPX <= 0 {
		return errors.New("workspace pane resize heightPx must be positive")
	}
	return nil
}

func validateResizePaneHeightScale(heightScale float64) error {
	if math.IsNaN(heightScale) || math.IsInf(heightScale, 0) {
		return errors.New("workspace pane resize heightScale must be finite")
	}
	if heightScale <= 0 {
		return errors.New("workspace pane resize heightScale must be positive")
	}
	return nil
}

func validateResizePaneSplit(upperPaneID string, split WorkspaceUIPaneSplitResizeOperation) error {
	if split.LowerPaneID == "" {
		return errors.New("workspace pane resize split lowerPaneId is required")
	}
	if split.LowerPaneID == upperPaneID {
		return errors.New("workspace pane resize split lowerPaneId must differ from paneId")
	}
	if err := validateResizePaneSplitWeight("upperWeight", split.UpperWeight); err != nil {
		return err
	}
	return validateResizePaneSplitWeight("lowerWeight", split.LowerWeight)
}

func validateResizePaneSplitWeight(field string, weight float64) error {
	if math.IsNaN(weight) || math.IsInf(weight, 0) {
		return fmt.Errorf("workspace pane resize split %s must be finite", field)
	}
	if weight <= 0 {
		return fmt.Errorf("workspace pane resize split %s must be positive", field)
	}
	return nil
}
