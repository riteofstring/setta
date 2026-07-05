package workspaceui

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"setta/internal/orchestrator"
	"setta/internal/workspace"
)

func TestStorePersistsWorkspaceUILayout(t *testing.T) {
	appDataDir := t.TempDir()
	store := newTestStore(t, appDataDir)
	layout := testLayout("workspace_api")

	saved, err := store.SaveLayout(layout)
	if err != nil {
		t.Fatalf("save layout: %v", err)
	}
	loaded, err := store.LoadLayout(layout.WorkspaceID)
	if err != nil {
		t.Fatalf("load layout: %v", err)
	}

	if saved.WorkspaceID != layout.WorkspaceID {
		t.Fatalf("saved workspaceID = %q, want %q", saved.WorkspaceID, layout.WorkspaceID)
	}
	if loaded.Layout == nil {
		t.Fatal("loaded layout is nil")
	}
	if loaded.Layout.FocusedPaneID != "workspace_pane_1" {
		t.Fatalf("focusedPaneId = %q, want workspace_pane_1", loaded.Layout.FocusedPaneID)
	}
	if loaded.Layout.Revision != 1 {
		t.Fatalf("revision = %d, want 1", loaded.Layout.Revision)
	}
	if loaded.Layout.Columns[0].PreviousProportionWidth == nil || *loaded.Layout.Columns[0].PreviousProportionWidth != 0.42 {
		t.Fatalf("previous proportion width = %#v", loaded.Layout.Columns[0].PreviousProportionWidth)
	}
	if _, err := os.Stat(StateFilePath(appDataDir, layout.WorkspaceID)); err != nil {
		t.Fatalf("stat layout file: %v", err)
	}
}

func TestLoadMissingWorkspaceUILayoutReturnsNilLayout(t *testing.T) {
	store := newTestStore(t, t.TempDir())

	result, err := store.LoadLayout("workspace_api")
	if err != nil {
		t.Fatalf("load missing layout: %v", err)
	}
	if result.WorkspaceID != "workspace_api" {
		t.Fatalf("workspaceID = %q, want workspace_api", result.WorkspaceID)
	}
	if result.Layout != nil {
		t.Fatalf("layout = %+v, want nil", result.Layout)
	}
}

func TestStoreRejectsMalformedWorkspaceUILayout(t *testing.T) {
	appDataDir := t.TempDir()
	store := newTestStore(t, appDataDir)
	path := StateFilePath(appDataDir, "workspace_api")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("create state dir: %v", err)
	}
	if err := os.WriteFile(path, []byte("{"), 0o644); err != nil {
		t.Fatalf("write malformed layout: %v", err)
	}

	_, err := store.LoadLayout("workspace_api")
	if err == nil {
		t.Fatal("load succeeded, want malformed workspace UI state error")
	}
	if !IsCorruptStateError(err) {
		t.Fatalf("error = %T %v, want corrupt state", err, err)
	}
}

func TestStoreRejectsSchemaOneWorkspaceUILayout(t *testing.T) {
	appDataDir := t.TempDir()
	store := newTestStore(t, appDataDir)
	path := StateFilePath(appDataDir, "workspace_api")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("create state dir: %v", err)
	}
	if err := os.WriteFile(path, []byte(`{"schemaVersion":1}`), 0o644); err != nil {
		t.Fatalf("write old layout: %v", err)
	}

	_, err := store.LoadLayout("workspace_api")
	if err == nil {
		t.Fatal("load succeeded, want unsupported schema error")
	}
	if !IsCorruptStateError(err) || !strings.Contains(err.Error(), "unsupported schemaVersion 1") {
		t.Fatalf("error = %T %v, want unsupported schema corrupt state", err, err)
	}
}

func TestStoreRejectsWorkspaceUILayoutWithoutPositiveRevision(t *testing.T) {
	store := newTestStore(t, t.TempDir())
	layout := testLayout("workspace_api")
	layout.Revision = 0

	_, err := store.SaveLayout(layout)
	if err == nil {
		t.Fatal("save succeeded, want missing revision error")
	}
	if !IsCorruptStateError(err) || !strings.Contains(err.Error(), "revision must be positive") {
		t.Fatalf("error = %T %v, want revision corrupt state", err, err)
	}
}

func TestStoreRejectsWorkspaceIDPathTraversal(t *testing.T) {
	store := newTestStore(t, t.TempDir())
	layout := testLayout("../workspace_api")

	if _, err := store.SaveLayout(layout); err == nil {
		t.Fatal("save succeeded, want invalid workspace id error")
	}
	if _, err := store.LoadLayout("../workspace_api"); err == nil {
		t.Fatal("load succeeded, want invalid workspace id error")
	}
}

func TestStoreRejectsInvalidLayoutRelationships(t *testing.T) {
	store := newTestStore(t, t.TempDir())
	layout := testLayout("workspace_api")
	layout.Columns[0].PaneIDs = []string{"workspace_pane_missing"}

	_, err := store.SaveLayout(layout)
	if err == nil {
		t.Fatal("save succeeded, want relationship error")
	}
	if !IsCorruptStateError(err) {
		t.Fatalf("error = %T %v, want corrupt state", err, err)
	}
}

