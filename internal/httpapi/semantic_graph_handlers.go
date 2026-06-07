package httpapi

import "net/http"

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
