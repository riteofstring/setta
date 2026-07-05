package workspaceui

import (
	"reflect"
	"testing"
)

func TestServiceAppliesConfigurePaneOperationToTerminal(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}
	configure := configurePaneOperation(SurfaceKindTerminal, "Build Terminal", "command surface", PaneToneGreen)
	configure.TerminalConfig = &TerminalPaneConfig{
		ProfileID:     "build",
		CWDOverride:   "/tmp/api",
		TitleOverride: "build shell",
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:      WorkspaceUIPaneOperationKindConfigurePane,
		PaneID:    "workspace_pane_0",
		Configure: configure,
	})
	if err != nil {
		t.Fatalf("apply configure operation: %v", err)
	}
	assertConfigureTerminalResult(t, result, *configure.TerminalConfig)
	assertConfiguredTerminalPersisted(t, service)
}

func assertConfigureTerminalResult(t *testing.T, result WorkspaceUIPaneOperationResult, terminalConfig TerminalPaneConfig) {
	t.Helper()
	assertConfigureTerminalRevisionAndFocus(t, result)
	configuredPane := paneByID(t, result.Layout, "workspace_pane_0")
	assertConfiguredTerminalPane(t, configuredPane, terminalConfig)
	assertConfigureOutcome(t, result.OperationResult.Configure, WorkspaceUIPaneConfigureOutcome{
		PreviousSubtitle:    "workspace chat",
		PreviousSurfaceID:   "workspace_surface_0",
		PreviousSurfaceKind: SurfaceKindChatDOM,
		PreviousTitle:       "Chat",
		PreviousTone:        PaneToneCyan,
		Subtitle:            "command surface",
		SurfaceID:           "workspace_surface_2",
		SurfaceKind:         SurfaceKindTerminal,
		Title:               "Build Terminal",
		Tone:                PaneToneGreen,
	})
	assertPaneIDs(t, result.Layout.Columns[0].PaneIDs, "workspace_pane_0", "workspace_pane_1")
}

func assertConfigureTerminalRevisionAndFocus(t *testing.T, result WorkspaceUIPaneOperationResult) {
	t.Helper()
	if !result.Changed {
		t.Fatal("changed = false, want true")
	}
	if result.Revision != 2 || result.Layout.Revision != 2 {
		t.Fatalf("revision = result %d layout %d, want 2", result.Revision, result.Layout.Revision)
	}
	if result.Layout.FocusedPaneID != "workspace_pane_0" {
		t.Fatalf("focused pane = %q, want configured pane", result.Layout.FocusedPaneID)
	}
	if result.OperationResult.PreviousFocusedPaneID != "workspace_pane_1" ||
		result.OperationResult.FocusedPaneID != "workspace_pane_0" {
		t.Fatalf("operation focus fields = %+v, want configured pane focused", result.OperationResult)
	}
}

func assertConfiguredTerminalPane(t *testing.T, configuredPane WorkspaceUIPane, terminalConfig TerminalPaneConfig) {
	t.Helper()
	if configuredPane.Sequence != 0 || configuredPane.SurfaceID != "workspace_surface_2" {
		t.Fatalf("configured pane identity = %+v, want same pane with new surface id", configuredPane)
	}
	if configuredPane.SurfaceKind != SurfaceKindTerminal ||
		configuredPane.Title != "Build Terminal" ||
		configuredPane.Subtitle != "command surface" ||
		configuredPane.Tone != PaneToneGreen {
		t.Fatalf("configured pane = %+v, want terminal metadata", configuredPane)
	}
	if configuredPane.TerminalConfig == nil || *configuredPane.TerminalConfig != terminalConfig {
		t.Fatalf("terminal config = %+v, want %+v", configuredPane.TerminalConfig, terminalConfig)
	}
	if configuredPane.WorkflowNodeDetailsConfig != nil {
		t.Fatalf("workflow node details config = %+v, want nil", configuredPane.WorkflowNodeDetailsConfig)
	}
}

