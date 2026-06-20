package httpapi

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/appstate"
	"setta/internal/chat"
	"setta/internal/semanticgraph"
	"setta/internal/workspace"
	"setta/internal/workspacesession"
)

func TestSemanticGraphReadEndpoints(t *testing.T) {
	handler, semanticService := newSemanticGraphHandler(t)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	workspaceID := opened.Workspace.ID

	seedHTTPSemanticReadFixture(t, semanticService, workspaceID)
	assertSemanticGraphReadEndpoint(t, handler, workspaceID)
	assertSemanticNodeDetailEndpoint(t, handler, workspaceID)
	assertSemanticEvidenceEndpoint(t, handler, workspaceID)
	assertSemanticActivityEndpoints(t, handler, workspaceID)
	assertSemanticSteeringEndpoint(t, handler, workspaceID)
	assertSemanticHistoryEndpoint(t, handler, workspaceID)
	assertSemanticContextPackEndpoints(t, handler, workspaceID)
	assertSemanticLayoutUpdateEndpointDoesNotAppendEvent(t, handler, workspaceID)
}

func TestSemanticGraphChangeEventStreamPushesCommittedChanges(t *testing.T) {
	handler, _ := newSemanticGraphHandler(t)
	server := httptest.NewServer(handler)
	defer server.Close()
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)

	response, err := http.Get(server.URL + "/semantic-graph/events/changes")
	if err != nil {
		t.Fatalf("open semantic graph change stream: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("semantic graph change stream status = %d, want 200", response.StatusCode)
	}
	if response.Header.Get("Content-Type") != "text/event-stream" {
		t.Fatalf("semantic graph change stream content type = %q, want text/event-stream", response.Header.Get("Content-Type"))
	}

	postJSON[semanticgraph.SemanticMutationResult](t, handler, "/semantic-graph/nodes/create", CreateSemanticNodeRequest{
		WorkspaceID: opened.Workspace.ID,
		NodeID:      "node_streamed",
		Kind:        semanticgraph.NodeKindFinding,
		Label:       "Streamed semantic change",
		ActorKind:   semanticgraph.ActorKindUser,
		ActorID:     "user_http",
	}, http.StatusOK)

	event := readServerSentSemanticGraphChangeEvent(t, bufio.NewReader(response.Body))
	if event.WorkspaceID != opened.Workspace.ID ||
		event.Sequence == 0 ||
		event.StreamID == "" ||
		event.EventID == "" ||
		event.Type != semanticgraph.SemanticGraphChangeEventType ||
		!semanticGraphHTTPAreasContain(event.ChangedAreas, semanticgraph.SemanticGraphChangeAreaGraph) ||
		!semanticGraphHTTPStringsContain(event.SemanticNodeIDs, "node_streamed") {
		t.Fatalf("semantic graph change event = %+v, want streamed node graph invalidation", event)
	}
}

func TestSemanticGraphChangeEventStreamRejectsInvalidCursor(t *testing.T) {
	handler, _ := newSemanticGraphHandler(t)
	request := httptest.NewRequest(http.MethodGet, "/semantic-graph/events/changes?lastEventId=bad", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("invalid semantic graph change cursor status = %d, want 400", response.Code)
	}
}

func TestCartographerReadAndReviewEndpoints(t *testing.T) {
	handler, semanticService := newSemanticGraphHandlerWithOptions(t,
		semanticgraph.WithCartographerHarnessTaskRunner(chat.HarnessTaskRunnerFor(chat.NewFakeHarness(nil)), chat.HarnessCodex),
	)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	workspaceID := opened.Workspace.ID
	seedHTTPSemanticReadFixture(t, semanticService, workspaceID)
	seedHTTPCartographerProcessEvidence(t, semanticService, workspaceID)

	built := buildHTTPCartographerWindow(t, handler, workspaceID)
	assertHTTPSemanticWorkingSetEndpoint(t, handler, workspaceID)
	assertHTTPCartographerProcessEndpoint(t, handler, workspaceID, built.Window.ID)
	assertHTTPCartographerProcessingStateEndpoint(t, handler)
	saveHTTPCartographerCursor(t, semanticService, workspaceID, built.Window.ID)
	pending := applyPendingHTTPCartographerPatch(t, semanticService, workspaceID, "cartographer_run_http_accept", "cartographer_patch_http_accept", "node_http_accept")
	assertHTTPCartographerReadEndpoints(t, handler, workspaceID, built, pending)
	assertHTTPCartographerAcceptEndpoint(t, handler, workspaceID)
	applyPendingHTTPCartographerPatch(t, semanticService, workspaceID, "cartographer_run_http_reject", "cartographer_patch_http_reject", "node_http_reject")
	assertHTTPCartographerRejectEndpoint(t, handler, workspaceID)
}

func TestSemanticCartographerSettingsEndpoints(t *testing.T) {
	handler, semanticService := newSemanticGraphHandler(t)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	workspaceID := opened.Workspace.ID
	seedHTTPSemanticReadFixture(t, semanticService, workspaceID)

	initial := assertHTTPSemanticCartographerDefaultSettings(t, handler)
	assertHTTPSemanticCartographerSettingsMetadata(t, handler, initial)
	assertHTTPModelOptionsInclude(t, handler, workspaceID, "scripted-careful", chat.ReasoningEffortHigh)
	providerDefaultUpdate := updateHTTPSemanticCartographerSettings(t, handler, workspaceID, initial, func(input *semanticgraph.SemanticCartographerSettingsInput) {
		input.LiveTaskConfig.ModelSelection = semanticgraph.SemanticCartographerModelSelectionProviderDefault
		input.LiveTaskConfig.ModelID = ""
		input.LiveTaskConfig.ReasoningEffort = chat.ReasoningEffortLow
	})
	assertHTTPProviderDefaultCartographerSettingsAccepted(t, providerDefaultUpdate)
	firstUpdate := updateHTTPSemanticCartographerSettings(t, handler, workspaceID, providerDefaultUpdate, func(input *semanticgraph.SemanticCartographerSettingsInput) {
		input.AutomaticProcessingEnabled = false
		input.LiveTaskConfig.ModelSelection = semanticgraph.SemanticCartographerModelSelectionExplicit
		input.LiveTaskConfig.ModelID = "scripted-careful"
		input.LiveTaskConfig.ReasoningEffort = chat.ReasoningEffortHigh
		input.ProcessingConfig.MaxConcurrent = 3
		input.ProcessingConfig.PerSourceConcurrent = 1
		input.ProcessingConfig.MaxQueuedPerSource = 5
		input.ProcessingConfig.LeaseDurationSeconds = 60
	})

	built := buildHTTPCartographerWindow(t, handler, workspaceID)
	assertHTTPCartographerRunSnapshot(t, handler, workspaceID, built.Run.ID, firstUpdate.SettingsHash, "scripted-careful", chat.ReasoningEffortHigh)
	secondUpdate := updateHTTPSemanticCartographerSettings(t, handler, workspaceID, firstUpdate, func(input *semanticgraph.SemanticCartographerSettingsInput) {
		input.LiveTaskConfig.ModelID = "scripted-fast"
		input.LiveTaskConfig.ReasoningEffort = chat.ReasoningEffortLow
	})
	assertHTTPCartographerRunSnapshot(t, handler, workspaceID, built.Run.ID, firstUpdate.SettingsHash, "scripted-careful", chat.ReasoningEffortHigh)
	assertHTTPInvalidCartographerSettingsRejected(t, handler, workspaceID, secondUpdate)

	seedHTTPFailedCartographerRun(t, semanticService, workspaceID, secondUpdate)
	assertHTTPCartographerProcessingStateSummary(t, handler, secondUpdate)
}

