package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/projectstate"
)

func TestRegisterProjectRoutesStateMachineMutationsPersistAndTrackFrontendOps(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": stateMachineRouteTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)

	// Exercise the same mutation sequence the frontend authoring flow uses.
	stateMachineRouteRequest(t, handler, RouteCreateStateMachineEdge, CreateStateMachineEdgeRequest{
		FrontendOpID:    stringPointer("workflow-create-op"),
		ProjectID:       "project-alpha",
		ID:              stringPointer("edge-start-gate"),
		MachineGroupID:  "workflow-a",
		SourceSectionID: "start-section",
		SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
		TargetSectionID: "gate-section",
		TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
	}, http.StatusOK, "")

	promptSectionID := "prompt-section"
	stateMachineRouteRequest(t, handler, RouteCreateStateMachineEdge, CreateStateMachineEdgeRequest{
		FrontendOpID:    stringPointer("workflow-create-chat-op"),
		ProjectID:       "project-alpha",
		ID:              stringPointer("edge-gate-chat"),
		MachineGroupID:  "workflow-a",
		SourceSectionID: "gate-section",
		SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
		TargetSectionID: "chat-section",
		TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
		TargetAction: &projectstate.StateMachineTargetAction{
			Type:            projectstate.StateMachineTargetActionTypeSendPrompt,
			PromptSectionID: &promptSectionID,
			PromptInputs:    map[string]string{"name": "Ada"},
		},
	}, http.StatusOK, "")

	stateMachineRouteRequest(t, handler, RouteUpdateStateMachineEdge, UpdateStateMachineEdgeRequest{
		FrontendOpID: stringPointer("workflow-update-op"),
		ProjectID:    "project-alpha",
		Edge: projectstate.StateMachineEdge{
			ID:              "edge-gate-chat",
			MachineGroupID:  "workflow-a",
			SourceSectionID: "gate-section",
			SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
			TargetSectionID: "chat-section",
			TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
			Hidden:          true,
			Selected:        true,
			ZIndex:          9,
			TargetAction: &projectstate.StateMachineTargetAction{
				Type:            projectstate.StateMachineTargetActionTypeSendPrompt,
				PromptSectionID: &promptSectionID,
				PromptInputs:    map[string]string{"name": "Ada"},
				SearchEnabled:   boolPointer(true),
			},
		},
	}, http.StatusOK, "")

	stateMachineRouteRequest(t, handler, RouteDeleteStateMachineEdges, DeleteStateMachineEdgesRequest{
		FrontendOpID: stringPointer("workflow-delete-op"),
		ProjectID:    "project-alpha",
		EdgeIDs:      []string{"edge-start-gate"},
	}, http.StatusOK, "")

	stateMachineRouteRequest(t, handler, RouteSetStateMachineEdges, SetStateMachineEdgesRequest{
		FrontendOpID: stringPointer("workflow-set-op"),
		ProjectID:    "project-alpha",
		Edges: []projectstate.StateMachineEdge{
			{
				ID:              "edge-gate-chat",
				MachineGroupID:  "workflow-a",
				SourceSectionID: "gate-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				Hidden:          true,
				Selected:        true,
				ZIndex:          9,
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:            projectstate.StateMachineTargetActionTypeSendPrompt,
					PromptSectionID: &promptSectionID,
					PromptInputs:    map[string]string{"name": "Ada"},
					SearchEnabled:   boolPointer(true),
				},
			},
			{
				ID:              "edge-chat-end",
				MachineGroupID:  "workflow-a",
				SourceSectionID: "chat-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "end-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type: projectstate.StateMachineSourceFilterTypeRunCompleted,
				},
			},
		},
	}, http.StatusOK, "")

	currentGateModifier := func() map[string]any {
		t.Helper()

		return decodeProjectRouteRawObject(t, projectRuntime.Snapshot().Document.Projects["project-alpha"].Sections["gate-section"].SharedModifier)
	}
	for _, gateCase := range []struct {
		gateType     projectstate.StateMachineGateType
		frontendOpID *string
	}{
		{gateType: projectstate.StateMachineGateTypeAND},
		{gateType: projectstate.StateMachineGateTypeOR},
		{gateType: projectstate.StateMachineGateTypeXOR, frontendOpID: stringPointer("workflow-section-op")},
	} {
		stateMachineRouteRequest(t, handler, RouteSetStateMachineSectionSettings, SetStateMachineSectionSettingsRequest{
			FrontendOpID:   gateCase.frontendOpID,
			ProjectID:      "project-alpha",
			SectionID:      "gate-section",
			MachineGroupID: "workflow-a",
			Label:          "Decision",
			GateType:       &gateCase.gateType,
		}, http.StatusOK, "")
		if got := currentGateModifier()["gateType"]; got != string(gateCase.gateType) {
			t.Fatalf("expected gate type %s, got %#v", gateCase.gateType, got)
		}
	}

	latestStateMachinePayload := func() ProjectStateSingleConfigWithCompletedOpIDs {
		t.Helper()

		latestResponse := stateMachineRouteRequest(t, handler, RouteGetLatestProjectState, GetLatestProjectStateRequest{
			ProjectID: "project-alpha",
		}, http.StatusOK, "")

		var payload ProjectStateSingleConfigWithCompletedOpIDs
		if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
			t.Fatalf("decode latest project payload: %v", err)
		}
		return payload
	}

	payload := latestStateMachinePayload()
	if !reflect.DeepEqual(payload.CompletedOpIDs, []string{
		"workflow-create-op",
		"workflow-create-chat-op",
		"workflow-update-op",
		"workflow-delete-op",
		"workflow-set-op",
		"workflow-section-op",
	}) {
		t.Fatalf("unexpected completed op ids %#v", payload.CompletedOpIDs)
	}

	if len(payload.ProjectState.ProjectConfig.StateMachineEdges) != 2 {
		t.Fatalf("expected 2 state machine edges in latest state, got %d", len(payload.ProjectState.ProjectConfig.StateMachineEdges))
	}
	gateToChat := stateMachineRouteEdgeByID(t, payload.ProjectState.ProjectConfig.StateMachineEdges, "edge-gate-chat")
	if !gateToChat.Hidden || !gateToChat.Selected || gateToChat.ZIndex != 9 {
		t.Fatalf("expected gate->chat edge visual state to persist, got %#v", gateToChat)
	}
	if gateToChat.TargetAction == nil || gateToChat.TargetAction.SearchEnabled == nil || !*gateToChat.TargetAction.SearchEnabled {
		t.Fatalf("expected gate->chat searchEnabled=true, got %#v", gateToChat.TargetAction)
	}

	chatToEnd := stateMachineRouteEdgeByID(t, payload.ProjectState.ProjectConfig.StateMachineEdges, "edge-chat-end")
	if chatToEnd.SourceFilter == nil || chatToEnd.SourceFilter.Type != projectstate.StateMachineSourceFilterTypeRunCompleted {
		t.Fatalf("expected chat->end run_completed filter, got %#v", chatToEnd.SourceFilter)
	}

	gatePayload := decodeProjectRouteRawObject(t, payload.ProjectState.Sections["gate-section"].SharedModifier)
	if got := gatePayload["label"]; got != "Decision" {
		t.Fatalf("expected gate label Decision, got %#v", got)
	}
	if got := gatePayload["gateType"]; got != string(projectstate.StateMachineGateTypeXOR) {
		t.Fatalf("expected gate type XOR, got %#v", got)
	}

	// Latest-state fetches should drain the completed op queue after the caller observes it.
	payload = latestStateMachinePayload()
	if len(payload.CompletedOpIDs) != 0 {
		t.Fatalf("expected completed op ids to clear, got %#v", payload.CompletedOpIDs)
	}
}