func assertConfiguredTerminalPersisted(t *testing.T, service *Service) {
	t.Helper()
	loaded, err := service.ReadLayout("workspace_api")
	if err != nil {
		t.Fatalf("read layout: %v", err)
	}
	if loaded.Layout == nil ||
		loaded.Layout.Revision != 2 ||
		paneByID(t, *loaded.Layout, "workspace_pane_0").SurfaceKind != SurfaceKindTerminal {
		t.Fatalf("loaded layout = %+v, want persisted configured pane", loaded.Layout)
	}
}

func TestServiceConfigurePaneOperationPreservesOmittedFields(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}
	title := "Command Center"

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindConfigurePane,
		PaneID: "workspace_pane_1",
		Configure: &WorkspaceUIPaneConfigureOperation{
			Title: &title,
		},
	})
	if err != nil {
		t.Fatalf("apply configure operation: %v", err)
	}
	configuredPane := paneByID(t, result.Layout, "workspace_pane_1")
	if configuredPane.SurfaceKind != SurfaceKindTerminal ||
		configuredPane.Subtitle != "terminal" ||
		configuredPane.Tone != PaneToneGreen {
		t.Fatalf("configured pane = %+v, want existing surface metadata preserved", configuredPane)
	}
	if configuredPane.TerminalConfig == nil || configuredPane.TerminalConfig.ProfileID != "default" {
		t.Fatalf("terminal config = %+v, want existing config preserved", configuredPane.TerminalConfig)
	}
	if configuredPane.Title != "Command Center" || configuredPane.SurfaceID != "workspace_surface_2" {
		t.Fatalf("configured pane = %+v, want title change and fresh surface", configuredPane)
	}
}

func TestServiceAppliesConfigurePaneOperationToWorkflowGraph(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:      WorkspaceUIPaneOperationKindConfigurePane,
		PaneID:    "workspace_pane_1",
		Configure: configurePaneOperation(SurfaceKindWorkflowGraph, "Workflow Graph", "workflow graph", PaneToneCyan),
	})
	if err != nil {
		t.Fatalf("apply configure operation: %v", err)
	}
	configuredPane := paneByID(t, result.Layout, "workspace_pane_1")
	if configuredPane.SurfaceKind != SurfaceKindWorkflowGraph || configuredPane.TerminalConfig != nil {
		t.Fatalf("configured pane = %+v, want workflow graph without terminal config", configuredPane)
	}
	if configuredPane.Title != "Workflow Graph" || configuredPane.SurfaceID != "workspace_surface_2" {
		t.Fatalf("configured pane = %+v, want workflow graph metadata and fresh surface", configuredPane)
	}
}

func TestServiceAppliesConfigurePaneOperationToEmptyFrame(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	layout := testLayout("workspace_api")
	layout.Panes[0].SurfaceKind = SurfaceKindEmptyFrame
	layout.Panes[0].Title = "New frame"
	layout.Panes[0].Subtitle = "choose a pane type"
	layout.Panes[0].Tone = PaneToneSlate
	if _, err := service.SaveLayout(layout); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:      WorkspaceUIPaneOperationKindConfigurePane,
		PaneID:    "workspace_pane_0",
		Configure: configurePaneOperation(SurfaceKindEmptyFrame, "Scratch frame", "choose a pane type", PaneToneSlate),
	})
	if err != nil {
		t.Fatalf("apply configure operation: %v", err)
	}
	configuredPane := paneByID(t, result.Layout, "workspace_pane_0")
	if configuredPane.SurfaceKind != SurfaceKindEmptyFrame ||
		configuredPane.TerminalConfig != nil ||
		configuredPane.WorkflowNodeDetailsConfig != nil {
		t.Fatalf("configured pane = %+v, want empty frame without domain config", configuredPane)
	}
	assertConfigureOutcome(t, result.OperationResult.Configure, WorkspaceUIPaneConfigureOutcome{
		PreviousSubtitle:    "choose a pane type",
		PreviousSurfaceID:   "workspace_surface_0",
		PreviousSurfaceKind: SurfaceKindEmptyFrame,
		PreviousTitle:       "New frame",
		PreviousTone:        PaneToneSlate,
		Subtitle:            "choose a pane type",
		SurfaceID:           "workspace_surface_2",
		SurfaceKind:         SurfaceKindEmptyFrame,
		Title:               "Scratch frame",
		Tone:                PaneToneSlate,
	})
}