func assertHTTPSemanticCartographerDefaultSettings(t *testing.T, handler http.Handler) semanticgraph.SemanticCartographerSettingsRecord {
	t.Helper()
	initial := postJSON[semanticgraph.SemanticCartographerSettingsRecord](t, handler, "/semantic-graph/cartographer/settings/read", ReadSemanticCartographerSettingsRequest{}, http.StatusOK)
	if initial.SettingsHash == "" || initial.Settings.LiveTaskConfig.ReasoningEffort != chat.ReasoningEffortLow {
		t.Fatalf("initial cartographer settings = %+v, want default low live reasoning and hash", initial)
	}
	return initial
}

func assertHTTPSemanticCartographerSettingsMetadata(t *testing.T, handler http.Handler, expected semanticgraph.SemanticCartographerSettingsRecord) {
	t.Helper()
	metadata := postJSON[semanticgraph.SemanticCartographerSettingsMetadata](t, handler, "/semantic-graph/cartographer/settings/metadata", ReadSemanticCartographerSettingsMetadataRequest{}, http.StatusOK)
	if metadata.Record.SettingsHash != expected.SettingsHash ||
		metadata.DefaultSettings.LiveTaskConfig.ReasoningEffort != chat.ReasoningEffortLow ||
		metadata.DefaultSettings.FinalSynthesisTaskConfig.ReasoningEffort != chat.ReasoningEffortMedium ||
		!httpCartographerBoundsContain(metadata.NumberBounds, "processingConfig.maxConcurrent", 1) ||
		!httpCartographerRelationshipsContain(metadata.Relationships, "processingConfig.perSourceConcurrent", "lte", "processingConfig.maxConcurrent") ||
		!httpCartographerRelationshipsContain(metadata.Relationships, "observationConfig.assistantThresholdBytes", "lte", "observationConfig.maxWindowContentBytes") {
		t.Fatalf("cartographer settings metadata = %+v, want current record, defaults, bounds, and relationships", metadata)
	}
}

func assertHTTPModelOptionsInclude(t *testing.T, handler http.Handler, workspaceID string, model string, effort chat.ReasoningEffort) {
	t.Helper()
	models := postJSON[[]chat.ChatModelOption](t, handler, "/semantic-graph/cartographer/model-options/list", ListSemanticCartographerModelOptionsRequest{
		WorkspaceID: workspaceID,
	}, http.StatusOK)
	if !httpCartographerModelsContain(models, model, effort) {
		t.Fatalf("cartographer model options = %+v, want %s with %s reasoning", models, model, effort)
	}
}

func assertHTTPProviderDefaultCartographerSettingsAccepted(t *testing.T, updated semanticgraph.SemanticCartographerSettingsRecord) {
	t.Helper()
	if updated.Settings.LiveTaskConfig.ModelSelection != semanticgraph.SemanticCartographerModelSelectionProviderDefault ||
		updated.Settings.LiveTaskConfig.ModelID != "" {
		t.Fatalf("provider default cartographer settings = %+v, want no persisted fake model id", updated.Settings.LiveTaskConfig)
	}
}

func updateHTTPSemanticCartographerSettings(
	t *testing.T,
	handler http.Handler,
	workspaceID string,
	current semanticgraph.SemanticCartographerSettingsRecord,
	mutate func(*semanticgraph.SemanticCartographerSettingsInput),
) semanticgraph.SemanticCartographerSettingsRecord {
	t.Helper()
	input := semanticgraph.SemanticCartographerSettingsInputFromSettings(current.Settings)
	mutate(&input)
	updated := postJSON[semanticgraph.SemanticCartographerSettingsRecord](t, handler, "/semantic-graph/cartographer/settings/update", UpdateSemanticCartographerSettingsRequest{
		WorkspaceID: workspaceID,
		Settings:    input,
	}, http.StatusOK)
	if updated.SettingsHash == current.SettingsHash || updated.Settings.UpdatedAt == "" {
		t.Fatalf("updated cartographer settings = %+v, want new hash and update timestamp", updated)
	}
	return updated
}

func assertHTTPCartographerRunSnapshot(
	t *testing.T,
	handler http.Handler,
	workspaceID string,
	runID string,
	settingsHash string,
	model string,
	reasoningEffort chat.ReasoningEffort,
) {
	t.Helper()
	readQueued := postJSON[semanticgraph.CartographerRunReadResponse](t, handler, "/semantic-graph/cartographer/runs/read", ReadCartographerRunRequest{
		WorkspaceID: workspaceID,
		RunID:       runID,
	}, http.StatusOK)
	if readQueued.Run == nil ||
		readQueued.Run.SettingsHash != settingsHash ||
		readQueued.Run.RequestedModel != model ||
		readQueued.Run.RequestedReasoningEffort != reasoningEffort {
		t.Fatalf("queued cartographer run = %+v, want settings snapshot", readQueued.Run)
	}
}

func assertHTTPInvalidCartographerSettingsRejected(t *testing.T, handler http.Handler, workspaceID string, current semanticgraph.SemanticCartographerSettingsRecord) {
	t.Helper()
	missingModelInput := semanticgraph.SemanticCartographerSettingsInputFromSettings(current.Settings)
	missingModelInput.LiveTaskConfig.ModelSelection = semanticgraph.SemanticCartographerModelSelectionExplicit
	missingModelInput.LiveTaskConfig.ModelID = "scripted-missing"
	missingModelInput.LiveTaskConfig.ReasoningEffort = chat.ReasoningEffortLow
	assertHTTPInvalidCartographerSettingsUpdate(t, handler, workspaceID, missingModelInput, `explicit model "scripted-missing" is absent`)

	invalidInput := semanticgraph.SemanticCartographerSettingsInputFromSettings(current.Settings)
	invalidInput.LiveTaskConfig.ReasoningEffort = chat.ReasoningEffortMinimal
	assertHTTPInvalidCartographerSettingsUpdate(t, handler, workspaceID, invalidInput, "reasoningEffort minimal is unsupported")
}

func assertHTTPInvalidCartographerSettingsUpdate(t *testing.T, handler http.Handler, workspaceID string, input semanticgraph.SemanticCartographerSettingsInput, wantMessage string) {
	t.Helper()
	errResponse := postJSON[ErrorResponse](t, handler, "/semantic-graph/cartographer/settings/update", UpdateSemanticCartographerSettingsRequest{
		WorkspaceID: workspaceID,
		Settings:    input,
	}, http.StatusBadRequest)
	if errResponse.Error.Code != "update_semantic_cartographer_settings_failed" ||
		!strings.Contains(errResponse.Error.Message, wantMessage) {
		t.Fatalf("invalid settings response = %+v, want message containing %q", errResponse, wantMessage)
	}
}

func assertHTTPCartographerProcessingStateSummary(t *testing.T, handler http.Handler, settings semanticgraph.SemanticCartographerSettingsRecord) {
	t.Helper()
	state := postJSON[semanticgraph.CartographerProcessingState](t, handler, "/semantic-graph/cartographer/processing/state", ReadCartographerProcessingStateRequest{}, http.StatusOK)
	if state.SettingsHash != settings.SettingsHash ||
		state.Enabled ||
		state.EffectiveProcessingConfig.MaxConcurrent != 3 ||
		state.LastFailureRunSummary == nil ||
		state.LastFailureRunSummary.RunID != "cartographer_run_failed_http" ||
		state.LastFailureRunSummary.RequestedModel != "scripted-fast" ||
		state.LastFailureRunSummary.InputBundleBytes <= 0 ||
		state.LastFailureRunSummary.HarnessDurationMS != 17 {
		t.Fatalf("cartographer processing state = %+v, want settings hash/config and failed run audit summary", state)
	}
}