func TestRegisterProjectRoutesStateMachineMutationsRejectInvalidPayloads(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": stateMachineRouteTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)

	plainSectionResponse := stateMachineRouteRequest(t, handler, RouteSetStateMachineSectionSettings, SetStateMachineSectionSettingsRequest{
		ProjectID:      "project-alpha",
		SectionID:      "plain-section",
		MachineGroupID: "workflow-a",
		Label:          "Plain",
	}, http.StatusUnprocessableEntity, "")
	stateMachineRouteErrorCode(t, plainSectionResponse, "state_machine_section_required")

	gateTypeResponse := stateMachineRouteRequest(t, handler, RouteSetStateMachineSectionSettings, SetStateMachineSectionSettingsRequest{
		ProjectID:      "project-alpha",
		SectionID:      "gate-section",
		MachineGroupID: "workflow-a",
		Label:          "Gate",
	}, http.StatusUnprocessableEntity, "")
	stateMachineRouteErrorCode(t, gateTypeResponse, "state_machine_gate_type_invalid")

	nonGateTypeResponse := stateMachineRouteRequest(t, handler, RouteSetStateMachineSectionSettings, SetStateMachineSectionSettingsRequest{
		ProjectID:      "project-alpha",
		SectionID:      "start-section",
		MachineGroupID: "workflow-a",
		Label:          "Start",
		GateType:       stateMachineRouteGateTypePointer(projectstate.StateMachineGateTypeAND),
	}, http.StatusUnprocessableEntity, "")
	stateMachineRouteErrorCode(t, nonGateTypeResponse, "state_machine_gate_type_invalid")

	stateMachineRouteRequest(t, handler, RouteCreateStateMachineEdge, CreateStateMachineEdgeRequest{
		ProjectID:       "project-alpha",
		ID:              stringPointer("edge-start-gate"),
		MachineGroupID:  "workflow-a",
		SourceSectionID: "start-section",
		SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
		TargetSectionID: "gate-section",
		TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
	}, http.StatusOK, "")

	groupMismatchResponse := stateMachineRouteRequest(t, handler, RouteSetStateMachineSectionSettings, SetStateMachineSectionSettingsRequest{
		ProjectID:      "project-alpha",
		SectionID:      "gate-section",
		MachineGroupID: "workflow-b",
		Label:          "Gate",
		GateType:       stateMachineRouteGateTypePointer(projectstate.StateMachineGateTypeAND),
	}, http.StatusUnprocessableEntity, "")
	stateMachineRouteErrorCode(t, groupMismatchResponse, "state_machine_section_settings_invalid")

	promptSectionID := "plain-section"
	promptResponse := stateMachineRouteRequest(t, handler, RouteCreateStateMachineEdge, CreateStateMachineEdgeRequest{
		ProjectID:       "project-alpha",
		ID:              stringPointer("edge-gate-chat"),
		MachineGroupID:  "workflow-a",
		SourceSectionID: "gate-section",
		SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
		TargetSectionID: "chat-section",
		TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
		TargetAction: &projectstate.StateMachineTargetAction{
			Type:            projectstate.StateMachineTargetActionTypeSendPrompt,
			PromptSectionID: &promptSectionID,
		},
	}, http.StatusUnprocessableEntity, "")
	stateMachineRouteErrorCode(t, promptResponse, "prompt_section_required")

	duplicateResponse := stateMachineRouteRequest(t, handler, RouteCreateStateMachineEdge, CreateStateMachineEdgeRequest{
		ProjectID:       "project-alpha",
		ID:              stringPointer("edge-start-gate"),
		MachineGroupID:  "workflow-a",
		SourceSectionID: "start-section",
		SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
		TargetSectionID: "gate-section",
		TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
	}, http.StatusConflict, "")
	stateMachineRouteErrorCode(t, duplicateResponse, "state_machine_edge_id_conflict")

	missingDeleteResponse := stateMachineRouteRequest(t, handler, RouteDeleteStateMachineEdges, DeleteStateMachineEdgesRequest{
		ProjectID: "project-alpha",
		EdgeIDs:   []string{"missing-edge"},
	}, http.StatusNotFound, "")
	stateMachineRouteErrorCode(t, missingDeleteResponse, "state_machine_edge_not_found")
}