func TestServiceAppliesConfigurePaneOperationToWorkflowNodeDetails(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}
	config := testWorkflowNodeDetailsConfig("workspace_api")
	configure := configurePaneOperation(
		SurfaceKindWorkflowNodeDetails,
		"Workflow Node",
		"workflow node details",
		PaneToneCyan,
	)
	configure.WorkflowNodeDetailsConfig = config

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:      WorkspaceUIPaneOperationKindConfigurePane,
		PaneID:    "workspace_pane_1",
		Configure: configure,
	})
	if err != nil {
		t.Fatalf("apply configure operation: %v", err)
	}
	configuredPane := paneByID(t, result.Layout, "workspace_pane_1")
	if configuredPane.SurfaceKind != SurfaceKindWorkflowNodeDetails ||
		configuredPane.TerminalConfig != nil ||
		!reflect.DeepEqual(configuredPane.WorkflowNodeDetailsConfig, config) {
		t.Fatalf("configured pane = %+v, want workflow node details config", configuredPane)
	}
	assertConfigureOutcome(t, result.OperationResult.Configure, WorkspaceUIPaneConfigureOutcome{
		PreviousSubtitle:    "terminal",
		PreviousSurfaceID:   "workspace_surface_1",
		PreviousSurfaceKind: SurfaceKindTerminal,
		PreviousTitle:       "Terminal",
		PreviousTone:        PaneToneGreen,
		Subtitle:            "workflow node details",
		SurfaceID:           "workspace_surface_2",
		SurfaceKind:         SurfaceKindWorkflowNodeDetails,
		Title:               "Workflow Node",
		Tone:                PaneToneCyan,
	})
}

func TestServiceConfigurePaneOperationRetargetsWorkflowNodeDetails(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	layout := testLayout("workspace_api")
	firstTarget := testWorkflowNodeDetailsConfig("workspace_api")
	layout.Panes[0].SurfaceKind = SurfaceKindWorkflowNodeDetails
	layout.Panes[0].Title = "Workflow Node"
	layout.Panes[0].WorkflowNodeDetailsConfig = firstTarget
	if _, err := service.SaveLayout(layout); err != nil {
		t.Fatalf("save layout: %v", err)
	}
	secondTarget := testWorkflowNodeDetailsConfig("workspace_api")
	secondTarget.NodeID = "review"
	secondTarget.NodeExecutionID = "workflow_node_execution_review"
	secondTarget.NodeLabel = "Review"

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindConfigurePane,
		PaneID: "workspace_pane_0",
		Configure: &WorkspaceUIPaneConfigureOperation{
			WorkflowNodeDetailsConfig: secondTarget,
		},
	})
	if err != nil {
		t.Fatalf("apply configure operation: %v", err)
	}
	configuredPane := paneByID(t, result.Layout, "workspace_pane_0")
	if configuredPane.SurfaceKind != SurfaceKindWorkflowNodeDetails ||
		!reflect.DeepEqual(configuredPane.WorkflowNodeDetailsConfig, secondTarget) {
		t.Fatalf("configured pane = %+v, want retargeted workflow details", configuredPane)
	}
	if configuredPane.SurfaceID != "workspace_surface_2" || result.Layout.FocusedPaneID != "workspace_pane_0" {
		t.Fatalf("configured pane = %+v focus = %q, want fresh surface focused", configuredPane, result.Layout.FocusedPaneID)
	}
}

func TestServiceConfigurePaneOperationPreservesExistingWorkflowNodeDetailsTarget(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	layout := testLayout("workspace_api")
	target := testWorkflowNodeDetailsConfig("workspace_api")
	layout.Panes[0].SurfaceKind = SurfaceKindWorkflowNodeDetails
	layout.Panes[0].Title = "Workflow Node"
	layout.Panes[0].WorkflowNodeDetailsConfig = target
	if _, err := service.SaveLayout(layout); err != nil {
		t.Fatalf("save layout: %v", err)
	}
	title := "Workflow Node Details"

	result, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:   WorkspaceUIPaneOperationKindConfigurePane,
		PaneID: "workspace_pane_0",
		Configure: &WorkspaceUIPaneConfigureOperation{
			Title: &title,
		},
	})
	if err != nil {
		t.Fatalf("apply configure operation: %v", err)
	}
	configuredPane := paneByID(t, result.Layout, "workspace_pane_0")
	if configuredPane.Title != title ||
		!reflect.DeepEqual(configuredPane.WorkflowNodeDetailsConfig, target) {
		t.Fatalf("configured pane = %+v, want title change with preserved details target", configuredPane)
	}
}

