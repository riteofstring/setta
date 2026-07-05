package workspaceui

import (
	"reflect"
	"testing"
)

func TestServiceAppliesRenamePaneOperation(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindRenamePane,
		PaneID: "workspace_pane_0",
		Rename: renamePaneOperation("Planning Chat"),
	})
	if err != nil {
		t.Fatalf("apply rename operation: %v", err)
	}
	if !result.Changed {
		t.Fatal("changed = false, want true")
	}
	if result.Revision != 2 || result.Layout.Revision != 2 {
		t.Fatalf("revision = result %d layout %d, want 2", result.Revision, result.Layout.Revision)
	}
	renamedPane := paneByID(t, result.Layout, "workspace_pane_0")
	if renamedPane.Title != "Planning Chat" || renamedPane.Subtitle != "workspace chat" {
		t.Fatalf("renamed pane = %+v, want title change only", renamedPane)
	}
	if result.Layout.FocusedPaneID != "workspace_pane_1" {
		t.Fatalf("focused pane = %q, want workspace_pane_1", result.Layout.FocusedPaneID)
	}
	if result.OperationResult.PreviousFocusedPaneID != "workspace_pane_1" || result.OperationResult.FocusedPaneID != "workspace_pane_1" {
		t.Fatalf("operation result = %+v, want unchanged focus", result.OperationResult)
	}
	assertRenameOutcome(t, result.OperationResult.Rename, WorkspaceUIPaneRenameOutcome{
		PreviousTitle: "Chat",
		Title:         "Planning Chat",
	})
	if result.BeforeAfterDimensions == nil || len(result.BeforeAfterDimensions) != 0 {
		t.Fatalf("beforeAfterDimensions = %+v, want empty slice", result.BeforeAfterDimensions)
	}
	if result.Warnings == nil || len(result.Warnings) != 0 {
		t.Fatalf("warnings = %+v, want empty slice", result.Warnings)
	}

	loaded, err := service.ReadLayout("workspace_api")
	if err != nil {
		t.Fatalf("read layout: %v", err)
	}
	if loaded.Layout == nil {
		t.Fatal("loaded layout = nil, want renamed pane layout")
	}
	loadedPane := paneByID(t, *loaded.Layout, "workspace_pane_0")
	if loaded.Layout.Revision != 2 || loadedPane.Title != "Planning Chat" {
		t.Fatalf("loaded layout = %+v, want renamed pane at revision 2", loaded.Layout)
	}
}

func TestServiceRenamePaneOperationNoopsWhenTitleUnchanged(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindRenamePane,
		PaneID: "workspace_pane_1",
		Rename: renamePaneOperation("Terminal"),
	})
	if err != nil {
		t.Fatalf("apply rename operation: %v", err)
	}
	if result.Changed {
		t.Fatal("changed = true, want false")
	}
	if result.Revision != 1 || result.Layout.Revision != 1 {
		t.Fatalf("revision = result %d layout %d, want 1", result.Revision, result.Layout.Revision)
	}
	assertRenameOutcome(t, result.OperationResult.Rename, WorkspaceUIPaneRenameOutcome{
		PreviousTitle: "Terminal",
		Title:         "Terminal",
	})
}

func TestServiceRenamePaneOperationRejectsMissingPane(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindRenamePane,
		PaneID: "workspace_pane_missing",
		Rename: renamePaneOperation("Missing"),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodePaneNotFound {
		t.Fatalf("error = %T %v, want pane_not_found", err, err)
	}

	loaded, err := service.ReadLayout("workspace_api")
	if err != nil {
		t.Fatalf("read layout: %v", err)
	}
	if loaded.Layout == nil {
		t.Fatal("loaded layout = nil, want original layout")
	}
	loadedPane := paneByID(t, *loaded.Layout, "workspace_pane_0")
	if loaded.Layout.Revision != 1 || loadedPane.Title != "Chat" {
		t.Fatalf("loaded layout = %+v, want original title and revision", loaded.Layout)
	}
}

func TestServicePaneOperationRejectsFocusWithRenamePayload(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindFocusPane,
		PaneID: "workspace_pane_0",
		Rename: renamePaneOperation("Chat"),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}
}

func TestServicePaneOperationRejectsMoveWithRenamePayload(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindMovePane,
		PaneID: "workspace_pane_0",
		Move:   movePaneOperation(WorkspaceUIPaneMoveDirectionRight),
		Rename: renamePaneOperation("Chat"),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}
}

func TestServicePaneOperationRejectsCloseWithRenamePayload(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindClosePane,
		PaneID: "workspace_pane_0",
		Close:  closePaneOperation(WorkspaceUISurfaceCloseModeNone),
		Rename: renamePaneOperation("Chat"),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}
}

func TestServicePaneOperationRejectsRenameWithoutPayload(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindRenamePane,
		PaneID: "workspace_pane_0",
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}
}

func TestServicePaneOperationRejectsRenameWithClosePayload(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindRenamePane,
		PaneID: "workspace_pane_0",
		Close:  closePaneOperation(WorkspaceUISurfaceCloseModeNone),
		Rename: renamePaneOperation("Chat"),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}
}

func TestServicePaneOperationRejectsRenameWithMovePayload(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindRenamePane,
		PaneID: "workspace_pane_0",
		Move:   movePaneOperation(WorkspaceUIPaneMoveDirectionRight),
		Rename: renamePaneOperation("Chat"),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}
}

func TestServicePaneOperationRejectsRenameEmptyTitle(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindRenamePane,
		PaneID: "workspace_pane_0",
		Rename: renamePaneOperation(""),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}
}

func TestServicePaneOperationRejectsRenameTitleWithSurroundingWhitespace(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindRenamePane,
		PaneID: "workspace_pane_0",
		Rename: renamePaneOperation(" Chat "),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}
}

func renamePaneOperation(title string) *WorkspaceUIPaneRenameOperation {
	return &WorkspaceUIPaneRenameOperation{Title: title}
}

func assertRenameOutcome(t *testing.T, got *WorkspaceUIPaneRenameOutcome, want WorkspaceUIPaneRenameOutcome) {
	t.Helper()
	if got == nil {
		t.Fatal("rename outcome = nil")
	}
	if !reflect.DeepEqual(*got, want) {
		t.Fatalf("rename outcome = %+v, want %+v", got, want)
	}
}
