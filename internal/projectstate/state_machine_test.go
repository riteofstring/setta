package projectstate

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"

	"setta/internal/prompttemplates"
)

func TestRuntimeStateMachineMutationsPersistEdgesAndSectionSettings(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": stateMachineMutationTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	// Build the workflow graph through the public runtime mutations.
	if _, err := runtime.CreateStateMachineEdge(context.Background(), "project-alpha", StateMachineEdge{
		ID:              "edge-start-gate",
		MachineGroupID:  "workflow-a",
		SourceSectionID: "start-section",
		SourcePortID:    StateMachineEdgeSourcePortID,
		TargetSectionID: "gate-section",
		TargetPortID:    StateMachineEdgeTargetPortID,
	}, nil); err != nil {
		t.Fatalf("CreateStateMachineEdge start->gate returned error: %v", err)
	}

	promptSectionID := "prompt-section"
	if _, err := runtime.CreateStateMachineEdge(context.Background(), "project-alpha", StateMachineEdge{
		ID:              "edge-gate-chat",
		MachineGroupID:  "workflow-a",
		SourceSectionID: "gate-section",
		SourcePortID:    StateMachineEdgeSourcePortID,
		TargetSectionID: "chat-section",
		TargetPortID:    StateMachineEdgeTargetPortID,
		TargetAction: &StateMachineTargetAction{
			Type:            StateMachineTargetActionTypeSendPrompt,
			PromptSectionID: &promptSectionID,
			PromptInputs:    map[string]string{"name": "Ada"},
			ThreadStrategy:  StateMachineThreadStrategyNewThreadBeforeSend,
			StopIfRunning:   true,
		},
	}, nil); err != nil {
		t.Fatalf("CreateStateMachineEdge gate->chat returned error: %v", err)
	}

	updatedGateToChat := stateMachineTestEdgeByID(t, runtime.Snapshot().Document.Projects["project-alpha"].StateMachineEdges, "edge-gate-chat")
	updatedGateToChat.Hidden = true
	updatedGateToChat.Selected = true
	updatedGateToChat.ZIndex = 11
	updatedGateToChat.SourceActivationCountCondition = &StateMachineSourceActivationCountCondition{
		Operator: StateMachineCountOperatorGTE,
		Value:    2,
	}
	updatedGateToChat.TargetAction.SearchEnabled = stateMachineBoolPointer(true)

	if _, err := runtime.UpdateStateMachineEdge(context.Background(), "project-alpha", updatedGateToChat, nil); err != nil {
		t.Fatalf("UpdateStateMachineEdge returned error: %v", err)
	}

	if _, err := runtime.DeleteStateMachineEdges(context.Background(), "project-alpha", []string{"edge-start-gate"}); err != nil {
		t.Fatalf("DeleteStateMachineEdges returned error: %v", err)
	}

	// Replace the edge set to cover the bulk mutation path and Chat-source filtering.
	if _, err := runtime.SetStateMachineEdges(context.Background(), "project-alpha", []StateMachineEdge{
		updatedGateToChat,
		{
			ID:              "edge-chat-end",
			MachineGroupID:  "workflow-a",
			SourceSectionID: "chat-section",
			SourcePortID:    StateMachineEdgeSourcePortID,
			TargetSectionID: "end-section",
			TargetPortID:    StateMachineEdgeTargetPortID,
			SourceFilter: &StateMachineSourceFilter{
				Type: StateMachineSourceFilterTypeRunCompleted,
			},
		},
	}, nil); err != nil {
		t.Fatalf("SetStateMachineEdges returned error: %v", err)
	}

	// Then update the gate section settings that the frontend pane edits directly.
	gateSectionPayload := func() map[string]any {
		t.Helper()

		project := runtime.Snapshot().Document.Projects["project-alpha"]
		payload, err := effectiveSectionPayload(project, "gate-section", "gate-variant")
		if err != nil {
			t.Fatalf("effectiveSectionPayload gate-section: %v", err)
		}
		return payload
	}
	for _, gateType := range []StateMachineGateType{
		StateMachineGateTypeAND,
		StateMachineGateTypeOR,
		StateMachineGateTypeXOR,
	} {
		if _, err := runtime.SetStateMachineSectionSettings(context.Background(), "project-alpha", "gate-section", StateMachineSectionSettings{
			MachineGroupID: "workflow-a",
			Label:          "Decision",
			GateType:       &gateType,
		}); err != nil {
			t.Fatalf("SetStateMachineSectionSettings(%s) returned error: %v", gateType, err)
		}
		if got := payloadRawStringField(gateSectionPayload(), "gateType"); got != string(gateType) {
			t.Fatalf("expected gate type %q, got %q", gateType, got)
		}
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	if len(project.StateMachineEdges) != 2 {
		t.Fatalf("expected 2 persisted state machine edges, got %d", len(project.StateMachineEdges))
	}

	gateToChat := stateMachineTestEdgeByID(t, project.StateMachineEdges, "edge-gate-chat")
	if !gateToChat.Hidden {
		t.Fatal("expected gate->chat edge hidden=true")
	}
	if !gateToChat.Selected {
		t.Fatal("expected gate->chat edge selected=true")
	}
	if gateToChat.ZIndex != 11 {
		t.Fatalf("expected gate->chat edge zIndex 11, got %d", gateToChat.ZIndex)
	}
	if gateToChat.SourceActivationCountCondition == nil ||
		gateToChat.SourceActivationCountCondition.Operator != StateMachineCountOperatorGTE ||
		gateToChat.SourceActivationCountCondition.Value != 2 {
		t.Fatalf("expected gate->chat activation condition to persist, got %#v", gateToChat.SourceActivationCountCondition)
	}
	if gateToChat.TargetAction == nil {
		t.Fatal("expected gate->chat target action to persist")
	}
	if gateToChat.TargetAction.SearchEnabled == nil || !*gateToChat.TargetAction.SearchEnabled {
		t.Fatalf("expected gate->chat searchEnabled=true, got %#v", gateToChat.TargetAction.SearchEnabled)
	}
	if gateToChat.TargetAction.PromptSectionID == nil || *gateToChat.TargetAction.PromptSectionID != "prompt-section" {
		t.Fatalf("expected gate->chat promptSectionId prompt-section, got %#v", gateToChat.TargetAction.PromptSectionID)
	}
	if gateToChat.TargetAction.ThreadStrategy != StateMachineThreadStrategyNewThreadBeforeSend {
		t.Fatalf("expected gate->chat thread strategy %q, got %q", StateMachineThreadStrategyNewThreadBeforeSend, gateToChat.TargetAction.ThreadStrategy)
	}

	chatToEnd := stateMachineTestEdgeByID(t, project.StateMachineEdges, "edge-chat-end")
	if chatToEnd.SourceFilter == nil || chatToEnd.SourceFilter.Type != StateMachineSourceFilterTypeRunCompleted {
		t.Fatalf("expected chat->end source filter run_completed, got %#v", chatToEnd.SourceFilter)
	}

	gatePayload := gateSectionPayload()
	if got := payloadRawStringField(gatePayload, "machineGroupId"); got != "workflow-a" {
		t.Fatalf("expected gate machineGroupId workflow-a, got %q", got)
	}
	if got := payloadRawStringField(gatePayload, "label"); got != "Decision" {
		t.Fatalf("expected gate label Decision, got %q", got)
	}
	if got := payloadRawStringField(gatePayload, "gateType"); got != string(StateMachineGateTypeXOR) {
		t.Fatalf("expected gate type %q, got %q", StateMachineGateTypeXOR, got)
	}
}

func TestRuntimeStateMachineMutationsMergeConnectedMachineGroups(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": stateMachineMutationTestProjectWithGroups(t, "workflow-a", "workflow-b", "workflow-a"),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	// Connecting sections from two existing machine groups should merge them into the chosen group.
	if _, err := runtime.CreateStateMachineEdge(context.Background(), "project-alpha", StateMachineEdge{
		ID:              "edge-start-gate",
		MachineGroupID:  "workflow-a",
		SourceSectionID: "start-section",
		SourcePortID:    StateMachineEdgeSourcePortID,
		TargetSectionID: "gate-section",
		TargetPortID:    StateMachineEdgeTargetPortID,
	}, nil); err != nil {
		t.Fatalf("CreateStateMachineEdge returned error: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	gatePayload, err := effectiveSectionPayload(project, "gate-section", "gate-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload gate-section: %v", err)
	}
	if got := payloadRawStringField(gatePayload, "machineGroupId"); got != "workflow-a" {
		t.Fatalf("expected gate machineGroupId to merge into workflow-a, got %q", got)
	}

	edge := stateMachineTestEdgeByID(t, project.StateMachineEdges, "edge-start-gate")
	if edge.MachineGroupID != "workflow-a" {
		t.Fatalf("expected merged edge machineGroupId workflow-a, got %q", edge.MachineGroupID)
	}
}

func TestRuntimeStateMachineMutationsRejectInvalidTargetsAndSettings(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": stateMachineMutationTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	if _, err := runtime.SetStateMachineSectionSettings(context.Background(), "project-alpha", "plain-section", StateMachineSectionSettings{
		MachineGroupID: "workflow-a",
		Label:          "Plain",
	}); !errors.Is(err, ErrStateMachineSectionRequired) {
		t.Fatalf("expected ErrStateMachineSectionRequired, got %v", err)
	}

	if _, err := runtime.SetStateMachineSectionSettings(context.Background(), "project-alpha", "gate-section", StateMachineSectionSettings{
		MachineGroupID: "workflow-a",
		Label:          "Gate",
	}); !errors.Is(err, ErrStateMachineGateTypeInvalid) {
		t.Fatalf("expected ErrStateMachineGateTypeInvalid, got %v", err)
	}

	gateType := StateMachineGateTypeAND
	if _, err := runtime.SetStateMachineSectionSettings(context.Background(), "project-alpha", "start-section", StateMachineSectionSettings{
		MachineGroupID: "workflow-a",
		Label:          "Start",
		GateType:       &gateType,
	}); !errors.Is(err, ErrStateMachineGateTypeInvalid) {
		t.Fatalf("expected ErrStateMachineGateTypeInvalid for non-gate section gateType, got %v", err)
	}

	if _, err := runtime.CreateStateMachineEdge(context.Background(), "project-alpha", StateMachineEdge{
		ID:              "edge-start-chat",
		MachineGroupID:  "workflow-a",
		SourceSectionID: "start-section",
		SourcePortID:    StateMachineEdgeSourcePortID,
		TargetSectionID: "chat-section",
		TargetPortID:    StateMachineEdgeTargetPortID,
	}, nil); !errors.Is(err, ErrStateMachineEdgeInvalid) {
		t.Fatalf("expected ErrStateMachineEdgeInvalid for missing Chat target action, got %v", err)
	}

	promptSectionID := "plain-section"
	if _, err := runtime.CreateStateMachineEdge(context.Background(), "project-alpha", StateMachineEdge{
		ID:              "edge-gate-chat",
		MachineGroupID:  "workflow-a",
		SourceSectionID: "gate-section",
		SourcePortID:    StateMachineEdgeSourcePortID,
		TargetSectionID: "chat-section",
		TargetPortID:    StateMachineEdgeTargetPortID,
		TargetAction: &StateMachineTargetAction{
			Type:            StateMachineTargetActionTypeSendPrompt,
			PromptSectionID: &promptSectionID,
		},
	}, nil); !errors.Is(err, ErrPromptSectionRequired) {
		t.Fatalf("expected ErrPromptSectionRequired, got %v", err)
	}

	if _, err := runtime.SetStateMachineEdges(context.Background(), "project-alpha", []StateMachineEdge{
		{
			ID:              "duplicate-edge",
			MachineGroupID:  "workflow-a",
			SourceSectionID: "start-section",
			SourcePortID:    StateMachineEdgeSourcePortID,
			TargetSectionID: "gate-section",
			TargetPortID:    StateMachineEdgeTargetPortID,
		},
		{
			ID:              "duplicate-edge",
			MachineGroupID:  "workflow-a",
			SourceSectionID: "gate-section",
			SourcePortID:    StateMachineEdgeSourcePortID,
			TargetSectionID: "end-section",
			TargetPortID:    StateMachineEdgeTargetPortID,
		},
	}, nil); !errors.Is(err, ErrStateMachineEdgeDuplicateID) {
		t.Fatalf("expected ErrStateMachineEdgeDuplicateID, got %v", err)
	}
}

