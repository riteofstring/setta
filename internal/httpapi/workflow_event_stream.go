package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"

	"setta/internal/orchestrator"
)

func (handler handler) workflowEventStream(response http.ResponseWriter, request *http.Request) {
	service := requireWorkflowService(response, handler.workflowService)
	if service == nil {
		return
	}
	flusher, ok := response.(http.Flusher)
	if !ok {
		writeError(response, http.StatusInternalServerError, "workflow_event_stream_unavailable", "response writer does not support streaming")
		return
	}
	subscription := service.SubscribeEvents()
	defer subscription.Unsubscribe()

	response.Header().Set("Cache-Control", "no-cache")
	response.Header().Set("Content-Type", "text/event-stream")
	response.Header().Set("X-Accel-Buffering", "no")
	response.WriteHeader(http.StatusOK)
	flusher.Flush()

	for {
		select {
		case event, ok := <-subscription.Events:
			if !ok {
				return
			}
			if err := writeWorkflowServerSentEvent(response, event); err != nil {
				return
			}
			flusher.Flush()
		case <-request.Context().Done():
			return
		}
	}
}

func writeWorkflowServerSentEvent(response http.ResponseWriter, event orchestrator.WorkflowEvent) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal workflow event %s: %w", event.ID, err)
	}
	if _, err := fmt.Fprintf(response, "id: %s\nevent: %s\ndata: %s\n\n", event.ID, event.Type, payload); err != nil {
		return fmt.Errorf("write workflow event %s: %w", event.ID, err)
	}
	return nil
}