func httpCartographerModelsContain(models []chat.ChatModelOption, model string, effort chat.ReasoningEffort) bool {
	for _, option := range models {
		if option.Model != model {
			continue
		}
		for _, supported := range option.SupportedReasoningEfforts {
			if supported.Effort == effort {
				return true
			}
		}
	}
	return false
}

func httpCartographerBoundsContain(bounds []semanticgraph.SemanticCartographerNumberFieldBounds, field string, min int) bool {
	for _, bound := range bounds {
		if bound.Field == field && bound.Min == min {
			return true
		}
	}
	return false
}

func httpCartographerRelationshipsContain(relationships []semanticgraph.SemanticCartographerSettingsRelation, field string, operator string, comparedField string) bool {
	for _, relationship := range relationships {
		if relationship.Field == field &&
			relationship.Operator == operator &&
			relationship.ComparedField == comparedField {
			return true
		}
	}
	return false
}

func seedHTTPFailedCartographerRun(t *testing.T, semanticService *semanticgraph.Service, workspaceID string, settings semanticgraph.SemanticCartographerSettingsRecord) {
	t.Helper()
	sourceRefs := semanticgraph.SemanticContextSourceRefs{WorkflowExecutionID: "execution_scope"}
	input := semanticgraph.CartographerInputBundle{
		WorkspaceID:    workspaceID,
		TriggerKind:    semanticgraph.CartographerTriggerManual,
		SourceRefs:     sourceRefs,
		TargetEntityID: "node_scope",
		WindowID:       "cartographer_window_failed_http",
		NewEvents: []semanticgraph.CartographerTrajectoryEvent{{
			Source:      semanticgraph.CartographerTrajectorySourceWorkflow,
			EventID:     "workflow_events:cartographer_failed_http",
			Type:        "workflow.node.completed",
			OccurredAt:  "2026-06-10T20:02:00Z",
			SourceRefs:  sourceRefs,
			Summary:     "Workflow node completed before cartographer failure.",
			Boundary:    true,
			CloseReason: semanticgraph.CartographerCloseManual,
		}},
		ObservedEventRefs: []string{"workflow_events:cartographer_failed_http"},
		TokenBudget:       120,
	}
	run := semanticgraph.CartographerRun{
		ID:                       "cartographer_run_failed_http",
		WorkspaceID:              workspaceID,
		Status:                   semanticgraph.CartographerRunFailed,
		TriggerKind:              semanticgraph.CartographerTriggerManual,
		TargetEntityID:           "node_scope",
		SourceRefs:               sourceRefs,
		InputBundle:              input,
		HarnessKind:              "scripted",
		SettingsHash:             settings.SettingsHash,
		TaskProfile:              semanticgraph.CartographerTaskProfileManual,
		RequestedModelSelection:  settings.Settings.LiveTaskConfig.ModelSelection,
		RequestedModel:           settings.Settings.LiveTaskConfig.ModelID,
		EffectiveModel:           settings.Settings.LiveTaskConfig.ModelID,
		ReportedModel:            "scripted-fast-reported",
		RequestedReasoningEffort: settings.Settings.LiveTaskConfig.ReasoningEffort,
		EffectiveReasoningEffort: string(settings.Settings.LiveTaskConfig.ReasoningEffort),
		RequestID:                "request_cartographer_failed_http",
		ResponseID:               "response_cartographer_failed_http",
		WindowID:                 "cartographer_window_failed_http",
		SourceEpochID:            "cartographer_window_failed_http",
		SourceKey:                workspaceID + ":manual:cartographer_failed_http",
		Priority:                 100,
		AttemptCount:             1,
		CloseReason:              semanticgraph.CartographerCloseManual,
		HarnessDurationMS:        17,
		CreatedAt:                "2026-06-10T20:01:00Z",
		StartedAt:                "2026-06-10T20:02:00Z",
		CompletedAt:              "2026-06-10T20:03:00Z",
		UpdatedAt:                "2026-06-10T20:03:00Z",
		Error:                    "input bundle exceeded Codex turn limit",
	}
	if _, err := semanticService.SaveCartographerRun(context.Background(), run); err != nil {
		t.Fatalf("save failed cartographer run: %v", err)
	}
}

func buildHTTPCartographerWindow(t *testing.T, handler http.Handler, workspaceID string) semanticgraph.CartographerWindowBuildResult {
	t.Helper()
	built := postJSON[semanticgraph.CartographerWindowBuildResult](t, handler, "/semantic-graph/cartographer/windows/build", BuildCartographerWindowRequest{
		WorkspaceID:    workspaceID,
		TriggerKind:    semanticgraph.CartographerTriggerManual,
		TargetEntityID: "node_scope",
		SourceRefs: semanticgraph.SemanticContextSourceRefs{
			WorkflowExecutionID: "execution_scope",
			WorkflowNodeID:      "workflow_node_scope",
		},
		Summary: "Manual deterministic cartographer window for HTTP review coverage.",
	}, http.StatusOK)
	if built.Run.ID == "" || built.Window.RunID != built.Run.ID || built.Summary == nil {
		t.Fatalf("built cartographer window = %+v, want run, window, and summary", built)
	}
	return built
}

func assertHTTPCartographerProcessingStateEndpoint(t *testing.T, handler http.Handler) {
	t.Helper()
	state := postJSON[semanticgraph.CartographerProcessingState](t, handler, "/semantic-graph/cartographer/processing/state", ReadCartographerProcessingStateRequest{}, http.StatusOK)
	if !state.Enabled || state.CreatedSemanticEventIDs == nil || state.QueuedWindows == nil || state.RunningWindows == nil {
		t.Fatalf("cartographer processing state = %+v, want enabled state with non-nil slices", state)
	}
}

func seedHTTPCartographerProcessEvidence(t *testing.T, semanticService *semanticgraph.Service, workspaceID string) {
	t.Helper()
	appendHTTPSemanticEvent(t, semanticService, workspaceID, semanticgraph.EventEvidenceAttached, "node_scope", map[string]any{
		"anchorId":            "evidence_cartographer_http",
		"targetEntityId":      "node_scope",
		"sourceKind":          string(semanticgraph.EvidenceSourceWorkflowNode),
		"sourceId":            "workflow_node_scope",
		"workflowExecutionId": "execution_scope",
		"workflowNodeId":      "workflow_node_scope",
		"summary":             "Workflow node evidence for cartographer processing.",
	})
}

func assertHTTPCartographerProcessEndpoint(t *testing.T, handler http.Handler, workspaceID string, windowID string) {
	t.Helper()
	processed := postJSON[semanticgraph.CartographerWindowProcessResult](t, handler, "/semantic-graph/cartographer/windows/process", ProcessCartographerWindowRequest{
		WorkspaceID: workspaceID,
		WindowID:    windowID,
	}, http.StatusOK)
	if processed.Window.Status != semanticgraph.CartographerWindowProcessed ||
		processed.Run.Status != semanticgraph.CartographerRunApplied ||
		!httpCartographerProcessHasPatch(processed.Patches, semanticgraph.CartographerPatchRecordFinding) ||
		!httpCartographerProcessHasPatch(processed.Patches, semanticgraph.CartographerPatchCreateEdge) ||
		len(processed.Events) == 0 {
		t.Fatalf("processed cartographer window = %+v, want applied scripted audit", processed)
	}
}

func httpCartographerProcessHasPatch(patches []semanticgraph.CartographerPatchRecord, operation semanticgraph.CartographerPatchOperation) bool {
	for _, patch := range patches {
		if patch.Patch.Operation == operation && patch.Status == semanticgraph.CartographerPatchApplied {
			return true
		}
	}
	return false
}