func TestRegisterProjectRoutesStateMachineCreateEdgeRejectsMissingPromptTemplateReference(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": stateMachineRouteTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)

	missingTemplateID := "missing-template"
	response := stateMachineRouteRequest(t, handler, RouteCreateStateMachineEdge, CreateStateMachineEdgeRequest{
		ProjectID:       "project-alpha",
		ID:              stringPointer("edge-gate-chat"),
		MachineGroupID:  "workflow-a",
		SourceSectionID: "gate-section",
		SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
		TargetSectionID: "chat-section",
		TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
		TargetAction: &projectstate.StateMachineTargetAction{
			Type:             projectstate.StateMachineTargetActionTypeSendPrompt,
			PromptTemplateID: &missingTemplateID,
		},
	}, http.StatusUnprocessableEntity, "")
	stateMachineRouteErrorCode(t, response, "state_machine_edge_invalid")
	if !strings.Contains(response.Body.String(), "Prompt template missing-template not found") {
		t.Fatalf("expected missing prompt template message, got %q", response.Body.String())
	}

	projectSnapshot := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if len(projectSnapshot.StateMachineEdges) != 0 {
		t.Fatalf("expected missing prompt template edge creation to leave state machine edges empty, got %#v", projectSnapshot.StateMachineEdges)
	}
}