func TestStoreAllowsDefaultTerminalProfile(t *testing.T) {
	store := newTestStore(t, t.TempDir())
	layout := testLayout("workspace_api")
	layout.Panes[1].TerminalConfig.ProfileID = ""

	if _, err := store.SaveLayout(layout); err != nil {
		t.Fatalf("save layout with default terminal profile: %v", err)
	}
}

func TestStoreRejectsTerminalConfigOnOtherPane(t *testing.T) {
	store := newTestStore(t, t.TempDir())
	layout := testLayout("workspace_api")
	layout.Panes[0].TerminalConfig = &TerminalPaneConfig{
		ProfileID:     "default",
		CWDOverride:   "",
		TitleOverride: "",
	}

	_, err := store.SaveLayout(layout)
	if err == nil {
		t.Fatal("save succeeded, want misplaced terminal config error")
	}
	if !IsCorruptStateError(err) || !strings.Contains(err.Error(), "terminalConfig is only valid for terminal panes") {
		t.Fatalf("error = %T %v, want misplaced terminal config corrupt state", err, err)
	}
}

func TestStorePersistsWorkflowNodeDetailsPaneConfig(t *testing.T) {
	store := newTestStore(t, t.TempDir())
	layout := testLayout("workspace_api")
	layout.Panes[0].SurfaceKind = SurfaceKindWorkflowNodeDetails
	layout.Panes[0].WorkflowNodeDetailsConfig = testWorkflowNodeDetailsConfig(layout.WorkspaceID)

	if _, err := store.SaveLayout(layout); err != nil {
		t.Fatalf("save layout with workflow node details config: %v", err)
	}
	loaded, err := store.LoadLayout(layout.WorkspaceID)
	if err != nil {
		t.Fatalf("load layout: %v", err)
	}
	if loaded.Layout == nil || loaded.Layout.Panes[0].WorkflowNodeDetailsConfig == nil {
		t.Fatalf("loaded workflow node details config = %+v", loaded.Layout)
	}
	if loaded.Layout.Panes[0].WorkflowNodeDetailsConfig.NodeID != "activity" {
		t.Fatalf("loaded node id = %q, want activity", loaded.Layout.Panes[0].WorkflowNodeDetailsConfig.NodeID)
	}
	if loaded.Layout.Panes[0].WorkflowNodeDetailsConfig.NodeExecutionID != "workflow_node_execution_test" {
		t.Fatalf("loaded node execution id = %q, want workflow_node_execution_test", loaded.Layout.Panes[0].WorkflowNodeDetailsConfig.NodeExecutionID)
	}
}

func TestStorePersistsDraftWorkflowNodeDetailsPaneConfig(t *testing.T) {
	store := newTestStore(t, t.TempDir())
	layout := testLayout("workspace_api")
	layout.Panes[0].SurfaceKind = SurfaceKindWorkflowNodeDetails
	layout.Panes[0].WorkflowNodeDetailsConfig = testDraftWorkflowNodeDetailsConfig(layout.WorkspaceID)

	if _, err := store.SaveLayout(layout); err != nil {
		t.Fatalf("save layout with draft workflow node details config: %v", err)
	}
	loaded, err := store.LoadLayout(layout.WorkspaceID)
	if err != nil {
		t.Fatalf("load layout: %v", err)
	}
	config := loaded.Layout.Panes[0].WorkflowNodeDetailsConfig
	if config == nil {
		t.Fatalf("loaded workflow node details config = nil")
	}
	if config.ExecutionID != "" || config.NodeExecutionID != "" || config.ViewMode != orchestrator.GraphViewModeDraft {
		t.Fatalf("loaded draft config = %+v, want draft with empty run identity", config)
	}
}

func TestStoreRejectsWorkflowNodeDetailsConfigWorkspaceMismatch(t *testing.T) {
	store := newTestStore(t, t.TempDir())
	layout := testLayout("workspace_api")
	layout.Panes[0].SurfaceKind = SurfaceKindWorkflowNodeDetails
	layout.Panes[0].WorkflowNodeDetailsConfig = testWorkflowNodeDetailsConfig("workspace_other")

	_, err := store.SaveLayout(layout)
	if err == nil {
		t.Fatal("save succeeded, want mismatched workflow node details workspace error")
	}
	if !IsCorruptStateError(err) || !strings.Contains(err.Error(), "does not match layout workspaceId") {
		t.Fatalf("error = %T %v, want workspace mismatch corrupt state", err, err)
	}
}

func TestStoreRejectsWorkflowNodeDetailsPaneWithoutConfig(t *testing.T) {
	store := newTestStore(t, t.TempDir())
	layout := testLayout("workspace_api")
	layout.Panes[0].SurfaceKind = SurfaceKindWorkflowNodeDetails

	_, err := store.SaveLayout(layout)
	if err == nil {
		t.Fatal("save succeeded, want missing workflow node details config error")
	}
	if !IsCorruptStateError(err) || !strings.Contains(err.Error(), "workflowNodeDetailsConfig is required") {
		t.Fatalf("error = %T %v, want required config corrupt state", err, err)
	}
}