func saveHTTPCartographerCursor(t *testing.T, semanticService *semanticgraph.Service, workspaceID string, windowID string) {
	t.Helper()
	if _, err := semanticService.SaveCartographerCursor(context.Background(), semanticgraph.CartographerCursor{
		ID:                  "cartographer_cursor_http",
		WorkspaceID:         workspaceID,
		WorkflowExecutionID: "execution_scope",
		LastWindowID:        windowID,
		UpdatedAt:           "2026-06-10T12:20:00Z",
	}); err != nil {
		t.Fatalf("save cartographer cursor fixture: %v", err)
	}
}

func assertHTTPCartographerReadEndpoints(t *testing.T, handler http.Handler, workspaceID string, built semanticgraph.CartographerWindowBuildResult, pending semanticgraph.CartographerPatchEnvelopeApplicationResult) {
	t.Helper()
	readRun := postJSON[semanticgraph.CartographerRunReadResponse](t, handler, "/semantic-graph/cartographer/runs/read", ReadCartographerRunRequest{
		WorkspaceID: workspaceID,
		RunID:       pending.Run.ID,
	}, http.StatusOK)
	if readRun.Run == nil || readRun.Run.ID != pending.Run.ID || readRun.Run.InputBundleHash == "" {
		t.Fatalf("read cartographer run = %+v, want pending run audit", readRun.Run)
	}
	runs := postJSON[semanticgraph.CartographerRunList](t, handler, "/semantic-graph/cartographer/runs/list", ListCartographerRunsRequest{
		WorkspaceID:         workspaceID,
		WorkflowExecutionID: "execution_scope",
		Limit:               10,
	}, http.StatusOK)
	if len(runs.Runs) < 2 {
		t.Fatalf("cartographer runs = %+v, want built and pending runs", runs.Runs)
	}
	windows := postJSON[semanticgraph.CartographerWindowList](t, handler, "/semantic-graph/cartographer/windows/list", ListCartographerWindowsRequest{
		WorkspaceID:         workspaceID,
		WorkflowExecutionID: "execution_scope",
		Limit:               10,
	}, http.StatusOK)
	if len(windows.Windows) != 1 || windows.Windows[0].ID != built.Window.ID {
		t.Fatalf("cartographer windows = %+v, want built window", windows.Windows)
	}
	cursors := postJSON[semanticgraph.CartographerCursorList](t, handler, "/semantic-graph/cartographer/cursors/list", ListCartographerCursorsRequest{
		WorkspaceID:         workspaceID,
		WorkflowExecutionID: "execution_scope",
		Limit:               10,
	}, http.StatusOK)
	if len(cursors.Cursors) != 1 || cursors.Cursors[0].LastWindowID != built.Window.ID {
		t.Fatalf("cartographer cursors = %+v, want persisted cursor", cursors.Cursors)
	}
	patches := postJSON[semanticgraph.CartographerPatchList](t, handler, "/semantic-graph/cartographer/patches/list", ListCartographerPatchesRequest{
		WorkspaceID:      workspaceID,
		SemanticTargetID: "node_http_accept",
		Status:           semanticgraph.CartographerPatchPendingReview,
		Limit:            10,
	}, http.StatusOK)
	if len(patches.Patches) != 1 || patches.Patches[0].ID != "cartographer_patch_http_accept" {
		t.Fatalf("cartographer patches = %+v, want pending target patch", patches.Patches)
	}
}

func assertHTTPCartographerAcceptEndpoint(t *testing.T, handler http.Handler, workspaceID string) {
	t.Helper()
	accepted := postJSON[semanticgraph.CartographerPatchReviewResult](t, handler, "/semantic-graph/cartographer/patches/accept", ReviewCartographerPatchRequest{
		WorkspaceID: workspaceID,
		PatchID:     "cartographer_patch_http_accept",
	}, http.StatusOK)
	if accepted.Patch.Status != semanticgraph.CartographerPatchApplied || accepted.NodeDetail == nil || accepted.NodeDetail.Node.ID != "node_http_accept" {
		t.Fatalf("accepted cartographer patch = %+v, want applied node detail", accepted)
	}
	acceptedDetail := postJSON[ReadSemanticNodeDetailResponse](t, handler, "/semantic-graph/nodes/detail", ReadSemanticNodeDetailRequest{
		WorkspaceID: workspaceID,
		NodeID:      "node_http_accept",
	}, http.StatusOK)
	if acceptedDetail.Detail == nil || len(acceptedDetail.Detail.CartographerPatches) != 1 || acceptedDetail.Detail.CartographerPatches[0].Status != semanticgraph.CartographerPatchApplied {
		t.Fatalf("accepted node detail = %+v, want cartographer patch history", acceptedDetail.Detail)
	}
}

func assertHTTPCartographerRejectEndpoint(t *testing.T, handler http.Handler, workspaceID string) {
	t.Helper()
	rejected := postJSON[semanticgraph.CartographerPatchReviewResult](t, handler, "/semantic-graph/cartographer/patches/reject", ReviewCartographerPatchRequest{
		WorkspaceID: workspaceID,
		PatchID:     "cartographer_patch_http_reject",
	}, http.StatusOK)
	if rejected.Patch.Status != semanticgraph.CartographerPatchRejected || rejected.Patch.ApplicationResult.Applied {
		t.Fatalf("rejected cartographer patch = %+v, want rejected without application", rejected.Patch)
	}
}

func seedHTTPSemanticReadFixture(t *testing.T, semanticService *semanticgraph.Service, workspaceID string) {
	t.Helper()
	appendHTTPSemanticEvent(t, semanticService, workspaceID, semanticgraph.EventNodeCreated, "node_scope", map[string]any{
		"nodeId":  "node_scope",
		"kind":    string(semanticgraph.NodeKindConstraint),
		"label":   "Phase 1 backend only",
		"summary": "Renderer work is out of scope",
	})
	appendHTTPSemanticEvent(t, semanticService, workspaceID, semanticgraph.EventEvidenceAttached, "node_scope", map[string]any{
		"anchorId":       "evidence_scope",
		"targetEntityId": "node_scope",
		"sourceKind":     string(semanticgraph.EvidenceSourceDocument),
		"path":           "docs/plans/workspace_trajectory_liveness_and_semantic_memory_plan.md",
		"rangeStart":     64,
		"rangeEnd":       72,
		"summary":        "Scope guard",
	})
	appendHTTPSemanticEvent(t, semanticService, workspaceID, semanticgraph.EventActivityStarted, "node_scope", map[string]any{
		"intervalId":       "activity_scope",
		"targetEntityId":   "node_scope",
		"kind":             string(semanticgraph.ActivityKindValidating),
		"summary":          "Validating endpoint reads",
		"sourceKind":       string(semanticgraph.ActivitySourceFileRange),
		"evidenceAnchorId": "evidence_scope",
		"actorKind":        string(semanticgraph.ActorKindService),
		"actorId":          "semantic_http_test",
	})
	appendHTTPSemanticEvent(t, semanticService, workspaceID, semanticgraph.EventActivityEnded, "node_scope", map[string]any{
		"intervalId": "activity_scope",
	})
	appendHTTPSemanticEvent(t, semanticService, workspaceID, semanticgraph.EventSteeringCreated, "node_scope", map[string]any{
		"directiveId":    "steering_scope",
		"targetEntityId": "node_scope",
		"kind":           string(semanticgraph.SteeringKindFocus),
		"instruction":    "Keep endpoint surface read-only",
		"status":         string(semanticgraph.SteeringStatusActive),
		"scope":          string(semanticgraph.SteeringScopeWorkspace),
	})
	appendHTTPSemanticEvent(t, semanticService, workspaceID, semanticgraph.EventContextPackCreated, "node_scope", map[string]any{
		"packId":               "pack_scope",
		"triggerKind":          string(semanticgraph.ContextTriggerWorkflowAgentStart),
		"targetEntityId":       "node_scope",
		"sourceRefs":           map[string]any{"workflowExecutionId": "execution_scope"},
		"authoredPromptHash":   "sha256:authored",
		"deliveredContextHash": "sha256:delivered",
		"tokenBudget":          200,
		"estimatedTokens":      12,
		"itemCount":            1,
		"items": []map[string]any{{
			"itemId":          "pack_scope_item_001",
			"kind":            string(semanticgraph.ContextPackItemConstraint),
			"semanticNodeId":  "node_scope",
			"title":           "Phase 1 backend only",
			"reasonIncluded":  "active workspace constraint",
			"priority":        string(semanticgraph.ContextPriorityRequired),
			"estimatedTokens": 6,
			"createdAt":       "2026-06-10T12:00:06Z",
			"updatedAt":       "2026-06-10T12:00:06Z",
		}},
		"deliveredContext": "Setta semantic context pack pack_scope\n- [required] Constraint: Phase 1 backend only",
	})
}

