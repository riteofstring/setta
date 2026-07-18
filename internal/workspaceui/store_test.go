package workspaceui

import (
	"errors"
	"os"
	"path/filepath"
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