func TestStoreRejectsWorkflowNodeDetailsRunConfigWithoutNodeExecution(t *testing.T) {
	store := newTestStore(t, t.TempDir())
	layout := testLayout("workspace_api")
	layout.Panes[0].SurfaceKind = SurfaceKindWorkflowNodeDetails
	layout.Panes[0].WorkflowNodeDetailsConfig = testWorkflowNodeDetailsConfig(layout.WorkspaceID)
	layout.Panes[0].WorkflowNodeDetailsConfig.NodeExecutionID = ""

	_, err := store.SaveLayout(layout)
	if err == nil {
		t.Fatal("save succeeded, want missing workflow node execution config error")
	}
	if !IsCorruptStateError(err) || !strings.Contains(err.Error(), "nodeExecutionId is required for run view") {
		t.Fatalf("error = %T %v, want required node execution corrupt state", err, err)
	}
}

func TestStoreRejectsWorkflowNodeDetailsDraftConfigWithRunIdentity(t *testing.T) {
	store := newTestStore(t, t.TempDir())
	layout := testLayout("workspace_api")
	layout.Panes[0].SurfaceKind = SurfaceKindWorkflowNodeDetails
	layout.Panes[0].WorkflowNodeDetailsConfig = testDraftWorkflowNodeDetailsConfig(layout.WorkspaceID)
	layout.Panes[0].WorkflowNodeDetailsConfig.ExecutionID = "workflow_execution_stale"

	_, err := store.SaveLayout(layout)
	if err == nil {
		t.Fatal("save succeeded, want stale draft run identity error")
	}
	if !IsCorruptStateError(err) || !strings.Contains(err.Error(), "executionId is only valid for run view") {
		t.Fatalf("error = %T %v, want draft run identity corrupt state", err, err)
	}
}

func TestStoreRejectsWorkflowNodeDetailsConfigOnOtherPane(t *testing.T) {
	store := newTestStore(t, t.TempDir())
	layout := testLayout("workspace_api")
	layout.Panes[0].WorkflowNodeDetailsConfig = testWorkflowNodeDetailsConfig(layout.WorkspaceID)

	_, err := store.SaveLayout(layout)
	if err == nil {
		t.Fatal("save succeeded, want misplaced workflow node details config error")
	}
	if !IsCorruptStateError(err) || !strings.Contains(err.Error(), "only valid for workflow-node-details") {
		t.Fatalf("error = %T %v, want misplaced config corrupt state", err, err)
	}
}

func TestServiceRequiresResolvedWorkspace(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{})

	_, err := service.ReadLayout("workspace_api")
	if err == nil {
		t.Fatal("read succeeded, want workspace resolver error")
	}
	if !strings.Contains(err.Error(), "workspace not found") {
		t.Fatalf("error = %q, want workspace not found", err)
	}
}

func TestServicePersistsResolvedWorkspaceLayout(t *testing.T) {
	appDataDir := t.TempDir()
	service := newTestService(t, appDataDir, testResolver{
		"workspace_api": "/tmp/api",
	})

	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}
	loaded, err := service.ReadLayout("workspace_api")
	if err != nil {
		t.Fatalf("read layout: %v", err)
	}
	if loaded.Layout == nil || loaded.Layout.WorkspaceID != "workspace_api" {
		t.Fatalf("loaded layout = %+v", loaded.Layout)
	}
}

func TestServiceListsPaneDescriptors(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	list, err := service.ListPanes("workspace_api")
	if err != nil {
		t.Fatalf("list panes: %v", err)
	}
	if !list.LayoutPresent {
		t.Fatal("layoutPresent = false, want true")
	}
	if len(list.Panes) != 2 {
		t.Fatalf("panes = %+v, want two panes", list.Panes)
	}
	assertChatPaneDescriptor(t, list.Panes[0])
	assertTerminalPaneDescriptor(t, list.Panes[1])
}

func assertChatPaneDescriptor(t *testing.T, pane WorkspaceUIPaneDescriptor) {
	t.Helper()
	if pane.PaneID != "workspace_pane_0" || pane.Focused || pane.Location.PaneIndex != 0 {
		t.Fatalf("chat pane descriptor = %+v", pane)
	}
	if pane.ReadModes == nil || len(pane.ReadModes) != 1 || pane.ReadModes[0] != WorkspaceUIPaneReadModeMetadata {
		t.Fatalf("chat read modes = %+v, want metadata", pane.ReadModes)
	}
	if pane.WriteModes == nil || len(pane.WriteModes) != 0 {
		t.Fatalf("chat write modes = %+v, want empty slice", pane.WriteModes)
	}
	if pane.CanFocus || pane.CanMove || pane.CanClosePane {
		t.Fatalf("chat layout mutation capabilities = focus:%v move:%v close:%v, want false", pane.CanFocus, pane.CanMove, pane.CanClosePane)
	}
}

func assertTerminalPaneDescriptor(t *testing.T, pane WorkspaceUIPaneDescriptor) {
	t.Helper()
	if !pane.Focused || pane.Location.PaneIndex != 1 || pane.Location.PaneCount != 2 {
		t.Fatalf("terminal pane descriptor = %+v", pane)
	}
	if pane.RuntimeState.Status != WorkspaceUIPaneRuntimeStatusLayoutOnly {
		t.Fatalf("terminal runtime state = %+v, want layout_only", pane.RuntimeState)
	}
	if pane.ContentRefs.Terminal == nil {
		t.Fatalf("terminal content ref = nil")
	}
	if pane.ContentRefs.Terminal.ProfileID != "default" || pane.ContentRefs.Terminal.SessionID != "" {
		t.Fatalf("terminal content ref = %+v, want profile default and no session", pane.ContentRefs.Terminal)
	}
}