func applyPendingHTTPCartographerPatch(t *testing.T, semanticService *semanticgraph.Service, workspaceID string, runID string, patchID string, nodeID string) semanticgraph.CartographerPatchEnvelopeApplicationResult {
	t.Helper()
	confidence := 0.2
	sourceRefs := semanticgraph.SemanticContextSourceRefs{WorkflowExecutionID: "execution_scope"}
	patch := semanticgraph.CartographerPatch{
		ID:            patchID,
		Operation:     semanticgraph.CartographerPatchRecordFinding,
		WorkspaceID:   workspaceID,
		SourceRefs:    sourceRefs,
		CausationID:   "request_cartographer_http",
		CorrelationID: "response_cartographer_http",
		Confidence:    &confidence,
		PublicSummary: "Record HTTP cartographer finding.",
		EvidenceRefs: []semanticgraph.CartographerPatchEvidenceRef{{
			EvidenceAnchorID: "evidence_scope",
		}},
		ModelInfo:      map[string]string{"model": "fake-cartographer-http"},
		ReviewRequired: false,
		Payload: semanticgraph.CartographerPatchPayload{
			NewNode: &semanticgraph.CartographerPatchNewNode{
				SemanticNodeID: nodeID,
				Kind:           semanticgraph.NodeKindFinding,
				Label:          "HTTP cartographer finding " + nodeID,
				Summary:        "Pending review cartographer node from HTTP fixture.",
				Scope:          semanticgraph.CartographerPatchNodeScopeSession,
			},
		},
	}
	raw, err := json.Marshal(semanticgraph.CartographerPatchEnvelope{Patches: []semanticgraph.CartographerPatch{patch}})
	if err != nil {
		t.Fatalf("marshal cartographer patch fixture: %v", err)
	}
	result, err := semanticService.ApplyCartographerPatchEnvelope(context.Background(), semanticgraph.CartographerPatchEnvelopeApplicationInput{
		WorkspaceID:    workspaceID,
		RunID:          runID,
		WindowID:       "cartographer_window_" + patchID,
		TriggerKind:    semanticgraph.CartographerTriggerManual,
		TargetEntityID: "node_scope",
		SourceRefs:     sourceRefs,
		InputBundle: semanticgraph.CartographerInputBundle{
			WorkspaceID:    workspaceID,
			TriggerKind:    semanticgraph.CartographerTriggerManual,
			SourceRefs:     sourceRefs,
			TargetEntityID: "node_scope",
			NewEvents: []semanticgraph.CartographerTrajectoryEvent{{
				Source:     semanticgraph.CartographerTrajectorySourceWorkflow,
				EventID:    "workflow_events:" + patchID,
				Type:       "workflow.node.completed",
				OccurredAt: "2026-06-10T12:15:00Z",
				SourceRefs: sourceRefs,
				Summary:    "Workflow node completed for cartographer HTTP fixture.",
				Boundary:   true,
			}},
			ObservedEventRefs: []string{"workflow_events:" + patchID},
		},
		HarnessKind:        "scripted",
		EffectiveModel:     "fake-cartographer-http-request",
		ReportedModel:      "fake-cartographer-http",
		RequestID:          "request_cartographer_http",
		ResponseID:         "response_cartographer_http",
		RawHarnessResponse: raw,
		TrajectorySummary:  "HTTP cartographer patch summary.",
	})
	if err != nil {
		t.Fatalf("apply cartographer patch fixture: %v", err)
	}
	if len(result.Patches) != 1 || result.Patches[0].Status != semanticgraph.CartographerPatchPendingReview {
		t.Fatalf("cartographer patch fixture = %+v, want pending review patch", result)
	}
	return result
}

func assertSemanticGraphReadEndpoint(t *testing.T, handler http.Handler, workspaceID string) {
	t.Helper()
	graph := postJSON[semanticgraph.SemanticGraph](t, handler, "/semantic-graph/read", ReadSemanticGraphRequest{
		WorkspaceID: workspaceID,
	}, http.StatusOK)
	if len(graph.Nodes) != 1 || graph.Nodes[0].ID != "node_scope" {
		t.Fatalf("graph nodes = %+v, want node_scope", graph.Nodes)
	}
}

func assertSemanticNodeDetailEndpoint(t *testing.T, handler http.Handler, workspaceID string) {
	t.Helper()
	detail := postJSON[ReadSemanticNodeDetailResponse](t, handler, "/semantic-graph/nodes/detail", ReadSemanticNodeDetailRequest{
		WorkspaceID: workspaceID,
		NodeID:      "node_scope",
	}, http.StatusOK)
	if detail.Detail == nil || len(detail.Detail.Evidence) != 1 || len(detail.Detail.Activity) != 1 || len(detail.Detail.ContextPackHistory) != 1 {
		t.Fatalf("node detail = %+v, want evidence and activity", detail.Detail)
	}
}

func assertSemanticEvidenceEndpoint(t *testing.T, handler http.Handler, workspaceID string) {
	t.Helper()
	evidence := postJSON[semanticgraph.SemanticEvidenceList](t, handler, "/semantic-graph/evidence/list", ListSemanticEvidenceRequest{
		WorkspaceID:    workspaceID,
		TargetEntityID: "node_scope",
	}, http.StatusOK)
	if len(evidence.Evidence) != 1 || evidence.Evidence[0].ID != "evidence_scope" {
		t.Fatalf("evidence = %+v, want evidence_scope", evidence.Evidence)
	}
}

func assertSemanticActivityEndpoints(t *testing.T, handler http.Handler, workspaceID string) {
	t.Helper()
	activity := postJSON[semanticgraph.SemanticActivityList](t, handler, "/semantic-graph/activity/list", ListSemanticActivityRequest{
		WorkspaceID:    workspaceID,
		TargetEntityID: "node_scope",
		Limit:          10,
	}, http.StatusOK)
	if len(activity.Activity) != 1 || activity.Activity[0].EndedAt == "" {
		t.Fatalf("activity = %+v, want ended activity_scope", activity.Activity)
	}
	activityPage := postJSON[semanticgraph.SemanticActivityPage](t, handler, "/semantic-graph/activity/page", ListSemanticActivityPageRequest{
		WorkspaceID: workspaceID,
		SourceKind:  semanticActivitySourceKindPtr(semanticgraph.ActivitySourceFileRange),
		Offset:      0,
		Limit:       10,
	}, http.StatusOK)
	if len(activityPage.Activity) != 1 || activityPage.Activity[0].ID != "activity_scope" {
		t.Fatalf("activity page = %+v, want activity_scope", activityPage.Activity)
	}
	activitySummary := postJSON[semanticgraph.SemanticActivitySummary](t, handler, "/semantic-graph/activity/summary", ReadSemanticActivitySummaryRequest{
		WorkspaceID: workspaceID,
		RecentLimit: 3,
	}, http.StatusOK)
	if len(activitySummary.Targets) != 1 || len(activitySummary.Targets[0].RecentActivity) != 1 {
		t.Fatalf("activity summary = %+v, want one recent activity", activitySummary)
	}
}

