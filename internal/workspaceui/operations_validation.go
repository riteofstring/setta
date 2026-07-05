package workspaceui

import (
	"errors"
	"fmt"
	"math"
	"strings"
)

func validatePaneOperation(operation WorkspaceUIPaneOperation) error {
	if operation.Kind == "" {
		return errors.New("workspace pane operation kind is required")
	}
	if operation.PaneID == "" {
		return errors.New("workspace pane operation paneId is required")
	}
	switch operation.Kind {
	case WorkspaceUIPaneOperationKindClosePane:
		return validateClosePaneOperation(operation)
	case WorkspaceUIPaneOperationKindFocusPane:
		return validateFocusPaneOperation(operation)
	case WorkspaceUIPaneOperationKindMovePane:
		return validateMovePaneOperation(operation)
	case WorkspaceUIPaneOperationKindRenamePane:
		return validateRenamePaneOperation(operation)
	case WorkspaceUIPaneOperationKindReorderPane:
		return validateReorderPaneOperation(operation)
	case WorkspaceUIPaneOperationKindResizePane:
		return validateResizePaneOperation(operation)
	}
	return nil
}

func validateClosePaneOperation(operation WorkspaceUIPaneOperation) error {
	if operation.Close == nil {
		return errors.New("workspace pane close payload is required")
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
	if !validSurfaceCloseMode(operation.Close.SurfaceClose) {
		return fmt.Errorf("workspace pane close surfaceClose is unsupported: %s", operation.Close.SurfaceClose)
	}
	return nil
}

func validateFocusPaneOperation(operation WorkspaceUIPaneOperation) error {
	if operation.Close != nil {
		return errors.New("workspace pane operation close payload is only valid for close_pane")
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

func validateMovePaneOperation(operation WorkspaceUIPaneOperation) error {
	if operation.Close != nil {
		return errors.New("workspace pane operation close payload is only valid for close_pane")
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
	if operation.Move != nil {
		return errors.New("workspace pane operation move payload is only valid for move_pane")
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
	if operation.Move != nil {
		return errors.New("workspace pane operation move payload is only valid for move_pane")
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
	if operation.Move != nil {
		return errors.New("workspace pane operation move payload is only valid for move_pane")
	}
	if operation.Rename != nil {
		return errors.New("workspace pane operation rename payload is only valid for rename_pane")
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
