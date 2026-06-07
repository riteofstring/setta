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

func semanticGraphActor(actorKind semanticgraph.SemanticActorKind, actorID string) semanticgraph.SemanticAttachmentActor {
	return semanticgraph.SemanticAttachmentActor{ActorKind: actorKind, ActorID: actorID}
}