func assertHTTPSemanticWorkingSetEndpoint(t *testing.T, handler http.Handler, workspaceID string) {
	t.Helper()
	workingSet := postJSON[semanticgraph.SemanticWorkingSet](t, handler, "/semantic-graph/working-set/read", ReadSemanticWorkingSetRequest{
		WorkspaceID: workspaceID,
		Limit:       20,
	}, http.StatusOK)
	if workingSet.WorkspaceID != workspaceID ||
		len(workingSet.ActiveCartographerRuns) == 0 ||
		len(workingSet.LiveSourceRefs) == 0 ||
		!httpSemanticWorkingSetPulsesContain(workingSet.Pulses, semanticgraph.WorkingSetPulseActiveWorkflowSource) ||
		!httpSemanticWorkingSetPulsesContain(workingSet.Pulses, semanticgraph.WorkingSetPulseEvidenceAttached) ||
		!httpSemanticWorkingSetPulsesContain(workingSet.Pulses, semanticgraph.WorkingSetPulseNodeUpdatedRecent) {
		t.Fatalf("working set = %+v, want active cartographer audit state", workingSet)
	}
}

func httpSemanticWorkingSetPulsesContain(pulses []semanticgraph.SemanticWorkingSetPulse, kind semanticgraph.SemanticWorkingSetPulseKind) bool {
	for _, pulse := range pulses {
		if pulse.Kind == kind {
			return true
		}
	}
	return false
}

func assertSemanticSteeringEndpoint(t *testing.T, handler http.Handler, workspaceID string) {
	t.Helper()
	steering := postJSON[semanticgraph.SemanticSteeringState](t, handler, "/semantic-graph/steering/read", ReadSemanticSteeringStateRequest{
		WorkspaceID:    workspaceID,
		TargetEntityID: "node_scope",
	}, http.StatusOK)
	if len(steering.SteeringDirectives) != 1 || steering.SteeringDirectives[0].ID != "steering_scope" {
		t.Fatalf("steering = %+v, want steering_scope", steering.SteeringDirectives)
	}
}

func assertSemanticHistoryEndpoint(t *testing.T, handler http.Handler, workspaceID string) {
	t.Helper()
	history := postJSON[semanticgraph.SemanticEventHistory](t, handler, "/semantic-graph/events/history", ReadSemanticEventHistoryRequest{
		WorkspaceID:        workspaceID,
		TargetEntityID:     "node_scope",
		BeforeLogicalClock: 0,
		Limit:              20,
	}, http.StatusOK)
	if len(history.Events) != 6 || history.Events[0].EventType != semanticgraph.EventNodeCreated {
		t.Fatalf("history = %+v, want six target events in chronological order", history.Events)
	}
}

func assertSemanticContextPackEndpoints(t *testing.T, handler http.Handler, workspaceID string) {
	t.Helper()
	pack := postJSON[semanticgraph.SemanticContextPackReadResponse](t, handler, "/semantic-graph/context-packs/read", ReadSemanticContextPackRequest{
		WorkspaceID: workspaceID,
		PackID:      "pack_scope",
	}, http.StatusOK)
	if pack.Pack == nil || pack.Pack.ID != "pack_scope" || len(pack.Pack.Items) != 1 {
		t.Fatalf("context pack read = %+v, want pack_scope with item", pack.Pack)
	}
	packsByTarget := postJSON[semanticgraph.SemanticContextPackList](t, handler, "/semantic-graph/context-packs/list", ListSemanticContextPacksRequest{
		WorkspaceID:    workspaceID,
		TargetEntityID: "node_scope",
		Offset:         0,
		Limit:          10,
	}, http.StatusOK)
	if len(packsByTarget.Packs) != 1 || packsByTarget.Packs[0].ID != "pack_scope" {
		t.Fatalf("context packs by target = %+v, want pack_scope", packsByTarget.Packs)
	}
	packsByWorkflow := postJSON[semanticgraph.SemanticContextPackList](t, handler, "/semantic-graph/context-packs/list", ListSemanticContextPacksRequest{
		WorkspaceID:         workspaceID,
		WorkflowExecutionID: "execution_scope",
		Offset:              0,
		Limit:               10,
	}, http.StatusOK)
	if len(packsByWorkflow.Packs) != 1 || packsByWorkflow.Packs[0].ID != "pack_scope" {
		t.Fatalf("context packs by workflow = %+v, want pack_scope", packsByWorkflow.Packs)
	}
}

func TestSemanticGraphAttachmentEndpoints(t *testing.T) {
	handler, semanticService := newSemanticGraphHandlerWithOptions(t, semanticgraph.WithChatSourceResolver(httpSemanticChatResolver{
		run: chat.Run{
			ID:               "run_http_attach",
			WorkspaceID:      "workspace_set_later",
			ConversationID:   "conversation_http_attach",
			TriggerMessageID: "message_http_user",
			Harness:          chat.HarnessCodex,
			Status:           chat.RunStatusRunning,
			StartedAt:        "2026-06-10T20:10:00Z",
			PromptSummary:    "Attach a real chat run to semantic state",
		},
	}))
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	workspaceID := opened.Workspace.ID
	appendHTTPSemanticEvent(t, semanticService, workspaceID, semanticgraph.EventNodeCreated, "node_attach", map[string]any{
		"nodeId": "node_attach",
		"kind":   string(semanticgraph.NodeKindFinding),
		"label":  "Attach chat run",
	})

	attachment := postJSON[semanticgraph.SemanticAttachmentResult](t, handler, "/semantic-graph/attachments/chat-run", AttachSemanticNodeToChatRunRequest{
		WorkspaceID:  workspaceID,
		NodeID:       "node_attach",
		ChatRunID:    "run_http_attach",
		ActivityKind: semanticgraph.ActivityKindExploring,
		ActorKind:    semanticgraph.ActorKindUser,
		ActorID:      "user_http",
	}, http.StatusOK)
	if attachment.Evidence.SourceKind != semanticgraph.EvidenceSourceChatRun || attachment.Activity.SourceKind != semanticgraph.ActivitySourceChatRun {
		t.Fatalf("attachment = %+v, want chat run evidence and activity", attachment)
	}

	ended := postJSON[semanticgraph.SemanticActivityEndResult](t, handler, "/semantic-graph/activity/end", EndSemanticActivityRequest{
		WorkspaceID:        workspaceID,
		ActivityIntervalID: attachment.Activity.ID,
		ActorKind:          semanticgraph.ActorKindUser,
		ActorID:            "user_http",
	}, http.StatusOK)
	if ended.Activity.EndedAt == "" {
		t.Fatalf("ended activity = %+v, want ended timestamp", ended.Activity)
	}

	detail := postJSON[ReadSemanticNodeDetailResponse](t, handler, "/semantic-graph/nodes/detail", ReadSemanticNodeDetailRequest{
		WorkspaceID: workspaceID,
		NodeID:      "node_attach",
	}, http.StatusOK)
	if detail.Detail == nil || len(detail.Detail.Evidence) != 1 || len(detail.Detail.Activity) != 1 || detail.Detail.Activity[0].EvidenceAnchorID == "" {
		t.Fatalf("attached detail = %+v, want linked evidence and activity", detail.Detail)
	}
	history := postJSON[semanticgraph.SemanticEventHistory](t, handler, "/semantic-graph/events/history", ReadSemanticEventHistoryRequest{
		WorkspaceID:        workspaceID,
		TargetEntityID:     "node_attach",
		BeforeLogicalClock: 0,
		Limit:              20,
	}, http.StatusOK)
	if len(history.Events) != 4 {
		t.Fatalf("history = %+v, want node created plus attach/end events", history.Events)
	}
}