func TestRuntimeStateMachineMutationsRejectWorkflowEdgeValidationBranches(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name         string
		setupRuntime func(t *testing.T, runtime *Runtime)
		invoke       func(t *testing.T, runtime *Runtime) error
		wantIs       error
		wantContains string
	}{
		{
			name: "missing source section",
			invoke: func(t *testing.T, runtime *Runtime) error {
				t.Helper()
				_, err := runtime.CreateStateMachineEdge(context.Background(), "project-alpha", StateMachineEdge{
					ID:              "edge-missing-source",
					MachineGroupID:  "workflow-a",
					SourceSectionID: "missing-section",
					SourcePortID:    StateMachineEdgeSourcePortID,
					TargetSectionID: "end-section",
					TargetPortID:    StateMachineEdgeTargetPortID,
				}, nil)
				return err
			},
			wantIs: ErrSectionNotFound,
		},
		{
			name: "machine group mismatch",
			invoke: func(t *testing.T, runtime *Runtime) error {
				t.Helper()
				_, err := runtime.CreateStateMachineEdge(context.Background(), "project-alpha", StateMachineEdge{
					ID:              "edge-mismatched-group",
					MachineGroupID:  "workflow-b",
					SourceSectionID: "start-section",
					SourcePortID:    StateMachineEdgeSourcePortID,
					TargetSectionID: "end-section",
					TargetPortID:    StateMachineEdgeTargetPortID,
				}, nil)
				return err
			},
			wantIs:       ErrStateMachineEdgeInvalid,
			wantContains: "machine group does not match the source section",
		},
		{
			name: "chat target requires target action",
			invoke: func(t *testing.T, runtime *Runtime) error {
				t.Helper()
				_, err := runtime.CreateStateMachineEdge(context.Background(), "project-alpha", StateMachineEdge{
					ID:              "edge-missing-chat-action",
					MachineGroupID:  "workflow-a",
					SourceSectionID: "start-section",
					SourcePortID:    StateMachineEdgeSourcePortID,
					TargetSectionID: "chat-section",
					TargetPortID:    StateMachineEdgeTargetPortID,
				}, nil)
				return err
			},
			wantIs:       ErrStateMachineEdgeInvalid,
			wantContains: "requires a target action for Chat targets",
		},
		{
			name: "send prompt requires exactly one source",
			invoke: func(t *testing.T, runtime *Runtime) error {
				t.Helper()
				promptTemplateID := "prompt-template-1"
				inlinePrompt := "Both sources set"
				_, err := runtime.CreateStateMachineEdge(context.Background(), "project-alpha", StateMachineEdge{
					ID:              "edge-invalid-send-prompt",
					MachineGroupID:  "workflow-a",
					SourceSectionID: "start-section",
					SourcePortID:    StateMachineEdgeSourcePortID,
					TargetSectionID: "chat-section",
					TargetPortID:    StateMachineEdgeTargetPortID,
					TargetAction: &StateMachineTargetAction{
						Type:             StateMachineTargetActionTypeSendPrompt,
						PromptTemplateID: &promptTemplateID,
						InlinePrompt:     &inlinePrompt,
					},
				}, nil)
				return err
			},
			wantIs:       ErrStateMachineEdgeInvalid,
			wantContains: "exactly one of promptTemplateId, promptSectionId, or inlinePrompt",
		},
		{
			name: "reset thread rejects prompt content",
			invoke: func(t *testing.T, runtime *Runtime) error {
				t.Helper()
				inlinePrompt := "not allowed"
				_, err := runtime.CreateStateMachineEdge(context.Background(), "project-alpha", StateMachineEdge{
					ID:              "edge-invalid-reset-thread",
					MachineGroupID:  "workflow-a",
					SourceSectionID: "start-section",
					SourcePortID:    StateMachineEdgeSourcePortID,
					TargetSectionID: "chat-section",
					TargetPortID:    StateMachineEdgeTargetPortID,
					TargetAction: &StateMachineTargetAction{
						Type:         StateMachineTargetActionTypeResetThread,
						InlinePrompt: &inlinePrompt,
					},
				}, nil)
				return err
			},
			wantIs:       ErrStateMachineEdgeInvalid,
			wantContains: "cannot include prompt content or prompt inputs",
		},
		{
			name: "prompt section missing bindings fails render",
			invoke: func(t *testing.T, runtime *Runtime) error {
				t.Helper()
				promptSectionID := "prompt-section"
				_, err := runtime.CreateStateMachineEdge(context.Background(), "project-alpha", StateMachineEdge{
					ID:              "edge-missing-prompt-bindings",
					MachineGroupID:  "workflow-a",
					SourceSectionID: "start-section",
					SourcePortID:    StateMachineEdgeSourcePortID,
					TargetSectionID: "chat-section",
					TargetPortID:    StateMachineEdgeTargetPortID,
					TargetAction: &StateMachineTargetAction{
						Type:            StateMachineTargetActionTypeSendPrompt,
						PromptSectionID: &promptSectionID,
					},
				}, nil)
				return err
			},
			wantIs:       ErrStateMachineEdgeInvalid,
			wantContains: "Missing variables: name",
		},
		{
			name: "source filters require chat source",
			invoke: func(t *testing.T, runtime *Runtime) error {
				t.Helper()
				_, err := runtime.CreateStateMachineEdge(context.Background(), "project-alpha", StateMachineEdge{
					ID:              "edge-invalid-source-filter",
					MachineGroupID:  "workflow-a",
					SourceSectionID: "start-section",
					SourcePortID:    StateMachineEdgeSourcePortID,
					TargetSectionID: "end-section",
					TargetPortID:    StateMachineEdgeTargetPortID,
					SourceFilter: &StateMachineSourceFilter{
						Type: StateMachineSourceFilterTypeRunCompleted,
					},
				}, nil)
				return err
			},
			wantIs:       ErrStateMachineEdgeInvalid,
			wantContains: "only allows source filters on Chat sources",
		},
		{
			name: "signal filters require payload pair",
			invoke: func(t *testing.T, runtime *Runtime) error {
				t.Helper()
				signalName := "merge_decision"
				payloadField := "decision"
				_, err := runtime.CreateStateMachineEdge(context.Background(), "project-alpha", StateMachineEdge{
					ID:              "edge-invalid-signal-filter",
					MachineGroupID:  "workflow-a",
					SourceSectionID: "chat-section",
					SourcePortID:    StateMachineEdgeSourcePortID,
					TargetSectionID: "end-section",
					TargetPortID:    StateMachineEdgeTargetPortID,
					SourceFilter: &StateMachineSourceFilter{
						Type:         StateMachineSourceFilterTypeSignal,
						SignalName:   &signalName,
						PayloadField: &payloadField,
					},
				}, nil)
				return err
			},
			wantIs:       ErrStateMachineEdgeInvalid,
			wantContains: "require payloadField and equals together",
		},
		{
			name: "negative activation count rejected",
			setupRuntime: func(t *testing.T, runtime *Runtime) {
				t.Helper()
				if _, err := runtime.CreateStateMachineEdge(context.Background(), "project-alpha", StateMachineEdge{
					ID:              "edge-gate-end",
					MachineGroupID:  "workflow-a",
					SourceSectionID: "gate-section",
					SourcePortID:    StateMachineEdgeSourcePortID,
					TargetSectionID: "end-section",
					TargetPortID:    StateMachineEdgeTargetPortID,
				}, nil); err != nil {
					t.Fatalf("create gate->end edge: %v", err)
				}
			},
			invoke: func(t *testing.T, runtime *Runtime) error {
				t.Helper()
				_, err := runtime.UpdateStateMachineEdge(context.Background(), "project-alpha", StateMachineEdge{
					ID:              "edge-gate-end",
					MachineGroupID:  "workflow-a",
					SourceSectionID: "gate-section",
					SourcePortID:    StateMachineEdgeSourcePortID,
					TargetSectionID: "end-section",
					TargetPortID:    StateMachineEdgeTargetPortID,
					SourceActivationCountCondition: &StateMachineSourceActivationCountCondition{
						Operator: StateMachineCountOperatorEQ,
						Value:    -1,
					},
				}, nil)
				return err
			},
			wantIs:       ErrStateMachineEdgeInvalid,
			wantContains: "require a non-negative value",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			runtime := openStateMachineMutationRuntime(t, stateMachineMutationTestProject(t))
			if tc.setupRuntime != nil {
				tc.setupRuntime(t, runtime)
			}
			err := tc.invoke(t, runtime)
			if !errors.Is(err, tc.wantIs) {
				t.Fatalf("expected %v, got %v", tc.wantIs, err)
			}
			if tc.wantContains != "" && (err == nil || !strings.Contains(err.Error(), tc.wantContains)) {
				t.Fatalf("expected error containing %q, got %v", tc.wantContains, err)
			}
		})
	}
}