func TestServiceListsEmptyPanesWhenLayoutMissing(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	list, err := service.ListPanes("workspace_api")
	if err != nil {
		t.Fatalf("list panes without layout: %v", err)
	}
	if list.LayoutPresent {
		t.Fatal("layoutPresent = true, want false")
	}
	if list.Panes == nil || len(list.Panes) != 0 {
		t.Fatalf("panes = %+v, want empty slice", list.Panes)
	}
}

func TestServiceReadsPaneDescriptor(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	read, err := service.ReadPane("workspace_api", "workspace_pane_1")
	if err != nil {
		t.Fatalf("read pane: %v", err)
	}
	if read.Pane.PaneID != "workspace_pane_1" || !read.Pane.Focused {
		t.Fatalf("read pane = %+v, want focused terminal", read.Pane)
	}
	if read.Schema.LayoutSchemaVersion != SchemaVersion {
		t.Fatalf("schema = %+v, want layout schema version %d", read.Schema, SchemaVersion)
	}
}

func TestServiceReadPaneRejectsMissingPane(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	_, err := service.ReadPane("workspace_api", "workspace_pane_missing")
	if err == nil || !strings.Contains(err.Error(), "workspace pane not found") {
		t.Fatalf("error = %v, want missing pane", err)
	}
}

func TestServiceAppliesFocusPaneOperation(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindFocusPane,
		PaneID: "workspace_pane_0",
	})
	if err != nil {
		t.Fatalf("apply focus operation: %v", err)
	}
	if !result.Changed {
		t.Fatal("changed = false, want true")
	}
	if result.Revision != 2 || result.Layout.Revision != 2 {
		t.Fatalf("revision = result %d layout %d, want 2", result.Revision, result.Layout.Revision)
	}
	if result.Layout.FocusedPaneID != "workspace_pane_0" {
		t.Fatalf("focused pane = %q, want workspace_pane_0", result.Layout.FocusedPaneID)
	}
	if result.OperationResult.PreviousFocusedPaneID != "workspace_pane_1" || result.OperationResult.FocusedPaneID != "workspace_pane_0" {
		t.Fatalf("operation result = %+v, want focus change", result.OperationResult)
	}
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
	if loaded.Layout == nil || loaded.Layout.FocusedPaneID != "workspace_pane_0" || loaded.Layout.Revision != 2 {
		t.Fatalf("loaded layout = %+v, want focused pane 0 at revision 2", loaded.Layout)
	}
}

func TestServiceFocusPaneOperationNoopsWhenAlreadyFocused(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindFocusPane,
		PaneID: "workspace_pane_1",
	})
	if err != nil {
		t.Fatalf("apply focus operation: %v", err)
	}
	if result.Changed {
		t.Fatal("changed = true, want false")
	}
	if result.Revision != 1 || result.Layout.Revision != 1 {
		t.Fatalf("revision = result %d layout %d, want 1", result.Revision, result.Layout.Revision)
	}
	if result.OperationResult.PreviousFocusedPaneID != "workspace_pane_1" || result.OperationResult.FocusedPaneID != "workspace_pane_1" {
		t.Fatalf("operation result = %+v, want unchanged focus", result.OperationResult)
	}
}

func TestServiceFocusPaneOperationRejectsMissingPane(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindFocusPane,
		PaneID: "workspace_pane_missing",
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodePaneNotFound {
		t.Fatalf("error = %T %v, want pane_not_found", err, err)
	}

	loaded, err := service.ReadLayout("workspace_api")
	if err != nil {
		t.Fatalf("read layout: %v", err)
	}
	if loaded.Layout == nil || loaded.Layout.FocusedPaneID != "workspace_pane_1" || loaded.Layout.Revision != 1 {
		t.Fatalf("loaded layout = %+v, want original focus and revision", loaded.Layout)
	}
}

func TestServiceAppliesMovePaneOperationWithinColumn(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindMovePane,
		PaneID: "workspace_pane_1",
		Move:   movePaneOperation(WorkspaceUIPaneMoveDirectionUp),
	})
	if err != nil {
		t.Fatalf("apply move operation: %v", err)
	}
	if !result.Changed {
		t.Fatal("changed = false, want true")
	}
	if result.Revision != 2 || result.Layout.Revision != 2 {
		t.Fatalf("revision = result %d layout %d, want 2", result.Revision, result.Layout.Revision)
	}
	assertPaneIDs(t, result.Layout.Columns[0].PaneIDs, "workspace_pane_1", "workspace_pane_0")
	if result.Layout.FocusedPaneID != "workspace_pane_1" {
		t.Fatalf("focused pane = %q, want workspace_pane_1", result.Layout.FocusedPaneID)
	}
	assertMoveOutcome(t, result.OperationResult.Move, WorkspaceUIPaneMoveOutcome{
		ColumnID:            "workspace_column_0",
		ColumnIndex:         0,
		Direction:           WorkspaceUIPaneMoveDirectionUp,
		PaneIndex:           0,
		PlaneIndex:          0,
		PreviousColumnID:    "workspace_column_0",
		PreviousColumnIndex: 0,
		PreviousPaneIndex:   1,
		PreviousPlaneIndex:  0,
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
		t.Fatal("loaded layout = nil, want moved pane layout")
	}
	if loaded.Layout.Revision != 2 {
		t.Fatalf("loaded layout = %+v, want moved pane at revision 2", loaded.Layout)
	}
	assertPaneIDs(t, loaded.Layout.Columns[0].PaneIDs, "workspace_pane_1", "workspace_pane_0")
}