func TestSemanticGraphMutationEndpoints(t *testing.T) {
	handler, semanticService := newSemanticGraphHandler(t)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	workspaceID := opened.Workspace.ID
	appendHTTPSemanticEvent(t, semanticService, workspaceID, semanticgraph.EventNodeCreated, "node_source", map[string]any{
		"nodeId": "node_source",
		"kind":   string(semanticgraph.NodeKindFinding),
		"label":  "Source node",
	})

	createdNode := postJSON[semanticgraph.SemanticMutationResult](t, handler, "/semantic-graph/nodes/create", CreateSemanticNodeRequest{
		WorkspaceID: workspaceID,
		NodeID:      "node_constraint",
		Kind:        semanticgraph.NodeKindConstraint,
		Label:       "Explicit constraint",
		Summary:     "Created through HTTP mutation endpoint",
		ActorKind:   semanticgraph.ActorKindUser,
		ActorID:     "user_http",
	}, http.StatusOK)
	if createdNode.NodeDetail == nil || createdNode.NodeDetail.Node.Kind != semanticgraph.NodeKindConstraint {
		t.Fatalf("created node = %+v, want constraint detail", createdNode.NodeDetail)
	}
	postJSON[semanticgraph.SemanticMutationResult](t, handler, "/semantic-graph/edges/create", CreateSemanticEdgeRequest{
		WorkspaceID: workspaceID,
		EdgeID:      "edge_constraint",
		Kind:        semanticgraph.EdgeKindConstrains,
		FromNodeID:  "node_constraint",
		ToNodeID:    "node_source",
		Label:       "constrains",
		ActorKind:   semanticgraph.ActorKindUser,
		ActorID:     "user_http",
	}, http.StatusOK)
	edgeSummary := "Updated edge through HTTP"
	postJSON[semanticgraph.SemanticMutationResult](t, handler, "/semantic-graph/edges/update", UpdateSemanticEdgeRequest{
		WorkspaceID: workspaceID,
		EdgeID:      "edge_constraint",
		Summary:     &edgeSummary,
		ActorKind:   semanticgraph.ActorKindUser,
		ActorID:     "user_http",
	}, http.StatusOK)
	postJSON[semanticgraph.SemanticMutationResult](t, handler, "/semantic-graph/edges/remove", SemanticEdgeOperationRequest{
		WorkspaceID: workspaceID,
		EdgeID:      "edge_constraint",
		ActorKind:   semanticgraph.ActorKindUser,
		ActorID:     "user_http",
	}, http.StatusOK)

	postJSON[semanticgraph.SemanticMutationResult](t, handler, "/semantic-graph/nodes/rename", RenameSemanticNodeRequest{
		WorkspaceID: workspaceID,
		NodeID:      "node_source",
		Label:       "Renamed source",
		ActorKind:   semanticgraph.ActorKindUser,
		ActorID:     "user_http",
	}, http.StatusOK)
	nodeSummary := "Updated source through HTTP"
	postJSON[semanticgraph.SemanticMutationResult](t, handler, "/semantic-graph/nodes/update", UpdateSemanticNodeRequest{
		WorkspaceID: workspaceID,
		NodeID:      "node_source",
		Summary:     &nodeSummary,
		ActorKind:   semanticgraph.ActorKindUser,
		ActorID:     "user_http",
	}, http.StatusOK)
	postJSON[semanticgraph.SemanticMutationResult](t, handler, "/semantic-graph/nodes/promote", SemanticNodeOperationRequest{
		WorkspaceID: workspaceID,
		NodeID:      "node_source",
		ActorKind:   semanticgraph.ActorKindUser,
		ActorID:     "user_http",
	}, http.StatusOK)
	postJSON[semanticgraph.SemanticMutationResult](t, handler, "/semantic-graph/nodes/dismiss", SemanticNodeOperationRequest{
		WorkspaceID: workspaceID,
		NodeID:      "node_source",
		ActorKind:   semanticgraph.ActorKindUser,
		ActorID:     "user_http",
	}, http.StatusOK)

	steering := postJSON[semanticgraph.SemanticMutationResult](t, handler, "/semantic-graph/steering/create", CreateSemanticSteeringDirectiveRequest{
		WorkspaceID:    workspaceID,
		TargetEntityID: "node_source",
		Kind:           semanticgraph.SteeringKindAvoid,
		Instruction:    "Avoid this dismissed source",
		Scope:          semanticgraph.SteeringScopeWorkspace,
		ActorKind:      semanticgraph.ActorKindUser,
		ActorID:        "user_http",
	}, http.StatusOK)
	if steering.NodeDetail == nil || len(steering.NodeDetail.SteeringDirectives) != 1 {
		t.Fatalf("steering result = %+v, want one directive", steering.NodeDetail)
	}
	directiveID := steering.NodeDetail.SteeringDirectives[0].ID
	dismissed := semanticgraph.SteeringStatusDismissed
	postJSON[semanticgraph.SemanticMutationResult](t, handler, "/semantic-graph/steering/update", UpdateSemanticSteeringDirectiveRequest{
		WorkspaceID: workspaceID,
		DirectiveID: directiveID,
		Status:      &dismissed,
		ActorKind:   semanticgraph.ActorKindUser,
		ActorID:     "user_http",
	}, http.StatusOK)

	postJSON[semanticgraph.SemanticMutationResult](t, handler, "/semantic-graph/nodes/split", SplitSemanticNodeRequest{
		WorkspaceID:  workspaceID,
		SourceNodeID: "node_constraint",
		Nodes: []semanticgraph.SemanticNodeSeedInput{
			{NodeID: "node_split_a", Kind: semanticgraph.NodeKindConstraint, Label: "Split A"},
			{NodeID: "node_split_b", Kind: semanticgraph.NodeKindConstraint, Label: "Split B"},
		},
		ActorKind: semanticgraph.ActorKindUser,
		ActorID:   "user_http",
	}, http.StatusOK)
	merged := postJSON[semanticgraph.SemanticMutationResult](t, handler, "/semantic-graph/nodes/merge", MergeSemanticNodesRequest{
		WorkspaceID:   workspaceID,
		SourceNodeIDs: []string{"node_split_a", "node_split_b"},
		TargetNode:    semanticgraph.SemanticNodeSeedInput{NodeID: "node_merged", Kind: semanticgraph.NodeKindDecision, Label: "Merged decision"},
		ActorKind:     semanticgraph.ActorKindUser,
		ActorID:       "user_http",
	}, http.StatusOK)
	if merged.NodeDetail == nil || merged.NodeDetail.Node.ID != "node_merged" {
		t.Fatalf("merged result = %+v, want merged target detail", merged.NodeDetail)
	}

	postJSON[ErrorResponse](t, handler, "/semantic-graph/nodes/rename", RenameSemanticNodeRequest{
		WorkspaceID: workspaceID,
		NodeID:      "node_missing",
		Label:       "Missing",
		ActorKind:   semanticgraph.ActorKindUser,
		ActorID:     "user_http",
	}, http.StatusBadRequest)
}