func TestServiceRejectsConfigurePaneUnsupportedSurfaceKindWithoutPersisting(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:      WorkspaceUIPaneOperationKindConfigurePane,
		PaneID:    "workspace_pane_0",
		Configure: configurePaneOperation(SurfaceKindSettingsDOM, "Settings", "workspace settings", PaneToneSlate),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeUnsupportedOperation {
		t.Fatalf("error = %v, want unsupported operation", err)
	}
	assertPersistedPaneUnchanged(
		t,
		service,
		"workspace_api",
		"workspace_pane_0",
		SurfaceKindChatDOM,
		"workspace_surface_0",
		1,
	)
}

func TestServiceRejectsConfigurePaneWorkflowNodeDetailsWithoutConfig(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:      WorkspaceUIPaneOperationKindConfigurePane,
		PaneID:    "workspace_pane_1",
		Configure: configurePaneOperation(SurfaceKindWorkflowNodeDetails, "Workflow Node", "workflow node details", PaneToneCyan),
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %v, want invalid operation", err)
	}
	assertPersistedPaneUnchanged(
		t,
		service,
		"workspace_api",
		"workspace_pane_1",
		SurfaceKindTerminal,
		"workspace_surface_1",
		1,
	)
}

func TestServiceRejectsConfigurePaneWorkflowNodeDetailsWorkspaceMismatchWithoutPersisting(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}
	configure := configurePaneOperation(SurfaceKindWorkflowNodeDetails, "Workflow Node", "workflow node details", PaneToneCyan)
	configure.WorkflowNodeDetailsConfig = testWorkflowNodeDetailsConfig("workspace_other")

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:      WorkspaceUIPaneOperationKindConfigurePane,
		PaneID:    "workspace_pane_1",
		Configure: configure,
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %v, want invalid operation", err)
	}
	assertPersistedPaneUnchanged(
		t,
		service,
		"workspace_api",
		"workspace_pane_1",
		SurfaceKindTerminal,
		"workspace_surface_1",
		1,
	)
}

func TestServiceRejectsConfigurePaneTerminalConfigOnNonTerminalWithoutPersisting(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}
	configure := &WorkspaceUIPaneConfigureOperation{
		TerminalConfig: &TerminalPaneConfig{ProfileID: "build"},
	}

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:      WorkspaceUIPaneOperationKindConfigurePane,
		PaneID:    "workspace_pane_0",
		Configure: configure,
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %v, want invalid operation", err)
	}
	assertPersistedPaneUnchanged(
		t,
		service,
		"workspace_api",
		"workspace_pane_0",
		SurfaceKindChatDOM,
		"workspace_surface_0",
		1,
	)
}

func TestServiceRejectsConfigurePaneWorkflowNodeDetailsConfigOnNonDetailsWithoutPersisting(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	if _, err := service.SaveLayout(testLayout("workspace_api")); err != nil {
		t.Fatalf("save layout: %v", err)
	}
	configure := &WorkspaceUIPaneConfigureOperation{
		WorkflowNodeDetailsConfig: testWorkflowNodeDetailsConfig("workspace_api"),
	}

	_, err := service.ApplyPaneOperation("workspace_api", WorkspaceUIPaneOperation{
		Kind:      WorkspaceUIPaneOperationKindConfigurePane,
		PaneID:    "workspace_pane_0",
		Configure: configure,
	})
	if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
		t.Fatalf("error = %v, want invalid operation", err)
	}
	assertPersistedPaneUnchanged(
		t,
		service,
		"workspace_api",
		"workspace_pane_0",
		SurfaceKindChatDOM,
		"workspace_surface_0",
		1,
	)
}

