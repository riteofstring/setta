package httpapi

import (
	"net/http"

	"setta/internal/semanticgraph"
)

func (handler handler) readSemanticRuntimeSnapshot(response http.ResponseWriter, request *http.Request) {
	service := requireSemanticGraphService(response, handler.semanticGraphService)
	if service == nil {
		return
	}
	var payload ReadSemanticRuntimeSnapshotRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	snapshot, err := service.ReadSemanticRuntimeSnapshot(request.Context(), semanticgraph.SemanticRuntimeFilter{
		WorkspaceID:         payload.WorkspaceID,
		WorkflowExecutionID: payload.WorkflowExecutionID,
		ChatRunID:           payload.ChatRunID,
		Limit:               payload.Limit,
	})
	if err != nil {
		writeSemanticGraphError(response, "read_semantic_runtime_snapshot_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, snapshot)
}