func TestServiceAppliesMovePaneOperationToAdjacentColumn(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testMultiColumnLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindMovePane,
		PaneID: "workspace_pane_0",
		Move:   movePaneOperation(WorkspaceUIPaneMoveDirectionRight),
	})
	if err != nil {
		t.Fatalf("apply move operation: %v", err)
	}
	if !result.Changed {
		t.Fatal("changed = false, want true")
	}
	if len(result.Layout.Columns) != 2 {
		t.Fatalf("columns = %+v, want two non-empty columns", result.Layout.Columns)
	}
	assertPaneIDs(t, result.Layout.Columns[0].PaneIDs, "workspace_pane_2")
	assertPaneIDs(t, result.Layout.Columns[1].PaneIDs, "workspace_pane_1", "workspace_pane_0")
	movedPane := paneByID(t, result.Layout, "workspace_pane_0")
	if movedPane.ColumnID != "workspace_column_1" {
		t.Fatalf("moved pane columnId = %q, want workspace_column_1", movedPane.ColumnID)
	}
	assertMoveOutcome(t, result.OperationResult.Move, WorkspaceUIPaneMoveOutcome{
		ColumnID:            "workspace_column_1",
		ColumnIndex:         1,
		Direction:           WorkspaceUIPaneMoveDirectionRight,
		PaneIndex:           1,
		PlaneIndex:          0,
		PreviousColumnID:    "workspace_column_0",
		PreviousColumnIndex: 0,
		PreviousPaneIndex:   0,
		PreviousPlaneIndex:  0,
	})
}

func TestServiceMovePaneOperationRemovesEmptySourceColumn(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	layout := testMultiColumnLayout("workspace_api")
	layout.Columns[0].PaneIDs = []string{"workspace_pane_0"}
	layout.Panes = []WorkspaceUIPane{layout.Panes[0], layout.Panes[1]}
	if _, err := service.SaveLayout(layout); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindMovePane,
		PaneID: "workspace_pane_0",
		Move:   movePaneOperation(WorkspaceUIPaneMoveDirectionRight),
	})
	if err != nil {
		t.Fatalf("apply move operation: %v", err)
	}
	if !result.Changed {
		t.Fatal("changed = false, want true")
	}
	if len(result.Layout.Columns) != 1 {
		t.Fatalf("columns = %+v, want empty source removed", result.Layout.Columns)
	}
	column := result.Layout.Columns[0]
	if column.ColumnID != "workspace_column_1" {
		t.Fatalf("remaining column id = %q, want workspace_column_1", column.ColumnID)
	}
	if column.Index != 0 {
		t.Fatalf("remaining column = %+v, want target column reindexed", column)
	}
	assertPaneIDs(t, column.PaneIDs, "workspace_pane_1", "workspace_pane_0")
}

func TestServiceMovePaneOperationNoopsAtBoundary(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindMovePane,
		PaneID: "workspace_pane_0",
		Move:   movePaneOperation(WorkspaceUIPaneMoveDirectionUp),
	})
	if err != nil {
		t.Fatalf("apply move operation: %v", err)
	}
	if result.Changed {
		t.Fatal("changed = true, want false")
	}
	if result.Revision != 1 || result.Layout.Revision != 1 {
		t.Fatalf("revision = result %d layout %d, want 1", result.Revision, result.Layout.Revision)
	}
	assertPaneIDs(t, result.Layout.Columns[0].PaneIDs, "workspace_pane_0", "workspace_pane_1")
	assertMoveOutcome(t, result.OperationResult.Move, WorkspaceUIPaneMoveOutcome{
		ColumnID:            "workspace_column_0",
		ColumnIndex:         0,
		Direction:           WorkspaceUIPaneMoveDirectionUp,
		PaneIndex:           0,
		PlaneIndex:          0,
		PreviousColumnID:    "workspace_column_0",
		PreviousColumnIndex: 0,
		PreviousPaneIndex:   0,
		PreviousPlaneIndex:  0,
	})
}

func TestServiceMovePaneOperationRejectsMissingPane(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindMovePane,
		PaneID: "workspace_pane_missing",
		Move:   movePaneOperation(WorkspaceUIPaneMoveDirectionDown),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodePaneNotFound {
		t.Fatalf("error = %T %v, want pane_not_found", err, err)
	}
}