func TestRuntimeStateMachineMutationsAcceptLivePromptTemplateLookupAndSignalFilters(t *testing.T) {
	t.Parallel()

	project := stateMachineMutationTestProject(t)
	if err := project.SetPromptTemplateLink(
		"prompt-section",
		stringPointer("template-live"),
		"Hello {{ name }}",
		PromptFormatJinja,
	); err != nil {
		t.Fatalf("set prompt template link: %v", err)
	}
	runtime := openStateMachineMutationRuntime(t, project)

	promptSectionID := "prompt-section"
	lookup := stateMachineTestPromptTemplateLookup{
		"template-live": {
			ID:       "template-live",
			Name:     "Greeting",
			Template: "Hello there.",
			Format:   prompttemplates.FormatJinja,
		},
	}
	if _, err := runtime.CreateStateMachineEdge(context.Background(), "project-alpha", StateMachineEdge{
		ID:              "edge-gate-chat",
		MachineGroupID:  "workflow-a",
		SourceSectionID: "gate-section",
		SourcePortID:    StateMachineEdgeSourcePortID,
		TargetSectionID: "chat-section",
		TargetPortID:    StateMachineEdgeTargetPortID,
		TargetAction: &StateMachineTargetAction{
			Type:            StateMachineTargetActionTypeSendPrompt,
			PromptSectionID: &promptSectionID,
		},
	}, lookup); err != nil {
		t.Fatalf("create live-linked prompt edge: %v", err)
	}

	signalName := "merge_decision"
	payloadField := "decision"
	equals := "retry"
	if _, err := runtime.CreateStateMachineEdge(context.Background(), "project-alpha", StateMachineEdge{
		ID:              "edge-chat-end",
		MachineGroupID:  "workflow-a",
		SourceSectionID: "chat-section",
		SourcePortID:    StateMachineEdgeSourcePortID,
		TargetSectionID: "end-section",
		TargetPortID:    StateMachineEdgeTargetPortID,
		SourceFilter: &StateMachineSourceFilter{
			Type:         StateMachineSourceFilterTypeSignal,
			SignalName:   &signalName,
			PayloadField: &payloadField,
			Equals:       &equals,
		},
	}, lookup); err != nil {
		t.Fatalf("create chat->end signal edge: %v", err)
	}

	projectSnapshot := runtime.Snapshot().Document.Projects["project-alpha"]
	liveLinkedEdge := stateMachineTestEdgeByID(t, projectSnapshot.StateMachineEdges, "edge-gate-chat")
	if liveLinkedEdge.TargetAction == nil || liveLinkedEdge.TargetAction.PromptSectionID == nil || *liveLinkedEdge.TargetAction.PromptSectionID != "prompt-section" {
		t.Fatalf("expected live-linked prompt section action, got %#v", liveLinkedEdge.TargetAction)
	}
	filterEdge := stateMachineTestEdgeByID(t, projectSnapshot.StateMachineEdges, "edge-chat-end")
	if filterEdge.SourceFilter == nil {
		t.Fatal("expected chat->end source filter to persist")
	}
	if filterEdge.SourceFilter.Type != StateMachineSourceFilterTypeSignal {
		t.Fatalf("expected signal source filter, got %#v", filterEdge.SourceFilter)
	}
	if filterEdge.SourceFilter.SignalName == nil || *filterEdge.SourceFilter.SignalName != signalName {
		t.Fatalf("expected signalName %q, got %#v", signalName, filterEdge.SourceFilter.SignalName)
	}
	if filterEdge.SourceFilter.PayloadField == nil || *filterEdge.SourceFilter.PayloadField != payloadField {
		t.Fatalf("expected payloadField %q, got %#v", payloadField, filterEdge.SourceFilter.PayloadField)
	}
	if filterEdge.SourceFilter.Equals == nil || *filterEdge.SourceFilter.Equals != equals {
		t.Fatalf("expected equals %q, got %#v", equals, filterEdge.SourceFilter.Equals)
	}
}