func TestRegisterProjectRoutesStateMachineCreateEdgeMergesMachineGroups(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": stateMachineRouteTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)

	stateMachineRouteRequest(t, handler, RouteSetStateMachineSectionSettings, SetStateMachineSectionSettingsRequest{
		ProjectID:      "project-alpha",
		SectionID:      "gate-section",
		MachineGroupID: "workflow-b",
		Label:          "Gate",
		GateType:       stateMachineRouteGateTypePointer(projectstate.StateMachineGateTypeAND),
	}, http.StatusOK, "")

	stateMachineRouteRequest(t, handler, RouteCreateStateMachineEdge, CreateStateMachineEdgeRequest{
		ProjectID:       "project-alpha",
		ID:              stringPointer("edge-start-gate"),
		MachineGroupID:  "workflow-a",
		SourceSectionID: "start-section",
		SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
		TargetSectionID: "gate-section",
		TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
	}, http.StatusOK, "")

	latestResponse := stateMachineRouteRequest(t, handler, RouteGetLatestProjectState, GetLatestProjectStateRequest{
		ProjectID: "project-alpha",
	}, http.StatusOK, "")

	var payload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode latest project payload: %v", err)
	}

	gatePayload := decodeProjectRouteRawObject(t, payload.ProjectState.Sections["gate-section"].SharedModifier)
	if got := gatePayload["machineGroupId"]; got != "workflow-a" {
		t.Fatalf("expected gate machineGroupId workflow-a after merge, got %#v", got)
	}

	mergedEdge := stateMachineRouteEdgeByID(t, payload.ProjectState.ProjectConfig.StateMachineEdges, "edge-start-gate")
	if mergedEdge.MachineGroupID != "workflow-a" {
		t.Fatalf("expected merged edge machineGroupId workflow-a, got %#v", mergedEdge)
	}
}

func stateMachineRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
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
		Sections: map[string]projectstate.Section{
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
		SectionVariants: map[string]projectstate.SectionVariant{
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
		SectionImpls: map[string]projectstate.SectionImpl{
			"start-impl": {
				ID:   "start-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustMarshalProjectRouteObject(t, map[string]any{
					"id":             "start-impl",
					"type":           "StateMachineStart",
					"machineGroupId": "workflow-a",
					"label":          "Start",
					"maxIterations":  nil,
				}),
			},
			"gate-impl": {
				ID:   "gate-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustMarshalProjectRouteObject(t, map[string]any{
					"id":             "gate-impl",
					"type":           "StateMachineGate",
					"machineGroupId": "workflow-a",
					"label":          "Gate",
					"gateType":       string(projectstate.StateMachineGateTypeAND),
					"ui": map[string]any{
						"showDetails": false,
					},
				}),
			},
			"end-impl": {
				ID:   "end-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustMarshalProjectRouteObject(t, map[string]any{
					"id":             "end-impl",
					"type":           "StateMachineEnd",
					"machineGroupId": "workflow-a",
					"label":          "End",
				}),
			},
			"chat-impl": {
				ID:   "chat-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustMarshalProjectRouteObject(t, map[string]any{
					"id":   "chat-impl",
					"type": "Chat",
				}),
			},
			"prompt-impl": {
				ID:   "prompt-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustMarshalProjectRouteObject(t, map[string]any{
					"id":               "prompt-impl",
					"type":             "Prompt",
					"template":         "Hello {{ name }}",
					"inputs":           map[string]string{},
					"format":           string(projectstate.PromptFormatJinja),
					"renderedText":     "",
					"missingVariables": []string{},
					"renderError":      nil,
				}),
			},
			"plain-impl": {
				ID:   "plain-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustMarshalProjectRouteObject(t, map[string]any{
					"id":   "plain-impl",
					"type": "TextBlock",
				}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize state machine route project: %v", err)
	}
	return project
}

func stateMachineRouteRequest(
	t *testing.T,
	handler http.Handler,
	route string,
	payload any,
	expectedStatus int,
	expectedBody string,
) *httptest.ResponseRecorder {
	t.Helper()

	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal route payload for %s: %v", route, err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api"+route, bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != expectedStatus {
		t.Fatalf("expected %d for %s, got %d with body %q", expectedStatus, route, response.Code, response.Body.String())
	}
	if expectedBody != "" && response.Body.String() != expectedBody {
		t.Fatalf("expected body %q for %s, got %q", expectedBody, route, response.Body.String())
	}
	return response
}

func stateMachineRouteErrorCode(t *testing.T, response *httptest.ResponseRecorder, expectedCode string) {
	t.Helper()

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if payload.Error.Code != expectedCode {
		t.Fatalf("expected error code %q, got %#v", expectedCode, payload)
	}
}

func stateMachineRouteEdgeByID(
	t *testing.T,
	edges []projectstate.StateMachineEdge,
	edgeID string,
) projectstate.StateMachineEdge {
	t.Helper()

	for _, edge := range edges {
		if edge.ID == edgeID {
			return edge
		}
	}
	t.Fatalf("state machine edge %q not found in %#v", edgeID, edges)
	return projectstate.StateMachineEdge{}
}

func stateMachineRouteGateTypePointer(
	value projectstate.StateMachineGateType,
) *projectstate.StateMachineGateType {
	return &value
}