func TestServiceAppliesClosePaneOperation(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindClosePane,
		PaneID: "workspace_pane_1",
		Close:  closePaneOperation(WorkspaceUISurfaceCloseModeNone),
	})
	if err != nil {
		t.Fatalf("apply close operation: %v", err)
	}
	if !result.Changed {
		t.Fatal("changed = false, want true")
	}
	if result.Revision != 2 || result.Layout.Revision != 2 {
		t.Fatalf("revision = result %d layout %d, want 2", result.Revision, result.Layout.Revision)
	}
	if result.Layout.FocusedPaneID != "workspace_pane_0" {
		t.Fatalf("focused pane = %q, want workspace_pane_0", result.Layout.FocusedPaneID)
	}
	if len(result.Layout.Panes) != 1 {
		t.Fatalf("panes = %+v, want one remaining pane", result.Layout.Panes)
	}
	assertPaneIDs(t, result.Layout.Columns[0].PaneIDs, "workspace_pane_0")
	if result.OperationResult.PreviousFocusedPaneID != "workspace_pane_1" || result.OperationResult.FocusedPaneID != "workspace_pane_0" {
		t.Fatalf("operation result = %+v, want focus retargeted to remaining pane", result.OperationResult)
	}
	assertCloseOutcome(t, result.OperationResult.Close, WorkspaceUIPaneCloseOutcome{
		ColumnID:      "workspace_column_0",
		ColumnIndex:   0,
		PaneIndex:     1,
		PlaneIndex:    0,
		RemovedColumn: false,
		SurfaceClose:  WorkspaceUISurfaceCloseModeNone,
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
	if loaded.Layout == nil || loaded.Layout.FocusedPaneID != "workspace_pane_0" || loaded.Layout.Revision != 2 {
		t.Fatalf("loaded layout = %+v, want pane 0 focused at revision 2", loaded.Layout)
	}
	assertPaneIDs(t, loaded.Layout.Columns[0].PaneIDs, "workspace_pane_0")
}

func TestServiceClosePaneOperationKeepsFocusWhenClosingUnfocusedPane(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindClosePane,
		PaneID: "workspace_pane_0",
		Close:  closePaneOperation(WorkspaceUISurfaceCloseModeNone),
	})
	if err != nil {
		t.Fatalf("apply close operation: %v", err)
	}
	if result.Layout.FocusedPaneID != "workspace_pane_1" {
		t.Fatalf("focused pane = %q, want workspace_pane_1", result.Layout.FocusedPaneID)
	}
	assertPaneIDs(t, result.Layout.Columns[0].PaneIDs, "workspace_pane_1")
	if result.OperationResult.PreviousFocusedPaneID != "workspace_pane_1" || result.OperationResult.FocusedPaneID != "workspace_pane_1" {
		t.Fatalf("operation result = %+v, want unchanged focus", result.OperationResult)
	}
}

func TestServiceClosePaneOperationRemovesEmptyColumnAndRetargetsFocus(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testMultiColumnLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindClosePane,
		PaneID: "workspace_pane_1",
		Close:  closePaneOperation(WorkspaceUISurfaceCloseModeNone),
	})
	if err != nil {
		t.Fatalf("apply close operation: %v", err)
	}
	if len(result.Layout.Columns) != 1 {
		t.Fatalf("columns = %+v, want empty focused column removed", result.Layout.Columns)
	}
	column := result.Layout.Columns[0]
	if column.ColumnID != "workspace_column_0" || column.Index != 0 {
		t.Fatalf("remaining column = %+v, want original column 0 reindexed", column)
	}
	assertPaneIDs(t, column.PaneIDs, "workspace_pane_0", "workspace_pane_2")
	if result.Layout.FocusedPaneID != "workspace_pane_0" {
		t.Fatalf("focused pane = %q, want workspace_pane_0", result.Layout.FocusedPaneID)
	}
	assertCloseOutcome(t, result.OperationResult.Close, WorkspaceUIPaneCloseOutcome{
		ColumnID:      "workspace_column_1",
		ColumnIndex:   1,
		PaneIndex:     0,
		PlaneIndex:    0,
		RemovedColumn: true,
		SurfaceClose:  WorkspaceUISurfaceCloseModeNone,
	})
}

func TestServiceClosePaneOperationRejectsLastPane(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	layout := testLayout("workspace_api")
	layout.FocusedPaneID = "workspace_pane_0"
	layout.Columns[0].PaneIDs = []string{"workspace_pane_0"}
	layout.Panes = []WorkspaceUIPane{layout.Panes[0]}
	if _, err := service.SaveLayout(layout); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindClosePane,
		PaneID: "workspace_pane_0",
		Close:  closePaneOperation(WorkspaceUISurfaceCloseModeNone),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeLastPane {
		t.Fatalf("error = %T %v, want last_pane", err, err)
	}
	loaded, err := service.ReadLayout("workspace_api")
	if err != nil {
		t.Fatalf("read layout: %v", err)
	}
	if loaded.Layout == nil || loaded.Layout.FocusedPaneID != "workspace_pane_0" || loaded.Layout.Revision != 1 {
		t.Fatalf("loaded layout = %+v, want original single pane layout", loaded.Layout)
	}
}

func TestServiceClosePaneOperationRejectsMissingPane(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindClosePane,
		PaneID: "workspace_pane_missing",
		Close:  closePaneOperation(WorkspaceUISurfaceCloseModeNone),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodePaneNotFound {
		t.Fatalf("error = %T %v, want pane_not_found", err, err)
	}
}

func TestServiceClosePaneOperationRejectsSurfaceCloseSafe(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindClosePane,
		PaneID: "workspace_pane_1",
		Close:  closePaneOperation(WorkspaceUISurfaceCloseModeSafe),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeUnsupportedSurfaceClose {
		t.Fatalf("error = %T %v, want unsupported_surface_close", err, err)
	}
}

