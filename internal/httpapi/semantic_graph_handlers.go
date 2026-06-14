package httpapi

import (
	"net/http"

	"setta/internal/semanticgraph"
)

func (handler handler) readSemanticGraph(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload ReadSemanticGraphRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	graph, err := service.ReadGraph(request.Context(), payload.WorkspaceID)
	if err != nil {
		writeSemanticGraphError(response, "read_semantic_graph_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, graph)
}

func (handler handler) readSemanticNodeDetail(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload ReadSemanticNodeDetailRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	detail, ok, err := service.ReadNodeDetail(request.Context(), payload.WorkspaceID, payload.NodeID)
	if err != nil {
		writeSemanticGraphError(response, "read_semantic_node_detail_failed", err)
		return
	}
	if !ok {
		writeJSON(response, http.StatusOK, ReadSemanticNodeDetailResponse{})
		return
	}
	writeJSON(response, http.StatusOK, ReadSemanticNodeDetailResponse{Detail: &detail})
}

func (handler handler) listSemanticEvidence(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload ListSemanticEvidenceRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	evidence, err := service.ListEvidence(request.Context(), payload.WorkspaceID, payload.TargetEntityID)
	if err != nil {
		writeSemanticGraphError(response, "list_semantic_evidence_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, evidence)
}

func (handler handler) listSemanticActivity(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload ListSemanticActivityRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	activity, err := service.ListActivity(request.Context(), payload.WorkspaceID, payload.TargetEntityID, payload.Limit)
	if err != nil {
		writeSemanticGraphError(response, "list_semantic_activity_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, activity)
}

func (handler handler) listSemanticActivityPage(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload ListSemanticActivityPageRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	var sourceKind semanticgraph.SemanticActivitySourceKind
	if payload.SourceKind != nil {
		sourceKind = *payload.SourceKind
	}
	var actorKind semanticgraph.SemanticActorKind
	if payload.ActorKind != nil {
		actorKind = *payload.ActorKind
	}
	page, err := service.ListActivityPage(request.Context(), semanticgraph.SemanticActivityFilter{
		WorkspaceID:         payload.WorkspaceID,
		TargetEntityID:      payload.TargetEntityID,
		SourceKind:          sourceKind,
		SourceID:            payload.SourceID,
		WorkflowExecutionID: payload.WorkflowExecutionID,
		WorkflowNodeID:      payload.WorkflowNodeID,
		ChatConversationID:  payload.ChatConversationID,
		ChatRunID:           payload.ChatRunID,
		ChatMessageID:       payload.ChatMessageID,
		ActorKind:           actorKind,
		ActorID:             payload.ActorID,
		Offset:              payload.Offset,
		Limit:               payload.Limit,
	})
	if err != nil {
		writeSemanticGraphError(response, "list_semantic_activity_page_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, page)
}

func (handler handler) readSemanticActivitySummary(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload ReadSemanticActivitySummaryRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	summary, err := service.ReadActivitySummary(request.Context(), payload.WorkspaceID, payload.RecentLimit)
	if err != nil {
		writeSemanticGraphError(response, "read_semantic_activity_summary_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, summary)
}

func (handler handler) readSemanticSteeringState(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload ReadSemanticSteeringStateRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	state, err := service.ReadSteeringState(request.Context(), payload.WorkspaceID, payload.TargetEntityID)
	if err != nil {
		writeSemanticGraphError(response, "read_semantic_steering_state_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, state)
}

func (handler handler) readSemanticEventHistory(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload ReadSemanticEventHistoryRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	history, err := service.ReadEventHistory(request.Context(), payload.WorkspaceID, payload.TargetEntityID, payload.BeforeLogicalClock, payload.Limit)
	if err != nil {
		writeSemanticGraphError(response, "read_semantic_event_history_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, history)
}

func (handler handler) readSemanticContextPack(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload ReadSemanticContextPackRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	pack, ok, err := service.ReadContextPack(request.Context(), payload.WorkspaceID, payload.PackID)
	if err != nil {
		writeSemanticGraphError(response, "read_semantic_context_pack_failed", err)
		return
	}
	if !ok {
		writeJSON(response, http.StatusOK, semanticgraph.SemanticContextPackReadResponse{})
		return
	}
	writeJSON(response, http.StatusOK, semanticgraph.SemanticContextPackReadResponse{Pack: &pack})
}

func (handler handler) listSemanticContextPacks(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload ListSemanticContextPacksRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	packs, err := service.ListContextPacks(request.Context(), semanticgraph.SemanticContextPackFilter{
		WorkspaceID:         payload.WorkspaceID,
		TargetEntityID:      payload.TargetEntityID,
		WorkflowExecutionID: payload.WorkflowExecutionID,
		ChatRunID:           payload.ChatRunID,
		Offset:              payload.Offset,
		Limit:               payload.Limit,
	})
	if err != nil {
		writeSemanticGraphError(response, "list_semantic_context_packs_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, packs)
}

func (handler handler) buildCartographerWindow(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload BuildCartographerWindowRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.BuildCartographerWindow(request.Context(), semanticgraph.CartographerManualWindowRequest{
		WorkspaceID:    payload.WorkspaceID,
		TriggerKind:    payload.TriggerKind,
		TargetEntityID: payload.TargetEntityID,
		SourceRefs:     payload.SourceRefs,
		RunStatus:      payload.RunStatus,
		TerminalReason: payload.TerminalReason,
		Summary:        payload.Summary,
	})
	if err != nil {
		writeSemanticGraphError(response, "build_cartographer_window_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) processCartographerWindow(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload ProcessCartographerWindowRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.ProcessCartographerWindow(request.Context(), payload.WorkspaceID, payload.WindowID)
	if err != nil {
		writeSemanticGraphError(response, "process_cartographer_window_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) readSemanticCartographerSettings(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload ReadSemanticCartographerSettingsRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	record, err := service.ReadSemanticCartographerSettings(request.Context())
	if err != nil {
		writeSemanticGraphError(response, "read_semantic_cartographer_settings_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, record)
}

func (handler handler) readSemanticCartographerSettingsMetadata(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload ReadSemanticCartographerSettingsMetadataRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	metadata, err := service.ReadSemanticCartographerSettingsMetadata(request.Context())
	if err != nil {
		writeSemanticGraphError(response, "read_semantic_cartographer_settings_metadata_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, metadata)
}

func (handler handler) updateSemanticCartographerSettings(response http.ResponseWriter, request *http.Request) {
	semanticService := requireSemanticGraphService(response, handler.semanticGraphService)
	if semanticService == nil {
		return
	}
	chatService := requireChatService(response, handler.chatService)
	if chatService == nil {
		return
	}
	var payload UpdateSemanticCartographerSettingsRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	models, err := chatService.ListCodexModelOptions(payload.WorkspaceID)
	if err != nil {
		writeSemanticGraphError(response, "list_semantic_cartographer_model_options_failed", err)
		return
	}
	record, err := semanticService.UpdateSemanticCartographerSettings(request.Context(), payload.Settings, models)
	if err != nil {
		writeSemanticGraphError(response, "update_semantic_cartographer_settings_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, record)
}

func (handler handler) listSemanticCartographerModelOptions(response http.ResponseWriter, request *http.Request) {
	service := requireChatService(response, handler.chatService)
	if service == nil {
		return
	}
	var payload ListSemanticCartographerModelOptionsRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	models, err := service.ListCodexModelOptions(payload.WorkspaceID)
	if err != nil {
		writeSemanticGraphError(response, "list_semantic_cartographer_model_options_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, models)
}

func (handler handler) readCartographerProcessingState(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload ReadCartographerProcessingStateRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	state, err := service.ReadCartographerProcessingState(request.Context())
	if err != nil {
		writeSemanticGraphError(response, "read_cartographer_processing_state_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, state)
}

func (handler handler) readCartographerRun(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload ReadCartographerRunRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	run, ok, err := service.ReadCartographerRun(request.Context(), payload.WorkspaceID, payload.RunID)
	if err != nil {
		writeSemanticGraphError(response, "read_cartographer_run_failed", err)
		return
	}
	if !ok {
		writeJSON(response, http.StatusOK, semanticgraph.CartographerRunReadResponse{})
		return
	}
	writeJSON(response, http.StatusOK, semanticgraph.CartographerRunReadResponse{Run: &run})
}

func (handler handler) listCartographerRuns(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload ListCartographerRunsRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	runs, err := service.ListCartographerRuns(request.Context(), semanticgraph.CartographerRunFilter{
		WorkspaceID:         payload.WorkspaceID,
		WorkflowExecutionID: payload.WorkflowExecutionID,
		ChatRunID:           payload.ChatRunID,
		TargetEntityID:      payload.TargetEntityID,
		Limit:               payload.Limit,
	})
	if err != nil {
		writeSemanticGraphError(response, "list_cartographer_runs_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, runs)
}

func (handler handler) listCartographerWindows(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload ListCartographerWindowsRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	windows, err := service.ListCartographerWindows(request.Context(), semanticgraph.CartographerWindowFilter{
		WorkspaceID:         payload.WorkspaceID,
		RunID:               payload.RunID,
		SourceKind:          payload.SourceKind,
		SourceID:            payload.SourceID,
		WorkflowExecutionID: payload.WorkflowExecutionID,
		ChatRunID:           payload.ChatRunID,
		Limit:               payload.Limit,
	})
	if err != nil {
		writeSemanticGraphError(response, "list_cartographer_windows_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, windows)
}

func (handler handler) listCartographerCursors(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload ListCartographerCursorsRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	cursors, err := service.ListCartographerCursors(request.Context(), semanticgraph.CartographerCursorFilter{
		WorkspaceID:         payload.WorkspaceID,
		WorkflowExecutionID: payload.WorkflowExecutionID,
		ChatRunID:           payload.ChatRunID,
		Limit:               payload.Limit,
	})
	if err != nil {
		writeSemanticGraphError(response, "list_cartographer_cursors_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, cursors)
}

func (handler handler) listCartographerPatches(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload ListCartographerPatchesRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	patches, err := service.ListCartographerPatches(request.Context(), semanticgraph.CartographerPatchFilter{
		WorkspaceID:      payload.WorkspaceID,
		RunID:            payload.RunID,
		SemanticTargetID: payload.SemanticTargetID,
		Status:           payload.Status,
		Limit:            payload.Limit,
	})
	if err != nil {
		writeSemanticGraphError(response, "list_cartographer_patches_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, patches)
}

func (handler handler) acceptCartographerPatch(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload ReviewCartographerPatchRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.AcceptCartographerPatch(request.Context(), payload.WorkspaceID, payload.PatchID)
	if err != nil {
		writeSemanticGraphError(response, "accept_cartographer_patch_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) rejectCartographerPatch(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload ReviewCartographerPatchRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.RejectCartographerPatch(request.Context(), payload.WorkspaceID, payload.PatchID)
	if err != nil {
		writeSemanticGraphError(response, "reject_cartographer_patch_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) updateSemanticLayoutPositions(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload UpdateSemanticLayoutPositionsRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	positions, err := service.UpdateLayoutPositions(request.Context(), payload.WorkspaceID, payload.Positions)
	if err != nil {
		writeSemanticGraphError(response, "update_semantic_layout_positions_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, positions)
}

func (handler handler) attachSemanticNodeToWorkflowExecution(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload AttachSemanticNodeToWorkflowExecutionRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.AttachWorkflowExecution(request.Context(), semanticgraph.AttachWorkflowExecutionInput{
		WorkspaceID:         payload.WorkspaceID,
		NodeID:              payload.NodeID,
		WorkflowExecutionID: payload.WorkflowExecutionID,
		ActivityKind:        payload.ActivityKind,
		Summary:             payload.Summary,
		Actor:               semanticGraphActor(payload.ActorKind, payload.ActorID),
	})
	if err != nil {
		writeSemanticGraphError(response, "attach_semantic_workflow_execution_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) attachSemanticNodeToWorkflowNode(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload AttachSemanticNodeToWorkflowNodeRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.AttachWorkflowNode(request.Context(), semanticgraph.AttachWorkflowNodeInput{
		WorkspaceID:             payload.WorkspaceID,
		NodeID:                  payload.NodeID,
		WorkflowExecutionID:     payload.WorkflowExecutionID,
		WorkflowNodeID:          payload.WorkflowNodeID,
		WorkflowNodeExecutionID: payload.WorkflowNodeExecutionID,
		WorkflowDefinitionID:    payload.WorkflowDefinitionID,
		ActivityKind:            payload.ActivityKind,
		Summary:                 payload.Summary,
		Actor:                   semanticGraphActor(payload.ActorKind, payload.ActorID),
	})
	if err != nil {
		writeSemanticGraphError(response, "attach_semantic_workflow_node_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) attachSemanticNodeToChatRun(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload AttachSemanticNodeToChatRunRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.AttachChatRun(request.Context(), semanticgraph.AttachChatRunInput{
		WorkspaceID:  payload.WorkspaceID,
		NodeID:       payload.NodeID,
		ChatRunID:    payload.ChatRunID,
		ActivityKind: payload.ActivityKind,
		Summary:      payload.Summary,
		Actor:        semanticGraphActor(payload.ActorKind, payload.ActorID),
	})
	if err != nil {
		writeSemanticGraphError(response, "attach_semantic_chat_run_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) attachSemanticNodeToChatMessage(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload AttachSemanticNodeToChatMessageRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.AttachChatMessage(request.Context(), semanticgraph.AttachChatMessageInput{
		WorkspaceID:        payload.WorkspaceID,
		NodeID:             payload.NodeID,
		ChatConversationID: payload.ChatConversationID,
		ChatMessageID:      payload.ChatMessageID,
		ActivityKind:       payload.ActivityKind,
		Summary:            payload.Summary,
		Actor:              semanticGraphActor(payload.ActorKind, payload.ActorID),
	})
	if err != nil {
		writeSemanticGraphError(response, "attach_semantic_chat_message_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) attachSemanticNodeToRunItem(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload AttachSemanticNodeToRunItemRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.AttachRunItem(request.Context(), semanticgraph.AttachRunItemInput{
		WorkspaceID:  payload.WorkspaceID,
		NodeID:       payload.NodeID,
		ChatRunID:    payload.ChatRunID,
		RunItemID:    payload.RunItemID,
		ActivityKind: payload.ActivityKind,
		Summary:      payload.Summary,
		Actor:        semanticGraphActor(payload.ActorKind, payload.ActorID),
	})
	if err != nil {
		writeSemanticGraphError(response, "attach_semantic_run_item_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) attachSemanticNodeToFileRange(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload AttachSemanticNodeToFileRangeRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.AttachFileRange(request.Context(), semanticgraph.AttachFileRangeInput{
		WorkspaceID:  payload.WorkspaceID,
		NodeID:       payload.NodeID,
		Path:         payload.Path,
		RangeStart:   payload.RangeStart,
		RangeEnd:     payload.RangeEnd,
		ActivityKind: payload.ActivityKind,
		Summary:      payload.Summary,
		Actor:        semanticGraphActor(payload.ActorKind, payload.ActorID),
	})
	if err != nil {
		writeSemanticGraphError(response, "attach_semantic_file_range_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) endSemanticActivity(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload EndSemanticActivityRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.EndActivity(request.Context(), semanticgraph.EndSemanticActivityInput{
		WorkspaceID:        payload.WorkspaceID,
		ActivityIntervalID: payload.ActivityIntervalID,
		Actor:              semanticGraphActor(payload.ActorKind, payload.ActorID),
	})
	if err != nil {
		writeSemanticGraphError(response, "end_semantic_activity_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) renameSemanticNode(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload RenameSemanticNodeRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.RenameNode(request.Context(), semanticgraph.RenameSemanticNodeInput{
		WorkspaceID: payload.WorkspaceID,
		NodeID:      payload.NodeID,
		Label:       payload.Label,
		Actor:       semanticGraphActor(payload.ActorKind, payload.ActorID),
	})
	if err != nil {
		writeSemanticGraphError(response, "rename_semantic_node_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) updateSemanticNode(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload UpdateSemanticNodeRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.UpdateNode(request.Context(), semanticgraph.UpdateSemanticNodeInput{
		WorkspaceID: payload.WorkspaceID,
		NodeID:      payload.NodeID,
		Kind:        payload.Kind,
		Summary:     payload.Summary,
		Actor:       semanticGraphActor(payload.ActorKind, payload.ActorID),
	})
	if err != nil {
		writeSemanticGraphError(response, "update_semantic_node_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) dismissSemanticNode(response http.ResponseWriter, request *http.Request) {
	handler.semanticNodeOperation(response, request, "dismiss_semantic_node_failed", func(ctxRequest *http.Request, payload SemanticNodeOperationRequest) (semanticgraph.SemanticMutationResult, error) {
		return handler.semanticGraphService.DismissNode(ctxRequest.Context(), semanticgraph.SemanticNodeOperationInput{
			WorkspaceID: payload.WorkspaceID,
			NodeID:      payload.NodeID,
			Actor:       semanticGraphActor(payload.ActorKind, payload.ActorID),
		})
	})
}

func (handler handler) promoteSemanticNode(response http.ResponseWriter, request *http.Request) {
	handler.semanticNodeOperation(response, request, "promote_semantic_node_failed", func(ctxRequest *http.Request, payload SemanticNodeOperationRequest) (semanticgraph.SemanticMutationResult, error) {
		return handler.semanticGraphService.PromoteNode(ctxRequest.Context(), semanticgraph.SemanticNodeOperationInput{
			WorkspaceID: payload.WorkspaceID,
			NodeID:      payload.NodeID,
			Actor:       semanticGraphActor(payload.ActorKind, payload.ActorID),
		})
	})
}

func (handler handler) semanticNodeOperation(response http.ResponseWriter, request *http.Request, errorCode string, run func(*http.Request, SemanticNodeOperationRequest) (semanticgraph.SemanticMutationResult, error)) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload SemanticNodeOperationRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := run(request, payload)
	if err != nil {
		writeSemanticGraphError(response, errorCode, err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) splitSemanticNode(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload SplitSemanticNodeRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.SplitNode(request.Context(), semanticgraph.SplitSemanticNodeInput{
		WorkspaceID:   payload.WorkspaceID,
		SourceNodeID:  payload.SourceNodeID,
		Nodes:         payload.Nodes,
		Reassignments: payload.Reassignments,
		Actor:         semanticGraphActor(payload.ActorKind, payload.ActorID),
	})
	if err != nil {
		writeSemanticGraphError(response, "split_semantic_node_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) mergeSemanticNodes(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload MergeSemanticNodesRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.MergeNodes(request.Context(), semanticgraph.MergeSemanticNodesInput{
		WorkspaceID:   payload.WorkspaceID,
		SourceNodeIDs: payload.SourceNodeIDs,
		TargetNode:    payload.TargetNode,
		Reassignments: payload.Reassignments,
		Actor:         semanticGraphActor(payload.ActorKind, payload.ActorID),
	})
	if err != nil {
		writeSemanticGraphError(response, "merge_semantic_nodes_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) createSemanticNode(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload CreateSemanticNodeRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.CreateUserNode(request.Context(), semanticgraph.CreateSemanticNodeInput{
		WorkspaceID: payload.WorkspaceID,
		NodeID:      payload.NodeID,
		Kind:        payload.Kind,
		Label:       payload.Label,
		Summary:     payload.Summary,
		Actor:       semanticGraphActor(payload.ActorKind, payload.ActorID),
	})
	if err != nil {
		writeSemanticGraphError(response, "create_semantic_node_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) createSemanticEdge(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload CreateSemanticEdgeRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.CreateUserEdge(request.Context(), semanticgraph.CreateSemanticEdgeInput{
		WorkspaceID: payload.WorkspaceID,
		EdgeID:      payload.EdgeID,
		Kind:        payload.Kind,
		FromNodeID:  payload.FromNodeID,
		ToNodeID:    payload.ToNodeID,
		Label:       payload.Label,
		Summary:     payload.Summary,
		Actor:       semanticGraphActor(payload.ActorKind, payload.ActorID),
	})
	if err != nil {
		writeSemanticGraphError(response, "create_semantic_edge_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) updateSemanticEdge(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload UpdateSemanticEdgeRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.UpdateEdge(request.Context(), semanticgraph.UpdateSemanticEdgeInput{
		WorkspaceID: payload.WorkspaceID,
		EdgeID:      payload.EdgeID,
		Kind:        payload.Kind,
		Label:       payload.Label,
		Summary:     payload.Summary,
		Actor:       semanticGraphActor(payload.ActorKind, payload.ActorID),
	})
	if err != nil {
		writeSemanticGraphError(response, "update_semantic_edge_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) removeSemanticEdge(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload SemanticEdgeOperationRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.RemoveEdge(request.Context(), semanticgraph.SemanticEdgeOperationInput{
		WorkspaceID: payload.WorkspaceID,
		EdgeID:      payload.EdgeID,
		Actor:       semanticGraphActor(payload.ActorKind, payload.ActorID),
	})
	if err != nil {
		writeSemanticGraphError(response, "remove_semantic_edge_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) createSemanticSteeringDirective(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload CreateSemanticSteeringDirectiveRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.CreateSteeringDirective(request.Context(), semanticgraph.CreateSteeringDirectiveInput{
		WorkspaceID:             payload.WorkspaceID,
		TargetEntityID:          payload.TargetEntityID,
		Kind:                    payload.Kind,
		Instruction:             payload.Instruction,
		Scope:                   payload.Scope,
		WorkflowDefinitionID:    payload.WorkflowDefinitionID,
		WorkflowExecutionID:     payload.WorkflowExecutionID,
		WorkflowNodeID:          payload.WorkflowNodeID,
		WorkflowNodeExecutionID: payload.WorkflowNodeExecutionID,
		ChatConversationID:      payload.ChatConversationID,
		ChatRunID:               payload.ChatRunID,
		ChatMessageID:           payload.ChatMessageID,
		RunItemID:               payload.RunItemID,
		Actor:                   semanticGraphActor(payload.ActorKind, payload.ActorID),
	})
	if err != nil {
		writeSemanticGraphError(response, "create_semantic_steering_directive_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func (handler handler) updateSemanticSteeringDirective(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload UpdateSemanticSteeringDirectiveRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	result, err := service.UpdateSteeringDirective(request.Context(), semanticgraph.UpdateSteeringDirectiveInput{
		WorkspaceID:           payload.WorkspaceID,
		DirectiveID:           payload.DirectiveID,
		Instruction:           payload.Instruction,
		Status:                payload.Status,
		SupersedesDirectiveID: payload.SupersedesDirectiveID,
		Actor:                 semanticGraphActor(payload.ActorKind, payload.ActorID),
	})
	if err != nil {
		writeSemanticGraphError(response, "update_semantic_steering_directive_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func semanticGraphActor(actorKind semanticgraph.SemanticActorKind, actorID string) semanticgraph.SemanticAttachmentActor {
	return semanticgraph.SemanticAttachmentActor{ActorKind: actorKind, ActorID: actorID}
}