func assertSemanticLayoutUpdateEndpointDoesNotAppendEvent(t *testing.T, handler http.Handler, workspaceID string) {
	t.Helper()
	positions := postJSON[semanticgraph.SemanticLayoutPositionList](t, handler, "/semantic-graph/layout/update", UpdateSemanticLayoutPositionsRequest{
		WorkspaceID: workspaceID,
		Positions: []semanticgraph.SemanticLayoutPositionInput{
			{EntityID: "node_scope", X: 80, Y: -40, Pinned: true},
		},
	}, http.StatusOK)
	if len(positions.Positions) != 1 || positions.Positions[0].EntityID != "node_scope" || !positions.Positions[0].Pinned {
		t.Fatalf("layout update response = %+v, want pinned node_scope", positions)
	}
	graph := postJSON[semanticgraph.SemanticGraph](t, handler, "/semantic-graph/read", ReadSemanticGraphRequest{
		WorkspaceID: workspaceID,
	}, http.StatusOK)
	if len(graph.LayoutPositions) != 1 || graph.LayoutPositions[0].X != 80 || graph.LayoutPositions[0].Y != -40 {
		t.Fatalf("graph layout positions = %+v, want persisted node_scope position", graph.LayoutPositions)
	}
	history := postJSON[semanticgraph.SemanticEventHistory](t, handler, "/semantic-graph/events/history", ReadSemanticEventHistoryRequest{
		WorkspaceID:        workspaceID,
		TargetEntityID:     "node_scope",
		BeforeLogicalClock: 0,
		Limit:              20,
	}, http.StatusOK)
	if len(history.Events) != 6 {
		t.Fatalf("history after layout update = %+v, want no appended semantic event", history.Events)
	}
}

func readServerSentSemanticGraphChangeEvent(t *testing.T, reader *bufio.Reader) semanticgraph.SemanticGraphChangeEvent {
	t.Helper()
	var data string
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			t.Fatalf("read semantic graph change stream line: %v", err)
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			if data == "" {
				continue
			}
			var event semanticgraph.SemanticGraphChangeEvent
			if err := json.Unmarshal([]byte(data), &event); err != nil {
				t.Fatalf("decode semantic graph change stream data: %v", err)
			}
			return event
		}
		if strings.HasPrefix(line, "data: ") {
			data = strings.TrimPrefix(line, "data: ")
		}
	}
}

func semanticGraphHTTPAreasContain(values []semanticgraph.SemanticGraphChangeArea, want semanticgraph.SemanticGraphChangeArea) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func semanticGraphHTTPStringsContain(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func newSemanticGraphHandler(t *testing.T) (http.Handler, *semanticgraph.Service) {
	return newSemanticGraphHandlerWithOptions(t)
}

func newSemanticGraphHandlerWithOptions(t *testing.T, options ...semanticgraph.Option) (http.Handler, *semanticgraph.Service) {
	t.Helper()
	appDataDir := t.TempDir()
	store, err := appstate.NewStore(appDataDir)
	if err != nil {
		t.Fatalf("new app store: %v", err)
	}
	manager, err := workspace.NewManager(
		filepath.Dir(store.Path()),
		workspace.WithClock(func() time.Time {
			return mustTime(t, "2026-06-10T20:00:00Z")
		}),
	)
	if err != nil {
		t.Fatalf("new workspace manager: %v", err)
	}
	workspaceService, err := workspacesession.NewService(store, manager)
	if err != nil {
		t.Fatalf("new workspace service: %v", err)
	}
	semanticStore, err := semanticgraph.NewStore(appDataDir)
	if err != nil {
		t.Fatalf("new semantic graph store: %v", err)
	}
	t.Cleanup(func() {
		if err := semanticStore.Close(); err != nil {
			t.Fatalf("close semantic graph store: %v", err)
		}
	})
	semanticService, err := semanticgraph.NewService(semanticStore, workspaceService, options...)
	if err != nil {
		t.Fatalf("new semantic graph service: %v", err)
	}
	chatStore, err := chat.NewStore(appDataDir)
	if err != nil {
		t.Fatalf("new chat store: %v", err)
	}
	chatService, err := chat.NewService(chatStore, workspaceService, chat.NewFakeHarness(nil))
	if err != nil {
		t.Fatalf("new chat service: %v", err)
	}
	return NewHandler(HandlerConfig{
		Metadata:             BackendMetadata{Name: BackendName, Version: "test"},
		ChatService:          chatService,
		SemanticGraphService: semanticService,
		WorkspaceService:     workspaceService,
	}), semanticService
}

func appendHTTPSemanticEvent(t *testing.T, service *semanticgraph.Service, workspaceID string, eventType semanticgraph.SemanticEventType, targetEntityID string, payload map[string]any) {
	t.Helper()
	data, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal semantic payload: %v", err)
	}
	event := semanticgraph.SemanticEvent{
		EventID:        "semantic_http_" + strings.ReplaceAll(string(eventType), ".", "_") + "_" + targetEntityID + "_" + payloadID(payload),
		WorkspaceID:    workspaceID,
		ActorKind:      semanticgraph.ActorKindService,
		ActorID:        "semantic_http_test",
		EventType:      eventType,
		TargetEntityID: targetEntityID,
		ObservedAt:     semanticHTTPObservedAt(t, eventType),
		Payload:        data,
		ModelInfo:      map[string]string{},
	}
	if _, err := service.AppendEvent(context.Background(), event); err != nil {
		t.Fatalf("append semantic event %s: %v", eventType, err)
	}
}

func payloadID(payload map[string]any) string {
	for _, key := range []string{"nodeId", "anchorId", "intervalId", "directiveId"} {
		if value, ok := payload[key].(string); ok {
			return value
		}
	}
	return "event"
}

func semanticHTTPObservedAt(t *testing.T, eventType semanticgraph.SemanticEventType) string {
	t.Helper()
	offsets := map[semanticgraph.SemanticEventType]int{
		semanticgraph.EventNodeCreated:      1,
		semanticgraph.EventEvidenceAttached: 2,
		semanticgraph.EventActivityStarted:  3,
		semanticgraph.EventActivityEnded:    4,
		semanticgraph.EventSteeringCreated:  5,
	}
	return time.Date(2026, 6, 10, 20, 0, offsets[eventType], 0, time.UTC).Format(time.RFC3339Nano)
}

func semanticActivitySourceKindPtr(kind semanticgraph.SemanticActivitySourceKind) *semanticgraph.SemanticActivitySourceKind {
	return &kind
}

type httpSemanticChatResolver struct {
	run chat.Run
}

func (resolver httpSemanticChatResolver) ReadConversation(workspaceID string, conversationID string) (chat.Conversation, error) {
	if resolver.run.ConversationID == conversationID {
		return chat.Conversation{ID: conversationID, WorkspaceID: workspaceID}, nil
	}
	return chat.Conversation{}, errors.New("chat conversation not found")
}

func (resolver httpSemanticChatResolver) ReadRun(workspaceID string, runID string) (chat.Run, error) {
	if resolver.run.ID == runID {
		run := resolver.run
		run.WorkspaceID = workspaceID
		return run, nil
	}
	return chat.Run{}, errors.New("chat run not found")
}

func (resolver httpSemanticChatResolver) ReadMessage(string, string, string) (chat.ChatMessage, error) {
	return chat.ChatMessage{}, errors.New("chat message not found")
}

func (resolver httpSemanticChatResolver) ReadRunItem(string, string, string) (chat.RunItem, error) {
	return chat.RunItem{}, errors.New("run item not found")
}