func TestServicePaneOperationRejectsMissingLayout(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindFocusPane,
		PaneID: "workspace_pane_0",
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeMissingLayout {
		t.Fatalf("error = %T %v, want missing_layout", err, err)
	}
}

func TestServicePaneOperationRejectsUnsupportedOperation(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKind("rename_pane"),
		PaneID: "workspace_pane_0",
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeUnsupportedOperation {
		t.Fatalf("error = %T %v, want unsupported_operation", err, err)
	}
}

func TestServicePaneOperationRejectsInvalidOperation(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind: WorkspaceUIPaneOperationKindFocusPane,
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}
}

func TestServicePaneOperationRejectsFocusWithMovePayload(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindFocusPane,
		PaneID: "workspace_pane_0",
		Move:   movePaneOperation(WorkspaceUIPaneMoveDirectionRight),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}
}

func TestServicePaneOperationRejectsFocusWithClosePayload(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindFocusPane,
		PaneID: "workspace_pane_0",
		Close:  closePaneOperation(WorkspaceUISurfaceCloseModeNone),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}
}

func TestServicePaneOperationRejectsMoveWithoutPayload(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindMovePane,
		PaneID: "workspace_pane_0",
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}
}

func TestServicePaneOperationRejectsMoveWithClosePayload(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindMovePane,
		PaneID: "workspace_pane_0",
		Close:  closePaneOperation(WorkspaceUISurfaceCloseModeNone),
		Move:   movePaneOperation(WorkspaceUIPaneMoveDirectionRight),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}
}

func TestServicePaneOperationRejectsInvalidMoveDirection(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindMovePane,
		PaneID: "workspace_pane_0",
		Move:   movePaneOperation(WorkspaceUIPaneMoveDirection("sideways")),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}
}

func TestServicePaneOperationRejectsCloseWithoutPayload(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindClosePane,
		PaneID: "workspace_pane_0",
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}
}

func TestServicePaneOperationRejectsCloseWithMovePayload(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindClosePane,
		PaneID: "workspace_pane_0",
		Close:  closePaneOperation(WorkspaceUISurfaceCloseModeNone),
		Move:   movePaneOperation(WorkspaceUIPaneMoveDirectionRight),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}
}

func TestServicePaneOperationRejectsInvalidCloseSurfaceMode(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindClosePane,
		PaneID: "workspace_pane_0",
		Close:  closePaneOperation(WorkspaceUISurfaceCloseMode("later")),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %T %v, want invalid_operation", err, err)
	}
}

func closePaneOperation(surfaceClose WorkspaceUISurfaceCloseMode) *WorkspaceUIPaneCloseOperation {
	return &WorkspaceUIPaneCloseOperation{SurfaceClose: surfaceClose}
}

func movePaneOperation(direction WorkspaceUIPaneMoveDirection) *WorkspaceUIPaneMoveOperation {
	return &WorkspaceUIPaneMoveOperation{Direction: direction}
}

func operationErrorCode(t *testing.T, err error) WorkspaceUIOperationErrorCode {
	t.Helper()
	var operationError *WorkspaceUIOperationError
	if !errors.As(err, &operationError) {
		t.Fatalf("error = %T %v, want WorkspaceUIOperationError", err, err)
	}
	return operationError.Code
}

func assertPaneIDs(t *testing.T, got []string, want ...string) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("pane ids = %+v, want %+v", got, want)
	}
}

func assertMoveOutcome(t *testing.T, got *WorkspaceUIPaneMoveOutcome, want WorkspaceUIPaneMoveOutcome) {
	t.Helper()
	if got == nil {
		t.Fatal("move outcome = nil")
	}
	if !reflect.DeepEqual(*got, want) {
		t.Fatalf("move outcome = %+v, want %+v", got, want)
	}
}

func assertCloseOutcome(t *testing.T, got *WorkspaceUIPaneCloseOutcome, want WorkspaceUIPaneCloseOutcome) {
	t.Helper()
	if got == nil {
		t.Fatal("close outcome = nil")
	}
	if !reflect.DeepEqual(*got, want) {
		t.Fatalf("close outcome = %+v, want %+v", got, want)
	}
}

func paneByID(t *testing.T, layout WorkspaceUILayout, paneID string) WorkspaceUIPane {
	t.Helper()
	for _, pane := range layout.Panes {
		if pane.PaneID == paneID {
			return pane
		}
	}
	t.Fatalf("pane %s not found in layout %+v", paneID, layout)
	return WorkspaceUIPane{}
}

func newTestStore(t *testing.T, appDataDir string) *Store {
	t.Helper()

	store, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	return store
}

func newTestService(t *testing.T, appDataDir string, resolver testResolver) *Service {
	t.Helper()

	service, err := NewService(newTestStore(t, appDataDir), resolver)
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	return service
}

type testResolver map[string]string

func (resolver testResolver) ResolveWorkspace(id string) (workspace.WorkspaceSummary, error) {
	rootPath, ok := resolver[id]
	if !ok {
		return workspace.WorkspaceSummary{}, errors.New("workspace not found: " + id)
	}
	return workspace.WorkspaceSummary{
		ID:           id,
		RootPath:     rootPath,
		DisplayName:  id,
		LastOpenedAt: "2026-05-29T20:00:00Z",
	}, nil
}