func TestRuntimeStateMachineSectionSettingsAllowDraftStructureChangesButRejectConnectedEdgeGroupMismatches(t *testing.T) {
	t.Parallel()

	runtime := openStateMachineMutationRuntime(t, stateMachineMutationTestProject(t))

	if _, err := runtime.CreateStateMachineEdge(context.Background(), "project-alpha", StateMachineEdge{
		ID:              "edge-start-end",
		MachineGroupID:  "workflow-a",
		SourceSectionID: "start-section",
		SourcePortID:    StateMachineEdgeSourcePortID,
		TargetSectionID: "end-section",
		TargetPortID:    StateMachineEdgeTargetPortID,
	}, nil); err != nil {
		t.Fatalf("create start->end edge: %v", err)
	}

	if _, err := runtime.SetStateMachineSectionSettings(context.Background(), "project-alpha", "start-section", StateMachineSectionSettings{
		MachineGroupID: "other-machine",
		Label:          "Start",
	}); !errors.Is(err, ErrStateMachineEdgeInvalid) || err == nil || !strings.Contains(err.Error(), "does not match the source section") {
		t.Fatalf("expected connected-graph machine-group mismatch, got %v", err)
	}

	_, result, err := runtime.CreateTopLevelSection(context.Background(), "project-alpha", CreateTopLevelSectionInput{
		ImplType: "StateMachineStart",
		Position: &Position{X: 720, Y: 0},
	}, DefaultStructuralMutationSettings())
	if err != nil {
		t.Fatalf("create extra start section: %v", err)
	}
	if result.SectionID == "" {
		t.Fatal("expected created extra start section id")
	}

	if _, err := runtime.SetStateMachineSectionSettings(context.Background(), "project-alpha", result.SectionID, StateMachineSectionSettings{
		MachineGroupID: "workflow-a",
		Label:          "Extra Start",
	}); err != nil {
		t.Fatalf("set extra start settings: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	extraStartPayload, err := effectiveSectionPayload(project, result.SectionID, project.SectionVariantMap[result.SectionID])
	if err != nil {
		t.Fatalf("effectiveSectionPayload extra start: %v", err)
	}
	if got := payloadRawStringField(extraStartPayload, "machineGroupId"); got != "workflow-a" {
		t.Fatalf("expected extra start machineGroupId workflow-a, got %q", got)
	}
	if got := payloadRawStringField(extraStartPayload, "label"); got != "Extra Start" {
		t.Fatalf("expected extra start label Extra Start, got %q", got)
	}

	gateType := StateMachineGateTypeAND
	if _, err := runtime.SetStateMachineSectionSettings(context.Background(), "project-alpha", "gate-section", StateMachineSectionSettings{
		MachineGroupID: "workflow-a",
		Label:          "Gate Label",
		GateType:       &gateType,
	}); err != nil {
		t.Fatalf("set gate label update: %v", err)
	}

	project = runtime.Snapshot().Document.Projects["project-alpha"]
	gatePayload, err := effectiveSectionPayload(project, "gate-section", "gate-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload gate-section: %v", err)
	}
	if got := payloadRawStringField(gatePayload, "machineGroupId"); got != "workflow-a" {
		t.Fatalf("expected gate machineGroupId workflow-a, got %q", got)
	}
	if got := payloadRawStringField(gatePayload, "label"); got != "Gate Label" {
		t.Fatalf("expected gate label Gate Label, got %q", got)
	}
	if got := payloadRawStringField(gatePayload, "gateType"); got != string(StateMachineGateTypeAND) {
		t.Fatalf("expected gate type %q, got %q", StateMachineGateTypeAND, got)
	}
}

func TestProjectStateMachineEdgesJSONRoundTrip(t *testing.T) {
	t.Parallel()

	project := stateMachineMutationTestProject(t)
	project.StateMachineEdges = []StateMachineEdge{{
		ID:              "edge-start-end",
		MachineGroupID:  "workflow-a",
		SourceSectionID: "start-section",
		SourcePortID:    StateMachineEdgeSourcePortID,
		TargetSectionID: "end-section",
		TargetPortID:    StateMachineEdgeTargetPortID,
	}}

	encoded, err := json.Marshal(project)
	if err != nil {
		t.Fatalf("marshal project with state machine edges: %v", err)
	}

	var restored Project
	if err := json.Unmarshal(encoded, &restored); err != nil {
		t.Fatalf("unmarshal project with state machine edges: %v", err)
	}

	restored, err = restored.Normalized()
	if err != nil {
		t.Fatalf("normalize restored project: %v", err)
	}

	if !reflect.DeepEqual(restored.StateMachineEdges, project.StateMachineEdges) {
		t.Fatalf("expected restored state machine edges %#v, got %#v", project.StateMachineEdges, restored.StateMachineEdges)
	}
}

func stateMachineMutationTestProject(t *testing.T) Project {
	t.Helper()
	return stateMachineMutationTestProjectWithGroups(t, "workflow-a", "workflow-a", "workflow-a")
}

func stateMachineMutationTestProjectWithGroups(
	t *testing.T,
	startGroupID string,
	gateGroupID string,
	endGroupID string,
) Project {
	t.Helper()

	project, err := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"start-section":  "start-variant",
			"gate-section":   "gate-variant",
			"end-section":    "end-variant",
			"chat-section":   "chat-variant",
			"prompt-section": "prompt-variant",
			"plain-section":  "plain-variant",
		},
		Sections: map[string]Section{
			"start-section": {
				ID:               "start-section",
				Name:             "Start Section",
				VariantIDs:       []string{"start-variant"},
				DefaultVariantID: "start-variant",
			},
			"gate-section": {
				ID:               "gate-section",
				Name:             "Gate Section",
				VariantIDs:       []string{"gate-variant"},
				DefaultVariantID: "gate-variant",
			},
			"end-section": {
				ID:               "end-section",
				Name:             "End Section",
				VariantIDs:       []string{"end-variant"},
				DefaultVariantID: "end-variant",
			},
			"chat-section": {
				ID:               "chat-section",
				Name:             "Chat Section",
				VariantIDs:       []string{"chat-variant"},
				DefaultVariantID: "chat-variant",
			},
			"prompt-section": {
				ID:               "prompt-section",
				Name:             "Prompt Section",
				VariantIDs:       []string{"prompt-variant"},
				DefaultVariantID: "prompt-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain Section",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"start-variant": {
				ID:     "start-variant",
				ImplID: "start-impl",
			},
			"gate-variant": {
				ID:     "gate-variant",
				ImplID: "gate-impl",
			},
			"end-variant": {
				ID:     "end-variant",
				ImplID: "end-impl",
			},
			"chat-variant": {
				ID:     "chat-variant",
				ImplID: "chat-impl",
			},
			"prompt-variant": {
				ID:     "prompt-variant",
				ImplID: "prompt-impl",
			},
			"plain-variant": {
				ID:     "plain-variant",
				ImplID: "plain-impl",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"start-impl": {
				ID:   "start-impl",
				Kind: SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":             "start-impl",
					"type":           "StateMachineStart",
					"machineGroupId": startGroupID,
					"label":          "Start",
					"maxIterations":  nil,
				}),
			},
			"gate-impl": {
				ID:   "gate-impl",
				Kind: SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":             "gate-impl",
					"type":           "StateMachineGate",
					"machineGroupId": gateGroupID,
					"label":          "Gate",
					"gateType":       string(StateMachineGateTypeAND),
					"ui": map[string]any{
						"showDetails": false,
					},
				}),
			},
			"end-impl": {
				ID:   "end-impl",
				Kind: SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":             "end-impl",
					"type":           "StateMachineEnd",
					"machineGroupId": endGroupID,
					"label":          "End",
				}),
			},
			"chat-impl": {
				ID:   "chat-impl",
				Kind: SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":   "chat-impl",
					"type": "Chat",
				}),
			},
			"prompt-impl": {
				ID:   "prompt-impl",
				Kind: SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":               "prompt-impl",
					"type":             "Prompt",
					"template":         "Hello {{ name }}",
					"inputs":           map[string]string{},
					"format":           string(PromptFormatJinja),
					"renderedText":     "",
					"missingVariables": []string{},
					"renderError":      nil,
				}),
			},
			"plain-impl": {
				ID:   "plain-impl",
				Kind: SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":   "plain-impl",
					"type": "TextBlock",
				}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize state machine mutation project: %v", err)
	}
	return project
}

func openStateMachineMutationRuntime(t *testing.T, project Project) *Runtime {
	t.Helper()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": project,
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})
	return runtime
}

type stateMachineTestPromptTemplateLookup map[string]prompttemplates.Template

func (l stateMachineTestPromptTemplateLookup) Get(templateID string) (prompttemplates.Template, error) {
	template, ok := l[templateID]
	if !ok {
		return prompttemplates.Template{}, prompttemplates.ErrTemplateNotFound
	}
	return template, nil
}

func stateMachineTestEdgeByID(t *testing.T, edges []StateMachineEdge, edgeID string) StateMachineEdge {
	t.Helper()

	for _, edge := range edges {
		if edge.ID == edgeID {
			return edge
		}
	}
	t.Fatalf("state machine edge %q not found in %#v", edgeID, edges)
	return StateMachineEdge{}
}

func stateMachineBoolPointer(value bool) *bool {
	return &value
}