func TestServiceRejectsConfigurePaneInvalidPayloads(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver{
		"workspace_api": "/tmp/api",
	})
	cases := []struct {
		name      string
		operation WorkspaceUIPaneOperation
	}{
		{
			name: "missing configure payload",
			operation: WorkspaceUIPaneOperation{
				Kind:   WorkspaceUIPaneOperationKindConfigurePane,
				PaneID: "workspace_pane_0",
			},
		},
		{
			name: "empty configure payload",
			operation: WorkspaceUIPaneOperation{
				Kind:      WorkspaceUIPaneOperationKindConfigurePane,
				PaneID:    "workspace_pane_0",
				Configure: &WorkspaceUIPaneConfigureOperation{},
			},
		},
		{
			name: "title whitespace",
			operation: WorkspaceUIPaneOperation{
				Kind:   WorkspaceUIPaneOperationKindConfigurePane,
				PaneID: "workspace_pane_0",
				Configure: &WorkspaceUIPaneConfigureOperation{
					Title: stringPointer(" Chat"),
				},
			},
		},
		{
			name: "configure payload on focus",
			operation: WorkspaceUIPaneOperation{
				Kind:      WorkspaceUIPaneOperationKindFocusPane,
				PaneID:    "workspace_pane_0",
				Configure: configurePaneOperation(SurfaceKindChatDOM, "Chat", "workspace chat", PaneToneCyan),
			},
		},
		{
			name: "terminal config with explicit chat surface",
			operation: WorkspaceUIPaneOperation{
				Kind:   WorkspaceUIPaneOperationKindConfigurePane,
				PaneID: "workspace_pane_0",
				Configure: &WorkspaceUIPaneConfigureOperation{
					SurfaceKind:    surfaceKindPointer(SurfaceKindChatDOM),
					TerminalConfig: &TerminalPaneConfig{ProfileID: "default"},
				},
			},
		},
		{
			name: "workflow node details config with explicit chat surface",
			operation: WorkspaceUIPaneOperation{
				Kind:   WorkspaceUIPaneOperationKindConfigurePane,
				PaneID: "workspace_pane_0",
				Configure: &WorkspaceUIPaneConfigureOperation{
					SurfaceKind:               surfaceKindPointer(SurfaceKindChatDOM),
					WorkflowNodeDetailsConfig: testWorkflowNodeDetailsConfig("workspace_api"),
				},
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := service.ApplyPaneOperation("workspace_api", tc.operation)
			if operationErrorCode(t, err) != WorkspaceUIOperationErrorCodeInvalidOperation {
				t.Fatalf("error = %v, want invalid operation", err)
			}
		})
	}
}

func configurePaneOperation(
	surfaceKind SurfaceKind,
	title string,
	subtitle string,
	tone PaneTone,
) *WorkspaceUIPaneConfigureOperation {
	return &WorkspaceUIPaneConfigureOperation{
		Subtitle:    stringPointer(subtitle),
		SurfaceKind: surfaceKindPointer(surfaceKind),
		Title:       stringPointer(title),
		Tone:        paneTonePointer(tone),
	}
}

func assertConfigureOutcome(t *testing.T, got *WorkspaceUIPaneConfigureOutcome, want WorkspaceUIPaneConfigureOutcome) {
	t.Helper()
	if got == nil {
		t.Fatal("configure outcome = nil")
	}
	if !reflect.DeepEqual(*got, want) {
		t.Fatalf("configure outcome = %+v, want %+v", got, want)
	}
}

func assertPersistedPaneUnchanged(
	t *testing.T,
	service *Service,
	workspaceID string,
	paneID string,
	surfaceKind SurfaceKind,
	surfaceID string,
	revision int,
) {
	t.Helper()
	loaded, err := service.ReadLayout(workspaceID)
	if err != nil {
		t.Fatalf("read layout: %v", err)
	}
	if loaded.Layout == nil {
		t.Fatal("loaded layout = nil, want unchanged layout")
	}
	pane := paneByID(t, *loaded.Layout, paneID)
	if loaded.Layout.Revision != revision || pane.SurfaceKind != surfaceKind || pane.SurfaceID != surfaceID {
		t.Fatalf("loaded layout = %+v, pane = %+v, want unchanged pane at revision %d", loaded.Layout, pane, revision)
	}
}

func stringPointer(value string) *string {
	return &value
}

func surfaceKindPointer(value SurfaceKind) *SurfaceKind {
	return &value
}

func paneTonePointer(value PaneTone) *PaneTone {
	return &value
}