func testLayout(workspaceID string) WorkspaceUILayout {
	previous := 0.42
	return WorkspaceUILayout{
		SchemaVersion: SchemaVersion,
		Revision:      1,
		WorkspaceID:   workspaceID,
		FocusedPaneID: "workspace_pane_1",
		Columns: []WorkspaceUIColumn{
			{
				ColumnID:                "workspace_column_0",
				IdealWidthSpec:          ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 520},
				Index:                   0,
				PaneIDs:                 []string{"workspace_pane_0", "workspace_pane_1"},
				PlaneIndex:              0,
				PreviousProportionWidth: &previous,
				SlotIndex:               0,
				WidthSpec:               ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 620},
			},
		},
		Panes: []WorkspaceUIPane{
			{
				ColumnID:    "workspace_column_0",
				Heat:        0,
				PaneID:      "workspace_pane_0",
				Sequence:    0,
				Subtitle:    "workspace chat",
				SurfaceID:   "workspace_surface_0",
				SurfaceKind: SurfaceKindChatDOM,
				Title:       "Chat",
				Tone:        PaneToneCyan,
				Weight:      1.6,
			},
			{
				ColumnID:    "workspace_column_0",
				Heat:        37,
				PaneID:      "workspace_pane_1",
				Sequence:    1,
				Subtitle:    "terminal",
				SurfaceID:   "workspace_surface_1",
				SurfaceKind: SurfaceKindTerminal,
				TerminalConfig: &TerminalPaneConfig{
					ProfileID:     "default",
					CWDOverride:   "",
					TitleOverride: "",
				},
				Title:  "Terminal",
				Tone:   PaneToneGreen,
				Weight: 1,
			},
		},
	}
}

func testMultiColumnLayout(workspaceID string) WorkspaceUILayout {
	layout := testLayout(workspaceID)
	layout.Columns = []WorkspaceUIColumn{
		{
			ColumnID:       "workspace_column_0",
			IdealWidthSpec: ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 520},
			Index:          0,
			PaneIDs:        []string{"workspace_pane_0", "workspace_pane_2"},
			PlaneIndex:     0,
			SlotIndex:      0,
			WidthSpec:      ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 620},
		},
		{
			ColumnID:       "workspace_column_1",
			IdealWidthSpec: ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 440},
			Index:          1,
			PaneIDs:        []string{"workspace_pane_1"},
			PlaneIndex:     0,
			SlotIndex:      1,
			WidthSpec:      ColumnWidthSpec{Unit: ColumnWidthUnitPX, Value: 480},
		},
	}
	layout.Panes[1].ColumnID = "workspace_column_1"
	layout.Panes = append(layout.Panes, WorkspaceUIPane{
		ColumnID:    "workspace_column_0",
		Heat:        74,
		PaneID:      "workspace_pane_2",
		Sequence:    2,
		Subtitle:    "workflow graph",
		SurfaceID:   "workspace_surface_2",
		SurfaceKind: SurfaceKindWorkflowGraph,
		Title:       "Workflow",
		Tone:        PaneToneOrange,
		Weight:      1,
	})
	return layout
}

func testWorkflowNodeDetailsConfig(workspaceID string) *WorkflowNodeDetailsPaneConfig {
	return &WorkflowNodeDetailsPaneConfig{
		DefinitionID:            "workflow_definition_test",
		DefinitionName:          "Review Workflow",
		DefinitionVersionID:     "workflow_version_test",
		DefinitionVersionNumber: 1,
		ExecutionID:             "workflow_execution_test",
		NodeID:                  "activity",
		NodeExecutionID:         "workflow_node_execution_test",
		NodeKind:                orchestrator.NodeKindAction,
		NodeLabel:               "Activity",
		NodeStatus:              orchestrator.GraphNodeStatusSucceeded,
		ProjectionIncomingEdges: []orchestrator.WorkflowGraphEdge{},
		ProjectionOutgoingEdges: []orchestrator.WorkflowGraphEdge{},
		VersionMismatch:         false,
		ViewMode:                orchestrator.GraphViewModeRun,
		WorkspaceID:             workspaceID,
	}
}

func testDraftWorkflowNodeDetailsConfig(workspaceID string) *WorkflowNodeDetailsPaneConfig {
	return &WorkflowNodeDetailsPaneConfig{
		DefinitionID:            "workflow_definition_test",
		DefinitionName:          "Review Workflow",
		DefinitionVersionID:     "",
		DefinitionVersionNumber: 0,
		ExecutionID:             "",
		NodeID:                  "activity",
		NodeExecutionID:         "",
		NodeKind:                orchestrator.NodeKindAction,
		NodeLabel:               "Activity",
		NodeStatus:              orchestrator.GraphNodeStatusNotStarted,
		ProjectionIncomingEdges: []orchestrator.WorkflowGraphEdge{},
		ProjectionOutgoingEdges: []orchestrator.WorkflowGraphEdge{},
		VersionMismatch:         false,
		ViewMode:                orchestrator.GraphViewModeDraft,
		WorkspaceID:             workspaceID,
	}
}
